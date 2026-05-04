/**
 * editor-accessibility.dom.vitest.ts — PROP-EDIT-033
 *
 * NFR-EDIT-001, NFR-EDIT-002, REQ-EDIT-022, REQ-EDIT-023
 * FIND-012: New Note button lacks aria-disabled; banner buttons lack aria attributes.
 *
 * Verifies:
 * - PROP-EDIT-033: aria-disabled="true" on New Note button when disabled (switching state).
 * - PROP-EDIT-033: aria-disabled="false" on New Note button when enabled.
 * - PROP-EDIT-033: Save-failure banner has role="alert".
 * - PROP-EDIT-033: tabIndex is not negative on enabled interactive elements.
 * - PROP-EDIT-033: Banner buttons have accessible labels (their visible text is sufficient
 *   per NFR-EDIT-001 when labels are descriptive enough; we assert text is non-empty).
 *
 * RED phase: New Note button has no aria-disabled attribute; FIND-012 not yet fixed.
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

const editingSnapshot: EditingSessionState = {
  status: 'editing',
  isDirty: false,
  currentNoteId: 'note-001',
  pendingNextNoteId: null,
  lastError: null,
  body: 'some content',
};

const switchingSnapshot: EditingSessionState = {
  status: 'switching',
  isDirty: true,
  currentNoteId: 'note-001',
  pendingNextNoteId: 'note-002',
  lastError: null,
  body: 'content',
};

const saveFailedSnapshot: EditingSessionState = {
  status: 'save-failed',
  isDirty: true,
  currentNoteId: 'note-001',
  pendingNextNoteId: null,
  lastError: { kind: 'fs', reason: { kind: 'unknown' } },
  body: 'content',
};

describe('editor-accessibility — PROP-EDIT-033', () => {
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

  // ── FIND-012: New Note button aria-disabled ──

  test('FIND-012: New Note button has aria-disabled="true" in switching state', () => {
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
    expect(newNoteBtn!.getAttribute('aria-disabled')).toBe('true');

    unmount(app);
  });

  test('FIND-012: New Note button has aria-disabled="false" in idle state', () => {
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
    expect(newNoteBtn!.getAttribute('aria-disabled')).toBe('false');

    unmount(app);
  });

  test('FIND-012: New Note button has aria-disabled="false" in editing state', () => {
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

    const newNoteBtn = target.querySelector<HTMLButtonElement>('[data-testid="new-note-button"]');
    expect(newNoteBtn).not.toBeNull();
    expect(newNoteBtn!.getAttribute('aria-disabled')).toBe('false');

    unmount(app);
  });

  // ── NFR-EDIT-002: Banner has role="alert" ──

  test('NFR-EDIT-002: Save-failure banner has role="alert"', () => {
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

    const banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute('role')).toBe('alert');

    unmount(app);
  });

  // ── NFR-EDIT-001: Interactive elements are keyboard reachable (tabIndex not -1) ──

  test('NFR-EDIT-001: Textarea tabIndex is not negative when enabled', () => {
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
    expect(textarea!.tabIndex).not.toBe(-1);

    unmount(app);
  });

  test('NFR-EDIT-001: Copy button tabIndex is not negative when enabled', () => {
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

    const copyBtn = target.querySelector<HTMLButtonElement>('[data-testid="copy-body-button"]');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.tabIndex).not.toBe(-1);

    unmount(app);
  });

  test('NFR-EDIT-001: New Note button tabIndex is not negative when enabled', () => {
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
    expect(newNoteBtn!.tabIndex).not.toBe(-1);

    unmount(app);
  });

  // ── Banner buttons: visible label assertions (NFR-EDIT-001 "descriptive labels") ──

  test('NFR-EDIT-001: Banner Retry button has non-empty, descriptive visible label', () => {
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
    const label = retryBtn!.textContent?.trim() ?? retryBtn!.getAttribute('aria-label') ?? '';
    expect(label.length).toBeGreaterThan(0);

    unmount(app);
  });

  test('NFR-EDIT-001: Banner Discard button has non-empty, descriptive visible label', () => {
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
    const label = discardBtn!.textContent?.trim() ?? discardBtn!.getAttribute('aria-label') ?? '';
    expect(label.length).toBeGreaterThan(0);

    unmount(app);
  });

  test('NFR-EDIT-001: Banner Cancel button has non-empty, descriptive visible label', () => {
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
    const label = cancelBtn!.textContent?.trim() ?? cancelBtn!.getAttribute('aria-label') ?? '';
    expect(label.length).toBeGreaterThan(0);

    unmount(app);
  });
});
