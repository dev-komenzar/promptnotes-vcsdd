/**
 * PROP-HSF-001: retry-determinism
 * Tier 1 — fast-check, 1000 runs
 * Required: true
 *
 * Property: ∀ (state: SaveFailedState, now: Timestamp),
 *   calling EditingSessionTransitions.retry(state, now) twice with identical inputs
 *   produces structurally equal SavingState outputs.
 *
 * Covers: REQ-HSF-002, REQ-HSF-009
 *
 * Note: Since the pure transition functions are not yet exported from the implementation
 * (which doesn't exist yet), this harness imports from the (future) pipeline module and
 * indirectly verifies determinism by running the full pipeline twice with the same inputs
 * and a fixed clock, asserting nextSessionState deepEquals on the retry path.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type { SaveFailedState } from "promptnotes-domain-types/capture/states";
import type {
  SaveFailedStage,
} from "promptnotes-domain-types/capture/stages";
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

const arbTimestamp: fc.Arbitrary<Timestamp> = fc
  .integer({ min: 1, max: 2_000_000_000_000 })
  .map(makeTimestamp);

const arbSaveError: fc.Arbitrary<SaveError> = fc.oneof(
  fc.constant({ kind: "fs" as const, reason: { kind: "permission" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "disk-full" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "lock" as const } }),
  fc.constant({
    kind: "fs" as const,
    reason: { kind: "unknown" as const, detail: "test-error" },
  }),
);

const arbSaveFailedState: fc.Arbitrary<SaveFailedState> = fc
  .tuple(
    arbNoteId,
    fc.option(arbNoteId, { nil: null }),
    arbSaveError,
  )
  .map(([noteId, pending, error]) => ({
    status: "save-failed" as const,
    currentNoteId: noteId,
    pendingNextNoteId: pending,
    lastSaveError: error,
  }));

const arbSaveFailedStage: fc.Arbitrary<SaveFailedStage> = fc
  .tuple(arbNoteId, arbSaveError)
  .map(([noteId, error]) => ({
    kind: "SaveFailedStage" as const,
    noteId,
    error,
  }));

// ── PROP-HSF-001: retry-determinism ──────────────────────────────────────

describe("PROP-HSF-001: retry transition determinism", () => {
  test(
    "∀ SaveFailedState, running retry-save twice with identical fixed clock → identical SavingState outputs (1000 runs)",
    () => {
      fc.assert(
        fc.property(
          arbSaveFailedState,
          arbSaveFailedStage,
          arbTimestamp,
          async (state, stage, fixedNow) => {
            const events1: CaptureInternalEvent[] = [];
            const events2: CaptureInternalEvent[] = [];

            const result1 = await runHandleSaveFailurePipeline(
              stage,
              state,
              { kind: "retry-save" },
              {
                clockNow: () => fixedNow,
                emit: (e) => { events1.push(e); },
              },
            );

            const result2 = await runHandleSaveFailurePipeline(
              stage,
              state,
              { kind: "retry-save" },
              {
                clockNow: () => fixedNow,
                emit: (e) => { events2.push(e); },
              },
            );

            // Both runs must produce structurally equal results
            expect(result1.nextSessionState).toEqual(result2.nextSessionState);
            expect(result1.resolvedState).toEqual(result2.resolvedState);
            expect(events1).toEqual(events2);
          },
        ),
        { numRuns: 1000 },
      );
    },
  );

  test(
    "PROP-HSF-002: ∀ SaveFailedState, retry → SavingState.status='saving' ∧ currentNoteId preserved (500 runs)",
    () => {
      fc.assert(
        fc.property(
          arbSaveFailedState,
          arbSaveFailedStage,
          arbTimestamp,
          async (state, stage, fixedNow) => {
            const result = await runHandleSaveFailurePipeline(
              stage,
              state,
              { kind: "retry-save" },
              {
                clockNow: () => fixedNow,
                emit: () => {},
              },
            );

            expect(result.nextSessionState.status).toBe("saving");
            expect(
              (result.nextSessionState as { currentNoteId: NoteId }).currentNoteId
            ).toBe(state.currentNoteId);
          },
        ),
        { numRuns: 500 },
      );
    },
  );
});
