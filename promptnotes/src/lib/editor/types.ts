/**
 * types.ts — ui-editor Sprint 7 type definitions (block-based)
 *
 * Type-only file: no runtime logic. Defines the contracts between the pure
 * editorReducer, editorPredicates, debounceSchedule, and the effectful shell.
 *
 * Source of truth:
 *   - behavioral-spec.md §3.6a, §10, §11
 *   - verification-architecture.md §2, §10
 *   - docs/domain/code/ts/src/shared/value-objects.ts (BlockType)
 *   - docs/domain/code/ts/src/shared/errors.ts (SaveError, FsError, SaveValidationError)
 *   - docs/domain/code/ts/src/capture/commands.ts (CaptureCommand shapes)
 *   - docs/domain/code/ts/src/capture/states.ts (EditingSessionState)
 *
 * NO forbidden APIs may appear here:
 * Math.random, crypto, performance, window, globalThis, self, document,
 * navigator, requestAnimationFrame, requestIdleCallback, localStorage,
 * sessionStorage, indexedDB, fetch, XMLHttpRequest, setTimeout, setInterval,
 * clearTimeout, clearInterval, Date.now, Date(, new Date, $state, $effect,
 * $derived, import.meta, invoke(, @tauri-apps/api
 */

// ── BlockType ─────────────────────────────────────────────────────────────────

/**
 * The 9 BlockType literals from shared/value-objects.ts.
 * Re-exported here for UI-layer use.
 */
export type BlockType =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bullet'
  | 'numbered'
  | 'code'
  | 'quote'
  | 'divider';

// ── Status enum ───────────────────────────────────────────────────────────────

export type EditingSessionStatus =
  | 'idle'
  | 'editing'
  | 'saving'
  | 'switching'
  | 'save-failed';

// ── Source literals ──────────────────────────────────────────────────────────

/** Domain enum subset for save-trigger origin (shared/events.ts SaveNoteSource). */
export type EditorCommandSaveSource = 'capture-idle' | 'capture-blur';

/** Source for new-note requests (capture/commands.ts RequestNewNote.source). */
export type NewNoteSource = 'explicit-button' | 'ctrl-N';

// ── SaveError ────────────────────────────────────────────────────────────────

/**
 * FsError variants matching shared/errors.ts.
 * 5 variants: permission, disk-full, lock, not-found, unknown.
 */
export type FsError =
  | { kind: 'permission' }
  | { kind: 'disk-full' }
  | { kind: 'lock' }
  | { kind: 'not-found' }
  | { kind: 'unknown' };

/**
 * SaveValidationError variants from shared/errors.ts.
 */
export type SaveValidationError =
  | { kind: 'empty-body-on-idle' }
  | { kind: 'invariant-violated' };

/**
 * SaveError discriminated union (shared/errors.ts).
 * - `{ kind: 'fs', reason: FsError }` — file-system error; banner shown.
 * - `{ kind: 'validation', reason: SaveValidationError }` — silent; no banner.
 */
export type SaveError =
  | { kind: 'fs'; reason: FsError }
  | { kind: 'validation'; reason: SaveValidationError };

// ── PendingNextFocus ──────────────────────────────────────────────────────────

/** capture/states.ts PendingNextFocus equivalent. */
export type PendingNextFocus = {
  noteId: string;
  blockId: string;
};

// ── EditingSessionStateDto ────────────────────────────────────────────────────

/**
 * 5-arm discriminated union DTO for the inbound EditingSessionState snapshot.
 * behavioral-spec.md §10; PROP-EDIT-040.
 *
 * Per-variant field sets (from §10):
 * - 'idle': only status
 * - 'editing': status, currentNoteId, focusedBlockId, isDirty, isNoteEmpty, lastSaveResult
 * - 'saving': status, currentNoteId, isNoteEmpty
 * - 'switching': status, currentNoteId, pendingNextFocus, isNoteEmpty
 * - 'save-failed': status, currentNoteId, priorFocusedBlockId, pendingNextFocus, lastSaveError, isNoteEmpty
 *
 * Note: priorFocusedBlockId is a DTO-only projection field on the save-failed arm
 * (behavioral-spec.md §10, §3.6a, PROP-EDIT-014).
 */
export type EditingSessionStateDto =
  | { status: 'idle' }
  | {
      status: 'editing';
      currentNoteId: string;
      focusedBlockId: string | null;
      isDirty: boolean;
      isNoteEmpty: boolean;
      lastSaveResult: 'success' | null;
    }
  | {
      status: 'saving';
      currentNoteId: string;
      isNoteEmpty: boolean;
    }
  | {
      status: 'switching';
      currentNoteId: string;
      pendingNextFocus: PendingNextFocus;
      isNoteEmpty: boolean;
    }
  | {
      status: 'save-failed';
      currentNoteId: string;
      /** DTO-only projection: the focusedBlockId at the moment the save failed. */
      priorFocusedBlockId: string | null;
      pendingNextFocus: PendingNextFocus | null;
      lastSaveError: SaveError;
      isNoteEmpty: boolean;
    };

