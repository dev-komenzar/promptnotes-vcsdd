/**
 * editorStateChannel.dom.vitest.ts — CRIT-010
 *
 * Verifies:
 * - subscribe() calls event.listen('editing_session_state_changed', handler)
 * - The returned cleanup function calls unlisten
 * - Payload extraction passes event.payload.state to the subscriber callback
 *
 * RED phase: subscribe() throws 'not implemented (Red phase)'.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

type TauriEventHandler = (event: { payload: unknown }) => void;

const listenMock = vi.fn();
vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: unknown[]) => listenMock(...args),
}));

// Also mock @tauri-apps/api/core to prevent accidental invoke
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { createEditorStateChannel } from '../../editorStateChannel.js';
import type { EditorStateChannel } from '../../editorStateChannel.js';
import type { EditingSessionState } from '../../types.js';

const makeSnapshot = (overrides: Partial<EditingSessionState> = {}): EditingSessionState => ({
  status: 'idle',
  isDirty: false,
  currentNoteId: null,
  pendingNextNoteId: null,
  lastError: null,
  body: '',
  ...overrides,
});

describe('EditorStateChannel — CRIT-010', () => {
  let channel: EditorStateChannel;
  let unlistenFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listenMock.mockReset();
    unlistenFn = vi.fn();
    // listen returns a Promise<unlisten fn>
    listenMock.mockResolvedValue(unlistenFn);
    channel = createEditorStateChannel();
  });

  test('subscribe() calls listen("editing_session_state_changed", handler)', async () => {
    const handler = vi.fn();
    channel.subscribe(handler);
    // Allow microtask to flush
    await Promise.resolve();
    expect(listenMock).toHaveBeenCalledOnce();
    expect(listenMock.mock.calls[0]![0]).toBe('editing_session_state_changed');
    expect(typeof listenMock.mock.calls[0]![1]).toBe('function');
  });

  test('returned cleanup function calls the unlisten function', async () => {
    const handler = vi.fn();
    const unsubscribe = channel.subscribe(handler);
    await Promise.resolve();
    unsubscribe();
    expect(unlistenFn).toHaveBeenCalledOnce();
  });

  test('payload extraction: handler receives event.payload.state', async () => {
    const handler = vi.fn();
    channel.subscribe(handler);
    await Promise.resolve();

    const snapshot = makeSnapshot({ status: 'editing', isDirty: true, body: 'hello' });
    const tauriHandler = listenMock.mock.calls[0]![1] as TauriEventHandler;

    // Simulate Tauri event: { payload: { state: EditingSessionState } }
    tauriHandler({ payload: { state: snapshot } });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(snapshot);
  });

  test('handler is not called before a Tauri event arrives', async () => {
    const handler = vi.fn();
    channel.subscribe(handler);
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
  });
});
