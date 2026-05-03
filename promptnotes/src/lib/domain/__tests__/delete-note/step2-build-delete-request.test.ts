/**
 * step2-build-delete-request.test.ts — Unit tests for buildDeleteNoteRequested
 *
 * REQ-DLN-007: occurredOn threading invariant
 *
 * PROP-DLN-005: occurredOn threading — buildDeleteNoteRequested threads now correctly
 *
 * Delta 3: BuildDeleteNoteRequested is (authorized: AuthorizedDeletion, now: Timestamp) => DeleteNoteRequested
 *   Pure function. No deps curry. No clock call. Uses pre-obtained now.
 *
 * RED phase: imports from non-existent implementation file.
 * Module resolution failure is valid RED evidence.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  Tag,
  Timestamp,
  Frontmatter,
  DeleteNoteRequested,
  AuthorizedDeletion,
} from "./_deltas";

import { buildDeleteNoteRequested } from "../../delete-note/build-delete-request";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}
function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}
function makeTag(raw: string): Tag {
  return raw as unknown as Tag;
}
function makeFrontmatter(opts?: {
  tags?: Tag[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}): Frontmatter {
  return {
    tags: opts?.tags ?? [],
    createdAt: opts?.createdAt ?? makeTimestamp(1000),
    updatedAt: opts?.updatedAt ?? makeTimestamp(2000),
  } as unknown as Frontmatter;
}
function makeAuthorizedDeletion(noteId: NoteId, fm?: Frontmatter): AuthorizedDeletion {
  return {
    kind: "AuthorizedDeletion",
    noteId,
    frontmatter: fm ?? makeFrontmatter(),
  };
}

// ── kind field ────────────────────────────────────────────────────────────

describe("buildDeleteNoteRequested — event kind field", () => {
  test("produces event with kind 'delete-note-requested'", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const authorized = makeAuthorizedDeletion(noteId);
    const now = makeTimestamp(5000);

    const event = buildDeleteNoteRequested(authorized, now);

    expect((event as { kind: string }).kind).toBe("delete-note-requested");
  });
});

// ── REQ-DLN-007 / PROP-DLN-005: occurredOn threading ─────────────────────

describe("REQ-DLN-007 / PROP-DLN-005: buildDeleteNoteRequested — occurredOn threading", () => {
  test("DeleteNoteRequested.occurredOn === now", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const authorized = makeAuthorizedDeletion(noteId);
    const now = makeTimestamp(12345);

    const event = buildDeleteNoteRequested(authorized, now);

    expect((event as { occurredOn: Timestamp }).occurredOn).toEqual(now);
  });

  test("occurredOn epochMillis matches the provided timestamp", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const authorized = makeAuthorizedDeletion(noteId);
    const now = makeTimestamp(99999);

    const event = buildDeleteNoteRequested(authorized, now);

    expect(((event as { occurredOn: Timestamp }).occurredOn as unknown as { epochMillis: number }).epochMillis).toBe(99999);
  });
});

// ── noteId field ──────────────────────────────────────────────────────────

describe("buildDeleteNoteRequested — noteId field", () => {
  test("DeleteNoteRequested.noteId matches authorized.noteId", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const authorized = makeAuthorizedDeletion(noteId);
    const now = makeTimestamp(5000);

    const event = buildDeleteNoteRequested(authorized, now);

    expect(String((event as { noteId: NoteId }).noteId)).toBe(String(noteId));
  });
});

// ── purity ────────────────────────────────────────────────────────────────

describe("buildDeleteNoteRequested — purity (same inputs produce identical output)", () => {
  test("calling twice with same inputs produces identical results", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const authorized = makeAuthorizedDeletion(noteId);
    const now = makeTimestamp(5000);

    const event1 = buildDeleteNoteRequested(authorized, now);
    const event2 = buildDeleteNoteRequested(authorized, now);

    expect(event1).toEqual(event2);
  });

  test("property-based: same (authorized, now) always produces identical output", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }),
        fc.integer({ min: 0, max: 9_999_999 }),
        (idStr, epochMillis) => {
          const noteId = makeNoteId(idStr);
          const authorized = makeAuthorizedDeletion(noteId);
          const now = makeTimestamp(epochMillis);
          const e1 = buildDeleteNoteRequested(authorized, now);
          const e2 = buildDeleteNoteRequested(authorized, now);
          expect(e1).toEqual(e2);
        },
      ),
    );
  });
});
