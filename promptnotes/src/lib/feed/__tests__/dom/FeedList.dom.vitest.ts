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
import { timestampLabel } from '../../feedRowPredicates.js';

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
    noteMetadata: {}, tagAutocompleteVisibleFor: null, activeFilterTags: [], allNoteIds: [],
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

// ── PROP-FEED-021: Filtered empty state (updated for ui-filter-search) ───────
//
// ui-filter-search replaces feed-filtered-empty-state with the unified
// feed-search-empty-state (REQ-FILTER-004). The test is updated to reflect
// that activeFilterTags non-empty triggers feed-search-empty-state.

describe('PROP-FEED-021 / REQ-FEED-007 / REQ-FILTER-004: unified empty state (EC-FEED-003)', () => {
  test('feed-search-empty-state present when visibleNoteIds=[] and activeFilterTags non-empty', () => {
    const adapter = makeMockAdapter();
    const stateChannel = makeMockStateChannel();
    // Use activeFilterTags to trigger the unified feed-search-empty-state
    const viewState = makeViewState({
      visibleNoteIds: [],
      loadingStatus: 'ready',
      activeFilterTags: ['work'],
    });

    const app = mount(FeedList, {
      target,
      props: {
        viewState: viewState as unknown as FeedViewState,
        adapter,
        stateChannel,
      },
    });
    flushSync();

    // ui-filter-search: unified empty state replaces feed-filtered-empty-state
    const searchEmpty = target.querySelector('[data-testid="feed-search-empty-state"]');
    expect(searchEmpty).not.toBeNull();

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
      noteMetadata: {}, tagAutocompleteVisibleFor: null, activeFilterTags: [],
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
      noteMetadata: {}, tagAutocompleteVisibleFor: null, activeFilterTags: [],
      cause: { kind: 'EditingStateChanged' },
    };

    stateChannel.emit(filterSnapshot);
    flushSync();

    const afterRows = target.querySelectorAll('[data-testid="feed-row-button"]');
    expect(afterRows.length).toBe(1);

    unmount(app);
  });
});

// ── FIND-014 fix: REQ-FEED-001/002/003/017 — FeedList passes real metadata to FeedRow ─

describe('REQ-FEED-001/002/003/017 / FIND-014: FeedList renders real metadata from snapshot', () => {
  const NOTE_ID = 'note-meta-001';
  const CREATED_AT = 1700000000000; // 2023-11-14T22:13:20.000Z
  const UPDATED_AT = 1700086400000; // 2023-11-15T22:13:20.000Z (different from createdAt)
  const BODY = 'First preview line\nSecond preview line\nThird line hidden';
  const TAGS = ['typescript', 'svelte'];

  function makeSnapshotWithMeta(): FeedDomainSnapshot {
    return {
      editing: { status: 'idle', currentNoteId: null, pendingNextNoteId: null },
      feed: { visibleNoteIds: [NOTE_ID], filterApplied: false },
      delete: { activeDeleteModalNoteId: null, lastDeletionError: null },
      noteMetadata: {
        [NOTE_ID]: { body: BODY, createdAt: CREATED_AT, updatedAt: UPDATED_AT, tags: TAGS },
      },
      cause: { kind: 'InitialLoad' },
    };
  }

  test('row-created-at textContent matches timestampLabel(createdAt) (REQ-FEED-001)', () => {
    const adapter = makeMockAdapter();
    const stateChannel = makeMockStateChannel();
    const viewState = makeViewState({ visibleNoteIds: [NOTE_ID] });
    const app = mount(FeedList, { target, props: { viewState, adapter, stateChannel } });
    flushSync();

    // Inject snapshot with real metadata via channel
    stateChannel.emit(makeSnapshotWithMeta());
    flushSync();

    const createdAtEl = target.querySelector('[data-testid="row-created-at"]');
    expect(createdAtEl).not.toBeNull();
    expect(createdAtEl!.textContent).toContain(timestampLabel(CREATED_AT, 'ja-JP'));

    unmount(app);
  });

  test('row-body-preview contains first line of body (REQ-FEED-002)', () => {
    const adapter = makeMockAdapter();
    const stateChannel = makeMockStateChannel();
    const viewState = makeViewState({ visibleNoteIds: [NOTE_ID] });
    const app = mount(FeedList, { target, props: { viewState, adapter, stateChannel } });
    flushSync();

    stateChannel.emit(makeSnapshotWithMeta());
    flushSync();

    const bodyPreview = target.querySelector('[data-testid="row-body-preview"]');
    expect(bodyPreview).not.toBeNull();
    expect(bodyPreview!.textContent).toContain('First preview line');

    unmount(app);
  });

  test('tag-chip count equals tags.length and order preserved (REQ-FEED-003 / PROP-FEED-034)', () => {
    const adapter = makeMockAdapter();
    const stateChannel = makeMockStateChannel();
    const viewState = makeViewState({ visibleNoteIds: [NOTE_ID] });
    const app = mount(FeedList, { target, props: { viewState, adapter, stateChannel } });
    flushSync();

    stateChannel.emit(makeSnapshotWithMeta());
    flushSync();

    const chips = target.querySelectorAll('[data-testid="tag-chip"]');
    expect(chips.length).toBe(TAGS.length);
    // Tag chips include the remove button text ("×") — use toContain (pre-existing behavior)
    expect(chips[0]!.textContent).toContain(TAGS[0]);
    expect(chips[1]!.textContent).toContain(TAGS[1]);

    unmount(app);
  });

  test('FIND-004 regression guard: zero-metadata snapshot renders empty content (not epoch=0 visible)', () => {
    // This test verifies that when noteMetadata is present with real data,
    // the placeholder values (epoch=0 / empty body / empty tags) are NOT rendered.
    const adapter = makeMockAdapter();
    const stateChannel = makeMockStateChannel();
    const viewState = makeViewState({ visibleNoteIds: [NOTE_ID] });
    const app = mount(FeedList, { target, props: { viewState, adapter, stateChannel } });
    flushSync();

    stateChannel.emit(makeSnapshotWithMeta());
    flushSync();

    const createdAtEl = target.querySelector('[data-testid="row-created-at"]');
    // Epoch 0 would format to 1970-01-01 in ja-JP — verify it's NOT shown
    expect(createdAtEl!.textContent).not.toContain(timestampLabel(0, 'ja-JP'));

    unmount(app);
  });

  test('updatedAt shown when different from createdAt (REQ-FEED-017)', () => {
    const adapter = makeMockAdapter();
    const stateChannel = makeMockStateChannel();
    const viewState = makeViewState({ visibleNoteIds: [NOTE_ID] });
    const app = mount(FeedList, { target, props: { viewState, adapter, stateChannel } });
    flushSync();

    stateChannel.emit(makeSnapshotWithMeta());
    flushSync();

    // updatedAt is different from createdAt, so updated-at span should be present
    const updatedAtEl = target.querySelector('.updated-at');
    expect(updatedAtEl).not.toBeNull();
    expect(updatedAtEl!.textContent).toContain(timestampLabel(UPDATED_AT, 'ja-JP'));

    unmount(app);
  });
});

