/**
 * computeVisible.test.ts — Phase 2a (Red): filter + search + sort composition unit tests
 *
 * Coverage:
 *   PROP-FILTER-012 (AND composition: tag filter OR + search contains + sort)
 *   PROP-FILTER-014 (sort deterministic with tiebreak)
 *   REQ-FILTER-008 (AND semantics: tag filter + search)
 *   REQ-FILTER-009 (sort applies after filter + search composition)
 *   EC-C-001..006 (composition edge cases)
 *
 * RED PHASE: computeVisible does not exist yet — all tests MUST FAIL.
 */

import { describe, test, expect } from 'bun:test';
import { computeVisible } from '$lib/feed/computeVisible';
import type { NoteRowMetadata } from '$lib/feed/types';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeMeta(body: string, tags: string[], updatedAt: number): NoteRowMetadata {
  return { body, tags, createdAt: 0, updatedAt };
}

// ── Step 1: Tag filter (OR semantics) ─────────────────────────────────────────

describe('computeVisible: Step 1 — tag filter OR semantics', () => {
  test('No active tags → all notes pass tag filter', () => {
    const allNoteIds = ['a', 'b', 'c'];
    const noteMetadata = {
      a: makeMeta('', [], 1000),
      b: makeMeta('', [], 2000),
      c: makeMeta('', [], 3000),
    };
    const result = computeVisible(allNoteIds, noteMetadata, [], '', 'desc');
    expect(result).toHaveLength(3);
  });

  test('Active tag "work" filters to notes with that tag (OR semantics)', () => {
    const allNoteIds = ['a', 'b', 'c'];
    const noteMetadata = {
      a: makeMeta('', ['work'], 1000),
      b: makeMeta('', ['personal'], 2000),
      c: makeMeta('', ['work', 'personal'], 3000),
    };
    const result = computeVisible(allNoteIds, noteMetadata, ['work'], '', 'desc');
    expect(result).toContain('a');
    expect(result).toContain('c');
    expect(result).not.toContain('b');
  });

  test('Multiple active tags use OR: note matches if it has ANY of the active tags', () => {
    const allNoteIds = ['a', 'b', 'c', 'd'];
    const noteMetadata = {
      a: makeMeta('', ['work'], 1000),
      b: makeMeta('', ['personal'], 2000),
      c: makeMeta('', ['other'], 3000),
      d: makeMeta('', ['work', 'personal'], 4000),
    };
    const result = computeVisible(allNoteIds, noteMetadata, ['work', 'personal'], '', 'desc');
    expect(result).toContain('a');
    expect(result).toContain('b');
    expect(result).toContain('d');
    expect(result).not.toContain('c');
  });
});

// ── Step 2: Search filter (AND, case-insensitive substring) ──────────────────

describe('computeVisible: Step 2 — search filter AND semantics', () => {
  test('Empty searchQuery passes all notes through (no predicate applied)', () => {
    const allNoteIds = ['a', 'b'];
    const noteMetadata = {
      a: makeMeta('Hello', [], 1000),
      b: makeMeta('World', [], 2000),
    };
    const result = computeVisible(allNoteIds, noteMetadata, [], '', 'desc');
    expect(result).toHaveLength(2);
  });

  test('searchQuery "hello" matches body (case-insensitive)', () => {
    const allNoteIds = ['a', 'b'];
    const noteMetadata = {
      a: makeMeta('Hello World', [], 1000),
      b: makeMeta('Goodbye', [], 2000),
    };
    const result = computeVisible(allNoteIds, noteMetadata, [], 'hello', 'desc');
    expect(result).toContain('a');
    expect(result).not.toContain('b');
  });

  test('searchQuery matches tag name (EC-S-008)', () => {
    const allNoteIds = ['a'];
    const noteMetadata = {
      a: makeMeta('unrelated body', ['draft'], 1000),
    };
    const result = computeVisible(allNoteIds, noteMetadata, [], 'draft', 'desc');
    expect(result).toContain('a');
  });

  test('searchQuery "   " (whitespace) matches notes with spaces in body', () => {
    const allNoteIds = ['a', 'b'];
    const noteMetadata = {
      a: makeMeta('word   word', [], 1000),
      b: makeMeta('nospaces', [], 2000),
    };
    const result = computeVisible(allNoteIds, noteMetadata, [], '   ', 'desc');
    expect(result).toContain('a');
    expect(result).not.toContain('b');
  });
});

// ── Step 3: Sort by updatedAt ─────────────────────────────────────────────────

describe('computeVisible: Step 3 — sort by updatedAt', () => {
  test('sortDir "desc": newest first', () => {
    const allNoteIds = ['a', 'b', 'c'];
    const noteMetadata = {
      a: makeMeta('', [], 3000),
      b: makeMeta('', [], 1000),
      c: makeMeta('', [], 2000),
    };
    const result = computeVisible(allNoteIds, noteMetadata, [], '', 'desc');
    expect(Array.from(result)).toEqual(['a', 'c', 'b']);
  });

  test('sortDir "asc": oldest first', () => {
    const allNoteIds = ['a', 'b', 'c'];
    const noteMetadata = {
      a: makeMeta('', [], 3000),
      b: makeMeta('', [], 1000),
      c: makeMeta('', [], 2000),
    };
    const result = computeVisible(allNoteIds, noteMetadata, [], '', 'asc');
    expect(Array.from(result)).toEqual(['b', 'c', 'a']);
  });
});

