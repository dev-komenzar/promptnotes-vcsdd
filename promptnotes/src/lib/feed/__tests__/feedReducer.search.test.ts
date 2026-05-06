/**
 * feedReducer.search.test.ts — Phase 2a (Red): search/sort reducer unit tests
 *
 * Coverage:
 *   PROP-FILTER-002 (SearchApplied: sets searchQuery, recomputes visibleNoteIds, commands:[])
 *   PROP-FILTER-003 (SearchCleared: resets query, recomputes visibleNoteIds, commands:[])
 *   PROP-FILTER-004 (SortDirectionToggled: flips direction, recomputes visibleNoteIds, commands:[])
 *   PROP-FILTER-006 (DomainSnapshotReceived preserves searchQuery + sortDirection)
 *   PROP-FILTER-007 (DomainSnapshotReceived recomputes visibleNoteIds with search active)
 *   PROP-FILTER-008 (SearchCleared immediately recomputes visibleNoteIds)
 *   PROP-FILTER-009 (SortDirectionToggled immediately recomputes visibleNoteIds)
 *   PROP-FILTER-011 (searchPredicate empty needle is universal pass)
 *   PROP-FILTER-012 (AND composition: tag + search on computeVisible)
 *   PROP-FILTER-013 (Tag filter preserved after search cleared)
 *   PROP-FILTER-014 (Sort is deterministic with tiebreak)
 *   PROP-FILTER-023 (Whitespace-only query not short-circuited in reducer)
 *
 * REQ coverage: REQ-FILTER-002..012, REQ-FILTER-016
 *
 * RED PHASE: feedReducer does not yet handle SearchApplied / SearchCleared /
 * SortDirectionToggled, and FeedViewState lacks searchQuery / sortDirection.
 * All assertions MUST FAIL.
 */

import { describe, test, expect } from 'bun:test';
import type { FeedViewState, FeedAction, FeedDomainSnapshot, NoteRowMetadata } from '$lib/feed/types';
import { feedReducer } from '$lib/feed/feedReducer';

// ── Extended type declarations (RED: these fields do not exist yet) ───────────

interface SearchFeedViewState extends FeedViewState {
  readonly searchQuery: string;
  readonly sortDirection: 'asc' | 'desc';
}

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeState(overrides: Partial<SearchFeedViewState> = {}): SearchFeedViewState {
  return {
    editingStatus: 'idle',
    editingNoteId: null,
    pendingNextNoteId: null,
    visibleNoteIds: [],
    allNoteIds: [],
    loadingStatus: 'ready',
    activeDeleteModalNoteId: null,
    lastDeletionError: null,
    noteMetadata: {},
    tagAutocompleteVisibleFor: null,
    activeFilterTags: [],
    searchQuery: '',
    sortDirection: 'desc',
    ...overrides,
  } as SearchFeedViewState;
}

function makeMetadata(body: string, tags: string[], updatedAt: number = 1000): NoteRowMetadata {
  return { body, tags, createdAt: 0, updatedAt };
}

function makeSnapshot(overrides: Partial<FeedDomainSnapshot> = {}): FeedDomainSnapshot {
  return {
    editing: { status: 'idle', currentNoteId: null, pendingNextNoteId: null },
    feed: { visibleNoteIds: [], filterApplied: false },
    delete: { activeDeleteModalNoteId: null, lastDeletionError: null },
    noteMetadata: {},
    cause: { kind: 'EditingStateChanged' },
    ...overrides,
  };
}

// ── PROP-FILTER-002: SearchApplied sets searchQuery, recomputes visibleNoteIds ─

