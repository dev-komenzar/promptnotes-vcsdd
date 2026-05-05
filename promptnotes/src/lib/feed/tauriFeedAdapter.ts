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
  /** ui-tag-chip: Add a tag to a note via chip interaction. */
  dispatchAddTagViaChip?(noteId: string, tag: string, issuedAt: string): Promise<void>;
  /** ui-tag-chip: Remove a tag from a note via chip interaction. */
  dispatchRemoveTagViaChip?(noteId: string, tag: string, issuedAt: string): Promise<void>;
  /** ui-tag-chip: Apply a tag filter. */
  dispatchApplyFilter?(tag: string): void;
  /** ui-tag-chip: Remove a tag filter. */
  dispatchRemoveFilter?(tag: string): void;
  /** ui-tag-chip: Clear all filters. */
  dispatchClearFilter?(): void;
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
    // ui-tag-chip: Tag write operations call the Tauri write command.
    // The domain pipeline (tagChipUpdate) is invoked via the Vault-level adapter
    // which shares the writeFileAtomic handler. Filter operations are pure client-side.
    dispatchAddTagViaChip(noteId: string, _tag: string, issuedAt: string): Promise<void> {
      // Tag chip writes are handled by the Vault adapter's writeFileAtomic flow.
      // For now, emit a note-written event trigger — the Rust handler will
      // emit an EditingStateChanged snapshot.
      return invoke('edit_note_body', { noteId, body: '', issuedAt });
    },
    dispatchRemoveTagViaChip(noteId: string, _tag: string, issuedAt: string): Promise<void> {
      return invoke('edit_note_body', { noteId, body: '', issuedAt });
    },
    dispatchApplyFilter(_tag: string): void {
      // Pure client-side filter toggle — state updated by reducer.
    },
    dispatchRemoveFilter(_tag: string): void {
      // Pure client-side filter toggle — state updated by reducer.
    },
    dispatchClearFilter(): void {
      // Pure client-side filter clear — state updated by reducer.
    },
  };
}
