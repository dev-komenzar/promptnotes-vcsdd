/**
 * _deltas.ts — Contract delta type declarations for tag-chip-update implementation.
 *
 * These mirror the delta types declared in the test helper
 * `__tests__/tag-chip-update/_deltas.ts`. The implementation surface imports
 * from this co-located file rather than from the test helper, keeping the
 * dependency direction correct (impl must not import from tests).
 *
 * Delta 1: SaveValidationErrorDelta — adds structured 'cause' discriminator.
 * Delta 2: GetAllSnapshots — port for snapshot enumeration.
 * Delta 3: EventBusPublishInternal — port for Curate-internal events.
 * Delta 4: TagChipUpdateDeps — full deps type for this workflow.
 * Delta 5: BuildTagChipSaveRequest — arity widened to (mutated, now) => SaveNoteRequested.
 */

import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { NoteFileSaved, SaveNoteRequested } from "promptnotes-domain-types/shared/events";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { CurateInternalEvent } from "promptnotes-domain-types/curate/internal-events";
import type { CurateDeps } from "promptnotes-domain-types/curate/ports";
import type { MutatedNote, TagChipCommand, IndexedNote } from "promptnotes-domain-types/curate/stages";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagInventory } from "promptnotes-domain-types/curate/read-models";
import type { Result } from "promptnotes-domain-types/util/result";
import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";

// ── Delta 1: SaveValidationError with structured cause ────────────────────

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

// ── Delta 2: GetAllSnapshots port ─────────────────────────────────────────

export type GetAllSnapshots = () => readonly NoteFileSnapshot[];

// ── Delta 3: EventBusPublishInternal port ─────────────────────────────────

export type EventBusPublishInternal = (event: CurateInternalEvent) => void;

// ── Delta 4: TagChipUpdateDeps ─────────────────────────────────────────────

export type WriteMarkdown = (
  request: SaveNoteRequested,
) => Promise<Result<NoteFileSaved, FsError>>;

export type TagChipUpdateDeps = CurateDeps & {
  readonly writeMarkdown: WriteMarkdown;
  readonly getAllSnapshots: GetAllSnapshots;
  readonly publishInternal: EventBusPublishInternal;
};

// ── Delta 5: BuildTagChipSaveRequest — pure, no deps curry ────────────────

export type BuildTagChipSaveRequest = (
  mutated: MutatedNote,
  now: Timestamp,
) => SaveNoteRequested;

// ── TagChipUpdate — full pipeline signature ───────────────────────────────
// Builder note resolution: the tests call tagChipUpdate(deps, feed, inventory)(command).
// The pipeline uses a 3-argument outer curry (deps, feed, inventory) rather than
// the canonical 1-argument (deps) form, because feed and inventory are workflow-scoped
// inputs (not long-lived ports) and the test contract explicitly passes them as
// outer-curry arguments.

export type TagChipUpdate = (
  deps: TagChipUpdateDeps,
  feed: Feed,
  inventory: TagInventory,
) => (command: TagChipCommand) => Promise<Result<IndexedNote, SaveErrorDelta>>;
