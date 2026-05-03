/**
 * _deltas.ts — Contract delta type aliases for delete-note implementation.
 *
 * The canonical `docs/domain/code/ts/src/**` files do not yet implement the
 * deltas declared in behavioral-spec.md Revision 2. This file mirrors those
 * delta declarations so that implementation files can reference them without
 * importing from the test helper.
 *
 * Delta 1: TrashFile port — NEW export in curate/ports.ts
 * Delta 2: DeleteNoteDeps — NEW export in curate/ports.ts
 * Delta 3: BuildDeleteNoteRequested — canonical signature restated (pure, no widening)
 * Delta 4: DeleteNote outer curry takes (deps, feed, inventory, editingCurrentNoteId)
 * Delta 5: Path resolution via NoteFileSnapshot.filePath (no new port)
 * Delta 6: AuthorizationError { kind: 'not-in-feed' } extended with optional cause
 */

import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { NoteId, Tag, Timestamp, Frontmatter } from "promptnotes-domain-types/shared/value-objects";
import type { FsError, DeletionError, AuthorizationError } from "promptnotes-domain-types/shared/errors";
import type {
  DeleteNoteRequested,
  NoteFileDeleted,
  NoteDeletionFailed,
  PublicDomainEvent,
} from "promptnotes-domain-types/shared/events";
import type {
  CurateInternalEvent,
  TagInventoryUpdated,
} from "promptnotes-domain-types/curate/internal-events";
import type { CurateDeps } from "promptnotes-domain-types/curate/ports";
import type {
  DeletionConfirmed,
  AuthorizedDeletion,
  UpdatedProjection,
} from "promptnotes-domain-types/curate/stages";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagInventory } from "promptnotes-domain-types/curate/read-models";
import type { Result } from "promptnotes-domain-types/util/result";

// ── Delta 1: TrashFile port ──────────────────────────────────────────────────
/** Moves the file at the given path to the OS trash. Async.
 *  On success: returns Ok(void).
 *  On failure: returns Err(FsError).
 *  FsError variants in scope: permission, lock, not-found, unknown, disk-full.
 *  disk-full is normalized to NoteDeletionFailureReason 'unknown' by the orchestrator.
 *  Analogous to WriteMarkdown declared for TagChipUpdate. */
export type TrashFile = (filePath: string) => Promise<Result<void, FsError>>;

// ── Delta 2: GetAllSnapshots and EventBusPublishInternal (reused from TCU) ───
export type GetAllSnapshots = () => readonly NoteFileSnapshot[];
export type EventBusPublishInternal = (event: CurateInternalEvent) => void;

// ── Delta 2: DeleteNoteDeps ──────────────────────────────────────────────────
/** Superset of CurateDeps required by the DeleteNote workflow.
 *  Structural guarantee: does NOT include any editor-buffer key
 *  (no getEditorBuffer, no editingState). The only Capture-side input is
 *  the read-only editingCurrentNoteId: NoteId | null outer-curry argument.
 *  GetAllSnapshots and EventBusPublishInternal reused from TagChipUpdate (TCU originator). */
export type DeleteNoteDeps = CurateDeps & {
  /** OS trash write port. Async. NEW for this workflow. */
  readonly trashFile: TrashFile;
  /** Full snapshot collection (structural consistency with TagChipUpdateDeps;
   *  not called in current implementation). */
  readonly getAllSnapshots: GetAllSnapshots;
  /** Internal event bus for CurateInternalEvent (TagInventoryUpdated).
   *  Called by the orchestrator after Step 4 returns; NOT by updateProjectionsAfterDelete. */
  readonly publishInternal: EventBusPublishInternal;
};

// ── Delta 3: BuildDeleteNoteRequested ────────────────────────────────────────
/** Pure construction: (authorized: AuthorizedDeletion, now: Timestamp) => DeleteNoteRequested.
 *  No deps curry. Uses pre-obtained now from orchestrator's single Clock.now() call.
 *  Matches the Delta 5 pattern established by TagChipUpdate's BuildTagChipSaveRequest. */
export type BuildDeleteNoteRequested = (
  authorized: AuthorizedDeletion,
  now: Timestamp,
) => DeleteNoteRequested;

// ── Delta 4: DeleteNote outer curry ─────────────────────────────────────────
/** Implementation signature: outer curry takes (deps, feed, inventory, editingCurrentNoteId).
 *  Inner argument is the confirmed command (DeletionConfirmed), not the pre-authorized stage.
 *  Keeps authorization logic encapsulated within the workflow.
 *  Returns Promise<Result<UpdatedProjection, DeletionError>>. */
export type DeleteNote = (
  deps: DeleteNoteDeps,
  feed: Feed,
  inventory: TagInventory,
  editingCurrentNoteId: NoteId | null,
) => (
  confirmed: DeletionConfirmed,
) => Promise<Result<UpdatedProjection, DeletionError>>;

// ── Delta 6: AuthorizationError extended with optional cause field ───────────
/** FIND-SPEC-DLN-005: Extends the canonical not-in-feed variant with optional cause
 *  for Feed/snapshot inconsistency diagnostic signal. The discriminator remains
 *  'not-in-feed' for exhaustiveness compatibility. */
export type AuthorizationErrorDelta =
  | { kind: "editing-in-progress"; noteId: NoteId }
  | { kind: "not-in-feed"; noteId: NoteId; cause?: "snapshot-missing" };

export type DeletionErrorDelta =
  | { kind: "authorization"; reason: AuthorizationErrorDelta }
  | { kind: "fs"; reason: FsError };

// ── UpdateProjectionsAfterDelete (pure core — no port calls) ─────────────────
/** Pure function: (feed, inventory, event) => UpdatedProjection.
 *  No deps curry. No port invocations. Sources now from event.occurredOn.
 *  Called on: happy path (trash succeeds) and not-found graceful path.
 *  NOT called on: permission, lock, disk-full, unknown fs-error paths. */
export type UpdateProjectionsAfterDelete = (
  feed: Feed,
  inventory: TagInventory,
  event: NoteFileDeleted,
) => UpdatedProjection;

// ── AuthorizeDeletionPure (pure core — proof target) ─────────────────────────
/** Pure internal helper. Performs the authorization decision given
 *  the concrete data it needs (no port calls).
 *  Three-precondition guard (FIND-SPEC-DLN-003):
 *    (a) editingCurrentNoteId === noteId → Err({ kind: 'editing-in-progress' })
 *    (b) !Feed.hasNote(feed, noteId)     → Err({ kind: 'not-in-feed' })
 *    (c) snapshot === null               → Err({ kind: 'not-in-feed', cause: 'snapshot-missing' })
 *    (d) all three preconditions hold    → Ok(AuthorizedDeletion { frontmatter: snapshot.frontmatter }) */
export type AuthorizeDeletionPure = (
  noteId: NoteId,
  editingCurrentNoteId: NoteId | null,
  feed: Feed,
  snapshot: NoteFileSnapshot | null,
) => Result<AuthorizedDeletion, DeletionErrorDelta>;

// Re-export canonical types for convenience
export type {
  NoteId,
  Tag,
  Timestamp,
  Frontmatter,
  FsError,
  DeletionError,
  AuthorizationError,
  DeleteNoteRequested,
  NoteFileDeleted,
  NoteDeletionFailed,
  PublicDomainEvent,
  CurateInternalEvent,
  TagInventoryUpdated,
  CurateDeps,
  DeletionConfirmed,
  AuthorizedDeletion,
  UpdatedProjection,
  Feed,
  TagInventory,
  NoteFileSnapshot,
  Result,
};
