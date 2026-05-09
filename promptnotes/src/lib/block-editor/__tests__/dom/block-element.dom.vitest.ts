/**
 * block-element.dom.vitest.ts — Tier 4 DOM integration tests
 *
 * Sprint 2 of ui-block-editor (Phase 2a Red → 2b Green).
 *
 * Coverage:
 *   PROP-BE-021 / REQ-BE-001 — type 別 DOM rendering
 *   PROP-BE-022 / REQ-BE-002 — domain → DOM focus delegation
 *   PROP-BE-023 / REQ-BE-003 — input → dispatchEditBlockContent
 *   PROP-BE-024 / REQ-BE-004 — input → onBlockEdit notify
 *   PROP-BE-025 / REQ-BE-005 — markdown prefix → dispatchChangeBlockType (with invocation order)
 *   PROP-BE-026 / REQ-BE-006 — Enter → dispatchInsertBlockAfter / dispatchSplitBlock
 *   PROP-BE-027 / REQ-BE-007 — empty Backspace/Delete → dispatchRemoveBlock
 *   PROP-BE-028 / REQ-BE-008 — first-pos Backspace → dispatchMergeBlocks
 *   PROP-BE-029 / REQ-BE-009 — '/' opens SlashMenu
 *   PROP-BE-030 / REQ-BE-010 — SlashMenu select → dispatchChangeBlockType
 *   PROP-BE-038 / REQ-BE-002b — focusin → dispatchFocusBlock
 *   PROP-BE-039 / REQ-BE-006 — SlashMenu open + Enter does not fire Insert/Split
 *   PROP-BE-046 / NFR-BE-006 — control char strip
 *   PROP-BE-047 / adapter contract — Promise rejection swallowing
 *
 * Pattern: vitest + jsdom + raw Svelte 5 mount API.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import BlockElement from '$lib/block-editor/BlockElement.svelte';
import type { BlockEditorAdapter, BlockType } from '$lib/block-editor/types';

// ──────────────────────────────────────────────────────────────────────
// Mock factory
// ──────────────────────────────────────────────────────────────────────

type MockedAdapter = {
  [K in keyof BlockEditorAdapter]: BlockEditorAdapter[K] & ReturnType<typeof vi.fn>;
};

function makeMockAdapter(): MockedAdapter {
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
  } as unknown as MockedAdapter;
}

interface BlockProp {
  id: string;
  type: BlockType;
  content: string;
}

function makeBlock(overrides: Partial<BlockProp> = {}): BlockProp {
  return { id: 'block-1', type: 'paragraph', content: 'hello', ...overrides };
}

// ──────────────────────────────────────────────────────────────────────
// Setup / teardown
// ──────────────────────────────────────────────────────────────────────

let target: HTMLDivElement;
let adapter: ReturnType<typeof makeMockAdapter>;
let component: ReturnType<typeof mount> | null = null;
let onBlockEdit: ReturnType<typeof vi.fn>;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  adapter = makeMockAdapter();
  onBlockEdit = vi.fn();
});

afterEach(() => {
  if (component) {
    unmount(component);
    component = null;
  }
  target.remove();
  vi.clearAllMocks();
});

function mountBlockElement(props: {
  block: BlockProp;
  blockIndex?: number;
  totalBlocks?: number;
  noteId?: string;
  isFocused?: boolean;
  isEditable?: boolean;
}) {
  component = mount(BlockElement, {
    target,
    props: {
      block: props.block,
      blockIndex: props.blockIndex ?? 0,
      totalBlocks: props.totalBlocks ?? 1,
      noteId: props.noteId ?? 'note-1',
      isFocused: props.isFocused ?? false,
      isEditable: props.isEditable ?? true,
      issuedAt: () => '2026-05-09T00:00:00Z',
      adapter,
      onBlockEdit: onBlockEdit as unknown as (() => void),
    },
  });
  flushSync();
  return target.querySelector<HTMLElement>('[data-testid="block-element"]')!;
}

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-021 / REQ-BE-001: type 別 DOM rendering
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-021 / REQ-BE-001: type 別 DOM rendering', () => {
  test('paragraph → <div data-testid="block-element">', () => {
    const el = mountBlockElement({ block: makeBlock({ type: 'paragraph', content: 'p' }) });
    expect(el.tagName.toLowerCase()).toBe('div');
    expect(el.getAttribute('data-block-id')).toBe('block-1');
    expect(el.getAttribute('data-block-index')).toBe('0');
    expect(el.getAttribute('data-block-empty')).toBe('false');
    expect(el.getAttribute('contenteditable')).toBe('true');
  });

  test('heading-1 → <div> (single tag, role textbox)', () => {
    const el = mountBlockElement({ block: makeBlock({ type: 'heading-1', content: 'h' }) });
    expect(el.tagName.toLowerCase()).toBe('div');
    expect(el.getAttribute('role')).toBe('textbox');
  });

  test('divider → <hr> with no contenteditable', () => {
    const el = mountBlockElement({ block: makeBlock({ type: 'divider', content: '' }) });
    expect(el.tagName.toLowerCase()).toBe('hr');
    expect(el.getAttribute('contenteditable')).toBe(null);
  });

  test('isEditable=false ⇒ contenteditable="false" tabindex=-1', () => {
    const el = mountBlockElement({
      block: makeBlock({ type: 'paragraph', content: 'p' }),
      isEditable: false,
    });
    expect(el.getAttribute('contenteditable')).toBe('false');
    expect(el.getAttribute('tabindex')).toBe('-1');
  });

  test('empty content ⇒ data-block-empty="true"', () => {
    const el = mountBlockElement({ block: makeBlock({ content: '' }) });
    expect(el.getAttribute('data-block-empty')).toBe('true');
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-022 / REQ-BE-002: domain → DOM focus delegation
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-022 / REQ-BE-002: focus delegation', () => {
  test('isFocused=true mount ⇒ document.activeElement === block element', () => {
    const el = mountBlockElement({ block: makeBlock(), isFocused: true });
    expect(document.activeElement).toBe(el);
  });

  test('isFocused=false mount ⇒ document.activeElement !== block element', () => {
    const el = mountBlockElement({ block: makeBlock(), isFocused: false });
    expect(document.activeElement).not.toBe(el);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-038 / REQ-BE-002b: focusin → dispatchFocusBlock
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-038 / REQ-BE-002b: focusin → dispatchFocusBlock', () => {
  test('focusin event ⇒ dispatchFocusBlock called once', () => {
    const el = mountBlockElement({ block: makeBlock() });
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchFocusBlock).toHaveBeenCalledTimes(1);
    expect(adapter.dispatchFocusBlock).toHaveBeenCalledWith({
      noteId: 'note-1',
      blockId: 'block-1',
      issuedAt: '2026-05-09T00:00:00Z',
    });
  });

  test('click ⇒ dispatchFocusBlock called exactly once with full payload (FIND-BE-3-006)', () => {
    const el = mountBlockElement({ block: makeBlock() });
    el.click();
    flushSync();
    expect(adapter.dispatchFocusBlock).toHaveBeenCalledTimes(1);
    expect(adapter.dispatchFocusBlock).toHaveBeenCalledWith({
      noteId: 'note-1',
      blockId: 'block-1',
      issuedAt: '2026-05-09T00:00:00Z',
    });
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-023 / REQ-BE-003: input → dispatchEditBlockContent
// PROP-BE-024 / REQ-BE-004: onBlockEdit notify
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-023 / REQ-BE-003: input dispatch', () => {
  test('input event ⇒ dispatchEditBlockContent called with current textContent', () => {
    const el = mountBlockElement({ block: makeBlock({ content: 'hello' }) });
    el.textContent = 'hello world';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchEditBlockContent).toHaveBeenCalledTimes(1);
    expect(adapter.dispatchEditBlockContent).toHaveBeenCalledWith({
      noteId: 'note-1',
      blockId: 'block-1',
      content: 'hello world',
      issuedAt: '2026-05-09T00:00:00Z',
    });
  });
});

describe('PROP-BE-024 / REQ-BE-004: onBlockEdit notify', () => {
  test('input event ⇒ onBlockEdit called once', () => {
    const el = mountBlockElement({ block: makeBlock() });
    el.textContent = 'hello world';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(onBlockEdit).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-025 / REQ-BE-005: markdown prefix → dispatchChangeBlockType
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-025 / REQ-BE-005: markdown prefix dispatch + invocation order', () => {
  test('input "# " ⇒ dispatchEditBlockContent THEN dispatchChangeBlockType (heading-1)', () => {
    const el = mountBlockElement({ block: makeBlock({ content: '' }) });
    el.textContent = '# ';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchEditBlockContent).toHaveBeenCalledTimes(1);
    expect(adapter.dispatchChangeBlockType).toHaveBeenCalledTimes(1);
    expect(adapter.dispatchChangeBlockType).toHaveBeenCalledWith({
      noteId: 'note-1',
      blockId: 'block-1',
      newType: 'heading-1',
      issuedAt: '2026-05-09T00:00:00Z',
    });
    // Order: edit first, then change-type
    const editOrder = adapter.dispatchEditBlockContent.mock.invocationCallOrder[0]!;
    const changeOrder = adapter.dispatchChangeBlockType.mock.invocationCallOrder[0]!;
    expect(editOrder).toBeLessThan(changeOrder);
  });

  test('input "hello" (no prefix) ⇒ no dispatchChangeBlockType', () => {
    const el = mountBlockElement({ block: makeBlock({ content: '' }) });
    el.textContent = 'hello';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchEditBlockContent).toHaveBeenCalledTimes(1);
    expect(adapter.dispatchChangeBlockType).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-026 / REQ-BE-006: Enter → InsertBlock or SplitBlock
// PROP-BE-039 / REQ-BE-006: SlashMenu open exclusion
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-026 / REQ-BE-006: Enter dispatch — insert branch', () => {
  test('Enter at end ⇒ dispatchInsertBlockAfter (paragraph, empty content)', () => {
    const el = mountBlockElement({ block: makeBlock({ content: 'hello' }) });
    el.textContent = 'hello'; // ensure
    // jsdom: getCaretOffset falls back to text length when no Selection
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    el.dispatchEvent(enter);
    flushSync();
    expect(adapter.dispatchInsertBlockAfter).toHaveBeenCalledTimes(1);
    expect(adapter.dispatchInsertBlockAfter).toHaveBeenCalledWith({
      noteId: 'note-1',
      prevBlockId: 'block-1',
      type: 'paragraph',
      content: '',
      issuedAt: '2026-05-09T00:00:00Z',
    });
    expect(enter.defaultPrevented).toBe(true);
    expect(adapter.dispatchSplitBlock).not.toHaveBeenCalled();
  });
});

describe('PROP-BE-026 / REQ-BE-006: Enter dispatch — split branch (FIND-BE-3-002)', () => {
  test('Enter mid-block ⇒ dispatchSplitBlock with caret offset; no InsertBlockAfter', () => {
    const el = mountBlockElement({ block: makeBlock({ content: 'hello' }) });
    el.textContent = 'hello';
    // Place caret at offset 3 (between 'l' and 'l')
    const range = document.createRange();
    const textNode = el.firstChild!;
    range.setStart(textNode, 3);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    el.dispatchEvent(enter);
    flushSync();
    expect(adapter.dispatchSplitBlock).toHaveBeenCalledTimes(1);
    expect(adapter.dispatchSplitBlock).toHaveBeenCalledWith({
      noteId: 'note-1',
      blockId: 'block-1',
      offset: 3,
      issuedAt: '2026-05-09T00:00:00Z',
    });
    expect(adapter.dispatchInsertBlockAfter).not.toHaveBeenCalled();
    expect(enter.defaultPrevented).toBe(true);
  });
});

describe('PROP-BE-039 / REQ-BE-006: SlashMenu open ⇒ Enter is skipped', () => {
  test('after "/" pressed (slash menu open), Enter does not fire Insert/Split, only ChangeBlockType (FIND-BE-3-003)', () => {
    const el = mountBlockElement({ block: makeBlock({ content: '' }) });
    // open slash menu
    const slash = new KeyboardEvent('keydown', { key: '/', bubbles: true });
    el.dispatchEvent(slash);
    flushSync();
    // Now press Enter — SlashMenu's <svelte:window onkeydown> consumes it
    // and fires onSelect with the currently-selected (default index 0 = 'paragraph') type.
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    window.dispatchEvent(enter);
    flushSync();
    // Negative: BlockElement must NOT have fired Insert/Split.
    expect(adapter.dispatchInsertBlockAfter).not.toHaveBeenCalled();
    expect(adapter.dispatchSplitBlock).not.toHaveBeenCalled();
    // Positive: SlashMenu → handleSlashSelect dispatches ChangeBlockType for the
    // currently selected entry.
    expect(adapter.dispatchChangeBlockType).toHaveBeenCalledTimes(1);
    expect(adapter.dispatchChangeBlockType).toHaveBeenCalledWith({
      noteId: 'note-1',
      blockId: 'block-1',
      newType: 'paragraph',
      issuedAt: '2026-05-09T00:00:00Z',
    });
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-027 / REQ-BE-007: empty Backspace/Delete → RemoveBlock
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-027 / REQ-BE-007: empty + Backspace/Delete', () => {
  test('empty content + Backspace + totalBlocks > 1 ⇒ dispatchRemoveBlock', () => {
    const el = mountBlockElement({
      block: makeBlock({ content: '' }),
      blockIndex: 1,
      totalBlocks: 2,
    });
    const bs = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    el.dispatchEvent(bs);
    flushSync();
    expect(adapter.dispatchRemoveBlock).toHaveBeenCalledTimes(1);
    expect(bs.defaultPrevented).toBe(true);
  });

  test('empty content + Delete + totalBlocks > 1 ⇒ dispatchRemoveBlock', () => {
    const el = mountBlockElement({
      block: makeBlock({ content: '' }),
      blockIndex: 0,
      totalBlocks: 2,
    });
    const del = new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true });
    el.dispatchEvent(del);
    flushSync();
    expect(adapter.dispatchRemoveBlock).toHaveBeenCalledTimes(1);
    expect(del.defaultPrevented).toBe(true);
  });

  test('empty content + Backspace + totalBlocks === 1 ⇒ no dispatch, no preventDefault', () => {
    const el = mountBlockElement({
      block: makeBlock({ content: '' }),
      blockIndex: 0,
      totalBlocks: 1,
    });
    const bs = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    el.dispatchEvent(bs);
    flushSync();
    expect(adapter.dispatchRemoveBlock).not.toHaveBeenCalled();
    expect(bs.defaultPrevented).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-028 / REQ-BE-008: 行頭 Backspace → MergeBlocks
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-028 / REQ-BE-008: first-pos Backspace dispatch', () => {
  test('non-empty + Backspace at offset 0 + blockIndex > 0 ⇒ dispatchMergeBlocks', () => {
    const el = mountBlockElement({
      block: makeBlock({ content: 'hi' }),
      blockIndex: 1,
      totalBlocks: 3,
    });
    el.textContent = 'hi';
    // Force caret at offset 0 by selecting before content
    const range = document.createRange();
    range.setStart(el, 0);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const bs = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    el.dispatchEvent(bs);
    flushSync();
    expect(adapter.dispatchMergeBlocks).toHaveBeenCalledTimes(1);
    expect(bs.defaultPrevented).toBe(true);
  });

  test('non-empty + Backspace at offset 0 + blockIndex === 0 ⇒ no dispatchMergeBlocks', () => {
    const el = mountBlockElement({
      block: makeBlock({ content: 'hi' }),
      blockIndex: 0,
      totalBlocks: 3,
    });
    el.textContent = 'hi';
    const range = document.createRange();
    range.setStart(el, 0);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);

    const bs = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    el.dispatchEvent(bs);
    flushSync();
    expect(adapter.dispatchMergeBlocks).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-029 / REQ-BE-009: '/' opens SlashMenu
// PROP-BE-030 / REQ-BE-010: SlashMenu select → dispatchChangeBlockType
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-029 / REQ-BE-009: SlashMenu open via "/"', () => {
  test('"/" pressed ⇒ slash menu element appears', () => {
    const el = mountBlockElement({ block: makeBlock({ content: '' }) });
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    flushSync();
    expect(target.querySelector('[data-testid="slash-menu"]')).not.toBe(null);
  });

  test('content stops starting with "/" ⇒ slash menu closes (EC-BE-003 / FIND-BE-3-004)', () => {
    const el = mountBlockElement({ block: makeBlock({ content: '' }) });
    // open slash menu
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    flushSync();
    expect(target.querySelector('[data-testid="slash-menu"]')).not.toBe(null);
    // user removes the leading slash; oninput fires
    el.textContent = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(target.querySelector('[data-testid="slash-menu"]')).toBe(null);
  });

  test('content "/heading" ⇒ slash menu remains open and filter narrows (EC-BE-002 / FIND-BE-3-004)', () => {
    const el = mountBlockElement({ block: makeBlock({ content: '' }) });
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    flushSync();
    el.textContent = '/heading';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    const menu = target.querySelector('[data-testid="slash-menu"]');
    expect(menu).not.toBe(null);
    const options = menu!.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(options.length).toBe(3);
    const types = Array.from(options).map((b) => b.getAttribute('data-block-type'));
    expect(types).toEqual(['heading-1', 'heading-2', 'heading-3']);
  });
});

describe('PROP-BE-030 / REQ-BE-010: SlashMenu click → dispatchChangeBlockType', () => {
  test('clicking heading-1 entry ⇒ dispatchChangeBlockType with heading-1, slash menu closes', () => {
    const el = mountBlockElement({ block: makeBlock({ content: '' }) });
    el.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    flushSync();
    const heading1Button = target.querySelector<HTMLButtonElement>(
      '[data-testid="slash-menu"] [data-block-type="heading-1"]',
    )!;
    heading1Button.click();
    flushSync();
    expect(adapter.dispatchChangeBlockType).toHaveBeenCalledTimes(1);
    expect(adapter.dispatchChangeBlockType).toHaveBeenCalledWith({
      noteId: 'note-1',
      blockId: 'block-1',
      newType: 'heading-1',
      issuedAt: '2026-05-09T00:00:00Z',
    });
    expect(target.querySelector('[data-testid="slash-menu"]')).toBe(null);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-046 / NFR-BE-006: control char strip
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-046 / NFR-BE-006: control char strip', () => {
  test('paragraph: input "a\\u0001b" → dispatchEditBlockContent content === "ab"', () => {
    const el = mountBlockElement({ block: makeBlock({ type: 'paragraph', content: '' }) });
    el.textContent = 'a\u0001b';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchEditBlockContent).toHaveBeenCalledTimes(1);
    expect(adapter.dispatchEditBlockContent.mock.calls[0]![0]).toEqual({
      noteId: 'note-1',
      blockId: 'block-1',
      content: 'ab',
      issuedAt: '2026-05-09T00:00:00Z',
    });
  });

  test('paragraph: newline strip ("line1\\nline2" → "line1line2")', () => {
    const el = mountBlockElement({ block: makeBlock({ type: 'paragraph', content: '' }) });
    el.textContent = 'line1\nline2';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchEditBlockContent.mock.calls[0]![0].content).toBe('line1line2');
  });

  test('paragraph: U+007F strip', () => {
    const el = mountBlockElement({ block: makeBlock({ type: 'paragraph', content: '' }) });
    el.textContent = 'a\u007Fb';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchEditBlockContent.mock.calls[0]![0].content).toBe('ab');
  });

  test('code: \\n preserved', () => {
    const el = mountBlockElement({ block: makeBlock({ type: 'code', content: '' }) });
    el.textContent = 'line1\nline2';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchEditBlockContent.mock.calls[0]![0].content).toBe('line1\nline2');
  });

  test('code: U+0001 stripped', () => {
    const el = mountBlockElement({ block: makeBlock({ type: 'code', content: '' }) });
    el.textContent = 'a\u0001b';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchEditBlockContent.mock.calls[0]![0].content).toBe('ab');
  });

  test('code: \\t preserved', () => {
    const el = mountBlockElement({ block: makeBlock({ type: 'code', content: '' }) });
    el.textContent = '\tindented';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(adapter.dispatchEditBlockContent.mock.calls[0]![0].content).toBe('\tindented');
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-047 / adapter contract: Promise rejection swallow
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-047 / adapter contract: rejection swallow', () => {
  test('dispatchEditBlockContent rejecting does not throw / not crash', async () => {
    adapter.dispatchEditBlockContent = vi
      .fn()
      .mockRejectedValue(new Error('IPC failed'));
    const el = mountBlockElement({ block: makeBlock({ type: 'paragraph', content: '' }) });
    el.textContent = 'hello';
    expect(() => {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
    }).not.toThrow();
    // give microtask for .catch to swallow
    await new Promise((r) => setTimeout(r, 0));
    expect(adapter.dispatchEditBlockContent).toHaveBeenCalledTimes(1);
  });
});
