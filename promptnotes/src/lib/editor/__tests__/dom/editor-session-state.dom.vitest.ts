/**
 * editor-session-state.dom.vitest.ts — Integration tests (vitest + jsdom + Svelte 5 mount API)
 *
 * Sprint 7 Red phase. Tests FAIL because EditorPanel.svelte does not exist yet.
 *
 * Coverage:
 *   PROP-EDIT-034 (REQ-EDIT-019): idle state UI
 *   PROP-EDIT-035 (REQ-EDIT-020): editing state UI
 *   PROP-EDIT-036 (REQ-EDIT-021): saving state UI
 *   PROP-EDIT-037 (REQ-EDIT-022): switching state UI
 *   PROP-EDIT-038 (REQ-EDIT-023): save-failed state UI
 *   PROP-EDIT-048 (EC-EDIT-003): save-failed continued input
 *   PROP-EDIT-050 (EC-EDIT-005, EC-EDIT-014): switching lock + Cancel priorFocusedBlockId
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { EditorIpcAdapter, EditingSessionStateDto, SaveError } from '$lib/editor/types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

function createMockAdapter() {
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
    _emitState(state: EditingSessionStateDto) {
      if (_stateHandler) _stateHandler(state);
    },
  };
  return adapter;
}

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
});

const FS_PERMISSION_ERROR: SaveError = { kind: 'fs', reason: { kind: 'permission' } };

// ── PROP-EDIT-034 (REQ-EDIT-019): idle state ─────────────────────────────────

describe('Idle state UI (PROP-EDIT-034, REQ-EDIT-019)', () => {
  test('REQ-EDIT-019: in idle state, block tree is absent or contenteditable=false', () => {
    adapter._emitState({ status: 'idle' });
    flushSync();
    const blockEls = target.querySelectorAll('[data-testid="block-element"]');
    // Either no blocks or all non-editable — either way placeholder has none
    expect(blockEls.length).toBe(0); // FAILS: placeholder never emits blocks
  });

  test('REQ-EDIT-019: in idle state, copy button is disabled', () => {
    adapter._emitState({ status: 'idle' });
    flushSync();
    const btn = target.querySelector('[data-testid="copy-body-button"]');
    expect(btn).not.toBeNull(); // FAILS
    expect(btn?.hasAttribute('disabled')).toBe(true);
  });

  test('REQ-EDIT-019: in idle state, placeholder message is visible', () => {
    adapter._emitState({ status: 'idle' });
    flushSync();
    const placeholder = target.querySelector('[data-testid="editor-placeholder"]');
    expect(placeholder).not.toBeNull(); // FAILS
    expect(placeholder?.textContent).toContain('ノートを選択');
  });

  test('REQ-EDIT-019: in idle state, new-note button is enabled', () => {
    adapter._emitState({ status: 'idle' });
    flushSync();
    const btn = target.querySelector('[data-testid="new-note-button"]');
    expect(btn).not.toBeNull(); // FAILS
    expect(btn?.hasAttribute('disabled')).toBe(false);
  });
});

// ── PROP-EDIT-035 (REQ-EDIT-020): editing state ──────────────────────────────

describe('Editing state UI (PROP-EDIT-035, REQ-EDIT-020)', () => {
  test('REQ-EDIT-020: in editing state, focused block element is contenteditable', () => {
    adapter._emitState({
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: true,
      isNoteEmpty: false,
      lastSaveResult: null,
    });
    flushSync();
    const focusedBlock = target.querySelector('[data-block-id="block-1"]');
    expect(focusedBlock).not.toBeNull(); // FAILS
    expect(focusedBlock?.getAttribute('contenteditable')).toBe('true');
  });

  test('REQ-EDIT-020: in editing with isDirty=true, dirty indicator is present', () => {
    adapter._emitState({
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: true,
      isNoteEmpty: false,
      lastSaveResult: null,
    });
    flushSync();
    const dirtyIndicator = target.querySelector('[data-testid="dirty-indicator"]');
    expect(dirtyIndicator).not.toBeNull(); // FAILS
  });

  test('REQ-EDIT-020: in editing with isNoteEmpty=false, copy button is enabled', () => {
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
    expect(btn?.hasAttribute('disabled')).toBe(false);
  });
});

// ── PROP-EDIT-036 (REQ-EDIT-021): saving state ───────────────────────────────

describe('Saving state UI (PROP-EDIT-036, REQ-EDIT-021)', () => {
  test('REQ-EDIT-021: in saving state, save indicator has aria-label containing 保存中', () => {
    adapter._emitState({
      status: 'saving',
      currentNoteId: 'note-1',
      isNoteEmpty: false,
    });
    flushSync();
    const indicator = target.querySelector('[role="status"]');
    expect(indicator).not.toBeNull(); // FAILS
    expect(indicator?.getAttribute('aria-label')).toContain('保存中');
  });

  test('REQ-EDIT-021: in saving state, block elements remain contenteditable', () => {
    adapter._emitState({
      status: 'saving',
      currentNoteId: 'note-1',
      isNoteEmpty: false,
    });
    flushSync();
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    expect(blockEl?.getAttribute('contenteditable')).toBe('true');
  });

  test('REQ-EDIT-021: EC-EDIT-010: new-note button is enabled in saving state', () => {
    adapter._emitState({
      status: 'saving',
      currentNoteId: 'note-1',
      isNoteEmpty: false,
    });
    flushSync();
    const btn = target.querySelector('[data-testid="new-note-button"]');
    expect(btn).not.toBeNull(); // FAILS
    expect(btn?.hasAttribute('disabled')).toBe(false);
  });
});

// ── PROP-EDIT-037 (REQ-EDIT-022): switching state ────────────────────────────

describe('Switching state UI (PROP-EDIT-037, REQ-EDIT-022)', () => {
  test('REQ-EDIT-022: in switching state, block elements are contenteditable=false', () => {
    adapter._emitState({
      status: 'switching',
      currentNoteId: 'note-1',
      pendingNextFocus: { noteId: 'note-2', blockId: 'block-x' },
      isNoteEmpty: false,
    });
    flushSync();
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    expect(blockEl?.getAttribute('contenteditable')).toBe('false');
  });

  test('REQ-EDIT-022: in switching state, copy button is disabled', () => {
    adapter._emitState({
      status: 'switching',
      currentNoteId: 'note-1',
      pendingNextFocus: { noteId: 'note-2', blockId: 'block-x' },
      isNoteEmpty: false,
    });
    flushSync();
    const btn = target.querySelector('[data-testid="copy-body-button"]');
    expect(btn).not.toBeNull(); // FAILS
    expect(btn?.hasAttribute('disabled')).toBe(true);
  });

  test('REQ-EDIT-022: in switching state, new-note button is disabled', () => {
    adapter._emitState({
      status: 'switching',
      currentNoteId: 'note-1',
      pendingNextFocus: { noteId: 'note-2', blockId: 'block-x' },
      isNoteEmpty: false,
    });
    flushSync();
    const btn = target.querySelector('[data-testid="new-note-button"]');
    expect(btn).not.toBeNull(); // FAILS
    expect(btn?.hasAttribute('disabled')).toBe(true);
  });
});

// ── PROP-EDIT-038 (REQ-EDIT-023): save-failed state ──────────────────────────

describe('Save-failed state UI (PROP-EDIT-038, REQ-EDIT-023)', () => {
  test('REQ-EDIT-023: in save-failed state, save-failure-banner is visible', () => {
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
  });

  test('REQ-EDIT-023: in save-failed state, block elements remain contenteditable', () => {
    adapter._emitState({
      status: 'save-failed',
      currentNoteId: 'note-1',
      priorFocusedBlockId: 'block-1',
      pendingNextFocus: null,
      lastSaveError: FS_PERMISSION_ERROR,
      isNoteEmpty: false,
    });
    flushSync();
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    expect(blockEl?.getAttribute('contenteditable')).toBe('true');
  });

  test('REQ-EDIT-023: in save-failed state, new-note button is enabled', () => {
    adapter._emitState({
      status: 'save-failed',
      currentNoteId: 'note-1',
      priorFocusedBlockId: 'block-1',
      pendingNextFocus: null,
      lastSaveError: FS_PERMISSION_ERROR,
      isNoteEmpty: false,
    });
    flushSync();
    const btn = target.querySelector('[data-testid="new-note-button"]');
    expect(btn).not.toBeNull(); // FAILS
    expect(btn?.hasAttribute('disabled')).toBe(false);
  });
});

// ── PROP-EDIT-048 (EC-EDIT-003): save-failed continued input ─────────────────

describe('Save-failed continued input (PROP-EDIT-048, EC-EDIT-003)', () => {
  test('EC-EDIT-003: in save-failed state, continued input dispatches EditBlockContent and banner remains', () => {
    adapter._emitState({
      status: 'save-failed',
      currentNoteId: 'note-1',
      priorFocusedBlockId: 'block-1',
      pendingNextFocus: null,
      lastSaveError: FS_PERMISSION_ERROR,
      isNoteEmpty: false,
    });
    flushSync();
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    blockEl?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchEditBlockContent).toHaveBeenCalledTimes(1);
    // Banner should still be present
    const banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).not.toBeNull(); // FAILS
  });
});

// ── PROP-EDIT-050 (EC-EDIT-005, EC-EDIT-014): switching lock + Cancel restores focus

describe('Switching lock and Cancel (PROP-EDIT-050, EC-EDIT-005, EC-EDIT-014)', () => {
  test('EC-EDIT-005: in switching state, block tree is locked (contenteditable=false)', () => {
    adapter._emitState({
      status: 'switching',
      currentNoteId: 'note-1',
      pendingNextFocus: { noteId: 'note-2', blockId: 'block-x' },
      isNoteEmpty: false,
    });
    flushSync();
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    expect(blockEl?.getAttribute('contenteditable')).toBe('false');
  });

  test('EC-EDIT-014: Cancel in save-failed restores focusedBlockId=priorFocusedBlockId', () => {
    adapter._emitState({
      status: 'save-failed',
      currentNoteId: 'note-1',
      priorFocusedBlockId: 'block-prior',
      pendingNextFocus: null,
      lastSaveError: FS_PERMISSION_ERROR,
      isNoteEmpty: false,
    });
    flushSync();
    const cancelBtn = target.querySelector('[data-testid="cancel-switch-button"]');
    expect(cancelBtn).not.toBeNull(); // FAILS
    cancelBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(adapter.dispatchCancelSwitch).toHaveBeenCalledTimes(1);
  });
});
