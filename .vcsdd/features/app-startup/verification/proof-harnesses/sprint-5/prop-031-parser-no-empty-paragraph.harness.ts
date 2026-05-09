/**
 * PROP-031 Proof Harness — parser blank-line coalesce contract
 *
 * Tier: 2 (example-based + Tier 1 fast-check property)
 * Required: true
 * Sprint: 5 iteration 2
 * Date: 2026-05-08T00:00:00Z
 *
 * Test source:
 *   promptnotes/src/lib/domain/__tests__/app-startup/parse-markdown-to-blocks-blank-lines.test.ts
 *
 * Property:
 *   ∀ markdown ∈ string, no element of parseMarkdownToBlocks(markdown).value is paragraph('').
 *   Whitespace-only body (only \n, \t, space) → Ok([]).
 *   Blank-line separators are structural and discarded; they NEVER produce paragraph('') artifacts.
 *
 * Evidence:
 *   - 18 tests pass:
 *     - 9 concrete example tests (blank-line separators, various whitespace patterns)
 *     - 8 whitespace-only parametric tests (empty, space, newlines, tab, mixed)
 *     - 1 fast-check property (numRuns=200)
 *   - See fuzz-results/sprint-5/prop-031.log
 *
 * Result: PROVED — 18 pass / 0 fail
 */

// Canonical test file:
//   promptnotes/src/lib/domain/__tests__/app-startup/parse-markdown-to-blocks-blank-lines.test.ts
//
// Key test names:
//   "PROP-031 — 'a\\n\\n\\nb' returns Ok([paragraph('a'), paragraph('b')]) with no empty paragraph between them"
//   "PROP-031 — '\\n\\n\\n' (blank lines only) returns Ok([])"
//   "PROP-031 — '   ' (spaces only) returns Ok([])"
//   "PROP-031 — '\\t\\n  \\n\\t' (mixed whitespace) returns Ok([])"
//   "PROP-031 — '' (empty string) returns Ok([])"
//   "PROP-031 — 'a\\n\\nb' (single blank line between two paragraphs) returns no empty paragraph"
//   "PROP-031 — '# Heading\\n\\n\\nParagraph' returns [heading, paragraph] with no empty paragraph"
//   "PROP-031 — typical note body 'First\\n\\nSecond\\n\\nThird' returns 3 content blocks, no empty paragraphs"
//   "PROP-031 — '\\n  content  \\n' (leading/trailing whitespace lines) returns no empty paragraph"
//   "PROP-031 property (fast-check): for any markdown, result.value has NO paragraph('') blocks"
//   (+ 8 whitespace-only parametric tests via for-loop)
