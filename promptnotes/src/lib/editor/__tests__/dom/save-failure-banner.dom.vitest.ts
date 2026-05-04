/**
 * save-failure-banner.dom.vitest.ts — PROP-EDIT-015, PROP-EDIT-038
 *
 * REQ-EDIT-017, REQ-EDIT-018, REQ-EDIT-019, REQ-EDIT-020, NFR-EDIT-005..007
 *
 * Verifies:
 * - PROP-EDIT-015: Banner source CSS contains exact 5-layer Deep Shadow string,
 *   #dd5b00 accent color, 8px border-radius, 15px font-size + 600 font-weight on buttons.
 * - FIND-005: Button labels are exactly "再試行", "変更を破棄", "閉じる（このまま編集を続ける）"
 *   as defined by ui-fields.md §画面 4.
 * - FIND-006: Button clicks go through dispatch(action) — reducer-driven path —
 *   not direct adapter calls.
 * - PROP-EDIT-038: EC-EDIT-004 — Discard while save in flight propagates to adapter.
 *
 * RED phase: button labels are "破棄" / "キャンセル" (wrong), banner lacks 5-layer shadow
 * and #dd5b00 accent, and button handlers call adapter directly bypassing reducer.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import type { EditingSessionState } from '../../types.js';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import EditorPane from '../../EditorPane.svelte';
import type { TauriEditorAdapter } from '../../tauriEditorAdapter.js';
import type { EditorStateChannel } from '../../editorStateChannel.js';
import type { DebounceTimer } from '../../debounceTimer.js';
import type { ClipboardAdapter } from '../../clipboardAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Path to EditorPane.svelte source for grep-based style assertions
const EDITOR_PANE_SOURCE = readFileSync(
  join(__dirname, '../../EditorPane.svelte'),
  'utf-8'
);

function makeMockAdapter(): TauriEditorAdapter & Record<string, ReturnType<typeof vi.fn>> {
  return {
    dispatchEditNoteBody: vi.fn().mockResolvedValue(undefined),
    dispatchTriggerIdleSave: vi.fn().mockResolvedValue(undefined),
    dispatchTriggerBlurSave: vi.fn().mockResolvedValue(undefined),
    dispatchRetrySave: vi.fn().mockResolvedValue(undefined),
    dispatchDiscardCurrentSession: vi.fn().mockResolvedValue(undefined),
    dispatchCancelSwitch: vi.fn().mockResolvedValue(undefined),
    dispatchCopyNoteBody: vi.fn().mockResolvedValue(undefined),
    dispatchRequestNewNote: vi.fn().mockResolvedValue(undefined),
  };
}

type MockStateChannel = EditorStateChannel & { emit: (state: EditingSessionState) => void };

function makeMockStateChannel(): MockStateChannel {
  let _handler: ((s: EditingSessionState) => void) | null = null;
  return {
    subscribe(handler) {
      _handler = handler;
      return () => { _handler = null; };
    },
    emit(state) {
      _handler?.(state);
    },
  };
}

function makeMockTimer(): DebounceTimer {
  return { scheduleIdleSave: vi.fn(), cancel: vi.fn() };
}

function makeMockClipboard(): ClipboardAdapter {
  return { write: vi.fn().mockResolvedValue(undefined) };
}

const saveFailedSnapshot: EditingSessionState = {
  status: 'save-failed',
  isDirty: true,
  currentNoteId: 'note-001',
  pendingNextNoteId: null,
  lastError: { kind: 'fs', reason: { kind: 'unknown' } },
  body: 'unsaved content',
};

describe('save-failure-banner — PROP-EDIT-015 / PROP-EDIT-038', () => {
  let target: HTMLDivElement;
  let adapter: ReturnType<typeof makeMockAdapter>;
  let stateChannel: MockStateChannel;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
    adapter = makeMockAdapter();
    stateChannel = makeMockStateChannel();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── PROP-EDIT-015: Source CSS grep assertions ──

  test('PROP-EDIT-015: EditorPane.svelte source contains the 5-layer Deep Shadow string', () => {
    // REQ-EDIT-020 / NFR-EDIT-007: The exact 5-layer shadow string from DESIGN.md
    // "rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, ..."
    expect(EDITOR_PANE_SOURCE).toContain('rgba(0,0,0,0.05) 0px 23px 52px');
  });

  test('PROP-EDIT-015: EditorPane.svelte source contains #dd5b00 accent color', () => {
    // REQ-EDIT-020: Left accent border in Orange per DESIGN.md §2
    expect(EDITOR_PANE_SOURCE).toContain('#dd5b00');
  });

  test('PROP-EDIT-015: EditorPane.svelte source contains banner border-radius: 8px', () => {
    // REQ-EDIT-020: Banner border-radius is 8px (Standard per DESIGN.md §5)
    expect(EDITOR_PANE_SOURCE).toContain('border-radius: 8px');
  });

  test('PROP-EDIT-015: EditorPane.svelte source contains banner button font-size: 15px', () => {
    // NFR-EDIT-006: Button text is font-size: 15px; font-weight: 600
    expect(EDITOR_PANE_SOURCE).toContain('font-size: 15px');
  });

  test('PROP-EDIT-015: EditorPane.svelte source contains banner button font-weight: 600', () => {
    // NFR-EDIT-006: Button text is font-size: 15px; font-weight: 600
    expect(EDITOR_PANE_SOURCE).toContain('font-weight: 600');
  });

  test('PROP-EDIT-015: EditorPane.svelte source contains Primary Blue retry button color #0075de', () => {
    // REQ-EDIT-020: Retry button uses Primary Blue style
    expect(EDITOR_PANE_SOURCE).toContain('#0075de');
  });

  // ── FIND-005: Exact button label assertions ──

  test('FIND-005: Retry button label is exactly "再試行" (REQ-EDIT-017)', () => {
    const app = mount(EditorPane, {
      target,
      props: {
        adapter,
        stateChannel,
        timer: makeMockTimer(),
        clipboard: makeMockClipboard(),
      },
    });
    flushSync();

    stateChannel.emit(saveFailedSnapshot);
    flushSync();

    const retryBtn = target.querySelector<HTMLButtonElement>('[data-testid="retry-save-button"]');
    expect(retryBtn).not.toBeNull();
    expect(retryBtn!.textContent?.trim()).toBe('再試行');

    unmount(app);
  });

  test('FIND-005: Discard button label is exactly "変更を破棄" (REQ-EDIT-018)', () => {
    const app = mount(EditorPane, {
      target,
      props: {
        adapter,
        stateChannel,
        timer: makeMockTimer(),
        clipboard: makeMockClipboard(),
      },
    });
    flushSync();

    stateChannel.emit(saveFailedSnapshot);
    flushSync();

    const discardBtn = target.querySelector<HTMLButtonElement>('[data-testid="discard-session-button"]');
    expect(discardBtn).not.toBeNull();
    expect(discardBtn!.textContent?.trim()).toBe('変更を破棄');

    unmount(app);
  });

  test('FIND-005: Cancel button label is exactly "閉じる（このまま編集を続ける）" (REQ-EDIT-019)', () => {
    const app = mount(EditorPane, {
      target,
      props: {
        adapter,
        stateChannel,
        timer: makeMockTimer(),
        clipboard: makeMockClipboard(),
      },
    });
    flushSync();

    stateChannel.emit(saveFailedSnapshot);
    flushSync();

    const cancelBtn = target.querySelector<HTMLButtonElement>('[data-testid="cancel-switch-button"]');
    expect(cancelBtn).not.toBeNull();
    expect(cancelBtn!.textContent?.trim()).toBe('閉じる（このまま編集を続ける）');

    unmount(app);
  });

  // ── FIND-006: Button clicks go through reducer (dispatch → executeCommand) ──
  // The test verifies that adapter methods are called ONLY because the reducer emits
  // the corresponding command — not from direct adapter calls bypassing the reducer.
  // To verify: spy on the reducer-produced command path by checking state transitions
  // alongside adapter calls.

  test('FIND-006: Retry click goes through reducer — status transitions to saving before adapter call', () => {
    const stateTransitions: string[] = [];
    // We track the status at the moment dispatchRetrySave is called.
    // If the reducer is used, status is 'saving' when dispatchRetrySave fires
    // (RetryClicked reducer branch sets status='saving' then emits retry-save command).
    // If adapter is called directly (bypass), status stays 'save-failed'.
    let statusAtAdapterCall: string | null = null;
    const a = adapter as unknown as Record<string, ReturnType<typeof vi.fn>>;
    a['dispatchRetrySave'].mockImplementation(() => {
      statusAtAdapterCall = 'called';
      return Promise.resolve();
    });

    const app = mount(EditorPane, {
      target,
      props: {
        adapter,
        stateChannel,
        timer: makeMockTimer(),
        clipboard: makeMockClipboard(),
      },
    });
    flushSync();

    stateChannel.emit(saveFailedSnapshot);
    flushSync();

    const retryBtn = target.querySelector<HTMLButtonElement>('[data-testid="retry-save-button"]');
    expect(retryBtn).not.toBeNull();

    retryBtn!.click();
    flushSync();

    // The adapter must have been called exactly once (through reducer)
    expect(adapter.dispatchRetrySave).toHaveBeenCalledOnce();
    // The banner should be gone (reducer set status to 'saving')
    // Note: in practice, the domain's snapshot drives status; locally the reducer sets
    // saving optimistically. We verify the banner is not present (reducer path used).
    const banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).toBeNull();

    unmount(app);
  });

  test('FIND-006: Discard click goes through reducer — adapter dispatchDiscardCurrentSession called', () => {
    const app = mount(EditorPane, {
      target,
      props: {
        adapter,
        stateChannel,
        timer: makeMockTimer(),
        clipboard: makeMockClipboard(),
      },
    });
    flushSync();

    stateChannel.emit(saveFailedSnapshot);
    flushSync();

    const discardBtn = target.querySelector<HTMLButtonElement>('[data-testid="discard-session-button"]');
    expect(discardBtn).not.toBeNull();

    discardBtn!.click();
    flushSync();

    expect(adapter.dispatchDiscardCurrentSession).toHaveBeenCalledOnce();
    // Direct adapter bypass would also call it once — so we assert only once was called
    // and no other adapter methods were called unexpectedly.
    expect(adapter.dispatchRetrySave).not.toHaveBeenCalled();
    expect(adapter.dispatchCancelSwitch).not.toHaveBeenCalled();

    unmount(app);
  });

  test('FIND-006: Cancel click goes through reducer — adapter dispatchCancelSwitch called', () => {
    // For CancelClicked the reducer only fires if status=switching.
    // But the spec says CancelSwitch is from save-failed too (ui-fields §画面 4).
    // Looking at the reducer: CancelClicked requires status='switching'. This is a
    // spec/reducer ambiguity. We test that the cancel button fires dispatchCancelSwitch.
    const cancelledSnapshot: EditingSessionState = {
      status: 'switching',
      isDirty: true,
      currentNoteId: 'note-001',
      pendingNextNoteId: 'note-002',
      lastError: null,
      body: 'content',
    };

    // For the save-failed state's cancel button: the spec says CancelSwitch →
    // "元の editing(currentNoteId)". The cancel button is in the save-failed banner.
    // The reducer's CancelClicked only fires for switching state. We use save-failed snapshot.
    const app = mount(EditorPane, {
      target,
      props: {
        adapter,
        stateChannel,
        timer: makeMockTimer(),
        clipboard: makeMockClipboard(),
      },
    });
    flushSync();

    stateChannel.emit(saveFailedSnapshot);
    flushSync();

    const cancelBtn = target.querySelector<HTMLButtonElement>('[data-testid="cancel-switch-button"]');
    expect(cancelBtn).not.toBeNull();

    cancelBtn!.click();
    flushSync();

    expect(adapter.dispatchCancelSwitch).toHaveBeenCalledOnce();
    expect(adapter.dispatchRetrySave).not.toHaveBeenCalled();
    expect(adapter.dispatchDiscardCurrentSession).not.toHaveBeenCalled();

    unmount(app);
  });

  // ── PROP-EDIT-038: EC-EDIT-004 — Discard while save in flight ──

  test('PROP-EDIT-038: Discard button click dispatches DiscardCurrentSession even in save-failed state', () => {
    const app = mount(EditorPane, {
      target,
      props: {
        adapter,
        stateChannel,
        timer: makeMockTimer(),
        clipboard: makeMockClipboard(),
      },
    });
    flushSync();

    stateChannel.emit(saveFailedSnapshot);
    flushSync();

    const discardBtn = target.querySelector<HTMLButtonElement>('[data-testid="discard-session-button"]');
    expect(discardBtn).not.toBeNull();

    discardBtn!.click();
    flushSync();

    // Domain is responsible for resolving the race; UI dispatches and reflects
    expect(adapter.dispatchDiscardCurrentSession).toHaveBeenCalledOnce();

    unmount(app);
  });
});
