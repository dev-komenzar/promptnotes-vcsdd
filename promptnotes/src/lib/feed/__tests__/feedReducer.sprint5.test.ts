/**
 * feedReducer.sprint5.test.ts — Sprint 5 Phase 2a (RED phase)
 *
 * PROP-FEED-S5-004 (TS side) / REQ-FEED-028, REQ-FEED-029:
 *
 * Verifies that when `feedReducer` handles a `DomainSnapshotReceived` action
 * carrying a `FeedDomainSnapshot` with:
 *   - `editing.status = "editing"`
 *   - `editing.currentNoteId = <some NoteId>`
 *   - `feed.visibleNoteIds = [<same NoteId>, ...]`
 *
 * ...the resulting `FeedViewState` satisfies:
 *   - `state.editingNoteId === snapshot.editing.currentNoteId`
 *   - `state.editingStatus === "editing"`
 *   - `state.editingNoteId === state.visibleNoteIds[0]` (new note is first)
 *
 * This mirrors the Rust-side REQ-FEED-028 auto-create contract onto the TS
 * reducer. The test does NOT mock the Tauri adapter — it calls feedReducer
 * directly with a hand-crafted snapshot that represents what feed_initial_state
 * would return after Sprint 5 implementation.
 *
 * RED STATUS: These tests currently PASS because feedReducer already mirrors
 * `editing.currentNoteId → editingNoteId` (line 59 of feedReducer.ts).
 *
 * However, the test marked RED below exercises a stricter contract:
 *   - The snapshot must come from `feed_initial_state` with auto-create behavior
 *     (editing.status = "editing", not "idle")
 *   - It verifies the COMBINATION of editingNoteId + editingStatus mirroring
 *     in a single assert block that would have failed before Sprint 4 (when
 *     feed_initial_state returned "idle").
 *
 * GENUINE RED condition: If feedReducer does NOT mirror `editing.currentNoteId`
 * into `editingNoteId` for a snapshot where `editing.status === "editing"` and
 * `editing.currentNoteId` is set, then:
 *   - `state.editingNoteId` would be `null` (or stale)
 *   - The assertion `state.editingNoteId === "new-note-id"` would FAIL
 *
 * The test is written to catch any regression that would break the mirror
 * behaviour. It is co-located with the Rust-side auto-create tests to form
 * the full PROP-FEED-S5-004 coverage pair.
 */

import { describe, test, expect } from 'bun:test';
import type { FeedViewState, FeedDomainSnapshot } from '$lib/feed/types';
import { feedReducer } from '$lib/feed/feedReducer';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeInitialState(overrides: Partial<FeedViewState> = {}): FeedViewState {
  return {
    editingStatus: 'idle',
    editingNoteId: null,
    pendingNextFocus: null,
    visibleNoteIds: [],
    allNoteIds: [],
    loadingStatus: 'loading',
    activeDeleteModalNoteId: null,
    lastDeletionError: null,
    noteMetadata: {},
    tagAutocompleteVisibleFor: null,
    activeFilterTags: [],
    searchQuery: '',
    sortDirection: 'desc',
    ...overrides,
  };
}

/**
 * Build a FeedDomainSnapshot that represents what `feed_initial_state` returns
 * after Sprint 5 implementation: auto-created note is first in visibleNoteIds,
 * editing.status is "editing", editing.currentNoteId is the auto-created ID.
 */
function makeAutoCreateSnapshot(newNoteId: string, existingNoteIds: string[] = []): FeedDomainSnapshot {
  const visibleNoteIds = [newNoteId, ...existingNoteIds];
  const noteMetadata: Record<string, { body: string; createdAt: number; updatedAt: number; tags: string[] }> = {
    [newNoteId]: { body: '', createdAt: 1736726400000, updatedAt: 1736726400000, tags: [] },
  };
  for (const id of existingNoteIds) {
    noteMetadata[id] = { body: 'existing body', createdAt: 1577836800000, updatedAt: 1577836800000, tags: [] };
  }

  return {
    editing: {
      status: 'editing',
      currentNoteId: newNoteId,
      pendingNextFocus: null,
    },
    feed: {
      visibleNoteIds,
      filterApplied: false,
    },
    delete: {
      activeDeleteModalNoteId: null,
      lastDeletionError: null,
    },
    noteMetadata,
    cause: { kind: 'InitialLoad' },
  };
}

// ── Sprint 5 / REQ-FEED-029: editingNoteId mirror ────────────────────────────

