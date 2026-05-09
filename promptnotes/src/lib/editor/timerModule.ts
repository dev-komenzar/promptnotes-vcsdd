/**
 * timerModule.ts — impure timer wrapper for idle-save scheduling (Sprint 7)
 *
 * Wraps setTimeout/clearTimeout. Provides scheduleIdleSave and cancelIdleSave.
 * Tests substitute via vi.useFakeTimers().
 *
 * Only one timer is active at a time; scheduling a new one cancels the previous.
 */

/** Opaque handle returned by scheduleIdleSave. */
export type TimerHandle = ReturnType<typeof setTimeout> | null;

/**
 * Schedule an idle-save callback to fire after delayMs milliseconds.
 * Returns a TimerHandle for subsequent cancellation.
 *
 * @param delayMs Milliseconds to wait before firing.
 * @param callback Function to call when the timer fires.
 */
export function scheduleIdleSave(delayMs: number, callback: () => void): TimerHandle {
  return setTimeout(callback, delayMs);
}

/**
 * Cancel a pending idle-save timer.
 * Safe to call with a null handle (no-op).
 *
 * @param handle The TimerHandle returned by scheduleIdleSave.
 */
export function cancelIdleSave(handle: TimerHandle): void {
  if (handle !== null) {
    clearTimeout(handle);
  }
}