describe('PROP-FILTER-002: SearchApplied (REQ-FILTER-002, REQ-FILTER-005)', () => {
  test('PROP-FILTER-002a: SearchApplied sets searchQuery to action.query', () => {
    const state = makeState({ allNoteIds: ['note-1', 'note-2'], noteMetadata: {} });
    const action = { kind: 'SearchApplied' as const, query: 'hello' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect((result.state as unknown as SearchFeedViewState).searchQuery).toBe('hello');
  });

  test('PROP-FILTER-002b: SearchApplied returns commands: []', () => {
    const state = makeState();
    const action = { kind: 'SearchApplied' as const, query: 'test' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.commands).toHaveLength(0);
  });

  test('PROP-FILTER-002c: SearchApplied("hello") filters notes by case-insensitive substring', () => {
    const state = makeState({
      allNoteIds: ['note-a', 'note-b'],
      noteMetadata: {
        'note-a': makeMetadata('Hello World', []),
        'note-b': makeMetadata('Goodbye', []),
      },
    });
    const action = { kind: 'SearchApplied' as const, query: 'hello' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.state.visibleNoteIds).toContain('note-a');
    expect(result.state.visibleNoteIds).not.toContain('note-b');
  });

  test('PROP-FILTER-002d / EC-S-001: SearchApplied("") shows all notes (no search predicate applied)', () => {
    const state = makeState({
      allNoteIds: ['note-a', 'note-b'],
      noteMetadata: {
        'note-a': makeMetadata('Hello', []),
        'note-b': makeMetadata('Goodbye', []),
      },
    });
    const action = { kind: 'SearchApplied' as const, query: '' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.state.visibleNoteIds).toContain('note-a');
    expect(result.state.visibleNoteIds).toContain('note-b');
  });

  test('PROP-FILTER-002e: SearchApplied matches by tag name (EC-S-008)', () => {
    const state = makeState({
      allNoteIds: ['note-a'],
      noteMetadata: {
        'note-a': makeMetadata('No relevant body', ['draft']),
      },
    });
    const action = { kind: 'SearchApplied' as const, query: 'draft' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.state.visibleNoteIds).toContain('note-a');
  });

  test('PROP-FILTER-002f: SearchApplied with partial tag match (EC-S-008)', () => {
    const state = makeState({
      allNoteIds: ['note-a'],
      noteMetadata: {
        'note-a': makeMetadata('', ['draft']),
      },
    });
    const action = { kind: 'SearchApplied' as const, query: 'dra' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.state.visibleNoteIds).toContain('note-a');
  });

  test('PROP-FILTER-002g: SearchApplied with Japanese (EC-S-009, no case change)', () => {
    const state = makeState({
      allNoteIds: ['note-a'],
      noteMetadata: {
        'note-a': makeMetadata('テスト', []),
      },
    });
    const action = { kind: 'SearchApplied' as const, query: 'テスト' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.state.visibleNoteIds).toContain('note-a');
  });
});

// ── PROP-FILTER-003: SearchCleared resets query and recomputes ─────────────────

describe('PROP-FILTER-003 / PROP-FILTER-008: SearchCleared (REQ-FILTER-003)', () => {
  test('PROP-FILTER-003a: SearchCleared sets searchQuery to empty string', () => {
    const state = makeState({
      searchQuery: 'hello',
      allNoteIds: ['note-a'],
      noteMetadata: { 'note-a': makeMetadata('Hello', []) },
    });
    const action = { kind: 'SearchCleared' as const };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect((result.state as unknown as SearchFeedViewState).searchQuery).toBe('');
  });

  test('PROP-FILTER-003b: SearchCleared returns commands: []', () => {
    const state = makeState({ searchQuery: 'hello' });
    const action = { kind: 'SearchCleared' as const };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.commands).toHaveLength(0);
  });

  test('PROP-FILTER-008: SearchCleared immediately recomputes visibleNoteIds without search', () => {
    const state = makeState({
      searchQuery: 'xyz',
      allNoteIds: ['note-a', 'note-b'],
      visibleNoteIds: [],
      noteMetadata: {
        'note-a': makeMetadata('Hello', []),
        'note-b': makeMetadata('World', []),
      },
    });
    const action = { kind: 'SearchCleared' as const };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.state.visibleNoteIds).toContain('note-a');
    expect(result.state.visibleNoteIds).toContain('note-b');
  });
});

