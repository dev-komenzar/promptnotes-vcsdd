/**
 * PROP-010: Empty/whitespace searchTextRaw collapses to query=null.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * parseFilterInput with searchTextRaw of null, "", or any whitespace-only string
 * always produces AppliedFilter.query === null.
 *
 * REQ-005
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import type { SortOrder } from "promptnotes-domain-types/curate/aggregates";
import type { UnvalidatedFilterInput } from "promptnotes-domain-types/curate/stages";
import { parseFilterInput } from "$lib/domain/apply-filter-or-search/parse-filter-input";

const sortDesc: SortOrder = { field: "timestamp", direction: "desc" };

function makeInput(searchTextRaw: string | null): UnvalidatedFilterInput {
  return {
    kind: "UnvalidatedFilterInput",
    tagsRaw: [],
    fieldsRaw: new Map(),
    searchTextRaw,
    sortOrder: sortDesc,
  };
}

describe("PROP-010: empty/whitespace searchTextRaw → query=null", () => {
  test("null searchTextRaw → query=null (always)", () => {
    fc.assert(
      fc.property(
        fc.constant(null),
        (searchTextRaw) => {
          const result = parseFilterInput(makeInput(searchTextRaw));
          if (!result.ok) return false; // empty tagsRaw should never fail
          return result.value.query === null;
        },
      ),
      { numRuns: 50, seed: 10001 },
    );
  });

  test("empty string searchTextRaw → query=null", () => {
    fc.assert(
      fc.property(
        fc.constant(""),
        (searchTextRaw) => {
          const result = parseFilterInput(makeInput(searchTextRaw));
          if (!result.ok) return false;
          return result.value.query === null;
        },
      ),
      { numRuns: 50, seed: 10002 },
    );
  });

  test("whitespace-only strings collapse to query=null (spaces)", () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constant(" "), { minLength: 1, maxLength: 20 }),
        (searchTextRaw) => {
          const result = parseFilterInput(makeInput(searchTextRaw));
          if (!result.ok) return false;
          return result.value.query === null;
        },
      ),
      { numRuns: 200, seed: 10003 },
    );
  });

  test("whitespace-only strings collapse to query=null (tabs)", () => {
    fc.assert(
      fc.property(
        fc.stringOf(fc.constant("\t"), { minLength: 1, maxLength: 10 }),
        (searchTextRaw) => {
          const result = parseFilterInput(makeInput(searchTextRaw));
          if (!result.ok) return false;
          return result.value.query === null;
        },
      ),
      { numRuns: 100, seed: 10004 },
    );
  });

  test("non-whitespace content → query is not null", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
        (searchTextRaw) => {
          const result = parseFilterInput(makeInput(searchTextRaw));
          if (!result.ok) return false;
          return result.value.query !== null;
        },
      ),
      { numRuns: 200, seed: 10005 },
    );
  });

  test("non-whitespace content → query.text equals searchTextRaw verbatim (no trim)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
        (searchTextRaw) => {
          const result = parseFilterInput(makeInput(searchTextRaw));
          if (!result.ok) return false;
          if (result.value.query === null) return false;
          // text must equal the original (not trimmed)
          return result.value.query.text === searchTextRaw;
        },
      ),
      { numRuns: 200, seed: 10006 },
    );
  });

  test("scope is always 'body+frontmatter' for non-null query", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
        (searchTextRaw) => {
          const result = parseFilterInput(makeInput(searchTextRaw));
          if (!result.ok) return false;
          if (result.value.query === null) return true; // vacuously true
          return result.value.query.scope === "body+frontmatter";
        },
      ),
      { numRuns: 200, seed: 10007 },
    );
  });
});
