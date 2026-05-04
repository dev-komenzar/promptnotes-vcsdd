/**
 * debounceTimer.ts — setTimeout/clearTimeout wrapper (effectful shell, Sprint 2)
 *
 * Receives an injected clock: { now(): number } so tests can use deterministic
 * timestamps without vi.useFakeTimers() at the module level.
 */

export interface DebounceTimer {
  scheduleIdleSave(at: number, callback: () => void): void;
  cancel(): void;
}

export function createDebounceTimer(clock: { now(): number }): DebounceTimer {
  let handle: ReturnType<typeof setTimeout> | null = null;

  return {
    scheduleIdleSave(at: number, callback: () => void): void {
      // Cancel any existing timer before scheduling a new one
      if (handle !== null) {
        clearTimeout(handle);
        handle = null;
      }
      const delay = at - clock.now();
      handle = setTimeout(() => {
        handle = null;
        callback();
      }, delay);
    },
    cancel(): void {
      if (handle !== null) {
        clearTimeout(handle);
        handle = null;
      }
    },
  };
}
