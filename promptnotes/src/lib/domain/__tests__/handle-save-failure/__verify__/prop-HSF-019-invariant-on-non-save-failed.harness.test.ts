/**
 * PROP-HSF-019: invariant-on-non-save-failed
 * Tier 2 — Example-based test
 * Required: false
 *
 * Property: given a deliberately-cast non-save-failed state (e.g. EditingState cast to
 * SaveFailedState), handleSaveFailure returns
 *   Promise.reject(SaveError { kind: 'validation', reason: { kind: 'invariant-violated' } })
 * No transition occurs; no event emitted.
 *
 * Covers: REQ-HSF-001, PROP-HSF-019
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type {
  SaveFailedState,
  EditingState,
  IdleState,
  SavingState,
} from "promptnotes-domain-types/capture/states";
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

function makeEditingState(noteId: NoteId): EditingState {
  return {
    status: "editing" as const,
    currentNoteId: noteId,
    isDirty: true,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  };
}

function makeIdleState(): IdleState {
  return { status: "idle" as const };
}

function makeSavingState(noteId: NoteId): SavingState {
  return {
    status: "saving" as const,
    currentNoteId: noteId,
    savingStartedAt: makeTimestamp(1000),
  };
}

function makeSaveFailedStage(): SaveFailedStage {
  return {
    kind: "SaveFailedStage" as const,
    noteId: makeNoteId("0000-00-00-000000-000"),
    error: { kind: "fs" as const, reason: { kind: "disk-full" as const } },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("PROP-HSF-019: invariant-on-non-save-failed", () => {
  test("EditingState cast to SaveFailedState → Promise.reject with invariant-violated", async () => {
    const editingState = makeEditingState(makeNoteId("2026-05-01-120000-001"));
    const stage = makeSaveFailedStage();
    const events: CaptureInternalEvent[] = [];
    let clockCalls = 0;

    await expect(
      runHandleSaveFailurePipeline(
        stage,
        editingState as unknown as SaveFailedState,
        { kind: "retry-save" },
        {
          clockNow: () => { clockCalls++; return makeTimestamp(1000); },
          emit: (e) => { events.push(e); },
        },
      )
    ).rejects.toMatchObject({
      kind: "validation",
      reason: { kind: "invariant-violated" },
    });

    // No event emitted
    expect(events).toHaveLength(0);
  });

  test("IdleState cast to SaveFailedState → Promise.reject with invariant-violated", async () => {
    const idleState = makeIdleState();
    const stage = makeSaveFailedStage();
    const events: CaptureInternalEvent[] = [];

    await expect(
      runHandleSaveFailurePipeline(
        stage,
        idleState as unknown as SaveFailedState,
        { kind: "discard-current-session" },
        {
          clockNow: () => makeTimestamp(1000),
          emit: (e) => { events.push(e); },
        },
      )
    ).rejects.toMatchObject({
      kind: "validation",
      reason: { kind: "invariant-violated" },
    });

    expect(events).toHaveLength(0);
  });

  test("SavingState cast to SaveFailedState → Promise.reject with invariant-violated", async () => {
    const savingState = makeSavingState(makeNoteId("2026-05-01-120000-002"));
    const stage = makeSaveFailedStage();
    const events: CaptureInternalEvent[] = [];

    await expect(
      runHandleSaveFailurePipeline(
        stage,
        savingState as unknown as SaveFailedState,
        { kind: "cancel-switch" },
        {
          clockNow: () => makeTimestamp(1000),
          emit: (e) => { events.push(e); },
        },
      )
    ).rejects.toMatchObject({
      kind: "validation",
      reason: { kind: "invariant-violated" },
    });

    expect(events).toHaveLength(0);
  });

  // fast-check: for all non-save-failed status values, the invariant guard fires
  test("∀ non-save-failed status values → invariant-violated rejection (property, 50 runs)", async () => {
    const nonSaveFailedStates = fc.oneof(
      fc.constant({ status: "idle" as const }),
      arbNoteId.map((id) => ({
        status: "editing" as const,
        currentNoteId: id,
        isDirty: false,
        lastInputAt: null,
        idleTimerHandle: null,
        lastSaveResult: null as null,
      })),
      arbNoteId.map((id) => ({
        status: "saving" as const,
        currentNoteId: id,
        savingStartedAt: makeTimestamp(1000),
      })),
      arbNoteId.chain((id1) =>
        arbNoteId.map((id2) => ({
          status: "switching" as const,
          currentNoteId: id1,
          pendingNextNoteId: id2,
          savingStartedAt: makeTimestamp(1000),
        }))
      ),
    );

    await fc.assert(
      fc.asyncProperty(nonSaveFailedStates, async (state) => {
        const stage = makeSaveFailedStage();
        const events: CaptureInternalEvent[] = [];

        let rejected = false;
        let rejectionIsInvariantViolated = false;

        await runHandleSaveFailurePipeline(
          stage,
          state as unknown as SaveFailedState,
          { kind: "retry-save" },
          {
            clockNow: () => makeTimestamp(1000),
            emit: (e) => { events.push(e); },
          },
        ).catch((err) => {
          rejected = true;
          rejectionIsInvariantViolated =
            err?.kind === "validation" &&
            err?.reason?.kind === "invariant-violated";
        });

        expect(rejected).toBe(true);
        expect(rejectionIsInvariantViolated).toBe(true);
        expect(events).toHaveLength(0);
      }),
      { numRuns: 50 },
    );
  });
});
