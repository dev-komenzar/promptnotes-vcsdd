/**
 * FeedList.search-empty.dom.vitest.ts — Phase 2a (Red): FeedList empty state tests
 *
 * Coverage:
 *   PROP-FILTER-015 (feed-search-empty-state shown when visibleNoteIds empty + searchQuery set)
 *   PROP-FILTER-016 (feed-empty-state shown when no notes, no filter, no search)
 *   REQ-FILTER-004 (zero-results empty state UI)
 *
 * RED PHASE: FeedList.svelte does not yet have searchQuery/sortDirection props or
 * the feed-search-empty-state element — these tests MUST FAIL.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import FeedList from '../../FeedList.svelte';
import type { FeedViewState } from '../../types.js';

// ── Test setup ────────────────────────────────────────────────────────────────

let target: HTMLDivElement;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  try {
    unmount(target);
  } catch {
    // may fail in red phase
  }
  document.body.removeChild(target);
});

type SearchFeedViewState = FeedViewState & {
  searchQuery: string;
  sortDirection: 'asc' | 'desc';
};

function makeViewState(overrides: Partial<SearchFeedViewState> = {}): SearchFeedViewState {
  return {
    editingStatus: 'idle',
    editingNoteId: null,
    pendingNextFocus: null,
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

function makeFakeAdapter() {
  return {
    dispatchSelectPastNote: vi.fn(),
    dispatchRequestNoteDeletion: vi.fn(),
    dispatchConfirmNoteDeletion: vi.fn(),
    dispatchCancelNoteDeletion: vi.fn(),
    dispatchAddTagViaChip: vi.fn(),
    dispatchRemoveTagViaChip: vi.fn(),
    dispatchApplyFilter: vi.fn(),
    dispatchRemoveFilter: vi.fn(),
    dispatchClearFilter: vi.fn(),
  };
}

function makeFakeStateChannel() {
  const listeners: Array<(snapshot: unknown) => void> = [];
  return {
    subscribe: (fn: (snapshot: unknown) => void) => {
      listeners.push(fn);
      return () => {};
    },
    emit: (snapshot: unknown) => {
      for (const fn of listeners) fn(snapshot);
    },
  };
}

function mountFeedList(viewState: SearchFeedViewState) {
  const adapter = makeFakeAdapter();
  const stateChannel = makeFakeStateChannel();
  const component = mount(FeedList, {
    target,
    props: {
      viewState: viewState as unknown as FeedViewState,
      adapter: adapter as unknown as Parameters<typeof FeedList>[0]['adapter'],
      stateChannel: stateChannel as unknown as Parameters<typeof FeedList>[0]['stateChannel'],
      vaultPath: '/test',
    },
  });
  flushSync();
  return { component, adapter, stateChannel };
}

// ── PROP-FILTER-015: feed-search-empty-state when visibleNoteIds empty + search/filter active ─

describe('PROP-FILTER-015: feed-search-empty-state (REQ-FILTER-004)', () => {
  test('feed-search-empty-state shown when visibleNoteIds empty and searchQuery is non-empty', () => {
    const viewState = makeViewState({
      visibleNoteIds: [],
      searchQuery: 'hello',
      activeFilterTags: [],
    });
    mountFeedList(viewState);

    const el = target.querySelector('[data-testid="feed-search-empty-state"]');
    expect(el).not.toBeNull();
  });

  test('feed-search-empty-state shown when visibleNoteIds empty and activeFilterTags non-empty', () => {
    const viewState = makeViewState({
      visibleNoteIds: [],
      searchQuery: '',
      activeFilterTags: ['work'],
    });
    mountFeedList(viewState);

    const el = target.querySelector('[data-testid="feed-search-empty-state"]');
    expect(el).not.toBeNull();
  });

  test('feed-search-empty-state text is "検索条件に一致するノートがありません"', () => {
    const viewState = makeViewState({
      visibleNoteIds: [],
      searchQuery: 'zzz',
      activeFilterTags: [],
    });
    mountFeedList(viewState);

    const el = target.querySelector('[data-testid="feed-search-empty-state"]');
    expect(el?.textContent).toContain('検索条件に一致するノートがありません');
  });

  test('EC-C-004: tag filter + search both produce empty → feed-search-empty-state', () => {
    const viewState = makeViewState({
      visibleNoteIds: [],
      searchQuery: 'zzz',
      activeFilterTags: ['work'],
    });
    mountFeedList(viewState);

    const el = target.querySelector('[data-testid="feed-search-empty-state"]');
    expect(el).not.toBeNull();
  });

  test('feed-search-empty-state NOT shown when visibleNoteIds is non-empty', () => {
    const viewState = makeViewState({
      visibleNoteIds: ['note-1'],
      allNoteIds: ['note-1'],
      searchQuery: 'hello',
      noteMetadata: { 'note-1': { body: 'hello world', tags: [], createdAt: 0, updatedAt: 1000 } },
    });
    mountFeedList(viewState);

    const el = target.querySelector('[data-testid="feed-search-empty-state"]');
    expect(el).toBeNull();
  });
});

// ── PROP-FILTER-016: feed-empty-state when no notes, no filter, no search ────

describe('PROP-FILTER-016: feed-empty-state (REQ-FILTER-004)', () => {
  test('feed-empty-state shown when visibleNoteIds empty, no search, no filter', () => {
    const viewState = makeViewState({
      visibleNoteIds: [],
      searchQuery: '',
      activeFilterTags: [],
    });
    mountFeedList(viewState);

    const el = target.querySelector('[data-testid="feed-empty-state"]');
    expect(el).not.toBeNull();
  });

  test('feed-empty-state NOT shown when searchQuery is active', () => {
    const viewState = makeViewState({
      visibleNoteIds: [],
      searchQuery: 'hello',
      activeFilterTags: [],
    });
    mountFeedList(viewState);

    const el = target.querySelector('[data-testid="feed-empty-state"]');
    expect(el).toBeNull();
  });

  test('feed-empty-state NOT shown when activeFilterTags is non-empty', () => {
    const viewState = makeViewState({
      visibleNoteIds: [],
      searchQuery: '',
      activeFilterTags: ['work'],
    });
    mountFeedList(viewState);

    const el = target.querySelector('[data-testid="feed-empty-state"]');
    expect(el).toBeNull();
  });
});
