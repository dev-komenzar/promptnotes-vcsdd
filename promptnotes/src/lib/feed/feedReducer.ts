/**
 * feedReducer.ts — Pure mirror reducer for FeedViewState.
 *
 * Pure function only. No side effects.
 * PROP-FEED-031: purity-audit grep must hit zero on this file.
 *
 * feedReducer is a total function over (FeedViewState × FeedAction).
 * It never throws. All editingStatus values remain within the 5-value enum.
 * commands is always a ReadonlyArray (never undefined).
 *
 * Source: verification-architecture.md §9 FeedCommand / §9b FeedAction
 */

import type { FeedViewState, FeedAction, FeedReducerResult, FeedCommand } from './types.js';

const REFRESH_TRIGGER_CAUSES: ReadonlySet<string> = new Set(['NoteFileSaved', 'NoteFileDeleted']);

/**
 * REQ-FEED-005..018 / PROP-FEED-005..007d / PROP-FEED-035
 * Pure mirror reducer: maps (state, action) → { state, commands }.
 * Total over all (FeedViewState, FeedAction) pairs.
 */
export function feedReducer(state: FeedViewState, action: FeedAction): FeedReducerResult {
  switch (action.kind) {
    case 'DomainSnapshotReceived': {
      const { snapshot } = action;
      const commands: FeedCommand[] = [];

      const nextState: FeedViewState = {
        editingStatus: snapshot.editing.status,
        editingNoteId: snapshot.editing.currentNoteId,
        pendingNextNoteId: snapshot.editing.pendingNextNoteId,
        visibleNoteIds: snapshot.feed.visibleNoteIds,
        loadingStatus: state.loadingStatus,
        activeDeleteModalNoteId: snapshot.delete.activeDeleteModalNoteId,
        lastDeletionError:
          snapshot.cause.kind === 'NoteFileDeleted'
            ? null
            : snapshot.delete.lastDeletionError,
      };

      if (REFRESH_TRIGGER_CAUSES.has(snapshot.cause.kind)) {
        commands.push({ kind: 'refresh-feed' });
      }

      return { state: nextState, commands };
    }

    case 'FeedRowClicked': {
      const isBlocked =
        state.editingStatus === 'saving' ||
        state.editingStatus === 'switching' ||
        state.loadingStatus === 'loading';

      if (isBlocked) {
        return { state, commands: [] };
      }

      const commands: FeedCommand[] = [
        { kind: 'select-past-note', payload: { noteId: action.noteId, issuedAt: '' } },
      ];
      return { state, commands };
    }

    case 'DeleteButtonClicked': {
      const commands: FeedCommand[] = [
        { kind: 'request-note-deletion', payload: { noteId: action.noteId, issuedAt: '' } },
        { kind: 'open-delete-modal', payload: { noteId: action.noteId } },
      ];
      return { state, commands };
    }

    case 'DeleteConfirmed': {
      const commands: FeedCommand[] = [
        { kind: 'confirm-note-deletion', payload: { noteId: action.noteId, issuedAt: '' } },
      ];
      return { state, commands };
    }

    case 'DeleteCancelled': {
      const nextState: FeedViewState = {
        ...state,
        activeDeleteModalNoteId: null,
      };
      return { state: nextState, commands: [{ kind: 'close-delete-modal' }] };
    }

    case 'DeletionRetryClicked': {
      const commands: FeedCommand[] = [
        { kind: 'confirm-note-deletion', payload: { noteId: action.noteId, issuedAt: '' } },
      ];
      return { state, commands };
    }

    case 'DeletionBannerDismissed': {
      const nextState: FeedViewState = {
        ...state,
        lastDeletionError: null,
      };
      return { state: nextState, commands: [] };
    }

    case 'LoadingStateChanged': {
      const nextState: FeedViewState = {
        ...state,
        loadingStatus: action.status,
      };
      return { state: nextState, commands: [] };
    }

    case 'FilterApplied': {
      const nextState: FeedViewState = {
        ...state,
        visibleNoteIds: action.visibleNoteIds,
      };
      return { state: nextState, commands: [{ kind: 'refresh-feed' }] };
    }

    case 'FilterCleared': {
      const nextState: FeedViewState = {
        ...state,
        visibleNoteIds: action.visibleNoteIds,
      };
      return { state: nextState, commands: [{ kind: 'refresh-feed' }] };
    }

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return { state, commands: [] };
    }
  }
}
