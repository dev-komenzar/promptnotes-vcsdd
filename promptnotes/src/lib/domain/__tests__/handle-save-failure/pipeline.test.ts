/**
 * pipeline.test.ts — HandleSaveFailure full pipeline integration tests
 *
 * REQ-HSF-001: Precondition — input must be SaveFailedState
 * REQ-HSF-002: Branch — RetrySave
 * REQ-HSF-003: Branch — DiscardCurrentSession without pendingNextNoteId
 * REQ-HSF-004: Branch — DiscardCurrentSession with pendingNextNoteId
 * REQ-HSF-005: Branch — CancelSwitch (valid: pendingNextNoteId present)
 * REQ-HSF-006: Branch — CancelSwitch invalid when no pendingNextNoteId
 * REQ-HSF-007: UserDecision exhaustiveness
 * REQ-HSF-008: At most one event per invocation
 * REQ-HSF-009: Clock.now() budget
 * REQ-HSF-010: ResolvedState shape
 * REQ-HSF-011: Workflow type signature — widened input contract
 * REQ-HSF-012: SaveFailedStage.error is for logging only
 *
 * PROP-HSF-006: pendingNextNoteId routing — discard with pending
 * PROP-HSF-007: pendingNextNoteId routing — cancel-switch
 * PROP-HSF-008: pendingNextNoteId never leaks into emitted event
 * PROP-HSF-009: Exactly-one event constraint — retry branch
 * PROP-HSF-010: Exactly-one event constraint — discard branch
 * PROP-HSF-011: Zero events — cancel-switch valid branch
 * PROP-HSF-012: Cancel-switch invalid guard
 * PROP-HSF-013: Clock.now() call count — valid branches
 * PROP-HSF-014: Timestamp reuse — retry branch
 * PROP-HSF-015: Timestamp reuse — discard branch
 * PROP-HSF-017: ResolvedState shape per branch
 * PROP-HSF-018: Full integration — all four valid branches
 */

