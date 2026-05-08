/**
 * PROP-HSF-022: discard-with-pending-threads-blockId
 * Tier 2 — Example-based + fast-check property
 * Required: true
 * Sprint: 2 (block migration)
 *
 * [genuine red] — NEW test in sprint-2.
 *   discardTransition and runHandleSaveFailurePipeline (discard branch) must thread
 *   state.pendingNextFocus.blockId into the resulting EditingState.focusedBlockId.
 *   The current (pre-migration) implementation does NOT set focusedBlockId, so
 *   both the example test and the fast-check property will FAIL.
 *
 * Property:
 *   ∀ (state: SaveFailedState) where state.pendingNextFocus !== null,
 *   discard(state, now).focusedBlockId === state.pendingNextFocus.blockId
 *
 * Also verifies via the full pipeline (runHandleSaveFailurePipeline) that the
 * orchestrator does not lose the blockId during event emission or state packaging.
 *
 * Covers: REQ-HSF-004, PROP-HSF-022
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  BlockId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type {
  SaveFailedState,
  EditingState,
  PendingNextFocus,
} from "promptnotes-domain-types/capture/states";
import type { SaveFailedStage } from "promptnotes-domain-types/capture/stages";
import type { CaptureInternalEvent } from "promptnotes-domain-types/capture/internal-events";

import { discardTransition } from "../../../handle-save-failure/transitions.js";
import {
  runHandleSaveFailurePipeline,
} from "../../../handle-save-failure/pipeline.js";

// ── Arbitrary generators ──────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeBlockId(raw: string): BlockId {
  return raw as unknown as BlockId;
}

function makeTimestamp(ms: number): Timestamp {
  return { epochMillis: ms } as unknown as Timestamp;
}

const arbNoteId: fc.Arbitrary<NoteId> = fc
  .stringMatching(/^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]{6}-[0-9]{3}$/)
  .map(makeNoteId);

const arbBlockId: fc.Arbitrary<BlockId> = fc
  .stringMatching(/^block-[a-z0-9]{4,12}$/)
  .map(makeBlockId);

const arbTimestamp: fc.Arbitrary<Timestamp> = fc
  .integer({ min: 1, max: 2_000_000_000_000 })
  .map(makeTimestamp);

const arbSaveError: fc.Arbitrary<SaveError> = fc.oneof(
  fc.constant({ kind: "fs" as const, reason: { kind: "permission" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "disk-full" as const } }),
  fc.constant({ kind: "fs" as const, reason: { kind: "lock" as const } }),
  fc.constant({
    kind: "fs" as const,
    reason: { kind: "unknown" as const, detail: "test" },
  }),
);

const arbPendingNextFocus: fc.Arbitrary<PendingNextFocus> = fc
  .tuple(arbNoteId, arbBlockId)
  .map(([noteId, blockId]) => ({ noteId, blockId }));

// SaveFailedState with non-null pendingNextFocus — this is the sub-case that
// requires blockId threading.
const arbSaveFailedStateWithPending: fc.Arbitrary<SaveFailedState> = fc
  .tuple(arbNoteId, arbPendingNextFocus, arbSaveError)
  .map(([noteId, pendingNextFocus, error]) => ({
    status: "save-failed" as const,
    currentNoteId: noteId,
    pendingNextFocus,
    lastSaveError: error,
  }));

const arbSaveFailedStage: fc.Arbitrary<SaveFailedStage> = fc
  .tuple(arbNoteId, arbSaveError)
  .map(([noteId, error]) => ({
    kind: "SaveFailedStage" as const,
    noteId,
    error,
  }));

// ── Tests ─────────────────────────────────────────────────────────────────

describe("PROP-HSF-022: discard with pending threads blockId into focusedBlockId", () => {

  // Example test: pure discardTransition threads blockId
  // [genuine red] — discardTransition currently returns no focusedBlockId field
  test("example: discardTransition with non-null pending → EditingState.focusedBlockId === pendingNextFocus.blockId [genuine red]", () => {
    const pendingNoteId = makeNoteId("2026-05-01-130000-001");
    const pendingBlockId = makeBlockId("block-ab12cd");
    const state: SaveFailedState = {
      status: "save-failed",
      currentNoteId: makeNoteId("2026-05-01-120000-001"),
      pendingNextFocus: { noteId: pendingNoteId, blockId: pendingBlockId },
      lastSaveError: { kind: "fs", reason: { kind: "disk-full" } },
    };
    const now = makeTimestamp(5000);

    const result = discardTransition(state, now) as EditingState;

    expect(result.status).toBe("editing");
    expect(result.currentNoteId).toBe(pendingNoteId);
    // [genuine red] — must equal pendingNextFocus.blockId; old impl omits this field
    expect(result.focusedBlockId).toBe(pendingBlockId);
  });

  // Example test: different blockId values are correctly threaded
  // [genuine red]
  test("example: discardTransition threads different blockId values correctly [genuine red]", () => {
    const blockIdA = makeBlockId("block-0000aaaa");
    const blockIdB = makeBlockId("block-1111bbbb");

    const stateA: SaveFailedState = {
      status: "save-failed",
      currentNoteId: makeNoteId("2026-05-01-120000-001"),
      pendingNextFocus: { noteId: makeNoteId("2026-05-01-130000-001"), blockId: blockIdA },
      lastSaveError: { kind: "fs", reason: { kind: "disk-full" } },
    };

    const stateB: SaveFailedState = {
      status: "save-failed",
      currentNoteId: makeNoteId("2026-05-01-120000-002"),
      pendingNextFocus: { noteId: makeNoteId("2026-05-01-130000-002"), blockId: blockIdB },
      lastSaveError: { kind: "fs", reason: { kind: "disk-full" } },
    };

    const now = makeTimestamp(5000);

    const resultA = discardTransition(stateA, now) as EditingState;
    const resultB = discardTransition(stateB, now) as EditingState;

    expect(resultA.focusedBlockId).toBe(blockIdA);
    expect(resultB.focusedBlockId).toBe(blockIdB);
    expect(resultA.focusedBlockId).not.toBe(blockIdB);
    expect(resultB.focusedBlockId).not.toBe(blockIdA);
  });

  // fast-check property: ∀ SaveFailedState with non-null pending,
  // discardTransition always threads blockId (1000 runs)
  // [genuine red]
  test(
    "∀ SaveFailedState with non-null pending, discardTransition(state, now).focusedBlockId === state.pendingNextFocus.blockId (1000 runs) [genuine red]",
    () => {
      fc.assert(
        fc.property(
          arbSaveFailedStateWithPending,
          arbTimestamp,
          (state, now) => {
            const result = discardTransition(state, now) as EditingState;

            expect(result.status).toBe("editing");
            // [genuine red] — the core threading assertion
            expect(result.focusedBlockId).toBe(state.pendingNextFocus!.blockId);
            expect(result.currentNoteId).toBe(state.pendingNextFocus!.noteId);
          },
        ),
        { numRuns: 1000 },
      );
    },
  );

  // Pipeline-level check: blockId threading survives orchestration
  // [genuine red] — ensures pipeline doesn't drop focusedBlockId when packaging result
  test(
    "pipeline: discard (with pending) → nextSessionState.focusedBlockId === pendingNextFocus.blockId [genuine red]",
    async () => {
      const pendingNoteId = makeNoteId("2026-05-01-140000-001");
      const pendingBlockId = makeBlockId("block-pipeline1");
      const state: SaveFailedState = {
        status: "save-failed",
        currentNoteId: makeNoteId("2026-05-01-120000-001"),
        pendingNextFocus: { noteId: pendingNoteId, blockId: pendingBlockId },
        lastSaveError: { kind: "fs", reason: { kind: "disk-full" } },
      };
      const stage: SaveFailedStage = {
        kind: "SaveFailedStage",
        noteId: makeNoteId("2026-05-01-120000-001"),
        error: { kind: "fs", reason: { kind: "disk-full" } },
      };
      const events: CaptureInternalEvent[] = [];

      const result = await runHandleSaveFailurePipeline(
        stage,
        state,
        { kind: "discard-current-session" },
        {
          clockNow: () => makeTimestamp(5000),
          emit: (e) => { events.push(e); },
        },
      );

      const nextState = result.nextSessionState as EditingState;
      expect(nextState.status).toBe("editing");
      expect(nextState.currentNoteId).toBe(pendingNoteId);
      // [genuine red] — blockId must be threaded through the full orchestrator
      expect(nextState.focusedBlockId).toBe(pendingBlockId);
    },
  );

  // Pipeline-level fast-check: ∀ SaveFailedState with non-null pending,
  // the pipeline also threads blockId (500 runs)
  // [genuine red]
  test(
    "∀ SaveFailedState with non-null pending, pipeline discard → nextSessionState.focusedBlockId === pendingNextFocus.blockId (500 runs) [genuine red]",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbSaveFailedStateWithPending,
          arbSaveFailedStage,
          arbTimestamp,
          async (state, stage, now) => {
            const events: CaptureInternalEvent[] = [];

            const result = await runHandleSaveFailurePipeline(
              stage,
              state,
              { kind: "discard-current-session" },
              {
                clockNow: () => now,
                emit: (e) => { events.push(e); },
              },
            );

            const nextState = result.nextSessionState as EditingState;
            expect(nextState.focusedBlockId).toBe(state.pendingNextFocus!.blockId);
          },
        ),
        { numRuns: 500 },
      );
    },
  );
});
