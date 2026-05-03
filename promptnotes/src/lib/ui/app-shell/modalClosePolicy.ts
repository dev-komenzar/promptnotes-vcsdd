/**
 * modalClosePolicy.ts — REQ-003, REQ-016, PROP-005
 *
 * Pure function: determines whether a modal close action is permitted
 * given the current AppShellState and the close trigger.
 *
 * Purity boundary: PURE CORE — deterministic, no side effects.
 */

import type { AppShellState } from "./routeStartupResult.js";

export type { AppShellState };

/** REQ-016: The trigger source for a modal close attempt. */
export type ModalCloseTrigger = "overlay" | "esc" | "success";

/**
 * REQ-003 / REQ-016 / PROP-005:
 * Returns true iff the modal may be closed given (state, trigger).
 *
 * Invariants:
 *   - state ∈ {'Unconfigured', 'StartupError'} AND trigger ∈ {'overlay', 'esc'} → false
 *   - state ∈ {'Unconfigured', 'StartupError'} AND trigger === 'success' → true
 */
export function isModalCloseable(
  state: AppShellState,
  trigger: ModalCloseTrigger
): boolean {
  if (state !== "Unconfigured" && state !== "StartupError") {
    // Modal is not open in other states — no restriction applies
    return true;
  }
  return trigger === "success";
}
