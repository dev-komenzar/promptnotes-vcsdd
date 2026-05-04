/**
 * FeedList.dom.vitest.ts — Integration (DOM) tests for FeedList.svelte
 *
 * Coverage:
 *   PROP-FEED-018 (EC-FEED-001: empty state — data-testid="feed-empty-state")
 *   PROP-FEED-020 (visibleNoteIds === 0 + no filter → feed-empty-state)
 *   PROP-FEED-021 (visibleNoteIds === 0 + filter applied → feed-filtered-empty-state)
 *   PROP-FEED-022 (loadingStatus === 'loading' → data-testid="feed-loading")
 *   PROP-FEED-024 (NoteFileDeleted snapshot → deleted row absent)
 *   PROP-FEED-025 (filter update → row count changes)
 *
 * REQ coverage: REQ-FEED-007, REQ-FEED-008, REQ-FEED-013, REQ-FEED-018
 * EC coverage: EC-FEED-001, EC-FEED-003, EC-FEED-014, EC-FEED-015
 *
 * RED PHASE: FeedList.svelte renders nothing (<!-- not implemented -->) so all
 * querySelector assertions will fail.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import FeedList from '../../FeedList.svelte';
import type { TauriFeedAdapter } from '../../tauriFeedAdapter.js';
import type { FeedStateChannel } from '../../feedStateChannel.js';
import type { FeedViewState, FeedDomainSnapshot } from '../../types.js';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeMockAdapter(): TauriFeedAdapter {
  return {
    dispatchSelectPastNote: vi.fn().mockResolvedValue(undefined),
    dispatchRequestNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchConfirmNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchCancelNoteDeletion: vi.fn().mockResolvedValue(undefined),
  };
}

type MockFeedStateChannel = FeedStateChannel & { emit: (snapshot: FeedDomainSnapshot) => void };

function makeMockStateChannel(): MockFeedStateChannel {
  let _handler: ((snapshot: FeedDomainSnapshot) => void) | null = null;
  return {
    subscribe(handler) {
      _handler = handler;
      return () => { _handler = null; };
    },
    emit(snapshot) {
      _handler?.(snapshot);
    },
  };
}

function makeViewState(overrides: Partial<FeedViewState> = {}): FeedViewState {
  return {
    editingStatus: 'idle',
    editingNoteId: null,
    pendingNextNoteId: null,
    visibleNoteIds: [],
    loadingStatus: 'ready',
    activeDeleteModalNoteId: null,
    lastDeletionError: null,
    ...overrides,
  };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let target: HTMLDivElement;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ── PROP-FEED-020: Empty state (no filter) ────────────────────────────────────

describe('PROP-FEED-020 / REQ-FEED-007: empty feed state without filter', () => {
  test('feed-empty-state present when visibleNoteIds=[] and no filter (EC-FEED-001)', () => {
    const adapter = makeMockAdapter();
    const stateChannel = makeMockStateChannel();
    const viewState = makeViewState({ visibleNoteIds: [], loadingStatus: 'ready' });

    const app = mount(FeedList, { target, props: { viewState, adapter, stateChannel } });
    flushSync();

    const emptyState = target.querySelector('[data-testid="feed-empty-state"]');
    expect(emptyState).not.toBeNull();

    unmount(app);
  });

  test('no feed rows present when visibleNoteIds=[]', () => {
    const adapter = makeMockAdapter();
    const stateChannel = makeMockStateChannel();
    const viewState = makeViewState({ visibleNoteIds: [] });

    const app = mount(FeedList, { target, props: { viewState, adapter, stateChannel } });
    flushSync();

    const rows = target.querySelectorAll('[data-testid="feed-row-button"]');
    expect(rows.length).toBe(0);

    unmount(app);
  });
});

// ── PROP-FEED-021: Filtered empty state ──────────────────────────────────────

describe('PROP-FEED-021 / REQ-FEED-007: filtered empty state (EC-FEED-003)', () => {
  test('feed-filtered-empty-state present when visibleNoteIds=[] and filterApplied=true', () => {
    const adapter = makeMockAdapter();
    const stateChannel = makeMockStateChannel();
    // filterApplied is carried in the viewState — we need a way to pass it
    // FeedList receives the viewState which should include filterApplied info
    // The component must distinguish these cases
    const viewState = makeViewState({
      visibleNoteIds: [],
      loadingStatus: 'ready',
    });

    const app = mount(FeedList, {
      target,
      props: {
        viewState: { ...viewState, filterApplied: true } as FeedViewState & { filterApplied: boolean },
        adapter,
        stateChannel,
      },
    });
    flushSync();

    const filteredEmpty = target.querySelector('[data-testid="feed-filtered-empty-state"]');
    expect(filteredEmpty).not.toBeNull();

    unmount(app);
  });
});

// ── PROP-FEED-022: Loading state ──────────────────────────────────────────────

describe('PROP-FEED-022 / REQ-FEED-008: loading state (EC-FEED-015)', () => {
  test('feed-loading present when loadingStatus === "loading"', () => {
    const adapter = makeMockAdapter();
    const stateChannel = makeMockStateChannel();
    const viewState = makeViewState({ loadingStatus: 'loading' });

    const app = mount(FeedList, { target, props: { viewState, adapter, stateChannel } });
    flushSync();

    const loading = target.querySelector('[data-testid="feed-loading"]');
    expect(loading).not.toBeNull();

    unmount(app);
  });

  test('feed-loading absent when loadingStatus === "ready"', () => {
    const adapter = makeMockAdapter();
    const stateChannel = makeMockStateChannel();
    const viewState = makeViewState({ loadingStatus: 'ready', visibleNoteIds: [] });

    const app = mount(FeedList, { target, props: { viewState, adapter, stateChannel } });
    flushSync();

    const loading = target.querySelector('[data-testid="feed-loading"]');
    expect(loading).toBeNull();

    unmount(app);
  });
});

// ── PROP-FEED-024: NoteFileDeleted removes row ────────────────────────────────

describe('PROP-FEED-024 / REQ-FEED-013: deleted note row disappears from DOM', () => {
  test('after DomainSnapshotReceived with NoteFileDeleted, deleted row absent (EC-FEED-014)', () => {
    const adapter = makeMockAdapter();
    const stateChannel = makeMockStateChannel();

    // Initial state: 2 notes visible
    const viewState = makeViewState({
      visibleNoteIds: ['note-001', 'note-002'],
      loadingStatus: 'ready',
    });

    const app = mount(FeedList, { target, props: { viewState, adapter, stateChannel } });
    flushSync();

    // Should have 2 rows initially
    const initialRows = target.querySelectorAll('[data-testid="feed-row-button"]');
    expect(initialRows.length).toBe(2);

    // Emit deletion snapshot
    const deletionSnapshot: FeedDomainSnapshot = {
      editing: { status: 'idle', currentNoteId: null, pendingNextNoteId: null },
      feed: { visibleNoteIds: ['note-001'], filterApplied: false },
      delete: { activeDeleteModalNoteId: null, lastDeletionError: null },
      cause: { kind: 'NoteFileDeleted', deletedNoteId: 'note-002' },
    };

    stateChannel.emit(deletionSnapshot);
    flushSync();

    const afterRows = target.querySelectorAll('[data-testid="feed-row-button"]');
    expect(afterRows.length).toBe(1);

    // note-002 row should be gone
    const deletedRow = target.querySelector('[data-row-note-id="note-002"]');
    expect(deletedRow).toBeNull();

    unmount(app);
  });
});

// ── PROP-FEED-025: Filter update changes row count ────────────────────────────

describe('PROP-FEED-025 / REQ-FEED-018: filter update changes visible rows', () => {
  test('rows rerender after filter snapshot received', () => {
    const adapter = makeMockAdapter();
    const stateChannel = makeMockStateChannel();

    const viewState = makeViewState({
      visibleNoteIds: ['note-001', 'note-002', 'note-003'],
      loadingStatus: 'ready',
    });

    const app = mount(FeedList, { target, props: { viewState, adapter, stateChannel } });
    flushSync();

    const beforeRows = target.querySelectorAll('[data-testid="feed-row-button"]');
    expect(beforeRows.length).toBe(3);

    // Emit filter snapshot reducing to 1 note
    const filterSnapshot: FeedDomainSnapshot = {
      editing: { status: 'idle', currentNoteId: null, pendingNextNoteId: null },
      feed: { visibleNoteIds: ['note-001'], filterApplied: true },
      delete: { activeDeleteModalNoteId: null, lastDeletionError: null },
      cause: { kind: 'EditingStateChanged' },
    };

    stateChannel.emit(filterSnapshot);
    flushSync();

    const afterRows = target.querySelectorAll('[data-testid="feed-row-button"]');
    expect(afterRows.length).toBe(1);

    unmount(app);
  });
});
