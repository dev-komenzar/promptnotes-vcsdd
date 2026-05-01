# Verification Architecture: HandleSaveFailure

**Feature**: `handle-save-failure`
**Phase**: 1b
**Revision**: 1
**Mode**: lean
**Source**: `docs/domain/workflows.md` Workflow 8, `docs/domain/code/ts/src/capture/stages.ts`, `docs/domain/code/ts/src/capture/states.ts`, `docs/domain/code/ts/src/capture/internal-events.ts`, `docs/domain/code/ts/src/shared/errors.ts`

---

## Purity Boundary Map

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Input precondition | `state.status === 'save-failed'` guard | **Pure core** | Stateless boolean check; no ports; compile-time enforced by type |
| Cancel-switch guard | `pendingNextNoteId !== null` check | **Pure core** | Stateless check on input; no ports |
| State transition — retry | `EditingSessionTransitions.retry(state, now)` | **Pure core** | `(SaveFailedState, Timestamp) → SavingState`; deterministic; no I/O. Property-test target. |
| State transition — discard | `EditingSessionTransitions.discard(state, now)` | **Pure core** | `(SaveFailedState, Timestamp) → EditingState \| IdleState`; routing by `pendingNextNoteId`; deterministic. Property-test target. |
| State transition — cancelSwitch | `EditingSessionTransitions.cancelSwitch(state, now)` | **Pure core** | `(SaveFailedState, Timestamp) → EditingState`; deterministic; no I/O. Property-test target. |
| ResolvedState construction | `{ kind: 'ResolvedState', resolution: R }` | **Pure core** | Deterministic value construction; no ports |
| `Clock.now()` call | Timestamp acquisition | **Effectful shell** | Impure; called exactly once per invocation in the orchestrator |
| `emit(RetrySaveRequested)` | Event publication | **Effectful shell** | Side effect; impure; called on retry branch only |
| `emit(EditingSessionDiscarded)` | Event publication | **Effectful shell** | Side effect; impure; called on both discard sub-cases |

**Formally verifiable core**: All three `EditingSessionTransitions` functions (`retry`, `discard`, `cancelSwitch`) are pure and suitable for property-based testing with fast-check.

**Effectful shell**: The orchestrator function that sequences `Clock.now()` → pure transition → `emit()` → `ResolvedState`. This is tested via example-based tests with emit spies and Clock stubs.

---

## Port Contracts

```typescript
// ── Clock ──────────────────────────────────────────────────────────────
/** Returns the current wall-clock time. Called exactly once per workflow invocation.
 *  The same `now` value is used for both the state transition's `now` parameter
 *  and the emitted event's `occurredOn` field. */
type ClockNow = () => Timestamp;

// ── emit (CaptureInternalEvent) ────────────────────────────────────────
/** Publish a Capture-internal event.
 *  Called at most once per HandleSaveFailure invocation:
 *    - retry-save branch: exactly 1 call (RetrySaveRequested)
 *    - discard branch: exactly 1 call (EditingSessionDiscarded)
 *    - cancel-switch (valid) branch: 0 calls
 *  Does NOT accept PublicDomainEvent; HandleSaveFailure emits no public events. */
type EmitInternal = (event: CaptureInternalEvent) => void;

// ── EditingSessionTransitions (pure, injected or static) ──────────────
/** retry: save-failed → saving */
type Retry = (state: SaveFailedState, now: Timestamp) => SavingState;

/** discard: save-failed → editing(pendingNextNoteId) | idle */
type Discard = (state: SaveFailedState, now: Timestamp) => EditingState | IdleState;

/** cancelSwitch: save-failed → editing(currentNoteId) with isDirty=true preserved */
type CancelSwitch = (state: SaveFailedState, now: Timestamp) => EditingState;
```

---

## Proof Obligations

