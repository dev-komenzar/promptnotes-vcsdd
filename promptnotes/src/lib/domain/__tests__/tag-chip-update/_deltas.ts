/**
 * _deltas.ts — Contract delta type aliases for tag-chip-update tests.
 *
 * The canonical `docs/domain/code/ts/src/**` files do not yet implement the
 * 5 deltas declared in behavioral-spec.md Revision 3. This file mirrors those
 * delta declarations so that test files can reference them before Phase 2b
 * modifies the canonical sources.
 *
 * DO NOT import from `../../tag-chip-update/...` here — that would be an impl file.
 * This file only re-exports or re-declares types that are delta-extended versions
 * of existing canonical types.
 */

import type { NoteFileSnapshot, HydrationFailureReason } from "promptnotes-domain-types/shared/snapshots";
import type { NoteId, Tag, Timestamp, Frontmatter } from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type {
  NoteFileSaved,
  NoteSaveFailed,
  SaveNoteRequested,
  PublicDomainEvent,
} from "promptnotes-domain-types/shared/events";
import type {
  CurateInternalEvent,
  TagInventoryUpdated,
} from "promptnotes-domain-types/curate/internal-events";
import type { CurateDeps } from "promptnotes-domain-types/curate/ports";
import type { MutatedNote, TagChipCommand, IndexedNote } from "promptnotes-domain-types/curate/stages";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagInventory } from "promptnotes-domain-types/curate/read-models";
import type { Result } from "promptnotes-domain-types/util/result";

// ── Delta 1: SaveValidationError with structured cause ───────────────────────
// Current canonical (errors.ts):
//   | { kind: 'invariant-violated'; detail: string }
// Delta: adds structured `cause` discriminator with 3 variants.

export type SaveValidationErrorDelta =
  | { kind: "empty-body-on-idle" }
  | {
      kind: "invariant-violated";
      cause: "note-not-in-feed" | "hydration-failed" | "frontmatter-invariant";
      detail: string;
    };

export type SaveErrorDelta =
  | { kind: "validation"; reason: SaveValidationErrorDelta }
  | { kind: "fs"; reason: FsError };

// ── Delta 2: GetAllSnapshots port ────────────────────────────────────────────
export type GetAllSnapshots = () => readonly NoteFileSnapshot[];

// ── Delta 3: EventBusPublishInternal port ────────────────────────────────────
export type EventBusPublishInternal = (event: CurateInternalEvent) => void;

// ── Delta 4: TagChipUpdateDeps ───────────────────────────────────────────────
// Structural guarantee: does NOT include getEditorBuffer or editingState.
export type WriteMarkdown = (
  request: SaveNoteRequested,
) => Promise<Result<NoteFileSaved, FsError>>;

export type TagChipUpdateDeps = CurateDeps & {
  readonly writeMarkdown: WriteMarkdown;
  readonly getAllSnapshots: GetAllSnapshots;
  readonly publishInternal: EventBusPublishInternal;
};

// ── Delta 5: BuildTagChipSaveRequest — arity widened, drops deps curry ───────
// Pure: (mutated: MutatedNote, now: Timestamp) => SaveNoteRequested
export type BuildTagChipSaveRequest = (
  mutated: MutatedNote,
  now: Timestamp,
) => SaveNoteRequested;

// ── ApplyTagOperationPure — pure core proof target ───────────────────────────
export type ApplyTagOperationPure = (
  note: Note,
  command: TagChipCommand,
  now: Timestamp,
) => Result<MutatedNote, SaveErrorDelta>;

// ── TagChipUpdate — full pipeline signature ───────────────────────────────────
export type TagChipUpdate = (
  deps: TagChipUpdateDeps,
  feed: Feed,
  inventory: TagInventory,
) => (command: TagChipCommand) => Promise<Result<IndexedNote, SaveErrorDelta>>;

// Re-export canonical types for convenience in tests
export type {
  NoteId,
  Tag,
  Timestamp,
  Frontmatter,
  Note,
  FsError,
  NoteFileSaved,
  NoteSaveFailed,
  SaveNoteRequested,
  PublicDomainEvent,
  CurateInternalEvent,
  TagInventoryUpdated,
  CurateDeps,
  MutatedNote,
  TagChipCommand,
  IndexedNote,
  Feed,
  TagInventory,
  HydrationFailureReason,
};
