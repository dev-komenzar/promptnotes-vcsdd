# Phase 3 Adversarial Review — Verdict (iter 2)

**Feature**: `handle-save-failure`
**Phase**: 3 (Adversarial Review)
**Mode**: lean
**Iteration**: 2
**Reviewer**: VCSDD Adversary (fresh context)
**Timestamp**: 2026-05-01

## Overall Verdict: PASS

All four iter-1 findings are resolved by concrete, on-disk fixes. PROP-HSF-021 is now a real regression guard against Clock side effects in the pure transitions; PROP-HSF-001 calls the pure `retryTransition` directly; the refactor evidence log carries an authoritative post-fix 398/0 result; and PROP-HSF-019 runs at 200 iterations matching its peers. The unchanged production code continues to satisfy every REQ-HSF-001..012, the 21 PROPs are encoded across Tier 0/1/2/3, and the purity boundary in `pipeline.ts` cleanly isolates `Clock.now`/`emit` to the orchestrator.

No new findings.

## Per-Dimension Verdicts

| Dimension | Verdict |
|-----------|---------|
| 1. Spec compliance (REQ-HSF-001..012 ↔ tests ↔ implementation) | **PASS** |
| 2. PROP coverage (21 PROPs encoded; PROP-HSF-021 now non-vacuous) | **PASS** |
| 3. Test quality (no vacuous tests, no permissive mocks) | **PASS** |
| 4. Implementation correctness (4 production files) | **PASS** |
| 5. Purity boundary integrity (pipeline vs. step files) | **PASS** |

## Iter-1 Finding Status

| ID | Severity | Status | Verification |
|----|----------|--------|--------------|
| FIND-001 | critical | **resolved** | `prop-HSF-021-pure-transition-no-side-effect.harness.test.ts:90-95,109-114,128-133` now uses `spyOn(Date, "now")` and asserts `dateSpy.mock.calls.length === 0`, plus an additional input-mutation guard via `JSON.parse(JSON.stringify(state))` deep-equality. The local sentinel ports were removed entirely. A regression that introduced `Date.now()` into `retry`/`discard`/`cancelSwitch` would now fail the spy assertion, so the property is a genuine guard. |
| FIND-002 | major | **resolved** | `prop-HSF-001-retry-determinism.harness.test.ts:25` imports `retryTransition` directly from `../../../handle-save-failure/transitions.js`; lines 79-83 invoke `retryTransition(state, fixedNow)` synchronously and assert `out1 === out2` over 1000 fast-check runs. The stale "transition functions are not yet exported" comment from iter 1 is gone (replaced by lines 10-14 documenting that `retryTransition` is the direct call target). PROP-HSF-002 (line 91-110) follows the same direct-import pattern. |
| FIND-003 | minor | **resolved** | `.vcsdd/features/handle-save-failure/evidence/sprint-1-refactor-phase.log:113-129` adds a "Phase 2c FINAL test output (post-FIND-001/002/003/004 fix)" section with `398 pass / 0 fail` and per-FIND change notes. The earlier mid-fix `125 pass / 5 fail` block is preserved as a chronological record but is no longer the latest tool output. |
| FIND-004 | minor | **resolved** | `prop-HSF-019-invariant-on-non-save-failed.harness.test.ts:204` raises `numRuns` from 50 to 200, matching the peer-set lower bound (PROP-HSF-020 is also 200; PROP-HSF-021 is 500; PROP-HSF-001 first test is 1000). Generator at lines 154-175 covers all four non-`save-failed` status variants (`idle`, `editing`, `saving`, `switching`). |

## Why each PASS dimension passes

### Dimension 1: Spec compliance — PASS
Every REQ-HSF-001..012 has at least one matching test that asserts the specific REQ behavior. Concrete trace:
- REQ-HSF-001 → `pipeline.test.ts:429-457` (editing→reject), `prop-HSF-019-invariant-on-non-save-failed.harness.test.ts:81-150,153-206` (idle/editing/saving/switching).
- REQ-HSF-002 → `retry-save.test.ts:92-254`, `pipeline.test.ts:135-215`, `prop-HSF-001-retry-determinism.harness.test.ts:70-110`.
- REQ-HSF-003 → `discard-current-session.test.ts:97-205`, `pipeline.test.ts:219-276`.
- REQ-HSF-004 → `discard-current-session.test.ts:210-378` (six-field check at lines 251-256), `pipeline.test.ts:280-350`.
- REQ-HSF-005 → `cancel-switch.test.ts:43-244` (six-field check), `pipeline.test.ts:354-401`.
- REQ-HSF-006 → `cancel-switch.test.ts:245-339`, `pipeline.test.ts:405-425`, `prop-HSF-020-clock-budget-invariant-violation.harness.test.ts:93-189`.
- REQ-HSF-007 → `tests/types/handle-save-failure.type-test.ts:29-72` (assertNeverUserDecision compile-time check).
- REQ-HSF-008 → `pipeline.test.ts:461-506`.
- REQ-HSF-009 → `pipeline.test.ts:510-560`.
- REQ-HSF-010 → `pipeline.test.ts:564-603`.
- REQ-HSF-011 → `tests/types/handle-save-failure.type-test.ts:114-141`.
- REQ-HSF-012 → `pipeline.test.ts:607-637`, `retry-save.test.ts:236-254`, `discard-current-session.test.ts:185-205`.

