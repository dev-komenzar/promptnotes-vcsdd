# Verification Report — configure-vault

**Feature**: configure-vault
**Sprint**: 2
**Date**: 2026-05-02
**Mode**: lean
**Language**: TypeScript

---

## Proof Obligations

| ID | Tier | Required | Status | Tool | Artifact |
|----|------|----------|--------|------|---------|
| PROP-CV-001 | 1 | true | proved | fast-check / bun test | `map-stat-dir-result.test.ts` + `prop-cv-001-port-call-budget.harness.test.ts` |
| PROP-CV-002 | 1 | true | proved | fast-check / bun test | `map-stat-dir-result.test.ts` (7-case collapse, 41 tests) |
| PROP-CV-003 | 1 | true | proved | fast-check / bun test | `map-settings-save-error.test.ts` (5-variant collapse, 26 tests) |
| PROP-CV-004 | 1 | true | proved | fast-check / bun test | `validate-and-transition.test.ts` (14 tests) |
| PROP-CV-005 | 1 | true | partially-proved | fast-check | `prop-cv-001-port-call-budget.harness.test.ts` (FIND-003: success-path generator unused) |
| PROP-CV-006 | 1 | true | partially-proved | fast-check | `prop-cv-005-event-emission-discipline.harness.test.ts` (FIND-003: success-path generator unused) |
| PROP-CV-007 | 0 | true | proved | tsc (compile-time) | TypeScript exhaustiveness — never branch enforced at compile time |
| PROP-CV-007b | 1 | true | proved | fast-check | `prop-cv-007b-no-unconfigured-from-pipeline.harness.test.ts` (500-run cross-product) |
| PROP-CV-008 | 1 | true | partially-proved | fast-check | `prop-cv-008-ordering.harness.test.ts` (FIND-003: success-path ordering test uses fc.nat() seed that is unused) |
| PROP-CV-009 | 1 | true | proved | bun test | `prop-cv-008-ordering.harness.test.ts` (clockNow count indirectly; `pipeline.test.ts` directly) |
| PROP-CV-010 | 1 | false | not-required | — | No standalone harness; covered partially by `pipeline.test.ts` example-based tests |
| PROP-CV-011 | 2 | false | not-required | — | No standalone harness; covered by `validate-and-transition.test.ts` |
| PROP-CV-012 | 2 | false | not-required | — | No standalone harness; covered by `pipeline.test.ts` success-path assertions |
| PROP-CV-013 | 2 | false | not-required | — | No standalone harness; covered by `map-settings-save-error.test.ts` |
| PROP-CV-014 | 2 | false | not-required | — | No standalone harness; covered by `map-settings-save-error.test.ts` |

---

## Results

### Fresh run — 2026-05-02

**Command**: `bun test src/lib/domain/__tests__/configure-vault/__verify__/`

**Output** (captured at `fuzz-results/property-tests.log`):

```
bun test v1.3.11 (af24e281)

 50 pass
 0 fail
 111 expect() calls
Ran 50 tests across 4 files. [54.00ms]
```

All 4 `__verify__` harnesses pass. Full configure-vault suite (192 tests across 8 files) passes per sprint-2-green-phase.log.

---

### PROP-CV-001: mapStatDirResult purity

- **Tool**: fast-check (property) + bun test (unit)
- **Harness**: `map-stat-dir-result.test.ts` (41 tests, 7-case collapse enumeration)
- **Result**: PASS
- **Note**: No dedicated `__verify__` harness for the repeated-call purity property; the unit test suite enumerates all 7 input combinations deterministically. Purity is also enforced structurally — the function has no closures or mutation.

### PROP-CV-002: mapStatDirResult collapse rule

- **Tool**: bun test (enumeration)
- **Harness**: `map-stat-dir-result.test.ts`
- **Result**: PASS — all 7 (statResult, path) combinations assert exact VaultConfigError.kind

### PROP-CV-003: mapSettingsSaveError collapse rule

- **Tool**: bun test (enumeration)
- **Harness**: `map-settings-save-error.test.ts`
- **Result**: PASS — all 5 FsError.kind values covered, correct VaultConfigError.kind asserted

### PROP-CV-004: validateAndTransitionVault purity

- **Tool**: bun test
- **Harness**: `validate-and-transition.test.ts` (14 tests)
- **Result**: PASS — arbitrary (VaultId, VaultPath, Timestamp) inputs; Ready invariant holds; no ports in implementation

### PROP-CV-005: I/O budget per path (FIND-003 affected)

- **Tool**: fast-check
- **Harness**: `prop-cv-001-port-call-budget.harness.test.ts`
- **Result**: PASS (partially-proved)
- **FIND-003 residual**: The success-path property (`fc.string({minLength:1})`) generates `_pathStr` that is discarded; the pipeline always sees constant `TEST_PATH`. The 100 runs are functionally one example repeated. Failure-path properties (`arbStatDirFailure`, `arbSettingsSaveFailure`) correctly consume their arbitraries — those sub-properties are genuinely proven over varied inputs (200 runs each).
- **Compensating coverage**: `pipeline.test.ts` integration tests exercise success-path budget assertions as explicit examples.

