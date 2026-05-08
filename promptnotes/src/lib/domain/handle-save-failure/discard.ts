// handle-save-failure/discard.ts
// Pure transition: save-failed → editing(pendingNextFocus) | idle
//
// REQ-HSF-003: Branch — DiscardCurrentSession without pendingNextFocus
// REQ-HSF-004: Branch — DiscardCurrentSession with pendingNextFocus (propagates blockId)
// PROP-HSF-003: discard routing
// PROP-HSF-006: pendingNextFocus routing — discard with pending (all 7 EditingState fields)
// PROP-HSF-021: pure-transition-no-side-effect

import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type {
  SaveFailedState,
  EditingState,
  IdleState,
} from "promptnotes-domain-types/capture/states";

/**
 * Pure transition: save-failed → editing(pendingNextFocus) or idle.
 *
 * Routing is determined by state.pendingNextFocus:
 *   - null  → IdleState  (REQ-HSF-003)
 *   - non-null → EditingState for pendingNextFocus.noteId with focusedBlockId=pendingNextFocus.blockId (REQ-HSF-004)
 *
 * No Clock.now() call, no emit — the orchestrator provides `now` and handles effects.
 */
export function discard(
  state: SaveFailedState,
  _now: Timestamp,
): EditingState | IdleState {
  if (state.pendingNextFocus === null) {
    // REQ-HSF-003: no pending note → transition to idle
    const idleState: IdleState = {
      status: "idle",
    };
    return idleState;
  }

  // REQ-HSF-004: pending focus exists → begin editing the pending note at the pending block
  const editingState: EditingState = {
    status: "editing",
    currentNoteId: state.pendingNextFocus.noteId,
    focusedBlockId: state.pendingNextFocus.blockId,
    isDirty: false,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  };
  return editingState;
}