// ── EditorViewState ──────────────────────────────────────────────────────────

/**
 * UI-side projection of EditingSessionState (behavioral-spec.md §3.6a).
 * Owned exclusively by the pure editorReducer; never mutated directly by components.
 * Converges to the domain's EditingSessionState within one inbound event cycle.
 *
 * Fields per behavioral-spec.md §3.6a and verification-architecture.md §2.
 */
export type EditorViewState = {
  /** Maps 1:1 to EditingSessionState.status. */
  status: EditingSessionStatus;
  /** True when blocks have unsaved changes. Cleared on NoteFileSaved. */
  isDirty: boolean;
  /** NoteId of the currently active note; null when idle. */
  currentNoteId: string | null;
  /**
   * focusedBlockId: from editing.focusedBlockId or save-failed.priorFocusedBlockId
   * per PROP-EDIT-014. Null when idle/saving/switching.
   */
  focusedBlockId: string | null;
  /** Pending next focus target (switching/save-failed states). */
  pendingNextFocus: PendingNextFocus | null;
  /** True when the note has only one empty paragraph block. */
  isNoteEmpty: boolean;
  /** Last save error; non-null only when status === 'save-failed'. */
  lastSaveError: SaveError | null;
  /**
   * Last save result from editing arm DTO. null for all other statuses.
   * Informs the dirty indicator and post-save banner UX.
   */
  lastSaveResult: 'success' | null;
};

// ── EditorAction ─────────────────────────────────────────────────────────────

/**
 * Discriminated union accepted by editorReducer (verification-architecture.md §3 Tier 0).
 *
 * Block-level action set for the block-based editor model.
 * The reducer must be total over EditorAction.kind × EditingSessionStatus.
 */
export type EditorAction =
  // Block content actions
  | { kind: 'BlockContentEdited';   payload: { noteId: string; blockId: string; content: string; issuedAt: string } }
  | { kind: 'BlockInserted';        payload: { noteId: string; blockId: string; issuedAt: string } }
  | { kind: 'BlockRemoved';         payload: { noteId: string; blockId: string; issuedAt: string } }
  | { kind: 'BlocksMerged';         payload: { noteId: string; survivorBlockId: string; issuedAt: string } }
  | { kind: 'BlockSplit';           payload: { noteId: string; newBlockId: string; issuedAt: string } }
  | { kind: 'BlockTypeChanged';     payload: { noteId: string; blockId: string; newType: BlockType; issuedAt: string } }
  | { kind: 'BlockMoved';           payload: { noteId: string; blockId: string; toIndex: number; issuedAt: string } }
  // Focus actions
  | { kind: 'BlockFocused';         payload: { noteId: string; blockId: string; issuedAt: string } }
  | { kind: 'BlockBlurred';         payload: { noteId: string; blockId: string; issuedAt: string } }
  | { kind: 'EditorBlurredAllBlocks'; payload: { noteId: string; issuedAt: string } }
  // Domain snapshot
  | { kind: 'DomainSnapshotReceived'; snapshot: EditingSessionStateDto }
  // Save actions
  | { kind: 'TriggerIdleSaveRequested';   payload: { noteId: string; issuedAt: string } }
  | { kind: 'TriggerBlurSaveRequested';   payload: { noteId: string; issuedAt: string } }
  | { kind: 'RetrySaveRequested';         payload: { noteId: string; issuedAt: string } }
  | { kind: 'DiscardCurrentSessionRequested'; payload: { noteId: string; issuedAt: string } }
  | { kind: 'CancelSwitchRequested';      payload: { noteId: string; issuedAt: string } }
  // Copy and new-note
  | { kind: 'CopyNoteBodyRequested';      payload: { noteId: string; issuedAt: string } }
  | { kind: 'RequestNewNoteRequested';    payload: { source: NewNoteSource; issuedAt: string } };

// ── EditorCommand ─────────────────────────────────────────────────────────────

/**
 * 17-variant discriminated union output by editorReducer (verification-architecture.md §10).
 * Consumed exclusively by the impure shell.
 *
 * 16 IPC variants + 1 local-effect variant (cancel-idle-timer).
 * The shell must handle every variant via an exhaustive switch on kind.
 */
