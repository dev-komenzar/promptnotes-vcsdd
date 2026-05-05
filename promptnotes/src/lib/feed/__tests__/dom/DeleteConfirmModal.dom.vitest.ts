/**
 * DeleteConfirmModal.dom.vitest.ts — Integration (DOM) tests for DeleteConfirmModal.svelte
 *
 * Coverage:
 *   PROP-FEED-016 (modal text "OS のゴミ箱"; data-testid="confirm-delete-button")
 *   PROP-FEED-017 (Esc key → dispatchCancelNoteDeletion 1×, modal closes)
 *   PROP-FEED-018 (Backdrop click → dispatchCancelNoteDeletion 1×)
 *   PROP-FEED-020 (confirm button click → dispatchConfirmNoteDeletion 1×)
 *   PROP-FEED-021 (cancel button → dispatchCancelNoteDeletion 1×)
 *   PROP-FEED-029 (role="dialog" + aria-labelledby on modal)
 *
 * REQ coverage: REQ-FEED-011, REQ-FEED-012
 * EC coverage: EC-FEED-011, EC-FEED-012
 *
 * RED PHASE: DeleteConfirmModal.svelte renders nothing (<!-- not implemented -->) so all
 * querySelector assertions will fail.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import DeleteConfirmModal from '../../DeleteConfirmModal.svelte';
import type { TauriFeedAdapter } from '../../tauriFeedAdapter.js';

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

// ── PROP-FEED-016: Modal text and structure ────────────────────────────────────

describe('PROP-FEED-016 / REQ-FEED-012: modal content and structure', () => {
  test('modal body contains "OS のゴミ箱" text', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeleteConfirmModal, { target, props: { noteId: 'note-001', adapter } });
    flushSync();

    expect(target.textContent).toContain('OS のゴミ箱');

    unmount(app);
  });

  /**
   * FIND-001 fix: spec mandates '後で復元できます' (can be restored later).
   * Prior impl had '取り消せません' (cannot be undone) — opposite user contract.
   */
  test('FIND-001: modal body contains "後で復元できます" (REQ-FEED-012 spec wording)', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeleteConfirmModal, { target, props: { noteId: 'note-001', adapter } });
    flushSync();

    expect(target.textContent).toContain('後で復元できます');
    expect(target.textContent).not.toContain('取り消せません');

    unmount(app);
  });

  /**
   * FIND-002 fix: spec mandates '削除（OS ゴミ箱に送る）' as confirm button label.
   * Prior impl had '削除する' — user could not distinguish from hard-delete.
   */
  test('FIND-002: confirm button label is "削除（OS ゴミ箱に送る）" (REQ-FEED-012)', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeleteConfirmModal, { target, props: { noteId: 'note-001', adapter } });
    flushSync();

    const confirmBtn = target.querySelector('[data-testid="confirm-delete-button"]');
    expect(confirmBtn).not.toBeNull();
    expect(confirmBtn!.textContent?.trim()).toBe('削除（OS ゴミ箱に送る）');

    unmount(app);
  });

  /**
   * FIND-009 fix: in-flight guard prevents double-dispatch on rapid clicks.
   */
  test('FIND-009: rapid double-click on confirm does not dispatch twice', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeleteConfirmModal, { target, props: { noteId: 'note-001', adapter } });
    flushSync();

    const confirmBtn = target.querySelector('[data-testid="confirm-delete-button"]') as HTMLButtonElement | null;
    expect(confirmBtn).not.toBeNull();
    confirmBtn!.click();
    confirmBtn!.click();
    flushSync();

    // Should only dispatch once despite two rapid clicks
    expect(adapter.dispatchConfirmNoteDeletion).toHaveBeenCalledTimes(1);

    unmount(app);
  });

  test('data-testid="confirm-delete-button" is present', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeleteConfirmModal, { target, props: { noteId: 'note-001', adapter } });
    flushSync();

    const confirmBtn = target.querySelector('[data-testid="confirm-delete-button"]');
    expect(confirmBtn).not.toBeNull();

    unmount(app);
  });

  test('data-testid="delete-confirm-modal" is present', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeleteConfirmModal, { target, props: { noteId: 'note-001', adapter } });
    flushSync();

    const modal = target.querySelector('[data-testid="delete-confirm-modal"]');
    expect(modal).not.toBeNull();

    unmount(app);
  });

  test('modal has role="dialog" (NFR-FEED-002)', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeleteConfirmModal, { target, props: { noteId: 'note-001', adapter } });
    flushSync();

    const modal = target.querySelector('[role="dialog"]');
    expect(modal).not.toBeNull();

    unmount(app);
  });

  test('modal has aria-labelledby (NFR-FEED-002)', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeleteConfirmModal, { target, props: { noteId: 'note-001', adapter } });
    flushSync();

    const modal = target.querySelector('[role="dialog"][aria-labelledby]');
    expect(modal).not.toBeNull();

    unmount(app);
  });
});

