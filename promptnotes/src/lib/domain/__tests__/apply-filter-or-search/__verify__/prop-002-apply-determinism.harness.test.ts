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
} from "./_arbitraries";

describe("PROP-002: applyFilterOrSearch determinism", () => {
  test("∀ (feed, applied, snapshots): two calls produce deepEqual VisibleNoteIds", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(15),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const a = applyFilterOrSearch(feed, applied, snapshots);
          const b = applyFilterOrSearch(feed, applied, snapshots);
          if (a.kind !== b.kind) return false;
          if (a.hasZeroResults !== b.hasZeroResults) return false;
          if (a.ids.length !== b.ids.length) return false;
          const aIds = a.ids as readonly string[];
          const bIds = b.ids as readonly string[];
          for (let i = 0; i < aIds.length; i++) {
            if (aIds[i] !== bIds[i]) return false;
          }
          return true;
        },
      ),
      { numRuns: 1000, seed: 2001 },
    );
  });

  test("∀ (feed, applied, snapshots): three calls produce identical results", () => {
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
});
