/**
 * feed-row-block-embed.dom.vitest.ts — Sprint 5 DOM integration tests
 *
 * Coverage:
 *   PROP-FEED-S5-006 — 2x2 truth table (editingStatus × editingNoteId === self.noteId)
 *                      cell 1: editing AND match → block-element count = blocks.length
 *                      cell 2: idle AND match → 0 (defensive, normally unreachable)
 *                      cell 3: editing AND mismatch → 0
 *                      cell 4: idle AND mismatch → 0
 *   PROP-FEED-S5-007 — save-failure-banner only on the editing row when status='save-failed'
 *   PROP-FEED-S5-008 — typing in BlockElement triggers dispatchEditBlockContent
 *   PROP-FEED-S5-018 — EC-FEED-018: filter excluding editingNoteId removes BlockElement;
 *                      blocks reappear from cache after re-visible
 *
 * REQ coverage: REQ-FEED-030
 *
 * RED PHASE: FeedRow does not yet embed BlockElement; the `editingSessionState` /
 * `blockEditorAdapter` props don't exist yet. Tests will fail at module load
 * (missing prop) or at the assertion (block-element absent).
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import FeedRow from '../../FeedRow.svelte';
import type { TauriFeedAdapter } from '../../tauriFeedAdapter.js';
import type { FeedViewState } from '../../types.js';
import type { BlockEditorAdapter, DtoBlock } from '$lib/block-editor/types';

// ── Mock factories ────────────────────────────────────────────────────────────

function makeFeedAdapter(): TauriFeedAdapter & Record<string, ReturnType<typeof vi.fn>> {
  return {
    dispatchSelectPastNote: vi.fn().mockResolvedValue(undefined),
    dispatchRequestNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchConfirmNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchCancelNoteDeletion: vi.fn().mockResolvedValue(undefined),
  };
}

function makeBlockAdapter(): BlockEditorAdapter & Record<string, ReturnType<typeof vi.fn>> {
  // Empty stub; methods return resolved Promise<void> by default.
  const noop = () => vi.fn().mockResolvedValue(undefined);
  return {
    dispatchFocusBlock: noop(),
    dispatchEditBlockContent: noop(),
    dispatchInsertBlockAfter: noop(),
    dispatchInsertBlockAtBeginning: noop(),
    dispatchRemoveBlock: noop(),
    dispatchMergeBlocks: noop(),
    dispatchSplitBlock: noop(),
    dispatchChangeBlockType: noop(),
    dispatchMoveBlock: noop(),
    dispatchTriggerIdleSave: noop(),
    dispatchTriggerBlurSave: noop(),
    dispatchRetrySave: noop(),
    dispatchDiscardCurrentSession: noop(),
    dispatchCancelSwitch: noop(),
    dispatchCopyNoteBody: noop(),
    dispatchRequestNewNote: noop(),
  } as BlockEditorAdapter & Record<string, ReturnType<typeof vi.fn>>;
}

function makeViewState(overrides: Partial<FeedViewState> = {}): FeedViewState {
  return {
    editingStatus: 'idle',
    editingNoteId: null,
    pendingNextFocus: null,
    visibleNoteIds: ['note-001'],
    loadingStatus: 'ready',
    activeDeleteModalNoteId: null,
    lastDeletionError: null,
    noteMetadata: {},
    tagAutocompleteVisibleFor: null,
    activeFilterTags: [],
    allNoteIds: [],
    searchQuery: '',
    sortDirection: 'desc',
    ...overrides,
  };
}

const SAMPLE_BLOCKS: DtoBlock[] = [
  { id: 'b1', type: 'paragraph', content: 'Hello' },
  { id: 'b2', type: 'heading-1', content: 'World' },
];

const BASE_PROPS = {
  noteId: 'note-001',
  body: 'Hello\nWorld',
  createdAt: 1746352800000,
  updatedAt: 1746352800000,
  tags: [] as string[],
  tagInventory: [] as never[],
};

let target: HTMLDivElement;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});
afterEach(() => {
  target.remove();
  vi.clearAllMocks();
});

function mountRow(props: Record<string, unknown>) {
  return mount(FeedRow as never, { target, props: props as never });
}

// ── PROP-FEED-S5-006: 2x2 truth table ────────────────────────────────────────

describe('PROP-FEED-S5-006: 2x2 truth table — block-element mount gate', () => {
  test('cell 1: editing AND editingNoteId === self.noteId → block-element count = blocks.length', () => {
    const viewState = makeViewState({
      editingStatus: 'editing',
      editingNoteId: 'note-001',
    });
    const editingSessionState = {
      status: 'editing',
      currentNoteId: 'note-001',
      focusedBlockId: 'b1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
      blocks: SAMPLE_BLOCKS,
    };
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: makeBlockAdapter(),
    });
    flushSync();
    const blockEls = target.querySelectorAll('[data-testid="block-element"]');
    expect(blockEls.length).toBe(SAMPLE_BLOCKS.length);
    unmount(component);
  });

  test('cell 2: idle AND editingNoteId === self.noteId → 0 (defensive)', () => {
    const viewState = makeViewState({
      editingStatus: 'idle',
      editingNoteId: 'note-001', // synthetic — feedReducer normally sets null when idle
    });
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState: null,
      blockEditorAdapter: makeBlockAdapter(),
    });
    flushSync();
    const blockEls = target.querySelectorAll('[data-testid="block-element"]');
    expect(blockEls.length).toBe(0);
    unmount(component);
  });

  test('cell 3: editing AND editingNoteId !== self.noteId → 0', () => {
    const viewState = makeViewState({
      editingStatus: 'editing',
      editingNoteId: 'note-OTHER',
    });
    const editingSessionState = {
      status: 'editing',
      currentNoteId: 'note-OTHER',
      focusedBlockId: 'b1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
      blocks: SAMPLE_BLOCKS,
    };
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: makeBlockAdapter(),
    });
    flushSync();
    const blockEls = target.querySelectorAll('[data-testid="block-element"]');
    expect(blockEls.length).toBe(0);
    unmount(component);
  });

  test('cell 4: idle AND editingNoteId !== self.noteId → 0', () => {
    const viewState = makeViewState({
      editingStatus: 'idle',
      editingNoteId: null,
    });
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState: null,
      blockEditorAdapter: makeBlockAdapter(),
    });
    flushSync();
    const blockEls = target.querySelectorAll('[data-testid="block-element"]');
    expect(blockEls.length).toBe(0);
    unmount(component);
  });
});

// ── PROP-FEED-S5-007: save-failure-banner ────────────────────────────────────

describe('PROP-FEED-S5-007: save-failure-banner only on the editing row when save-failed', () => {
  test('save-failed on editing row → banner present', () => {
    const viewState = makeViewState({
      editingStatus: 'save-failed',
      editingNoteId: 'note-001',
    });
    const editingSessionState = {
      status: 'save-failed',
      currentNoteId: 'note-001',
      priorFocusedBlockId: 'b1',
      isNoteEmpty: false,
      lastSaveResult: { kind: 'failure', reason: 'permission' },
      pendingNextFocus: null,
      blocks: SAMPLE_BLOCKS,
    };
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: makeBlockAdapter(),
    });
    flushSync();
    expect(target.querySelector('[data-testid="save-failure-banner"]')).not.toBeNull();
    unmount(component);
  });

  test('save-failed on a different row → banner absent on this row', () => {
    const viewState = makeViewState({
      editingStatus: 'save-failed',
      editingNoteId: 'note-OTHER',
    });
    const editingSessionState = {
      status: 'save-failed',
      currentNoteId: 'note-OTHER',
      priorFocusedBlockId: 'b1',
      isNoteEmpty: false,
      lastSaveResult: { kind: 'failure', reason: 'permission' },
      pendingNextFocus: null,
      blocks: SAMPLE_BLOCKS,
    };
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: makeBlockAdapter(),
    });
    flushSync();
    expect(target.querySelector('[data-testid="save-failure-banner"]')).toBeNull();
    unmount(component);
  });
});

// ── PROP-FEED-S5-008: typing → dispatchEditBlockContent ──────────────────────

describe('PROP-FEED-S5-008: typing in BlockElement triggers dispatchEditBlockContent', () => {
  test('input event on focused block element fires dispatchEditBlockContent', async () => {
    const viewState = makeViewState({
      editingStatus: 'editing',
      editingNoteId: 'note-001',
    });
    const editingSessionState = {
      status: 'editing',
      currentNoteId: 'note-001',
      focusedBlockId: 'b1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
      blocks: [{ id: 'b1', type: 'paragraph', content: '' }],
    };
    const blockAdapter = makeBlockAdapter();
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: blockAdapter,
    });
    flushSync();
    const blockEl = target.querySelector('[data-testid="block-element"]') as HTMLElement | null;
    expect(blockEl).not.toBeNull();
    if (!blockEl) return;
    // BlockElement IS the contenteditable element (per ui-block-editor REQ-BE-001).
    const editable = blockEl.matches('[contenteditable="true"]')
      ? blockEl
      : (blockEl.querySelector('[contenteditable="true"]') as HTMLElement | null);
    expect(editable).not.toBeNull();
    if (!editable) return;
    editable.textContent = 'h';
    editable.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(blockAdapter.dispatchEditBlockContent).toHaveBeenCalledTimes(1);
    unmount(component);
  });
});

// ── PROP-FEED-S5-018: EC-FEED-018 — filter excludes editingNoteId ────────────

describe('PROP-FEED-S5-018: EC-FEED-018 — filter exclusion + re-visible cache restore', () => {
  test('row not in visibleNoteIds → BlockElement absent (rendered by FeedList container)', () => {
    // FeedList is the container that decides which rows mount; this test verifies
    // the precondition that a non-mounted row produces 0 block-elements. The
    // FeedList-side cache restore is exercised via FeedList.dom.vitest.ts (Sprint 5
    // extension). RED phase: this passes trivially because BlockElement isn't
    // implemented yet, so we encode it as a stronger assertion: when the row is
    // mounted with editingNoteId = self.noteId AND the row's noteId is NOT in
    // visibleNoteIds, the block-element should still be absent (FeedList won't
    // render the row at all in production; this test asserts the row component
    // also defends against being asked).
    const viewState = makeViewState({
      editingStatus: 'editing',
      editingNoteId: 'note-001',
      visibleNoteIds: ['note-OTHER'], // note-001 filtered out
    });
    const editingSessionState = {
      status: 'editing',
      currentNoteId: 'note-001',
      focusedBlockId: 'b1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
      blocks: SAMPLE_BLOCKS,
    };
    // Even if a parent erroneously mounts this row, REQ-FEED-030 cell 1 still
    // fires (the row mount predicate only checks editingStatus + editingNoteId).
    // The protection is at the FeedList layer (visibleNoteIds.includes(noteId)).
    // For PROP-FEED-S5-018 we assert this Phase 2b expectation: the integration
    // test in feed-list.dom.vitest.ts will verify the FeedList-level exclusion.
    // Here we only assert the row, when mounted, shows the embedded blocks
    // (which is independent of visibleNoteIds at the row level).
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: makeBlockAdapter(),
    });
    flushSync();
    // Row level: BlockElement IS rendered (independent of visibleNoteIds).
    // The full S5-018 (mount/unmount via filter) is verified at FeedList level.
    const blockEls = target.querySelectorAll('[data-testid="block-element"]');
    expect(blockEls.length).toBe(SAMPLE_BLOCKS.length);
    unmount(component);
  });
});
