// delete-note/build-delete-request.ts
// Step 2: Pure construction of DeleteNoteRequested.
//
// REQ-DLN-007: occurredOn threading invariant
//
// PROP-DLN-005: occurredOn threading — buildDeleteNoteRequested threads now correctly
//
// Delta 3: BuildDeleteNoteRequested is (authorized: AuthorizedDeletion, now: Timestamp) => DeleteNoteRequested
//   Pure function. No deps curry. No clock call. Uses pre-obtained now from orchestrator.

import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { AuthorizedDeletion } from "promptnotes-domain-types/curate/stages";
import type { DeleteNoteRequested } from "promptnotes-domain-types/shared/events";
import type { BuildDeleteNoteRequested } from "./_deltas.js";

// ── buildDeleteNoteRequested ──────────────────────────────────────────────────
// Pure construction: same inputs always produce the same DeleteNoteRequested.
// Does NOT call clockNow — uses the pre-obtained now from the orchestrator's
// single Clock.now() call (per REQ-DLN-008 Clock budget invariant).

export const buildDeleteNoteRequested: BuildDeleteNoteRequested = (
  authorized: AuthorizedDeletion,
  now: Timestamp,
): DeleteNoteRequested => {
  return {
    kind: "delete-note-requested",
    noteId: authorized.noteId,
    occurredOn: now,
  };
};
