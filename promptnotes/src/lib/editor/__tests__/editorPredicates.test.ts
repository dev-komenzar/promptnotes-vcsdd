/**
 * editorPredicates.test.ts — Tier 1 unit tests (bun:test)
 *
 * Coverage: REQ-EDIT-003, REQ-EDIT-016, REQ-EDIT-022, EC-EDIT-006
 * PROPs: PROP-EDIT-005 (example-based), PROP-EDIT-031 (exact message strings),
 *        PROP-EDIT-011 subset (classifySource), CRIT-011
 *
 * RED PHASE: imports MUST fail at runtime — stubs throw 'not implemented (Red phase)'.
 * All assertions below will error before any passing state.
 */

import { describe, test, expect } from 'bun:test';
import type { SaveError } from '$lib/editor/types';
import {
  canCopy,
  isEmptyAfterTrim,
  bannerMessageFor,
  classifySource,
} from '$lib/editor/editorPredicates';

// ── REQ-EDIT-003: isEmptyAfterTrim ────────────────────────────────────────────

describe('isEmptyAfterTrim (REQ-EDIT-003, RD-006)', () => {
  test('empty string is empty after trim', () => {
    expect(isEmptyAfterTrim('')).toBe(true);
  });

  test('whitespace-only string is empty after trim', () => {
    expect(isEmptyAfterTrim('   ')).toBe(true);
  });

  test('tabs-only is empty after trim', () => {
    expect(isEmptyAfterTrim('\t\t')).toBe(true);
  });

  test('newline-only is empty after trim', () => {
    expect(isEmptyAfterTrim('\n\n')).toBe(true);
  });

  test('mixed whitespace is empty after trim', () => {
    expect(isEmptyAfterTrim(' \t\n ')).toBe(true);
  });

  test('non-whitespace single character is NOT empty', () => {
    expect(isEmptyAfterTrim('a')).toBe(false);
  });

  test('body with leading/trailing whitespace but non-empty interior is NOT empty', () => {
    expect(isEmptyAfterTrim('  hello world  ')).toBe(false);
  });

  test('body with only newlines and then text is NOT empty', () => {
    expect(isEmptyAfterTrim('\nsome content\n')).toBe(false);
  });
});

// ── REQ-EDIT-003, REQ-EDIT-022, EC-EDIT-006: canCopy ─────────────────────────

describe('canCopy (REQ-EDIT-003, REQ-EDIT-022, EC-EDIT-006)', () => {
  // status ∈ {'idle', 'switching', 'save-failed'} → always false

  test('canCopy returns false for idle regardless of body', () => {
    expect(canCopy('some content', 'idle')).toBe(false);
  });

  test('canCopy returns false for idle when body is empty', () => {
    expect(canCopy('', 'idle')).toBe(false);
  });

  test('canCopy returns false for switching regardless of body', () => {
    expect(canCopy('non-empty body', 'switching')).toBe(false);
  });

  test('canCopy returns false for switching when body is empty', () => {
    expect(canCopy('', 'switching')).toBe(false);
  });

  test('canCopy returns false for save-failed regardless of body (REQ-EDIT-013)', () => {
    expect(canCopy('important content', 'save-failed')).toBe(false);
  });

  test('canCopy returns false for save-failed when body is empty', () => {
    expect(canCopy('', 'save-failed')).toBe(false);
  });

  // status ∈ {'editing', 'saving'} → !isEmptyAfterTrim(body)

  test('canCopy returns true for editing with non-empty body', () => {
    expect(canCopy('some prompt text', 'editing')).toBe(true);
  });

  test('canCopy returns false for editing with empty body', () => {
    expect(canCopy('', 'editing')).toBe(false);
  });

  test('canCopy returns false for editing with whitespace-only body (EC-EDIT-006)', () => {
    expect(canCopy('   ', 'editing')).toBe(false);
  });

  test('canCopy returns true for saving with non-empty body', () => {
    expect(canCopy('some content', 'saving')).toBe(true);
  });

  test('canCopy returns false for saving with empty body', () => {
    expect(canCopy('', 'saving')).toBe(false);
  });

  test('canCopy returns false for saving with whitespace-only body', () => {
    expect(canCopy('\t\n\t', 'saving')).toBe(false);
  });

  test('canCopy: body with leading whitespace and non-empty content — editing enables copy', () => {
    expect(canCopy('  a  ', 'editing')).toBe(true);
  });
});

