/**
 * editorPredicates.test.ts — Tier 1 unit tests (bun:test)
 *
 * Sprint 7 Red phase. All tests MUST FAIL because the stubs throw.
 *
 * Coverage:
 *   PROP-EDIT-005 (bannerMessageFor exhaustiveness — example-based)
 *   PROP-EDIT-010 (classifyMarkdownPrefix — example-based)
 *   PROP-EDIT-011 (classifyBackspaceAtZero — example-based)
 *   PROP-EDIT-042 (bannerMessageFor exact Japanese strings)
 *
 * REQ-EDIT references appear in test description strings for CRIT-700/CRIT-701 grep.
 */

import { describe, test, expect } from 'bun:test';
import type { SaveError, EditorViewState } from '$lib/editor/types';
import {
  canCopy,
  bannerMessageFor,
  classifySource,
  splitOrInsert,
  classifyMarkdownPrefix,
  classifyBackspaceAtZero,
} from '$lib/editor/editorPredicates';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeView(overrides: Partial<EditorViewState> = {}): EditorViewState {
  return {
    status: 'editing',
    isDirty: false,
    currentNoteId: 'note-1',
    focusedBlockId: 'block-1',
    pendingNextFocus: null,
    isNoteEmpty: false,
    lastSaveError: null,
    lastSaveResult: null,
    blocks: [],
    ...overrides,
  };
}

// ── REQ-EDIT-005, REQ-EDIT-032: canCopy ───────────────────────────────────────

describe('canCopy (REQ-EDIT-005, REQ-EDIT-032, PROP-EDIT-006)', () => {
  test('REQ-EDIT-032: canCopy returns false for idle regardless of isNoteEmpty', () => {
    expect(canCopy(makeView({ status: 'idle', isNoteEmpty: false }))).toBe(false);
  });

  test('REQ-EDIT-032: canCopy returns false for idle when isNoteEmpty=true', () => {
    expect(canCopy(makeView({ status: 'idle', isNoteEmpty: true }))).toBe(false);
  });

  test('REQ-EDIT-032: canCopy returns false for switching regardless of isNoteEmpty', () => {
    expect(canCopy(makeView({ status: 'switching', isNoteEmpty: false }))).toBe(false);
  });

  test('REQ-EDIT-032: canCopy returns false for save-failed regardless of isNoteEmpty', () => {
    expect(canCopy(makeView({ status: 'save-failed', isNoteEmpty: false }))).toBe(false);
  });

  test('REQ-EDIT-005: canCopy returns true for editing when isNoteEmpty=false', () => {
    expect(canCopy(makeView({ status: 'editing', isNoteEmpty: false }))).toBe(true);
  });

  test('REQ-EDIT-005: canCopy returns false for editing when isNoteEmpty=true', () => {
    expect(canCopy(makeView({ status: 'editing', isNoteEmpty: true }))).toBe(false);
  });

  test('REQ-EDIT-005: canCopy returns true for saving when isNoteEmpty=false', () => {
    expect(canCopy(makeView({ status: 'saving', isNoteEmpty: false }))).toBe(true);
  });

  test('REQ-EDIT-005: canCopy returns false for saving when isNoteEmpty=true', () => {
    expect(canCopy(makeView({ status: 'saving', isNoteEmpty: true }))).toBe(false);
  });
});

// ── REQ-EDIT-026, PROP-EDIT-042: bannerMessageFor exact Japanese strings ────────

