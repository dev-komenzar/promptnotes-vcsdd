/**
 * editor-panel.dom.vitest.ts — PROP-EDIT-020a, PROP-EDIT-020b, PROP-EDIT-034
 *
 * REQ-EDIT-025 blur-save-first gate for NewNoteClicked.
 *
 * Verifies:
 * - PROP-EDIT-020a: When status=editing AND isDirty=true, clicking +新規 dispatches
 *   TriggerBlurSave (via dispatchTriggerBlurSave) BEFORE dispatchRequestNewNote.
 * - PROP-EDIT-020a (keyboard): Same for Ctrl+N while editing and dirty.
 * - PROP-EDIT-020b: When status=save-failed AND user clicks +新規, dispatchRequestNewNote
 *   is dispatched WITHOUT a preceding dispatchTriggerBlurSave.
 * - PROP-EDIT-034: timer.scheduleIdleSave is called on each oninput event.
 *   (Single handle per edit — verifies injected timer is used, not raw setTimeout.)
 *
 * RED phase: FIND-001 reducer does not emit trigger-blur-save before request-new-note
 * for editing+dirty path, and FIND-002 timer bypasses injected timer.scheduleIdleSave.
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

const editingDirtySnapshot: EditingSessionState = {
  status: 'editing',
  isDirty: true,
  currentNoteId: 'note-001',
  pendingNextNoteId: null,
  lastError: null,
  body: 'unsaved content',
};

const saveFailedSnapshot: EditingSessionState = {
  status: 'save-failed',
  isDirty: true,
  currentNoteId: 'note-001',
  pendingNextNoteId: null,
  lastError: { kind: 'fs', reason: { kind: 'unknown' } },
  body: 'unsaved content',
};

describe('editor-panel — PROP-EDIT-020a / PROP-EDIT-020b / PROP-EDIT-034', () => {
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

  // ── PROP-EDIT-020a: editing+dirty → TriggerBlurSave fires BEFORE RequestNewNote ──

  test('PROP-EDIT-020a: +新規 click when editing+dirty dispatches TriggerBlurSave before RequestNewNote', () => {
    const callOrder: string[] = [];
    const a = adapter as unknown as Record<string, ReturnType<typeof vi.fn>>;
    a['dispatchTriggerBlurSave'].mockImplementation(() => {
      callOrder.push('dispatchTriggerBlurSave');
      return Promise.resolve();
    });
    a['dispatchRequestNewNote'].mockImplementation(() => {
      callOrder.push('dispatchRequestNewNote');
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

    stateChannel.emit(editingDirtySnapshot);
    flushSync();

    const newNoteBtn = target.querySelector<HTMLButtonElement>('[data-testid="new-note-button"]');
    expect(newNoteBtn).not.toBeNull();

    newNoteBtn!.click();
    flushSync();

    // TriggerBlurSave MUST come before RequestNewNote
    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledOnce();
    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledWith({
      source: 'capture-blur',
      noteId: 'note-001',
      body: 'unsaved content',
      issuedAt: expect.any(String),
    });
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledOnce();
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledWith({
      source: 'explicit-button',
      issuedAt: expect.any(String),
    });
    expect(callOrder).toEqual(['dispatchTriggerBlurSave', 'dispatchRequestNewNote']);

    unmount(app);
  });

  test('PROP-EDIT-020a: Ctrl+N when editing+dirty dispatches TriggerBlurSave before RequestNewNote', () => {
    const callOrder: string[] = [];
    const a = adapter as unknown as Record<string, ReturnType<typeof vi.fn>>;
    a['dispatchTriggerBlurSave'].mockImplementation(() => {
      callOrder.push('dispatchTriggerBlurSave');
      return Promise.resolve();
    });
    a['dispatchRequestNewNote'].mockImplementation(() => {
      callOrder.push('dispatchRequestNewNote');
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

    stateChannel.emit(editingDirtySnapshot);
    flushSync();

    const paneRoot = target.firstElementChild as HTMLElement;
    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true });
    paneRoot.dispatchEvent(event);
    flushSync();

    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledOnce();
    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledWith({
      source: 'capture-blur',
      noteId: 'note-001',
      body: 'unsaved content',
      issuedAt: expect.any(String),
    });
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledOnce();
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledWith({
      source: 'ctrl-N',
      issuedAt: expect.any(String),
    });
    expect(callOrder).toEqual(['dispatchTriggerBlurSave', 'dispatchRequestNewNote']);

    unmount(app);
  });

  // ── PROP-EDIT-020b: save-failed → RequestNewNote directly (NO TriggerBlurSave) ──

  test('PROP-EDIT-020b: +新規 click when save-failed dispatches RequestNewNote WITHOUT preceding TriggerBlurSave', () => {
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

    const newNoteBtn = target.querySelector<HTMLButtonElement>('[data-testid="new-note-button"]');
    expect(newNoteBtn).not.toBeNull();
    expect(newNoteBtn!.disabled).toBe(false);

    newNoteBtn!.click();
    flushSync();

    expect(adapter.dispatchTriggerBlurSave).not.toHaveBeenCalled();
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledOnce();
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledWith({
      source: 'explicit-button',
      issuedAt: expect.any(String),
    });

    unmount(app);
  });

  test('PROP-EDIT-020b: Ctrl+N when save-failed dispatches RequestNewNote WITHOUT preceding TriggerBlurSave', () => {
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

    const paneRoot = target.firstElementChild as HTMLElement;
    const event = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true });
    paneRoot.dispatchEvent(event);
    flushSync();

    expect(adapter.dispatchTriggerBlurSave).not.toHaveBeenCalled();
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledOnce();
    expect(adapter.dispatchRequestNewNote).toHaveBeenCalledWith({
      source: 'ctrl-N',
      issuedAt: expect.any(String),
    });

    unmount(app);
  });

  // ── PROP-EDIT-034: injected timer.scheduleIdleSave is called per oninput ──

  test('PROP-EDIT-034: timer.scheduleIdleSave is called once per oninput event', () => {
    const timer = makeMockTimer();

    const editingCleanSnapshot: EditingSessionState = {
      status: 'editing',
      isDirty: false,
      currentNoteId: 'note-001',
      pendingNextNoteId: null,
      lastError: null,
      body: '',
    };

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

    stateChannel.emit(editingCleanSnapshot);
    flushSync();

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    textarea!.value = 'first edit';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    expect(timer.scheduleIdleSave).toHaveBeenCalledOnce();

    textarea!.value = 'second edit';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    expect(timer.scheduleIdleSave).toHaveBeenCalledTimes(2);

    unmount(app);
  });

  test('PROP-EDIT-034: timer.cancel is called on textarea blur', () => {
    const timer = makeMockTimer();

    const editingSnapshot: EditingSessionState = {
      status: 'editing',
      isDirty: true,
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
        timer,
        clipboard: makeMockClipboard(),
      },
    });
    flushSync();

    stateChannel.emit(editingSnapshot);
    flushSync();

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    textarea!.dispatchEvent(new Event('blur', { bubbles: true }));
    flushSync();

    expect(timer.cancel).toHaveBeenCalled();

    unmount(app);
  });
});