export type EditorCommand =
  | { kind: 'focus-block';               payload: { noteId: string; blockId: string; issuedAt: string } }
  | { kind: 'edit-block-content';        payload: { noteId: string; blockId: string; content: string; issuedAt: string } }
  | { kind: 'insert-block-after';        payload: { noteId: string; prevBlockId: string; type: BlockType; content: string; issuedAt: string } }
  | { kind: 'insert-block-at-beginning'; payload: { noteId: string; type: BlockType; content: string; issuedAt: string } }
  | { kind: 'remove-block';              payload: { noteId: string; blockId: string; issuedAt: string } }
  | { kind: 'merge-blocks';              payload: { noteId: string; blockId: string; issuedAt: string } }
  | { kind: 'split-block';              payload: { noteId: string; blockId: string; offset: number; issuedAt: string } }
  | { kind: 'change-block-type';         payload: { noteId: string; blockId: string; newType: BlockType; issuedAt: string } }
  | { kind: 'move-block';               payload: { noteId: string; blockId: string; toIndex: number; issuedAt: string } }
  | { kind: 'cancel-idle-timer' }
  | { kind: 'trigger-idle-save';         payload: { source: 'capture-idle'; noteId: string; issuedAt: string } }
  | { kind: 'trigger-blur-save';         payload: { source: 'capture-blur'; noteId: string; issuedAt: string } }
  | { kind: 'retry-save';               payload: { noteId: string; issuedAt: string } }
  | { kind: 'discard-current-session';   payload: { noteId: string; issuedAt: string } }
  | { kind: 'cancel-switch';             payload: { noteId: string; issuedAt: string } }
  | { kind: 'copy-note-body';            payload: { noteId: string; issuedAt: string } }
  | { kind: 'request-new-note';          payload: { source: NewNoteSource; issuedAt: string } };

// ── EditorIpcAdapter ──────────────────────────────────────────────────────────

/**
 * Outbound adapter interface (behavioral-spec.md §10, verification-architecture.md §2).
 * 16 dispatchXxx methods (all IPC variants except cancel-idle-timer).
 * Pure modules must not import this interface.
 */
export interface EditorIpcAdapter {
  dispatchFocusBlock(payload: { noteId: string; blockId: string; issuedAt: string }): Promise<void>;
  dispatchEditBlockContent(payload: { noteId: string; blockId: string; content: string; issuedAt: string }): Promise<void>;
  dispatchInsertBlockAfter(payload: { noteId: string; prevBlockId: string; type: BlockType; content: string; issuedAt: string }): Promise<void>;
  dispatchInsertBlockAtBeginning(payload: { noteId: string; type: BlockType; content: string; issuedAt: string }): Promise<void>;
  dispatchRemoveBlock(payload: { noteId: string; blockId: string; issuedAt: string }): Promise<void>;
  dispatchMergeBlocks(payload: { noteId: string; blockId: string; issuedAt: string }): Promise<void>;
  dispatchSplitBlock(payload: { noteId: string; blockId: string; offset: number; issuedAt: string }): Promise<void>;
  dispatchChangeBlockType(payload: { noteId: string; blockId: string; newType: BlockType; issuedAt: string }): Promise<void>;
  dispatchMoveBlock(payload: { noteId: string; blockId: string; toIndex: number; issuedAt: string }): Promise<void>;
  dispatchTriggerIdleSave(payload: { source: 'capture-idle'; noteId: string; issuedAt: string }): Promise<void>;
  dispatchTriggerBlurSave(payload: { source: 'capture-blur'; noteId: string; issuedAt: string }): Promise<void>;
  dispatchRetrySave(payload: { noteId: string; issuedAt: string }): Promise<void>;
  dispatchDiscardCurrentSession(payload: { noteId: string; issuedAt: string }): Promise<void>;
  dispatchCancelSwitch(payload: { noteId: string; issuedAt: string }): Promise<void>;
  dispatchCopyNoteBody(payload: { noteId: string; issuedAt: string }): Promise<void>;
  dispatchRequestNewNote(payload: { source: NewNoteSource; issuedAt: string }): Promise<void>;
  /** Inbound subscription for state change events. */
  subscribeToState(handler: (state: EditingSessionStateDto) => void): () => void;
}

// ── Spec constants ────────────────────────────────────────────────────────────

/**
 * REQ-EDIT-012: Idle-save debounce window in milliseconds.
 * Named export so tests can reference it via vi.useFakeTimers().
 */
export const IDLE_SAVE_DEBOUNCE_MS = 2000;

// ── Tier 0 structural-conformance assertions ──────────────────────────────────

export type _AssertEditBlockContentShape =
  (EditorCommand & { kind: 'edit-block-content' })['payload'] extends
  { noteId: string; blockId: string; content: string; issuedAt: string } ? true : never;

export type _AssertSplitBlockShape =
  (EditorCommand & { kind: 'split-block' })['payload'] extends
  { noteId: string; blockId: string; offset: number; issuedAt: string } ? true : never;

export type _AssertCopyNoteBodyShape =
  (EditorCommand & { kind: 'copy-note-body' })['payload'] extends
  { noteId: string; issuedAt: string } ? true : never;
