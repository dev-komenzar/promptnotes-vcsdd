/**
 * PROP-018: No-filter no-search exact intersection.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * When no criteria are active, result.ids contains exactly the set-theoretic
 * intersection of feed.noteRefs and snapshots[*].noteId (two-sided: no inflation, no deflation).
 *
 * REQ-014
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import { applyFilterOrSearch } from "$lib/domain/apply-filter-or-search/apply-filter-or-search";
import {
  arbFeedAndSnapshots,
  arbAppliedFilterNoOp,
} from "./_arbitraries";

describe("PROP-018: no-filter no-search exact intersection", () => {
  test(
    "∀ (feed, applied-no-op, snapshots): result.ids equals the exact intersection of feed.noteRefs and snapshot ids",
    () => {
      fc.assert(
        fc.property(
          arbFeedAndSnapshots(15),
          arbAppliedFilterNoOp(),
          ({ feed, snapshots }, applied) => {
            const result = applyFilterOrSearch(feed, applied, snapshots);

            const noteRefSet = new Set(feed.noteRefs as readonly string[]);
            const snapshotIdSet = new Set(snapshots.map((s) => s.noteId as unknown as string));
            const expectedIntersection = new Set(
              [...noteRefSet].filter((id) => snapshotIdSet.has(id)),
            );
            const resultSet = new Set(result.ids as readonly string[]);

            // Two-sided: result == expected (no inflation, no deflation)
            if (resultSet.size !== expectedIntersection.size) return false;
            for (const id of expectedIntersection) {
              if (!resultSet.has(id)) return false; // deflation
            }
            for (const id of resultSet) {
              if (!expectedIntersection.has(id)) return false; // inflation
            }
            return true;
          },
        ),
        { numRuns: 200, seed: 18001 },
      );
    },
  );

  test("no inflation: result.ids ⊆ expectedIntersection", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(15),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const result = applyFilterOrSearch(feed, applied, snapshots);
          const noteRefSet = new Set(feed.noteRefs as readonly string[]);
          const snapshotIdSet = new Set(snapshots.map((s) => s.noteId as unknown as string));

          for (const id of result.ids as readonly string[]) {
            if (!noteRefSet.has(id) || !snapshotIdSet.has(id)) return false;
          }
          return true;
        },
      ),
      { numRuns: 200, seed: 18002 },
    );
  });

  test("no deflation: expectedIntersection ⊆ result.ids", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(15),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const result = applyFilterOrSearch(feed, applied, snapshots);
          const noteRefSet = new Set(feed.noteRefs as readonly string[]);
          const snapshotIdSet = new Set(snapshots.map((s) => s.noteId as unknown as string));
          const resultSet = new Set(result.ids as readonly string[]);

          // Every id in the intersection must appear in result
          for (const id of noteRefSet) {
            if (snapshotIdSet.has(id) && !resultSet.has(id)) return false;
          }
          return true;
        },
      ),
      { numRuns: 200, seed: 18003 },
    );
  });

  test("noteRefs entry with no matching snapshot is NOT in result (unresolvable ref excluded)", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(15),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const snapshotIdSet = new Set(snapshots.map((s) => s.noteId as unknown as string));
          const resultSet = new Set(applyFilterOrSearch(feed, applied, snapshots).ids as readonly string[]);

          // Unresolvable noteRefs (in feed but not in snapshots)
          for (const ref of feed.noteRefs as readonly string[]) {
            if (!snapshotIdSet.has(ref) && resultSet.has(ref)) return false;
          }
          return true;
        },
      ),
      { numRuns: 200, seed: 18004 },
    );
  });
});
