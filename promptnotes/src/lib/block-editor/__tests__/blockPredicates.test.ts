/**
 * blockPredicates.test.ts — Tier 1 unit tests (bun:test)
 *
 * Sprint 1 of ui-block-editor (Phase 2a Red).
 *
 * Coverage:
 *   PROP-BE-001 / REQ-BE-017 — bannerMessageFor totality
 *   PROP-BE-003 / REQ-BE-018 — splitOrInsert simple decision
 *   PROP-BE-005 / REQ-BE-019 — classifyMarkdownPrefix priority
 *   PROP-BE-006 / REQ-BE-019 — classifyMarkdownPrefix divider exact match
 *   PROP-BE-009 / REQ-BE-020 — classifyBackspaceAtZero totality
 *   PROP-BE-010 / REQ-BE-020 — classifyBackspaceAtZero branches
 *   PROP-BE-011 / REQ-BE-021 — classifySource bijective
 */

import { describe, test, expect } from 'bun:test';
import type { SaveError } from '$lib/block-editor/types';
import {
  bannerMessageFor,
  classifySource,
  splitOrInsert,
  classifyMarkdownPrefix,
  classifyBackspaceAtZero,
} from '$lib/block-editor/blockPredicates';

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-001 / REQ-BE-017: bannerMessageFor totality
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-001 / REQ-BE-017: bannerMessageFor — fs variants return Japanese strings', () => {
  test('fs.permission → 保存に失敗しました（権限不足）', () => {
    const err: SaveError = { kind: 'fs', reason: { kind: 'permission' } };
    expect(bannerMessageFor(err)).toBe('保存に失敗しました（権限不足）');
  });

  test('fs.disk-full → 保存に失敗しました（ディスク容量不足）', () => {
    const err: SaveError = { kind: 'fs', reason: { kind: 'disk-full' } };
    expect(bannerMessageFor(err)).toBe('保存に失敗しました（ディスク容量不足）');
  });

  test('fs.lock → 保存に失敗しました（ファイルがロックされています）', () => {
    const err: SaveError = { kind: 'fs', reason: { kind: 'lock' } };
    expect(bannerMessageFor(err)).toBe('保存に失敗しました（ファイルがロックされています）');
  });

  test('fs.not-found → 保存に失敗しました（保存先が見つかりません）', () => {
    const err: SaveError = { kind: 'fs', reason: { kind: 'not-found' } };
    expect(bannerMessageFor(err)).toBe('保存に失敗しました（保存先が見つかりません）');
  });

  test('fs.unknown → 保存に失敗しました', () => {
    const err: SaveError = { kind: 'fs', reason: { kind: 'unknown' } };
    expect(bannerMessageFor(err)).toBe('保存に失敗しました');
  });
});

