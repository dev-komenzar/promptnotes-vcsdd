---
coherence:
  node_id: "design:handle-save-failure-verification"
  type: design
  name: "handle-save-failure 検証アーキテクチャ（純粋性境界・証明義務）"
  depends_on:
    - id: "req:handle-save-failure"
      relation: derives_from
  modules:
    - "handle-save-failure"
  source_files:
    - "promptnotes/src/lib/domain/__tests__/handle-save-failure"
---

# Verification Architecture: HandleSaveFailure

**Feature**: `handle-save-failure`
**Phase**: 1b
**Revision**: 3
**Mode**: lean
**Source**: `docs/domain/workflows.md` Workflow 8, `docs/domain/aggregates.md` §CaptureSession §EditingSessionState, `docs/domain/code/ts/src/capture/stages.ts` lines 118–132, `docs/domain/code/ts/src/capture/states.ts` lines 14–17 (PendingNextFocus), 35–45 (EditingState), 59–64 (SwitchingState), 70–75 (SaveFailedState), 93–149 (EditingSessionTransitions), `docs/domain/code/ts/src/capture/workflows.ts` lines 138–144, `docs/domain/code/ts/src/capture/internal-events.ts`, `docs/domain/code/ts/src/shared/errors.ts` lines 58–62 (SwitchError)

---

## Purity Boundary Map

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Input precondition | `state.status === 'save-failed'` guard | **Pure core** | Stateless boolean check; no ports; compile-time enforced by type |
| Cancel-switch guard | `pendingNextFocus !== null` check | **Pure core** | Stateless check on input; no ports |
| State transition — retry | `EditingSessionTransitions.retry(state, now)` | **Pure core** | `(SaveFailedState, Timestamp) → SavingState`; deterministic; no I/O. Property-test target. |
| State transition — discard | `EditingSessionTransitions.discard(state, now)` | **Pure core** | `(SaveFailedState, Timestamp) → EditingState \| IdleState`; routing by `pendingNextFocus`; deterministic. Property-test target. |
| State transition — cancelSwitch | `EditingSessionTransitions.cancelSwitch(state, now)` | **Pure core** | `(SaveFailedState, Timestamp) → EditingState`; deterministic; no I/O. Property-test target. |
| ResolvedState construction | `{ kind: 'ResolvedState', resolution: R }` | **Pure core** | Deterministic value construction; no ports |
| `Clock.now()` call | Timestamp acquisition | **Effectful shell** | Impure; called exactly once per invocation in the orchestrator on valid branches; 0 times on cancel-switch-invalid |
| `emit(RetrySaveRequested)` | Event publication | **Effectful shell** | Side effect; impure; called on retry branch only |
| `emit(EditingSessionDiscarded)` | Event publication | **Effectful shell** | Side effect; impure; called on both discard sub-cases |

**Formally verifiable core**: All three `EditingSessionTransitions` functions (`retry`, `discard`, `cancelSwitch`) are pure and suitable for property-based testing with fast-check.

**Effectful shell**: The orchestrator function that sequences `Clock.now()` → pure transition → `emit()` → `ResolvedState`. This is tested via example-based tests with emit spies and Clock stubs.

---

## Port Contracts

