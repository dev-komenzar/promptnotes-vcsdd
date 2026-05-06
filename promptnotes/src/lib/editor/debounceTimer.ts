/**
 * debounceTimer.ts — setTimeout/clearTimeout wrapper (effectful shell, Sprint 2)
 *
 * Receives an injected clock: { now(): number } so tests can use deterministic
 * timestamps without vi.useFakeTimers() at the module level.
 *
 * NOTE: As of Sprint 7 this module is not imported by any editor component.
 * The Sprint 7 implementation uses the simpler timerModule.ts (scheduleIdleSave /
 * cancelIdleSave) paired with the pure computeNextFireAt from debounceSchedule.ts.
 * This module's clock-injection approach is more test-friendly for absolute-time
 * scheduling; retained if a future sprint requires absolute-epoch timer scheduling.
 */

export interface DebounceTimer {
  /** Schedule an idle-save callback to fire at absolute epoch millisecond `at`. */
  scheduleIdleSave(at: number, callback: () => void): void;
  /** Cancel any pending idle-save timer. Safe to call when no timer is active. */
  cancel(): void;
}

export function createDebounceTimer(clock: { now(): number }): DebounceTimer {
  let handle: ReturnType<typeof setTimeout> | null = null;

  function clearHandle(): void {
    if (handle !== null) {
      clearTimeout(handle);
      handle = null;
    }
  }

  return {
    scheduleIdleSave(at: number, callback: () => void): void {
      clearHandle();
      const delay = at - clock.now();
      handle = setTimeout(() => {
        handle = null;
        callback();
      }, delay);
    },
    cancel(): void {
      clearHandle();
    },
  };
}
