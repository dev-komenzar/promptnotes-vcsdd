/**
 * block-drag-handle.dom.vitest.ts — Tier 4 DOM integration tests
 *
 * Sprint 3 of ui-block-editor (Phase 2a Red).
 *
 * Coverage:
 *   PROP-BE-033 / REQ-BE-013 — dragstart triggers isDragging + onDragStart + dataTransfer
 *   PROP-BE-034 / REQ-BE-014 — dragend resets isDragging
 *   REQ-BE-014b — onMoveBlock prop is optional (mountable without it)
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import BlockDragHandle from '$lib/block-editor/BlockDragHandle.svelte';
import type { BlockType } from '$lib/block-editor/types';

let target: HTMLDivElement;
let component: ReturnType<typeof mount> | null = null;
let onDragStart: ReturnType<typeof vi.fn>;
let onMoveBlock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  onDragStart = vi.fn();
  onMoveBlock = vi.fn();
});

afterEach(() => {
  if (component) {
    unmount(component);
    component = null;
  }
  target.remove();
  vi.clearAllMocks();
});

interface BlockProp {
  id: string;
  type: BlockType;
  content: string;
}

function mountHandle(props: { block?: BlockProp; withOptional?: boolean }): HTMLElement {
  const block = props.block ?? { id: 'block-1', type: 'paragraph' as BlockType, content: 'p' };
  const baseProps = {
    block,
    blockIndex: 0,
    totalBlocks: 3,
    noteId: 'note-1',
    issuedAt: () => '2026-05-09T00:00:00Z',
    onDragStart: onDragStart as unknown as ((blockId: string) => void),
  };
  const propsWithOptional = props.withOptional === false
    ? baseProps
    : {
        ...baseProps,
        onMoveBlock: onMoveBlock as unknown as ((payload: {
          noteId: string;
          blockId: string;
          toIndex: number;
          issuedAt: string;
        }) => void),
      };
  component = mount(BlockDragHandle, { target, props: propsWithOptional });
  flushSync();
  return target.querySelector<HTMLElement>('[data-testid="block-drag-handle"]')!;
}

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-033 / REQ-BE-013: dragstart
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-033 / REQ-BE-013: dragstart', () => {
  test('dragstart with mocked dataTransfer ⇒ effectAllowed/setData called', () => {
    const el = mountHandle({});
    const dataTransfer = {
      effectAllowed: 'none',
      setData: vi.fn(),
    };
    // Build a synthetic event with our mock dataTransfer (jsdom lacks native DataTransfer).
    const evt = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(evt, 'dataTransfer', { value: dataTransfer });
    el.dispatchEvent(evt);
    flushSync();
    expect(el.classList.contains('dragging')).toBe(true);
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragStart).toHaveBeenCalledWith('block-1');
    expect(dataTransfer.effectAllowed).toBe('move');
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'block-1');
  });

  test('dragstart with null dataTransfer (EC-BE-006) ⇒ still fires onDragStart + sets isDragging', () => {
    const el = mountHandle({});
    // EC-BE-006: jsdom DragEvent has dataTransfer=null sometimes; component must guard.
    const evt = new Event('dragstart', { bubbles: true });
    el.dispatchEvent(evt);
    flushSync();
    expect(el.classList.contains('dragging')).toBe(true);
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  test('attributes: draggable + role=button + tabindex=0 + aria-label', () => {
    const el = mountHandle({});
    expect(el.getAttribute('draggable')).toBe('true');
    expect(el.getAttribute('role')).toBe('button');
    expect(el.getAttribute('tabindex')).toBe('0');
    expect(el.getAttribute('aria-label')).toBe('ブロックを移動');
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-034 / REQ-BE-014: dragend
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-034 / REQ-BE-014: dragend resets state', () => {
  test('dragend event ⇒ dragging class removed', () => {
    const el = mountHandle({});
    el.dispatchEvent(new Event('dragstart', { bubbles: true }));
    flushSync();
    expect(el.classList.contains('dragging')).toBe(true);

    el.dispatchEvent(new Event('dragend', { bubbles: true }));
    flushSync();
    expect(el.classList.contains('dragging')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────
// REQ-BE-014b: onMoveBlock prop is optional (FIND-BE-1C-007)
// ──────────────────────────────────────────────────────────────────────

describe('REQ-BE-014b: onMoveBlock prop is optional', () => {
  test('component mounts successfully without onMoveBlock prop', () => {
    expect(() => {
      const el = mountHandle({ withOptional: false });
      expect(el).not.toBe(null);
    }).not.toThrow();
  });
});