```typescript
// ── Clock ──────────────────────────────────────────────────────────────
/** Returns the current wall-clock time. Called exactly once per workflow invocation
 *  on valid branches (retry, discard, cancel-switch valid). Called 0 times on the
 *  cancel-switch-invalid branch (short-circuit before timestamp acquisition).
 *  The same `now` value is used for both the state transition's `now` parameter
 *  and the emitted event's `occurredOn` field. */
type ClockNow = () => Timestamp;

// ── emit (CaptureInternalEvent) ────────────────────────────────────────
/** Publish a Capture-internal event.
 *  Called at most once per HandleSaveFailure invocation:
 *    - retry-save branch: exactly 1 call (RetrySaveRequested)
 *    - discard branch: exactly 1 call (EditingSessionDiscarded)
 *    - cancel-switch (valid) branch: 0 calls
 *    - cancel-switch (invalid) branch: 0 calls
 *  Does NOT accept PublicDomainEvent; HandleSaveFailure emits no public events.
 *  Event payloads do NOT carry SaveError; error is for logging only (REQ-HSF-012).
 *  Event payloads do NOT carry pendingNextFocus or its constituent noteId/blockId. */
type EmitInternal = (event: CaptureInternalEvent) => void;

// ── EditingSessionTransitions (pure, injected or static) ──────────────
/** retry: save-failed → saving */
type Retry = (state: SaveFailedState, now: Timestamp) => SavingState;

/** discard: save-failed → editing(pendingNextFocus.noteId, pendingNextFocus.blockId) | idle
 *  When state.pendingNextFocus !== null:
 *    result.currentNoteId === state.pendingNextFocus.noteId
 *    result.focusedBlockId === state.pendingNextFocus.blockId  (design decision: REQ-HSF-004)
 *  When state.pendingNextFocus === null:
 *    result.status === 'idle' */
type Discard = (state: SaveFailedState, now: Timestamp) => EditingState | IdleState;

/** cancelSwitch: save-failed → editing(currentNoteId) with isDirty=true,
 *  lastSaveResult='failed', focusedBlockId=null (Option A: REQ-HSF-005 design decision) */
type CancelSwitch = (state: SaveFailedState, now: Timestamp) => EditingState;
```

---

## Proof Obligations

