// tag-chip-update/pipeline.ts
// Full TagChipUpdate pipeline — orchestrates the 4-step workflow.
//
// REQ-TCU-001..012: Complete workflow.
// PROP-TCU-004: Idempotent paths short-circuit before Clock, write, and publish.
// PROP-TCU-015: Clock.now() called at most once per invocation (0 on short-circuit/error).
//
// Injection pattern (Builder note resolution):
//   tagChipUpdate(deps, feed, inventory)(command)
//   feed and inventory are workflow-scoped inputs passed as outer-curry args because
//   the test contract (pipeline.test.ts) explicitly invokes them this way, and they
//   represent a snapshot of UI state at the time of the command — not long-lived ports.

import type { Result } from "promptnotes-domain-types/util/result";
import type { NoteSaveFailed } from "promptnotes-domain-types/shared/events";
import type { FsError } from "promptnotes-domain-types/shared/errors";
import type { TagChipCommand, IndexedNote } from "promptnotes-domain-types/curate/stages";
import type { NoteId, Tag } from "promptnotes-domain-types/shared/value-objects";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagInventory } from "promptnotes-domain-types/curate/read-models";
import type { SaveErrorDelta, TagChipUpdateDeps } from "./_deltas.js";

import { loadCurrentNote } from "./load-current-note.js";
import { applyTagOperationPure } from "./apply-tag-operation-pure.js";
import { buildTagChipSaveRequest } from "./build-save-request.js";
import { updateProjectionsAfterSave } from "./update-projections.js";

export function tagChipUpdate(
  deps: TagChipUpdateDeps,
  feed: Feed,
  inventory: TagInventory,
): (command: TagChipCommand) => Promise<Result<IndexedNote, SaveErrorDelta>> {
  return async (
    command: TagChipCommand,
  ): Promise<Result<IndexedNote, SaveErrorDelta>> => {
    // ── Step 1: Load current note ─────────────────────────────────────
    const loadResult = loadCurrentNote(deps)(command);

    if (!loadResult.ok) {
      const loadError = loadResult.error;

      // 'not-found' is an internal step error; surface as SaveErrorDelta.
      if ((loadError as { kind: string }).kind === "not-found") {
        const error: SaveErrorDelta = {
          kind: "validation",
          reason: {
            kind: "invariant-violated",
            cause: "note-not-in-feed",
            detail: `note not found in snapshot store: ${String(command.noteId)}`,
          },
        };
        return { ok: false, error };
      }

      // Hydration error is already SaveErrorDelta.
      return { ok: false, error: loadError as SaveErrorDelta };
    }

    const note = loadResult.value;

    // ── Idempotency short-circuit (REQ-TCU-003 / REQ-TCU-004) ──────────
    // Guard before Clock.now() — PROP-TCU-004 / PROP-TCU-015.
    if (isNoOpCommand(command, note.frontmatter.tags)) {
      return buildIdempotentResult(note.id, feed, inventory);
    }

    // ── Step 2: Apply tag operation (pure) ───────────────────────────
    // Single Clock.now() call for this invocation — PROP-TCU-015.
    const now = deps.clockNow();
    const applyResult = applyTagOperationPure(note, command, now);

    if (!applyResult.ok) {
      return { ok: false, error: applyResult.error };
    }

    const mutated = applyResult.value;

    // ── Step 3: Build save request ────────────────────────────────────
    const saveRequest = buildTagChipSaveRequest(mutated, now);

    // Emit SaveNoteRequested (public event).
    deps.publish(saveRequest);

    // ── Step 4: Write to disk ─────────────────────────────────────────
    const writeResult = await deps.writeMarkdown(saveRequest);

    if (!writeResult.ok) {
      const fsError = writeResult.error;

      // Emit NoteSaveFailed (public event).
      const failEvent: NoteSaveFailed = {
        kind: "note-save-failed",
        noteId: mutated.note.id,
        reason: mapFsErrorToReason(fsError),
        occurredOn: now,
      };
      deps.publish(failEvent);

      const error: SaveErrorDelta = { kind: "fs", reason: fsError };
      return { ok: false, error };
    }

    const savedEvent = writeResult.value;

    // Emit NoteFileSaved (public event).
    deps.publish(savedEvent);

    // ── Step 5: Update projections ────────────────────────────────────
    const indexed = updateProjectionsAfterSave(deps)(feed, inventory, savedEvent);

    return { ok: true, value: indexed };
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

// True when the command would produce no change: adding a tag that's already present,
// or removing a tag that's already absent. Evaluated before Clock.now().
function isNoOpCommand(command: TagChipCommand, currentTags: readonly Tag[]): boolean {
  const tagPresent = currentTags.includes(command.tag);
  return (command.kind === "add" && tagPresent) || (command.kind === "remove" && !tagPresent);
}

function buildIdempotentResult(
  noteId: NoteId,
  feed: Feed,
  inventory: TagInventory,
): Result<IndexedNote, SaveErrorDelta> {
  return {
    ok: true,
    value: {
      kind: "IndexedNote",
      noteId,
      feed,
      tagInventory: inventory,
    },
  };
}

function mapFsErrorToReason(err: FsError): "permission" | "disk-full" | "lock" | "unknown" {
  switch (err.kind) {
    case "permission": return "permission";
    case "disk-full": return "disk-full";
    case "lock": return "lock";
    case "not-found": return "unknown";
    case "unknown": return "unknown";
  }
}
