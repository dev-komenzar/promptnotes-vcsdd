/**
 * feed-row-empty-fallback.dom.vitest.ts — Sprint 5 fallback DOM integration
 *
 * Coverage:
 *   PROP-FEED-S5-010 — fallback BlockElement (paragraph, empty, UUID v4 id)
 *   PROP-FEED-S5-011 — fallback dispatch chain + idempotency + restart scenarios
 *
 * REQ coverage: REQ-FEED-031, EC-FEED-016 (Sprint 5 amendment)
 *
 * Note on assertion strategy:
 *   - The "fallback dispatch chain" is identified by `dispatchInsertBlockAtBeginning`
 *     calls (BlockElement does NOT dispatch this method, so it's a clean marker).
 *   - `dispatchFocusBlock` is also fired by BlockElement on focusin (REQ-BE-002b),
 *     so its count is NOT used to assert fallback behaviour — only as evidence
 *     that the chain attempted the second step.
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

async function settle(): Promise<void> {
  flushSync();
  // Allow microtask chain (await dispatch + try/catch) to complete.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  flushSync();
}

function getRenderedFallbackId(): string | null {
  const blockEl = target.querySelector('[data-testid="block-element"]') as HTMLElement | null;
  return blockEl?.getAttribute('data-block-id') ?? null;
}

// ── PROP-FEED-S5-010 ─────────────────────────────────────────────────────────

describe('PROP-FEED-S5-010: fallback BlockElement (paragraph, empty, UUID v4)', () => {
  test('blocks=undefined → 1 block-element with paragraph class, empty content, UUID v4 id', async () => {
    const editingSessionState = makeEditingSession({ blocks: undefined });
    const blockAdapter = makeBlockAdapter();
    const component = mountRow({
      ...BASE_PROPS,
      viewState: makeViewState(),
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: blockAdapter,
    });
    await settle();
    const blockEls = target.querySelectorAll('[data-testid="block-element"]');
    expect(blockEls.length).toBe(1);
    const blockEl = blockEls[0] as HTMLElement;
    // BlockElement uses `class="block-element block-{type}"` (no data-block-type attr).
    expect(blockEl.className).toContain('block-paragraph');
    expect((blockEl.textContent ?? '').trim()).toBe('');
    const idAttr = blockEl.getAttribute('data-block-id');
    expect(idAttr).not.toBeNull();
    expect(idAttr).toMatch(UUID_V4_REGEX);
    unmount(component);
  });

  test('blocks=[] (defensive, contractually unreachable) → same fallback behaviour', async () => {
    const editingSessionState = makeEditingSession({ blocks: [] });
    const component = mountRow({
      ...BASE_PROPS,
      viewState: makeViewState(),
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: makeBlockAdapter(),
    });
    await settle();
    const blockEls = target.querySelectorAll('[data-testid="block-element"]');
    expect(blockEls.length).toBe(1);
    const blockEl = blockEls[0] as HTMLElement;
    expect(blockEl.className).toContain('block-paragraph');
    expect(blockEl.getAttribute('data-block-id')).toMatch(UUID_V4_REGEX);
    unmount(component);
  });
});

// ── PROP-FEED-S5-011 (5 scenarios) ───────────────────────────────────────────

describe('PROP-FEED-S5-011: fallback dispatch chain + idempotency + restart', () => {
  test('(a) insert→focus dispatch order, both attempted, BlockElement remains under reject', async () => {
    const blockAdapter = makeBlockAdapter(true); // reject-all
    const component = mountRow({
      ...BASE_PROPS,
      viewState: makeViewState(),
      adapter: makeFeedAdapter(),
      editingSessionState: makeEditingSession({ blocks: undefined }),
      blockEditorAdapter: blockAdapter,
    });
    await settle();
    expect(blockAdapter.dispatchInsertBlockAtBeginning).toHaveBeenCalledTimes(1);
    // dispatchFocusBlock is called >=1 (fallback chain step 2 + BlockElement focusin).
    expect((blockAdapter.dispatchFocusBlock as unknown as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
    // Order: fallback chain insert before fallback chain focus (the very first
    // focus call comes from the fallback chain, which happens before BlockElement
    // mounts and triggers its own focus).
    const insertOrder = (blockAdapter.dispatchInsertBlockAtBeginning as unknown as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const focusOrder = (blockAdapter.dispatchFocusBlock as unknown as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(insertOrder).toBeLessThan(focusOrder);
    expect(target.querySelectorAll('[data-testid="block-element"]').length).toBe(1);
    const renderedId = getRenderedFallbackId();
    // dispatchInsertBlockAtBeginning payload includes issuedAt
    const insertCall = (blockAdapter.dispatchInsertBlockAtBeginning as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(typeof insertCall.issuedAt).toBe('string');
    expect(insertCall.type).toBe('paragraph');
    // dispatchFocusBlock first-call (fallback chain, not BlockElement) blockId matches rendered id.
    const focusCall = (blockAdapter.dispatchFocusBlock as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(focusCall.blockId).toBe(renderedId);
    expect(typeof focusCall.issuedAt).toBe('string');
    unmount(component);
  });

  test('(b) same noteId, blocks=undefined twice → fallback chain attempt = 1, same UUID', async () => {
    // Use FeedRowSprint5Wrapper to mutate editingSessionState reactively post-mount.
    const Wrapper = (await import('./FeedRowSprint5Wrapper.svelte')).default;
    const blockAdapter = makeBlockAdapter();
    const wrapperApp = mount(Wrapper as never, {
      target,
      props: {
        initialNoteId: 'note-001',
        initialBody: '',
        initialCreatedAt: 1746352800000,
        initialUpdatedAt: 1746352800000,
        initialTags: [],
        initialViewState: makeViewState(),
        initialEditingSessionState: makeEditingSession({ blocks: undefined }),
        feedAdapter: makeFeedAdapter(),
        blockAdapter,
      } as never,
    });
    await settle();
    const firstId = getRenderedFallbackId();
    expect(firstId).toMatch(UUID_V4_REGEX);
    expect(blockAdapter.dispatchInsertBlockAtBeginning).toHaveBeenCalledTimes(1);

    const wrapperEl = target.querySelector('[data-testid="sprint-5-wrapper"]') as HTMLElement;
    const setterKey = wrapperEl.getAttribute('data-setter-key')!;
    const setters = (window as unknown as Record<string, { setEditingSessionState: (s: unknown) => void }>)[setterKey];

    // Second emit with blocks=undefined for the same noteId; new object reference.
    setters.setEditingSessionState(makeEditingSession({ blocks: undefined }));
    await settle();
    // No additional fallback dispatch — same UUID retained.
    expect(blockAdapter.dispatchInsertBlockAtBeginning).toHaveBeenCalledTimes(1);
    const secondId = getRenderedFallbackId();
    expect(secondId).toBe(firstId);
    unmount(wrapperApp);
  });

  test('(c) noteA→noteB→noteA cycle (separate mounts) → second fallback uses NEW UUID', async () => {
    // FeedRow's fallbackAppliedFor lives in instance $state; remount = new fallback.
    // Test verifies that two independent mounts for noteA produce different UUIDs
    // (since they're separate FeedRow instances), which models the noteA→noteB→noteA
    // case where the FeedRow itself unmounts/remounts when filter visibility changes.
    const blockAdapter1 = makeBlockAdapter();
    const c1 = mountRow({
      ...BASE_PROPS,
      noteId: 'noteA',
      viewState: makeViewState({ editingNoteId: 'noteA', visibleNoteIds: ['noteA'] }),
      adapter: makeFeedAdapter(),
      editingSessionState: makeEditingSession({ noteId: 'noteA', blocks: undefined }),
      blockEditorAdapter: blockAdapter1,
    });
    await settle();
    const firstId = getRenderedFallbackId();
    unmount(c1);
    target.innerHTML = '';
    const blockAdapter2 = makeBlockAdapter();
    const c2 = mountRow({
      ...BASE_PROPS,
      noteId: 'noteA',
      viewState: makeViewState({ editingNoteId: 'noteA', visibleNoteIds: ['noteA'] }),
      adapter: makeFeedAdapter(),
      editingSessionState: makeEditingSession({ noteId: 'noteA', blocks: undefined }),
      blockEditorAdapter: blockAdapter2,
    });
    await settle();
    const secondId = getRenderedFallbackId();
    expect(secondId).not.toBe(firstId);
    expect(secondId).toMatch(UUID_V4_REGEX);
    expect(blockAdapter2.dispatchInsertBlockAtBeginning).toHaveBeenCalledTimes(1);
    unmount(c2);
  });

  test('(d) FIND-iter2-005: undefined→non-empty→undefined within single mount → 2nd fallback uses NEW UUID', async () => {
    // Use FeedRowSprint5Wrapper to mutate editingSessionState reactively post-mount.
    const Wrapper = (await import('./FeedRowSprint5Wrapper.svelte')).default;
    const blockAdapter = makeBlockAdapter();
    const wrapperApp = mount(Wrapper as never, {
      target,
      props: {
        initialNoteId: 'note-001',
        initialBody: '',
        initialCreatedAt: 1746352800000,
        initialUpdatedAt: 1746352800000,
        initialTags: [],
        initialViewState: makeViewState(),
        initialEditingSessionState: makeEditingSession({ blocks: undefined }),
        feedAdapter: makeFeedAdapter(),
        blockAdapter,
      } as never,
    });
    await settle();
    const firstId = getRenderedFallbackId();
    expect(firstId).toMatch(UUID_V4_REGEX);

    // Read the wrapper's setter key from data attribute and grab setters.
    const wrapperEl = target.querySelector('[data-testid="sprint-5-wrapper"]') as HTMLElement;
    const setterKey = wrapperEl.getAttribute('data-setter-key');
    expect(setterKey).not.toBeNull();
    const setters = (window as unknown as Record<string, { setEditingSessionState: (s: unknown) => void }>)[setterKey!];
    expect(setters).toBeDefined();

    // Transition: blocks become non-empty (resets fallbackAppliedFor).
    setters.setEditingSessionState(makeEditingSession({
      blocks: [{ id: 'server-block', type: 'paragraph', content: 'server' }],
      focusedBlockId: 'server-block',
    }));
    await settle();
    // Server block is now displayed.
    const interimId = getRenderedFallbackId();
    expect(interimId).toBe('server-block');

    // Transition back: blocks=undefined.
    setters.setEditingSessionState(makeEditingSession({ blocks: undefined }));
    await settle();
    // restart condition (iii) MUST fire → new UUID.
    const secondId = getRenderedFallbackId();
    expect(secondId).toMatch(UUID_V4_REGEX);
    expect(secondId).not.toBe(firstId);
    // Fallback chain dispatch attempt count = 2 (one for each undefined arrival).
    expect(blockAdapter.dispatchInsertBlockAtBeginning).toHaveBeenCalledTimes(2);

    unmount(wrapperApp);
  });

  test('(e) blocks non-empty only → no fallback insertBlock dispatch', async () => {
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
    await settle();
    // The fallback chain marker — dispatchInsertBlockAtBeginning — must NOT fire.
    expect(blockAdapter.dispatchInsertBlockAtBeginning).not.toHaveBeenCalled();
    // dispatchFocusBlock count is NOT asserted here (BlockElement may dispatch
    // it on focusin per REQ-BE-002b). The key assertion is the fallback marker.
    expect(target.querySelectorAll('[data-testid="block-element"]').length).toBe(1);
    unmount(component);
  });
});
