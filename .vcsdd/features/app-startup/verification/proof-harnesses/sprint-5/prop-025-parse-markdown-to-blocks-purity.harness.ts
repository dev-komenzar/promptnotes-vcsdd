/**
 * PROP-025 Proof Harness — parseMarkdownToBlocks purity
 *
 * Tier: 1 (fast-check property test)
 * Required: true
 * Sprint: 5 iteration 2
 * Date: 2026-05-08T00:00:00Z
 *
 * Test source:
 *   promptnotes/src/lib/domain/__tests__/app-startup/parse-markdown-to-blocks-purity.test.ts
 *
 * Property:
 *   ∀ markdown ∈ string, parseMarkdownToBlocks(markdown) deepEquals parseMarkdownToBlocks(markdown)
 *   including Block.id values (deterministic positional BlockId 'block-0'..'block-N-1').
 *
 * Evidence:
 *   - 8 tests pass (6 concrete + 1 fast-check property + 1 UUID-not-used check)
 *   - fast-check numRuns default (100)
 *   - See fuzz-results/sprint-5/prop-025.log
 *
 * Result: PROVED — 8 pass / 0 fail
 */

// This harness references the canonical test file. No code duplication.
// The executable proof lives at:
//   promptnotes/src/lib/domain/__tests__/app-startup/parse-markdown-to-blocks-purity.test.ts
//
// Key test names (mapping to spec claims):
//   "PROP-025 — simple paragraph: same markdown → same Block[] with same BlockIds"
//   "PROP-025 — multi-block markdown: both calls produce same BlockId sequence (block-0, block-1, ...)"
//   "PROP-025 — code block (fence): deterministic BlockId even after other parse calls"
//   "PROP-025 / PROP-031 rev8 — empty string produces Ok([]) (whitespace-only → no content blocks)"
//   "PROP-025 property (fast-check): ∀ markdown, parseMarkdownToBlocks(m) deepEquals parseMarkdownToBlocks(m)"
//   "PROP-025 — positional BlockId: 5-block document has IDs block-0 through block-4"
//   "PROP-025 — interleaved calls: multiple different inputs don't contaminate each other's BlockIds"
//   "PROP-025 — BlockIds are NOT UUID format (must be positional block-N)"
