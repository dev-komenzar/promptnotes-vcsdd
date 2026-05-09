/**
 * discard-current-session.test.ts — Unit tests for discard-current-session branch
 *
 * Sprint-2 (block migration) — coverage retrofit + genuine red
 *
 * REQ-HSF-003: Branch — DiscardCurrentSession without pendingNextFocus
 *   [coverage retrofit] — fixture renamed; behavior unchanged
 * REQ-HSF-004: Branch — DiscardCurrentSession with pendingNextFocus
 *   [genuine red] — 7-field assertion (focusedBlockId === pendingNextFocus.blockId) cannot pass
 * PROP-HSF-003: discard routing (null → idle; non-null → editing with pendingNextFocus)
 *   [genuine red] — focusedBlockId field is new; old impl produces 6-field EditingState
 * PROP-HSF-006: pendingNextFocus routing — discard with pending (all 7 EditingState fields)
 *   [genuine red] — new focusedBlockId assertion; old impl returns 6-field object
 * PROP-HSF-008: pendingNextFocus never leaks into emitted event; no blockId in event
 *   [genuine red] — extended to assert absence of pendingNextFocus + blockId
 * PROP-HSF-010: Exactly-one event constraint — discard branch
 *   [coverage retrofit] — fixture renamed; behavior unchanged
 * PROP-HSF-013: Clock.now() call count — valid branches
 *   [coverage retrofit] — fixture renamed; behavior unchanged
 * PROP-HSF-015: Timestamp reuse — discard branch
 *   [coverage retrofit] — fixture renamed; behavior unchanged
 */