### Dimension 2: PROP coverage — PASS
All 21 obligations from `verification-architecture.md` are encoded:
- Tier 0 (PROP-HSF-005, 016): `tests/types/handle-save-failure.type-test.ts:45-53,95-100`.
- Tier 1 (PROP-HSF-001, 002, 003, 004, 021): `__verify__/prop-HSF-001-retry-determinism.harness.test.ts`, `__verify__/prop-HSF-021-pure-transition-no-side-effect.harness.test.ts:83-180`.
- Tier 2 (PROP-HSF-006..017, 019, 020): `pipeline.test.ts`, `retry-save.test.ts`, `discard-current-session.test.ts`, `cancel-switch.test.ts`, `prop-HSF-019-…`, `prop-HSF-020-…`.
- Tier 3 (PROP-HSF-018): `pipeline.test.ts` integration tests cover all four valid branches.
- PROP-HSF-021 specifically is now non-vacuous: `dateSpy = spyOn(Date, "now")` then `expect(dateSpy.mock.calls.length).toBe(0)` after each pure transition call (3 functions × 500 runs).

### Dimension 3: Test quality — PASS
- No vacuous assertions: every `expect()` either references the SUT's return value or a real spy/mock that is wired into the call.
- Spy wiring verified for `pipeline.test.ts` (clockSpy + eventSpy passed in `makePorts`), `prop-HSF-020-…` (clock and emit sentinels passed via ports), `prop-HSF-021-…` (`spyOn(Date, "now")` is a global hook, not a local unused symbol).
- Mocks are minimal: `clockSpy` only records call count and returns a fixed timestamp; `emitSpy` only collects events. No mock returns logic that could mask SUT behavior.
- Edge cases exercised: discard with/without pending, cancel-switch with/without pending, all four non-`save-failed` status casts, error-carrying stage on retry and discard.
- Determinism property (PROP-HSF-001) reruns the SUT twice with identical inputs and structurally compares — not just identity.

### Dimension 4: Implementation correctness — PASS
- `pipeline.ts:114-116` runtime guard rejects with the spec-mandated `SaveError { kind: 'validation', reason: { kind: 'invariant-violated', detail } }`.
- `pipeline.ts:118` switch with `default: assertNever(decision)` (line 179-181) gives compile-time + runtime exhaustiveness.
- `pipeline.ts:122,141,170` Clock.now() called exactly once per valid branch; same `now` reused for transition arg and event `occurredOn` (lines 122-129 retry, 141-149 discard).
- `pipeline.ts:161-165` cancel-switch invariant guard fires before any `clockNow()` invocation, satisfying REQ-HSF-009 (0 Clock calls on invalid).
- No mutation of input `state`: each transition (`retry.ts:24-28`, `discard.ts:38-55`, `cancel-switch.ts:35-42`) constructs a fresh object literal.
- Production files contain no `Date.now()`, no `Math.random()`, no module-level mutable state. The PROP-HSF-021 spy now actively enforces this.

### Dimension 5: Purity boundary integrity — PASS
- `retry.ts`, `discard.ts`, `cancel-switch.ts`: each function takes only `(state, now)` and returns a new state literal. No port imports. No `import` of `Date`, `globalThis`, `crypto`, or any I/O symbol.
- `pipeline.ts:106-183`: clearly separates the effectful shell (`ports.clockNow()` then pure transition then `ports.emit()`) from the pure transitions imported from sibling files (lines 40-42).
- `transitions.ts`: re-exports the three pure transitions for direct testing access.
- `HandleSaveFailurePorts` (pipeline.ts:55-58) localizes the impure boundary to `clockNow` and `emit` only.

## Mandatory adversarial check results

| Category | Found? | Reference |
|----------|--------|-----------|
| test_quality (vacuous test) | NO | PROP-HSF-021 now genuinely guards against `Date.now()` regressions |
| test_coverage | NO | 21/21 PROPs encoded; all REQs traced |
| requirement_mismatch | NO | implementation matches each REQ |
| security_surface | N/A | Pure state-transition; no untrusted I/O boundary |
| spec_gap | NO | All REQs have tests, all tests trace to a REQ |
| purity_boundary | NO | Production code respects the boundary; harness now actively enforces it |
| verification_tool_mismatch | NO | PROP-HSF-001 harness now exercises the pure function directly |
