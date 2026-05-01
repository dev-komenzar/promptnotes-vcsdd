/**
 * PROP-017: Fail-fast on first invalid tag.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * For any raw whose tagsRaw contains ≥1 invalid entry, parseFilterInput(raw)
 * returns Err with Err.raw === the first invalid entry encountered.
 * (≥200 runs mixing valid prefix + invalid suffix and vice versa)
 *
 * REQ-003
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import type { SortOrder } from "promptnotes-domain-types/curate/aggregates";
import type { UnvalidatedFilterInput } from "promptnotes-domain-types/curate/stages";
import { parseFilterInput } from "$lib/domain/apply-filter-or-search/parse-filter-input";
import { arbValidTagString, arbInvalidTagString } from "./_arbitraries";

const sortDesc: SortOrder = { field: "timestamp", direction: "desc" };

describe("PROP-017: fail-fast on first invalid tag", () => {
  test(
    "∀ [validPrefix..., invalidEntry, validSuffix...]: Err.raw === invalidEntry (≥200 runs)",
    () => {
      fc.assert(
        fc.property(
          // 0-4 valid tags before the invalid one
          fc.array(arbValidTagString(), { maxLength: 4 }),
          // The invalid entry at a known position
          arbInvalidTagString(),
          // 0-4 valid tags after the invalid one
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
            if (result.ok) return false; // must fail
            // The Err.raw must equal the first invalid entry (verbatim)
            return result.error.raw === invalidEntry;
          },
        ),
        { numRuns: 200, seed: 17001 },
      );
    },
  );

  test(
    "∀ [invalidEntry, validSuffix...]: Err.raw === invalidEntry (invalid first position)",
    () => {
      fc.assert(
        fc.property(
          arbInvalidTagString(),
          fc.array(arbValidTagString(), { maxLength: 5 }),
          (invalidEntry, validSuffix) => {
            const tagsRaw = [invalidEntry, ...validSuffix];
            const input: UnvalidatedFilterInput = {
              kind: "UnvalidatedFilterInput",
              tagsRaw,
              fieldsRaw: new Map(),
              searchTextRaw: null,
              sortOrder: sortDesc,
            };
            const result = parseFilterInput(input);
            if (result.ok) return false;
            return result.error.raw === invalidEntry;
          },
        ),
        { numRuns: 200, seed: 17002 },
      );
    },
  );

  test(
    "when first invalid entry comes after many valid entries: reports first invalid (fail-fast)",
    () => {
      fc.assert(
        fc.property(
          fc.array(arbValidTagString(), { minLength: 1, maxLength: 5 }),
          arbInvalidTagString(),
          (validTags, invalidEntry) => {
            // Many valid tags before the invalid one — fail-fast must skip all of them
            const tagsRaw = [...validTags, invalidEntry];
            const input: UnvalidatedFilterInput = {
              kind: "UnvalidatedFilterInput",
              tagsRaw,
              fieldsRaw: new Map(),
              searchTextRaw: null,
              sortOrder: sortDesc,
            };
            const result = parseFilterInput(input);
            if (result.ok) return false; // must fail
            // Err.raw must be invalidEntry, not any of the valid tags
            if (validTags.includes(result.error.raw)) return false;
            return result.error.raw === invalidEntry;
          },
        ),
        { numRuns: 200, seed: 17003 },
      );
    },
  );

  test("AppliedFilter is NEVER returned when any tag is invalid", () => {
    fc.assert(
      fc.property(
        fc.array(arbValidTagString(), { maxLength: 4 }),
        arbInvalidTagString(),
        fc.array(arbValidTagString(), { maxLength: 4 }),
        (prefix, invalidEntry, suffix) => {
          const tagsRaw = [...prefix, invalidEntry, ...suffix];
          const input: UnvalidatedFilterInput = {
            kind: "UnvalidatedFilterInput",
            tagsRaw,
            fieldsRaw: new Map(),
            searchTextRaw: null,
            sortOrder: sortDesc,
          };
          const result = parseFilterInput(input);
          return !result.ok; // must be Err, never Ok
        },
      ),
      { numRuns: 200, seed: 17004 },
    );
  });
});
