/**
 * pipeline.test.ts — HandleSaveFailure full pipeline integration tests
 *
 * Sprint-2 (block migration) — coverage retrofit + genuine red
 *
 * REQ-HSF-001: Precondition — input must be SaveFailedState
 *   [coverage retrofit]
 * REQ-HSF-002: Branch — RetrySave
 *   [coverage retrofit]
 * REQ-HSF-003: Branch — DiscardCurrentSession without pendingNextFocus
 *   [coverage retrofit]
 * REQ-HSF-004: Branch — DiscardCurrentSession with pendingNextFocus
 *   [genuine red] — focusedBlockId === pendingNextFocus.blockId assertion cannot pass
 * REQ-HSF-005: Branch — CancelSwitch (valid: pendingNextFocus present)
 *   [genuine red] — 7-field assertion (focusedBlockId: null) cannot pass
 * REQ-HSF-006: Branch — CancelSwitch invalid when no pendingNextFocus
 *   [genuine red] — error detail string changed to "cancel-switch requires pendingNextFocus"
 * REQ-HSF-007: UserDecision exhaustiveness
 *   [coverage retrofit]
 * REQ-HSF-008: At most one event per invocation
 *   [coverage retrofit]
 * REQ-HSF-009: Clock.now() budget
 *   [coverage retrofit]
 * REQ-HSF-010: ResolvedState shape
 *   [coverage retrofit]
 * REQ-HSF-011: Workflow type signature — widened input contract
 *   [coverage retrofit]
 * REQ-HSF-012: SaveFailedStage.error is for logging only
 *   [coverage retrofit]
 *
 * PROP-HSF-006: pendingNextFocus routing — discard with pending
 *   [genuine red] — focusedBlockId field
 * PROP-HSF-007: pendingNextFocus routing — cancel-switch
 *   [genuine red] — focusedBlockId: null
 * PROP-HSF-008: pendingNextFocus never leaks into emitted event; no blockId in event
 *   [genuine red] — extended assertion
 * PROP-HSF-009: Exactly-one event constraint — retry branch
 *   [coverage retrofit]
 * PROP-HSF-010: Exactly-one event constraint — discard branch
 *   [coverage retrofit]
 * PROP-HSF-011: Zero events — cancel-switch valid branch
 *   [coverage retrofit]
 * PROP-HSF-012: Cancel-switch invalid guard
 *   [genuine red] — error detail string
 * PROP-HSF-013: Clock.now() call count — valid branches
 *   [coverage retrofit]
 * PROP-HSF-014: Timestamp reuse — retry branch
 *   [coverage retrofit]
 * PROP-HSF-015: Timestamp reuse — discard branch
 *   [coverage retrofit]
 * PROP-HSF-017: ResolvedState shape per branch
 *   [coverage retrofit]
 * PROP-HSF-018: Full integration — all four valid branches
 *   [genuine red] — cancel-switch and discard now check focusedBlockId
 */

