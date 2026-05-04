/**
 * EditorPane.body-input.dom.vitest.ts — CRIT-001
 *
 * REQ-EDIT-001, REQ-EDIT-010 / PROP-EDIT-021
 *
 * Verifies:
 * - Each simulated input event on the textarea calls mockAdapter.dispatchEditNoteBody
 *   exactly once per event, carrying the full textarea value.
 * - After the dispatch, the isDirty indicator (data-testid="dirty-indicator")
 *   appears in the DOM.
 * - No real @tauri-apps/api/core invoke() is ever called.
 *
 * RED phase: textarea is absent, so all querySelector assertions fail.
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
import * as tauriCore from '@tauri-apps/api/core';

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
  return {
    scheduleIdleSave: vi.fn(),
    cancel: vi.fn(),
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

describe('EditorPane body-input — CRIT-001', () => {
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

  test('input event on textarea calls dispatchEditNoteBody exactly once', () => {
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

    // Put the component into editing state
    stateChannel.emit(editingSnapshot);
    flushSync();

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    // Simulate typing
    textarea!.value = 'hello world';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    expect(adapter.dispatchEditNoteBody).toHaveBeenCalledOnce();
    expect(adapter.dispatchEditNoteBody).toHaveBeenCalledWith(
      'note-001',
      'hello world',
      expect.any(String)
    );

    unmount(app);
  });

  test('each separate input event calls dispatchEditNoteBody once per event', () => {
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

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    textarea!.value = 'a';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    textarea!.value = 'ab';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    expect(adapter.dispatchEditNoteBody).toHaveBeenCalledTimes(2);

    unmount(app);
  });

  test('dirty-indicator appears after input when isDirty becomes true', () => {
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

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    textarea!.value = 'dirty content';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    const dirtyIndicator = target.querySelector('[data-testid="dirty-indicator"]');
    expect(dirtyIndicator).not.toBeNull();

    unmount(app);
  });

  test('no real invoke() is called when using mock adapter', () => {
    const invoke = vi.mocked(tauriCore.invoke);
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

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    if (textarea) {
      textarea.value = 'test';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
    }

    expect(invoke).not.toHaveBeenCalled();

    unmount(app);
  });
});
