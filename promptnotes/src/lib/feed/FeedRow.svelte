<script lang="ts">
  /**
   * FeedRow.svelte — Single feed list row component.
   *
   * Props:
   *   noteId       — The note's unique ID
   *   body         — The note body text
   *   createdAt    — Epoch ms timestamp for creation
   *   updatedAt    — Epoch ms timestamp for last update
   *   tags         — Array of tag strings
   *   viewState    — FeedViewState (shared across all rows)
   *   adapter      — TauriFeedAdapter for IPC dispatch (fallback when no callbacks)
   *   onRowClick   — Optional callback: row clicked with noteId (FIND-008 command bus)
   *   onDeleteClick — Optional callback: delete button clicked with noteId (FIND-008)
   */

  import type { TauriFeedAdapter } from './tauriFeedAdapter.js';
  import type { FeedViewState, NoteRowMetadata } from './types.js';
  import type { TagEntry } from './tagInventory.js';
  import {
    isDeleteButtonDisabled,
    isFeedRowClickBlocked,
    bodyPreviewLines,
    timestampLabel,
    needsEmptyParagraphFallback,
  } from './feedRowPredicates.js';
  import { nowIso } from './clockHelpers.js';
  import BlockElement from '$lib/block-editor/BlockElement.svelte';
  import SaveFailureBanner from '$lib/block-editor/SaveFailureBanner.svelte';
  import type { BlockEditorAdapter, DtoBlock, SaveError } from '$lib/block-editor/types.js';
  import type { EditingSessionStateDto } from './editingSessionChannel.js';

  interface Props {
    noteId: string;
    body: string;
    createdAt: number;
    updatedAt: number;
    tags: readonly string[];
    viewState: FeedViewState;
    adapter: TauriFeedAdapter;
    tagInventory: readonly TagEntry[];
    onRowClick?: (noteId: string) => void;
    onDeleteClick?: (noteId: string) => void;
    onDeleteRequest?: (noteId: string) => void;
    onTagRemove?: (noteId: string, tag: string) => void;
    onTagAddClick?: (noteId: string) => void;
    onTagInputCommit?: (noteId: string, rawTag: string) => void;
    onTagInputCancel?: () => void;
    /** Sprint 5: editing session state from editingSessionChannel (REQ-FEED-029). */
    editingSessionState?: EditingSessionStateDto | null;
    /** Sprint 5: BlockEditorAdapter for embedded block dispatches (REQ-FEED-030). */
    blockEditorAdapter?: BlockEditorAdapter | null;
  }

  const {
    noteId, body, createdAt, updatedAt, tags, viewState, adapter, tagInventory,
    onRowClick, onDeleteClick, onTagRemove, onTagAddClick, onTagInputCommit, onTagInputCancel,
    editingSessionState = null,
    blockEditorAdapter = null,
  }: Props = $props();

  const locale = 'ja-JP';

  const createdAtLabel = $derived(timestampLabel(createdAt, locale));
  const updatedAtLabel = $derived(timestampLabel(updatedAt, locale));
  const previewLines = $derived(bodyPreviewLines(body, 2));
  const deleteDisabled = $derived(isDeleteButtonDisabled(noteId, viewState.editingStatus, viewState.editingNoteId));

  /**
   * FIND-006 fix / REQ-FEED-026: showPendingSwitch requires BOTH pendingNextFocus.noteId match AND
   * editingStatus ∈ {'switching', 'save-failed'} (defense-in-depth guard per REQ-FEED-009).
   */
  const showPendingSwitch = $derived(
    viewState.pendingNextFocus?.noteId === noteId &&
    (viewState.editingStatus === 'switching' || viewState.editingStatus === 'save-failed')
  );

  const isTagInputOpen = $derived(viewState.tagAutocompleteVisibleFor === noteId);
  let tagInputText = $state('');
  let tagErrorText = $state<string | null>(null);
  let suggestionClicked = false;
  let highlightedIndex = $state(-1);

  const autocompleteSuggestions = $derived.by(() => {
    if (!isTagInputOpen || tagInputText.trim().length === 0) return [];
    const prefix = tagInputText.trim().toLowerCase();
    return tagInventory
      .filter((e) => e.name.includes(prefix))
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10);
  });

  function resetHighlight(): void {
    highlightedIndex = -1;
  }

  const rowDisabled = $derived(
    isFeedRowClickBlocked(viewState.editingStatus, viewState.loadingStatus)
  );

  /**
   * FIND-007 fix: dynamic aria-label and title for delete button.
   * When disabled (editing this note), inform the user why via tooltip and screen-reader label.
   */
  const deleteAriaLabel = $derived(
    deleteDisabled ? '編集を終了してから削除してください' : '削除'
  );
  const deleteTitle = $derived(
    deleteDisabled ? '編集を終了してから削除してください' : undefined
  );

  function handleRowClick(): void {
    if (rowDisabled) return;
    if (onRowClick) {
      onRowClick(noteId);
    } else {
      // Fallback direct call: vaultPath is unknown here.
      // In practice this branch is not reached when FeedList uses the FIND-008 command bus.
      adapter.dispatchSelectPastNote(noteId, '', nowIso());
    }
  }

  function handleDeleteClick(): void {
    if (deleteDisabled) return;
    if (onDeleteClick) {
      onDeleteClick(noteId);
    } else {
      adapter.dispatchRequestNoteDeletion(noteId, nowIso());
    }
  }

  function handleTagInputKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      tagInputText = '';
      tagErrorText = null;
      highlightedIndex = -1;
      onTagInputCancel?.();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < autocompleteSuggestions.length) {
        handleSuggestionClick(autocompleteSuggestions[highlightedIndex].name);
        return;
      }
      if (tagInputText.trim().length > 0) {
        onTagInputCommit?.(noteId, tagInputText);
        tagInputText = '';
        tagErrorText = null;
        highlightedIndex = -1;
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (autocompleteSuggestions.length === 0) return;
      highlightedIndex = (highlightedIndex + 1) % autocompleteSuggestions.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (autocompleteSuggestions.length === 0) return;
      if (highlightedIndex === -1) {
        highlightedIndex = autocompleteSuggestions.length - 1;
      } else {
        highlightedIndex = (highlightedIndex - 1 + autocompleteSuggestions.length) % autocompleteSuggestions.length;
      }
    }
  }

  function handleTagInputBlur(): void {
    if (suggestionClicked) {
      suggestionClicked = false;
      highlightedIndex = -1;
      return;
    }
    if (tagInputText.trim().length > 0) {
      onTagInputCommit?.(noteId, tagInputText);
    } else {
      onTagInputCancel?.();
    }
    tagInputText = '';
    tagErrorText = null;
    highlightedIndex = -1;
  }

  function handleSuggestionClick(tagName: string): void {
    suggestionClicked = true;
    onTagInputCommit?.(noteId, tagName);
    tagInputText = '';
    tagErrorText = null;
    highlightedIndex = -1;
  }

  // ── Sprint 5: in-place block editing surface (REQ-FEED-030/031) ──

  /** REQ-FEED-030 mount predicate (cell 1 of 2x2 truth table). */
  const shouldMountBlocks = $derived(
    viewState.editingNoteId === noteId &&
    (viewState.editingStatus === 'editing' ||
     viewState.editingStatus === 'saving' ||
     viewState.editingStatus === 'switching' ||
     viewState.editingStatus === 'save-failed'),
  );

  /** Sprint 6 REQ-FEED-030.1: effective mount = shouldMountBlocks AND adapter injected. EC-FEED-024. */
  const effectiveMount = $derived(shouldMountBlocks && blockEditorAdapter !== null);

  /** REQ-FEED-031 fallback state ownership (FIND-S5-SPEC-004 / iter2-005). */
  let fallbackAppliedFor = $state<{ noteId: string; blockId: string } | null>(null);
  let lastBlocksWasNonEmpty = $state(false);

  /** REQ-FEED-030 server blocks: tolerate undefined when editingSessionState mismatches. */
  const serverBlocks = $derived.by<readonly DtoBlock[] | null>(() => {
    if (!editingSessionState) return null;
    const ess = editingSessionState as { currentNoteId?: unknown; blocks?: unknown };
    if (ess.currentNoteId !== noteId) return null;
    const b = ess.blocks;
    if (Array.isArray(b)) return b as readonly DtoBlock[];
    return null;
  });

  /** Synthetic fallback block (REQ-FEED-031 step 1). */
  const fallbackBlock = $derived.by<DtoBlock | null>(() => {
    if (!fallbackAppliedFor) return null;
    if (fallbackAppliedFor.noteId !== viewState.editingNoteId) return null;
    return { id: fallbackAppliedFor.blockId, type: 'paragraph', content: '' };
  });

  /** REQ-FEED-030 §State source-of-truth: server blocks > fallback > none. */
  const blocksToShow = $derived.by<readonly DtoBlock[]>(() => {
    if (serverBlocks && serverBlocks.length > 0) return serverBlocks;
    if (fallbackBlock) return [fallbackBlock];
    return [];
  });

  const focusedBlockId = $derived.by<string | null>(() => {
    const ess = editingSessionState as { focusedBlockId?: unknown; priorFocusedBlockId?: unknown } | null;
    if (ess) {
      if (typeof ess.focusedBlockId === 'string') return ess.focusedBlockId;
      if (typeof ess.priorFocusedBlockId === 'string') return ess.priorFocusedBlockId;
    }
    return fallbackBlock?.id ?? null;
  });

  /** REQ-FEED-030 SaveFailureBanner predicate (REQ-BE-015 stateless, error from session). */
  const saveFailedError = $derived.by<SaveError | null>(() => {
    if (viewState.editingStatus !== 'save-failed') return null;
    if (viewState.editingNoteId !== noteId) return null;
    const ess = editingSessionState as { lastSaveResult?: unknown } | null;
    const r = ess?.lastSaveResult as { kind?: string; reason?: string; detail?: string } | null;
    if (r && r.kind === 'failure' && typeof r.reason === 'string') {
      // Default to fs-error shape for banner rendering. validation errors don't reach here.
      return { kind: 'fs', reason: { kind: r.reason } as SaveError['reason'] };
    }
    return null;
  });

  /** REQ-FEED-031 fallback dispatch chain (best-effort, try/catch each). */
  $effect(() => {
    if (!shouldMountBlocks) {
      // Reset on note unfocus / editingNoteId change.
      if (fallbackAppliedFor && fallbackAppliedFor.noteId !== viewState.editingNoteId) {
        fallbackAppliedFor = null;
        lastBlocksWasNonEmpty = false;
      }
      return;
    }

    const noteIdNow = viewState.editingNoteId;
    if (noteIdNow == null) return;

    const sb = serverBlocks;
    const blocksAbsent = needsEmptyParagraphFallback(sb);
    const blocksPresent = !blocksAbsent;

    // Track non-empty → reset fallback so a future undefined triggers restart (cond iii).
    if (blocksPresent) {
      lastBlocksWasNonEmpty = true;
      // FIND-iter2-005: invalidate cached fallback so next undefined restarts.
      if (fallbackAppliedFor) fallbackAppliedFor = null;
      return;
    }

    // blocks absent
    const cycleSwitched = fallbackAppliedFor !== null && fallbackAppliedFor.noteId !== noteIdNow;
    const restart = fallbackAppliedFor === null || cycleSwitched || lastBlocksWasNonEmpty;
    if (!restart) return;

    const newId = crypto.randomUUID();
    fallbackAppliedFor = { noteId: noteIdNow, blockId: newId };
    lastBlocksWasNonEmpty = false;

    const at = nowIso();
    const adapterRef = blockEditorAdapter;
    if (!adapterRef) return;
    void (async () => {
      try {
        await adapterRef.dispatchInsertBlockAtBeginning({
          noteId: noteIdNow,
          type: 'paragraph',
          content: '',
          issuedAt: at,
        });
      } catch {
        // best-effort: Group B Rust handler may be unimplemented (Sprint 5 scope).
        console.warn('[FeedRow] dispatchInsertBlockAtBeginning rejected (Sprint 5 best-effort)');
      }
      try {
        await adapterRef.dispatchFocusBlock({
          noteId: noteIdNow,
          blockId: newId,
          issuedAt: nowIso(),
        });
      } catch {
        console.warn('[FeedRow] dispatchFocusBlock rejected (Sprint 5 best-effort)');
      }
    })();
  });

  function noopHandler(): void {
    /* SaveFailureBanner stateless callback placeholder; wired by FeedList in future sprint */
  }
