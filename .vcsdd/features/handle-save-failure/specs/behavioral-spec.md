# Behavioral Specification: HandleSaveFailure

**Feature**: `handle-save-failure`
**Phase**: 1a
**Revision**: 2
**Source of truth**: `docs/domain/workflows.md` Workflow 8, `docs/domain/aggregates.md` §CaptureSession §EditingSessionState, `docs/domain/code/ts/src/capture/stages.ts` lines 88–107, `docs/domain/code/ts/src/capture/states.ts` lines 56–119, `docs/domain/code/ts/src/capture/workflows.ts` lines 111–117, `docs/domain/code/ts/src/capture/internal-events.ts`, `docs/domain/code/ts/src/shared/events.ts`, `docs/domain/code/ts/src/shared/errors.ts`
**Scope**: Pure state-transition + event-emit workflow in Capture context. Triggered when `EditingSessionState.status === 'save-failed'` and the user selects one of three recovery options (Retry / Discard / Cancel). The workflow resolves the stalled state and emits at most one internal event. CaptureAutoSave internals, UI rendering, and follow-on workflows (the actual re-save I/O on the Retry path) are out of scope.

---

## Pipeline Overview

```
SaveFailedStage + SaveFailedState + UserDecision
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

## Pipeline Input — Binding Contract (was Open Question §3)

The canonical type signature from `docs/domain/code/ts/src/capture/workflows.ts` lines 115–117 is:

```typescript
export type HandleSaveFailure = (
  deps: CaptureDeps,
) => (stage: SaveFailedStage, decision: UserDecision) => Promise<ResolvedState>;
```

`SaveFailedStage` carries `{ kind: 'save-failed', noteId: NoteId, error: SaveError }` (from `stages.ts` lines 88–107). It does **not** carry `currentNoteId`, `pendingNextNoteId`, or `lastSaveError`; those fields live on `SaveFailedState` (from `states.ts`).

**Design decision**: The implementation SHALL widen the internal workflow function to accept both `SaveFailedStage` and `SaveFailedState`:

```typescript
// Proposed implementation signature (REQ-HSF-011)
(stage: SaveFailedStage, state: SaveFailedState, decision: UserDecision) => Promise<ResolvedState>
```

The orchestrator (application layer / `CaptureDeps` caller) is responsible for supplying both: `stage` carries the failure event context (used for logging and error propagation); `state` carries the transition targets (`currentNoteId`, `pendingNextNoteId`). The type `HandleSaveFailure` in `workflows.ts` will be updated to reflect the widened signature (see REQ-HSF-011).

---

## Requirements

### REQ-HSF-001: Precondition — input must be SaveFailedState

**EARS**: WHEN `handleSaveFailure` is called THEN the system SHALL require that `state.status === 'save-failed'`; if the status is any other value (`'idle'`, `'editing'`, `'saving'`, `'switching'`) the system SHALL reject the call as a programming error by throwing `Promise.reject(SaveError { kind: 'validation', reason: { kind: 'invariant-violated' } })`.

**Edge Cases**:
- `state.status === 'idle'`: not valid input; rejected with `Promise.reject`.
- `state.status === 'editing'`: not valid input; rejected with `Promise.reject`.
- `state.status === 'saving'`: not valid input; rejected with `Promise.reject`.
- `state.status === 'switching'`: not valid input; rejected with `Promise.reject`.

**Acceptance Criteria**:
- The TypeScript type signature constrains `state` to `SaveFailedState`; no other `EditingSessionState` variant is accepted by the type.
- Calling with a non-`SaveFailedState` value is a compile-time type error.
- At runtime, an invariant assertion confirms `state.status === 'save-failed'`; if violated, the function returns `Promise.reject(SaveError { kind: 'validation', reason: { kind: 'invariant-violated' } })`.

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

**Acceptance Criteria** (all six `EditingState` fields specified):
- `EditingSessionTransitions.discard(state, now)` returns `EditingState` with:
  - `status: 'editing'`
  - `currentNoteId: state.pendingNextNoteId`
  - `isDirty: false` (the pending note was not yet edited; fresh session)
  - `lastInputAt: null` (fresh session; no prior input on the new note)
  - `idleTimerHandle: null` (no timer running for the fresh session)
  - `lastSaveResult: null` (fresh session; no prior save result for the new note)
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

**Rationale for `isDirty: true` and `lastSaveResult: 'failed'`**: Sourced from `docs/domain/aggregates.md` §CaptureSession §EditingSessionState transition table, row `save-failed | CancelSwitch | editing(currentNoteId)`: "切替キャンセル、現編集を継続". The user is returning to continue editing the note whose save failed; the dirty flag must remain true to prevent data loss, and the failed-save history must be preserved so the auto-save system can display an appropriate warning indicator. These are new design decisions documented here (aggregates.md does not enumerate field-level semantics for this transition).

**Edge Cases**:
- `isDirty` preservation: the resulting `EditingState.isDirty` must be `true`. The note content the user was editing is kept.
- `lastSaveResult: 'failed'` on the resulting `EditingState` signals that the most recent save did not succeed. The user can see a warning indicator.
- The resulting `EditingState.currentNoteId === state.currentNoteId` (unchanged).

**Acceptance Criteria** (all six `EditingState` fields specified):
- `EditingSessionTransitions.cancelSwitch(state, now)` returns `EditingState` with:
  - `status: 'editing'`
  - `currentNoteId: state.currentNoteId`
  - `isDirty: true` (unsaved content retained)
  - `lastInputAt: null` (restored state; no new input timestamp for the restoration moment)
  - `idleTimerHandle: null` (no timer running at the moment of restoration; auto-save system restarts it on next input)
  - `lastSaveResult: 'failed'` (the last save did not succeed; preserved for UI warning indicator)
- `EditingState.currentNoteId === state.currentNoteId`.
- `EditingState.isDirty === true`.
- `pendingNextNoteId` is absent from the resulting `EditingState` (it does not carry a `pendingNextNoteId` field — the `SwitchingState`/`SaveFailedState` are the only states with that field).
- `ResolvedState.resolution === 'cancelled'`.
- No event is emitted.
- `Clock.now()` is called exactly once (for the state transition's `now` parameter).

---

### REQ-HSF-006: Branch — CancelSwitch invalid when no pendingNextNoteId

**EARS**: WHEN `state.status === 'save-failed'` AND `decision.kind === 'cancel-switch'` AND `state.pendingNextNoteId === null` THEN the system SHALL reject the call as a programming error by returning `Promise.reject(SaveError { kind: 'validation', reason: { kind: 'invariant-violated', detail: 'cancel-switch requires pendingNextNoteId' } })`.

**Rationale**: `CancelSwitch` is only meaningful when a note switch was in progress at the time of failure. If `pendingNextNoteId` is null, the save failure originated from an idle/auto-save, and cancel-switch has no semantic target to cancel toward. Reaching this branch indicates a caller bug.

**Edge Cases**:
- The caller (UI) must only offer the Cancel option when `pendingNextNoteId !== null`; this requirement enforces the invariant at the domain level as a defense-in-depth check.

**Acceptance Criteria**:
- When `state.pendingNextNoteId === null` and `decision.kind === 'cancel-switch'`, the function returns `Promise.reject(SaveError { kind: 'validation', reason: { kind: 'invariant-violated' } })` rather than silently producing a `ResolvedState`.
- The rejection is distinct from a normal `ResolvedState` return.
- No state transition is applied.
- No event is emitted.
- `Clock.now()` is called exactly 0 times (the guard fires before any timestamp acquisition).

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

**EARS**: WHEN any branch of `handleSaveFailure` executes THEN the system SHALL call `Clock.now()` exactly once on valid branches (`retry-save`, `discard`, `cancel-switch` valid); on the `cancel-switch` invalid branch the system SHALL call `Clock.now()` exactly zero times (the invariant guard fires before any timestamp acquisition).

**Clock.now() call sites (per branch)**:

| Branch | Clock.now() calls | Rationale |
|--------|------------------|-----------|
| `retry-save` | 1 | For `SavingState.savingStartedAt` (via `retry(state, now)`) and `RetrySaveRequested.occurredOn` — same `now` value used for both |
| `discard` (no pending) | 1 | For `EditingSessionDiscarded.occurredOn`; `discard(state, now)` receives the same `now` |
| `discard` (with pending) | 1 | Same as above |
| `cancel-switch` (valid) | 1 | For `EditingState` transition's `now` parameter via `cancelSwitch(state, now)` |
| `cancel-switch` (invalid) | 0 | Guard fires before `Clock.now()` is called; short-circuit path |

**Acceptance Criteria**:
- A `Clock.now()` spy confirms exactly 1 call on the retry, discard (both sub-cases), and cancel-switch-valid branches.
- A `Clock.now()` spy confirms exactly 0 calls on the cancel-switch-invalid branch (invariant violation short-circuits before timestamp acquisition).
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

### REQ-HSF-011: Workflow type signature — widened input contract

**EARS**: WHEN the `HandleSaveFailure` workflow is implemented THEN the system SHALL accept `(stage: SaveFailedStage, state: SaveFailedState, decision: UserDecision)` as its inner function parameters, widening the current `workflows.ts` signature from `(stage, decision)` to `(stage, state, decision)`.

**Rationale**: `SaveFailedStage` carries `{ kind, noteId, error }` only. The state transitions in REQ-HSF-002 through REQ-HSF-005 require `currentNoteId` and `pendingNextNoteId`, which live on `SaveFailedState`. The orchestrator (application layer calling through `CaptureDeps`) holds both and passes them together. The `stage` is retained for error context/logging (see REQ-HSF-012).

**Acceptance Criteria**:
- The implementation function type accepts `stage: SaveFailedStage`, `state: SaveFailedState`, and `decision: UserDecision` as distinct parameters.
- `docs/domain/code/ts/src/capture/workflows.ts` line 117 is updated to: `(stage: SaveFailedStage, state: SaveFailedState, decision: UserDecision) => Promise<ResolvedState>`.
- Callers that pass only `(stage, decision)` produce a TypeScript compilation error after the update.

---

### REQ-HSF-012: SaveFailedStage.error is for logging only — not emitted in events

**EARS**: WHEN `handleSaveFailure` processes a `SaveFailedStage` THEN the system SHALL use `SaveFailedStage.error` only for internal logging; the error SHALL NOT appear in any emitted `CaptureInternalEvent` payload. Telemetry consumers who need failure reasons SHALL subscribe to the public `NoteSaveFailed` event (from `shared/events.ts`), not to internal capture events.

**Rationale**: Internal events carry only the information needed for intra-context coordination. Surfacing the `SaveError` in `RetrySaveRequested` or `EditingSessionDiscarded` would couple downstream consumers to the error type and violate the bounded-context boundary.

**Acceptance Criteria**:
- `RetrySaveRequested` payload fields: `{ kind, noteId, occurredOn }` only. No `error` field.
- `EditingSessionDiscarded` payload fields: `{ kind, noteId, occurredOn }` only. No `error` field.
- An emit spy inspection confirms no emitted event has an `error` property.

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
| Invalid input | `state.status !== 'save-failed'` | Compile-time type error; runtime `Promise.reject` with `InvariantViolated` |
| Retry on retry | `decision.kind === 'retry-save'` called twice from different `save-failed` states | Each call is independent; both valid |
| Discard with no dirty note | `decision.kind === 'discard-current-session'` when `isDirty` is debatable | `SaveFailedState` does not carry `isDirty`; discard always drops content regardless |
| Cancel-switch without pendingNextNoteId | `decision.kind === 'cancel-switch'` with `state.pendingNextNoteId === null` | Domain-level invariant error (REQ-HSF-006); `Promise.reject`; 0 Clock.now() calls |
| Cancel-switch preserves dirty content | `decision.kind === 'cancel-switch'` with non-null pending | `EditingState.isDirty === true`, `lastSaveResult: 'failed'` after transition |
| Event type classification | Any emitted event | Only `CaptureInternalEvent` members; no `PublicDomainEvent` emitted |
| Timestamp reuse | `retry-save` branch | Same `now` value used for both `SavingState.savingStartedAt` and `RetrySaveRequested.occurredOn` |
| Error field in event | Any branch with `SaveFailedStage.error` present | Error not propagated into emitted event payloads (REQ-HSF-012) |

---

## Open Questions

1. **No `CancelSwitchRequested` event**: `internal-events.ts` does not define a `CancelSwitchRequested` type. The spec therefore defines zero events on the cancel-switch branch. If the UI needs a signal to reset cancel UI state, an event should be added to `CaptureInternalEvent` in a follow-on change. This is parked for the human reviewer. **Until resolved, the cancel-switch path emits zero events; the UI must rely on the synchronous `ResolvedState { resolution: 'cancelled' }` return value to update its state.**

2. **`SavingState` does not carry `pendingNextNoteId`**: After a `retry-save`, the `SavingState` has no field for `pendingNextNoteId`. If the failure happened during a switch, the caller must persist the `pendingNextNoteId` externally (in the application state layer) to correctly resume the switch after a successful retry. This is a caller responsibility, not a `HandleSaveFailure` responsibility. The spec notes this for the implementation phase.

---

## Revision History

### Revision 2 (iter-2 — addresses Phase 1c FIND-SPEC-001 through FIND-SPEC-011)

| FIND ID | Change made |
|---------|------------|
| FIND-SPEC-001 | Moved Open Question §3 into binding REQ-HSF-011. Pipeline Input section rewritten to document the widened `(stage, state, decision)` signature as a design decision. Internal input type `HandleSaveFailureInput` removed; canonical workflow.ts signature is now the sole source of truth. |
| FIND-SPEC-002 | REQ-HSF-004 AC expanded to specify all 6 `EditingState` fields: `lastInputAt: null`, `idleTimerHandle: null`, `lastSaveResult: null`, `isDirty: false`. REQ-HSF-005 AC expanded to specify all 6 `EditingState` fields: `lastInputAt: null`, `idleTimerHandle: null`, `lastSaveResult: 'failed'`, `isDirty: true`. |
| FIND-SPEC-003 | PROP-HSF-019 added in verification-architecture.md (Tier 2, `invariant-on-non-save-failed`). Coverage matrix REQ-HSF-001 updated to include PROP-HSF-019. |
| FIND-SPEC-004 | REQ-HSF-009 EARS updated: "exactly once on valid branches; exactly 0 on cancel-switch invalid". Per-branch table updated: cancel-switch invalid now shows `0`. AC updated to assert 0 Clock.now() calls on invariant-violation path. REQ-HSF-006 AC updated accordingly. PROP-HSF-013 sibling PROP-HSF-020 added in verification-architecture.md to assert 0 Clock.now() calls on invalid branch. |
| FIND-SPEC-005 | PROP-HSF-001 renamed to `retry-determinism` in verification-architecture.md. New PROP-HSF-021 `pure-transition-no-side-effect` added (Tier 1) asserting Clock spy + emit spy call counts === 0 inside the pure transition functions. |
| FIND-SPEC-006 | `docs/domain/aggregates.md` added to Source of truth header. REQ-HSF-005 Rationale paragraph added citing aggregates.md §CaptureSession and documenting `isDirty: true` / `lastSaveResult: 'failed'` as new design decisions with rationale. |
| FIND-SPEC-007 | REQ-HSF-006 EARS and AC updated: "throws (or returns an error result)" replaced by `Promise.reject(SaveError {...})`. REQ-HSF-001 runtime AC updated similarly. PROP-HSF-012 wording updated in verification-architecture.md. |
| FIND-SPEC-008 | No change required (finding confirmed spec was already correct). |
| FIND-SPEC-009 | REQ-HSF-012 added: `SaveFailedStage.error` is for logging only and must not appear in emitted event payloads. |
| FIND-SPEC-010 | Tier 0 encoding tooling specified in verification-architecture.md: `tests/types/handle-save-failure.type-test.ts` using `@ts-expect-error`; `tsc --noEmit` in CI. |
| FIND-SPEC-011 | Open Questions §1 updated with explicit fallback contract: "Until resolved, the cancel-switch path emits zero events; the UI must rely on the synchronous `ResolvedState { resolution: 'cancelled' }` return value to update its state." |
