/**
 * debounceSchedule.prop.test.ts — Tier 2 fast-check property tests
 *
 * Sprint 1 of ui-block-editor (Phase 2a Red).
 *
 * Coverage:
 *   PROP-BE-013 / REQ-BE-023 — nextFireAt addition (purity)
 *   PROP-BE-014 / REQ-BE-024 — computeNextFireAt saved suppression
 *   PROP-BE-015 / REQ-BE-024 — computeNextFireAt debounce boundary
 *   PROP-BE-016 / REQ-BE-024 — computeNextFireAt purity
 *   PROP-BE-019 / REQ-BE-025 — shouldFireIdleSave debounce boundary
 *   PROP-BE-020 / REQ-BE-025 — shouldFireIdleSave order independence
 */

import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import {
  computeNextFireAt,
  nextFireAt,
  shouldFireIdleSave,
} from '$lib/block-editor/debounceSchedule';

// Bounded positive ints to avoid IEEE quirks
const intArb = fc.integer({ min: 0, max: 1_000_000_000 });
const debounceArb = fc.integer({ min: 0, max: 60_000 });

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-013 / REQ-BE-023: nextFireAt addition
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-013 / REQ-BE-023: nextFireAt — addition', () => {
  test('nextFireAt(t, d) === t + d', () => {
    fc.assert(
      fc.property(intArb, debounceArb, (t, d) => nextFireAt(t, d) === t + d),
      { numRuns: 500 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-014 / REQ-BE-024: computeNextFireAt saved suppression
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-014 / REQ-BE-024: computeNextFireAt — saved suppression', () => {
  test('lastSaveAt !== 0 && lastSaveAt >= lastEditAt ⇒ shouldFire=false, fireAt=null', () => {
    fc.assert(
      fc.property(
        fc
          .tuple(
            fc.integer({ min: 0, max: 1_000_000 }),
            fc.integer({ min: 1, max: 1_000_000 }),
            debounceArb,
            intArb,
          )
          .filter(([lastEditAt, lastSaveAt]) => lastSaveAt >= lastEditAt),
        ([lastEditAt, lastSaveAt, debounceMs, nowMs]) => {
          const r = computeNextFireAt({ lastEditAt, lastSaveAt, debounceMs, nowMs });
          return r.shouldFire === false && r.fireAt === null;
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-015 / REQ-BE-024: computeNextFireAt debounce boundary
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-015 / REQ-BE-024: computeNextFireAt — debounce boundary', () => {
  test('lastSaveAt=0 sentinel + nowMs >= lastEditAt+debounceMs ⇒ shouldFire=true, fireAt=lastEditAt+debounceMs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        debounceArb,
        fc.integer({ min: 0, max: 1_000_000 }),
        (lastEditAt, debounceMs, extra) => {
          const nowMs = lastEditAt + debounceMs + extra;
          const r = computeNextFireAt({ lastEditAt, lastSaveAt: 0, debounceMs, nowMs });
          return r.shouldFire === true && r.fireAt === lastEditAt + debounceMs;
        },
      ),
      { numRuns: 300 },
    );
  });

  test('lastSaveAt=0 sentinel + nowMs < lastEditAt+debounceMs ⇒ shouldFire=false, fireAt=lastEditAt+debounceMs', () => {
    fc.assert(
      fc.property(
        fc
          .tuple(
            fc.integer({ min: 0, max: 1_000_000 }),
            fc.integer({ min: 1, max: 60_000 }),
            fc.integer({ min: 0, max: 60_000 }),
          )
          .filter(([_, debounceMs, gap]) => gap < debounceMs),
        ([lastEditAt, debounceMs, gap]) => {
          const nowMs = lastEditAt + debounceMs - 1 - gap;
          if (nowMs < 0) return true; // skip negative now
          const r = computeNextFireAt({ lastEditAt, lastSaveAt: 0, debounceMs, nowMs });
          return r.shouldFire === false && r.fireAt === lastEditAt + debounceMs;
        },
      ),
      { numRuns: 300 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-016 / REQ-BE-024: purity
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-016 / REQ-BE-024: computeNextFireAt purity', () => {
  test('same input → deep-equal output', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        debounceArb,
        intArb,
        (lastEditAt, lastSaveAt, debounceMs, nowMs) => {
          const a = computeNextFireAt({ lastEditAt, lastSaveAt, debounceMs, nowMs });
          const b = computeNextFireAt({ lastEditAt, lastSaveAt, debounceMs, nowMs });
          return a.shouldFire === b.shouldFire && a.fireAt === b.fireAt;
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-019 / REQ-BE-025: shouldFireIdleSave debounce boundary
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-019 / REQ-BE-025: shouldFireIdleSave — debounce boundary', () => {
  test('non-empty edits, lastSave=0, now >= max(edits)+debounce ⇒ true', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 30 }),
        debounceArb,
        fc.integer({ min: 0, max: 100_000 }),
        (edits, debounceMs, extra) => {
          const maxEdit = Math.max(...edits);
          const nowMs = maxEdit + debounceMs + extra;
          return shouldFireIdleSave(edits, 0, debounceMs, nowMs) === true;
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-020 / REQ-BE-025: order independence
// ──────────────────────────────────────────────────────────────────────

function shuffle<T>(arr: readonly T[], seed: number): T[] {
  // Deterministic Fisher-Yates using a simple LCG seeded with `seed`.
  const a = arr.slice();
  let s = (seed >>> 0) || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i]!, a[j]!] = [a[j]!, a[i]!];
  }
  return a;
}

describe('PROP-BE-020 / REQ-BE-025: shouldFireIdleSave — order independence', () => {
  test('result invariant under permutation of editTimestamps', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 0, maxLength: 30 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        debounceArb,
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        (edits, lastSave, debounceMs, nowMs, seed) => {
          const a = shouldFireIdleSave(edits, lastSave, debounceMs, nowMs);
          const b = shouldFireIdleSave(shuffle(edits, seed), lastSave, debounceMs, nowMs);
          return a === b;
        },
      ),
      { numRuns: 200 },
    );
  });
});
