// handle-save-failure/cancel-switch.ts
// Pure transition: save-failed → editing(currentNoteId) with isDirty=true, lastSaveResult='failed'
//
// REQ-HSF-005: Branch — CancelSwitch (valid: pendingNextFocus present)
// PROP-HSF-004: cancelSwitch state shape (all 7 fields including focusedBlockId: null)
// PROP-HSF-007: pendingNextFocus absent from resulting EditingState
// PROP-HSF-021: pure-transition-no-side-effect

import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { SaveFailedState, EditingState } from "promptnotes-domain-types/capture/states";

/**
 * Pure transition: save-failed → editing(currentNoteId).
 *
 * The user cancels the pending note switch and continues editing the current note.
 * The current note's unsaved content is retained (isDirty: true).
 * The failed-save history is preserved so the auto-save system can display a warning.
 * focusedBlockId is null — UI re-focuses from its own state (REQ-HSF-005 Option A).
 *
 * No Clock.now() call, no emit — the orchestrator provides `now` and handles effects.
 */
export function cancelSwitch(
  state: SaveFailedState,
  _now: Timestamp,
): EditingState {
  return {
    status: "editing",
    currentNoteId: state.currentNoteId,
    focusedBlockId: null,
    isDirty: true,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: "failed",
  };
}
