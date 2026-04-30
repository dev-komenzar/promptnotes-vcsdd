/**
 * PROP-004: Empty body + blur trigger → ValidatedSaveRequest (does NOT discard).
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * Property: ∀ note where noteIsEmpty(note)=true, trigger="blur"
 *   → result.ok === true && result.value.kind === "validated"
 *
 * Dual safety property: blur saves must NOT silently discard user data.
 * Even if the body is empty, blur saves must proceed to ValidatedSaveRequest.
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
  // createdAt must be strictly before clockNow (2_000_000_000) to avoid InvariantViolated
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

// Clock returns timestamp well after createdAt (1_000_000–1_500_000)
function makeFixedClockNow(): () => Timestamp {
  return () => ({ epochMillis: 2_000_000_000 } as unknown as Timestamp);
}

// ── PROP-004 ───────────────────────────────────────────────────────────────

describe("PROP-004: empty body + blur trigger → ValidatedSaveRequest (does NOT discard)", () => {
  test("∀ note with isEmpty=true and trigger=blur → result.ok=true and kind='validated'", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("blur", arbFrontmatter()), (session) => {
        const deps: PrepareSaveRequestDeps = {
          clockNow: makeFixedClockNow(),
          noteIsEmpty: () => true, // empty body
          publish: () => {},
        };

        const result = prepareSaveRequest(deps)(session);

        // Must be on the success channel
        if (!result.ok) return false;
        // Must be validated (proceeds to save), NOT empty-discarded
        return result.value.kind === "validated";
      }),
      { numRuns: 200, seed: 42 },
    );
  });

  test("∀ note with isEmpty=true and trigger=blur → EmptyNoteDiscarded is NOT emitted", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("blur", arbFrontmatter()), (session) => {
        const published: Array<{ kind: string }> = [];
        const deps: PrepareSaveRequestDeps = {
          clockNow: makeFixedClockNow(),
          noteIsEmpty: () => true,
          publish: (e) => published.push(e as { kind: string }),
        };

        prepareSaveRequest(deps)(session);

        // No empty-note-discarded event must be emitted on blur
        return !published.some((e) => e.kind === "empty-note-discarded");
      }),
      { numRuns: 200, seed: 7 },
    );
  });

  test("∀ note with isEmpty=true and trigger=blur → result is never an error", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("blur", arbFrontmatter()), (session) => {
        const deps: PrepareSaveRequestDeps = {
          clockNow: makeFixedClockNow(),
          noteIsEmpty: () => true,
          publish: () => {},
        };

        const result = prepareSaveRequest(deps)(session);

        return result.ok === true;
      }),
      { numRuns: 200, seed: 13 },
    );
  });

  test("∀ note with isEmpty=true and trigger=blur → validated request carries trigger='blur'", () => {
    fc.assert(
      fc.property(arbDirtyEditingSession("blur", arbFrontmatter()), (session) => {
        const deps: PrepareSaveRequestDeps = {
          clockNow: makeFixedClockNow(),
          noteIsEmpty: () => true,
          publish: () => {},
        };

        const result = prepareSaveRequest(deps)(session);

        if (!result.ok) return false;
        if (result.value.kind !== "validated") return false;
        return result.value.request.trigger === "blur";
      }),
      { numRuns: 100, seed: 99 },
    );
  });
});
