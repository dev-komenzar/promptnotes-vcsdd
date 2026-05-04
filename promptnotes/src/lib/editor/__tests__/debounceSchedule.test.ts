/**
 * debounceSchedule.test.ts — Tier 1 unit tests (bun:test)
 *
 * Coverage:
 *   PROP-EDIT-003 boundary values (at-threshold, one-ms-before, one-ms-after)
 *   PROP-EDIT-004 boundary values (blur timestamp before/after pending fire time)
 *   CRIT-003, CRIT-009
 *   REQ-EDIT-004, REQ-EDIT-005, REQ-EDIT-006, REQ-EDIT-007, EC-EDIT-001
 *
 * All timestamps are supplied inline as numbers; no Date.now() calls.
 *
 * RED PHASE: stubs throw — all assertions FAIL.
 */

import { describe, test, expect } from 'bun:test';
import {
  IDLE_SAVE_DEBOUNCE_MS,
  computeNextFireAt,
  shouldFireIdleSave,
  nextFireAt,
} from '$lib/editor/debounceSchedule';

// ── CRIT-003: IDLE_SAVE_DEBOUNCE_MS constant ──────────────────────────────────

describe('IDLE_SAVE_DEBOUNCE_MS constant (CRIT-003)', () => {
  test('IDLE_SAVE_DEBOUNCE_MS is exactly 2000', () => {
    expect(IDLE_SAVE_DEBOUNCE_MS).toBe(2000);
  });
});

// ── CRIT-009: computeNextFireAt boundary assertions ───────────────────────────

describe('computeNextFireAt (CRIT-009, PROP-EDIT-003 boundary)', () => {
  // Scenario: lastEditAt=1000, debounceMs=2000, fireAt=3000

  test('exactly at threshold: nowMs===lastEditAt+debounceMs → shouldFire=true', () => {
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 0,
      debounceMs: 2000,
      nowMs: 3000,
    });
    expect(result.shouldFire).toBe(true);
    expect(result.fireAt).toBe(3000);
  });

  test('one ms before threshold: nowMs===lastEditAt+debounceMs-1 → shouldFire=false', () => {
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 0,
      debounceMs: 2000,
      nowMs: 2999,
    });
    expect(result.shouldFire).toBe(false);
    expect(result.fireAt).toBe(3000);
  });

  test('one ms after threshold: nowMs===lastEditAt+debounceMs+1 → shouldFire=true', () => {
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 0,
      debounceMs: 2000,
      nowMs: 3001,
    });
    expect(result.shouldFire).toBe(true);
    expect(result.fireAt).toBe(3000);
  });

  test('lastSaveAt > lastEditAt+debounceMs → shouldFire=false, fireAt=null (CRIT-009)', () => {
    // Last save already happened after the fire point → no need to fire
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 4000, // saved after what would be the fire time (3000)
      debounceMs: 2000,
      nowMs: 5000,
    });
    expect(result.shouldFire).toBe(false);
    expect(result.fireAt).toBeNull();
  });

  test('lastSaveAt === lastEditAt → shouldFire=false when debounce not elapsed', () => {
    // Edited and saved at the same time, debounce hasn't elapsed yet
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 1000,
      debounceMs: 2000,
      nowMs: 2000,
    });
    // Saved at 1000 which equals lastEditAt → no pending idle save needed
    expect(result.shouldFire).toBe(false);
  });

  test('lastSaveAt between 0 and lastEditAt → shouldFire depends on debounce elapsed', () => {
    // Last save was before the edit; debounce has elapsed
    const result = computeNextFireAt({
      lastEditAt: 2000,
      lastSaveAt: 500,
      debounceMs: 1000,
      nowMs: 3100, // 2000 + 1000 = 3000 ≤ 3100
    });
    expect(result.shouldFire).toBe(true);
  });

  test('fresh editor: lastEditAt=0, lastSaveAt=0 → shouldFire=true once debounce elapsed', () => {
    const result = computeNextFireAt({
      lastEditAt: 0,
      lastSaveAt: 0,
      debounceMs: 2000,
      nowMs: 2000, // exactly at threshold
    });
    // Ambiguous: save and edit both at 0. Depends on implementation.
    // We just assert structural correctness — no throw, defined fields.
    expect(typeof result.shouldFire).toBe('boolean');
  });

  test('very large timestamps do not cause overflow', () => {
    const result = computeNextFireAt({
      lastEditAt: 1_700_000_000_000,
      lastSaveAt: 1_699_000_000_000,
      debounceMs: 2000,
      nowMs: 1_700_000_003_000,
    });
    expect(typeof result.shouldFire).toBe('boolean');
    expect(result.fireAt === null || typeof result.fireAt === 'number').toBe(true);
  });
});

