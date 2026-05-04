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

/** Rust command names exposed via Tauri IPC. Centralises the string literals. */
const CMD = {
  editNoteBody: 'edit_note_body',
  triggerIdleSave: 'trigger_idle_save',
  triggerBlurSave: 'trigger_blur_save',
  retrySave: 'retry_save',
  discardCurrentSession: 'discard_current_session',
  cancelSwitch: 'cancel_switch',
  copyNoteBody: 'copy_note_body',
  requestNewNote: 'request_new_note',
} as const;

export interface TauriEditorAdapter {
  /** Persist keystroke body change to the domain. */
  dispatchEditNoteBody(noteId: string, body: string, issuedAt: string): Promise<void>;
  /** Trigger an idle-debounce save to the domain. */
  dispatchTriggerIdleSave(source: 'capture-idle'): Promise<void>;
  /** Trigger a blur-event save to the domain. */
  dispatchTriggerBlurSave(source: 'capture-blur'): Promise<void>;
  /** Retry a failed save. */
  dispatchRetrySave(): Promise<void>;
  /** Discard the current editing session. */
  dispatchDiscardCurrentSession(): Promise<void>;
  /** Cancel a pending note-switch. */
  dispatchCancelSwitch(): Promise<void>;
  /** Copy the note body to clipboard via the domain. */
  dispatchCopyNoteBody(noteId: string): Promise<void>;
  /** Request creation of a new note from the given source. */
  dispatchRequestNewNote(source: 'explicit-button' | 'ctrl-N', issuedAt: string): Promise<void>;
}

export function createTauriEditorAdapter(): TauriEditorAdapter {
  return {
    dispatchEditNoteBody(noteId: string, body: string, issuedAt: string): Promise<void> {
      return invoke(CMD.editNoteBody, { noteId, body, issuedAt, dirty: true });
    },
    dispatchTriggerIdleSave(source: 'capture-idle'): Promise<void> {
      return invoke(CMD.triggerIdleSave, { source });
    },
    dispatchTriggerBlurSave(source: 'capture-blur'): Promise<void> {
      return invoke(CMD.triggerBlurSave, { source });
    },
    dispatchRetrySave(): Promise<void> {
      return invoke(CMD.retrySave, {});
    },
    dispatchDiscardCurrentSession(): Promise<void> {
      return invoke(CMD.discardCurrentSession, {});
    },
    dispatchCancelSwitch(): Promise<void> {
      return invoke(CMD.cancelSwitch, {});
    },
    dispatchCopyNoteBody(noteId: string): Promise<void> {
      return invoke(CMD.copyNoteBody, { noteId });
    },
    dispatchRequestNewNote(source: 'explicit-button' | 'ctrl-N', issuedAt: string): Promise<void> {
      return invoke(CMD.requestNewNote, { source, issuedAt });
    },
  };
}
