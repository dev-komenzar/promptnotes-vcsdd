# Verification Report

## Feature: handle-save-failure | Sprint: 2 | Date: 2026-05-08

## Summary

Sprint-2 block migration (pendingNextNoteId → pendingNextFocus). All 22 PROPs
evaluated. All 5 required proof obligations PROVED. New PROP-HSF-022
(discard-with-pending-threads-blockId) evaluated and PASSED.

- Required obligations: 5
- Proved (required): 5
- Failed (required): 0
- Non-required evaluated: 17 (all pass)
- Non-required skipped: 0
- Total PROP count: 22

Tool stack: `bun test` (Tier 1 fast-check property tests, Tier 2/3 example-based),
`bunx tsc --noEmit` (Tier 0 type-level proofs).

Sprint-1 report preserved at:
`.vcsdd/features/handle-save-failure/verification/verification-report.md`

---

## Proof Obligations

| ID | Tier | Required | Status | Tool | Harness / Evidence |
|----|------|----------|--------|------|--------------------|
| PROP-HSF-001 | 1 | true | **proved** | fast-check / bun test | `__verify__/prop-HSF-001-retry-determinism.harness.test.ts` |
| PROP-HSF-002 | 1 | true | **proved** | fast-check / bun test | `__verify__/prop-HSF-001-retry-determinism.harness.test.ts` |
| PROP-HSF-003 | 1 | true | **proved** | fast-check / bun test | `__verify__/prop-HSF-021-pure-transition-no-side-effect.harness.test.ts` |
| PROP-HSF-004 | 1 | true | **proved** | fast-check / bun test | `__verify__/prop-HSF-021-pure-transition-no-side-effect.harness.test.ts` |
| PROP-HSF-005 | 0 | true | **proved** | tsc --noEmit | `security-results/tsc-noEmit-raw.txt` |
| PROP-HSF-006 | 2 | false | evaluated / PASS | bun test | `discard-current-session.test.ts` |
| PROP-HSF-007 | 2 | false | evaluated / PASS | bun test | `cancel-switch.test.ts` |
| PROP-HSF-008 | 2 | false | evaluated / PASS | bun test | `pipeline.test.ts` |
| PROP-HSF-009 | 2 | false | evaluated / PASS | bun test | `pipeline.test.ts` |
| PROP-HSF-010 | 2 | false | evaluated / PASS | bun test | `pipeline.test.ts` |
| PROP-HSF-011 | 2 | false | evaluated / PASS | bun test | `pipeline.test.ts` |
| PROP-HSF-012 | 2 | false | evaluated / PASS | bun test | `pipeline.test.ts` |
| PROP-HSF-013 | 2 | false | evaluated / PASS | bun test | `pipeline.test.ts` |
| PROP-HSF-014 | 2 | false | evaluated / PASS | bun test | `pipeline.test.ts` |
| PROP-HSF-015 | 2 | false | evaluated / PASS | bun test | `pipeline.test.ts` |
| PROP-HSF-016 | 0 | false | evaluated / PASS | tsc --noEmit | `security-results/tsc-noEmit-raw.txt` |
| PROP-HSF-017 | 2 | false | evaluated / PASS | bun test | `pipeline.test.ts` |
| PROP-HSF-018 | 3 | false | evaluated / PASS | bun test (integration) | `pipeline.test.ts` |
| PROP-HSF-019 | 2 | false | evaluated / PASS | bun test | `__verify__/prop-HSF-019-invariant-on-non-save-failed.harness.test.ts` |
| PROP-HSF-020 | 2 | false | evaluated / PASS | bun test | `__verify__/prop-HSF-020-clock-budget-invariant-violation.harness.test.ts` |
| PROP-HSF-021 | 1 | false | evaluated / PASS | fast-check / bun test | `__verify__/prop-HSF-021-pure-transition-no-side-effect.harness.test.ts` |
| PROP-HSF-022 | 2 | false | evaluated / PASS | fast-check / bun test | `__verify__/prop-HSF-022-discard-with-pending-threads-blockId.harness.test.ts` |

---

## Required Obligation Details

### PROP-HSF-001: retry-determinism (Tier 1, required)

- **Tool**: fast-check via bun test
- **Command**: `bun test src/lib/domain/__tests__/handle-save-failure/__verify__/prop-HSF-001-retry-determinism.harness.test.ts`
- **Result**: VERIFIED
- **Runs**: 1000 random (SaveFailedState with pendingNextFocus, timestamp) pairs
- **Sprint-2 change**: Arbitrary generator updated — `pendingNextFocus: { noteId, blockId }` replaces old `pendingNextNoteId: string`
- **Property**: `retryTransition(state, now)` called twice with identical inputs produces structurally equal `SavingState` outputs. No counterexample found.

### PROP-HSF-002: retry state shape (Tier 1, required)

- **Tool**: fast-check via bun test
- **Command**: co-located in prop-HSF-001 harness
- **Result**: VERIFIED
- **Runs**: 500 random inputs
- **Property**: `∀ SaveFailedState s, retryTransition(s, now).status === 'saving'` AND `retryTransition(s, now).currentNoteId === s.currentNoteId`. No counterexample found.

