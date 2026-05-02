/**
 * PROP-014: Case-insensitive substring search semantics.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * snapshot ∈ result.ids iff query.text.toLowerCase() is a substring of
 * (snapshot.body + ' ' + snapshot.frontmatter.tags.join(' ')).toLowerCase()
 * AND all other criteria pass.
 *
 * Includes regex metacharacter literal treatment (.* ( [).
 *
 * REQ-011
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import type {
  Body,
  Frontmatter,
  NoteId,
  Tag,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { Feed, FilterCriteria, SearchQuery, SortOrder } from "promptnotes-domain-types/curate/aggregates";
import type { AppliedFilter } from "promptnotes-domain-types/curate/stages";
import { applyFilterOrSearch } from "$lib/domain/apply-filter-or-search/apply-filter-or-search";
import { arbTag } from "./_arbitraries";

const ts = (ms: number): Timestamp => ({ epochMillis: ms }) as unknown as Timestamp;
const id = (s: string): NoteId => s as unknown as NoteId;
const bd = (s: string): Body => s as unknown as Body;
const sortDesc: SortOrder = { field: "timestamp", direction: "desc" };

function makeSnap(noteIdStr: string, bodyStr: string, tags: Tag[]): NoteFileSnapshot {
  return {
    noteId: id(noteIdStr),
    body: bd(bodyStr),
    frontmatter: {
      tags,
      createdAt: ts(1000),
      updatedAt: ts(2000),
    } as unknown as Frontmatter,
    filePath: `/vault/${noteIdStr}.md`,
    fileMtime: ts(2000),
  };
}

function makeFeedAndApplied(
  noteIdStrs: string[],
  query: SearchQuery | null,
): { feed: Feed; applied: AppliedFilter } {
  const feed: Feed = {
    noteRefs: noteIdStrs as unknown as readonly NoteId[],
    filterCriteria: { tags: [], frontmatterFields: new Map() } as FilterCriteria,
    searchQuery: null,
    sortOrder: sortDesc,
  };
  const applied: AppliedFilter = {
    kind: "AppliedFilter",
    criteria: { tags: [], frontmatterFields: new Map() } as FilterCriteria,
    query,
    sortOrder: sortDesc,
  };
  return { feed, applied };
}

/** The expected match predicate from REQ-011 */
function matchPredicate(snap: NoteFileSnapshot, queryText: string): boolean {
  const haystack = (
    (snap.body as unknown as string) +
    " " +
    (snap.frontmatter.tags as readonly string[]).join(" ")
  ).toLowerCase();
  return haystack.includes(queryText.toLowerCase());
}

describe("PROP-014: case-insensitive substring search semantics", () => {
  test(
    "∀ (snapshots, queryText): result.ids iff matchPredicate holds for each snapshot",
    () => {
      fc.assert(
        fc.property(
          // Generate 1-10 snapshots with body content
          fc.array(
            fc.record({
              index: fc.integer({ min: 1, max: 999 }),
              body: fc.string({ maxLength: 50 }),
              tags: fc.array(arbTag(), { maxLength: 3 }),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          // A query text that is non-empty
          fc.string({ minLength: 1, maxLength: 15 }).filter((s) => s.trim().length > 0),
          (snapshotDefs, queryText) => {
            const seen = new Set<number>();
            const uniqueDefs = snapshotDefs.filter((d) => {
              if (seen.has(d.index)) return false;
              seen.add(d.index);
              return true;
            });

            const snapshots = uniqueDefs.map((d) =>
              makeSnap(`note-${String(d.index).padStart(4, "0")}`, d.body, d.tags),
            );
            const noteIds = uniqueDefs.map((d) => `note-${String(d.index).padStart(4, "0")}`);

            const { feed, applied } = makeFeedAndApplied(
              noteIds,
              { text: queryText, scope: "body+frontmatter" },
            );

            const result = applyFilterOrSearch(feed, applied, snapshots);
            const resultSet = new Set(result.ids as readonly string[]);

            for (const snap of snapshots) {
              const snapId = snap.noteId as unknown as string;
              const expected = matchPredicate(snap, queryText);
              if (expected && !resultSet.has(snapId)) return false; // should be included
              if (!expected && resultSet.has(snapId)) return false;  // should be excluded
            }
            return true;
          },
        ),
        { numRuns: 200, seed: 14001 },
      );
    },
  );

  test("regex metacharacter '.' is treated as literal, not wildcard", () => {
    fc.assert(
      fc.property(
        // Body with a literal dot
        fc.string({ maxLength: 30 }).filter((s) => !s.includes(".")),
        (bodySuffix) => {
          const snapWithDot = makeSnap("note-dot", `file.name.ts ${bodySuffix}`, []);
          const snapNoDot = makeSnap("note-nodot", `filename_ts ${bodySuffix}`, []);
          const { feed, applied } = makeFeedAndApplied(
            ["note-dot", "note-nodot"],
            { text: "file.name", scope: "body+frontmatter" },
          );
          const result = applyFilterOrSearch(feed, applied, [snapWithDot, snapNoDot]);
          const ids = result.ids as readonly string[];
          // "file.name" as literal: only note-dot should match
          return ids.includes("note-dot") && !ids.includes("note-nodot");
        },
      ),
      { numRuns: 200, seed: 14002 },
    );
  });

  test("regex metacharacter '*' is treated as literal", () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        (_) => {
          const snapStar = makeSnap("note-star", "foo * bar", []);
          const snapNoStar = makeSnap("note-nostar", "foo bar", []);
          const { feed, applied } = makeFeedAndApplied(
            ["note-star", "note-nostar"],
            { text: "*", scope: "body+frontmatter" },
          );
          const result = applyFilterOrSearch(feed, applied, [snapStar, snapNoStar]);
          const ids = result.ids as readonly string[];
          // '*' as literal: only note-star should match
          return ids.includes("note-star") && !ids.includes("note-nostar");
        },
      ),
      { numRuns: 1, seed: 14003 },
    );
  });

  test("regex metacharacter '[' is treated as literal", () => {
    const snapBracket = makeSnap("note-bracket", "arr[0] access", []);
    const snapNoBracket = makeSnap("note-nobracket", "arr access", []);
    const { feed, applied } = makeFeedAndApplied(
      ["note-bracket", "note-nobracket"],
      { text: "[", scope: "body+frontmatter" },
    );
    fc.assert(
      fc.property(fc.constant(null), (_) => {
        const result = applyFilterOrSearch(feed, applied, [snapBracket, snapNoBracket]);
        const ids = result.ids as readonly string[];
        return ids.includes("note-bracket") && !ids.includes("note-nobracket");
      }),
      { numRuns: 1, seed: 14004 },
    );
  });

  test("search is case-insensitive: UPPERCASE query matches lowercase body", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-z0-9]{1,15}$/),
        (keyword) => {
          const snap = makeSnap("note-aaa", `body with ${keyword} inside`, []);
          const { feed, applied } = makeFeedAndApplied(
            ["note-aaa"],
            { text: keyword.toUpperCase(), scope: "body+frontmatter" },
          );
          const result = applyFilterOrSearch(feed, applied, [snap]);
          return (result.ids as readonly string[]).includes("note-aaa");
        },
      ),
      { numRuns: 200, seed: 14005 },
    );
  });
});
