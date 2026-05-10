/**
 * feed-list-editing-channel.dom.vitest.ts — Sprint 5 PROP-FEED-S5-005 / S5-020
 *
 * Coverage:
 *   PROP-FEED-S5-005 — emit-ordering protocol: editingSessionState updated
 *                      synchronously before feedReducer.DomainSnapshotReceived.
 *   PROP-FEED-S5-020 — EC-FEED-020: payload received before subscriber mounts
 *                      is lost; later emit recovers.
 *
 * REQ coverage: REQ-FEED-029, REQ-FEED-032
 *
 * RED PHASE: editingSessionChannel.ts and the +page.svelte / FeedList
 * subscription-mount logic do not exist yet. The dynamic import of the
 * channel module will throw, causing all tests to FAIL.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const listenSpy = vi.hoisted(() => vi.fn());
const handlersByEvent = vi.hoisted(() => new Map<string, ((evt: { payload: unknown }) => void)[]>());
const unlistenSpy = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/event', () => ({
  listen: (eventName: string, handler: (evt: { payload: unknown }) => void) => {
    listenSpy(eventName, handler);
    const list = handlersByEvent.get(eventName) ?? [];
    list.push(handler);
    handlersByEvent.set(eventName, list);
    return Promise.resolve(unlistenSpy);
  },
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

beforeEach(() => {
  listenSpy.mockClear();
  handlersByEvent.clear();
  unlistenSpy.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function emit(eventName: string, payload: unknown): void {
  const handlers = handlersByEvent.get(eventName) ?? [];
  for (const h of handlers) {
    h({ payload });
  }
}

// ── PROP-FEED-S5-005: emit-ordering protocol ─────────────────────────────────

describe('PROP-FEED-S5-005: editing_session_state_changed handler is synchronous', () => {
  test('handler updates state observable from feedReducer call (sync)', async () => {
    // Dynamic import: editingSessionChannel.ts does not exist in RED phase.
    const channelModule = (await import(
      '../../editingSessionChannel.js'
    )) as {
      subscribeEditingSessionState: (h: (s: unknown) => void) => () => void;
    };
    let observed: unknown = null;
    const unsubscribe = channelModule.subscribeEditingSessionState((state) => {
      observed = state;
    });
    // Synchronous emit — no await between emits or before the assert.
    const payload = {
      state: {
        status: 'editing',
        currentNoteId: 'note-001',
        focusedBlockId: 'b1',
        isDirty: false,
        isNoteEmpty: false,
        lastSaveResult: null,
        blocks: [{ id: 'b1', type: 'paragraph', content: 'h' }],
      },
    };
    emit('editing_session_state_changed', payload);
    // After synchronous emit, observed must be the new state immediately.
    expect(observed).not.toBeNull();
    expect((observed as { currentNoteId?: string }).currentNoteId).toBe('note-001');
    unsubscribe();
  });
});

// ── PROP-FEED-S5-020: EC-FEED-020 — handler-late mount ───────────────────────

describe('PROP-FEED-S5-020: EC-FEED-020 — payload before subscriber mount is lost; later emit recovers', () => {
  test('emit before subscribe is lost; emit after subscribe is delivered', async () => {
    // Pre-mount emit: no subscriber yet.
    const earlyPayload = {
      state: {
        status: 'editing',
        currentNoteId: 'noteA',
        focusedBlockId: null,
        isDirty: false,
        isNoteEmpty: true,
        lastSaveResult: null,
      },
    };
    emit('editing_session_state_changed', earlyPayload);
    // Now subscribe.
    const channelModule = (await import(
      '../../editingSessionChannel.js'
    )) as {
      subscribeEditingSessionState: (h: (s: unknown) => void) => () => void;
    };
    let observed: unknown = null;
    const unsubscribe = channelModule.subscribeEditingSessionState((s) => {
      observed = s;
    });
    // Early emit should NOT have been delivered.
    expect(observed).toBeNull();
    // Late emit IS delivered.
    const latePayload = {
      state: {
        status: 'editing',
        currentNoteId: 'noteB',
        focusedBlockId: 'b1',
        isDirty: false,
        isNoteEmpty: false,
        lastSaveResult: null,
        blocks: [{ id: 'b1', type: 'paragraph', content: 'l' }],
      },
    };
    emit('editing_session_state_changed', latePayload);
    expect((observed as { currentNoteId?: string } | null)?.currentNoteId).toBe('noteB');
    unsubscribe();
  });
});
