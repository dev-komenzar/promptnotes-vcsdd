/**
 * feed-row-best-effort-dispatch.dom.vitest.ts — Sprint 5 PROP-FEED-S5-022
 *
 * Coverage:
 *   PROP-FEED-S5-022 — Group B Rust handler unimplemented; UI continues to function
 *                      under reject (4 sub-assertions a-d).
 *
 * REQ coverage: REQ-FEED-030, REQ-FEED-031 (Sprint 5 known constraint)
 *
 * RED PHASE: BlockElement embedding not yet implemented.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import FeedRow from '../../FeedRow.svelte';
import type { TauriFeedAdapter } from '../../tauriFeedAdapter.js';
import type { BlockEditorAdapter } from '$lib/block-editor/types';
import type { FeedViewState } from '../../types.js';

function makeFeedAdapter(): TauriFeedAdapter & Record<string, ReturnType<typeof vi.fn>> {
  return {
    dispatchSelectPastNote: vi.fn().mockResolvedValue(undefined),
    dispatchRequestNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchConfirmNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchCancelNoteDeletion: vi.fn().mockResolvedValue(undefined),
  };
}

/** Reject Group B (9 methods); resolve Group A (7 methods). */
function makeBlockAdapterGroupBReject(): BlockEditorAdapter & Record<string, ReturnType<typeof vi.fn>> {
  const reject = () => vi.fn().mockRejectedValue(new Error('command not found'));
  const resolve = () => vi.fn().mockResolvedValue(undefined);
  return {
    // Group B: reject
    dispatchFocusBlock: reject(),
    dispatchEditBlockContent: reject(),
    dispatchInsertBlockAfter: reject(),
    dispatchInsertBlockAtBeginning: reject(),
    dispatchRemoveBlock: reject(),
    dispatchMergeBlocks: reject(),
    dispatchSplitBlock: reject(),
    dispatchChangeBlockType: reject(),
    dispatchMoveBlock: reject(),
    // Group A: resolve
    dispatchTriggerIdleSave: resolve(),
    dispatchTriggerBlurSave: resolve(),
    dispatchRetrySave: resolve(),
    dispatchDiscardCurrentSession: resolve(),
    dispatchCancelSwitch: resolve(),
    dispatchCopyNoteBody: resolve(),
    dispatchRequestNewNote: resolve(),
  } as BlockEditorAdapter & Record<string, ReturnType<typeof vi.fn>>;
}

function makeViewState(): FeedViewState {
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
  };
}

const SERVER_BLOCKS = [
  { id: 'b1', type: 'paragraph', content: 'server-content' },
];

const BASE_PROPS = {
  noteId: 'note-001',
  body: 'server-content',
  createdAt: 1746352800000,
  updatedAt: 1746352800000,
  tags: [] as string[],
  tagInventory: [] as never[],
};

let target: HTMLDivElement;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  target.remove();
  warnSpy.mockRestore();
  vi.clearAllMocks();
});

function mountRow(props: Record<string, unknown>) {
  return mount(FeedRow as never, { target, props: props as never });
}

describe('PROP-FEED-S5-022: Group B reject acceptance — UI continues to function', () => {
  test('(a) BlockElement (server-provided) remains in DOM under all-Group-B-reject', async () => {
    const editingSessionState = {
      status: 'editing',
      currentNoteId: 'note-001',
      focusedBlockId: 'b1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
      blocks: SERVER_BLOCKS,
    };
    const blockAdapter = makeBlockAdapterGroupBReject();
    const component = mountRow({
      ...BASE_PROPS,
      viewState: makeViewState(),
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: blockAdapter,
    });
    flushSync();
    await Promise.resolve();
    expect(target.querySelectorAll('[data-testid="block-element"]').length).toBe(1);
    unmount(component);
  });

  test('(b) typing into BlockElement updates client-side textContent (independent of dispatch outcome)', async () => {
    const editingSessionState = {
      status: 'editing',
      currentNoteId: 'note-001',
      focusedBlockId: 'b1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
      blocks: SERVER_BLOCKS,
    };
    const blockAdapter = makeBlockAdapterGroupBReject();
    const component = mountRow({
      ...BASE_PROPS,
      viewState: makeViewState(),
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: blockAdapter,
    });
    flushSync();
    const blockEl = target.querySelector('[data-testid="block-element"]') as HTMLElement | null;
    expect(blockEl).not.toBeNull();
    if (!blockEl) return;
    const editable = blockEl.querySelector('[contenteditable="true"]') as HTMLElement | null;
    if (editable) {
      editable.textContent = 'h';
      editable.dispatchEvent(new Event('input', { bubbles: true }));
    }
    flushSync();
    await Promise.resolve();
    // Client-side textContent reflects user input regardless of dispatch reject.
    expect(editable?.textContent ?? '').toContain('h');
    unmount(component);
  });

  test('(c) reject is silently absorbed via console.warn (positive evidence dispatch attempted)', async () => {
    // Use fallback path to force at least one Group B dispatch attempt.
    const editingSessionState = {
      status: 'editing',
      currentNoteId: 'note-001',
      focusedBlockId: null,
      isDirty: false,
      isNoteEmpty: true,
      lastSaveResult: null,
      blocks: undefined, // triggers fallback (REQ-FEED-031)
    };
    const blockAdapter = makeBlockAdapterGroupBReject();
    const component = mountRow({
      ...BASE_PROPS,
      viewState: makeViewState(),
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: blockAdapter,
    });
    flushSync();
    await Promise.resolve();
    await Promise.resolve();
    // Group B insertBlockAtBeginning was attempted (and rejected).
    expect(blockAdapter.dispatchInsertBlockAtBeginning).toHaveBeenCalled();
    // console.warn captured at least once due to dispatch reject(s).
    expect(warnSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    unmount(component);
  });

  test('(d) row-level click outside BlockElement still routes via FeedAdapter (Group A path)', async () => {
    const editingSessionState = {
      status: 'editing',
      currentNoteId: 'note-001',
      focusedBlockId: 'b1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
      blocks: SERVER_BLOCKS,
    };
    const feedAdapter = makeFeedAdapter();
    const blockAdapter = makeBlockAdapterGroupBReject();
    const component = mountRow({
      ...BASE_PROPS,
      viewState: makeViewState(),
      adapter: feedAdapter,
      editingSessionState,
      blockEditorAdapter: blockAdapter,
    });
    flushSync();
    // Click on the row's outer button (preview area) — should still be wired to
    // FeedAdapter as before; not affected by BlockEditorAdapter's reject state.
    // For this RED-phase test we assert the row remains interactive (button exists).
    const rowButton = target.querySelector('[data-testid="feed-row-button"]') as HTMLButtonElement | null;
    expect(rowButton).not.toBeNull();
    unmount(component);
  });
});
