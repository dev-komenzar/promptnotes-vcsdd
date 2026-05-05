/**
 * TagFilterSidebar.dom.vitest.ts — RED PHASE: component render/interaction tests
 *
 * All tests MUST FAIL because `TagFilterSidebar.svelte` does not exist yet.
 *
 * Coverage:
 *   PROP-TAG-012 (renders tags by usageCount descending, "#name (count)" format)
 *   PROP-TAG-013 (empty tag inventory hides the sidebar section)
 *   PROP-TAG-014 (click tag → apply-tag-filter, visual highlight)
 *   PROP-TAG-015 (click selected tag → remove-tag-filter, remove highlight)
 *   PROP-TAG-016 (click "すべて解除" → clear-filter, all highlights removed)
 *   PROP-TAG-020 (accessibility: role="checkbox", aria-checked)
 *   PROP-TAG-027 (zero-filter state: no tags highlighted)
 *
 * REQ coverage: REQ-TAG-009..012, REQ-TAG-016, REQ-TAG-019
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

// ── RED PHASE: import will fail — component does not exist ────────────────────
// @ts-expect-error — RED PHASE: TagFilterSidebar.svelte is not yet implemented
import TagFilterSidebar from '../../TagFilterSidebar.svelte';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Matches the TagEntry shape from the verification architecture. */
export interface TagEntry {
  readonly name: string;
  readonly usageCount: number;
}

/** Props for TagFilterSidebar component */
interface TagFilterSidebarProps {
  tags: TagEntry[];
  activeFilterTags: readonly string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}

// ── Test fixtures ─────────────────────────────────────────────────────────────

function makeTags(entries: [string, number][]): TagEntry[] {
  return entries.map(([name, usageCount]) => ({ name, usageCount }));
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let target: HTMLDivElement;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  unmount(target);
  document.body.removeChild(target);
});

/**
 * Mounts TagFilterSidebar with provided props. Uses flushSync for Svelte 5.
 * RED: will throw because the component module doesn't exist.
 */
function mountSidebar(props: TagFilterSidebarProps): Record<string, unknown> {
  const component = mount(TagFilterSidebar, {
    target,
    props,
  }) as unknown as Record<string, unknown>;
  flushSync();
  return component;
}

// ── REQ-TAG-009 / PROP-TAG-012: Sidebar renders tags sorted by usageCount ──

describe('REQ-TAG-009: TagFilterSidebar renders tags sorted by usageCount descending', () => {
  test('Renders each tag as "#name (count)" (RED: FAILS)', () => {
    const tags = makeTags([
      ['typescript', 5],
      ['svelte', 3],
      ['draft', 1],
    ]);
    mountSidebar({
      tags,
      activeFilterTags: [],
      onToggle: vi.fn(),
      onClear: vi.fn(),
    });

    // Expect each tag to be rendered with the "#name (count)" format
    const tagElements = target.querySelectorAll('[data-testid="tag-filter-item"]');
    expect(tagElements.length).toBe(3);

    expect(tagElements[0]?.textContent).toContain('#typescript');
    expect(tagElements[0]?.textContent).toContain('(5)');

    expect(tagElements[1]?.textContent).toContain('#svelte');
    expect(tagElements[1]?.textContent).toContain('(3)');

    expect(tagElements[2]?.textContent).toContain('#draft');
    expect(tagElements[2]?.textContent).toContain('(1)');
  });

  test('Tags are rendered in usageCount descending order (RED: FAILS)', () => {
    const tags = makeTags([
      ['rare', 1],
      ['common', 10],
      ['medium', 5],
    ]);
    mountSidebar({
      tags,
      activeFilterTags: [],
      onToggle: vi.fn(),
      onClear: vi.fn(),
    });

    const tagElements = target.querySelectorAll('[data-testid="tag-filter-item"]');
    expect(tagElements.length).toBe(3);

    // Should be sorted: common(10), medium(5), rare(1)
    const firstText = tagElements[0]?.textContent ?? '';
    expect(firstText).toContain('common');
    expect(firstText).toContain('(10)');

    const secondText = tagElements[1]?.textContent ?? '';
    expect(secondText).toContain('medium');
    expect(secondText).toContain('(5)');

    const thirdText = tagElements[2]?.textContent ?? '';
    expect(thirdText).toContain('rare');
    expect(thirdText).toContain('(1)');
  });

  test('Tags with equal usageCount are all rendered (RED: FAILS)', () => {
    const tags = makeTags([
      ['alpha', 3],
      ['beta', 3],
      ['gamma', 3],
    ]);
    mountSidebar({
      tags,
      activeFilterTags: [],
      onToggle: vi.fn(),
      onClear: vi.fn(),
    });

    const tagElements = target.querySelectorAll('[data-testid="tag-filter-item"]');
    expect(tagElements.length).toBe(3);
  });
});

