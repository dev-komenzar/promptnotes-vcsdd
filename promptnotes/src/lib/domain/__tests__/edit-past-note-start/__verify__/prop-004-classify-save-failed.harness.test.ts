/**
 * PROP-EPNS-004: classifyCurrentSession(SaveFailedState, note) always returns { kind: 'dirty' }
 * Tier 1 — fast-check 1000 runs
 * Required: true (data-loss risk path)
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  Timestamp,
  Body,
  Frontmatter,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { SaveFailedState } from "promptnotes-domain-types/capture/states";
import type { SaveError } from "promptnotes-domain-types/shared/errors";

import { classifyCurrentSession } from "../../../edit-past-note-start/classify-current-session";

function makeNoteId(raw: string): NoteId { return raw as unknown as NoteId; }
function makeTimestamp(ms: number): Timestamp { return { epochMillis: ms } as unknown as Timestamp; }
function makeBody(raw: string): Body { return raw as unknown as Body; }
function makeFrontmatter(): Frontmatter {
  return { tags: [], createdAt: makeTimestamp(1000), updatedAt: makeTimestamp(1000) } as unknown as Frontmatter;
}

const arbNoteId = fc.stringMatching(/^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}-[0-9]{3}$/).map(makeNoteId);
const arbSaveError: fc.Arbitrary<SaveError> = fc.oneof(
  fc.constant({ kind: "fs" as const, reason: { kind: "permission" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "disk-full" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "lock" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "unknown" as const, detail: "test" } }),
);

describe("PROP-EPNS-004: save-failed → dirty", () => {
  test("∀ SaveFailedState & Note, result.kind === 'dirty' (1000 runs)", () => {
    fc.assert(
      fc.property(
        arbNoteId,
        fc.option(arbNoteId, { nil: null }),
        arbSaveError,
        fc.string({ minLength: 0, maxLength: 100 }),
        (noteId, pendingId, error, bodyStr) => {
          const state: SaveFailedState = {
            status: "save-failed",
            currentNoteId: noteId,
            pendingNextNoteId: pendingId,
            lastSaveError: error,
          };
          const note: Note = {
            id: noteId,
            body: makeBody(bodyStr),
            frontmatter: makeFrontmatter(),
          };
          const result = classifyCurrentSession(state, note);
          expect(result.kind).toBe("dirty");
          if (result.kind === "dirty") {
            expect(result.noteId).toBe(noteId);
            expect(result.note).toBe(note);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });
});
