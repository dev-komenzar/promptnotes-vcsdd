<script lang="ts">
  /**
   * DeleteConfirmModal.svelte — Delete confirmation modal.
   *
   * Props:
   *   noteId    — The note ID to confirm deletion for
   *   adapter   — TauriFeedAdapter for IPC dispatch
   *   onConfirm — Optional callback when user confirms (FIND-008 command bus)
   *   onClose   — Optional close callback
   */

  import type { TauriFeedAdapter } from './tauriFeedAdapter.js';
  import { nowIso } from './clockHelpers.js';
  import { onMount, onDestroy } from 'svelte';

  interface Props {
    noteId: string;
    adapter: TauriFeedAdapter;
    onConfirm?: (noteId: string) => void;
    onClose?: () => void;
  }

  const { noteId, adapter, onConfirm, onClose }: Props = $props();

  let visible = $state(true);
  /**
   * FIND-009 fix: in-flight guard to prevent double-dispatch on rapid clicks.
   * Set true after first confirm dispatch; reset only when modal unmounts.
   */
  let isConfirmPending = $state(false);

  const modalTitleId = 'delete-confirm-modal-title';

  function handleCancel(): void {
    if (onClose) {
      onClose();
    } else {
      adapter.dispatchCancelNoteDeletion(noteId, nowIso());
    }
    visible = false;
  }

  function handleConfirm(): void {
    if (isConfirmPending) return;
    isConfirmPending = true;
    if (onConfirm) {
      onConfirm(noteId);
    } else {
      // Fallback direct call: noteId is used as filePath and vaultPath is unknown here.
      // In practice this branch is not reached when FeedList uses the FIND-008 command bus.
      adapter.dispatchConfirmNoteDeletion(noteId, noteId, '', nowIso());
    }
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      handleCancel();
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      handleCancel();
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if visible}
  <div
    data-testid="modal-backdrop"
    class="modal-backdrop"
    onclick={handleBackdropClick}
    role="presentation"
  >
    <div
      data-testid="delete-confirm-modal"
      role="dialog"
      aria-labelledby={modalTitleId}
      aria-modal="true"
      class="modal-container"
    >
      <h2 id={modalTitleId} class="modal-title">削除の確認</h2>

      <!-- FIND-001 fix: spec-mandated wording '後で復元できます' -->
      <p class="modal-body">
        このノートを OS のゴミ箱に送ります。後で復元できます。
      </p>

      <div class="modal-actions">
        <button
          data-testid="cancel-delete-button"
          onclick={handleCancel}
          class="modal-button-cancel"
        >
          キャンセル
        </button>
        <!-- FIND-002 fix: spec-mandated label '削除（OS ゴミ箱に送る）' -->
        <button
          data-testid="confirm-delete-button"
          onclick={handleConfirm}
          disabled={isConfirmPending}
          class="modal-button-confirm"
        >
          削除（OS ゴミ箱に送る）
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal-container {
    background: #ffffff;
    border-radius: 16px;
    padding: 24px;
    min-width: 320px;
    max-width: 480px;
    box-shadow: rgba(0,0,0,0.05) 0px 20px 52px, rgba(0,0,0,0.034) 0px 10px 21px, rgba(0,0,0,0.025) 0px 4px 8px, rgba(0,0,0,0.012) 0px 0.875px 2.86px, rgba(0,0,0,0.007) 0px 0.175px 1.04px;
  }

  .modal-title {
    font-size: 18px;
    font-weight: 700;
    color: rgba(0,0,0,0.95);
    margin: 0 0 12px 0;
  }

  .modal-body {
    font-size: 14px;
    color: #615d59;
    margin: 0 0 20px 0;
    line-height: 1.5;
  }

  .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .modal-button-cancel {
    background: #ffffff;
    border: 1px solid rgba(0,0,0,0.1);
    border-radius: 4px;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 500;
    color: rgba(0,0,0,0.95);
    cursor: pointer;
  }

  .modal-button-confirm {
    background: #dd5b00;
    border: none;
    border-radius: 4px;
    padding: 8px 16px;
    font-size: 14px;
    font-weight: 600;
    color: #ffffff;
    cursor: pointer;
  }

  .modal-button-confirm:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .modal-button-cancel:focus-visible,
  .modal-button-confirm:focus-visible {
    outline: 2px solid #097fe8;
    outline-offset: 2px;
  }
</style>
