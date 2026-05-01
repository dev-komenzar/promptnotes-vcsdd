# Spec Review Verdict — handle-save-failure (Phase 1c, iter 2)

**Iteration**: 2
**Overall**: PASS
**Mode**: lean
**Reviewer**: fresh-context vcsdd-adversary
**Date**: 2026-05-01

## Per-dimension verdict

| Dimension       | Verdict | Notes                                                                                  |
|-----------------|---------|----------------------------------------------------------------------------------------|
| Completeness    | PASS    | All 4 valid branches + 2 invariant-rejection branches enumerated; all 6 `EditingState` fields specified per branch; edge case catalog covers `pendingNextNoteId` × `decision.kind` cross-product. |
| Correctness     | PASS    | REQs trace to `stages.ts` / `states.ts` / `internal-events.ts` / `errors.ts` / `aggregates.md`. The widened `(stage, state, decision)` signature is binding via REQ-HSF-011. `Promise.reject(SaveError {…})` consistently used for invariant violations. |
| Testability     | PASS    | All 21 PROPs name a concrete tool. Tier 0 encoding artifact `tests/types/handle-save-failure.type-test.ts` is named with `@ts-expect-error` + `tsc --noEmit`. AC field-level assertions are mechanically encodable. |
| Traceability    | PASS    | Coverage matrix maps every REQ-HSF-001..012 to ≥1 PROP. Events trace to `internal-events.ts` lines 85-95. One minor traceability quibble parked (FIND-SPEC2-001). |
| Purity boundary | PASS    | Pure transitions and effectful shell explicitly partitioned. Per-branch `Clock.now()` budget pinned (1 on valid / 0 on cancel-switch invalid). PROP-HSF-021 sentinel-spy property added. |

## Severity totals (iter 2)

- critical = **0**
- major = **0**
- minor = **3** (parked; non-blocking)
- total = **3**

## Iter-1 findings — confirmed resolved

| ID | Sev | Resolution location |
|----|-----|---------------------|
| FIND-SPEC-001 | crit | REQ-HSF-011 binds widened signature (behavioral-spec.md:270-279); OQ §3 removed |
| FIND-SPEC-002 | crit | REQ-HSF-004 AC (lines 132-138) + REQ-HSF-005 AC (lines 166-172) pin all 6 `EditingState` fields |
| FIND-SPEC-003 | crit | PROP-HSF-019 added (verification-architecture.md:88); REQ-HSF-001 coverage updated |
| FIND-SPEC-004 | maj | REQ-HSF-009 EARS + table pin "1 on valid; 0 on invalid"; PROP-HSF-020 added |
| FIND-SPEC-005 | maj | PROP-HSF-001 renamed `retry-determinism`; PROP-HSF-021 sentinel-spy purity added |
| FIND-SPEC-006 | maj | `aggregates.md` added to source-of-truth header; REQ-HSF-005 Rationale cites it |
| FIND-SPEC-007 | maj | All sites consistently use `Promise.reject(SaveError {…})`; "or returns an error result" hedge gone |
| FIND-SPEC-008 | min | n/a — was a prompt path issue, spec was already correct |
| FIND-SPEC-009 | min | REQ-HSF-012 added: `SaveFailedStage.error` logging-only; events carry no `error` field |
| FIND-SPEC-010 | min | Tier 0 encoding artifact named with `@ts-expect-error` + `tsc --noEmit` in CI |
| FIND-SPEC-011 | min | OQ §1 fallback contract added (zero events; UI relies on `ResolvedState`) |

## Iter-2 findings (parked, non-blocking)

| ID | Sev | Title |
|----|-----|-------|
| FIND-SPEC2-001 | minor | REQ-HSF-011 coverage re-uses PROP-HSF-005 (which is about `UserDecision` exhaustiveness, not the `(stage, state, decision)` signature) |
| FIND-SPEC2-002 | minor | REQ-HSF-002 step 4 wording is internally contradictory ("Preserve … in SavingState; however SavingState does not carry pendingNextNoteId") |
| FIND-SPEC2-003 | minor | PROP-HSF-021 says "with injected Clock spy + emit spy" but pure transitions' signatures `(state, now) => State` have no port DI seam |

See `findings.md` for full remediation guidance.

## Decision

PASS. All three iter-1 critical findings and all four major findings are resolved by the revision. The three iter-2 minor findings can be addressed during Phase 2a/2b without blocking the gate. Proceed to Phase 2a (Test Generation — Red).
