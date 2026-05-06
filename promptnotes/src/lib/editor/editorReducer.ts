/**
 * editorReducer.ts — pure mirror reducer for the block-based ui-editor (Sprint 7)
 *
 * Phase 2b implementation: full logic replacing the Phase 2a stub.
 *
 * Pure core module: must never import @tauri-apps/api or any forbidden API.
 * Signatures match verification-architecture.md §2 exactly.
 *
 * The reducer is a UI mirror — it does NOT invent transitions, only mirrors
 * DomainSnapshotReceived and emits commands for outbound action types.
 */

import type { EditorViewState, EditorAction, EditorCommand, EditingSessionStateDto, DtoBlock } from './types.js';

export type { EditorAction, EditorCommand, EditorViewState } from './types.js';

/** Return type of editorReducer. */
export type ReducerResult = {
  state: EditorViewState;
  commands: ReadonlyArray<EditorCommand>;
};

/** Default idle view state — used when no other fields apply. */
function defaultIdleState(): EditorViewState {
  return {
    status: 'idle',
    isDirty: false,
    currentNoteId: null,
    focusedBlockId: null,
    pendingNextFocus: null,
    isNoteEmpty: true,
    lastSaveError: null,
    lastSaveResult: null,
    blocks: [],
  };
}

/**
 * Mirror a DTO snapshot into EditorViewState.
 * Per PROP-EDIT-040: map per-variant fields; default absent fields.
 * RD-021: when snapshot carries `blocks`, mirror into state.blocks;
 * when absent, preserve currentBlocks (caller passes prior state.blocks).
 */
function mirrorSnapshot(
  snapshot: EditingSessionStateDto,
  currentBlocks: ReadonlyArray<DtoBlock>,
): EditorViewState {
  switch (snapshot.status) {
    case 'idle':
      return {
        status: 'idle',
        isDirty: false,
        currentNoteId: null,
        focusedBlockId: null,
        pendingNextFocus: null,
        isNoteEmpty: true,
        lastSaveError: null,
        lastSaveResult: null,
        blocks: [],
      };

    case 'editing':
      return {
        status: 'editing',
        isDirty: snapshot.isDirty,
        currentNoteId: snapshot.currentNoteId,
        focusedBlockId: snapshot.focusedBlockId,
        pendingNextFocus: null,
        isNoteEmpty: snapshot.isNoteEmpty,
        lastSaveError: null,
        lastSaveResult: snapshot.lastSaveResult,
        blocks: snapshot.blocks ?? currentBlocks,
      };

    case 'saving':
      return {
        status: 'saving',
        isDirty: true,
        currentNoteId: snapshot.currentNoteId,
        focusedBlockId: null,
        pendingNextFocus: null,
        isNoteEmpty: snapshot.isNoteEmpty,
        lastSaveError: null,
        lastSaveResult: null,
        blocks: snapshot.blocks ?? currentBlocks,
      };

    case 'switching':
      return {
        status: 'switching',
        isDirty: false,
        currentNoteId: snapshot.currentNoteId,
        focusedBlockId: null,
        pendingNextFocus: snapshot.pendingNextFocus,
        isNoteEmpty: snapshot.isNoteEmpty,
        lastSaveError: null,
        lastSaveResult: null,
        blocks: snapshot.blocks ?? currentBlocks,
      };

    case 'save-failed':
      return {
        status: 'save-failed',
        isDirty: true,
        currentNoteId: snapshot.currentNoteId,
        // PROP-EDIT-014: save-failed.priorFocusedBlockId → state.focusedBlockId
        focusedBlockId: snapshot.priorFocusedBlockId,
        pendingNextFocus: snapshot.pendingNextFocus,
        isNoteEmpty: snapshot.isNoteEmpty,
        lastSaveError: snapshot.lastSaveError,
        lastSaveResult: null,
        blocks: snapshot.blocks ?? currentBlocks,
      };

    default: {
      const _exhaustive: never = snapshot;
      void _exhaustive;
      return defaultIdleState();
    }
  }
}

/**
 * Produces a ReducerResult where the only state change is isDirty=true.
 * Used by all block-mutation actions (BlockContentEdited, BlockInserted, etc.)
 * which share identical reducer semantics: mark dirty, emit no commands.
 *
 * PROP-EDIT-007, PROP-EDIT-008
 */
function markDirty(state: EditorViewState): ReducerResult {
  return { state: { ...state, isDirty: true }, commands: [] };
}

/**
 * Produces a ReducerResult that passes state through unchanged with no commands.
 * Used by focus actions that are pure pass-throughs in the mirror reducer.
 */
function passThrough(state: EditorViewState): ReducerResult {
  return { state: { ...state }, commands: [] };
}

