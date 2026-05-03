/**
 * _deltas.ts — Contract delta type aliases for delete-note implementation.
 *
 * The canonical `docs/domain/code/ts/src/**` files do not yet cover the types
 * declared in behavioral-spec.md Revision 2. This file fills those gaps so
 * implementation files can import from here rather than from the test helper.
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

// ── TrashFile port ────────────────────────────────────────────────────────────
/** Moves the file at the given path to the OS trash.
 *  Ok(void) on success; Err(FsError) on failure.
 *  disk-full is normalized to NoteDeletionFailureReason 'unknown' by the orchestrator. */
export type TrashFile = (filePath: string) => Promise<Result<void, FsError>>;

// ── Shared port types (structural parity with TagChipUpdateDeps) ──────────────
export type GetAllSnapshots = () => readonly NoteFileSnapshot[];
export type EventBusPublishInternal = (event: CurateInternalEvent) => void;

// ── DeleteNoteDeps ────────────────────────────────────────────────────────────
/** Superset of CurateDeps required by the DeleteNote workflow.
 *  No editor-buffer keys (getEditorBuffer, editingState) — those stay in Capture.
 *  editingCurrentNoteId is an outer-curry argument, not a port. */
export type DeleteNoteDeps = CurateDeps & {
  /** OS trash write port. Async. */
  readonly trashFile: TrashFile;
  /** Full snapshot collection (structural parity with TagChipUpdateDeps). */
  readonly getAllSnapshots: GetAllSnapshots;
  /** Internal event bus — called by the orchestrator after projection update,
   *  NOT inside updateProjectionsAfterDelete. */
  readonly publishInternal: EventBusPublishInternal;
};

// ── BuildDeleteNoteRequested ──────────────────────────────────────────────────
/** Pure construction: (authorized, now) => DeleteNoteRequested.
 *  No deps curry. Uses the orchestrator's single Clock.now() value. */
export type BuildDeleteNoteRequested = (
  authorized: AuthorizedDeletion,
  now: Timestamp,
) => DeleteNoteRequested;

// ── DeleteNote ────────────────────────────────────────────────────────────────
/** Outer curry: (deps, feed, inventory, editingCurrentNoteId) => inner.
 *  Inner: (confirmed) => Promise<Result<UpdatedProjection, DeletionError>>. */
export type DeleteNote = (
  deps: DeleteNoteDeps,
  feed: Feed,
  inventory: TagInventory,
  editingCurrentNoteId: NoteId | null,
) => (
  confirmed: DeletionConfirmed,
) => Promise<Result<UpdatedProjection, DeletionError>>;

// ── AuthorizationErrorDelta ───────────────────────────────────────────────────
/** Extends the canonical not-in-feed variant with optional cause for
 *  Feed/snapshot inconsistency (FIND-SPEC-DLN-005). Discriminator stays
 *  'not-in-feed' for exhaustiveness compatibility. */
export type AuthorizationErrorDelta =
  | { kind: "editing-in-progress"; noteId: NoteId }
  | { kind: "not-in-feed"; noteId: NoteId; cause?: "snapshot-missing" };

export type DeletionErrorDelta =
  | { kind: "authorization"; reason: AuthorizationErrorDelta }
  | { kind: "fs"; reason: FsError };

// ── UpdateProjectionsAfterDelete ──────────────────────────────────────────────
/** Pure function: (feed, inventory, event) => UpdatedProjection.
 *  No deps curry. No port calls. Sources now from event.occurredOn.
 *  Called on: happy path and not-found graceful path.
 *  NOT called on: permission, lock, disk-full, or unknown fs-error paths. */
export type UpdateProjectionsAfterDelete = (
  feed: Feed,
  inventory: TagInventory,
  event: NoteFileDeleted,
) => UpdatedProjection;

// ── AuthorizeDeletionPure ─────────────────────────────────────────────────────
/** Pure authorization core (proof target PROP-DLN-001 / PROP-DLN-002).
 *  Three-precondition guard (FIND-SPEC-DLN-003):
 *    (a) editingCurrentNoteId === noteId → Err({ kind: 'editing-in-progress' })
 *    (b) !Feed.hasNote(feed, noteId)     → Err({ kind: 'not-in-feed' })
 *    (c) snapshot === null               → Err({ kind: 'not-in-feed', cause: 'snapshot-missing' })
 *    (d) all pass                        → Ok(AuthorizedDeletion { frontmatter: snapshot.frontmatter }) */
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
