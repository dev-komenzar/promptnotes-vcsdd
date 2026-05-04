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
  dispatchEditNoteBody(payload: { noteId: string; body: string; issuedAt: string; dirty: true }): Promise<void>;
  /** Trigger an idle-debounce save to the domain. */
  dispatchTriggerIdleSave(payload: { noteId: string; body: string; issuedAt: string; source: 'capture-idle' }): Promise<void>;
  /** Trigger a blur-event save to the domain. */
  dispatchTriggerBlurSave(payload: { noteId: string; body: string; issuedAt: string; source: 'capture-blur' }): Promise<void>;
  /** Retry a failed save. */
  dispatchRetrySave(payload: { noteId: string; body: string; issuedAt: string }): Promise<void>;
  /** Discard the current editing session. */
  dispatchDiscardCurrentSession(payload: { noteId: string }): Promise<void>;
  /** Cancel a pending note-switch. */
  dispatchCancelSwitch(payload: { noteId: string }): Promise<void>;
  /** Copy the note body to clipboard via the domain. */
  dispatchCopyNoteBody(payload: { noteId: string; body: string }): Promise<void>;
  /** Request creation of a new note from the given source. */
  dispatchRequestNewNote(payload: { source: 'explicit-button' | 'ctrl-N'; issuedAt: string }): Promise<void>;
}

export function createTauriEditorAdapter(): TauriEditorAdapter {
  return {
    dispatchEditNoteBody(payload: { noteId: string; body: string; issuedAt: string; dirty: true }): Promise<void> {
      return invoke(CMD.editNoteBody, payload);
    },
    dispatchTriggerIdleSave(payload: { noteId: string; body: string; issuedAt: string; source: 'capture-idle' }): Promise<void> {
      return invoke(CMD.triggerIdleSave, payload);
    },
    dispatchTriggerBlurSave(payload: { noteId: string; body: string; issuedAt: string; source: 'capture-blur' }): Promise<void> {
      return invoke(CMD.triggerBlurSave, payload);
    },
    dispatchRetrySave(payload: { noteId: string; body: string; issuedAt: string }): Promise<void> {
      return invoke(CMD.retrySave, payload);
    },
    dispatchDiscardCurrentSession(payload: { noteId: string }): Promise<void> {
      return invoke(CMD.discardCurrentSession, payload);
    },
    dispatchCancelSwitch(payload: { noteId: string }): Promise<void> {
      return invoke(CMD.cancelSwitch, payload);
    },
    dispatchCopyNoteBody(payload: { noteId: string; body: string }): Promise<void> {
      return invoke(CMD.copyNoteBody, payload);
    },
    dispatchRequestNewNote(payload: { source: 'explicit-button' | 'ctrl-N'; issuedAt: string }): Promise<void> {
      return invoke(CMD.requestNewNote, payload);
    },
  };
}
