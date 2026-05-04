/**
 * types.ts — ui-editor Sprint 1 pure-core type definitions
 *
 * All types here are compile-time only (no runtime logic). They constitute
 * the contract between editorReducer, editorPredicates, debounceSchedule, and
 * the effectful shell (Sprint 2).
 *
 * NO forbidden APIs may appear here:
 * Math.random, crypto, performance, window, globalThis, self, document,
 * navigator, requestAnimationFrame, requestIdleCallback, localStorage,
 * sessionStorage, indexedDB, fetch, XMLHttpRequest, setTimeout, setInterval,
 * clearTimeout, clearInterval, Date.now, Date(, new Date, $state, $effect,
 * $derived, import.meta, invoke(, @tauri-apps/api
 */

// ── Status enum ───────────────────────────────────────────────────────────────

export type EditingSessionStatus =
  | 'idle'
  | 'editing'
  | 'saving'
  | 'switching'
  | 'save-failed';

// ── Source literals ──────────────────────────────────────────────────────────

/** Domain enum values for save-trigger origin (domain-events.md:115). */
export type SaveSource = 'capture-idle' | 'capture-blur';

/** Source alias re-exported for use in PROP-EDIT-002/009 assertions. */
export type EditorCommandSaveSource = SaveSource;

/** Source for new-note requests (ui-fields.md §1A source discriminant). */
export type NewNoteSource = 'explicit-button' | 'ctrl-N';

// ── SaveError ────────────────────────────────────────────────────────────────

/**
 * FsError variants matching behavioral-spec.md REQ-EDIT-016 and
 * workflows.md §Workflow 2 エラーカタログ.
 */
export type FsError =
  | { kind: 'permission' }
  | { kind: 'disk-full' }
  | { kind: 'lock' }
  | { kind: 'unknown' };

/**
 * SaveValidationError variants from behavioral-spec.md REQ-EDIT-016 and
 * verification-architecture.md §3 Tier 0 (exhaustive switch obligation).
 * Also matches aggregates.md SaveError references.
 */
export type SaveValidationError =
  | { kind: 'empty-body-on-idle' }
  | { kind: 'invariant-violated' };

/**
 * SaveError discriminated union.
 * - `{ kind: 'fs', reason: FsError }` — file-system error; banner shown.
 * - `{ kind: 'validation', reason: SaveValidationError }` — silent; no banner.
 */
export type SaveError =
  | { kind: 'fs'; reason: FsError }
  | { kind: 'validation'; reason: SaveValidationError };

// ── EditorViewState ──────────────────────────────────────────────────────────

/**
 * UI-side projection of EditingSessionState (behavioral-spec.md §3.4a).
 * Owned by the pure editorReducer; never mutated directly by components.
 * Always converges to the domain's EditingSessionState within one inbound
 * event cycle.
 */
export type EditorViewState = {
  /** Maps 1:1 to EditingSessionState.status. */
  status: EditingSessionStatus;
  /** True when body has unsaved changes. Cleared on NoteFileSaved. */
  isDirty: boolean;
  /** NoteId of the currently active note; null when idle. */
  currentNoteId: string | null;
  /** Raw string body for the textarea; '' when idle. */
  body: string;
  /** NoteId of a pending next note (during switching/save-failed). */
  pendingNextNoteId: string | null;
  /** Last save error; non-null only when status === 'save-failed'. */
  lastError: SaveError | null;
};

// ── EditingSessionState ──────────────────────────────────────────────────────

/**
 * Rust-domain canonical state (aggregates.md §CaptureSession).
 * The TypeScript layer never constructs this — it arrives via the inbound
 * editorStateChannel as a DomainSnapshotReceived payload.
 *
 * Only the fields mirrored by EditorViewState are typed here; the Rust
 * domain may carry additional fields that the UI ignores.
 */
export type EditingSessionState = {
  status: EditingSessionStatus;
  isDirty: boolean;
  currentNoteId: string | null;
  pendingNextNoteId: string | null;
  lastError: SaveError | null;
  body: string;
};

// ── EditorAction ─────────────────────────────────────────────────────────────

/**
 * Closed 11-variant discriminated union accepted by editorReducer.
 * The reducer must be TOTAL over EditorAction.kind × EditingSessionStatus
 * (11 × 5 = 55 cells). Adding a variant without handling it in the reducer
 * switch is a TypeScript compile error (exhaustive never branch required).
 *
 * Source: sprint-1 contract §2, behavioral-spec.md §3.
 */