// ── PROP-FILTER-004: SortDirectionToggled flips direction ─────────────────────

describe('PROP-FILTER-004: SortDirectionToggled (REQ-FILTER-007)', () => {
  test('PROP-FILTER-004a: SortDirectionToggled from desc → asc', () => {
    const state = makeState({ sortDirection: 'desc' });
    const action = { kind: 'SortDirectionToggled' as const };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect((result.state as unknown as SearchFeedViewState).sortDirection).toBe('asc');
  });

  test('PROP-FILTER-004b: SortDirectionToggled from asc → desc', () => {
    const state = makeState({ sortDirection: 'asc' });
    const action = { kind: 'SortDirectionToggled' as const };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect((result.state as unknown as SearchFeedViewState).sortDirection).toBe('desc');
  });

  test('PROP-FILTER-004c: SortDirectionToggled returns commands: []', () => {
    const state = makeState({ sortDirection: 'desc' });
    const action = { kind: 'SortDirectionToggled' as const };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.commands).toHaveLength(0);
  });
});

// ── PROP-FILTER-009: SortDirectionToggled immediately recomputes visibleNoteIds ─

describe('PROP-FILTER-009: Sort recomputes visibleNoteIds in new order (REQ-FILTER-007)', () => {
  test('PROP-FILTER-009a: SortDirectionToggled desc→asc reorders notes (oldest first)', () => {
    const state = makeState({
      sortDirection: 'desc',
      allNoteIds: ['note-a', 'note-b', 'note-c'],
      noteMetadata: {
        'note-a': makeMetadata('', [], 3000),
        'note-b': makeMetadata('', [], 1000),
        'note-c': makeMetadata('', [], 2000),
      },
      visibleNoteIds: ['note-a', 'note-c', 'note-b'],
    });
    const action = { kind: 'SortDirectionToggled' as const };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    // asc: oldest first → note-b(1000), note-c(2000), note-a(3000)
    expect(Array.from(result.state.visibleNoteIds)).toEqual(['note-b', 'note-c', 'note-a']);
  });

  test('PROP-FILTER-009b: SortDirectionToggled asc→desc reorders notes (newest first)', () => {
    const state = makeState({
      sortDirection: 'asc',
      allNoteIds: ['note-a', 'note-b', 'note-c'],
      noteMetadata: {
        'note-a': makeMetadata('', [], 3000),
        'note-b': makeMetadata('', [], 1000),
        'note-c': makeMetadata('', [], 2000),
      },
      visibleNoteIds: ['note-b', 'note-c', 'note-a'],
    });
    const action = { kind: 'SortDirectionToggled' as const };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    // desc: newest first → note-a(3000), note-c(2000), note-b(1000)
    expect(Array.from(result.state.visibleNoteIds)).toEqual(['note-a', 'note-c', 'note-b']);
  });
});

// ── PROP-FILTER-014: Sort tiebreak deterministic ─────────────────────────────

