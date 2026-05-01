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
} from "./_arbitraries";

describe("PROP-007: sort determinism", () => {
  test("∀ (feed, applied, snapshots): two runs produce identical ids array", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(15),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const r1 = applyFilterOrSearch(feed, applied, snapshots);
          const r2 = applyFilterOrSearch(feed, applied, snapshots);

          const ids1 = r1.ids as readonly string[];
          const ids2 = r2.ids as readonly string[];

          if (ids1.length !== ids2.length) return false;
          for (let i = 0; i < ids1.length; i++) {
            if (ids1[i] !== ids2[i]) return false;
          }
          return true;
        },
      ),
      { numRuns: 200, seed: 7001 },
    );
  });

  test("∀ (feed, applied, snapshots): three runs produce identical ids arrays", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(10),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const r1 = applyFilterOrSearch(feed, applied, snapshots);
          const r2 = applyFilterOrSearch(feed, applied, snapshots);
          const r3 = applyFilterOrSearch(feed, applied, snapshots);

          const sameLength =
            r1.ids.length === r2.ids.length && r2.ids.length === r3.ids.length;
          if (!sameLength) return false;

          const ids1 = r1.ids as readonly string[];
          const ids2 = r2.ids as readonly string[];
          const ids3 = r3.ids as readonly string[];

          for (let i = 0; i < ids1.length; i++) {
            if (ids1[i] !== ids2[i] || ids2[i] !== ids3[i]) return false;
          }
          return true;
        },
      ),
      { numRuns: 100, seed: 7002 },
    );
  });
});
