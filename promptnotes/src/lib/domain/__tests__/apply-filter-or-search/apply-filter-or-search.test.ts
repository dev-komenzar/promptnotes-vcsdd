/**
 * apply-filter-or-search.test.ts — Example-based tests for applyFilterOrSearch.
 *
 * REQ-007: feed.noteRefs is the candidate set
 * REQ-008: Tag filter uses OR within selected tags
 * REQ-009: Heterogeneous criteria use AND composition
 * REQ-010: Frontmatter field filter uses case-sensitive exact match per field
 * REQ-011: Search uses case-insensitive substring match
 * REQ-012: Sort by updatedAt with direction-consistent NoteId tiebreak (DD-1)
 * REQ-013: VisibleNoteIds.hasZeroResults flag
 * REQ-014: No-filter, no-search returns exactly the resolvable intersection
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
  SearchQuery,
  SortOrder,
} from "promptnotes-domain-types/curate/aggregates";
import type { AppliedFilter, VisibleNoteIds } from "promptnotes-domain-types/curate/stages";
import { applyFilterOrSearch } from "$lib/domain/apply-filter-or-search/apply-filter-or-search";

// ── Helpers ───────────────────────────────────────────────────────────────────

const ts = (ms: number): Timestamp => ({ epochMillis: ms }) as unknown as Timestamp;
const id = (s: string): NoteId => s as unknown as NoteId;
const tg = (s: string): Tag => s as unknown as Tag;
const bd = (s: string): Body => s as unknown as Body;

function makeFrontmatter(
  tags: Tag[],
  updatedAt: Timestamp,
  createdAt?: Timestamp,
): Frontmatter {
  return {
    tags,
    createdAt: createdAt ?? updatedAt,
    updatedAt,
  } as unknown as Frontmatter;
}

function makeSnapshot(
  noteIdStr: string,
  bodyStr: string,
  tags: Tag[],
  updatedAtMs: number,
): NoteFileSnapshot {
  return {
    noteId: id(noteIdStr),
    body: bd(bodyStr),
    frontmatter: makeFrontmatter(tags, ts(updatedAtMs)),
    filePath: `/vault/${noteIdStr}.md`,
    fileMtime: ts(updatedAtMs),
  };
}

const sortDesc: SortOrder = { field: "timestamp", direction: "desc" };
const sortAsc: SortOrder = { field: "timestamp", direction: "asc" };

function makeFeed(noteRefs: string[], sortOrder: SortOrder = sortDesc): Feed {
  return {
    noteRefs: noteRefs.map(id),
    filterCriteria: {
      tags: [],
      frontmatterFields: new Map(),
    } as FilterCriteria,
    searchQuery: null,
    sortOrder,
  };
}

function makeAppliedFilter(
  tags: Tag[] = [],
  frontmatterFields: Map<string, string> = new Map(),
  query: SearchQuery | null = null,
  sortOrder: SortOrder = sortDesc,
): AppliedFilter {
  return {
    kind: "AppliedFilter",
    criteria: { tags, frontmatterFields } as FilterCriteria,
    query,
    sortOrder,
  };
}

// ── REQ-007: feed.noteRefs is the candidate set ───────────────────────────────

describe("REQ-007: feed.noteRefs is the candidate set", () => {
  test("snapshot NOT in feed.noteRefs does not appear in output", () => {
    const snap = makeSnapshot("note-aaa", "body", [tg("draft")], 1000);
    const feed = makeFeed(["note-bbb"]); // "note-aaa" is NOT in noteRefs
    const applied = makeAppliedFilter();
    const result = applyFilterOrSearch(feed, applied, [snap]);
    const ids = result.ids as readonly string[];
    expect(ids).not.toContain("note-aaa");
  });

  test("NoteId in feed.noteRefs but absent from snapshots does NOT appear in output", () => {
    // feed references "note-zzz" but there is no snapshot for it
    const feed = makeFeed(["note-zzz"]);
    const applied = makeAppliedFilter();
    const result = applyFilterOrSearch(feed, applied, []);
    expect(result.ids).toEqual([]);
  });

  test("all output ids are members of both feed.noteRefs and snapshots", () => {
    const snap1 = makeSnapshot("note-aaa", "body1", [], 1000);
    const snap2 = makeSnapshot("note-bbb", "body2", [], 2000);
    const snap3 = makeSnapshot("note-ccc", "body3", [], 3000); // NOT in feed
    const feed = makeFeed(["note-aaa", "note-bbb"]);
    const applied = makeAppliedFilter();
    const result = applyFilterOrSearch(feed, applied, [snap1, snap2, snap3]);
    const ids = result.ids as readonly string[];
    expect(ids).not.toContain("note-ccc");
    for (const id of ids) {
      // Every output id must have a matching snapshot
      const hasSnap = [snap1, snap2].some((s) => (s.noteId as unknown as string) === id);
      expect(hasSnap).toBe(true);
    }
  });

  test("for every id in result.ids, there exists a matching snapshot", () => {
    const snap = makeSnapshot("note-abc", "text", [], 5000);
    const feed = makeFeed(["note-abc", "note-missing"]);
    const applied = makeAppliedFilter();
    const result = applyFilterOrSearch(feed, applied, [snap]);
    const ids = result.ids as readonly string[];
    // "note-missing" should not appear (no snapshot)
    expect(ids).not.toContain("note-missing");
    // "note-abc" should appear (snapshot exists and it's in noteRefs)
    expect(ids).toContain("note-abc");
  });
});

// ── REQ-008: Tag filter uses OR within selected tags ──────────────────────────

describe("REQ-008: tag filter uses OR within selected tags", () => {
  test("snapshot with matching tag is included", () => {
    const snap = makeSnapshot("note-aaa", "body", [tg("claude-code")], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([tg("claude-code")]);
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).toContain(id("note-aaa"));
  });

  test("snapshot with only one matching tag is included (OR semantics)", () => {
    const snap = makeSnapshot("note-aaa", "body", [tg("review")], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([tg("claude-code"), tg("review")]);
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).toContain(id("note-aaa"));
  });

  test("snapshot with no matching tags is excluded", () => {
    const snap = makeSnapshot("note-aaa", "body", [tg("draft")], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([tg("claude-code"), tg("review")]);
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).not.toContain(id("note-aaa"));
  });

  test("snapshot with superset of filter tags is included", () => {
    const snap = makeSnapshot("note-aaa", "body", [tg("claude-code"), tg("review")], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([tg("claude-code")]);
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).toContain(id("note-aaa"));
  });

  test("empty criteria.tags: all snapshots pass the tag filter (no-op)", () => {
    const snaps = [
      makeSnapshot("note-aaa", "body1", [tg("draft")], 1000),
      makeSnapshot("note-bbb", "body2", [tg("review")], 2000),
      makeSnapshot("note-ccc", "body3", [], 3000),
    ];
    const feed = makeFeed(["note-aaa", "note-bbb", "note-ccc"]);
    const applied = makeAppliedFilter([]); // no tags = no-op
    const result = applyFilterOrSearch(feed, applied, snaps);
    expect(result.ids.length).toBe(3);
  });
});

// ── REQ-009: Heterogeneous criteria use AND composition ───────────────────────

describe("REQ-009: heterogeneous criteria use AND composition", () => {
  test("snapshot fails tag filter → excluded even if frontmatterFields would pass", () => {
    const fields = new Map([["status", "open"]]);
    const snap = makeSnapshot("note-aaa", "body", [tg("draft")], 1000);
    // Add status=open to this snapshot's frontmatter manually
    const snapWithField: NoteFileSnapshot = {
      ...snap,
      frontmatter: {
        tags: [tg("draft")],
        createdAt: ts(1000),
        updatedAt: ts(1000),
        status: "open",
      } as unknown as Frontmatter,
    };
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([tg("claude-code")], fields);
    const result = applyFilterOrSearch(feed, applied, [snapWithField]);
    // tag filter fails (draft vs claude-code)
    expect(result.ids).not.toContain(id("note-aaa"));
  });

  test("snapshot fails search filter → excluded even if tag filter passes", () => {
    const snap = makeSnapshot("note-aaa", "hello world", [tg("claude-code")], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter(
      [tg("claude-code")],
      new Map(),
      { text: "middleware", scope: "body+frontmatter" },
    );
    const result = applyFilterOrSearch(feed, applied, [snap]);
    // search fails (no "middleware" in body or tags)
    expect(result.ids).not.toContain(id("note-aaa"));
  });

  test("only snapshots satisfying all active criteria simultaneously appear in output", () => {
    const snapPass = makeSnapshot("note-pass", "auth middleware", [tg("claude-code")], 2000);
    const snapFailTag = makeSnapshot("note-fail-tag", "auth middleware", [tg("draft")], 1000);
    const snapFailSearch = makeSnapshot("note-fail-search", "hello world", [tg("claude-code")], 3000);
    const feed = makeFeed(["note-pass", "note-fail-tag", "note-fail-search"]);
    const applied = makeAppliedFilter(
      [tg("claude-code")],
      new Map(),
      { text: "middleware", scope: "body+frontmatter" },
    );
    const result = applyFilterOrSearch(feed, applied, [snapPass, snapFailTag, snapFailSearch]);
    const ids = result.ids as readonly string[];
    expect(ids).toContain("note-pass");
    expect(ids).not.toContain("note-fail-tag");
    expect(ids).not.toContain("note-fail-search");
  });

  test("inactive criterion is treated as universal pass (tags-only active)", () => {
    const snap = makeSnapshot("note-aaa", "body", [tg("claude-code")], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([tg("claude-code")]); // search=null, fields=empty
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).toContain(id("note-aaa"));
  });
});

// ── REQ-010: Frontmatter field filter ─────────────────────────────────────────

describe("REQ-010: frontmatter field filter uses case-sensitive exact match", () => {
  function makeSnapshotWithField(
    noteIdStr: string,
    fieldKey: string,
    fieldValue: string,
  ): NoteFileSnapshot {
    return {
      noteId: id(noteIdStr),
      body: bd("body"),
      frontmatter: {
        tags: [],
        createdAt: ts(1000),
        updatedAt: ts(1000),
        [fieldKey]: fieldValue,
      } as unknown as Frontmatter,
      filePath: `/vault/${noteIdStr}.md`,
      fileMtime: ts(1000),
    };
  }

  test("exact match passes", () => {
    const snap = makeSnapshotWithField("note-aaa", "status", "open");
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([], new Map([["status", "open"]]));
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).toContain(id("note-aaa"));
  });

  test("case mismatch fails (case-sensitive: 'open' !== 'Open')", () => {
    const snap = makeSnapshotWithField("note-aaa", "status", "Open"); // capital O
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([], new Map([["status", "open"]])); // lowercase
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).not.toContain(id("note-aaa"));
  });

  test("value mismatch fails", () => {
    const snap = makeSnapshotWithField("note-aaa", "status", "closed");
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([], new Map([["status", "open"]]));
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).not.toContain(id("note-aaa"));
  });

  test("AND across multiple map entries: both must match", () => {
    const snap: NoteFileSnapshot = {
      noteId: id("note-aaa"),
      body: bd("body"),
      frontmatter: {
        tags: [],
        createdAt: ts(1000),
        updatedAt: ts(1000),
        status: "open",
        priority: "high",
      } as unknown as Frontmatter,
      filePath: "/vault/note-aaa.md",
      fileMtime: ts(1000),
    };
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter(
      [],
      new Map([["status", "open"], ["priority", "high"]]),
    );
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).toContain(id("note-aaa"));
  });

  test("AND across multiple map entries: partial match fails", () => {
    const snap: NoteFileSnapshot = {
      noteId: id("note-aaa"),
      body: bd("body"),
      frontmatter: {
        tags: [],
        createdAt: ts(1000),
        updatedAt: ts(1000),
        status: "open",
        priority: "low", // doesn't match "high"
      } as unknown as Frontmatter,
      filePath: "/vault/note-aaa.md",
      fileMtime: ts(1000),
    };
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter(
      [],
      new Map([["status", "open"], ["priority", "high"]]),
    );
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).not.toContain(id("note-aaa"));
  });

  test("empty frontmatterFields: all snapshots pass (no-op)", () => {
    const snap = makeSnapshot("note-aaa", "body", [], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([], new Map()); // empty = no-op
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).toContain(id("note-aaa"));
  });
});

// ── REQ-011: Search uses case-insensitive substring match ─────────────────────

describe("REQ-011: search uses case-insensitive substring match", () => {
  test("query.text found in body → snapshot included", () => {
    const snap = makeSnapshot("note-aaa", "Refactor the auth middleware to...", [], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([], new Map(), { text: "middleware", scope: "body+frontmatter" });
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).toContain(id("note-aaa"));
  });

  test("case-insensitive: MIDDLEWARE matches 'middleware' in body", () => {
    const snap = makeSnapshot("note-aaa", "auth middleware refactor", [], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([], new Map(), { text: "MIDDLEWARE", scope: "body+frontmatter" });
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).toContain(id("note-aaa"));
  });

  test("query.text found in frontmatter tag names → snapshot included", () => {
    const snap = makeSnapshot("note-aaa", "body content", [tg("claude-code")], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([], new Map(), { text: "claude", scope: "body+frontmatter" });
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).toContain(id("note-aaa"));
  });

  test("query.text not found in body or tags → snapshot excluded", () => {
    const snap = makeSnapshot("note-aaa", "hello world", [tg("draft")], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([], new Map(), { text: "xyzqwerty", scope: "body+frontmatter" });
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).not.toContain(id("note-aaa"));
  });

  test("special characters treated as literals, not regex: dot matches literal dot", () => {
    const snap = makeSnapshot("note-aaa", "file.name.ts", [], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter([], new Map(), { text: ".", scope: "body+frontmatter" });
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).toContain(id("note-aaa"));
  });

  test("special characters: asterisk treated as literal asterisk", () => {
    const snap1 = makeSnapshot("note-has-star", "foo * bar", [], 1000);
    const snap2 = makeSnapshot("note-no-star", "foo bar", [], 2000);
    const feed = makeFeed(["note-has-star", "note-no-star"]);
    const applied = makeAppliedFilter([], new Map(), { text: "*", scope: "body+frontmatter" });
    const result = applyFilterOrSearch(feed, applied, [snap1, snap2]);
    const ids = result.ids as readonly string[];
    expect(ids).toContain("note-has-star");
    expect(ids).not.toContain("note-no-star");
  });

  test("special characters: open paren treated as literal", () => {
    const snap1 = makeSnapshot("note-has-paren", "foo(bar)", [], 1000);
    const snap2 = makeSnapshot("note-no-paren", "foobar", [], 2000);
    const feed = makeFeed(["note-has-paren", "note-no-paren"]);
    const applied = makeAppliedFilter([], new Map(), { text: "(", scope: "body+frontmatter" });
    const result = applyFilterOrSearch(feed, applied, [snap1, snap2]);
    const ids = result.ids as readonly string[];
    expect(ids).toContain("note-has-paren");
    expect(ids).not.toContain("note-no-paren");
  });

  test("search does NOT match timestamps in frontmatter (scope=tags only, per DD-2)", () => {
    // Timestamps are not natural search targets; the search scope for frontmatter is tags only
    const snap = makeSnapshot("note-aaa", "body content", [], 1_700_000_000_000);
    const feed = makeFeed(["note-aaa"]);
    // Searching for a numeric string that would match epochMillis if timestamps were searched
    const applied = makeAppliedFilter([], new Map(), { text: "1700000000000", scope: "body+frontmatter" });
    const result = applyFilterOrSearch(feed, applied, [snap]);
    // Should NOT find it since timestamps are not searched
    expect(result.ids).not.toContain(id("note-aaa"));
  });
});

// ── REQ-012: Sort by updatedAt with direction-consistent NoteId tiebreak ──────

describe("REQ-012: sort by updatedAt with direction-consistent NoteId tiebreak (DD-1)", () => {
  test("desc sort: later updatedAt appears before earlier", () => {
    const snaps = [
      makeSnapshot("note-aaa", "body", [], 1000), // earlier
      makeSnapshot("note-bbb", "body", [], 2000), // later
    ];
    const feed = makeFeed(["note-aaa", "note-bbb"], sortDesc);
    const applied = makeAppliedFilter([], new Map(), null, sortDesc);
    const result = applyFilterOrSearch(feed, applied, snaps);
    const ids = result.ids as readonly string[];
    expect(ids[0]).toBe("note-bbb"); // later first in desc
    expect(ids[1]).toBe("note-aaa");
  });

  test("asc sort: earlier updatedAt appears before later", () => {
    const snaps = [
      makeSnapshot("note-aaa", "body", [], 2000), // later
      makeSnapshot("note-bbb", "body", [], 1000), // earlier
    ];
    const feed = makeFeed(["note-aaa", "note-bbb"], sortAsc);
    const applied = makeAppliedFilter([], new Map(), null, sortAsc);
    const result = applyFilterOrSearch(feed, applied, snaps);
    const ids = result.ids as readonly string[];
    expect(ids[0]).toBe("note-bbb"); // earlier first in asc
    expect(ids[1]).toBe("note-aaa");
  });

  test("identical updatedAt + direction=asc → tiebreak by NoteId ascending", () => {
    // "note-aaa" < "note-bbb" lexicographically → note-aaa first in asc tiebreak
    const snaps = [
      makeSnapshot("note-bbb", "body", [], 1000), // same timestamp
      makeSnapshot("note-aaa", "body", [], 1000), // same timestamp
    ];
    const feed = makeFeed(["note-aaa", "note-bbb"], sortAsc);
    const applied = makeAppliedFilter([], new Map(), null, sortAsc);
    const result = applyFilterOrSearch(feed, applied, snaps);
    const ids = result.ids as readonly string[];
    expect(ids[0]).toBe("note-aaa"); // lexicographically smaller first (asc)
    expect(ids[1]).toBe("note-bbb");
  });

  test("identical updatedAt + direction=desc → tiebreak by NoteId descending (DD-1)", () => {
    // "note-bbb" > "note-aaa" lexicographically → note-bbb first in desc tiebreak
    const snaps = [
      makeSnapshot("note-aaa", "body", [], 1000), // same timestamp
      makeSnapshot("note-bbb", "body", [], 1000), // same timestamp
    ];
    const feed = makeFeed(["note-aaa", "note-bbb"], sortDesc);
    const applied = makeAppliedFilter([], new Map(), null, sortDesc);
    const result = applyFilterOrSearch(feed, applied, snaps);
    const ids = result.ids as readonly string[];
    expect(ids[0]).toBe("note-bbb"); // lexicographically larger first (desc)
    expect(ids[1]).toBe("note-aaa");
  });

  test("sort is total: same input always produces same output order", () => {
    const snaps = [
      makeSnapshot("note-ccc", "body", [], 3000),
      makeSnapshot("note-aaa", "body", [], 1000),
      makeSnapshot("note-bbb", "body", [], 2000),
    ];
    const feed = makeFeed(["note-aaa", "note-bbb", "note-ccc"], sortDesc);
    const applied = makeAppliedFilter([], new Map(), null, sortDesc);
    const r1 = applyFilterOrSearch(feed, applied, snaps);
    const r2 = applyFilterOrSearch(feed, applied, snaps);
    expect(r1.ids).toEqual(r2.ids);
  });

  test("sort is by updatedAt not createdAt", () => {
    // note-aaa: created=5000, updated=1000
    // note-bbb: created=1000, updated=5000
    // desc sort should put note-bbb first (higher updatedAt)
    const snapA: NoteFileSnapshot = {
      noteId: id("note-aaa"),
      body: bd("body"),
      frontmatter: {
        tags: [],
        createdAt: ts(5000),
        updatedAt: ts(1000),
      } as unknown as Frontmatter,
      filePath: "/vault/note-aaa.md",
      fileMtime: ts(1000),
    };
    const snapB: NoteFileSnapshot = {
      noteId: id("note-bbb"),
      body: bd("body"),
      frontmatter: {
        tags: [],
        createdAt: ts(1000),
        updatedAt: ts(5000),
      } as unknown as Frontmatter,
      filePath: "/vault/note-bbb.md",
      fileMtime: ts(5000),
    };
    const feed = makeFeed(["note-aaa", "note-bbb"], sortDesc);
    const applied = makeAppliedFilter([], new Map(), null, sortDesc);
    const result = applyFilterOrSearch(feed, applied, [snapA, snapB]);
    const ids = result.ids as readonly string[];
    expect(ids[0]).toBe("note-bbb"); // higher updatedAt first
    expect(ids[1]).toBe("note-aaa");
  });
});

// ── REQ-013: VisibleNoteIds.hasZeroResults flag ───────────────────────────────

describe("REQ-013: VisibleNoteIds.hasZeroResults flag", () => {
  test("ids=[] → hasZeroResults=true", () => {
    const feed = makeFeed([]);
    const applied = makeAppliedFilter();
    const result = applyFilterOrSearch(feed, applied, []);
    expect(result.hasZeroResults).toBe(true);
    expect(result.ids).toEqual([]);
  });

  test("ids=[<any NoteId>] → hasZeroResults=false", () => {
    const snap = makeSnapshot("note-aaa", "body", [], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter();
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.hasZeroResults).toBe(false);
    expect(result.ids.length).toBeGreaterThan(0);
  });

  test("hasZeroResults is never true when ids is non-empty", () => {
    const snap = makeSnapshot("note-aaa", "body", [], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter();
    const result = applyFilterOrSearch(feed, applied, [snap]);
    if (result.ids.length > 0) {
      expect(result.hasZeroResults).toBe(false);
    }
  });

  test("hasZeroResults is never false when ids is empty", () => {
    const feed = makeFeed([]);
    const applied = makeAppliedFilter();
    const result = applyFilterOrSearch(feed, applied, []);
    if (result.ids.length === 0) {
      expect(result.hasZeroResults).toBe(true);
    }
  });

  test("all snapshots filtered out → { ids: [], hasZeroResults: true }", () => {
    const snap = makeSnapshot("note-aaa", "body", [tg("draft")], 1000);
    const feed = makeFeed(["note-aaa"]);
    // Filter for "claude-code" but snapshot only has "draft"
    const applied = makeAppliedFilter([tg("claude-code")]);
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).toEqual([]);
    expect(result.hasZeroResults).toBe(true);
  });
});

// ── REQ-014: No-filter, no-search returns exactly the resolvable intersection ─

describe("REQ-014: no-filter no-search returns exactly the resolvable intersection", () => {
  test("returns exactly the intersection of feed.noteRefs and snapshots[*].noteId", () => {
    const snap1 = makeSnapshot("note-aaa", "body1", [], 1000);
    const snap2 = makeSnapshot("note-bbb", "body2", [], 2000);
    // snap3 is NOT in feed.noteRefs
    const snap3 = makeSnapshot("note-ccc", "body3", [], 3000);
    // "note-ddd" is in feed.noteRefs but NOT in snapshots
    const feed = makeFeed(["note-aaa", "note-bbb", "note-ddd"]);
    const applied = makeAppliedFilter(); // no criteria
    const result = applyFilterOrSearch(feed, applied, [snap1, snap2, snap3]);
    const ids = result.ids as readonly string[];
    // Must contain note-aaa and note-bbb (in both feed and snapshots)
    expect(ids).toContain("note-aaa");
    expect(ids).toContain("note-bbb");
    // Must NOT contain note-ccc (not in feed.noteRefs)
    expect(ids).not.toContain("note-ccc");
    // Must NOT contain note-ddd (no matching snapshot)
    expect(ids).not.toContain("note-ddd");
    // Exactly the intersection (length = 2)
    expect(ids.length).toBe(2);
  });

  test("empty feed.noteRefs → ids=[] regardless of snapshots", () => {
    const snap = makeSnapshot("note-aaa", "body", [], 1000);
    const feed = makeFeed([]);
    const applied = makeAppliedFilter();
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.ids).toEqual([]);
  });

  test("non-empty feed.noteRefs with all snapshots missing → ids=[]", () => {
    const feed = makeFeed(["note-aaa", "note-bbb"]); // no matching snapshots
    const applied = makeAppliedFilter();
    const result = applyFilterOrSearch(feed, applied, []); // empty snapshots
    expect(result.ids).toEqual([]);
  });

  test("result is sorted per REQ-012 when no criteria active", () => {
    const snaps = [
      makeSnapshot("note-bbb", "body", [], 1000),
      makeSnapshot("note-aaa", "body", [], 2000),
    ];
    const feed = makeFeed(["note-aaa", "note-bbb"], sortDesc);
    const applied = makeAppliedFilter([], new Map(), null, sortDesc);
    const result = applyFilterOrSearch(feed, applied, snaps);
    const ids = result.ids as readonly string[];
    expect(ids[0]).toBe("note-aaa"); // higher updatedAt first in desc
    expect(ids[1]).toBe("note-bbb");
  });

  test("hasZeroResults=false when feed contains at least one resolvable snapshot", () => {
    const snap = makeSnapshot("note-aaa", "body", [], 1000);
    const feed = makeFeed(["note-aaa"]);
    const applied = makeAppliedFilter();
    const result = applyFilterOrSearch(feed, applied, [snap]);
    expect(result.hasZeroResults).toBe(false);
  });
});
