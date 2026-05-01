/**
 * PROP-006: Sort total order and direction.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * For direction="desc": ids[i].updatedAt >= ids[i+1].updatedAt
 * For identical updatedAt with direction="desc": ids[i] >= ids[i+1] (NoteId descending)
 * For direction="asc": the inverse holds.
 *
 * REQ-012, DD-1
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

describe("PROP-006: sort total order — desc direction", () => {
  test("∀ snapshots with desc sort: pairwise updatedAt ordering is non-increasing", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            index: fc.integer({ min: 1, max: 999 }),
            updatedAt: fc.integer({ min: 1, max: 1_000_000 }),
          }),
          { minLength: 2, maxLength: 15 },
        ),
        (defs) => {
          // Deduplicate by index
          const seen = new Set<number>();
          const unique = defs.filter((d) => {
            if (seen.has(d.index)) return false;
            seen.add(d.index);
            return true;
          });
          if (unique.length < 2) return true; // skip trivial cases

          const snapshots = unique.map((d) =>
            makeSnap(`note-${String(d.index).padStart(4, "0")}`, d.updatedAt),
          );
          const noteIds = unique.map((d) => `note-${String(d.index).padStart(4, "0")}`);

          const sortOrder: SortOrder = { field: "timestamp", direction: "desc" };
          const feed: Feed = {
            noteRefs: noteIds as unknown as readonly NoteId[],
            filterCriteria: { tags: [], frontmatterFields: new Map() } as FilterCriteria,
            searchQuery: null,
            sortOrder,
          };
          const applied = makeApplied("desc");
          const result = applyFilterOrSearch(feed, applied, snapshots);
          const ids = result.ids;

          // Build a map from noteId → snapshot for epoch lookup
          const epochMap = new Map(snapshots.map((s) => [
            s.noteId as unknown as string,
            (s.frontmatter as unknown as { updatedAt: { epochMillis: number } }).updatedAt.epochMillis,
          ]));

          for (let i = 0; i < ids.length - 1; i++) {
            const epochI = epochMap.get(ids[i] as unknown as string) ?? 0;
            const epochJ = epochMap.get(ids[i + 1] as unknown as string) ?? 0;
            if (epochI < epochJ) return false; // desc violation
            if (epochI === epochJ) {
              // Tiebreak: NoteId descending (DD-1 desc → NoteId desc)
              const nidI = ids[i] as unknown as string;
              const nidJ = ids[i + 1] as unknown as string;
              if (nidI < nidJ) return false; // desc NoteId violation
            }
          }
          return true;
        },
      ),
      { numRuns: 200, seed: 6001 },
    );
  });
});

describe("PROP-006: sort total order — asc direction", () => {
  test("∀ snapshots with asc sort: pairwise updatedAt ordering is non-decreasing", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            index: fc.integer({ min: 1, max: 999 }),
            updatedAt: fc.integer({ min: 1, max: 1_000_000 }),
          }),
          { minLength: 2, maxLength: 15 },
        ),
        (defs) => {
          const seen = new Set<number>();
          const unique = defs.filter((d) => {
            if (seen.has(d.index)) return false;
            seen.add(d.index);
            return true;
          });
          if (unique.length < 2) return true;

          const snapshots = unique.map((d) =>
            makeSnap(`note-${String(d.index).padStart(4, "0")}`, d.updatedAt),
          );
          const noteIds = unique.map((d) => `note-${String(d.index).padStart(4, "0")}`);

          const sortOrder: SortOrder = { field: "timestamp", direction: "asc" };
          const feed: Feed = {
            noteRefs: noteIds as unknown as readonly NoteId[],
            filterCriteria: { tags: [], frontmatterFields: new Map() } as FilterCriteria,
            searchQuery: null,
            sortOrder,
          };
          const applied = makeApplied("asc");
          const result = applyFilterOrSearch(feed, applied, snapshots);
          const ids = result.ids;

          const epochMap = new Map(snapshots.map((s) => [
            s.noteId as unknown as string,
            (s.frontmatter as unknown as { updatedAt: { epochMillis: number } }).updatedAt.epochMillis,
          ]));

          for (let i = 0; i < ids.length - 1; i++) {
            const epochI = epochMap.get(ids[i] as unknown as string) ?? 0;
            const epochJ = epochMap.get(ids[i + 1] as unknown as string) ?? 0;
            if (epochI > epochJ) return false; // asc violation
            if (epochI === epochJ) {
              // Tiebreak: NoteId ascending (DD-1 asc → NoteId asc)
              const nidI = ids[i] as unknown as string;
              const nidJ = ids[i + 1] as unknown as string;
              if (nidI > nidJ) return false; // asc NoteId violation
            }
          }
          return true;
        },
      ),
      { numRuns: 200, seed: 6002 },
    );
  });
});