import { describe, test, expect } from "bun:test";
import type {
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type {
  SaveFailedState,
  EditingState,
  IdleState,
  SavingState,
} from "promptnotes-domain-types/capture/states";
import type {
  SaveFailedStage,
  UserDecision,
  ResolvedState,
} from "promptnotes-domain-types/capture/stages";
import type { CaptureInternalEvent } from "promptnotes-domain-types/capture/internal-events";

import {
  runHandleSaveFailurePipeline,
  type HandleSaveFailurePorts,
} from "../../handle-save-failure/pipeline.js";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makeSaveError(): SaveError {
  return {
    kind: "fs" as const,
    reason: { kind: "unknown" as const, detail: "disk error" },
  };
}

function makeSaveFailedState(opts?: {
  currentNoteId?: NoteId;
  pendingNextNoteId?: NoteId | null;
  lastSaveError?: SaveError;
}): SaveFailedState {
  return {
    status: "save-failed" as const,
    currentNoteId: opts?.currentNoteId ?? makeNoteId("note-A"),
    pendingNextNoteId: opts?.pendingNextNoteId ?? null,
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
    const event = spy.events[0];
    expect(event.kind).toBe("retry-save-requested");
    expect(event.noteId).toBe(currentNoteId);
    expect(event.occurredOn).toBe(clock.fixedNow);

    // Clock.now() called exactly once
    expect(clock.getCallCount()).toBe(1);
  });

  // REQ-HSF-002: no error field in event (REQ-HSF-012)
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

  // REQ-HSF-002: pendingNextNoteId non-null case — retry proceeds normally
  test("retry-save with pendingNextNoteId → SavingState, normal retry", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingId = makeNoteId("note-B");
    const state = makeSaveFailedState({ currentNoteId, pendingNextNoteId: pendingId });
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

  // ── REQ-HSF-003: discard without pendingNextNoteId ───────────────────────

  test("discard (no pending) → IdleState, EditingSessionDiscarded emitted, resolution='discarded'", async () => {
    const currentNoteId = makeNoteId("note-A");
    const state = makeSaveFailedState({ currentNoteId, pendingNextNoteId: null });
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
    const event = spy.events[0];
    expect(event.kind).toBe("editing-session-discarded");
    expect(event.noteId).toBe(currentNoteId);
    expect(event.occurredOn).toBe(clock.fixedNow);

    // Clock.now() called exactly once
    expect(clock.getCallCount()).toBe(1);
  });

  // REQ-HSF-003: no error field in event (REQ-HSF-012)
  test("discard (no pending) → EditingSessionDiscarded has no error field", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
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
  test("discard (no pending) → EditingSessionDiscarded.occurredOn equals Clock.now() value", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "discard-current-session" };
    const spy = makeEventSpy();
    const clock = makeClockSpy(77777);
    const ports = makePorts(spy, clock);

    await runHandleSaveFailurePipeline(stage, state, decision, ports);

    expect(spy.events[0].occurredOn).toBe(clock.fixedNow);
  });

  // ── REQ-HSF-004: discard with pendingNextNoteId ──────────────────────────

  test("discard (with pending) → EditingState for pending note, all 6 fields, resolution='discarded'", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNextNoteId = makeNoteId("note-B");
    const state = makeSaveFailedState({ currentNoteId, pendingNextNoteId });
    const stage = makeSaveFailedStage({ noteId: currentNoteId });
    const decision: UserDecision = { kind: "discard-current-session" };
    const spy = makeEventSpy();
    const clock = makeClockSpy(3000);
    const ports = makePorts(spy, clock);

    const result = await runHandleSaveFailurePipeline(stage, state, decision, ports);

    // ResolvedState
    expect(result.resolvedState.kind).toBe("ResolvedState");
    expect(result.resolvedState.resolution).toBe("discarded");

    // nextSessionState must be EditingState for the pending note — all 6 fields
    const nextState = result.nextSessionState as EditingState;
    expect(nextState.status).toBe("editing");
    expect(nextState.currentNoteId).toBe(pendingNextNoteId);  // transitioned to pending
    expect(nextState.isDirty).toBe(false);                    // fresh session
    expect(nextState.lastInputAt).toBeNull();                 // fresh session
    expect(nextState.idleTimerHandle).toBeNull();             // no timer running
    expect(nextState.lastSaveResult).toBeNull();              // fresh session

    // Exactly one event: EditingSessionDiscarded with currentNoteId (not pendingNextNoteId)
    expect(spy.events).toHaveLength(1);
    const event = spy.events[0];
    expect(event.kind).toBe("editing-session-discarded");
    expect(event.noteId).toBe(currentNoteId);                 // discarded note
    expect(event.occurredOn).toBe(clock.fixedNow);

    // Clock.now() called exactly once
    expect(clock.getCallCount()).toBe(1);
  });

  // PROP-HSF-006: pendingNextNoteId does not appear in event payload
  test("discard (with pending) → event.noteId is currentNoteId, not pendingNextNoteId", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNextNoteId = makeNoteId("note-B");
    const state = makeSaveFailedState({ currentNoteId, pendingNextNoteId });
    const stage = makeSaveFailedStage({ noteId: currentNoteId });
    const decision: UserDecision = { kind: "discard-current-session" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();
    const ports = makePorts(spy, clock);

    await runHandleSaveFailurePipeline(stage, state, decision, ports);

    expect(spy.events[0].noteId).toBe(currentNoteId);
    expect(spy.events[0].noteId).not.toBe(pendingNextNoteId);
    // pendingNextNoteId must not appear in event payload
    expect("pendingNextNoteId" in spy.events[0]).toBe(false);
  });

  // PROP-HSF-015: timestamp reuse on discard (with pending)
  test("discard (with pending) → EditingSessionDiscarded.occurredOn equals Clock.now() value", async () => {
    const state = makeSaveFailedState({
      currentNoteId: makeNoteId("note-A"),
      pendingNextNoteId: makeNoteId("note-B"),
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

  test("cancel-switch (valid) → EditingState for current note, all 6 fields, no event, resolution='cancelled'", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNextNoteId = makeNoteId("note-B");
    const state = makeSaveFailedState({ currentNoteId, pendingNextNoteId });
    const stage = makeSaveFailedStage({ noteId: currentNoteId });
    const decision: UserDecision = { kind: "cancel-switch" };
    const spy = makeEventSpy();
    const clock = makeClockSpy(4000);
    const ports = makePorts(spy, clock);

    const result = await runHandleSaveFailurePipeline(stage, state, decision, ports);

    // ResolvedState
    expect(result.resolvedState.kind).toBe("ResolvedState");
    expect(result.resolvedState.resolution).toBe("cancelled");

    // nextSessionState must be EditingState for current note — all 6 fields
    const nextState = result.nextSessionState as EditingState;
    expect(nextState.status).toBe("editing");
    expect(nextState.currentNoteId).toBe(currentNoteId);   // same note
    expect(nextState.isDirty).toBe(true);                   // unsaved content retained
    expect(nextState.lastInputAt).toBeNull();               // restoration moment
    expect(nextState.idleTimerHandle).toBeNull();           // no timer at restoration
    expect(nextState.lastSaveResult).toBe("failed");        // last save did not succeed

    // No event emitted
    expect(spy.events).toHaveLength(0);

    // Clock.now() called exactly once (for the transition's now parameter)
    expect(clock.getCallCount()).toBe(1);
  });

  // PROP-HSF-007: pendingNextNoteId absent from EditingState
  test("cancel-switch (valid) → EditingState has no pendingNextNoteId field", async () => {
    const state = makeSaveFailedState({
      currentNoteId: makeNoteId("note-A"),
      pendingNextNoteId: makeNoteId("note-B"),
    });
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "cancel-switch" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();
    const ports = makePorts(spy, clock);

    const result = await runHandleSaveFailurePipeline(stage, state, decision, ports);

    expect("pendingNextNoteId" in result.nextSessionState).toBe(false);
  });

  // ── REQ-HSF-006: cancel-switch (invalid — no pendingNextNoteId) ──────────

  test("cancel-switch (invalid, no pending) → Promise.reject with invariant-violated SaveError", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
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

  // ── REQ-HSF-001: non-save-failed state → invariant violation ────────────

  test("non-save-failed state (editing) → Promise.reject with invariant-violated SaveError", async () => {
    const editingState: unknown = {
      status: "editing",
      currentNoteId: makeNoteId("note-A"),
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

  test("discard (no pending) emits exactly 1 event (EditingSessionDiscarded)", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "discard-current-session" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    await runHandleSaveFailurePipeline(stage, state, decision, makePorts(spy, clock));
    expect(spy.events).toHaveLength(1);
    expect(spy.events[0].kind).toBe("editing-session-discarded");
  });

  test("discard (with pending) emits exactly 1 event (EditingSessionDiscarded)", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "discard-current-session" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    await runHandleSaveFailurePipeline(stage, state, decision, makePorts(spy, clock));
    expect(spy.events).toHaveLength(1);
    expect(spy.events[0].kind).toBe("editing-session-discarded");
  });

  test("cancel-switch (valid) emits zero events", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const decision: UserDecision = { kind: "cancel-switch" };
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    await runHandleSaveFailurePipeline(stage, state, decision, makePorts(spy, clock));
    expect(spy.events).toHaveLength(0);
  });

  // ── REQ-HSF-009: Clock.now() budget ─────────────────────────────────────

  test("Clock.now() called exactly once on retry-save branch", async () => {
    const state = makeSaveFailedState();
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEventSpy();

    await runHandleSaveFailurePipeline(stage, state, { kind: "retry-save" }, makePorts(spy, clock));
    expect(clock.getCallCount()).toBe(1);
  });

  test("Clock.now() called exactly once on discard (no pending) branch", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEventSpy();

    await runHandleSaveFailurePipeline(stage, state, { kind: "discard-current-session" }, makePorts(spy, clock));
    expect(clock.getCallCount()).toBe(1);
  });

  test("Clock.now() called exactly once on discard (with pending) branch", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEventSpy();

    await runHandleSaveFailurePipeline(stage, state, { kind: "discard-current-session" }, makePorts(spy, clock));
    expect(clock.getCallCount()).toBe(1);
  });

  test("Clock.now() called exactly once on cancel-switch (valid) branch", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEventSpy();

    await runHandleSaveFailurePipeline(stage, state, { kind: "cancel-switch" }, makePorts(spy, clock));
    expect(clock.getCallCount()).toBe(1);
  });

  test("Clock.now() called exactly 0 times on cancel-switch (invalid) branch", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEventSpy();

    await expect(
      runHandleSaveFailurePipeline(stage, state, { kind: "cancel-switch" }, makePorts(spy, clock))
    ).rejects.toBeDefined();
    expect(clock.getCallCount()).toBe(0);
  });

  // ── REQ-HSF-010: ResolvedState shape ────────────────────────────────────

  test("retry-save → ResolvedState.kind='ResolvedState', resolution='retried'", async () => {
    const state = makeSaveFailedState();
    const stage = makeSaveFailedStage();
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    const result = await runHandleSaveFailurePipeline(stage, state, { kind: "retry-save" }, makePorts(spy, clock));
    expect(result.resolvedState.kind).toBe("ResolvedState");
    expect(result.resolvedState.resolution).toBe("retried");
  });

  test("discard (no pending) → ResolvedState.resolution='discarded'", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    const result = await runHandleSaveFailurePipeline(stage, state, { kind: "discard-current-session" }, makePorts(spy, clock));
    expect(result.resolvedState.resolution).toBe("discarded");
  });

  test("discard (with pending) → ResolvedState.resolution='discarded'", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    const result = await runHandleSaveFailurePipeline(stage, state, { kind: "discard-current-session" }, makePorts(spy, clock));
    expect(result.resolvedState.resolution).toBe("discarded");
  });

  test("cancel-switch (valid) → ResolvedState.resolution='cancelled'", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    const result = await runHandleSaveFailurePipeline(stage, state, { kind: "cancel-switch" }, makePorts(spy, clock));
    expect(result.resolvedState.resolution).toBe("cancelled");
  });

  // ── PROP-HSF-008: no error field in any emitted event (REQ-HSF-012) ──────

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

  test("discard with error-carrying stage → emitted event has no error field", async () => {
    const stage: SaveFailedStage = {
      kind: "SaveFailedStage",
      noteId: makeNoteId("note-A"),
      error: { kind: "fs", reason: { kind: "permission", path: "/vault/test.md" } },
    };
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const spy = makeEventSpy();
    const clock = makeClockSpy();

    await runHandleSaveFailurePipeline(stage, state, { kind: "discard-current-session" }, makePorts(spy, clock));

    expect(spy.events).toHaveLength(1);
    expect("error" in spy.events[0]).toBe(false);
  });
});
