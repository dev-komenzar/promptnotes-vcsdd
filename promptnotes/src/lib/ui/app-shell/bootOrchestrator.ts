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
 * PROP-012: The module-scope bootAttempted flag is NEVER set by
 * bootOrchestrator itself. It starts as false at module load and stays
 * false — AppShell.svelte tracks mount state in its own local variable
 * and passes it as isBootAttempted. This ensures the test hook
 * getBootAttempted() always reflects the fresh-module state.
 */

import { setAppShellState, appShellStore } from "./appShellStore.js";
import { routeStartupResult } from "./routeStartupResult.js";
import { withIpcTimeout, PIPELINE_IPC_TIMEOUT_MS } from "./tauriAdapter.js";
import type { TauriAdapter } from "./tauriAdapter.js";
import type { AppShellState } from "./routeStartupResult.js";

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
 * Returns the final AppShellState for caller inspection.
 *
 * Note: bootAttempted module flag is NOT mutated here (PROP-012).
 * The caller (AppShell.svelte) passes isBootAttempted from its own
 * local state tracking.
 */
export async function bootOrchestrator(
  params: BootOrchestratorParams
): Promise<AppShellState> {
  const { adapter, isBootAttempted, timeoutMs = PIPELINE_IPC_TIMEOUT_MS } = params;

  // PROP-001 / PROP-013: Suppress re-invocation on HMR double-mount
  if (isBootAttempted) {
    let currentState: AppShellState = "Loading";
    const unsub = appShellStore.subscribe((v) => { currentState = v; });
    unsub();
    return currentState;
  }

  // REQ-001: Transition to Loading BEFORE awaiting the pipeline
  setAppShellState("Loading");

  try {
    const ipcPromise = adapter.invokeAppStartup();
    const result = await withIpcTimeout(ipcPromise, timeoutMs);
    const routed = routeStartupResult(result);
    setAppShellState(routed.state);
    return routed.state;
  } catch {
    // IPC crash or timeout → UnexpectedError (PROP-009, REQ-022)
    setAppShellState("UnexpectedError");
    return "UnexpectedError";
  }
}
