/**
 * slash-menu.dom.vitest.ts — Tier 4 DOM integration tests
 *
 * Sprint 3 of ui-block-editor (Phase 2a Red).
 *
 * Coverage:
 *   PROP-BE-031 / REQ-BE-011 — 9 BlockType entries listed; filter by query
 *   PROP-BE-032 / REQ-BE-012 — keyboard navigation (ArrowDown/Up, Enter, Escape)
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import SlashMenu from '$lib/block-editor/SlashMenu.svelte';
import type { BlockType } from '$lib/block-editor/types';

let target: HTMLDivElement;
let component: ReturnType<typeof mount> | null = null;
let onSelect: ReturnType<typeof vi.fn>;
let onClose: ReturnType<typeof vi.fn>;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  onSelect = vi.fn();
  onClose = vi.fn();
});

afterEach(() => {
  if (component) {
    unmount(component);
    component = null;
  }
  target.remove();
  vi.clearAllMocks();
});

function mountMenu(query: string): HTMLElement {
  component = mount(SlashMenu, {
    target,
    props: { query, onSelect, onClose },
  });
  flushSync();
  return target.querySelector<HTMLElement>('[data-testid="slash-menu"]')!;
}

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-031 / REQ-BE-011: 9 entries + filter
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-031 / REQ-BE-011: SlashMenu — 9 entries listed + filter', () => {
  test('empty query lists 9 BlockType entries', () => {
    const menu = mountMenu('');
    const options = menu.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(options.length).toBe(9);

    const types = Array.from(options).map((b) => b.getAttribute('data-block-type'));
    const expected: BlockType[] = [
      'paragraph',
      'heading-1',
      'heading-2',
      'heading-3',
      'bullet',
      'numbered',
      'code',
      'quote',
      'divider',
    ];
    expect(types).toEqual(expected);
  });

  test('query "heading" filters to 3 heading-* entries', () => {
    const menu = mountMenu('heading');
    const options = menu.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(options.length).toBe(3);
    const types = Array.from(options).map((b) => b.getAttribute('data-block-type'));
    expect(types).toEqual(['heading-1', 'heading-2', 'heading-3']);
  });

  test('query "nomatch" yields 0 entries and shows empty message', () => {
    const menu = mountMenu('nomatch');
    const options = menu.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(options.length).toBe(0);
    const empty = menu.querySelector('.slash-menu-empty');
    expect(empty?.textContent).toBe('結果なし');
  });

  test('attributes: role=listbox, aria-label="ブロックタイプを選択"', () => {
    const menu = mountMenu('');
    expect(menu.getAttribute('role')).toBe('listbox');
    expect(menu.getAttribute('aria-label')).toBe('ブロックタイプを選択');
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-032 / REQ-BE-012: keyboard navigation
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-032 / REQ-BE-012: SlashMenu — keyboard navigation', () => {
  test('initial selectedIndex is 0 (first option has aria-selected="true")', () => {
    const menu = mountMenu('');
    const first = menu.querySelector<HTMLButtonElement>('[role="option"]')!;
    expect(first.getAttribute('aria-selected')).toBe('true');
  });

  test('ArrowDown moves selection to second entry', () => {
    const menu = mountMenu('');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    flushSync();
    const options = menu.querySelectorAll<HTMLButtonElement>('[role="option"]');
    expect(options[1]!.getAttribute('aria-selected')).toBe('true');
    expect(options[0]!.getAttribute('aria-selected')).toBe('false');
  });

  test('ArrowDown clamps at last entry (no wrap)', () => {
    const menu = mountMenu('');
    for (let i = 0; i < 20; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    }
    flushSync();
    const options = menu.querySelectorAll<HTMLButtonElement>('[role="option"]');
    const last = options[options.length - 1]!;
    expect(last.getAttribute('aria-selected')).toBe('true');
  });

  test('ArrowUp clamps at first entry (no wrap)', () => {
    mountMenu('');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    flushSync();
    const first = target.querySelector<HTMLButtonElement>('[role="option"]')!;
    expect(first.getAttribute('aria-selected')).toBe('true');
  });

  test('Enter on selected entry ⇒ onSelect called with that BlockType', () => {
    mountMenu('');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    flushSync();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('paragraph');
  });

  test('ArrowDown then Enter ⇒ onSelect called with second BlockType', () => {
    mountMenu('');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    flushSync();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    flushSync();
    expect(onSelect).toHaveBeenCalledWith('heading-1');
  });

  test('Escape ⇒ onClose called', () => {
    mountMenu('');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    flushSync();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('click on heading-2 entry ⇒ onSelect called with "heading-2"', () => {
    const menu = mountMenu('');
    const heading2 = menu.querySelector<HTMLButtonElement>('[data-block-type="heading-2"]')!;
    heading2.click();
    flushSync();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('heading-2');
  });
});
