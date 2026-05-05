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
  /** Per-noteId row metadata. Mirrors FeedDomainSnapshot.noteMetadata (FIND-004). */
  readonly noteMetadata: Readonly<Record<string, NoteRowMetadata>>;
};

// ── NoteRowMetadata ───────────────────────────────────────────────────────────

/**
 * Per-note metadata required to render a FeedRow.
 * Carried by FeedDomainSnapshot.noteMetadata (keyed by noteId).
 * Resolves FIND-004: FeedList must pass real values to FeedRow, not placeholders.
 *
 * Source: verification-architecture.md §9b FeedDomainSnapshot (FIND-004 extension)
 */
export type NoteRowMetadata = {
  readonly body: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly tags: readonly string[];
};

// ── FeedDomainSnapshot ────────────────────────────────────────────────────────

/**
 * DomainSnapshotReceived payload type. Synthesizes EditingSessionState
 * (Capture Context) and Feed projection (Curate Context). The `cause`
 * discriminator identifies upstream domain event kind.
 *
 * noteMetadata carries per-noteId row data (body, createdAt, updatedAt, tags)
 * so FeedList can pass real values to FeedRow (FIND-004 fix).
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
  /** Per-noteId row metadata for rendering. Key is noteId. */
  readonly noteMetadata: Readonly<Record<string, NoteRowMetadata>>;
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
  /**
   * FIND-S2-05: vaultPath is required so the Rust handler can populate
   * visibleNoteIds in the emitted snapshot.
   */
  | { kind: 'select-past-note';        payload: { noteId: string; vaultPath: string; issuedAt: string } }
  | { kind: 'request-note-deletion';   payload: { noteId: string; issuedAt: string } }
  /**
   * FIND-S2-01 / FIND-S2-06: filePath is the OS path to delete (may differ from noteId).
   * vaultPath lets Rust populate the post-deletion feed snapshot.
   */
  | { kind: 'confirm-note-deletion';   payload: { noteId: string; filePath: string; vaultPath: string; issuedAt: string } }
  | { kind: 'cancel-note-deletion';    payload: { noteId: string; issuedAt: string } }
  | { kind: 'refresh-feed' }
  | { kind: 'open-delete-modal';       payload: { noteId: string } }
  | { kind: 'close-delete-modal' };

// ── FeedReducerResult ─────────────────────────────────────────────────────────

export type FeedReducerResult = {
  readonly state: FeedViewState;
  readonly commands: ReadonlyArray<FeedCommand>;
};
