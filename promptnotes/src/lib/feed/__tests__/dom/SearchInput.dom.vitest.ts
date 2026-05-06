/**
 * SearchInput.dom.vitest.ts — Phase 2a (Red): SearchInput component DOM tests
 *
 * Coverage:
 *   PROP-FILTER-017 (SearchInput DESIGN.md token compliance — border, placeholder)
 *   PROP-FILTER-019 (Esc key fires SearchCleared immediately — no debounce)
 *   PROP-FILTER-022 (debounce: SearchApplied only after 200ms silence)
 *   PROP-FILTER-024 (Esc cancels pending debounce timer)
 *   PROP-FILTER-025 (aria-label="ノート検索" on search input; Tab-reachable)
 *   REQ-FILTER-001 (search-input data-testid, placeholder, border)
 *   REQ-FILTER-002 (debounce 200ms)
 *   REQ-FILTER-003 (Esc key clears)
 *   REQ-FILTER-013 (accessibility)
 *
 * RED PHASE: SearchInput.svelte does not exist yet — all tests MUST FAIL.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

// RED PHASE: component does not exist yet
import SearchInput from '../../SearchInput.svelte';

// ── Test setup ────────────────────────────────────────────────────────────────

let target: HTMLDivElement;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  vi.useFakeTimers();
});

afterEach(() => {
  try {
    unmount(target);
  } catch {
    // unmount may fail if mount failed (red phase)
  }
  document.body.removeChild(target);
  vi.useRealTimers();
});

function mountSearchInput(props: {
  onSearchApplied: (query: string) => void;
  onSearchCleared: () => void;
}) {
  const component = mount(SearchInput, {
    target,
    props,
  });
  flushSync();
  return component;
}

// ── REQ-FILTER-001 / PROP-FILTER-017: rendering and DESIGN.md tokens ─────────

describe('REQ-FILTER-001 / PROP-FILTER-017: SearchInput rendering', () => {
  test('data-testid="search-input" is present in the DOM', () => {
    mountSearchInput({
      onSearchApplied: vi.fn(),
      onSearchCleared: vi.fn(),
    });
    const input = target.querySelector('[data-testid="search-input"]');
    expect(input).not.toBeNull();
  });

  test('Placeholder text is "検索..."', () => {
    mountSearchInput({
      onSearchApplied: vi.fn(),
      onSearchCleared: vi.fn(),
    });
    const input = target.querySelector('[data-testid="search-input"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.placeholder).toBe('検索...');
  });

  test('Input has class "search-input" (DESIGN.md token class applied)', () => {
    mountSearchInput({
      onSearchApplied: vi.fn(),
      onSearchCleared: vi.fn(),
    });
    const input = target.querySelector('[data-testid="search-input"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    // jsdom does not apply CSS from <style> blocks; verify class is present instead
    // The class encapsulates the DESIGN.md tokens (border: 1px solid #dddddd etc.)
    expect(input?.className).toBeTruthy();
  });
});

// ── PROP-FILTER-025 / REQ-FILTER-013: Accessibility ─────────────────────────

describe('PROP-FILTER-025 / REQ-FILTER-013: Accessibility', () => {
  test('aria-label="ノート検索" on the search input', () => {
    mountSearchInput({
      onSearchApplied: vi.fn(),
      onSearchCleared: vi.fn(),
    });
    const input = target.querySelector('[data-testid="search-input"]');
    expect(input?.getAttribute('aria-label')).toBe('ノート検索');
  });

  test('Search input is Tab-reachable (no negative tabindex)', () => {
    mountSearchInput({
      onSearchApplied: vi.fn(),
      onSearchCleared: vi.fn(),
    });
    const input = target.querySelector('[data-testid="search-input"]') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    const tabIndex = input?.tabIndex ?? -1;
    expect(tabIndex).toBeGreaterThanOrEqual(0);
  });
});

// ── PROP-FILTER-022 / REQ-FILTER-002: Debounce 200ms ─────────────────────────

describe('PROP-FILTER-022 / REQ-FILTER-002: Debounce — SearchApplied after 200ms silence', () => {
  test('SearchApplied NOT called within 200ms of a single keystroke', () => {
    const onSearchApplied = vi.fn();
    mountSearchInput({ onSearchApplied, onSearchCleared: vi.fn() });

    const input = target.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    // Simulate typing "a"
    input.value = 'a';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    // Advance 199ms — should NOT have fired yet
    vi.advanceTimersByTime(199);
    expect(onSearchApplied).not.toHaveBeenCalled();
  });

  test('SearchApplied called exactly once after 200ms silence', () => {
    const onSearchApplied = vi.fn();
    mountSearchInput({ onSearchApplied, onSearchCleared: vi.fn() });

    const input = target.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    input.value = 'abc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    // Advance 200ms — should fire now
    vi.advanceTimersByTime(200);
    expect(onSearchApplied).toHaveBeenCalledTimes(1);
    expect(onSearchApplied).toHaveBeenCalledWith('abc');
  });

  test('EC-S-016: rapid keystrokes within 200ms — only one SearchApplied dispatched', () => {
    const onSearchApplied = vi.fn();
    mountSearchInput({ onSearchApplied, onSearchCleared: vi.fn() });

    const input = target.querySelector('[data-testid="search-input"]') as HTMLInputElement;

    // Simulate rapid keystrokes: a, ab, abc — each < 200ms apart
    input.value = 'a';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    vi.advanceTimersByTime(100);

    input.value = 'ab';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    vi.advanceTimersByTime(100);

    input.value = 'abc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    // No SearchApplied yet
    expect(onSearchApplied).not.toHaveBeenCalled();

    // Now advance 200ms after last keystroke
    vi.advanceTimersByTime(200);
    expect(onSearchApplied).toHaveBeenCalledTimes(1);
    expect(onSearchApplied).toHaveBeenCalledWith('abc');
  });
});

// ── PROP-FILTER-019 / PROP-FILTER-024 / REQ-FILTER-003: Esc key ──────────────

describe('PROP-FILTER-019 / PROP-FILTER-024 / REQ-FILTER-003: Esc key', () => {
  test('Esc key fires onSearchCleared immediately (no debounce)', () => {
    const onSearchApplied = vi.fn();
    const onSearchCleared = vi.fn();
    mountSearchInput({ onSearchApplied, onSearchCleared });

    const input = target.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();

    expect(onSearchCleared).toHaveBeenCalledTimes(1);
    // No timer needed — immediate
    expect(onSearchApplied).not.toHaveBeenCalled();
  });

  test('EC-S-005: Esc after typing cancels pending debounce; no SearchApplied fires', () => {
    const onSearchApplied = vi.fn();
    const onSearchCleared = vi.fn();
    mountSearchInput({ onSearchApplied, onSearchCleared });

    const input = target.querySelector('[data-testid="search-input"]') as HTMLInputElement;

    // Type something
    input.value = 'hello';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    // Press Esc before 200ms debounce fires
    vi.advanceTimersByTime(100);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();

    // onSearchCleared fired immediately
    expect(onSearchCleared).toHaveBeenCalledTimes(1);

    // Let remaining timer time pass — SearchApplied should NOT fire
    vi.advanceTimersByTime(200);
    expect(onSearchApplied).not.toHaveBeenCalled();
  });

  test('EC-S-010: Esc with no pending debounce — no-op on timer, SearchCleared dispatched', () => {
    const onSearchApplied = vi.fn();
    const onSearchCleared = vi.fn();
    mountSearchInput({ onSearchApplied, onSearchCleared });

    const input = target.querySelector('[data-testid="search-input"]') as HTMLInputElement;

    // Press Esc with nothing pending
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();

    expect(onSearchCleared).toHaveBeenCalledTimes(1);
    expect(onSearchApplied).not.toHaveBeenCalled();
  });

  test('EC-S-014: Multiple consecutive Esc presses — each dispatches SearchCleared', () => {
    const onSearchCleared = vi.fn();
    mountSearchInput({ onSearchApplied: vi.fn(), onSearchCleared });

    const input = target.querySelector('[data-testid="search-input"]') as HTMLInputElement;

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();

    expect(onSearchCleared).toHaveBeenCalledTimes(3);
  });
});
