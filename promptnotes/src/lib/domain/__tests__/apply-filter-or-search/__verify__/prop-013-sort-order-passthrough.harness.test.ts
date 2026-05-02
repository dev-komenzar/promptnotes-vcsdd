/**
 * PROP-013: sortOrder passthrough.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * ∀ valid raw: parseFilterInput(raw).value.sortOrder deepEquals raw.sortOrder
 * (both field and direction preserved verbatim, no override).
 *
 * REQ-006
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import type { UnvalidatedFilterInput } from "promptnotes-domain-types/curate/stages";
import { parseFilterInput } from "$lib/domain/apply-filter-or-search/parse-filter-input";
import { arbSortOrder } from "./_arbitraries";

describe("PROP-013: sortOrder passthrough", () => {
  test(
    "∀ valid raw with direction=desc: result.value.sortOrder deepEquals raw.sortOrder (≥200 runs)",
    () => {
      fc.assert(
        fc.property(
          arbSortOrder(),
          fc.array(
            fc.stringMatching(/^[a-z][a-z0-9-]{0,19}$/),
            { maxLength: 5 },
          ),
          fc.option(fc.string({ maxLength: 30 }), { nil: null }),
          (sortOrder, tagsRaw, searchTextRaw) => {
            const input: UnvalidatedFilterInput = {
              kind: "UnvalidatedFilterInput",
              tagsRaw,
              fieldsRaw: new Map(),
              searchTextRaw,
              sortOrder,
            };
            const result = parseFilterInput(input);
            if (!result.ok) return true; // only check Ok results
            const outSort = result.value.sortOrder;
            return (
              outSort.field === sortOrder.field &&
              outSort.direction === sortOrder.direction
            );
          },
        ),
        { numRuns: 200, seed: 13001 },
      );
    },
  );

  test("direction=asc is preserved verbatim", () => {
    fc.assert(
      fc.property(
        fc.constant({ field: "timestamp" as const, direction: "asc" as const }),
        (sortOrder) => {
          const input: UnvalidatedFilterInput = {
            kind: "UnvalidatedFilterInput",
            tagsRaw: ["draft"],
            fieldsRaw: new Map(),
            searchTextRaw: null,
            sortOrder,
          };
          const result = parseFilterInput(input);
          if (!result.ok) return false;
          return (
            result.value.sortOrder.field === "timestamp" &&
            result.value.sortOrder.direction === "asc"
          );
        },
      ),
      { numRuns: 200, seed: 13002 },
    );
  });

  test("direction=desc is preserved verbatim", () => {
    fc.assert(
      fc.property(
        fc.constant({ field: "timestamp" as const, direction: "desc" as const }),
        (sortOrder) => {
          const input: UnvalidatedFilterInput = {
            kind: "UnvalidatedFilterInput",
            tagsRaw: ["review"],
            fieldsRaw: new Map(),
            searchTextRaw: null,
            sortOrder,
          };
          const result = parseFilterInput(input);
          if (!result.ok) return false;
          return (
            result.value.sortOrder.field === "timestamp" &&
            result.value.sortOrder.direction === "desc"
          );
        },
      ),
      { numRuns: 200, seed: 13003 },
    );
  });
});