// ── PROP-FEED-017: Esc key closes modal ──────────────────────────────────────

describe('PROP-FEED-017 / REQ-FEED-012: Esc key dispatches CancelNoteDeletion (EC-FEED-011)', () => {
  test('Esc keydown calls dispatchCancelNoteDeletion 1× and modal disappears', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeleteConfirmModal, { target, props: { noteId: 'note-001', adapter } });
    flushSync();

    // Modal should be present before Esc
    const modalBefore = target.querySelector('[data-testid="delete-confirm-modal"]');
    expect(modalBefore).not.toBeNull();

    // Dispatch Esc key event
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(escEvent);
    flushSync();

    expect(adapter.dispatchCancelNoteDeletion).toHaveBeenCalledTimes(1);
    expect(adapter.dispatchCancelNoteDeletion).toHaveBeenCalledWith('note-001', expect.any(String));

    // Modal should be gone
    const modalAfter = target.querySelector('[data-testid="delete-confirm-modal"]');
    expect(modalAfter).toBeNull();

    unmount(app);
  });
});

// ── PROP-FEED-018: Backdrop click closes modal ────────────────────────────────

describe('PROP-FEED-018 / REQ-FEED-012: Backdrop click dispatches CancelNoteDeletion (EC-FEED-012)', () => {
  test('backdrop click calls dispatchCancelNoteDeletion 1×', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeleteConfirmModal, { target, props: { noteId: 'note-001', adapter } });
    flushSync();

    const backdrop = target.querySelector('[data-testid="modal-backdrop"]') as HTMLElement | null;
    expect(backdrop).not.toBeNull();
    backdrop!.click();
    flushSync();

    expect(adapter.dispatchCancelNoteDeletion).toHaveBeenCalledTimes(1);

    unmount(app);
  });
});

// ── Confirm button click ──────────────────────────────────────────────────────

describe('PROP-FEED-029 / REQ-FEED-012: confirm button click dispatches ConfirmNoteDeletion', () => {
  test('confirm-delete-button click calls dispatchConfirmNoteDeletion 1×', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeleteConfirmModal, { target, props: { noteId: 'note-001', adapter } });
    flushSync();

    const confirmBtn = target.querySelector('[data-testid="confirm-delete-button"]') as HTMLButtonElement | null;
    expect(confirmBtn).not.toBeNull();
    confirmBtn!.click();
    flushSync();

    expect(adapter.dispatchConfirmNoteDeletion).toHaveBeenCalledTimes(1);
    // FIND-S2-01: adapter now takes (noteId, filePath, vaultPath, issuedAt).
    // DeleteConfirmModal fallback path uses noteId as filePath, '' for vaultPath.
    expect(adapter.dispatchConfirmNoteDeletion).toHaveBeenCalledWith('note-001', 'note-001', '', expect.any(String));

    unmount(app);
  });

  test('cancel button click calls dispatchCancelNoteDeletion 1×', () => {
    const adapter = makeMockAdapter();
    const app = mount(DeleteConfirmModal, { target, props: { noteId: 'note-001', adapter } });
    flushSync();

    const cancelBtn = target.querySelector('[data-testid="cancel-delete-button"]') as HTMLButtonElement | null;
    expect(cancelBtn).not.toBeNull();
    cancelBtn!.click();
    flushSync();

    expect(adapter.dispatchCancelNoteDeletion).toHaveBeenCalledTimes(1);

    unmount(app);
  });
});