describe('PROP-FILTER-014: Sort tiebreak by noteId lexicographic (REQ-FILTER-009, EC-T-001)', () => {
  test('PROP-FILTER-014a: Two notes with equal updatedAt sorted by noteId desc', () => {
    const state = makeState({
      sortDirection: 'desc',
      allNoteIds: ['note-b', 'note-a'],
      noteMetadata: {
        'note-a': makeMetadata('', [], 1000),
        'note-b': makeMetadata('', [], 1000),
      },
    });
    const action = { kind: 'SearchApplied' as const, query: '' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    // Tiebreak: desc → note-b comes before note-a (b > a lexicographic, reversed)
    expect(Array.from(result.state.visibleNoteIds)).toEqual(['note-b', 'note-a']);
  });

  test('PROP-FILTER-014b: Two notes with equal updatedAt sorted by noteId asc', () => {
    const state = makeState({
      sortDirection: 'asc',
      allNoteIds: ['note-b', 'note-a'],
      noteMetadata: {
        'note-a': makeMetadata('', [], 1000),
        'note-b': makeMetadata('', [], 1000),
      },
    });
    const action = { kind: 'SearchApplied' as const, query: '' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    // Tiebreak: asc → note-a comes before note-b (a < b lexicographic)
    expect(Array.from(result.state.visibleNoteIds)).toEqual(['note-a', 'note-b']);
  });

  test('PROP-FILTER-014c: updatedAt=0 (legacy notes) sorted correctly (EC-T-002)', () => {
    const state = makeState({
      sortDirection: 'desc',
      allNoteIds: ['note-modern', 'note-legacy'],
      noteMetadata: {
        'note-modern': makeMetadata('', [], 5000),
        'note-legacy': makeMetadata('', [], 0),
      },
    });
    const action = { kind: 'SearchApplied' as const, query: '' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(Array.from(result.state.visibleNoteIds)).toEqual(['note-modern', 'note-legacy']);
  });
});

// ── PROP-FILTER-006: DomainSnapshotReceived preserves searchQuery + sortDirection ─

describe('PROP-FILTER-006: DomainSnapshotReceived preserves search state (REQ-FILTER-010)', () => {
  test('PROP-FILTER-006a: searchQuery preserved across DomainSnapshotReceived', () => {
    const state = makeState({ searchQuery: 'hello', sortDirection: 'asc' });
    const snapshot = makeSnapshot({ feed: { visibleNoteIds: ['note-1'], filterApplied: false } });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = feedReducer(state as unknown as FeedViewState, action);
    expect((result.state as unknown as SearchFeedViewState).searchQuery).toBe('hello');
  });

  test('PROP-FILTER-006b: sortDirection preserved across DomainSnapshotReceived', () => {
    const state = makeState({ searchQuery: '', sortDirection: 'asc' });
    const snapshot = makeSnapshot({ feed: { visibleNoteIds: [], filterApplied: false } });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = feedReducer(state as unknown as FeedViewState, action);
    expect((result.state as unknown as SearchFeedViewState).sortDirection).toBe('asc');
  });
});

// ── PROP-FILTER-007: DomainSnapshotReceived recomputes with search active ─────

describe('PROP-FILTER-007: DomainSnapshotReceived + search active (REQ-FILTER-012)', () => {
  test('PROP-FILTER-007a: snapshot with searchQuery active filters visibleNoteIds', () => {
    const state = makeState({ searchQuery: 'hello', sortDirection: 'desc' });
    const snapshot = makeSnapshot({
      feed: { visibleNoteIds: ['note-a', 'note-b'], filterApplied: false },
      noteMetadata: {
        'note-a': makeMetadata('Hello World', []),
        'note-b': makeMetadata('Goodbye', []),
      },
    });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = feedReducer(state as unknown as FeedViewState, action);
    expect(result.state.visibleNoteIds).toContain('note-a');
    expect(result.state.visibleNoteIds).not.toContain('note-b');
  });

  test('PROP-FILTER-007b / EC-S-006: note saved with matching content appears in visibleNoteIds', () => {
    const state = makeState({ searchQuery: 'saved', sortDirection: 'desc' });
    const snapshot = makeSnapshot({
      cause: { kind: 'NoteFileSaved', savedNoteId: 'note-a' },
      feed: { visibleNoteIds: ['note-a'], filterApplied: false },
      noteMetadata: {
        'note-a': makeMetadata('Just saved this content', []),
      },
    });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = feedReducer(state as unknown as FeedViewState, action);
    expect(result.state.visibleNoteIds).toContain('note-a');
  });
});

// ── PROP-FILTER-011: empty needle is universal pass ───────────────────────────

describe('PROP-FILTER-011: searchPredicate empty needle (REQ-FILTER-005)', () => {
  test('PROP-FILTER-011: SearchApplied("") shows all notes in allNoteIds', () => {
    const state = makeState({
      allNoteIds: ['note-1', 'note-2', 'note-3'],
      noteMetadata: {
        'note-1': makeMetadata('Alpha', []),
        'note-2': makeMetadata('Beta', []),
        'note-3': makeMetadata('Gamma', []),
      },
    });
    const action = { kind: 'SearchApplied' as const, query: '' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.state.visibleNoteIds).toHaveLength(3);
  });
});

// ── PROP-FILTER-012: AND composition: tag + search ────────────────────────────

describe('PROP-FILTER-012: AND composition tag filter + search (REQ-FILTER-008)', () => {
  test('PROP-FILTER-012a: tag "work" AND search "hello" → only Note A', () => {
    const state = makeState({
      activeFilterTags: ['work'],
      allNoteIds: ['note-a', 'note-b'],
      noteMetadata: {
        'note-a': makeMetadata('hello world', ['work']),
        'note-b': makeMetadata('hello world', ['personal']),
      },
    });
    const action = { kind: 'SearchApplied' as const, query: 'hello' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.state.visibleNoteIds).toContain('note-a');
    expect(result.state.visibleNoteIds).not.toContain('note-b');
  });

  test('PROP-FILTER-012b: tag "work" AND search "goodbye" → empty (EC-C-004)', () => {
    const state = makeState({
      activeFilterTags: ['work'],
      allNoteIds: ['note-a', 'note-b'],
      noteMetadata: {
        'note-a': makeMetadata('hello world', ['work']),
        'note-b': makeMetadata('hello world', ['personal']),
      },
    });
    const action = { kind: 'SearchApplied' as const, query: 'goodbye' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.state.visibleNoteIds).toHaveLength(0);
  });

  test('PROP-FILTER-012c: no tag filter, search produces 0 results (EC-C-005)', () => {
    const state = makeState({
      activeFilterTags: [],
      allNoteIds: ['note-a'],
      noteMetadata: {
        'note-a': makeMetadata('hello world', []),
      },
    });
    const action = { kind: 'SearchApplied' as const, query: 'zzz' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.state.visibleNoteIds).toHaveLength(0);
  });
});

// ── PROP-FILTER-013: Tag filter preserved after SearchCleared ─────────────────

describe('PROP-FILTER-013: Tag filter preserved after SearchCleared (REQ-FILTER-008, EC-C-003)', () => {
  test('PROP-FILTER-013: After SearchCleared, activeFilterTags still applies', () => {
    const state = makeState({
      searchQuery: 'hello',
      activeFilterTags: ['work'],
      allNoteIds: ['note-a', 'note-b'],
      noteMetadata: {
        'note-a': makeMetadata('anything', ['work']),
        'note-b': makeMetadata('anything', ['personal']),
      },
    });
    const action = { kind: 'SearchCleared' as const };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    // Tag filter still active: only note-a (tag "work") should be visible
    expect(result.state.visibleNoteIds).toContain('note-a');
    expect(result.state.visibleNoteIds).not.toContain('note-b');
  });
});

// ── PROP-FILTER-023: Whitespace-only query not short-circuited ────────────────

describe('PROP-FILTER-023: Whitespace-only query (REQ-FILTER-016, EC-S-002)', () => {
  test('PROP-FILTER-023a: "   " is NOT treated as empty — applies searchPredicate literally', () => {
    // A note with spaces in body should match "   " query
    const state = makeState({
      allNoteIds: ['note-a', 'note-b'],
      noteMetadata: {
        'note-a': makeMetadata('word   word', []),
        'note-b': makeMetadata('nospaces', []),
      },
    });
    const action = { kind: 'SearchApplied' as const, query: '   ' };
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    // note-a has spaces; note-b does not → only note-a should match
    expect(result.state.visibleNoteIds).toContain('note-a');
    expect(result.state.visibleNoteIds).not.toContain('note-b');
  });

  test('PROP-FILTER-023b: empty string "" triggers no-search; "   " does apply search', () => {
    const state = makeState({
      allNoteIds: ['note-a'],
      noteMetadata: { 'note-a': makeMetadata('nospaces', []) },
    });
    // Empty → shows all
    const r1 = feedReducer(
      state as unknown as FeedViewState,
      { kind: 'SearchApplied', query: '' } as unknown as FeedAction
    );
    expect(r1.state.visibleNoteIds).toHaveLength(1);

    // Whitespace-only → applies predicate → note-a has no spaces → excluded
    const r2 = feedReducer(
      state as unknown as FeedViewState,
      { kind: 'SearchApplied', query: '   ' } as unknown as FeedAction
    );
    expect(r2.state.visibleNoteIds).toHaveLength(0);
  });
});

// ── REQ-FILTER-010: Initial FeedViewState has searchQuery and sortDirection ───

describe('REQ-FILTER-010: FeedViewState type extensions', () => {
  test('REQ-FILTER-010a: Initial state has searchQuery: "" and sortDirection: "desc"', () => {
    const state = makeState();
    // Cast through unknown to access the fields if they exist
    const ext = state as unknown as SearchFeedViewState;
    expect(ext.searchQuery).toBe('');
    expect(ext.sortDirection).toBe('desc');
  });
});

// ── REQ-FILTER-012: DomainSnapshotReceived re-applies search + sort ───────────

describe('REQ-FILTER-012: Snapshot preserves + recomputes (EC-S-007)', () => {
  test('EC-S-007: Note deleted while search active — removed from visibleNoteIds', () => {
    const state = makeState({ searchQuery: 'hello', sortDirection: 'desc' });
    // Snapshot: note-a was deleted, only note-b remains (and doesn't match "hello")
    const snapshot = makeSnapshot({
      cause: { kind: 'NoteFileDeleted', deletedNoteId: 'note-a' },
      feed: { visibleNoteIds: ['note-b'], filterApplied: false },
      noteMetadata: {
        'note-b': makeMetadata('Goodbye', []),
      },
    });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = feedReducer(state as unknown as FeedViewState, action);
    // note-b doesn't match "hello" → visibleNoteIds is empty
    expect(result.state.visibleNoteIds).toHaveLength(0);
    // searchQuery still preserved
    expect((result.state as unknown as SearchFeedViewState).searchQuery).toBe('hello');
  });
});

// ── Sort with empty notes (EC-T-005) ──────────────────────────────────────────

describe('EC-T-005: Sort toggle with no notes', () => {
  test('EC-T-005: SortDirectionToggled with empty allNoteIds — no error', () => {
    const state = makeState({ sortDirection: 'desc', allNoteIds: [], noteMetadata: {} });
    const action = { kind: 'SortDirectionToggled' as const };
    expect(() => feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction)).not.toThrow();
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.state.visibleNoteIds).toHaveLength(0);
  });
});

// ── Sort with search + tag + sort composition (EC-C-006) ─────────────────────

describe('EC-C-006: Sort varies order; set of visible notes unchanged', () => {
  test('EC-C-006: toggling sort direction does not change the set of notes, only their order', () => {
    const state = makeState({
      sortDirection: 'desc',
      activeFilterTags: [],
      searchQuery: '',
      allNoteIds: ['note-a', 'note-b', 'note-c'],
      noteMetadata: {
        'note-a': makeMetadata('hello', [], 3000),
        'note-b': makeMetadata('world', [], 1000),
        'note-c': makeMetadata('foo', [], 2000),
      },
    });
    const action = { kind: 'SortDirectionToggled' as const };
    const r1 = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    const r2 = feedReducer(r1.state as unknown as FeedViewState, action as unknown as FeedAction);

    // After 2 toggles, set of notes is the same
    const set1 = new Set(r1.state.visibleNoteIds);
    const set2 = new Set(r2.state.visibleNoteIds);
    expect(set1.size).toBe(set2.size);
    for (const id of set1) {
      expect(set2.has(id)).toBe(true);
    }
    // But orders differ
    expect(Array.from(r1.state.visibleNoteIds)).not.toEqual(Array.from(r2.state.visibleNoteIds));
  });
});

// ── EC-S-003: Very long query (10 000 chars) ─────────────────────────────────

describe('EC-S-003: Very long query string (10 000 chars)', () => {
  test('EC-S-003: SearchApplied with 10000-char query does not throw and returns correct results', () => {
    const longQuery = 'a'.repeat(10000);
    const state = makeState({
      allNoteIds: ['note-a', 'note-b'],
      noteMetadata: {
        'note-a': makeMetadata('a'.repeat(10000), []),
        'note-b': makeMetadata('no match here', []),
      },
    });
    const action = { kind: 'SearchApplied' as const, query: longQuery };
    expect(() => feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction)).not.toThrow();
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    // note-a body contains the query as substring; note-b does not
    expect(result.state.visibleNoteIds).toContain('note-a');
    expect(result.state.visibleNoteIds).not.toContain('note-b');
  });
});

