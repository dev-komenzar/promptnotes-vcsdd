/**
 * EditorPane.copy.dom.vitest.ts — CRIT-005
 *
 * REQ-EDIT-021, REQ-EDIT-022, EC-EDIT-006 / PROP-EDIT-016, PROP-EDIT-017
 *
 * Verifies:
 * - Copy button click with non-empty-after-trim body calls clipboardAdapter.write(body) once.
 * - Copy button click when body is whitespace-only does not call clipboardAdapter.write.
 * - Copy button is disabled (disabled attr + aria-disabled='true') in idle/switching/save-failed
 *   states and when body.trim().length === 0.
 * - Copy button is enabled in editing/saving states when body is non-empty after trim.
 * - EC-EDIT-006: reactive toggle from whitespace to non-empty re-enables the button.
 *
 * RED phase: copy button absent → tests FAIL.
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

function makeSnapshotWith(status: EditingSessionState['status'], body: string): EditingSessionState {
  return {
    status,
    isDirty: body.length > 0,
    currentNoteId: 'note-001',
    pendingNextNoteId: null,
    lastError: null,
    body,
  };
}

describe('EditorPane copy button — CRIT-005', () => {
  let target: HTMLDivElement;
  let adapter: ReturnType<typeof makeMockAdapter>;
  let stateChannel: MockStateChannel;
  let clipboard: ClipboardAdapter & { write: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
    adapter = makeMockAdapter();
    stateChannel = makeMockStateChannel();
    clipboard = { write: vi.fn().mockResolvedValue(undefined) };
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('click with non-empty body calls clipboard.write(body) once', async () => {
    const app = mount(EditorPane, {
      target,
      props: { adapter, stateChannel, timer: makeMockTimer(), clipboard },
    });
    flushSync();

    stateChannel.emit(makeSnapshotWith('editing', 'hello world'));
    flushSync();

    const copyBtn = target.querySelector<HTMLButtonElement>('[data-testid="copy-body-button"]');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.disabled).toBe(false);

    copyBtn!.click();
    flushSync();

    expect(clipboard.write).toHaveBeenCalledOnce();
    expect(clipboard.write).toHaveBeenCalledWith('hello world');

    unmount(app);
  });

  test('click when body is whitespace-only does NOT call clipboard.write', () => {
    const app = mount(EditorPane, {
      target,
      props: { adapter, stateChannel, timer: makeMockTimer(), clipboard },
    });
    flushSync();

    stateChannel.emit(makeSnapshotWith('editing', '   '));
    flushSync();

    const copyBtn = target.querySelector<HTMLButtonElement>('[data-testid="copy-body-button"]');
    expect(copyBtn).not.toBeNull();
    // Button should be disabled when body is whitespace-only
    expect(copyBtn!.disabled).toBe(true);

    copyBtn!.click();
    flushSync();

    expect(clipboard.write).not.toHaveBeenCalled();

    unmount(app);
  });

  test('copy button is disabled in idle state', () => {
    const app = mount(EditorPane, {
      target,
      props: { adapter, stateChannel, timer: makeMockTimer(), clipboard },
    });
    flushSync();

    stateChannel.emit(makeSnapshotWith('idle', 'some content'));
    flushSync();

    const copyBtn = target.querySelector<HTMLButtonElement>('[data-testid="copy-body-button"]');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.disabled).toBe(true);
    expect(copyBtn!.getAttribute('aria-disabled')).toBe('true');

    unmount(app);
  });

  test('copy button is disabled in switching state', () => {
    const app = mount(EditorPane, {
      target,
      props: { adapter, stateChannel, timer: makeMockTimer(), clipboard },
    });
    flushSync();

    stateChannel.emit(makeSnapshotWith('switching', 'some content'));
    flushSync();

    const copyBtn = target.querySelector<HTMLButtonElement>('[data-testid="copy-body-button"]');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.disabled).toBe(true);

    unmount(app);
  });

  test('copy button is disabled in save-failed state', () => {
    const app = mount(EditorPane, {
      target,
      props: { adapter, stateChannel, timer: makeMockTimer(), clipboard },
    });
    flushSync();

    const failedSnapshot: EditingSessionState = {
      status: 'save-failed',
      isDirty: true,
      currentNoteId: 'note-001',
      pendingNextNoteId: null,
      lastError: { kind: 'fs', reason: { kind: 'unknown' } },
      body: 'some content',
    };
    stateChannel.emit(failedSnapshot);
    flushSync();

    const copyBtn = target.querySelector<HTMLButtonElement>('[data-testid="copy-body-button"]');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.disabled).toBe(true);

    unmount(app);
  });

  test('copy button is enabled in editing state with non-empty body', () => {
    const app = mount(EditorPane, {
      target,
      props: { adapter, stateChannel, timer: makeMockTimer(), clipboard },
    });
    flushSync();

    stateChannel.emit(makeSnapshotWith('editing', 'content'));
    flushSync();

    const copyBtn = target.querySelector<HTMLButtonElement>('[data-testid="copy-body-button"]');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.disabled).toBe(false);

    unmount(app);
  });

  test('copy button is enabled in saving state with non-empty body', () => {
    const app = mount(EditorPane, {
      target,
      props: { adapter, stateChannel, timer: makeMockTimer(), clipboard },
    });
    flushSync();

    stateChannel.emit(makeSnapshotWith('saving', 'content'));
    flushSync();

    const copyBtn = target.querySelector<HTMLButtonElement>('[data-testid="copy-body-button"]');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.disabled).toBe(false);

    unmount(app);
  });

  test('EC-EDIT-006: reactive toggle from whitespace to non-empty re-enables the button', () => {
    const app = mount(EditorPane, {
      target,
      props: { adapter, stateChannel, timer: makeMockTimer(), clipboard },
    });
    flushSync();

    // First: whitespace-only → disabled
    stateChannel.emit(makeSnapshotWith('editing', '   '));
    flushSync();

    const copyBtn = target.querySelector<HTMLButtonElement>('[data-testid="copy-body-button"]');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.disabled).toBe(true);

    // Now: non-empty → enabled
    stateChannel.emit(makeSnapshotWith('editing', 'now has content'));
    flushSync();
    flushSync(); // double flush to ensure reactive update

    expect(copyBtn!.disabled).toBe(false);

    unmount(app);
  });
});
