/**
 * PROP-009: hasZeroResults iff ids.length === 0 (both directions).
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * ∀ (feed, applied, snapshots): result.hasZeroResults === (result.ids.length === 0)
 * Also: empty ids never has hasZeroResults=false; non-empty ids never has hasZeroResults=true.
 *
 * REQ-013
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import { applyFilterOrSearch } from "$lib/domain/apply-filter-or-search/apply-filter-or-search";
import {
  arbFeedAndSnapshots,
  arbAppliedFilterNoOp,
  arbAppliedFilterWithTags,
} from "./_arbitraries";

describe("PROP-009: hasZeroResults iff ids.length === 0", () => {
  test("∀ (feed, applied-no-op, snapshots): hasZeroResults === (ids.length === 0)", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(15),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const result = applyFilterOrSearch(feed, applied, snapshots);
          return result.hasZeroResults === (result.ids.length === 0);
        },
      ),
      { numRuns: 500, seed: 9001 },
    );
  });

  test("∀ (feed, applied-with-tags, snapshots): hasZeroResults === (ids.length === 0)", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(15),
        arbAppliedFilterWithTags(),
        ({ feed, snapshots }, applied) => {
          const result = applyFilterOrSearch(feed, applied, snapshots);
          return result.hasZeroResults === (result.ids.length === 0);
        },
      ),
      { numRuns: 200, seed: 9002 },
    );
  });

  test("empty ids NEVER has hasZeroResults=false", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(10),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const result = applyFilterOrSearch(feed, applied, snapshots);
          if (result.ids.length === 0 && !result.hasZeroResults) return false;
          return true;
        },
      ),
      { numRuns: 500, seed: 9003 },
    );
  });

  test("non-empty ids NEVER has hasZeroResults=true", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(15),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const result = applyFilterOrSearch(feed, applied, snapshots);
          if (result.ids.length > 0 && result.hasZeroResults) return false;
          return true;
        },
      ),
      { numRuns: 500, seed: 9004 },
    );
  });
});