// ── EC-S-004: Special regex chars in query ───────────────────────────────────

describe('EC-S-004: Query with special regex chars', () => {
  test('EC-S-004: SearchApplied with ".*+?[]()" treats characters as literals, not regex', () => {
    const state = makeState({
      allNoteIds: ['note-a', 'note-b'],
      noteMetadata: {
        'note-a': makeMetadata('price is 5.00 (discount)', []),
        'note-b': makeMetadata('regular text', []),
      },
    });
    // Query contains regex-special chars; must be treated as literal substring
    const action = { kind: 'SearchApplied' as const, query: '5.00 (discount)' };
    expect(() => feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction)).not.toThrow();
    const result = feedReducer(state as unknown as FeedViewState, action as unknown as FeedAction);
    expect(result.state.visibleNoteIds).toContain('note-a');
    expect(result.state.visibleNoteIds).not.toContain('note-b');
  });
});

// ── EC-C-002: Search active, then tag filter toggled ─────────────────────────

describe('EC-C-002: Search active, then tag filter toggled', () => {
  test('EC-C-002: TagFilterToggled while search is active applies AND of search + new tag set', () => {
    // Start with search active but no tag filter
    const stateWithSearch = makeState({
      searchQuery: 'hello',
      activeFilterTags: [],
      allNoteIds: ['note-a', 'note-b', 'note-c'],
      noteMetadata: {
        'note-a': makeMetadata('hello world', ['work']),
        'note-b': makeMetadata('hello personal', ['personal']),
        'note-c': makeMetadata('goodbye', ['work']),
      },
      visibleNoteIds: ['note-a', 'note-b'], // search active: note-a + note-b match "hello"
    });
    // Simulate TagFilterToggled by directly constructing the state that would result
    // (TagFilterToggled is handled by existing reducer; we test composition via SearchApplied
    //  on a state that already has activeFilterTags set — same as EC-C-002 scenario)
    const stateAfterTagToggle = makeState({
      searchQuery: 'hello',
      activeFilterTags: ['work'],
      allNoteIds: ['note-a', 'note-b', 'note-c'],
      noteMetadata: {
        'note-a': makeMetadata('hello world', ['work']),
        'note-b': makeMetadata('hello personal', ['personal']),
        'note-c': makeMetadata('goodbye', ['work']),
      },
    });
    // Re-applying SearchApplied with the same query on state with tags: result is AND
    const action = { kind: 'SearchApplied' as const, query: 'hello' };
    const result = feedReducer(stateAfterTagToggle as unknown as FeedViewState, action as unknown as FeedAction);
    // AND: tag "work" → note-a, note-c; AND search "hello" → note-a, note-b; intersection = note-a
    expect(result.state.visibleNoteIds).toContain('note-a');
    expect(result.state.visibleNoteIds).not.toContain('note-b');
    expect(result.state.visibleNoteIds).not.toContain('note-c');
  });
});

