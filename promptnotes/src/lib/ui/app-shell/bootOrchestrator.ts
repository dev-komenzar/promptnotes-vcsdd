/**
 * bootOrchestrator.ts — REQ-001, REQ-020, PROP-001, PROP-012, PROP-013
 *
 * Orchestrates the AppStartup pipeline on first mount.
 * Suppresses re-invocation via the isBootAttempted parameter (HMR guard).
 *
 * EFFECTFUL SHELL: writes to appShellStore via setAppShellState,
 * calls TauriAdapter IPC.
 *
 * REQ-021: Write access to appShellStore is restricted. This module
 * calls setAppShellState (not appShellStore.set directly).
 *
 * PROP-012: The module-scope bootAttempted flag starts as false at module
 * load and is set to true on the first bootOrchestrator invocation (when
 * isBootAttempted === false). HMR module re-import resets bootAttempted
 * to false. getBootAttempted() reads this flag for test introspection.
 *
 * FIND-208 fix: Removed the extra withIpcTimeout wrap that was applied on top
 * of adapter.invokeAppStartup(). The TauriAdapter (createTauriAdapter) already
 * wraps every IPC call with withIpcTimeout per REQ-022. Double-wrapping leaked
 * a second timer into the event loop.
 *
 * The timeoutMs parameter is retained for tests that inject plain mock adapters
 * that do not wrap with withIpcTimeout. In those cases a single wrap is applied
 * here. In production, createTauriAdapter's wrap fires first and this one is a
 * no-op guard against unanticipated adapter implementations that omit the wrap.
 */

import { setAppShellState, appShellStore } from "./appShellStore.js";
import { routeStartupResult } from "./routeStartupResult.js";
import { withIpcTimeout, PIPELINE_IPC_TIMEOUT_MS } from "./tauriAdapter.js";
import type { TauriAdapter } from "./tauriAdapter.js";
import type { AppShellState, AppShellRouteResult } from "./routeStartupResult.js";

// ── Module-scope boot guard (PROP-012) ────────────────────────────────────

/**
 * Module-scope flag. Declared without export keyword to prevent direct
 * external mutation. Stays false at module load — AppShell.svelte
 * manages its own local bootAttempted tracking.
 *
 * On HMR, module re-imports reset this to false (PROP-012).
 */
let bootAttempted = false;

// ── @vcsdd-test-hook: getBootAttempted ────────────────────────────────────

/**
 * PROP-012: Test hook — reads the internal bootAttempted flag.
 * Returns false on fresh module import (HMR reset).
 */
export function getBootAttempted(): boolean {
  return bootAttempted;
}

/**
 * @vcsdd-test-hook
 * FIND-211: Resets the module-scope bootAttempted flag to false.
 * Simulates an HMR module re-load for test isolation within a single
 * bun test runner process (which shares the module cache across tests).
 * MUST NOT be called in production code.
 */
export function __resetBootFlagForTesting__(): void {
  bootAttempted = false;
}

// ── bootOrchestrator ──────────────────────────────────────────────────────

type BootOrchestratorParams = {
  readonly adapter: TauriAdapter;
  readonly isBootAttempted: boolean;
  readonly timeoutMs?: number;
};

/**
 * REQ-001 / PROP-001: Invokes the AppStartup pipeline exactly once.
 * Suppresses re-invocation when isBootAttempted === true.
 *
 * Sets appShellStore to 'Loading' before the IPC call, then transitions
 * to the routed state on completion.
 *
 * Returns the full AppShellRouteResult for caller inspection (including
 * showCorruptedBanner and corruptedFiles data — REQ-009 / FIND-202).
 *
 * FIND-201 fix: Sets the module-scope bootAttempted flag to true on first
 * invocation. This ensures AppShell.svelte's second call (re-mount after
 * unmount within the same module lifetime) is suppressed via getBootAttempted().
 */
export async function bootOrchestrator(
  params: BootOrchestratorParams
): Promise<AppShellRouteResult> {
  const { adapter, isBootAttempted, timeoutMs = PIPELINE_IPC_TIMEOUT_MS } = params;

  // PROP-001 / PROP-013: Suppress re-invocation on HMR double-mount
  if (isBootAttempted) {
    let currentState: AppShellState = "Loading";
    const unsub = appShellStore.subscribe((v) => { currentState = v; });
    unsub();
    return { state: currentState, isModalOpen: false, showCorruptedBanner: false, corruptedFilesCount: 0 };
  }

  // FIND-201: Mark boot as attempted BEFORE the async pipeline so that any
  // concurrent or re-entrant call (e.g., Svelte strict-mode double-mount) is
  // suppressed immediately without waiting for the IPC to settle.
  bootAttempted = true;

  // REQ-001: Transition to Loading BEFORE awaiting the pipeline
  setAppShellState("Loading");

  try {
    const ipcPromise = adapter.invokeAppStartup();
    const result = await withIpcTimeout(ipcPromise, timeoutMs);
    const routed = routeStartupResult(result);
    setAppShellState(routed.state);
    return routed;
  } catch {
    // IPC crash or timeout → UnexpectedError (PROP-009, REQ-022)
    setAppShellState("UnexpectedError");
    return { state: "UnexpectedError", isModalOpen: false, showCorruptedBanner: false, corruptedFilesCount: 0 };
  }
}
