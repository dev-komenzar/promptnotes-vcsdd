/**
 * debounceSchedule.test.ts — Tier 1 unit tests (bun:test)
 *
 * Sprint 1 of ui-block-editor (Phase 2a Red).
 *
 * Coverage:
 *   PROP-BE-012 / REQ-BE-022 — IDLE_SAVE_DEBOUNCE_MS constant
 *   PROP-BE-013 / REQ-BE-023 — nextFireAt addition
 *   PROP-BE-014 / REQ-BE-024 — computeNextFireAt saved suppression
 *   PROP-BE-015 / REQ-BE-024 — computeNextFireAt debounce boundary
 *   PROP-BE-017 / REQ-BE-025 — shouldFireIdleSave empty short-circuit
 *   PROP-BE-018 / REQ-BE-025 — shouldFireIdleSave saved suppression
 *   PROP-BE-019 / REQ-BE-025 — shouldFireIdleSave debounce boundary
 */

import { describe, test, expect } from 'bun:test';
import {
  IDLE_SAVE_DEBOUNCE_MS,
  computeNextFireAt,
  shouldFireIdleSave,
  nextFireAt,
} from '$lib/block-editor/debounceSchedule';

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-012 / REQ-BE-022: IDLE_SAVE_DEBOUNCE_MS = 2000
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-012 / REQ-BE-022: IDLE_SAVE_DEBOUNCE_MS constant', () => {
  test('IDLE_SAVE_DEBOUNCE_MS === 2000', () => {
    expect(IDLE_SAVE_DEBOUNCE_MS).toBe(2000);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-013 / REQ-BE-023: nextFireAt addition
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-013 / REQ-BE-023: nextFireAt — pure addition', () => {
  test('nextFireAt(1000, 2000) === 3000', () => {
    expect(nextFireAt(1000, 2000)).toBe(3000);
  });

  test('nextFireAt(0, 2000) === 2000', () => {
    expect(nextFireAt(0, 2000)).toBe(2000);
  });

  test('nextFireAt(1000, 0) === 1000', () => {
    expect(nextFireAt(1000, 0)).toBe(1000);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-014 / REQ-BE-024: computeNextFireAt saved suppression
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-014 / REQ-BE-024: computeNextFireAt — saved suppression', () => {
  test('saved at lastEdit (lastSaveAt > 0, ≥ lastEditAt) ⇒ shouldFire=false, fireAt=null', () => {
    expect(
      computeNextFireAt({ lastEditAt: 1000, lastSaveAt: 1000, debounceMs: 2000, nowMs: 5000 }),
    ).toEqual({ shouldFire: false, fireAt: null });
  });

  test('saved after lastEdit (lastSaveAt > lastEditAt) ⇒ shouldFire=false, fireAt=null', () => {
    expect(
      computeNextFireAt({ lastEditAt: 1000, lastSaveAt: 1500, debounceMs: 2000, nowMs: 5000 }),
    ).toEqual({ shouldFire: false, fireAt: null });
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-015 / REQ-BE-024: computeNextFireAt debounce boundary
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-015 / REQ-BE-024: computeNextFireAt — debounce boundary', () => {
  test('lastSaveAt=0 sentinel: nowMs >= lastEditAt+debounceMs ⇒ shouldFire=true, fireAt=lastEditAt+debounceMs', () => {
    expect(
      computeNextFireAt({ lastEditAt: 1000, lastSaveAt: 0, debounceMs: 2000, nowMs: 3000 }),
    ).toEqual({ shouldFire: true, fireAt: 3000 });
  });

  test('lastSaveAt=0 sentinel: nowMs > lastEditAt+debounceMs ⇒ shouldFire=true', () => {
    expect(
      computeNextFireAt({ lastEditAt: 1000, lastSaveAt: 0, debounceMs: 2000, nowMs: 3001 }),
    ).toEqual({ shouldFire: true, fireAt: 3000 });
  });

  test('lastSaveAt=0 sentinel: nowMs < lastEditAt+debounceMs ⇒ shouldFire=false, fireAt=lastEditAt+debounceMs', () => {
    expect(
      computeNextFireAt({ lastEditAt: 1000, lastSaveAt: 0, debounceMs: 2000, nowMs: 2999 }),
    ).toEqual({ shouldFire: false, fireAt: 3000 });
  });

  test('lastSaveAt < lastEditAt: nowMs >= lastEditAt+debounceMs ⇒ shouldFire=true', () => {
    expect(
      computeNextFireAt({ lastEditAt: 5000, lastSaveAt: 1000, debounceMs: 2000, nowMs: 7000 }),
    ).toEqual({ shouldFire: true, fireAt: 7000 });
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-017 / REQ-BE-025: shouldFireIdleSave empty
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-017 / REQ-BE-025: shouldFireIdleSave — empty editTimestamps', () => {
  test('editTimestamps=[] ⇒ false', () => {
    expect(shouldFireIdleSave([], 0, 2000, 5000)).toBe(false);
  });

  test('editTimestamps=[] even when nowMs is very large ⇒ false', () => {
    expect(shouldFireIdleSave([], 0, 2000, Number.MAX_SAFE_INTEGER)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-018 / REQ-BE-025: shouldFireIdleSave saved suppression
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-018 / REQ-BE-025: shouldFireIdleSave — saved suppression', () => {
  test('lastSaveTimestamp > 0 and >= max(editTimestamps) ⇒ false', () => {
    expect(shouldFireIdleSave([1000, 1500], 1600, 2000, 5000)).toBe(false);
  });

  test('lastSaveTimestamp > 0 and === max(editTimestamps) ⇒ false', () => {
    expect(shouldFireIdleSave([1000, 1500], 1500, 2000, 5000)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-019 / REQ-BE-025: shouldFireIdleSave debounce boundary
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-019 / REQ-BE-025: shouldFireIdleSave — debounce boundary', () => {
  test('single edit at 1000, debounce 2000, now 3000 ⇒ true (boundary)', () => {
    expect(shouldFireIdleSave([1000], 0, 2000, 3000)).toBe(true);
  });

  test('single edit at 1000, debounce 2000, now 2999 ⇒ false', () => {
    expect(shouldFireIdleSave([1000], 0, 2000, 2999)).toBe(false);
  });

  test('lastSaveTimestamp < max(edits) and now >= max(edits) + debounce ⇒ true', () => {
    expect(shouldFireIdleSave([1000, 1500], 1400, 2000, 3500)).toBe(true);
  });

  test('lastSaveTimestamp < max(edits) and now < max(edits) + debounce ⇒ false', () => {
    expect(shouldFireIdleSave([1000, 1500], 1400, 2000, 3499)).toBe(false);
  });
});
