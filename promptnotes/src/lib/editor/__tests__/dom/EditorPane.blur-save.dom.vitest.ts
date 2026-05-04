/**
 * EditorPane.blur-save.dom.vitest.ts — CRIT-003
 *
 * REQ-EDIT-006, REQ-EDIT-007, REQ-EDIT-008, EC-EDIT-002 / PROP-EDIT-022
 *
 * Verifies:
 * - Textarea blur while isDirty=true fires dispatchTriggerBlurSave once with
 *   source: 'capture-blur' and cancels the pending idle timer.
 * - Blur while status='saving' fires nothing.
 * - Blur while isDirty=false fires nothing.
 * - Only one of TriggerBlurSave or TriggerIdleSave fires for a single dirty interval.
 *
 * RED phase: textarea absent → tests FAIL.
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

function makeMockClipboard(): ClipboardAdapter {
  return { write: vi.fn().mockResolvedValue(undefined) };
}

/** Creates a DebounceTimer mock where cancel is a tracked function with a call log hook. */
function makeMockTimer(cancelCallOrder?: string[]): DebounceTimer {
  return {
    scheduleIdleSave: vi.fn() as unknown as (at: number, cb: () => void) => void,
    cancel: cancelCallOrder
      ? (() => { cancelCallOrder.push('cancel'); }) as () => void
      : vi.fn() as unknown as () => void,
  };
}

const editingDirtySnapshot: EditingSessionState = {
  status: 'editing',
  isDirty: true,
  currentNoteId: 'note-001',
  pendingNextNoteId: null,
  lastError: null,
  body: 'some content',
};

const editingCleanSnapshot: EditingSessionState = {
  ...editingDirtySnapshot,
  isDirty: false,
  body: '',
};

const savingSnapshot: EditingSessionState = {
  status: 'saving',
  isDirty: true,
  currentNoteId: 'note-001',
  pendingNextNoteId: null,
  lastError: null,
  body: 'some content',
};

describe('EditorPane blur-save — CRIT-003', () => {
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

  test('blur while isDirty=true fires dispatchTriggerBlurSave once with source: "capture-blur"', () => {
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

    stateChannel.emit(editingDirtySnapshot);
    flushSync();

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    textarea!.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    flushSync();

    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledOnce();
    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledWith({
      source: 'capture-blur',
      noteId: 'note-001',
      body: 'some content',
      issuedAt: expect.any(String),
    });

    unmount(app);
  });

  test('blur while isDirty=true cancels the idle timer before dispatching', () => {
    const callOrder: string[] = [];

    // cancel is tracked via callOrder array injection
    const timer = makeMockTimer(callOrder);

    // patch dispatchTriggerBlurSave to also track call order
    const origBlurSave = adapter.dispatchTriggerBlurSave;
    adapter.dispatchTriggerBlurSave = vi.fn().mockImplementation((payload) => {
      callOrder.push('blurSave');
      return origBlurSave(payload);
    }) as unknown as typeof adapter.dispatchTriggerBlurSave;

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

    stateChannel.emit(editingDirtySnapshot);
    flushSync();

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    textarea!.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    flushSync();

    // cancel must be called before blurSave
    const cancelIndex = callOrder.indexOf('cancel');
    const blurSaveIndex = callOrder.indexOf('blurSave');
    expect(cancelIndex).toBeGreaterThanOrEqual(0);
    expect(blurSaveIndex).toBeGreaterThan(cancelIndex);

    unmount(app);
  });

  test('blur while status="saving" fires nothing (EC-EDIT-002)', () => {
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

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    textarea!.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    flushSync();

    expect(adapter.dispatchTriggerBlurSave).not.toHaveBeenCalled();

    unmount(app);
  });

  test('blur while isDirty=false fires nothing', () => {
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

    stateChannel.emit(editingCleanSnapshot);
    flushSync();

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    textarea!.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    flushSync();

    expect(adapter.dispatchTriggerBlurSave).not.toHaveBeenCalled();

    unmount(app);
  });

  test('no duplicate: blur cancels the pending idle timer so only TriggerBlurSave fires', () => {
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

    stateChannel.emit(editingDirtySnapshot);
    flushSync();

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    // Blur before the idle timer fires
    textarea!.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    flushSync();

    // Now advance timers — idle save must NOT fire because it was cancelled
    vi.advanceTimersByTime(5000);
    flushSync();

    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledOnce();
    expect(adapter.dispatchTriggerIdleSave).not.toHaveBeenCalled();

    unmount(app);
  });
});
