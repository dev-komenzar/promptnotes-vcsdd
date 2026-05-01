# Behavioral Specification: HandleSaveFailure

**Feature**: `handle-save-failure`
**Phase**: 1a
**Revision**: 1
**Source of truth**: `docs/domain/workflows.md` Workflow 8, `docs/domain/code/ts/src/capture/stages.ts` lines 88–107, `docs/domain/code/ts/src/capture/states.ts` lines 56–119, `docs/domain/code/ts/src/capture/workflows.ts` lines 111–117, `docs/domain/code/ts/src/capture/internal-events.ts`, `docs/domain/code/ts/src/shared/events.ts`, `docs/domain/code/ts/src/shared/errors.ts`
**Scope**: Pure state-transition + event-emit workflow in Capture context. Triggered when `EditingSessionState.status === 'save-failed'` and the user selects one of three recovery options (Retry / Discard / Cancel). The workflow resolves the stalled state and emits at most one internal event. CaptureAutoSave internals, UI rendering, and follow-on workflows (the actual re-save I/O on the Retry path) are out of scope.

---

## Pipeline Overview

```
SaveFailedState + UserDecision
        ↓ (precondition: state.status === 'save-failed')
    Branch on UserDecision
        ├── retry-save       → SavingState           + RetrySaveRequested
        ├── discard (no-pnd) → IdleState              + EditingSessionDiscarded
        ├── discard (pnd)    → EditingState(pnd)      + EditingSessionDiscarded
        └── cancel-switch    → EditingState(current)  + [no event]
        ↓
    ResolvedState  (resolution: 'retried' | 'discarded' | 'cancelled')
```

The pure core is the state-transition logic. The effectful shell is the `emit` call for `RetrySaveRequested` and `EditingSessionDiscarded`. `cancel-switch` emits no event (no `CancelSwitchRequested` type exists in `internal-events.ts`; see Open Questions §1).

## Pipeline Input

```typescript
type HandleSaveFailureInput = {
  readonly state: SaveFailedState;       // precondition: state.status === 'save-failed'
  readonly decision: UserDecision;       // retry-save | discard-current-session | cancel-switch
};
```

`HandleSaveFailure` receives a `SaveFailedStage` (from `stages.ts`) plus the caller's `SaveFailedState` (from `states.ts`). The caller (application layer) is responsible for providing both: the stage carries the error context, and the state carries the transition targets (`currentNoteId`, `pendingNextNoteId`).

---

## Requirements

### REQ-HSF-001: Precondition — input must be SaveFailedState

**EARS**: WHEN `handleSaveFailure` is called THEN the system SHALL require that `state.status === 'save-failed'`; if the status is any other value (`'idle'`, `'editing'`, `'saving'`, `'switching'`) the system SHALL reject the call as a programming error (type guard or thrown invariant violation at runtime).

**Edge Cases**:
- `state.status === 'idle'`: not valid input; rejected.
- `state.status === 'editing'`: not valid input; rejected.
- `state.status === 'saving'`: not valid input; rejected.
- `state.status === 'switching'`: not valid input; rejected.

**Acceptance Criteria**:
- The TypeScript type signature constrains `state` to `SaveFailedState`; no other `EditingSessionState` variant is accepted by the type.
- Calling with a non-`SaveFailedState` value is a compile-time type error.
- At runtime, an invariant assertion confirms `state.status === 'save-failed'` and throws `InvariantViolated` (from `SaveError { kind: 'validation', reason: { kind: 'invariant-violated' } }`) if violated.

---

### REQ-HSF-002: Branch — RetrySave

