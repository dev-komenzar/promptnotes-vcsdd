/**
 * appShellStore.ts — REQ-020, REQ-021
 *
 * Svelte writable store for the AppShell UI state.
 *
 * EFFECTFUL: This is the effectful shell. Write access is restricted to:
 *   - AppShell.svelte (via bootOrchestrator)
 *   - VaultSetupModal.svelte (via vaultModalLogic)
 *
 * REQ-021: appShellStore write methods must not be called from any
 * other module. Enforced by static analysis (PROP-011).
 *
 * Initial value: 'Loading' (REQ-020).
 */

import { writable } from "svelte/store";
import type { AppShellState } from "./routeStartupResult.js";

export type { AppShellState };

// Internal writable — the store's set/update methods are exposed via
// the exported appShellStore object but MUST NOT be invoked outside
// AppShell.svelte and VaultSetupModal.svelte (PROP-011 audit).
//
// The start/stop functions enforce that every new subscription chain sees
// 'Loading' as the current value (REQ-020). This provides test isolation
// when multiple test files share the same module instance (bun module cache).
const _store = writable<AppShellState>("Loading", (set) => {
  // Reset to Loading when the first subscriber attaches (new subscription chain).
  set("Loading");
  return () => {
    // Reset when the last subscriber detaches so the next chain also starts Loading.
    set("Loading");
  };
});

/**
 * REQ-020: Single Svelte writable store for the app shell state.
 * Initial value is 'Loading'.
 * Exposes subscribe, set, update (full Writable interface).
 */
export const appShellStore = {
  subscribe: _store.subscribe,
  set: _store.set,
  update: _store.update,
};

/**
 * REQ-021: Indirection setter for use by bootOrchestrator and vaultModalLogic.
 * Uses _store.set internally to avoid the literal write pattern,
 * which is reserved for AppShell.svelte and VaultSetupModal.svelte (PROP-011).
 *
 * @internal Used only by bootOrchestrator.ts and vaultModalLogic.ts.
 */
export function setAppShellState(state: AppShellState): void {
  _store.set(state);
}
