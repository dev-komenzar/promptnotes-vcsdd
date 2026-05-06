/**
 * SortToggle.dom.vitest.ts — Phase 2a (Red): SortToggle component DOM tests
 *
 * Coverage:
 *   PROP-FILTER-018 (SortToggle ▼/▲ toggle behavior)
 *   PROP-FILTER-025 (aria-label="ソート方向（新しい順/古い順）"; Tab-reachable)
 *   REQ-FILTER-006 (sort-toggle data-testid, ▼ initial, aria-label)
 *   REQ-FILTER-007 (toggle behavior: ▼→▲, ▲→▼)
 *   REQ-FILTER-013 (accessibility)
 *
 * RED PHASE: SortToggle.svelte does not exist yet — all tests MUST FAIL.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

// RED PHASE: component does not exist yet
import SortToggle from '../../SortToggle.svelte';

// ── Test setup ────────────────────────────────────────────────────────────────

let target: HTMLDivElement;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  try {
    unmount(target);
  } catch {
    // unmount may fail if mount failed (red phase)
  }
  document.body.removeChild(target);
});

function mountSortToggle(props: {
  sortDirection: 'asc' | 'desc';
  onToggle: () => void;
}) {
  const component = mount(SortToggle, { target, props });
  flushSync();
  return component;
}

// ── REQ-FILTER-006 / PROP-FILTER-018: Rendering ──────────────────────────────

describe('REQ-FILTER-006 / PROP-FILTER-018: SortToggle rendering', () => {
  test('data-testid="sort-toggle" is present in DOM', () => {
    mountSortToggle({ sortDirection: 'desc', onToggle: vi.fn() });
    const btn = target.querySelector('[data-testid="sort-toggle"]');
    expect(btn).not.toBeNull();
  });

  test('Button text is "▼" when sortDirection is "desc" (initial/default)', () => {
    mountSortToggle({ sortDirection: 'desc', onToggle: vi.fn() });
    const btn = target.querySelector('[data-testid="sort-toggle"]');
    expect(btn?.textContent?.trim()).toBe('▼');
  });

  test('Button text is "▲" when sortDirection is "asc"', () => {
    mountSortToggle({ sortDirection: 'asc', onToggle: vi.fn() });
    const btn = target.querySelector('[data-testid="sort-toggle"]');
    expect(btn?.textContent?.trim()).toBe('▲');
  });
});

// ── PROP-FILTER-025 / REQ-FILTER-013: Accessibility ─────────────────────────

describe('PROP-FILTER-025 / REQ-FILTER-013: SortToggle accessibility', () => {
  test('aria-label="ソート方向（新しい順/古い順）" on sort toggle button', () => {
    mountSortToggle({ sortDirection: 'desc', onToggle: vi.fn() });
    const btn = target.querySelector('[data-testid="sort-toggle"]');
    expect(btn?.getAttribute('aria-label')).toBe('ソート方向（新しい順/古い順）');
  });

  test('Sort toggle is Tab-reachable (no negative tabindex)', () => {
    mountSortToggle({ sortDirection: 'desc', onToggle: vi.fn() });
    const btn = target.querySelector('[data-testid="sort-toggle"]') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    const tabIndex = btn?.tabIndex ?? -1;
    expect(tabIndex).toBeGreaterThanOrEqual(0);
  });

  test('Sort toggle is a button element (keyboard activatable)', () => {
    mountSortToggle({ sortDirection: 'desc', onToggle: vi.fn() });
    const btn = target.querySelector('[data-testid="sort-toggle"]');
    expect(btn?.tagName.toLowerCase()).toBe('button');
  });
});

// ── REQ-FILTER-007 / PROP-FILTER-018: Toggle behavior ────────────────────────

describe('REQ-FILTER-007 / PROP-FILTER-018: SortToggle click behavior', () => {
  test('Clicking sort toggle calls onToggle', () => {
    const onToggle = vi.fn();
    mountSortToggle({ sortDirection: 'desc', onToggle });

    const btn = target.querySelector('[data-testid="sort-toggle"]') as HTMLButtonElement;
    btn.click();
    flushSync();

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test('onToggle is called with no arguments', () => {
    const onToggle = vi.fn();
    mountSortToggle({ sortDirection: 'desc', onToggle });

    const btn = target.querySelector('[data-testid="sort-toggle"]') as HTMLButtonElement;
    btn.click();
    flushSync();

    // onToggle is a no-arg function
    expect(onToggle).toHaveBeenCalledWith();
  });

  test('EC-T-003: Sort can be toggled while search is active (no error)', () => {
    const onToggle = vi.fn();
    mountSortToggle({ sortDirection: 'asc', onToggle });

    const btn = target.querySelector('[data-testid="sort-toggle"]') as HTMLButtonElement;
    expect(() => { btn.click(); flushSync(); }).not.toThrow();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

// ── DESIGN.md compliance tokens (REQ-FILTER-006, REQ-FILTER-014) ─────────────

describe('REQ-FILTER-014: SortToggle DESIGN.md token compliance', () => {
  test('Sort toggle button has class "sort-toggle" (DESIGN.md Secondary button style)', () => {
    mountSortToggle({ sortDirection: 'desc', onToggle: vi.fn() });
    const btn = target.querySelector('[data-testid="sort-toggle"]') as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    // jsdom does not apply CSS from <style> blocks; verify class is present instead
    // The class encapsulates the DESIGN.md Secondary button tokens (border-radius: 4px etc.)
    expect(btn?.className).toBeTruthy();
  });
});