**EARS**: WHEN `state.status === 'save-failed'` AND `decision.kind === 'retry-save'` THEN the system SHALL:
1. Transition `EditingSessionState`: `save-failed → saving` using `EditingSessionTransitions.retry(state, now)`.
2. Emit `RetrySaveRequested { kind: 'retry-save-requested', noteId: state.currentNoteId, occurredOn: Clock.now() }` as a `CaptureInternalEvent`.
3. Preserve `state.currentNoteId` unchanged across the transition.
4. Preserve `state.pendingNextNoteId` in the resulting `SavingState`… however `SavingState` does not carry `pendingNextNoteId`; the caller is responsible for re-associating it if needed (see Open Questions §2).
5. Return `ResolvedState { kind: 'ResolvedState', resolution: 'retried' }`.

**Edge Cases**:
- `pendingNextNoteId` is non-null (failure happened during a switch): the retry proceeds as normal; `SavingState` does not carry `pendingNextNoteId`. The caller must persist the intended next-note context externally to resume the switch after a successful retry.
- `pendingNextNoteId` is null (idle save failed): retry proceeds identically.
- Consecutive retry calls: each call from `save-failed` produces a fresh `SavingState`; the state machine allows this.

**Acceptance Criteria**:
- `EditingSessionTransitions.retry(state, now)` is called with `state.status === 'save-failed'`.
- Resulting state has `status === 'saving'` and `currentNoteId === state.currentNoteId`.
- `RetrySaveRequested` is emitted exactly once with `noteId === state.currentNoteId`.
- `RetrySaveRequested.occurredOn === Clock.now()` (the one timestamp call for this invocation).
- `ResolvedState.resolution === 'retried'`.
- No other event is emitted.
- `Clock.now()` is called exactly once.

---

### REQ-HSF-003: Branch — DiscardCurrentSession without pendingNextNoteId

**EARS**: WHEN `state.status === 'save-failed'` AND `decision.kind === 'discard-current-session'` AND `state.pendingNextNoteId === null` THEN the system SHALL:
1. Transition `EditingSessionState`: `save-failed → idle` using `EditingSessionTransitions.discard(state, now)`.
2. Emit `EditingSessionDiscarded { kind: 'editing-session-discarded', noteId: state.currentNoteId, occurredOn: Clock.now() }` as a `CaptureInternalEvent`.
3. Clear `isDirty` (the `IdleState` carries no dirty flag — dropping dirty content is intentional).
4. Return `ResolvedState { kind: 'ResolvedState', resolution: 'discarded' }`.

**Edge Cases**:
- The note had dirty content: content is dropped with no save attempt; this is explicit user intent.
- `state.pendingNextNoteId` is confirmed null before entering this branch.

**Acceptance Criteria**:
- `EditingSessionTransitions.discard(state, now)` returns `IdleState { status: 'idle' }`.
- Resulting state has `status === 'idle'`.
- `EditingSessionDiscarded` is emitted exactly once with `noteId === state.currentNoteId`.
- `EditingSessionDiscarded.occurredOn === Clock.now()`.
- `ResolvedState.resolution === 'discarded'`.
- No other event is emitted.
- `Clock.now()` is called exactly once.

---

### REQ-HSF-004: Branch — DiscardCurrentSession with pendingNextNoteId

**EARS**: WHEN `state.status === 'save-failed'` AND `decision.kind === 'discard-current-session'` AND `state.pendingNextNoteId !== null` THEN the system SHALL:
1. Transition `EditingSessionState`: `save-failed → editing(pendingNextNoteId)` using `EditingSessionTransitions.discard(state, now)`.
2. Emit `EditingSessionDiscarded { kind: 'editing-session-discarded', noteId: state.currentNoteId, occurredOn: Clock.now() }` as a `CaptureInternalEvent`. The discarded note is the **current** note (not the pending one).
3. The dirty content of `currentNoteId` is dropped.
4. A new editing session for `pendingNextNoteId` begins; the resulting `EditingState.currentNoteId === state.pendingNextNoteId`.
5. Return `ResolvedState { kind: 'ResolvedState', resolution: 'discarded' }`.

