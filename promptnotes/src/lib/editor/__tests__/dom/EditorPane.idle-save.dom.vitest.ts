/**
 * EditorPane.idle-save.dom.vitest.ts — CRIT-002
 *
 * REQ-EDIT-004, EC-EDIT-001 / PROP-EDIT-023
 *
 * Verifies:
 * - Advancing fake time by exactly IDLE_SAVE_DEBOUNCE_MS (2000ms) after the
 *   last input fires dispatchTriggerIdleSave exactly once with source: 'capture-idle'.
 * - Advancing by IDLE_SAVE_DEBOUNCE_MS - 1ms fires nothing.
 * - A burst of inputs separated by < IDLE_SAVE_DEBOUNCE_MS produces exactly
 *   ONE save after the burst quiesces.
 * - FIND-013: oninput while status=idle does NOT schedule idle save via timer.
 *
 * Uses a real createDebounceTimer (with a fake clock) so that vi.useFakeTimers()
 * patches the underlying setTimeout and tests can advance time deterministically.
 * This is required after FIND-002 fix: the component now delegates to
 * timer.scheduleIdleSave instead of raw setTimeout.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { EditingSessionState } from '../../types.js';
import { IDLE_SAVE_DEBOUNCE_MS } from '../../debounceSchedule.js';
import { createDebounceTimer } from '../../debounceTimer.js';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import EditorPane from '../../EditorPane.svelte';
import type { TauriEditorAdapter } from '../../tauriEditorAdapter.js';
import type { EditorStateChannel } from '../../editorStateChannel.js';
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

function makeMockClipboard(): ClipboardAdapter {
  return { write: vi.fn().mockResolvedValue(undefined) };
}

const editingSnapshot: EditingSessionState = {
  status: 'editing',
  isDirty: false,
  currentNoteId: 'note-001',
  pendingNextNoteId: null,
  lastError: null,
  body: '',
};

describe('EditorPane idle-save — CRIT-002', () => {
  let target: HTMLDivElement;
  let adapter: ReturnType<typeof makeMockAdapter>;
  let stateChannel: MockStateChannel;

  beforeEach(() => {
    vi.useFakeTimers();
    target = document.createElement('div');
    document.body.appendChild(target);
    adapter = makeMockAdapter();
    stateChannel = makeMockStateChannel();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  test(`advancing exactly ${IDLE_SAVE_DEBOUNCE_MS}ms fires dispatchTriggerIdleSave once`, () => {
    // Use a real DebounceTimer backed by the fake global setTimeout.
    // The clock returns Date.now() which is controlled by vi.useFakeTimers().
    const timer = createDebounceTimer({ now: () => Date.now() });

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

    stateChannel.emit(editingSnapshot);
    flushSync();

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    textarea!.value = 'some content';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    // Advance fake time to trigger the idle debounce
    vi.advanceTimersByTime(IDLE_SAVE_DEBOUNCE_MS);
    flushSync();

    expect(adapter.dispatchTriggerIdleSave).toHaveBeenCalledOnce();
    expect(adapter.dispatchTriggerIdleSave).toHaveBeenCalledWith({
      source: 'capture-idle',
      noteId: 'note-001',
      body: 'some content',
      issuedAt: expect.any(String),
    });

    unmount(app);
  });

  test(`advancing ${IDLE_SAVE_DEBOUNCE_MS - 1}ms does NOT fire dispatchTriggerIdleSave`, () => {
    const timer = createDebounceTimer({ now: () => Date.now() });

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

    stateChannel.emit(editingSnapshot);
    flushSync();

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    textarea!.value = 'some content';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    // One ms before the threshold — should NOT fire
    vi.advanceTimersByTime(IDLE_SAVE_DEBOUNCE_MS - 1);
    flushSync();

    expect(adapter.dispatchTriggerIdleSave).not.toHaveBeenCalled();

    unmount(app);
  });

  // FIND-013: typing while status=idle does NOT schedule idle save via injected timer.
  test('FIND-013: oninput while status=idle does NOT schedule idle save timer', () => {
    const timerMock = {
      scheduleIdleSave: vi.fn(),
      cancel: vi.fn(),
    };

    const idleSnapshot: EditingSessionState = {
      status: 'idle',
      isDirty: false,
      currentNoteId: null,
      pendingNextNoteId: null,
      lastError: null,
      body: '',
    };

    const app = mount(EditorPane, {
      target,
      props: {
        adapter,
        stateChannel,
        timer: timerMock,
        clipboard: makeMockClipboard(),
      },
    });
    flushSync();

    stateChannel.emit(idleSnapshot);
    flushSync();

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    // Simulate an oninput while idle
    textarea!.value = 'spurious input while idle';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    // The timer must NOT be scheduled when status is not 'editing'
    expect(timerMock.scheduleIdleSave).not.toHaveBeenCalled();

    unmount(app);
  });

  test('EC-EDIT-001: rapid typing produces exactly ONE idle save after quiescence', () => {
    const timer = createDebounceTimer({ now: () => Date.now() });

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

    stateChannel.emit(editingSnapshot);
    flushSync();

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    // Simulate a burst of edits within the debounce window
    for (let i = 0; i < 5; i++) {
      textarea!.value = `content ${i}`;
      textarea!.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
      // Advance less than the debounce window between each edit
      vi.advanceTimersByTime(300);
    }

    // Now advance past the full debounce window from the last edit
    vi.advanceTimersByTime(IDLE_SAVE_DEBOUNCE_MS);
    flushSync();

    // Only ONE idle save should fire (last debounce timer wins)
    expect(adapter.dispatchTriggerIdleSave).toHaveBeenCalledOnce();

    unmount(app);
  });
});
