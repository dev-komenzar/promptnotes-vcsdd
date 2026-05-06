/**
 * sortByUpdatedAt.test.ts — Phase 2a (Red): pure sort comparator unit tests
 *
 * Coverage:
 *   PROP-FILTER-014 (Sort is deterministic; tiebreak by noteId lexicographic same direction)
 *   REQ-FILTER-009 (sort key: updatedAt epoch ms; tiebreak: noteId lexicographic same direction)
 *   EC-T-001 (two notes with identical updatedAt — tiebreak by noteId)
 *   EC-T-002 (updatedAt === 0 — treated as epoch 0)
 *
 * RED PHASE: sortByUpdatedAt does not exist yet — all tests MUST FAIL.
 */

import { describe, test, expect } from 'bun:test';
import { sortByUpdatedAt } from '$lib/feed/sortByUpdatedAt';

type SortEntry = { noteId: string; updatedAt: number };

describe('sortByUpdatedAt — pure comparator factory (REQ-FILTER-009)', () => {
  // ── desc (newest first) ───────────────────────────────────────────────────

  test('desc: sorts notes newest first by updatedAt', () => {
    const entries: SortEntry[] = [
      { noteId: 'b', updatedAt: 1000 },
      { noteId: 'a', updatedAt: 3000 },
      { noteId: 'c', updatedAt: 2000 },
    ];
    const cmp = sortByUpdatedAt('desc');
    entries.sort(cmp);
    expect(entries.map(e => e.noteId)).toEqual(['a', 'c', 'b']);
  });

  // ── asc (oldest first) ───────────────────────────────────────────────────

  test('asc: sorts notes oldest first by updatedAt', () => {
    const entries: SortEntry[] = [
      { noteId: 'b', updatedAt: 1000 },
      { noteId: 'a', updatedAt: 3000 },
      { noteId: 'c', updatedAt: 2000 },
    ];
    const cmp = sortByUpdatedAt('asc');
    entries.sort(cmp);
    expect(entries.map(e => e.noteId)).toEqual(['b', 'c', 'a']);
  });

  // ── Tiebreak: noteId lexicographic same direction (EC-T-001) ─────────────

  test('EC-T-001: tiebreak desc — noteId descending lexicographic for equal updatedAt', () => {
    const entries: SortEntry[] = [
      { noteId: 'note-a', updatedAt: 1000 },
      { noteId: 'note-b', updatedAt: 1000 },
      { noteId: 'note-c', updatedAt: 1000 },
    ];
    const cmp = sortByUpdatedAt('desc');
    entries.sort(cmp);
    // desc tiebreak: note-c > note-b > note-a
    expect(entries.map(e => e.noteId)).toEqual(['note-c', 'note-b', 'note-a']);
  });

  test('EC-T-001: tiebreak asc — noteId ascending lexicographic for equal updatedAt', () => {
    const entries: SortEntry[] = [
      { noteId: 'note-c', updatedAt: 1000 },
      { noteId: 'note-a', updatedAt: 1000 },
      { noteId: 'note-b', updatedAt: 1000 },
    ];
    const cmp = sortByUpdatedAt('asc');
    entries.sort(cmp);
    // asc tiebreak: note-a < note-b < note-c
    expect(entries.map(e => e.noteId)).toEqual(['note-a', 'note-b', 'note-c']);
  });

  // ── updatedAt === 0 (EC-T-002) ───────────────────────────────────────────

  test('EC-T-002: updatedAt=0 treated as epoch 0; sorted correctly relative to others', () => {
    const entries: SortEntry[] = [
      { noteId: 'modern', updatedAt: 5000 },
      { noteId: 'legacy', updatedAt: 0 },
    ];
    const cmp = sortByUpdatedAt('desc');
    entries.sort(cmp);
    expect(entries.map(e => e.noteId)).toEqual(['modern', 'legacy']);
  });

  test('EC-T-002: updatedAt=0 asc — legacy comes first', () => {
    const entries: SortEntry[] = [
      { noteId: 'modern', updatedAt: 5000 },
      { noteId: 'legacy', updatedAt: 0 },
    ];
    const cmp = sortByUpdatedAt('asc');
    entries.sort(cmp);
    expect(entries.map(e => e.noteId)).toEqual(['legacy', 'modern']);
  });

  // ── Determinism (stable sort) ─────────────────────────────────────────────

  test('Comparator is deterministic: same inputs always produce same order', () => {
    const entries1: SortEntry[] = [
      { noteId: 'z', updatedAt: 100 },
      { noteId: 'a', updatedAt: 200 },
      { noteId: 'm', updatedAt: 150 },
    ];
    const entries2: SortEntry[] = [...entries1];

    const cmp = sortByUpdatedAt('desc');
    entries1.sort(cmp);
    entries2.sort(cmp);

    expect(entries1.map(e => e.noteId)).toEqual(entries2.map(e => e.noteId));
  });

  // ── Curried factory: new comparator per call ──────────────────────────────

  test('Factory returns new comparator each call (curried pattern)', () => {
    const cmpDesc1 = sortByUpdatedAt('desc');
    const cmpDesc2 = sortByUpdatedAt('desc');
    // Both should produce the same ordering
    const entries = [
      { noteId: 'b', updatedAt: 200 },
      { noteId: 'a', updatedAt: 100 },
    ];
    const copy = [...entries];
    entries.sort(cmpDesc1);
    copy.sort(cmpDesc2);
    expect(entries.map(e => e.noteId)).toEqual(copy.map(e => e.noteId));
  });

  // ── Single entry ─────────────────────────────────────────────────────────

  test('Single entry is unchanged after sort', () => {
    const entries: SortEntry[] = [{ noteId: 'only', updatedAt: 999 }];
    const cmp = sortByUpdatedAt('asc');
    entries.sort(cmp);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.noteId).toBe('only');
  });

  // ── Empty array ──────────────────────────────────────────────────────────

  test('Empty array does not throw', () => {
    const entries: SortEntry[] = [];
    const cmp = sortByUpdatedAt('desc');
    expect(() => entries.sort(cmp)).not.toThrow();
    expect(entries).toHaveLength(0);
  });
});
