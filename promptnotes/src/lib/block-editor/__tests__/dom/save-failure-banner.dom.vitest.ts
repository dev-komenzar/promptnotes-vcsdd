/**
 * save-failure-banner.dom.vitest.ts — Tier 4 DOM integration tests
 *
 * Sprint 3 of ui-block-editor (Phase 2a Red).
 *
 * Coverage:
 *   PROP-BE-035 / REQ-BE-015 — visibility condition (fs.* vs validation.*)
 *   PROP-BE-036 / REQ-BE-016 — 3 action buttons fire respective callbacks
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import SaveFailureBanner from '$lib/block-editor/SaveFailureBanner.svelte';
import type { SaveError } from '$lib/block-editor/types';

let target: HTMLDivElement;
let component: ReturnType<typeof mount> | null = null;
let onRetry: ReturnType<typeof vi.fn>;
let onDiscard: ReturnType<typeof vi.fn>;
let onCancel: ReturnType<typeof vi.fn>;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
  onRetry = vi.fn();
  onDiscard = vi.fn();
  onCancel = vi.fn();
});

afterEach(() => {
  if (component) {
    unmount(component);
    component = null;
  }
  target.remove();
  vi.clearAllMocks();
});

function mountBanner(error: SaveError): HTMLElement | null {
  component = mount(SaveFailureBanner, {
    target,
    props: {
      error,
      priorFocusedBlockId: 'block-1',
      noteId: 'note-1',
      issuedAt: '2026-05-09T00:00:00Z',
      onRetry,
      onDiscard,
      onCancel,
    },
  });
  flushSync();
  return target.querySelector<HTMLElement>('[data-testid="save-failure-banner"]');
}

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-035 / REQ-BE-015: visibility
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-035 / REQ-BE-015: visibility condition', () => {
  test('fs.permission ⇒ banner rendered with permission message', () => {
    const banner = mountBanner({ kind: 'fs', reason: { kind: 'permission' } });
    expect(banner).not.toBe(null);
    expect(banner!.textContent).toContain('保存に失敗しました（権限不足）');
    expect(banner!.getAttribute('role')).toBe('alert');
  });

  test('fs.disk-full ⇒ banner rendered with disk-full message', () => {
    const banner = mountBanner({ kind: 'fs', reason: { kind: 'disk-full' } });
    expect(banner).not.toBe(null);
    expect(banner!.textContent).toContain('ディスク容量不足');
  });

  test('fs.unknown ⇒ banner rendered with generic message', () => {
    const banner = mountBanner({ kind: 'fs', reason: { kind: 'unknown' } });
    expect(banner).not.toBe(null);
    expect(banner!.textContent).toContain('保存に失敗しました');
  });

  test('validation.empty-body-on-idle ⇒ banner NOT rendered', () => {
    const banner = mountBanner({
      kind: 'validation',
      reason: { kind: 'empty-body-on-idle' },
    });
    expect(banner).toBe(null);
  });

  test('validation.invariant-violated ⇒ banner NOT rendered', () => {
    const banner = mountBanner({
      kind: 'validation',
      reason: { kind: 'invariant-violated' },
    });
    expect(banner).toBe(null);
  });
});

// ──────────────────────────────────────────────────────────────────────
// PROP-BE-036 / REQ-BE-016: 3 action buttons
// ──────────────────────────────────────────────────────────────────────

describe('PROP-BE-036 / REQ-BE-016: action buttons', () => {
  test('retry-save-button click ⇒ onRetry called', () => {
    mountBanner({ kind: 'fs', reason: { kind: 'permission' } });
    const btn = target.querySelector<HTMLButtonElement>('[data-testid="retry-save-button"]')!;
    btn.click();
    flushSync();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  test('discard-session-button click ⇒ onDiscard called', () => {
    mountBanner({ kind: 'fs', reason: { kind: 'lock' } });
    const btn = target.querySelector<HTMLButtonElement>('[data-testid="discard-session-button"]')!;
    btn.click();
    flushSync();
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  test('cancel-switch-button click ⇒ onCancel called', () => {
    mountBanner({ kind: 'fs', reason: { kind: 'not-found' } });
    const btn = target.querySelector<HTMLButtonElement>('[data-testid="cancel-switch-button"]')!;
    btn.click();
    flushSync();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
    expect(onDiscard).not.toHaveBeenCalled();
  });
});