| ID | Description | Covers REQ | Tier | Required | Tool |
|----|-------------|-----------|------|----------|------|
| PROP-HSF-001 | `retry` transition determinism (`retry-determinism`): `∀ (state: SaveFailedState, now: Timestamp)`, calling `retry(state, now)` twice with identical inputs produces structurally equal `SavingState` outputs | REQ-HSF-002, REQ-HSF-009 | 1 | **true** | fast-check (property: retry(s, t) deepEquals retry(s, t)) |
| PROP-HSF-002 | `retry` state shape: `retry(state, now).status === 'saving'` AND `retry(state, now).currentNoteId === state.currentNoteId` for all valid `SaveFailedState` inputs | REQ-HSF-002 | 1 | **true** | fast-check (property: ∀ SaveFailedState s, retry(s, now).status === 'saving' ∧ retry(s, now).currentNoteId === s.currentNoteId) |
| PROP-HSF-003 | `discard` routing: `∀ state` where `state.pendingNextFocus === null`, `discard(state, now).status === 'idle'`; `∀ state` where `state.pendingNextFocus !== null`, `discard(state, now).status === 'editing'` AND `(discard(state, now) as EditingState).currentNoteId === state.pendingNextFocus.noteId` | REQ-HSF-003, REQ-HSF-004 | 1 | **true** | fast-check (property: pendingNextFocus null → idle; non-null → editing with currentNoteId === pendingNextFocus.noteId) |
| PROP-HSF-004 | `cancelSwitch` state shape: `cancelSwitch(state, now).status === 'editing'` AND `cancelSwitch(state, now).currentNoteId === state.currentNoteId` AND `cancelSwitch(state, now).isDirty === true` AND `cancelSwitch(state, now).lastSaveResult === 'failed'` AND `cancelSwitch(state, now).focusedBlockId === null` for all valid `SaveFailedState` inputs with non-null `pendingNextFocus` | REQ-HSF-005 | 1 | **true** | fast-check (property: ∀ SaveFailedState s with non-null pendingNextFocus, cancelSwitch(s, now) has status='editing' ∧ isDirty=true ∧ currentNoteId=s.currentNoteId ∧ lastSaveResult='failed' ∧ focusedBlockId=null) |
| PROP-HSF-005 | `UserDecision` exhaustiveness: the implementation's switch over `decision.kind` has a `never` branch that makes adding a new `UserDecision` variant a compile-time error | REQ-HSF-007 | 0 | **true** | TypeScript type exhaustiveness — encoded in `tests/types/handle-save-failure.type-test.ts` using `@ts-expect-error`; `tsc --noEmit` runs in CI |
| PROP-HSF-006 | `pendingNextFocus` routing — discard with pending: the `EditingSessionDiscarded` event carries `noteId === state.currentNoteId` (not `pendingNextFocus.noteId`); the resulting state has `currentNoteId === state.pendingNextFocus.noteId`; `focusedBlockId === state.pendingNextFocus.blockId`; `lastInputAt: null`, `idleTimerHandle: null`, `lastSaveResult: null`, `isDirty: false` | REQ-HSF-004, REQ-HSF-008 | 2 | false | Example-based test: SaveFailedState with pendingNextFocus={noteId:'note-B', blockId:'b1'}, currentNoteId='note-A' → event.noteId==='note-A', newState.currentNoteId==='note-B', newState.focusedBlockId==='b1'; assert all 7 EditingState fields |
| PROP-HSF-007 | `pendingNextFocus` routing — cancel-switch: resulting `EditingState` has `currentNoteId === state.currentNoteId`; `focusedBlockId === null` (Option A); `isDirty === true`; `lastSaveResult === 'failed'`; `lastInputAt: null`; `idleTimerHandle: null`; `pendingNextFocus` is absent from `EditingState` | REQ-HSF-005 | 2 | false | Example-based test: SaveFailedState with pendingNextFocus={noteId:'note-B', blockId:'b1'} → cancelSwitch → assert all 7 EditingState fields; assert no pendingNextFocus field on EditingState |
| PROP-HSF-008 | `pendingNextFocus` never leaks: after any resolution (retry/discard/cancel), the emitted event payload does not contain `pendingNextFocus`, `pendingNextNoteId`, or any constituent `blockId` from the pending focus; `RetrySaveRequested` and `EditingSessionDiscarded` payloads contain only `noteId` (= `currentNoteId`) | REQ-HSF-002, REQ-HSF-003, REQ-HSF-004, REQ-HSF-008 | 2 | false | Example-based test with emit spy: inspect event payload fields; assert absence of `pendingNextFocus` key and constituent `blockId` key |
| PROP-HSF-009 | Exactly-one event constraint — retry branch: emit spy called exactly once with `RetrySaveRequested { kind: 'retry-save-requested', noteId: state.currentNoteId }` | REQ-HSF-002, REQ-HSF-008 | 2 | false | Example-based test with emit spy |
| PROP-HSF-010 | Exactly-one event constraint — discard branch (both sub-cases): emit spy called exactly once with `EditingSessionDiscarded { kind: 'editing-session-discarded', noteId: state.currentNoteId }` | REQ-HSF-003, REQ-HSF-004, REQ-HSF-008 | 2 | false | Example-based test with emit spy: verify call count === 1 for no-pending and with-pending sub-cases |
| PROP-HSF-011 | Zero events — cancel-switch valid branch: emit spy called zero times | REQ-HSF-005, REQ-HSF-008 | 2 | false | Example-based test with emit spy: SaveFailedState with non-null pendingNextFocus, cancel-switch → emit count === 0 |
| PROP-HSF-012 | Cancel-switch invalid guard: when `state.pendingNextFocus === null` and `decision.kind === 'cancel-switch'`, the function returns `Promise.reject(SaveError { kind: 'validation', reason: { kind: 'invariant-violated' } })`; no state transition occurs; no event emitted | REQ-HSF-006 | 2 | false | Example-based test: SaveFailedState with pendingNextFocus=null, cancel-switch → expect Promise.reject with InvariantViolated; emit spy not called |
| PROP-HSF-013 | Clock.now() call count — valid branches: spy confirms exactly 1 call on retry, discard-no-pending, discard-with-pending, and cancel-switch-valid branches | REQ-HSF-009 | 2 | false | Example-based test: instrument Clock.now with spy; verify count === 1 per valid branch |
| PROP-HSF-014 | Timestamp reuse — retry branch: `RetrySaveRequested.occurredOn` equals the `SavingState.savingStartedAt` (both sourced from the same `Clock.now()` call) | REQ-HSF-002, REQ-HSF-009 | 2 | false | Example-based test: capture Clock.now() return value; assert event.occurredOn === state.savingStartedAt |
| PROP-HSF-015 | Timestamp reuse — discard branch: `EditingSessionDiscarded.occurredOn` equals the `now` value passed to `discard(state, now)` | REQ-HSF-003, REQ-HSF-004, REQ-HSF-009 | 2 | false | Example-based test: capture Clock.now() return value; assert event.occurredOn === captured now |
| PROP-HSF-016 | Event type classification: all emitted events are members of `CaptureInternalEvent`; no `PublicDomainEvent` is emitted by `handleSaveFailure` | REQ-HSF-008 | 0 | false | TypeScript type assertion — encoded in `tests/types/handle-save-failure.type-test.ts` using `@ts-expect-error`; `tsc --noEmit` runs in CI |
| PROP-HSF-017 | `ResolvedState` shape: `resolution` is `'retried'` on retry branch, `'discarded'` on both discard sub-cases, `'cancelled'` on cancel-switch-valid | REQ-HSF-010 | 2 | false | Example-based test: one example per branch; assert ResolvedState.resolution |
| PROP-HSF-018 | Full integration — all four valid branches return a `ResolvedState` with the correct `resolution` and produce the correct resulting `EditingSessionState` kind | REQ-HSF-002 through REQ-HSF-005, REQ-HSF-010 | 3 | false | Integration test with port fakes (Clock stub, emit spy, real transition functions) |
| PROP-HSF-019 | `invariant-on-non-save-failed`: given a deliberately-cast non-`save-failed` state (e.g. `EditingState` cast to `SaveFailedState`), `handleSaveFailure` returns `Promise.reject(SaveError { kind: 'validation', reason: { kind: 'invariant-violated' } })`; no transition occurs; no event emitted | REQ-HSF-001 | 2 | false | Example-based test: construct `{ status: 'editing', ... } as unknown as SaveFailedState`; pass to handleSaveFailure; expect rejection with InvariantViolated; emit spy not called |
| PROP-HSF-020 | Clock.now() call count — cancel-switch-invalid branch: spy confirms exactly 0 calls when `pendingNextFocus === null` and `decision.kind === 'cancel-switch'` (invariant guard fires before timestamp acquisition) | REQ-HSF-006, REQ-HSF-009 | 2 | false | Example-based test: instrument Clock.now with spy; cancel-switch-invalid path → verify count === 0 |
| PROP-HSF-021 | `pure-transition-no-side-effect`: the pure transition functions `retry`, `discard`, and `cancelSwitch` do not call `Clock.now` or `emit` internally; sentinel spy counts for both ports remain 0 when the functions are called directly (bypassing the orchestrator) | REQ-HSF-002, REQ-HSF-003, REQ-HSF-004, REQ-HSF-005 | 1 | false | fast-check (property: ∀ SaveFailedState s, call retry/discard/cancelSwitch with injected Clock spy + emit spy; assert both call counts === 0 after each pure function call) |
| PROP-HSF-022 | `discard-with-pending-threads-blockId`: `∀ SaveFailedState s` where `s.pendingNextFocus !== null`, `(discard(s, now) as EditingState).focusedBlockId === s.pendingNextFocus.blockId`; the `blockId` from the pending focus is correctly threaded into the resulting `EditingState` | REQ-HSF-004 | 2 | false | Example-based test (Tier 2): SaveFailedState with pendingNextFocus={noteId:'note-B', blockId:'block-xyz'} → discard → assert result.focusedBlockId === 'block-xyz'; additionally, fast-check property: ∀ s with non-null pendingNextFocus, discard(s, now).focusedBlockId === s.pendingNextFocus.blockId |

