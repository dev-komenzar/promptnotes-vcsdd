/**
 * feedReducer.totality.test.ts — Phase 2a (Red): fast-check totality property tests
 *
 * Coverage:
 *   PROP-FILTER-005 (feedReducer totality over all (state, action) including
 *                    SearchApplied with any string, SearchCleared, SortDirectionToggled)
 *   REQ-FILTER-015 (feedReducer purity invariant)
 *   REQ-FILTER-017 (adversarial input handling — no throw)
 *
 * RED PHASE: FeedViewState / FeedAction don't yet have search fields/variants.
 * All tests that depend on new action types MUST FAIL.
 */

import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import type { FeedViewState, FeedAction, FeedDomainSnapshot, NoteDeletionFailureReason } from '$lib/feed/types';
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
const arbSortDirection = fc.constantFrom('asc' as const, 'desc' as const);
const arbSearchQuery = fc.string({ minLength: 0, maxLength: 10000 }); // adversarial

const arbDeletionReason = fc.constantFrom<NoteDeletionFailureReason>(
  'permission', 'lock', 'unknown'
);

const arbLastDeletionError = fc.oneof(
  fc.constant(null),
  fc.record({
    reason: arbDeletionReason,
    detail: fc.oneof(fc.constant(undefined as string | undefined), fc.string({ maxLength: 30 })),
  })
);

const arbNoteIds = fc.array(arbNoteId, { minLength: 0, maxLength: 10 });

const arbNoteRowMetadata = fc.record({
  body: fc.string({ maxLength: 200 }),
  createdAt: fc.integer({ min: 0 }),
  updatedAt: fc.integer({ min: 0 }),
  tags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
});

const arbNoteMetadata = fc.dictionary(arbNoteId, arbNoteRowMetadata);

/** Extended FeedViewState with search fields */
const arbSearchFeedViewState = fc.record({
  editingStatus: arbEditingStatus,
  editingNoteId: arbNoteIdOrNull,
  pendingNextNoteId: arbNoteIdOrNull,
  visibleNoteIds: arbNoteIds,
  allNoteIds: arbNoteIds,
  loadingStatus: arbLoadingStatus,
  activeDeleteModalNoteId: arbNoteIdOrNull,
  lastDeletionError: arbLastDeletionError,
  noteMetadata: arbNoteMetadata,
  tagAutocompleteVisibleFor: fc.constant(null),
  activeFilterTags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
  searchQuery: arbSearchQuery,
  sortDirection: arbSortDirection,
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
    visibleNoteIds: arbNoteIds,
    filterApplied: fc.boolean(),
  }),
  delete: fc.record({
    activeDeleteModalNoteId: arbNoteIdOrNull,
    lastDeletionError: arbLastDeletionError,
  }),
  noteMetadata: arbNoteMetadata,
  cause: arbCause,
});

/** All FeedAction variants including new search/sort ones */
const arbFeedAction: fc.Arbitrary<FeedAction | { kind: 'SearchApplied'; query: string } | { kind: 'SearchCleared' } | { kind: 'SortDirectionToggled' }> = fc.oneof(
  arbFeedDomainSnapshot.map(snapshot => ({ kind: 'DomainSnapshotReceived' as const, snapshot })),
  arbNoteId.map(noteId => ({ kind: 'FeedRowClicked' as const, noteId })),
  arbNoteId.map(noteId => ({ kind: 'DeleteButtonClicked' as const, noteId })),
  arbNoteId.map(noteId => ({ kind: 'DeleteConfirmed' as const, noteId })),
  fc.constant({ kind: 'DeleteCancelled' as const }),
  arbNoteId.map(noteId => ({ kind: 'DeletionRetryClicked' as const, noteId })),
  fc.constant({ kind: 'DeletionBannerDismissed' as const }),
  arbLoadingStatus.map(status => ({ kind: 'LoadingStateChanged' as const, status })),
  arbNoteIds.map(visibleNoteIds => ({ kind: 'FilterApplied' as const, visibleNoteIds })),
  arbNoteIds.map(visibleNoteIds => ({ kind: 'FilterCleared' as const, visibleNoteIds })),
  fc.record({ kind: fc.constant('TagFilterToggled' as const), tag: fc.string({ minLength: 1, maxLength: 20 }) }),
  fc.constant({ kind: 'TagFilterCleared' as const }),
  // ── New search/sort action variants ──
  arbSearchQuery.map(query => ({ kind: 'SearchApplied' as const, query })),
  fc.constant({ kind: 'SearchCleared' as const }),
  fc.constant({ kind: 'SortDirectionToggled' as const }),
);

