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
  /**
   * FIND-S2-05: vaultPath is required so the Rust handler can populate
   * visibleNoteIds in the emitted snapshot (prevents feed going blank on selection).
   */
  dispatchSelectPastNote(noteId: string, vaultPath: string, issuedAt: string): Promise<void>;
  dispatchRequestNoteDeletion(noteId: string, issuedAt: string): Promise<void>;
  /**
   * FIND-S2-01: filePath is the OS-level file path to delete.
   * noteId is the logical identifier used in the emitted snapshot.
   * FIND-S2-06: vaultPath is required so the Rust handler can populate
   * remaining visibleNoteIds in the emitted snapshot after deletion.
   */
  dispatchConfirmNoteDeletion(noteId: string, filePath: string, vaultPath: string, issuedAt: string): Promise<void>;
  dispatchCancelNoteDeletion(noteId: string, issuedAt: string): Promise<void>;
}

export function createTauriFeedAdapter(): TauriFeedAdapter {
  return {
    dispatchSelectPastNote(noteId: string, vaultPath: string, issuedAt: string): Promise<void> {
      return invoke(CMD.selectPastNote, { noteId, vaultPath, issuedAt });
    },
    dispatchRequestNoteDeletion(noteId: string, issuedAt: string): Promise<void> {
      return invoke(CMD.requestNoteDeletion, { noteId, issuedAt });
    },
    dispatchConfirmNoteDeletion(noteId: string, filePath: string, vaultPath: string, issuedAt: string): Promise<void> {
      return invoke(CMD.confirmNoteDeletion, { noteId, filePath, vaultPath, issuedAt });
    },
    dispatchCancelNoteDeletion(noteId: string, issuedAt: string): Promise<void> {
      return invoke(CMD.cancelNoteDeletion, { noteId, issuedAt });
    },
  };
}
