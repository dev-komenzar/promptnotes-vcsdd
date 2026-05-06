/**
 * editor-panel.dom.vitest.ts — Integration tests (vitest + jsdom + Svelte 5 mount API)
 *
 * Sprint 7 Red phase. Tests FAIL because EditorPanel.svelte does not exist yet.
 * Pattern: mount a placeholder div, simulate events, assert on a mock adapter.
 * The mock adapter calls never happen from the placeholder — every test fails.
 *
 * Coverage:
 *   PROP-EDIT-020 (REQ-EDIT-031): Copy button dispatches CopyNoteBody
 *   PROP-EDIT-021 (REQ-EDIT-032): Copy button disabled state matrix
 *   PROP-EDIT-022 (REQ-EDIT-033): +新規 click dispatches RequestNewNote
 *   PROP-EDIT-023 (REQ-EDIT-034): Ctrl+N scoped to editor pane root
 *   PROP-EDIT-024a (REQ-EDIT-035): editing+dirty → TriggerBlurSave before RequestNewNote
 *   PROP-EDIT-024b (REQ-EDIT-035, EC-EDIT-008): save-failed → RequestNewNote direct
 *   PROP-EDIT-024c (REQ-EDIT-035): editing+clean → RequestNewNote direct
 *   PROP-EDIT-032 (REQ-EDIT-014, REQ-EDIT-016, EC-EDIT-002, EC-EDIT-006): blur save logic
 *   PROP-EDIT-033 (REQ-EDIT-012, REQ-EDIT-013, EC-EDIT-001, EC-EDIT-009): idle debounce
 *   PROP-EDIT-045 (NFR-EDIT-003, NFR-EDIT-004, EC-EDIT-009): single timer handle
 *   PROP-EDIT-051 (REQ-EDIT-036): new note auto-focuses first block
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { EditorIpcAdapter, EditingSessionStateDto, EditorViewState } from '$lib/editor/types';
import { IDLE_SAVE_DEBOUNCE_MS } from '$lib/editor/types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

// ── Mock adapter factory ───────────────────────────────────────────────────────

function createMockAdapter(): EditorIpcAdapter & Record<string, ReturnType<typeof vi.fn>> {
  let _stateHandler: ((s: EditingSessionStateDto) => void) | null = null;
  const adapter = {
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
    _emitState: (state: EditingSessionStateDto) => {
      if (_stateHandler) _stateHandler(state);
    },
  } as unknown as EditorIpcAdapter & Record<string, ReturnType<typeof vi.fn>>;
  return adapter;
}

// ── Placeholder component setup ────────────────────────────────────────────────

let target: HTMLDivElement;
let adapter: ReturnType<typeof createMockAdapter>;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  adapter = createMockAdapter();
});

afterEach(() => {
  target.remove();
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ── PROP-EDIT-020 (REQ-EDIT-031): Copy button dispatches CopyNoteBody ──────────

describe('Copy button (PROP-EDIT-020, REQ-EDIT-031)', () => {
  test('REQ-EDIT-031: copy-body-button click dispatches CopyNoteBody when canCopy=true', () => {
    // Placeholder: no EditorPanel.svelte yet — test fails because button not found
    const btn = target.querySelector('[data-testid="copy-body-button"]');
    expect(btn).not.toBeNull(); // FAILS: placeholder div has no such button
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(adapter.dispatchCopyNoteBody).toHaveBeenCalledTimes(1);
  });

  test('REQ-EDIT-031: copy-body-button does not dispatch when canCopy=false', () => {
    const btn = target.querySelector('[data-testid="copy-body-button"]');
    expect(btn).not.toBeNull(); // FAILS
    expect(adapter.dispatchCopyNoteBody).toHaveBeenCalledTimes(0);
  });
});

// ── PROP-EDIT-021 (REQ-EDIT-032): Copy button disabled state matrix ─────────────

describe('Copy button disabled matrix (PROP-EDIT-021, REQ-EDIT-032)', () => {
  test('REQ-EDIT-032: copy button has disabled and aria-disabled in idle state', () => {
    const btn = target.querySelector('[data-testid="copy-body-button"]');
    expect(btn).not.toBeNull(); // FAILS
    expect(btn?.hasAttribute('disabled')).toBe(true);
    expect(btn?.getAttribute('aria-disabled')).toBe('true');
  });

  test('REQ-EDIT-032: copy button has disabled and aria-disabled in switching state', () => {
    const btn = target.querySelector('[data-testid="copy-body-button"]');
    expect(btn).not.toBeNull(); // FAILS
    expect(btn?.hasAttribute('disabled')).toBe(true);
  });

  test('REQ-EDIT-032: copy button has disabled when isNoteEmpty=true in editing state', () => {
    const btn = target.querySelector('[data-testid="copy-body-button"]');
    expect(btn).not.toBeNull(); // FAILS
    expect(btn?.hasAttribute('disabled')).toBe(true);
  });
});

// ── PROP-EDIT-022 (REQ-EDIT-033): +新規 click dispatches RequestNewNote ─────────

describe('New Note button (PROP-EDIT-022, REQ-EDIT-033)', () => {
  test('REQ-EDIT-033: new-note-button click dispatches RequestNewNote with source=explicit-button', () => {
    const btn = target.querySelector('[data-testid="new-note-button"]');
    expect(btn).not.toBeNull(); // FAILS
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'explicit-button' })
    );
  });

  test('REQ-EDIT-033: new-note-button is disabled only in switching state', () => {
    const btn = target.querySelector('[data-testid="new-note-button"]');
    expect(btn).not.toBeNull(); // FAILS
    expect(btn?.hasAttribute('disabled')).toBe(true);
  });
});

// ── PROP-EDIT-023 (REQ-EDIT-034): Ctrl+N scoped to editor pane root ─────────────

describe('Ctrl+N shortcut (PROP-EDIT-023, REQ-EDIT-034)', () => {
  test('REQ-EDIT-034: Ctrl+N within editor pane root dispatches RequestNewNote with source=ctrl-N', () => {
    const paneRoot = target.querySelector('[data-testid="editor-pane-root"]');
    expect(paneRoot).not.toBeNull(); // FAILS
    const event = new KeyboardEvent('keydown', {
      key: 'n', ctrlKey: true, bubbles: true, cancelable: true,
    });
    paneRoot?.dispatchEvent(event);
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'ctrl-N' })
    );
  });

  test('REQ-EDIT-034: Ctrl+N on document (outside editor pane) does NOT dispatch', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true }));
    expect(adapter.dispatchRequestNewNote).not.toHaveBeenCalled();
  });

  test('REQ-EDIT-034: Ctrl+N calls event.preventDefault()', () => {
    const paneRoot = target.querySelector('[data-testid="editor-pane-root"]');
    expect(paneRoot).not.toBeNull(); // FAILS
    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    paneRoot?.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});

// ── PROP-EDIT-024a (REQ-EDIT-035): editing+dirty → TriggerBlurSave first ────────

describe('RequestNewNote while editing+dirty (PROP-EDIT-024a, REQ-EDIT-035)', () => {
  test('REQ-EDIT-035: RequestNewNote while editing AND isDirty=true dispatches TriggerBlurSave before RequestNewNote', () => {
    const btn = target.querySelector('[data-testid="new-note-button"]');
    expect(btn).not.toBeNull(); // FAILS
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledTimes(1);
    // RequestNewNote should NOT be called until after saving
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledTimes(0);
  });
});

// ── PROP-EDIT-024b (REQ-EDIT-035, EC-EDIT-008): save-failed → RequestNewNote direct

describe('RequestNewNote while save-failed (PROP-EDIT-024b, REQ-EDIT-035, EC-EDIT-008)', () => {
  test('EC-EDIT-008: RequestNewNote while save-failed dispatches directly without TriggerBlurSave', () => {
    const btn = target.querySelector('[data-testid="new-note-button"]');
    expect(btn).not.toBeNull(); // FAILS
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledTimes(0);
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledTimes(1);
  });
});

// ── PROP-EDIT-024c (REQ-EDIT-035): editing+clean → RequestNewNote direct ─────────

describe('RequestNewNote while editing+clean (PROP-EDIT-024c, REQ-EDIT-035)', () => {
  test('REQ-EDIT-035: RequestNewNote while editing AND isDirty=false dispatches directly without TriggerBlurSave', () => {
    const btn = target.querySelector('[data-testid="new-note-button"]');
    expect(btn).not.toBeNull(); // FAILS
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledTimes(0);
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledTimes(1);
  });
});

// ── PROP-EDIT-032 (REQ-EDIT-014, REQ-EDIT-016, EC-EDIT-002, EC-EDIT-006): blur save ─

describe('All-blocks blur save logic (PROP-EDIT-032, REQ-EDIT-014, REQ-EDIT-016, EC-EDIT-002, EC-EDIT-006)', () => {
  test('REQ-EDIT-014: all-blocks blur while editing+dirty dispatches TriggerBlurSave', () => {
    const paneRoot = target.querySelector('[data-testid="editor-pane-root"]');
    expect(paneRoot).not.toBeNull(); // FAILS
    paneRoot?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledTimes(1);
  });

  test('EC-EDIT-002: all-blocks blur while saving dispatches nothing', () => {
    const paneRoot = target.querySelector('[data-testid="editor-pane-root"]');
    expect(paneRoot).not.toBeNull(); // FAILS
    paneRoot?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledTimes(0);
  });

  test('EC-EDIT-002: all-blocks blur while switching dispatches nothing', () => {
    const paneRoot = target.querySelector('[data-testid="editor-pane-root"]');
    expect(paneRoot).not.toBeNull(); // FAILS
    paneRoot?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledTimes(0);
  });
});

// ── PROP-EDIT-033 (REQ-EDIT-012, REQ-EDIT-013, EC-EDIT-001, EC-EDIT-009): idle timer ─

describe('Idle debounce timer (PROP-EDIT-033, REQ-EDIT-012, REQ-EDIT-013, EC-EDIT-001, EC-EDIT-009)', () => {
  test('REQ-EDIT-012: after last block edit, advancing time by IDLE_SAVE_DEBOUNCE_MS fires TriggerIdleSave exactly once', () => {
    vi.useFakeTimers();
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    blockEl?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    vi.advanceTimersByTime(IDLE_SAVE_DEBOUNCE_MS);
    flushSync();
    expect(adapter.dispatchTriggerIdleSave).toHaveBeenCalledTimes(1);
  });

  test('EC-EDIT-001: advancing by IDLE_SAVE_DEBOUNCE_MS - 1 does NOT fire TriggerIdleSave', () => {
    vi.useFakeTimers();
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    blockEl?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    vi.advanceTimersByTime(IDLE_SAVE_DEBOUNCE_MS - 1);
    flushSync();
    expect(adapter.dispatchTriggerIdleSave).toHaveBeenCalledTimes(0);
  });

  test('EC-EDIT-001: continuous burst resets the timer (no intermediate fire)', () => {
    vi.useFakeTimers();
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    for (let i = 0; i < 3; i++) {
      blockEl?.dispatchEvent(new InputEvent('input', { bubbles: true }));
      vi.advanceTimersByTime(IDLE_SAVE_DEBOUNCE_MS - 100);
    }
    expect(adapter.dispatchTriggerIdleSave).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(IDLE_SAVE_DEBOUNCE_MS);
    expect(adapter.dispatchTriggerIdleSave).toHaveBeenCalledTimes(1);
  });

  test('REQ-EDIT-013: after NoteFileSaved snapshot, shell calls cancelIdleSave (no double fire)', () => {
    vi.useFakeTimers();
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    blockEl?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    // Emit saving-done snapshot
    (adapter as unknown as { _emitState: (s: EditingSessionStateDto) => void })._emitState({
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: 'success',
    });
    flushSync();
    vi.advanceTimersByTime(IDLE_SAVE_DEBOUNCE_MS + 1000);
    // After save, idle timer should be cancelled — no second fire
    expect(adapter.dispatchTriggerIdleSave).toHaveBeenCalledTimes(0);
  });
});

// ── PROP-EDIT-051 (REQ-EDIT-036): new note auto-focuses first block ──────────────

describe('New note auto-focus (PROP-EDIT-051, REQ-EDIT-036)', () => {
  test('REQ-EDIT-036: after NewNoteAutoCreated snapshot, first block element receives DOM focus', () => {
    const firstBlockId = 'block-first-001';
    (adapter as unknown as { _emitState: (s: EditingSessionStateDto) => void })._emitState({
      status: 'editing',
      currentNoteId: 'note-new-001',
      focusedBlockId: firstBlockId,
      isDirty: false,
      isNoteEmpty: true,
      lastSaveResult: null,
    });
    flushSync();
    // Block element matching firstBlockId should have focus
    const focusedEl = document.activeElement;
    expect(focusedEl?.getAttribute('data-block-id')).toBe(firstBlockId); // FAILS: placeholder has no block element
  });
});
