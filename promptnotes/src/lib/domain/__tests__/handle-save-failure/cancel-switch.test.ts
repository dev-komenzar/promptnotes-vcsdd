/**
 * cancel-switch.test.ts — Unit tests for cancel-switch branch
 *
 * REQ-HSF-005: Branch — CancelSwitch (valid: pendingNextNoteId present)
 * REQ-HSF-006: Branch — CancelSwitch invalid when no pendingNextNoteId
 * PROP-HSF-004: cancelSwitch state shape (all 6 fields)
 * PROP-HSF-007: pendingNextNoteId routing — cancel-switch (no pendingNextNoteId on EditingState)
 * PROP-HSF-011: Zero events — cancel-switch valid branch
 * PROP-HSF-012: Cancel-switch invalid guard
 * PROP-HSF-013: Clock.now() call count — valid branches
 * PROP-HSF-020: Clock.now() call count — cancel-switch invalid branch (0 calls)
 */

import { describe, test, expect } from "bun:test";
import type {
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type {
  SaveFailedState,
  EditingState,
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
      reason: { kind: "lock" as const, path: "/vault/note.md" },
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

// ── Tests — cancel-switch valid (REQ-HSF-005) ─────────────────────────────

describe("cancel-switch (valid — pendingNextNoteId present)", () => {

  // REQ-HSF-005 AC: all 6 EditingState fields
  // PROP-HSF-004
  test("PROP-HSF-004: cancel-switch (valid) → all 6 EditingState fields correct", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNextNoteId = makeNoteId("note-B");
    const state = makeSaveFailedState({ currentNoteId, pendingNextNoteId });
    const stage = makeSaveFailedStage(currentNoteId);
    const clock = makeClockSpy(7000);
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    );

    const nextState = result.nextSessionState as EditingState;
    expect(nextState.status).toBe("editing");
    expect(nextState.currentNoteId).toBe(currentNoteId);   // same note
    expect(nextState.isDirty).toBe(true);                   // unsaved content retained
    expect(nextState.lastInputAt).toBeNull();               // restoration moment
    expect(nextState.idleTimerHandle).toBeNull();           // no timer at restoration
    expect(nextState.lastSaveResult).toBe("failed");        // last save did not succeed
  });

  // REQ-HSF-005 AC: currentNoteId preserved
  test("cancel-switch (valid) → EditingState.currentNoteId === state.currentNoteId", async () => {
    const currentNoteId = makeNoteId("note-2026-05-01-120000-001");
    const state = makeSaveFailedState({ currentNoteId, pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage(currentNoteId);
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    );

    expect((result.nextSessionState as EditingState).currentNoteId).toBe(currentNoteId);
  });

  // REQ-HSF-005 AC: isDirty preserved as true
  test("cancel-switch (valid) → EditingState.isDirty === true (unsaved content retained)", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    );

    expect((result.nextSessionState as EditingState).isDirty).toBe(true);
  });

  // REQ-HSF-005 AC: lastSaveResult === 'failed'
  test("cancel-switch (valid) → EditingState.lastSaveResult === 'failed'", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    );

    expect((result.nextSessionState as EditingState).lastSaveResult).toBe("failed");
  });

  // PROP-HSF-007: pendingNextNoteId absent from resulting EditingState
  test("PROP-HSF-007: cancel-switch (valid) → EditingState has no pendingNextNoteId field", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    );

    expect("pendingNextNoteId" in result.nextSessionState).toBe(false);
  });

  // PROP-HSF-011: zero events emitted on cancel-switch valid
  test("PROP-HSF-011: cancel-switch (valid) → zero events emitted", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    );

    expect(spy.events).toHaveLength(0);
  });

  // PROP-HSF-013: Clock.now() called exactly once
  test("PROP-HSF-013: cancel-switch (valid) → Clock.now() called exactly once", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    );

    expect(clock.getCallCount()).toBe(1);
  });

  // REQ-HSF-005 AC: ResolvedState.resolution === 'cancelled'
  test("cancel-switch (valid) → ResolvedState.resolution === 'cancelled'", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: makeNoteId("note-B") });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    );

    expect(result.resolvedState.resolution).toBe("cancelled");
    expect(result.resolvedState.kind).toBe("ResolvedState");
  });
});

// ── Tests — cancel-switch invalid (REQ-HSF-006) ───────────────────────────

describe("cancel-switch (invalid — pendingNextNoteId is null)", () => {

  // PROP-HSF-012: invariant violation
  test("PROP-HSF-012: pendingNextNoteId=null + cancel-switch → Promise.reject with invariant-violated SaveError", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    await expect(
      runHandleSaveFailurePipeline(
        stage,
        state,
        { kind: "cancel-switch" },
        makePorts(spy, clock),
      )
    ).rejects.toMatchObject({
      kind: "validation",
      reason: { kind: "invariant-violated" },
    });
  });

  // PROP-HSF-012: rejection is a SaveError (validation), not a ResolvedState
  test("cancel-switch (invalid) → rejected Promise (no ResolvedState produced)", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    let resolved = false;
    let rejected = false;

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    ).then(() => { resolved = true; }).catch(() => { rejected = true; });

    expect(resolved).toBe(false);
    expect(rejected).toBe(true);
  });

  // PROP-HSF-012: no event emitted on invalid cancel-switch
  test("cancel-switch (invalid) → zero events emitted", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    ).catch(() => {});

    expect(spy.events).toHaveLength(0);
  });

  // PROP-HSF-020: Clock.now() called exactly 0 times on invalid cancel-switch
  test("PROP-HSF-020: cancel-switch (invalid) → Clock.now() called exactly 0 times", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    ).catch(() => {});

    expect(clock.getCallCount()).toBe(0);
  });

  // REQ-HSF-006: guard fires before any state transition (no transition applied)
  test("cancel-switch (invalid) → no state transition occurs (no nextSessionState)", async () => {
    const state = makeSaveFailedState({ pendingNextNoteId: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const error = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    ).catch((e) => e);

    // The error has no nextSessionState — it's a plain SaveError
    expect(error.kind).toBe("validation");
    expect("nextSessionState" in error).toBe(false);
  });
});
