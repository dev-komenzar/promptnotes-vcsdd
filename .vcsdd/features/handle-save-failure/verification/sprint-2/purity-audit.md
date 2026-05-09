# Purity Boundary Audit

## Feature: handle-save-failure | Sprint: 2 | Date: 2026-05-08

Sprint-1 baseline audit: `.vcsdd/features/handle-save-failure/verification/purity-audit.md`
Sprint-2 scope: re-validate after block migration (pendingNextNoteId → pendingNextFocus).

---

## Declared Boundaries

From `specs/verification-architecture.md` Purity Boundary Map (Revision 3):

| Step | Function | Declared Classification |
|------|----------|------------------------|
| Input precondition | `state.status === 'save-failed'` guard | Pure core |
| Cancel-switch guard | `pendingNextFocus !== null` check | Pure core |
| State transition — retry | `retry(state, now)` | Pure core |
| State transition — discard | `discard(state, now)` | Pure core |
| State transition — cancelSwitch | `cancelSwitch(state, now)` | Pure core |
| ResolvedState construction | `{ kind: 'ResolvedState', resolution: R }` | Pure core |
| `Clock.now()` call | Timestamp acquisition | Effectful shell |
| `emit(RetrySaveRequested)` | Event publication | Effectful shell |
| `emit(EditingSessionDiscarded)` | Event publication | Effectful shell |

Sprint-2 change in declared boundary: cancel-switch guard description updated from
`pendingNextNoteId !== null` to `pendingNextFocus !== null`. Classification unchanged.

---

## Observed Boundaries

### retry.ts (pure core)

Signature: `export function retry(state: SaveFailedState, now: Timestamp): SavingState`

- Reads `state.currentNoteId`; returns `{ status: 'saving', currentNoteId, savingStartedAt: now }`.
- No `Clock.now()` call. No `emit()` call. No module-level mutable state. No async.
- Input not mutated.
- Sprint-2 change: none. `retry.ts` does not reference `pendingNextFocus`.

**Verdict**: Pure. No drift from declaration.

### discard.ts (pure core)

Signature: `export function discard(state: SaveFailedState, _now: Timestamp): EditingState | IdleState`

- Branches on `state.pendingNextFocus === null`.
- When null: returns `{ status: 'idle' }`.
- When non-null: returns `{ status: 'editing', currentNoteId: state.pendingNextFocus.noteId, focusedBlockId: state.pendingNextFocus.blockId, isDirty: false, lastInputAt: null, idleTimerHandle: null, lastSaveResult: null }`.
- No `Clock.now()` call. No `emit()` call. No module-level mutable state. No async.
- Input not mutated.
- Sprint-2 change: field `focusedBlockId: state.pendingNextFocus.blockId` added in the non-null branch. This is a pure property read and value copy — no side effect.

**Verdict**: Pure. No drift from declaration. The new `blockId` threading is a pure value propagation within the function body.

### cancel-switch.ts (pure core)

Signature: `export function cancelSwitch(state: SaveFailedState, _now: Timestamp): EditingState`

- Returns `{ status: 'editing', currentNoteId: state.currentNoteId, focusedBlockId: null, isDirty: true, lastInputAt: null, idleTimerHandle: null, lastSaveResult: 'failed' }`.
- No `Clock.now()` call. No `emit()` call. No module-level mutable state. No async.
- Input not mutated.
- Sprint-2 change: `focusedBlockId: null` field added (Option A, REQ-HSF-005). This is a literal value in the return object — no side effect.

**Verdict**: Pure. No drift from declaration.

### pipeline.ts (effectful shell)

Signature:
```
export function runHandleSaveFailurePipeline(
  _stage: SaveFailedStage,
  state: SaveFailedState,
  decision: UserDecision,
  ports: HandleSaveFailurePorts,
): Promise<HandleSaveFailureResult>
```

