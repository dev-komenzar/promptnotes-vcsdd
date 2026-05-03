<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { vaultModalSubmitHandler } from "./vaultModalLogic.js";
  import { createTauriAdapter } from "./tauriAdapter.js";
  import { invoke } from "@tauri-apps/api/core";
  // mapVaultPathError and mapVaultConfigError are used in vaultModalLogic.ts.
  // FIND-407: These are no longer used as fallback ?? in the template (removed to
  // avoid fabricating error messages when errorMessage is undefined).
  import { DESIGN_TOKENS, MODAL_STYLE } from "./designTokens.js";
  import { VAULT_SETUP_MODAL_TESTID } from "./componentTestIds.js";
  import type { AppShellState } from "./appShellStore.js";
  import type { VaultModalState } from "./vaultModalLogic.js";

  export let state: AppShellState;

  const tauriAdapter = createTauriAdapter({ invoke });

  let rawPath: string = "";
  let modalState: VaultModalState = { isSaving: false, hasError: false };

  // REQ-016 / FIND-204: Focus trap — track first and last focusable elements.
  let modalEl: HTMLDivElement | null = null;

  // FIND-406: Track the element that was focused before the modal opened,
  // so we can restore focus when the modal closes.
  let triggerElement: Element | null = null;

  /**
   * REQ-016 / FIND-204: Returns the list of focusable elements inside the modal.
   * Selects interactive elements that are not disabled and not inert.
   */
  function getFocusableElements(): HTMLElement[] {
    if (!modalEl) return [];
    return Array.from(
      modalEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  // FIND-406: On mount, capture the trigger element and set initial focus
  // on the first focusable element inside the modal.
  onMount(() => {
    // Capture the currently focused element before modal takes focus.
    triggerElement = document.activeElement;

    // Set initial focus on the first focusable element (input).
    // Use a microtask to ensure the DOM has fully rendered.
    Promise.resolve().then(() => {
      const focusable = getFocusableElements();
      if (focusable.length > 0) {
        focusable[0].focus();
      } else if (modalEl) {
        // Fall back to focusing the modal container itself.
        modalEl.focus();
      }
    });
  });

  // FIND-406: On destroy, restore focus to the trigger element.
  onDestroy(() => {
    if (triggerElement instanceof HTMLElement) {
      triggerElement.focus();
    }
  });

  async function handleSubmit(event: Event) {
    event.preventDefault();
    await vaultModalSubmitHandler(
      {
        tryVaultPath: tauriAdapter.tryVaultPath,
        invokeConfigureVault: tauriAdapter.invokeConfigureVault,
        invokeAppStartup: tauriAdapter.invokeAppStartup,
        onStateChange: (s) => { modalState = s; },
      },
      { rawPath: rawPath || null, isSaving: modalState.isSaving }
    );
  }

  function stopPropagation(event: Event) {
    event.stopPropagation();
  }

  /**
   * REQ-016 / FIND-204 / FIND-406: Keyboard handler.
   * - Esc: disabled (stopPropagation + preventDefault)
   * - Tab: wraps focus within the modal (focus trap)
   *   Edge case: when no element is focused, Tab focuses first; Shift+Tab focuses last.
   * - Shift+Tab: wraps focus backwards within the modal
   */
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      // REQ-016: Esc must NOT close the modal
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === "Tab") {
      const focusable = getFocusableElements();
      if (focusable.length === 0) return;

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        // Shift+Tab: if focus is on first element OR outside modal, wrap to last
        if (active === firstEl || (active !== null && !modalEl?.contains(active))) {
          event.preventDefault();
          lastEl.focus();
        }
      } else {
        // Tab: if focus is on last element OR outside modal, wrap to first
        if (active === lastEl || (active !== null && !modalEl?.contains(active))) {
          event.preventDefault();
          firstEl.focus();
        }
      }
    }
  }
</script>

<!-- REQ-003: Overlay — does not close modal (stopPropagation) -->
<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="modal-overlay"
  on:click={stopPropagation}
  style="background-color: {DESIGN_TOKENS.modalScrim};"
>
  <!-- REQ-016 / FIND-204: Focus trap container, Esc disabled, Tab wraps -->
  <div
    bind:this={modalEl}
    class="modal"
    data-testid={VAULT_SETUP_MODAL_TESTID}
    on:keydown={handleKeydown}
    style="border-radius: {MODAL_STYLE.borderRadius}; box-shadow: {MODAL_STYLE.boxShadow}; background-color: {DESIGN_TOKENS.pureWhite}; padding: 24px;"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <h2 style="font-size: 16px; font-weight: 600; color: {DESIGN_TOKENS.nearBlack}; margin-bottom: 16px;">
      {#if state === "StartupError"}
        Vault フォルダの再設定
      {:else}
        Vault フォルダを選択
      {/if}
    </h2>

    <form on:submit={handleSubmit}>
      <label for="vault-path-input" style="font-size: 14px; font-weight: 500; color: {DESIGN_TOKENS.nearBlack};">
        フォルダパス
      </label>
      <input
        id="vault-path-input"
        type="text"
        bind:value={rawPath}
        disabled={modalState.isSaving}
        style="display: block; width: 100%; padding: 8px; margin-top: 4px; border: {DESIGN_TOKENS.whisperBorder}; border-radius: 8px; font-size: 14px;"
        placeholder="/home/user/notes"
      />

      <!-- FIND-407: Only render error banner when there is a real errorMessage.
           Do NOT use ?? fallback to fabricate an empty-error message.
           The modal's error UI only renders when errorMessage is defined. -->
      {#if modalState.hasError && modalState.errorKind === "vault-path-error" && modalState.errorMessage !== undefined}
        <p style="color: {DESIGN_TOKENS.warnColor}; font-size: 14px; margin-top: 4px;">
          {modalState.errorMessage}
        </p>
      {/if}

      {#if modalState.hasError && modalState.errorKind === "vault-config-error" && modalState.errorMessage !== undefined}
        <p style="color: {DESIGN_TOKENS.warnColor}; font-size: 14px; margin-top: 4px;">
          {modalState.errorMessage}
        </p>
      {/if}

      <button
        type="submit"
        disabled={modalState.isSaving}
        style="margin-top: 16px; padding: 8px 16px; background-color: {DESIGN_TOKENS.pureWhite}; border: {DESIGN_TOKENS.whisperBorder}; border-radius: 8px; font-size: 14px; font-weight: 500; cursor: pointer;"
      >
        {modalState.isSaving ? "保存中..." : "保存"}
      </button>
    </form>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    width: 100%;
    background-color: #ffffff;
  }
</style>
