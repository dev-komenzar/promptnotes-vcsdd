/**
 * PROP-EPNS-003: classifyCurrentSession(EditingState, note)
 *   isEmpty(note) → { kind: 'empty', noteId }
 *   !isEmpty(note) → { kind: 'dirty', noteId, note }
 * Tier 1 — fast-check 1000 runs
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  Timestamp,
  Body,
  Frontmatter,
  Tag,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { EditingState } from "promptnotes-domain-types/capture/states";

import { classifyCurrentSession } from "../../../edit-past-note-start/classify-current-session";

function makeNoteId(raw: string): NoteId { return raw as unknown as NoteId; }
function makeTimestamp(ms: number): Timestamp { return { epochMillis: ms } as unknown as Timestamp; }
function makeBody(raw: string): Body { return raw as unknown as Body; }
function makeFrontmatter(): Frontmatter {
  return { tags: [], createdAt: makeTimestamp(1000), updatedAt: makeTimestamp(1000) } as unknown as Frontmatter;
}

const arbNoteId = fc.stringMatching(/^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}-[0-9]{3}$/).map(makeNoteId);

// Empty body: only whitespace
const arbEmptyBody = fc.stringMatching(/^[\s]*$/).map(makeBody);
// Non-empty body: has at least one non-whitespace char
const arbNonEmptyBody = fc.string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0)
  .map(makeBody);

describe("PROP-EPNS-003: editing state classification", () => {
  test("isEmpty(note) → 'empty' (1000 runs)", () => {
    fc.assert(
      fc.property(arbNoteId, arbEmptyBody, fc.boolean(), (noteId, body, isDirty) => {
        const state: EditingState = {
          status: "editing", currentNoteId: noteId, isDirty,
          lastInputAt: null, idleTimerHandle: null, lastSaveResult: null,
        };
        const note: Note = { id: noteId, body, frontmatter: makeFrontmatter() };
        const result = classifyCurrentSession(state, note);
        expect(result.kind).toBe("empty");
        if (result.kind === "empty") {
          expect(result.noteId).toBe(noteId);
        }
      }),
      { numRuns: 1000 },
    );
  });

  test("!isEmpty(note) → 'dirty' (1000 runs)", () => {
    fc.assert(
      fc.property(arbNoteId, arbNonEmptyBody, fc.boolean(), (noteId, body, isDirty) => {
        const state: EditingState = {
          status: "editing", currentNoteId: noteId, isDirty,
          lastInputAt: null, idleTimerHandle: null, lastSaveResult: null,
        };
        const note: Note = { id: noteId, body, frontmatter: makeFrontmatter() };
        const result = classifyCurrentSession(state, note);
        expect(result.kind).toBe("dirty");
        if (result.kind === "dirty") {
          expect(result.noteId).toBe(noteId);
          expect(result.note).toBe(note);
        }
      }),
      { numRuns: 1000 },
    );
  });
});
