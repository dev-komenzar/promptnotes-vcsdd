<script lang="ts">
  /**
   * BlockElement.svelte — Sprint 7 Green phase
   *
   * Renders a single contenteditable block. Handles all block-level events:
   * - oninput → EditBlockContent + markdown prefix detection → ChangeBlockType
   * - Enter at end → InsertBlock
   * - Enter mid-block → SplitBlock
   * - Backspace at offset 0 → MergeBlocks or noop
   * - Backspace/Delete on empty → RemoveBlock
   * - onfocusin → BlockFocused
   * - onfocusout → BlockBlurred
   * - '/' key → open SlashMenu
   *
   * REQ-BE-001..010, REQ-BE-002b, EC-BE-001..005, NFR-BE-006
   * PROP-BE-021..030, PROP-BE-038, PROP-BE-039, PROP-BE-046
   */

  import type { BlockType, BlockEditorAdapter } from './types.js';
  import { splitOrInsert, classifyMarkdownPrefix, classifyBackspaceAtZero } from './blockPredicates.js';
  import SlashMenu from './SlashMenu.svelte';

  interface Block {
    id: string;
    type: BlockType;
    content: string;
  }

  interface Props {
    block: Block;
    blockIndex: number;
    totalBlocks: number;
    noteId: string;
    isFocused: boolean;
    isEditable: boolean;
    /** Returns current ISO timestamp string. */
    issuedAt: () => string;
    adapter: BlockEditorAdapter;
    /** Called whenever the block content is edited (for idle-timer scheduling). */
    onBlockEdit?: () => void;
  }

  const {
    block,
    blockIndex,
    totalBlocks,
    noteId,
    isFocused,
    isEditable,
    issuedAt,
    adapter,
    onBlockEdit,
  }: Props = $props();

  let slashMenuOpen = $state(false);
  let slashQuery = $state('');
  let blockEl = $state<HTMLElement | null>(null);

  // Focus the element when isFocused changes to true
  $effect(() => {
    if (isFocused && blockEl && document.activeElement !== blockEl) {
      blockEl.focus();
    }
  });

  function getCaretOffset(): number {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      // No selection available (e.g., jsdom): treat as cursor at end of content
      return getTextContent().length;
    }
    const range = selection.getRangeAt(0);
    // If the range is collapsed and in this block, return the offset
    if (!range.collapsed) return range.startOffset;
    // Calculate absolute offset within the block's text content
    const container = range.startContainer;
    if (blockEl?.contains(container)) {
      return range.startOffset;
    }
    // Default to end of content if selection is not inside this block
    return getTextContent().length;
  }

  function getTextContent(): string {
    return blockEl?.textContent ?? '';
  }

  function handleFocusIn(): void {
    adapter.dispatchFocusBlock({
      noteId,
      blockId: block.id,
      issuedAt: issuedAt(),
    }).catch(() => {});
  }

  function handleClick(): void {
    // In jsdom, click does NOT fire focusin automatically.
    // Focus the element so focusin fires, which triggers the adapter dispatch.
    if (blockEl && document.activeElement !== blockEl) {
      blockEl.focus(); // triggers onfocusin
    }
  }

  function handleFocusOut(): void {
    // Block-level blur. The "all-blocks blur" detection (which raises
    // EditorBlurredAllBlocks for the blur-save trigger) is the responsibility of
    // the wrapper that owns the block list — currently FeedRow.svelte from
    // ui-feed-list-actions Sprint 5. BlockElement intentionally does not raise
    // any Internal Event here.
  }

  /**
   * NFR-BE-006 / PROP-BE-046: Strip control chars from textContent before
   * dispatching to keep `BlockContent` VO Smart Constructor happy on the
   * domain side.
   *
   * - paragraph / heading / list / quote / divider: strip `\n`, `\t`, U+0000–U+001F
   *   (excluding `\n` and `\t` is irrelevant since both are stripped here),
   *   and U+007F.
   * - code: preserve `\n` and `\t`; strip the rest of U+0000–U+001F and U+007F.
   */
  function sanitiseContent(raw: string, type: BlockType): string {
    if (type === 'code') {
      // Keep \n (U+000A) and \t (U+0009); drop U+0000–U+0008, U+000B–U+001F, U+007F
      let out = '';
      for (let i = 0; i < raw.length; i++) {
        const code = raw.charCodeAt(i);
        const isControl = (code >= 0x00 && code <= 0x1f) || code === 0x7f;
        if (isControl && code !== 0x0a && code !== 0x09) continue;
        out += raw[i];
      }
      return out;
    }
    // Non-code blocks strip all U+0000–U+001F (incl. \n, \t) and U+007F.
    let out = '';
    for (let i = 0; i < raw.length; i++) {
      const code = raw.charCodeAt(i);
      const isControl = (code >= 0x00 && code <= 0x1f) || code === 0x7f;
      if (isControl) continue;
      out += raw[i];
    }
    return out;
  }

  function handleInput(): void {
    const rawContent = getTextContent();
    const content = sanitiseContent(rawContent, block.type);

    // Dispatch EditBlockContent
    adapter.dispatchEditBlockContent({
      noteId,
      blockId: block.id,
      content,
      issuedAt: issuedAt(),
    }).catch(() => {});

    // Notify parent for idle-timer scheduling
    onBlockEdit?.();

    // Check for markdown prefix shortcut
    const classified = classifyMarkdownPrefix(content);
    if (classified) {
      adapter.dispatchChangeBlockType({
        noteId,
        blockId: block.id,
        newType: classified.newType,
        issuedAt: issuedAt(),
      }).catch(() => {});
    }

    // Close slash menu if open and content no longer starts with /
    if (slashMenuOpen) {
      if (content.startsWith('/')) {
        slashQuery = content.slice(1);
      } else {
        slashMenuOpen = false;
        slashQuery = '';
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    // PROP-BE-039 / REQ-BE-006 §Exclusivity: when SlashMenu is open the menu owns
    // navigation/selection keys. BlockElement's keydown handler must skip Enter /
    // Backspace / Delete / arrow keys so the menu's `<svelte:window onkeydown>`
    // can consume them without the BlockElement also firing Insert/Split/Remove.
    if (slashMenuOpen) {
      return;
    }

    const content = getTextContent();

    if (event.key === 'Enter') {
      event.preventDefault();
      const offset = getCaretOffset();
      const action = splitOrInsert(offset, content.length);

      if (action === 'insert') {
        // Enter at end: insert a new paragraph block after this one
        adapter.dispatchInsertBlockAfter({
          noteId,
          prevBlockId: block.id,
          type: 'paragraph',
          content: '',
          issuedAt: issuedAt(),
        }).catch(() => {});
      } else {
        // Enter mid-block: split at caret position
        adapter.dispatchSplitBlock({
          noteId,
          blockId: block.id,
          offset,
          issuedAt: issuedAt(),
        }).catch(() => {});
      }
      return;
    }

    if (event.key === 'Backspace') {
      const offset = getCaretOffset();

      // Backspace on empty block (non-sole block) → RemoveBlock
      if (content === '' && totalBlocks > 1) {
        event.preventDefault();
        adapter.dispatchRemoveBlock({
          noteId,
          blockId: block.id,
          issuedAt: issuedAt(),
        }).catch(() => {});
        return;
      }

      // Backspace at offset 0
      if (offset === 0) {
        const classification = classifyBackspaceAtZero(blockIndex, totalBlocks);
        if (classification === 'merge') {
          event.preventDefault();
          adapter.dispatchMergeBlocks({
            noteId,
            blockId: block.id,
            issuedAt: issuedAt(),
          }).catch(() => {});
        }
        // 'first-block-noop' → do nothing
        return;
      }
      return;
    }

    if (event.key === 'Delete') {
      // Delete on empty block (non-sole block) → RemoveBlock
      // NOTE: `content` is already read at the top of handleKeyDown; no re-read needed.
      if (content === '' && totalBlocks > 1) {
        event.preventDefault();
        adapter.dispatchRemoveBlock({
          noteId,
          blockId: block.id,
          issuedAt: issuedAt(),
        }).catch(() => {});
      }
      return;
    }

    if (event.key === '/') {
      slashMenuOpen = true;
      slashQuery = '';
    }
  }

  function handleSlashSelect(type: BlockType): void {
    slashMenuOpen = false;
    slashQuery = '';
    adapter.dispatchChangeBlockType({
      noteId,
      blockId: block.id,
      newType: type,
      issuedAt: issuedAt(),
    }).catch(() => {});
  }

  function handleSlashClose(): void {
    slashMenuOpen = false;
    slashQuery = '';
  }

  const isDivider = $derived(block.type === 'divider');
  const isContentEditable = $derived(isEditable && !isDivider);
  const isEmpty = $derived(block.content === '');
</script>

<div
  class="block-wrapper"
  data-block-index={blockIndex}
>
  {#if isDivider}
    <hr
      class="block-element block-divider"
      data-testid="block-element"
      data-block-id={block.id}
      data-block-index={blockIndex}
      data-block-empty={isEmpty ? 'true' : 'false'}
    />
  {:else}
    <div
      class="block-element block-{block.type}"
      data-testid="block-element"
      data-block-id={block.id}
      data-block-index={blockIndex}
      data-block-empty={isEmpty ? 'true' : 'false'}
      role="textbox"
      aria-multiline="true"
      contenteditable={isContentEditable ? 'true' : 'false'}
      tabindex={isEditable ? 0 : -1}
      bind:this={blockEl}
      onclick={handleClick}
      onfocusin={handleFocusIn}
      onfocusout={handleFocusOut}
      oninput={handleInput}
      onkeydown={handleKeyDown}
    >{block.content}</div>
  {/if}

  {#if slashMenuOpen}
    <SlashMenu
      query={slashQuery}
      onSelect={handleSlashSelect}
      onClose={handleSlashClose}
    />
  {/if}
</div>

<style>
  .block-wrapper {
    position: relative;
  }

  .block-element {
    display: block;
    width: 100%;
    padding: 4px 16px;
    border: none;
    outline: none;
    background: transparent;
    color: rgba(0, 0, 0, 0.9);
    font-family: inherit;
    line-height: 1.6;
    word-break: break-word;
    white-space: pre-wrap;
  }

  .block-element:focus {
    background: rgba(0, 119, 221, 0.03);
  }

  /* Block-type specific styles per DESIGN.md §3 */
  .block-paragraph {
    font-size: 14px;
    font-weight: 400;
  }

  .block-heading-1 {
    font-size: 28px;
    font-weight: 700;
    line-height: 1.3;
    margin: 8px 0 4px;
  }

  .block-heading-2 {
    font-size: 22px;
    font-weight: 600;
    line-height: 1.35;
    margin: 6px 0 3px;
  }

  .block-heading-3 {
    font-size: 18px;
    font-weight: 600;
    line-height: 1.4;
    margin: 4px 0 2px;
  }

  .block-bullet {
    font-size: 14px;
    padding-left: 32px;
    list-style-type: disc;
  }

  .block-numbered {
    font-size: 14px;
    padding-left: 32px;
    list-style-type: decimal;
  }

  .block-code {
    font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
    font-size: 13px;
    background: #f6f5f4;
    border-radius: 4px;
    padding: 8px 12px;
    border: 1px solid rgba(0, 0, 0, 0.08);
  }

  .block-quote {
    font-size: 14px;
    font-style: italic;
    border-left: 3px solid #a39e98;
    padding-left: 12px;
    color: #615d59;
  }

  .block-divider {
    border: none;
    border-top: 1px solid #e9e9e7;
    margin: 8px 16px;
    height: 1px;
  }
</style>