**Edge Cases**:
- The pending note's content has not yet been loaded: loading/hydrating the new note is the responsibility of the follow-on `EditPastNoteStart` workflow, not `HandleSaveFailure`. HandleSaveFailure only transitions the state machine.
- `pendingNextNoteId` is confirmed non-null before entering this branch.
- The resulting `EditingState` has `isDirty: false` (the pending note was not yet edited).

**Acceptance Criteria**:
- `EditingSessionTransitions.discard(state, now)` returns `EditingState { status: 'editing', currentNoteId: state.pendingNextNoteId, isDirty: false }`.
- `EditingSessionDiscarded` is emitted exactly once with `noteId === state.currentNoteId` (the discarded note, not the pending one).
- `EditingSessionDiscarded.occurredOn === Clock.now()`.
- Resulting `EditingState.currentNoteId === state.pendingNextNoteId`.
- `ResolvedState.resolution === 'discarded'`.
- No other event is emitted.
- `Clock.now()` is called exactly once.
- `state.pendingNextNoteId` does not appear in any emitted event payload (it is a routing decision, not a disclosed event field).

---

### REQ-HSF-005: Branch — CancelSwitch (valid: pendingNextNoteId present)

**EARS**: WHEN `state.status === 'save-failed'` AND `decision.kind === 'cancel-switch'` AND `state.pendingNextNoteId !== null` THEN the system SHALL:
1. Transition `EditingSessionState`: `save-failed → editing(currentNoteId)` using `EditingSessionTransitions.cancelSwitch(state, now)`.
2. Preserve `isDirty: true` — the current note's unsaved content is retained.
3. Drop `pendingNextNoteId` (the switch is cancelled; no pending next note remains).
4. Emit no event (no `CancelSwitchRequested` type exists; see Open Questions §1).
5. Return `ResolvedState { kind: 'ResolvedState', resolution: 'cancelled' }`.

**Edge Cases**:
- `isDirty` preservation: the resulting `EditingState.isDirty` must be `true`. The note content the user was editing is kept.
- `lastSaveResult` on the resulting `EditingState`: set to `'failed'` to indicate the last save did not succeed. The user remains in an editing state with a known-failed save history.
- The resulting `EditingState.currentNoteId === state.currentNoteId` (unchanged).

