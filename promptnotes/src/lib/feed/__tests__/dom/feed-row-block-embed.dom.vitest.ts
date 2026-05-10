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

// ── PROP-FEED-S5-018: EC-FEED-018 — filter exclusion + re-visible cache restore

describe('PROP-FEED-S5-018: EC-FEED-018 — filter exclusion unmounts row + remount restores blocks', () => {
  /**
   * EC-FEED-018 says the FeedList unmounts the row when filter excludes the
   * editingNoteId; re-mount after re-visible should display blocks again. We
   * model this at the row level by:
   *   (1) Mount row with editing context → block-element count = blocks.length
   *   (2) Unmount the row (= filter exclusion)
   *   (3) Re-mount with the same editing context → block-element count = blocks.length
   *
   * Step 3 verifies the cache-restore behaviour: as long as the upstream
   * editingSessionState.blocks is preserved (= held by the channel/+page.svelte
   * subscriber across filter toggles), the re-mounted FeedRow produces the
   * same block-element rendering. The Sprint 5 contract for cache continuity
   * is "the upstream subscriber holds editingSessionState across remounts" —
   * verified by REQ-FEED-029 single-subscription.
   */
  test('mount→unmount→remount preserves block-element rendering when editingSessionState unchanged', () => {
    const viewState = makeViewState({
      editingStatus: 'editing',
      editingNoteId: 'note-001',
      visibleNoteIds: ['note-001'],
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
    const adapter = makeFeedAdapter();
    const blockAdapter = makeBlockAdapter();
    // (1) Mount → blocks render
    let component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter,
      editingSessionState,
      blockEditorAdapter: blockAdapter,
    });
    flushSync();
    expect(target.querySelectorAll('[data-testid="block-element"]').length).toBe(SAMPLE_BLOCKS.length);
    // (2) Unmount (= filter exclusion equivalent)
    unmount(component);
    flushSync();
    expect(target.querySelectorAll('[data-testid="block-element"]').length).toBe(0);
    // (3) Re-mount with same editingSessionState → blocks restored
    component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter,
      editingSessionState,
      blockEditorAdapter: blockAdapter,
    });
    flushSync();
    expect(target.querySelectorAll('[data-testid="block-element"]').length).toBe(SAMPLE_BLOCKS.length);
    unmount(component);
  });

  test('unmount → block-element count drops to 0; no spurious adapter dispatches during unmount', () => {
    const adapter = makeFeedAdapter();
    const blockAdapter = makeBlockAdapter();
    const viewState = makeViewState({
      editingStatus: 'editing',
      editingNoteId: 'note-001',
      visibleNoteIds: ['note-001'],
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
      adapter,
      editingSessionState,
      blockEditorAdapter: blockAdapter,
    });
    flushSync();
    // Reset call counts after mount (we accept BlockElement dispatchFocusBlock at mount).
    blockAdapter.dispatchInsertBlockAtBeginning.mockClear();
    blockAdapter.dispatchFocusBlock.mockClear();
    unmount(component);
    flushSync();
    expect(target.querySelectorAll('[data-testid="block-element"]').length).toBe(0);
    // No NEW adapter dispatch during unmount.
    expect(blockAdapter.dispatchInsertBlockAtBeginning).not.toHaveBeenCalled();
  });
});