describe('bannerMessageFor (REQ-EDIT-025, REQ-EDIT-026, PROP-EDIT-005, PROP-EDIT-042)', () => {
  const permissionError: SaveError = { kind: 'fs', reason: { kind: 'permission' } };
  const diskFullError: SaveError   = { kind: 'fs', reason: { kind: 'disk-full' } };
  const lockError: SaveError       = { kind: 'fs', reason: { kind: 'lock' } };
  const notFoundError: SaveError   = { kind: 'fs', reason: { kind: 'not-found' } };
  const unknownError: SaveError    = { kind: 'fs', reason: { kind: 'unknown' } };
  const invariantViolated: SaveError = { kind: 'validation', reason: { kind: 'invariant-violated' } };
  const emptyBodyOnIdle: SaveError   = { kind: 'validation', reason: { kind: 'empty-body-on-idle' } };

  test('PROP-EDIT-042: fs permission → 保存に失敗しました（権限不足）', () => {
    expect(bannerMessageFor(permissionError)).toBe('保存に失敗しました（権限不足）');
  });

  test('PROP-EDIT-042: fs disk-full → 保存に失敗しました（ディスク容量不足）', () => {
    expect(bannerMessageFor(diskFullError)).toBe('保存に失敗しました（ディスク容量不足）');
  });

  test('PROP-EDIT-042: fs lock → 保存に失敗しました（ファイルがロックされています）', () => {
    expect(bannerMessageFor(lockError)).toBe('保存に失敗しました（ファイルがロックされています）');
  });

  test('PROP-EDIT-042: fs not-found → 保存に失敗しました（保存先が見つかりません）', () => {
    expect(bannerMessageFor(notFoundError)).toBe('保存に失敗しました（保存先が見つかりません）');
  });

  test('PROP-EDIT-042: fs unknown → 保存に失敗しました', () => {
    expect(bannerMessageFor(unknownError)).toBe('保存に失敗しました');
  });

  test('PROP-EDIT-042: validation invariant-violated → null (REQ-EDIT-026 silent)', () => {
    expect(bannerMessageFor(invariantViolated)).toBeNull();
  });

  test('PROP-EDIT-042: validation empty-body-on-idle → null (REQ-EDIT-026 silent)', () => {
    expect(bannerMessageFor(emptyBodyOnIdle)).toBeNull();
  });

  test('PROP-EDIT-005: bannerMessageFor never returns undefined for any SaveError', () => {
    const allErrors: SaveError[] = [
      permissionError, diskFullError, lockError, notFoundError,
      unknownError, invariantViolated, emptyBodyOnIdle,
    ];
    for (const err of allErrors) {
      expect(bannerMessageFor(err)).not.toBeUndefined();
    }
  });

  test('PROP-EDIT-005: all fs errors return a non-empty string', () => {
    const fsErrors: SaveError[] = [permissionError, diskFullError, lockError, notFoundError, unknownError];
    for (const err of fsErrors) {
      const result = bannerMessageFor(err);
      expect(typeof result).toBe('string');
      expect((result as string).length).toBeGreaterThan(0);
    }
  });
});

// ── REQ-EDIT-037: classifySource ──────────────────────────────────────────────

describe('classifySource (REQ-EDIT-037, PROP-EDIT-002)', () => {
  test("classifySource('idle') returns 'capture-idle'", () => {
    expect(classifySource('idle')).toBe('capture-idle');
  });

  test("classifySource('blur') returns 'capture-blur'", () => {
    expect(classifySource('blur')).toBe('capture-blur');
  });
});

// ── REQ-EDIT-006, REQ-EDIT-007, EC-EDIT-012: splitOrInsert ────────────────────

describe('splitOrInsert (REQ-EDIT-006, REQ-EDIT-007, PROP-EDIT-001, EC-EDIT-012)', () => {
  test('REQ-EDIT-006: offset === contentLength returns insert (Enter at end)', () => {
    expect(splitOrInsert(5, 5)).toBe('insert');
  });

  test('REQ-EDIT-006: offset === 0, contentLength === 0 returns insert (empty block)', () => {
    expect(splitOrInsert(0, 0)).toBe('insert');
  });

  test('REQ-EDIT-007: offset === 0, contentLength > 0 returns split (cursor at start)', () => {
    expect(splitOrInsert(0, 5)).toBe('split');
  });

  test('REQ-EDIT-007: offset mid-block returns split', () => {
    expect(splitOrInsert(3, 10)).toBe('split');
  });

  test('REQ-EDIT-007: offset === contentLength - 1 returns split (one before end)', () => {
    expect(splitOrInsert(4, 5)).toBe('split');
  });

  test('EC-EDIT-012: offset strictly inside [0, length) always returns split', () => {
    expect(splitOrInsert(1, 2)).toBe('split');
  });
});

// ── REQ-EDIT-010, EC-EDIT-013: classifyMarkdownPrefix ─────────────────────────

