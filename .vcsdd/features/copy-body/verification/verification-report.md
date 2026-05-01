# Verification Report: copy-body

**Feature**: copy-body
**Phase**: 5
**Mode**: lean
**Date**: 2026-05-01

## Proof Obligations

| ID | Tier | Required | Status | Harness |
|----|------|----------|--------|---------|
| PROP-001 | 1 | true | proved | prop-001-body-for-clipboard-purity.harness.test.ts |
| PROP-002 | 1 | true | proved | prop-002-body-equals-note-body.harness.test.ts |
| PROP-003 | 1 | true | proved | prop-003-frontmatter-exclusion.harness.test.ts |
| PROP-004 | 1 | true | proved | prop-004-success-io-budget.harness.test.ts |
| PROP-005 | 1 | true | proved | prop-005-failure-io-budget.harness.test.ts |
| PROP-006 | 0 | true | proved | prop-006-save-error-exhaustive.harness.test.ts |
| PROP-007 | 1 | true | proved | prop-007-read-only-inputs.harness.test.ts |
| PROP-008 | 1 | true | proved | prop-008-empty-body-copy.harness.test.ts |
| PROP-009 | 1 | true | proved | prop-009-pass-through.harness.test.ts |
| PROP-010 | 1 | true | proved | prop-010-fserror-pass-through.harness.test.ts |

All 10 required proof obligations are **proved**. 19 harness tests pass, 0 failures (449 expect() calls).

## Summary

- Total proof obligations: 10 required, 10 proved (Tier 0: 1, Tier 1: 9)
- fast-check runs: 200–1000 iterations per property (deterministic seeds)
- No shrinkage events (all properties hold across all generated inputs)
- TypeScript exhaustiveness: `SaveError` 2-variant union verified via `never` branch (PROP-006)
- I/O budget verified across success and failure paths (PROP-004, PROP-005)
- Read-only invariant verified via deep-freeze (PROP-007)
- Phase 3 adversary findings (FIND-001..004): all resolved in-place before this phase

## Harness Test Output

See `verification/fuzz-results/all-props.log` for the full bun test transcript.

## Pure Core

`bodyForClipboard` is the formally verified pure core: deterministic, no I/O,
total over `Note`. PROP-001 (purity), PROP-002 (identity), PROP-003 (frontmatter
exclusion) cover it.