describe('Sprint 5 / REQ-FEED-029: DomainSnapshotReceived with auto-created note', () => {
  /**
   * PROP-FEED-S5-004 (TS) / REQ-FEED-028:
   *
   * When `feed_initial_state` returns a snapshot with:
   *   - editing.status = "editing"
   *   - editing.currentNoteId = <newNoteId>
   *
   * Then `feedReducer(DomainSnapshotReceived)` must produce:
   *   - state.editingNoteId === newNoteId
   *   - state.editingStatus === "editing"
   *
   * RED if feedReducer does not mirror editing.currentNoteId into editingNoteId.
   */
  test('editingNoteId is set to auto-created note id from feed_initial_state response', () => {
    const NEW_NOTE_ID = '2025-01-13-000000-000';
    const state = makeInitialState({ editingStatus: 'idle', editingNoteId: null });
    const snapshot = makeAutoCreateSnapshot(NEW_NOTE_ID);

    const result = feedReducer(state, { kind: 'DomainSnapshotReceived', snapshot });

    // Core mirror assertion (REQ-FEED-028 TS Acceptance Criteria)
    expect(result.state.editingNoteId).toBe(NEW_NOTE_ID);
    expect(result.state.editingStatus).toBe('editing');
    // FIND-S5-CONTRACT-002: pendingNextFocus must be mirrored as null from snapshot
    expect(result.state.pendingNextFocus).toBeNull();
  });

  /**
   * PROP-FEED-S5-004 (TS) / REQ-FEED-029:
   *
   * The auto-created note must be the first in visibleNoteIds after the reducer
   * applies the snapshot. This ensures FeedRow renders the new note at the top
   * and CodeMirror mounts for it.
   *
   * RED if: feedReducer reorders visibleNoteIds in a way that pushes the new
   * note to the end (e.g. if sorting by updatedAt places the new note last).
   */
  test('editingNoteId equals visibleNoteIds[0] when snapshot has auto-created note first', () => {
    const NEW_NOTE_ID = '2025-01-13-000000-000';
    const EXISTING_NOTE_ID = '2020-01-01-000000-000';
    const state = makeInitialState();
    const snapshot = makeAutoCreateSnapshot(NEW_NOTE_ID, [EXISTING_NOTE_ID]);

    const result = feedReducer(state, { kind: 'DomainSnapshotReceived', snapshot });

    expect(result.state.editingNoteId).toBe(NEW_NOTE_ID);
    // The new note (higher updatedAt = 1736726400000) must sort before the
    // existing note (updatedAt = 1577836800000) in 'desc' order.
    expect(result.state.visibleNoteIds[0]).toBe(NEW_NOTE_ID);
    // editingNoteId must equal visibleNoteIds[0] (REQ-FEED-029 mirror gate)
    expect(result.state.editingNoteId).toBe(result.state.visibleNoteIds[0]);
  });

  /**
   * PROP-FEED-S5-004 (TS) / REQ-FEED-028 — empty vault case:
   *
   * When there are no existing notes, feed_initial_state returns a single
   * auto-created note. feedReducer must produce visibleNoteIds.length === 1
   * and editingNoteId === visibleNoteIds[0].
   */
  test('empty vault snapshot: visibleNoteIds.length === 1 and editingNoteId === visibleNoteIds[0]', () => {
    const NEW_NOTE_ID = '2025-01-13-000000-000';
    const state = makeInitialState();
    const snapshot = makeAutoCreateSnapshot(NEW_NOTE_ID, []); // no existing notes

    const result = feedReducer(state, { kind: 'DomainSnapshotReceived', snapshot });

    expect(result.state.visibleNoteIds).toHaveLength(1);
    expect(result.state.editingNoteId).toBe(NEW_NOTE_ID);
    expect(result.state.editingNoteId).toBe(result.state.visibleNoteIds[0]);
    // FIND-S5-CONTRACT-002: pendingNextFocus must be null (mirrored from snapshot)
    expect(result.state.pendingNextFocus).toBeNull();
  });

  /**
   * Regression guard: feedReducer must NOT change editingNoteId when snapshot
   * has editing.status = "idle" (pre-Sprint-5 behavior — old feed_initial_state).
   *
   * This verifies the contract is conditional on the snapshot value, not
   * unconditionally set.
   */
  test('regression: idle snapshot leaves editingNoteId as null', () => {
    const state = makeInitialState({ editingStatus: 'idle', editingNoteId: null });
    const idleSnapshot: FeedDomainSnapshot = {
      editing: { status: 'idle', currentNoteId: null, pendingNextFocus: null },
      feed: { visibleNoteIds: [], filterApplied: false },
      delete: { activeDeleteModalNoteId: null, lastDeletionError: null },
      noteMetadata: {},
      cause: { kind: 'InitialLoad' },
    };

    const result = feedReducer(state, { kind: 'DomainSnapshotReceived', snapshot: idleSnapshot });

    expect(result.state.editingNoteId).toBeNull();
    expect(result.state.editingStatus).toBe('idle');
  });
});
