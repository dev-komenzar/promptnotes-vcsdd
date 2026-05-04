<script lang="ts">
  /**
   * EditorPane.svelte — Svelte 5 component (Sprint 2 Green phase, iteration-2)
   *
   * Props:
   *   adapter       — TauriEditorAdapter (effectful IPC dispatch)
   *   stateChannel  — EditorStateChannel (inbound domain snapshot subscription)
   *   timer         — DebounceTimer (injected timer module; sole setTimeout owner per RD-012)
   *   clipboard     — ClipboardAdapter (navigator.clipboard abstraction)
   *   clock         — injected clock (optional, defaults to Date)
   *   initialState  — optional initial EditorViewState
   *
   * Fixes in this iteration:
   *   FIND-001 / REQ-EDIT-025: blur-save-first gate for NewNoteClicked (editing+dirty)
   *   FIND-002 / RD-012: idle save scheduled via injected timer.scheduleIdleSave only
   *   FIND-003 / NFR-EDIT-005..007: banner CSS — 5-layer Deep Shadow, #dd5b00, 15px/600
   *   FIND-005: button labels match ui-fields.md §画面 4 exactly
   *   FIND-006: banner button handlers dispatch through reducer, not directly to adapter
   *   FIND-007: inbound snapshot bridge for save-success (timer.cancel) and save-failed
   *   FIND-008 / REQ-EDIT-009: idle-state placeholder element
   *   FIND-009 / §6: issuedAt uses new Date(clock.now()).toISOString() for ISO-8601
   *   FIND-012: aria-disabled on New Note button
   *   FIND-013: scheduleIdleSave only called when status === 'editing'
   */
  import type { TauriEditorAdapter } from './tauriEditorAdapter.js';
  import type { EditorStateChannel } from './editorStateChannel.js';
  import type { DebounceTimer } from './debounceTimer.js';
  import type { ClipboardAdapter } from './clipboardAdapter.js';
  import type { EditorViewState, EditorAction, EditorCommand } from './types.js';
  import { untrack } from 'svelte';
  import { editorReducer } from './editorReducer.js';
  import { canCopy, bannerMessageFor } from './editorPredicates.js';
  import { IDLE_SAVE_DEBOUNCE_MS } from './debounceSchedule.js';
  import { attachKeyboardListener } from './keyboardListener.js';

  interface Props {
    /** Outbound IPC adapter for domain dispatch calls. */
    adapter: TauriEditorAdapter;
    /** Inbound channel that delivers EditingSessionState snapshots from the domain. */
    stateChannel: EditorStateChannel;
    /** Idle-save timer module; sole setTimeout owner per RD-012. */
    timer: DebounceTimer;
    /** Clipboard write abstraction (navigator.clipboard mock seam). */
    clipboard: ClipboardAdapter;
    /** Monotonic clock; defaults to Date. Override in tests for determinism. */
    clock?: { now(): number };
    /** Optional initial EditorViewState; defaults to idle/clean. */
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

  // Track previous status for inbound state bridge (FIND-007)
  let previousStatus = $state<string>(_initialSnapshot.status);

  /** Execute a single EditorCommand produced by the reducer. */
  function executeCommand(cmd: EditorCommand): void {
    switch (cmd.kind) {
      case 'edit-note-body':
        // Map EditorCommand field 'newBody' to IPC wire field 'body' (domain convention).
        adapter.dispatchEditNoteBody({
          noteId: cmd.payload.noteId,
          body: cmd.payload.newBody,
          issuedAt: cmd.payload.issuedAt,
          dirty: true,
        });
        break;
      case 'trigger-idle-save':
        adapter.dispatchTriggerIdleSave(cmd.payload);
        break;
      case 'trigger-blur-save':
        adapter.dispatchTriggerBlurSave(cmd.payload);
        break;
      case 'cancel-idle-timer':
        timer.cancel();
        break;
      case 'retry-save':
        adapter.dispatchRetrySave(cmd.payload);
        break;
      case 'discard-current-session':
        adapter.dispatchDiscardCurrentSession(cmd.payload);
        break;
      case 'cancel-switch':
        adapter.dispatchCancelSwitch(cmd.payload);
        break;
      case 'copy-note-body':
        adapter.dispatchCopyNoteBody(cmd.payload);
        clipboard.write(cmd.payload.body);
        break;
      case 'request-new-note':
        adapter.dispatchRequestNewNote(cmd.payload);
        break;
      default: {
        const _exhaustive: never = cmd;
        void _exhaustive;
      }
    }
  }

  /**
   * Run action through the pure reducer, update viewState, and execute all
   * resulting commands via executeCommand.
   */
  function dispatch(action: EditorAction): void {
    const result = editorReducer(viewState, action);
    viewState = result.state;
    for (const cmd of result.commands) {
      executeCommand(cmd);
    }
  }

  // Subscribe to inbound domain snapshots
  $effect(() => {
    const unsubscribe = stateChannel.subscribe((state) => {
      const incomingStatus = state.status;
      const prevStatus = previousStatus;

      // FIND-007: inbound state bridge
      // saving → editing with isDirty=false means save succeeded → cancel idle timer
      if (prevStatus === 'saving' && incomingStatus === 'editing' && !state.isDirty) {
        timer.cancel();
      }

      previousStatus = incomingStatus;

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
      // FIND-001 / REQ-EDIT-025: blur-save-first gate for keyboard shortcut
      if (viewState.status === 'editing' && viewState.isDirty) {
        // Emit blur-save first, then new note
        const noteId = viewState.currentNoteId ?? '';
        const issuedAt = new Date(clock.now()).toISOString();
        dispatch({
          kind: 'BlurEvent',
          payload: { noteId, body: viewState.body, issuedAt },
        });
      }
      dispatch({
        kind: 'NewNoteClicked',
        payload: { source: 'ctrl-N', issuedAt: new Date(clock.now()).toISOString() },
      });
    });
    return detach;
  });

  // Event handlers
  function handleInput(e: Event): void {
    const textarea = e.currentTarget as HTMLTextAreaElement;
    const noteId = viewState.currentNoteId ?? '';
    // FIND-009: ISO-8601 issuedAt per §6 Glossary and §10
    const issuedAt = new Date(clock.now()).toISOString();
    dispatch({
      kind: 'NoteBodyEdited',
      payload: { newBody: textarea.value, noteId, issuedAt },
    });
    // FIND-002 / RD-012: schedule idle save via injected timer only when editing
    // FIND-013: only schedule when status === 'editing' (after reducer call viewState is updated)
    if (viewState.status === 'editing') {
      const fireAt = clock.now() + IDLE_SAVE_DEBOUNCE_MS;
      timer.scheduleIdleSave(fireAt, () => {
        if (viewState.status === 'editing' && viewState.isDirty) {
          const idleNoteId = viewState.currentNoteId ?? '';
          const idleIssuedAt = new Date(clock.now()).toISOString();
          dispatch({
            kind: 'IdleTimerFired',
            payload: {
              nowMs: clock.now(),
              noteId: idleNoteId,
              body: viewState.body,
              issuedAt: idleIssuedAt,
            },
          });
        }
      });
    }
  }

  function handleBlur(): void {
    // Cancel idle timer via injected timer module (FIND-002 / RD-012)
    timer.cancel();

    if (viewState.status === 'editing' && viewState.isDirty) {
      const noteId = viewState.currentNoteId ?? '';
      const issuedAt = new Date(clock.now()).toISOString();
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
    // FIND-001 / REQ-EDIT-025: blur-save-first gate for button click
    if (viewState.status === 'editing' && viewState.isDirty) {
      const noteId = viewState.currentNoteId ?? '';
      const issuedAt = new Date(clock.now()).toISOString();
      dispatch({
        kind: 'BlurEvent',
        payload: { noteId, body: viewState.body, issuedAt },
      });
    }
    dispatch({
      kind: 'NewNoteClicked',
      payload: { source: 'explicit-button', issuedAt: new Date(clock.now()).toISOString() },
    });
  }

  // FIND-006: banner button handlers dispatch through reducer, not directly to adapter
  function handleRetryClick(): void {
    dispatch({ kind: 'RetryClicked' });
  }

  function handleDiscardClick(): void {
    dispatch({ kind: 'DiscardClicked' });
  }

  function handleCancelClick(): void {
    dispatch({ kind: 'CancelClicked' });
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
  {#if viewState.status === 'idle'}
    <!-- FIND-008 / REQ-EDIT-009: Idle state placeholder -->
    <div data-testid="idle-placeholder" class="idle-placeholder">
      ノートを選択してください
    </div>
  {/if}

  {#if showDirtyIndicator}
    <span data-testid="dirty-indicator" aria-hidden="true" class="dirty-indicator">●</span>
  {/if}

  {#if showSaveIndicator}
    <div role="status" aria-label="保存中" class="save-indicator">保存中...</div>
  {/if}

  {#if showSaveFailedBanner}
    <div data-testid="save-failure-banner" role="alert" class="save-failure-banner">
      {#if bannerMessage}
        <p data-testid="save-failure-message" class="banner-message">{bannerMessage}</p>
      {/if}
      <div class="banner-actions">
        <!-- FIND-005: exact labels from ui-fields.md §画面 4 -->
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
          変更を破棄
        </button>
        <button
          data-testid="cancel-switch-button"
          onclick={handleCancelClick}
          class="banner-btn banner-btn--cancel"
        >
          閉じる（このまま編集を続ける）
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

    <!-- FIND-012: aria-disabled on New Note button -->
    <button
      data-testid="new-note-button"
      onclick={handleNewNoteClick}
      disabled={isNewNoteDisabled}
      aria-disabled={isNewNoteDisabled ? 'true' : 'false'}
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
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 4px 12px rgba(0, 0, 0, 0.04);
    overflow: hidden;
    position: relative;
  }

  /* FIND-008 / REQ-EDIT-009: Idle state placeholder */
  .idle-placeholder {
    padding: 24px 16px;
    color: #a39e98;
    font-size: 14px;
    font-weight: 400;
    text-align: center;
  }

  .dirty-indicator {
    position: absolute;
    top: 8px;
    right: 12px;
    color: #dd5b00;
    font-size: 10px;
    line-height: 1;
  }

  .save-indicator {
    padding: 6px 12px;
    background: #f6f5f4;
    color: #615d59;
    font-size: 12px;
    font-weight: 600;
    border-bottom: 1px solid rgba(0,0,0,0.1);
  }

  /* FIND-003: 5-layer Deep Shadow + #dd5b00 accent + 8px radius per REQ-EDIT-020 / DESIGN.md */
  .save-failure-banner {
    padding: 16px;
    background: #ffffff;
    border-left: 4px solid #dd5b00;
    border-radius: 8px;
    box-shadow: rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px;
  }

  .banner-message {
    margin: 0;
    font-size: 14px;
    color: #615d59;
    font-weight: 500;
  }

  .banner-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* FIND-003: NFR-EDIT-006 button typography: 15px / 600; DESIGN.md §4 Buttons */
  .banner-btn {
    padding: 8px 16px;
    font-size: 15px;
    border-radius: 4px;
    border: 1px solid transparent;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.15s;
  }

  /* FIND-003: Retry → Primary Blue (#0075de) per DESIGN.md §4 Buttons */
  .banner-btn--retry {
    background: #0075de;
    color: #ffffff;
  }

  .banner-btn--retry:hover {
    background: #005bab;
  }

  /* FIND-003: Discard / Cancel → Secondary (rgba(0,0,0,0.05)) per DESIGN.md */
  .banner-btn--discard {
    background: rgba(0,0,0,0.05);
    color: #000000;
  }

  .banner-btn--discard:hover {
    background: rgba(0,0,0,0.08);
  }

  .banner-btn--cancel {
    background: rgba(0,0,0,0.05);
    color: #000000;
  }

  .banner-btn--cancel:hover {
    background: rgba(0,0,0,0.08);
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
    color: rgba(0,0,0,0.9);
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
    border-top: 1px solid rgba(0,0,0,0.1);
    background: #f6f5f4;
  }

  .toolbar-btn {
    padding: 8px 16px;
    font-size: 15px;
    border-radius: 4px;
    border: 1px solid rgba(0,0,0,0.1);
    background: #ffffff;
    color: rgba(0,0,0,0.95);
    cursor: pointer;
    font-weight: 600;
    transition: background 0.15s, border-color 0.15s;
  }

  .toolbar-btn:hover:not(:disabled) {
    background: #f6f5f4;
    border-color: rgba(0,0,0,0.15);
  }

  .toolbar-btn:disabled {
    color: #a39e98;
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
