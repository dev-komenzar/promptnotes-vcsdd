// delete-note/authorize-deletion.ts
// Step 1 (effectful shell): Authorization wrapper for DeleteNote.
//
// Calls deps.getNoteSnapshot to obtain the snapshot, then delegates
// to the pure core (authorizeDeletionPure).
//
// REQ-DLN-002: Authorization Error — editing-in-progress
// REQ-DLN-003: Authorization Error — note not in Feed (+ snapshot-missing variant)
// REQ-DLN-006: frontmatter sourcing invariant — Curate snapshot at authorization time

import type { NoteId } from "promptnotes-domain-types/shared/value-objects";
import type { AuthorizedDeletion, DeletionConfirmed } from "promptnotes-domain-types/curate/stages";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { CurateDeps } from "promptnotes-domain-types/curate/ports";
import type { Result } from "promptnotes-domain-types/util/result";
import type { DeletionErrorDelta } from "./_deltas.js";
import { authorizeDeletionPure } from "./authorize-deletion-pure.js";

// ── authorizeDeletion ─────────────────────────────────────────────────────────
// Effectful shell: reads deps.getNoteSnapshot (in-memory read port), then
// delegates to the pure core. Synchronous.
//
// Canonical shape from verification-architecture.md:
//   (deps, feed, editingCurrentNoteId) => (confirmed) => Result<AuthorizedDeletion, DeletionError>

export function authorizeDeletion(
  deps: CurateDeps,
  feed: Feed,
  editingCurrentNoteId: NoteId | null,
): (confirmed: DeletionConfirmed) => Result<AuthorizedDeletion, DeletionErrorDelta> {
  return (confirmed: DeletionConfirmed): Result<AuthorizedDeletion, DeletionErrorDelta> => {
    const snapshot = deps.getNoteSnapshot(confirmed.noteId);
    return authorizeDeletionPure(confirmed.noteId, editingCurrentNoteId, feed, snapshot);
  };
}