- Calls `ports.clockNow()` (effectful) exactly once per valid branch; zero times on cancel-switch-invalid and on invariant-violation paths.
- Calls `ports.emit(event)` (effectful) at most once per invocation.
- Pure transitions (`retry`, `discard`, `cancelSwitch`) are called after `clockNow()` and before `emit()` in each branch.
- `_stage.error` is not forwarded to any emitted event (REQ-HSF-012).
- Sprint-2 changes:
  - Cancel-switch guard updated from `pendingNextNoteId` to `pendingNextFocus` (string update; guard logic unchanged).
  - No changes to the event payloads (neither `pendingNextFocus` nor `blockId` appear in emitted events).

**Verdict**: Effectful shell properly encapsulates all I/O. No pure functions call effectful ports. Sprint-2 changes do not introduce any new effectful calls or purity violations.

### transitions.ts (re-export barrel)

Re-exports `retry`, `discard`, `cancelSwitch` under aliased names. No logic, no state, no I/O.

**Verdict**: No purity concern.

---

## Property Test Evidence for Purity (Sprint-2)

PROP-HSF-021 (`pure-transition-no-side-effect`) harness updated for sprint-2:
- Arbitrary generators updated to `pendingNextFocus: { noteId, blockId }`.
- PROP-HSF-003 sub-test now also asserts `focusedBlockId === state.pendingNextFocus.blockId` (genuine red → green after migration).
- PROP-HSF-004 sub-test now also asserts `focusedBlockId === null` (genuine red → green after migration).
- 500 runs each for `retryTransition`, `discardTransition`, `cancelSwitchTransition`.
- `spyOn(Date, "now")` call count === 0 for all three functions.
- Input deep-equality check passes: state not mutated.
- All sub-tests PASS (19 total harness tests, 0 failures).

---

## Mismatch Analysis

| Check | Expected | Observed | Sprint-2 Change | Match |
|-------|----------|----------|-----------------|-------|
| `retry` has no Clock.now() | 0 calls | 0 (spy = 0) | none | PASS |
| `retry` has no emit() | 0 calls | 0 | none | PASS |
| `discard` has no Clock.now() | 0 calls | 0 (spy = 0) | none | PASS |
| `discard` has no emit() | 0 calls | 0 | none | PASS |
| `discard` blockId threading is pure | value copy only | value copy (`state.pendingNextFocus.blockId`) | new | PASS |
| `cancelSwitch` has no Clock.now() | 0 calls | 0 (spy = 0) | none | PASS |
| `cancelSwitch` has no emit() | 0 calls | 0 | none | PASS |
| `cancelSwitch` focusedBlockId is null | null | null | new field | PASS |
| `pipeline` calls clockNow exactly once (valid branch) | 1 | 1 (PROP-HSF-013) | none | PASS |
| `pipeline` calls clockNow 0 times (cancel-switch-invalid) | 0 | 0 (PROP-HSF-020) | guard renamed | PASS |
| `pipeline` calls emit at most once | 0 or 1 | 0 or 1 (PROP-HSF-009/010/011) | none | PASS |
| `_stage.error` not in event payload | absent | absent (PROP-HSF-008) | none | PASS |
| `pendingNextFocus` not in event payload | absent | absent (PROP-HSF-008) | field renamed | PASS |
| `blockId` not in event payload | absent | absent (PROP-HSF-008) | new constituent field | PASS |

---

## Summary

No purity boundary drift detected in sprint-2. The block migration introduces two
observable changes to the pure core:

1. `discard.ts`: adds `focusedBlockId: state.pendingNextFocus.blockId` to the non-null
   branch return object. This is a pure property read and value copy. PROP-HSF-022
   (1000-run property + examples) verifies correctness.

2. `cancel-switch.ts`: adds `focusedBlockId: null` to the return object. This is a
   literal value. PROP-HSF-004 (500-run property) verifies the field is present and null.

Both changes remain within the declared pure core boundary. No effectful calls were
introduced into the pure core. The effectful shell (`pipeline.ts`) correctly encapsulates
all Clock.now() and emit() calls, unchanged from sprint-1 in terms of purity structure.

**No required follow-up before Phase 6.**

**Purity audit gate: PASS**