describe('PROP-BE-001 / REQ-BE-017: bannerMessageFor — validation variants return null', () => {
  test('validation.empty-body-on-idle → null', () => {
    const err: SaveError = { kind: 'validation', reason: { kind: 'empty-body-on-idle' } };
    expect(bannerMessageFor(err)).toBe(null);
  });

  test('validation.invariant-violated → null', () => {
    const err: SaveError = { kind: 'validation', reason: { kind: 'invariant-violated' } };
    expect(bannerMessageFor(err)).toBe(null);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-003 / REQ-BE-018: splitOrInsert simple decision
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-003 / REQ-BE-018: splitOrInsert — offset === contentLength ⇒ insert', () => {
  test('splitOrInsert(0, 0) === "insert"', () => {
    expect(splitOrInsert(0, 0)).toBe('insert');
  });

  test('splitOrInsert(5, 5) === "insert"', () => {
    expect(splitOrInsert(5, 5)).toBe('insert');
  });

  test('splitOrInsert(0, 5) === "split"', () => {
    expect(splitOrInsert(0, 5)).toBe('split');
  });

  test('splitOrInsert(3, 5) === "split"', () => {
    expect(splitOrInsert(3, 5)).toBe('split');
  });

  test('splitOrInsert(10, 5) === "split" (out-of-range fallback)', () => {
    expect(splitOrInsert(10, 5)).toBe('split');
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-005 / REQ-BE-019: classifyMarkdownPrefix priority
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-005 / REQ-BE-019: classifyMarkdownPrefix — priority order', () => {
  test('"# hello" → heading-1', () => {
    expect(classifyMarkdownPrefix('# hello')).toEqual({ newType: 'heading-1', trimmedContent: 'hello' });
  });

  test('"## hi" → heading-2', () => {
    expect(classifyMarkdownPrefix('## hi')).toEqual({ newType: 'heading-2', trimmedContent: 'hi' });
  });

  test('"### hi" → heading-3 (longest prefix wins)', () => {
    expect(classifyMarkdownPrefix('### hi')).toEqual({ newType: 'heading-3', trimmedContent: 'hi' });
  });

  test('"- item" → bullet', () => {
    expect(classifyMarkdownPrefix('- item')).toEqual({ newType: 'bullet', trimmedContent: 'item' });
  });

  test('"* item" → bullet', () => {
    expect(classifyMarkdownPrefix('* item')).toEqual({ newType: 'bullet', trimmedContent: 'item' });
  });

  test('"1. item" → numbered', () => {
    expect(classifyMarkdownPrefix('1. item')).toEqual({ newType: 'numbered', trimmedContent: 'item' });
  });

  test('"```js" → code (no trailing space required)', () => {
    expect(classifyMarkdownPrefix('```js')).toEqual({ newType: 'code', trimmedContent: 'js' });
  });

  test('"```" → code (trimmedContent empty)', () => {
    expect(classifyMarkdownPrefix('```')).toEqual({ newType: 'code', trimmedContent: '' });
  });

  test('"> quote" → quote', () => {
    expect(classifyMarkdownPrefix('> quote')).toEqual({ newType: 'quote', trimmedContent: 'quote' });
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-006 / REQ-BE-019: classifyMarkdownPrefix divider exact match
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-006 / REQ-BE-019: classifyMarkdownPrefix — divider exact-match only', () => {
  test('"---" → divider with empty content', () => {
    expect(classifyMarkdownPrefix('---')).toEqual({ newType: 'divider', trimmedContent: '' });
  });

  test('"----" → null (4 dashes is not divider)', () => {
    expect(classifyMarkdownPrefix('----')).toBe(null);
  });

  test('"---a" → null (extra char rejects)', () => {
    expect(classifyMarkdownPrefix('---a')).toBe(null);
  });

  test('"--" → null (only 2 dashes)', () => {
    expect(classifyMarkdownPrefix('--')).toBe(null);
  });
});

describe('PROP-BE-005 / REQ-BE-019: classifyMarkdownPrefix — non-prefix returns null', () => {
  test('"#" → null (no trailing space)', () => {
    expect(classifyMarkdownPrefix('#')).toBe(null);
  });

  test('"hello" → null (non-prefix string)', () => {
    expect(classifyMarkdownPrefix('hello')).toBe(null);
  });

  test('"" → null (empty)', () => {
    expect(classifyMarkdownPrefix('')).toBe(null);
  });

  test('"/menu" → null (slash is reserved for SlashMenu, not in prefix table)', () => {
    expect(classifyMarkdownPrefix('/menu')).toBe(null);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-009 / REQ-BE-020: classifyBackspaceAtZero totality
// PROP-BE-010 / REQ-BE-020: classifyBackspaceAtZero branches
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-009 / PROP-BE-010 / REQ-BE-020: classifyBackspaceAtZero — branches', () => {
  test('focusedIndex === 0 → first-block-noop', () => {
    expect(classifyBackspaceAtZero(0, 5)).toBe('first-block-noop');
  });

  test('focusedIndex === 1 → merge', () => {
    expect(classifyBackspaceAtZero(1, 5)).toBe('merge');
  });

  test('focusedIndex === blockCount - 1 → merge', () => {
    expect(classifyBackspaceAtZero(4, 5)).toBe('merge');
  });

  test('focusedIndex === blockCount → normal-edit (out-of-range fallback)', () => {
    expect(classifyBackspaceAtZero(5, 5)).toBe('normal-edit');
  });

  test('focusedIndex === -1 → normal-edit (negative fallback)', () => {
    expect(classifyBackspaceAtZero(-1, 5)).toBe('normal-edit');
  });

  test('blockCount === 1, focusedIndex === 0 → first-block-noop', () => {
    expect(classifyBackspaceAtZero(0, 1)).toBe('first-block-noop');
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-011 / REQ-BE-021: classifySource bijective
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-011 / REQ-BE-021: classifySource — bijective mapping', () => {
  test('"idle" → "capture-idle"', () => {
    expect(classifySource('idle')).toBe('capture-idle');
  });

  test('"blur" → "capture-blur"', () => {
    expect(classifySource('blur')).toBe('capture-blur');
  });
});
