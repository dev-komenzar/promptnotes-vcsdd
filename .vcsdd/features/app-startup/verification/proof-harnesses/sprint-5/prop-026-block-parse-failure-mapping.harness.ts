/**
 * PROP-026 Proof Harness — block-parse failure mapping
 *
 * Tier: 2 (example-based test with stub)
 * Required: true
 * Sprint: 5 iteration 2
 * Date: 2026-05-08T00:00:00Z
 *
 * Test source:
 *   promptnotes/src/lib/domain/__tests__/app-startup/step2-block-parse.test.ts
 *   describe "REQ-017 / PROP-026 — parseMarkdownToBlocks failure → CorruptedFile reason='block-parse'"
 *
 * Property:
 *   Per-file parseMarkdownToBlocks Err during scanVault → CorruptedFile.failure.kind='hydrate',
 *   reason='block-parse'. NOT 'unknown', NOT 'invalid-value', NOT 'yaml-parse'.
 *   Workflow continues processing remaining files (no early termination).
 *
 * Evidence:
 *   - 5 tests pass (unterminated-code-fence, malformed-structure, not-yaml-parse, continues-on-fail, total-invariant)
 *   - Uses parseMarkdownToBlocks stub (makeBlockParserFailsFor / makeBlockParserAlwaysFail)
 *   - See fuzz-results/sprint-5/prop-026.log
 *
 * Result: PROVED — 5 pass / 0 fail (within 12 tests for step2-block-parse.test.ts)
 */

// Canonical test file:
//   promptnotes/src/lib/domain/__tests__/app-startup/step2-block-parse.test.ts
//
// Key test names:
//   "PROP-026 — unterminated-code-fence error → failure:{kind:'hydrate',reason:'block-parse'}"
//   "PROP-026 — malformed-structure error → failure:{kind:'hydrate',reason:'block-parse'}"
//   "PROP-026 — frontmatter-ok but block-parse-fail → reason='block-parse' (not 'yaml-parse')"
//   "PROP-026 — block-parse failure on one file; remaining files still processed"
//   "PROP-026 — total invariant preserved when block-parse fails on N files"