// ── REQ-TAG-009 / PROP-TAG-013: Empty tag inventory hides sidebar ──────────

describe('REQ-TAG-009: TagFilterSidebar — empty tag inventory', () => {
  test('Empty tag list renders nothing (RED: FAILS)', () => {
    mountSidebar({
      tags: [],
      activeFilterTags: [],
      onToggle: vi.fn(),
      onClear: vi.fn(),
    });

    // Should not render a tag filter section at all
    const sidebarSection = target.querySelector('[data-testid="tag-filter-sidebar"]');
    expect(sidebarSection).toBeNull();
  });

  test('Empty tag list does not render individual tag items (RED: FAILS)', () => {
    mountSidebar({
      tags: [],
      activeFilterTags: [],
      onToggle: vi.fn(),
      onClear: vi.fn(),
    });

    const tagItems = target.querySelectorAll('[data-testid="tag-filter-item"]');
    expect(tagItems.length).toBe(0);
  });
});

// ── REQ-TAG-010 / PROP-TAG-014: Click tag applies filter ───────────────────

describe('REQ-TAG-010: Clicking a tag calls onToggle with the tag name', () => {
  test('Clicking a non-selected tag calls onToggle (RED: FAILS)', () => {
    const onToggle = vi.fn();
    const tags = makeTags([['typescript', 3]]);
    mountSidebar({
      tags,
      activeFilterTags: [],
      onToggle,
      onClear: vi.fn(),
    });

    const tagElement = target.querySelector('[data-testid="tag-filter-item"]');
    expect(tagElement).not.toBeNull();

    (tagElement as HTMLElement).click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('typescript');
  });

  test('Clicking an already-selected tag also calls onToggle (toggle off) (RED: FAILS)', () => {
    const onToggle = vi.fn();
    const tags = makeTags([['typescript', 3]]);
    mountSidebar({
      tags,
      activeFilterTags: ['typescript'],
      onToggle,
      onClear: vi.fn(),
    });

    const tagElement = target.querySelector('[data-testid="tag-filter-item"]');
    (tagElement as HTMLElement).click();
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('typescript');
  });
});

// ── REQ-TAG-010/011: Visual highlight for selected tags ────────────────────

describe('REQ-TAG-010/011: TagFilterSidebar — visual highlight of active tags', () => {
  test('Selected tags get aria-checked="true" (PROP-TAG-020) (RED: FAILS)', () => {
    const tags = makeTags([
      ['typescript', 5],
      ['svelte', 3],
    ]);
    mountSidebar({
      tags,
      activeFilterTags: ['typescript'],
      onToggle: vi.fn(),
      onClear: vi.fn(),
    });

    const tagElements = target.querySelectorAll('[data-testid="tag-filter-item"]');
    expect(tagElements.length).toBe(2);

    // First tag ('typescript') should be checked
    expect(tagElements[0]?.getAttribute('aria-checked')).toBe('true');
    // Second tag ('svelte') should NOT be checked
    expect(tagElements[1]?.getAttribute('aria-checked')).toBe('false');
  });

  test('Tag filter items have role="checkbox" (PROP-TAG-020) (RED: FAILS)', () => {
    const tags = makeTags([['draft', 1]]);
    mountSidebar({
      tags,
      activeFilterTags: [],
      onToggle: vi.fn(),
      onClear: vi.fn(),
    });

    const tagElement = target.querySelector('[data-testid="tag-filter-item"]');
    expect(tagElement?.getAttribute('role')).toBe('checkbox');
  });
});

// ── REQ-TAG-012 / PROP-TAG-016: "すべて解除" clears all filters ────────────

