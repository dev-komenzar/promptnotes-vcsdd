/**
 * feedStateChannel.ts — INBOUND only Tauri event channel.
 *
 * Effectful shell. INBOUND only. No command dispatch here.
 * PROP-FEED-032: IPC boundary — no command dispatch in this file.
 */

import type { FeedDomainSnapshot } from './types.js';

// IPC boundary: event subscription is INBOUND only

export interface FeedStateChannel {
  subscribe(handler: (snapshot: FeedDomainSnapshot) => void): () => void;
}

export function createFeedStateChannel(): FeedStateChannel {
  throw new Error('not implemented');
}
