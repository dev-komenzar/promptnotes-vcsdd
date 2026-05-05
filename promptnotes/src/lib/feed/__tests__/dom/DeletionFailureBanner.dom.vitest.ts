/**
 * DeletionFailureBanner.dom.vitest.ts — Integration (DOM) tests for DeletionFailureBanner.svelte
 *
 * Coverage:
 *   PROP-FEED-019 (banner present: data-testid="deletion-failure-banner" + role="alert")
 *   PROP-FEED-019 (retry button → dispatchConfirmNoteDeletion 1×)
 *   PROP-FEED-028 (banner text matches reason-specific messages from REQ-FEED-014)
 *
 * REQ coverage: REQ-FEED-014
 * EC coverage: EC-FEED-007, EC-FEED-008, EC-FEED-009
 *
 * RED PHASE: DeletionFailureBanner.svelte renders nothing (<!-- not implemented -->) so all
 * querySelector assertions will fail.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import DeletionFailureBanner from '../../DeletionFailureBanner.svelte';
import type { TauriFeedAdapter } from '../../tauriFeedAdapter.js';
import type { NoteDeletionFailureReason } from '../../types.js';

// ── Mock factory ──────────────────────────────────────────────────────────────

function makeMockAdapter(): TauriFeedAdapter & Record<string, ReturnType<typeof vi.fn>> {
  return {
    dispatchSelectPastNote: vi.fn().mockResolvedValue(undefined),
    dispatchRequestNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchConfirmNoteDeletion: vi.fn().mockResolvedValue(undefined),
    dispatchCancelNoteDeletion: vi.fn().mockResolvedValue(undefined),
  };
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let target: HTMLDivElement;

beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  document.body.innerHTML = '';
});

// ── PROP-FEED-019: Banner DOM presence ───────────────────────────────────────

describe('PROP-FEED-019 / REQ-FEED-014: DeletionFailureBanner DOM presence', () => {
  test('data-testid="deletion-failure-banner" is present after mount', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeletionFailureBanner, {
      target,
      props: { reason: 'permission', noteId: 'note-001', adapter },
    });
    flushSync();

    const banner = target.querySelector('[data-testid="deletion-failure-banner"]');
    expect(banner).not.toBeNull();

    unmount(app);
  });

  test('banner has role="alert" (NFR-FEED-002)', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeletionFailureBanner, {
      target,
      props: { reason: 'permission', noteId: 'note-001', adapter },
    });
    flushSync();

    const banner = target.querySelector('[role="alert"]');
    expect(banner).not.toBeNull();

    unmount(app);
  });
});

// ── PROP-FEED-019: Retry button dispatches ConfirmNoteDeletion ────────────────

describe('PROP-FEED-019 / REQ-FEED-014: retry button dispatches ConfirmNoteDeletion', () => {
  test('retry button click calls dispatchConfirmNoteDeletion 1× with noteId', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeletionFailureBanner, {
      target,
      props: { reason: 'lock', noteId: 'note-001', adapter },
    });
    flushSync();

    const retryBtn = target.querySelector('[data-testid="retry-delete-button"]') as HTMLButtonElement | null;
    expect(retryBtn).not.toBeNull();
    retryBtn!.click();
    flushSync();

    expect(adapter.dispatchConfirmNoteDeletion).toHaveBeenCalledTimes(1);
    // FIND-S2-01: adapter now takes (noteId, filePath, vaultPath, issuedAt).
    // DeletionFailureBanner fallback path uses noteId as filePath, '' for vaultPath.
    expect(adapter.dispatchConfirmNoteDeletion).toHaveBeenCalledWith('note-001', 'note-001', '', expect.any(String));

    unmount(app);
  });
});

// ── PROP-FEED-028: Banner text matches reason ─────────────────────────────────

describe('PROP-FEED-028 / REQ-FEED-014: banner text matches error reason', () => {
  const cases: Array<{ reason: NoteDeletionFailureReason; detail?: string; expectedText: string }> = [
    { reason: 'permission', expectedText: '削除に失敗しました（権限不足）' },
    { reason: 'lock', expectedText: '削除に失敗しました（ファイルがロック中）' },
    { reason: 'unknown', expectedText: '削除に失敗しました' },
    { reason: 'unknown', detail: 'disk-full', expectedText: '削除に失敗しました（disk-full）' },
  ];

  for (const { reason, detail, expectedText } of cases) {
    test(`banner text for reason="${reason}" detail="${detail}" contains "${expectedText}"`, () => {
      const adapter = makeMockAdapter();
      const app = mount(DeletionFailureBanner, {
        target,
        props: { reason, detail, noteId: 'note-001', adapter },
      });
      flushSync();

      expect(target.textContent).toContain(expectedText);

      unmount(app);
    });
  }

  test('banner for permission contains 「権限不足」 (EC-FEED-007)', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeletionFailureBanner, {
      target,
      props: { reason: 'permission', noteId: 'note-001', adapter },
    });
    flushSync();

    expect(target.textContent).toContain('権限不足');

    unmount(app);
  });

  test('banner for lock contains 「ロック」 (EC-FEED-008)', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeletionFailureBanner, {
      target,
      props: { reason: 'lock', noteId: 'note-001', adapter },
    });
    flushSync();

    expect(target.textContent).toContain('ロック');

    unmount(app);
  });

  test('banner for unknown+disk-full contains detail string (EC-FEED-009)', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeletionFailureBanner, {
      target,
      props: { reason: 'unknown', detail: 'disk-full', noteId: 'note-001', adapter },
    });
    flushSync();

    expect(target.textContent).toContain('disk-full');

    unmount(app);
  });
});
