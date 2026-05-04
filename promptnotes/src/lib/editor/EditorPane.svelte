<script lang="ts">
  /**
   * EditorPane.svelte — Svelte 5 component (Sprint 2 Green phase)
   *
   * Props:
   *   adapter       — TauriEditorAdapter (effectful IPC dispatch)
   *   stateChannel  — EditorStateChannel (inbound domain snapshot subscription)
   *   timer         — DebounceTimer (cancel hook for blur-save coordination)
   *   clipboard     — ClipboardAdapter (navigator.clipboard abstraction)
   *   clock         — injected clock (optional, defaults to Date)
   *   initialState  — optional initial EditorViewState
   */
  import type { TauriEditorAdapter } from './tauriEditorAdapter.js';
  import type { EditorStateChannel } from './editorStateChannel.js';
  import type { DebounceTimer } from './debounceTimer.js';
  import type { ClipboardAdapter } from './clipboardAdapter.js';
  import type { EditorViewState, EditorAction } from './types.js';
  import { untrack } from 'svelte';
  import { editorReducer } from './editorReducer.js';
  import { canCopy, bannerMessageFor } from './editorPredicates.js';
  import { IDLE_SAVE_DEBOUNCE_MS } from './debounceSchedule.js';
  import { attachKeyboardListener } from './keyboardListener.js';

  interface Props {
    adapter: TauriEditorAdapter;
    stateChannel: EditorStateChannel;
    timer: DebounceTimer;
    clipboard: ClipboardAdapter;
    clock?: { now(): number };
    initialState?: EditorViewState;
  }

  const {
    adapter,
    stateChannel,
    timer,
    clipboard,
    clock = { now: () => Date.now() },
    initialState,
  }: Props = $props();

  // Initial view state — captured once at mount via untrack to avoid reactive warning
  const defaultViewState: EditorViewState = {
    status: 'idle',
    isDirty: false,
    currentNoteId: null,
    body: '',
    pendingNextNoteId: null,
    lastError: null,
  };

  const _initialSnapshot = untrack(() => initialState ?? defaultViewState);
  let viewState = $state<EditorViewState>({ ..._initialSnapshot });

  // Internal idle-save timer handle (direct setTimeout — bypasses timer.scheduleIdleSave)
  let idleSaveHandle: ReturnType<typeof setTimeout> | null = null;

  function scheduleIdleSave(): void {
    // Cancel existing handle
    if (idleSaveHandle !== null) {
      clearTimeout(idleSaveHandle);
      idleSaveHandle = null;
    }
    idleSaveHandle = setTimeout(() => {
      idleSaveHandle = null;
      if (viewState.status === 'editing' && viewState.isDirty) {
        adapter.dispatchTriggerIdleSave('capture-idle');
      }
    }, IDLE_SAVE_DEBOUNCE_MS);
  }

  function cancelIdleSave(): void {
    if (idleSaveHandle !== null) {
      clearTimeout(idleSaveHandle);
      idleSaveHandle = null;
    }
  }

  /**
   * Dispatch an action through the pure reducer and execute resulting commands.
   */
  function dispatch(action: EditorAction): void {
    const result = editorReducer(viewState, action);
    viewState = result.state;

    for (const cmd of result.commands) {
      switch (cmd.kind) {
        case 'edit-note-body':
          adapter.dispatchEditNoteBody(cmd.payload.noteId, cmd.payload.newBody, cmd.payload.issuedAt);
          break;
        case 'trigger-idle-save':
          adapter.dispatchTriggerIdleSave(cmd.payload.source);
          break;
        case 'trigger-blur-save':
          adapter.dispatchTriggerBlurSave(cmd.payload.source);
          break;
        case 'cancel-idle-timer':
          cancelIdleSave();
          break;
        case 'retry-save':
          adapter.dispatchRetrySave();
          break;
        case 'discard-current-session':
          adapter.dispatchDiscardCurrentSession();
          break;
        case 'cancel-switch':
          adapter.dispatchCancelSwitch();
          break;
        case 'copy-note-body':
          adapter.dispatchCopyNoteBody(cmd.payload.noteId);
          clipboard.write(cmd.payload.body);
          break;
        case 'request-new-note':
          adapter.dispatchRequestNewNote(cmd.payload.source, cmd.payload.issuedAt);
          break;
        default: {
          const _exhaustive: never = cmd;
          void _exhaustive;
        }
      }
    }
  }

  // Subscribe to inbound domain snapshots
  $effect(() => {
    const unsubscribe = stateChannel.subscribe((state) => {
      viewState = {
        status: state.status,
        isDirty: state.isDirty,
        currentNoteId: state.currentNoteId,
        pendingNextNoteId: state.pendingNextNoteId,
        lastError: state.lastError,
        body: state.body,
      };
    });
    return unsubscribe;
  });

  // Attach keyboard listener to pane root
  let paneRoot = $state<HTMLElement | undefined>(undefined);

  $effect(() => {
    if (!paneRoot) return;
    const detach = attachKeyboardListener(paneRoot, (_source) => {
      dispatch({
        kind: 'NewNoteClicked',
        payload: { source: 'ctrl-N', issuedAt: clock.now().toString() },
      });
    });
    return detach;
  });

  // Event handlers
  function handleInput(e: Event): void {
    const textarea = e.currentTarget as HTMLTextAreaElement;
    const noteId = viewState.currentNoteId ?? '';
    const issuedAt = clock.now().toString();
    dispatch({
      kind: 'NoteBodyEdited',
      payload: { newBody: textarea.value, noteId, issuedAt },
    });
    // Schedule idle save directly (not through timer.scheduleIdleSave)
    scheduleIdleSave();
  }

  function handleBlur(): void {
    // Cancel idle timer via both direct clearTimeout and timer.cancel() hook
    cancelIdleSave();
    timer.cancel();

    if (viewState.status === 'editing' && viewState.isDirty) {
      const noteId = viewState.currentNoteId ?? '';
      const issuedAt = clock.now().toString();
      dispatch({
        kind: 'BlurEvent',
        payload: { noteId, body: viewState.body, issuedAt },
      });
    }
  }

  function handleCopyClick(): void {
    if (!canCopy(viewState.body, viewState.status)) return;
    const noteId = viewState.currentNoteId ?? '';
    dispatch({
      kind: 'CopyClicked',
      payload: { noteId, body: viewState.body },
    });
  }

  function handleNewNoteClick(): void {
    dispatch({
      kind: 'NewNoteClicked',
      payload: { source: 'explicit-button', issuedAt: clock.now().toString() },
    });
  }

  function handleRetryClick(): void {
    adapter.dispatchRetrySave();
  }

  function handleDiscardClick(): void {
    adapter.dispatchDiscardCurrentSession();
  }

  function handleCancelClick(): void {
    adapter.dispatchCancelSwitch();
  }

  // Derived values
  const isTextareaDisabled = $derived(viewState.status === 'switching');
  const isTextareaReadonly = $derived(viewState.status === 'idle');
  const isCopyDisabled = $derived(!canCopy(viewState.body, viewState.status));
  const isNewNoteDisabled = $derived(viewState.status === 'switching');
  const showDirtyIndicator = $derived(viewState.isDirty);
  const showSaveIndicator = $derived(viewState.status === 'saving');
  const showSaveFailedBanner = $derived(viewState.status === 'save-failed');
  const bannerMessage = $derived(
    viewState.lastError ? bannerMessageFor(viewState.lastError) : null
  );
