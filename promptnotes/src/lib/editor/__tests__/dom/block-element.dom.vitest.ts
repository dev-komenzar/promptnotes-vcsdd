/**
 * block-element.dom.vitest.ts — Integration tests (vitest + jsdom + Svelte 5 mount API)
 *
 * Sprint 7 Red phase. Tests FAIL because BlockElement.svelte does not exist yet.
 * Pattern: placeholder div, simulate block-level events, assert on mock adapter.
 *
 * Coverage:
 *   PROP-EDIT-025 (REQ-EDIT-001, REQ-EDIT-003): FocusBlock + EditBlockContent dispatch
 *   PROP-EDIT-026 (REQ-EDIT-006): Enter at end → InsertBlock
 *   PROP-EDIT-027 (REQ-EDIT-007): Enter mid-block → SplitBlock with caret offset
 *   PROP-EDIT-028 (REQ-EDIT-008, EC-EDIT-011): Backspace at offset 0
 *   PROP-EDIT-029 (REQ-EDIT-009): Backspace/Delete on empty block → RemoveBlock
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { EditorIpcAdapter, EditingSessionStateDto } from '$lib/editor/types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

function createMockAdapter(): EditorIpcAdapter & Record<string, ReturnType<typeof vi.fn>> {
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
  } as unknown as EditorIpcAdapter & Record<string, ReturnType<typeof vi.fn>>;
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

// ── PROP-EDIT-025 (REQ-EDIT-001, REQ-EDIT-003) ───────────────────────────────

describe('Block focus and input dispatch (PROP-EDIT-025, REQ-EDIT-001, REQ-EDIT-003)', () => {
  test('REQ-EDIT-001: clicking a block element dispatches FocusBlock once', () => {
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS: no block element in placeholder
    blockEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchFocusBlock).toHaveBeenCalledTimes(1);
  });

  test('REQ-EDIT-003: oninput event in a block dispatches EditBlockContent with full content', () => {
    const blockEl = target.querySelector('[data-testid="block-element"]') as HTMLElement | null;
    expect(blockEl).not.toBeNull(); // FAILS
    if (blockEl) blockEl.textContent = 'hello world';
    blockEl?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchEditBlockContent).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'hello world' })
    );
  });

  test('REQ-EDIT-003: each input event dispatches exactly one EditBlockContent', () => {
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    blockEl?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    blockEl?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchEditBlockContent).toHaveBeenCalledTimes(2);
  });
});

// ── PROP-EDIT-026 (REQ-EDIT-006): Enter at end → InsertBlock ─────────────────

describe('Enter at end of block (PROP-EDIT-026, REQ-EDIT-006)', () => {
  test('REQ-EDIT-006: Enter at end of non-empty block dispatches InsertBlock with atBeginning=false', () => {
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    blockEl?.dispatchEvent(event);
    flushSync();
    expect(adapter.dispatchInsertBlockAfter).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'paragraph', content: '' })
    );
  });

  test('REQ-EDIT-006: InsertBlock carries prevBlockId matching focused block', () => {
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    blockEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flushSync();
    expect(adapter.dispatchInsertBlockAfter).toHaveBeenCalledWith(
      expect.objectContaining({ prevBlockId: expect.any(String) })
    );
  });
});

// ── PROP-EDIT-027 (REQ-EDIT-007): Enter mid-block → SplitBlock ───────────────

describe('Enter mid-block (PROP-EDIT-027, REQ-EDIT-007)', () => {
  test('REQ-EDIT-007: Enter mid-block dispatches SplitBlock with caret offset', () => {
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    blockEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    flushSync();
    expect(adapter.dispatchSplitBlock).toHaveBeenCalledWith(
      expect.objectContaining({ offset: expect.any(Number) })
    );
  });
});

// ── PROP-EDIT-028 (REQ-EDIT-008, EC-EDIT-011): Backspace at offset 0 ─────────

describe('Backspace at offset 0 (PROP-EDIT-028, REQ-EDIT-008, EC-EDIT-011)', () => {
  test('REQ-EDIT-008: Backspace at offset 0 of non-first block dispatches MergeBlocks', () => {
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    blockEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    flushSync();
    expect(adapter.dispatchMergeBlocks).toHaveBeenCalledTimes(1);
  });

  test('EC-EDIT-011: Backspace at offset 0 of first block dispatches nothing', () => {
    const blockEl = target.querySelector('[data-testid="block-element"][data-block-index="0"]');
    expect(blockEl).not.toBeNull(); // FAILS
    blockEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    flushSync();
    expect(adapter.dispatchMergeBlocks).toHaveBeenCalledTimes(0);
    expect(adapter.dispatchRemoveBlock).toHaveBeenCalledTimes(0);
  });
});

// ── PROP-EDIT-029 (REQ-EDIT-009): Backspace/Delete on empty block → RemoveBlock ─

describe('Backspace/Delete on empty block (PROP-EDIT-029, REQ-EDIT-009)', () => {
  test('REQ-EDIT-009: Backspace on empty non-last block dispatches RemoveBlock', () => {
    const blockEl = target.querySelector('[data-testid="block-element"][data-block-empty="true"]');
    expect(blockEl).not.toBeNull(); // FAILS
    blockEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    flushSync();
    expect(adapter.dispatchRemoveBlock).toHaveBeenCalledTimes(1);
  });

  test('REQ-EDIT-009: Backspace on the only block dispatches nothing', () => {
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    blockEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    flushSync();
    expect(adapter.dispatchRemoveBlock).toHaveBeenCalledTimes(0);
  });

  test('REQ-EDIT-009: Delete on empty non-last block dispatches RemoveBlock', () => {
    const blockEl = target.querySelector('[data-testid="block-element"][data-block-empty="true"]');
    expect(blockEl).not.toBeNull(); // FAILS
    blockEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    flushSync();
    expect(adapter.dispatchRemoveBlock).toHaveBeenCalledTimes(1);
  });
});