---

## Tier 0 Encoding

Tier 0 PROPs (PROP-HSF-005, PROP-HSF-016) are type-level proofs. They are encoded in `tests/types/handle-save-failure.type-test.ts` using `@ts-expect-error` annotations. `tsc --noEmit` runs in CI; absence of the expected errors is treated as a test failure (the `@ts-expect-error` annotation itself will produce a TS error if the type violation no longer exists, alerting CI).

Example encoding pattern:
```typescript
// PROP-HSF-005: adding an unhandled UserDecision variant must cause a compile error
// @ts-expect-error — 'unknown-variant' is not a valid UserDecision.kind
const _: never = { kind: 'unknown-variant' } satisfies UserDecision;

// PROP-HSF-016: passing a PublicDomainEvent to EmitInternal must cause a compile error
// @ts-expect-error — PublicDomainEvent is not assignable to CaptureInternalEvent
const _emitTyped: EmitInternal = (e: PublicDomainEvent) => {};
```

---

## Verification Tiers

- **Tier 0**: TypeScript type-level proof. Encoded in `tests/types/handle-save-failure.type-test.ts` using `@ts-expect-error`; `tsc --noEmit` enforces them in CI. Applies to `UserDecision` exhaustiveness (PROP-HSF-005) and event type classification (PROP-HSF-016).
- **Tier 1**: Property-based test with fast-check. Generated random inputs; checks structural invariants of the pure transition functions. Applies to `retry`, `discard`, and `cancelSwitch` purity and output shape (PROP-HSF-001 through PROP-HSF-004, PROP-HSF-021). PROP-HSF-022 includes a fast-check component in addition to its example-based form.
- **Tier 2**: Example-based unit test. Concrete inputs and expected outputs; verifies specific behaviors including event emission, routing, Clock budget, invariant rejection, and full `EditingState` struct (PROP-HSF-006 through PROP-HSF-017, PROP-HSF-019, PROP-HSF-020, PROP-HSF-022).
- **Tier 3**: Integration test. Exercises the full workflow with real transition functions and port fakes/stubs; tests cross-step coordination (PROP-HSF-018).

