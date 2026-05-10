/**
 * main-route.dom.vitest.ts — DOM integration test for main route layout.
 *
 * Block-based UI migration:
 *   - 旧 2 カラム (FeedList sidebar + EditorPane main) は廃止。
 *   - 新レイアウトは単一カラム (.feed-main) で FeedList が全幅を占める。
 *   - 旧 PROP-FEED-S2-006 / PROP-FEED-S2-007 / FIND-S2-02 の構造アサーションは
 *     ui-feed-list-actions Sprint 5（block-based-ui-spec-migration Step 2）で
 *     正式に再定義される。本ファイルでは単一カラム構造の暫定検証のみ行う。
 *
 * Pattern: vitest + jsdom + raw Svelte 5 mount API (NO @testing-library/svelte).
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

describe('Main route source structure assertions (block-based UI: single column)', () => {
  // Block-based UI migration: 旧 2 カラム構造アサーションは ui-feed-list-actions
  // Sprint 5 で正式に再定義される。ここでは単一カラム化の最低限の構造確認のみ行う。

  const pageSveltePath = path.resolve(
    import.meta.dirname,
    '../+page.svelte',
  );

  test('+page.svelte は EditorPanel の import を持たない（block migration）', () => {
    const source = fs.readFileSync(pageSveltePath, 'utf-8');
    expect(source).not.toContain('EditorPanel');
    expect(source).not.toContain('editorStateChannel');
    expect(source).not.toContain('tauriEditorAdapter');
  });

  test('+page.svelte は単一カラム .feed-main を採用する（block migration）', () => {
    const source = fs.readFileSync(pageSveltePath, 'utf-8');
    expect(source).toContain('.feed-main');
    // 旧 2 カラム grid 定義は除去されていること
    expect(source).not.toMatch(/grid-template-columns:\s*320px\s+1fr/);
  });

  test('+page.svelte passes vaultPath to FeedList (FIND-S2-01/05/06)', () => {
    const source = fs.readFileSync(pageSveltePath, 'utf-8');
    expect(source).toContain('vaultPath');
  });

  // Sprint 5 PROP-FEED-S5-002 (DOM portion): ensure +page.svelte source declares
  // the single-column layout structurally (height: 100vh, .feed-main wrapper),
  // and contains the FeedList mount but no EditorPanel mount. The grep portion
  // is also covered by sprint-5-grep-audit.sh; this duplicates as a vitest
  // assertion so contract CRIT-200 has a DOM-test trace.
  test('PROP-FEED-S5-002 (source structure): height: 100vh + FeedList mount + no EditorPanel mount', () => {
    const source = fs.readFileSync(pageSveltePath, 'utf-8');
    // Single-column wrapper present.
    expect(source).toMatch(/<main\s+class=["']feed-main["']/);
    // Height invariant declared in CSS.
    expect(source).toMatch(/height:\s*100vh/);
    // FeedList is the sole content surface.
    expect(source).toContain('<FeedList');
    expect(source).not.toMatch(/<EditorPanel/);
    // Forbidden CSS class names from old layout.
    expect(source).not.toContain('editor-main');
    expect(source).not.toContain('feed-sidebar');
  });
});
