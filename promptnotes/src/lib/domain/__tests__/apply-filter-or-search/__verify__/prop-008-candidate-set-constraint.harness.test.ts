/**
 * PROP-008: Two-sided candidate set constraint.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * (a) Every output id is in feed.noteRefs.
 * (b) Every output id has a matching snapshot in the input snapshots array.
 * Both sides hold simultaneously.
 *
 * REQ-007
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import { applyFilterOrSearch } from "$lib/domain/apply-filter-or-search/apply-filter-or-search";
import {
  arbFeedAndSnapshots,
  arbAppliedFilterNoOp,
} from "./_arbitraries";

describe("PROP-008: two-sided candidate set constraint", () => {
  test("(a) ∀ result.id: id ∈ feed.noteRefs", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(15),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const result = applyFilterOrSearch(feed, applied, snapshots);
          const noteRefSet = new Set(feed.noteRefs as readonly string[]);
          for (const outId of result.ids as readonly string[]) {
            if (!noteRefSet.has(outId)) return false;
          }
          return true;
        },
      ),
      { numRuns: 200, seed: 8001 },
    );
  });

  test("(b) ∀ result.id: ∃ snapshot s such that s.noteId === id", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(15),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const result = applyFilterOrSearch(feed, applied, snapshots);
          const snapshotIds = new Set(snapshots.map((s) => s.noteId as unknown as string));
          for (const outId of result.ids as readonly string[]) {
            if (!snapshotIds.has(outId)) return false;
          }
          return true;
        },
      ),
      { numRuns: 200, seed: 8002 },
    );
  });

  test("(a+b) both sides hold: every output id is in both feed.noteRefs and snapshots", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(15),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const result = applyFilterOrSearch(feed, applied, snapshots);
          const noteRefSet = new Set(feed.noteRefs as readonly string[]);
          const snapshotIds = new Set(snapshots.map((s) => s.noteId as unknown as string));
          for (const outId of result.ids as readonly string[]) {
            if (!noteRefSet.has(outId)) return false;
            if (!snapshotIds.has(outId)) return false;
          }
          return true;
        },
      ),
      { numRuns: 200, seed: 8003 },
    );
  });

  test("snapshot present in snapshots but absent from feed.noteRefs is never in output", () => {
    fc.assert(
      fc.property(
        arbFeedAndSnapshots(15),
        arbAppliedFilterNoOp(),
        ({ feed, snapshots }, applied) => {
          const noteRefSet = new Set(feed.noteRefs as readonly string[]);
          const extraSnapIds = snapshots
            .filter((s) => !noteRefSet.has(s.noteId as unknown as string))
            .map((s) => s.noteId as unknown as string);

          const result = applyFilterOrSearch(feed, applied, snapshots);
          const resultSet = new Set(result.ids as readonly string[]);

          for (const extraId of extraSnapIds) {
            if (resultSet.has(extraId)) return false; // extra snapshot leaked into output
          }
          return true;
        },
      ),
      { numRuns: 200, seed: 8004 },
    );
  });
});
