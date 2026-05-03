// delete-note/pipeline.ts
// Full DeleteNote pipeline — orchestrates the 4-step workflow.
//
// REQ-DLN-001..013: Complete workflow.
// PROP-DLN-005: Clock.now() called at most once per invocation (0 on auth-error paths).
// PROP-DLN-011: Clock budget — 0 on authorization-error paths, 1 on all write paths.
//
// Outer curry: (deps, feed, inventory, editingCurrentNoteId).
// Inner argument: DeletionConfirmed (the user has already confirmed deletion).
// All errors reified as Err(DeletionError) — workflow never throws.
//
// Pipeline:
//   Step 1: authorizeDeletion (effectful shell — reads getNoteSnapshot)
//   Clock.now() — single call after authorization succeeds
//   Step 2: buildDeleteNoteRequested (pure construction)
//   emit: DeleteNoteRequested (public event)
//   Step 3: trashFile (async I/O — only await point)
//   Step 4: updateProjectionsAfterDelete (pure — on success or not-found graceful path)
//   Orchestrator: emit NoteFileDeleted or NoteDeletionFailed (public events)
//   Orchestrator: emit TagInventoryUpdated (internal) when removedTags.length > 0

import type { NoteId } from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileDeleted, NoteDeletionFailed } from "promptnotes-domain-types/shared/events";
import type { DeletionConfirmed, UpdatedProjection } from "promptnotes-domain-types/curate/stages";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagInventory } from "promptnotes-domain-types/curate/read-models";
import type { DeletionError } from "promptnotes-domain-types/shared/errors";
import type { TagInventoryUpdated, CurateInternalEvent } from "promptnotes-domain-types/curate/internal-events";
import type { PublicDomainEvent } from "promptnotes-domain-types/shared/events";
import type { Result } from "promptnotes-domain-types/util/result";
import type { DeleteNoteDeps, DeleteNote } from "./_deltas.js";

import { authorizeDeletion } from "./authorize-deletion.js";
import { buildDeleteNoteRequested } from "./build-delete-request.js";
import { updateProjectionsAfterDelete, removedTagsFromDeletion } from "./update-projections.js";
import { normalizeFsError } from "./normalize-fs-error.js";

export const deleteNote: DeleteNote = (
  deps: DeleteNoteDeps,
  feed: Feed,
  inventory: TagInventory,
  editingCurrentNoteId: NoteId | null,
) => {
  return async (
    confirmed: DeletionConfirmed,
  ): Promise<Result<UpdatedProjection, DeletionError>> => {
    // ── Step 1: authorizeDeletion (effectful shell — reads getNoteSnapshot) ──
    // Authorization errors short-circuit BEFORE Clock.now() — REQ-DLN-008.
    const authResult = authorizeDeletion(deps, feed, editingCurrentNoteId)(confirmed);

    if (!authResult.ok) {
      // DeletionErrorDelta is structurally compatible with DeletionError
      // (optional cause field per AuthorizationErrorDelta).
      return { ok: false, error: authResult.error as DeletionError };
    }

    const authorized = authResult.value;

    // ── Single Clock.now() call — after authorization succeeds ─────────────
    // PROP-DLN-005 / REQ-DLN-007 / REQ-DLN-008:
    //   Called exactly once per write-path invocation.
    //   Zero times on authorization-error paths (guarded above).
    const now = deps.clockNow();

    // ── Step 2: buildDeleteNoteRequested (pure construction) ──────────────
    const deleteRequested = buildDeleteNoteRequested(authorized, now);

    // Emit DeleteNoteRequested (public event) BEFORE trash attempt — REQ-DLN-001
    deps.publish(deleteRequested as PublicDomainEvent);

    // ── Step 3: trashFile (async I/O — the only await point) ─────────────
    // filePath sourced here rather than inside authorizeDeletion so that
    // AuthorizedDeletion stays a canonical type (no widening).
    // getNoteSnapshot returned non-null at authorization time; a concurrent
    // removal would produce a not-found FsError from trashFile, which the
    // graceful path below handles correctly.
    const filePath = deps.getNoteSnapshot(authorized.noteId)?.filePath ?? "";
    const trashResult = await deps.trashFile(filePath);

    // ── Step 3 result dispatch ────────────────────────────────────────────
    if (trashResult.ok || trashResult.error.kind === "not-found") {
      // Happy path (trashResult.ok) OR fs.not-found graceful path (REQ-DLN-005):
      // Treat as "file is deleted" — proceed with projection update.

      // Construct NoteFileDeleted event
      const noteFileDeleted: NoteFileDeleted = {
        kind: "note-file-deleted",
        noteId: authorized.noteId,
        frontmatter: authorized.frontmatter,
        occurredOn: now,
      };

      // ── Step 4: updateProjectionsAfterDelete (pure) ─────────────────
      // PROP-DLN-016: pure function — no port calls inside
      const updatedProjection = updateProjectionsAfterDelete(feed, inventory, noteFileDeleted);

      // Orchestrator: emit NoteFileDeleted (public event) — REQ-DLN-001
      deps.publish(noteFileDeleted as PublicDomainEvent);

      // Orchestrator: emit TagInventoryUpdated (internal) when removedTags.length > 0
      // REQ-DLN-010 / PROP-DLN-010
      const removedTags = removedTagsFromDeletion(inventory, authorized.frontmatter);
      if (removedTags.length > 0) {
        const tagInventoryUpdated: TagInventoryUpdated = {
          kind: "tag-inventory-updated",
          addedTags: [],
          removedTags,
          occurredOn: now,
        };
        deps.publishInternal(tagInventoryUpdated as CurateInternalEvent);
      }

      return { ok: true, value: updatedProjection };
    }

    // fs error path: permission, lock, disk-full, or unknown
    // REQ-DLN-004 / REQ-DLN-013
    const fsError = trashResult.error;
    const { reason, detail } = normalizeFsError(fsError);

    // Construct NoteDeletionFailed event
    const noteDeletionFailed: NoteDeletionFailed = {
      kind: "note-deletion-failed",
      noteId: authorized.noteId,
      reason,
      ...(detail !== undefined ? { detail } : {}),
      occurredOn: now,
    };

    // Orchestrator: emit NoteDeletionFailed (public event) — REQ-DLN-004
    deps.publish(noteDeletionFailed as PublicDomainEvent);

    // PROP-DLN-003: updateProjectionsAfterDelete NOT called on fs-error path.
    // Feed and TagInventory remain unchanged — state consistency invariant.

    const error: DeletionError = { kind: "fs", reason: fsError };
    return { ok: false, error };
  };
};
