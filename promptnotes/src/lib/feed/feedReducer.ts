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
import { isFeedRowClickBlocked } from './feedRowPredicates.js';
import { tryNewTag } from '../domain/apply-filter-or-search/try-new-tag.js';
import { computeVisible } from './computeVisible.js';

const REFRESH_TRIGGER_CAUSES: ReadonlySet<string> = new Set(['NoteFileSaved', 'NoteFileDeleted']);

const MAX_TAG_LENGTH = 100;

/**
 * Reads searchQuery and sortDirection from state with ?? defaults.
 * Guards against pre-extension state shapes that lack these fields.
 */
function searchSortOf(state: FeedViewState): { searchQuery: string; sortDirection: 'asc' | 'desc' } {
  return {
    searchQuery: state.searchQuery ?? '',
    sortDirection: state.sortDirection ?? 'desc',
  };
}

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

      const unfilteredIds = snapshot.feed.visibleNoteIds;

      // Compute visibleNoteIds via computeVisible (tag filter + search + sort)
      const { searchQuery: currentSearchQuery, sortDirection: currentSortDirection } = searchSortOf(state);
      const visibleIds = computeVisible(
        unfilteredIds,
        snapshot.noteMetadata,
        state.activeFilterTags,
        currentSearchQuery,
        currentSortDirection,
      );

      const nextState: FeedViewState = {
        editingStatus: snapshot.editing.status,
        editingNoteId: snapshot.editing.currentNoteId,
        pendingNextFocus: snapshot.editing.pendingNextFocus,
        visibleNoteIds: visibleIds,
        allNoteIds: unfilteredIds,
        loadingStatus: state.loadingStatus,
        activeDeleteModalNoteId: snapshot.delete.activeDeleteModalNoteId,
        lastDeletionError:
          snapshot.cause.kind === 'NoteFileDeleted'
            ? null
            : snapshot.delete.lastDeletionError,
        noteMetadata: snapshot.noteMetadata,
        // Preserve tag UI state across snapshots (like loadingStatus)
        activeFilterTags: state.activeFilterTags,
        // Close tag input if the note was deleted (inherited from ui-tag-chip)
        tagAutocompleteVisibleFor:
          state.tagAutocompleteVisibleFor !== null &&
          snapshot.noteMetadata[state.tagAutocompleteVisibleFor] !== undefined
            ? state.tagAutocompleteVisibleFor
            : null,
        // Preserve search/sort state across snapshots (ui-filter-search)
        searchQuery: currentSearchQuery,
        sortDirection: currentSortDirection,
      };

      if (REFRESH_TRIGGER_CAUSES.has(snapshot.cause.kind)) {
        commands.push({ kind: 'refresh-feed' });
      }

      return { state: nextState, commands };
    }

    case 'FeedRowClicked': {
      if (isFeedRowClickBlocked(state.editingStatus, state.loadingStatus)) {
        return { state, commands: [] };
      }

      const commands: FeedCommand[] = [
        // FIND-S2-05: vaultPath is filled by the effectful shell (FeedList.svelte)
        // before calling the adapter. The pure reducer emits '' as a placeholder.
        { kind: 'select-past-note', payload: { noteId: action.noteId, vaultPath: '', issuedAt: '' } },
      ];
      return { state, commands };
    }

    case 'DeleteButtonClicked': {
      const nextState: FeedViewState = {
        ...state,
        activeDeleteModalNoteId: action.noteId,
      };
      const commands: FeedCommand[] = [
        { kind: 'request-note-deletion', payload: { noteId: action.noteId, issuedAt: '' } },
        { kind: 'open-delete-modal', payload: { noteId: action.noteId } },
      ];
      return { state: nextState, commands };
    }

    case 'DeleteConfirmed': {
      const nextState: FeedViewState = {
        ...state,
        activeDeleteModalNoteId: null,
      };
      const commands: FeedCommand[] = [
        // FIND-S2-01 / FIND-S2-06: filePath and vaultPath are filled by the
        // effectful shell (FeedList.svelte) before calling the adapter.
        // The pure reducer emits '' placeholders.
        { kind: 'confirm-note-deletion', payload: { noteId: action.noteId, filePath: '', vaultPath: '', issuedAt: '' } },
        { kind: 'close-delete-modal' },
      ];
      return { state: nextState, commands };
    }

    case 'DeleteCancelled': {
      const noteId = state.activeDeleteModalNoteId ?? '';
      const nextState: FeedViewState = {
        ...state,
        activeDeleteModalNoteId: null,
      };
      return {
        state: nextState,
        commands: [
          { kind: 'cancel-note-deletion', payload: { noteId, issuedAt: '' } },
          { kind: 'close-delete-modal' },
        ],
      };
    }

    case 'DeletionRetryClicked': {
      const commands: FeedCommand[] = [
        // FIND-S2-01 / FIND-S2-06: filePath and vaultPath filled by shell.
        { kind: 'confirm-note-deletion', payload: { noteId: action.noteId, filePath: '', vaultPath: '', issuedAt: '' } },
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

    // ── ui-tag-chip: TagAddClicked ───────────────────────────────────────
    case 'TagAddClicked': {
      const nextState: FeedViewState = {
        ...state,
        tagAutocompleteVisibleFor: action.noteId,
      };
      return { state: nextState, commands: [] };
    }

    // ── ui-tag-chip: TagRemoveClicked ────────────────────────────────────
    case 'TagRemoveClicked': {
      const meta = state.noteMetadata[action.noteId];
      const commands: FeedCommand[] = [
        {
          kind: 'remove-tag-via-chip',
          payload: {
            noteId: action.noteId,
            tag: action.tag,
            body: meta?.body ?? '',
            existingTags: meta?.tags ?? [],
            createdAt: meta?.createdAt ?? 0,
            updatedAt: meta?.updatedAt ?? 0,
            issuedAt: '',
          },
        },
      ];
      // Close input on the same row first (REQ-TAG-002 step 1)
      const nextState: FeedViewState = {
        ...state,
        tagAutocompleteVisibleFor:
          state.tagAutocompleteVisibleFor === action.noteId ? null : state.tagAutocompleteVisibleFor,
      };
      return { state: nextState, commands };
    }

    // ── ui-tag-chip: TagInputCommitted ───────────────────────────────────
    case 'TagInputCommitted': {
      const validateResult = tryNewTag(action.rawTag);
      if (!validateResult.ok) {
        // Invalid tag: keep input open, no command (error displayed in UI)
        return { state, commands: [] };
      }
      const normalized = validateResult.value;
      if ((normalized as string).length > MAX_TAG_LENGTH) {
        return { state, commands: [] };
      }
      const meta = state.noteMetadata[action.noteId];
      const commands: FeedCommand[] = [
        {
          kind: 'add-tag-via-chip',
          payload: {
            noteId: action.noteId,
            tag: normalized as string,
            body: meta?.body ?? '',
            existingTags: meta?.tags ?? [],
            createdAt: meta?.createdAt ?? 0,
            updatedAt: meta?.updatedAt ?? 0,
            issuedAt: '',
          },
        },
      ];
      const nextState: FeedViewState = {
        ...state,
        tagAutocompleteVisibleFor: null,
      };
      return { state: nextState, commands };
    }

    // ── ui-tag-chip: TagInputCancelled ───────────────────────────────────
    case 'TagInputCancelled': {
      const nextState: FeedViewState = {
        ...state,
        tagAutocompleteVisibleFor: null,
      };
      return { state: nextState, commands: [] };
    }

    // ── ui-tag-chip: TagFilterToggled ────────────────────────────────────
    case 'TagFilterToggled': {
      const tag = action.tag;
      const currentActive = state.activeFilterTags;
      const isActive = currentActive.includes(tag);

      let nextActive: readonly string[];
      let commands: FeedCommand[];

      if (isActive) {
        nextActive = currentActive.filter((t) => t !== tag);
        commands = [{ kind: 'remove-tag-filter', payload: { tag } }];
      } else {
        nextActive = [...currentActive, tag];
        commands = [{ kind: 'apply-tag-filter', payload: { tag } }];
      }

      // Compute visibleNoteIds via computeVisible (tag + search + sort)
      const { searchQuery, sortDirection } = searchSortOf(state);
      const visibleIds = computeVisible(
        state.allNoteIds,
        state.noteMetadata,
        nextActive,
        searchQuery,
        sortDirection,
      );

      const nextState: FeedViewState = {
        ...state,
        activeFilterTags: nextActive,
        visibleNoteIds: visibleIds,
      };
      return { state: nextState, commands };
    }

    // ── ui-tag-chip: TagFilterCleared ────────────────────────────────────
    case 'TagFilterCleared': {
      const { searchQuery, sortDirection } = searchSortOf(state);
      const nextState: FeedViewState = {
        ...state,
        activeFilterTags: [],
        visibleNoteIds: computeVisible(
          state.allNoteIds,
          state.noteMetadata,
          [],
          searchQuery,
          sortDirection,
        ),
      };
      return { state: nextState, commands: [{ kind: 'clear-filter' }] };
    }

    // ── ui-filter-search: SearchApplied ──────────────────────────────────
    case 'SearchApplied': {
      const { sortDirection } = searchSortOf(state);
      const nextSearchQuery = action.query;
      const nextVisible = computeVisible(
        state.allNoteIds,
        state.noteMetadata,
        state.activeFilterTags,
        nextSearchQuery,
        sortDirection,
      );
      return { state: { ...state, searchQuery: nextSearchQuery, visibleNoteIds: nextVisible }, commands: [] };
    }

    // ── ui-filter-search: SearchCleared ──────────────────────────────────
    case 'SearchCleared': {
      const { sortDirection } = searchSortOf(state);
      const nextVisible = computeVisible(
        state.allNoteIds,
        state.noteMetadata,
        state.activeFilterTags,
        '',
        sortDirection,
      );
      return { state: { ...state, searchQuery: '', visibleNoteIds: nextVisible }, commands: [] };
    }

    // ── ui-filter-search: SortDirectionToggled ────────────────────────────
    case 'SortDirectionToggled': {
      const { searchQuery, sortDirection: prevDir } = searchSortOf(state);
      const nextDir: 'asc' | 'desc' = prevDir === 'desc' ? 'asc' : 'desc';
      const nextVisible = computeVisible(
        state.allNoteIds,
        state.noteMetadata,
        state.activeFilterTags,
        searchQuery,
        nextDir,
      );
      return { state: { ...state, sortDirection: nextDir, visibleNoteIds: nextVisible }, commands: [] };
    }

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return { state, commands: [] };
    }
  }
}
