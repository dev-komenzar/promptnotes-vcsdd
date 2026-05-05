/**
 * feedStateChannel.ts — INBOUND only Tauri event channel.
 *
 * Effectful shell. INBOUND only. No command dispatch here.
 * PROP-FEED-032: IPC boundary — no command dispatch in this file.
 */

import { listen } from '@tauri-apps/api/event';
import type { FeedDomainSnapshot } from './types.js';

export interface FeedStateChannel {
  subscribe(handler: (snapshot: FeedDomainSnapshot) => void): () => void;
}

export function createFeedStateChannel(): FeedStateChannel {
  return {
    subscribe(handler: (snapshot: FeedDomainSnapshot) => void): () => void {
      let unlistenFn: (() => void) | null = null;

      listen(
        'feed_state_changed',
        (event: { payload: FeedDomainSnapshot }) => {
          handler(event.payload);
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
