/**
 * FeedRow.dom.vitest.ts — Integration (DOM) tests for FeedRow.svelte
 *
 * Coverage:
 *   PROP-FEED-013 (row click → dispatchSelectPastNote called 1×; disabled when saving/switching/loading)
 *   PROP-FEED-014 (disabled delete button: disabled attr + aria-disabled; no dispatch on click)
 *   PROP-FEED-015 (valid delete button click → dispatchRequestNoteDeletion 1×)
 *   PROP-FEED-016 (modal text "OS のゴミ箱")
 *   PROP-FEED-017 (Esc key → dispatchCancelNoteDeletion)
 *   PROP-FEED-018 (Backdrop click → dispatchCancelNoteDeletion)
 *   PROP-FEED-023 (pendingNextNoteId ≠ null → data-testid="pending-switch-indicator")
 *
 * REQ coverage: REQ-FEED-005, REQ-FEED-006, REQ-FEED-009, REQ-FEED-010, REQ-FEED-011
 * EC coverage: EC-FEED-002, EC-FEED-004, EC-FEED-005, EC-FEED-006, EC-FEED-013
 *
 * Sprint 3 additions:
 *   REQ-TAG-005 (ArrowUp/Down keyboard navigation in autocomplete)
 *   EC-021 (Arrow Up/Down to move through suggestions, Enter to select, Escape to close)
 *
 * RED PHASE: FeedRow.svelte renders nothing (<!-- not implemented -->) so all
 * querySelector assertions will fail (return null).
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import FeedRow from '../../FeedRow.svelte';
import type { TauriFeedAdapter } from '../../tauriFeedAdapter.js';
import type { FeedViewState } from '../../types.js';
import type { TagEntry } from '../../tagInventory.js';

// ── Mock factory ──────────────────────────────────────────────────────────────

function makeMockAdapter(): TauriFeedAdapter & Record<string, ReturnType<typeof vi.fn>> {
  return {
    dispatchSelectPastNote: vi.fn().mockResolvedValue(undefined),
    dispatchRequestNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchConfirmNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchCancelNoteDeletion: vi.fn().mockResolvedValue(undefined),
  };
}

function makeViewState(overrides: Partial<FeedViewState> = {}): FeedViewState {
  return {
    editingStatus: 'idle',
    editingNoteId: null,
    pendingNextNoteId: null,
    visibleNoteIds: ['note-001'],
    loadingStatus: 'ready',
    activeDeleteModalNoteId: null,
    lastDeletionError: null,
    noteMetadata: {}, tagAutocompleteVisibleFor: null, activeFilterTags: [], allNoteIds: [],
    ...overrides,
  };
}

const BASE_PROPS = {
  noteId: 'note-001',
  body: 'First line\nSecond line\nThird line',
  createdAt: 1746352800000,
  updatedAt: 1746352800000,
  tags: ['typescript', 'svelte'],
};

// ── Setup / teardown ──────────────────────────────────────────────────────────

let target: HTMLDivElement;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ── PROP-FEED-013: Row click → dispatchSelectPastNote ─────────────────────────

describe('PROP-FEED-013 / REQ-FEED-005: row click dispatches SelectPastNote', () => {
  test('row click in idle+ready state calls dispatchSelectPastNote 1×', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({ editingStatus: 'idle', loadingStatus: 'ready' });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const rowButton = target.querySelector('button[data-testid="feed-row-button"]') as HTMLButtonElement | null;
    expect(rowButton).not.toBeNull();
    rowButton!.click();
    flushSync();

    expect(adapter.dispatchSelectPastNote).toHaveBeenCalledTimes(1);
    // FIND-S2-05: adapter now takes (noteId, vaultPath, issuedAt).
    // FeedRow fallback path passes '' for vaultPath (unknown at this level).
    expect(adapter.dispatchSelectPastNote).toHaveBeenCalledWith('note-001', '', expect.any(String));

    unmount(app);
  });

  test('row click in saving state does NOT call dispatchSelectPastNote (EC-FEED-004)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({ editingStatus: 'saving', loadingStatus: 'ready' });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const rowButton = target.querySelector('button[data-testid="feed-row-button"]') as HTMLButtonElement | null;
    expect(rowButton).not.toBeNull();
    rowButton!.click();
    flushSync();

    expect(adapter.dispatchSelectPastNote).toHaveBeenCalledTimes(0);

    unmount(app);
  });

  test('row click in switching state does NOT call dispatchSelectPastNote (EC-FEED-005)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({ editingStatus: 'switching', loadingStatus: 'ready' });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const rowButton = target.querySelector('button[data-testid="feed-row-button"]') as HTMLButtonElement | null;
    expect(rowButton).not.toBeNull();
    rowButton!.click();
    flushSync();

    expect(adapter.dispatchSelectPastNote).toHaveBeenCalledTimes(0);

    unmount(app);
  });

  test('row in saving state has aria-disabled="true" (REQ-FEED-006)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({ editingStatus: 'saving', loadingStatus: 'ready' });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const rowButton = target.querySelector('button[data-testid="feed-row-button"]');
    expect(rowButton?.getAttribute('aria-disabled')).toBe('true');

    unmount(app);
  });

  test('row click in loading state does NOT call dispatchSelectPastNote (EC-FEED-015)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({ editingStatus: 'idle', loadingStatus: 'loading' });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const rowButton = target.querySelector('button[data-testid="feed-row-button"]') as HTMLButtonElement | null;
    expect(rowButton).not.toBeNull();
    rowButton!.click();
    flushSync();

    expect(adapter.dispatchSelectPastNote).toHaveBeenCalledTimes(0);

    unmount(app);
  });
});

// ── PROP-FEED-014: Disabled delete button ─────────────────────────────────────

describe('PROP-FEED-014 / REQ-FEED-010: disabled delete button when editing same note', () => {
  test('delete button has disabled attr and aria-disabled when editing this note (EC-FEED-006)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({ editingStatus: 'editing', editingNoteId: 'note-001' });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const deleteBtn = target.querySelector('[data-testid="delete-button"]') as HTMLButtonElement | null;
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn!.disabled).toBe(true);
    expect(deleteBtn!.getAttribute('aria-disabled')).toBe('true');

    unmount(app);
  });

  test('disabled delete button click does NOT call dispatchRequestNoteDeletion', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({ editingStatus: 'editing', editingNoteId: 'note-001' });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const deleteBtn = target.querySelector('[data-testid="delete-button"]') as HTMLButtonElement | null;
    expect(deleteBtn).not.toBeNull();
    deleteBtn!.click();
    flushSync();

    expect(adapter.dispatchRequestNoteDeletion).toHaveBeenCalledTimes(0);

    unmount(app);
  });

  test('delete button enabled when editing different note (idle noteId differs)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({ editingStatus: 'editing', editingNoteId: 'note-OTHER' });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const deleteBtn = target.querySelector('[data-testid="delete-button"]') as HTMLButtonElement | null;
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn!.disabled).toBe(false);

    unmount(app);
  });
});

// ── PROP-FEED-015: Valid delete button click ──────────────────────────────────

describe('PROP-FEED-015 / REQ-FEED-011: valid delete button click dispatches RequestNoteDeletion', () => {
  test('enabled delete button click calls dispatchRequestNoteDeletion 1× (REQ-FEED-011)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({ editingStatus: 'idle', editingNoteId: null });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const deleteBtn = target.querySelector('[data-testid="delete-button"]') as HTMLButtonElement | null;
    expect(deleteBtn).not.toBeNull();
    deleteBtn!.click();
    flushSync();

    expect(adapter.dispatchRequestNoteDeletion).toHaveBeenCalledTimes(1);
    expect(adapter.dispatchRequestNoteDeletion).toHaveBeenCalledWith('note-001', expect.any(String));

    unmount(app);
  });
});

// ── PROP-FEED-023: pending-switch-indicator ───────────────────────────────────

describe('PROP-FEED-023 / REQ-FEED-009: pending-switch-indicator when pendingNextNoteId matches', () => {
  test('pending-switch-indicator present when pendingNextNoteId === noteId and switching (EC-FEED-013)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({
      editingStatus: 'switching',
      pendingNextNoteId: 'note-001',
    });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const indicator = target.querySelector('[data-testid="pending-switch-indicator"]');
    expect(indicator).not.toBeNull();

    unmount(app);
  });

  test('pending-switch-indicator present when save-failed + pendingNextNoteId === noteId', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({
      editingStatus: 'save-failed',
      pendingNextNoteId: 'note-001',
    });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const indicator = target.querySelector('[data-testid="pending-switch-indicator"]');
    expect(indicator).not.toBeNull();

    unmount(app);
  });

  test('no pending-switch-indicator when pendingNextNoteId is null', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({ pendingNextNoteId: null });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const indicator = target.querySelector('[data-testid="pending-switch-indicator"]');
    expect(indicator).toBeNull();

    unmount(app);
  });
});

// ── DOM element presence ──────────────────────────────────────────────────────

describe('FeedRow DOM structure requirements', () => {
  test('row uses <button> element (REQ-FEED-015 / NFR-FEED-001)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState();
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const rowButton = target.querySelector('button[data-testid="feed-row-button"]');
    expect(rowButton).not.toBeNull();
    expect(rowButton?.tagName).toBe('BUTTON');

    unmount(app);
  });

  test('data-testid="row-created-at" is present (REQ-FEED-001)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState();
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const el = target.querySelector('[data-testid="row-created-at"]');
    expect(el).not.toBeNull();

    unmount(app);
  });

  test('data-testid="row-body-preview" is present (REQ-FEED-002)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState();
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const el = target.querySelector('[data-testid="row-body-preview"]');
    expect(el).not.toBeNull();

    unmount(app);
  });

  test('tag chips data-testid="tag-chip" present for each tag (REQ-FEED-003)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState();
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const chips = target.querySelectorAll('[data-testid="tag-chip"]');
    expect(chips.length).toBe(2); // typescript + svelte

    unmount(app);
  });

  test('delete button has aria-label (NFR-FEED-002)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState();
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const deleteBtn = target.querySelector('[data-testid="delete-button"]');
    expect(deleteBtn).not.toBeNull();
    const ariaLabel = deleteBtn!.getAttribute('aria-label');
    expect(ariaLabel).not.toBeNull();
    expect(ariaLabel!.length).toBeGreaterThan(0);

    unmount(app);
  });

  /**
   * FIND-007 fix: disabled delete button must convey reason via aria-label/title.
   * REQ-FEED-010 EC: 'ツールチップ: 無効化された削除ボタンには「編集を終了してから削除してください」'
   */
  test('FIND-007: disabled delete button shows explanation in aria-label and title (REQ-FEED-010 EC)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({ editingStatus: 'editing', editingNoteId: 'note-001' });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const deleteBtn = target.querySelector('[data-testid="delete-button"]');
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn!.hasAttribute('disabled')).toBe(true);

    const ariaLabel = deleteBtn!.getAttribute('aria-label');
    expect(ariaLabel).toBe('編集を終了してから削除してください');

    const title = deleteBtn!.getAttribute('title');
    expect(title).toBe('編集を終了してから削除してください');

    unmount(app);
  });

  test('enabled delete button has standard aria-label (not the disabled explanation)', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({ editingStatus: 'idle', editingNoteId: null });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const deleteBtn = target.querySelector('[data-testid="delete-button"]');
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn!.hasAttribute('disabled')).toBe(false);
    expect(deleteBtn!.getAttribute('aria-label')).toBe('削除');

    unmount(app);
  });
});