| ID | Description | Covers REQ | Tier | Required | Tool |
|----|-------------|-----------|------|----------|------|
| PROP-HSF-001 | `retry` transition purity: `∀ (state: SaveFailedState, now: Timestamp)`, calling `retry(state, now)` twice with identical inputs produces structurally equal `SavingState` outputs | REQ-HSF-002, REQ-HSF-009 | 1 | **true** | fast-check (property: retry(s, t) deepEquals retry(s, t)) |
| PROP-HSF-002 | `retry` state shape: `retry(state, now).status === 'saving'` AND `retry(state, now).currentNoteId === state.currentNoteId` for all valid `SaveFailedState` inputs | REQ-HSF-002 | 1 | **true** | fast-check (property: ∀ SaveFailedState s, retry(s, now).status === 'saving' ∧ retry(s, now).currentNoteId === s.currentNoteId) |
| PROP-HSF-003 | `discard` routing: `∀ state` where `state.pendingNextNoteId === null`, `discard(state, now).status === 'idle'`; `∀ state` where `state.pendingNextNoteId !== null`, `discard(state, now).status === 'editing'` AND `discard(state, now).currentNoteId === state.pendingNextNoteId` | REQ-HSF-003, REQ-HSF-004 | 1 | **true** | fast-check (property: pendingNextNoteId null → idle; non-null → editing with currentNoteId === pendingNextNoteId) |
| PROP-HSF-004 | `cancelSwitch` state shape: `cancelSwitch(state, now).status === 'editing'` AND `cancelSwitch(state, now).currentNoteId === state.currentNoteId` AND `cancelSwitch(state, now).isDirty === true` for all valid `SaveFailedState` inputs | REQ-HSF-005 | 1 | **true** | fast-check (property: ∀ SaveFailedState s, cancelSwitch(s, now).status === 'editing' ∧ isDirty === true ∧ currentNoteId === s.currentNoteId) |
| PROP-HSF-005 | `UserDecision` exhaustiveness: the implementation's switch over `decision.kind` has a `never` branch that makes adding a new `UserDecision` variant a compile-time error | REQ-HSF-007 | 0 | **true** | TypeScript type exhaustiveness (never branch: `const _: never = decision` in default case) |
| PROP-HSF-006 | `pendingNextNoteId` routing — discard with pending: the `EditingSessionDiscarded` event carries `noteId === state.currentNoteId` (not `pendingNextNoteId`); the resulting state has `currentNoteId === state.pendingNextNoteId` | REQ-HSF-004, REQ-HSF-008 | 2 | false | Example-based test: SaveFailedState with pendingNextNoteId='note-B', currentNoteId='note-A' → event.noteId==='note-A', newState.currentNoteId==='note-B' |
| PROP-HSF-007 | `pendingNextNoteId` routing — cancel-switch: resulting `EditingState` has `currentNoteId === state.currentNoteId`; `pendingNextNoteId` is absent from `EditingState` (the type has no such field) | REQ-HSF-005 | 2 | false | Example-based test: SaveFailedState with pendingNextNoteId='note-B' → cancelSwitch → EditingState.currentNoteId === 'note-A'; no pendingNextNoteId field on EditingState |
| PROP-HSF-008 | `pendingNextNoteId` never leaks: after any resolution (retry/discard/cancel), the emitted event payload does not contain `pendingNextNoteId`; `RetrySaveRequested` and `EditingSessionDiscarded` payloads contain only `noteId` (= `currentNoteId`) | REQ-HSF-002, REQ-HSF-003, REQ-HSF-004, REQ-HSF-008 | 2 | false | Example-based test with emit spy: inspect event payload fields; assert absence of `pendingNextNoteId` key |
| PROP-HSF-009 | Exactly-one event constraint — retry branch: emit spy called exactly once with `RetrySaveRequested { kind: 'retry-save-requested', noteId: state.currentNoteId }` | REQ-HSF-002, REQ-HSF-008 | 2 | false | Example-based test with emit spy |
| PROP-HSF-010 | Exactly-one event constraint — discard branch (both sub-cases): emit spy called exactly once with `EditingSessionDiscarded { kind: 'editing-session-discarded', noteId: state.currentNoteId }` | REQ-HSF-003, REQ-HSF-004, REQ-HSF-008 | 2 | false | Example-based test with emit spy: verify call count === 1 for no-pending and with-pending sub-cases |
| PROP-HSF-011 | Zero events — cancel-switch valid branch: emit spy called zero times | REQ-HSF-005, REQ-HSF-008 | 2 | false | Example-based test with emit spy: SaveFailedState with non-null pendingNextNoteId, cancel-switch → emit count === 0 |
| PROP-HSF-012 | Cancel-switch invalid guard: when `state.pendingNextNoteId === null` and `decision.kind === 'cancel-switch'`, the function throws/rejects; no state transition occurs; no event emitted | REQ-HSF-006 | 2 | false | Example-based test: SaveFailedState with pendingNextNoteId=null, cancel-switch → expect thrown InvariantViolated; emit spy not called |
| PROP-HSF-013 | Clock.now() call count: spy confirms exactly 1 call on retry, discard-no-pending, discard-with-pending, and cancel-switch-valid branches | REQ-HSF-009 | 2 | false | Example-based test: instrument Clock.now with spy; verify count === 1 per branch |
| PROP-HSF-014 | Timestamp reuse — retry branch: `RetrySaveRequested.occurredOn` equals the `SavingState.savingStartedAt` (both sourced from the same `Clock.now()` call) | REQ-HSF-002, REQ-HSF-009 | 2 | false | Example-based test: capture Clock.now() return value; assert event.occurredOn === state.savingStartedAt |
| PROP-HSF-015 | Timestamp reuse — discard branch: `EditingSessionDiscarded.occurredOn` equals the `now` value passed to `discard(state, now)` | REQ-HSF-003, REQ-HSF-004, REQ-HSF-009 | 2 | false | Example-based test: capture Clock.now() return value; assert event.occurredOn === captured now |
| PROP-HSF-016 | Event type classification: all emitted events are members of `CaptureInternalEvent`; no `PublicDomainEvent` is emitted by `handleSaveFailure` | REQ-HSF-008 | 0 | false | TypeScript type assertion: `EmitInternal` parameter type is `CaptureInternalEvent`; assign `RetrySaveRequested` and `EditingSessionDiscarded` to `CaptureInternalEvent` — compile-time proof |
| PROP-HSF-017 | `ResolvedState` shape: `resolution` is `'retried'` on retry branch, `'discarded'` on both discard sub-cases, `'cancelled'` on cancel-switch-valid | REQ-HSF-010 | 2 | false | Example-based test: one example per branch; assert ResolvedState.resolution |
| PROP-HSF-018 | Full integration — all four valid branches return a `ResolvedState` with the correct `resolution` and produce the correct resulting `EditingSessionState` kind | REQ-HSF-002 through REQ-HSF-005, REQ-HSF-010 | 3 | false | Integration test with port fakes (Clock stub, emit spy, real transition functions) |

