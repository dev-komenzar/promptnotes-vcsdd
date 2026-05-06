/**
 * slash-menu.dom.vitest.ts — Integration tests (vitest + jsdom + Svelte 5 mount API)
 *
 * Sprint 7 Red phase. Tests FAIL because SlashMenu.svelte does not exist yet.
 *
 * Coverage:
 *   PROP-EDIT-030 (REQ-EDIT-010, EC-EDIT-013):
 *     - Selecting a type from slash menu dispatches ChangeBlockType
 *     - Markdown shortcut '# ' dispatches ChangeBlockType and trims prefix
 *     - Divider exact-match rule: '---' → divider; '--- ' → null
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

// ── PROP-EDIT-030 (REQ-EDIT-010, EC-EDIT-013) ────────────────────────────────

describe('Slash menu and Markdown shortcuts (PROP-EDIT-030, REQ-EDIT-010, EC-EDIT-013)', () => {
  test('REQ-EDIT-010: selecting Heading 1 from slash menu dispatches ChangeBlockType{newType:heading-1}', () => {
    // Simulate typing '/' to open slash menu
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS: no block element in placeholder
    blockEl?.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    flushSync();
    // Slash menu should be visible
    const slashMenu = target.querySelector('[data-testid="slash-menu"]');
    expect(slashMenu).not.toBeNull(); // FAILS
    // Select Heading 1 item
    const heading1Item = slashMenu?.querySelector('[data-block-type="heading-1"]');
    expect(heading1Item).not.toBeNull(); // FAILS
    heading1Item?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchChangeBlockType).toHaveBeenCalledWith(
      expect.objectContaining({ newType: 'heading-1' })
    );
  });

  test('REQ-EDIT-010: Markdown shortcut "# " dispatches ChangeBlockType{newType:heading-1} and clears prefix', () => {
    const blockEl = target.querySelector('[data-testid="block-element"]') as HTMLElement | null;
    expect(blockEl).not.toBeNull(); // FAILS
    if (blockEl) blockEl.textContent = '# ';
    blockEl?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchChangeBlockType).toHaveBeenCalledWith(
      expect.objectContaining({ newType: 'heading-1' })
    );
  });

  test('EC-EDIT-013: content === "---" exactly dispatches ChangeBlockType{newType:divider}', () => {
    const blockEl = target.querySelector('[data-testid="block-element"]') as HTMLElement | null;
    expect(blockEl).not.toBeNull(); // FAILS
    if (blockEl) blockEl.textContent = '---';
    blockEl?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchChangeBlockType).toHaveBeenCalledWith(
      expect.objectContaining({ newType: 'divider' })
    );
  });

  test('EC-EDIT-013: content === "--- " (trailing space) does NOT dispatch ChangeBlockType', () => {
    const blockEl = target.querySelector('[data-testid="block-element"]') as HTMLElement | null;
    expect(blockEl).not.toBeNull(); // FAILS
    if (blockEl) blockEl.textContent = '--- ';
    blockEl?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchChangeBlockType).not.toHaveBeenCalled();
  });

  test('REQ-EDIT-010: unknown prefix does not dispatch ChangeBlockType', () => {
    const blockEl = target.querySelector('[data-testid="block-element"]') as HTMLElement | null;
    expect(blockEl).not.toBeNull(); // FAILS
    if (blockEl) blockEl.textContent = '~~~unknown';
    blockEl?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchChangeBlockType).not.toHaveBeenCalled();
  });

  test('REQ-EDIT-010: slash menu is torn down after selection (DOM removed)', () => {
    const blockEl = target.querySelector('[data-testid="block-element"]');
    expect(blockEl).not.toBeNull(); // FAILS
    blockEl?.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    flushSync();
    const slashMenu = target.querySelector('[data-testid="slash-menu"]');
    expect(slashMenu).not.toBeNull(); // FAILS
    slashMenu?.querySelector('[data-block-type="heading-1"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    );
    flushSync();
    expect(target.querySelector('[data-testid="slash-menu"]')).toBeNull(); // FAILS
  });
});
