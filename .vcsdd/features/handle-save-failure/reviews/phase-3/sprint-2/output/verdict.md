# Phase 3 Adversarial Review — Verdict (sprint 2, iter 1)

**Feature**: `handle-save-failure`
**Phase**: 3 (Adversarial Review)
**Sprint**: 2 (block-based domain type migration: `pendingNextNoteId` → `pendingNextFocus`, new `EditingState.focusedBlockId`)
**Mode**: lean
**Iteration**: 1
**Reviewer**: VCSDD Adversary (fresh context)
**Timestamp**: 2026-05-08T00:00:00Z

## Overall Verdict: PASS

The sprint-2 implementation correctly threads the new `PendingNextFocus = { noteId, blockId }` composite type and the new `EditingState.focusedBlockId` field through every reviewable surface:

- `discard.ts:42` sets `focusedBlockId: state.pendingNextFocus.blockId` (REQ-HSF-004 design decision).
- `cancel-switch.ts:29` sets `focusedBlockId: null` (REQ-HSF-005 Option A).
- `pipeline.ts:163` rejects with the exact required detail string `"cancel-switch requires pendingNextFocus"` (REQ-HSF-006).
- `pipeline.ts:114` retains the runtime save-failed invariant guard before any port use (REQ-HSF-001, PROP-HSF-019).
- `pipeline.ts:158-176` keeps the cancel-switch invariant guard ahead of `clockNow()` (REQ-HSF-009 / PROP-HSF-020 zero-call rule).
- The orchestrator still calls `clockNow()` exactly once on every valid branch, with the same `now` reused for both the pure transition and event `occurredOn` (`pipeline.ts:122-130, 141-150, 170-171`).
- `transitions.ts:11-13` re-exports the three pure functions under the `*Transition` aliases used by the `__verify__` harness; no aliasing or import path issue.
- The sprint-2 fast-check harness `prop-HSF-022-discard-with-pending-threads-blockId.harness.test.ts` pins both an example test and a 1000-run fast-check property on `discard().focusedBlockId === state.pendingNextFocus.blockId`, plus a 500-run pipeline property — the new `blockId` threading cannot silently regress.
- PROP-HSF-008 has been extended in three places to assert `"blockId" in event === false` (`pipeline.test.ts:385`, `discard-current-session.test.ts:251,365`, `cancel-switch.test.ts:282`) so the new pending `blockId` cannot leak into emitted event payloads.
- The Tier-0 type-test (`tests/types/handle-save-failure.type-test.ts`) preserves `@ts-expect-error` on three negative cases (unknown `UserDecision.kind`, future variant `defer-save`, `PublicDomainEvent` not assignable to `emit`) and adds a fourth (`_threeParam` / 4-arity check). The static check still fails fast in CI if the underlying type contract regresses.
- Domain SoT (`docs/domain/code/ts/src/capture/states.ts:14-17, 35-45, 70-75`) was the input to the migration, not modified by the sprint; `SaveFailedState` retains its 4-field shape; no new event types added (`internal-events.ts:20-38` unchanged from spec listing).

One minor non-blocking finding (FIND-S2-001) is recorded for documentation drift in `pipeline.ts:100` JSDoc. It does not affect any spec / runtime / type contract, so the overall verdict remains PASS.

## Per-Dimension Verdicts

| Dimension | Verdict | Findings |
|-----------|---------|----------|
| 1. spec_fidelity (REQ-HSF-001..012, sprint-2 deltas) | **PASS** | — |
| 2. structural_integrity (orchestrator vs pure core, Clock budget, single emit) | **PASS** | — |
| 3. test_strength (PROP-HSF-022 example+property, PROP-HSF-008 blockId leak guard, 7-field assertions, type-test) | **PASS** | — |
| 4. adversarial_calibration (subtle bugs, stale strings, fixture mistakes, re-exports) | **PASS** | FIND-S2-001 (minor — JSDoc drift, non-blocking) |
| 5. scope_discipline (no new fields, no new events, no other-feature changes) | **PASS** | — |

## Why each dimension passes

### Dimension 1: spec_fidelity — PASS

REQ-HSF-001 — runtime invariant guard at `pipeline.ts:114` rejects with `{ kind: 'validation', reason: { kind: 'invariant-violated', detail: 'state.status must be save-failed' } }`. PROP-HSF-019 covers all four non-save-failed status variants (`idle`, `editing`, `saving`, `switching`) at `prop-HSF-019.harness.test.ts:158-212`.

REQ-HSF-002 — `retry.ts:23-29` produces `SavingState { status, currentNoteId: state.currentNoteId, savingStartedAt: now }`. `pipeline.ts:122-130` reuses `now` for both the transition and `RetrySaveRequested.occurredOn`. PROP-HSF-014 (`pipeline.test.ts:221-235`, `retry-save.test.ts:178-199`) pins the timestamp reuse.

