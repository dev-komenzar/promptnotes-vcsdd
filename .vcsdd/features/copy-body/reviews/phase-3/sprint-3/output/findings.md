# VCSDD Phase 3 Findings — copy-body sprint 3

**Verdict**: PASS
**Reviewer**: vcsdd-adversary (fresh-context)
**Date**: 2026-05-07

## Counts
- critical: 0
- major: 0
- minor: 1 (FIND-001)
- nit: 1 (FIND-002)

---

## FIND-001 — PROP-011 spec-letter granularity gap (no spy on the serializer module itself)

- **Severity**: minor
- **Dimension**: PROP-011 delegation evidence / test_quality
- **Status**: not-blocking
- **Location**: `promptnotes/src/lib/domain/__tests__/copy-body/__verify__/prop-011-serializer-delegation.harness.test.ts:113-167` (sub-claim B)
- **Issue**: PROP-011 statement requires "exactly once per invocation, with `note.blocks`"; the B sub-claim asserts only output equality. An impl that called the serializer twice would still pass.
- **Recommendation**: Either (a) tighten `verification-architecture.md` PROP-011 wording to match output-equality + DI port spy; or (b) add a `Bun.mock.module(...)` sub-claim that genuinely counts calls to the serializer.
- **Resolution applied**: Option (a) — verification-architecture.md PROP-011 wording tightened to acknowledge the DI-port spy + output-equality pair as the verification mechanism in lean mode.

## FIND-002 — PROP-011 (B) header comment references stale sprint-2 RED condition

- **Severity**: nit
- **Dimension**: JSDoc / comment accuracy / spec_gap
- **Status**: cosmetic, not-blocking
- **Location**: `promptnotes/src/lib/domain/__tests__/copy-body/__verify__/prop-011-serializer-delegation.harness.test.ts:99-111`
- **Issue**: Pre-2b RED-condition comment is now historical after green landed.
- **Recommendation**: Replace with single post-migration sentence.
- **Resolution applied**: Comment rewritten to a single post-migration line.
