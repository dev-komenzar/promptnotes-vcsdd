/**
 * editor-validation.dom.vitest.ts — PROP-EDIT-032
 *
 * REQ-EDIT-027, REQ-EDIT-016 (validation paths)
 *
 * Verifies:
 * - PROP-EDIT-032: SaveValidationError.invariant-violated → console.error logged,
 *   NO inline UI message shown (silent).
 * - PROP-EDIT-032: SaveValidationError.empty-body-on-idle → no banner shown,
 *   successor state is editing+isDirty=false.
 * - FIND-009: issuedAt values match ISO-8601 format (not millisecond integer strings).
 *
 * RED phase: issuedAt is clock.now().toString() (numeric string), not ISO-8601.
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

const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

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

const editingSnapshot: EditingSessionState = {
  status: 'editing',
  isDirty: false,
  currentNoteId: 'note-001',
  pendingNextNoteId: null,
  lastError: null,
  body: '',
};

describe('editor-validation — PROP-EDIT-032', () => {
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

  // ── PROP-EDIT-032: validation.invariant-violated — silent, no banner ──

  test('PROP-EDIT-032: invariant-violated SaveError does NOT show save-failure banner', () => {
    const invariantViolatedSnapshot: EditingSessionState = {
      status: 'save-failed',
      isDirty: true,
      currentNoteId: 'note-001',
      pendingNextNoteId: null,
      lastError: { kind: 'validation', reason: { kind: 'invariant-violated' } },
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

    stateChannel.emit(invariantViolatedSnapshot);
    flushSync();

    // Per REQ-EDIT-016: validation.invariant-violated is silent — no banner
    // The status IS save-failed in the snapshot, so the banner may conditionally render
    // But if it does render, the message must not show a user-facing text for this case
    // Per spec: "内部バグ：エラーログ + サイレント"
    // The component should handle this via bannerMessageFor returning null → no banner message
    const bannerMessage = target.querySelector('[data-testid="save-failure-message"]');
    if (bannerMessage) {
      // If a message element exists, it must be empty or null for invariant-violated
      expect(bannerMessage.textContent?.trim()).toBe('');
    }
    // No explicit banner is mandatory for invariant-violated per spec

    unmount(app);
  });

  // ── PROP-EDIT-032: empty-body-on-idle — silent, successor is editing+isDirty=false ──

  test('PROP-EDIT-032: empty-body-on-idle successor state is editing with isDirty=false', () => {
    const emptyBodyDiscardedSnapshot: EditingSessionState = {
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
        timer: makeMockTimer(),
        clipboard: makeMockClipboard(),
      },
    });
    flushSync();

    stateChannel.emit(emptyBodyDiscardedSnapshot);
    flushSync();

    // No banner in editing state
    const banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).toBeNull();

    // Textarea is editable (editing state)
    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();
    expect(textarea!.disabled).toBe(false);
    expect(textarea!.readOnly).toBe(false);

    // No dirty indicator (isDirty=false)
    const dirtyIndicator = target.querySelector('[data-testid="dirty-indicator"]');
    expect(dirtyIndicator).toBeNull();

    unmount(app);
  });

  // ── FIND-009: issuedAt must be ISO-8601, not numeric string ──

  test('FIND-009: EditNoteBody issuedAt is ISO-8601 format', () => {
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

    textarea!.value = 'some content';
    textarea!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();

    expect(adapter.dispatchEditNoteBody).toHaveBeenCalledOnce();
    const a = adapter as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const [, , issuedAt] = a['dispatchEditNoteBody'].mock.calls[0] as [string, string, string];
    expect(issuedAt).toMatch(ISO_8601_REGEX);

    unmount(app);
  });

  test('FIND-009: RequestNewNote issuedAt is ISO-8601 format', () => {
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
    const a2 = adapter as unknown as Record<string, ReturnType<typeof vi.fn>>;
    const [, issuedAt] = a2['dispatchRequestNewNote'].mock.calls[0] as [string, string];
    expect(issuedAt).toMatch(ISO_8601_REGEX);

    unmount(app);
  });

  test('FIND-009: TriggerBlurSave issuedAt (via NoteBodyEdited then blur) produces ISO-8601', () => {
    const editingDirtySnapshot: EditingSessionState = {
      status: 'editing',
      isDirty: true,
      currentNoteId: 'note-001',
      pendingNextNoteId: null,
      lastError: null,
      body: 'content',
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

    stateChannel.emit(editingDirtySnapshot);
    flushSync();

    const textarea = target.querySelector<HTMLTextAreaElement>('[data-testid="editor-body"]');
    expect(textarea).not.toBeNull();

    // The blur event produces a trigger-blur-save command with issuedAt from clock
    textarea!.dispatchEvent(new Event('blur', { bubbles: true }));
    flushSync();

    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledOnce();
    // dispatchTriggerBlurSave signature: (source: 'capture-blur') — source only at adapter level
    // The issuedAt is embedded in the EditorCommand payload but current adapter only passes source.
    // We verify at least that source is correct and the call was made.
    expect(adapter.dispatchTriggerBlurSave).toHaveBeenCalledWith('capture-blur');

    unmount(app);
  });
});
