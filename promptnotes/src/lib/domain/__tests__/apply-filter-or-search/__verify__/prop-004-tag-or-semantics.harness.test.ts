/**
 * PROP-004: Tag OR within set (carry-forward F-1c-100).
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * Two assertions per F-1c-100 resolution:
 *   (a) When criteria.tags is non-empty → snapshot ∈ ids iff at least one tag matches.
 *   (b) When criteria.tags is empty → no-op (all candidate snapshots pass).
 *
 * REQ-008
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
import type { Feed, FilterCriteria, SortOrder } from "promptnotes-domain-types/curate/aggregates";
import type { AppliedFilter } from "promptnotes-domain-types/curate/stages";
import { applyFilterOrSearch } from "$lib/domain/apply-filter-or-search/apply-filter-or-search";
import { arbTag, arbNoteId, arbTimestamp } from "./_arbitraries";

const bd = (s: string): Body => s as unknown as Body;

function makeSnap(noteIdStr: string, tags: Tag[], updatedAt: number): NoteFileSnapshot {
  const ts = (ms: number): Timestamp => ({ epochMillis: ms }) as unknown as Timestamp;
  return {
    noteId: noteIdStr as unknown as NoteId,
    body: bd("body"),
    frontmatter: {
      tags,
      createdAt: ts(1000),
      updatedAt: ts(updatedAt),
    } as unknown as Frontmatter,
    filePath: `/vault/${noteIdStr}.md`,
    fileMtime: ts(updatedAt),
  };
}

function makeFeed(noteIdStrs: string[]): Feed {
  const sortOrder: SortOrder = { field: "timestamp", direction: "desc" };
  return {
    noteRefs: noteIdStrs as unknown as readonly NoteId[],
    filterCriteria: { tags: [], frontmatterFields: new Map() } as FilterCriteria,
    searchQuery: null,
    sortOrder,
  };
}

function makeApplied(tags: readonly Tag[]): AppliedFilter {
  const sortOrder: SortOrder = { field: "timestamp", direction: "desc" };
  return {
    kind: "AppliedFilter",
    criteria: { tags, frontmatterFields: new Map() } as FilterCriteria,
    query: null,
    sortOrder,
  };
}

describe("PROP-004(a): non-empty criteria.tags → snapshot ∈ ids iff at least one tag matches", () => {
  test(
    "∀ (snapshot-set, tagFilter non-empty): ids contains exactly those snapshots satisfying OR predicate",
    () => {
      fc.assert(
        fc.property(
          // Generate a non-empty set of filter tags
          fc.array(arbTag(), { minLength: 1, maxLength: 3 }),
          // Generate up to 10 snapshots each with 0-3 tags from an extended pool
          fc.array(
            fc.record({
              id: arbNoteId(),
              tags: fc.array(arbTag(), { maxLength: 3 }),
              updatedAt: arbTimestamp(),
            }),
            { maxLength: 10 },
          ),
          (filterTags, snapshotDefs) => {
            // Deduplicate snapshot IDs
            const seen = new Set<string>();
            const uniqueDefs = snapshotDefs.filter((d) => {
              if (seen.has(d.id as string)) return false;
              seen.add(d.id as string);
              return true;
            });

            const snapshots = uniqueDefs.map((d, i) =>
              makeSnap(d.id as string, d.tags, 1000 + i),
            );
            const noteIdStrs = uniqueDefs.map((d) => d.id as string);

            const feed = makeFeed(noteIdStrs);
            const applied = makeApplied(filterTags);
            const result = applyFilterOrSearch(feed, applied, snapshots);
            const resultIds = new Set(result.ids as readonly string[]);

            const filterTagSet = new Set(filterTags as readonly string[]);

            for (const snap of snapshots) {
              const snapId = snap.noteId as unknown as string;
              const hasMatch = (snap.frontmatter.tags as readonly string[]).some((t) =>
                filterTagSet.has(t),
              );
              if (hasMatch && !resultIds.has(snapId)) return false; // should be included
              if (!hasMatch && resultIds.has(snapId)) return false;  // should be excluded
            }
            return true;
          },
        ),
        { numRuns: 200, seed: 4001 },
      );
    },
  );
});

describe("PROP-004(b): empty criteria.tags → no-op (all candidate snapshots pass tag filter)", () => {
  test(
    "∀ (snapshot-set, empty tagFilter): all snapshots in feed.noteRefs that have a snapshot appear in ids",
    () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: arbNoteId(),
              tags: fc.array(arbTag(), { maxLength: 3 }),
              updatedAt: arbTimestamp(),
            }),
            { maxLength: 10 },
          ),
          (snapshotDefs) => {
            const seen = new Set<string>();
            const uniqueDefs = snapshotDefs.filter((d) => {
              if (seen.has(d.id as string)) return false;
              seen.add(d.id as string);
              return true;
            });

            const snapshots = uniqueDefs.map((d, i) =>
              makeSnap(d.id as string, d.tags, 1000 + i),
            );
            const noteIdStrs = uniqueDefs.map((d) => d.id as string);

            const feed = makeFeed(noteIdStrs);
            const applied = makeApplied([]); // EMPTY criteria.tags → no-op
            const result = applyFilterOrSearch(feed, applied, snapshots);
            const resultIds = new Set(result.ids as readonly string[]);

            // Every snapshot that is in both feed.noteRefs and snapshots must appear
            for (const snapId of noteIdStrs) {
              if (!resultIds.has(snapId)) return false;
            }
            return true;
          },
        ),
        { numRuns: 200, seed: 4002 },
      );
    },
  );
});
