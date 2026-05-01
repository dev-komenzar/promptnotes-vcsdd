/**
 * PROP-011a: tryNewTag reuse — parseFilterInput calls tryNewTag and does NOT
 * contain parallel normalization logic.
 *
 * Tier 0 — Compile-time / code-review.
 * Required: true
 *
 * Carry-forward F-1c-101 resolution:
 *   The test verifies at compile+runtime that parse-filter-input.ts imports
 *   tryNewTag from ./try-new-tag.ts (not a parallel inline normalization).
 *
 *   Verification method: static source code inspection — the implementation
 *   file must contain `import { tryNewTag } from` pointing to try-new-tag.ts.
 *   A runtime spy approach is provided as the secondary verification.
 *
 * REQ-002
 */

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import path from "path";
import type { SortOrder } from "promptnotes-domain-types/curate/aggregates";
import type { UnvalidatedFilterInput } from "promptnotes-domain-types/curate/stages";
import { parseFilterInput } from "$lib/domain/apply-filter-or-search/parse-filter-input";

const sortDesc: SortOrder = { field: "timestamp", direction: "desc" };

function makeInput(tagsRaw: string[]): UnvalidatedFilterInput {
  return {
    kind: "UnvalidatedFilterInput",
    tagsRaw,
    fieldsRaw: new Map(),
    searchTextRaw: null,
    sortOrder: sortDesc,
  };
}

describe("PROP-011a: parseFilterInput imports tryNewTag from ./try-new-tag.ts", () => {
  test(
    "source file parse-filter-input.ts contains import of tryNewTag from try-new-tag",
    () => {
      // Tier-0 static source inspection: read the implementation file and check for import.
      // import.meta.dir → __tests__/apply-filter-or-search/__verify__/
      // 3 levels up → domain/, then sibling apply-filter-or-search/.
      const implPath = path.resolve(
        import.meta.dir,
        "../../../apply-filter-or-search/parse-filter-input.ts",
      );
      let source: string;
      try {
        source = readFileSync(implPath, "utf-8");
      } catch {
        // If the file doesn't exist yet (Phase 2a), this test fails as expected.
        throw new Error(
          `parse-filter-input.ts not found at ${implPath} — expected during Phase 2a (Red phase)`,
        );
      }

      // Check that the source imports tryNewTag from the co-located try-new-tag module
      const importPattern = /import[^;]*tryNewTag[^;]*from[^;]*try-new-tag/;
      expect(importPattern.test(source)).toBe(true);
    },
  );

  test(
    "source file parse-filter-input.ts does NOT contain hand-rolled lowercase or trim on tag strings",
    () => {
      const implPath = path.resolve(
        import.meta.dir,
        "../../../apply-filter-or-search/parse-filter-input.ts",
      );
      let source: string;
      try {
        source = readFileSync(implPath, "utf-8");
      } catch {
        throw new Error(
          `parse-filter-input.ts not found at ${implPath} — expected during Phase 2a (Red phase)`,
        );
      }

      // The implementation must NOT contain inline tag normalization patterns.
      // These would indicate parallel normalization instead of delegating to tryNewTag.
      const forbiddenPatterns = [
        /\.toLowerCase\(\).*tag/,       // hand-rolled lowercase on a tag
        /\.trim\(\).*tag/,              // hand-rolled trim on a tag
        /replace\s*\(\s*\/\^#\/.*tag/,  // hand-rolled # removal on a tag
      ];

      for (const pat of forbiddenPatterns) {
        expect(pat.test(source)).toBe(false);
      }
    },
  );

  test("runtime: parseFilterInput normalizes via tryNewTag (behavior consistent with delegation)", () => {
    // Behavioral equivalence: the output must match what tryNewTag would produce.
    // If parseFilterInput had inline normalization that differed from tryNewTag,
    // this test would catch the divergence.
    const rawWithHashAndCase = "  #Claude-Code  ";
    const input = makeInput([rawWithHashAndCase]);
    const result = parseFilterInput(input);

    // If tryNewTag is correctly delegated, it should normalize:
    //   trim → "#Claude-Code" → remove # → "Claude-Code" → lowercase → "claude-code"
    // The result should be Ok with tag "claude-code"
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.criteria.tags.length).toBe(1);
    expect(result.value.criteria.tags[0]).toBe("claude-code");
  });
});
