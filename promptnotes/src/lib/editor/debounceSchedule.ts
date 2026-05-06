/**
 * debounceSchedule.ts — pure idle-save debounce scheduling logic (Sprint 7)
 *
 * Phase 2a stub: every function body throws 'not-implemented: phase-2a stub'.
 * This makes all tests that call these functions fail at runtime (Red phase).
 *
 * Pure core module: must never import @tauri-apps/api or any forbidden API.
 * Signatures match verification-architecture.md §2 and behavioral-spec.md §12 exactly.
 *
 * Shell pattern: on each block-edit dispatch, the shell calls
 *   cancelIdleSave(handle) then scheduleIdleSave(fireAt - clock.now(), callback)
 * based on computeNextFireAt. The shell stores only lastEditTimestamp.
 */

/**
 * REQ-EDIT-012: Named exported constant for the idle-save debounce window.
 * Value locked to 2000ms per behavioral-spec.md §3.3 IDLE_SAVE_DEBOUNCE_MS.
 */
export const IDLE_SAVE_DEBOUNCE_MS = 2000;

/**
 * PROP-EDIT-003, CRIT-705
 * Pure helper: the timestamp at which the idle save should fire.
 */
export function nextFireAt(lastEditTimestamp: number, debounceMs: number): number {
  void lastEditTimestamp;
  void debounceMs;
  throw new Error('not-implemented: phase-2a stub');
}

/**
 * PROP-EDIT-003, CRIT-705
 * Given the latest edit timestamp, last save timestamp, debounce window, and current
 * clock time, returns whether and when the idle save should fire.
 *
 * shouldFire === true iff:
 *   lastEditAt + debounceMs <= nowMs AND lastSaveAt <= lastEditAt
 */
export function computeNextFireAt(params: {
  lastEditAt: number;
  lastSaveAt: number;
  debounceMs: number;
  nowMs: number;
}): { shouldFire: boolean; fireAt: number | null } {
  void params;
  throw new Error('not-implemented: phase-2a stub');
}

/**
 * PROP-EDIT-003, PROP-EDIT-004
 * Property-test predicate accepting a sequence of edit timestamps.
 * Returns true iff an idle save should fire given:
 * - editTimestamps: all edit events
 * - lastSaveTimestamp: time of the most recent save (0 if never saved)
 * - debounceMs: quiescence window
 * - nowMs: current clock time
 */
export function shouldFireIdleSave(
  editTimestamps: readonly number[],
  lastSaveTimestamp: number,
  debounceMs: number,
  nowMs: number
): boolean {
  void editTimestamps;
  void lastSaveTimestamp;
  void debounceMs;
  void nowMs;
  throw new Error('not-implemented: phase-2a stub');
}