import { describe, test, expect } from "bun:test";
import type {
  NoteId,
  BlockId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type {
  SaveFailedState,
  EditingState,
  IdleState,
  PendingNextFocus,
} from "promptnotes-domain-types/capture/states";
import type {
  SaveFailedStage,
} from "promptnotes-domain-types/capture/stages";
import type {
  CaptureInternalEvent,
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

function makeSaveFailedState(opts?: {
  currentNoteId?: NoteId;
  pendingNextFocus?: PendingNextFocus | null;
}): SaveFailedState {
  return {
    status: "save-failed" as const,
    currentNoteId: opts?.currentNoteId ?? makeNoteId("note-A"),
    pendingNextFocus: opts?.pendingNextFocus ?? null,
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

// ── Tests — discard without pendingNextFocus (REQ-HSF-003) ───────────────

describe("discard-current-session (no pendingNextFocus)", () => {

  // PROP-HSF-003: null pending → IdleState
  // [coverage retrofit]
  test("PROP-HSF-003: pendingNextFocus=null → IdleState with status='idle'", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
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
  // [coverage retrofit]
  test("PROP-HSF-010: discard (no pending) → exactly one EditingSessionDiscarded emitted", async () => {
    const currentNoteId = makeNoteId("note-A");
    const state = makeSaveFailedState({ currentNoteId, pendingNextFocus: null });
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
    const event = spy.events[0] as EditingSessionDiscarded;
    expect(event.kind).toBe("editing-session-discarded");
    expect(event.noteId).toBe(currentNoteId);
  });

  // PROP-HSF-015: occurredOn equals Clock.now() value
  // [coverage retrofit]
  test("PROP-HSF-015: discard (no pending) → EditingSessionDiscarded.occurredOn === Clock.now()", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
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
  // [coverage retrofit]
  test("PROP-HSF-013: discard (no pending) → Clock.now() called exactly once", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
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
  // [coverage retrofit]
  test("discard (no pending) → ResolvedState.resolution === 'discarded'", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
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
  // [coverage retrofit]
  test("discard (no pending) → EditingSessionDiscarded has no error field", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
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

  // PROP-HSF-008: emitted event must not carry pendingNextFocus or blockId
  // [genuine red] — extended assertion per sprint-2 spec
  test("PROP-HSF-008: discard (no pending) → event has no pendingNextFocus or blockId fields [genuine red]", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
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
    const event = spy.events[0];
    expect("pendingNextFocus" in event).toBe(false);
    expect("blockId" in event).toBe(false);
    expect("pendingNextNoteId" in event).toBe(false);
  });
});

// ── Tests — discard with pendingNextFocus (REQ-HSF-004) ──────────────────

describe("discard-current-session (with pendingNextFocus)", () => {

  // PROP-HSF-003: non-null pending → EditingState for pendingNextFocus.noteId
  // [genuine red] — focusedBlockId field required in result
  test("PROP-HSF-003: pendingNextFocus non-null → EditingState.currentNoteId === pendingNextFocus.noteId [genuine red]", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNoteId = makeNoteId("note-B");
    const pendingBlockId = makeBlockId("block-pending-1");
    const pendingNextFocus = makePendingNextFocus(pendingNoteId, pendingBlockId);
    const state = makeSaveFailedState({ currentNoteId, pendingNextFocus });
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
    expect(nextState.currentNoteId).toBe(pendingNoteId);
  });

  // REQ-HSF-004 AC: all 7 EditingState fields
  // PROP-HSF-006
  // [genuine red] — focusedBlockId === pendingNextFocus.blockId is new; old impl returns 6 fields
  test("PROP-HSF-006: discard (with pending) → all 7 EditingState fields correct [genuine red]", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNoteId = makeNoteId("note-B");
    const pendingBlockId = makeBlockId("block-pending-2");
    const pendingNextFocus = makePendingNextFocus(pendingNoteId, pendingBlockId);
    const state = makeSaveFailedState({ currentNoteId, pendingNextFocus });
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
    expect(nextState.currentNoteId).toBe(pendingNoteId);
    // REQ-HSF-004 NEW: focusedBlockId === state.pendingNextFocus.blockId
    expect(nextState.focusedBlockId).toBe(pendingBlockId);  // [genuine red]
    expect(nextState.isDirty).toBe(false);                   // fresh session
    expect(nextState.lastInputAt).toBeNull();                // fresh session
    expect(nextState.idleTimerHandle).toBeNull();            // no timer
    expect(nextState.lastSaveResult).toBeNull();             // fresh session
  });

  // REQ-HSF-004: focusedBlockId threads pendingNextFocus.blockId through
  // [genuine red] — standalone assertion for PROP-HSF-022 cross-check
  test("REQ-HSF-004: discard (with pending) → focusedBlockId === pendingNextFocus.blockId [genuine red]", async () => {
    const pendingNoteId = makeNoteId("note-C");
    const pendingBlockId = makeBlockId("block-thread-check");
    const pendingNextFocus = makePendingNextFocus(pendingNoteId, pendingBlockId);
    const state = makeSaveFailedState({ pendingNextFocus });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "discard-current-session" },
      makePorts(spy, clock),
    );

    expect((result.nextSessionState as EditingState).focusedBlockId).toBe(pendingBlockId);
  });

  // REQ-HSF-004 AC: event carries currentNoteId (the discarded note), not pendingNextFocus
  // PROP-HSF-008: pendingNextFocus never leaks into emitted event
  // [genuine red] — extended to also assert absence of blockId and pendingNextFocus in event
  test("PROP-HSF-008: discard (with pending) → event.noteId is currentNoteId; no pendingNextFocus or blockId in event [genuine red]", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNoteId = makeNoteId("note-B");
    const pendingBlockId = makeBlockId("block-leak-check");
    const pendingNextFocus = makePendingNextFocus(pendingNoteId, pendingBlockId);
    const state = makeSaveFailedState({ currentNoteId, pendingNextFocus });
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
    const event = spy.events[0] as EditingSessionDiscarded;
    expect(event.kind).toBe("editing-session-discarded");
    expect(event.noteId).toBe(currentNoteId);
    expect(event.noteId).not.toBe(pendingNoteId);
    // pendingNextFocus must not appear in event payload at all
    expect("pendingNextFocus" in event).toBe(false);
    expect("pendingNextNoteId" in event).toBe(false);
    // blockId must not appear in event payload
    expect("blockId" in event).toBe(false);
  });

  // PROP-HSF-010: exactly one event on discard-with-pending
  // [coverage retrofit]
  test("PROP-HSF-010: discard (with pending) → exactly one EditingSessionDiscarded emitted", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-10"));
    const state = makeSaveFailedState({ pendingNextFocus });
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
  // [coverage retrofit]
  test("PROP-HSF-013: discard (with pending) → Clock.now() called exactly once", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-11"));
    const state = makeSaveFailedState({ pendingNextFocus });
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
  // [coverage retrofit]
  test("PROP-HSF-015: discard (with pending) → EditingSessionDiscarded.occurredOn === Clock.now()", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-12"));
    const state = makeSaveFailedState({ pendingNextFocus });
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
  // [coverage retrofit]
  test("discard (with pending) → ResolvedState.resolution === 'discarded'", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-13"));
    const state = makeSaveFailedState({ pendingNextFocus });
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
  // [coverage retrofit]
  test("both discard sub-cases produce resolution='discarded'", async () => {
    const stage = makeSaveFailedStage();
    const clock1 = makeClockSpy();
    const clock2 = makeClockSpy();
    const spy1 = makeEmitSpy();
    const spy2 = makeEmitSpy();

    const resultNoPending = await runHandleSaveFailurePipeline(
      stage,
      makeSaveFailedState({ pendingNextFocus: null }),
      { kind: "discard-current-session" },
      { clockNow: clock1.clockNow, emit: spy1.emit },
    );

    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-14"));
    const resultWithPending = await runHandleSaveFailurePipeline(
      stage,
      makeSaveFailedState({ pendingNextFocus }),
      { kind: "discard-current-session" },
      { clockNow: clock2.clockNow, emit: spy2.emit },
    );

    expect(resultNoPending.resolvedState.resolution).toBe("discarded");
    expect(resultWithPending.resolvedState.resolution).toBe("discarded");
  });
});