// ── FIND-006: showPendingSwitch editingStatus guard ────────────────────────────

describe('FIND-006 / REQ-FEED-009: showPendingSwitch requires editingStatus guard (defense-in-depth)', () => {
  test('NO pending-switch-indicator when editingStatus=editing even if pendingNextNoteId===noteId', () => {
    const adapter = makeMockAdapter();
    // Malformed state: pendingNextNoteId set but editingStatus is 'editing' (not switching/save-failed)
    const viewState = makeViewState({
      editingStatus: 'editing',
      pendingNextNoteId: 'note-001',
    });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const indicator = target.querySelector('[data-testid="pending-switch-indicator"]');
    expect(indicator).toBeNull();

    unmount(app);
  });

  test('NO pending-switch-indicator when editingStatus=idle even if pendingNextNoteId===noteId', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({
      editingStatus: 'idle',
      pendingNextNoteId: 'note-001',
    });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const indicator = target.querySelector('[data-testid="pending-switch-indicator"]');
    expect(indicator).toBeNull();

    unmount(app);
  });

  test('pending-switch-indicator shown when editingStatus=switching AND pendingNextNoteId===noteId', () => {
    const adapter = makeMockAdapter();
    const viewState = makeViewState({
      editingStatus: 'switching',
      pendingNextNoteId: 'note-001',
    });
    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const indicator = target.querySelector('[data-testid="pending-switch-indicator"]');
    expect(indicator).not.toBeNull();

    unmount(app);
  });
});