// ── REQ-EDIT-016, PROP-EDIT-031: bannerMessageFor exact strings ───────────────

describe('bannerMessageFor (REQ-EDIT-016, PROP-EDIT-031)', () => {
  const permissionError: SaveError = { kind: 'fs', reason: { kind: 'permission' } };
  const diskFullError: SaveError = { kind: 'fs', reason: { kind: 'disk-full' } };
  const lockError: SaveError = { kind: 'fs', reason: { kind: 'lock' } };
  const unknownError: SaveError = { kind: 'fs', reason: { kind: 'unknown' } };
  const invariantViolated: SaveError = { kind: 'validation', reason: { kind: 'invariant-violated' } };
  const emptyBodyOnIdle: SaveError = { kind: 'validation', reason: { kind: 'empty-body-on-idle' } };

  test('fs permission → exact Japanese message', () => {
    expect(bannerMessageFor(permissionError)).toBe('保存に失敗しました（権限不足）');
  });

  test('fs disk-full → exact Japanese message', () => {
    expect(bannerMessageFor(diskFullError)).toBe('保存に失敗しました（ディスク容量不足）');
  });

  test('fs lock → exact Japanese message', () => {
    expect(bannerMessageFor(lockError)).toBe('保存に失敗しました（ファイルがロックされています）');
  });

  test('fs unknown → generic Japanese message', () => {
    expect(bannerMessageFor(unknownError)).toBe('保存に失敗しました');
  });

  test('validation invariant-violated → returns null (silent, REQ-EDIT-016)', () => {
    expect(bannerMessageFor(invariantViolated)).toBeNull();
  });

  test('validation empty-body-on-idle → returns null (silent discard path, REQ-EDIT-016)', () => {
    expect(bannerMessageFor(emptyBodyOnIdle)).toBeNull();
  });

  test('bannerMessageFor never returns undefined for any SaveError', () => {
    const allErrors: SaveError[] = [
      permissionError,
      diskFullError,
      lockError,
      unknownError,
      invariantViolated,
      emptyBodyOnIdle,
    ];
    for (const err of allErrors) {
      const result = bannerMessageFor(err);
      expect(result).not.toBeUndefined();
    }
  });

  test('fs errors always return a non-empty string', () => {
    const fsErrors: SaveError[] = [permissionError, diskFullError, lockError, unknownError];
    for (const err of fsErrors) {
      const result = bannerMessageFor(err);
      expect(typeof result).toBe('string');
      expect((result as string).length).toBeGreaterThan(0);
    }
  });
});

// ── REQ-EDIT-026, CRIT-011: classifySource ───────────────────────────────────

describe('classifySource (REQ-EDIT-026, CRIT-011, RD-013)', () => {
  test("classifySource('idle') returns 'capture-idle'", () => {
    expect(classifySource('idle')).toBe('capture-idle');
  });

  test("classifySource('blur') returns 'capture-blur'", () => {
    expect(classifySource('blur')).toBe('capture-blur');
  });

  test('classifySource result for idle matches domain enum value', () => {
    const result: 'capture-idle' | 'capture-blur' = classifySource('idle');
    expect(result).toBe('capture-idle');
  });

  test('classifySource result for blur matches domain enum value', () => {
    const result: 'capture-idle' | 'capture-blur' = classifySource('blur');
    expect(result).toBe('capture-blur');
  });
});
