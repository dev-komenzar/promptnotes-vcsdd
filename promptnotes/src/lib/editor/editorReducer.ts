/**
 * editorReducer.ts — pure state reducer for the ui-editor feature
 *
 * Pure core module: deterministic, no side effects, no forbidden APIs.
 * See verification-architecture.md §2 for the canonical purity-audit pattern.
 *
 * Contract:
 * - Total over all (EditorAction.kind × EditingSessionStatus) = 55 cells.
 * - Never throws in production.
 * - Returns { state: EditorViewState, commands: ReadonlyArray<EditorCommand> }.
 * - state.status is always one of the 5 EditingSessionStatus values.
 * - commands[i].kind is always one of the 9 EditorCommand variants.
 */

import type { EditorViewState, EditorAction, EditorCommand } from './types.js';
import { canCopy } from './editorPredicates.js';

/** Returns the current note id, or '' when null (used by retry/discard/cancel). */
function currentNoteIdOrEmpty(state: EditorViewState): string {
  return state.currentNoteId ?? '';
}

/** Return type of editorReducer: updated view state plus zero or more side-effect commands. */
export type ReducerResult = {
  state: EditorViewState;
  commands: ReadonlyArray<EditorCommand>;
};

/**
 * REQ-EDIT-001..REQ-EDIT-019, REQ-EDIT-021..REQ-EDIT-026
 * Mirror reducer: reflects EditorAction inputs into EditorViewState outputs
 * and emits EditorCommand side-effect signals for the impure shell.
 */
export function editorReducer(
  state: EditorViewState,
  action: EditorAction
): ReducerResult {
  switch (action.kind) {
    case 'NoteBodyEdited': {
      // REQ-EDIT-001: User keystroke — update body and set isDirty=true when editing.
      // EC-EDIT-003: Also fires in save-failed state (textarea stays editable per REQ-EDIT-013).
      // In idle/saving/switching, the action is unexpected but must not throw; return unchanged.
      if (state.status !== 'editing' && state.status !== 'save-failed') {
        return { state, commands: [] };
      }
      const nextState: EditorViewState = {
        ...state,
        body: action.payload.newBody,
        isDirty: true,
      };
      const commands: EditorCommand[] = [
        {
          kind: 'edit-note-body',
          payload: {
            noteId: action.payload.noteId,
            newBody: action.payload.newBody,
            issuedAt: action.payload.issuedAt,
            dirty: true,
          },
        },
      ];
      return { state: nextState, commands };
    }

    case 'BlurEvent': {
      // REQ-EDIT-006, REQ-EDIT-007: Textarea blur while editing and isDirty → trigger blur save.
      // REQ-EDIT-008, EC-EDIT-002: In saving, ignore blur (guard against double-fire).
      if (state.status === 'saving') {
        // Already saving — do not emit any commands; stay in saving
        return { state, commands: [] };
      }
      if (state.status === 'editing' && state.isDirty) {
        const nextState: EditorViewState = {
          ...state,
          status: 'saving',
        };
        const commands: EditorCommand[] = [
          {
            kind: 'trigger-blur-save',
            payload: {
              source: 'capture-blur',
              noteId: action.payload.noteId,
              body: action.payload.body,
              issuedAt: action.payload.issuedAt,
            },
          },
        ];
        return { state: nextState, commands };
      }
      // editing + isDirty=false, or any other status: no-op
      return { state, commands: [] };
    }

    case 'IdleTimerFired': {
      // REQ-EDIT-004: Idle debounce timer fired — trigger idle save when editing and dirty.
      if (state.status === 'editing' && state.isDirty) {
        const nextState: EditorViewState = {
          ...state,
          status: 'saving',
        };
        const commands: EditorCommand[] = [
          {
            kind: 'trigger-idle-save',
            payload: {
              source: 'capture-idle',
              noteId: action.payload.noteId,
              body: action.payload.body,
              issuedAt: action.payload.issuedAt,
            },
          },
        ];
        return { state: nextState, commands };
      }
      // Not in editing+dirty — no-op
      return { state, commands: [] };
    }

    case 'DomainSnapshotReceived': {
      // REQ-EDIT-014, PROP-EDIT-040: Mirror the snapshot fields 1:1 into view state.
      // No commands emitted; the shell reconciles by re-rendering.
      const { snapshot } = action;
      const nextState: EditorViewState = {
        ...state,
        status: snapshot.status,
        isDirty: snapshot.isDirty,
        currentNoteId: snapshot.currentNoteId,
        pendingNextNoteId: snapshot.pendingNextNoteId,
        lastError: snapshot.lastError,
        body: snapshot.body,
      };
      return { state: nextState, commands: [] };
    }

    case 'NoteFileSaved': {
      // REQ-EDIT-002, PROP-EDIT-010, CRIT-008: Successful save — clear dirty, cancel timer.
      // Transition saving → editing.
      const nextState: EditorViewState = {
        ...state,
        status: 'editing',
        isDirty: false,
        lastError: null,
      };
      const commands: EditorCommand[] = [
        { kind: 'cancel-idle-timer' },
      ];
      return { state: nextState, commands };
    }

    case 'NoteSaveFailed': {
      // REQ-EDIT-002, REQ-EDIT-013: Save failure — transition to save-failed, retain isDirty.
      const nextState: EditorViewState = {
        ...state,
        status: 'save-failed',
        lastError: action.payload.error,
      };
      return { state: nextState, commands: [] };
    }

    case 'RetryClicked': {
      // REQ-EDIT-017: Retry save from save-failed state.
      if (state.status !== 'save-failed') {
        return { state, commands: [] };
      }
      const noteId = currentNoteIdOrEmpty(state);
      const nextState: EditorViewState = {
        ...state,
        status: 'saving',
      };
      const commands: EditorCommand[] = [
        {
          kind: 'retry-save',
          payload: {
            noteId,
            body: state.body,
            issuedAt: '',
          },
        },
      ];
      return { state: nextState, commands };
    }

    case 'DiscardClicked': {
      // REQ-EDIT-018: Discard current session from save-failed state.
      if (state.status !== 'save-failed') {
        return { state, commands: [] };
      }
      const noteId = currentNoteIdOrEmpty(state);
      const commands: EditorCommand[] = [
        {
          kind: 'discard-current-session',
          payload: { noteId },
        },
      ];
      return { state, commands };
    }

    case 'CancelClicked': {
      // REQ-EDIT-019: Cancel switch from save-failed state (banner Cancel button).
      // Also handles switching state for symmetry.
      if (state.status !== 'save-failed' && state.status !== 'switching') {
        return { state, commands: [] };
      }
      const noteId = currentNoteIdOrEmpty(state);
      const commands: EditorCommand[] = [
        {
          kind: 'cancel-switch',
          payload: { noteId },
        },
      ];
      return { state, commands };
    }

    case 'CopyClicked': {
      // REQ-EDIT-021: Copy body to clipboard — only when copy is allowed.
      if (!canCopy(action.payload.body, state.status)) {
        return { state, commands: [] };
      }
      const commands: EditorCommand[] = [
        {
          kind: 'copy-note-body',
          payload: {
            noteId: action.payload.noteId,
            body: action.payload.body,
          },
        },
      ];
      return { state, commands };
    }

    case 'NewNoteClicked': {
      // REQ-EDIT-023, REQ-EDIT-024: New Note request — pass source through unmodified.
      const commands: EditorCommand[] = [
        {
          kind: 'request-new-note',
          payload: {
            source: action.payload.source,
            issuedAt: action.payload.issuedAt,
          },
        },
      ];
      return { state, commands };
    }

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return { state, commands: [] };
    }
  }
}
