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

  test('dispatchEditNoteBody calls invoke("edit_note_body", full payload)', async () => {
    await adapter.dispatchEditNoteBody({
      noteId: 'note-1',
      body: 'hello world',
      issuedAt: '2024-01-01T00:00:00Z',
      dirty: true,
    });
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('edit_note_body', {
      noteId: 'note-1',
      body: 'hello world',
      issuedAt: '2024-01-01T00:00:00Z',
      dirty: true,
    });
  });

  test('dispatchTriggerIdleSave calls invoke("trigger_idle_save", full EditorCommand payload)', async () => {
    await adapter.dispatchTriggerIdleSave({
      noteId: 'note-1',
      body: 'some content',
      issuedAt: '2024-01-01T00:00:00Z',
      source: 'capture-idle',
    });
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('trigger_idle_save', {
      noteId: 'note-1',
      body: 'some content',
      issuedAt: '2024-01-01T00:00:00Z',
      source: 'capture-idle',
    });
  });

  test('dispatchTriggerBlurSave calls invoke("trigger_blur_save", full EditorCommand payload)', async () => {
    await adapter.dispatchTriggerBlurSave({
      noteId: 'note-2',
      body: 'blur content',
      issuedAt: '2024-01-01T00:01:00Z',
      source: 'capture-blur',
    });
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('trigger_blur_save', {
      noteId: 'note-2',
      body: 'blur content',
      issuedAt: '2024-01-01T00:01:00Z',
      source: 'capture-blur',
    });
  });

  test('dispatchRetrySave calls invoke("retry_save", { noteId, body, issuedAt })', async () => {
    await adapter.dispatchRetrySave({
      noteId: 'note-3',
      body: 'retry content',
      issuedAt: '2024-01-01T00:02:00Z',
    });
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('retry_save', {
      noteId: 'note-3',
      body: 'retry content',
      issuedAt: '2024-01-01T00:02:00Z',
    });
  });

  test('dispatchDiscardCurrentSession calls invoke("discard_current_session", { noteId })', async () => {
    await adapter.dispatchDiscardCurrentSession({ noteId: 'note-4' });
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('discard_current_session', { noteId: 'note-4' });
  });

  test('dispatchCancelSwitch calls invoke("cancel_switch", { noteId })', async () => {
    await adapter.dispatchCancelSwitch({ noteId: 'note-5' });
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('cancel_switch', { noteId: 'note-5' });
  });

  test('dispatchCopyNoteBody calls invoke("copy_note_body", { noteId, body })', async () => {
    await adapter.dispatchCopyNoteBody({ noteId: 'note-42', body: 'copied text' });
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('copy_note_body', {
      noteId: 'note-42',
      body: 'copied text',
    });
  });

  test('dispatchRequestNewNote calls invoke("request_new_note", { source, issuedAt })', async () => {
    await adapter.dispatchRequestNewNote({
      source: 'explicit-button',
      issuedAt: '2024-06-01T10:00:00Z',
    });
    expect(invokeMock).toHaveBeenCalledOnce();
    expect(invokeMock).toHaveBeenCalledWith('request_new_note', {
      source: 'explicit-button',
      issuedAt: '2024-06-01T10:00:00Z',
    });
  });

  test('dispatchRequestNewNote with ctrl-N source', async () => {
    await adapter.dispatchRequestNewNote({
      source: 'ctrl-N',
      issuedAt: '2024-06-01T10:00:01Z',
    });
    expect(invokeMock).toHaveBeenCalledWith('request_new_note', {
      source: 'ctrl-N',
      issuedAt: '2024-06-01T10:00:01Z',
    });
  });
});
