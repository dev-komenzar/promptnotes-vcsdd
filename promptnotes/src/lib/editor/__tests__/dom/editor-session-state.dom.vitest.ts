/**
 * editor-session-state.dom.vitest.ts — PROP-EDIT-037, PROP-EDIT-039
 *
 * REQ-EDIT-007, REQ-EDIT-009, REQ-EDIT-005
 * EC-EDIT-003 (save fails, user continues typing) — PROP-EDIT-037
 * EC-EDIT-005 (switching → back to editing re-enables textarea) — PROP-EDIT-039
 *
 * Also covers FIND-007 (save-success inbound bridge):
 * - When inbound state transitions saving → editing with isDirty=false,
 *   timer.cancel() is called (idle timer cleared on save success).
 * - When inbound state transitions saving → save-failed, the banner appears.
 *
 * Also covers FIND-008 / REQ-EDIT-009:
 * - When status=idle, a placeholder message is visible in the DOM.
 *
 * RED phase: No idle placeholder is rendered; timer.cancel is not called on
 * save success inbound transition; inbound save-failed does not dispatch reducer action.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { EditingSessionState } from '../../types.js';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import EditorPane from '../../EditorPane.svelte';
import type { TauriEditorAdapter } from '../../tauriEditorAdapter.js';
import type { EditorStateChannel } from '../../editorStateChannel.js';
import type { DebounceTimer } from '../../debounceTimer.js';
import type { ClipboardAdapter } from '../../clipboardAdapter.js';

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

function makeMockTimer(): DebounceTimer & Record<string, ReturnType<typeof vi.fn>> {
  return {
    scheduleIdleSave: vi.fn(),
    cancel: vi.fn(),
  };
}

function makeMockClipboard(): ClipboardAdapter {
  return { write: vi.fn().mockResolvedValue(undefined) };
}

const idleSnapshot: EditingSessionState = {
  status: 'idle',
  isDirty: false,
  currentNoteId: null,
  pendingNextNoteId: null,
  lastError: null,
  body: '',
};

const savingSnapshot: EditingSessionState = {
  status: 'saving',
  isDirty: true,
  currentNoteId: 'note-001',
  pendingNextNoteId: null,
  lastError: null,
  body: 'unsaved content',
};

const savedSnapshot: EditingSessionState = {
  status: 'editing',
  isDirty: false,
  currentNoteId: 'note-001',
  pendingNextNoteId: null,
  lastError: null,
  body: 'saved content',
};

const saveFailedSnapshot: EditingSessionState = {
  status: 'save-failed',
  isDirty: true,
  currentNoteId: 'note-001',
  pendingNextNoteId: null,
  lastError: { kind: 'fs', reason: { kind: 'permission' } },
  body: 'unsaved content',
};

const switchingSnapshot: EditingSessionState = {
  status: 'switching',
  isDirty: true,
  currentNoteId: 'note-001',
  pendingNextNoteId: 'note-002',
  lastError: null,
  body: 'content',
};

const editingAfterSwitchSnapshot: EditingSessionState = {
  status: 'editing',
  isDirty: false,
  currentNoteId: 'note-002',
  pendingNextNoteId: null,
  lastError: null,
  body: 'note 2 content',
};

describe('editor-session-state — PROP-EDIT-037 / PROP-EDIT-039', () => {
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
    vi.restoreAllMocks();
  });

  // ── FIND-008 / REQ-EDIT-009: Idle placeholder ──

  test('REQ-EDIT-009: When status=idle, a placeholder message is visible in the DOM', () => {
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

    stateChannel.emit(idleSnapshot);
    flushSync();

    // The placeholder must be present — exact string from spec §3.4 / ui-fields §UI状態
    // REQ-EDIT-009: "A placeholder message is visible (e.g., 'ノートを選択してください' or similar)"
    // ui-fields.md §UI状態と型の対応: idle row: 「編集中ノートなし」
    const placeholder = target.querySelector('[data-testid="idle-placeholder"]');
    expect(placeholder).not.toBeNull();
    // The placeholder text must be non-empty and communicate "no note selected"
    expect(placeholder!.textContent?.trim().length).toBeGreaterThan(0);

    unmount(app);
  });

  test('REQ-EDIT-009: Idle placeholder is absent when status=editing', () => {
    const editingSnapshot: EditingSessionState = {
      status: 'editing',
      isDirty: false,
      currentNoteId: 'note-001',
      pendingNextNoteId: null,
      lastError: null,
      body: 'some content',
    };

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

    stateChannel.emit(editingSnapshot);
    flushSync();

    const placeholder = target.querySelector('[data-testid="idle-placeholder"]');
    expect(placeholder).toBeNull();

    unmount(app);
  });

  // ── FIND-007: Inbound state bridge for save success / failure ──

  test('FIND-007: Inbound transition saving→editing(isDirty=false) cancels idle timer via timer.cancel()', () => {
    const timer = makeMockTimer();
    vi.useFakeTimers();

    const app = mount(EditorPane, {
      target,
      props: {
        adapter,
        stateChannel,
        timer,
        clipboard: makeMockClipboard(),
      },
    });
    flushSync();

    // Start in saving state (timer was presumably scheduled)
    stateChannel.emit(savingSnapshot);
    flushSync();

    (timer as unknown as Record<string, ReturnType<typeof vi.fn>>)['cancel'].mockClear();

    // Simulate save success: domain transitions to editing+isDirty=false
    stateChannel.emit(savedSnapshot);
    flushSync();

    // The idle timer must be cancelled when save succeeds (REQ-EDIT-005)
    expect(timer.cancel).toHaveBeenCalled();

    vi.useRealTimers();
    unmount(app);
  });

  test('FIND-007: Inbound transition saving→save-failed shows the save-failure banner', () => {
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

    stateChannel.emit(savingSnapshot);
    flushSync();

    let banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).toBeNull();

    stateChannel.emit(saveFailedSnapshot);
    flushSync();

    banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).not.toBeNull();

    unmount(app);
  });

  // ── PROP-EDIT-037: EC-EDIT-003 — user continues typing while save-failed ──

  test('PROP-EDIT-037: EC-EDIT-003 — typing in save-failed state dispatches EditNoteBody', () => {
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

    // Banner should be visible
    const banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).not.toBeNull();

    // Textarea should still accept input
    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();
    expect(textarea!.disabled).toBe(false);

    textarea!.value = 'more content after failure';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    // EditNoteBody should have been dispatched
    expect(adapter.dispatchEditNoteBody).toHaveBeenCalledOnce();

    unmount(app);
  });

  // ── PROP-EDIT-039: EC-EDIT-005 — switching → editing re-enables textarea ──

  test('PROP-EDIT-039: EC-EDIT-005 — after switching resolves to editing, textarea is re-enabled', () => {
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

    // Put in switching state: textarea should be locked
    stateChannel.emit(switchingSnapshot);
    flushSync();

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();
    expect(textarea!.disabled).toBe(true);

    // Domain resolves switch: back to editing with new note
    stateChannel.emit(editingAfterSwitchSnapshot);
    flushSync();

    // Textarea should be re-enabled
    expect(textarea!.disabled).toBe(false);
    expect(textarea!.readOnly).toBe(false);

    unmount(app);
  });
});