### PROP-HSF-003: discard routing (Tier 1, required)

- **Tool**: fast-check via bun test
- **Command**: `bun test src/lib/domain/__tests__/handle-save-failure/__verify__/prop-HSF-021-pure-transition-no-side-effect.harness.test.ts`
- **Result**: VERIFIED
- **Runs**: 500 random inputs
- **Sprint-2 change**: Property now also asserts `editing.focusedBlockId === state.pendingNextFocus.blockId` when pending is non-null. This was the [genuine red] assertion that the block migration implementation needed to satisfy.
- **Property**: `pendingNextFocus === null → status === 'idle'`; non-null → `status === 'editing'` AND `currentNoteId === pendingNextFocus.noteId` AND `focusedBlockId === pendingNextFocus.blockId`. No counterexample found.

### PROP-HSF-004: cancelSwitch state shape (Tier 1, required)

- **Tool**: fast-check via bun test
- **Command**: co-located in prop-HSF-021 harness
- **Result**: VERIFIED
- **Runs**: 500 random inputs with non-null pendingNextFocus
- **Sprint-2 change**: Added `focusedBlockId === null` assertion (Option A, REQ-HSF-005 design decision). This was a [genuine red] assertion.
- **Property**: `∀ SaveFailedState s (non-null pending), cancelSwitchTransition(s, now)` → `status === 'editing'`, `currentNoteId === s.currentNoteId`, `isDirty === true`, `lastSaveResult === 'failed'`, `focusedBlockId === null`. No counterexample found.

### PROP-HSF-005: UserDecision exhaustiveness (Tier 0, required)

- **Tool**: tsc --noEmit
- **Command**: `bunx tsc --noEmit` (scoped to handle-save-failure files)
- **Result**: VERIFIED
- **Proof file**: `promptnotes/tests/types/handle-save-failure.type-test.ts`
- **Evidence**: Zero TypeScript errors in any `handle-save-failure` path.
  Both `@ts-expect-error` annotations for `unknown-variant` and `defer-save` suppress real errors.
  `assertNeverUserDecision` never-branch compiles without error.
  Note: `tsc --noEmit` exits with code 2 due to pre-existing errors in unrelated modules; zero errors in `handle-save-failure` scope.

---

## New Obligation: PROP-HSF-022 (Sprint-2)

### PROP-HSF-022: discard-with-pending-threads-blockId (Tier 2, not required)

- **Tool**: fast-check + example-based, via bun test
- **Command**: `bun test src/lib/domain/__tests__/handle-save-failure/__verify__/prop-HSF-022-discard-with-pending-threads-blockId.harness.test.ts`
- **Result**: VERIFIED
- **Harness**: `__verify__/prop-HSF-022-discard-with-pending-threads-blockId.harness.test.ts`
- **Tests**: 5 tests (2 example-based, 1 fast-check 1000-run property, 1 pipeline example, 1 pipeline fast-check 500-run property)
- **Property**: `∀ SaveFailedState s` where `s.pendingNextFocus !== null`, `discardTransition(s, now).focusedBlockId === s.pendingNextFocus.blockId`. Also verified through the full pipeline orchestrator.
- **Note**: This was a [genuine red] test in sprint-2 TDD. The pre-migration implementation did not set `focusedBlockId`. After migration, `discard.ts` sets `focusedBlockId: state.pendingNextFocus.blockId` directly. All 5 sub-tests pass.

---

## PROP Coverage Gap Analysis

Verification architecture rev3 lists 22 PROPs (PROP-HSF-001..022). All 22 are
covered by at least one harness or example-based test. No coverage gaps detected.

Harness files under `__verify__/`:
- `prop-HSF-001-retry-determinism.harness.test.ts` — covers PROP-001 and PROP-002
- `prop-HSF-019-invariant-on-non-save-failed.harness.test.ts` — covers PROP-019
- `prop-HSF-020-clock-budget-invariant-violation.harness.test.ts` — covers PROP-020
- `prop-HSF-021-pure-transition-no-side-effect.harness.test.ts` — covers PROP-021, PROP-003, PROP-004
- `prop-HSF-022-discard-with-pending-threads-blockId.harness.test.ts` — covers PROP-022

PROP-HSF-006..018 covered by `retry-save.test.ts`, `discard-current-session.test.ts`,
`cancel-switch.test.ts`, and `pipeline.test.ts`.

---

## Tier Statistics

| Tier | Description | PROP IDs | Pass | Fail | Skipped |
|------|-------------|----------|------|------|---------|
| 0 | tsc type proofs | 005, 016 | 2 | 0 | 0 |
| 1 | fast-check property | 001, 002, 003, 004, 021 | 5 | 0 | 0 |
| 2 | example-based + fast-check | 006–015, 017, 019, 020, 022 | 14 | 0 | 0 |
| 3 | integration | 018 | 1 | 0 | 0 |

**Total**: 22 PROPs, 22 pass, 0 fail, 0 skipped.

Overall test execution: 89 tests across 9 files (19 in `__verify__/`), 0 failures.
