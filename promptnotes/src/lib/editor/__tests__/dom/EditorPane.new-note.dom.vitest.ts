/**
 * EditorPane.new-note.dom.vitest.ts — CRIT-006
 *
 * REQ-EDIT-023, REQ-EDIT-024, EC-EDIT-007 / PROP-EDIT-018, PROP-EDIT-019
 *
 * Verifies:
 * - +新規 button click calls dispatchRequestNewNote with source: 'explicit-button'.
 * - Ctrl+N on the pane calls dispatchRequestNewNote with source: 'ctrl-N' and
 *   event.preventDefault() is called.
 * - Cmd+N (metaKey) on the pane calls dispatchRequestNewNote with source: 'ctrl-N'.
 * - Ctrl+N dispatched on document.body (outside pane) does NOT call dispatchRequestNewNote.
 * - +新規 button is disabled in switching state only.
 *
 * RED phase: button absent → tests FAIL.
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

function makeMockTimer(): DebounceTimer {
  return { scheduleIdleSave: vi.fn(), cancel: vi.fn() };
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

const switchingSnapshot: EditingSessionState = {
  status: 'switching',
  isDirty: true,
  currentNoteId: 'note-001',
  pendingNextNoteId: 'note-002',
  lastError: null,
  body: 'content',
};

describe('EditorPane new-note — CRIT-006', () => {
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

  test('+新規 button click calls dispatchRequestNewNote with source: "explicit-button"', () => {
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

    const newNoteBtn = target.querySelector<HTMLButtonElement>('[data-testid="new-note-button"]');
    expect(newNoteBtn).not.toBeNull();

    newNoteBtn!.click();
    flushSync();

    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledOnce();
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledWith('explicit-button', expect.any(String));

    unmount(app);
  });

  test('Ctrl+N on pane calls dispatchRequestNewNote with source: "ctrl-N"', () => {
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

    const paneRoot = target.firstElementChild as HTMLElement;
    expect(paneRoot).not.toBeNull();

    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true });
    paneRoot.dispatchEvent(event);
    flushSync();

    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledOnce();
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledWith('ctrl-N', expect.any(String));

    unmount(app);
  });

  test('Ctrl+N on pane calls event.preventDefault()', () => {
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

    const paneRoot = target.firstElementChild as HTMLElement;
    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    paneRoot.dispatchEvent(event);
    flushSync();

    expect(preventDefaultSpy).toHaveBeenCalledOnce();

    unmount(app);
  });

  test('Cmd+N (metaKey) on pane calls dispatchRequestNewNote with source: "ctrl-N"', () => {
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

    const paneRoot = target.firstElementChild as HTMLElement;
    const event = new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true });
    paneRoot.dispatchEvent(event);
    flushSync();

    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledOnce();
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledWith('ctrl-N', expect.any(String));

    unmount(app);
  });

  test('Ctrl+N on document.body (outside pane) does NOT call dispatchRequestNewNote', () => {
    // FIND-011: use bubbles: true from a sibling element outside the pane.
    // This correctly distinguishes a pane-scoped listener from a document-level listener.
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

    // Mount a sibling element outside the pane to dispatch from
    const sibling = document.createElement('div');
    document.body.appendChild(sibling);

    // Dispatch with bubbles: true from outside the pane
    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true });
    sibling.dispatchEvent(event);
    flushSync();

    expect(adapter.dispatchRequestNewNote).not.toHaveBeenCalled();

    unmount(app);
  });

  test('+新規 button is disabled in switching state', () => {
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

    stateChannel.emit(switchingSnapshot);
    flushSync();

    const newNoteBtn = target.querySelector<HTMLButtonElement>('[data-testid="new-note-button"]');
    expect(newNoteBtn).not.toBeNull();
    expect(newNoteBtn!.disabled).toBe(true);

    unmount(app);
  });

  test('+新規 button is enabled in idle state', () => {
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

    const newNoteBtn = target.querySelector<HTMLButtonElement>('[data-testid="new-note-button"]');
    expect(newNoteBtn).not.toBeNull();
    expect(newNoteBtn!.disabled).toBe(false);

    unmount(app);
  });
});
