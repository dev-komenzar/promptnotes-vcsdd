/**
 * save-failure-banner.dom.vitest.ts — Integration tests (vitest + jsdom + Svelte 5 mount API)
 *
 * Sprint 7 Red phase. Tests FAIL because SaveFailureBanner.svelte does not exist yet.
 *
 * Coverage:
 *   PROP-EDIT-016 (REQ-EDIT-027): Retry button dispatches RetrySave
 *   PROP-EDIT-017 (REQ-EDIT-028): Discard button dispatches DiscardCurrentSession
 *   PROP-EDIT-018 (REQ-EDIT-029): Cancel button dispatches CancelSwitch
 *   PROP-EDIT-019 (REQ-EDIT-030, NFR-EDIT-007): Banner visual style (5-layer shadow, #dd5b00 accent)
 *   PROP-EDIT-041 (REQ-EDIT-025): Banner present iff status=save-failed; role=alert
 *   PROP-EDIT-049 (EC-EDIT-004): DiscardCurrentSession regardless of in-flight save
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

const SAVE_FAILED_STATE: EditingSessionStateDto = {
  status: 'save-failed',
  currentNoteId: 'note-1',
  priorFocusedBlockId: 'block-1',
  pendingNextFocus: null,
  lastSaveError: FS_PERMISSION_ERROR,
  isNoteEmpty: false,
};

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  adapter = createMockAdapter();
  component = mount(EditorPanel, { target, props: { adapter } });
  flushSync();
});

afterEach(() => {
  if (component) { unmount(component); component = null; }
  target.remove();
  vi.clearAllMocks();
});

// ── PROP-EDIT-041 (REQ-EDIT-025): Banner presence and role ───────────────────

describe('Banner presence (PROP-EDIT-041, REQ-EDIT-025)', () => {
  test('REQ-EDIT-025: banner is present iff status=save-failed', () => {
    adapter._emitState(SAVE_FAILED_STATE);
    flushSync();
    const banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).not.toBeNull(); // FAILS: no component rendered
  });

  test('REQ-EDIT-025: banner is absent when status=editing', () => {
    adapter._emitState({
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
    });
    flushSync();
    const banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).toBeNull();
  });

  test('REQ-EDIT-025: banner has role=alert', () => {
    adapter._emitState(SAVE_FAILED_STATE);
    flushSync();
    const banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).not.toBeNull(); // FAILS
    expect(banner?.getAttribute('role')).toBe('alert');
  });

  test('REQ-EDIT-025: banner has data-testid=save-failure-banner', () => {
    adapter._emitState(SAVE_FAILED_STATE);
    flushSync();
    expect(target.querySelector('[data-testid="save-failure-banner"]')).not.toBeNull(); // FAILS
  });
});

// ── PROP-EDIT-016 (REQ-EDIT-027): Retry button ────────────────────────────────

describe('Retry button (PROP-EDIT-016, REQ-EDIT-027)', () => {
  test('REQ-EDIT-027: retry-save-button is labeled 再試行', () => {
    adapter._emitState(SAVE_FAILED_STATE);
    flushSync();
    const btn = target.querySelector('[data-testid="retry-save-button"]');
    expect(btn).not.toBeNull(); // FAILS
    expect(btn?.textContent).toContain('再試行');
  });

  test('REQ-EDIT-027: clicking retry-save-button dispatches RetrySave exactly once', () => {
    adapter._emitState(SAVE_FAILED_STATE);
    flushSync();
    const btn = target.querySelector('[data-testid="retry-save-button"]');
    expect(btn).not.toBeNull(); // FAILS
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchRetrySave).toHaveBeenCalledTimes(1);
  });

  test('REQ-EDIT-027: after retry dispatch, banner hides when saving snapshot arrives', () => {
    adapter._emitState(SAVE_FAILED_STATE);
    flushSync();
    const btn = target.querySelector('[data-testid="retry-save-button"]');
    expect(btn).not.toBeNull(); // FAILS
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    adapter._emitState({ status: 'saving', currentNoteId: 'note-1', isNoteEmpty: false });
    flushSync();
    expect(target.querySelector('[data-testid="save-failure-banner"]')).toBeNull(); // FAILS
  });
});

// ── PROP-EDIT-017 (REQ-EDIT-028): Discard button ─────────────────────────────

describe('Discard button (PROP-EDIT-017, REQ-EDIT-028)', () => {
  test('REQ-EDIT-028: discard-session-button is labeled 変更を破棄', () => {
    adapter._emitState(SAVE_FAILED_STATE);
    flushSync();
    const btn = target.querySelector('[data-testid="discard-session-button"]');
    expect(btn).not.toBeNull(); // FAILS
    expect(btn?.textContent).toContain('変更を破棄');
  });

  test('REQ-EDIT-028: clicking discard-session-button dispatches DiscardCurrentSession exactly once', () => {
    adapter._emitState(SAVE_FAILED_STATE);
    flushSync();
    const btn = target.querySelector('[data-testid="discard-session-button"]');
    expect(btn).not.toBeNull(); // FAILS
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchDiscardCurrentSession).toHaveBeenCalledTimes(1);
  });
});

// ── PROP-EDIT-018 (REQ-EDIT-029): Cancel button ──────────────────────────────

describe('Cancel button (PROP-EDIT-018, REQ-EDIT-029)', () => {
  test('REQ-EDIT-029: cancel-switch-button is labeled 閉じる（このまま編集を続ける）', () => {
    adapter._emitState(SAVE_FAILED_STATE);
    flushSync();
    const btn = target.querySelector('[data-testid="cancel-switch-button"]');
    expect(btn).not.toBeNull(); // FAILS
    expect(btn?.textContent).toContain('閉じる（このまま編集を続ける）');
  });

  test('REQ-EDIT-029: clicking cancel-switch-button dispatches CancelSwitch exactly once', () => {
    adapter._emitState(SAVE_FAILED_STATE);
    flushSync();
    const btn = target.querySelector('[data-testid="cancel-switch-button"]');
    expect(btn).not.toBeNull(); // FAILS
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchCancelSwitch).toHaveBeenCalledTimes(1);
  });
});

// ── PROP-EDIT-019 (REQ-EDIT-030, NFR-EDIT-007): Banner visual style ──────────

describe('Banner visual style (PROP-EDIT-019, REQ-EDIT-030, NFR-EDIT-007)', () => {
  test('REQ-EDIT-030: banner uses 5-layer Deep Shadow string', () => {
    adapter._emitState(SAVE_FAILED_STATE);
    flushSync();
    const banner = target.querySelector('[data-testid="save-failure-banner"]') as HTMLElement | null;
    expect(banner).not.toBeNull(); // FAILS
    const style = banner ? window.getComputedStyle(banner) : null;
    // The 5-layer shadow literal must appear in the component source (grep-verified in Phase 5)
    // In jsdom, we check for the data attribute set by the component
    expect(banner?.getAttribute('data-shadow-applied')).toBe('deep'); // FAILS
  });

  test('REQ-EDIT-030: banner has left accent with #dd5b00', () => {
    adapter._emitState(SAVE_FAILED_STATE);
    flushSync();
    const banner = target.querySelector('[data-testid="save-failure-banner"]') as HTMLElement | null;
    expect(banner).not.toBeNull(); // FAILS
    // Color assertion via data attribute set by component (grep audit in Phase 5)
    expect(banner?.getAttribute('data-accent-color')).toBe('#dd5b00'); // FAILS
  });
});

// ── PROP-EDIT-049 (EC-EDIT-004): Discard regardless of in-flight save ─────────

describe('Discard in-flight (PROP-EDIT-049, EC-EDIT-004)', () => {
  test('EC-EDIT-004: DiscardCurrentSession propagates to adapter without UI cancellation', () => {
    adapter._emitState(SAVE_FAILED_STATE);
    flushSync();
    const btn = target.querySelector('[data-testid="discard-session-button"]');
    expect(btn).not.toBeNull(); // FAILS
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    // UI does not cancel the IPC — adapter receives it regardless
    expect(adapter.dispatchDiscardCurrentSession).toHaveBeenCalledTimes(1);
    // No cancellation call made
    expect(adapter.dispatchCancelSwitch).toHaveBeenCalledTimes(0);
  });
});
