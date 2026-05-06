/**
 * editor-validation.dom.vitest.ts — Integration tests (vitest + jsdom + Svelte 5 mount API)
 *
 * Sprint 7 Red phase. Tests FAIL because editor components do not exist yet.
 *
 * Coverage:
 *   PROP-EDIT-043 (REQ-EDIT-038, REQ-EDIT-026):
 *     - incompatible-content-for-type shows inline hint near block
 *     - control-character shows inline hint
 *     - SaveValidationError.invariant-violated → console.error only, no banner
 *     - SaveValidationError.empty-body-on-idle → editing state, isDirty=false, isNoteEmpty=true
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { EditorIpcAdapter, EditingSessionStateDto, SaveError } from '$lib/editor/types';

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

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  adapter = createMockAdapter();
});

afterEach(() => {
  target.remove();
  vi.clearAllMocks();
});

// ── PROP-EDIT-043 (REQ-EDIT-038, REQ-EDIT-026) ───────────────────────────────

describe('Block validation error display (PROP-EDIT-043, REQ-EDIT-038, REQ-EDIT-026)', () => {
  test('REQ-EDIT-038: incompatible-content-for-type snapshot shows inline hint このブロック種別に変換できません', () => {
    // Simulate an editing snapshot where lastSaveError contains a block error hint
    // The domain might surface this via the snapshot or via a rejected command response
    adapter._emitState({
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: true,
      isNoteEmpty: false,
      lastSaveResult: null,
    });
    flushSync();
    // Inline hint element should be rendered near block-1
    const hint = target.querySelector('[data-testid="block-validation-hint"]');
    expect(hint).not.toBeNull(); // FAILS: no component rendered
    expect(hint?.textContent).toContain('このブロック種別に変換できません');
  });

  test('REQ-EDIT-038: control-character block error shows 制御文字は入力できません', () => {
    adapter._emitState({
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: true,
      isNoteEmpty: false,
      lastSaveResult: null,
    });
    flushSync();
    const hint = target.querySelector('[data-testid="block-validation-hint"][data-error-kind="control-character"]');
    expect(hint).not.toBeNull(); // FAILS
    expect(hint?.textContent).toContain('制御文字は入力できません');
  });

  test('REQ-EDIT-026: SaveValidationError.invariant-violated → no banner rendered', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Emit a save-failed snapshot with validation invariant-violated
    // (invariant-violated is silent — no banner, only console.error)
    adapter._emitState({
      status: 'save-failed',
      currentNoteId: 'note-1',
      priorFocusedBlockId: 'block-1',
      pendingNextFocus: null,
      lastSaveError: { kind: 'validation', reason: { kind: 'invariant-violated' } },
      isNoteEmpty: false,
    });
    flushSync();
    // No banner should be rendered for invariant-violated
    const banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).toBeNull(); // FAILS (no component, but the assertion is the expected behavior)
    consoleSpy.mockRestore();
  });

  test('REQ-EDIT-026: SaveValidationError.empty-body-on-idle → editing state with isDirty=false, isNoteEmpty=true', () => {
    // The successor state after empty-body-on-idle error
    adapter._emitState({
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: false,
      isNoteEmpty: true,
      lastSaveResult: null,
    });
    flushSync();
    // No banner should be shown for this validation error path
    const banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).toBeNull();
    // Editor should show placeholder state for empty note
    const emptyIndicator = target.querySelector('[data-testid="note-empty-indicator"]');
    expect(emptyIndicator).not.toBeNull(); // FAILS
  });

  test('REQ-EDIT-038: block remains contenteditable even when validation hint is shown', () => {
    adapter._emitState({
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: true,
      isNoteEmpty: false,
      lastSaveResult: null,
    });
    flushSync();
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    // Even with validation hint, block must NOT be locked
    expect(blockEl?.getAttribute('contenteditable')).not.toBe('false');
  });
});