export type EditorAction =
  /**
   * REQ-EDIT-001: User keystroke — carries new body string.
   * Produced by the textarea oninput handler in EditorPanel.svelte (Sprint 2).
   * noteId and issuedAt are supplied by the impure shell (pure modules must
   * not call Date.now()).
   */
  | { kind: 'NoteBodyEdited'; payload: { newBody: string; noteId: string; issuedAt: string } }

  /**
   * REQ-EDIT-006: Textarea blur event while isDirty === true.
   * Produced by EditorPanel.svelte onblur handler (Sprint 2).
   * noteId, body, issuedAt supplied by the impure shell.
   */
  | { kind: 'BlurEvent'; payload: { noteId: string; body: string; issuedAt: string } }

  /**
   * REQ-EDIT-004: Idle debounce timer fired.
   * Produced by timerModule.ts callback (Sprint 2).
   * nowMs is the current clock time (supplied by the impure shell).
   */
  | { kind: 'IdleTimerFired'; payload: { nowMs: number; noteId: string; body: string; issuedAt: string } }

  /**
   * REQ-EDIT-014: Inbound domain state snapshot.
   * Produced by editorStateChannel.ts listen callback (Sprint 2).
   */
  | { kind: 'DomainSnapshotReceived'; snapshot: EditingSessionState }

  /**
   * REQ-EDIT-002, REQ-EDIT-005: Domain signals successful save.
   * Produced by the save result handler in the impure shell (Sprint 2).
   */
  | { kind: 'NoteFileSaved'; payload: { noteId: string; savedAt: string } }

  /**
   * REQ-EDIT-002 (failed path): Domain signals save failure.
   * Produced by the save result handler in the impure shell (Sprint 2).
   */
  | { kind: 'NoteSaveFailed'; payload: { noteId: string; error: SaveError } }

  /**
   * REQ-EDIT-017: Retry button click in save-failed state.
   * Produced by SaveFailureBanner.svelte (Sprint 2).
   */
  | { kind: 'RetryClicked' }

  /**
   * REQ-EDIT-018: Discard button click in save-failed state.
   * Produced by SaveFailureBanner.svelte (Sprint 2).
   */
  | { kind: 'DiscardClicked' }

  /**
   * REQ-EDIT-019: Cancel button click in save-failed state.
   * Produced by SaveFailureBanner.svelte (Sprint 2).
   */
  | { kind: 'CancelClicked' }

  /**
   * REQ-EDIT-021: Copy button click.
   * Produced by EditorPanel.svelte (Sprint 2).
   * noteId and body are supplied by the impure shell.
   */
  | { kind: 'CopyClicked'; payload: { noteId: string; body: string } }

  /**
   * REQ-EDIT-023, REQ-EDIT-024: New Note button or Ctrl+N shortcut.
   * Produced by EditorPanel.svelte (Sprint 2).
   * issuedAt is supplied by the impure shell.
   */
  | { kind: 'NewNoteClicked'; payload: { source: NewNoteSource; issuedAt: string } };

// ── EditorCommand ─────────────────────────────────────────────────────────────

/**
 * Closed 9-variant discriminated union output by editorReducer.
 * Consumed exclusively by the impure shell (Sprint 2).
 * The shell must handle every variant via an exhaustive switch on kind.
 *
 * Source: verification-architecture.md §10 (FIND-023 augmented payloads).
 *
 * Pure modules MUST NOT call Date.now() — issuedAt is supplied by the
 * impure shell in the inbound EditorAction payload and passed through here.
 */
export type EditorCommand =
  /**
   * Dispatch EditNoteBody to the domain.
   * noteId and issuedAt come from the triggering NoteBodyEdited action payload.
   */
  | { kind: 'edit-note-body'; payload: { noteId: string; newBody: string; issuedAt: string; dirty: true } }

  /**
   * Dispatch TriggerIdleSave to the domain.
   * source is always 'capture-idle' (classifySource('idle')).
   */
  | { kind: 'trigger-idle-save'; payload: { source: 'capture-idle'; noteId: string; body: string; issuedAt: string } }

  /**
   * Dispatch TriggerBlurSave to the domain.
   * source is always 'capture-blur' (classifySource('blur')).
   */
  | { kind: 'trigger-blur-save'; payload: { source: 'capture-blur'; noteId: string; body: string; issuedAt: string } }

  /**
   * Signal to the impure shell: call clearTimeout on the pending idle timer.
   * Emitted when NoteFileSaved is received (PROP-EDIT-010 / CRIT-008).
   */
  | { kind: 'cancel-idle-timer' }

  /**
   * Dispatch RetrySave to the domain.
   */
  | { kind: 'retry-save'; payload: { noteId: string; body: string; issuedAt: string } }

  /**
   * Dispatch DiscardCurrentSession to the domain.
   */
  | { kind: 'discard-current-session'; payload: { noteId: string } }

  /**
   * Dispatch CancelSwitch to the domain.
   */
  | { kind: 'cancel-switch'; payload: { noteId: string } }

  /**
   * Dispatch CopyNoteBody to the domain / clipboard adapter.
   * noteId comes from the triggering CopyClicked action payload.
   */
  | { kind: 'copy-note-body'; payload: { noteId: string; body: string } }

  /**
   * Dispatch RequestNewNote to the domain.
   */
  | { kind: 'request-new-note'; payload: { source: NewNoteSource; issuedAt: string } };

// ── Tier 0 structural-conformance aliases ─────────────────────────────────────
// These are audited by the impure shell in Sprint 2 (§10 Tier 0 obligations).

export type _AssertEditNoteBodyShape = (EditorCommand & { kind: 'edit-note-body' })['payload'] extends
  { noteId: string; newBody: string; issuedAt: string; dirty: true } ? true : never;

export type _AssertCopyNoteBodyShape = (EditorCommand & { kind: 'copy-note-body' })['payload'] extends
  { noteId: string; body: string } ? true : never;
