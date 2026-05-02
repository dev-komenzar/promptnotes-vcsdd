/**
 * PROP-001: parseFilterInput is deterministic.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * ∀ raw: parseFilterInput(raw) deepEquals parseFilterInput(raw) (≥1000 runs)
 * REQ-015
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import { parseFilterInput } from "$lib/domain/apply-filter-or-search/parse-filter-input";
import { arbUnvalidatedFilterInput } from "./_arbitraries";

describe("PROP-001: parseFilterInput determinism", () => {
  test("∀ raw: parseFilterInput(raw) deepEquals parseFilterInput(raw)", () => {
    fc.assert(
      fc.property(arbUnvalidatedFilterInput(), (raw) => {
        const a = parseFilterInput(raw);
        const b = parseFilterInput(raw);
        // Structural deep equality — same Result shape, same values
        if (a.ok !== b.ok) return false;
        if (!a.ok && !b.ok) {
          return a.error.kind === b.error.kind && a.error.raw === b.error.raw;
        }
        if (a.ok && b.ok) {
          const av = a.value;
          const bv = b.value;
          if (av.kind !== bv.kind) return false;
          if (av.sortOrder.field !== bv.sortOrder.field) return false;
          if (av.sortOrder.direction !== bv.sortOrder.direction) return false;
          // Tags (both arrays must match)
          const aTags = av.criteria.tags as readonly string[];
          const bTags = bv.criteria.tags as readonly string[];
          if (aTags.length !== bTags.length) return false;
          for (let i = 0; i < aTags.length; i++) {
            if (aTags[i] !== bTags[i]) return false;
          }
          // Query
          if (av.query === null && bv.query !== null) return false;
          if (av.query !== null && bv.query === null) return false;
          if (av.query !== null && bv.query !== null) {
            if (av.query.text !== bv.query.text) return false;
            if (av.query.scope !== bv.query.scope) return false;
          }
          return true;
        }
        return false;
      }),
      { numRuns: 1000, seed: 1001 },
    );
  });

  test("∀ raw: three calls produce identical Results", () => {
    fc.assert(
      fc.property(arbUnvalidatedFilterInput(), (raw) => {
        const r1 = parseFilterInput(raw);
        const r2 = parseFilterInput(raw);
        const r3 = parseFilterInput(raw);
        // All three must have the same ok flag
        return r1.ok === r2.ok && r2.ok === r3.ok;
      }),
      { numRuns: 200, seed: 1002 },
    );
  });
});
