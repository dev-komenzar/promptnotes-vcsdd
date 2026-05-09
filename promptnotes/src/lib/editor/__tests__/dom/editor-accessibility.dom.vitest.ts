/**
 * editor-accessibility.dom.vitest.ts — Integration tests (vitest + jsdom + Svelte 5 mount API)
 *
 * Sprint 7 Red phase. Tests FAIL because editor components do not exist yet.
 *
 * Coverage:
 *   PROP-EDIT-044 (NFR-EDIT-001, NFR-EDIT-002):
 *     - All interactive elements have non-negative tabIndex when enabled
 *     - Saving indicator has role=status
 *     - Banner has role=alert
 *     - aria-disabled=true on disabled buttons
 *     - Focus ring on interactive elements
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { EditorIpcAdapter, EditingSessionStateDto, SaveError } from '$lib/editor/types';
import EditorPanel from '$lib/editor/EditorPanel.svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

function createMockAdapter() {
  let _stateHandler: ((s: EditingSessionStateDto) => void) | null = null;
  return {
    dispatchFocusBlock: vi.fn().mockResolvedValue(undefined),
    dispatchEditBlockContent: vi.fn().mockResolvedValue(undefined),
    dispatchInsertBlockAfter: vi.fn().mockResolvedValue(undefined),
    dispatchInsertBlockAtBeginning: vi.fn().mockResolvedValue(undefined),
    dispatchRemoveBlock: vi.fn().mockResolvedValue(undefined),
    dispatchMergeBlocks: vi.fn().mockResolvedValue(undefined),
    dispatchSplitBlock: vi.fn().mockResolvedValue(undefined),
    dispatchChangeBlockType: vi.fn().mockResolvedValue(undefined),
    dispatchMoveBlock: vi.fn().mockResolvedValue(undefined),
    dispatchTriggerIdleSave: vi.fn().mockResolvedValue(undefined),
    dispatchTriggerBlurSave: vi.fn().mockResolvedValue(undefined),
    dispatchRetrySave: vi.fn().mockResolvedValue(undefined),
    dispatchDiscardCurrentSession: vi.fn().mockResolvedValue(undefined),
    dispatchCancelSwitch: vi.fn().mockResolvedValue(undefined),
    dispatchCopyNoteBody: vi.fn().mockResolvedValue(undefined),
    dispatchRequestNewNote: vi.fn().mockResolvedValue(undefined),
    subscribeToState: vi.fn((handler: (s: EditingSessionStateDto) => void) => {
      _stateHandler = handler;
      return () => { _stateHandler = null; };
    }),
    _emitState(state: EditingSessionStateDto) {
      if (_stateHandler) _stateHandler(state);
    },
  };
}

let target: HTMLDivElement;
let adapter: ReturnType<typeof createMockAdapter>;
let component: ReturnType<typeof mount> | null = null;

const FS_PERMISSION_ERROR: SaveError = { kind: 'fs', reason: { kind: 'permission' } };

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  adapter = createMockAdapter();
  component = mount(EditorPanel, {
    target,
    props: {
      adapter,
      initialBlocks: [{ id: 'block-1', type: 'paragraph', content: 'test' }],
    },
  });
  flushSync();
});

afterEach(() => {
  if (component) { unmount(component); component = null; }
  target.remove();
  vi.clearAllMocks();
});

// ── PROP-EDIT-044 (NFR-EDIT-001): Keyboard reachability ────────────────────────

describe('Keyboard reachability (PROP-EDIT-044, NFR-EDIT-001)', () => {
  test('NFR-EDIT-001: block elements have non-negative tabIndex when enabled', () => {
    adapter._emitState({
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
    });
    flushSync();
    const blockEls = target.querySelectorAll('[data-testid="block-element"]');
    expect(blockEls.length).toBeGreaterThan(0); // FAILS: no component rendered
    blockEls.forEach(el => {
      const tabIndex = parseInt(el.getAttribute('tabindex') ?? '0', 10);
      expect(tabIndex).toBeGreaterThanOrEqual(0);
    });
  });

  test('NFR-EDIT-001: copy button is keyboard-reachable (tabIndex >= 0) when enabled', () => {
    adapter._emitState({
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
    });
    flushSync();
    const btn = target.querySelector('[data-testid="copy-body-button"]');
    expect(btn).not.toBeNull(); // FAILS
    const tabIndex = parseInt(btn?.getAttribute('tabindex') ?? '0', 10);
    expect(tabIndex).toBeGreaterThanOrEqual(0);
  });

  test('NFR-EDIT-001: new-note button is keyboard-reachable when enabled', () => {
    adapter._emitState({
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
    });
    flushSync();
    const btn = target.querySelector('[data-testid="new-note-button"]');
    expect(btn).not.toBeNull(); // FAILS
    const tabIndex = parseInt(btn?.getAttribute('tabindex') ?? '0', 10);
    expect(tabIndex).toBeGreaterThanOrEqual(0);
  });
});

// ── PROP-EDIT-044 (NFR-EDIT-002): ARIA roles and live regions ─────────────────

describe('ARIA roles and live regions (PROP-EDIT-044, NFR-EDIT-002)', () => {
  test('NFR-EDIT-002: save indicator has role=status in saving state', () => {
    adapter._emitState({
      status: 'saving',
      currentNoteId: 'note-1',
      isNoteEmpty: false,
    });
    flushSync();
    const indicator = target.querySelector('[role="status"]');
    expect(indicator).not.toBeNull(); // FAILS
  });

  test('NFR-EDIT-002: banner has role=alert in save-failed state', () => {
    adapter._emitState({
      status: 'save-failed',
      currentNoteId: 'note-1',
      priorFocusedBlockId: 'block-1',
      pendingNextFocus: null,
      lastSaveError: FS_PERMISSION_ERROR,
      isNoteEmpty: false,
    });
    flushSync();
    const banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).not.toBeNull(); // FAILS
    expect(banner?.getAttribute('role')).toBe('alert');
  });

  test('NFR-EDIT-002: no interactive element uses tabIndex=-1 while enabled', () => {
    adapter._emitState({
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
    });
    flushSync();
    const interactive = target.querySelectorAll('button:not([disabled]), [contenteditable="true"]');
    expect(interactive.length).toBeGreaterThan(0); // FAILS
    interactive.forEach(el => {
      const tabIndex = parseInt(el.getAttribute('tabindex') ?? '0', 10);
      expect(tabIndex).not.toBe(-1);
    });
  });

  test('NFR-EDIT-002: disabled buttons have aria-disabled=true', () => {
    adapter._emitState({ status: 'idle' });
    flushSync();
    const copyBtn = target.querySelector('[data-testid="copy-body-button"][disabled]');
    expect(copyBtn).not.toBeNull(); // FAILS
    expect(copyBtn?.getAttribute('aria-disabled')).toBe('true');
  });

  test('NFR-EDIT-001: retry, discard, cancel buttons in save-failed state are keyboard-reachable', () => {
    adapter._emitState({
      status: 'save-failed',
      currentNoteId: 'note-1',
      priorFocusedBlockId: 'block-1',
      pendingNextFocus: null,
      lastSaveError: FS_PERMISSION_ERROR,
      isNoteEmpty: false,
    });
    flushSync();
    const retryBtn = target.querySelector('[data-testid="retry-save-button"]');
    const discardBtn = target.querySelector('[data-testid="discard-session-button"]');
    const cancelBtn = target.querySelector('[data-testid="cancel-switch-button"]');
    expect(retryBtn).not.toBeNull();   // FAILS
    expect(discardBtn).not.toBeNull(); // FAILS
    expect(cancelBtn).not.toBeNull();  // FAILS
    [retryBtn, discardBtn, cancelBtn].forEach(btn => {
      const tabIndex = parseInt(btn?.getAttribute('tabindex') ?? '0', 10);
      expect(tabIndex).toBeGreaterThanOrEqual(0);
    });
  });
});
