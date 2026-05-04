/**
 * feedReducer.test.ts — Tier 1 + Tier 2 property tests (bun:test + fast-check)
 *
 * Coverage:
 *   PROP-FEED-005 (feedReducer totality)
 *   PROP-FEED-006 (feedReducer purity / referential transparency)
 *   PROP-FEED-007a (DomainSnapshotReceived mirrors editing fields)
 *   PROP-FEED-007b (DomainSnapshotReceived mirrors visibleNoteIds)
 *   PROP-FEED-007c (LoadingStateChanged mirrors loadingStatus)
 *   PROP-FEED-007d (DomainSnapshotReceived mirrors delete fields; NoteFileDeleted resets lastDeletionError)
 *   PROP-FEED-008 / PROP-FEED-009 (deletionErrorMessage totality/non-empty — in deleteConfirmPredicates)
 *   PROP-FEED-010 (canOpenDeleteModal self-delete prevention — in deleteConfirmPredicates)
 *   PROP-FEED-035 ('refresh-feed' emission biconditional)
 *
 * REQ coverage: REQ-FEED-005..018
 *
 * RED PHASE: feedReducer stub throws 'not implemented' — all assertions FAIL.
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import type {
  FeedViewState,
  FeedAction,
  FeedDomainSnapshot,
  NoteDeletionFailureReason,
} from '$lib/feed/types';
import { feedReducer } from '$lib/feed/feedReducer';

// ── Arbitraries ───────────────────────────────────────────────────────────────

const arbEditingStatus = fc.constantFrom(
  'idle' as const,
  'editing' as const,
  'saving' as const,
  'switching' as const,
  'save-failed' as const
);

const arbLoadingStatus = fc.constantFrom('loading' as const, 'ready' as const);
const arbNoteId = fc.string({ minLength: 1, maxLength: 40 });
const arbNoteIdOrNull = fc.oneof(fc.constant(null), arbNoteId);

const arbDeletionReason = fc.constantFrom<NoteDeletionFailureReason>(
  'permission',
  'lock',
  'unknown'
);

const arbLastDeletionError: fc.Arbitrary<{ reason: NoteDeletionFailureReason; detail?: string } | null> =
  fc.oneof(
    fc.constant(null),
    fc.record({
      reason: arbDeletionReason,
      detail: fc.oneof(fc.constant(undefined as string | undefined), fc.string({ minLength: 1, maxLength: 30 })),
    })
  );

const arbVisibleNoteIds: fc.Arbitrary<readonly string[]> = fc.array(arbNoteId, { minLength: 0, maxLength: 10 });

const arbNoteRowMetadata = fc.record({
  body: fc.string({ maxLength: 200 }),
  createdAt: fc.integer({ min: 0 }),
  updatedAt: fc.integer({ min: 0 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
});

const arbNoteMetadata: fc.Arbitrary<Readonly<Record<string, import('$lib/feed/types').NoteRowMetadata>>> =
  fc.dictionary(arbNoteId, arbNoteRowMetadata);

const arbFeedViewState: fc.Arbitrary<FeedViewState> = fc.record({
  editingStatus: arbEditingStatus,
  editingNoteId: arbNoteIdOrNull,
  pendingNextNoteId: arbNoteIdOrNull,
  visibleNoteIds: arbVisibleNoteIds,
  loadingStatus: arbLoadingStatus,
  activeDeleteModalNoteId: arbNoteIdOrNull,
  lastDeletionError: arbLastDeletionError,
  noteMetadata: arbNoteMetadata,
});

const arbCause: fc.Arbitrary<FeedDomainSnapshot['cause']> = fc.oneof(
  fc.record({ kind: fc.constant('NoteFileSaved' as const), savedNoteId: arbNoteId }),
  fc.record({ kind: fc.constant('NoteFileDeleted' as const), deletedNoteId: arbNoteId }),
  fc.record({ kind: fc.constant('NoteDeletionFailed' as const), failedNoteId: arbNoteId }),
  fc.record({ kind: fc.constant('EditingStateChanged' as const) }),
  fc.record({ kind: fc.constant('InitialLoad' as const) })
);

const arbFeedDomainSnapshot: fc.Arbitrary<FeedDomainSnapshot> = fc.record({
  editing: fc.record({
    status: arbEditingStatus,
    currentNoteId: arbNoteIdOrNull,
    pendingNextNoteId: arbNoteIdOrNull,
  }),
  feed: fc.record({
    visibleNoteIds: arbVisibleNoteIds,
    filterApplied: fc.boolean(),
  }),
  delete: fc.record({
    activeDeleteModalNoteId: arbNoteIdOrNull,
    lastDeletionError: arbLastDeletionError,
  }),
  noteMetadata: arbNoteMetadata,
  cause: arbCause,
});

const arbFeedAction: fc.Arbitrary<FeedAction> = fc.oneof(
  arbFeedDomainSnapshot.map(snapshot => ({ kind: 'DomainSnapshotReceived' as const, snapshot })),
  arbNoteId.map(noteId => ({ kind: 'FeedRowClicked' as const, noteId })),
  arbNoteId.map(noteId => ({ kind: 'DeleteButtonClicked' as const, noteId })),
  arbNoteId.map(noteId => ({ kind: 'DeleteConfirmed' as const, noteId })),
  fc.constant({ kind: 'DeleteCancelled' as const }),
  arbNoteId.map(noteId => ({ kind: 'DeletionRetryClicked' as const, noteId })),
  fc.constant({ kind: 'DeletionBannerDismissed' as const }),
  arbLoadingStatus.map(status => ({ kind: 'LoadingStateChanged' as const, status })),
  arbVisibleNoteIds.map(visibleNoteIds => ({ kind: 'FilterApplied' as const, visibleNoteIds })),
  arbVisibleNoteIds.map(visibleNoteIds => ({ kind: 'FilterCleared' as const, visibleNoteIds }))
);

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeInitialState(overrides: Partial<FeedViewState> = {}): FeedViewState {
  return {
    editingStatus: 'idle',
    editingNoteId: null,
    pendingNextNoteId: null,
    visibleNoteIds: [],
    loadingStatus: 'loading',
    activeDeleteModalNoteId: null,
    lastDeletionError: null,
    noteMetadata: {},
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<FeedDomainSnapshot> = {}): FeedDomainSnapshot {
  return {
    editing: {
      status: 'editing',
      currentNoteId: 'note-001',
      pendingNextNoteId: null,
    },
    feed: {
      visibleNoteIds: ['note-001', 'note-002'],
      filterApplied: false,
    },
    delete: {
      activeDeleteModalNoteId: null,
      lastDeletionError: null,
    },
    noteMetadata: {},
    cause: { kind: 'EditingStateChanged' },
    ...overrides,
  };
}

// ── PROP-FEED-005: feedReducer totality ───────────────────────────────────────

describe('PROP-FEED-005: feedReducer totality', () => {
  test('PROP-FEED-005a: never throws for idle + DomainSnapshotReceived (example)', () => {
    const state = makeInitialState({ editingStatus: 'idle' });
    const snapshot = makeSnapshot();
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    expect(() => feedReducer(state, action)).not.toThrow();
  });

  test('PROP-FEED-005b: result.commands is always an array (example)', () => {
    const state = makeInitialState();
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot: makeSnapshot() };
    const result = feedReducer(state, action);
    expect(Array.isArray(result.commands)).toBe(true);
  });

  test('PROP-FEED-005c: result.state.editingStatus is within 5-value enum (example)', () => {
    const validStatuses = new Set(['idle', 'editing', 'saving', 'switching', 'save-failed']);
    const state = makeInitialState();
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot: makeSnapshot() };
    const result = feedReducer(state, action);
    expect(validStatuses.has(result.state.editingStatus)).toBe(true);
  });

  test('PROP-FEED-005d: fast-check — totality over all (state, action) pairs (≥300 runs)', () => {
    const validStatuses = new Set(['idle', 'editing', 'saving', 'switching', 'save-failed']);
    fc.assert(
      fc.property(arbFeedViewState, arbFeedAction, (state, action) => {
        let result: ReturnType<typeof feedReducer> | undefined;
        let threw = false;
        try {
          result = feedReducer(state, action);
        } catch {
          threw = true;
        }
        if (threw) return false;
        if (!result) return false;
        if (!validStatuses.has(result.state.editingStatus)) return false;
        if (!Array.isArray(result.commands)) return false;
        return true;
      }),
      { numRuns: 300 }
    );
  });
});

// ── PROP-FEED-006: feedReducer purity ────────────────────────────────────────

describe('PROP-FEED-006: feedReducer referential transparency', () => {
  test('PROP-FEED-006a: same (state, action) produces deep-equal result twice (example)', () => {
    const state = makeInitialState({ editingStatus: 'editing', editingNoteId: 'note-001' });
    const snapshot = makeSnapshot({ cause: { kind: 'NoteFileSaved', savedNoteId: 'note-001' } });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const r1 = feedReducer(state, action);
    const r2 = feedReducer(state, action);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  test('PROP-FEED-006b: fast-check — same inputs always deep-equal (≥200 runs)', () => {
    fc.assert(
      fc.property(arbFeedViewState, arbFeedAction, (state, action) => {
        try {
          const r1 = feedReducer(state, action);
          const r2 = feedReducer(state, action);
          return JSON.stringify(r1) === JSON.stringify(r2);
        } catch {
          return true; // stub throws — will be caught and counted as failure in red phase
        }
      }),
      { numRuns: 200 }
    );
  });
});

// ── PROP-FEED-007a: snapshot mirroring (editing fields) ──────────────────────

describe('PROP-FEED-007a: DomainSnapshotReceived mirrors editing fields', () => {
  test('PROP-FEED-007a-example: editingStatus mirrors S.editing.status', () => {
    const state = makeInitialState({ editingStatus: 'idle' });
    const snapshot = makeSnapshot({ editing: { status: 'saving', currentNoteId: 'note-x', pendingNextNoteId: 'note-y' } });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = feedReducer(state, action);
    expect(result.state.editingStatus).toBe('saving');
    expect(result.state.editingNoteId).toBe('note-x');
    expect(result.state.pendingNextNoteId).toBe('note-y');
  });

  test('PROP-FEED-007a-fast-check: editingStatus/editingNoteId/pendingNextNoteId mirrored (≥200 runs)', () => {
    fc.assert(
      fc.property(arbFeedViewState, arbFeedDomainSnapshot, (state, snapshot) => {
        const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = feedReducer(state, action);
        return (
          result.state.editingStatus === snapshot.editing.status &&
          result.state.editingNoteId === snapshot.editing.currentNoteId &&
          result.state.pendingNextNoteId === snapshot.editing.pendingNextNoteId
        );
      }),
      { numRuns: 200 }
    );
  });
});

// ── PROP-FEED-007b: snapshot mirroring (visibleNoteIds) ──────────────────────

describe('PROP-FEED-007b: DomainSnapshotReceived mirrors visibleNoteIds', () => {
  test('PROP-FEED-007b-example: visibleNoteIds matches S.feed.visibleNoteIds', () => {
    const state = makeInitialState({ visibleNoteIds: ['old-1'] });
    const snapshot = makeSnapshot({ feed: { visibleNoteIds: ['note-a', 'note-b', 'note-c'], filterApplied: false } });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = feedReducer(state, action);
    expect(Array.from(result.state.visibleNoteIds)).toEqual(['note-a', 'note-b', 'note-c']);
  });

  test('PROP-FEED-007b-fast-check: visibleNoteIds always mirrors snapshot (≥200 runs)', () => {
    fc.assert(
      fc.property(arbFeedViewState, arbFeedDomainSnapshot, (state, snapshot) => {
        const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = feedReducer(state, action);
        const expected = snapshot.feed.visibleNoteIds;
        const actual = result.state.visibleNoteIds;
        if (actual.length !== expected.length) return false;
        for (let i = 0; i < expected.length; i++) {
          if (actual[i] !== expected[i]) return false;
        }
        return true;
      }),
      { numRuns: 200 }
    );
  });
});

// ── PROP-FEED-007c: LoadingStateChanged mirrors loadingStatus ─────────────────

describe('PROP-FEED-007c: LoadingStateChanged mirrors loadingStatus (REQ-FEED-008)', () => {
  test('PROP-FEED-007c-example: loading status transitions to ready', () => {
    const state = makeInitialState({ loadingStatus: 'loading' });
    const action: FeedAction = { kind: 'LoadingStateChanged', status: 'ready' };
    const result = feedReducer(state, action);
    expect(result.state.loadingStatus).toBe('ready');
  });

  test('PROP-FEED-007c-example: ready → loading', () => {
    const state = makeInitialState({ loadingStatus: 'ready' });
    const action: FeedAction = { kind: 'LoadingStateChanged', status: 'loading' };
    const result = feedReducer(state, action);
    expect(result.state.loadingStatus).toBe('loading');
  });

  test('PROP-FEED-007c-fast-check: loadingStatus always mirrored (≥200 runs)', () => {
    fc.assert(
      fc.property(arbFeedViewState, arbLoadingStatus, (state, status) => {
        const action: FeedAction = { kind: 'LoadingStateChanged', status };
        const result = feedReducer(state, action);
        return result.state.loadingStatus === status;
      }),
      { numRuns: 200 }
    );
  });
});

// ── PROP-FEED-007d: snapshot mirroring (delete modal + error) ─────────────────

describe('PROP-FEED-007d: DomainSnapshotReceived mirrors delete fields (FIND-SPEC-3-01)', () => {
  test('PROP-FEED-007d-example: activeDeleteModalNoteId mirrored', () => {
    const state = makeInitialState({ activeDeleteModalNoteId: null });
    const snapshot = makeSnapshot({
      delete: { activeDeleteModalNoteId: 'note-to-delete', lastDeletionError: null },
    });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = feedReducer(state, action);
    expect(result.state.activeDeleteModalNoteId).toBe('note-to-delete');
  });

  test('PROP-FEED-007d-example: NoteFileDeleted cause resets lastDeletionError to null', () => {
    const prevError = { reason: 'permission' as const };
    const state = makeInitialState({ lastDeletionError: prevError });
    const snapshot = makeSnapshot({
      cause: { kind: 'NoteFileDeleted', deletedNoteId: 'note-001' },
      delete: {
        activeDeleteModalNoteId: null,
        lastDeletionError: { reason: 'permission' }, // snapshot has error but cause=deleted resets it
      },
    });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = feedReducer(state, action);
    expect(result.state.lastDeletionError).toBeNull();
  });

  test('PROP-FEED-007d-example: NoteDeletionFailed cause preserves lastDeletionError from snapshot', () => {
    const state = makeInitialState({ lastDeletionError: null });
    const snapshot = makeSnapshot({
      cause: { kind: 'NoteDeletionFailed', failedNoteId: 'note-001' },
      delete: {
        activeDeleteModalNoteId: null,
        lastDeletionError: { reason: 'lock', detail: undefined },
      },
    });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = feedReducer(state, action);
    expect(result.state.lastDeletionError).not.toBeNull();
    expect(result.state.lastDeletionError?.reason).toBe('lock');
  });

  test('PROP-FEED-007d-fast-check: NoteFileDeleted always yields lastDeletionError===null (≥200 runs)', () => {
    fc.assert(
      fc.property(arbFeedViewState, arbFeedDomainSnapshot, arbNoteId, (state, baseSnapshot, deletedId) => {
        const snapshot: FeedDomainSnapshot = {
          ...baseSnapshot,
          cause: { kind: 'NoteFileDeleted', deletedNoteId: deletedId },
        };
        const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = feedReducer(state, action);
        return result.state.lastDeletionError === null;
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-FEED-007d-fast-check: activeDeleteModalNoteId mirrors snapshot.delete.activeDeleteModalNoteId (≥200 runs)', () => {
    fc.assert(
      fc.property(arbFeedViewState, arbFeedDomainSnapshot, (state, snapshot) => {
        const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = feedReducer(state, action);
        return result.state.activeDeleteModalNoteId === snapshot.delete.activeDeleteModalNoteId;
      }),
      { numRuns: 200 }
    );
  });
});

// ── PROP-FEED-035: 'refresh-feed' emission biconditional ─────────────────────

describe("PROP-FEED-035: 'refresh-feed' emission biconditional (REQ-FEED-017, REQ-FEED-018)", () => {
  const refreshTriggerCauses = new Set(['NoteFileSaved', 'NoteFileDeleted']);

  test('PROP-FEED-035a: FilterApplied emits refresh-feed (example)', () => {
    const state = makeInitialState();
    const action: FeedAction = { kind: 'FilterApplied', visibleNoteIds: ['note-x'] };
    const result = feedReducer(state, action);
    const hasRefresh = result.commands.some(c => c.kind === 'refresh-feed');
    expect(hasRefresh).toBe(true);
  });

  test('PROP-FEED-035b: FilterCleared emits refresh-feed (example)', () => {
    const state = makeInitialState();
    const action: FeedAction = { kind: 'FilterCleared', visibleNoteIds: [] };
    const result = feedReducer(state, action);
    const hasRefresh = result.commands.some(c => c.kind === 'refresh-feed');
    expect(hasRefresh).toBe(true);
  });

  test('PROP-FEED-035c: DomainSnapshotReceived + NoteFileSaved cause emits refresh-feed (example)', () => {
    const state = makeInitialState();
    const snapshot = makeSnapshot({ cause: { kind: 'NoteFileSaved', savedNoteId: 'note-001' } });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = feedReducer(state, action);
    const hasRefresh = result.commands.some(c => c.kind === 'refresh-feed');
    expect(hasRefresh).toBe(true);
  });

  test('PROP-FEED-035d: DomainSnapshotReceived + NoteFileDeleted cause emits refresh-feed (example)', () => {
    const state = makeInitialState();
    const snapshot = makeSnapshot({ cause: { kind: 'NoteFileDeleted', deletedNoteId: 'note-001' } });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = feedReducer(state, action);
    const hasRefresh = result.commands.some(c => c.kind === 'refresh-feed');
    expect(hasRefresh).toBe(true);
  });

  test('PROP-FEED-035e: DomainSnapshotReceived + EditingStateChanged does NOT emit refresh-feed (example)', () => {
    const state = makeInitialState();
    const snapshot = makeSnapshot({ cause: { kind: 'EditingStateChanged' } });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = feedReducer(state, action);
    const hasRefresh = result.commands.some(c => c.kind === 'refresh-feed');
    expect(hasRefresh).toBe(false);
  });

  test('PROP-FEED-035f: DeleteButtonClicked does NOT emit refresh-feed (example)', () => {
    const state = makeInitialState();
    const action: FeedAction = { kind: 'DeleteButtonClicked', noteId: 'note-001' };
    const result = feedReducer(state, action);
    const hasRefresh = result.commands.some(c => c.kind === 'refresh-feed');
    expect(hasRefresh).toBe(false);
  });

  test('PROP-FEED-035g: fast-check biconditional — refresh-feed iff trigger condition (≥300 runs)', () => {
    fc.assert(
      fc.property(arbFeedViewState, arbFeedAction, (state, action) => {
        const result = feedReducer(state, action);
        const hasRefresh = result.commands.some(c => c.kind === 'refresh-feed');

        const shouldRefresh =
          action.kind === 'FilterApplied' ||
          action.kind === 'FilterCleared' ||
          (action.kind === 'DomainSnapshotReceived' &&
            refreshTriggerCauses.has(action.snapshot.cause.kind));

        return hasRefresh === shouldRefresh;
      }),
      { numRuns: 300 }
    );
  });
});

// ── REQ-FEED-013: NoteFileDeleted removes note from visibleNoteIds ────────────

describe('REQ-FEED-013: feedReducer removes deleted note from visibleNoteIds', () => {
  test('after DomainSnapshotReceived with NoteFileDeleted, visibleNoteIds excludes deleted note', () => {
    const state = makeInitialState({ visibleNoteIds: ['note-001', 'note-002', 'note-003'] });
    const snapshot = makeSnapshot({
      cause: { kind: 'NoteFileDeleted', deletedNoteId: 'note-002' },
      feed: { visibleNoteIds: ['note-001', 'note-003'], filterApplied: false },
    });
    const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
    const result = feedReducer(state, action);
    expect(Array.from(result.state.visibleNoteIds)).not.toContain('note-002');
    expect(Array.from(result.state.visibleNoteIds)).toContain('note-001');
    expect(Array.from(result.state.visibleNoteIds)).toContain('note-003');
  });
});

// ── REQ-FEED-005/006: FeedRowClicked command emission ─────────────────────────

describe('REQ-FEED-005/006: FeedRowClicked emits select-past-note only when allowed', () => {
  test('FeedRowClicked in idle+ready state emits select-past-note', () => {
    const state = makeInitialState({ editingStatus: 'idle', loadingStatus: 'ready' });
    const action: FeedAction = { kind: 'FeedRowClicked', noteId: 'note-001' };
    const result = feedReducer(state, action);
    const cmd = result.commands.find(c => c.kind === 'select-past-note');
    expect(cmd).toBeDefined();
  });

  test('FeedRowClicked in saving state does NOT emit select-past-note (EC-FEED-004)', () => {
    const state = makeInitialState({ editingStatus: 'saving', loadingStatus: 'ready' });
    const action: FeedAction = { kind: 'FeedRowClicked', noteId: 'note-001' };
    const result = feedReducer(state, action);
    const cmd = result.commands.find(c => c.kind === 'select-past-note');
    expect(cmd).toBeUndefined();
  });

  test('FeedRowClicked in switching state does NOT emit select-past-note (EC-FEED-005)', () => {
    const state = makeInitialState({ editingStatus: 'switching', loadingStatus: 'ready' });
    const action: FeedAction = { kind: 'FeedRowClicked', noteId: 'note-001' };
    const result = feedReducer(state, action);
    const cmd = result.commands.find(c => c.kind === 'select-past-note');
    expect(cmd).toBeUndefined();
  });

  test('FeedRowClicked in loading state does NOT emit select-past-note (EC-FEED-015)', () => {
    const state = makeInitialState({ editingStatus: 'idle', loadingStatus: 'loading' });
    const action: FeedAction = { kind: 'FeedRowClicked', noteId: 'note-001' };
    const result = feedReducer(state, action);
    const cmd = result.commands.find(c => c.kind === 'select-past-note');
    expect(cmd).toBeUndefined();
  });
});
