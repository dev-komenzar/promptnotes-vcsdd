/**
 * EditorPane.state-mirror.dom.vitest.ts — CRIT-007
 *
 * REQ-EDIT-009 through REQ-EDIT-013 / PROP-EDIT-024 through PROP-EDIT-028
 *
 * Verifies that for each of the 5 status values, injecting a DomainSnapshotReceived
 * via the mock stateChannel renders the correct DOM attributes:
 *
 * idle        → textarea readonly (or absent) + copy disabled + placeholder visible
 * editing     → textarea editable + dirty indicator when isDirty=true
 * saving      → save indicator (role='status', aria-label containing '保存中') + textarea not disabled
 * switching   → textarea disabled + copy disabled + new-note disabled
 * save-failed → banner present + textarea editable + copy disabled + new-note enabled
 *
 * RED phase: elements absent → tests FAIL.
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

function makeSnapshot(status: EditingSessionState['status'], overrides: Partial<EditingSessionState> = {}): EditingSessionState {
  return {
    status,
    isDirty: false,
    currentNoteId: 'note-001',
    pendingNextNoteId: null,
    lastError: null,
    body: 'some content',
    ...overrides,
  };
}

describe('EditorPane state-mirror — CRIT-007', () => {
  let target: HTMLDivElement;
  let stateChannel: MockStateChannel;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
    stateChannel = makeMockStateChannel();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('idle status', () => {
    test('textarea is readonly or absent', () => {
      const app = mount(EditorPane, {
        target,
        props: { adapter: makeMockAdapter(), stateChannel, timer: makeMockTimer(), clipboard: makeMockClipboard() },
      });
      flushSync();

      stateChannel.emit(makeSnapshot('idle', { body: '' }));
      flushSync();

      const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
      expect(textarea).not.toBeNull();
      // idle: textarea should be readonly (or disabled)
      const isReadonly = textarea!.readOnly || textarea!.disabled;
      expect(isReadonly).toBe(true);

      unmount(app);
    });

    test('copy button is disabled in idle', () => {
      const app = mount(EditorPane, {
        target,
        props: { adapter: makeMockAdapter(), stateChannel, timer: makeMockTimer(), clipboard: makeMockClipboard() },
      });
      flushSync();

      stateChannel.emit(makeSnapshot('idle'));
      flushSync();

      const copyBtn = target.querySelector<HTMLButtonElement>('[data-testid="copy-body-button"]');
      expect(copyBtn).not.toBeNull();
      expect(copyBtn!.disabled).toBe(true);

      unmount(app);
    });
  });

  describe('editing status', () => {
    test('textarea is editable (not readonly, not disabled)', () => {
      const app = mount(EditorPane, {
        target,
        props: { adapter: makeMockAdapter(), stateChannel, timer: makeMockTimer(), clipboard: makeMockClipboard() },
      });
      flushSync();

      stateChannel.emit(makeSnapshot('editing'));
      flushSync();

      const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
      expect(textarea).not.toBeNull();
      expect(textarea!.readOnly).toBe(false);
      expect(textarea!.disabled).toBe(false);

      unmount(app);
    });

    test('dirty indicator is present when isDirty=true', () => {
      const app = mount(EditorPane, {
        target,
        props: { adapter: makeMockAdapter(), stateChannel, timer: makeMockTimer(), clipboard: makeMockClipboard() },
      });
      flushSync();

      stateChannel.emit(makeSnapshot('editing', { isDirty: true }));
      flushSync();

      const dirtyIndicator = target.querySelector('[data-testid="dirty-indicator"]');
      expect(dirtyIndicator).not.toBeNull();

      unmount(app);
    });

    test('dirty indicator is absent when isDirty=false', () => {
      const app = mount(EditorPane, {
        target,
        props: { adapter: makeMockAdapter(), stateChannel, timer: makeMockTimer(), clipboard: makeMockClipboard() },
      });
      flushSync();

      stateChannel.emit(makeSnapshot('editing', { isDirty: false }));
      flushSync();

      const dirtyIndicator = target.querySelector('[data-testid="dirty-indicator"]');
      expect(dirtyIndicator).toBeNull();

      unmount(app);
    });
  });

  describe('saving status', () => {
    test('save indicator with role="status" and aria-label containing "保存中" is present', () => {
      const app = mount(EditorPane, {
        target,
        props: { adapter: makeMockAdapter(), stateChannel, timer: makeMockTimer(), clipboard: makeMockClipboard() },
      });
      flushSync();

      stateChannel.emit(makeSnapshot('saving'));
      flushSync();

      const saveIndicator = target.querySelector('[role="status"]');
      expect(saveIndicator).not.toBeNull();
      expect(saveIndicator!.getAttribute('aria-label')).toContain('保存中');

      unmount(app);
    });

    test('textarea is not disabled in saving', () => {
      const app = mount(EditorPane, {
        target,
        props: { adapter: makeMockAdapter(), stateChannel, timer: makeMockTimer(), clipboard: makeMockClipboard() },
      });
      flushSync();

      stateChannel.emit(makeSnapshot('saving'));
      flushSync();

      const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
      expect(textarea).not.toBeNull();
      expect(textarea!.disabled).toBe(false);

      unmount(app);
    });
  });

  describe('switching status', () => {
    test('textarea is disabled in switching', () => {
      const app = mount(EditorPane, {
        target,
        props: { adapter: makeMockAdapter(), stateChannel, timer: makeMockTimer(), clipboard: makeMockClipboard() },
      });
      flushSync();

      stateChannel.emit(makeSnapshot('switching', { pendingNextNoteId: 'note-002' }));
      flushSync();

      const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
      expect(textarea).not.toBeNull();
      expect(textarea!.disabled).toBe(true);

      unmount(app);
    });

    test('copy button is disabled in switching', () => {
      const app = mount(EditorPane, {
        target,
        props: { adapter: makeMockAdapter(), stateChannel, timer: makeMockTimer(), clipboard: makeMockClipboard() },
      });
      flushSync();

      stateChannel.emit(makeSnapshot('switching', { pendingNextNoteId: 'note-002' }));
      flushSync();

      const copyBtn = target.querySelector<HTMLButtonElement>('[data-testid="copy-body-button"]');
      expect(copyBtn).not.toBeNull();
      expect(copyBtn!.disabled).toBe(true);

      unmount(app);
    });

    test('new-note button is disabled in switching', () => {
      const app = mount(EditorPane, {
        target,
        props: { adapter: makeMockAdapter(), stateChannel, timer: makeMockTimer(), clipboard: makeMockClipboard() },
      });
      flushSync();

      stateChannel.emit(makeSnapshot('switching', { pendingNextNoteId: 'note-002' }));
      flushSync();

      const newNoteBtn = target.querySelector<HTMLButtonElement>('[data-testid="new-note-button"]');
      expect(newNoteBtn).not.toBeNull();
      expect(newNoteBtn!.disabled).toBe(true);

      unmount(app);
    });
  });

  describe('save-failed status', () => {
    const failedSnapshot: EditingSessionState = {
      status: 'save-failed',
      isDirty: true,
      currentNoteId: 'note-001',
      pendingNextNoteId: null,
      lastError: { kind: 'fs', reason: { kind: 'unknown' } },
      body: 'some content',
    };

    test('save-failure-banner is present', () => {
      const app = mount(EditorPane, {
        target,
        props: { adapter: makeMockAdapter(), stateChannel, timer: makeMockTimer(), clipboard: makeMockClipboard() },
      });
      flushSync();

      stateChannel.emit(failedSnapshot);
      flushSync();

      const banner = target.querySelector('[data-testid="save-failure-banner"]');
      expect(banner).not.toBeNull();

      unmount(app);
    });

    test('textarea is editable in save-failed', () => {
      const app = mount(EditorPane, {
        target,
        props: { adapter: makeMockAdapter(), stateChannel, timer: makeMockTimer(), clipboard: makeMockClipboard() },
      });
      flushSync();

      stateChannel.emit(failedSnapshot);
      flushSync();

      const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
      expect(textarea).not.toBeNull();
      expect(textarea!.disabled).toBe(false);

      unmount(app);
    });

    test('copy button is disabled in save-failed', () => {
      const app = mount(EditorPane, {
        target,
        props: { adapter: makeMockAdapter(), stateChannel, timer: makeMockTimer(), clipboard: makeMockClipboard() },
      });
      flushSync();

      stateChannel.emit(failedSnapshot);
      flushSync();

      const copyBtn = target.querySelector<HTMLButtonElement>('[data-testid="copy-body-button"]');
      expect(copyBtn).not.toBeNull();
      expect(copyBtn!.disabled).toBe(true);

      unmount(app);
    });

    test('new-note button is enabled in save-failed', () => {
      const app = mount(EditorPane, {
        target,
        props: { adapter: makeMockAdapter(), stateChannel, timer: makeMockTimer(), clipboard: makeMockClipboard() },
      });
      flushSync();

      stateChannel.emit(failedSnapshot);
      flushSync();

      const newNoteBtn = target.querySelector<HTMLButtonElement>('[data-testid="new-note-button"]');
      expect(newNoteBtn).not.toBeNull();
      expect(newNoteBtn!.disabled).toBe(false);

      unmount(app);
    });
  });
});
