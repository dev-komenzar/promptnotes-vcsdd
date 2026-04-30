/**
 * PROP-003: Empty body + idle trigger → EmptyNoteDiscarded, NOT SaveError at prepareSaveRequest level.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * Property: ∀ note where noteIsEmpty(note)=true, trigger="idle"
 *   → result.ok === true && result.value.kind === "empty-discarded"
 *
 * Safety property: empty notes must NOT persist to disk on idle save.
 * The result must be on the success channel (ok=true) as EmptyNoteDiscarded,
 * not on the error channel as SaveError.
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
import type { Note } from "promptnotes-domain-types/shared/note";
import type { DirtyEditingSession } from "promptnotes-domain-types/capture/stages";

// ── Arbitraries ────────────────────────────────────────────────────────────

function arbTimestamp(min = 1_000_000, max = 2_000_000_000): fc.Arbitrary<Timestamp> {
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
  // createdAt must be <= what clockNow returns (2_000_000), so use values <= 1_000_000
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

function arbNote(fm: fc.Arbitrary<Frontmatter>): fc.Arbitrary<Note> {
  return fc
    .record({
      id: arbNoteId(),
      body: arbBody(),
      frontmatter: fm,
    })
    .map((n) => n as unknown as Note);
}

function arbDirtyEditingSession(
  trigger: "idle" | "blur",
  fm: fc.Arbitrary<Frontmatter>,
): fc.Arbitrary<DirtyEditingSession> {
  return arbNote(fm).map(
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

// Clock always returns a timestamp after createdAt to avoid InvariantViolated
function makeFixedClockNow(): () => Timestamp {
  return () => ({ epochMillis: 2_000_000_000 } as unknown as Timestamp);
}

// ── PROP-003 ───────────────────────────────────────────────────────────────

describe("PROP-003: empty body + idle trigger → EmptyNoteDiscarded (not SaveError)", () => {
  test("∀ note with isEmpty=true and trigger=idle → result.ok=true and kind='empty-discarded'", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("idle", arbFrontmatter()), (session) => {
        const deps: PrepareSaveRequestDeps = {
          clockNow: makeFixedClockNow(),
          noteIsEmpty: () => true, // always empty
          publish: () => {},
        };

        const result = prepareSaveRequest(deps)(session);

        // Must be on the success channel
        if (!result.ok) return false;
        // Must be empty-discarded, NOT validated
        return result.value.kind === "empty-discarded";
      }),
      { numRuns: 200, seed: 42 },
    );
  });

  test("∀ note with isEmpty=true and trigger=idle → result is never a SaveError", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("idle", arbFrontmatter()), (session) => {
        const deps: PrepareSaveRequestDeps = {
          clockNow: makeFixedClockNow(),
          noteIsEmpty: () => true,
          publish: () => {},
        };

        const result = prepareSaveRequest(deps)(session);

        // Verify: result must not be an error
        return result.ok === true;
      }),
      { numRuns: 200, seed: 7 },
    );
  });

  test("∀ note with isEmpty=true and trigger=idle → EmptyNoteDiscarded event is published", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("idle", arbFrontmatter()), (session) => {
        const published: unknown[] = [];
        const deps: PrepareSaveRequestDeps = {
          clockNow: makeFixedClockNow(),
          noteIsEmpty: () => true,
          publish: (e) => published.push(e),
        };

        prepareSaveRequest(deps)(session);

        // Exactly one event is published
        if (published.length !== 1) return false;
        const event = published[0] as { kind: string };
        return event.kind === "empty-note-discarded";
      }),
      { numRuns: 200, seed: 13 },
    );
  });

  test("∀ note with isEmpty=true and trigger=idle → noteId is preserved in the discarded event", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("idle", arbFrontmatter()), (session) => {
        const published: unknown[] = [];
        const deps: PrepareSaveRequestDeps = {
          clockNow: makeFixedClockNow(),
          noteIsEmpty: () => true,
          publish: (e) => published.push(e),
        };

        prepareSaveRequest(deps)(session);

        if (published.length !== 1) return false;
        const event = published[0] as { kind: string; noteId: unknown };
        // noteId in event must match session.noteId
        return JSON.stringify(event.noteId) === JSON.stringify(session.noteId);
      }),
      { numRuns: 100, seed: 99 },
    );
  });
});
