/**
 * refreshFeedEmission.test.ts — PROP-FEED-035
 *
 * 'refresh-feed' emission biconditional (fast-check)
 *
 * PROP-FEED-035: 'refresh-feed' ∈ feedReducer(s, action).commands ⇔
 *   action.kind ∈ {'FilterApplied', 'FilterCleared'} OR
 *   (action.kind === 'DomainSnapshotReceived' AND cause.kind ∈ {'NoteFileSaved', 'NoteFileDeleted'})
 *
 * This covers REQ-FEED-017 (NoteFileSaved) and REQ-FEED-018 (filter updates).
 *
 * RED PHASE: feedReducer stub throws 'not implemented' — all fc.assert calls FAIL.
 */

import { describe, test } from 'bun:test';
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
const arbVisibleNoteIds: fc.Arbitrary<readonly string[]> = fc.array(arbNoteId, { minLength: 0, maxLength: 10 });
const arbDeletionReason = fc.constantFrom<NoteDeletionFailureReason>('permission', 'lock', 'unknown');
const arbLastDeletionError: fc.Arbitrary<{ reason: NoteDeletionFailureReason; detail?: string } | null> =
  fc.oneof(
    fc.constant(null),
    fc.record({
      reason: arbDeletionReason,
      detail: fc.oneof(fc.constant(undefined as string | undefined), fc.string({ minLength: 1, maxLength: 20 })),
    })
  );

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

// All 5 cause kinds
const arbCauseRefreshTrigger: fc.Arbitrary<FeedDomainSnapshot['cause']> = fc.oneof(
  fc.record({ kind: fc.constant('NoteFileSaved' as const), savedNoteId: arbNoteId }),
  fc.record({ kind: fc.constant('NoteFileDeleted' as const), deletedNoteId: arbNoteId })
);

const arbCauseNonRefresh: fc.Arbitrary<FeedDomainSnapshot['cause']> = fc.oneof(
  fc.record({ kind: fc.constant('NoteDeletionFailed' as const), failedNoteId: arbNoteId }),
  fc.record({ kind: fc.constant('EditingStateChanged' as const) }),
  fc.record({ kind: fc.constant('InitialLoad' as const) })
);

const arbCause: fc.Arbitrary<FeedDomainSnapshot['cause']> = fc.oneof(
  arbCauseRefreshTrigger,
  arbCauseNonRefresh
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

const REFRESH_TRIGGER_CAUSES = new Set(['NoteFileSaved', 'NoteFileDeleted']);

function shouldEmitRefresh(action: FeedAction): boolean {
  if (action.kind === 'FilterApplied' || action.kind === 'FilterCleared') return true;
  if (
    action.kind === 'DomainSnapshotReceived' &&
    REFRESH_TRIGGER_CAUSES.has(action.snapshot.cause.kind)
  ) return true;
  return false;
}

// ── PROP-FEED-035: biconditional ──────────────────────────────────────────────

describe("PROP-FEED-035: 'refresh-feed' emission biconditional (fast-check)", () => {
  test("PROP-FEED-035a: FilterApplied ALWAYS emits 'refresh-feed' (≥200 runs)", () => {
    fc.assert(
      fc.property(arbFeedViewState, arbVisibleNoteIds, (state, visibleNoteIds) => {
        const action: FeedAction = { kind: 'FilterApplied', visibleNoteIds };
        const result = feedReducer(state, action);
        return result.commands.some(c => c.kind === 'refresh-feed');
      }),
      { numRuns: 200 }
    );
  });

  test("PROP-FEED-035b: FilterCleared ALWAYS emits 'refresh-feed' (≥200 runs)", () => {
    fc.assert(
      fc.property(arbFeedViewState, arbVisibleNoteIds, (state, visibleNoteIds) => {
        const action: FeedAction = { kind: 'FilterCleared', visibleNoteIds };
        const result = feedReducer(state, action);
        return result.commands.some(c => c.kind === 'refresh-feed');
      }),
      { numRuns: 200 }
    );
  });

  test("PROP-FEED-035c: DomainSnapshotReceived + NoteFileSaved/NoteFileDeleted ALWAYS emits 'refresh-feed' (≥200 runs)", () => {
    fc.assert(
      fc.property(arbFeedViewState, arbFeedDomainSnapshot, arbCauseRefreshTrigger, (state, baseSnap, cause) => {
        const snapshot: FeedDomainSnapshot = { ...baseSnap, cause };
        const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = feedReducer(state, action);
        return result.commands.some(c => c.kind === 'refresh-feed');
      }),
      { numRuns: 200 }
    );
  });

  test("PROP-FEED-035d: DomainSnapshotReceived + non-refresh cause NEVER emits 'refresh-feed' (≥200 runs)", () => {
    fc.assert(
      fc.property(arbFeedViewState, arbFeedDomainSnapshot, arbCauseNonRefresh, (state, baseSnap, cause) => {
        const snapshot: FeedDomainSnapshot = { ...baseSnap, cause };
        const action: FeedAction = { kind: 'DomainSnapshotReceived', snapshot };
        const result = feedReducer(state, action);
        return !result.commands.some(c => c.kind === 'refresh-feed');
      }),
      { numRuns: 200 }
    );
  });

  test("PROP-FEED-035e: non-filter, non-snapshot actions NEVER emit 'refresh-feed' (≥200 runs)", () => {
    // Actions that should never emit refresh-feed
    const nonRefreshActions: fc.Arbitrary<FeedAction> = fc.oneof(
      arbNoteId.map(noteId => ({ kind: 'FeedRowClicked' as const, noteId })),
      arbNoteId.map(noteId => ({ kind: 'DeleteButtonClicked' as const, noteId })),
      arbNoteId.map(noteId => ({ kind: 'DeleteConfirmed' as const, noteId })),
      fc.constant({ kind: 'DeleteCancelled' as const }),
      arbNoteId.map(noteId => ({ kind: 'DeletionRetryClicked' as const, noteId })),
      fc.constant({ kind: 'DeletionBannerDismissed' as const }),
      arbLoadingStatus.map(status => ({ kind: 'LoadingStateChanged' as const, status }))
    );

    fc.assert(
      fc.property(arbFeedViewState, nonRefreshActions, (state, action) => {
        const result = feedReducer(state, action);
        return !result.commands.some(c => c.kind === 'refresh-feed');
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-FEED-035f: full biconditional over all actions (≥500 runs)', () => {
    fc.assert(
      fc.property(arbFeedViewState, arbFeedAction, (state, action) => {
        const result = feedReducer(state, action);
        const hasRefresh = result.commands.some(c => c.kind === 'refresh-feed');
        return hasRefresh === shouldEmitRefresh(action);
      }),
      { numRuns: 500 }
    );
  });
});
