<script lang="ts">
  /**
   * FeedList.svelte — Feed list container component.
   *
   * Props:
   *   viewState    — FeedViewState (the full view state)
   *   adapter      — TauriFeedAdapter for IPC dispatch
   *   stateChannel — FeedStateChannel for inbound snapshots
   *
   * Handles:
   *   - Subscribing to FeedStateChannel and updating viewState via feedReducer
   *   - Rendering FeedRow for each visible note with real per-row metadata
   *   - Empty state, filtered empty state, and loading state
   *   - Delete confirmation modal and deletion failure banner (banner at top)
   *   - All user actions routed through feedReducer commands (FIND-008 fix)
   */

  import type { TauriFeedAdapter } from './tauriFeedAdapter.js';
  import type { FeedStateChannel } from './feedStateChannel.js';
  import type { FeedViewState, NoteRowMetadata } from './types.js';
  import { feedReducer } from './feedReducer.js';
  import FeedRow from './FeedRow.svelte';
  import DeleteConfirmModal from './DeleteConfirmModal.svelte';
  import DeletionFailureBanner from './DeletionFailureBanner.svelte';
  import { onDestroy, untrack } from 'svelte';
  import { nowIso } from './clockHelpers.js';

  /** Extended prop type that allows filterApplied to be passed alongside viewState. */
  type FeedListViewState = FeedViewState & { filterApplied?: boolean };

  interface Props {
    viewState: FeedListViewState;
    adapter: TauriFeedAdapter;
    stateChannel: FeedStateChannel;
  }

  const { viewState: initialViewState, adapter, stateChannel }: Props = $props();

  const _initial = untrack(() => initialViewState);
  let currentViewState = $state<FeedViewState>({ ..._initial });
  let filterApplied = $state(_initial.filterApplied ?? false);

  const _channel = untrack(() => stateChannel);

  const unsubscribe = _channel.subscribe((snapshot) => {
    const result = feedReducer(currentViewState, { kind: 'DomainSnapshotReceived', snapshot });
    currentViewState = result.state;
    filterApplied = snapshot.feed.filterApplied;
    // Consume commands emitted by the reducer (FIND-008: reducer→shell command bus)
    for (const cmd of result.commands) {
      dispatchCommand(cmd);
    }
  });

  /**
   * Translates FeedCommand variants to adapter calls (FIND-008: command bus).
   * This makes feedReducer the single source of truth for guards.
   */
  function dispatchCommand(cmd: ReturnType<typeof feedReducer>['commands'][number]): void {
    switch (cmd.kind) {
      case 'select-past-note':
        adapter.dispatchSelectPastNote(cmd.payload.noteId, cmd.payload.issuedAt || nowIso());
        break;
      case 'request-note-deletion':
        adapter.dispatchRequestNoteDeletion(cmd.payload.noteId, cmd.payload.issuedAt || nowIso());
        break;
      case 'confirm-note-deletion':
        adapter.dispatchConfirmNoteDeletion(cmd.payload.noteId, cmd.payload.issuedAt || nowIso());
        break;
      case 'cancel-note-deletion':
        adapter.dispatchCancelNoteDeletion(cmd.payload.noteId, cmd.payload.issuedAt || nowIso());
        break;
      case 'refresh-feed':
        // Snapshot-driven refresh: no explicit adapter call needed (stateChannel handles inbound)
        break;
      case 'open-delete-modal':
        // State change handled by reducer; no side-effect needed
        break;
      case 'close-delete-modal':
        // State change handled by reducer; no side-effect needed
        break;
      default: {
        const _exhaustive: never = cmd;
        void _exhaustive;
      }
    }
  }

  /**
   * Handles row click by dispatching through feedReducer (FIND-008: command bus).
   * The reducer's isFeedRowClickBlocked guard is the single source of truth.
   */
  function handleRowClick(noteId: string): void {
    const result = feedReducer(currentViewState, { kind: 'FeedRowClicked', noteId });
    currentViewState = result.state;
    for (const cmd of result.commands) {
      dispatchCommand(cmd);
    }
  }

  /**
   * Handles delete button click by dispatching through feedReducer (FIND-008).
   */
  function handleDeleteButtonClick(noteId: string): void {
    const result = feedReducer(currentViewState, { kind: 'DeleteButtonClicked', noteId });
    currentViewState = result.state;
    for (const cmd of result.commands) {
      dispatchCommand(cmd);
    }
  }

  /**
   * Handles confirm deletion by dispatching through feedReducer (FIND-008).
   */
  function handleDeleteConfirm(noteId: string): void {
    const result = feedReducer(currentViewState, { kind: 'DeleteConfirmed', noteId });
    currentViewState = result.state;
    for (const cmd of result.commands) {
      dispatchCommand(cmd);
    }
  }

  /**
   * Handles cancel deletion by dispatching through feedReducer (FIND-008).
   */
  function handleDeleteCancel(): void {
    const result = feedReducer(currentViewState, { kind: 'DeleteCancelled' });
    currentViewState = result.state;
    for (const cmd of result.commands) {
      dispatchCommand(cmd);
    }
  }

  /**
   * Handles retry deletion by dispatching through feedReducer (FIND-008).
   */
  function handleRetryDeletion(noteId: string): void {
    const result = feedReducer(currentViewState, { kind: 'DeletionRetryClicked', noteId });
    currentViewState = result.state;
    for (const cmd of result.commands) {
      dispatchCommand(cmd);
    }
  }

  onDestroy(() => {
    unsubscribe();
  });

  const visibleNoteIds = $derived(currentViewState.visibleNoteIds);
  const loadingStatus = $derived(currentViewState.loadingStatus);
  const isLoading = $derived(loadingStatus === 'loading');
  const isEmpty = $derived(visibleNoteIds.length === 0 && !isLoading);
  const isFilteredEmpty = $derived(isEmpty && filterApplied);
  const isPlainEmpty = $derived(isEmpty && !filterApplied);

  const activeDeleteModalNoteId = $derived(currentViewState.activeDeleteModalNoteId);
  const lastDeletionError = $derived(currentViewState.lastDeletionError);
  const noteMetadata = $derived(currentViewState.noteMetadata);

  /** Returns per-row metadata for a given noteId, falling back to empty defaults. */
  function rowMetadata(noteId: string): NoteRowMetadata {
    return noteMetadata[noteId] ?? { body: '', createdAt: 0, updatedAt: 0, tags: [] };
  }
