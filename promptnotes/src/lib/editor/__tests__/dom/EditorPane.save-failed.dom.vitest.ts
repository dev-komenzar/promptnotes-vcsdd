/**
 * EditorPane.save-failed.dom.vitest.ts — CRIT-004
 *
 * REQ-EDIT-015, REQ-EDIT-016, REQ-EDIT-017, REQ-EDIT-018, REQ-EDIT-019
 * PROP-EDIT-012, PROP-EDIT-013, PROP-EDIT-014, PROP-EDIT-030
 *
 * Verifies:
 * - When DomainSnapshotReceived with status='save-failed' arrives via state channel,
 *   the banner with data-testid='save-failure-banner' and role='alert' appears.
 * - For each FsError kind, the exact Japanese message from bannerMessageFor is rendered.
 * - Retry button click calls dispatchRetrySave once.
 * - Discard button click calls dispatchDiscardCurrentSession once.
 * - Cancel button click calls dispatchCancelSwitch once.
 * - Banner is absent in status='editing'.
 *
 * RED phase: banner and buttons are absent → tests FAIL.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { EditingSessionState, FsError } from '../../types.js';
import { bannerMessageFor } from '../../editorPredicates.js';

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

function makeFailedSnapshot(fsErrorKind: FsError['kind']): EditingSessionState {
  return {
    status: 'save-failed',
    isDirty: true,
    currentNoteId: 'note-001',
    pendingNextNoteId: null,
    lastError: { kind: 'fs', reason: { kind: fsErrorKind } },
    body: 'some content',
  };
}

const editingSnapshot: EditingSessionState = {
  status: 'editing',
  isDirty: false,
  currentNoteId: 'note-001',
  pendingNextNoteId: null,
  lastError: null,
  body: 'some content',
};

describe('EditorPane save-failed banner — CRIT-004', () => {
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

  test('save-failure-banner with role="alert" is present when status="save-failed"', () => {
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

    stateChannel.emit(makeFailedSnapshot('unknown'));
    flushSync();

    const banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).not.toBeNull();
    expect(banner!.getAttribute('role')).toBe('alert');

    unmount(app);
  });

  test('banner is absent when status="editing"', () => {
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

    const banner = target.querySelector('[data-testid="save-failure-banner"]');
    expect(banner).toBeNull();

    unmount(app);
  });

  const fsErrorKinds: FsError['kind'][] = ['permission', 'disk-full', 'lock', 'unknown'];

  for (const kind of fsErrorKinds) {
    test(`banner shows correct Japanese message for FsError kind="${kind}"`, () => {
      const snapshot = makeFailedSnapshot(kind);
      const expectedMessage = bannerMessageFor(snapshot.lastError!);
      expect(expectedMessage).not.toBeNull();

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

      stateChannel.emit(snapshot);
      flushSync();

      const banner = target.querySelector('[data-testid="save-failure-banner"]');
      expect(banner).not.toBeNull();
      expect(banner!.textContent).toContain(expectedMessage!);

      unmount(app);
    });
  }

  test('Retry button click calls dispatchRetrySave once', () => {
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

    stateChannel.emit(makeFailedSnapshot('unknown'));
    flushSync();

    const retryBtn = target.querySelector<HTMLButtonElement>('[data-testid="retry-save-button"]');
    expect(retryBtn).not.toBeNull();

    retryBtn!.click();
    flushSync();

    expect(adapter.dispatchRetrySave).toHaveBeenCalledOnce();

    unmount(app);
  });

  test('Discard button click calls dispatchDiscardCurrentSession once', () => {
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

    stateChannel.emit(makeFailedSnapshot('permission'));
    flushSync();

    const discardBtn = target.querySelector<HTMLButtonElement>('[data-testid="discard-session-button"]');
    expect(discardBtn).not.toBeNull();

    discardBtn!.click();
    flushSync();

    expect(adapter.dispatchDiscardCurrentSession).toHaveBeenCalledOnce();

    unmount(app);
  });

  test('Cancel button click calls dispatchCancelSwitch once', () => {
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

    stateChannel.emit(makeFailedSnapshot('disk-full'));
    flushSync();

    const cancelBtn = target.querySelector<HTMLButtonElement>('[data-testid="cancel-switch-button"]');
    expect(cancelBtn).not.toBeNull();

    cancelBtn!.click();
    flushSync();

    expect(adapter.dispatchCancelSwitch).toHaveBeenCalledOnce();

    unmount(app);
  });

  test('all three buttons are present when status="save-failed"', () => {
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

    stateChannel.emit(makeFailedSnapshot('lock'));
    flushSync();

    expect(target.querySelector('[data-testid="retry-save-button"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="discard-session-button"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="cancel-switch-button"]')).not.toBeNull();

    unmount(app);
  });
});
