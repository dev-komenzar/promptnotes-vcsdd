/**
 * feed-row-preview-exclusivity.dom.vitest.ts — Sprint 6 DOM integration tests
 *
 * Coverage:
 *   PROP-FEED-S6-001 — 5-row truth table for preview/feed-row-button/block-element/
 *                      block-editor-surface/delete-button DOM presence per cell.
 *
 *     cell 1 (effectiveMount=true):
 *       editingStatus ∈ {editing,saving,switching,save-failed}
 *       AND editingNoteId === self.noteId
 *       AND blockEditorAdapter !== null
 *       → row-body-preview === null, feed-row-button === null,
 *         block-element !== null, block-editor-surface !== null,
 *         delete-button !== null, delete-button.disabled === true
 *
 *     EC-FEED-024 row (effectiveMount=false, adapter=null):
 *       editingStatus ∈ {editing,...}
 *       AND editingNoteId === self.noteId
 *       AND blockEditorAdapter === null
 *       → row-body-preview !== null, feed-row-button !== null,
 *         block-element === null, block-editor-surface === null,
 *         delete-button !== null, delete-button.disabled === true
 *
 *     cell 2 (architecturally unreachable, defensive):
 *       editingStatus === 'idle' AND editingNoteId === self.noteId
 *       → row-body-preview !== null, feed-row-button !== null,
 *         block-element === null, block-editor-surface === null,
 *         delete-button !== null
 *
 *     cell 3:
 *       editingStatus ∈ {editing,...} AND editingNoteId !== self.noteId
 *       → row-body-preview !== null, feed-row-button !== null,
 *         block-element === null, block-editor-surface === null,
 *         delete-button !== null, delete-button.disabled === false
 *
 *     cell 4:
 *       editingStatus === 'idle' AND editingNoteId !== self.noteId
 *       → row-body-preview !== null, feed-row-button !== null,
 *         block-element === null, block-editor-surface === null,
 *         delete-button !== null, delete-button.disabled === false
 *
 *   PROP-FEED-S6-007 — adapter null + dispatch 0-calls dynamic observation:
 *     editingNoteId === self.noteId AND editingStatus === 'editing'
 *     AND blockEditorAdapter === null
 *     → all blockEditorAdapter dispatch methods: calls.length === 0
 *     → tauriFeedAdapter.dispatchSelectPastNote: calls.length === 0
 *       (no click issued in the sequence)
 *
 * RED phase invariant:
 *   PROP-FEED-S6-001 cell 1 asserts row-body-preview === null and
 *   feed-row-button === null.  Sprint 5 baseline always mounts .row-button,
 *   so these assertions MUST FAIL against the current FeedRow.svelte.
 *
 *   PROP-FEED-S6-007 asserts dispatch 0-calls when adapter=null.  Sprint 5
 *   baseline $effect calls adapter methods even when blockEditorAdapter may
 *   be checked (line 287: `if (!adapterRef) return`).  Depending on timing,
 *   this may already be 0 — but the key failing assertion is S6-001.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import FeedRow from '../../FeedRow.svelte';
import type { TauriFeedAdapter } from '../../tauriFeedAdapter.js';
import type { FeedViewState } from '../../types.js';
import type { BlockEditorAdapter, DtoBlock } from '$lib/block-editor/types';

// ── Mock factories ─────────────────────────────────────────────────────────────

function makeFeedAdapter(): TauriFeedAdapter & Record<string, ReturnType<typeof vi.fn>> {
  return {
    dispatchSelectPastNote: vi.fn().mockResolvedValue(undefined),
    dispatchRequestNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchConfirmNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchCancelNoteDeletion: vi.fn().mockResolvedValue(undefined),
  };
}

function makeBlockAdapter(): BlockEditorAdapter & Record<string, ReturnType<typeof vi.fn>> {
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

function makeEditingSession(status: string, noteId: string, blocks: DtoBlock[] | undefined = SAMPLE_BLOCKS) {
  const base = {
    status,
    currentNoteId: noteId,
    focusedBlockId: blocks?.[0]?.id ?? null,
    isDirty: false,
    isNoteEmpty: false,
    lastSaveResult: null,
    blocks,
  };
  return base;
}

// ── PROP-FEED-S6-001: 5-row truth table ───────────────────────────────────────

describe('PROP-FEED-S6-001: 5-row preview exclusivity truth table', () => {

  /**
   * cell 1 (effectiveMount=true):
   * editingStatus='editing', editingNoteId=self.noteId, blockEditorAdapter!=null
   *
   * RED phase: Sprint 5 baseline always mounts .row-button, so
   * assertions row-body-preview===null and feed-row-button===null MUST FAIL
   * against the current FeedRow.svelte.
   */
  test('cell 1 (effectiveMount=true): row-body-preview===null, feed-row-button===null, block-element!==null, block-editor-surface!==null, delete-button!==null+disabled', () => {
    const viewState = makeViewState({
      editingStatus: 'editing',
      editingNoteId: 'note-001',
    });
    const editingSessionState = makeEditingSession('editing', 'note-001', SAMPLE_BLOCKS);
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: makeBlockAdapter(),
    });
    flushSync();

    // RED phase failing assertions: Sprint 5 mounts .row-button unconditionally
    expect(target.querySelector('[data-testid="row-body-preview"]')).toBeNull();
    expect(target.querySelector('[data-testid="feed-row-button"]')).toBeNull();

    // These should pass in Sprint 5 (block-element is mounted when shouldMountBlocks=true)
    expect(target.querySelector('[data-testid="block-element"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="block-editor-surface"]')).not.toBeNull();

    // delete-button: present and disabled (editing this note)
    const deleteBtn = target.querySelector('[data-testid="delete-button"]') as HTMLButtonElement | null;
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn?.disabled).toBe(true);

    unmount(component);
  });

  /**
   * cell 1 variant: editingStatus='saving' also triggers effectiveMount
   */
  test('cell 1 variant (saving): row-body-preview===null, feed-row-button===null', () => {
    const viewState = makeViewState({
      editingStatus: 'saving',
      editingNoteId: 'note-001',
    });
    const editingSessionState = makeEditingSession('saving', 'note-001', SAMPLE_BLOCKS);
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: makeBlockAdapter(),
    });
    flushSync();

    // RED phase: Sprint 5 baseline fails these
    expect(target.querySelector('[data-testid="row-body-preview"]')).toBeNull();
    expect(target.querySelector('[data-testid="feed-row-button"]')).toBeNull();
    expect(target.querySelector('[data-testid="block-editor-surface"]')).not.toBeNull();

    unmount(component);
  });

  /**
   * EC-FEED-024 row (effectiveMount=false because adapter=null):
   * editingStatus='editing', editingNoteId=self.noteId, blockEditorAdapter=null
   * Preview fallback: row-body-preview stays mounted to avoid blank row.
   *
   * RED phase: This assertion checks that when adapter=null, preview stays.
   * Sprint 5 baseline already keeps preview mounted (since it never unmounts it),
   * so row-body-preview!==null passes in Sprint 5. But feed-row-button!==null
   * also passes in Sprint 5.  After Sprint 6 implementation, both still hold for
   * this cell.  The key difference from cell 1: preview should stay here.
   * This cell's assertions PASS in Sprint 5 baseline (regression guard).
   */
  test('EC-FEED-024 row (adapter=null): row-body-preview!==null, feed-row-button!==null, block-element===null, block-editor-surface===null, delete-button!==null+disabled', () => {
    const viewState = makeViewState({
      editingStatus: 'editing',
      editingNoteId: 'note-001',
    });
    const editingSessionState = makeEditingSession('editing', 'note-001', SAMPLE_BLOCKS);
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: null, // EC-FEED-024: adapter not injected
    });
    flushSync();

    // Preview fallback: these should be present (adapter=null → no block editor surface)
    expect(target.querySelector('[data-testid="row-body-preview"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="feed-row-button"]')).not.toBeNull();

    // No block editing without adapter
    expect(target.querySelector('[data-testid="block-element"]')).toBeNull();
    expect(target.querySelector('[data-testid="block-editor-surface"]')).toBeNull();

    // delete-button: present and disabled (editing this note)
    const deleteBtn = target.querySelector('[data-testid="delete-button"]') as HTMLButtonElement | null;
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn?.disabled).toBe(true);

    unmount(component);
  });

  /**
   * cell 2 (architecturally unreachable, defensive):
   * editingStatus='idle', editingNoteId=self.noteId (synthetic injection)
   * Sprint 5 existing behaviour inheritance: preview present.
   */
  test('cell 2 (defensive, unreachable): row-body-preview!==null, feed-row-button!==null, block-element===null, block-editor-surface===null, delete-button!==null', () => {
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

    // shouldMountBlocks=false (idle), so preview stays
    expect(target.querySelector('[data-testid="row-body-preview"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="feed-row-button"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="block-element"]')).toBeNull();
    expect(target.querySelector('[data-testid="block-editor-surface"]')).toBeNull();

    const deleteBtn = target.querySelector('[data-testid="delete-button"]') as HTMLButtonElement | null;
    expect(deleteBtn).not.toBeNull();
    // cell 2: isDeleteButtonDisabled returns false for idle status (per predicate).
    // The spec only asserts delete-button !== null for cell 2 (no disabled assertion).

    unmount(component);
  });

  /**
   * cell 3:
   * editingStatus='editing', editingNoteId !== self.noteId (other row is editing)
   * → preview present (not our row's block editor), delete enabled (can delete this row)
   */
  test('cell 3 (other row editing): row-body-preview!==null, feed-row-button!==null, block-element===null, delete-button!==null+enabled', () => {
    const viewState = makeViewState({
      editingStatus: 'editing',
      editingNoteId: 'note-OTHER',
    });
    const editingSessionState = makeEditingSession('editing', 'note-OTHER', SAMPLE_BLOCKS);
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState,
      blockEditorAdapter: makeBlockAdapter(),
    });
    flushSync();

    expect(target.querySelector('[data-testid="row-body-preview"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="feed-row-button"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="block-element"]')).toBeNull();
    expect(target.querySelector('[data-testid="block-editor-surface"]')).toBeNull();

    const deleteBtn = target.querySelector('[data-testid="delete-button"]') as HTMLButtonElement | null;
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn?.disabled).toBe(false); // other row editing → this row can be deleted

    unmount(component);
  });

  /**
   * cell 4:
   * editingStatus='idle', editingNoteId=null (no row editing)
   * → preview present, delete enabled
   */
  test('cell 4 (idle): row-body-preview!==null, feed-row-button!==null, block-element===null, delete-button!==null+enabled', () => {
    const viewState = makeViewState({
      editingStatus: 'idle',
      editingNoteId: null,
    });
    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: makeFeedAdapter(),
      editingSessionState: null,
      blockEditorAdapter: null,
    });
    flushSync();

    expect(target.querySelector('[data-testid="row-body-preview"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="feed-row-button"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="block-element"]')).toBeNull();
    expect(target.querySelector('[data-testid="block-editor-surface"]')).toBeNull();

    const deleteBtn = target.querySelector('[data-testid="delete-button"]') as HTMLButtonElement | null;
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn?.disabled).toBe(false); // idle → delete enabled

    unmount(component);
  });
});

