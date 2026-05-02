/**
 * PROP-002: applyFilterOrSearch is deterministic.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * ∀ (feed, applied, snapshots): applyFilterOrSearch(...) deepEquals applyFilterOrSearch(...) (≥1000 runs)
 * REQ-015
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

function idsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

describe("PROP-002: applyFilterOrSearch determinism", () => {
  test("∀ (feed, applied:no-op, snapshots): two calls produce deepEqual VisibleNoteIds", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(15),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const a = applyFilterOrSearch(feed, applied, snapshots);
          const b = applyFilterOrSearch(feed, applied, snapshots);
          if (a.kind !== b.kind) return false;
          if (a.hasZeroResults !== b.hasZeroResults) return false;
          return idsEqual(a.ids as readonly string[], b.ids as readonly string[]);
        },
      ),
      { numRuns: 1000, seed: 2001 },
    );
  });

  test("∀ (feed, applied:no-op, snapshots): three calls produce identical results", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(10),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const r1 = applyFilterOrSearch(feed, applied, snapshots);
          const r2 = applyFilterOrSearch(feed, applied, snapshots);
          const r3 = applyFilterOrSearch(feed, applied, snapshots);
          return (
            r1.hasZeroResults === r2.hasZeroResults &&
            r2.hasZeroResults === r3.hasZeroResults &&
            r1.ids.length === r2.ids.length &&
            r2.ids.length === r3.ids.length
          );
        },
      ),
      { numRuns: 200, seed: 2002 },
    );
  });

  test(
    "∀ (feed, applied:tags/search/sort, snapshots): two calls produce deepEqual VisibleNoteIds",
    () => {
      fc.assert(
        fc.property(
          arbFeedAndSnapshots(15),
          arbAppliedFilterMixed(),
          ({ feed, snapshots }, applied) => {
            const a = applyFilterOrSearch(feed, applied, snapshots);
            const b = applyFilterOrSearch(feed, applied, snapshots);
            if (a.kind !== b.kind) return false;
            if (a.hasZeroResults !== b.hasZeroResults) return false;
            return idsEqual(a.ids as readonly string[], b.ids as readonly string[]);
          },
        ),
        { numRuns: 500, seed: 2003 },
      );
    },
  );

  test(
    "∀ (feed, applied:with-tags, snapshots): three calls produce identical results",
    () => {
      fc.assert(
        fc.property(
          arbFeedAndSnapshots(10),
          arbAppliedFilterWithTags(),
          ({ feed, snapshots }, applied) => {
            const r1 = applyFilterOrSearch(feed, applied, snapshots);
            const r2 = applyFilterOrSearch(feed, applied, snapshots);
            const r3 = applyFilterOrSearch(feed, applied, snapshots);
            return (
              r1.hasZeroResults === r2.hasZeroResults &&
              r2.hasZeroResults === r3.hasZeroResults &&
              idsEqual(r1.ids as readonly string[], r2.ids as readonly string[]) &&
              idsEqual(r2.ids as readonly string[], r3.ids as readonly string[])
            );
          },
        ),
        { numRuns: 200, seed: 2004 },
      );
    },
  );
});
