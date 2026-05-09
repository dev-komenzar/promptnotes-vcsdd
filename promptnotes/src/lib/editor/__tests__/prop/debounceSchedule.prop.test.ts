/**
 * debounceSchedule.property.test.ts — Tier 2 fast-check property tests (bun:test)
 *
 * Sprint 7 Red phase. All tests MUST FAIL because the stubs throw.
 *
 * Coverage:
 *   PROP-EDIT-003 (debounce-semantics: shouldFireIdleSave and computeNextFireAt)
 *   PROP-EDIT-004 (blur-cancels-idle: pure model)
 *
 * REQ-EDIT references appear in test description strings for CRIT-700/CRIT-701 grep.
 */

import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import {
  IDLE_SAVE_DEBOUNCE_MS,
  computeNextFireAt,
  shouldFireIdleSave,
  nextFireAt,
} from '$lib/editor/debounceSchedule';

// ── PROP-EDIT-003: debounce-semantics ─────────────────────────────────────────

describe("PROP-EDIT-003: 'debounce-semantics' (REQ-EDIT-012, EC-EDIT-001)", () => {
  test('PROP-EDIT-003a: given lastEditAt, nowMs >= lastEditAt+debounceMs, lastSaveAt < lastEditAt → shouldFire=true (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10000 }),
        fc.nat({ max: 5000 }),
        (lastEditAt, extra) => {
          const debounceMs = IDLE_SAVE_DEBOUNCE_MS;
          const nowMs = lastEditAt + debounceMs + extra;
          const lastSaveAt = 0;
          return shouldFireIdleSave([lastEditAt], lastSaveAt, debounceMs, nowMs) === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-003b: given lastEditAt, nowMs < lastEditAt+debounceMs → shouldFire=false (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.nat({ max: 1999 }),
        (lastEditAt, deficit) => {
          const debounceMs = IDLE_SAVE_DEBOUNCE_MS;
          const nowMs = lastEditAt + debounceMs - 1 - (deficit % debounceMs);
          if (nowMs < lastEditAt) return true; // skip invalid
          const lastSaveAt = 0;
          return shouldFireIdleSave([lastEditAt], lastSaveAt, debounceMs, nowMs) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-003c: computeNextFireAt returns shouldFire=true exactly when nowMs >= lastEditAt+debounceMs and lastSaveAt <= lastEditAt (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10000 }),
        fc.nat({ max: 5000 }),
        (lastEditAt, extra) => {
          const debounceMs = IDLE_SAVE_DEBOUNCE_MS;
          const nowMs = lastEditAt + debounceMs + extra;
          const result = computeNextFireAt({
            lastEditAt,
            lastSaveAt: 0,
            debounceMs,
            nowMs,
          });
          return result.shouldFire === true && result.fireAt === lastEditAt + debounceMs;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-003d: computeNextFireAt returns shouldFire=false when debounce not elapsed (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        (lastEditAt) => {
          const debounceMs = IDLE_SAVE_DEBOUNCE_MS;
          const nowMs = lastEditAt + debounceMs - 1;
          const result = computeNextFireAt({
            lastEditAt,
            lastSaveAt: 0,
            debounceMs,
            nowMs,
          });
          return result.shouldFire === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-003e: computeNextFireAt returns shouldFire=false and fireAt=null when lastSaveAt > lastEditAt (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10000 }),
        fc.integer({ min: 1, max: 5000 }),
        (lastEditAt, gap) => {
          const debounceMs = IDLE_SAVE_DEBOUNCE_MS;
          const lastSaveAt = lastEditAt + gap;
          const nowMs = lastSaveAt + debounceMs + 1;
          const result = computeNextFireAt({
            lastEditAt,
            lastSaveAt,
            debounceMs,
            nowMs,
          });
          return result.shouldFire === false && result.fireAt === null;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-003f: burst of edits — last edit governs, shouldFire=false until last+debounce elapsed (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 5000 }),
        fc.array(fc.nat({ max: 3000 }), { minLength: 2, maxLength: 10 }),
        (baseTime, offsets) => {
          const debounceMs = IDLE_SAVE_DEBOUNCE_MS;
          const timestamps = offsets.map(o => baseTime + o);
          const lastEdit = Math.max(...timestamps);
          // Just before window closes — should NOT fire
          const nowMs = lastEdit + debounceMs - 1;
          if (nowMs < 0) return true;
          return shouldFireIdleSave(timestamps, 0, debounceMs, nowMs) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-003g: empty editTimestamps always returns false (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 100000 }),
        (nowMs) => {
          return shouldFireIdleSave([], 0, IDLE_SAVE_DEBOUNCE_MS, nowMs) === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ── PROP-EDIT-004: blur-cancels-idle ─────────────────────────────────────────

describe("PROP-EDIT-004: 'blur-cancels-idle' (REQ-EDIT-014, REQ-EDIT-015)", () => {
  test('PROP-EDIT-004a: if blur-save timestamp > lastEditAt, idle should not fire (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10000 }),
        fc.integer({ min: 1, max: 5000 }),
        (lastEditAt, blurOffset) => {
          const debounceMs = IDLE_SAVE_DEBOUNCE_MS;
          const blurSaveAt = lastEditAt + blurOffset;
          // Well past the idle window
          const nowMs = lastEditAt + debounceMs + blurOffset + 1000;
          // If blur-save already happened after last edit, idle must not fire
          return shouldFireIdleSave([lastEditAt], blurSaveAt, debounceMs, nowMs) === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-004b: computeNextFireAt with lastSaveAt (blur) after lastEditAt returns shouldFire=false (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 10000 }),
        fc.integer({ min: 1, max: 5000 }),
        (lastEditAt, blurOffset) => {
          const debounceMs = IDLE_SAVE_DEBOUNCE_MS;
          const blurSaveAt = lastEditAt + blurOffset;
          const nowMs = blurSaveAt + debounceMs + 1;
          const result = computeNextFireAt({
            lastEditAt,
            lastSaveAt: blurSaveAt,
            debounceMs,
            nowMs,
          });
          return result.shouldFire === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-004c: for any blur timing before idle window: blur save takes precedence (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 10000 }),
        fc.nat({ max: 1999 }), // blur within debounce window
        (lastEditAt, blurDelay) => {
          const debounceMs = IDLE_SAVE_DEBOUNCE_MS;
          // blur fires before idle window closes
          const blurAt = lastEditAt + blurDelay;
          // After blur, lastSaveAt = blurAt; idle should not fire even when debounce elapses
          const nowMs = lastEditAt + debounceMs + 500;
          return shouldFireIdleSave([lastEditAt], blurAt, debounceMs, nowMs) === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});
