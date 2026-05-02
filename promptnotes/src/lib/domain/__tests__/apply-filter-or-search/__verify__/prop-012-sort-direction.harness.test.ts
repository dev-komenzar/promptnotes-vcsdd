/**
 * PROP-012: Sort respects direction — ascending and descending produce reverse
 * orderings for the same input when all updatedAt values are distinct.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * REQ-012
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

const ts = (ms: number): Timestamp => ({ epochMillis: ms }) as unknown as Timestamp;
const id = (s: string): NoteId => s as unknown as NoteId;
const bd = (s: string): Body => s as unknown as Body;

function makeSnap(noteIdStr: string, updatedAtMs: number): NoteFileSnapshot {
  return {
    noteId: id(noteIdStr),
    body: bd("body"),
    frontmatter: {
      tags: [] as Tag[],
      createdAt: ts(1000),
      updatedAt: ts(updatedAtMs),
    } as unknown as Frontmatter,
    filePath: `/vault/${noteIdStr}.md`,
    fileMtime: ts(updatedAtMs),
  };
}

function makeApplied(direction: "desc" | "asc"): AppliedFilter {
  const sortOrder: SortOrder = { field: "timestamp", direction };
  return {
    kind: "AppliedFilter",
    criteria: { tags: [], frontmatterFields: new Map() } as FilterCriteria,
    query: null,
    sortOrder,
  };
}

describe("PROP-012: desc and asc produce reverse orderings when all updatedAt are distinct", () => {
  test(
    "∀ snapshots with distinct updatedAt: idsDesc is the reverse of idsAsc",
    () => {
      fc.assert(
        fc.property(
          // Generate 2-15 snapshots with DISTINCT updatedAt values
          fc.uniqueArray(
            fc.record({
              index: fc.integer({ min: 1, max: 999 }),
              updatedAt: fc.integer({ min: 1, max: 1_000_000_000 }),
            }),
            {
              minLength: 2,
              maxLength: 15,
              selector: (d) => d.updatedAt, // unique by updatedAt
            },
          ),
          (defs) => {
            // Also deduplicate by index
            const seenIdx = new Set<number>();
            const uniqueDefs = defs.filter((d) => {
              if (seenIdx.has(d.index)) return false;
              seenIdx.add(d.index);
              return true;
            });
            if (uniqueDefs.length < 2) return true; // skip trivial

            const snapshots = uniqueDefs.map((d) =>
              makeSnap(`note-${String(d.index).padStart(4, "0")}`, d.updatedAt),
            );
            const noteIds = uniqueDefs.map((d) => `note-${String(d.index).padStart(4, "0")}`);

            const makeFeeds = (direction: "desc" | "asc"): Feed => ({
              noteRefs: noteIds as unknown as readonly NoteId[],
              filterCriteria: { tags: [], frontmatterFields: new Map() } as FilterCriteria,
              searchQuery: null,
              sortOrder: { field: "timestamp", direction },
            });

            const idsDesc = applyFilterOrSearch(
              makeFeeds("desc"),
              makeApplied("desc"),
              snapshots,
            ).ids as readonly string[];

            const idsAsc = applyFilterOrSearch(
              makeFeeds("asc"),
              makeApplied("asc"),
              snapshots,
            ).ids as readonly string[];

            if (idsDesc.length !== idsAsc.length) return false;

            // Reverse of idsDesc should equal idsAsc
            const reversed = [...idsDesc].reverse();
            for (let i = 0; i < reversed.length; i++) {
              if (reversed[i] !== idsAsc[i]) return false;
            }
            return true;
          },
        ),
        { numRuns: 200, seed: 12001 },
      );
    },
  );
});