// ── Sprint 3: REQ-TAG-005 / EC-021 Arrow key navigation in autocomplete ───────

function makeTagInventory(overrides: Partial<TagEntry>[] = []): TagEntry[] {
  return [
    { name: 'react', usageCount: 10 },
    { name: 'redux', usageCount: 8 },
    { name: 'rest', usageCount: 5 },
    ...overrides as TagEntry[],
  ];
}

function makeViewStateWithTagInput(overrides: Partial<FeedViewState> = {}): FeedViewState {
  return {
    editingStatus: 'idle',
    editingNoteId: null,
    pendingNextNoteId: null,
    visibleNoteIds: ['note-001'],
    allNoteIds: ['note-001'],
    loadingStatus: 'ready',
    activeDeleteModalNoteId: null,
    lastDeletionError: null,
    noteMetadata: {},
    tagAutocompleteVisibleFor: 'note-001',
    activeFilterTags: [],
    ...overrides,
  };
}

const TAG_INPUT_BASE_PROPS = {
  noteId: 'note-001',
  body: 'Some content',
  createdAt: 1746352800000,
  updatedAt: 1746352800000,
  tags: ['typescript'],
};

function assertHighlightedItem(target: HTMLElement, tagName: string): void {
  const items = target.querySelectorAll('[data-testid="autocomplete-item"]');
  for (const item of items) {
    const nameEl = item.querySelector('.autocomplete-name');
    if (nameEl?.textContent === `#${tagName}`) {
      expect(item.classList.contains('autocomplete-item--highlighted')).toBe(true);
      return;
    }
  }
  throw new Error(`Item for tag "${tagName}" not found in autocomplete list`);
}

