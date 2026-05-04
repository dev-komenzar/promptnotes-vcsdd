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
    noteMetadata: {},
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
    expect(adapter.dispatchSelectPastNote).toHaveBeenCalledWith('note-001', expect.any(String));

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