REQ-HSF-003 — `discard.ts:30-36` returns `IdleState { status: 'idle' }` when `pendingNextFocus === null`; `pipeline.ts:141-150` emits `EditingSessionDiscarded { kind, noteId: state.currentNoteId, occurredOn: now }`. PROP-HSF-003/PROP-HSF-010/PROP-HSF-013/PROP-HSF-015 all covered.

REQ-HSF-004 — **sprint-2 critical AC** — `discard.ts:39-48` sets all 7 EditingState fields, with `focusedBlockId: state.pendingNextFocus.blockId`. PROP-HSF-006 (`discard-current-session.test.ts:287-313`) and PROP-HSF-022 (`prop-HSF-022.harness.test.ts:109-252`) both assert. The `blockId` is threaded through both the pure `discardTransition` and the full pipeline. The event payload still carries `noteId === state.currentNoteId` (the discarded note), confirmed by `discard-current-session.test.ts:339-366`.

REQ-HSF-005 — **sprint-2 critical AC** — `cancel-switch.ts:26-34` returns 7-field `EditingState` with `focusedBlockId: null` (Option A), `isDirty: true`, `lastSaveResult: 'failed'`, plus the three null-state fields. PROP-HSF-004 (`cancel-switch.test.ts:120-144`) and the fast-check version (`prop-HSF-021.harness.test.ts:192-209`) both pin all five non-null/null-distinct fields.

REQ-HSF-006 — **sprint-2 critical AC** — `pipeline.ts:158-165` rejects with detail `"cancel-switch requires pendingNextFocus"` exactly. `cancel-switch.test.ts:354-368` and `pipeline.test.ts:489-500` both assert the detail string. The guard runs before `clockNow()` is called, confirmed by PROP-HSF-020 (`prop-HSF-020.harness.test.ts:113-167`, 200 random fast-check runs of zero `clockNow` calls).

REQ-HSF-007 — `pipeline.ts:179-181` `default: assertNever(decision)`; static enforcement in `tests/types/handle-save-failure.type-test.ts:46-72`.

REQ-HSF-008 — emit count = 1 on `retry-save` and `discard-*`, = 0 on `cancel-switch`. Asserted in `pipeline.test.ts:539-588` and the dedicated branch test files.

REQ-HSF-009 — Clock budget: 1 on every valid branch, 0 on cancel-switch-invalid. PROP-HSF-013 + PROP-HSF-020 both encoded.

REQ-HSF-010 — `ResolvedState.kind === 'ResolvedState'` and `resolution` mapping retried/discarded/cancelled. Asserted in `pipeline.test.ts:655-699`.

REQ-HSF-011 — widened `(stage, state, decision, ports)` signature. Type-test `tests/types/handle-save-failure.type-test.ts:114-141` confirms 4 parameters and that a 3-arg variant is rejected.

REQ-HSF-012 — every test that emits an event additionally asserts `"error" in event === false`: `pipeline.test.ts:204-217, 290-304, 703-734`, `retry-save.test.ts:265-283`, `discard-current-session.test.ts:215-231`. No emitted event carries `SaveError`.

### Dimension 2: structural_integrity — PASS

The orchestrator (`pipeline.ts`) is the only effectful site for `clockNow()` and `emit`. The pure transition modules (`retry.ts`, `discard.ts`, `cancel-switch.ts`) accept `now: Timestamp` as a parameter and never reach for a clock or emit; PROP-HSF-021 (`prop-HSF-021.harness.test.ts:108-164`) actively verifies this with `spyOn(Date, "now")` over 500 fast-check runs and a JSON-roundtrip mutation check on the input state. No port leakage was introduced by the sprint-2 changes.

The pipeline orchestrator places the cancel-switch null-guard at line 161 — before `clockNow()` at line 170 — preserving the REQ-HSF-009 zero-call invariant. The retry, discard, and cancel-switch valid branches all call `clockNow()` exactly once and reuse the value for both the transition and the event payload.

`transitions.ts` cleanly re-exports the three pure functions for `__verify__` consumption with `*Transition` suffixes; no behavioral wrapper, no transformation, just `export { x as xTransition }`. The `__verify__` harness imports work without indirection.

### Dimension 3: test_strength — PASS

Sprint-2 added genuine-red coverage for the new behaviours and extended the existing leak-prevention tests to cover the new constituent `blockId` field:

