/**
 * debounceTimer.dom.vitest.ts — CRIT-011
 *
 * Verifies:
 * - scheduleIdleSave(at, callback) computes delay = at - clock.now() and calls setTimeout
 * - cancel() calls clearTimeout on the active handle
 * - Re-scheduling cancels the previous timer before setting the new one
 *
 * RED phase: all methods throw 'not implemented (Red phase)'.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

import { createDebounceTimer } from '../../debounceTimer.js';
import type { DebounceTimer } from '../../debounceTimer.js';

describe('DebounceTimer — CRIT-011', () => {
  let timer: DebounceTimer;
  let nowMs: number;
  const clock = { now: () => nowMs };

  beforeEach(() => {
    vi.useFakeTimers();
    nowMs = 1000;
    timer = createDebounceTimer(clock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('scheduleIdleSave(at, cb): setTimeout is called with delay = at - clock.now()', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const callback = vi.fn();
    const at = 3000; // fire at 3000ms
    nowMs = 1000;     // now is 1000ms → delay = 2000ms

    timer.scheduleIdleSave(at, callback);

    expect(setTimeoutSpy).toHaveBeenCalledOnce();
    expect(setTimeoutSpy.mock.calls[0]![1]).toBe(2000);
  });

  test('callback fires after advancing fake timers by delay', () => {
    const callback = vi.fn();
    const at = 3000;
    nowMs = 1000; // delay = 2000ms

    timer.scheduleIdleSave(at, callback);
    vi.advanceTimersByTime(1999);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
  });

  test('cancel() prevents the callback from firing', () => {
    const callback = vi.fn();
    const at = 3000;
    nowMs = 1000;

    timer.scheduleIdleSave(at, callback);
    timer.cancel();
    vi.advanceTimersByTime(3000);
    expect(callback).not.toHaveBeenCalled();
  });

  test('cancel() calls clearTimeout', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const callback = vi.fn();
    const at = 3000;
    nowMs = 1000;

    timer.scheduleIdleSave(at, callback);
    timer.cancel();

    expect(clearTimeoutSpy).toHaveBeenCalledOnce();
  });

  test('re-scheduling cancels the previous timer (only one callback fires)', () => {
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    nowMs = 1000;

    timer.scheduleIdleSave(3000, callback1); // delay = 2000ms
    nowMs = 1500; // advance mock clock before rescheduling
    timer.scheduleIdleSave(3500, callback2); // delay = 2000ms from new now

    vi.advanceTimersByTime(5000);
    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalledOnce();
  });

  test('cancel() before any scheduleIdleSave does not throw', () => {
    expect(() => timer.cancel()).not.toThrow();
  });
});