</script>

<div class="feed-list">
  <!-- Deletion failure banner at top of feed per spec (FIND-012 fix) -->
  {#if lastDeletionError !== null}
    <DeletionFailureBanner
      reason={lastDeletionError.reason}
      detail={lastDeletionError.detail}
      noteId={activeDeleteModalNoteId ?? ''}
      {adapter}
      onRetry={handleRetryDeletion}
    />
  {/if}

  {#if isLoading}
    <div data-testid="feed-loading" class="feed-loading">
      読み込み中...
    </div>
  {:else if isFilteredEmpty}
    <div data-testid="feed-filtered-empty-state" class="feed-empty">
      フィルター条件に一致するノートがありません
    </div>
  {:else if isPlainEmpty}
    <div data-testid="feed-empty-state" class="feed-empty">
      ノートがありません
    </div>
  {:else}
    {#each visibleNoteIds as noteId (noteId)}
      {@const meta = rowMetadata(noteId)}
      <FeedRow
        {noteId}
        body={meta.body}
        createdAt={meta.createdAt}
        updatedAt={meta.updatedAt}
        tags={meta.tags}
        viewState={currentViewState}
        {adapter}
        onRowClick={handleRowClick}
        onDeleteClick={handleDeleteButtonClick}
      />
    {/each}
  {/if}

  {#if activeDeleteModalNoteId !== null}
    <DeleteConfirmModal
      noteId={activeDeleteModalNoteId}
      {adapter}
      onConfirm={handleDeleteConfirm}
      onClose={handleDeleteCancel}
    />
  {/if}
</div>

<style>
  .feed-list {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: 8px;
  }

  .feed-loading {
    text-align: center;
    color: #615d59;
    padding: 32px 16px;
    font-size: 14px;
  }

  .feed-empty {
    text-align: center;
    color: #615d59;
    padding: 32px 16px;
    font-size: 14px;
  }
</style>