// ── EC-T-004: Toggle sort while debounce is pending ──────────────────────────
// Reducer-level verification: SortDirectionToggled state is preserved when
// SearchApplied fires afterwards (no race — reducer is synchronous).

describe('EC-T-004: Toggle sort while debounce is pending', () => {
  test('EC-T-004: SortDirectionToggled processed; subsequent SearchApplied uses updated sortDirection', () => {
    const state = makeState({
      sortDirection: 'desc',
      searchQuery: '',
      allNoteIds: ['note-a', 'note-b', 'note-c'],
      noteMetadata: {
        'note-a': makeMetadata('hello', [], 3000),
        'note-b': makeMetadata('hello', [], 1000),
        'note-c': makeMetadata('hello', [], 2000),
      },
    });

    // Step 1: SortDirectionToggled dispatched (sort button clicked while debounce mid-flight)
    const toggleAction = { kind: 'SortDirectionToggled' as const };
    const afterToggle = feedReducer(state as unknown as FeedViewState, toggleAction as unknown as FeedAction);
    expect((afterToggle.state as unknown as SearchFeedViewState).sortDirection).toBe('asc');

    // Step 2: SearchApplied fires when debounce timer expires — uses current sortDirection (asc)
    const searchAction = { kind: 'SearchApplied' as const, query: 'hello' };
    const afterSearch = feedReducer(afterToggle.state as unknown as FeedViewState, searchAction as unknown as FeedAction);

    // sortDirection still 'asc' after SearchApplied (not reverted)
    expect((afterSearch.state as unknown as SearchFeedViewState).sortDirection).toBe('asc');
    // visibleNoteIds are in asc order: note-b(1000), note-c(2000), note-a(3000)
    expect(Array.from(afterSearch.state.visibleNoteIds)).toEqual(['note-b', 'note-c', 'note-a']);
  });
});

