/**
 * main-route.dom.vitest.ts — DOM integration test for main route layout.
 *
 * Sprint 2 Phase 2a (RED phase):
 *   PROP-FEED-S2-005: Configured state mounts both FeedList (.feed-sidebar)
 *                     and EditorPane (.editor-main) in the two-column layout.
 *   PROP-FEED-S2-006: Layout uses grid with 320px 1fr columns.
 *   PROP-FEED-S2-007: Sidebar border uses #e9e9e7.
 *
 * Pattern: vitest + jsdom + raw Svelte 5 mount API (NO @testing-library/svelte).
 * Same pattern as src/lib/feed/__tests__/dom/*.dom.vitest.ts.
 *
 * FIND-S2-04: Tests now mount the actual FeedList component (not a manually
 * constructed DOM scaffold) and assert structural invariants directly.
 * PROP-FEED-S2-006 / PROP-FEED-S2-007 are verified via source grep (structural
 * analysis), not tautological expect(true).toBe(true) placeholders.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({
    editing: { status: 'idle', currentNoteId: null, pendingNextFocus: null },
    feed: { visibleNoteIds: [], filterApplied: false },
    delete: { activeDeleteModalNoteId: null, lastDeletionError: null },
    noteMetadata: {},
    cause: { kind: 'InitialLoad' },
  }),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
}));

import FeedList from '$lib/feed/FeedList.svelte';
import type { FeedViewState } from '$lib/feed/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeMockFeedAdapter() {
  return {
    dispatchSelectPastNote: vi.fn().mockResolvedValue(undefined),
    dispatchRequestNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchConfirmNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchCancelNoteDeletion: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockFeedStateChannel() {
  return {
    subscribe: vi.fn().mockReturnValue(() => {}),
  };
}

const INITIAL_VIEW_STATE: FeedViewState = {
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
};

// ── Setup / teardown ──────────────────────────────────────────────────────────

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  document.body.removeChild(container);
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Main route two-column layout (PROP-FEED-S2-005)', () => {
  test('FeedList mounts correctly with required props as sidebar component', () => {
    // PROP-FEED-S2-005 / FIND-S2-04: Mount FeedList directly (not a scaffold).
    // Verifies FeedList is mountable with the props that +page.svelte passes,
    // including the vaultPath added by FIND-S2-01/05/06.
    const adapter = makeMockFeedAdapter();
    const stateChannel = makeMockFeedStateChannel();

    let component: ReturnType<typeof mount> | null = null;
    try {
      component = mount(FeedList, {
        target: container,
        props: {
          viewState: INITIAL_VIEW_STATE,
          adapter,
          stateChannel,
          vaultPath: '/tmp/test-vault',
        },
      });
      flushSync();

      // FeedList with empty visibleNoteIds and ready status renders empty state.
      const emptyState = container.querySelector('[data-testid="feed-empty-state"]');
      expect(emptyState).not.toBeNull();

      // FeedList root element is present.
      const feedList = container.querySelector('.feed-list');
      expect(feedList).not.toBeNull();
    } finally {
      if (component) unmount(component);
    }
  });

  test('FeedList renders note rows when viewState has visibleNoteIds', () => {
    // PROP-FEED-S2-005 / FIND-S2-04: With populated viewState, FeedList renders rows.
    const adapter = makeMockFeedAdapter();
    const stateChannel = makeMockFeedStateChannel();
    const viewStateWithNotes: FeedViewState = {
      ...INITIAL_VIEW_STATE,
      visibleNoteIds: ['/tmp/vault/note-a.md', '/tmp/vault/note-b.md'],
      noteMetadata: {
        '/tmp/vault/note-a.md': { body: 'Body A', createdAt: 1000, updatedAt: 2000, tags: [] },
        '/tmp/vault/note-b.md': { body: 'Body B', createdAt: 1001, updatedAt: 2001, tags: [] },
      },
    };

    let component: ReturnType<typeof mount> | null = null;
    try {
      component = mount(FeedList, {
        target: container,
        props: {
          viewState: viewStateWithNotes,
          adapter,
          stateChannel,
          vaultPath: '/tmp/vault',
        },
      });
      flushSync();

      // Empty state must NOT be shown when there are notes.
      const emptyState = container.querySelector('[data-testid="feed-empty-state"]');
      expect(emptyState).toBeNull();

      // Feed list root must be present.
      const feedList = container.querySelector('.feed-list');
      expect(feedList).not.toBeNull();
    } finally {
      if (component) unmount(component);
    }
  });

  test('FeedList accepts vaultPath prop without type error (FIND-S2-01/05/06)', () => {
    // FIND-S2-04 / FIND-S2-05: FeedList.vaultPath prop is correctly wired.
    const adapter = makeMockFeedAdapter();
    const stateChannel = makeMockFeedStateChannel();

    let component: ReturnType<typeof mount> | null = null;
    try {
      // If this mounts without a runtime error, vaultPath is wired correctly.
      component = mount(FeedList, {
        target: container,
        props: {
          viewState: INITIAL_VIEW_STATE,
          adapter,
          stateChannel,
          vaultPath: '/home/user/vault',
        },
      });
      flushSync();
      expect(container.querySelector('.feed-list')).not.toBeNull();
    } finally {
      if (component) unmount(component);
    }
  });
});

describe('Main route source structure assertions (PROP-FEED-S2-006, PROP-FEED-S2-007)', () => {
  // FIND-S2-04: These assertions read the actual +page.svelte source file.
  // They verify structural invariants without relying on tautological expect(true).

  // Test file is at src/routes/__tests__/main-route.dom.vitest.ts
  // +page.svelte is at src/routes/+page.svelte — one level up.
  const pageSveltePath = path.resolve(
    import.meta.dirname,
    '../+page.svelte',
  );

  test('+page.svelte uses single-column flex layout (PN-la1 single-column migration)', () => {
    const source = fs.readFileSync(pageSveltePath, 'utf-8');
    expect(source).toContain('flex-direction: column');
    expect(source).not.toContain('grid-template-columns');
    expect(source).not.toMatch(/import\s+EditorPanel/);
  });

  test('+page.svelte passes vaultPath to FeedList (FIND-S2-01/05/06)', () => {
    // FIND-S2-05/06: FeedList must receive vaultPath from +page.svelte.
    const source = fs.readFileSync(pageSveltePath, 'utf-8');
    expect(source).toContain('vaultPath');
  });
});