// ── Full AND composition (REQ-FILTER-008) ─────────────────────────────────────

describe('computeVisible: AND composition (REQ-FILTER-008, EC-C-001..006)', () => {
  test('EC-C-001: tag filter active + search entered → AND semantics', () => {
    const allNoteIds = ['a', 'b', 'c'];
    const noteMetadata = {
      a: makeMeta('hello world', ['work'], 3000),
      b: makeMeta('hello world', ['personal'], 2000),
      c: makeMeta('goodbye', ['work'], 1000),
    };
    // Tag "work" AND search "hello" → only note-a matches both
    const result = computeVisible(allNoteIds, noteMetadata, ['work'], 'hello', 'desc');
    expect(Array.from(result)).toEqual(['a']);
  });

  test('EC-C-003: both cleared → all notes, sorted', () => {
    const allNoteIds = ['a', 'b', 'c'];
    const noteMetadata = {
      a: makeMeta('anything', ['work'], 3000),
      b: makeMeta('anything', ['personal'], 1000),
      c: makeMeta('anything', [], 2000),
    };
    const result = computeVisible(allNoteIds, noteMetadata, [], '', 'desc');
    expect(Array.from(result)).toEqual(['a', 'c', 'b']);
  });

  test('EC-C-004: tag produces 3 notes; search narrows to 0 → empty', () => {
    const allNoteIds = ['a', 'b', 'c'];
    const noteMetadata = {
      a: makeMeta('hello', ['work'], 3000),
      b: makeMeta('hello', ['work'], 2000),
      c: makeMeta('hello', ['work'], 1000),
    };
    const result = computeVisible(allNoteIds, noteMetadata, ['work'], 'zzz', 'desc');
    expect(result).toHaveLength(0);
  });

  test('EC-C-005: no tag filter + search produces 0 results → empty', () => {
    const allNoteIds = ['a'];
    const noteMetadata = {
      a: makeMeta('hello world', [], 1000),
    };
    const result = computeVisible(allNoteIds, noteMetadata, [], 'zzz', 'desc');
    expect(result).toHaveLength(0);
  });

  test('EC-C-006: sort changes order but not the set of visible notes', () => {
    const allNoteIds = ['a', 'b', 'c'];
    const noteMetadata = {
      a: makeMeta('hello', ['work'], 3000),
      b: makeMeta('hello', ['work'], 1000),
      c: makeMeta('hello', ['work'], 2000),
    };
    const descResult = computeVisible(allNoteIds, noteMetadata, ['work'], 'hello', 'desc');
    const ascResult = computeVisible(allNoteIds, noteMetadata, ['work'], 'hello', 'asc');

    // Same set of notes
    expect(new Set(descResult)).toEqual(new Set(ascResult));
    // Different order
    expect(Array.from(descResult)).toEqual(['a', 'c', 'b']);
    expect(Array.from(ascResult)).toEqual(['b', 'c', 'a']);
  });

  test('Returns readonly string[] — result is an array', () => {
    const result = computeVisible([], {}, [], '', 'desc');
    expect(Array.isArray(result)).toBe(true);
  });

  test('Missing noteMetadata entry for a noteId: treated as empty (no throw)', () => {
    const allNoteIds = ['exists', 'missing'];
    const noteMetadata = {
      exists: makeMeta('hello', [], 1000),
      // 'missing' not in noteMetadata
    };
    expect(() => computeVisible(allNoteIds, noteMetadata, [], 'hello', 'desc')).not.toThrow();
  });
});

// ── Sort tiebreak (REQ-FILTER-009, EC-T-001) ─────────────────────────────────

describe('computeVisible: sort tiebreak (REQ-FILTER-009, EC-T-001)', () => {
  test('EC-T-001: equal updatedAt → tiebreak by noteId desc', () => {
    const allNoteIds = ['note-a', 'note-c', 'note-b'];
    const noteMetadata = {
      'note-a': makeMeta('', [], 1000),
      'note-b': makeMeta('', [], 1000),
      'note-c': makeMeta('', [], 1000),
    };
    const result = computeVisible(allNoteIds, noteMetadata, [], '', 'desc');
    expect(Array.from(result)).toEqual(['note-c', 'note-b', 'note-a']);
  });

  test('EC-T-001: equal updatedAt → tiebreak by noteId asc', () => {
    const allNoteIds = ['note-c', 'note-a', 'note-b'];
    const noteMetadata = {
      'note-a': makeMeta('', [], 1000),
      'note-b': makeMeta('', [], 1000),
      'note-c': makeMeta('', [], 1000),
    };
    const result = computeVisible(allNoteIds, noteMetadata, [], '', 'asc');
    expect(Array.from(result)).toEqual(['note-a', 'note-b', 'note-c']);
  });
});
