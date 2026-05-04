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
   *   - Rendering FeedRow for each visible note
   *   - Empty state, filtered empty state, and loading state
   *   - Delete confirmation modal and deletion failure banner
   */

  import type { TauriFeedAdapter } from './tauriFeedAdapter.js';
  import type { FeedStateChannel } from './feedStateChannel.js';
  import type { FeedViewState } from './types.js';
  import { feedReducer } from './feedReducer.js';
  import FeedRow from './FeedRow.svelte';
  import DeleteConfirmModal from './DeleteConfirmModal.svelte';
  import DeletionFailureBanner from './DeletionFailureBanner.svelte';
  import { onDestroy, untrack } from 'svelte';

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
  });

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
</script>

<div class="feed-list">
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
      <FeedRow
        {noteId}
        body=""
        createdAt={0}
        updatedAt={0}
        tags={[]}
        viewState={currentViewState}
        {adapter}
      />
    {/each}
  {/if}

  {#if lastDeletionError !== null}
    <DeletionFailureBanner
      reason={lastDeletionError.reason}
      detail={lastDeletionError.detail}
      noteId={activeDeleteModalNoteId ?? ''}
      {adapter}
    />
  {/if}

  {#if activeDeleteModalNoteId !== null}
    <DeleteConfirmModal
      noteId={activeDeleteModalNoteId}
      {adapter}
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
