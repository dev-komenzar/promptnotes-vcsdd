/**
 * editorStateChannel.ts — INBOUND event channel (effectful shell, Sprint 7)
 *
 * INBOUND only: implements subscribeToState(handler) that wraps
 * @tauri-apps/api/event listen('editing_session_state_changed', ...).
 *
 * Returns the unlisten cleanup function.
 * NEVER calls invoke(). NEVER imports anything from tauriEditorAdapter.
 *
 * RD-016: separation of OUTBOUND (tauriEditorAdapter.ts) and INBOUND (this file).
 */

import { listen } from '@tauri-apps/api/event';
import type { EditingSessionStateDto } from './types.js';

/**
 * Subscribe to domain EditingSessionState snapshots from the Rust backend.
 *
 * @param handler Callback invoked with each new EditingSessionStateDto snapshot.
 * @returns Cleanup function that removes the event listener.
 */
export function subscribeToEditorState(
  handler: (state: EditingSessionStateDto) => void
): () => void {
  let unlistenFn: (() => void) | null = null;

  listen(
    'editing_session_state_changed',
    (event: { payload: { state: EditingSessionStateDto } }) => {
      handler(event.payload.state);
    }
  ).then((fn) => {
    unlistenFn = fn;
  });

  return () => {
    unlistenFn?.();
  };
}

/**
 * Creates a subscribeToState function bound to the 'editing_session_state_changed' event.
 * Used by EditorPanel to compose with the outbound adapter.
 */
export function createEditorStateChannel(): {
  subscribeToState: (handler: (state: EditingSessionStateDto) => void) => () => void;
} {
  return {
    subscribeToState: subscribeToEditorState,
  };
}
