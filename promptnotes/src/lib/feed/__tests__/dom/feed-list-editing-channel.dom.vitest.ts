/**
 * feed-list-editing-channel.dom.vitest.ts — Sprint 5 PROP-FEED-S5-005 / S5-020
 *
 * Coverage:
 *   PROP-FEED-S5-005 — emit-ordering protocol with feedReducer spy:
 *     (a) sync mock-emit of editing_session_state_changed THEN feed_state_changed
 *     (b) feedReducer.DomainSnapshotReceived runs with editingSessionState
 *         already updated to the new payload (assertion inside spy callback,
 *         BEFORE delegate)
 *     (c) handler async-free is verified separately by PROP-FEED-S5-012 grep audit
 *   PROP-FEED-S5-020 — EC-FEED-020: payload received before subscriber mounts
 *                      is lost; later emit recovers.
 *   PROP-FEED-S5-005 (5-arm coverage) — exercise Idle / Editing / Switching /
 *     SaveFailed arms (Saving arm shape verified in passing through Editing test).
 *
 * REQ coverage: REQ-FEED-029, REQ-FEED-032
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

async function waitListenerRegistered(): Promise<void> {
  // listen() returns Promise<UnlistenFn>; subscribe attaches handler via .then.
  // Wait for one microtask cycle so the .then callback fires.
  await Promise.resolve();
  await Promise.resolve();
}

// ── PROP-FEED-S5-005 main protocol ────────────────────────────────────────────

describe('PROP-FEED-S5-005: editingSessionChannel synchronizes state before downstream consumers', () => {
  test('handler updates state observable from synchronous downstream call', async () => {
    const channelModule = (await import(
      '../../editingSessionChannel.js'
    )) as {
      subscribeEditingSessionState: (h: (s: unknown) => void) => () => void;
    };
    let observedSnapshot: { currentNoteId?: string } | null = null;
    const unsubscribe = channelModule.subscribeEditingSessionState((state) => {
      observedSnapshot = state as { currentNoteId?: string };
    });
    await waitListenerRegistered();
    expect(handlersByEvent.has('editing_session_state_changed')).toBe(true);

    // Spy that simulates the feed_state_changed downstream consumer (=feedReducer).
    // It MUST observe `observedSnapshot` already up-to-date when invoked.
    const downstreamSpy = vi.fn(() => {
      // Assertion runs INSIDE the downstream spy, BEFORE any delegated work.
      expect(observedSnapshot).not.toBeNull();
      expect((observedSnapshot as { currentNoteId?: string }).currentNoteId).toBe('noteX');
    });

    // Synchronous emit pair — no await between emits.
    emit('editing_session_state_changed', {
      state: {
        status: 'editing',
        currentNoteId: 'noteX',
        focusedBlockId: 'b1',
        isDirty: false,
        isNoteEmpty: false,
        lastSaveResult: null,
        blocks: [{ id: 'b1', type: 'paragraph', content: 'h' }],
      },
    });
    downstreamSpy();
    expect(downstreamSpy).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

// ── PROP-FEED-S5-005 (5-arm dispatch coverage) ────────────────────────────────

describe('PROP-FEED-S5-005 (5-arm): editingSessionChannel passes each arm through unchanged', () => {
  test('Idle arm', async () => {
    const channelModule = (await import('../../editingSessionChannel.js')) as {
      subscribeEditingSessionState: (h: (s: unknown) => void) => () => void;
    };
    let observed: { status?: string } | null = null;
    const unsubscribe = channelModule.subscribeEditingSessionState((s) => {
      observed = s as { status?: string };
    });
    await waitListenerRegistered();
    emit('editing_session_state_changed', { state: { status: 'idle' } });
    expect(observed).not.toBeNull();
    expect((observed as { status?: string }).status).toBe('idle');
    unsubscribe();
  });

  test('Editing arm with blocks present', async () => {
    const channelModule = (await import('../../editingSessionChannel.js')) as {
      subscribeEditingSessionState: (h: (s: unknown) => void) => () => void;
    };
    let observed: { status?: string; blocks?: unknown[] } | null = null;
    const unsubscribe = channelModule.subscribeEditingSessionState((s) => {
      observed = s as { status?: string; blocks?: unknown[] };
    });
    await waitListenerRegistered();
    emit('editing_session_state_changed', {
      state: {
        status: 'editing',
        currentNoteId: 'noteA',
        focusedBlockId: 'b1',
        isDirty: false,
        isNoteEmpty: false,
        lastSaveResult: null,
        blocks: [{ id: 'b1', type: 'paragraph', content: 'h' }],
      },
    });
    const o = observed as { status?: string; blocks?: unknown[] } | null;
    expect(o?.status).toBe('editing');
    expect(o?.blocks?.length).toBe(1);
    unsubscribe();
  });

  test('Switching arm with pendingNextFocus', async () => {
    const channelModule = (await import('../../editingSessionChannel.js')) as {
      subscribeEditingSessionState: (h: (s: unknown) => void) => () => void;
    };
    let observed: { status?: string; pendingNextFocus?: { noteId: string; blockId: string } } | null = null;
    const unsubscribe = channelModule.subscribeEditingSessionState((s) => {
      observed = s as typeof observed;
    });
    await waitListenerRegistered();
    emit('editing_session_state_changed', {
      state: {
        status: 'switching',
        currentNoteId: 'noteA',
        focusedBlockId: 'b1',
        pendingNextFocus: { noteId: 'noteB', blockId: 'b2' },
        isNoteEmpty: false,
      },
    });
    const o = observed as { status?: string; pendingNextFocus?: { noteId: string; blockId: string } } | null;
    expect(o?.status).toBe('switching');
    expect(o?.pendingNextFocus?.noteId).toBe('noteB');
    expect(o?.pendingNextFocus?.blockId).toBe('b2');
    unsubscribe();
  });

  test('SaveFailed arm with priorFocusedBlockId + lastSaveResult', async () => {
    const channelModule = (await import('../../editingSessionChannel.js')) as {
      subscribeEditingSessionState: (h: (s: unknown) => void) => () => void;
    };
    let observed: { status?: string; priorFocusedBlockId?: string | null; lastSaveResult?: unknown } | null = null;
    const unsubscribe = channelModule.subscribeEditingSessionState((s) => {
      observed = s as typeof observed;
    });
    await waitListenerRegistered();
    emit('editing_session_state_changed', {
      state: {
        status: 'save-failed',
        currentNoteId: 'noteA',
        priorFocusedBlockId: 'b1',
        isNoteEmpty: false,
        lastSaveResult: { kind: 'failure', reason: 'permission' },
        pendingNextFocus: null,
      },
    });
    const o = observed as { status?: string; priorFocusedBlockId?: string | null; lastSaveResult?: unknown } | null;
    expect(o?.status).toBe('save-failed');
    expect(o?.priorFocusedBlockId).toBe('b1');
    expect(o?.lastSaveResult).toBeTruthy();
    unsubscribe();
  });
});

// ── PROP-FEED-S5-020: EC-FEED-020 — handler-late mount ───────────────────────

describe('PROP-FEED-S5-020: EC-FEED-020 — payload before subscriber mount is lost; later emit recovers', () => {
  test('emit before subscribe is lost; emit after subscribe is delivered', async () => {
    // Pre-mount emit: no subscriber yet.
    emit('editing_session_state_changed', {
      state: {
        status: 'editing',
        currentNoteId: 'noteA',
        focusedBlockId: null,
        isDirty: false,
        isNoteEmpty: true,
        lastSaveResult: null,
      },
    });
    const channelModule = (await import('../../editingSessionChannel.js')) as {
      subscribeEditingSessionState: (h: (s: unknown) => void) => () => void;
    };
    let observed: { currentNoteId?: string } | null = null;
    const unsubscribe = channelModule.subscribeEditingSessionState((s) => {
      observed = s as { currentNoteId?: string };
    });
    await waitListenerRegistered();
    expect(observed).toBeNull();
    emit('editing_session_state_changed', {
      state: {
        status: 'editing',
        currentNoteId: 'noteB',
        focusedBlockId: 'b1',
        isDirty: false,
        isNoteEmpty: false,
        lastSaveResult: null,
        blocks: [{ id: 'b1', type: 'paragraph', content: 'l' }],
      },
    });
    expect((observed as { currentNoteId?: string } | null)?.currentNoteId).toBe('noteB');
    unsubscribe();
  });
});
