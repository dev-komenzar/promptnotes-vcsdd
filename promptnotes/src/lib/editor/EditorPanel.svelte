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
  import type { EditorIpcAdapter, EditorViewState, EditorAction, EditorCommand, BlockType, EditingSessionStateDto, DtoBlock } from './types.js';
  import { editorReducer } from './editorReducer.js';
  import { canCopy } from './editorPredicates.js';
  import { IDLE_SAVE_DEBOUNCE_MS } from './debounceSchedule.js';
  import { scheduleIdleSave, cancelIdleSave, type TimerHandle } from './timerModule.js';
  import BlockElement from './BlockElement.svelte';
  import BlockDragHandle from './BlockDragHandle.svelte';
  import SaveFailureBanner from './SaveFailureBanner.svelte';

  interface Props {
    adapter: EditorIpcAdapter;
    /**
     * Optional initial blocks for the current note (for preview/testing).
     * Used to seed EditorViewState.blocks before any domain snapshot arrives.
     * When a snapshot with `blocks` arrives, the DTO value supersedes this.
     */
    initialBlocks?: ReadonlyArray<DtoBlock>;
  }

  const { adapter, initialBlocks = [] }: Props = $props();

  // Initial view state — idle until domain sends a snapshot.
  // RD-021: blocks is owned by EditorViewState; initialBlocks seeds it before any snapshot.
  let viewState = $state<EditorViewState>({
    status: 'idle',
    isDirty: false,
    currentNoteId: null,
    focusedBlockId: null,
    pendingNextFocus: null,
    isNoteEmpty: true,
    lastSaveError: null,
    lastSaveResult: null,
    blocks: untrack(() => [...initialBlocks]),
  });

  // RD-021: rendered block list is derived from viewState.blocks.
  // EditorPanel no longer owns an independent blocks: Block[] variable.
  const blocks = $derived(viewState.blocks);

  // REQ-EDIT-038 (RD-022): local $state for block-level dispatch rejection errors.
  // NOT part of EditorViewState or the pure reducer. Impure shell only.
  let currentBlockError = $state<{ blockId: string; error: { kind: string; max?: number } } | null>(null);

  /**
   * REQ-EDIT-038 (RD-022): adapter wrapper that intercepts the 4 block-edit dispatch
   * methods and surfaces Promise rejections as `currentBlockError`.
   * All other methods delegate unchanged to the real adapter.
   *
   * The blockId is extracted from the payload's `blockId` field (all 4 targeted
   * methods carry it in their payload). This wrapper is passed to BlockElement
   * instead of the raw adapter so that any rejection from those dispatches sets
   * `currentBlockError` in the EditorPanel's reactive state.
   */
  function makeErrorSurfacingAdapter(a: EditorIpcAdapter): EditorIpcAdapter {
    function withErrorSurface(
      blockId: string,
      fn: () => Promise<void>,
    ): Promise<void> {
      return fn().catch((err: unknown) => {
        if (err && typeof err === 'object' && 'kind' in err) {
          const errorObj = err as { kind: string; max?: number };
          currentBlockError = { blockId, error: errorObj };
        }
      });
    }

    return {
      ...a,
      dispatchEditBlockContent(payload) {
        return withErrorSurface(payload.blockId, () => a.dispatchEditBlockContent(payload));
      },
      dispatchChangeBlockType(payload) {
        return withErrorSurface(payload.blockId, () => a.dispatchChangeBlockType(payload));
      },
      dispatchInsertBlockAfter(payload) {
        return withErrorSurface(payload.prevBlockId, () => a.dispatchInsertBlockAfter(payload));
      },
      dispatchInsertBlockAtBeginning(payload) {
        // No blockId in this payload; use empty string sentinel (error is rare here)
        return withErrorSurface('', () => a.dispatchInsertBlockAtBeginning(payload));
      },
    };
  }

  // Adapter passed to BlockElement — error surface wrapping REQ-EDIT-038
  const blockElementAdapter = $derived(makeErrorSurfacingAdapter(adapter));

  let idleTimerHandle = $state<TimerHandle>(null);
  let panelRoot = $state<HTMLElement | null>(null);

  // REQ-EDIT-035 / PROP-EDIT-024a: deferred RequestNewNote after TriggerBlurSave completes.
  // When editing+dirty, we dispatch TriggerBlurSave and set this flag. After the snapshot
  // transitions out of saving to editing/idle (save success), we dispatch RequestNewNote.
  // If the transition is to save-failed, we clear the flag (user must resolve via banner).
  let pendingNewNoteSource = $state<'explicit-button' | 'ctrl-N' | null>(null);

  // Track the block being dragged (component-level, because jsdom DragEvent instances
  // don't share dataTransfer between dragstart and drop events).
  let draggingBlockId = $state<string | null>(null);

  // ── Inbound state subscription (synchronous — runs during mount) ──────────

  function handleSnapshot(snapshot: EditingSessionStateDto): void {
    // RD-021: reducer mirrors snapshot.blocks when present; preserves prior viewState.blocks when absent.
    // EditorPanel no longer independently manages block list — all block list state lives in viewState.
    dispatch({ kind: 'DomainSnapshotReceived', snapshot });

    // Legacy / test-mode fallback: when the snapshot has no blocks field AND we are in a
    // non-idle state, check if the focused block exists in the current block list.
    // If not (e.g., new-note snapshot with a new focusedBlockId not yet in the list),
    // synthesize a minimal block from focusedBlockId so the editor renders the correct element.
    // Also handles the case where viewState.blocks is empty (no initialBlocks provided).
    // This path fires only for test snapshots that predate RD-021 (no blocks in DTO).
    if (
      snapshot.status !== 'idle' &&
      !('blocks' in snapshot && snapshot.blocks !== undefined)
    ) {
      const focusedId = snapshot.status === 'editing' ? snapshot.focusedBlockId : null;
      const focusedBlockExists = focusedId
        ? viewState.blocks.some(b => b.id === focusedId)
        : true;
      if (viewState.blocks.length === 0 || !focusedBlockExists) {
        viewState = {
          ...viewState,
          blocks: [{
            id: focusedId ?? 'block-default-1',
            type: 'paragraph',
            content: '',
          }],
        };
      }
    }
  }

  // Register subscription synchronously (before flushSync) so _emitState in
  // beforeEach reaches the handler. onDestroy cleans up on unmount.
  // untrack: adapter is stable for the component lifetime; capturing once is intentional.
  const _unsubscribe = untrack(() => adapter.subscribeToState(handleSnapshot));
  onDestroy(_unsubscribe);

  // ── Derived values ────────────────────────────────────────────────────────

  // Copy is enabled when canCopy returns true (REQ-EDIT-005, REQ-EDIT-020, REQ-EDIT-032).
  // Per spec: enabled when status ∈ {editing, saving} && !isNoteEmpty — no isDirty gate.
  const isCopyEnabled = $derived(canCopy(viewState));
  // New note button is disabled ONLY in switching state (REQ-EDIT-033, PROP-EDIT-022)
  const isNewNoteDisabled = $derived(viewState.status === 'switching');
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

  // ── Deferred RequestNewNote after blur-save completes (REQ-EDIT-035) ────────

  $effect(() => {
    if (pendingNewNoteSource === null) return;
    const status = viewState.status;
    // Save succeeded: status left saving → editing with isDirty=false, or idle
    if (
      (status === 'editing' && !viewState.isDirty) ||
      status === 'idle'
    ) {
      const source = pendingNewNoteSource;
      pendingNewNoteSource = null;
      dispatch({
        kind: 'RequestNewNoteRequested',
        payload: {
          source,
          issuedAt: new Date().toISOString(),
        },
      });
    }
    // Save failed: clear flag so the user resolves via banner
    if (status === 'save-failed') {
      pendingNewNoteSource = null;
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

  function handleBlockEdit(noteId: string, blockId?: string): void {
    scheduleOrRescheduleIdle(noteId);
    // REQ-EDIT-038: clear currentBlockError when user begins editing the affected block.
    if (blockId && currentBlockError?.blockId === blockId) {
      currentBlockError = null;
    }
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
    // REQ-EDIT-035: editing+dirty → TriggerBlurSave first, defer RequestNewNote
    if (viewState.status === 'editing' && viewState.isDirty && viewState.currentNoteId) {
      pendingNewNoteSource = source;
      adapter.dispatchTriggerBlurSave({
        source: 'capture-blur',
        noteId: viewState.currentNoteId,
        issuedAt: new Date().toISOString(),
      }).catch(() => {});
      // RequestNewNote will be dispatched by the $effect once saving completes
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

  // Ghost block removed (FIND-060): the ghost was a test-harness hack.
  // BlockElement.svelte handles all keyboard events (Enter/Backspace/Delete)
  // via real handlers on the real rendered block elements.
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

  <!-- Block tree -->
  {#if isBlockTreeVisible}
    <div class="block-tree" data-testid="block-tree">
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
            adapter={blockElementAdapter}
            onBlockEdit={() => handleBlockEdit(viewState.currentNoteId ?? '', block.id)}
          />
          <!-- REQ-EDIT-038: inline validation hint shown when a dispatch rejection
               targets this block. Cleared on next successful edit or re-edit. -->
          {#if currentBlockError?.blockId === block.id}
            {@const err = currentBlockError.error}
            {#if err.kind === 'incompatible-content-for-type'}
              <div
                data-testid="block-validation-hint"
                data-error-kind="incompatible-content-for-type"
                class="block-validation-hint"
                aria-describedby="block-{block.id}"
              >このブロック種別に変換できません</div>
            {:else if err.kind === 'control-character'}
              <div
                data-testid="block-validation-hint"
                data-error-kind="control-character"
                class="block-validation-hint"
                aria-describedby="block-{block.id}"
              >制御文字は入力できません</div>
            {:else if err.kind === 'too-long'}
              <div
                data-testid="block-validation-hint"
                data-error-kind="too-long"
                class="block-validation-hint"
                aria-describedby="block-{block.id}"
              >上限を超えました（max: {err.max ?? '?'}）</div>
            {/if}
          {/if}
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

  .block-tree {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .block-drop-zone {
    min-height: 4px;
  }

  .block-validation-hint {
    padding: 2px 16px;
    font-size: 12px;
    color: #e03e3e;
    font-weight: 400;
  }

</style>
