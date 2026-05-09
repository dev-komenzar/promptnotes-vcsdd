/**
 * debounceSchedule.ts — pure idle-save debounce scheduling logic (Sprint 7)
 *
 * Phase 2b implementation: all stubs replaced with real logic.
 *
 * Pure core module: must never import @tauri-apps/api or any forbidden API.
 * Signatures match verification-architecture.md §2 and behavioral-spec.md §12 exactly.
 *
 * Shell pattern: on each block-edit dispatch, the shell calls
 *   cancelIdleSave(handle) then scheduleIdleSave(fireAt - clock.now(), callback)
 * based on computeNextFireAt. The shell stores only lastEditTimestamp.
 */

/**
 * REQ-BE-022 / PROP-BE-012: Named exported constant for the idle-save debounce window.
 * Value locked to 2000ms per ui-block-editor behavioral-spec.md REQ-BE-022.
 */
export const IDLE_SAVE_DEBOUNCE_MS = 2000;

/**
 * REQ-BE-023 / PROP-BE-013
 * Pure helper: the timestamp at which the idle save should fire.
 */
export function nextFireAt(lastEditTimestamp: number, debounceMs: number): number {
  return lastEditTimestamp + debounceMs;
}

/**
 * REQ-BE-024 / PROP-BE-014, PROP-BE-015, PROP-BE-016
 * Given the latest edit timestamp, last save timestamp, debounce window, and current
 * clock time, returns whether and when the idle save should fire.
 *
 * shouldFire === true iff:
 *   lastEditAt + debounceMs <= nowMs AND lastSaveAt < lastEditAt
 *
 * fireAt is lastEditAt + debounceMs when there is a pending unsaved edit;
 * fireAt is null when lastSaveAt >= lastEditAt (save covers all edits).
 */
export function computeNextFireAt(params: {
  lastEditAt: number;
  lastSaveAt: number;
  debounceMs: number;
  nowMs: number;
}): { shouldFire: boolean; fireAt: number | null } {
  const { lastEditAt, lastSaveAt, debounceMs, nowMs } = params;
  const fireTime = lastEditAt + debounceMs;

  // If a real save (lastSaveAt > 0) happened at or after the last edit, no fire needed.
  // lastSaveAt === 0 is the "never saved" sentinel; treat as no save.
  if (lastSaveAt !== 0 && lastSaveAt >= lastEditAt) {
    return { shouldFire: false, fireAt: null };
  }

  // There is an unsaved edit; schedule or fire at fireTime.
  const shouldFire = nowMs >= fireTime;
  return { shouldFire, fireAt: fireTime };
}

/**
 * REQ-BE-025 / PROP-BE-017, PROP-BE-018, PROP-BE-019, PROP-BE-020
 * Property-test predicate accepting a sequence of edit timestamps.
 * Returns true iff an idle save should fire given:
 * - editTimestamps: all edit events
 * - lastSaveTimestamp: time of the most recent save (0 if never saved)
 * - debounceMs: quiescence window
 * - nowMs: current clock time
 *
 * Per spec: true iff editTimestamps.length > 0
 *   AND last element + debounceMs <= nowMs
 *   AND lastSaveTimestamp <= last element (save does not cover the last edit)
 */
export function shouldFireIdleSave(
  editTimestamps: readonly number[],
  lastSaveTimestamp: number,
  debounceMs: number,
  nowMs: number
): boolean {
  if (editTimestamps.length === 0) {
    return false;
  }

  // The most recent edit governs the debounce window.
  // Use Math.max to find the latest timestamp regardless of insertion order.
  const lastEditAt = Math.max(...editTimestamps);

  // If a real save (lastSaveTimestamp > 0) happened at or after the last edit,
  // the edit is covered — no idle save needed.
  // lastSaveTimestamp === 0 is the "never saved" sentinel; an edit at time 0
  // is still unsaved in that case.
  if (lastSaveTimestamp !== 0 && lastSaveTimestamp >= lastEditAt) {
    return false;
  }

  // Fire iff debounce window has elapsed.
  return lastEditAt + debounceMs <= nowMs;
}