</script>

<!--
  Layout: row card with two sibling elements in a flex container.
  - feed-row-button: fills the content area (the clickable row area)
  - delete-button: side action button, sibling of feed-row-button (not nested)
-->
<div
  class="feed-row"
  data-row-note-id={noteId}
>
  <div class="row-layout">
    {#if !effectiveMount}
      <button
        data-testid="feed-row-button"
        aria-disabled={rowDisabled ? 'true' : 'false'}
        onclick={handleRowClick}
        class="row-button"
      >
        <div
          data-testid="row-created-at"
          class="row-timestamp"
        >
          {createdAtLabel}
          {#if createdAt !== updatedAt}
            <span class="updated-at">{updatedAtLabel}</span>
          {/if}
        </div>

        <div
          data-testid="row-body-preview"
          class="row-body-preview"
        >
          {#each previewLines as line}
            <div>{line}</div>
          {/each}
        </div>

        {#if tags.length > 0}
          <div class="tag-list">
            {#each tags as tag}
              <span
                data-testid="tag-chip"
                class="tag-chip"
              >
                <span class="tag-text">{tag}</span>
                <button
                  class="tag-remove"
                  data-testid="tag-remove"
                  aria-label={`タグ '${tag}' を削除`}
                  onclick={(e: MouseEvent) => {
                    e.stopPropagation();
                    onTagRemove?.(noteId, tag);
                  }}
                >×</button>
              </span>
            {/each}
          </div>
        {/if}

        <div class="tag-actions">
          {#if isTagInputOpen}
            <div class="tag-input-wrapper" data-testid="tag-input-wrapper">
              <input
                type="text"
                data-testid="tag-input"
                class="tag-input"
                placeholder="タグを入力..."
                bind:value={tagInputText}
                onkeydown={handleTagInputKeydown}
                oninput={resetHighlight}
                onblur={handleTagInputBlur}
              />
              {#if tagErrorText !== null}
                <div class="tag-error" data-testid="tag-error">{tagErrorText}</div>
              {/if}
              {#if autocompleteSuggestions.length > 0}
                <ul class="autocomplete-list" data-testid="autocomplete-list" role="listbox">
                  {#each autocompleteSuggestions as suggestion, index (suggestion.name)}
                    <li>
                      <button
                        class="autocomplete-item"
                        class:autocomplete-item--highlighted={index === highlightedIndex}
                        data-testid="autocomplete-item"
                        role="option"
                        aria-selected={index === highlightedIndex}
                        onmousedown={(e: MouseEvent) => {
                          e.preventDefault();
                          handleSuggestionClick(suggestion.name);
                        }}
                      >
                        <span class="autocomplete-name">#{suggestion.name}</span>
                        <span class="autocomplete-count">({suggestion.usageCount})</span>
                      </button>
                    </li>
                  {/each}
                </ul>
              {:else if tagInputText.trim().length > 0}
                <div class="autocomplete-empty" data-testid="autocomplete-empty">一致するタグがありません</div>
              {/if}
            </div>
          {:else}
            <button
              class="tag-add"
              data-testid="tag-add"
              aria-label="タグを追加"
              onclick={(e: MouseEvent) => {
                e.stopPropagation();
                onTagAddClick?.(noteId);
              }}
            >+</button>
          {/if}
        </div>

        {#if showPendingSwitch}
          <span data-testid="pending-switch-indicator" class="pending-indicator">
            切り替え中...
          </span>
        {/if}
      </button>
    {/if}

    <button
      data-testid="delete-button"
      aria-label={deleteAriaLabel}
      title={deleteTitle}
      disabled={deleteDisabled}
      aria-disabled={deleteDisabled ? 'true' : 'false'}
      onclick={handleDeleteClick}
      class="delete-button"
    >
      ×
    </button>
  </div>

  {#if effectiveMount}
    <div class="block-editor-surface" data-testid="block-editor-surface">
      {#each blocksToShow as block, blockIndex (block.id)}
        <BlockElement
          {block}
          {blockIndex}
          totalBlocks={blocksToShow.length}
          {noteId}
          isFocused={block.id === focusedBlockId}
          isEditable={true}
          issuedAt={nowIso}
          adapter={blockEditorAdapter}
        />
      {/each}
      {#if saveFailedError}
        <SaveFailureBanner
          error={saveFailedError}
          onRetry={noopHandler}
          onDiscard={noopHandler}
          onCancel={noopHandler}
        />
      {/if}
    </div>
  {/if}
</div>

<style>
  .feed-row {
    background: #ffffff;
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 12px;
    box-shadow: rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px;
    margin-bottom: 8px;
  }

  .feed-row:hover {
    box-shadow: rgba(0,0,0,0.08) 0px 4px 18px, rgba(0,0,0,0.054) 0px 2.025px 7.85px, rgba(0,0,0,0.04) 0px 0.8px 2.93px, rgba(0,0,0,0.02) 0px 0.175px 1.04px;
  }

  .row-layout {
    display: flex;
    align-items: stretch;
  }

  .row-button {
    flex: 1;
    background: none;
    border: none;
    padding: 12px 16px;
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }

  .row-button:focus-visible {
    outline: 2px solid #097fe8;
    outline-offset: 2px;
    border-radius: 12px;
  }

  .row-timestamp {
    font-size: 14px;
    font-weight: 500;
    color: #615d59;
    margin-bottom: 4px;
  }

  .updated-at {
    margin-left: 8px;
    color: #a39e98;
  }

  .row-body-preview {
    font-size: 14px;
    color: rgba(0,0,0,0.95);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 6px;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .tag-chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background-color: #f2f9ff;
    color: #097fe8;
    border-radius: 9999px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.125px;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tag-remove {
    background: none;
    border: none;
    padding: 0 2px;
    cursor: pointer;
    color: #097fe8;
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
    border-radius: 50%;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .tag-remove:hover {
    background-color: rgba(9, 127, 232, 0.15);
  }

  .tag-remove:focus-visible {
    outline: 2px solid #097fe8;
    outline-offset: 1px;
  }

  .tag-add {
    background: none;
    border: 1px dashed rgba(0,0,0,0.15);
    border-radius: 9999px;
    padding: 4px 8px;
    cursor: pointer;
    color: #0075de;
    font-size: 14px;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
  }

  .tag-add:hover {
    background-color: rgba(0,117,222,0.08);
    border-color: #0075de;
    color: #005bab;
  }

  .tag-add:focus-visible {
    outline: 2px solid #097fe8;
    outline-offset: 2px;
  }

  .tag-actions {
    margin-top: 4px;
  }

  .tag-input-wrapper {
    position: relative;
  }

  .tag-input {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid #dddddd;
    border-radius: 8px;
    font-size: 13px;
    color: rgba(0,0,0,0.95);
    background: #ffffff;
    outline: none;
    box-sizing: border-box;
  }

  .tag-input:focus {
    border-color: #097fe8;
    box-shadow: 0 0 0 2px rgba(9,127,232,0.15);
  }

  .tag-error {
    font-size: 12px;
    color: #dd5b00;
    margin-top: 4px;
  }

  .autocomplete-list {
    list-style: none;
    padding: 4px 0;
    margin: 4px 0 0 0;
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 8px;
    background: #ffffff;
    max-height: 200px;
    overflow-y: auto;
    box-shadow: rgba(0,0,0,0.08) 0px 4px 12px;
  }

  .autocomplete-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 6px 8px;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 13px;
    text-align: left;
    color: rgba(0,0,0,0.95);
  }

  .autocomplete-item:hover,
  .autocomplete-item:focus-visible,
  .autocomplete-item--highlighted {
    background-color: #f6f5f4;
  }

  .autocomplete-name {
    font-weight: 500;
  }

  .autocomplete-count {
    margin-left: auto;
    color: #a39e98;
    font-size: 12px;
  }

  .autocomplete-empty {
    padding: 8px;
    font-size: 13px;
    color: #a39e98;
    text-align: center;
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 8px;
    margin-top: 4px;
  }

  .pending-indicator {
    font-size: 12px;
    color: #097fe8;
    margin-top: 4px;
    display: inline-block;
  }

  .delete-button {
    background: none;
    border: none;
    border-left: 1px solid rgba(0,0,0,0.05);
    padding: 8px 12px;
    cursor: pointer;
    color: #615d59;
    flex-shrink: 0;
    align-self: stretch;
  }

  .delete-button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .delete-button:focus-visible {
    outline: 2px solid #097fe8;
    outline-offset: 2px;
  }

  /* Sprint 5: in-place block editing surface (REQ-FEED-030) */
  .block-editor-surface {
    padding: 8px 16px 12px;
    border-top: 1px solid rgba(0, 0, 0, 0.05);
  }
</style>
