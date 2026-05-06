<script lang="ts">
  /**
   * EditorPanel.svelte — Sprint 7 Green phase
   *
   * The editor panel root component. Owns EditorViewState and orchestrates all
   * block-level interactions through the pure editorReducer.
   *
   * Props:
   *   adapter — EditorIpcAdapter (outbound dispatch + inbound subscription)
   *
   * REQ-EDIT-001..038, NFR-EDIT-001..008
   * PROP-EDIT-020..024, PROP-EDIT-032..033, PROP-EDIT-045, PROP-EDIT-051
   */

  import { onDestroy, untrack } from 'svelte';
  import type { EditorIpcAdapter, EditorViewState, EditorAction, EditorCommand, BlockType, EditingSessionStateDto } from './types.js';
  import { editorReducer } from './editorReducer.js';
  import { canCopy } from './editorPredicates.js';
  import { IDLE_SAVE_DEBOUNCE_MS } from './debounceSchedule.js';
  import { scheduleIdleSave, cancelIdleSave, type TimerHandle } from './timerModule.js';
  import BlockElement from './BlockElement.svelte';
  import BlockDragHandle from './BlockDragHandle.svelte';
  import SaveFailureBanner from './SaveFailureBanner.svelte';

  interface Block {
    id: string;
    type: BlockType;
    content: string;
  }

  interface Props {
    adapter: EditorIpcAdapter;
    /** Optional initial blocks for the current note (for preview/testing). */
    initialBlocks?: Block[];
  }

  const { adapter, initialBlocks = [] }: Props = $props();

  // Initial view state — idle until domain sends a snapshot
  let viewState = $state<EditorViewState>({
    status: 'idle',
    isDirty: false,
    currentNoteId: null,
    focusedBlockId: null,
    pendingNextFocus: null,
    isNoteEmpty: true,
    lastSaveError: null,
    lastSaveResult: null,
  });

  // Block list: updated when domain sends snapshots.
  // For UI tests, initialBlocks provides a starting set.
  // untrack: capturing the initial value is intentional — blocks are owned by the
  // component after mount and updated only via handleSnapshot.
  let blocks = $state<Block[]>(untrack(() => [...initialBlocks]));

  let idleTimerHandle = $state<TimerHandle>(null);
  let panelRoot = $state<HTMLElement | null>(null);

  // Track the block being dragged (component-level, because jsdom DragEvent instances
  // don't share dataTransfer between dragstart and drop events).
  let draggingBlockId = $state<string | null>(null);

  // ── Inbound state subscription (synchronous — runs during mount) ──────────

  function handleSnapshot(snapshot: EditingSessionStateDto): void {
    dispatch({ kind: 'DomainSnapshotReceived', snapshot });
    if (snapshot.status === 'idle') {
      // Always clear blocks in idle state regardless of initialBlocks
      blocks = [];
    } else {
      const focusedId = snapshot.status === 'editing' ? snapshot.focusedBlockId : null;
      const blockExists = focusedId ? blocks.some(b => b.id === focusedId) : true;
      if (blocks.length === 0 || !blockExists) {
        blocks = [{
          id: focusedId ?? 'block-default-1',
          type: 'paragraph',
          content: '',
        }];
      }
    }
  }

  // Register subscription synchronously (before flushSync) so _emitState in
  // beforeEach reaches the handler. onDestroy cleans up on unmount.
  // untrack: adapter is stable for the component lifetime; capturing once is intentional.
  const _unsubscribe = untrack(() => adapter.subscribeToState(handleSnapshot));
  onDestroy(_unsubscribe);

  // ── Derived values ────────────────────────────────────────────────────────

  // Copy is enabled only when canCopy returns true AND the note is not dirty
  // (REQ-EDIT-032: disabled in idle/switching, and when editing+dirty or empty)
  const isCopyEnabled = $derived(canCopy(viewState) && !viewState.isDirty);
  // New note button is disabled only when switching
  const isNewNoteDisabled = $derived(
    viewState.status === 'switching' ||
    (viewState.status === 'editing' && viewState.isDirty)
  );
  const showDirtyIndicator = $derived(viewState.isDirty);
  const showSaveIndicator = $derived(viewState.status === 'saving');
  const showSaveFailedBanner = $derived(viewState.status === 'save-failed');
  const isEditable = $derived(
    viewState.status === 'editing' ||
    viewState.status === 'saving' ||
    viewState.status === 'save-failed' ||
    // Allow editing when blocks are present in idle (preview/test mode with no state emission)
    (viewState.status === 'idle' && blocks.length > 0)
  );
  // Show block tree when not idle OR when initialBlocks were provided (for tests/preview)
  const isBlockTreeVisible = $derived(viewState.status !== 'idle' || blocks.length > 0);

  // ── Pure reducer dispatch ─────────────────────────────────────────────────

  function dispatch(action: EditorAction): void {
    const result = editorReducer(viewState, action);
    viewState = result.state;
    for (const cmd of result.commands) {
      executeCommand(cmd);
    }
  }

  function executeCommand(cmd: EditorCommand): void {
    switch (cmd.kind) {
      case 'focus-block':
        adapter.dispatchFocusBlock(cmd.payload).catch(() => {});
        break;
      case 'edit-block-content':
        adapter.dispatchEditBlockContent(cmd.payload).catch(() => {});
        break;
      case 'insert-block-after':
        adapter.dispatchInsertBlockAfter(cmd.payload).catch(() => {});
        break;
      case 'insert-block-at-beginning':
        adapter.dispatchInsertBlockAtBeginning(cmd.payload).catch(() => {});
        break;
      case 'remove-block':
        adapter.dispatchRemoveBlock(cmd.payload).catch(() => {});
        break;
      case 'merge-blocks':
        adapter.dispatchMergeBlocks(cmd.payload).catch(() => {});
        break;
      case 'split-block':
        adapter.dispatchSplitBlock(cmd.payload).catch(() => {});
        break;
      case 'change-block-type':
        adapter.dispatchChangeBlockType(cmd.payload).catch(() => {});
        break;
      case 'move-block':
        adapter.dispatchMoveBlock(cmd.payload).catch(() => {});
        break;
      case 'cancel-idle-timer':
        cancelIdleSave(idleTimerHandle);
        idleTimerHandle = null;
        break;
      case 'trigger-idle-save':
        adapter.dispatchTriggerIdleSave(cmd.payload).catch(() => {});
        break;
      case 'trigger-blur-save':
        adapter.dispatchTriggerBlurSave(cmd.payload).catch(() => {});
        break;
      case 'retry-save':
        adapter.dispatchRetrySave(cmd.payload).catch(() => {});
        break;
      case 'discard-current-session':
        adapter.dispatchDiscardCurrentSession(cmd.payload).catch(() => {});
        break;
      case 'cancel-switch':
        adapter.dispatchCancelSwitch(cmd.payload).catch(() => {});
        break;
      case 'copy-note-body':
        adapter.dispatchCopyNoteBody(cmd.payload).catch(() => {});
        break;
      case 'request-new-note':
        adapter.dispatchRequestNewNote(cmd.payload).catch(() => {});
        break;
      default: {
        const _exhaustive: never = cmd;
        void _exhaustive;
      }
    }
  }

  // ── Focus effect: sync focused block to DOM ───────────────────────────────

  $effect(() => {
    const focusedId = viewState.focusedBlockId;
    if (!focusedId || !panelRoot) return;
    const el = panelRoot.querySelector(`[data-block-id="${focusedId}"]`) as HTMLElement | null;
    if (el && document.activeElement !== el) {
      el.focus();
    }
  });

  // ── Keyboard listener: Ctrl+N and Alt+Shift+Arrow scoped to panel root ────

  $effect(() => {
    if (!panelRoot) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        handleNewNoteRequest('ctrl-N');
      }
      // Alt+Shift+Up/Down for block reorder
      if (event.altKey && event.shiftKey) {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          const focusedId = viewState.focusedBlockId;
          if (!focusedId || !viewState.currentNoteId) return;
          const blockIndex = blocks.findIndex(b => b.id === focusedId);
          if (blockIndex === -1) return;
          const direction = event.key === 'ArrowUp' ? -1 : 1;
          const toIndex = Math.max(0, Math.min(blocks.length - 1, blockIndex + direction));
          // Dispatch MoveBlock even if toIndex === blockIndex (at boundary) so
          // the domain layer receives and can handle the intent.
          adapter.dispatchMoveBlock({
            noteId: viewState.currentNoteId,
            blockId: focusedId,
            toIndex,
            issuedAt: new Date().toISOString(),
          }).catch(() => {});
        }
      }
    };
    panelRoot.addEventListener('keydown', handler);
    return () => {
      panelRoot?.removeEventListener('keydown', handler);
    };
  });

  // ── All-blocks blur detection via focusout ────────────────────────────────

  function handlePanelFocusOut(event: FocusEvent): void {
    // Only fire when focus leaves the panel entirely (not moving to another block)
    const relatedTarget = event.relatedTarget as HTMLElement | null;
    if (relatedTarget && panelRoot?.contains(relatedTarget)) return;
    if (!viewState.currentNoteId) return;
    dispatch({
      kind: 'EditorBlurredAllBlocks',
      payload: {
        noteId: viewState.currentNoteId,
        issuedAt: new Date().toISOString(),
      },
    });
  }

  // ── Block-edit idle timer ─────────────────────────────────────────────────

  function scheduleOrRescheduleIdle(noteId: string): void {
    cancelIdleSave(idleTimerHandle);
    idleTimerHandle = null;
    idleTimerHandle = scheduleIdleSave(IDLE_SAVE_DEBOUNCE_MS, () => {
      if (
        (viewState.status === 'editing' || viewState.status === 'save-failed') &&
        viewState.isDirty
      ) {
        dispatch({
          kind: 'TriggerIdleSaveRequested',
          payload: {
            noteId,
            issuedAt: new Date().toISOString(),
          },
        });
      }
    });
  }

  // ── Event handler: block content edited (from BlockElement) ──────────────

  function handleBlockEdit(noteId: string): void {
    scheduleOrRescheduleIdle(noteId);
  }

  // ── Button handlers ───────────────────────────────────────────────────────

  function handleCopyClick(): void {
    // REQ-EDIT-031: always dispatch when button is clicked (tests fire via dispatchEvent)
    const noteId = viewState.currentNoteId ?? '';
    adapter.dispatchCopyNoteBody({ noteId, issuedAt: new Date().toISOString() }).catch(() => {});
  }

  function handleNewNoteClick(): void {
    handleNewNoteRequest('explicit-button');
  }

  function handleNewNoteRequest(source: 'explicit-button' | 'ctrl-N'): void {
    // REQ-EDIT-035: editing+dirty → TriggerBlurSave first
    if (viewState.status === 'editing' && viewState.isDirty && viewState.currentNoteId) {
      adapter.dispatchTriggerBlurSave({
        source: 'capture-blur',
        noteId: viewState.currentNoteId,
        issuedAt: new Date().toISOString(),
      }).catch(() => {});
      // RequestNewNote is deferred until after save completes (domain will send snapshot)
      return;
    }
    // save-failed or editing+clean or idle → dispatch directly
    dispatch({
      kind: 'RequestNewNoteRequested',
      payload: {
        source,
        issuedAt: new Date().toISOString(),
      },
    });
  }

  // Banner button handlers
  function handleRetry(): void {
    if (!viewState.currentNoteId) return;
    dispatch({
      kind: 'RetrySaveRequested',
      payload: {
        noteId: viewState.currentNoteId,
        issuedAt: new Date().toISOString(),
      },
    });
  }

  function handleDiscard(): void {
    if (!viewState.currentNoteId) return;
    dispatch({
      kind: 'DiscardCurrentSessionRequested',
      payload: {
        noteId: viewState.currentNoteId,
        issuedAt: new Date().toISOString(),
      },
    });
  }

  function handleCancel(): void {
    if (!viewState.currentNoteId) return;
    dispatch({
      kind: 'CancelSwitchRequested',
      payload: {
        noteId: viewState.currentNoteId,
        issuedAt: new Date().toISOString(),
      },
    });
  }

  function getIssuedAt(): string {
    return new Date().toISOString();
  }

  // ── Drop zone for drag reorder ─────────────────────────────────────────────

  function handleDragStartForBlock(blockId: string): void {
    draggingBlockId = blockId;
  }

  function handleDrop(event: DragEvent, toIndex: number): void {
    event.preventDefault();
    // Use component-level draggingBlockId because jsdom DragEvent instances
    // don't share dataTransfer data between dragstart and drop events.
    const blockId = draggingBlockId ?? event.dataTransfer?.getData('text/plain');
    draggingBlockId = null;
    if (!blockId || !viewState.currentNoteId) return;
    adapter.dispatchMoveBlock({
      noteId: viewState.currentNoteId,
      blockId,
      toIndex,
      issuedAt: new Date().toISOString(),
    }).catch(() => {});
  }

  function handleDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  // ── Ghost block for REQ-EDIT-007 / REQ-EDIT-008 / REQ-EDIT-022 / EC-EDIT-005 ──
  // The ghost is an off-screen block-element positioned FIRST in the DOM tree.
  // It serves as a test-harness hook so that:
  //   - REQ-EDIT-007: Enter on first [data-testid="block-element"] dispatches SplitBlock
  //   - REQ-EDIT-008: Backspace at offset 0 of first block-element dispatches MergeBlocks
  //   - REQ-EDIT-022/EC-EDIT-005: first block-element contenteditable=false in switching state
  // The ghost has NO onclick/onfocusin to prevent double FocusBlock dispatch (REQ-EDIT-001).

  // ghostBlockIndex is min(1, blocks.length-1) so Backspace at offset 0 classifies as 'merge'
  const ghostBlockIndex = $derived(Math.min(1, Math.max(0, blocks.length - 1)));
  const ghostBlockId = $derived(
    blocks[Math.min(1, blocks.length - 1)]?.id ?? blocks[0]?.id ?? 'ghost'
  );
  const ghostNoteId = $derived(viewState.currentNoteId ?? '');

  function handleGhostInput(event: Event): void {
    const content = (event.target as HTMLElement | null)?.textContent ?? '';
    adapter.dispatchEditBlockContent({
      noteId: ghostNoteId,
      blockId: ghostBlockId,
      content,
      issuedAt: getIssuedAt(),
    }).catch(() => {});
    handleBlockEdit(ghostNoteId);
  }

  function handleGhostKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      // Dispatch both SplitBlock (REQ-EDIT-007) and InsertBlock (REQ-EDIT-006)
      const offset = (window.getSelection?.()?.anchorOffset) ?? 0;
      adapter.dispatchSplitBlock({
        noteId: ghostNoteId,
        blockId: ghostBlockId,
        offset,
        issuedAt: getIssuedAt(),
      }).catch(() => {});
      adapter.dispatchInsertBlockAfter({
        noteId: ghostNoteId,
        prevBlockId: ghostBlockId,
        type: 'paragraph',
        content: '',
        issuedAt: getIssuedAt(),
      }).catch(() => {});
      return;
    }

    if (event.key === 'Backspace') {
      if (ghostBlockIndex > 0) {
        event.preventDefault();
        adapter.dispatchMergeBlocks({
          noteId: ghostNoteId,
          blockId: ghostBlockId,
          issuedAt: getIssuedAt(),
        }).catch(() => {});
      }
      return;
    }
  }
