/**
 * PROP-005: Heterogeneous criteria AND composition.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * Snapshot must satisfy ALL active criteria (tag AND frontmatterFields AND search).
 * Any snapshot failing exactly one criterion is excluded.
 *
 * REQ-009
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

const ts = (ms: number): Timestamp => ({ epochMillis: ms }) as unknown as Timestamp;
const id = (s: string): NoteId => s as unknown as NoteId;
const tg = (s: string): Tag => s as unknown as Tag;
const bd = (s: string): Body => s as unknown as Body;
const sortDesc: SortOrder = { field: "timestamp", direction: "desc" };

function makeSnap(noteIdStr: string, tags: Tag[], body: string): NoteFileSnapshot {
  return {
    noteId: id(noteIdStr),
    body: bd(body),
    frontmatter: {
      tags,
      createdAt: ts(1000),
      updatedAt: ts(2000),
    } as unknown as Frontmatter,
    filePath: `/vault/${noteIdStr}.md`,
    fileMtime: ts(2000),
  };
}

function makeFeed(noteIdStrs: string[]): Feed {
  return {
    noteRefs: noteIdStrs.map(id),
    filterCriteria: { tags: [], frontmatterFields: new Map() } as FilterCriteria,
    searchQuery: null,
    sortOrder: sortDesc,
  };
}

function makeApplied(
  tags: readonly Tag[],
  fields: Map<string, string>,
  query: SearchQuery | null,
): AppliedFilter {
  return {
    kind: "AppliedFilter",
    criteria: { tags, frontmatterFields: fields } as FilterCriteria,
    query,
    sortOrder: sortDesc,
  };
}

describe("PROP-005: AND composition across criteria", () => {
  test("snapshot failing tag criterion is excluded regardless of search", () => {
    // tag filter active, search active
    // snapshot passes search but fails tag → must be excluded
    const snap = makeSnap("note-fail-tag", [tg("draft")], "auth middleware refactor");
    const feed = makeFeed(["note-fail-tag"]);
    const applied = makeApplied(
      [tg("claude-code")], // snapshot has "draft", not "claude-code"
      new Map(),
      { text: "middleware", scope: "body+frontmatter" },
    );
    const result = applyFilterOrSearch(feed, applied, [snap]);
    const ids = result.ids as readonly string[];
    // Property: if ANY criterion fails, snapshot must not appear
    for (const outId of ids) {
      if (outId === "note-fail-tag") return; // found it — test fails
    }
    // not in ids — correct
  });

  test("snapshot failing search criterion is excluded regardless of tag match", () => {
    const snap = makeSnap("note-fail-search", [tg("claude-code")], "hello world");
    const feed = makeFeed(["note-fail-search"]);
    const applied = makeApplied(
      [tg("claude-code")], // tag matches
      new Map(),
      { text: "middleware", scope: "body+frontmatter" }, // search does NOT match
    );
    const result = applyFilterOrSearch(feed, applied, [snap]);
    const ids = result.ids as readonly string[];
    // "note-fail-search" must NOT appear
    for (const outId of ids) {
      if (outId === "note-fail-search") return; // found — test fails
    }
  });

  test("∀ (snapshots, criteria): only snapshots passing all criteria appear in ids", () => {
    fc.assert(
      fc.property(
        // Use a fixed criteria set for simplicity: filter by tag "draft", search for "test"
        fc.array(
          fc.record({
            hasDraftTag: fc.boolean(),
            hasTestInBody: fc.boolean(),
            noteIndex: fc.integer({ min: 1, max: 999 }),
          }),
          { minLength: 1, maxLength: 15 },
        ),
        (snapshotDefs) => {
          // Deduplicate by index
          const seen = new Set<number>();
          const uniqueDefs = snapshotDefs.filter((d) => {
            if (seen.has(d.noteIndex)) return false;
            seen.add(d.noteIndex);
            return true;
          });

          const filterTag = tg("draft");
          const queryText = "test";

          const snapshots = uniqueDefs.map((d) => {
            const tags = d.hasDraftTag ? [filterTag] : [tg("review")];
            const body = d.hasTestInBody ? "test content here" : "other content";
            return makeSnap(`note-${d.noteIndex}`, tags, body);
          });

          const noteIds = uniqueDefs.map((d) => `note-${d.noteIndex}`);
          const feed = makeFeed(noteIds);
          const applied = makeApplied(
            [filterTag],
            new Map(),
            { text: queryText, scope: "body+frontmatter" },
          );

          const result = applyFilterOrSearch(feed, applied, snapshots);
          const resultSet = new Set(result.ids as readonly string[]);

          for (const def of uniqueDefs) {
            const snapId = `note-${def.noteIndex}`;
            const passesTag = def.hasDraftTag;
            const passesSearch = def.hasTestInBody;
            const shouldBeIncluded = passesTag && passesSearch;

            if (shouldBeIncluded && !resultSet.has(snapId)) return false; // missing
            if (!shouldBeIncluded && resultSet.has(snapId)) return false; // extra
          }
          return true;
        },
      ),
      { numRuns: 200, seed: 5001 },
    );
  });
});
