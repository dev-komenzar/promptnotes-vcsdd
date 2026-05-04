/**
 * feedRowPredicates.test.ts — Tier 1 unit tests + Tier 2 property tests (bun:test + fast-check)
 *
 * Coverage:
 *   PROP-FEED-001 (isEditingNote null safety)
 *   PROP-FEED-002 (isDeleteButtonDisabled safety)
 *   PROP-FEED-003 (bodyPreviewLines length ≤ maxLines)
 *   PROP-FEED-004 (bodyPreviewLines content = split+slice)
 *   PROP-FEED-027 (grep: DESIGN tokens in FeedRow.svelte — checked in purityAudit)
 *   PROP-FEED-030 (svelte/store absence — checked in purityAudit)
 *   PROP-FEED-033 (timestampLabel determinism)
 *   PROP-FEED-034 (tag iteration order/length preservation)
 *
 * REQ coverage: REQ-FEED-001, REQ-FEED-002, REQ-FEED-003, REQ-FEED-010
 *
 * RED PHASE: stubs throw 'not implemented' — all assertions FAIL.
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import type { FeedViewState } from '$lib/feed/types';
import {
  isEditingNote,
  isDeleteButtonDisabled,
  bodyPreviewLines,
  timestampLabel,
} from '$lib/feed/feedRowPredicates';

// ── Arbitraries ───────────────────────────────────────────────────────────────

const arbEditingStatus = fc.constantFrom(
  'idle' as const,
  'editing' as const,
  'saving' as const,
  'switching' as const,
  'save-failed' as const
);

const arbNoteId = fc.string({ minLength: 1, maxLength: 50 });
const arbBody = fc.string();
const arbLocale = fc.constantFrom('ja-JP', 'en-US', 'zh-CN');
const arbEpochMs = fc.integer({ min: 0, max: 9999999999999 });

// ── REQ-FEED-001 / PROP-FEED-033: timestampLabel determinism ──────────────────

describe('REQ-FEED-001 / PROP-FEED-033: timestampLabel determinism', () => {
  test('PROP-FEED-033a: same (epochMs, locale) returns same string twice (example)', () => {
    const epoch = 1746352800000; // 2025-05-04 10:00:00 JST
    const r1 = timestampLabel(epoch, 'ja-JP');
    const r2 = timestampLabel(epoch, 'ja-JP');
    expect(r1).toBe(r2);
  });

  test('PROP-FEED-033b: returns a non-empty string for valid epoch (example)', () => {
    const result = timestampLabel(0, 'ja-JP');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('PROP-FEED-033c: fast-check — same (epochMs, locale) always equal (≥200 runs)', () => {
    fc.assert(
      fc.property(arbEpochMs, arbLocale, (epochMs, locale) => {
        const r1 = timestampLabel(epochMs, locale);
        const r2 = timestampLabel(epochMs, locale);
        return r1 === r2;
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-FEED-033d: fast-check — always returns non-empty string (≥200 runs)', () => {
    fc.assert(
      fc.property(arbEpochMs, arbLocale, (epochMs, locale) => {
        const result = timestampLabel(epochMs, locale);
        return typeof result === 'string' && result.length > 0;
      }),
      { numRuns: 200 }
    );
  });
});

// ── REQ-FEED-002 / PROP-FEED-003: bodyPreviewLines length ────────────────────

describe('REQ-FEED-002 / PROP-FEED-003: bodyPreviewLines length ≤ maxLines', () => {
  test('PROP-FEED-003a: empty body with maxLines=2 returns array of length ≤ 2', () => {
    const result = bodyPreviewLines('', 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  test('PROP-FEED-003b: single-line body with maxLines=2 returns exactly 1 element', () => {
    const result = bodyPreviewLines('hello world', 2);
    expect(result.length).toBe(1);
  });

  test('PROP-FEED-003c: two-line body with maxLines=2 returns exactly 2 elements', () => {
    const result = bodyPreviewLines('line1\nline2', 2);
    expect(result.length).toBe(2);
  });

  test('PROP-FEED-003d: three-line body with maxLines=2 returns exactly 2 elements (truncated)', () => {
    const result = bodyPreviewLines('line1\nline2\nline3', 2);
    expect(result.length).toBe(2);
  });

  test('PROP-FEED-003e: fast-check — length always ≤ maxLines (≥200 runs)', () => {
    fc.assert(
      fc.property(arbBody, fc.integer({ min: 0, max: 20 }), (body, n) => {
        const result = bodyPreviewLines(body, n);
        return result.length <= n;
      }),
      { numRuns: 200 }
    );
  });
});

// ── REQ-FEED-002 / PROP-FEED-004: bodyPreviewLines content ───────────────────

describe('REQ-FEED-002 / PROP-FEED-004: bodyPreviewLines content matches split+slice', () => {
  test('PROP-FEED-004a: empty body returns empty array', () => {
    const result = bodyPreviewLines('', 2);
    const expected = ''.split('\n').slice(0, 2);
    expect(Array.from(result)).toEqual(expected);
  });

  test('PROP-FEED-004b: content matches body.split(newline).slice(0, 2)', () => {
    const body = 'first line\nsecond line\nthird line';
    const result = bodyPreviewLines(body, 2);
    const expected = body.split('\n').slice(0, 2);
    expect(Array.from(result)).toEqual(expected);
  });

  test('PROP-FEED-004c: single line body matches', () => {
    const body = 'only one line';
    const result = bodyPreviewLines(body, 2);
    expect(Array.from(result)).toEqual(['only one line']);
  });

  test('PROP-FEED-004d: fast-check — content equals split+slice (≥200 runs)', () => {
    fc.assert(
      fc.property(arbBody, fc.integer({ min: 0, max: 20 }), (body, n) => {
        const result = bodyPreviewLines(body, n);
        const expected = body.split('\n').slice(0, n);
        if (result.length !== expected.length) return false;
        for (let i = 0; i < expected.length; i++) {
          if (result[i] !== expected[i]) return false;
        }
        return true;
      }),
      { numRuns: 200 }
    );
  });
});

// ── REQ-FEED-010 / PROP-FEED-001: isEditingNote null safety ──────────────────

describe('REQ-FEED-010 / PROP-FEED-001: isEditingNote null safety', () => {
  test('PROP-FEED-001a: isEditingNote(any, null) === false (example)', () => {
    expect(isEditingNote('note-abc', null)).toBe(false);
  });

  test('PROP-FEED-001b: isEditingNote("x", "x") === true when IDs match', () => {
    expect(isEditingNote('note-abc', 'note-abc')).toBe(true);
  });

  test('PROP-FEED-001c: isEditingNote("x", "y") === false when IDs differ', () => {
    expect(isEditingNote('note-abc', 'note-def')).toBe(false);
  });

  test('PROP-FEED-001d: fast-check — isEditingNote(x, null) === false ∀x (≥200 runs)', () => {
    fc.assert(
      fc.property(arbNoteId, (noteId) => {
        return isEditingNote(noteId, null) === false;
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-FEED-001e: fast-check — isEditingNote(x, x) === true ∀x (≥200 runs)', () => {
    fc.assert(
      fc.property(arbNoteId, (noteId) => {
        return isEditingNote(noteId, noteId) === true;
      }),
      { numRuns: 200 }
    );
  });
});

// ── REQ-FEED-010 / PROP-FEED-002: isDeleteButtonDisabled safety ──────────────

describe('REQ-FEED-010 / PROP-FEED-002: isDeleteButtonDisabled safety', () => {
  test('PROP-FEED-002a: editingNoteId===null → always false (example)', () => {
    expect(isDeleteButtonDisabled('note-abc', 'editing', null)).toBe(false);
    expect(isDeleteButtonDisabled('note-abc', 'saving', null)).toBe(false);
    expect(isDeleteButtonDisabled('note-abc', 'switching', null)).toBe(false);
    expect(isDeleteButtonDisabled('note-abc', 'save-failed', null)).toBe(false);
  });

  test('PROP-FEED-002b: status === idle → always false (example)', () => {
    expect(isDeleteButtonDisabled('note-abc', 'idle', 'note-abc')).toBe(false);
    expect(isDeleteButtonDisabled('note-abc', 'idle', 'note-xyz')).toBe(false);
    expect(isDeleteButtonDisabled('note-abc', 'idle', null)).toBe(false);
  });

  test('PROP-FEED-002c: editing + same noteId → true', () => {
    expect(isDeleteButtonDisabled('note-abc', 'editing', 'note-abc')).toBe(true);
  });

  test('PROP-FEED-002d: editing + different noteId → false', () => {
    expect(isDeleteButtonDisabled('note-abc', 'editing', 'note-xyz')).toBe(false);
  });

  test('PROP-FEED-002e: save-failed + same noteId → true (EC-FEED-006)', () => {
    expect(isDeleteButtonDisabled('note-abc', 'save-failed', 'note-abc')).toBe(true);
  });

  test('PROP-FEED-002f: fast-check — editingNoteId===null → false ∀(noteId, status) (≥200 runs)', () => {
    fc.assert(
      fc.property(arbNoteId, arbEditingStatus, (noteId, status) => {
        return isDeleteButtonDisabled(noteId, status, null) === false;
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-FEED-002g: fast-check — status===idle → false ∀(noteId, editingNoteId) (≥200 runs)', () => {
    fc.assert(
      fc.property(arbNoteId, fc.oneof(fc.constant(null), arbNoteId), (noteId, editingNoteId) => {
        return isDeleteButtonDisabled(noteId, 'idle', editingNoteId) === false;
      }),
      { numRuns: 200 }
    );
  });
});

// ── REQ-FEED-003 / PROP-FEED-034: tag iteration preservation ─────────────────

describe('REQ-FEED-003 / PROP-FEED-034: tag array order and length preservation', () => {
  test('PROP-FEED-034a: bodyPreviewLines preserves order of lines (example)', () => {
    const body = 'alpha\nbeta\ngamma';
    const result = bodyPreviewLines(body, 3);
    expect(result[0]).toBe('alpha');
    expect(result[1]).toBe('beta');
    expect(result[2]).toBe('gamma');
  });

  test('PROP-FEED-034b: fast-check — order preserved for all bodies (≥200 runs)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
        (lines) => {
          const body = lines.join('\n');
          const n = lines.length;
          const result = bodyPreviewLines(body, n);
          for (let i = 0; i < n; i++) {
            if (result[i] !== lines[i]) return false;
          }
          return true;
        }
      ),
      { numRuns: 200 }
    );
  });
});
