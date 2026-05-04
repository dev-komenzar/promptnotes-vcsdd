/**
 * editorStateChannel.ts — INBOUND event channel (effectful shell, Sprint 2)
 *
 * Wraps @tauri-apps/api/event listen('editing_session_state_changed', handler).
 * Extracts payload.payload.state and passes it to the subscriber callback.
 */

import { listen } from '@tauri-apps/api/event';
import type { EditingSessionState } from './types.js';

export interface EditorStateChannel {
  /**
   * Register `handler` to receive every inbound EditingSessionState snapshot.
   * Returns an unsubscribe function; call it to stop receiving events.
   */
  subscribe(handler: (state: EditingSessionState) => void): () => void;
}

export function createEditorStateChannel(): EditorStateChannel {
  return {
    subscribe(handler: (state: EditingSessionState) => void): () => void {
      // listen() is async; cache the unlisten callback once the Promise resolves.
      // Any events that arrive before resolution are still forwarded via the
      // synchronously registered inner callback.
      let unlistenFn: (() => void) | null = null;

      listen(
        'editing_session_state_changed',
        (event: { payload: { state: EditingSessionState } }) => {
          handler(event.payload.state);
        }
      ).then((fn) => {
        unlistenFn = fn;
      });

      return () => {
        unlistenFn?.();
      };
    },
  };
}
