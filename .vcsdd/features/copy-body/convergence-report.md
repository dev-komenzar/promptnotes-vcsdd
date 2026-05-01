# Convergence Report: copy-body

**Feature**: copy-body
**Phase**: 6
**Date**: 2026-05-01
**Mode**: lean

## Convergence Dimensions

### 1. Finding Diminishment

- Phase 1c (spec review): 5 findings (0 blocker, 0 major, 5 minor) — **all resolved in-place** before Phase 2a.
- Phase 3 (adversary): 4 findings (0 blocker, 0 major, 4 minor) — **all resolved in-place** before Phase 5.
- **Trend**: 5 → 4 → 0 (monotonically decreasing).
- No escalation required.

### 2. Finding Specificity

All finding file paths reference real source files (`pipeline.ts`, `pipeline.test.ts`, the 10 PROP harnesses). No hallucinated paths detected.

### 3. Criteria Coverage

The Phase 3 adversary review covered all relevant dimensions for a small Pure-leaning workflow:

- spec_fidelity (REQ-001..REQ-012 ↔ implementation walk-through)
- edge_case_coverage (empty body, FsError variants, frozen inputs)
- implementation_correctness (`as CaptureDeps` cast → resolved)
- structural_integrity (`CopyBodyDeps` narrowing enforces I/O budget at type level)
- verification_readiness (10/10 PROPs harnessed and proved)

### 4. Duplicate Detection

No duplicate findings between Phase 1c (spec) and Phase 3 (impl) — they targeted different layers.

## Proof Obligations

| ID | Status | Tier |
|----|--------|------|
| PROP-001 | proved | 1 |
| PROP-002 | proved | 1 |
| PROP-003 | proved | 1 |
| PROP-004 | proved | 1 |
| PROP-005 | proved | 1 |
| PROP-006 | proved | 0 |
| PROP-007 | proved | 1 |
| PROP-008 | proved | 1 |
| PROP-009 | proved | 1 |
| PROP-010 | proved | 1 |

All 10 required proof obligations proved.

## Test Summary

- Unit tests (`pipeline.test.ts` + `body-for-clipboard.test.ts`): 26 pass.
- Verification harnesses (`__verify__/prop-001..010`): 19 pass.
- Total copy-body tests: 45 pass, 0 fail (503 expect calls).
- Regression baseline (capture-auto-save, edit-past-note-start, app-startup): 275/275 pass — no regression.
- Combined: 320/320 pass.

## Known Deferred Items

1. `NoteBodyCopiedToClipboard` channel — currently delivered via internal `emitInternal` callback per the existing `TagInventoryUpdated` precedent. Future work could consolidate Capture's two internal events into a typed internal event bus.
2. `bodyForClipboard` is implemented locally under `copy-body/`; the canonical `NoteOps` interface declares it as part of the Note Aggregate, awaiting a future "Note aggregate consolidation" feature.
3. UI integration (clipboard button, hot-key binding, retry banner on failure) is out of scope — pipeline only.

## Verdict

**PASS** — Four-dimensional convergence achieved with no escalation. The pipeline is small, pure-leaning, and fully verified at lean tier.
