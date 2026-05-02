// handle-save-failure/cancel-switch.ts
// Pure transition: save-failed → editing(currentNoteId) with isDirty=true, lastSaveResult='failed'
//
// REQ-HSF-005: Branch — CancelSwitch (valid: pendingNextNoteId present)
// PROP-HSF-004: cancelSwitch state shape
// PROP-HSF-007: pendingNextNoteId absent from resulting EditingState
// PROP-HSF-021: pure-transition-no-side-effect

import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { SaveFailedState, EditingState } from "promptnotes-domain-types/capture/states";

/**
 * Pure transition: save-failed → editing(currentNoteId).
 *
 * The user cancels the pending note switch and continues editing the current note.
 * The current note's unsaved content is retained (isDirty: true).
 * The failed-save history is preserved so the auto-save system can display a warning.
 *
 * Precondition: state.pendingNextNoteId !== null (enforced by the orchestrator before calling).
 *
 * No Clock.now() call, no emit — the orchestrator provides `now` and handles effects.
 *
 * REQ-HSF-005 AC — resulting EditingState has:
 *   - status: 'editing'
 *   - currentNoteId: state.currentNoteId  (same note; switch cancelled)
 *   - isDirty: true  (unsaved content retained)
 *   - lastInputAt: null  (restoration moment; no new input timestamp)
 *   - idleTimerHandle: null  (no timer running at restoration)
 *   - lastSaveResult: 'failed'  (last save did not succeed; preserved for UI warning)
 */
export function cancelSwitch(
  state: SaveFailedState,
  _now: Timestamp,
): EditingState {
  return {
    status: "editing",
    currentNoteId: state.currentNoteId,
    isDirty: true,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: "failed",
  };
}
