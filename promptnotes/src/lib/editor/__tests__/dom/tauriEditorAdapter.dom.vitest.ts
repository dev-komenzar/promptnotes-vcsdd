/**
 * tauriEditorAdapter.dom.vitest.ts — CRIT-009
 *
 * Verifies that each of the 8 dispatchXxx methods calls invoke() with the
 * exact snake_case command name and the exact payload shape defined in
 * sprint-2 contract §2 and verification-architecture.md §8/§10.
 *
 * RED phase: all method calls throw 'not implemented (Red phase)'.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const invokeMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

import { createTauriEditorAdapter } from '../../tauriEditorAdapter.js';
import type { TauriEditorAdapter } from '../../tauriEditorAdapter.js';

describe('TauriEditorAdapter — CRIT-009', () => {
  let adapter: TauriEditorAdapter;

  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    adapter = createTauriEditorAdapter();
  });

  test('dispatchEditNoteBody calls invoke("edit_note_body", { noteId, body, issuedAt, dirty: true })', async () => {
    await adapter.dispatchEditNoteBody('note-1', 'hello world', '2024-01-01T00:00:00Z');
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('edit_note_body', {
      noteId: 'note-1',
      body: 'hello world',
      issuedAt: '2024-01-01T00:00:00Z',
      dirty: true,
    });
  });

  test('dispatchTriggerIdleSave calls invoke("trigger_idle_save", { source: "capture-idle" })', async () => {
    await adapter.dispatchTriggerIdleSave('capture-idle');
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('trigger_idle_save', {
      source: 'capture-idle',
    });
  });

  test('dispatchTriggerBlurSave calls invoke("trigger_blur_save", { source: "capture-blur" })', async () => {
    await adapter.dispatchTriggerBlurSave('capture-blur');
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('trigger_blur_save', {
      source: 'capture-blur',
    });
  });

  test('dispatchRetrySave calls invoke("retry_save", {})', async () => {
    await adapter.dispatchRetrySave();
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('retry_save', {});
  });

  test('dispatchDiscardCurrentSession calls invoke("discard_current_session", {})', async () => {
    await adapter.dispatchDiscardCurrentSession();
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('discard_current_session', {});
  });

  test('dispatchCancelSwitch calls invoke("cancel_switch", {})', async () => {
    await adapter.dispatchCancelSwitch();
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('cancel_switch', {});
  });

  test('dispatchCopyNoteBody calls invoke("copy_note_body", { noteId })', async () => {
    await adapter.dispatchCopyNoteBody('note-42');
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('copy_note_body', { noteId: 'note-42' });
  });

  test('dispatchRequestNewNote calls invoke("request_new_note", { source, issuedAt })', async () => {
    await adapter.dispatchRequestNewNote('explicit-button', '2024-06-01T10:00:00Z');
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('request_new_note', {
      source: 'explicit-button',
      issuedAt: '2024-06-01T10:00:00Z',
    });
  });

  test('dispatchRequestNewNote with ctrl-N source', async () => {
    await adapter.dispatchRequestNewNote('ctrl-N', '2024-06-01T10:00:01Z');
    expect(invokeMock).toHaveBeenCalledWith('request_new_note', {
      source: 'ctrl-N',
      issuedAt: '2024-06-01T10:00:01Z',
    });
  });
});