// ── PROP-EDIT-004: blur-cancels-idle boundary ─────────────────────────────────

describe('PROP-EDIT-004 boundary: lastSaveAt > lastEditAt → shouldFire=false', () => {
  test('if blur-save completed (lastSaveAt > lastEditAt), idle should NOT fire', () => {
    // Model: blur save completed at t=3500, meaning lastSaveAt=3500
    // But edit was at t=1000, debounceMs=2000, fireAt=3000
    // Since lastSaveAt (3500) > fireAt (3000), no idle fire needed
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 3500,
      debounceMs: 2000,
      nowMs: 5000,
    });
    expect(result.shouldFire).toBe(false);
  });

  test('if blur save completed AFTER the fire point, idle would be stale', () => {
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 3001, // saved 1ms after the fire point
      debounceMs: 2000,
      nowMs: 4000,
    });
    expect(result.shouldFire).toBe(false);
    expect(result.fireAt).toBeNull();
  });

  test('if blur save completed BEFORE the fire point but after edit, idle should still not fire', () => {
    // Edit at 1000, fireAt=3000, save at 1500 (after edit, before fireAt)
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 1500,
      debounceMs: 2000,
      nowMs: 4000,
    });
    // Save at 1500 is after lastEditAt (1000), so this is a "was already saved" case
    expect(result.shouldFire).toBe(false);
  });

  test('if no save has occurred and debounce elapsed, idle fires', () => {
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 0, // never saved
      debounceMs: 2000,
      nowMs: 3000,
    });
    expect(result.shouldFire).toBe(true);
  });
});

// ── shouldFireIdleSave ────────────────────────────────────────────────────────

describe('shouldFireIdleSave (PROP-EDIT-003, EC-EDIT-001)', () => {
  test('single edit timestamp: fires when debounce elapsed', () => {
    expect(
      shouldFireIdleSave([1000], 0, 2000, 3000)
    ).toBe(true);
  });

  test('single edit timestamp: does NOT fire one ms before threshold', () => {
    expect(
      shouldFireIdleSave([1000], 0, 2000, 2999)
    ).toBe(false);
  });

  test('last edit in a burst determines fire time', () => {
    // Rapid burst: edits at 100, 200, 300, 400 — last edit at 400
    // Debounce 2000ms → fires at 2400
    expect(shouldFireIdleSave([100, 200, 300, 400], 0, 2000, 2400)).toBe(true);
    expect(shouldFireIdleSave([100, 200, 300, 400], 0, 2000, 2399)).toBe(false);
  });

  test('returns false when lastSaveAt is after last edit (already saved)', () => {
    expect(shouldFireIdleSave([1000], 2000, 2000, 5000)).toBe(false);
  });

  test('returns false for empty edit timestamps array (no edits, nothing to save)', () => {
    // No edits → should not fire
    const result = shouldFireIdleSave([], 0, 2000, 5000);
    // No edit timestamps: implementation should return false (nothing to save)
    expect(result).toBe(false);
  });

  test('rapid-burst scenario: only fires after quiescence (EC-EDIT-001)', () => {
    const burst = Array.from({ length: 100 }, (_, i) => i * 10); // 0, 10, 20, ..., 990
    const lastEdit = 990;
    const debounceMs = 2000;
    const fireAt = lastEdit + debounceMs; // 2990

    expect(shouldFireIdleSave(burst, 0, debounceMs, fireAt - 1)).toBe(false);
    expect(shouldFireIdleSave(burst, 0, debounceMs, fireAt)).toBe(true);
  });
});

// ── nextFireAt ────────────────────────────────────────────────────────────────

describe('nextFireAt pure helper', () => {
  test('nextFireAt returns lastEditTimestamp + debounceMs', () => {
    expect(nextFireAt(1000, 2000)).toBe(3000);
  });

  test('nextFireAt with zero lastEdit returns debounceMs', () => {
    expect(nextFireAt(0, 2000)).toBe(2000);
  });

  test('nextFireAt is consistent with IDLE_SAVE_DEBOUNCE_MS', () => {
    const editAt = 5000;
    expect(nextFireAt(editAt, IDLE_SAVE_DEBOUNCE_MS)).toBe(editAt + IDLE_SAVE_DEBOUNCE_MS);
  });
});
