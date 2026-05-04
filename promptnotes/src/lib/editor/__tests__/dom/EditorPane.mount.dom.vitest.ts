/**
 * EditorPane.mount.dom.vitest.ts — CRIT-008
 *
 * Mount gate: verify that EditorPane.svelte can be mounted with mock adapters
 * and that the expected UI elements (textarea, copy button, new-note button)
 * are present in the DOM.
 *
 * RED phase: textarea and buttons are absent (placeholder only), so
 * querySelector assertions will return null → tests FAIL.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

import EditorPane from '../../EditorPane.svelte';
import type { TauriEditorAdapter } from '../../tauriEditorAdapter.js';
import type { EditorStateChannel } from '../../editorStateChannel.js';
import type { DebounceTimer } from '../../debounceTimer.js';
import type { ClipboardAdapter } from '../../clipboardAdapter.js';

function makeMockAdapter(): TauriEditorAdapter {
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

function makeMockStateChannel(): EditorStateChannel & { emit: (state: unknown) => void } {
  let _handler: ((s: unknown) => void) | null = null;
  return {
    subscribe(handler) {
      _handler = handler as (s: unknown) => void;
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

describe('EditorPane.mount — CRIT-008', () => {
  let target: HTMLDivElement;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  test('EditorPane mounts without throwing', () => {
    const props = {
      adapter: makeMockAdapter(),
      stateChannel: makeMockStateChannel(),
      timer: makeMockTimer(),
      clipboard: makeMockClipboard(),
    };

    expect(() => {
      const app = mount(EditorPane, { target, props });
      flushSync();
      unmount(app);
    }).not.toThrow();
  });

  test('textarea with data-testid="editor-body" is present after mount', () => {
    const props = {
      adapter: makeMockAdapter(),
      stateChannel: makeMockStateChannel(),
      timer: makeMockTimer(),
      clipboard: makeMockClipboard(),
    };

    const app = mount(EditorPane, { target, props });
    flushSync();

    const textarea = target.querySelector('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    unmount(app);
  });

  test('copy button with data-testid="copy-body-button" is present after mount', () => {
    const props = {
      adapter: makeMockAdapter(),
      stateChannel: makeMockStateChannel(),
      timer: makeMockTimer(),
      clipboard: makeMockClipboard(),
    };

    const app = mount(EditorPane, { target, props });
    flushSync();

    const copyButton = target.querySelector('[data-testid="copy-body-button"]');
    expect(copyButton).not.toBeNull();

    unmount(app);
  });

  test('+新規 button with data-testid="new-note-button" is present after mount', () => {
    const props = {
      adapter: makeMockAdapter(),
      stateChannel: makeMockStateChannel(),
      timer: makeMockTimer(),
      clipboard: makeMockClipboard(),
    };

    const app = mount(EditorPane, { target, props });
    flushSync();

    const newNoteButton = target.querySelector('[data-testid="new-note-button"]');
    expect(newNoteButton).not.toBeNull();

    unmount(app);
  });
});
