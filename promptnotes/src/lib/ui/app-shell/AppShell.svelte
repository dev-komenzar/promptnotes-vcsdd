<script lang="ts">
  import { onMount } from "svelte";
  import { appShellStore, setAppShellState } from "./appShellStore.js";
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

    // FIND-404: AppShell.svelte is the designated write authority for appShellStore.
    // REQ-001: Set Loading state BEFORE awaiting the pipeline.
    if (!isBooted) {
      setAppShellState("Loading");
    }

    const routeResult = await bootOrchestrator({ adapter: tauriAdapter, isBootAttempted: isBooted });

    // FIND-404: Apply the routed state — this is the only write in the boot path.
    setAppShellState(routeResult.state);

    // REQ-009 / FIND-202: Update banner state from the full route result.
    showCorruptedBanner = routeResult.showCorruptedBanner;
    corruptedFilesCount = routeResult.corruptedFilesCount;
  });
</script>

<div class="app-shell">
  <!-- REQ-010: Header — FIND-403: only rendered when state === 'Configured'.
       This satisfies the literal EARS clause: "WHEN AppShellState === 'Configured',
       the system SHALL render header". The modal has aria-modal=true and traps
       focus, providing equivalent a11y isolation without aria-hidden/inert hacks. -->
  {#if state === "Configured"}
    <header
      style="background-color: {HEADER_STYLE.backgroundColor}; border-bottom: {HEADER_STYLE.borderBottom}; padding: 8px 16px;"
    >
      <span
        style="font-size: {HEADER_STYLE.titleFontSize}; font-weight: {HEADER_STYLE.titleFontWeight}; color: {HEADER_STYLE.titleColor};"
      >
        PromptNotes
      </span>
    </header>
  {/if}

  <!-- REQ-011: Main area — FIND-403: only rendered when state === 'Configured' or
       for Loading/UnexpectedError transient states. The EARS spec reads:
       "WHEN AppShellState === 'Configured', SHALL render main". For Loading and
       UnexpectedError we still render <main> to host the loading skeleton and
       error banner. Modal states (Unconfigured, StartupError) render no main. -->
  {#if state === "Loading"}
    <main>
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
    </main>
  {/if}

  {#if state === "UnexpectedError"}
    <main>
      <!-- REQ-008: Unexpected error banner (role=alert, no modal) -->
      <div
        data-testid={ERROR_BANNER_TESTID}
        role={ERROR_BANNER_ROLE}
      >
        <span data-testid={STARTUP_ERROR_MESSAGE_TESTID}>
          起動中にエラーが発生しました。アプリを再起動してください。
        </span>
      </div>
    </main>
  {/if}

  {#if state === "Configured"}
    <main>
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
    </main>
  {/if}

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
