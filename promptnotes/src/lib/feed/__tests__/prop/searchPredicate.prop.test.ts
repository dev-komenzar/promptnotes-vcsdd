/**
 * searchPredicate.prop.test.ts — Phase 2a (Red): fast-check property tests
 *
 * Coverage:
 *   PROP-FILTER-010 (searchPredicate: ASCII case-insensitive; no-throw for all Unicode)
 *   PROP-FILTER-011 (empty needle is universal pass — property generalization)
 *   REQ-FILTER-005 (case-insensitive substring)
 *   REQ-FILTER-017 (adversarial input handling)
 *
 * RED PHASE: searchPredicate does not exist yet — all tests MUST FAIL.
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { searchPredicate } from '$lib/feed/searchPredicate';

// ── Arbitraries ───────────────────────────────────────────────────────────────

/** ASCII printable characters only (0x20–0x7E) */
const arbAsciiPrintable = fc.string({
  minLength: 0,
  maxLength: 100,
  unit: fc.mapToConstant(
    { num: 95, build: (n) => String.fromCharCode(n + 0x20) }
  ),
});

/** Arbitrary Unicode string (any code point) */
const arbUnicodeString = fc.string({ minLength: 0, maxLength: 200 });

/** Long string up to 10 000 chars */
const arbLongString = fc.string({ minLength: 0, maxLength: 10000 });

// ── PROP-FILTER-010: ASCII case-insensitive correctness ───────────────────────

describe('PROP-FILTER-010: searchPredicate ASCII case-insensitive property', () => {
  test('For ASCII printable needle and haystack: result equals haystack.toLowerCase().includes(needle.toLowerCase())', () => {
    fc.assert(
      fc.property(arbAsciiPrintable, arbAsciiPrintable, (needle, haystack) => {
        const expected = haystack.toLowerCase().includes(needle.toLowerCase());
        const actual = searchPredicate(needle, haystack);
        return actual === expected;
      }),
      { numRuns: 500 }
    );
  });
});

// ── PROP-FILTER-010: No-throw for arbitrary Unicode ──────────────────────────

describe('PROP-FILTER-010: searchPredicate never throws for any Unicode inputs', () => {
  test('searchPredicate does not throw for arbitrary Unicode needle and haystack', () => {
    fc.assert(
      fc.property(arbUnicodeString, arbUnicodeString, (needle, haystack) => {
        let threw = false;
        try {
          searchPredicate(needle, haystack);
        } catch {
          threw = true;
        }
        return !threw;
      }),
      { numRuns: 300 }
    );
  });

  test('searchPredicate does not throw for long strings (EC-S-012)', () => {
    fc.assert(
      fc.property(arbLongString, arbLongString, (needle, haystack) => {
        let threw = false;
        try {
          searchPredicate(needle, haystack);
        } catch {
          threw = true;
        }
        return !threw;
      }),
      { numRuns: 100 }
    );
  });
});

// ── PROP-FILTER-011: Empty needle is universal pass ───────────────────────────

describe('PROP-FILTER-011: Empty needle always returns true (property)', () => {
  test('searchPredicate("", haystack) === true for any haystack', () => {
    fc.assert(
      fc.property(arbUnicodeString, (haystack) => {
        return searchPredicate('', haystack) === true;
      }),
      { numRuns: 300 }
    );
  });
});

// ── Substring reflexivity ─────────────────────────────────────────────────────

describe('searchPredicate: substring reflexivity', () => {
  test('searchPredicate(s, s) is true for any ASCII string (self-match)', () => {
    fc.assert(
      fc.property(arbAsciiPrintable, (s) => {
        return searchPredicate(s, s) === true;
      }),
      { numRuns: 200 }
    );
  });
});
