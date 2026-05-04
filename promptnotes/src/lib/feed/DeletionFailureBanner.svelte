<script lang="ts">
  /**
   * DeletionFailureBanner.svelte — Deletion failure error banner.
   *
   * Props:
   *   reason   — NoteDeletionFailureReason (permission | lock | unknown)
   *   detail   — Optional detail string (used with unknown reason)
   *   noteId   — The note ID to retry deletion on
   *   adapter  — TauriFeedAdapter for retry dispatch (fallback when no callback)
   *   onRetry  — Optional callback for retry (FIND-008 command bus)
   */

  import type { TauriFeedAdapter } from './tauriFeedAdapter.js';
  import type { NoteDeletionFailureReason } from './types.js';
  import { deletionErrorMessage } from './deleteConfirmPredicates.js';
  import { nowIso } from './clockHelpers.js';

  interface Props {
    reason: NoteDeletionFailureReason;
    detail?: string;
    noteId: string;
    adapter: TauriFeedAdapter;
    onRetry?: (noteId: string) => void;
  }

  const { reason, detail, noteId, adapter, onRetry }: Props = $props();

  const errorMessage = $derived(deletionErrorMessage(reason, detail));

  function handleRetryClick(): void {
    if (onRetry) {
      onRetry(noteId);
    } else {
      adapter.dispatchConfirmNoteDeletion(noteId, nowIso());
    }
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
  /* FIND-005 / FIND-010 fix: left-accent border only + 5-layer Deep Shadow */
  .deletion-failure-banner {
    background: #fff3f0;
    border: none;
    border-left: 4px solid #dd5b00;
    border-radius: 8px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: rgba(0,0,0,0.05) 0px 20px 52px, rgba(0,0,0,0.034) 0px 10px 21px, rgba(0,0,0,0.025) 0px 4px 8px, rgba(0,0,0,0.012) 0px 0.875px 2.86px, rgba(0,0,0,0.007) 0px 0.175px 1.04px;
  }

  /* FIND-011 fix: banner-message color uses warn-text (near-black), not #dd5b00 accent */
  .banner-message {
    flex: 1;
    font-size: 14px;
    font-weight: 500;
    color: rgba(0,0,0,0.75);
  }

  /* FIND-003 / FIND-011 fix: retry button is Primary Blue #0075de, 8px 16px, weight-600 */
  .retry-button {
    background: #0075de;
    color: #ffffff;
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    flex-shrink: 0;
  }

  .retry-button:focus-visible {
    outline: 2px solid #097fe8;
    outline-offset: 2px;
  }
</style>
