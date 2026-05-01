/**
 * PROP-HSF-001: retry-determinism
 * Tier 1 — fast-check, 1000 runs
 * Required: true
 *
 * Property: ∀ (state: SaveFailedState, now: Timestamp),
 *   calling retryTransition(state, now) twice with identical inputs
 *   produces structurally equal SavingState outputs.
 *
 * Covers: REQ-HSF-002, REQ-HSF-009
 *
 * Implementation note: retryTransition is a pure synchronous function exported
 * from transitions.ts. It is called directly — no async, no orchestrator, no ports.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type {
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type { SaveFailedState } from "promptnotes-domain-types/capture/states";

import { retryTransition } from "../../../handle-save-failure/transitions.js";

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

// ── PROP-HSF-001: retry-determinism ──────────────────────────────────────

describe("PROP-HSF-001: retry transition determinism", () => {
  test(
    "∀ SaveFailedState, retryTransition(state, now) called twice with identical inputs → identical SavingState outputs (1000 runs)",
    () => {
      fc.assert(
        fc.property(
          arbSaveFailedState,
          arbTimestamp,
          (state, fixedNow) => {
            const out1 = retryTransition(state, fixedNow);
            const out2 = retryTransition(state, fixedNow);

            // Both calls must produce structurally equal results
            expect(out1).toEqual(out2);
          },
        ),
        { numRuns: 1000 },
      );
    },
  );

  test(
    "PROP-HSF-002: ∀ SaveFailedState, retryTransition → SavingState.status='saving' ∧ currentNoteId preserved (500 runs)",
    () => {
      fc.assert(
        fc.property(
          arbSaveFailedState,
          arbTimestamp,
          (state, fixedNow) => {
            const result = retryTransition(state, fixedNow);

            expect(result.status).toBe("saving");
            expect(
              (result as { currentNoteId: NoteId }).currentNoteId
            ).toBe(state.currentNoteId);
          },
        ),
        { numRuns: 500 },
      );
    },
  );
});
