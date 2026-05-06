/**
 * searchPredicate.test.ts — Phase 2a (Red): pure searchPredicate unit tests
 *
 * Coverage:
 *   PROP-FILTER-010 (searchPredicate: ASCII case-insensitive; uses toLowerCase not toLocaleLowerCase)
 *   PROP-FILTER-011 (empty needle is universal pass)
 *   REQ-FILTER-005 (case-insensitive substring matching)
 *
 * RED PHASE: searchPredicate does not exist yet — all tests MUST FAIL.
 */

import { describe, test, expect } from 'bun:test';
import { searchPredicate } from '$lib/feed/searchPredicate';

describe('searchPredicate — pure unit tests (REQ-FILTER-005)', () => {
  // ── Empty needle ──────────────────────────────────────────────────────────

  test('PROP-FILTER-011: empty needle always returns true', () => {
    expect(searchPredicate('', 'Hello World')).toBe(true);
    expect(searchPredicate('', '')).toBe(true);
    expect(searchPredicate('', 'テスト')).toBe(true);
    expect(searchPredicate('', '.*+?[]()')).toBe(true);
  });

  // ── ASCII case-insensitive matching ───────────────────────────────────────

  test('PROP-FILTER-010: "hello" matches "Hello World" (ASCII case-fold)', () => {
    expect(searchPredicate('hello', 'Hello World')).toBe(true);
  });

  test('PROP-FILTER-010: "HELLO" matches "hello world" (ASCII case-fold)', () => {
    expect(searchPredicate('HELLO', 'hello world')).toBe(true);
  });

  test('PROP-FILTER-010: "draft" matches "draft" (exact, tag name)', () => {
    expect(searchPredicate('draft', 'draft')).toBe(true);
  });

  test('PROP-FILTER-010: "draft" matches "no-draft-needed"', () => {
    expect(searchPredicate('draft', 'no-draft-needed')).toBe(true);
  });

  test('PROP-FILTER-010: "hello" does NOT match "Goodbye"', () => {
    expect(searchPredicate('hello', 'Goodbye')).toBe(false);
  });

  test('PROP-FILTER-010: "" (empty haystack) with non-empty needle returns false', () => {
    expect(searchPredicate('hello', '')).toBe(false);
  });

  // ── Substring semantics ───────────────────────────────────────────────────

  test('Substring match: "ell" matches "Hello World"', () => {
    expect(searchPredicate('ell', 'Hello World')).toBe(true);
  });

  test('Exact match: full haystack as needle', () => {
    expect(searchPredicate('hello world', 'Hello World')).toBe(true);
  });

  // ── Japanese (EC-S-009): no case change expected ──────────────────────────

  test('EC-S-009: "テスト" matches "テスト" (no case transformation for CJK)', () => {
    expect(searchPredicate('テスト', 'テスト')).toBe(true);
  });

  test('EC-S-009: "テスト" does NOT match "テスた" (different characters)', () => {
    expect(searchPredicate('テスト', 'テスた')).toBe(false);
  });

  // ── Special regex chars (EC-S-015): treated as literals ──────────────────

  test('EC-S-015: ".*+" is literal substring match, not regex', () => {
    expect(searchPredicate('.*+', 'contains .*+ here')).toBe(true);
    expect(searchPredicate('.*+', 'no special chars here')).toBe(false);
  });

  test('EC-S-015: "[abc]" literal bracket search', () => {
    expect(searchPredicate('[abc]', 'value [abc] here')).toBe(true);
  });

  // ── Control characters (EC-S-011) ─────────────────────────────────────────

  test('EC-S-011: newline in needle matches if haystack contains newline', () => {
    expect(searchPredicate('\n', 'line1\nline2')).toBe(true);
    expect(searchPredicate('\n', 'no newline here')).toBe(false);
  });

  test('EC-S-011: tab in needle matches if haystack contains tab', () => {
    expect(searchPredicate('\t', 'col1\tcol2')).toBe(true);
    expect(searchPredicate('\t', 'no tab here')).toBe(false);
  });

  // ── Very long needle (EC-S-012) ───────────────────────────────────────────

  test('EC-S-012: very long needle does not throw', () => {
    const longNeedle = 'a'.repeat(10000);
    const haystack = 'b'.repeat(10000);
    expect(() => searchPredicate(longNeedle, haystack)).not.toThrow();
  });

  test('EC-S-012: very long needle matches when haystack contains it', () => {
    const longNeedle = 'a'.repeat(100);
    const haystack = 'prefix ' + 'a'.repeat(100) + ' suffix';
    expect(searchPredicate(longNeedle, haystack)).toBe(true);
  });

  // ── RTL characters (EC-S-013) ─────────────────────────────────────────────

  test('EC-S-013: Arabic substring match works correctly', () => {
    expect(searchPredicate('مرحبا', 'قول مرحبا للجميع')).toBe(true);
  });

  // ── toLowerCase NOT toLocaleLowerCase requirement ─────────────────────────
  // Note: This is verified structurally in purityAudit.test.ts via grep,
  // but we confirm no-throw behavior here for completeness.

  test('No throw for any ASCII printable needle/haystack', () => {
    const ascii = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
    expect(() => searchPredicate(ascii, ascii)).not.toThrow();
  });
});
