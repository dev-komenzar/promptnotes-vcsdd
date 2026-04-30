// capture-auto-save/prepare-save-request.ts
// Step 1: prepareSaveRequest — validates DirtyEditingSession and produces
// ValidatedSaveRequest or EmptyNoteDiscarded.
//
// REQ-002: Produces ValidatedSaveRequest with updated timestamp
// REQ-003: Empty body on idle → EmptyNoteDiscarded (success channel)
// REQ-004: Empty body on blur → proceeds to save
// REQ-005: InvariantViolated error on updatedAt < createdAt

import type { Result } from "promptnotes-domain-types/util/result";
import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type { EmptyNoteDiscarded, PublicDomainEvent } from "promptnotes-domain-types/shared/events";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { DirtyEditingSession, ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";
import { isBefore, toEpochMillis } from "./timestamp-utils.js";

export type PrepareSaveRequestDeps = {
  readonly clockNow: () => Timestamp;
  readonly noteIsEmpty: (note: Note) => boolean;
  readonly publish: (event: PublicDomainEvent) => void;
};

type PrepareResult =
  | { kind: "validated"; request: ValidatedSaveRequest }
  | { kind: "empty-discarded"; event: EmptyNoteDiscarded };

export function prepareSaveRequest(
  deps: PrepareSaveRequestDeps,
): (input: DirtyEditingSession) => Result<PrepareResult, SaveError> {
  return (input: DirtyEditingSession): Result<PrepareResult, SaveError> => {
    // REQ-003: empty body on idle → EmptyNoteDiscarded (success channel)
    if (input.trigger === "idle" && deps.noteIsEmpty(input.note)) {
      const now = deps.clockNow();
      const event: EmptyNoteDiscarded = {
        kind: "empty-note-discarded",
        noteId: input.noteId,
        occurredOn: now,
      };
      deps.publish(event);
      return { ok: true, value: { kind: "empty-discarded", event } };
    }

    // REQ-002: produce ValidatedSaveRequest
    const now = deps.clockNow();

    // REQ-005: invariant check — updatedAt must be >= createdAt
    if (isBefore(now, input.note.frontmatter.createdAt)) {
      return {
        ok: false,
        error: {
          kind: "validation",
          reason: {
            kind: "invariant-violated",
            detail: `updatedAt (${toEpochMillis(now)}) < createdAt (${toEpochMillis(input.note.frontmatter.createdAt)})`,
          },
        },
      };
    }

    const updatedFrontmatter = {
      ...input.note.frontmatter,
      updatedAt: now,
    };

    // updatedFrontmatter spreads the branded Frontmatter and adds updatedAt,
    // preserving the brand. The cast is safe because we only updated one field.
    const request = {
      kind: "ValidatedSaveRequest" as const,
      noteId: input.noteId,
      body: input.note.body,
      frontmatter: updatedFrontmatter as typeof input.note.frontmatter,
      previousFrontmatter: input.previousFrontmatter,
      trigger: input.trigger,
      requestedAt: now,
    } satisfies Record<string, unknown> as unknown as ValidatedSaveRequest;

    return { ok: true, value: { kind: "validated", request } };
  };
}
