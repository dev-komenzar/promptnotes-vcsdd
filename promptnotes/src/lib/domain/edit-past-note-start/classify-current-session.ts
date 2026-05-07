// edit-past-note-start/classify-current-session.ts
// Step 1: Pure classification of the current editing session.
//
// REQ-EPNS-007: Pure function — no ports, no I/O, no Clock.
//   Signature: (EditingSessionState, BlockFocusRequest, Note | null) → CurrentSessionDecision
// PROP-EPNS-001: Referential transparency.
// PROP-EPNS-002: IdleState → no-current.
// PROP-EPNS-003: EditingState → same-note | empty | dirty (based on noteId match + isEmpty).
// PROP-EPNS-004: EditingState|SaveFailedState + same-noteId → same-note.
//
// FIND-EPNS-S2-P3-006: isEmptyNote moved to is-empty-note.ts (canonical shared helper).

import type { Note } from "promptnotes-domain-types/shared/note";
import type { EditingSessionState } from "promptnotes-domain-types/capture/states";
import type { BlockFocusRequest, CurrentSessionDecision } from "promptnotes-domain-types/capture/stages";
import { isEmptyNote } from "./is-empty-note.js";

/**
 * Pure classification of the current editing session.
 * No ports, no I/O — deterministic over (state, request, currentNote).
 *
 * Preconditions:
 * - SavingState / SwitchingState → throws (PC-003: caller must guard)
 * - EditingState / SaveFailedState with null currentNote → throws (PC-004: caller bug)
 */
export function classifyCurrentSession(
  state: EditingSessionState,
  request: BlockFocusRequest,
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
      // Same-note detection: request targets the currently loaded note
      if (request.noteId === state.currentNoteId) {
        return { kind: "same-note", noteId: state.currentNoteId, note: currentNote };
      }
      // Cross-note: classify by isEmpty
      if (isEmptyNote(currentNote)) {
        return { kind: "empty", noteId: state.currentNoteId };
      }
      return { kind: "dirty", noteId: state.currentNoteId, note: currentNote };
    }

    case "save-failed": {
      if (currentNote === null) {
        throw new Error(
          "classifyCurrentSession: currentNote must not be null when status is 'save-failed'"
        );
      }
      // Same-note detection (REQ-EPNS-005)
      if (request.noteId === state.currentNoteId) {
        return { kind: "same-note", noteId: state.currentNoteId, note: currentNote };
      }
      // Cross-note on SaveFailedState is always dirty — never empty.
      // REQ-EPNS-007: isEmpty is NOT checked for save-failed cross-note.
      // A note in save-failed was previously dirty; discarding via 'empty' path
      // would silently drop content the user attempted to save.
      return { kind: "dirty", noteId: state.currentNoteId, note: currentNote };
    }

    case "saving":
    case "switching":
      throw new Error(
        `classifyCurrentSession called with invalid state: ${state.status}. ` +
        `Caller must guard against saving/switching states.`
      );
  }
}

// isEmptyNote is now imported from ./is-empty-note.ts (FIND-EPNS-S2-P3-006).
// See is-empty-note.ts for the canonical NoteOps.isEmpty definition.
