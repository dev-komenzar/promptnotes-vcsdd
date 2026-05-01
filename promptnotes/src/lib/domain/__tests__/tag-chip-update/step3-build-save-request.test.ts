/**
 * step3-build-save-request.test.ts — Unit tests for buildTagChipSaveRequest
 *
 * REQ-TCU-001: SaveNoteRequested.source === 'curate-tag-chip'
 * REQ-TCU-002: SaveNoteRequested.occurredOn === now
 * REQ-TCU-009: SaveNoteRequested.previousFrontmatter === MutatedNote.previousFrontmatter (non-null)
 * REQ-TCU-011: source field value
 *
 * PROP-TCU-013: source is always 'curate-tag-chip'
 * PROP-TCU-014: previousFrontmatter === MutatedNote.previousFrontmatter, non-null
 *
 * Delta 5: BuildTagChipSaveRequest is (mutated: MutatedNote, now: Timestamp) => SaveNoteRequested
 * (drops deps curry, is fully pure).
 *
 * RED phase: imports from non-existent implementation file.
 */

import { describe, test, expect } from "bun:test";
import type {
  NoteId,
  Tag,
  Timestamp,
  Frontmatter,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { SaveNoteRequested } from "promptnotes-domain-types/shared/events";
import type { MutatedNote } from "promptnotes-domain-types/curate/stages";

import { buildTagChipSaveRequest } from "../../tag-chip-update/build-save-request";

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
function makeNote(opts?: {
  id?: NoteId;
  frontmatter?: Frontmatter;
}): Note {
  return {
    id: opts?.id ?? makeNoteId("2026-04-30-120000-001"),
    body: "hello" as unknown,
    frontmatter: opts?.frontmatter ?? makeFrontmatter(),
  } as Note;
}
function makeMutatedNote(opts: {
  note: Note;
  previousFrontmatter: Frontmatter;
}): MutatedNote {
  return {
    kind: "MutatedNote",
    note: opts.note,
    previousFrontmatter: opts.previousFrontmatter,
  };
}

// ── REQ-TCU-001/011: source field ─────────────────────────────────────────

describe("REQ-TCU-001 / PROP-TCU-013: source is always 'curate-tag-chip'", () => {
  test("buildTagChipSaveRequest sets source to 'curate-tag-chip'", () => {
    const previousFm = makeFrontmatter({ tags: [] });
    const mutatedFm = makeFrontmatter({ tags: [makeTag("ts")] });
    const note = makeNote({ frontmatter: mutatedFm });
    const mutated = makeMutatedNote({ note, previousFrontmatter: previousFm });
    const now = makeTimestamp(5000);

    const req = buildTagChipSaveRequest(mutated, now);

    expect(req.source).toBe("curate-tag-chip");
  });

  test("source is 'curate-tag-chip' regardless of tag operation", () => {
    // Remove path
    const previousFm = makeFrontmatter({ tags: [makeTag("ts")] });
    const mutatedFm = makeFrontmatter({ tags: [] });
    const note = makeNote({ frontmatter: mutatedFm });
    const mutated = makeMutatedNote({ note, previousFrontmatter: previousFm });
    const now = makeTimestamp(7000);

    const req = buildTagChipSaveRequest(mutated, now);

    expect(req.source).toBe("curate-tag-chip");
  });
});

// ── REQ-TCU-001/002: occurredOn threading ────────────────────────────────

describe("REQ-TCU-001 / REQ-TCU-002: occurredOn equals the provided now", () => {
  test("SaveNoteRequested.occurredOn === now", () => {
    const previousFm = makeFrontmatter({ tags: [] });
    const note = makeNote({ frontmatter: makeFrontmatter({ tags: [makeTag("ts")] }) });
    const mutated = makeMutatedNote({ note, previousFrontmatter: previousFm });
    const now = makeTimestamp(12345);

    const req = buildTagChipSaveRequest(mutated, now);

    expect(req.occurredOn).toEqual(now);
  });

  test("occurredOn epochMillis matches provided timestamp", () => {
    const previousFm = makeFrontmatter();
    const note = makeNote();
    const mutated = makeMutatedNote({ note, previousFrontmatter: previousFm });
    const now = makeTimestamp(99999);

    const req = buildTagChipSaveRequest(mutated, now);

    expect((req.occurredOn as unknown as { epochMillis: number }).epochMillis).toBe(99999);
  });
});

// ── REQ-TCU-009 / PROP-TCU-014: previousFrontmatter non-null invariant ────

describe("REQ-TCU-009 / PROP-TCU-014: previousFrontmatter is non-null and equals MutatedNote.previousFrontmatter", () => {
  test("SaveNoteRequested.previousFrontmatter equals MutatedNote.previousFrontmatter", () => {
    const previousFm = makeFrontmatter({ tags: [makeTag("before")] });
    const note = makeNote({ frontmatter: makeFrontmatter({ tags: [makeTag("before"), makeTag("after")] }) });
    const mutated = makeMutatedNote({ note, previousFrontmatter: previousFm });
    const now = makeTimestamp(5000);

    const req = buildTagChipSaveRequest(mutated, now);

    expect(req.previousFrontmatter).toEqual(previousFm);
  });

  test("SaveNoteRequested.previousFrontmatter is never null in this workflow", () => {
    const previousFm = makeFrontmatter({ tags: [] });
    const note = makeNote();
    const mutated = makeMutatedNote({ note, previousFrontmatter: previousFm });
    const now = makeTimestamp(5000);

    const req = buildTagChipSaveRequest(mutated, now);

    expect(req.previousFrontmatter).not.toBeNull();
  });
});

// ── SaveNoteRequested structure ────────────────────────────────────────────

describe("buildTagChipSaveRequest — SaveNoteRequested structure", () => {
  test("kind is 'save-note-requested'", () => {
    const previousFm = makeFrontmatter();
    const note = makeNote();
    const mutated = makeMutatedNote({ note, previousFrontmatter: previousFm });
    const now = makeTimestamp(5000);

    const req = buildTagChipSaveRequest(mutated, now);

    expect(req.kind).toBe("save-note-requested");
  });

  test("noteId matches MutatedNote.note.id", () => {
    const noteId = makeNoteId("2026-04-30-130000-001");
    const previousFm = makeFrontmatter();
    const note = makeNote({ id: noteId });
    const mutated = makeMutatedNote({ note, previousFrontmatter: previousFm });
    const now = makeTimestamp(5000);

    const req = buildTagChipSaveRequest(mutated, now);

    expect(req.noteId).toEqual(noteId);
  });

  test("frontmatter matches MutatedNote.note.frontmatter (post-mutation)", () => {
    const previousFm = makeFrontmatter({ tags: [] });
    const mutatedFm = makeFrontmatter({ tags: [makeTag("new-tag")] });
    const note = makeNote({ frontmatter: mutatedFm });
    const mutated = makeMutatedNote({ note, previousFrontmatter: previousFm });
    const now = makeTimestamp(5000);

    const req = buildTagChipSaveRequest(mutated, now);

    expect(req.frontmatter).toEqual(mutatedFm);
  });

  test("is pure: same inputs produce identical output", () => {
    const previousFm = makeFrontmatter({ tags: [makeTag("a")] });
    const note = makeNote({ frontmatter: makeFrontmatter({ tags: [makeTag("a"), makeTag("b")] }) });
    const mutated = makeMutatedNote({ note, previousFrontmatter: previousFm });
    const now = makeTimestamp(5000);

    const req1 = buildTagChipSaveRequest(mutated, now);
    const req2 = buildTagChipSaveRequest(mutated, now);

    expect(req1).toEqual(req2);
  });
});
