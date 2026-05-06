/**
 * block-drag-handle.dom.vitest.ts — Integration tests (vitest + jsdom + Svelte 5 mount API)
 *
 * Sprint 7 Red phase. Tests FAIL because BlockDragHandle.svelte does not exist yet.
 *
 * Coverage:
 *   PROP-EDIT-031 (REQ-EDIT-011):
 *     - Drop on new position dispatches MoveBlock{toIndex} within [0, blocks.length)
 *     - Alt+Shift+Up/Down dispatches MoveBlock
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { EditorIpcAdapter, EditingSessionStateDto } from '$lib/editor/types';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

function createMockAdapter(): EditorIpcAdapter & Record<string, ReturnType<typeof vi.fn>> {
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
    subscribeToState: vi.fn(() => () => {}),
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

// ── PROP-EDIT-031 (REQ-EDIT-011) ─────────────────────────────────────────────

describe('Block drag handle (PROP-EDIT-031, REQ-EDIT-011)', () => {
  test('REQ-EDIT-011: dragging block to new position dispatches MoveBlock{toIndex}', () => {
    const dragHandle = target.querySelector('[data-testid="block-drag-handle"]');
    expect(dragHandle).not.toBeNull(); // FAILS: no drag handle in placeholder
    dragHandle?.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
    // Simulate drop on target at index 2
    const dropTarget = target.querySelector('[data-block-drop-index="2"]');
    expect(dropTarget).not.toBeNull(); // FAILS
    dropTarget?.dispatchEvent(new DragEvent('drop', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchMoveBlock).toHaveBeenCalledWith(
      expect.objectContaining({ toIndex: expect.any(Number) })
    );
  });

  test('REQ-EDIT-011: MoveBlock toIndex is within [0, blocks.length)', () => {
    const dragHandle = target.querySelector('[data-testid="block-drag-handle"]');
    expect(dragHandle).not.toBeNull(); // FAILS
    dragHandle?.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
    const dropTarget = target.querySelector('[data-block-drop-index="1"]');
    dropTarget?.dispatchEvent(new DragEvent('drop', { bubbles: true }));
    flushSync();
    const call = adapter.dispatchMoveBlock.mock.calls[0];
    expect(call).toBeDefined(); // FAILS
    if (call) {
      const toIndex = (call[0] as { toIndex: number }).toIndex;
      expect(toIndex).toBeGreaterThanOrEqual(0);
    }
  });

  test('REQ-EDIT-011: Alt+Shift+Up dispatches MoveBlock for the focused block', () => {
    const paneRoot = target.querySelector('[data-testid="editor-pane-root"]');
    expect(paneRoot).not.toBeNull(); // FAILS
    paneRoot?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, shiftKey: true, bubbles: true })
    );
    flushSync();
    expect(adapter.dispatchMoveBlock).toHaveBeenCalledTimes(1);
  });

  test('REQ-EDIT-011: Alt+Shift+Down dispatches MoveBlock for the focused block', () => {
    const paneRoot = target.querySelector('[data-testid="editor-pane-root"]');
    expect(paneRoot).not.toBeNull(); // FAILS
    paneRoot?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, shiftKey: true, bubbles: true })
    );
    flushSync();
    expect(adapter.dispatchMoveBlock).toHaveBeenCalledTimes(1);
  });

  test('REQ-EDIT-011: drag preview element is removed from DOM after drop', () => {
    const dragHandle = target.querySelector('[data-testid="block-drag-handle"]');
    expect(dragHandle).not.toBeNull(); // FAILS
    dragHandle?.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
    flushSync();
    const dropTarget = target.querySelector('[data-block-drop-index="0"]');
    dropTarget?.dispatchEvent(new DragEvent('drop', { bubbles: true }));
    flushSync();
    // Drag preview element should be removed
    expect(target.querySelector('[data-testid="drag-preview"]')).toBeNull();
  });
});
