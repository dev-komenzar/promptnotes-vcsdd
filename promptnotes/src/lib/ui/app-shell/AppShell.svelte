<script lang="ts">
  import { onMount } from "svelte";
  import { appShellStore } from "./appShellStore.js";
  import { bootOrchestrator, getBootAttempted } from "./bootOrchestrator.js";
  import { createTauriAdapter } from "./tauriAdapter.js";
  import { invoke } from "@tauri-apps/api/core";
  import {
    HEADER_STYLE,
    SKELETON_CARD_STYLE,
    CORRUPTED_BANNER_STYLES,
  } from "./designTokens.js";
  import {
    ERROR_BANNER_TESTID,
    ERROR_BANNER_ROLE,
    STARTUP_ERROR_MESSAGE_TESTID,
    CORRUPTED_BANNER_TESTID,
  } from "./componentTestIds.js";
  import { LOADING_ARIA_ATTRIBUTES } from "./loadingState.js";
  import { buildCorruptedBannerMessage } from "./corruptedBanner.js";
  import VaultSetupModal from "./VaultSetupModal.svelte";

  const tauriAdapter = createTauriAdapter({ invoke });

  $: state = $appShellStore;

  // REQ-009 / FIND-202: Track corrupted files count from the boot route result.
  let corruptedFilesCount = 0;
  let showCorruptedBanner = false;

  onMount(async () => {
    const isBooted = getBootAttempted();
    const routeResult = await bootOrchestrator({ adapter: tauriAdapter, isBootAttempted: isBooted });
    // REQ-009 / FIND-202: Update banner state from the full route result.
    showCorruptedBanner = routeResult.showCorruptedBanner;
    corruptedFilesCount = routeResult.corruptedFilesCount;
  });
</script>

<div class="app-shell">
  <!-- REQ-010: Header — FIND-209: inert + aria-hidden when modal is open -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <header
    style="background-color: {HEADER_STYLE.backgroundColor}; border-bottom: {HEADER_STYLE.borderBottom}; padding: 8px 16px;"
    aria-hidden={state === "Unconfigured" || state === "StartupError" ? "true" : undefined}
    inert={state === "Unconfigured" || state === "StartupError" ? true : undefined}
  >
    <span
      style="font-size: {HEADER_STYLE.titleFontSize}; font-weight: {HEADER_STYLE.titleFontWeight}; color: {HEADER_STYLE.titleColor};"
    >
      PromptNotes
    </span>
  </header>

  <!-- REQ-011: Main area — FIND-209: inert + aria-hidden when modal is open -->
  <main
    aria-hidden={state === "Unconfigured" || state === "StartupError" ? "true" : undefined}
    inert={state === "Unconfigured" || state === "StartupError" ? true : undefined}
  >
    {#if state === "Loading"}
      <!-- REQ-012: Loading skeleton (aria-hidden skeleton cards) -->
      <div
        role={LOADING_ARIA_ATTRIBUTES.role}
        aria-busy={LOADING_ARIA_ATTRIBUTES["aria-busy"]}
        aria-label={LOADING_ARIA_ATTRIBUTES["aria-label"]}
      >
        <div
          class="skeleton-card"
          aria-hidden={SKELETON_CARD_STYLE.ariaHidden}
          style="border-radius: {SKELETON_CARD_STYLE.borderRadius}; background-color: {SKELETON_CARD_STYLE.baseColor}; height: 32px; margin: 8px;"
        ></div>
        <div
          class="skeleton-card"
          aria-hidden={SKELETON_CARD_STYLE.ariaHidden}
          style="border-radius: {SKELETON_CARD_STYLE.borderRadius}; background-color: {SKELETON_CARD_STYLE.baseColor}; height: 32px; margin: 8px;"
        ></div>
      </div>
    {/if}

    {#if state === "UnexpectedError"}
      <!-- REQ-008: Unexpected error banner (role=alert, no modal) -->
      <div
        data-testid={ERROR_BANNER_TESTID}
        role={ERROR_BANNER_ROLE}
      >
        <span data-testid={STARTUP_ERROR_MESSAGE_TESTID}>
          起動中にエラーが発生しました。アプリを再起動してください。
        </span>
      </div>
    {/if}

    {#if state === "Configured"}
      <!-- REQ-009 / FIND-202: Corrupted files banner shown iff showCorruptedBanner -->
      {#if showCorruptedBanner}
        <div
          data-testid={CORRUPTED_BANNER_TESTID}
          role="alert"
          style="color: {CORRUPTED_BANNER_STYLES.warnColor}; border: {CORRUPTED_BANNER_STYLES.border}; border-radius: {CORRUPTED_BANNER_STYLES.borderRadius}; font-size: {CORRUPTED_BANNER_STYLES.fontSize}; font-weight: {CORRUPTED_BANNER_STYLES.fontWeight}; padding: 8px 16px; margin: 8px;"
        >
          {buildCorruptedBannerMessage(corruptedFilesCount)}
        </div>
      {/if}

      <!-- REQ-012: Main content area placeholder -->
      <slot />
    {/if}
  </main>

  <!-- REQ-003: Modal for Unconfigured / StartupError -->
  {#if state === "Unconfigured" || state === "StartupError"}
    <VaultSetupModal {state} />
  {/if}
</div>

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  main {
    flex: 1;
    padding: 16px;
  }
</style>
