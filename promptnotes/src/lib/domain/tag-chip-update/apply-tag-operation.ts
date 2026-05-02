// tag-chip-update/apply-tag-operation.ts
// Effectful curry wrapper around applyTagOperationPure.
//
// The pure function requires a pre-fetched Timestamp (from Clock.now()).
// This wrapper captures deps and calls clockNow on each invocation.
// For the tag-chip-update workflow the pipeline calls applyTagOperationPure
// directly after obtaining `now`; this file exists as a conventional
// boundary declaration for the effectful/pure split described in the
// verification architecture purity boundary map.

import type { Note } from "promptnotes-domain-types/shared/note";
import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { MutatedNote, TagChipCommand } from "promptnotes-domain-types/curate/stages";
import type { Result } from "promptnotes-domain-types/util/result";
import type { SaveErrorDelta, TagChipUpdateDeps } from "./_deltas.js";
import { applyTagOperationPure } from "./apply-tag-operation-pure.js";

type ClockDeps = Pick<TagChipUpdateDeps, "clockNow">;

/** Effectful wrapper: calls clockNow() then delegates to the pure core. */
export function applyTagOperation(
  deps: ClockDeps,
): (note: Note, command: TagChipCommand) => Result<MutatedNote, SaveErrorDelta> {
  return (note: Note, command: TagChipCommand): Result<MutatedNote, SaveErrorDelta> => {
    const now: Timestamp = deps.clockNow();
    return applyTagOperationPure(note, command, now);
  };
}
