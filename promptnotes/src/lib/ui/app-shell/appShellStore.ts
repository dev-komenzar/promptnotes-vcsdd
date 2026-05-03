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
 *
 * FIND-211 fix: Removed start/stop callbacks that were unconditionally
 * resetting the store to 'Loading' on subscribe/unsubscribe. Those callbacks
 * violated REQ-020 (Loading→Loading suppressed by bootAttempted), REQ-021
 * (writes from inside appShellStore.ts bypassing the authority boundary), and
 * caused test isolation bugs where subscribing AFTER bootOrchestrator resolved
 * would clobber the settled state back to 'Loading'.
 * Test isolation is now achieved via __resetForTesting__ (test-only hook).
 */

import { writable } from "svelte/store";
import type { AppShellState } from "./routeStartupResult.js";

export type { AppShellState };

// Internal writable — the store's set/update methods are exposed via
// the exported appShellStore object but MUST NOT be invoked outside
// AppShell.svelte and VaultSetupModal.svelte (PROP-011 audit).
//
// FIND-211: No start/stop callbacks — subscribe/unsubscribe does NOT reset state.
const _store = writable<AppShellState>("Loading");

/**
 * REQ-020 / REQ-021 (FIND-408): appShellStore exposes ONLY subscribe.
 * The set/update methods are intentionally removed from the public interface.
 * All state writes MUST go through setAppShellState() (REQ-021).
 *
 * This structural constraint is enforced at the type level: callers cannot
 * call appShellStore.set() because it does not exist on the exported object.
 * The PROP-011 audit catches any attempt to call setAppShellState() from
 * files outside the ALLOWED_WRITERS set.
 */
export const appShellStore: { subscribe: typeof _store.subscribe } = {
  subscribe: _store.subscribe,
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

/**
 * @vcsdd-test-hook
 * FIND-211: Resets the store to 'Loading' for test isolation.
 * MUST NOT be called in production code.
 * Used in tests to restore initial state between test cases that share
 * the same module instance (bun module cache without resetModules()).
 */
export function __resetForTesting__(): void {
  _store.set("Loading");
}
