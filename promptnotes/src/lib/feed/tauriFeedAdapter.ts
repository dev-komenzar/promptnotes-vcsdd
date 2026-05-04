/**
 * tauriFeedAdapter.ts — OUTBOUND only Tauri IPC adapter.
 *
 * Effectful shell. OUTBOUND only.
 * PROP-FEED-032: IPC boundary — no inbound event subscription here.
 */

// IPC boundary: command dispatch is OUTBOUND only

export interface TauriFeedAdapter {
  dispatchSelectPastNote(noteId: string, issuedAt: string): Promise<void>;
  dispatchRequestNoteDeletion(noteId: string, issuedAt: string): Promise<void>;
  dispatchConfirmNoteDeletion(noteId: string, issuedAt: string): Promise<void>;
  dispatchCancelNoteDeletion(noteId: string, issuedAt: string): Promise<void>;
}

export function createTauriFeedAdapter(): TauriFeedAdapter {
  throw new Error('not implemented');
}
