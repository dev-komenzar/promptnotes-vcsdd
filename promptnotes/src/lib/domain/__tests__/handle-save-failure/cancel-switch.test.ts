/**
 * cancel-switch.test.ts — Unit tests for cancel-switch branch
 *
 * Sprint-2 (block migration) — coverage retrofit + genuine red
 *
 * REQ-HSF-005: Branch — CancelSwitch (valid: pendingNextFocus present)
 *   [genuine red] — 7-field assertion (focusedBlockId: null) cannot pass against old impl
 * REQ-HSF-006: Branch — CancelSwitch invalid when no pendingNextFocus
 *   [genuine red] — error detail string changed to "cancel-switch requires pendingNextFocus"
 * PROP-HSF-004: cancelSwitch state shape (all 7 fields)
 *   [genuine red] — focusedBlockId field is new; old impl produces 6 fields
 * PROP-HSF-007: pendingNextFocus routing — cancel-switch (no pendingNextFocus on EditingState)
 *   [coverage retrofit] — fixture updated; assertion unchanged
 * PROP-HSF-008: emitted event payloads do NOT carry pendingNextFocus or blockId
 *   [coverage retrofit] — extended to assert pendingNextFocus / blockId absence
 * PROP-HSF-011: Zero events — cancel-switch valid branch
 *   [coverage retrofit] — fixture renamed; behavior unchanged
 * PROP-HSF-012: Cancel-switch invalid guard
 *   [genuine red] — error detail string assertion updated
 * PROP-HSF-013: Clock.now() call count — valid branches
 *   [coverage retrofit] — fixture renamed; behavior unchanged
 * PROP-HSF-020: Clock.now() call count — cancel-switch invalid branch (0 calls)
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
  PendingNextFocus,
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

describe("cancel-switch (valid — pendingNextFocus present)", () => {

  // REQ-HSF-005 AC: all 7 EditingState fields
  // PROP-HSF-004
  // [genuine red] — focusedBlockId: null is a new field; old impl returns 6-field object
  test("PROP-HSF-004: cancel-switch (valid) → all 7 EditingState fields correct [genuine red]", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-1"));
    const state = makeSaveFailedState({ currentNoteId, pendingNextFocus });
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
    // REQ-HSF-005 NEW: focusedBlockId: null — UI re-focuses from its own state
    expect(nextState.focusedBlockId).toBeNull();            // [genuine red]
    expect(nextState.isDirty).toBe(true);                   // unsaved content retained
    expect(nextState.lastInputAt).toBeNull();               // restoration moment
    expect(nextState.idleTimerHandle).toBeNull();           // no timer at restoration
    expect(nextState.lastSaveResult).toBe("failed");        // last save did not succeed
  });

  // REQ-HSF-005 AC: currentNoteId preserved
  // [coverage retrofit]
  test("cancel-switch (valid) → EditingState.currentNoteId === state.currentNoteId", async () => {
    const currentNoteId = makeNoteId("note-2026-05-01-120000-001");
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-2"));
    const state = makeSaveFailedState({ currentNoteId, pendingNextFocus });
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

  // REQ-HSF-005 AC: focusedBlockId is null (UI re-focuses from own state)
  // [genuine red] — new AC; old impl has no focusedBlockId field
  test("cancel-switch (valid) → EditingState.focusedBlockId === null [genuine red]", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-xyz"));
    const state = makeSaveFailedState({ pendingNextFocus });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    );

    expect((result.nextSessionState as EditingState).focusedBlockId).toBeNull();
  });

  // REQ-HSF-005 AC: isDirty preserved as true
  // [coverage retrofit]
  test("cancel-switch (valid) → EditingState.isDirty === true (unsaved content retained)", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-3"));
    const state = makeSaveFailedState({ pendingNextFocus });
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
  // [coverage retrofit]
  test("cancel-switch (valid) → EditingState.lastSaveResult === 'failed'", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-4"));
    const state = makeSaveFailedState({ pendingNextFocus });
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

  // PROP-HSF-007: pendingNextFocus absent from resulting EditingState
  // [coverage retrofit] — checking renamed field
  test("PROP-HSF-007: cancel-switch (valid) → EditingState has no pendingNextFocus field", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-5"));
    const state = makeSaveFailedState({ pendingNextFocus });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    );

    expect("pendingNextFocus" in result.nextSessionState).toBe(false);
    expect("pendingNextNoteId" in result.nextSessionState).toBe(false);
  });

  // PROP-HSF-011: zero events emitted on cancel-switch valid
  // [coverage retrofit]
  test("PROP-HSF-011: cancel-switch (valid) → zero events emitted", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-6"));
    const state = makeSaveFailedState({ pendingNextFocus });
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

  // PROP-HSF-008: emitted events (none for cancel-switch) must not carry pendingNextFocus or blockId
  // [coverage retrofit] — extended per sprint-2 spec
  test("PROP-HSF-008: cancel-switch (valid) → no event carries pendingNextFocus or blockId", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-7"));
    const state = makeSaveFailedState({ pendingNextFocus });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    );

    // Zero events — none can carry pendingNextFocus
    expect(spy.events).toHaveLength(0);
    for (const e of spy.events) {
      expect("pendingNextFocus" in e).toBe(false);
      expect("blockId" in e).toBe(false);
    }
  });

  // PROP-HSF-013: Clock.now() called exactly once
  // [coverage retrofit]
  test("PROP-HSF-013: cancel-switch (valid) → Clock.now() called exactly once", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-8"));
    const state = makeSaveFailedState({ pendingNextFocus });
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
  // [coverage retrofit]
  test("cancel-switch (valid) → ResolvedState.resolution === 'cancelled'", async () => {
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-9"));
    const state = makeSaveFailedState({ pendingNextFocus });
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

describe("cancel-switch (invalid — pendingNextFocus is null)", () => {

  // PROP-HSF-012: invariant violation with updated error detail string
  // [genuine red] — detail changed from "cancel-switch requires pendingNextNoteId"
  //                 to "cancel-switch requires pendingNextFocus"
  test("PROP-HSF-012: pendingNextFocus=null + cancel-switch → Promise.reject with invariant-violated SaveError [genuine red]", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
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

  // REQ-HSF-006: detail string is "cancel-switch requires pendingNextFocus" (NOT "pendingNextNoteId")
  // [genuine red] — old impl uses old string
  test("REQ-HSF-006: cancel-switch (invalid) → error detail is 'cancel-switch requires pendingNextFocus' [genuine red]", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const error = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      makePorts(spy, clock),
    ).catch((e) => e);

    expect(error.reason.detail).toBe("cancel-switch requires pendingNextFocus");
  });

  // PROP-HSF-012: rejection is a SaveError (validation), not a ResolvedState
  // [coverage retrofit]
  test("cancel-switch (invalid) → rejected Promise (no ResolvedState produced)", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
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
  // [coverage retrofit]
  test("cancel-switch (invalid) → zero events emitted", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
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
  // [coverage retrofit]
  test("PROP-HSF-020: cancel-switch (invalid) → Clock.now() called exactly 0 times", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
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
  // [coverage retrofit]
  test("cancel-switch (invalid) → no state transition occurs (no nextSessionState)", async () => {
    const state = makeSaveFailedState({ pendingNextFocus: null });
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
