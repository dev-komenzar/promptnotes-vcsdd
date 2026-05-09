<script lang="ts">
  /**
   * SaveFailureBanner.svelte — Sprint 7 Green phase
   *
   * Renders when status === 'save-failed' with an fs-type SaveError.
   * validation errors are silent — this component renders nothing for them.
   *
   * REQ-EDIT-025..030, NFR-EDIT-005..007
   * PROP-EDIT-016..019, PROP-EDIT-041, PROP-EDIT-049
   */

  import type { SaveError } from './types.js';
  import { bannerMessageFor } from './blockPredicates.js';

  interface Props {
    error: SaveError;
    priorFocusedBlockId: string | null;
    noteId: string;
    issuedAt: string;
    onRetry: () => void;
    onDiscard: () => void;
    onCancel: () => void;
  }

  const { error, priorFocusedBlockId: _priorFocusedBlockId, noteId: _noteId, issuedAt: _issuedAt, onRetry, onDiscard, onCancel }: Props = $props();

  const message = $derived(bannerMessageFor(error));
</script>

{#if message !== null}
  <div
    class="save-failure-banner"
    role="alert"
    data-testid="save-failure-banner"
  >
    <p class="banner-message">{message}</p>
    <div class="banner-actions">
      <button
        data-testid="retry-save-button"
        class="banner-btn banner-btn--retry"
        onclick={onRetry}
      >
        再試行
      </button>
      <button
        data-testid="discard-session-button"
        class="banner-btn banner-btn--discard"
        onclick={onDiscard}
      >
        変更を破棄
      </button>
      <button
        data-testid="cancel-switch-button"
        class="banner-btn banner-btn--cancel"
        onclick={onCancel}
      >
        閉じる（このまま編集を続ける）
      </button>
    </div>
  </div>
{/if}

<style>
  /* REQ-EDIT-030, NFR-EDIT-005: 5-layer Deep Shadow + #dd5b00 left accent + 8px radius */
  .save-failure-banner {
    padding: 16px;
    background: #ffffff;
    border-left: 4px solid #dd5b00;
    border-radius: 8px;
    box-shadow:
      rgba(0, 0, 0, 0.01) 0px 1px 3px,
      rgba(0, 0, 0, 0.02) 0px 3px 7px,
      rgba(0, 0, 0, 0.02) 0px 7px 15px,
      rgba(0, 0, 0, 0.04) 0px 14px 28px,
      rgba(0, 0, 0, 0.05) 0px 23px 52px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px;
  }

  .banner-message {
    margin: 0;
    font-size: 14px;
    color: #615d59;
    font-weight: 500;
  }

  .banner-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* NFR-EDIT-006: button typography 15px / 600 */
  .banner-btn {
    padding: 8px 16px;
    font-size: 15px;
    border-radius: 4px;
    border: 1px solid transparent;
    cursor: pointer;
    font-weight: 600;
    transition: background 0.15s;
  }

  .banner-btn--retry {
    background: #0075de;
    color: #ffffff;
  }

  .banner-btn--retry:hover {
    background: #005bab;
  }

  .banner-btn--discard {
    background: rgba(0, 0, 0, 0.05);
    color: #000000;
  }

  .banner-btn--discard:hover {
    background: rgba(0, 0, 0, 0.08);
  }

  .banner-btn--cancel {
    background: rgba(0, 0, 0, 0.05);
    color: #000000;
  }

  .banner-btn--cancel:hover {
    background: rgba(0, 0, 0, 0.08);
  }
</style>
