/**
 * debounceSchedule.ts — pure idle-save debounce scheduling logic
 *
 * Pure core module: deterministic, no side effects, no forbidden APIs.
 * See verification-architecture.md §2 for the canonical purity-audit pattern.
 *
 * All timestamps are supplied by the caller as numbers (milliseconds since
 * some epoch). This module NEVER calls Date.now() — the caller provides nowMs.
 */

/**
 * REQ-EDIT-004: Named exported constant so tests can control via vi.useFakeTimers().
 * Value locked to 2000 per behavioral-spec.md §3.2 and sprint-1 contract CRIT-003.
 */
export const IDLE_SAVE_DEBOUNCE_MS = 2000;

/**
 * Pure helper: the timestamp at which the idle save should fire given the
 * last edit. Used to schedule the setTimeout delay in the impure shell.
 */
export function nextFireAt(lastEditTimestamp: number, debounceMs: number): number {
  return lastEditTimestamp + debounceMs;
}

/**
 * RD-019, CRIT-009: Locked signature from behavioral-spec.md §12 and
 * verification-architecture.md §2.
 *
 * Given the latest edit timestamp, last save timestamp, debounce window, and
 * current clock time, returns whether and when the idle save should fire.
 *
 * shouldFire === true iff:
 *   lastEditAt + debounceMs <= nowMs AND lastSaveAt <= lastEditAt
 * fireAt === lastEditAt + debounceMs when shouldFire is relevant.
 * fireAt === null when the last save is already more recent than the fire point.
 */
export function computeNextFireAt(params: {
  lastEditAt: number;
  lastSaveAt: number;
  debounceMs: number;
  nowMs: number;
}): { shouldFire: boolean; fireAt: number | null } {
  const { lastEditAt, lastSaveAt, debounceMs, nowMs } = params;
  const firePoint = lastEditAt + debounceMs;

  // If a save has occurred after the last edit, no idle save is needed
  if (lastSaveAt > lastEditAt) {
    return { shouldFire: false, fireAt: null };
  }

  // Debounce window has not yet elapsed
  if (nowMs < firePoint) {
    return { shouldFire: false, fireAt: firePoint };
  }

  // Debounce elapsed and not yet saved since last edit
  return { shouldFire: true, fireAt: firePoint };
}

/**
 * PROP-EDIT-003, PROP-EDIT-004: Property-test predicate accepting a sequence
 * of edit timestamps for arbitrary-input enumeration.
 *
 * Returns true iff an idle save should fire given:
 * - editTimestamps: all edit events (at least one required)
 * - lastSaveTimestamp: time of the most recent save (0 if never saved)
 * - debounceMs: quiescence window
 * - nowMs: current clock time (supplied by caller, never Date.now())
 *
 * Production usage passes a 1-element array; property tests may pass many.
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

  const lastEditAt = Math.max(...editTimestamps);

  // If a save has occurred after the last edit, no idle save is needed
  if (lastSaveTimestamp > lastEditAt) {
    return false;
  }

  const firePoint = lastEditAt + debounceMs;
  return nowMs >= firePoint;
}
