/**
 * parse-markdown-to-blocks-blank-lines.test.ts
 *
 * PROP-031 — REQ-017 rev8 parser blank-line behavior:
 *   `parseMarkdownToBlocks(s)` MUST NOT emit `paragraph('')` blocks for blank-line
 *   `\n\n+` separators between content blocks.
 *
 *   By Q5=A (spec rev8 / FIND-031):
 *     - Consecutive blank lines are coalesced into a block boundary.
 *     - The blank lines themselves do NOT produce `paragraph('')` artifacts.
 *     - A whitespace-only body (containing only `\n`, `\t`, ` `) MUST yield `Ok([])`.
 *     - `Ok([])` is the Step 2 signal that folded to `reason='block-parse'` (PROP-029 / Q4=A).
 *
 * Red phase: the current `parseMarkdownToBlocks` implementation emits `paragraph('')` for
 * every blank line encountered. Tests against the rev8 contract WILL FAIL.
 */

import { describe, it, expect } from "bun:test";
import * as fc from "fast-check";
import type { Block } from "promptnotes-domain-types/shared/note";

import { parseMarkdownToBlocks } from "$lib/domain/capture-auto-save/parse-markdown-to-blocks";

// ── Test helpers ──────────────────────────────────────────────────────────

function isEmptyParagraph(block: Block): boolean {
  return (
    (block.type as unknown as string) === "paragraph" &&
    (block.content as unknown as string) === ""
  );
}

// ── PROP-031: No paragraph('') in any output ──────────────────────────────

