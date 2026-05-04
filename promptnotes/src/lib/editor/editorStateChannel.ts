/**
 * editorStateChannel.ts — INBOUND event channel (effectful shell, Sprint 2)
 *
 * Wraps @tauri-apps/api/event listen('editing_session_state_changed', handler).
 * Extracts payload.payload.state and passes it to the subscriber callback.
 */

import { listen } from '@tauri-apps/api/event';
import type { EditingSessionState } from './types.js';

export interface EditorStateChannel {
  subscribe(handler: (state: EditingSessionState) => void): () => void;
}

export function createEditorStateChannel(): EditorStateChannel {
  return {
    subscribe(handler: (state: EditingSessionState) => void): () => void {
      let unlistenFn: (() => void) | null = null;

      const promise = listen(
        'editing_session_state_changed',
        (event: { payload: { state: EditingSessionState } }) => {
          handler(event.payload.state);
        }
      );

      promise.then((fn) => {
        unlistenFn = fn;
      });

      return () => {
        if (unlistenFn) {
          unlistenFn();
        }
      };
    },
  };
}
