/**
 * editingSessionChannel.ts — INBOUND only Tauri channel for the
 * `editing_session_state_changed` event (Sprint 5, REQ-FEED-029).
 *
 * Effectful shell. INBOUND only — must NOT call invoke() (PROP-FEED-S5-021).
 * Holds the single centralized listener for the event (PROP-FEED-S5-003).
 * The listener handler is synchronous (PROP-FEED-S5-012): it invokes the
 * subscriber callback directly without await / setTimeout / queueMicrotask.
 *
 * The 5-arm `EditingSessionStateDto` wire shape is documented in the
 * behavioral spec REQ-FEED-029. This module passes the inner `state` field
 * through unchanged; type-narrowing is the subscriber's responsibility.
 */

import { listen } from '@tauri-apps/api/event';

/**
 * Editing session state delivered by the Rust side.
 * Discriminated by `status`. The full 5-arm shape is in the spec; we use
 * `unknown` here to keep the channel agnostic and let the subscriber
 * narrow per arm.
 */
export type EditingSessionStateDto = { status: string } & Record<string, unknown>;

export type EditingSessionChannelHandler = (state: EditingSessionStateDto) => void;

/**
 * Subscribe to `editing_session_state_changed`. Returns an unsubscribe fn.
 *
 * The handler is invoked synchronously inside the listen callback so that
 * by the time the next event (`feed_state_changed`) fires its own handler,
 * any `$state` updated in our handler is already visible (REQ-FEED-032).
 */
export function subscribeEditingSessionState(
  handler: EditingSessionChannelHandler,
): () => void {
  let unlistenFn: (() => void) | null = null;

  const setupPromise = listen('editing_session_state_changed', (event: { payload: { state?: unknown } | unknown }) => {
    const payload = event.payload as { state?: EditingSessionStateDto } | undefined;
    const state = payload?.state;
    if (state && typeof state === 'object' && 'status' in state) {
      handler(state as EditingSessionStateDto);
    }
  });

  void setupPromise.then((fn) => {
    unlistenFn = fn;
  });

  return () => {
    unlistenFn?.();
  };
}
