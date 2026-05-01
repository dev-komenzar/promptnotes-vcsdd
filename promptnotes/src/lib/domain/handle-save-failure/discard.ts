// handle-save-failure/discard.ts
// Pure transition: save-failed → editing(pendingNextNoteId) | idle
//
// REQ-HSF-003: Branch — DiscardCurrentSession without pendingNextNoteId
// REQ-HSF-004: Branch — DiscardCurrentSession with pendingNextNoteId
// PROP-HSF-003: discard routing
// PROP-HSF-006: pendingNextNoteId routing — discard with pending (all 6 EditingState fields)
// PROP-HSF-021: pure-transition-no-side-effect

import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type {
  SaveFailedState,
  EditingState,
  IdleState,
} from "promptnotes-domain-types/capture/states";

/**
 * Pure transition: save-failed → editing(pendingNextNoteId) or idle.
 *
 * Routing is determined by state.pendingNextNoteId:
 *   - null  → IdleState  (REQ-HSF-003)
 *   - non-null → EditingState for pendingNextNoteId (REQ-HSF-004)
 *
 * No Clock.now() call, no emit — the orchestrator provides `now` and handles effects.
 *
 * REQ-HSF-004 AC — when pendingNextNoteId is non-null, resulting EditingState has:
 *   - status: 'editing'
 *   - currentNoteId: state.pendingNextNoteId
 *   - isDirty: false  (fresh session; pending note not yet edited)
 *   - lastInputAt: null  (fresh session)
 *   - idleTimerHandle: null  (no timer running)
 *   - lastSaveResult: null  (fresh session)
 */
export function discard(
  state: SaveFailedState,
  _now: Timestamp,
): EditingState | IdleState {
  if (state.pendingNextNoteId === null) {
    // REQ-HSF-003: no pending note → transition to idle
    const idleState: IdleState = {
      status: "idle",
    };
    return idleState;
  }

  // REQ-HSF-004: pending note exists → begin editing the pending note
  const editingState: EditingState = {
    status: "editing",
    currentNoteId: state.pendingNextNoteId,
    isDirty: false,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  };
  return editingState;
}
