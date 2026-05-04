/**
 * debounceTimer.ts — setTimeout/clearTimeout wrapper (effectful shell, Sprint 2)
 *
 * Receives an injected clock: { now(): number } so tests can use deterministic
 * timestamps without vi.useFakeTimers() at the module level.
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