describe("PROP-031 (REQ-017 rev8) — parseMarkdownToBlocks MUST NOT emit paragraph('') for blank-line separators", () => {

  it("PROP-031 — 'a\\n\\n\\nb' returns Ok([paragraph('a'), paragraph('b')]) with no empty paragraph between them", () => {
    // Spec: consecutive blank lines are coalesced into a block boundary.
    // The blank lines do NOT produce paragraph('') artifacts.
    const result = parseMarkdownToBlocks("a\n\n\nb");

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Must have exactly two blocks: paragraph('a') and paragraph('b')
      expect(result.value).toHaveLength(2);

      const blockContents = result.value.map((b) => b.content as unknown as string);
      expect(blockContents).toContain("a");
      expect(blockContents).toContain("b");

      // PROP-031 core: NO paragraph('') in the output
      const emptyParas = result.value.filter(isEmptyParagraph);
      expect(emptyParas).toHaveLength(0);
    }
  });

  it("PROP-031 — '\\n\\n\\n' (blank lines only) returns Ok([])", () => {
    // Spec (Q5=A / Q4=A): whitespace-only body MUST yield Ok([]).
    // The parser MUST NOT auto-pad with a paragraph('') when the only content is blank lines.
    const result = parseMarkdownToBlocks("\n\n\n");

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Whitespace-only → no content blocks
      expect(result.value).toHaveLength(0);
    }
  });

  it("PROP-031 — '   ' (spaces only) returns Ok([])", () => {
    // A body containing only spaces is whitespace-only → must yield Ok([]).
    const result = parseMarkdownToBlocks("   ");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("PROP-031 — '\\t\\n  \\n\\t' (mixed whitespace) returns Ok([])", () => {
    // Mixed whitespace: tab, spaces, newlines → whitespace-only → must yield Ok([]).
    const result = parseMarkdownToBlocks("\t\n  \n\t");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(0);
    }
  });

  it("PROP-031 — '' (empty string) returns Ok([])", () => {
    // Empty string is also whitespace-only (trivially) → must yield Ok([]).
    // Rev8 removes the special empty-string → single paragraph('') fallback.
    const result = parseMarkdownToBlocks("");

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Rev8: empty string → Ok([]), NOT Ok([paragraph('')])
      expect(result.value).toHaveLength(0);
    }
  });

  it("PROP-031 — 'a\\n\\nb' (single blank line between two paragraphs) returns no empty paragraph", () => {
    // Single \n\n separator: coalesced into block boundary, no paragraph('').
    const result = parseMarkdownToBlocks("a\n\nb");

    expect(result.ok).toBe(true);
    if (result.ok) {
      // Must have paragraph('a') and paragraph('b'), no empty paragraph
      const emptyParas = result.value.filter(isEmptyParagraph);
      expect(emptyParas).toHaveLength(0);

      expect(result.value).toHaveLength(2);
    }
  });

  it("PROP-031 — '# Heading\\n\\n\\nParagraph' returns [heading, paragraph] with no empty paragraph", () => {
    // Multi-blank-line separator between heading and paragraph: no paragraph('') artifact.
    const result = parseMarkdownToBlocks("# Heading\n\n\nParagraph");

    expect(result.ok).toBe(true);
    if (result.ok) {
      const emptyParas = result.value.filter(isEmptyParagraph);
      expect(emptyParas).toHaveLength(0);

      // Must have exactly 2 blocks
      expect(result.value).toHaveLength(2);
      expect(result.value[0].type as unknown as string).toBe("heading-1");
      expect(result.value[1].type as unknown as string).toBe("paragraph");
      expect(result.value[1].content as unknown as string).toBe("Paragraph");
    }
  });

  it("PROP-031 — typical note body 'First\\n\\nSecond\\n\\nThird' returns 3 content blocks, no empty paragraphs", () => {
    // Standard Markdown note with double-newline separators between paragraphs.
    const result = parseMarkdownToBlocks("First\n\nSecond\n\nThird");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toHaveLength(3);

      const emptyParas = result.value.filter(isEmptyParagraph);
      expect(emptyParas).toHaveLength(0);

      const contents = result.value.map((b) => b.content as unknown as string);
      expect(contents).toEqual(["First", "Second", "Third"]);
    }
  });

  it("PROP-031 — '\\n  content  \\n' (leading/trailing whitespace lines) returns no empty paragraph", () => {
    // Leading blank line + content + trailing blank line: blank lines coalesced; content block preserved.
    const result = parseMarkdownToBlocks("\n  content  \n");

    expect(result.ok).toBe(true);
    if (result.ok) {
      const emptyParas = result.value.filter(isEmptyParagraph);
      expect(emptyParas).toHaveLength(0);

      // Should have exactly 1 content block (the content line)
      expect(result.value).toHaveLength(1);
    }
  });

  it("PROP-031 property (fast-check): for any markdown, result.value has NO paragraph('') blocks", () => {
    // Tier 1 property: the PROP-031 no-empty-paragraph contract holds for all inputs.
    // Generate arbitrary strings including blank-line-heavy inputs.
    fc.assert(
      fc.property(
        // Mix of content and blank lines
        fc.array(
          fc.oneof(
            fc.constant(""),           // blank line (the problematic case)
            fc.constant("\n"),         // extra blank
            fc.string({ unit: "grapheme", minLength: 1, maxLength: 30 })
              .filter((s) => !s.includes("```")), // avoid code fences for simplicity
          ),
          { minLength: 0, maxLength: 20 }
        ).map((lines) => lines.join("\n")),
        (markdown) => {
          const result = parseMarkdownToBlocks(markdown);

          if (!result.ok) {
            // Err is allowed (e.g., unterminated fence from fast-check input) — skip property check
            return true;
          }

          // PROP-031: none of the blocks must be paragraph('')
          for (const block of result.value) {
            if (isEmptyParagraph(block)) {
              return false;
            }
          }
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });
});

// ── PROP-031: Whitespace-only inputs all yield Ok([]) ─────────────────────

describe("PROP-031 — whitespace-only body variants all yield Ok([])", () => {

  const whitespaceOnlyInputs: [string, string][] = [
    ["empty string ''", ""],
    ["single space ' '", " "],
    ["multiple spaces '   '", "   "],
    ["single newline '\\n'", "\n"],
    ["multiple newlines '\\n\\n\\n'", "\n\n\n"],
    ["single tab '\\t'", "\t"],
    ["mixed '\\t\\n  \\n\\t'", "\t\n  \n\t"],
    ["spaces and newlines '  \\n  \\n  '", "  \n  \n  "],
  ];

  for (const [label, input] of whitespaceOnlyInputs) {
    it(`PROP-031 — ${label} → Ok([]) (no content blocks)`, () => {
      const result = parseMarkdownToBlocks(input);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(0);
      }
    });
  }
});
