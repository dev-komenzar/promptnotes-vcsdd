/**
 * discard-current-session.test.ts — Unit tests for discard-current-session branch
 *
 * REQ-HSF-003: Branch — DiscardCurrentSession without pendingNextNoteId
 * REQ-HSF-004: Branch — DiscardCurrentSession with pendingNextNoteId
 * PROP-HSF-003: discard routing (null → idle; non-null → editing with pendingNextNoteId)
 * PROP-HSF-006: pendingNextNoteId routing — discard with pending (all 6 EditingState fields)
 * PROP-HSF-008: pendingNextNoteId never leaks into emitted event
 * PROP-HSF-010: Exactly-one event constraint — discard branch
 * PROP-HSF-013: Clock.now() call count — valid branches
 * PROP-HSF-015: Timestamp reuse — discard branch
 */

import { describe, test, expect } from "bun:test";
import type {
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type {
  SaveFailedState,
  EditingState,
  IdleState,
} from "promptnotes-domain-types/capture/states";
import type {
  SaveFailedStage,
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

function makeSaveFailedState(opts?: {
  currentNoteId?: NoteId;
  pendingNextNoteId?: NoteId | null;
}): SaveFailedState {
  return {
    status: "save-failed" as const,
    currentNoteId: opts?.currentNoteId ?? makeNoteId("note-A"),
    pendingNextNoteId: opts?.pendingNextNoteId ?? null,
    lastSaveError: {
      kind: "fs" as const,
      reason: { kind: "unknown" as const, detail: "test" },
    },
  };
}

function makeSaveFailedStage(noteId?: NoteId): SaveFailedStage {
  return {
    kind: "SaveFailedStage" as const,
    noteId: noteId ?? makeNoteId("note-A"),
    error: { kind: "fs" as const, reason: { kind: "disk-full" as const } },
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

function makeEmitSpy() {
  const events: CaptureInternalEvent[] = [];
  return {
    emit: (e: CaptureInternalEvent) => { events.push(e); },
    events,
  };
}

function makePorts(
  spy: ReturnType<typeof makeEmitSpy>,
  clock: ReturnType<typeof makeClockSpy>,
): HandleSaveFailurePorts {
  return { clockNow: clock.clockNow, emit: spy.emit };
}

// ── Tests — discard without pendingNextNoteId (REQ-HSF-003) ──────────────

describe("discard-current-session (no pendingNextNoteId)", () => {

  // PROP-HSF-003: null pending → IdleState
  test("PROP-HSF-003: pendingNextNoteId=null → IdleState with status='idle'", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "discard-current-session" },
      makePorts(spy, clock),
    );

    const nextState = result.nextSessionState as IdleState;
    expect(nextState.status).toBe("idle");
  });

  // REQ-HSF-003 AC: EditingSessionDiscarded emitted exactly once
  // PROP-HSF-010
  test("PROP-HSF-010: discard (no pending) → exactly one EditingSessionDiscarded emitted", async () => {
    const currentNoteId = makeNoteId("note-A");
    const state = makeSaveFailedState({ currentNoteId, pendingNextNoteId: null });
    const stage = makeSaveFailedStage(currentNoteId);
    const clock = makeClockSpy(3000);
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "discard-current-session" },
      makePorts(spy, clock),
    );

    expect(spy.events).toHaveLength(1);
    const event = spy.events[0];
    expect(event.kind).toBe("editing-session-discarded");
    expect(event.noteId).toBe(currentNoteId);
  });

  // PROP-HSF-015: occurredOn equals Clock.now() value
  test("PROP-HSF-015: discard (no pending) → EditingSessionDiscarded.occurredOn === Clock.now()", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy(55555);
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "discard-current-session" },
      makePorts(spy, clock),
    );

    expect(spy.events[0].occurredOn).toBe(clock.fixedNow);
  });

  // PROP-HSF-013: Clock.now() called exactly once
  test("PROP-HSF-013: discard (no pending) → Clock.now() called exactly once", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "discard-current-session" },
      makePorts(spy, clock),
    );

    expect(clock.getCallCount()).toBe(1);
  });

  // REQ-HSF-003 AC: ResolvedState.resolution === 'discarded'
  test("discard (no pending) → ResolvedState.resolution === 'discarded'", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "discard-current-session" },
      makePorts(spy, clock),
    );

    expect(result.resolvedState.resolution).toBe("discarded");
  });

  // REQ-HSF-012: no error field in emitted event
  test("discard (no pending) → EditingSessionDiscarded has no error field", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "discard-current-session" },
      makePorts(spy, clock),
    );

    expect("error" in spy.events[0]).toBe(false);
  });
});

// ── Tests — discard with pendingNextNoteId (REQ-HSF-004) ─────────────────

