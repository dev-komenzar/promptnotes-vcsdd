<script lang="ts">
  /**
   * DeletionFailureBanner.svelte — Deletion failure error banner.
   *
   * Props:
   *   reason  — NoteDeletionFailureReason (permission | lock | unknown)
   *   detail  — Optional detail string (used with unknown reason)
   *   noteId  — The note ID to retry deletion on
   *   adapter — TauriFeedAdapter for retry dispatch
   */

  import type { TauriFeedAdapter } from './tauriFeedAdapter.js';
  import type { NoteDeletionFailureReason } from './types.js';
  import { deletionErrorMessage } from './deleteConfirmPredicates.js';

  interface Props {
    reason: NoteDeletionFailureReason;
    detail?: string;
    noteId: string;
    adapter: TauriFeedAdapter;
  }

  const { reason, detail, noteId, adapter }: Props = $props();

  const errorMessage = $derived(deletionErrorMessage(reason, detail));

  function handleRetryClick(): void {
    const isoAt = new Date().toISOString();
    adapter.dispatchConfirmNoteDeletion(noteId, isoAt);
  }
</script>

<div
  data-testid="deletion-failure-banner"
  role="alert"
  class="deletion-failure-banner"
>
  <span class="banner-message">{errorMessage}</span>
  <button
    data-testid="retry-delete-button"
    onclick={handleRetryClick}
    class="retry-button"
  >
    再試行
  </button>
</div>

<style>
  .deletion-failure-banner {
    background: #fff3f0;
    border: 1px solid rgba(221, 91, 0, 0.3);
    border-radius: 8px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: rgba(0,0,0,0.04) 0px 4px 18px, rgba(0,0,0,0.027) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px;
  }

  .banner-message {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: #dd5b00;
  }

  .retry-button {
    background: #dd5b00;
    color: #ffffff;
    border: none;
    border-radius: 4px;
    padding: 6px 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
  }

  .retry-button:focus-visible {
    outline: 2px solid #097fe8;
    outline-offset: 2px;
  }
</style>
