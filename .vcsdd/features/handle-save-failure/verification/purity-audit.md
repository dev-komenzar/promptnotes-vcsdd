# Purity Boundary Audit

## Feature: handle-save-failure | Sprint: 1 | Date: 2026-05-01

---

## Declared Boundaries

From `specs/verification-architecture.md` Purity Boundary Map:

| Step | Function | Declared Classification |
|------|----------|------------------------|
| Input precondition | `state.status === 'save-failed'` guard | Pure core |
| Cancel-switch guard | `pendingNextNoteId !== null` check | Pure core |
| State transition — retry | `retry(state, now)` | Pure core |
| State transition — discard | `discard(state, now)` | Pure core |
| State transition — cancelSwitch | `cancelSwitch(state, now)` | Pure core |
| ResolvedState construction | `{ kind: 'ResolvedState', resolution: R }` | Pure core |
| `Clock.now()` call | Timestamp acquisition | Effectful shell |
| `emit(RetrySaveRequested)` | Event publication | Effectful shell |
| `emit(EditingSessionDiscarded)` | Event publication | Effectful shell |

Effectful shell boundary: the orchestrator `runHandleSaveFailurePipeline` in `pipeline.ts`.
Pure core boundary: `retry.ts`, `discard.ts`, `cancel-switch.ts` (re-exported via `transitions.ts`).

---

## Observed Boundaries

### retry.ts (pure core)

```
export function retry(state: SaveFailedState, now: Timestamp): SavingState
```

- Takes `SaveFailedState` and `Timestamp`; returns a new `SavingState` literal.
- No `Clock.now()` call (the parameter `now` is the injected timestamp).
- No `emit()` call.
- No module-level mutable state.
- No `Date.now()`, `Math.random()`, `console.*`, or async operations.
- Input object `state` is read but not mutated (property access only).

**Verdict**: Pure. No drift from declaration.

### discard.ts (pure core)

```
export function discard(state: SaveFailedState, _now: Timestamp): EditingState | IdleState
```

- Takes `SaveFailedState` and `_now: Timestamp` (timestamp unused; accepted for interface
  consistency — this is intentional per the port contract).
- Branches on `state.pendingNextNoteId === null`; constructs and returns `IdleState` or
  `EditingState` literal.
- No `Clock.now()` call.
- No `emit()` call.
- No module-level mutable state.
- Input object not mutated.

**Note on `_now`**: The `_now` parameter is accepted but unused. This is by design — the
`discard` transition does not need a timestamp for any field on the output states
(`IdleState` has no timestamp field; `EditingState` uses `null` for `lastInputAt`).
Accepting the parameter maintains interface uniformity with `retry` and `cancelSwitch`
and allows the orchestrator to pass the same `now` value to all three transitions
without conditional branching. This is not a side-effect leak; it is a no-op parameter.

**Verdict**: Pure. No drift from declaration.

### cancel-switch.ts (pure core)

```
export function cancelSwitch(state: SaveFailedState, _now: Timestamp): EditingState
```

- Takes `SaveFailedState` and `_now: Timestamp` (timestamp unused; same rationale as
  `discard` — `EditingState` uses `null` for `lastInputAt`).
- Returns `EditingState` literal with `isDirty: true`, `lastSaveResult: 'failed'`,
  `currentNoteId: state.currentNoteId`.
- No `Clock.now()` call.
- No `emit()` call.
- No module-level mutable state.
- Input object not mutated.

**Verdict**: Pure. No drift from declaration.

### pipeline.ts (effectful shell)

```
export function runHandleSaveFailurePipeline(
  _stage: SaveFailedStage,
  state: SaveFailedState,
  decision: UserDecision,
  ports: HandleSaveFailurePorts,
): Promise<HandleSaveFailureResult>
```

- Calls `ports.clockNow()` (effectful) exactly once per valid branch, before calling
  any pure transition. Zero times on cancel-switch-invalid.
- Calls `ports.emit(event)` (effectful) at most once per invocation (once on retry and
  discard; zero on cancel-switch and error paths).
- Passes the captured `now` value to the pure transition AND uses it for `occurredOn`
  on the emitted event — same timestamp for both (verified by PROP-HSF-014, PROP-HSF-015).
- The pure transitions are called after `clockNow()` and before `emit()` in each branch.
  The ordering is: guard → clockNow() → pure-transition → emit() → return.
- `_stage` is received but its content (`.error`) is intentionally not forwarded to any
  emitted event (REQ-HSF-012). The parameter is prefixed `_` to signal it is for future
  logging use only.

**Verdict**: Effectful shell properly encapsulates all I/O. No pure functions call
effectful ports. No effectful calls leak into the pure core.

### transitions.ts (re-export module)

Re-exports `retry`, `discard`, `cancelSwitch` under aliased names for the proof harnesses.
No logic, no state, no I/O. This is a barrel module.

**Verdict**: No purity concern.

---

## Property Test Evidence for Purity

PROP-HSF-021 (`pure-transition-no-side-effect`) confirms the purity of all three
transition functions empirically:

- **500 runs** each for `retryTransition`, `discardTransition`, `cancelSwitchTransition`
- `spyOn(Date, "now")` confirms `Date.now()` call count === 0 inside each function
- Deep-equality of state before/after call confirms input is not mutated
- Harness: `promptnotes/src/lib/domain/__tests__/handle-save-failure/__verify__/prop-HSF-021-pure-transition-no-side-effect.harness.test.ts`
- All 3 sub-tests PASS (14 total harness tests, 0 failures)

---

## Mismatch Analysis

No mismatches found.

| Check | Expected | Observed | Match |
|-------|----------|----------|-------|
| `retry` has no Clock.now() | none | none (spy = 0) | PASS |
| `retry` has no emit() | none | none | PASS |
| `discard` has no Clock.now() | none | none (spy = 0) | PASS |
| `discard` has no emit() | none | none | PASS |
| `cancelSwitch` has no Clock.now() | none | none (spy = 0) | PASS |
| `cancelSwitch` has no emit() | none | none | PASS |
| `pipeline` calls clockNow exactly once (valid branch) | 1 | 1 (PROP-HSF-013) | PASS |
| `pipeline` calls clockNow exactly 0 times (invalid) | 0 | 0 (PROP-HSF-020) | PASS |
| `pipeline` calls emit at most once | 0 or 1 | 0 or 1 (PROP-HSF-009/010/011) | PASS |
| `_stage.error` not forwarded to event | absent | absent (PROP-HSF-008) | PASS |
| `pendingNextNoteId` not in event payload | absent | absent (PROP-HSF-008) | PASS |

---

## Summary

No purity boundary drift detected. The pure core (`retry`, `discard`, `cancelSwitch`)
is genuinely pure: no Clock access, no emit, no mutation, no hidden state.
The effectful shell (`pipeline.ts`) correctly partitions I/O by calling `clockNow()`
once before transitioning and `emit()` once after, with the same `now` value shared
between the state transition parameter and the event's `occurredOn` field.

The unused `_now` parameter in `discard.ts` and `cancel-switch.ts` is an intentional
design decision for interface uniformity; it introduces no side effects and is
documented inline.

**No required follow-up before Phase 6.**

**Purity audit gate: PASS**