describe("discard-current-session (with pendingNextNoteId)", () => {

  // PROP-HSF-003: non-null pending → EditingState for pendingNextNoteId
  test("PROP-HSF-003: pendingNextNoteId non-null → EditingState.currentNoteId === pendingNextNoteId", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNextNoteId = makeNoteId("note-B");
    const state = makeSaveFailedState({ currentNoteId, pendingNextNoteId });
    const stage = makeSaveFailedStage(currentNoteId);
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "discard-current-session" },
      makePorts(spy, clock),
    );

    const nextState = result.nextSessionState as EditingState;
    expect(nextState.status).toBe("editing");
    expect(nextState.currentNoteId).toBe(pendingNextNoteId);
  });

  // REQ-HSF-004 AC: all 6 EditingState fields
  // PROP-HSF-006
  test("PROP-HSF-006: discard (with pending) → all 6 EditingState fields correct", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNextNoteId = makeNoteId("note-B");
    const state = makeSaveFailedState({ currentNoteId, pendingNextNoteId });
    const stage = makeSaveFailedStage(currentNoteId);
    const clock = makeClockSpy(9000);
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "discard-current-session" },
      makePorts(spy, clock),
    );

    const nextState = result.nextSessionState as EditingState;
    expect(nextState.status).toBe("editing");
    expect(nextState.currentNoteId).toBe(pendingNextNoteId);
    expect(nextState.isDirty).toBe(false);       // fresh session
    expect(nextState.lastInputAt).toBeNull();    // fresh session
    expect(nextState.idleTimerHandle).toBeNull(); // no timer
    expect(nextState.lastSaveResult).toBeNull(); // fresh session
  });

  // REQ-HSF-004 AC: event carries currentNoteId (the discarded note), not pendingNextNoteId
  // PROP-HSF-008: pendingNextNoteId never leaks
  test("PROP-HSF-008: discard (with pending) → event.noteId is currentNoteId, not pendingNextNoteId", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNextNoteId = makeNoteId("note-B");
    const state = makeSaveFailedState({ currentNoteId, pendingNextNoteId });
    const stage = makeSaveFailedStage(currentNoteId);
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "discard-current-session" },
      makePorts(spy, clock),
    );

    expect(spy.events).toHaveLength(1);
    const event = spy.events[0];
    expect(event.kind).toBe("editing-session-discarded");
    expect(event.noteId).toBe(currentNoteId);
    expect(event.noteId).not.toBe(pendingNextNoteId);
    // pendingNextNoteId must not appear in event payload at all
    expect("pendingNextNoteId" in event).toBe(false);
  });

  // PROP-HSF-010: exactly one event on discard-with-pending
  test("PROP-HSF-010: discard (with pending) → exactly one EditingSessionDiscarded emitted", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "discard-current-session" },
      makePorts(spy, clock),
    );

    expect(spy.events).toHaveLength(1);
    expect(spy.events[0].kind).toBe("editing-session-discarded");
  });

  // PROP-HSF-013: Clock.now() called exactly once
  test("PROP-HSF-013: discard (with pending) → Clock.now() called exactly once", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "discard-current-session" },
      makePorts(spy, clock),
    );

    expect(clock.getCallCount()).toBe(1);
  });

  // PROP-HSF-015: occurredOn equals Clock.now() value
  test("PROP-HSF-015: discard (with pending) → EditingSessionDiscarded.occurredOn === Clock.now()", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy(44444);
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "discard-current-session" },
      makePorts(spy, clock),
    );

    expect(spy.events[0].occurredOn).toBe(clock.fixedNow);
  });

  // REQ-HSF-004 AC: ResolvedState.resolution === 'discarded'
  test("discard (with pending) → ResolvedState.resolution === 'discarded'", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "discard-current-session" },
      makePorts(spy, clock),
    );

    expect(result.resolvedState.resolution).toBe("discarded");
  });

  // REQ-HSF-004: same resolution for both sub-cases (no-pending and with-pending)
  test("both discard sub-cases produce resolution='discarded'", async () => {
    const stage = makeSaveFailedStage();
    const clock1 = makeClockSpy();
    const clock2 = makeClockSpy();
    const spy1 = makeEmitSpy();
    const spy2 = makeEmitSpy();

    const resultNoPending = await runHandleSaveFailurePipeline(
      stage,
      makeSaveFailedState({ pendingNextNoteId: null }),
      { kind: "discard-current-session" },
      { clockNow: clock1.clockNow, emit: spy1.emit },
    );

    const resultWithPending = await runHandleSaveFailurePipeline(
      stage,
      makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") }),
      { kind: "discard-current-session" },
      { clockNow: clock2.clockNow, emit: spy2.emit },
    );

    expect(resultNoPending.resolvedState.resolution).toBe("discarded");
    expect(resultWithPending.resolvedState.resolution).toBe("discarded");
  });
});