**Acceptance Criteria**:
- `EditingSessionTransitions.cancelSwitch(state, now)` returns `EditingState { status: 'editing', currentNoteId: state.currentNoteId, isDirty: true }`.
- `EditingState.currentNoteId === state.currentNoteId`.
- `EditingState.isDirty === true`.
- `pendingNextNoteId` is absent from the resulting `EditingState` (it does not carry a `pendingNextNoteId` field — the `SwitchingState`/`SaveFailedState` are the only states with that field).
- `ResolvedState.resolution === 'cancelled'`.
- No event is emitted.
- `Clock.now()` is called exactly once (for the state transition's `now` parameter).

---

### REQ-HSF-006: Branch — CancelSwitch invalid when no pendingNextNoteId

**EARS**: WHEN `state.status === 'save-failed'` AND `decision.kind === 'cancel-switch'` AND `state.pendingNextNoteId === null` THEN the system SHALL reject the call as a programming error by throwing an `InvariantViolated` error: `SaveError { kind: 'validation', reason: { kind: 'invariant-violated', detail: 'cancel-switch requires pendingNextNoteId' } }`.

**Rationale**: `CancelSwitch` is only meaningful when a note switch was in progress at the time of failure. If `pendingNextNoteId` is null, the save failure originated from an idle/auto-save, and cancel-switch has no semantic target to cancel toward. Reaching this branch indicates a caller bug.

**Edge Cases**:
- The caller (UI) must only offer the Cancel option when `pendingNextNoteId !== null`; this requirement enforces the invariant at the domain level as a defense-in-depth check.

**Acceptance Criteria**:
- When `state.pendingNextNoteId === null` and `decision.kind === 'cancel-switch'`, the function throws (or returns an error result) rather than silently producing a `ResolvedState`.
- The rejection is distinct from a normal `ResolvedState` return.
- No state transition is applied.
- No event is emitted.

---

### REQ-HSF-007: UserDecision exhaustiveness

**EARS**: WHEN the workflow's branch logic processes `UserDecision` THEN the system SHALL handle all variants (`retry-save`, `discard-current-session`, `cancel-switch`) exhaustively; any future variant that extends the union SHALL produce a compile-time TypeScript error at the unhandled branch site (never-branch assertion).

**Acceptance Criteria**:
- The implementation contains a `switch` (or equivalent) over `decision.kind` with a `default: assertNever(decision)` (or equivalent `never`-typed branch).
- Adding a new variant to `UserDecision` in `stages.ts` without handling it in `handleSaveFailure` produces a TypeScript compilation error.
- TypeScript strict mode (`noImplicitAny`, `strictNullChecks`) is enabled for the module.

---

### REQ-HSF-008: At most one event per invocation

**EARS**: WHEN any branch of `handleSaveFailure` executes THEN the system SHALL emit at most one `CaptureInternalEvent` per invocation; zero events are emitted on the cancel-switch branch.

**Edge Cases**:
- `retry-save`: exactly one event (`RetrySaveRequested`).
- `discard-current-session` (either sub-case): exactly one event (`EditingSessionDiscarded`).
- `cancel-switch` (valid): zero events.
- `cancel-switch` (invalid): zero events (invariant violation, not an event).

**Acceptance Criteria**:
- An emit spy records every call; exactly 0 or 1 calls occur per workflow invocation depending on the branch.
- No branch emits more than one event.
- The event, if emitted, is a member of `CaptureInternalEvent` (from `capture/internal-events.ts`).
- No `PublicDomainEvent` (from `shared/events.ts`) is emitted by `handleSaveFailure` directly.

---

### REQ-HSF-009: Clock.now() budget

**EARS**: WHEN any branch of `handleSaveFailure` executes THEN the system SHALL call `Clock.now()` exactly once per invocation regardless of branch taken (including cancel-switch valid and cancel-switch invalid paths up to the invariant check).

**Clock.now() call sites (per branch)**:

| Branch | Clock.now() calls | Rationale |
|--------|------------------|-----------|
| `retry-save` | 1 | For `SavingState.savingStartedAt` (via `retry(state, now)`) and `RetrySaveRequested.occurredOn` — same `now` value used for both |
| `discard` (no pending) | 1 | For `EditingSessionDiscarded.occurredOn`; `discard(state, now)` receives the same `now` |
| `discard` (with pending) | 1 | Same as above |
| `cancel-switch` (valid) | 1 | For `EditingState` transition's `now` parameter via `cancelSwitch(state, now)` |
| `cancel-switch` (invalid) | 0–1 | May short-circuit before Clock.now() depending on implementation order; ≤1 |

**Acceptance Criteria**:
- A `Clock.now()` spy confirms exactly 1 call on the retry, discard (both sub-cases), and cancel-switch-valid branches.
- `Clock.now()` is never called inside the pure transition functions themselves; it is called once in the orchestrator and passed as `now`.
- The same `now` timestamp is used for both the state transition parameter and the event's `occurredOn` field on the same branch.

---

### REQ-HSF-010: ResolvedState shape

**EARS**: WHEN any valid branch completes THEN the system SHALL return `ResolvedState { kind: 'ResolvedState', resolution: R }` where `R` is determined by the branch.

**Resolution mapping**:

| Branch | `ResolvedState.resolution` |
|--------|--------------------------|
| `retry-save` | `'retried'` |
| `discard-current-session` | `'discarded'` |
| `cancel-switch` (valid) | `'cancelled'` |

**Acceptance Criteria**:
- `ResolvedState.kind === 'ResolvedState'` on all success paths.
- `ResolvedState.resolution` is one of `'retried'` | `'discarded'` | `'cancelled'` (the exact union from `stages.ts`).
- The `resolution` value is not ambiguous: discard-no-pending and discard-with-pending both return `'discarded'` (the sub-routing is done by `EditingSessionTransitions.discard` which checks `pendingNextNoteId` internally).

---

## Purity Boundary Analysis

| Step | Classification | Rationale |
|------|---------------|-----------|
| Input precondition check | Pure core | Stateless guard; `state.status === 'save-failed'` check; no ports |
| `cancel-switch` invalid guard | Pure core | Stateless `pendingNextNoteId === null` check; no ports |
| `EditingSessionTransitions.retry / discard / cancelSwitch` | Pure core | Deterministic; `(SaveFailedState, Timestamp) → SavingState \| EditingState \| IdleState`; no I/O |
| `Clock.now()` call | Effectful shell | Single timestamp acquisition; impure |
| `emit(RetrySaveRequested)` | Effectful shell | Side effect: event publication; impure |
| `emit(EditingSessionDiscarded)` | Effectful shell | Side effect: event publication; impure |
| `ResolvedState` construction | Pure core | Deterministic value construction; no ports |

**Formally verifiable core**: `EditingSessionTransitions.retry`, `EditingSessionTransitions.discard`, `EditingSessionTransitions.cancelSwitch` — all are pure `(SaveFailedState, Timestamp) → State` functions.

**Effectful shell**: the orchestrator that calls `Clock.now()` once and `emit()` zero or one times.

---

## Edge Case Catalog

| Category | Scenario | Expected Behavior |
|----------|----------|------------------|
| Invalid input | `state.status !== 'save-failed'` | Compile-time type error; runtime invariant throw |
| Retry on retry | `decision.kind === 'retry-save'` called twice from different `save-failed` states | Each call is independent; both valid |
| Discard with no dirty note | `decision.kind === 'discard-current-session'` when `isDirty` is debatable | `SaveFailedState` does not carry `isDirty`; discard always drops content regardless |
| Cancel-switch without pendingNextNoteId | `decision.kind === 'cancel-switch'` with `state.pendingNextNoteId === null` | Domain-level invariant error (REQ-HSF-006) |
| Cancel-switch preserves dirty content | `decision.kind === 'cancel-switch'` with non-null pending | `EditingState.isDirty === true` after transition |
| Event type classification | Any emitted event | Only `CaptureInternalEvent` members; no `PublicDomainEvent` emitted |
| Timestamp reuse | `retry-save` branch | Same `now` value used for both `SavingState.savingStartedAt` and `RetrySaveRequested.occurredOn` |

---

## Open Questions

1. **No `CancelSwitchRequested` event**: `internal-events.ts` does not define a `CancelSwitchRequested` type. The spec therefore defines zero events on the cancel-switch branch. If the UI needs a signal to reset cancel UI state, an event should be added to `CaptureInternalEvent` in a follow-on change. This is parked for the human reviewer.

2. **`SavingState` does not carry `pendingNextNoteId`**: After a `retry-save`, the `SavingState` has no field for `pendingNextNoteId`. If the failure happened during a switch, the caller must persist the `pendingNextNoteId` externally (in the application state layer) to correctly resume the switch after a successful retry. This is a caller responsibility, not a `HandleSaveFailure` responsibility. The spec notes this for the implementation phase.

3. **`HandleSaveFailure` workflow type signature**: `docs/domain/code/ts/src/capture/workflows.ts` line 115–117 declares `HandleSaveFailure` as `(deps: CaptureDeps) => (stage: SaveFailedStage, decision: UserDecision) => Promise<ResolvedState>`. The `SaveFailedStage` carries `noteId` and `error`, but `SaveFailedState` (from `states.ts`) carries `currentNoteId`, `pendingNextNoteId`, and `lastSaveError`. The implementation will need both: the `SaveFailedState` for state transitions and the `SaveFailedStage` for the error context (or the orchestrator derives the stage from the state). This duality is noted for the implementation phase.
