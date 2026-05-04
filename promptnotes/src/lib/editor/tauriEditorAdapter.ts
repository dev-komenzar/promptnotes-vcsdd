/**
 * tauriEditorAdapter.ts — OUTBOUND IPC adapter (effectful shell, Sprint 2)
 *
 * Wraps @tauri-apps/api/core invoke() for each of the 8 domain dispatch methods.
 * All methods are behind the TauriEditorAdapter interface so DOM tests can
 * inject a vi.fn() mock without calling real invoke().
 */

import { invoke } from '@tauri-apps/api/core';
import type { _AssertEditNoteBodyShape, _AssertCopyNoteBodyShape } from './types.js';

// Tier 0 structural-conformance assertions (verification-architecture.md §10).
// These must compile; they are not runtime checks.
const _editNoteBodyCheck: _AssertEditNoteBodyShape = true;
const _copyNoteBodyCheck: _AssertCopyNoteBodyShape = true;
void _editNoteBodyCheck;
void _copyNoteBodyCheck;

export interface TauriEditorAdapter {
  dispatchEditNoteBody(noteId: string, body: string, issuedAt: string): Promise<void>;
  dispatchTriggerIdleSave(source: 'capture-idle'): Promise<void>;
  dispatchTriggerBlurSave(source: 'capture-blur'): Promise<void>;
  dispatchRetrySave(): Promise<void>;
  dispatchDiscardCurrentSession(): Promise<void>;
  dispatchCancelSwitch(): Promise<void>;
  dispatchCopyNoteBody(noteId: string): Promise<void>;
  dispatchRequestNewNote(source: 'explicit-button' | 'ctrl-N', issuedAt: string): Promise<void>;
}

export function createTauriEditorAdapter(): TauriEditorAdapter {
  return {
    dispatchEditNoteBody(noteId: string, body: string, issuedAt: string): Promise<void> {
      return invoke('edit_note_body', { noteId, body, issuedAt, dirty: true });
    },
    dispatchTriggerIdleSave(source: 'capture-idle'): Promise<void> {
      return invoke('trigger_idle_save', { source });
    },
    dispatchTriggerBlurSave(source: 'capture-blur'): Promise<void> {
      return invoke('trigger_blur_save', { source });
    },
    dispatchRetrySave(): Promise<void> {
      return invoke('retry_save', {});
    },
    dispatchDiscardCurrentSession(): Promise<void> {
      return invoke('discard_current_session', {});
    },
    dispatchCancelSwitch(): Promise<void> {
      return invoke('cancel_switch', {});
    },
    dispatchCopyNoteBody(noteId: string): Promise<void> {
      return invoke('copy_note_body', { noteId });
    },
    dispatchRequestNewNote(source: 'explicit-button' | 'ctrl-N', issuedAt: string): Promise<void> {
      return invoke('request_new_note', { source, issuedAt });
    },
  };
}