</script>

<div
  class="editor-pane"
  data-state={viewState.status}
  bind:this={paneRoot}
>
  {#if showDirtyIndicator}
    <span data-testid="dirty-indicator" class="dirty-indicator">●</span>
  {/if}

  {#if showSaveIndicator}
    <div role="status" aria-label="保存中" class="save-indicator">保存中...</div>
  {/if}

  {#if showSaveFailedBanner}
    <div data-testid="save-failure-banner" role="alert" class="save-failure-banner">
      <p class="banner-message">{bannerMessage}</p>
      <div class="banner-actions">
        <button
          data-testid="retry-save-button"
          onclick={handleRetryClick}
          class="banner-btn banner-btn--retry"
        >
          再試行
        </button>
        <button
          data-testid="discard-session-button"
          onclick={handleDiscardClick}
          class="banner-btn banner-btn--discard"
        >
          破棄
        </button>
        <button
          data-testid="cancel-switch-button"
          onclick={handleCancelClick}
          class="banner-btn banner-btn--cancel"
        >
          キャンセル
        </button>
      </div>
    </div>
  {/if}

  <textarea
    data-testid="editor-body"
    class="editor-body"
    value={viewState.body}
    disabled={isTextareaDisabled}
    readonly={isTextareaReadonly}
    oninput={handleInput}
    onblur={handleBlur}
  ></textarea>

  <div class="editor-toolbar">
    <button
      data-testid="copy-body-button"
      onclick={handleCopyClick}
      disabled={isCopyDisabled}
      aria-disabled={isCopyDisabled ? 'true' : 'false'}
      class="toolbar-btn toolbar-btn--copy"
    >
      コピー
    </button>

    <button
      data-testid="new-note-button"
      onclick={handleNewNoteClick}
      disabled={isNewNoteDisabled}
      class="toolbar-btn toolbar-btn--new-note"
    >
      +新規
    </button>
  </div>
</div>

<style>
  .editor-pane {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: #fafaf9;
    border: 1px solid #e8e8e4;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04);
    overflow: hidden;
    position: relative;
  }

  .dirty-indicator {
    position: absolute;
    top: 8px;
    right: 12px;
    color: #f59e0b;
    font-size: 10px;
    line-height: 1;
  }

  .save-indicator {
    padding: 6px 12px;
    background: #f0fdf4;
    color: #16a34a;
    font-size: 12px;
    font-weight: 500;
    border-bottom: 1px solid #bbf7d0;
  }

  .save-failure-banner {
    padding: 12px 16px;
    background: #fff7ed;
    border-bottom: 1px solid #fed7aa;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .banner-message {
    margin: 0;
    font-size: 13px;
    color: #9a3412;
    font-weight: 500;
  }

  .banner-actions {
    display: flex;
    gap: 8px;
  }

  .banner-btn {
    padding: 4px 10px;
    font-size: 12px;
    border-radius: 4px;
    border: 1px solid transparent;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.15s;
  }

  .banner-btn--retry {
    background: #ea580c;
    color: white;
    border-color: #c2410c;
  }

  .banner-btn--retry:hover {
    background: #c2410c;
  }

  .banner-btn--discard {
    background: #f8f8f7;
    color: #6b7280;
    border-color: #e8e8e4;
  }

  .banner-btn--discard:hover {
    background: #f0f0ef;
  }

  .banner-btn--cancel {
    background: #f8f8f7;
    color: #6b7280;
    border-color: #e8e8e4;
  }

  .banner-btn--cancel:hover {
    background: #f0f0ef;
  }

  .editor-body {
    flex: 1;
    width: 100%;
    padding: 16px;
    border: none;
    outline: none;
    resize: none;
    font-size: 14px;
    line-height: 1.6;
    color: #2d2d2b;
    background: transparent;
    font-family: inherit;
    box-sizing: border-box;
  }

  .editor-body:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .editor-toolbar {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid #e8e8e4;
    background: #f8f8f7;
  }

  .toolbar-btn {
    padding: 5px 12px;
    font-size: 12px;
    border-radius: 4px;
    border: 1px solid #e8e8e4;
    background: #ffffff;
    color: #4b5563;
    cursor: pointer;
    font-weight: 500;
    transition: background 0.15s, border-color 0.15s;
  }

  .toolbar-btn:hover:not(:disabled) {
    background: #f0f0ef;
    border-color: #d4d4d0;
  }

  .toolbar-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
