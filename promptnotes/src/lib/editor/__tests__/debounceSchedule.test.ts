/**
 * debounceSchedule.test.ts — Tier 1 unit tests (bun:test)
 *
 * Sprint 7 Red phase. All tests MUST FAIL because the stubs throw.
 *
 * Coverage:
 *   PROP-EDIT-003 (debounce semantics — boundary tests for computeNextFireAt)
 *   PROP-EDIT-004 (blur-cancels-idle pure model)
 *   CRIT-705 (locked signatures, boundary values, IDLE_SAVE_DEBOUNCE_MS===2000)
 *
 * REQ-EDIT references appear in test description strings for CRIT-700/CRIT-701 grep.
 */

import { describe, test, expect } from 'bun:test';
import {
  IDLE_SAVE_DEBOUNCE_MS,
  computeNextFireAt,
  shouldFireIdleSave,
  nextFireAt,
} from '$lib/editor/debounceSchedule';

// ── IDLE_SAVE_DEBOUNCE_MS constant ───────────────────────────────────────────

describe('IDLE_SAVE_DEBOUNCE_MS (REQ-EDIT-012, CRIT-705)', () => {
  test('REQ-EDIT-012: IDLE_SAVE_DEBOUNCE_MS equals 2000', () => {
    expect(IDLE_SAVE_DEBOUNCE_MS).toBe(2000);
  });
});

// ── nextFireAt ────────────────────────────────────────────────────────────────

describe('nextFireAt (PROP-EDIT-003, CRIT-705)', () => {
  test('nextFireAt(1000, 2000) === 3000', () => {
    expect(nextFireAt(1000, 2000)).toBe(3000);
  });

  test('nextFireAt(0, 2000) === 2000', () => {
    expect(nextFireAt(0, 2000)).toBe(2000);
  });

  test('nextFireAt is additive: lastEditTimestamp + debounceMs', () => {
    expect(nextFireAt(500, 1500)).toBe(2000);
  });
});

// ── computeNextFireAt ─────────────────────────────────────────────────────────

describe('computeNextFireAt (PROP-EDIT-003, REQ-EDIT-012, CRIT-705)', () => {
  test('CRIT-705: debounce elapsed, unsaved → shouldFire=true, fireAt=3000', () => {
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 0,
      debounceMs: 2000,
      nowMs: 3001,
    });
    expect(result).toEqual({ shouldFire: true, fireAt: 3000 });
  });

  test('CRIT-705: debounce not yet elapsed → shouldFire=false, fireAt=3000', () => {
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 0,
      debounceMs: 2000,
      nowMs: 2999,
    });
    expect(result).toEqual({ shouldFire: false, fireAt: 3000 });
  });

  test('CRIT-705: lastSaveAt after lastEditAt+debounceMs → shouldFire=false, fireAt=null', () => {
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 5000,
      debounceMs: 2000,
      nowMs: 6000,
    });
    expect(result).toEqual({ shouldFire: false, fireAt: null });
  });

  test('REQ-EDIT-012: exactly at debounce boundary (nowMs === lastEditAt + debounceMs) → shouldFire=true', () => {
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 0,
      debounceMs: 2000,
      nowMs: 3000,
    });
    expect(result.shouldFire).toBe(true);
    expect(result.fireAt).toBe(3000);
  });

  test('REQ-EDIT-012: one millisecond before boundary → shouldFire=false', () => {
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 0,
      debounceMs: 2000,
      nowMs: 2999,
    });
    expect(result.shouldFire).toBe(false);
  });

  test('PROP-EDIT-003: lastSaveAt === lastEditAt (saved exactly at edit time) → shouldFire=false, no re-save needed', () => {
    // When lastSaveAt === lastEditAt, the save covers the edit (non-zero lastSaveAt >= lastEditAt).
    // Per computeNextFireAt semantics: `lastSaveAt !== 0 && lastSaveAt >= lastEditAt` → no fire.
    // Most restrictive interpretation: shouldFire=false, fireAt=null (save already covers edit).
    // RD choice: treat simultaneous save as covering the edit to avoid spurious idle saves.
    const result = computeNextFireAt({
      lastEditAt: 1000,
      lastSaveAt: 1000,
      debounceMs: 2000,
      nowMs: 4000,
    });
    expect(result.shouldFire).toBe(false);
    expect(result.fireAt).toBeNull();
  });
});

// ── shouldFireIdleSave ────────────────────────────────────────────────────────

describe('shouldFireIdleSave (PROP-EDIT-003, PROP-EDIT-004, REQ-EDIT-012, REQ-EDIT-014)', () => {
  test('REQ-EDIT-012: single edit, debounce elapsed, not saved → true', () => {
    expect(shouldFireIdleSave([1000], 0, 2000, 3001)).toBe(true);
  });

  test('REQ-EDIT-012: single edit, debounce not elapsed → false', () => {
    expect(shouldFireIdleSave([1000], 0, 2000, 2999)).toBe(false);
  });

  test('REQ-EDIT-013: saved after last edit → false', () => {
    expect(shouldFireIdleSave([1000], 5000, 2000, 6000)).toBe(false);
  });

  test('REQ-EDIT-012: multiple edits — last edit governs the debounce window', () => {
    expect(shouldFireIdleSave([500, 1000, 800], 0, 2000, 3001)).toBe(true);
  });

  test('REQ-EDIT-012: multiple edits — last edit has not elapsed → false', () => {
    expect(shouldFireIdleSave([500, 2500], 0, 2000, 3999)).toBe(false);
  });

  test('PROP-EDIT-003: empty editTimestamps → false (no edit = no idle save)', () => {
    expect(shouldFireIdleSave([], 0, 2000, 9999)).toBe(false);
  });

  test('PROP-EDIT-004: blur-cancels-idle model — after blur save, idle must not fire', () => {
    // Simulated: blur save dispatched at time 1500, then idle window elapses.
    // If lastSaveTimestamp > last edit, idle should not fire.
    const lastEditAt = 1000;
    const blurSaveAt = 1500; // blur save happened before idle debounce window
    const nowMs = 3500; // well past the idle window
    // Since save happened after last edit, idle should NOT fire
    expect(shouldFireIdleSave([lastEditAt], blurSaveAt, 2000, nowMs)).toBe(false);
  });
});