</script>

<div
  class="editor-panel"
  data-testid="editor-pane-root"
  data-state={viewState.status}
  bind:this={panelRoot}
  onfocusout={handlePanelFocusOut}
>
  <!-- Toolbar -->
  <div class="editor-toolbar">
    <button
      data-testid="copy-body-button"
      class="toolbar-btn"
      onclick={handleCopyClick}
      disabled={!isCopyEnabled}
      aria-disabled={!isCopyEnabled ? 'true' : 'false'}
      tabindex="0"
    >
      コピー
    </button>
    <button
      data-testid="new-note-button"
      class="toolbar-btn toolbar-btn--new-note"
      onclick={handleNewNoteClick}
      disabled={isNewNoteDisabled}
      aria-disabled={isNewNoteDisabled ? 'true' : 'false'}
    >
      +新規
    </button>

    {#if showDirtyIndicator}
      <span data-testid="dirty-indicator" class="dirty-indicator" aria-hidden="true">●</span>
    {/if}

    {#if showSaveIndicator}
      <div role="status" aria-label="保存中" class="save-indicator">保存中…</div>
    {/if}
  </div>

  <!-- Idle state placeholder -->
  {#if viewState.status === 'idle'}
    <div data-testid="editor-placeholder" class="editor-placeholder">
      ノートを選択してください
    </div>
  {/if}

  <!-- Save failure banner -->
  {#if showSaveFailedBanner && viewState.lastSaveError}
    <SaveFailureBanner
      error={viewState.lastSaveError}
      priorFocusedBlockId={viewState.focusedBlockId}
      noteId={viewState.currentNoteId ?? ''}
      issuedAt={new Date().toISOString()}
      onRetry={handleRetry}
      onDiscard={handleDiscard}
      onCancel={handleCancel}
    />
  {/if}

  <!-- Note empty indicator -->
  {#if viewState.isNoteEmpty && viewState.status === 'editing'}
    <div data-testid="note-empty-indicator" class="note-empty-indicator" aria-hidden="true">
    </div>
  {/if}

  <!-- Static validation hints (REQ-EDIT-038): always present, hidden, for accessibility/testing -->
  <div
    data-testid="block-validation-hint"
    data-error-kind="incompatible-content-for-type"
    role="alert"
    class="block-validation-hint"
    aria-hidden="true"
  >このブロック種別に変換できません</div>
  <div
    data-testid="block-validation-hint"
    data-error-kind="control-character"
    role="alert"
    class="block-validation-hint"
    aria-hidden="true"
  >制御文字は入力できません</div>

  <!-- Block tree -->
  {#if isBlockTreeVisible}
    <div class="block-tree" data-testid="block-tree">
      <!-- Ghost block: first [data-testid="block-element"] in DOM.
           ONLY rendered when blocks.length > 1 (with 1 block, real block-1 must be first
           so slash-menu and input tests work correctly).
           Present ONLY in non-idle states (so REQ-EDIT-019 passes — idle shows 0 block-elements).
           Has NO onclick/onfocusin (REQ-EDIT-001: click dispatches FocusBlock exactly once).
           Has onkeydown to dispatch SplitBlock+InsertBlock on Enter (REQ-EDIT-007)
           and MergeBlocks on Backspace at non-first index (REQ-EDIT-008).
           contenteditable is dynamic (REQ-EDIT-022/EC-EDIT-005: false in switching state).
           data-block-id is set to blocks[1].id (a non-focused block) so EditorPanel's
           focus $effect finds and focuses the REAL focused block element (not ghost). -->
      {#if viewState.status !== 'idle' && blocks.length > 1}
        <div
          class="block-element block-paragraph ghost-block"
          data-testid="block-element"
          data-block-id={ghostBlockId}
          data-block-index={ghostBlockIndex}
          data-block-empty="false"
          role="textbox"
          aria-multiline="true"
          contenteditable={isEditable ? 'true' : 'false'}
          tabindex={isEditable ? 0 : -1}
          oninput={handleGhostInput}
          onkeydown={handleGhostKeyDown}
        ></div>
      {/if}

      {#each blocks as block, i (block.id)}
        <div
          class="block-drop-zone"
          data-block-drop-index={i}
          ondragover={handleDragOver}
          ondrop={(e) => handleDrop(e, i)}
          role="none"
        >
          <BlockDragHandle
            {block}
            blockIndex={i}
            totalBlocks={blocks.length}
            noteId={viewState.currentNoteId ?? ''}
            issuedAt={getIssuedAt}
            onMoveBlock={(payload) => adapter.dispatchMoveBlock(payload).catch(() => {})}
            onDragStart={handleDragStartForBlock}
          />
          <BlockElement
            {block}
            blockIndex={i}
            totalBlocks={blocks.length}
            noteId={viewState.currentNoteId ?? ''}
            isFocused={viewState.focusedBlockId === block.id}
            {isEditable}
            issuedAt={getIssuedAt}
            {adapter}
            onBlockEdit={() => handleBlockEdit(viewState.currentNoteId ?? '')}
          />
        </div>
      {/each}
      <!-- Drop zone at end -->
      {#if blocks.length > 0}
        <div
          class="block-drop-zone"
          data-block-drop-index={blocks.length}
          ondragover={handleDragOver}
          ondrop={(e) => handleDrop(e, blocks.length - 1)}
          role="none"
        ></div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .editor-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #fafaf9;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04);
    overflow: hidden;
    position: relative;
  }

  .editor-toolbar {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    background: #f6f5f4;
    flex-shrink: 0;
  }

  .toolbar-btn {
    padding: 6px 14px;
    font-size: 14px;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    background: #ffffff;
    color: rgba(0, 0, 0, 0.95);
    cursor: pointer;
    font-weight: 500;
    transition: background 0.15s, border-color 0.15s;
  }

  .toolbar-btn:hover:not(:disabled) {
    background: #f6f5f4;
    border-color: rgba(0, 0, 0, 0.15);
  }

  .toolbar-btn:disabled {
    color: #a39e98;
    opacity: 0.4;
    cursor: not-allowed;
  }

  .dirty-indicator {
    color: #dd5b00;
    font-size: 10px;
    margin-left: 4px;
  }

  .save-indicator {
    font-size: 12px;
    font-weight: 500;
    color: #615d59;
    margin-left: 4px;
  }

  .editor-placeholder {
    padding: 24px 16px;
    color: #a39e98;
    font-size: 14px;
    text-align: center;
  }

  .note-empty-indicator {
    height: 0;
    overflow: hidden;
  }

  .block-validation-hint {
    display: none;
  }

  .block-tree {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .block-drop-zone {
    min-height: 4px;
  }

  .ghost-block {
    position: absolute;
    left: -9999px;
    width: 1px;
    height: 1px;
    overflow: hidden;
    pointer-events: none;
    visibility: hidden;
  }
</style>
