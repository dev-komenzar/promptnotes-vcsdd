/**
 * purity.test.ts — Referential transparency tests.
 *
 * REQ-015: Both parseFilterInput and applyFilterOrSearch are referentially transparent.
 * - Same arguments always produce same result.
 * - No I/O, no clock reads, no mutations.
 */

import { describe, test, expect } from "bun:test";
import type {
  Body,
  Frontmatter,
  NoteId,
  Tag,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type {
  Feed,
  FilterCriteria,
  SortOrder,
} from "promptnotes-domain-types/curate/aggregates";
import type { AppliedFilter, UnvalidatedFilterInput } from "promptnotes-domain-types/curate/stages";
import { parseFilterInput } from "$lib/domain/apply-filter-or-search/parse-filter-input";
import { applyFilterOrSearch } from "$lib/domain/apply-filter-or-search/apply-filter-or-search";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ts = (ms: number): Timestamp => ({ epochMillis: ms }) as unknown as Timestamp;
const id = (s: string): NoteId => s as unknown as NoteId;
const tg = (s: string): Tag => s as unknown as Tag;
const bd = (s: string): Body => s as unknown as Body;

const sortDesc: SortOrder = { field: "timestamp", direction: "desc" };

function makeInput(tagsRaw: string[]): UnvalidatedFilterInput {
  return {
    kind: "UnvalidatedFilterInput",
    tagsRaw,
    fieldsRaw: new Map(),
    searchTextRaw: null,
    sortOrder: sortDesc,
  };
}

function makeApplied(): AppliedFilter {
  return {
    kind: "AppliedFilter",
    criteria: {
      tags: [tg("draft")],
      frontmatterFields: new Map(),
    } as FilterCriteria,
    query: null,
    sortOrder: sortDesc,
  };
}

function makeSnapshot(noteIdStr: string): NoteFileSnapshot {
  return {
    noteId: id(noteIdStr),
    body: bd("body content"),
    frontmatter: {
      tags: [tg("draft")],
      createdAt: ts(1000),
      updatedAt: ts(2000),
    } as unknown as Frontmatter,
    filePath: `/vault/${noteIdStr}.md`,
    fileMtime: ts(2000),
  };
}

function makeFeed(noteRefs: string[]): Feed {
  return {
    noteRefs: noteRefs.map(id),
    filterCriteria: { tags: [], frontmatterFields: new Map() } as FilterCriteria,
    searchQuery: null,
    sortOrder: sortDesc,
  };
}

// ── REQ-015: Referential transparency ────────────────────────────────────────

describe("REQ-015: parseFilterInput is referentially transparent", () => {
  test("called twice with same args produces deepEqual results", () => {
    const input = makeInput(["draft", "review"]);
    const r1 = parseFilterInput(input);
    const r2 = parseFilterInput(input);
    expect(r1).toEqual(r2);
  });

  test("called on error input: same Err each time", () => {
    const input = makeInput([""]);
    const r1 = parseFilterInput(input);
    const r2 = parseFilterInput(input);
    expect(r1).toEqual(r2);
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
  });

  test("does not mutate the input argument", () => {
    const input = makeInput(["draft"]);
    const originalTagsRaw = [...input.tagsRaw];
    parseFilterInput(input);
    expect(input.tagsRaw).toEqual(originalTagsRaw);
  });

  test("does not mutate the input.fieldsRaw Map", () => {
    const fields = new Map([["status", "open"]]);
    const input: UnvalidatedFilterInput = {
      kind: "UnvalidatedFilterInput",
      tagsRaw: ["draft"],
      fieldsRaw: fields,
      searchTextRaw: null,
      sortOrder: sortDesc,
    };
    const beforeSize = fields.size;
    parseFilterInput(input);
    expect(fields.size).toBe(beforeSize);
    expect(fields.get("status")).toBe("open");
  });

  test("Object.freeze on input does not cause parseFilterInput to throw", () => {
    const input = Object.freeze(makeInput(["draft"]));
    expect(() => parseFilterInput(input as UnvalidatedFilterInput)).not.toThrow();
  });
});

describe("REQ-015: applyFilterOrSearch is referentially transparent", () => {
  test("called twice with same args produces deepEqual results", () => {
    const snaps = [makeSnapshot("note-aaa"), makeSnapshot("note-bbb")];
    const feed = makeFeed(["note-aaa", "note-bbb"]);
    const applied = makeApplied();
    const r1 = applyFilterOrSearch(feed, applied, snaps);
    const r2 = applyFilterOrSearch(feed, applied, snaps);
    expect(r1).toEqual(r2);
  });

  test("called three times: all results identical", () => {
    const snaps = [makeSnapshot("note-xyz")];
    const feed = makeFeed(["note-xyz"]);
    const applied = makeApplied();
    const results = [
      applyFilterOrSearch(feed, applied, snaps),
      applyFilterOrSearch(feed, applied, snaps),
      applyFilterOrSearch(feed, applied, snaps),
    ];
    expect(results[0]).toEqual(results[1]);
    expect(results[1]).toEqual(results[2]);
  });

  test("does not mutate the feed argument", () => {
    const snaps = [makeSnapshot("note-aaa")];
    const feed = makeFeed(["note-aaa"]);
    const originalNoteRefs = [...feed.noteRefs];
    const applied = makeApplied();
    applyFilterOrSearch(feed, applied, snaps);
    expect(feed.noteRefs).toEqual(originalNoteRefs);
  });

  test("does not mutate the applied argument", () => {
    const snaps = [makeSnapshot("note-aaa")];
    const feed = makeFeed(["note-aaa"]);
    const applied = makeApplied();
    const originalTags = [...applied.criteria.tags];
    applyFilterOrSearch(feed, applied, snaps);
    expect(applied.criteria.tags).toEqual(originalTags);
  });

  test("does not mutate the snapshots array", () => {
    const snaps = [makeSnapshot("note-aaa"), makeSnapshot("note-bbb")];
    const feed = makeFeed(["note-aaa", "note-bbb"]);
    const applied = makeApplied();
    const originalLength = snaps.length;
    const originalFirst = snaps[0];
    applyFilterOrSearch(feed, applied, snaps);
    expect(snaps.length).toBe(originalLength);
    expect(snaps[0]).toBe(originalFirst);
  });

  test("Object.freeze on inputs does not cause applyFilterOrSearch to throw", () => {
    const snaps = Object.freeze([Object.freeze(makeSnapshot("note-aaa"))]);
    const feed = Object.freeze(makeFeed(["note-aaa"]));
    const applied = Object.freeze(makeApplied());
    expect(() =>
      applyFilterOrSearch(
        feed as Feed,
        applied as AppliedFilter,
        snaps as readonly NoteFileSnapshot[],
      ),
    ).not.toThrow();
  });
});

describe("REQ-015: no I/O, no Date.now, no Math.random inside either function", () => {
  test("parseFilterInput does not call Date.now (patched sentinel)", () => {
    // Patch Date.now to throw if called — pure function must not reach it
    const orig = Date.now;
    let called = false;
    Date.now = () => {
      called = true;
      return orig();
    };
    try {
      parseFilterInput(makeInput(["draft"]));
      expect(called).toBe(false);
    } finally {
      Date.now = orig;
    }
  });

  test("applyFilterOrSearch does not call Date.now (patched sentinel)", () => {
    const orig = Date.now;
    let called = false;
    Date.now = () => {
      called = true;
      return orig();
    };
    try {
      const snaps = [makeSnapshot("note-aaa")];
      const feed = makeFeed(["note-aaa"]);
      const applied = makeApplied();
      applyFilterOrSearch(feed, applied, snaps);
      expect(called).toBe(false);
    } finally {
      Date.now = orig;
    }
  });

  test("parseFilterInput does not call Math.random (patched sentinel)", () => {
    const orig = Math.random;
    let called = false;
    Math.random = () => {
      called = true;
      return orig();
    };
    try {
      parseFilterInput(makeInput(["review"]));
      expect(called).toBe(false);
    } finally {
      Math.random = orig;
    }
  });

  test("applyFilterOrSearch does not call Math.random (patched sentinel)", () => {
    const orig = Math.random;
    let called = false;
    Math.random = () => {
      called = true;
      return orig();
    };
    try {
      const snaps = [makeSnapshot("note-aaa")];
      const feed = makeFeed(["note-aaa"]);
      const applied = makeApplied();
      applyFilterOrSearch(feed, applied, snaps);
      expect(called).toBe(false);
    } finally {
      Math.random = orig;
    }
  });
});
