/**
 * feed-row-empty-fallback.dom.vitest.ts — Sprint 5 fallback DOM integration
 *
 * Coverage:
 *   PROP-FEED-S5-010 — fallback BlockElement (paragraph, empty, UUID v4 id)
 *   PROP-FEED-S5-011 — fallback dispatch chain + idempotency + restart scenarios
 *
 * REQ coverage: REQ-FEED-031, EC-FEED-016 (Sprint 5 amendment)
 *
 * RED PHASE: FeedRow does not yet apply fallback; tests fail at assertions that
 * a block-element exists and dispatch was called.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import FeedRow from '../../FeedRow.svelte';
import type { TauriFeedAdapter } from '../../tauriFeedAdapter.js';
import type { FeedViewState } from '../../types.js';
import type { BlockEditorAdapter } from '$lib/block-editor/types';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeFeedAdapter(): TauriFeedAdapter & Record<string, ReturnType<typeof vi.fn>> {
  return {
    dispatchSelectPastNote: vi.fn().mockResolvedValue(undefined),
    dispatchRequestNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchConfirmNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchCancelNoteDeletion: vi.fn().mockResolvedValue(undefined),
  };
}

function makeBlockAdapter(rejectAll = false): BlockEditorAdapter & Record<string, ReturnType<typeof vi.fn>> {
  const factory = () =>
    rejectAll ? vi.fn().mockRejectedValue(new Error('command not found')) : vi.fn().mockResolvedValue(undefined);
  return {
    dispatchFocusBlock: factory(),
    dispatchEditBlockContent: factory(),
    dispatchInsertBlockAfter: factory(),
    dispatchInsertBlockAtBeginning: factory(),
    dispatchRemoveBlock: factory(),
    dispatchMergeBlocks: factory(),
    dispatchSplitBlock: factory(),
    dispatchChangeBlockType: factory(),
    dispatchMoveBlock: factory(),
    dispatchTriggerIdleSave: factory(),
    dispatchTriggerBlurSave: factory(),
    dispatchRetrySave: factory(),
    dispatchDiscardCurrentSession: factory(),
    dispatchCancelSwitch: factory(),
    dispatchCopyNoteBody: factory(),
    dispatchRequestNewNote: factory(),
  } as BlockEditorAdapter & Record<string, ReturnType<typeof vi.fn>>;
}

function makeViewState(overrides: Partial<FeedViewState> = {}): FeedViewState {
  return {
    editingStatus: 'editing',
    editingNoteId: 'note-001',
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

const BASE_PROPS = {
  noteId: 'note-001',
  body: '',
  createdAt: 1746352800000,
  updatedAt: 1746352800000,
  tags: [] as string[],
  tagInventory: [] as never[],
};

function makeEditingSession(opts: {
  noteId?: string;
  blocks?: unknown;
  focusedBlockId?: string | null;
} = {}) {
  return {
    status: 'editing',
    currentNoteId: opts.noteId ?? 'note-001',
    focusedBlockId: opts.focusedBlockId ?? null,
    isDirty: false,
    isNoteEmpty: true,
    lastSaveResult: null,
    blocks: opts.blocks,
  };
}

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

// ── PROP-FEED-S5-010 ─────────────────────────────────────────────────────────

describe('PROP-FEED-S5-010: fallback BlockElement (paragraph, empty, UUID v4)', () => {
  test('blocks=undefined → 1 block-element with paragraph type, empty content, UUID v4 id', () => {
    const viewState = makeViewState();
    const editingSessionState = makeEditingSession({ blocks: undefined });
    const blockAdapter = makeBlockAdapter();
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: blockAdapter,
    });
    flushSync();
    const blockEls = target.querySelectorAll('[data-testid="block-element"]');
    expect(blockEls.length).toBe(1);
    const blockEl = blockEls[0] as HTMLElement;
    expect(blockEl.getAttribute('data-block-type')).toBe('paragraph');
    expect(blockEl.textContent ?? '').toBe('');
    const idAttr = blockEl.getAttribute('data-block-id');
    expect(idAttr).not.toBeNull();
    expect(idAttr).toMatch(UUID_V4_REGEX);
    unmount(component);
  });

  test('blocks=[] (defensive, contractually unreachable) → same fallback behaviour', () => {
    const viewState = makeViewState();
    const editingSessionState = makeEditingSession({ blocks: [] });
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: makeBlockAdapter(),
    });
    flushSync();
    const blockEls = target.querySelectorAll('[data-testid="block-element"]');
    expect(blockEls.length).toBe(1);
    const blockEl = blockEls[0] as HTMLElement;
    expect(blockEl.getAttribute('data-block-type')).toBe('paragraph');
    expect(blockEl.getAttribute('data-block-id')).toMatch(UUID_V4_REGEX);
    unmount(component);
  });
});

// ── PROP-FEED-S5-011 (5 scenarios) ───────────────────────────────────────────

describe('PROP-FEED-S5-011: fallback dispatch chain + idempotency + restart', () => {
  test('(a) insert→focus dispatch order, both attempted, BlockElement remains under reject', async () => {
    const viewState = makeViewState();
    const editingSessionState = makeEditingSession({ blocks: undefined });
    const blockAdapter = makeBlockAdapter(true); // reject-all
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: blockAdapter,
    });
    flushSync();
    // Allow microtasks (await dispatch + try/catch) to settle.
    await Promise.resolve();
    await Promise.resolve();
    expect(blockAdapter.dispatchInsertBlockAtBeginning).toHaveBeenCalledTimes(1);
    expect(blockAdapter.dispatchFocusBlock).toHaveBeenCalledTimes(1);
    // Order: insert before focus.
    const insertOrder = blockAdapter.dispatchInsertBlockAtBeginning.mock.invocationCallOrder[0];
    const focusOrder = blockAdapter.dispatchFocusBlock.mock.invocationCallOrder[0];
    expect(insertOrder).toBeLessThan(focusOrder);
    // BlockElement still rendered after rejects.
    expect(target.querySelectorAll('[data-testid="block-element"]').length).toBe(1);
    // dispatchFocusBlock blockId matches the rendered UUID
    const renderedId = (target.querySelector('[data-testid="block-element"]') as HTMLElement).getAttribute('data-block-id');
    const focusCall = blockAdapter.dispatchFocusBlock.mock.calls[0][0] as { blockId?: string; issuedAt?: string };
    expect(focusCall.blockId).toBe(renderedId);
    expect(typeof focusCall.issuedAt).toBe('string');
    unmount(component);
  });

  test('(b) same noteId, blocks=undefined twice → dispatch each = 1, same UUID', async () => {
    const blockAdapter = makeBlockAdapter();
    let editingSessionState = makeEditingSession({ blocks: undefined });
    const component = mountRow({
      ...BASE_PROPS,
      viewState: makeViewState(),
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: blockAdapter,
    });
    flushSync();
    await Promise.resolve();
    const firstId = (target.querySelector('[data-testid="block-element"]') as HTMLElement).getAttribute('data-block-id');
    // Second event with blocks=undefined for same note
    editingSessionState = makeEditingSession({ blocks: undefined });
    (component as unknown as { editingSessionState?: unknown }).editingSessionState = editingSessionState;
    flushSync();
    await Promise.resolve();
    expect(blockAdapter.dispatchInsertBlockAtBeginning).toHaveBeenCalledTimes(1);
    expect(blockAdapter.dispatchFocusBlock).toHaveBeenCalledTimes(1);
    const secondId = (target.querySelector('[data-testid="block-element"]') as HTMLElement).getAttribute('data-block-id');
    expect(secondId).toBe(firstId);
    unmount(component);
  });

  test('(c) noteA→noteB→noteA cycle → second fallback uses NEW UUID', async () => {
    const blockAdapter = makeBlockAdapter();
    const component = mountRow({
      ...BASE_PROPS,
      noteId: 'noteA',
      viewState: makeViewState({ editingNoteId: 'noteA' }),
      adapter: makeFeedAdapter(),
      editingSessionState: makeEditingSession({ noteId: 'noteA', blocks: undefined }),
      blockEditorAdapter: blockAdapter,
    });
    flushSync();
    await Promise.resolve();
    const firstId = (target.querySelector('[data-testid="block-element"]') as HTMLElement).getAttribute('data-block-id');
    // Switch to noteB
    (component as unknown as Record<string, unknown>).viewState = makeViewState({ editingNoteId: 'noteB' });
    (component as unknown as Record<string, unknown>).editingSessionState = makeEditingSession({ noteId: 'noteB', blocks: undefined });
    flushSync();
    // Switch back to noteA with blocks=undefined again
    (component as unknown as Record<string, unknown>).viewState = makeViewState({ editingNoteId: 'noteA' });
    (component as unknown as Record<string, unknown>).editingSessionState = makeEditingSession({ noteId: 'noteA', blocks: undefined });
    flushSync();
    await Promise.resolve();
    expect(blockAdapter.dispatchInsertBlockAtBeginning).toHaveBeenCalledTimes(2);
    expect(blockAdapter.dispatchFocusBlock).toHaveBeenCalledTimes(2);
    const secondId = (target.querySelector('[data-testid="block-element"]') as HTMLElement).getAttribute('data-block-id');
    expect(secondId).not.toBe(firstId);
    unmount(component);
  });

  test('(d) FIND-iter2-005: undefined→non-empty→undefined → 2nd fallback uses NEW UUID', async () => {
    const blockAdapter = makeBlockAdapter();
    const component = mountRow({
      ...BASE_PROPS,
      viewState: makeViewState(),
      adapter: makeFeedAdapter(),
      editingSessionState: makeEditingSession({ blocks: undefined }),
      blockEditorAdapter: blockAdapter,
    });
    flushSync();
    await Promise.resolve();
    const firstId = (target.querySelector('[data-testid="block-element"]') as HTMLElement).getAttribute('data-block-id');
    // Transition: blocks become non-empty
    (component as unknown as Record<string, unknown>).editingSessionState = makeEditingSession({
      blocks: [{ id: 'server-block', type: 'paragraph', content: 'server' }],
      focusedBlockId: 'server-block',
    });
    flushSync();
    await Promise.resolve();
    // Transition back: blocks=undefined
    (component as unknown as Record<string, unknown>).editingSessionState = makeEditingSession({ blocks: undefined });
    flushSync();
    await Promise.resolve();
    expect(blockAdapter.dispatchInsertBlockAtBeginning).toHaveBeenCalledTimes(2);
    expect(blockAdapter.dispatchFocusBlock).toHaveBeenCalledTimes(2);
    const secondId = (target.querySelector('[data-testid="block-element"]') as HTMLElement).getAttribute('data-block-id');
    expect(secondId).not.toBe(firstId);
    unmount(component);
  });

  test('(e) blocks non-empty only → no fallback dispatch', async () => {
    const blockAdapter = makeBlockAdapter();
    const component = mountRow({
      ...BASE_PROPS,
      viewState: makeViewState(),
      adapter: makeFeedAdapter(),
      editingSessionState: makeEditingSession({
        blocks: [{ id: 'server-block', type: 'paragraph', content: 'hello' }],
        focusedBlockId: 'server-block',
      }),
      blockEditorAdapter: blockAdapter,
    });
    flushSync();
    await Promise.resolve();
    expect(blockAdapter.dispatchInsertBlockAtBeginning).not.toHaveBeenCalled();
    expect(blockAdapter.dispatchFocusBlock).not.toHaveBeenCalled();
    expect(target.querySelectorAll('[data-testid="block-element"]').length).toBe(1);
    unmount(component);
  });
});
