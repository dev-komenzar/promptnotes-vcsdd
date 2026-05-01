/**
 * step1-load-current-note.test.ts — Unit tests for loadCurrentNote
 *
 * REQ-TCU-005: Error Path — note not in Curate snapshot store
 * REQ-TCU-006: Error Path — snapshot hydration failure
 *
 * PROP-TCU-010: Not-found error returns correct SaveError shape
 * PROP-TCU-011: Hydration-fail error returns correct SaveError shape
 *
 * RED phase: imports from non-existent implementation file.
 * Module resolution failure is valid RED evidence.
 */

import { describe, test, expect } from "bun:test";
import type {
  NoteId,
  Tag,
  Timestamp,
  Frontmatter,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { NoteFileSnapshot, HydrationFailureReason } from "promptnotes-domain-types/shared/snapshots";
import type { Result } from "promptnotes-domain-types/util/result";
import type { SaveErrorDelta } from "./_deltas";

import { loadCurrentNote } from "../../tag-chip-update/load-current-note";

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
    body: "hello body" as unknown,
    frontmatter: opts?.frontmatter ?? makeFrontmatter(),
  } as Note;
}
function makeSnapshot(noteId: NoteId): NoteFileSnapshot {
  return {
    noteId,
    filePath: `/vault/${noteId}.md`,
    frontmatter: makeFrontmatter(),
    bodyPreview: "hello body",
    fileSize: 42,
    lastModifiedAt: makeTimestamp(2000),
  } as unknown as NoteFileSnapshot;
}

// ── REQ-TCU-005: note not in snapshot store ───────────────────────────────

describe("REQ-TCU-005: loadCurrentNote — note not found", () => {
  test("returns Err when getNoteSnapshot returns null", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = {
      clockNow: () => makeTimestamp(9999),
      getNoteSnapshot: (_id: NoteId) => null,
      hydrateNote: (_snap: NoteFileSnapshot): Result<Note, HydrationFailureReason> => ({
        ok: true,
        value: makeNote({ id: noteId }),
      }),
      publish: () => {},
    };
    const command = { kind: "add" as const, noteId, tag: makeTag("typescript") };

    const result = loadCurrentNote(deps)(command);

    expect(result.ok).toBe(false);
  });

  test("error has kind 'not-found' when snapshot is null", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = {
      clockNow: () => makeTimestamp(9999),
      getNoteSnapshot: (_id: NoteId) => null,
      hydrateNote: (_snap: NoteFileSnapshot): Result<Note, HydrationFailureReason> => ({
        ok: true,
        value: makeNote({ id: noteId }),
      }),
      publish: () => {},
    };
    const command = { kind: "add" as const, noteId, tag: makeTag("typescript") };

    const result = loadCurrentNote(deps)(command);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect((result.error as { kind: string }).kind).toBe("not-found");
  });

  test("Clock.now() is NOT called on not-found path", () => {
    let clockCallCount = 0;
    const noteId = makeNoteId("2026-04-30-120000-001");
    const deps = {
      clockNow: () => {
        clockCallCount++;
        return makeTimestamp(9999);
      },
      getNoteSnapshot: (_id: NoteId) => null,
      hydrateNote: (_snap: NoteFileSnapshot): Result<Note, HydrationFailureReason> => ({
        ok: true,
        value: makeNote({ id: noteId }),
      }),
      publish: () => {},
    };
    const command = { kind: "remove" as const, noteId, tag: makeTag("typescript") };

    loadCurrentNote(deps)(command);

    expect(clockCallCount).toBe(0);
  });
});

// ── REQ-TCU-006: hydration failure ────────────────────────────────────────

describe("REQ-TCU-006: loadCurrentNote — hydration failure", () => {
  test("returns Err when hydrateNote returns Err", () => {
    const noteId = makeNoteId("2026-04-30-120000-002");
    const snapshot = makeSnapshot(noteId);
    const hydrationFailure: HydrationFailureReason = {
      kind: "parse-error",
      detail: "malformed frontmatter",
    } as unknown as HydrationFailureReason;

    const deps = {
      clockNow: () => makeTimestamp(9999),
      getNoteSnapshot: (_id: NoteId) => snapshot,
      hydrateNote: (_snap: NoteFileSnapshot): Result<Note, HydrationFailureReason> => ({
        ok: false,
        error: hydrationFailure,
      }),
      publish: () => {},
    };
    const command = { kind: "add" as const, noteId, tag: makeTag("react") };

    const result = loadCurrentNote(deps)(command);

    expect(result.ok).toBe(false);
  });

  test("error carries hydration-failed cause on hydration error", () => {
    const noteId = makeNoteId("2026-04-30-120000-002");
    const snapshot = makeSnapshot(noteId);
    const hydrationFailure: HydrationFailureReason = {
      kind: "parse-error",
      detail: "malformed frontmatter",
    } as unknown as HydrationFailureReason;

    const deps = {
      clockNow: () => makeTimestamp(9999),
      getNoteSnapshot: (_id: NoteId) => snapshot,
      hydrateNote: (_snap: NoteFileSnapshot): Result<Note, HydrationFailureReason> => ({
        ok: false,
        error: hydrationFailure,
      }),
      publish: () => {},
    };
    const command = { kind: "add" as const, noteId, tag: makeTag("react") };

    const result = loadCurrentNote(deps)(command);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const error = result.error as SaveErrorDelta;
    expect(error.kind).toBe("validation");
    if (error.kind !== "validation") return;
    expect(error.reason.kind).toBe("invariant-violated");
    if (error.reason.kind !== "invariant-violated") return;
    expect(error.reason.cause).toBe("hydration-failed");
  });

  test("Clock.now() is NOT called on hydration-fail path", () => {
    let clockCallCount = 0;
    const noteId = makeNoteId("2026-04-30-120000-002");
    const snapshot = makeSnapshot(noteId);

    const deps = {
      clockNow: () => {
        clockCallCount++;
        return makeTimestamp(9999);
      },
      getNoteSnapshot: (_id: NoteId) => snapshot,
      hydrateNote: (_snap: NoteFileSnapshot): Result<Note, HydrationFailureReason> => ({
        ok: false,
        error: { kind: "parse-error", detail: "bad" } as unknown as HydrationFailureReason,
      }),
      publish: () => {},
    };
    const command = { kind: "add" as const, noteId, tag: makeTag("react") };

    loadCurrentNote(deps)(command);

    expect(clockCallCount).toBe(0);
  });

  test("happy path: returns Ok(Note) when snapshot exists and hydration succeeds", () => {
    const noteId = makeNoteId("2026-04-30-120000-003");
    const snapshot = makeSnapshot(noteId);
    const note = makeNote({ id: noteId });

    const deps = {
      clockNow: () => makeTimestamp(9999),
      getNoteSnapshot: (_id: NoteId) => snapshot,
      hydrateNote: (_snap: NoteFileSnapshot): Result<Note, HydrationFailureReason> => ({
        ok: true,
        value: note,
      }),
      publish: () => {},
    };
    const command = { kind: "add" as const, noteId, tag: makeTag("svelte") };

    const result = loadCurrentNote(deps)(command);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toEqual(noteId);
  });
});
