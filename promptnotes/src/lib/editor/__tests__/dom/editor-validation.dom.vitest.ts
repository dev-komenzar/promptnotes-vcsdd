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

// ── PROP-EDIT-043 (REQ-EDIT-038, REQ-EDIT-026) ───────────────────────────────

describe('Block validation error display (PROP-EDIT-043, REQ-EDIT-038, REQ-EDIT-026)', () => {
  test('REQ-EDIT-038: incompatible-content-for-type dispatch rejection shows inline hint このブロック種別に変換できません', async () => {
    // REQ-EDIT-038 (RD-022): block errors are surfaced via Promise rejection from dispatch methods.
    // Trigger: emit an editing state so block-1 is rendered, then mock dispatchChangeBlockType
    // to reject with incompatible-content-for-type and simulate the input that triggers it.
    adapter._emitState({
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
    });
    flushSync();

    // Mock dispatchChangeBlockType to reject once with the block operation error
    (adapter.dispatchChangeBlockType as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      kind: 'incompatible-content-for-type',
      reason: { kind: 'too-long', max: 100 },
    });

    // Trigger a markdown prefix input that causes BlockElement to call dispatchChangeBlockType.
    // Simulate '# ' input in the block element (triggers classifyMarkdownPrefix → heading-1)
    const blockEl = target.querySelector('[data-testid="block-element"]') as HTMLElement | null;
    expect(blockEl).not.toBeNull();
    if (blockEl) {
      blockEl.textContent = '# heading';
      blockEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    // Wait for the microtask queue to flush (Promise rejection handler runs)
    await Promise.resolve();
    flushSync();

    const hint = target.querySelector('[data-testid="block-validation-hint"]');
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toContain('このブロック種別に変換できません');
  });

  test('REQ-EDIT-038: control-character dispatch rejection shows 制御文字は入力できません', async () => {
    // REQ-EDIT-038 (RD-022): control-character error surfaced via dispatchEditBlockContent rejection.
    adapter._emitState({
      status: 'editing',
      currentNoteId: 'note-1',
      focusedBlockId: 'block-1',
      isDirty: false,
      isNoteEmpty: false,
      lastSaveResult: null,
    });
    flushSync();

    // Mock dispatchEditBlockContent to reject with control-character error
    (adapter.dispatchEditBlockContent as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      kind: 'control-character',
    });

    // Trigger an input event on the block element to call dispatchEditBlockContent
    const blockEl = target.querySelector('[data-testid="block-element"]') as HTMLElement | null;
    expect(blockEl).not.toBeNull();
    if (blockEl) {
      blockEl.textContent = 'text with control char';
      blockEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    await Promise.resolve();
    flushSync();

    const hint = target.querySelector('[data-testid="block-validation-hint"][data-error-kind="control-character"]');
    expect(hint).not.toBeNull();
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
