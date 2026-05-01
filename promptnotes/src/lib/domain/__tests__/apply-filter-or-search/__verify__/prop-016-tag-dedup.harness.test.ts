/**
 * PROP-016: Tag deduplication after normalization.
 *
 * Tier 1 — fast-check property test.
 * Required: true
 *
 * When tagsRaw contains multiple entries that normalize to the same Tag,
 * criteria.tags contains that Tag exactly once (first-occurrence order preserved).
 *
 * REQ-001, REQ-002
 */

import { describe, test } from "bun:test";
import fc from "fast-check";
import type { SortOrder } from "promptnotes-domain-types/curate/aggregates";
import type { UnvalidatedFilterInput } from "promptnotes-domain-types/curate/stages";
import { parseFilterInput } from "$lib/domain/apply-filter-or-search/parse-filter-input";
import { arbValidTagString } from "./_arbitraries";

const sortDesc: SortOrder = { field: "timestamp", direction: "desc" };

describe("PROP-016: tag deduplication after normalization", () => {
  test(
    "∀ tagsRaw with duplicates: criteria.tags contains each normalized Tag exactly once",
    () => {
      fc.assert(
        fc.property(
          // Generate a list of unique valid tag strings
          fc.uniqueArray(arbValidTagString(), { minLength: 1, maxLength: 5 }),
          (uniqueTags) => {
            // Create a tagsRaw with deliberate duplicates:
            // - original lowercase
            // - uppercase variant
            // - #-prefixed variant
            // - padded with whitespace
            const tagsRaw = uniqueTags.flatMap((t) => [
              t,                    // original
              t.toUpperCase(),      // uppercase (normalizes to same)
              `  ${t}  `,           // padded (normalizes to same)
            ]);

            const input: UnvalidatedFilterInput = {
              kind: "UnvalidatedFilterInput",
              tagsRaw,
              fieldsRaw: new Map(),
              searchTextRaw: null,
              sortOrder: sortDesc,
            };

            const result = parseFilterInput(input);
            if (!result.ok) return false;

            const tags = result.value.criteria.tags as readonly string[];

            // No duplicate normalized tags
            const tagSet = new Set(tags);
            if (tagSet.size !== tags.length) return false; // duplicates present

            // Each unique original tag must appear exactly once
            for (const t of uniqueTags) {
              const count = tags.filter((tag) => tag === t).length;
              if (count !== 1) return false;
            }

            return true;
          },
        ),
        { numRuns: 200, seed: 16001 },
      );
    },
  );

  test("first-occurrence order preserved after dedup", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(arbValidTagString(), { minLength: 2, maxLength: 5 }),
        (tags) => {
          // tagsRaw: first all originals, then all uppercase duplicates
          const tagsRaw = [...tags, ...tags.map((t) => t.toUpperCase())];
          const input: UnvalidatedFilterInput = {
            kind: "UnvalidatedFilterInput",
            tagsRaw,
            fieldsRaw: new Map(),
            searchTextRaw: null,
            sortOrder: sortDesc,
          };
          const result = parseFilterInput(input);
          if (!result.ok) return false;

          const outTags = result.value.criteria.tags as readonly string[];

          // Length must equal number of unique tags
          if (outTags.length !== tags.length) return false;

          // Order must match the first-occurrence order (the original `tags` array)
          for (let i = 0; i < tags.length; i++) {
            if (outTags[i] !== tags[i]) return false;
          }
          return true;
        },
      ),
      { numRuns: 200, seed: 16002 },
    );
  });

  test("example: ['claude-code', 'Claude-Code', '  claude-code  '] → [claude-code] (one entry)", () => {
    fc.assert(
      fc.property(
        fc.constant(["claude-code", "Claude-Code", "  claude-code  "]),
        (tagsRaw) => {
          const input: UnvalidatedFilterInput = {
            kind: "UnvalidatedFilterInput",
            tagsRaw,
            fieldsRaw: new Map(),
            searchTextRaw: null,
            sortOrder: sortDesc,
          };
          const result = parseFilterInput(input);
          if (!result.ok) return false;
          const tags = result.value.criteria.tags as readonly string[];
          return tags.length === 1 && tags[0] === "claude-code";
        },
      ),
      { numRuns: 1 },
    );
  });

  test("example: ['draft', 'review', 'Draft'] → ['draft', 'review'] (second 'Draft' deduped)", () => {
    fc.assert(
      fc.property(
        fc.constant(["draft", "review", "Draft"]),
        (tagsRaw) => {
          const input: UnvalidatedFilterInput = {
            kind: "UnvalidatedFilterInput",
            tagsRaw,
            fieldsRaw: new Map(),
            searchTextRaw: null,
            sortOrder: sortDesc,
          };
          const result = parseFilterInput(input);
          if (!result.ok) return false;
          const tags = result.value.criteria.tags as readonly string[];
          return (
            tags.length === 2 &&
            tags[0] === "draft" &&
            tags[1] === "review"
          );
        },
      ),
      { numRuns: 1 },
    );
  });
});