// ── REQ-FEED-012 / FIND-I2-001: FeedList cancel wiring calls dispatchCancelNoteDeletion ─

describe('REQ-FEED-012 / FIND-I2-001: FeedList cancel path calls dispatchCancelNoteDeletion via command bus', () => {
  /**
   * This test verifies the PRODUCTION wiring:
   *   cancel button / Esc / backdrop → onClose={handleDeleteCancel}
   *   → feedReducer(DeleteCancelled) → cancel-note-deletion command
   *   → dispatchCommand → adapter.dispatchCancelNoteDeletion
   *
   * Unlike DeleteConfirmModal.dom.vitest.ts:227-240 which tests the fallback
   * path (no onClose prop), this test verifies the command bus path used by FeedList.
   */
  test('cancel button in DeleteConfirmModal calls dispatchCancelNoteDeletion exactly 1× through FeedList wiring (FIND-I2-001)', async () => {
    const adapter = makeMockAdapter();
    const stateChannel = makeMockStateChannel();

    // Start with a note visible and delete modal active for that note
    const NOTE_ID_DEL = 'note-cancel-test';
    const viewState = makeViewState({
      visibleNoteIds: [NOTE_ID_DEL],
      activeDeleteModalNoteId: NOTE_ID_DEL,
      loadingStatus: 'ready',
    });

    const app = mount(FeedList, { target, props: { viewState, adapter, stateChannel } });
    flushSync();

    // DeleteConfirmModal should be rendered (activeDeleteModalNoteId is set)
    const modal = target.querySelector('[data-testid="delete-confirm-modal"]');
    expect(modal).not.toBeNull();

    // Find the cancel button inside the modal (testid matches DeleteConfirmModal.svelte:97)
    const cancelBtn = target.querySelector('[data-testid="cancel-delete-button"]') as HTMLButtonElement | null;
    expect(cancelBtn).not.toBeNull();

    // Click cancel — this routes through onClose={handleDeleteCancel} → feedReducer(DeleteCancelled)
    // → cancel-note-deletion command → dispatchCommand → adapter.dispatchCancelNoteDeletion
    cancelBtn!.click();
    flushSync();

    expect(adapter.dispatchCancelNoteDeletion).toHaveBeenCalledTimes(1);

    unmount(app);
  });
});
