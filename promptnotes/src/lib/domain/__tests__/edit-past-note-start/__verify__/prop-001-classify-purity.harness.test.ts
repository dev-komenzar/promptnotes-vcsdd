/**
 * PROP-EPNS-001: classifyCurrentSession is pure
 * Tier 1 — fast-check 1000 runs
 *
 * Property: ∀ (state, note), classifyCurrentSession(state, note) deepEquals classifyCurrentSession(state, note)
 * Referential transparency: same inputs always produce identical outputs.
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
import type {
  EditingSessionState,
  EditingState,
  IdleState,
  SaveFailedState,
} from "promptnotes-domain-types/capture/states";
import type { SaveError } from "promptnotes-domain-types/shared/errors";

import { classifyCurrentSession } from "../../../edit-past-note-start/classify-current-session";

// ── Arbitrary generators ──────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}
function makeTimestamp(ms: number): Timestamp {
  return { epochMillis: ms } as unknown as Timestamp;
}
function makeBody(raw: string): Body {
  return raw as unknown as Body;
}
function makeTag(raw: string): Tag {
  return raw as unknown as Tag;
}
function makeFrontmatter(tags: Tag[], created: number, updated: number): Frontmatter {
  return {
    tags,
    createdAt: makeTimestamp(created),
    updatedAt: makeTimestamp(updated),
  } as unknown as Frontmatter;
}

const arbNoteId = fc.stringMatching(/^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}-[0-9]{3}$/).map(makeNoteId);
const arbTimestamp = fc.integer({ min: 0, max: 2_000_000_000_000 }).map(makeTimestamp);
const arbBody = fc.string({ minLength: 0, maxLength: 200 }).map(makeBody);
const arbTag = fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/).map(makeTag);
const arbFrontmatter = fc.tuple(
  fc.array(arbTag, { minLength: 0, maxLength: 5 }),
  fc.integer({ min: 0, max: 2_000_000_000_000 }),
  fc.integer({ min: 0, max: 2_000_000_000_000 }),
).map(([tags, c, u]) => makeFrontmatter(tags, c, u));

const arbNote: fc.Arbitrary<Note> = fc.tuple(arbNoteId, arbBody, arbFrontmatter).map(
  ([id, body, fm]) => ({ id, body, frontmatter: fm })
);

const arbIdleState: fc.Arbitrary<IdleState> = fc.constant({ status: "idle" as const });

const arbEditingState: fc.Arbitrary<EditingState> = fc.tuple(
  arbNoteId,
  fc.boolean(),
).map(([noteId, isDirty]) => ({
  status: "editing" as const,
  currentNoteId: noteId,
  isDirty,
  lastInputAt: null,
  idleTimerHandle: null,
  lastSaveResult: null,
}));

const arbSaveError: fc.Arbitrary<SaveError> = fc.oneof(
  fc.constant({ kind: "fs" as const, reason: { kind: "permission" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "disk-full" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "lock" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "unknown" as const, detail: "test" } }),
  fc.constant({ kind: "validation" as const, reason: { kind: "empty-body-on-idle" as const } }),
);

const arbSaveFailedState: fc.Arbitrary<SaveFailedState> = fc.tuple(
  arbNoteId,
  fc.option(arbNoteId, { nil: null }),
  arbSaveError,
).map(([noteId, pending, error]) => ({
  status: "save-failed" as const,
  currentNoteId: noteId,
  pendingNextNoteId: pending,
  lastSaveError: error,
}));

// Generate valid (state, note) pairs respecting preconditions:
// - IdleState → note is null
// - EditingState / SaveFailedState → note is non-null
const arbValidStateAndNote: fc.Arbitrary<[EditingSessionState, Note | null]> = fc.oneof(
  arbIdleState.map((s): [EditingSessionState, Note | null] => [s, null]),
  fc.tuple(arbEditingState, arbNote).map(([s, n]): [EditingSessionState, Note | null] => [s, n]),
  fc.tuple(arbSaveFailedState, arbNote).map(([s, n]): [EditingSessionState, Note | null] => [s, n]),
);

// ── Property tests ──────────────────────────────────────────────────────

describe("PROP-EPNS-001: classifyCurrentSession purity", () => {
  test("referential transparency: same inputs → same outputs (1000 runs)", () => {
    fc.assert(
      fc.property(arbValidStateAndNote, ([state, note]) => {
        const result1 = classifyCurrentSession(state, note);
        const result2 = classifyCurrentSession(state, note);
        expect(result1).toEqual(result2);
      }),
      { numRuns: 1000 },
    );
  });

  test("function arity is exactly 2 (no hidden dependencies)", () => {
    expect(classifyCurrentSession.length).toBe(2);
  });

  test("Date.now() is never called during classification", () => {
    const original = Date.now;
    let dateNowCalls = 0;
    Date.now = () => { dateNowCalls++; return original(); };
    try {
      fc.assert(
        fc.property(arbValidStateAndNote, ([state, note]) => {
          dateNowCalls = 0;
          classifyCurrentSession(state, note);
          expect(dateNowCalls).toBe(0);
        }),
        { numRuns: 100 },
      );
    } finally {
      Date.now = original;
    }
  });
});
