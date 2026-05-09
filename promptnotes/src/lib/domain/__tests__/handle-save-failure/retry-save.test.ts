/**
 * retry-save.test.ts — Unit tests for retry-save branch
 *
 * Sprint-2 (block migration) — coverage retrofit only
 *
 * REQ-HSF-002: Branch — RetrySave
 *   [coverage retrofit] — fixture updated (pendingNextNoteId → pendingNextFocus)
 * PROP-HSF-001: retry transition determinism (Tier 1 → covered in __verify__)
 *   [coverage retrofit]
 * PROP-HSF-002: retry state shape
 *   [coverage retrofit]
 * PROP-HSF-009: Exactly-one event constraint — retry branch
 *   [coverage retrofit]
 * PROP-HSF-013: Clock.now() call count — valid branches
 *   [coverage retrofit]
 * PROP-HSF-014: Timestamp reuse — retry branch
 *   [coverage retrofit]
 *
 * NOTE: retry-save does not touch pendingNextFocus in its output (SavingState has no
 * pendingNextFocus field), so all changes here are fixture-only renames.
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
  SavingState,
  PendingNextFocus,
} from "promptnotes-domain-types/capture/states";
import type {
  SaveFailedStage,
  UserDecision,
} from "promptnotes-domain-types/capture/stages";
import type {
  CaptureInternalEvent,
  RetrySaveRequested,
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

// ── Tests ─────────────────────────────────────────────────────────────────

describe("retry-save branch", () => {

  // REQ-HSF-002 AC: resulting state has status === 'saving' and correct currentNoteId
  // [coverage retrofit]
  test("PROP-HSF-002: retry → SavingState with status='saving' and currentNoteId preserved", async () => {
    const currentNoteId = makeNoteId("note-2026-05-01-120000-001");
    const state = makeSaveFailedState({ currentNoteId });
    const stage = makeSaveFailedStage(currentNoteId);
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "retry-save" },
      { clockNow: clock.clockNow, emit: spy.emit },
    );

    const nextState = result.nextSessionState as SavingState;
    expect(nextState.status).toBe("saving");
    expect(nextState.currentNoteId).toBe(currentNoteId);
  });

  // REQ-HSF-002 AC: RetrySaveRequested emitted exactly once
  // PROP-HSF-009
  // [coverage retrofit]
  test("PROP-HSF-009: retry → exactly one RetrySaveRequested event emitted", async () => {
    const currentNoteId = makeNoteId("note-A");
    const state = makeSaveFailedState({ currentNoteId });
    const stage = makeSaveFailedStage(currentNoteId);
    const clock = makeClockSpy(5000);
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "retry-save" },
      { clockNow: clock.clockNow, emit: spy.emit },
    );

    expect(spy.events).toHaveLength(1);
    const event = spy.events[0] as RetrySaveRequested;
    expect(event.kind).toBe("retry-save-requested");
    expect(event.noteId).toBe(currentNoteId);
  });

  // REQ-HSF-002 AC: Clock.now() called exactly once
  // PROP-HSF-013
  // [coverage retrofit]
  test("PROP-HSF-013: retry → Clock.now() called exactly once", async () => {
    const state = makeSaveFailedState();
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "retry-save" },
      { clockNow: clock.clockNow, emit: spy.emit },
    );

    expect(clock.getCallCount()).toBe(1);
  });

  // REQ-HSF-002 AC: same now used for both SavingState.savingStartedAt and RetrySaveRequested.occurredOn
  // PROP-HSF-014
  // [coverage retrofit]
  test("PROP-HSF-014: retry → SavingState.savingStartedAt === RetrySaveRequested.occurredOn (same Clock.now() call)", async () => {
    const state = makeSaveFailedState();
    const stage = makeSaveFailedStage();
    const fixedNow = makeTimestamp(12345678);
    let callCount = 0;
    const clock = (): Timestamp => { callCount++; return fixedNow; };
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "retry-save" },
      { clockNow: clock, emit: spy.emit },
    );

    const nextState = result.nextSessionState as SavingState;
    const event = spy.events[0] as RetrySaveRequested;
    expect(nextState.savingStartedAt).toBe(fixedNow);
    expect(event.occurredOn).toBe(fixedNow);
    expect(nextState.savingStartedAt).toBe(event.occurredOn);
    expect(callCount).toBe(1); // only one Clock.now() call for both
  });

  // REQ-HSF-002 AC: ResolvedState.resolution === 'retried'
  // [coverage retrofit]
  test("retry → ResolvedState.resolution === 'retried'", async () => {
    const state = makeSaveFailedState();
    const stage = makeSaveFailedStage();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "retry-save" },
      { clockNow: clock.clockNow, emit: spy.emit },
    );

    expect(result.resolvedState.resolution).toBe("retried");
  });

  // REQ-HSF-002 edge: pendingNextFocus non-null — retry proceeds normally
  // [coverage retrofit]
  test("retry with pendingNextFocus non-null → SavingState with same currentNoteId", async () => {
    const currentNoteId = makeNoteId("note-A");
    const pendingNextFocus = makePendingNextFocus(makeNoteId("note-B"), makeBlockId("block-rp"));
    const state = makeSaveFailedState({ currentNoteId, pendingNextFocus });
    const stage = makeSaveFailedStage(currentNoteId);
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "retry-save" },
      { clockNow: clock.clockNow, emit: spy.emit },
    );

    const nextState = result.nextSessionState as SavingState;
    expect(nextState.status).toBe("saving");
    expect(nextState.currentNoteId).toBe(currentNoteId);
    // RetrySaveRequested should carry currentNoteId, not pendingNextFocus.noteId
    expect((spy.events[0] as RetrySaveRequested).noteId).toBe(currentNoteId);
  });

  // REQ-HSF-002 edge: pendingNextFocus null — retry proceeds identically
  // [coverage retrofit]
  test("retry with pendingNextFocus null → SavingState with correct currentNoteId", async () => {
    const currentNoteId = makeNoteId("note-A");
    const state = makeSaveFailedState({ currentNoteId, pendingNextFocus: null });
    const stage = makeSaveFailedStage(currentNoteId);
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    const result = await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "retry-save" },
      { clockNow: clock.clockNow, emit: spy.emit },
    );

    expect((result.nextSessionState as SavingState).currentNoteId).toBe(currentNoteId);
    expect(spy.events).toHaveLength(1);
  });

  // REQ-HSF-012: error field must not appear in emitted event
  // [coverage retrofit]
  test("retry → RetrySaveRequested event payload has no error field", async () => {
    const stage: SaveFailedStage = {
      kind: "SaveFailedStage",
      noteId: makeNoteId("note-A"),
      error: { kind: "fs", reason: { kind: "permission", path: "/vault/note.md" } },
    };
    const state = makeSaveFailedState();
    const clock = makeClockSpy();
    const spy = makeEmitSpy();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "retry-save" },
      { clockNow: clock.clockNow, emit: spy.emit },
    );

    expect("error" in spy.events[0]).toBe(false);
  });
});