- **PROP-HSF-022** (`prop-HSF-022-discard-with-pending-threads-blockId.harness.test.ts`) — pins **both** an example test (`:109-126`, `:130-157`) and a fast-check property (`:162-181`, 1000 runs) on `discard(s, now).focusedBlockId === s.pendingNextFocus.blockId`. Adds two pipeline-level checks (`:184-219` example + `:224-252` 500-run fast-check) so the orchestrator cannot drop the field while packaging the result.
- **PROP-HSF-008 leak** — three test files extend the no-leak assertion to `"blockId" in event === false`: `pipeline.test.ts:385`, `discard-current-session.test.ts:251,365`, `cancel-switch.test.ts:282`.
- **7-field EditingState assertions** — `discard-current-session.test.ts:287-313` and `cancel-switch.test.ts:120-144` now assert all 7 fields including the new `focusedBlockId`. `pipeline.test.ts:324-361` (discard with pending) and `:410-442` (cancel-switch) also assert all 7 fields.
- **Tier-0 type-test** — `tests/types/handle-save-failure.type-test.ts` preserves three sprint-1 `@ts-expect-error` annotations (lines 45, 51, 96) and adds a fourth at line 139. Each annotation pins a real underlying type error; if the contract becomes too permissive, the annotation will fail at `tsc --noEmit`.
- **PROP-HSF-001 retry-determinism** — `prop-HSF-001-retry-determinism.harness.test.ts:90-108` calls the pure `retryTransition` directly (1000 runs) and asserts `out1 === out2`; sprint-1's iter-2 fix is preserved through the migration.

No tautological tests were observed. Fixtures are passed only to branches that match their pendingNextFocus state (null fixtures only for the null-pending and invalid-cancel-switch branches; non-null fixtures only for the with-pending branches). Mocks are per-test (each test creates its own `clockSpy` and `emitSpy`) rather than module-level, so cross-test pollution is impossible.

### Dimension 4: adversarial_calibration — PASS (1 minor finding)

Active checks performed:

- **Reading `state.pendingNextFocus.blockId` without a null check** — `discard.ts:30` checks `state.pendingNextFocus === null` *before* accessing `.noteId` / `.blockId` at line 41-42. The orchestrator does NOT pre-guard, but `discard()` itself guards. Safe.
- **`cancel-switch.ts`** does not access `pendingNextFocus` at all — it only uses `state.currentNoteId` (line 28). The orchestrator guards against `pendingNextFocus === null` at `pipeline.ts:161` before calling `cancelSwitch(state, now)` at line 171, so the precondition (caller-side) is satisfied. The pure function does not depend on it. Safe.
- **Re-export in `transitions.ts`** — line 11-13: `export { retry as retryTransition }`, etc. No missing or stale alias. Safe.
- **Stale `pendingNextNoteId` strings in production code** — found exactly one occurrence at `pipeline.ts:100` (JSDoc comment `@param state - SaveFailedState carrying currentNoteId and pendingNextNoteId`). This is a documentation drift that does not affect behaviour, types, tests, or any spec acceptance criterion. **Recorded as FIND-S2-001 (minor)**, non-blocking.
- **Fixture-bug check (`pendingNextFocus = null` for non-null branch)** — checked all six test files. Every cancel-switch (valid) test uses `makePendingNextFocus(...)` to construct a non-null fixture; every discard-with-pending test does the same; every cancel-switch (invalid) test passes `pendingNextFocus: null` explicitly. No fixture mismatches.
- **`prop-HSF-019` non-save-failed branch** — generator at `:158-181` covers all four non-save-failed `status` values and additionally constructs a hand-rolled `switching` arbitrary that includes the new `pendingNextFocus` (line 178), so the migration did not introduce a generator gap.

No bugs of substance. The single finding is documentation drift only.

### Dimension 5: scope_discipline — PASS

`SaveFailedState` retains exactly four fields (`status`, `currentNoteId`, `pendingNextFocus`, `lastSaveError`) per `docs/domain/code/ts/src/capture/states.ts:70-75`. No new field was added to satisfy REQ-HSF-005 (Option A was selected so that no domain SoT widening would be needed — confirmed by spec lines 181, 393).

`CaptureInternalEvent` (`docs/domain/code/ts/src/capture/internal-events.ts:20-38`) is unchanged: `EditingSessionDiscarded` still has fields `{ kind, noteId, occurredOn }` (line 59-63); `RetrySaveRequested` still has `{ kind, noteId, occurredOn }` (line 198-202). No `blockId` was added to either event payload, matching REQ-HSF-008 and REQ-HSF-012.

`SwitchError.pendingNextFocus` (`docs/domain/code/ts/src/shared/errors.ts:58-62`) carries `{ noteId, blockId }` per the spec migration; this is consumed only by `EditPastNoteStart` in the larger codebase, not by `handle-save-failure`. The sprint did not modify other-feature artifacts.

## Test execution evidence

The Phase 2c green-phase evidence log records the post-refactor test outcome:

```
.vcsdd/features/handle-save-failure/evidence/sprint-2-green-phase.log:
  bun test v1.3.11 (af24e281)
   89 pass
   0 fail
   13908 expect() calls
  Ran 89 tests across 9 files. [311.00ms]
  tsc --noEmit (handle-save-failure scope): 0 lines (clean)
```

89/0 with clean handle-save-failure-scoped tsc output. No regressions, no type errors in scope.

## Summary

- spec_fidelity: PASS
- structural_integrity: PASS
- test_strength: PASS
- adversarial_calibration: PASS (1 minor non-blocking finding)
- scope_discipline: PASS

**Overall**: PASS. Advance to phase 5 (formal hardening, sprint 2).

Findings: 0 critical / 0 major / 1 minor. Total = 1.
