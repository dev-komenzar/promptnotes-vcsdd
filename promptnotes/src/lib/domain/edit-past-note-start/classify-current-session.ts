// edit-past-note-start/classify-current-session.ts
// Step 1: Pure classification of the current editing session.
//
// REQ-EPNS-007: Pure function — no ports, no I/O, no Clock.
//   Signature: (EditingSessionState, Note | null) → CurrentSessionDecision
// PROP-EPNS-001: Referential transparency.
// PROP-EPNS-002: IdleState → no-current.
// PROP-EPNS-003: EditingState → empty | dirty (based on isEmpty).
// PROP-EPNS-004: SaveFailedState → dirty.

import type { Note } from "promptnotes-domain-types/shared/note";
import type { EditingSessionState } from "promptnotes-domain-types/capture/states";
import type { CurrentSessionDecision } from "promptnotes-domain-types/capture/stages";

/**
 * Pure classification of the current editing session.
 * No ports, no I/O — just pattern matching on state and note emptiness.
 *
 * Preconditions:
 * - SavingState / SwitchingState → throws (caller must guard)
 * - EditingState / SaveFailedState with null currentNote → throws (caller bug)
 */
export function classifyCurrentSession(
  state: EditingSessionState,
  currentNote: Note | null,
): CurrentSessionDecision {
  switch (state.status) {
    case "idle":
      return { kind: "no-current" };

    case "editing": {
      if (currentNote === null) {
        throw new Error(
          "classifyCurrentSession: currentNote must not be null when status is 'editing'"
        );
      }
      if (isEmpty(currentNote)) {
        return { kind: "empty", noteId: state.currentNoteId };
      }
      return {
        kind: "dirty",
        noteId: state.currentNoteId,
        note: currentNote,
      };
    }

    case "save-failed": {
      if (currentNote === null) {
        throw new Error(
          "classifyCurrentSession: currentNote must not be null when status is 'save-failed'"
        );
      }
      return {
        kind: "dirty",
        noteId: state.currentNoteId,
        note: currentNote,
      };
    }

    case "saving":
    case "switching":
      throw new Error(
        `classifyCurrentSession called with invalid state: ${state.status}. ` +
        `Caller must guard against saving/switching states.`
      );
  }
}

/** isEmpty: body is empty or whitespace-only. Matches NoteOps.isEmpty semantics. */
function isEmpty(note: Note): boolean {
  const raw = note.body as unknown as string;
  return raw.trim().length === 0;
}
