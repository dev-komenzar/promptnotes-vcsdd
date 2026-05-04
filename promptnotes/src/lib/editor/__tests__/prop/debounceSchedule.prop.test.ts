/**
 * debounceSchedule.prop.test.ts — Tier 2 property tests (bun:test + fast-check)
 *
 * Coverage:
 *   PROP-EDIT-003 (debounce semantics: shouldFire iff lastEdit+debounceMs<=nowMs AND no save since lastEdit)
 *   PROP-EDIT-004 (blur-cancels-idle: lastSaveAt > lastEditAt → shouldFire=false)
 *   REQ-EDIT-004, REQ-EDIT-006, REQ-EDIT-007, EC-EDIT-001
 *
 * RED PHASE: stubs throw — all fc.assert calls produce FAIL.
 */

import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import {
  computeNextFireAt,
  shouldFireIdleSave,
  nextFireAt,
} from '$lib/editor/debounceSchedule';

// ── Arbitraries ───────────────────────────────────────────────────────────────

/** Reasonable timestamp range (0..100_000 ms). */
const arbTs = fc.integer({ min: 0, max: 100_000 });

/** Reasonable debounce window (100ms..10_000ms). */
const arbDebounce = fc.integer({ min: 100, max: 10_000 });

// ── PROP-EDIT-003: Debounce semantics ─────────────────────────────────────────

describe('PROP-EDIT-003 (fast-check): debounce semantics', () => {
  test('PROP-EDIT-003a: shouldFire=true iff lastEditAt+debounceMs <= nowMs AND lastSaveAt <= lastEditAt (≥100 runs)', () => {
    fc.assert(
      fc.property(
        arbTs, // lastEditAt
        arbDebounce, // debounceMs
        fc.integer({ min: 0, max: 200 }), // extra ms beyond fireAt
        (lastEditAt, debounceMs, extra) => {
          const fireAt = lastEditAt + debounceMs;
          const nowMs = fireAt + extra; // nowMs >= fireAt always
          const result = computeNextFireAt({
            lastEditAt,
            lastSaveAt: 0, // never saved — should fire
            debounceMs,
            nowMs,
          });
          return result.shouldFire === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-003b: shouldFire=false when nowMs < lastEditAt+debounceMs (within debounce window) (≥100 runs)', () => {
    fc.assert(
      fc.property(
        arbTs.filter(t => t > 0), // lastEditAt > 0
        arbDebounce,
        fc.integer({ min: 1, max: 99 }), // shortfall 1..99
        (lastEditAt, debounceMs, shortfall) => {
          const fireAt = lastEditAt + debounceMs;
          const nowMs = fireAt - shortfall; // nowMs < fireAt
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

  test('PROP-EDIT-003c: fireAt is always lastEditAt+debounceMs when no save supersedes (≥100 runs)', () => {
    fc.assert(
      fc.property(arbTs, arbDebounce, (lastEditAt, debounceMs) => {
        const result = computeNextFireAt({
          lastEditAt,
          lastSaveAt: 0,
          debounceMs,
          nowMs: lastEditAt + debounceMs,
        });
        // When not superseded by a save, fireAt must be lastEditAt + debounceMs
        return result.fireAt === lastEditAt + debounceMs;
      }),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-003d: shouldFireIdleSave semantics: fires iff last edit + debounceMs <= nowMs AND not saved (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.array(arbTs, { minLength: 1, maxLength: 20 }),
        arbDebounce,
        fc.integer({ min: 0, max: 500 }), // extra ms after fireAt
        (editTimestamps, debounceMs, extra) => {
          const lastEdit = Math.max(...editTimestamps);
          const fireAt = lastEdit + debounceMs;
          const nowMs = fireAt + extra;
          const result = shouldFireIdleSave(editTimestamps, 0, debounceMs, nowMs);
          return result === true;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-003e: burst never fires within debounce window (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.array(arbTs, { minLength: 2, maxLength: 50 }),
        arbDebounce,
        (editTimestamps, debounceMs) => {
          const lastEdit = Math.max(...editTimestamps);
          const fireAt = lastEdit + debounceMs;
          // Check strictly before fire point
          const nowMs = fireAt - 1;
          if (nowMs < 0) return true; // skip edge case
          const result = shouldFireIdleSave(editTimestamps, 0, debounceMs, nowMs);
          return result === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-003f: nextFireAt(t, d) === t + d for all t,d (≥100 runs)', () => {
    fc.assert(
      fc.property(arbTs, arbDebounce, (lastEditTimestamp, debounceMs) => {
        return nextFireAt(lastEditTimestamp, debounceMs) === lastEditTimestamp + debounceMs;
      }),
      { numRuns: 100 }
    );
  });
});

// ── PROP-EDIT-004: Blur-cancels-idle ─────────────────────────────────────────

describe('PROP-EDIT-004 (fast-check): blur-cancels-idle — lastSaveAt > lastEditAt → shouldFire=false', () => {
  test('PROP-EDIT-004a: if lastSaveAt > lastEditAt, shouldFire is always false (≥100 runs)', () => {
    fc.assert(
      fc.property(
        arbTs, // lastEditAt
        arbDebounce,
        fc.integer({ min: 1, max: 10_000 }), // delta > 0 so lastSaveAt > lastEditAt
        (lastEditAt, debounceMs, delta) => {
          const lastSaveAt = lastEditAt + delta; // save happened AFTER edit
          const nowMs = lastSaveAt + debounceMs + 1000; // well after everything
          const result = computeNextFireAt({
            lastEditAt,
            lastSaveAt,
            debounceMs,
            nowMs,
          });
          return result.shouldFire === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-004b: if lastSaveAt > lastEditAt, fireAt is null (≥100 runs)', () => {
    fc.assert(
      fc.property(
        arbTs,
        arbDebounce,
        fc.integer({ min: 1, max: 5_000 }),
        (lastEditAt, debounceMs, delta) => {
          const lastSaveAt = lastEditAt + delta;
          const nowMs = lastSaveAt + 10_000;
          const result = computeNextFireAt({
            lastEditAt,
            lastSaveAt,
            debounceMs,
            nowMs,
          });
          return result.fireAt === null;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-004c: shouldFireIdleSave returns false when saved after last edit (≥100 runs)', () => {
    fc.assert(
      fc.property(
        fc.array(arbTs, { minLength: 1, maxLength: 10 }),
        arbDebounce,
        fc.integer({ min: 1, max: 5_000 }), // delta ensures save > lastEdit
        (editTimestamps, debounceMs, delta) => {
          const lastEdit = Math.max(...editTimestamps);
          const lastSaveTimestamp = lastEdit + delta; // blur save happened
          const nowMs = lastSaveTimestamp + debounceMs + 1000;
          const result = shouldFireIdleSave(editTimestamps, lastSaveTimestamp, debounceMs, nowMs);
          return result === false;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('PROP-EDIT-004d: computeNextFireAt is pure — same inputs always produce same outputs (≥100 runs)', () => {
    fc.assert(
      fc.property(
        arbTs,
        arbTs,
        arbDebounce,
        arbTs,
        (lastEditAt, lastSaveAt, debounceMs, nowMs) => {
          const params = { lastEditAt, lastSaveAt, debounceMs, nowMs };
          const result1 = computeNextFireAt(params);
          const result2 = computeNextFireAt(params);
          return (
            result1.shouldFire === result2.shouldFire &&
            result1.fireAt === result2.fireAt
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
