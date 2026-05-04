<script lang="ts">
  /**
   * FeedRow.svelte — Single feed list row component.
   *
   * Props:
   *   noteId     — The note's unique ID
   *   body       — The note body text
   *   createdAt  — Epoch ms timestamp for creation
   *   updatedAt  — Epoch ms timestamp for last update
   *   tags       — Array of tag strings
   *   viewState  — FeedViewState (shared across all rows)
   *   adapter    — TauriFeedAdapter for IPC dispatch
   */

  import type { TauriFeedAdapter } from './tauriFeedAdapter.js';
  import type { FeedViewState } from './types.js';
  import {
    isDeleteButtonDisabled,
    bodyPreviewLines,
    timestampLabel,
  } from './feedRowPredicates.js';

  interface Props {
    noteId: string;
    body: string;
    createdAt: number;
    updatedAt: number;
    tags: readonly string[];
    viewState: FeedViewState;
    adapter: TauriFeedAdapter;
    onDeleteRequest?: (noteId: string) => void;
  }

  const { noteId, body, createdAt, updatedAt, tags, viewState, adapter }: Props = $props();

  const locale = 'ja-JP';

  const createdAtLabel = $derived(timestampLabel(createdAt, locale));
  const updatedAtLabel = $derived(timestampLabel(updatedAt, locale));
  const previewLines = $derived(bodyPreviewLines(body, 2));
  const deleteDisabled = $derived(isDeleteButtonDisabled(noteId, viewState.editingStatus, viewState.editingNoteId));
  const showPendingSwitch = $derived(viewState.pendingNextNoteId === noteId);

  const rowDisabled = $derived(
    viewState.editingStatus === 'saving' ||
    viewState.editingStatus === 'switching' ||
    viewState.loadingStatus === 'loading'
  );

  function handleRowClick(): void {
    if (rowDisabled) return;
    const isoAt = new Date().toISOString();
    adapter.dispatchSelectPastNote(noteId, isoAt);
  }

  function handleDeleteClick(): void {
    if (deleteDisabled) return;
    const isoAt = new Date().toISOString();
    adapter.dispatchRequestNoteDeletion(noteId, isoAt);
  }
</script>

<!--
  Layout: row card with two sibling elements in a flex container.
  - feed-row-button: fills the content area (the clickable row area)
  - delete-button: side action button, sibling of feed-row-button (not nested)
-->
<div
  class="feed-row"
  data-row-note-id={noteId}
>
  <div class="row-layout">
    <button
      data-testid="feed-row-button"
      aria-disabled={rowDisabled ? 'true' : 'false'}
      onclick={handleRowClick}
      class="row-button"
    >
      <div
        data-testid="row-created-at"
        class="row-timestamp"
      >
        {createdAtLabel}
        {#if createdAt !== updatedAt}
          <span class="updated-at">{updatedAtLabel}</span>
        {/if}
      </div>

      <div
        data-testid="row-body-preview"
        class="row-body-preview"
      >
        {#each previewLines as line}
          <div>{line}</div>
        {/each}
      </div>

      {#if tags.length > 0}
        <div class="tag-list">
          {#each tags as tag}
            <span
              data-testid="tag-chip"
              class="tag-chip"
            >{tag}</span>
          {/each}
        </div>
      {/if}

      {#if showPendingSwitch}
        <span data-testid="pending-switch-indicator" class="pending-indicator">
          切り替え中...
        </span>
      {/if}
    </button>

    <button
      data-testid="delete-button"
      aria-label="削除"
      disabled={deleteDisabled}
      aria-disabled={deleteDisabled ? 'true' : 'false'}
      onclick={handleDeleteClick}
      class="delete-button"
    >
      ×
    </button>
  </div>
</div>

<style>
  .feed-row {
    background: #ffffff;
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 12px;
    box-shadow: rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px;
    margin-bottom: 8px;
  }

  .feed-row:hover {
    box-shadow: rgba(0,0,0,0.08) 0px 4px 18px, rgba(0,0,0,0.054) 0px 2.025px 7.85px, rgba(0,0,0,0.04) 0px 0.8px 2.93px, rgba(0,0,0,0.02) 0px 0.175px 1.04px;
  }

  .row-layout {
    display: flex;
    align-items: stretch;
  }

  .row-button {
    flex: 1;
    background: none;
    border: none;
    padding: 12px 16px;
    text-align: left;
    cursor: pointer;
    min-width: 0;
  }

  .row-button:focus-visible {
    outline: 2px solid #097fe8;
    outline-offset: 2px;
    border-radius: 12px;
  }

  .row-timestamp {
    font-size: 14px;
    font-weight: 500;
    color: #615d59;
    margin-bottom: 4px;
  }

  .updated-at {
    margin-left: 8px;
    color: #a39e98;
  }

  .row-body-preview {
    font-size: 14px;
    color: rgba(0,0,0,0.95);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-bottom: 6px;
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .tag-chip {
    background-color: #f2f9ff;
    color: #097fe8;
    border-radius: 9999px;
    padding: 4px 8px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.125px;
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pending-indicator {
    font-size: 12px;
    color: #097fe8;
    margin-top: 4px;
    display: inline-block;
  }

  .delete-button {
    background: none;
    border: none;
    border-left: 1px solid rgba(0,0,0,0.05);
    padding: 8px 12px;
    cursor: pointer;
    color: #615d59;
    flex-shrink: 0;
    align-self: stretch;
  }

  .delete-button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .delete-button:focus-visible {
    outline: 2px solid #097fe8;
    outline-offset: 2px;
  }
</style>