function assertNoHighlightedItem(target: HTMLElement): void {
  const items = target.querySelectorAll('[data-testid="autocomplete-item"]');
  for (const item of items) {
    expect(item.classList.contains('autocomplete-item--highlighted')).toBe(false);
  }
}

function fireKeydown(targetEl: Element, key: string, options: Partial<KeyboardEventInit> = {}): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  targetEl.dispatchEvent(event);
}

async function setupTagInputWithSuggestions(
  overrides: { text?: string; inventory?: TagEntry[]; viewState?: Partial<FeedViewState> } = {},
) {
  const adapter = makeMockAdapter();
  const tagInventory = overrides.inventory ?? makeTagInventory();
  const viewState = makeViewStateWithTagInput(overrides.viewState ?? {});
  const onTagInputCommit = vi.fn();
  const onTagInputCancel = vi.fn();

  const app = mount(FeedRow, {
    target,
    props: {
      ...TAG_INPUT_BASE_PROPS,
      viewState,
      adapter,
      tagInventory,
      onTagInputCommit,
      onTagInputCancel,
      onTagRemove: vi.fn(),
      onTagAddClick: vi.fn(),
    },
  });
  flushSync();

  const input = target.querySelector('[data-testid="tag-input"]') as HTMLInputElement | null;
  expect(input).not.toBeNull();

  // Type text to show autocomplete suggestions
  const text = overrides.text ?? 're';
  input!.value = text;
  input!.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();

  return { adapter, onTagInputCommit, onTagInputCancel, input, app };
}

