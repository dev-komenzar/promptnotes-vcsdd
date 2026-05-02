/**
 * PROP-007: Sort determinism.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * Same input always produces the same ordering (no non-deterministic comparison).
 *
 * REQ-012, REQ-015
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import { applyFilterOrSearch } from "$lib/domain/apply-filter-or-search/apply-filter-or-search";
import {
  arbFeedAndSnapshots,
  arbAppliedFilterNoOp,
  arbAppliedFilterWithTags,
  arbSearchQuery,
  arbSortOrder,
} from "./_arbitraries";
import type { AppliedFilter } from "promptnotes-domain-types/curate/stages";

/** Frequency-mixed arbitrary: no-op, tag-filtered, and search+sort variants. */
function arbAppliedFilterMixed(): fc.Arbitrary<AppliedFilter> {
  return fc.oneof(
    { arbitrary: arbAppliedFilterNoOp(), weight: 2 },
    { arbitrary: arbAppliedFilterWithTags(), weight: 3 },
    {
      arbitrary: fc.record({
        kind: fc.constant("AppliedFilter" as const),
        criteria: fc.constant({ tags: [], frontmatterFields: new Map() }),
        query: arbSearchQuery(),
        sortOrder: arbSortOrder(),
      }) as fc.Arbitrary<AppliedFilter>,
      weight: 2,
    },
  );
}

function idsEqual(
  ids1: readonly string[],
  ids2: readonly string[],
): boolean {
  if (ids1.length !== ids2.length) return false;
  for (let i = 0; i < ids1.length; i++) {
    if (ids1[i] !== ids2[i]) return false;
  }
  return true;
}

describe("PROP-007: sort determinism", () => {
  test("∀ (feed, applied:no-op, snapshots): two runs produce identical ids array", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(15),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const r1 = applyFilterOrSearch(feed, applied, snapshots);
          const r2 = applyFilterOrSearch(feed, applied, snapshots);
          return idsEqual(r1.ids as readonly string[], r2.ids as readonly string[]);
        },
      ),
      { numRuns: 200, seed: 7001 },
    );
  });

  test("∀ (feed, applied:no-op, snapshots): three runs produce identical ids arrays", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(10),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const r1 = applyFilterOrSearch(feed, applied, snapshots);
          const r2 = applyFilterOrSearch(feed, applied, snapshots);
          const r3 = applyFilterOrSearch(feed, applied, snapshots);

          const ids1 = r1.ids as readonly string[];
          const ids2 = r2.ids as readonly string[];
          const ids3 = r3.ids as readonly string[];

          return idsEqual(ids1, ids2) && idsEqual(ids2, ids3);
        },
      ),
      { numRuns: 100, seed: 7002 },
    );
  });

  test(
    "∀ (feed, applied:tags/search/sort, snapshots): two runs produce identical ids array",
    () => {
      fc.assert(
        fc.property(
          arbFeedAndSnapshots(15),
          arbAppliedFilterMixed(),
          ({ feed, snapshots }, applied) => {
            const r1 = applyFilterOrSearch(feed, applied, snapshots);
            const r2 = applyFilterOrSearch(feed, applied, snapshots);
            return idsEqual(r1.ids as readonly string[], r2.ids as readonly string[]);
          },
        ),
        { numRuns: 200, seed: 7003 },
      );
    },
  );

  test(
    "∀ (feed, applied:with-tags, snapshots): three runs produce identical ids arrays",
    () => {
      fc.assert(
        fc.property(
          arbFeedAndSnapshots(10),
          arbAppliedFilterWithTags(),
          ({ feed, snapshots }, applied) => {
            const r1 = applyFilterOrSearch(feed, applied, snapshots);
            const r2 = applyFilterOrSearch(feed, applied, snapshots);
            const r3 = applyFilterOrSearch(feed, applied, snapshots);

            const ids1 = r1.ids as readonly string[];
            const ids2 = r2.ids as readonly string[];
            const ids3 = r3.ids as readonly string[];

            return idsEqual(ids1, ids2) && idsEqual(ids2, ids3);
          },
        ),
        { numRuns: 100, seed: 7004 },
      );
    },
  );
});
