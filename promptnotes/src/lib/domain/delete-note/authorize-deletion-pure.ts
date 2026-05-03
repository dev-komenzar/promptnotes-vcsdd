// delete-note/authorize-deletion-pure.ts
// Step 1 (pure core): Authorization decision for DeleteNote.
//
// REQ-DLN-002: Authorization Error — editing-in-progress
// REQ-DLN-003: Authorization Error — note not in Feed (+ snapshot-missing variant)
// REQ-DLN-006: frontmatter sourcing invariant — Curate snapshot at authorization time
//
// PROP-DLN-001: authorizeDeletionPure is pure (referentially transparent)
// PROP-DLN-002: authorization rules — four-branch enumeration
//   (a) editingCurrentNoteId === noteId → Err({ kind: 'editing-in-progress' })
//   (b) !Feed.hasNote(feed, noteId)     → Err({ kind: 'not-in-feed' })
//   (c) snapshot === null, Feed.hasNote true → Err({ kind: 'not-in-feed', cause: 'snapshot-missing' })
//   (d) all pass → Ok(AuthorizedDeletion { frontmatter: snapshot.frontmatter })
// PROP-DLN-004: AuthorizedDeletion.frontmatter === snapshot.frontmatter

import type { NoteId } from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { AuthorizedDeletion } from "promptnotes-domain-types/curate/stages";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { Result } from "promptnotes-domain-types/util/result";
import type { AuthorizeDeletionPure, DeletionErrorDelta } from "./_deltas.js";

// ── Feed.hasNote inline implementation ───────────────────────────────────────
// The canonical FeedOps interface has no implementation in this phase.

function feedHasNote(feed: Feed, noteId: NoteId): boolean {
  return feed.noteRefs.some((ref) => String(ref) === String(noteId));
}

// ── authorizeDeletionPure ─────────────────────────────────────────────────────
// Pure function: deterministic given fixed inputs, no side effects, no port calls.
// Three-precondition guard per FIND-SPEC-DLN-003:
//   (a) editing-in-progress guard (takes priority)
//   (b) not-in-feed guard (Feed.hasNote returns false)
//   (c) snapshot-missing guard (Feed.hasNote true but snapshot null)
//   (d) all pass → Ok(AuthorizedDeletion)

export const authorizeDeletionPure: AuthorizeDeletionPure = (
  noteId: NoteId,
  editingCurrentNoteId: NoteId | null,
  feed: Feed,
  snapshot: NoteFileSnapshot | null,
): Result<AuthorizedDeletion, DeletionErrorDelta> => {
  // Branch (a): editing-in-progress — fires before Feed/snapshot checks
  if (editingCurrentNoteId !== null && String(editingCurrentNoteId) === String(noteId)) {
    const error: DeletionErrorDelta = {
      kind: "authorization",
      reason: { kind: "editing-in-progress", noteId },
    };
    return { ok: false, error };
  }

  // Branch (b): note not in Feed
  if (!feedHasNote(feed, noteId)) {
    const error: DeletionErrorDelta = {
      kind: "authorization",
      reason: { kind: "not-in-feed", noteId },
    };
    return { ok: false, error };
  }

  // Branch (c): Feed.hasNote returns true but snapshot is null (Feed/snapshot inconsistency)
  if (snapshot === null) {
    const error: DeletionErrorDelta = {
      kind: "authorization",
      reason: { kind: "not-in-feed", noteId, cause: "snapshot-missing" },
    };
    return { ok: false, error };
  }

  // Branch (d): all three preconditions hold — authorization succeeds
  // PROP-DLN-004: frontmatter sourced from snapshot (Curate snapshot, not editor buffer)
  const authorized: AuthorizedDeletion = {
    kind: "AuthorizedDeletion",
    noteId,
    frontmatter: snapshot.frontmatter,
  };
  return { ok: true, value: authorized };
};
