// handle-save-failure/retry.ts
// Pure transition: save-failed → saving
//
// REQ-HSF-002: Branch — RetrySave
// PROP-HSF-001: retry-determinism
// PROP-HSF-002: retry state shape
// PROP-HSF-021: pure-transition-no-side-effect

import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { SaveFailedState, SavingState } from "promptnotes-domain-types/capture/states";

/**
 * Pure transition: save-failed → saving.
 *
 * Deterministic: given identical inputs, always produces an identical SavingState.
 * No Clock.now() call, no emit — the orchestrator provides `now` and handles effects.
 *
 * REQ-HSF-002 AC:
 *   - resulting state has status === 'saving'
 *   - resulting state has currentNoteId === state.currentNoteId
 *   - savingStartedAt === now (the orchestrator-provided timestamp)
 */
export function retry(state: SaveFailedState, now: Timestamp): SavingState {
  return {
    status: "saving",
    currentNoteId: state.currentNoteId,
    savingStartedAt: now,
  };
}
