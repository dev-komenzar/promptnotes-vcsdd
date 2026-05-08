/**
 * PROP-029 Proof Harness — Ok([]) folds to reason='block-parse'
 *
 * Tier: 2 (example-based test)
 * Required: true
 * Sprint: 5 iteration 2
 * Date: 2026-05-08T00:00:00Z
 *
 * Test source:
 *   promptnotes/src/lib/domain/__tests__/app-startup/step2-block-parse.test.ts
 *   describe "PROP-029 (Q4) — parseMarkdownToBlocks Ok([]) → CorruptedFile reason='block-parse'"
 *   describe "PROP-029 (Q5=A reachable) — whitespace-only body produces Ok([]) from real parser..."
 *
 * Property:
 *   parseMarkdownToBlocks(snapshot.body) returning Ok([]) is folded by Step 2 caller to
 *   CorruptedFile.failure: { kind: 'hydrate', reason: 'block-parse' }.
 *   NOT 'invalid-value', NOT auto-padded, NOT silently dropped.
 *   Downstream invariant Note.blocks.length >= 1 preserved.
 *
 * Evidence:
 *   - 5 tests pass across two describe blocks:
 *     - stub parser returning Ok([]): reason='block-parse'
 *     - Ok([]) not silently dropped: total invariant preserved
 *     - Ok([]) not auto-padded: snapshots empty
 *     - real parser + '\n\n\n' body → Ok([]) → reason='block-parse' (Q5=A end-to-end)
 *     - real parser + '   ' body → Ok([]) → reason='block-parse'
 *   - See fuzz-results/sprint-5/prop-029.log
 *
 * Result: PROVED — 5 pass / 0 fail (within 12 tests for step2-block-parse.test.ts)
 */

// Canonical test file:
//   promptnotes/src/lib/domain/__tests__/app-startup/step2-block-parse.test.ts
//
// Key test names:
//   "PROP-029 — body producing Ok([]) → failure:{kind:'hydrate',reason:'block-parse'}"
//   "PROP-029 — Ok([]) not silently dropped: total invariant preserved"
//   "PROP-029 — Ok([]) is not auto-padded: resulting snapshot must not have blocks.length > 0"
//   "PROP-029 (Q5=A reachable) — snapshot with body='\\n\\n\\n' → real parser Ok([]) → CorruptedFile reason='block-parse'"
//   "PROP-029 (Q5=A reachable) — snapshot with body='   ' (spaces only) → real parser Ok([]) → block-parse"
