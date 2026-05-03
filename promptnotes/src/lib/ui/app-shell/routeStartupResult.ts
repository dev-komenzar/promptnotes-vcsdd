/**
 * routeStartupResult.ts — REQ-002, PROP-007
 *
 * Pure function: maps AppStartup pipeline Result → AppShellRouteResult.
 * Deterministic, no side effects. Covers all 5 AppStartupError paths.
 *
 * Purity boundary: PURE CORE — no I/O, no store writes.
 */

import type { AppStartupError } from "promptnotes-domain-types/shared/errors";
import type { Result } from "promptnotes-domain-types/util/result";
import { shouldShowCorruptedBanner } from "./corruptedBanner.js";

// ── AppShellState discriminated union ─────────────────────────────────────

/**
 * REQ-020: Five possible UI states for the app shell.
 */
export type AppShellState =
  | "Loading"
  | "Configured"
  | "Unconfigured"
  | "StartupError"
  | "UnexpectedError";

// ── AppShellRouteResult ───────────────────────────────────────────────────

/**
 * Structured result of routeStartupResult, carrying the UI state plus
 * derived flags for component rendering.
 *
 * FIND-202: corruptedFilesCount carries the number of corrupted files
 * so AppShell.svelte can display the banner message without needing to
 * re-read raw IPC data.
 */
export type AppShellRouteResult = {
  readonly state: AppShellState;
  readonly isModalOpen: boolean;
  readonly showCorruptedBanner: boolean;
  readonly corruptedFilesCount: number;
  readonly errorReason?: AppStartupError;
};

// ── routeStartupResult ────────────────────────────────────────────────────

/**
 * REQ-002 / PROP-007: Routes the AppStartup pipeline result to the
 * appropriate AppShellState and derived rendering flags.
 *
 * All 5 paths:
 *   Ok(InitialUIState)                             → Configured
 *   Err(config / unconfigured)                     → Unconfigured  (modal open)
 *   Err(config / path-not-found)                   → StartupError  (modal open)
 *   Err(config / permission-denied)                → StartupError  (modal open)
 *   Err(scan / list-failed)                        → UnexpectedError (banner only)
 */
export function routeStartupResult(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: Result<any, AppStartupError>
): AppShellRouteResult {
  if (result.ok) {
    const corruptedFiles = result.value?.corruptedFiles ?? [];
    const corruptedFilesCount = Array.isArray(corruptedFiles) ? corruptedFiles.length : 0;
    return {
      state: "Configured",
      isModalOpen: false,
      showCorruptedBanner: shouldShowCorruptedBanner(corruptedFiles as Array<{ filePath: string }>),
      corruptedFilesCount,
    };
  }

  const error = result.error;

  if (error.kind === "config") {
    const reason = error.reason;
    if (reason.kind === "unconfigured") {
      return {
        state: "Unconfigured",
        isModalOpen: true,
        showCorruptedBanner: false,
        corruptedFilesCount: 0,
        errorReason: error,
      };
    }
    // path-not-found or permission-denied
    return {
      state: "StartupError",
      isModalOpen: true,
      showCorruptedBanner: false,
      corruptedFilesCount: 0,
      errorReason: error,
    };
  }

  // scan error → UnexpectedError, banner only (no modal)
  return {
    state: "UnexpectedError",
    isModalOpen: false,
    showCorruptedBanner: false,
    corruptedFilesCount: 0,
    errorReason: error,
  };
}
