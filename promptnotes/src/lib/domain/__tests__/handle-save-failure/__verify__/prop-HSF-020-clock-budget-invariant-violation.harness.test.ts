/**
 * PROP-HSF-020: clock-budget-invariant-violation
 * Tier 2 — Example-based + fast-check sentinel spy
 * Required: false
 *
 * Property: when pendingNextNoteId === null and decision.kind === 'cancel-switch',
 * the invariant guard fires BEFORE any Clock.now() call.
 * Spy confirms call count === 0 on the invalid cancel-switch branch.
 *
 * Covers: REQ-HSF-006, REQ-HSF-009, PROP-HSF-020
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type { SaveFailedState } from "promptnotes-domain-types/capture/states";
import type { SaveFailedStage } from "promptnotes-domain-types/capture/stages";
import type { CaptureInternalEvent } from "promptnotes-domain-types/capture/internal-events";

import {
  runHandleSaveFailurePipeline,
} from "../../../handle-save-failure/pipeline.js";

// ── Arbitrary generators ──────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeTimestamp(ms: number): Timestamp {
  return { epochMillis: ms } as unknown as Timestamp;
}

const arbNoteId: fc.Arbitrary<NoteId> = fc
  .stringMatching(/^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}-[0-9]{3}$/)
  .map(makeNoteId);

const arbSaveError: fc.Arbitrary<SaveError> = fc.oneof(
  fc.constant({ kind: "fs" as const, reason: { kind: "permission" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "disk-full" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "lock" as const } }),
  fc.constant({
    kind: "fs" as const,
    reason: { kind: "unknown" as const, detail: "test" },
  }),
);

// SaveFailedState with pendingNextNoteId === null (invalid cancel-switch input)
const arbSaveFailedStateNoPending: fc.Arbitrary<SaveFailedState> = fc
  .tuple(arbNoteId, arbSaveError)
  .map(([noteId, error]) => ({
    status: "save-failed" as const,
    currentNoteId: noteId,
    pendingNextNoteId: null,
    lastSaveError: error,
  }));

const arbSaveFailedStage: fc.Arbitrary<SaveFailedStage> = fc
  .tuple(arbNoteId, arbSaveError)
  .map(([noteId, error]) => ({
    kind: "SaveFailedStage" as const,
    noteId,
    error,
  }));

// ── Sentinel spy factory ──────────────────────────────────────────────────

function makeClockSentinel() {
  let callCount = 0;
  return {
    clockNow: (): Timestamp => {
      callCount++;
      return makeTimestamp(1000);
    },
    getCallCount: () => callCount,
  };
}

function makeEmitSentinel() {
  let callCount = 0;
  return {
    emit: (_e: CaptureInternalEvent): void => { callCount++; },
    getCallCount: () => callCount,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("PROP-HSF-020: Clock.now() called 0 times on cancel-switch-invalid branch", () => {
  test("example: pendingNextNoteId=null + cancel-switch → clockNow not called", async () => {
    const state: SaveFailedState = {
      status: "save-failed",
      currentNoteId: makeNoteId("2026-05-01-120000-001"),
      pendingNextNoteId: null,
      lastSaveError: { kind: "fs", reason: { kind: "disk-full" } },
    };
    const stage: SaveFailedStage = {
      kind: "SaveFailedStage",
      noteId: makeNoteId("2026-05-01-120000-001"),
      error: { kind: "fs", reason: { kind: "disk-full" } },
    };
    const clockSentinel = makeClockSentinel();
    const emitSentinel = makeEmitSentinel();

    await runHandleSaveFailurePipeline(
      stage,
      state,
      { kind: "cancel-switch" },
      { clockNow: clockSentinel.clockNow, emit: emitSentinel.emit },
    ).catch(() => {});

    expect(clockSentinel.getCallCount()).toBe(0);
    expect(emitSentinel.getCallCount()).toBe(0);
  });

  test(
    "∀ SaveFailedState with pendingNextNoteId=null, cancel-switch → clockNow called 0 times (200 runs)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbSaveFailedStateNoPending,
          arbSaveFailedStage,
          async (state, stage) => {
            const clockSentinel = makeClockSentinel();
            const emitSentinel = makeEmitSentinel();

            await runHandleSaveFailurePipeline(
              stage,
              state,
              { kind: "cancel-switch" },
              {
                clockNow: clockSentinel.clockNow,
                emit: emitSentinel.emit,
              },
            ).catch(() => {});

            expect(clockSentinel.getCallCount()).toBe(0);
            expect(emitSentinel.getCallCount()).toBe(0);
          },
        ),
        { numRuns: 200 },
      );
    },
  );

  // Contrast: valid cancel-switch (pendingNextNoteId non-null) → Clock.now() called once
  test(
    "∀ SaveFailedState with pendingNextNoteId non-null, cancel-switch → clockNow called exactly 1 time (200 runs)",
    async () => {
      const arbSaveFailedStateWithPending: fc.Arbitrary<SaveFailedState> = fc
        .tuple(arbNoteId, arbNoteId, arbSaveError)
        .map(([noteId, pendingId, error]) => ({
          status: "save-failed" as const,
          currentNoteId: noteId,
          pendingNextNoteId: pendingId,
          lastSaveError: error,
        }));

      await fc.assert(
        fc.asyncProperty(
          arbSaveFailedStateWithPending,
          arbSaveFailedStage,
          async (state, stage) => {
            const clockSentinel = makeClockSentinel();
            const emitSentinel = makeEmitSentinel();

            await runHandleSaveFailurePipeline(
              stage,
              state,
              { kind: "cancel-switch" },
              {
                clockNow: clockSentinel.clockNow,
                emit: emitSentinel.emit,
              },
            ).catch(() => {});

            expect(clockSentinel.getCallCount()).toBe(1);
            expect(emitSentinel.getCallCount()).toBe(0); // cancel-switch emits no event
          },
        ),
        { numRuns: 200 },
      );
    },
  );
});