---

## Verification Tiers

- **Tier 0**: TypeScript type-level proof. No runtime test needed; the type system enforces it at compile time. Applies to `UserDecision` exhaustiveness (PROP-HSF-005) and event type classification (PROP-HSF-016).
- **Tier 1**: Property-based test with fast-check. Generated random inputs; checks structural invariants of the pure transition functions. Applies to `retry`, `discard`, and `cancelSwitch` purity and output shape (PROP-HSF-001 through PROP-HSF-004).
- **Tier 2**: Example-based unit test. Concrete inputs and expected outputs; verifies specific behaviors including event emission, routing, and Clock budget (PROP-HSF-006 through PROP-HSF-017).
- **Tier 3**: Integration test. Exercises the full workflow with real transition functions and port fakes/stubs; tests cross-step coordination (PROP-HSF-018).

In lean mode, `required: true` is reserved for the highest-risk invariants. The five required properties are:

- **PROP-HSF-001** (`retry` purity) — confirms the core transition is side-effect-free and referentially transparent; if this fails, property-based testing of the whole retry path is invalid.
- **PROP-HSF-002** (`retry` state shape) — data-correctness invariant; wrong `currentNoteId` after retry would send the re-save to the wrong note.
- **PROP-HSF-003** (`discard` routing) — highest data-loss risk: if routing by `pendingNextNoteId` is wrong, a user either gets stuck in idle instead of opening the pending note, or vice versa.
- **PROP-HSF-004** (`cancelSwitch` state shape) — data-integrity risk: if `isDirty` is not preserved, the user's unsaved edits become invisible to the auto-save system.
- **PROP-HSF-005** (`UserDecision` exhaustiveness) — forward-compatibility invariant; any new decision variant that is not handled silently becomes a dead branch otherwise.

---

## Coverage Matrix

| Requirement | PROP IDs |
|-------------|---------|
| REQ-HSF-001 | PROP-HSF-005 (type-enforced precondition) |
| REQ-HSF-002 | PROP-HSF-001, PROP-HSF-002, PROP-HSF-009, PROP-HSF-013, PROP-HSF-014, PROP-HSF-018 |
| REQ-HSF-003 | PROP-HSF-003, PROP-HSF-010, PROP-HSF-013, PROP-HSF-015, PROP-HSF-018 |
| REQ-HSF-004 | PROP-HSF-003, PROP-HSF-006, PROP-HSF-008, PROP-HSF-010, PROP-HSF-013, PROP-HSF-015, PROP-HSF-018 |
| REQ-HSF-005 | PROP-HSF-004, PROP-HSF-007, PROP-HSF-011, PROP-HSF-013, PROP-HSF-018 |
| REQ-HSF-006 | PROP-HSF-012 |
| REQ-HSF-007 | PROP-HSF-005 |
| REQ-HSF-008 | PROP-HSF-008, PROP-HSF-009, PROP-HSF-010, PROP-HSF-011, PROP-HSF-016 |
| REQ-HSF-009 | PROP-HSF-001, PROP-HSF-013, PROP-HSF-014, PROP-HSF-015 |
| REQ-HSF-010 | PROP-HSF-017, PROP-HSF-018 |

Every requirement has at least one proof obligation. Five `required: true` obligations (PROP-HSF-001 through PROP-HSF-005) cover the highest-risk invariants and span Tiers 0–1. Total proof obligations: 18 (PROP-HSF-001 through PROP-HSF-018).
