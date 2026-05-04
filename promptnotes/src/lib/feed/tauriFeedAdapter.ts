/**
 * tauriFeedAdapter.ts — OUTBOUND only Tauri IPC adapter.
 *
 * Effectful shell. OUTBOUND only.
 * PROP-FEED-032: IPC boundary — no inbound event subscription here.
 */

import { invoke } from '@tauri-apps/api/core';

const CMD = {
  selectPastNote: 'select_past_note',
  requestNoteDeletion: 'request_note_deletion',
  confirmNoteDeletion: 'confirm_note_deletion',
  cancelNoteDeletion: 'cancel_note_deletion',
} as const;

export interface TauriFeedAdapter {
  dispatchSelectPastNote(noteId: string, issuedAt: string): Promise<void>;
  dispatchRequestNoteDeletion(noteId: string, issuedAt: string): Promise<void>;
  dispatchConfirmNoteDeletion(noteId: string, issuedAt: string): Promise<void>;
  dispatchCancelNoteDeletion(noteId: string, issuedAt: string): Promise<void>;
}

export function createTauriFeedAdapter(): TauriFeedAdapter {
  return {
    dispatchSelectPastNote(noteId: string, issuedAt: string): Promise<void> {
      return invoke(CMD.selectPastNote, { noteId, issuedAt });
    },
    dispatchRequestNoteDeletion(noteId: string, issuedAt: string): Promise<void> {
      return invoke(CMD.requestNoteDeletion, { noteId, issuedAt });
    },
    dispatchConfirmNoteDeletion(noteId: string, issuedAt: string): Promise<void> {
      return invoke(CMD.confirmNoteDeletion, { noteId, issuedAt });
    },
    dispatchCancelNoteDeletion(noteId: string, issuedAt: string): Promise<void> {
      return invoke(CMD.cancelNoteDeletion, { noteId, issuedAt });
    },
  };
}