import { describe, test, expect } from "bun:test";
import type {
  NoteId,
  BlockId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type {
  SaveFailedState,
  EditingState,
  IdleState,
  SavingState,
  PendingNextFocus,
} from "promptnotes-domain-types/capture/states";
import type {
  SaveFailedStage,
  UserDecision,
  ResolvedState,
} from "promptnotes-domain-types/capture/stages";
import type {
  CaptureInternalEvent,
  RetrySaveRequested,
  EditingSessionDiscarded,
} from "promptnotes-domain-types/capture/internal-events";

import {
  runHandleSaveFailurePipeline,
  type HandleSaveFailurePorts,
} from "../../handle-save-failure/pipeline.js";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeBlockId(raw: string): BlockId {
  return raw as unknown as BlockId;
}

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makePendingNextFocus(noteId: NoteId, blockId: BlockId): PendingNextFocus {
  return { noteId, blockId };
}

function makeSaveError(): SaveError {
  return {
    kind: "fs" as const,
    reason: { kind: "unknown" as const, detail: "disk error" },
  };
}

function makeSaveFailedState(opts?: {
  currentNoteId?: NoteId;
  pendingNextFocus?: PendingNextFocus | null;
  lastSaveError?: SaveError;
}): SaveFailedState {
  return {
    status: "save-failed" as const,
    currentNoteId: opts?.currentNoteId ?? makeNoteId("note-A"),
    pendingNextFocus: opts?.pendingNextFocus ?? null,
    lastSaveError: opts?.lastSaveError ?? makeSaveError(),
  };
}

function makeSaveFailedStage(opts?: {
  noteId?: NoteId;
  error?: SaveError;
}): SaveFailedStage {
  return {
    kind: "SaveFailedStage" as const,
    noteId: opts?.noteId ?? makeNoteId("note-A"),
    error: opts?.error ?? makeSaveError(),
  };
}

function makeEventSpy() {
  const events: CaptureInternalEvent[] = [];
  return {
    events,
    emit: (e: CaptureInternalEvent) => { events.push(e); },
  };
}

function makeClockSpy(epochMillis = 1000) {
  let callCount = 0;
  const fixedNow = makeTimestamp(epochMillis);
  return {
    clockNow: (): Timestamp => { callCount++; return fixedNow; },
    getCallCount: () => callCount,
    fixedNow,
  };
}

function makePorts(
  spy: ReturnType<typeof makeEventSpy>,
  clockSpy: ReturnType<typeof makeClockSpy>,
  overrides?: Partial<HandleSaveFailurePorts>,
): HandleSaveFailurePorts {
  return {
    clockNow: overrides?.clockNow ?? clockSpy.clockNow,
    emit: overrides?.emit ?? spy.emit,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("HandleSaveFailure pipeline", () => {

  // ── REQ-HSF-002: retry-save branch ──────────────────────────────────────

  // [coverage retrofit]
  test("retry-save → SavingState, RetrySaveRequested emitted, resolution='retried'", async () => {
    const currentNoteId = makeNoteId("note-A");
    const state = makeSaveFailedState({ currentNoteId });
    const stage = makeSaveFailedStage({ noteId: currentNoteId });
    const decision: UserDecision = { kind: "retry-save" };
    const spy = makeEventSpy();
    const clock = makeClockSpy(5000);
    const ports = makePorts(spy, clock);

    const result = await runHandleSaveFailurePipeline(stage, state, decision, ports);

    // ResolvedState
    expect(result.resolvedState.kind).toBe("ResolvedState");
    expect(result.resolvedState.resolution).toBe("retried");

    // nextSessionState must be SavingState
    const nextState = result.nextSessionState as SavingState;
    expect(nextState.status).toBe("saving");
    expect(nextState.currentNoteId).toBe(currentNoteId);

    // Exactly one event: RetrySaveRequested
    expect(spy.events).toHaveLength(1);
    const event = spy.events[0] as RetrySaveRequested;
    expect(event.kind).toBe("retry-save-requested");
    expect(event.noteId).toBe(currentNoteId);
    expect(event.occurredOn).toBe(clock.fixedNow);

    // Clock.now() called exactly once
    expect(clock.getCallCount()).toBe(1);
  });

  // REQ-HSF-002: no error field in event (REQ-HSF-012)
  // [coverage retrofit]
  test("retry-save → RetrySaveRequested has no error field", async () => {
    const state = makeSaveFailedState();
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "retry-save" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();
    const ports = makePorts(spy, clock);

    await runHandleSaveFailurePipeline(stage, state, decision, ports);

    expect(spy.events).toHaveLength(1);
    expect("error" in spy.events[0]).toBe(false);
  });

  // REQ-HSF-009: PROP-HSF-014 — timestamp reuse on retry
  // [coverage retrofit]
  test("retry-save → SavingState.savingStartedAt equals RetrySaveRequested.occurredOn", async () => {
    const state = makeSaveFailedState();
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "retry-save" };
    const spy = makeEventSpy();
    const clock = makeClockSpy(99999);
    const ports = makePorts(spy, clock);

    const result = await runHandleSaveFailurePipeline(stage, state, decision, ports);

    const nextState = result.nextSessionState as SavingState;
    const event = spy.events[0];
    expect(nextState.savingStartedAt).toBe(event.occurredOn);
    expect(nextState.savingStartedAt).toBe(clock.fixedNow);
  });

  // REQ-HSF-002: pendingNextFocus non-null case — retry proceeds normally
  // [coverage retrofit]
  test("retry-save with pendingNextFocus → SavingState, normal retry", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-retry"));
    const state = makeSaveFailedState({ currentNoteId, pendingNextFocus });
    const stage = makeSaveFailedStage({ noteId: currentNoteId });
    const decision: UserDecision = { kind: "retry-save" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();
    const ports = makePorts(spy, clock);

    const result = await runHandleSaveFailurePipeline(stage, state, decision, ports);

    expect(result.resolvedState.resolution).toBe("retried");
    expect((result.nextSessionState as SavingState).status).toBe("saving");
    expect((result.nextSessionState as SavingState).currentNoteId).toBe(currentNoteId);
    expect(clock.getCallCount()).toBe(1);
  });

  // ── REQ-HSF-003: discard without pendingNextFocus ────────────────────────

  // [coverage retrofit]
  test("discard (no pending) → IdleState, EditingSessionDiscarded emitted, resolution='discarded'", async () => {
    const currentNoteId = makeNoteId("note-A");
    const state = makeSaveFailedState({ currentNoteId, pendingNextFocus: null });
    const stage = makeSaveFailedStage({ noteId: currentNoteId });
    const decision: UserDecision = { kind: "discard-current-session" };
    const spy = makeEventSpy();
    const clock = makeClockSpy(2000);
    const ports = makePorts(spy, clock);

    const result = await runHandleSaveFailurePipeline(stage, state, decision, ports);

    // ResolvedState
    expect(result.resolvedState.kind).toBe("ResolvedState");
    expect(result.resolvedState.resolution).toBe("discarded");

    // nextSessionState must be IdleState
    const nextState = result.nextSessionState as IdleState;
    expect(nextState.status).toBe("idle");

    // Exactly one event: EditingSessionDiscarded
    expect(spy.events).toHaveLength(1);
    const event = spy.events[0] as EditingSessionDiscarded;
    expect(event.kind).toBe("editing-session-discarded");
    expect(event.noteId).toBe(currentNoteId);
    expect(event.occurredOn).toBe(clock.fixedNow);

    // Clock.now() called exactly once
    expect(clock.getCallCount()).toBe(1);
  });

  // REQ-HSF-003: no error field in event (REQ-HSF-012)
  // [coverage retrofit]
  test("discard (no pending) → EditingSessionDiscarded has no error field", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "discard-current-session" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();
    const ports = makePorts(spy, clock);

    await runHandleSaveFailurePipeline(stage, state, decision, ports);

    expect(spy.events).toHaveLength(1);
    expect("error" in spy.events[0]).toBe(false);
  });

  // PROP-HSF-015: timestamp reuse on discard (no pending)
  // [coverage retrofit]
  test("discard (no pending) → EditingSessionDiscarded.occurredOn equals Clock.now() value", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "discard-current-session" };
    const spy = makeEventSpy();
    const clock = makeClockSpy(77777);
    const ports = makePorts(spy, clock);

    await runHandleSaveFailurePipeline(stage, state, decision, ports);

    expect(spy.events[0].occurredOn).toBe(clock.fixedNow);
  });

  // ── REQ-HSF-004: discard with pendingNextFocus ───────────────────────────

  // [genuine red] — focusedBlockId === pendingNextFocus.blockId; 7 fields asserted
  test("discard (with pending) → EditingState for pending note, all 7 fields, resolution='discarded' [genuine red]", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNoteId = makeNoteId("note-B");
    const pendingBlockId = makeBlockId("block-p2");
    const pendingNextFocus = makePendingNextFocus(pendingNoteId, pendingBlockId);
    const state = makeSaveFailedState({ currentNoteId, pendingNextFocus });
    const stage = makeSaveFailedStage({ noteId: currentNoteId });
    const decision: UserDecision = { kind: "discard-current-session" };
    const spy = makeEventSpy();
    const clock = makeClockSpy(3000);
    const ports = makePorts(spy, clock);

    const result = await runHandleSaveFailurePipeline(stage, state, decision, ports);

    // ResolvedState
    expect(result.resolvedState.kind).toBe("ResolvedState");
    expect(result.resolvedState.resolution).toBe("discarded");

    // nextSessionState must be EditingState for the pending note — all 7 fields
    const nextState = result.nextSessionState as EditingState;
    expect(nextState.status).toBe("editing");
    expect(nextState.currentNoteId).toBe(pendingNoteId);           // transitioned to pending
    expect(nextState.focusedBlockId).toBe(pendingBlockId);         // [genuine red] threaded through
    expect(nextState.isDirty).toBe(false);                         // fresh session
    expect(nextState.lastInputAt).toBeNull();                      // fresh session
    expect(nextState.idleTimerHandle).toBeNull();                  // no timer running
    expect(nextState.lastSaveResult).toBeNull();                   // fresh session

    // Exactly one event: EditingSessionDiscarded with currentNoteId (not pendingNextFocus)
    expect(spy.events).toHaveLength(1);
    const event = spy.events[0] as EditingSessionDiscarded;
    expect(event.kind).toBe("editing-session-discarded");
    expect(event.noteId).toBe(currentNoteId);                      // discarded note
    expect(event.occurredOn).toBe(clock.fixedNow);

    // Clock.now() called exactly once
    expect(clock.getCallCount()).toBe(1);
  });

  // PROP-HSF-008: pendingNextFocus does not appear in event payload, blockId absent
  // [genuine red] — extended to check blockId absence
  test("PROP-HSF-008: discard (with pending) → event.noteId is currentNoteId; no pendingNextFocus or blockId in event [genuine red]", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNoteId = makeNoteId("note-B");
    const pendingBlockId = makeBlockId("block-leak");
    const pendingNextFocus = makePendingNextFocus(pendingNoteId, pendingBlockId);
    const state = makeSaveFailedState({ currentNoteId, pendingNextFocus });
    const stage = makeSaveFailedStage({ noteId: currentNoteId });
    const decision: UserDecision = { kind: "discard-current-session" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();
    const ports = makePorts(spy, clock);

    await runHandleSaveFailurePipeline(stage, state, decision, ports);

    expect((spy.events[0] as EditingSessionDiscarded).noteId).toBe(currentNoteId);
    expect((spy.events[0] as EditingSessionDiscarded).noteId).not.toBe(pendingNoteId);
    // pendingNextFocus must not appear in event payload
    expect("pendingNextFocus" in spy.events[0]).toBe(false);
    expect("pendingNextNoteId" in spy.events[0]).toBe(false);
    // blockId must not appear in event payload
    expect("blockId" in spy.events[0]).toBe(false);
  });

  // PROP-HSF-015: timestamp reuse on discard (with pending)
  // [coverage retrofit]
  test("discard (with pending) → EditingSessionDiscarded.occurredOn equals Clock.now() value", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-ts"));
    const state = makeSaveFailedState({
      currentNoteId: makeNoteId("note-A"),
      pendingNextFocus,
    });
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "discard-current-session" };
    const spy = makeEventSpy();
    const clock = makeClockSpy(88888);
    const ports = makePorts(spy, clock);

    await runHandleSaveFailurePipeline(stage, state, decision, ports);

    expect(spy.events[0].occurredOn).toBe(clock.fixedNow);
  });

  // ── REQ-HSF-005: cancel-switch (valid) ──────────────────────────────────

  // [genuine red] — focusedBlockId: null is a new field; old impl returns 6-field object
  test("cancel-switch (valid) → EditingState for current note, all 7 fields, no event, resolution='cancelled' [genuine red]", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-cs"));
    const state = makeSaveFailedState({ currentNoteId, pendingNextFocus });
    const stage = makeSaveFailedStage({ noteId: currentNoteId });
    const decision: UserDecision = { kind: "cancel-switch" };
    const spy = makeEventSpy();
    const clock = makeClockSpy(4000);
    const ports = makePorts(spy, clock);

    const result = await runHandleSaveFailurePipeline(stage, state, decision, ports);

    // ResolvedState
    expect(result.resolvedState.kind).toBe("ResolvedState");
    expect(result.resolvedState.resolution).toBe("cancelled");

    // nextSessionState must be EditingState for current note — all 7 fields
    const nextState = result.nextSessionState as EditingState;
    expect(nextState.status).toBe("editing");
    expect(nextState.currentNoteId).toBe(currentNoteId);    // same note
    // [genuine red] focusedBlockId: null — UI re-focuses from its own state
    expect(nextState.focusedBlockId).toBeNull();
    expect(nextState.isDirty).toBe(true);                    // unsaved content retained
    expect(nextState.lastInputAt).toBeNull();                // restoration moment
    expect(nextState.idleTimerHandle).toBeNull();            // no timer at restoration
    expect(nextState.lastSaveResult).toBe("failed");         // last save did not succeed

    // No event emitted
    expect(spy.events).toHaveLength(0);

    // Clock.now() called exactly once (for the transition's now parameter)
    expect(clock.getCallCount()).toBe(1);
  });

  // PROP-HSF-007: pendingNextFocus absent from EditingState (cancel-switch)
  // [coverage retrofit] — updated field name
  test("PROP-HSF-007: cancel-switch (valid) → EditingState has no pendingNextFocus field", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-nf"));
    const state = makeSaveFailedState({
      currentNoteId: makeNoteId("note-A"),
      pendingNextFocus,
    });
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "cancel-switch" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();
    const ports = makePorts(spy, clock);

    const result = await runHandleSaveFailurePipeline(stage, state, decision, ports);

    expect("pendingNextFocus" in result.nextSessionState).toBe(false);
    expect("pendingNextNoteId" in result.nextSessionState).toBe(false);
  });

  // ── REQ-HSF-006: cancel-switch (invalid — no pendingNextFocus) ───────────

  // [genuine red] — error detail string changed to "cancel-switch requires pendingNextFocus"
  test("cancel-switch (invalid, no pending) → Promise.reject with invariant-violated SaveError [genuine red]", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "cancel-switch" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();
    const ports = makePorts(spy, clock);

    await expect(
      runHandleSaveFailurePipeline(stage, state, decision, ports)
    ).rejects.toMatchObject({
      kind: "validation",
      reason: { kind: "invariant-violated" },
    });

    // No event emitted
    expect(spy.events).toHaveLength(0);

    // Clock.now() called exactly 0 times (guard fires before timestamp acquisition)
    expect(clock.getCallCount()).toBe(0);
  });

  // [genuine red] — error detail must use new string
  test("cancel-switch (invalid) → error.reason.detail === 'cancel-switch requires pendingNextFocus' [genuine red]", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "cancel-switch" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();
    const ports = makePorts(spy, clock);

    const error = await runHandleSaveFailurePipeline(stage, state, decision, ports).catch((e) => e);
    expect(error.reason.detail).toBe("cancel-switch requires pendingNextFocus");
  });

  // ── REQ-HSF-001: non-save-failed state → invariant violation ────────────

  // [coverage retrofit]
  test("non-save-failed state (editing) → Promise.reject with invariant-violated SaveError", async () => {
    const editingState: unknown = {
      status: "editing",
      currentNoteId: makeNoteId("note-A"),
      focusedBlockId: null,
      isDirty: true,
      lastInputAt: null,
      idleTimerHandle: null,
      lastSaveResult: null,
    };
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "retry-save" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();
    const ports = makePorts(spy, clock);

    await expect(
      runHandleSaveFailurePipeline(
        stage,
        editingState as SaveFailedState,
        decision,
        ports,
      )
    ).rejects.toMatchObject({
      kind: "validation",
      reason: { kind: "invariant-violated" },
    });

    expect(spy.events).toHaveLength(0);
  });

  // ── REQ-HSF-008: at most one event per invocation ────────────────────────

  // [coverage retrofit]
  test("retry-save emits exactly 1 event (RetrySaveRequested)", async () => {
    const state = makeSaveFailedState();
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "retry-save" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    await runHandleSaveFailurePipeline(stage, state, decision, makePorts(spy, clock));
    expect(spy.events).toHaveLength(1);
    expect(spy.events[0].kind).toBe("retry-save-requested");
  });

  // [coverage retrofit]
  test("discard (no pending) emits exactly 1 event (EditingSessionDiscarded)", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "discard-current-session" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    await runHandleSaveFailurePipeline(stage, state, decision, makePorts(spy, clock));
    expect(spy.events).toHaveLength(1);
    expect(spy.events[0].kind).toBe("editing-session-discarded");
  });

  // [coverage retrofit]
  test("discard (with pending) emits exactly 1 event (EditingSessionDiscarded)", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-ev"));
    const state = makeSaveFailedState({ pendingNextFocus });
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "discard-current-session" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    await runHandleSaveFailurePipeline(stage, state, decision, makePorts(spy, clock));
    expect(spy.events).toHaveLength(1);
    expect(spy.events[0].kind).toBe("editing-session-discarded");
  });

  // [coverage retrofit]
  test("cancel-switch (valid) emits zero events", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-ev2"));
    const state = makeSaveFailedState({ pendingNextFocus });
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "cancel-switch" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    await runHandleSaveFailurePipeline(stage, state, decision, makePorts(spy, clock));
    expect(spy.events).toHaveLength(0);
  });

  // ── REQ-HSF-009: Clock.now() budget ─────────────────────────────────────

  // [coverage retrofit]
  test("Clock.now() called exactly once on retry-save branch", async () => {
    const state = makeSaveFailedState();
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEventSpy();

    await runHandleSaveFailurePipeline(stage, state, { kind: "retry-save" }, makePorts(spy, clock));
    expect(clock.getCallCount()).toBe(1);
  });

  // [coverage retrofit]
  test("Clock.now() called exactly once on discard (no pending) branch", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEventSpy();

    await runHandleSaveFailurePipeline(stage, state, { kind: "discard-current-session" }, makePorts(spy, clock));
    expect(clock.getCallCount()).toBe(1);
  });

  // [coverage retrofit]
  test("Clock.now() called exactly once on discard (with pending) branch", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-ck"));
    const state = makeSaveFailedState({ pendingNextFocus });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEventSpy();

    await runHandleSaveFailurePipeline(stage, state, { kind: "discard-current-session" }, makePorts(spy, clock));
    expect(clock.getCallCount()).toBe(1);
  });

  // [coverage retrofit]
  test("Clock.now() called exactly once on cancel-switch (valid) branch", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-ck2"));
    const state = makeSaveFailedState({ pendingNextFocus });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEventSpy();

    await runHandleSaveFailurePipeline(stage, state, { kind: "cancel-switch" }, makePorts(spy, clock));
    expect(clock.getCallCount()).toBe(1);
  });

  // [coverage retrofit]
  test("Clock.now() called exactly 0 times on cancel-switch (invalid) branch", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEventSpy();

    await expect(
      runHandleSaveFailurePipeline(stage, state, { kind: "cancel-switch" }, makePorts(spy, clock))
    ).rejects.toBeDefined();
    expect(clock.getCallCount()).toBe(0);
  });

  // ── REQ-HSF-010: ResolvedState shape ────────────────────────────────────

  // [coverage retrofit]
  test("retry-save → ResolvedState.kind='ResolvedState', resolution='retried'", async () => {
    const state = makeSaveFailedState();
    const stage = makeSaveFailedStage();
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    const result = await runHandleSaveFailurePipeline(stage, state, { kind: "retry-save" }, makePorts(spy, clock));
    expect(result.resolvedState.kind).toBe("ResolvedState");
    expect(result.resolvedState.resolution).toBe("retried");
  });

  // [coverage retrofit]
  test("discard (no pending) → ResolvedState.resolution='discarded'", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
    const stage = makeSaveFailedStage();
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    const result = await runHandleSaveFailurePipeline(stage, state, { kind: "discard-current-session" }, makePorts(spy, clock));
    expect(result.resolvedState.resolution).toBe("discarded");
  });

  // [coverage retrofit]
  test("discard (with pending) → ResolvedState.resolution='discarded'", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-rs"));
    const state = makeSaveFailedState({ pendingNextFocus });
    const stage = makeSaveFailedStage();
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    const result = await runHandleSaveFailurePipeline(stage, state, { kind: "discard-current-session" }, makePorts(spy, clock));
    expect(result.resolvedState.resolution).toBe("discarded");
  });

  // [coverage retrofit]
  test("cancel-switch (valid) → ResolvedState.resolution='cancelled'", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-rs2"));
    const state = makeSaveFailedState({ pendingNextFocus });
    const stage = makeSaveFailedStage();
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    const result = await runHandleSaveFailurePipeline(stage, state, { kind: "cancel-switch" }, makePorts(spy, clock));
    expect(result.resolvedState.resolution).toBe("cancelled");
  });

  // ── PROP-HSF-008: no error field in any emitted event (REQ-HSF-012) ──────

  // [coverage retrofit]
  test("retry-save with error-carrying stage → emitted event has no error field", async () => {
    const stage: SaveFailedStage = {
      kind: "SaveFailedStage",
      noteId: makeNoteId("note-A"),
      error: { kind: "fs", reason: { kind: "disk-full" } },
    };
    const state = makeSaveFailedState();
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    await runHandleSaveFailurePipeline(stage, state, { kind: "retry-save" }, makePorts(spy, clock));

    expect(spy.events).toHaveLength(1);
    expect("error" in spy.events[0]).toBe(false);
  });

  // [coverage retrofit]
  test("discard with error-carrying stage → emitted event has no error field", async () => {
    const stage: SaveFailedStage = {
      kind: "SaveFailedStage",
      noteId: makeNoteId("note-A"),
      error: { kind: "fs", reason: { kind: "permission", path: "/vault/test.md" } },
    };
    const state = makeSaveFailedState({ pendingNextFocus: null });
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    await runHandleSaveFailurePipeline(stage, state, { kind: "discard-current-session" }, makePorts(spy, clock));

    expect(spy.events).toHaveLength(1);
    expect("error" in spy.events[0]).toBe(false);
  });
});