/**
 * PROP-EDIT-007, PROP-EDIT-008, PROP-EDIT-040
 * Mirror reducer: total over all (EditorAction.kind × EditingSessionStatus) pairs.
 * Returns { state: EditorViewState, commands: ReadonlyArray<EditorCommand> }.
 * Never throws. Pure: no side effects, no I/O, no mutation of inputs.
 */
export function editorReducer(
  state: EditorViewState,
  action: EditorAction
): ReducerResult {
  switch (action.kind) {
    // ── Block content mutation actions — set isDirty=true optimistically ───────
    // All 7 variants share identical reducer semantics: mark dirty, no commands.
    case 'BlockContentEdited':
    case 'BlockInserted':
    case 'BlockRemoved':
    case 'BlocksMerged':
    case 'BlockSplit':
    case 'BlockTypeChanged':
    case 'BlockMoved':
      return markDirty(state);

    // ── Focus actions ──────────────────────────────────────────────────────────
    // BlockFocused: same-note focus continues idle timer; no save commands (REQ-EDIT-017).
    // BlockBlurred: block-level blur; EditorPanel handles all-blocks blur separately.
    case 'BlockFocused':
    case 'BlockBlurred':
      return passThrough(state);

    case 'EditorBlurredAllBlocks': {
      // EC-EDIT-002: blur while saving/switching → no trigger-blur-save.
      if (state.status === 'saving' || state.status === 'switching') {
        return passThrough(state);
      }
      // While editing+isDirty: emit trigger-blur-save.
      if (state.status === 'editing' && state.isDirty) {
        const cmd: EditorCommand = {
          kind: 'trigger-blur-save',
          payload: {
            // NOTE: source is always 'capture-blur' for all-blocks-blur events.
            // The reducer infers source from action kind, per verification-architecture.md §2.
            source: 'capture-blur',
            noteId: state.currentNoteId ?? '',
            issuedAt: action.payload.issuedAt,
          },
        };
        return { state: { ...state }, commands: [cmd] };
      }
      return passThrough(state);
    }

    // ── Domain snapshot mirror ─────────────────────────────────────────────────
    case 'DomainSnapshotReceived': {
      const newState = mirrorSnapshot(action.snapshot, state.blocks);
      const commands: EditorCommand[] = [];

      // When transitioning to editing from saving (NoteFileSaved): emit cancel-idle-timer.
      // Per REQ-EDIT-013: saving→editing snapshot emits cancel-idle-timer.
      if (state.status === 'saving' && action.snapshot.status === 'editing') {
        commands.push({ kind: 'cancel-idle-timer' });
      }

      return { state: newState, commands };
    }

    // ── Save trigger actions ───────────────────────────────────────────────────
    // Each maps a UI-side action to a single outbound EditorCommand; state is
    // unchanged (domain snapshot will arrive via DomainSnapshotReceived).
    case 'TriggerIdleSaveRequested':
      // NOTE: source 'capture-idle' is inferred from action kind (verification-architecture.md §2).
      return {
        state: { ...state },
        commands: [{
          kind: 'trigger-idle-save',
          payload: { source: 'capture-idle', noteId: action.payload.noteId, issuedAt: action.payload.issuedAt },
        }],
      };

    case 'TriggerBlurSaveRequested':
      // NOTE: source 'capture-blur' is inferred from action kind (verification-architecture.md §2).
      return {
        state: { ...state },
        commands: [{
          kind: 'trigger-blur-save',
          payload: { source: 'capture-blur', noteId: action.payload.noteId, issuedAt: action.payload.issuedAt },
        }],
      };

    case 'RetrySaveRequested':
      return {
        state: { ...state },
        commands: [{
          kind: 'retry-save',
          payload: { noteId: action.payload.noteId, issuedAt: action.payload.issuedAt },
        }],
      };

    case 'DiscardCurrentSessionRequested':
      return {
        state: { ...state },
        commands: [{
          kind: 'discard-current-session',
          payload: { noteId: action.payload.noteId, issuedAt: action.payload.issuedAt },
        }],
      };

    case 'CancelSwitchRequested':
      return {
        state: { ...state },
        commands: [{
          kind: 'cancel-switch',
          payload: { noteId: action.payload.noteId, issuedAt: action.payload.issuedAt },
        }],
      };

    // ── Copy and new-note actions ──────────────────────────────────────────────
    case 'CopyNoteBodyRequested':
      return {
        state: { ...state },
        commands: [{
          kind: 'copy-note-body',
          payload: { noteId: action.payload.noteId, issuedAt: action.payload.issuedAt },
        }],
      };

    case 'RequestNewNoteRequested':
      return {
        state: { ...state },
        commands: [{
          kind: 'request-new-note',
          payload: { source: action.payload.source, issuedAt: action.payload.issuedAt },
        }],
      };

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return passThrough(state);
    }
  }
}