In lean mode, `required: true` is reserved for the highest-risk invariants. The five required properties are:

- **PROP-HSF-001** (`retry-determinism`) — confirms the core transition is referentially transparent; if this fails, property-based testing of the whole retry path is invalid.
- **PROP-HSF-002** (`retry` state shape) — data-correctness invariant; wrong `currentNoteId` after retry would send the re-save to the wrong note.
- **PROP-HSF-003** (`discard` routing) — highest data-loss risk: if routing by `pendingNextFocus` is wrong, a user either gets stuck in idle instead of opening the pending note, or vice versa.
- **PROP-HSF-004** (`cancelSwitch` state shape) — data-integrity risk: if `isDirty`, `lastSaveResult`, or `focusedBlockId` is not correctly set, the user's unsaved edits become invisible to the auto-save system or the failure indicator is lost.
- **PROP-HSF-005** (`UserDecision` exhaustiveness) — forward-compatibility invariant; any new decision variant that is not handled silently becomes a dead branch otherwise.

---

## Coverage Matrix

| Requirement | PROP IDs |
|-------------|---------|
| REQ-HSF-001 | PROP-HSF-005 (type-enforced precondition), PROP-HSF-019 (runtime invariant-on-non-save-failed) |
| REQ-HSF-002 | PROP-HSF-001, PROP-HSF-002, PROP-HSF-009, PROP-HSF-013, PROP-HSF-014, PROP-HSF-018, PROP-HSF-021 |
| REQ-HSF-003 | PROP-HSF-003, PROP-HSF-010, PROP-HSF-013, PROP-HSF-015, PROP-HSF-018, PROP-HSF-021 |
| REQ-HSF-004 | PROP-HSF-003, PROP-HSF-006, PROP-HSF-008, PROP-HSF-010, PROP-HSF-013, PROP-HSF-015, PROP-HSF-018, PROP-HSF-021, PROP-HSF-022 |
| REQ-HSF-005 | PROP-HSF-004, PROP-HSF-007, PROP-HSF-011, PROP-HSF-013, PROP-HSF-018, PROP-HSF-021 |
| REQ-HSF-006 | PROP-HSF-012, PROP-HSF-020 |
| REQ-HSF-007 | PROP-HSF-005 |
| REQ-HSF-008 | PROP-HSF-008, PROP-HSF-009, PROP-HSF-010, PROP-HSF-011, PROP-HSF-016 |
| REQ-HSF-009 | PROP-HSF-001, PROP-HSF-013, PROP-HSF-014, PROP-HSF-015, PROP-HSF-020 |
| REQ-HSF-010 | PROP-HSF-017, PROP-HSF-018 |
| REQ-HSF-011 | PROP-HSF-005 (type-level: callers missing `state` parameter produce a compile error) |
| REQ-HSF-012 | PROP-HSF-008 (emit spy payload inspection confirms no error field and no pendingNextFocus constituent fields) |

Every requirement has at least one proof obligation. Five `required: true` obligations (PROP-HSF-001 through PROP-HSF-005) cover the highest-risk invariants and span Tiers 0–1. Total proof obligations: 22 (PROP-HSF-001 through PROP-HSF-022).