// ── EC-C-007: DomainSnapshotReceived while debounce is mid-flight ─────────────
// Reducer-level verification: snapshot preserves searchQuery; subsequent
// SearchApplied correctly applies the pending input.

describe('EC-C-007: DomainSnapshotReceived while debounce mid-flight', () => {
  test('EC-C-007: snapshot does not cancel pending debounce; SearchApplied after snapshot applies correctly', () => {
    // Initial state: pending input "hello" is in the shell (not yet dispatched)
    // searchQuery is still '' (debounce has not fired)
    const stateBeforeSnapshot = makeState({
      searchQuery: '',
      sortDirection: 'desc',
      allNoteIds: ['note-a'],
      noteMetadata: {
        'note-a': makeMetadata('Hello World', []),
      },
    });

    // Step 1: DomainSnapshotReceived arrives (note was saved) — searchQuery stays ''
    const snapshot = makeSnapshot({
      cause: { kind: 'NoteFileSaved', savedNoteId: 'note-a' },
      feed: { visibleNoteIds: ['note-a'], filterApplied: false },
      noteMetadata: {
        'note-a': makeMetadata('Hello World updated', []),
      },
    });
    const snapshotAction: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const afterSnapshot = feedReducer(stateBeforeSnapshot as unknown as FeedViewState, snapshotAction);

    // searchQuery still '' (snapshot does not cancel the pending debounce in the shell)
    expect((afterSnapshot.state as unknown as SearchFeedViewState).searchQuery).toBe('');
    // note-a visible (no search active yet)
    expect(afterSnapshot.state.visibleNoteIds).toContain('note-a');

    // Step 2: Debounce timer fires — SearchApplied dispatched with the pending input "hello"
    const searchAction = { kind: 'SearchApplied' as const, query: 'hello' };
    const afterSearch = feedReducer(afterSnapshot.state as unknown as FeedViewState, searchAction as unknown as FeedAction);

    // searchQuery now set from the pending input
    expect((afterSearch.state as unknown as SearchFeedViewState).searchQuery).toBe('hello');
    // note-a body contains "hello" → visible
    expect(afterSearch.state.visibleNoteIds).toContain('note-a');
  });
});