describe('classifyMarkdownPrefix (REQ-EDIT-010, PROP-EDIT-010, EC-EDIT-013)', () => {
  test("REQ-EDIT-010: '# ' → heading-1 with empty trimmedContent", () => {
    const result = classifyMarkdownPrefix('# ');
    expect(result).toEqual({ newType: 'heading-1', trimmedContent: '' });
  });

  test("REQ-EDIT-010: '## ' → heading-2", () => {
    const result = classifyMarkdownPrefix('## ');
    expect(result).toEqual({ newType: 'heading-2', trimmedContent: '' });
  });

  test("REQ-EDIT-010: '### ' → heading-3", () => {
    const result = classifyMarkdownPrefix('### ');
    expect(result).toEqual({ newType: 'heading-3', trimmedContent: '' });
  });

  test("REQ-EDIT-010: '- ' → bullet", () => {
    const result = classifyMarkdownPrefix('- ');
    expect(result).toEqual({ newType: 'bullet', trimmedContent: '' });
  });

  test("REQ-EDIT-010: '* ' → bullet", () => {
    const result = classifyMarkdownPrefix('* ');
    expect(result).toEqual({ newType: 'bullet', trimmedContent: '' });
  });

  test("REQ-EDIT-010: '1. ' → numbered", () => {
    const result = classifyMarkdownPrefix('1. ');
    expect(result).toEqual({ newType: 'numbered', trimmedContent: '' });
  });

  test("REQ-EDIT-010: '```' → code", () => {
    const result = classifyMarkdownPrefix('```');
    expect(result).toEqual({ newType: 'code', trimmedContent: '' });
  });

  test("REQ-EDIT-010: '> ' → quote", () => {
    const result = classifyMarkdownPrefix('> ');
    expect(result).toEqual({ newType: 'quote', trimmedContent: '' });
  });

  test("EC-EDIT-013: '---' exactly → divider (exact-match rule)", () => {
    const result = classifyMarkdownPrefix('---');
    expect(result).toEqual({ newType: 'divider', trimmedContent: '' });
  });

  test("EC-EDIT-013: '---more' → null (not exact divider)", () => {
    expect(classifyMarkdownPrefix('---more')).toBeNull();
  });

  test("EC-EDIT-013: '--- ' (trailing space) → null (not exact divider)", () => {
    expect(classifyMarkdownPrefix('--- ')).toBeNull();
  });

  test("EC-EDIT-013: '----' → null (too many hyphens)", () => {
    expect(classifyMarkdownPrefix('----')).toBeNull();
  });

  test('REQ-EDIT-010: unknown prefix returns null', () => {
    expect(classifyMarkdownPrefix('hello world')).toBeNull();
  });

  test('REQ-EDIT-010: empty string returns null', () => {
    expect(classifyMarkdownPrefix('')).toBeNull();
  });

  test('REQ-EDIT-010: prefix with content strips prefix correctly', () => {
    const result = classifyMarkdownPrefix('# My Heading');
    expect(result).toEqual({ newType: 'heading-1', trimmedContent: 'My Heading' });
  });
});

// ── REQ-EDIT-008, EC-EDIT-011: classifyBackspaceAtZero ───────────────────────

describe('classifyBackspaceAtZero (REQ-EDIT-008, PROP-EDIT-011, EC-EDIT-011)', () => {
  test('EC-EDIT-011: focusedIndex=0 → first-block-noop for any blockCount>=1', () => {
    expect(classifyBackspaceAtZero(0, 1)).toBe('first-block-noop');
    expect(classifyBackspaceAtZero(0, 2)).toBe('first-block-noop');
    expect(classifyBackspaceAtZero(0, 10)).toBe('first-block-noop');
  });

  test('REQ-EDIT-008: focusedIndex=1 in 2-block note → merge', () => {
    expect(classifyBackspaceAtZero(1, 2)).toBe('merge');
  });

  test('REQ-EDIT-008: focusedIndex=1 in 3-block note → merge', () => {
    expect(classifyBackspaceAtZero(1, 3)).toBe('merge');
  });

  test('REQ-EDIT-008: focusedIndex mid-range → merge', () => {
    expect(classifyBackspaceAtZero(3, 5)).toBe('merge');
  });

  test('PROP-EDIT-011: result is always a defined enum member', () => {
    const validValues = ['merge', 'remove-empty-noop', 'first-block-noop', 'normal-edit'];
    const result = classifyBackspaceAtZero(2, 4);
    expect(validValues).toContain(result);
  });
});