---

## Revision History

### Revision 2 (iter-2 — addresses Phase 1c FIND-SPEC-001 through FIND-SPEC-011)

| FIND ID | Change made |
|---------|------------|
| FIND-SPEC-003 | PROP-HSF-019 added (Tier 2, `invariant-on-non-save-failed`). Coverage matrix REQ-HSF-001 updated. |
| FIND-SPEC-004 | PROP-HSF-020 added (Tier 2, 0 Clock.now() calls on cancel-switch-invalid). |
| FIND-SPEC-005 | PROP-HSF-001 renamed to `retry-determinism`. PROP-HSF-021 added (`pure-transition-no-side-effect`, Tier 1). |
| FIND-SPEC-007 | PROP-HSF-012 wording updated to match `Promise.reject(SaveError {...})` rejection shape. |
| FIND-SPEC-010 | Tier 0 encoding tooling specified. |

### Revision 3 (sprint-2 — block migration: pendingNextNoteId → pendingNextFocus)

| ID | Change made | Migration cause |
|----|------------|----------------|
| Purity Boundary Map | "pendingNextNoteId !== null check" → "pendingNextFocus !== null check" in cancel-switch guard row; `discard` routing description updated to reference `pendingNextFocus`; `cancelSwitch` doc updated to include `focusedBlockId=null` | `SaveFailedState.pendingNextFocus` rename; `EditingState.focusedBlockId` new field |
| Port Contracts — Discard | Type comment updated: routing now by `pendingNextFocus`; result fields `currentNoteId === state.pendingNextFocus.noteId` and `focusedBlockId === state.pendingNextFocus.blockId` documented (REQ-HSF-004 design decision) | `PendingNextFocus` composite type (states.ts lines 14–17) |
| Port Contracts — CancelSwitch | Type comment updated: `focusedBlockId=null` (Option A, REQ-HSF-005 design decision) | `EditingState.focusedBlockId` new field; domain SoT does not carry `currentFocusedBlockId` on `SaveFailedState` |
| Port Contracts — EmitInternal | Note added: "Event payloads do NOT carry pendingNextFocus or its constituent noteId/blockId" | Sprint-2 non-leak requirement |
| PROP-HSF-003 | `pendingNextNoteId` → `pendingNextFocus`; routing check updated to `.noteId` member access | `SaveFailedState.pendingNextFocus` rename |
| PROP-HSF-004 | Added `focusedBlockId === null` to the property assertion (Option A); property description updated | `EditingState.focusedBlockId` new field |
| PROP-HSF-006 | `pendingNextNoteId` → `pendingNextFocus`; added `focusedBlockId === state.pendingNextFocus.blockId` as asserted field; "6 EditingState fields" → "7 EditingState fields" | Same rename; new field |
| PROP-HSF-007 | `pendingNextNoteId` → `pendingNextFocus`; added `focusedBlockId === null` to assertions; "6 EditingState fields" → "7 EditingState fields" | Same |
| PROP-HSF-008 | "pendingNextNoteId" → "pendingNextFocus"; added constituent `blockId` key to non-leak assertion | Same rename; pending focus now has two constituent fields |
| PROP-HSF-012 | `pendingNextNoteId === null` → `pendingNextFocus === null` in guard description | Same rename |
| PROP-HSF-020 | `pendingNextNoteId === null` → `pendingNextFocus === null` in guard description | Same rename |
| PROP-HSF-022 | **New**: `discard-with-pending-threads-blockId` — Tier 2 example-based + fast-check property asserting `EditingState.focusedBlockId === state.pendingNextFocus.blockId` on discard-with-pending path | `PendingNextFocus.blockId` must be correctly threaded; no equivalent existed for sprint-1 (field did not exist) |
| Coverage Matrix | PROP-HSF-022 added to REQ-HSF-004 row; PROP-HSF-012 description updated in REQ-HSF-012 row | New PROP; updated description |
| Verification Tiers — Tier 2 | PROP-HSF-022 added to Tier 2 enumeration | New PROP |
| Source header | Line numbers updated to reflect shifted source after block migration | All source files shifted during migration |
| Total PROPs | 21 → 22 | PROP-HSF-022 added |
