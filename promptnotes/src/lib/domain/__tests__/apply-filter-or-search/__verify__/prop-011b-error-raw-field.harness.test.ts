/**
 * PROP-011b: Error raw field preservation at runtime.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * Err.raw in the returned error equals the original input string verbatim,
 * not a normalized form.
 *
 * REQ-002, REQ-003
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import type { SortOrder } from "promptnotes-domain-types/curate/aggregates";
import type { UnvalidatedFilterInput } from "promptnotes-domain-types/curate/stages";
import { parseFilterInput } from "$lib/domain/apply-filter-or-search/parse-filter-input";
import { arbValidTagString, arbInvalidTagString } from "./_arbitraries";

const sortDesc: SortOrder = { field: "timestamp", direction: "desc" };

describe("PROP-011b: Err.raw field preserves original pre-normalization string verbatim", () => {
  test(
    "∀ tagsRaw with ≥1 invalid entry: Err.raw === the original invalid string (≥200 runs)",
    () => {
      fc.assert(
        fc.property(
          // A valid prefix followed by an invalid entry
          fc.array(arbValidTagString(), { maxLength: 4 }),
          arbInvalidTagString(),
          fc.array(arbValidTagString(), { maxLength: 4 }),
          (validPrefix, invalidEntry, validSuffix) => {
            const tagsRaw = [...validPrefix, invalidEntry, ...validSuffix];
            const input: UnvalidatedFilterInput = {
              kind: "UnvalidatedFilterInput",
              tagsRaw,
              fieldsRaw: new Map(),
              searchTextRaw: null,
              sortOrder: sortDesc,
            };
            const result = parseFilterInput(input);
            if (result.ok) return false; // must fail with invalid entry
            // The error raw must be the verbatim invalid entry (not normalized/trimmed)
            return result.error.raw === invalidEntry;
          },
        ),
        { numRuns: 200, seed: 11001 },
      );
    },
  );

  test(
    "∀ tagsRaw starting with invalid entry: Err.raw === the first (invalid) entry",
    () => {
      fc.assert(
        fc.property(
          arbInvalidTagString(),
          fc.array(arbValidTagString(), { maxLength: 5 }),
          (invalidFirst, validRest) => {
            const tagsRaw = [invalidFirst, ...validRest];
            const input: UnvalidatedFilterInput = {
              kind: "UnvalidatedFilterInput",
              tagsRaw,
              fieldsRaw: new Map(),
              searchTextRaw: null,
              sortOrder: sortDesc,
            };
            const result = parseFilterInput(input);
            if (result.ok) return false;
            // Raw must equal the invalid first entry verbatim
            return result.error.raw === invalidFirst;
          },
        ),
        { numRuns: 200, seed: 11002 },
      );
    },
  );

  test("empty string raw field is preserved as empty string (not normalized to something else)", () => {
    const input: UnvalidatedFilterInput = {
      kind: "UnvalidatedFilterInput",
      tagsRaw: ["valid-tag", ""],
      fieldsRaw: new Map(),
      searchTextRaw: null,
      sortOrder: sortDesc,
    };
    const result = parseFilterInput(input);
    fc.assert(
      fc.property(fc.constant(result), (r) => {
        if (r.ok) return false;
        return r.error.raw === ""; // verbatim empty
      }),
      { numRuns: 1 },
    );
  });

  test("whitespace-only raw field is preserved verbatim (3 spaces → raw='   ')", () => {
    const raw = "   ";
    const input: UnvalidatedFilterInput = {
      kind: "UnvalidatedFilterInput",
      tagsRaw: [raw],
      fieldsRaw: new Map(),
      searchTextRaw: null,
      sortOrder: sortDesc,
    };
    fc.assert(
      fc.property(fc.constant(parseFilterInput(input)), (result) => {
        if (result.ok) return false;
        return result.error.raw === raw; // must be "   " not "" or trimmed
      }),
      { numRuns: 1 },
    );
  });
});
