// handle-save-failure/transitions.ts
// Re-exports of all pure EditingSessionTransitions for the HandleSaveFailure workflow.
//
// PROP-HSF-021: __verify__ harness imports these to assert no Clock.now() or emit() calls.
//
// REQ-HSF-002: retry — save-failed → saving
// REQ-HSF-003: discard (no pending) — save-failed → idle
// REQ-HSF-004: discard (with pending) — save-failed → editing(pendingNextNoteId)
// REQ-HSF-005: cancelSwitch — save-failed → editing(currentNoteId)

export { retry as retryTransition } from "./retry.js";
export { discard as discardTransition } from "./discard.js";
export { cancelSwitch as cancelSwitchTransition } from "./cancel-switch.js";