// ── PROP-FILTER-005: feedReducer totality ─────────────────────────────────────

describe('PROP-FILTER-005: feedReducer totality including search/sort actions', () => {
  test('PROP-FILTER-005a: feedReducer never throws for SearchApplied with any query string', () => {
    fc.assert(
      fc.property(arbSearchFeedViewState, arbSearchQuery, (state, query) => {
        let threw = false;
        try {
          feedReducer(
            state as unknown as FeedViewState,
            { kind: 'SearchApplied', query } as unknown as FeedAction
          );
        } catch {
          threw = true;
        }
        return !threw;
      }),
      { numRuns: 300 }
    );
  });

  test('PROP-FILTER-005b: feedReducer never throws for SearchCleared', () => {
    fc.assert(
      fc.property(arbSearchFeedViewState, (state) => {
        let threw = false;
        try {
          feedReducer(
            state as unknown as FeedViewState,
            { kind: 'SearchCleared' } as unknown as FeedAction
          );
        } catch {
          threw = true;
        }
        return !threw;
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-FILTER-005c: feedReducer never throws for SortDirectionToggled', () => {
    fc.assert(
      fc.property(arbSearchFeedViewState, (state) => {
        let threw = false;
        try {
          feedReducer(
            state as unknown as FeedViewState,
            { kind: 'SortDirectionToggled' } as unknown as FeedAction
          );
        } catch {
          threw = true;
        }
        return !threw;
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-FILTER-005d: feedReducer always returns commands array for all action variants', () => {
    fc.assert(
      fc.property(arbSearchFeedViewState, arbFeedAction, (state, action) => {
        let result: ReturnType<typeof feedReducer> | undefined;
        try {
          result = feedReducer(
            state as unknown as FeedViewState,
            action as unknown as FeedAction
          );
        } catch {
          return false; // must not throw
        }
        if (!result) return false;
        return Array.isArray(result.commands);
      }),
      { numRuns: 300 }
    );
  });

  test('PROP-FILTER-005e: SearchApplied/Cleared/SortDirectionToggled always return commands:[]', () => {
    fc.assert(
      fc.property(arbSearchFeedViewState, arbSearchQuery, arbSortDirection, (state, query) => {
        const r1 = feedReducer(
          state as unknown as FeedViewState,
          { kind: 'SearchApplied', query } as unknown as FeedAction
        );
        const r2 = feedReducer(
          state as unknown as FeedViewState,
          { kind: 'SearchCleared' } as unknown as FeedAction
        );
        const r3 = feedReducer(
          state as unknown as FeedViewState,
          { kind: 'SortDirectionToggled' } as unknown as FeedAction
        );
        return (
          r1.commands.length === 0 &&
          r2.commands.length === 0 &&
          r3.commands.length === 0
        );
      }),
      { numRuns: 200 }
    );
  });

  test('PROP-FILTER-005f: feedReducer referential transparency for SearchApplied', () => {
    fc.assert(
      fc.property(arbSearchFeedViewState, arbSearchQuery, (state, query) => {
        const action = { kind: 'SearchApplied' as const, query };
        const r1 = feedReducer(
          state as unknown as FeedViewState,
          action as unknown as FeedAction
        );
        const r2 = feedReducer(
          state as unknown as FeedViewState,
          action as unknown as FeedAction
        );
        return JSON.stringify(r1) === JSON.stringify(r2);
      }),
      { numRuns: 200 }
    );
  });
});
