/**
 * types.ts — ui-feed-list-actions Sprint 1 pure-core type definitions
 *
 * All types here are compile-time only (no runtime logic). They constitute
 * the contract between feedReducer, feedRowPredicates, deleteConfirmPredicates,
 * and the effectful shell (Svelte components + adapters).
 *
 * NO forbidden APIs may appear here:
 * Math.random, crypto, performance, window, globalThis, self, document,
 * navigator, requestAnimationFrame, requestIdleCallback, localStorage,
 * sessionStorage, indexedDB, fetch, XMLHttpRequest, setTimeout, setInterval,
 * clearTimeout, clearInterval, Date.now, Date(, new Date, $state, $effect,
 * $derived, import.meta, invoke(, @tauri-apps/api
 *
 * FIND-SPEC-3-01 resolution: FeedViewState.lastDeletionError uses
 * { reason: NoteDeletionFailureReason; detail?: string } | null format
 * (matching FeedDomainSnapshot.delete.lastDeletionError for direct mirror).
 */

// ── NoteDeletionFailureReason ─────────────────────────────────────────────────

/**
 * Deletion failure variants reachable at UI layer.
 * 'not-found' is excluded: REQ-DLN-005 guarantees that fs.not-found produces
 * NoteFileDeleted, not NoteDeletionFailed. 'disk-full' is also excluded:
 * REQ-DLN-013 normalizes it to reason:'unknown', detail:'disk-full'.
 */
export type NoteDeletionFailureReason = 'permission' | 'lock' | 'unknown';

// ── FeedViewState ─────────────────────────────────────────────────────────────

/**
 * UI-side mirror of EditingSessionState + Feed projection + delete state.
 * Owned by feedReducer; never mutated directly by components.
 *
 * FIND-SPEC-3-01: lastDeletionError uses object form to carry optional detail,
 * matching FeedDomainSnapshot.delete.lastDeletionError for clean mirroring.
 */
export type FeedViewState = {
  readonly editingStatus: 'idle' | 'editing' | 'saving' | 'switching' | 'save-failed';
  readonly editingNoteId: string | null;
  readonly pendingNextNoteId: string | null;
  readonly visibleNoteIds: readonly string[];
  readonly loadingStatus: 'loading' | 'ready';
  readonly activeDeleteModalNoteId: string | null;
  readonly lastDeletionError: { reason: NoteDeletionFailureReason; detail?: string } | null;
};

// ── FeedDomainSnapshot ────────────────────────────────────────────────────────

/**
 * DomainSnapshotReceived payload type. Synthesizes EditingSessionState
 * (Capture Context) and Feed projection (Curate Context). The `cause`
 * discriminator identifies upstream domain event kind.
 *
 * Source: verification-architecture.md §9b FeedDomainSnapshot
 */
export type FeedDomainSnapshot = {
  readonly editing: {
    readonly status: 'idle' | 'editing' | 'saving' | 'switching' | 'save-failed';
    readonly currentNoteId: string | null;
    readonly pendingNextNoteId: string | null;
  };
  readonly feed: {
    readonly visibleNoteIds: readonly string[];
    readonly filterApplied: boolean;
  };
  readonly delete: {
    readonly activeDeleteModalNoteId: string | null;
    readonly lastDeletionError: { reason: NoteDeletionFailureReason; detail?: string } | null;
  };
  readonly cause:
    | { readonly kind: 'NoteFileSaved';      readonly savedNoteId: string }
    | { readonly kind: 'NoteFileDeleted';    readonly deletedNoteId: string }
    | { readonly kind: 'NoteDeletionFailed'; readonly failedNoteId: string }
    | { readonly kind: 'EditingStateChanged' }
    | { readonly kind: 'InitialLoad' };
};

// ── FeedAction ────────────────────────────────────────────────────────────────

/**
 * Closed 10-variant discriminated union accepted by feedReducer.
 * Source: verification-architecture.md §9b FeedAction
 */
export type FeedAction =
  | { kind: 'DomainSnapshotReceived';   snapshot: FeedDomainSnapshot }
  | { kind: 'FeedRowClicked';           noteId: string }
  | { kind: 'DeleteButtonClicked';      noteId: string }
  | { kind: 'DeleteConfirmed';          noteId: string }
  | { kind: 'DeleteCancelled' }
  | { kind: 'DeletionRetryClicked';     noteId: string }
  | { kind: 'DeletionBannerDismissed' }
  | { kind: 'LoadingStateChanged';      status: FeedViewState['loadingStatus'] }
  | { kind: 'FilterApplied';            visibleNoteIds: readonly string[] }
  | { kind: 'FilterCleared';            visibleNoteIds: readonly string[] };

// ── FeedCommand ───────────────────────────────────────────────────────────────

/**
 * Closed 7-variant discriminated union output by feedReducer.
 * Consumed exclusively by the impure shell (Svelte components + adapters).
 * Source: verification-architecture.md §9 FeedCommand
 */
export type FeedCommand =
  | { kind: 'select-past-note';        payload: { noteId: string; issuedAt: string } }
  | { kind: 'request-note-deletion';   payload: { noteId: string; issuedAt: string } }
  | { kind: 'confirm-note-deletion';   payload: { noteId: string; issuedAt: string } }
  | { kind: 'cancel-note-deletion';    payload: { noteId: string; issuedAt: string } }
  | { kind: 'refresh-feed' }
  | { kind: 'open-delete-modal';       payload: { noteId: string } }
  | { kind: 'close-delete-modal' };

// ── FeedReducerResult ─────────────────────────────────────────────────────────

export type FeedReducerResult = {
  readonly state: FeedViewState;
  readonly commands: ReadonlyArray<FeedCommand>;
};
