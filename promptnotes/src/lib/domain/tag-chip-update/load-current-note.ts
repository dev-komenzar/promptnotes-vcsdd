// tag-chip-update/load-current-note.ts
// Step 1: Load the current Note from the Curate snapshot store.
//
// REQ-TCU-005: Returns Err { kind: 'not-found' } when getNoteSnapshot returns null.
// REQ-TCU-006: Returns SaveErrorDelta with cause 'hydration-failed' when hydrateNote fails.
// Clock.now() is NOT called on any error path.

import type { Note } from "promptnotes-domain-types/shared/note";
import type { NoteFileSnapshot, HydrationFailureReason } from "promptnotes-domain-types/shared/snapshots";
import type { NoteId, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { PublicDomainEvent } from "promptnotes-domain-types/shared/events";
import type { TagChipCommand } from "promptnotes-domain-types/curate/stages";
import type { Result } from "promptnotes-domain-types/util/result";
import type { SaveErrorDelta } from "./_deltas.js";

// Minimal port slice needed by this step — avoids pulling full TagChipUpdateDeps.
type LoadCurrentNoteDeps = {
  readonly getNoteSnapshot: (noteId: NoteId) => NoteFileSnapshot | null;
  readonly hydrateNote: (snapshot: NoteFileSnapshot) => Result<Note, HydrationFailureReason>;
  readonly clockNow: () => Timestamp;
  readonly publish: (event: PublicDomainEvent) => void;
};

// The 'not-found' error is internal to this step; the pipeline maps it to
// the SaveErrorDelta shape before surfacing to callers.
type NotFoundError = { kind: "not-found" };
type LoadError = NotFoundError | SaveErrorDelta;

export function loadCurrentNote(
  deps: LoadCurrentNoteDeps,
): (command: TagChipCommand) => Result<Note, LoadError> {
  return (command: TagChipCommand): Result<Note, LoadError> => {
    const snapshot = deps.getNoteSnapshot(command.noteId);

    if (snapshot === null) {
      return { ok: false, error: { kind: "not-found" } };
    }

    const hydrationResult = deps.hydrateNote(snapshot);

    if (!hydrationResult.ok) {
      const error: SaveErrorDelta = {
        kind: "validation",
        reason: {
          kind: "invariant-violated",
          cause: "hydration-failed",
          detail: `hydrateNote failed for noteId=${String(command.noteId)}`,
        },
      };
      return { ok: false, error };
    }

    return { ok: true, value: hydrationResult.value };
  };
}