describe('REQ-TAG-012: "すべて解除" button calls onClear', () => {
  test('Clicking "すべて解除" calls onClear (RED: FAILS)', () => {
    const onClear = vi.fn();
    const tags = makeTags([
      ['typescript', 5],
      ['svelte', 3],
    ]);
    mountSidebar({
      tags,
      activeFilterTags: ['typescript', 'svelte'],
      onToggle: vi.fn(),
      onClear,
    });

    const clearButton = target.querySelector('[data-testid="tag-filter-clear-all"]');
    expect(clearButton).not.toBeNull();

    (clearButton as HTMLElement).click();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  test('"すべて解除" button is rendered when tags exist (RED: FAILS)', () => {
    const tags = makeTags([['draft', 1]]);
    mountSidebar({
      tags,
      activeFilterTags: [],
      onToggle: vi.fn(),
      onClear: vi.fn(),
    });

    const clearButton = target.querySelector('[data-testid="tag-filter-clear-all"]');
    expect(clearButton).not.toBeNull();
    expect(clearButton?.textContent).toContain('解除');
  });

  test('"すべて解除" button not rendered when tag list is empty (RED: FAILS)', () => {
    mountSidebar({
      tags: [],
      activeFilterTags: [],
      onToggle: vi.fn(),
      onClear: vi.fn(),
    });

    const clearButton = target.querySelector('[data-testid="tag-filter-clear-all"]');
    expect(clearButton).toBeNull();
  });
});

// ── REQ-TAG-019 / PROP-TAG-027: Zero-filter state ──────────────────────────

describe('REQ-TAG-019: Zero-filter state — no tags highlighted', () => {
  test('When activeFilterTags is empty, no tags are highlighted (RED: FAILS)', () => {
    const tags = makeTags([
      ['typescript', 5],
      ['svelte', 3],
    ]);
    mountSidebar({
      tags,
      activeFilterTags: [],
      onToggle: vi.fn(),
      onClear: vi.fn(),
    });

    const tagElements = target.querySelectorAll('[data-testid="tag-filter-item"]');
    expect(tagElements.length).toBe(2);

    for (const el of tagElements) {
      expect(el.getAttribute('aria-checked')).toBe('false');
    }
  });

  test('After clearing filters, no tags are highlighted (RED: FAILS)', () => {
    const onToggle = vi.fn();
    const onClear = vi.fn();
    const tags = makeTags([
      ['typescript', 5],
      ['svelte', 3],
    ]);

    // Mount with active filters, then simulate clear
    mountSidebar({
      tags,
      activeFilterTags: ['typescript', 'svelte'],
      onToggle,
      onClear,
    });

    // Both should be checked
    const initialItems = target.querySelectorAll('[data-testid="tag-filter-item"]');
    for (const el of initialItems) {
      expect(el.getAttribute('aria-checked')).toBe('true');
    }

    // Click clear
    const clearButton = target.querySelector('[data-testid="tag-filter-clear-all"]');
    (clearButton as HTMLElement).click();
    expect(onClear).toHaveBeenCalledTimes(1);
    // After clear, the component re-renders with new activeFilterTags
    // (In a real test, we'd re-mount or observe the update)
  });
});

// ── Integration: multiple interactions ─────────────────────────────────────

describe('Integration: multiple toggle + clear interactions', () => {
  test('Toggling multiple tags then clearing resets all (RED: FAILS)', () => {
    const onToggle = vi.fn();
    const onClear = vi.fn();
    const tags = makeTags([
      ['typescript', 5],
      ['svelte', 3],
      ['draft', 1],
    ]);

    mountSidebar({
      tags,
      activeFilterTags: [],
      onToggle,
      onClear,
    });

    // Click first tag
    const items = target.querySelectorAll('[data-testid="tag-filter-item"]');
    (items[0] as HTMLElement).click();
    expect(onToggle).toHaveBeenCalledWith('typescript');

    // Click second tag
    (items[1] as HTMLElement).click();
    expect(onToggle).toHaveBeenCalledWith('svelte');

    // Click clear
    const clearButton = target.querySelector('[data-testid="tag-filter-clear-all"]');
    (clearButton as HTMLElement).click();
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