describe('REQ-TAG-005 / EC-021: Arrow key navigation in autocomplete', () => {
  test('ArrowDown highlights the first suggestion', async () => {
    const { input } = await setupTagInputWithSuggestions();

    fireKeydown(input!, 'ArrowDown');
    flushSync();

    assertHighlightedItem(target, 'react');
  });

  test('ArrowDown twice highlights the second suggestion', async () => {
    const { input } = await setupTagInputWithSuggestions();

    fireKeydown(input!, 'ArrowDown');
    flushSync();
    fireKeydown(input!, 'ArrowDown');
    flushSync();

    assertHighlightedItem(target, 'redux');
  });

  test('ArrowDown wraps to first after last suggestion', async () => {
    const { input } = await setupTagInputWithSuggestions();

    // Go to last suggestion
    fireKeydown(input!, 'ArrowDown');
    flushSync();
    fireKeydown(input!, 'ArrowDown');
    flushSync();
    fireKeydown(input!, 'ArrowDown');
    flushSync();

    assertHighlightedItem(target, 'rest');

    // One more ArrowDown wraps to first
    fireKeydown(input!, 'ArrowDown');
    flushSync();

    assertHighlightedItem(target, 'react');
  });

  test('ArrowDown continues to wrap correctly across multiple full cycles', async () => {
    const { input } = await setupTagInputWithSuggestions();

    // Cycle to last
    for (let i = 0; i < 3; i++) { fireKeydown(input!, 'ArrowDown'); flushSync(); }
    // Wrap to first
    fireKeydown(input!, 'ArrowDown'); flushSync();

    assertHighlightedItem(target, 'react');

    // Cycle to last again
    for (let i = 0; i < 2; i++) { fireKeydown(input!, 'ArrowDown'); flushSync(); }
    assertHighlightedItem(target, 'rest');

    // Wrap to first again
    fireKeydown(input!, 'ArrowDown'); flushSync();
    assertHighlightedItem(target, 'react');
  });

  test('ArrowUp highlights the last suggestion when no highlight', async () => {
    const { input } = await setupTagInputWithSuggestions();

    fireKeydown(input!, 'ArrowUp');
    flushSync();

    assertHighlightedItem(target, 'rest');
  });

  test('ArrowUp after ArrowDown moves highlight back', async () => {
    const { input } = await setupTagInputWithSuggestions();

    fireKeydown(input!, 'ArrowDown');
    flushSync();
    fireKeydown(input!, 'ArrowDown');
    flushSync();

    assertHighlightedItem(target, 'redux');

    fireKeydown(input!, 'ArrowUp');
    flushSync();

    assertHighlightedItem(target, 'react');
  });

  test('ArrowUp from first wraps to last', async () => {
    const { input } = await setupTagInputWithSuggestions();

    fireKeydown(input!, 'ArrowDown');
    flushSync();
    assertHighlightedItem(target, 'react');

    fireKeydown(input!, 'ArrowUp');
    flushSync();
    assertHighlightedItem(target, 'rest');
  });

  test('Enter without highlight commits typed text (existing behavior)', async () => {
    const { input, onTagInputCommit } = await setupTagInputWithSuggestions({ text: 'redux' });

    fireKeydown(input!, 'Enter');
    flushSync();

    expect(onTagInputCommit).toHaveBeenCalledWith('note-001', 'redux');
  });

  test('Enter with highlighted suggestion selects that suggestion', async () => {
    const { input, onTagInputCommit } = await setupTagInputWithSuggestions();

    fireKeydown(input!, 'ArrowDown');
    flushSync();
    fireKeydown(input!, 'ArrowDown');
    flushSync();

    assertHighlightedItem(target, 'redux');

    fireKeydown(input!, 'Enter');
    flushSync();

    expect(onTagInputCommit).toHaveBeenCalledWith('note-001', 'redux');
  });

  test('Escape closes input (already working, regression guard)', async () => {
    const { input, onTagInputCancel } = await setupTagInputWithSuggestions();

    fireKeydown(input!, 'Escape');
    flushSync();

    expect(onTagInputCancel).toHaveBeenCalled();
  });

  test('Arrow keys do nothing when autocomplete list is empty', async () => {
    const { input } = await setupTagInputWithSuggestions({ text: 'zzzz', inventory: [] });

    // No autocomplete list visible
    const list = target.querySelector('[data-testid="autocomplete-list"]');
    expect(list).toBeNull();

    // ArrowDown should not throw
    fireKeydown(input!, 'ArrowDown');
    flushSync();

    // Still no list
    expect(target.querySelector('[data-testid="autocomplete-list"]')).toBeNull();

    // ArrowUp should not throw
    fireKeydown(input!, 'ArrowUp');
    flushSync();

    expect(target.querySelector('[data-testid="autocomplete-list"]')).toBeNull();
  });

  test('highlight resets when input text changes', async () => {
    const { input } = await setupTagInputWithSuggestions();

    fireKeydown(input!, 'ArrowDown');
    flushSync();
    assertHighlightedItem(target, 'react');

    // Change input text
    input!.value = 'res';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    assertNoHighlightedItem(target);
  });

  test('clicking a suggestion selects it and clears highlight', async () => {
    const { input, onTagInputCommit } = await setupTagInputWithSuggestions();

    // Highlight via keyboard first
    fireKeydown(input!, 'ArrowDown');
    flushSync();
    assertHighlightedItem(target, 'react');

    // Click the second suggestion
    const items = target.querySelectorAll('[data-testid="autocomplete-item"]');
    expect(items.length).toBe(3);
    (items[1] as HTMLButtonElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    flushSync();

    expect(onTagInputCommit).toHaveBeenCalledWith('note-001', 'redux');
  });
});

// ── Sprint 4 PROP-FEED-S4-015 / REQ-FEED-026 ────────────────────────────────
//
// PROP-FEED-S4-015: DOM integration test for pendingNextFocus?.noteId === noteId.
//
// FeedRow must show data-testid="pending-switch-indicator" when:
//   viewState.pendingNextFocus?.noteId === noteId AND
//   editingStatus ∈ {'switching', 'save-failed'}
//
// RED: FeedViewState currently has pendingNextNoteId (string | null), not
// pendingNextFocus ({ noteId, blockId } | null). The makeViewState helper
// must be updated to pass pendingNextFocus — which does not exist in the
// current type definition → type errors.
//
// We use @ts-expect-error to suppress type errors and reach the assertion.

describe('PROP-FEED-S4-015 / REQ-FEED-026: showPendingSwitch uses pendingNextFocus?.noteId (Sprint 4 RED)', () => {
  function makeViewStateS4(overrides: object = {}): FeedViewState {
    // @ts-expect-error — pendingNextFocus does not exist in FeedViewState yet.
    // FeedViewState currently has pendingNextNoteId. Phase 2b will rename.
    return {
      editingStatus: 'idle' as const,
      editingNoteId: null,
      // @ts-expect-error
      pendingNextFocus: null,
      visibleNoteIds: ['note-001'],
      allNoteIds: ['note-001'],
      loadingStatus: 'ready' as const,
      activeDeleteModalNoteId: null,
      lastDeletionError: null,
      noteMetadata: {},
      tagAutocompleteVisibleFor: null,
      activeFilterTags: [],
      searchQuery: '',
      sortDirection: 'desc' as const,
      ...overrides,
    };
  }

  test('PROP-FEED-S4-015a: pending-switch-indicator present when pendingNextFocus.noteId===noteId + switching', () => {
    const adapter = makeMockAdapter();
    // @ts-expect-error — pendingNextFocus field does not exist in FeedViewState yet
    const viewState = makeViewStateS4({
      editingStatus: 'switching',
      // @ts-expect-error
      pendingNextFocus: { noteId: 'note-001', blockId: 'block-x' },
    });

    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const indicator = target.querySelector('[data-testid="pending-switch-indicator"]');
    // This assertion will FAIL because FeedRow still reads pendingNextNoteId (old field).
    expect(indicator).not.toBeNull();

    unmount(app);
  });

  test('PROP-FEED-S4-015b: pending-switch-indicator present when pendingNextFocus.noteId===noteId + save-failed', () => {
    const adapter = makeMockAdapter();
    // @ts-expect-error — pendingNextFocus field does not exist in FeedViewState yet
    const viewState = makeViewStateS4({
      editingStatus: 'save-failed',
      // @ts-expect-error
      pendingNextFocus: { noteId: 'note-001', blockId: 'block-y' },
    });

    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const indicator = target.querySelector('[data-testid="pending-switch-indicator"]');
    // RED: FeedRow uses pendingNextNoteId, not pendingNextFocus → indicator will be null
    expect(indicator).not.toBeNull();

    unmount(app);
  });

  test('PROP-FEED-S4-015c: NO pending-switch-indicator when pendingNextFocus.noteId !== noteId', () => {
    const adapter = makeMockAdapter();
    // @ts-expect-error — pendingNextFocus field does not exist in FeedViewState yet
    const viewState = makeViewStateS4({
      editingStatus: 'switching',
      // @ts-expect-error
      pendingNextFocus: { noteId: 'note-OTHER', blockId: 'block-z' },
    });

    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const indicator = target.querySelector('[data-testid="pending-switch-indicator"]');
    expect(indicator).toBeNull();

    unmount(app);
  });

  test('PROP-FEED-S4-015d: NO pending-switch-indicator when pendingNextFocus is null', () => {
    const adapter = makeMockAdapter();
    // @ts-expect-error — pendingNextFocus field does not exist in FeedViewState yet
    const viewState = makeViewStateS4({
      editingStatus: 'switching',
      // @ts-expect-error
      pendingNextFocus: null,
    });

    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    const indicator = target.querySelector('[data-testid="pending-switch-indicator"]');
    expect(indicator).toBeNull();

    unmount(app);
  });

  test('PROP-FEED-S4-015e: blockId is carried in viewState but noteId drives the FeedRow display predicate', () => {
    // Regression guard: blockId must be in state but NOT affect the FeedRow indicator predicate.
    // Only noteId should be compared against the row's noteId prop.
    const adapter = makeMockAdapter();
    // @ts-expect-error — pendingNextFocus field does not exist in FeedViewState yet
    const viewState = makeViewStateS4({
      editingStatus: 'switching',
      // @ts-expect-error
      pendingNextFocus: { noteId: 'note-001', blockId: 'any-block-id-doesnt-matter' },
    });

    const app = mount(FeedRow, { target, props: { ...BASE_PROPS, viewState, adapter } });
    flushSync();

    // The indicator should appear based on noteId match alone, regardless of blockId value.
    const indicator = target.querySelector('[data-testid="pending-switch-indicator"]');
    // RED: FeedRow uses pendingNextNoteId — will be null
    expect(indicator).not.toBeNull();

    unmount(app);
  });
});
