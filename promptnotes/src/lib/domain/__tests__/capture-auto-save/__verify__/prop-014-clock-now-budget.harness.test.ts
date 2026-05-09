/**
 * PROP-014: Clock.now() is called exactly once per pipeline run.
 *
 * Tier 1 — Spy wrapper: instrument clockNow with counter; run pipeline → counter === 1.
 * Required: true
 *
 * Purity boundary invariant: Clock.now() must be called exactly once in Step 1
 * (prepareSaveRequest). More than one call would leak non-deterministic time into
 * the pure serialization step, breaking referential transparency of the pipeline.
 *
 * Covers: non-empty body path (happy path), empty body + blur path,
 * and (separately) the empty body + idle path where prepareSaveRequest itself
 * still calls Clock.now() exactly once for the EmptyNoteDiscarded event timestamp.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import {
  prepareSaveRequest,
  type PrepareSaveRequestDeps,
} from "$lib/domain/capture-auto-save/prepare-save-request";
import type {
  Body,
  Frontmatter,
  NoteId,
  Tag,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { Block, Note } from "promptnotes-domain-types/shared/note";
import type { BlockId, BlockType, BlockContent } from "promptnotes-domain-types/shared/value-objects";
import type { DirtyEditingSession } from "promptnotes-domain-types/capture/stages";

// ── Arbitraries ────────────────────────────────────────────────────────────

function arbTimestamp(min = 1_000_000, max = 1_500_000): fc.Arbitrary<Timestamp> {
  return fc
    .integer({ min, max })
    .map((ms) => ({ epochMillis: ms } as unknown as Timestamp));
}

function arbTag(): fc.Arbitrary<Tag> {
  return fc
    .stringMatching(/^[a-z][a-z0-9-]{0,19}$/)
    .map((s) => s as unknown as Tag);
}

function arbFrontmatter(): fc.Arbitrary<Frontmatter> {
  return fc
    .record({
      tags: fc.array(arbTag(), { maxLength: 5 }),
      createdAt: arbTimestamp(1_000_000, 1_500_000),
      updatedAt: arbTimestamp(1_000_000, 1_500_000),
    })
    .map((fm) => fm as unknown as Frontmatter);
}

function arbBody(): fc.Arbitrary<Body> {
  return fc.string({ maxLength: 200 }).map((s) => s as unknown as Body);
}

function arbNoteId(): fc.Arbitrary<NoteId> {
  return fc
    .stringMatching(/^[a-z0-9-]{10,30}$/)
    .map((s) => s as unknown as NoteId);
}

function arbParagraphBlock(): fc.Arbitrary<Block> {
  return fc
    .record({
      id: fc.stringMatching(/^block-[0-9]{1,4}$/).map((s) => s as unknown as BlockId),
      content: fc.string({ maxLength: 80 })
        .filter((s) => !/[\x00-\x1F\n\r]/.test(s))
        .map((s) => s as unknown as BlockContent),
    })
    .map(({ id, content }) => ({
      id,
      type: "paragraph" as BlockType,
      content,
    }) as unknown as Block);
}

function arbNote(fm: fc.Arbitrary<Frontmatter>): fc.Arbitrary<Note> {
  return fc
    .record({
      id: arbNoteId(),
      blocks: fc.array(arbParagraphBlock(), { minLength: 1, maxLength: 4 }),
      body: arbBody(),
      frontmatter: fm,
    })
    .map((n) => n as unknown as Note);
}

function arbDirtyEditingSession(
  trigger: "idle" | "blur",
  isEmpty: boolean,
): fc.Arbitrary<DirtyEditingSession> {
  return arbNote(arbFrontmatter()).map(
    (note) =>
      ({
        kind: "DirtyEditingSession",
        noteId: note.id,
        note,
        previousFrontmatter: null,
        trigger,
      }) as DirtyEditingSession,
  );
}

// Fixed clock returning a time after createdAt range (1_500_000) to avoid InvariantViolated
function makeSpyClock(): { clockNow: () => Timestamp; getCallCount: () => number } {
  let callCount = 0;
  return {
    clockNow: () => {
      callCount++;
      return { epochMillis: 2_000_000_000 } as unknown as Timestamp;
    },
    getCallCount: () => callCount,
  };
}

// ── PROP-014 ───────────────────────────────────────────────────────────────

describe("PROP-014: Clock.now() called exactly once per prepareSaveRequest run", () => {
  test("∀ non-empty note + idle trigger → clockNow called exactly once", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("idle", false), (session) => {
        const spy = makeSpyClock();
        const deps: PrepareSaveRequestDeps = {
          clockNow: spy.clockNow,
          noteIsEmpty: () => false, // non-empty
          publish: () => {},
        };

        prepareSaveRequest(deps)(session);

        return spy.getCallCount() === 1;
      }),
      { numRuns: 200, seed: 42 },
    );
  });

  test("∀ non-empty note + blur trigger → clockNow called exactly once", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("blur", false), (session) => {
        const spy = makeSpyClock();
        const deps: PrepareSaveRequestDeps = {
          clockNow: spy.clockNow,
          noteIsEmpty: () => false,
          publish: () => {},
        };

        prepareSaveRequest(deps)(session);

        return spy.getCallCount() === 1;
      }),
      { numRuns: 200, seed: 7 },
    );
  });

  test("∀ empty note + idle trigger → clockNow called exactly once (for EmptyNoteDiscarded.occurredOn)", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("idle", true), (session) => {
        const spy = makeSpyClock();
        const deps: PrepareSaveRequestDeps = {
          clockNow: spy.clockNow,
          noteIsEmpty: () => true, // empty
          publish: () => {},
        };

        prepareSaveRequest(deps)(session);

        return spy.getCallCount() === 1;
      }),
      { numRuns: 200, seed: 13 },
    );
  });

  test("∀ empty note + blur trigger → clockNow called exactly once", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("blur", true), (session) => {
        const spy = makeSpyClock();
        const deps: PrepareSaveRequestDeps = {
          clockNow: spy.clockNow,
          noteIsEmpty: () => true,
          publish: () => {},
        };

        prepareSaveRequest(deps)(session);

        return spy.getCallCount() === 1;
      }),
      { numRuns: 200, seed: 99 },
    );
  });

  test("clockNow is never called 0 times (must be called to assign timestamp)", () => {
    fc.assert(
      fc.property(
        arbDirtyEditingSession("idle", false),
        fc.constantFrom(true, false),
        fc.constantFrom("idle" as const, "blur" as const),
        (session, isEmpty, trigger) => {
          const sessionWithTrigger = { ...session, trigger };
          const spy = makeSpyClock();
          const deps: PrepareSaveRequestDeps = {
            clockNow: spy.clockNow,
            noteIsEmpty: () => isEmpty,
            publish: () => {},
          };

          prepareSaveRequest(deps)(sessionWithTrigger as DirtyEditingSession);

          // Clock must always be called at least once — never zero times
          return spy.getCallCount() >= 1;
        },
      ),
      { numRuns: 200, seed: 77 },
    );
  });
});