### PROP-CV-006: Exactly one event emitted on success (FIND-003 affected)

- **Tool**: fast-check
- **Harness**: `prop-cv-005-event-emission-discipline.harness.test.ts`
- **Result**: PASS (partially-proved)
- **FIND-003 residual**: Success-path property uses `fc.nat()` seed that is never consumed. Same pattern as PROP-CV-005. Failure-path properties (200 runs each) are genuine.

### PROP-CV-007: VaultConfigError exhaustiveness (compile-time)

- **Tool**: TypeScript strict / tsc
- **Result**: PASS — compile-time only; the `never` branch in any switch over `VaultConfigError.kind` is enforced by the type system. No separate runtime harness needed for this tier-0 obligation.

### PROP-CV-007b: No "unconfigured" error from pipeline

- **Tool**: fast-check
- **Harness**: `prop-cv-007b-no-unconfigured-from-pipeline.harness.test.ts`
- **Result**: PASS — 500-run full cross-product (all statDir x all settingsSave outcomes); no error has kind === "unconfigured"

### PROP-CV-008: statDir-before-settingsSave ordering (FIND-003 affected)

- **Tool**: fast-check
- **Harness**: `prop-cv-008-ordering.harness.test.ts`
- **Result**: PASS (partially-proved)
- **FIND-003 residual**: The success-path ordering assertion uses `fc.nat()` seed that is not consumed by the test body; 100 iterations verify the same fixed input. Failure-path assertions (`arbStatDirFailure`, `arbSettingsSaveFailure` — 200 runs each) are genuine. Explicit examples at the bottom of the harness confirm exact call order `[statDir, settingsSave, clockNow, emit]` on success and `[statDir]`/`[statDir, settingsSave]` on each failure branch.

### PROP-CV-009: Clock.now at-most-once on success path only

- **Tool**: bun test (indirect via ordering harness)
- **Harness**: `prop-cv-008-ordering.harness.test.ts` (clockNow counts in OrderingLog); `pipeline.test.ts`
- **Result**: PASS — clockNow count is 0 on all statDir-failure paths (200-run property), 0 on all settingsSave-failure paths (200-run property), and exactly 1 on success path (explicit assertion). PROP-CV-009 has no standalone `__verify__` harness but is fully covered by the ordering harness and pipeline integration tests.

---

## Lean-Mode Degradation Summary

This feature operates in lean mode. The verification architecture defines Tier 0/1 for all required obligations. No Tier 2/3 formal proof tools (Kani, model checkers) were applicable or declared required.

Fast-check carries the property-verification load for Tier 1 obligations. Where dedicated `__verify__` harnesses were not written for PROP-CV-001 through PROP-CV-004 (purity + collapse rules), the regular unit test suites (`map-stat-dir-result.test.ts`, `map-settings-save-error.test.ts`, `validate-and-transition.test.ts`) provide exhaustive enumeration-based coverage with assertion counts equivalent to property tests over finite domains.

## FIND-003 Residual Risk (carry-forward from Phase 3)

Three success-path properties in `__verify__/` harnesses have unused fast-check arbitraries:

- `prop-cv-001-port-call-budget.harness.test.ts` line 89 — `fc.string({minLength:1})` generates `_pathStr`, which is discarded; the pipeline always sees `TEST_PATH`.
- `prop-cv-005-event-emission-discipline.harness.test.ts` line 84 — `fc.nat()` generates `_seed`, which is discarded.
- `prop-cv-008-ordering.harness.test.ts` line 132 — `fc.nat()` generates `_seed`, which is discarded.

These success-path sub-properties pass deterministically (repeated example) rather than over a real input space. This is classified as `partially-proved` rather than `proved` for PROP-CV-005, PROP-CV-006, and PROP-CV-008. It does NOT block Phase 6 because:

1. The failure-path coverage in those same harnesses IS genuine (arbitraries are consumed).
2. The success-path semantics are independently covered by `pipeline.test.ts` example-based integration tests (57 tests).
3. The residual risk (a path-content-dependent regression on the success budget) is low: the pipeline implementation has no branching conditioned on path string content.

Phase 6 may choose to remediate FIND-003 in a follow-up sprint by wiring the generated path string through the VaultPath brand cast.

---

## Summary

- Required obligations: 9 (PROP-CV-001 through PROP-CV-009)
- Proved: 5 (PROP-CV-001, PROP-CV-002, PROP-CV-003, PROP-CV-004, PROP-CV-007b)
- Type-level (proved at compile time): 1 (PROP-CV-007)
- Partially-proved: 3 (PROP-CV-005, PROP-CV-006, PROP-CV-008 — FIND-003 success-path generators unused)
- Failed: 0
- Skipped: 0
- Non-required obligations: 5 (PROP-CV-010 through PROP-CV-014) — all not-required; no Phase 6 block
- Total obligations declared in verification-architecture.md: 14
