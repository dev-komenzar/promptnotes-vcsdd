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

import type { EditorViewState, EditorAction, EditorCommand, EditingSessionStateDto } from './types.js';

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
  };
}

/**
 * Mirror a DTO snapshot into EditorViewState.
 * Per PROP-EDIT-040: map per-variant fields; default absent fields.
 */
function mirrorSnapshot(snapshot: EditingSessionStateDto): EditorViewState {
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
      };

    default: {
      const _exhaustive: never = snapshot;
      void _exhaustive;
      return defaultIdleState();
    }
  }
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
    case 'BlockContentEdited':
      return {
        state: { ...state, isDirty: true },
        commands: [],
      };

    case 'BlockInserted':
      return {
        state: { ...state, isDirty: true },
        commands: [],
      };

    case 'BlockRemoved':
      return {
        state: { ...state, isDirty: true },
        commands: [],
      };

    case 'BlocksMerged':
      return {
        state: { ...state, isDirty: true },
        commands: [],
      };

    case 'BlockSplit':
      return {
        state: { ...state, isDirty: true },
        commands: [],
      };

    case 'BlockTypeChanged':
      return {
        state: { ...state, isDirty: true },
        commands: [],
      };

    case 'BlockMoved':
      return {
        state: { ...state, isDirty: true },
        commands: [],
      };

    // ── Focus actions ──────────────────────────────────────────────────────────
    case 'BlockFocused':
      // Same-note focus continues idle timer; no save commands emitted.
      // Per REQ-EDIT-017: status stays 'editing', no save commands.
      return {
        state: { ...state },
        commands: [],
      };

    case 'BlockBlurred':
      return {
        state: { ...state },
        commands: [],
      };

    case 'EditorBlurredAllBlocks': {
      // Per EC-EDIT-002: blur while saving/switching → no trigger-blur-save.
      if (state.status === 'saving' || state.status === 'switching') {
        return { state: { ...state }, commands: [] };
      }
      // While editing+isDirty: emit trigger-blur-save.
      if (state.status === 'editing' && state.isDirty) {
        const cmd: EditorCommand = {
          kind: 'trigger-blur-save',
          payload: {
            source: 'capture-blur',
            noteId: state.currentNoteId ?? '',
            issuedAt: action.payload.issuedAt,
          },
        };
        return { state: { ...state }, commands: [cmd] };
      }
      return { state: { ...state }, commands: [] };
    }

    // ── Domain snapshot mirror ─────────────────────────────────────────────────
    case 'DomainSnapshotReceived': {
      const newState = mirrorSnapshot(action.snapshot);
      const commands: EditorCommand[] = [];

      // When transitioning to editing from saving (NoteFileSaved): emit cancel-idle-timer.
      // Per REQ-EDIT-013: saving→editing snapshot emits cancel-idle-timer.
      if (state.status === 'saving' && action.snapshot.status === 'editing') {
        commands.push({ kind: 'cancel-idle-timer' });
      }

      return { state: newState, commands };
    }

    // ── Save trigger actions ───────────────────────────────────────────────────
    case 'TriggerIdleSaveRequested': {
      const cmd: EditorCommand = {
        kind: 'trigger-idle-save',
        payload: {
          source: 'capture-idle',
          noteId: action.payload.noteId,
          issuedAt: action.payload.issuedAt,
        },
      };
      return { state: { ...state }, commands: [cmd] };
    }

    case 'TriggerBlurSaveRequested': {
      const cmd: EditorCommand = {
        kind: 'trigger-blur-save',
        payload: {
          source: 'capture-blur',
          noteId: action.payload.noteId,
          issuedAt: action.payload.issuedAt,
        },
      };
      return { state: { ...state }, commands: [cmd] };
    }

    case 'RetrySaveRequested': {
      const cmd: EditorCommand = {
        kind: 'retry-save',
        payload: {
          noteId: action.payload.noteId,
          issuedAt: action.payload.issuedAt,
        },
      };
      return { state: { ...state }, commands: [cmd] };
    }

    case 'DiscardCurrentSessionRequested': {
      const cmd: EditorCommand = {
        kind: 'discard-current-session',
        payload: {
          noteId: action.payload.noteId,
          issuedAt: action.payload.issuedAt,
        },
      };
      return { state: { ...state }, commands: [cmd] };
    }

    case 'CancelSwitchRequested': {
      const cmd: EditorCommand = {
        kind: 'cancel-switch',
        payload: {
          noteId: action.payload.noteId,
          issuedAt: action.payload.issuedAt,
        },
      };
      return { state: { ...state }, commands: [cmd] };
    }

    // ── Copy and new-note actions ──────────────────────────────────────────────
    case 'CopyNoteBodyRequested': {
      const cmd: EditorCommand = {
        kind: 'copy-note-body',
        payload: {
          noteId: action.payload.noteId,
          issuedAt: action.payload.issuedAt,
        },
      };
      return { state: { ...state }, commands: [cmd] };
    }

    case 'RequestNewNoteRequested': {
      const cmd: EditorCommand = {
        kind: 'request-new-note',
        payload: {
          source: action.payload.source,
          issuedAt: action.payload.issuedAt,
        },
      };
      return { state: { ...state }, commands: [cmd] };
    }

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return { state: { ...state }, commands: [] };
    }
  }
}
