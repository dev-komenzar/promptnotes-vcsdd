<script lang="ts">
  import { appShellStore } from "./appShellStore.js";
  import { vaultModalSubmitHandler } from "./vaultModalLogic.js";
  import { createTauriAdapter } from "./tauriAdapter.js";
  import { invoke } from "@tauri-apps/api/core";
  import { mapVaultPathError, mapVaultConfigError } from "./errorMessages.js";
  import { DESIGN_TOKENS, MODAL_STYLE } from "./designTokens.js";
  import { VAULT_SETUP_MODAL_TESTID } from "./componentTestIds.js";
  import type { AppShellState } from "./appShellStore.js";
  import type { VaultModalState } from "./vaultModalLogic.js";

  export let state: AppShellState;

  const tauriAdapter = createTauriAdapter({ invoke });

  let rawPath: string = "";
  let modalState: VaultModalState = { isSaving: false, hasError: false };

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

  function handleKeydown(event: KeyboardEvent) {
    // REQ-016: Esc disabled
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
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
  <!-- REQ-016: Focus trap container, Esc disabled -->
  <div
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

      {#if modalState.hasError && modalState.errorKind === "vault-path-error"}
        <p style="color: {DESIGN_TOKENS.warnColor}; font-size: 14px; margin-top: 4px;">
          フォルダを選択してください
        </p>
      {/if}

      {#if modalState.hasError && modalState.errorKind === "vault-config-error"}
        <p style="color: {DESIGN_TOKENS.warnColor}; font-size: 14px; margin-top: 4px;">
          {modalState.errorMessage ?? "設定したフォルダが見つかりません。再設定するか、フォルダを復元してください"}
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
