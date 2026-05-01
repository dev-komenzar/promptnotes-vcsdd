/**
 * PROP-015: Frontmatter field filter semantics.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * (a) Case-sensitive exact match per field, AND across map entries.
 * (b) Multi-entry: snapshot must match ALL entries.
 * (c) Empty map is no-op (all snapshots pass).
 *
 * REQ-010
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
const sortDesc: SortOrder = { field: "timestamp", direction: "desc" };

function makeSnapWithFields(
  noteIdStr: string,
  extraFields: Record<string, string>,
): NoteFileSnapshot {
  return {
    noteId: id(noteIdStr),
    body: bd("body"),
    frontmatter: {
      tags: [] as Tag[],
      createdAt: ts(1000),
      updatedAt: ts(2000),
      ...extraFields,
    } as unknown as Frontmatter,
    filePath: `/vault/${noteIdStr}.md`,
    fileMtime: ts(2000),
  };
}

function makeApplied(fields: Map<string, string>): AppliedFilter {
  return {
    kind: "AppliedFilter",
    criteria: { tags: [], frontmatterFields: fields } as FilterCriteria,
    query: null,
    sortOrder: sortDesc,
  };
}

function makeFeed(noteIds: string[]): Feed {
  return {
    noteRefs: noteIds as unknown as readonly NoteId[],
    filterCriteria: { tags: [], frontmatterFields: new Map() } as FilterCriteria,
    searchQuery: null,
    sortOrder: sortDesc,
  };
}

describe("PROP-015(a): case-sensitive exact match per field", () => {
  test(
    "∀ (field, value): snapshot with exact value passes; snapshot with case-variant fails",
    () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z]+$/.test(s)),
          fc.string({ minLength: 1, maxLength: 20 }),
          (fieldKey, fieldValue) => {
            const snapMatch = makeSnapWithFields("note-match", { [fieldKey]: fieldValue });
            const snapCaseVariant = makeSnapWithFields("note-case", {
              [fieldKey]: fieldValue.toUpperCase() === fieldValue
                ? fieldValue.toLowerCase()
                : fieldValue.toUpperCase(),
            });
            const feed = makeFeed(["note-match", "note-case"]);
            const applied = makeApplied(new Map([[fieldKey, fieldValue]]));
            const result = applyFilterOrSearch(feed, applied, [snapMatch, snapCaseVariant]);
            const ids = result.ids as readonly string[];

            if (!ids.includes("note-match")) return false; // exact match must pass
            // Case variant must fail (unless it happens to be the same string)
            const variantValue = fieldValue.toUpperCase() === fieldValue
              ? fieldValue.toLowerCase()
              : fieldValue.toUpperCase();
            if (variantValue !== fieldValue && ids.includes("note-case")) return false;
            return true;
          },
        ),
        { numRuns: 200, seed: 15001 },
      );
    },
  );
});

describe("PROP-015(b): AND across multiple map entries", () => {
  test(
    "∀ multi-entry map: snapshot must match ALL entries to be included",
    () => {
      fc.assert(
        fc.property(
          // Two field/value pairs
          fc.string({ minLength: 1, maxLength: 8 }).filter((s) => /^[a-z]+$/.test(s)),
          fc.string({ minLength: 1, maxLength: 15 }),
          fc.string({ minLength: 1, maxLength: 8 }).filter((s) => /^[a-z]+$/.test(s)),
          fc.string({ minLength: 1, maxLength: 15 }),
          (field1, value1, field2, value2) => {
            if (field1 === field2) return true; // skip trivial overlap

            const snapBoth = makeSnapWithFields("note-both", { [field1]: value1, [field2]: value2 });
            const snapOnlyFirst = makeSnapWithFields("note-first", { [field1]: value1 });
            const snapOnlySecond = makeSnapWithFields("note-second", { [field2]: value2 });

            const feed = makeFeed(["note-both", "note-first", "note-second"]);
            const applied = makeApplied(new Map([[field1, value1], [field2, value2]]));
            const result = applyFilterOrSearch(feed, applied, [snapBoth, snapOnlyFirst, snapOnlySecond]);
            const ids = result.ids as readonly string[];

            if (!ids.includes("note-both")) return false;   // must pass
            if (ids.includes("note-first")) return false;   // fails field2
            if (ids.includes("note-second")) return false;  // fails field1
            return true;
          },
        ),
        { numRuns: 200, seed: 15002 },
      );
    },
  );
});

describe("PROP-015(c): empty frontmatterFields map is no-op (all snapshots pass)", () => {
  test(
    "∀ (snapshots, empty fields): all candidate snapshots pass the frontmatter criterion",
    () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              index: fc.integer({ min: 1, max: 999 }),
              field1: fc.string({ maxLength: 10 }),
            }),
            { minLength: 1, maxLength: 10 },
          ),
          (defs) => {
            const seen = new Set<number>();
            const unique = defs.filter((d) => {
              if (seen.has(d.index)) return false;
              seen.add(d.index);
              return true;
            });

            const snapshots = unique.map((d) =>
              makeSnapWithFields(`note-${d.index}`, { someField: d.field1 }),
            );
            const noteIds = unique.map((d) => `note-${d.index}`);

            const feed = makeFeed(noteIds);
            const applied = makeApplied(new Map()); // empty = no-op
            const result = applyFilterOrSearch(feed, applied, snapshots);
            const ids = result.ids as readonly string[];

            // All snapshots must appear (empty fields is no-op)
            for (const nid of noteIds) {
              if (!ids.includes(nid)) return false;
            }
            return true;
          },
        ),
        { numRuns: 200, seed: 15003 },
      );
    },
  );
});