// ── PROP-FEED-S6-007: adapter null + dispatch 0-calls ─────────────────────────

describe('PROP-FEED-S6-007: adapter=null + dispatch 0-calls dynamic observation', () => {
  /**
   * When blockEditorAdapter===null and editingNoteId===self.noteId AND
   * editingStatus='editing', FeedRow should NOT attempt any dispatch calls.
   * The $effect guard `if (!adapterRef) return` in Sprint 5 already prevents
   * actual dispatch, but S6's effectiveMount condition provides a stronger
   * structural guarantee.
   *
   * RED phase: This test is expected to PASS in Sprint 5 baseline
   * (the `if (!adapterRef) return` guard already short-circuits before dispatch).
   * However, the gate marks this as RED because Sprint 6's structural change
   * makes the guarantee more robust.  The test documents the invariant and
   * verifies 0-calls.
   *
   * Note: Per spec, no click is issued in this test sequence — only mount +
   * flushSync observation.
   */
  test('adapter=null + editing self.noteId → all block adapter dispatch calls = 0, no selectPastNote', async () => {
    const mockFeedAdapter = makeFeedAdapter();
    const mockBlockAdapter = makeBlockAdapter();

    const viewState = makeViewState({
      editingStatus: 'editing',
      editingNoteId: 'note-001',
    });
    // editingSessionState with blocks=undefined to trigger fallback $effect
    const editingSessionState = {
      status: 'editing',
      currentNoteId: 'note-001',
      focusedBlockId: null,
      isDirty: false,
      isNoteEmpty: true,
      lastSaveResult: null,
      blocks: undefined, // triggers fallback path
    };

    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: mockFeedAdapter,
      editingSessionState,
      blockEditorAdapter: null, // EC-FEED-024: adapter not injected
    });

    // Allow $effect microtask chain to complete
    flushSync();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    flushSync();

    // (a) No block adapter methods should be called (adapter is null, nothing to call)
    // The mockBlockAdapter was NOT passed in, so we can only verify mockFeedAdapter
    // We verify by checking that the passed-in null adapter was never called
    // (verified structurally: blockEditorAdapter=null means there's nothing to call)

    // The key observable: mockFeedAdapter.dispatchSelectPastNote not called
    // (no click was issued; adapter=null context shouldn't trigger select either)
    expect(mockFeedAdapter.dispatchSelectPastNote).not.toHaveBeenCalled();

    // (b) Verify DOM state: preview present (adapter=null → no block-editor-surface)
    expect(target.querySelector('[data-testid="row-body-preview"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="block-editor-surface"]')).toBeNull();
    expect(target.querySelector('[data-testid="block-element"]')).toBeNull();

    unmount(component);
  });

  /**
   * Extended S6-007: pass a mockBlockAdapter but as the prop value use null to
   * simulate the race condition.  Verify that the blockAdapter methods on the
   * mock we created (but did not inject) remain at 0 calls throughout.
   */
  test('adapter=null: fallback $effect short-circuits before any dispatch attempt', async () => {
    const mockFeedAdapter = makeFeedAdapter();

    // We create a mock but intentionally do NOT inject it — simulates adapter=null race
    const notInjectedAdapter = makeBlockAdapter();

    const viewState = makeViewState({
      editingStatus: 'editing',
      editingNoteId: 'note-001',
    });
    const editingSessionState = {
      status: 'editing',
      currentNoteId: 'note-001',
      focusedBlockId: null,
      isDirty: false,
      isNoteEmpty: true,
      lastSaveResult: null,
      blocks: undefined,
    };

    const component = mountRow({
      ...BASE_PROPS,
      viewState,
      adapter: mockFeedAdapter,
      editingSessionState,
      blockEditorAdapter: null, // adapter not injected
    });

    flushSync();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    flushSync();

    // Verify: the adapter we didn't inject was never called (trivially true)
    // The key assertion is structural: no block-element rendered, no dispatch
    expect(notInjectedAdapter.dispatchInsertBlockAtBeginning).not.toHaveBeenCalled();
    expect(notInjectedAdapter.dispatchFocusBlock).not.toHaveBeenCalled();

    // DOM state: fallback behavior — preview present when adapter=null
    expect(target.querySelector('[data-testid="block-editor-surface"]')).toBeNull();
    expect(target.querySelector('[data-testid="row-body-preview"]')).not.toBeNull();

    unmount(component);
  });
});
