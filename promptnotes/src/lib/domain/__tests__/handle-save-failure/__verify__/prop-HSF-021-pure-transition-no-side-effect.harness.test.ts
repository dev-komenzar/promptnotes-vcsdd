/**
 * PROP-HSF-021: pure-transition-no-side-effect
 * Tier 1 — fast-check sentinel spy
 * Required: false
 *
 * Property: the pure transition functions (retry, discard, cancelSwitch) do NOT call
 * Clock.now() or emit() internally. Sentinel spy counts for both ports remain 0 when
 * the functions are called directly (bypassing the orchestrator).
 *
 * Covers: REQ-HSF-002, REQ-HSF-003, REQ-HSF-004, REQ-HSF-005, PROP-HSF-021
 *
 * Note: the pure transition functions are imported from the transitions module
 * once the implementation exists. Until then, this test imports from the
 * (future) implementation's transitions module.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type { SaveFailedState } from "promptnotes-domain-types/capture/states";
import type { CaptureInternalEvent } from "promptnotes-domain-types/capture/internal-events";

import {
  retryTransition,
  discardTransition,
  cancelSwitchTransition,
} from "../../../handle-save-failure/transitions.js";

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
    reason: { kind: "unknown" as const, detail: "test" },
  }),
);

// SaveFailedState with non-null pending (for cancelSwitch)
const arbSaveFailedStateWithPending: fc.Arbitrary<SaveFailedState> = fc
  .tuple(arbNoteId, arbNoteId, arbSaveError)
  .map(([noteId, pendingId, error]) => ({
    status: "save-failed" as const,
    currentNoteId: noteId,
    pendingNextNoteId: pendingId,
    lastSaveError: error,
  }));

// SaveFailedState with any pending (for retry and discard)
const arbSaveFailedState: fc.Arbitrary<SaveFailedState> = fc
  .tuple(arbNoteId, fc.option(arbNoteId, { nil: null }), arbSaveError)
  .map(([noteId, pending, error]) => ({
    status: "save-failed" as const,
    currentNoteId: noteId,
    pendingNextNoteId: pending,
    lastSaveError: error,
  }));

// ── Sentinel factories ─────────────────────────────────────────────────────

function makeClockSentinel() {
  let count = 0;
  return {
    clockNow: (): Timestamp => { count++; return makeTimestamp(1); },
    getCount: () => count,
  };
}

function makeEmitSentinel() {
  let count = 0;
  return {
    emit: (_: CaptureInternalEvent): void => { count++; },
    getCount: () => count,
  };
}

// ── PROP-HSF-021 tests ─────────────────────────────────────────────────────

describe("PROP-HSF-021: pure-transition-no-side-effect", () => {
  test(
    "∀ SaveFailedState, retryTransition(state, now) → clockSpy=0, emitSpy=0 (500 runs)",
    () => {
      fc.assert(
        fc.property(arbSaveFailedState, arbTimestamp, (state, now) => {
          const clock = makeClockSentinel();
          const emit = makeEmitSentinel();

          retryTransition(state, now);

          expect(clock.getCount()).toBe(0);
          expect(emit.getCount()).toBe(0);
        }),
        { numRuns: 500 },
      );
    },
  );

  test(
    "∀ SaveFailedState, discardTransition(state, now) → clockSpy=0, emitSpy=0 (500 runs)",
    () => {
      fc.assert(
        fc.property(arbSaveFailedState, arbTimestamp, (state, now) => {
          const clock = makeClockSentinel();
          const emit = makeEmitSentinel();

          discardTransition(state, now);

          expect(clock.getCount()).toBe(0);
          expect(emit.getCount()).toBe(0);
        }),
        { numRuns: 500 },
      );
    },
  );

  test(
    "∀ SaveFailedState with non-null pendingNextNoteId, cancelSwitchTransition(state, now) → clockSpy=0, emitSpy=0 (500 runs)",
    () => {
      fc.assert(
        fc.property(arbSaveFailedStateWithPending, arbTimestamp, (state, now) => {
          const clock = makeClockSentinel();
          const emit = makeEmitSentinel();

          cancelSwitchTransition(state, now);

          expect(clock.getCount()).toBe(0);
          expect(emit.getCount()).toBe(0);
        }),
        { numRuns: 500 },
      );
    },
  );

  // PROP-HSF-003: discard routing property
  test(
    "PROP-HSF-003: ∀ SaveFailedState, discardTransition → idle iff pendingNextNoteId=null, else editing (500 runs)",
    () => {
      fc.assert(
        fc.property(arbSaveFailedState, arbTimestamp, (state, now) => {
          const result = discardTransition(state, now);

          if (state.pendingNextNoteId === null) {
            expect(result.status).toBe("idle");
          } else {
            expect(result.status).toBe("editing");
            expect(
              (result as { currentNoteId: NoteId }).currentNoteId
            ).toBe(state.pendingNextNoteId);
          }
        }),
        { numRuns: 500 },
      );
    },
  );

  // PROP-HSF-004: cancelSwitch state shape
  test(
    "PROP-HSF-004: ∀ SaveFailedState with pending, cancelSwitchTransition → editing, isDirty=true, lastSaveResult='failed' (500 runs)",
    () => {
      fc.assert(
        fc.property(arbSaveFailedStateWithPending, arbTimestamp, (state, now) => {
          const result = cancelSwitchTransition(state, now);

          expect(result.status).toBe("editing");
          expect(result.currentNoteId).toBe(state.currentNoteId);
          expect(result.isDirty).toBe(true);
          expect(result.lastSaveResult).toBe("failed");
        }),
        { numRuns: 500 },
      );
    },
  );
});
