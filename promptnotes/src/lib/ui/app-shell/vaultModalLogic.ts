/**
 * vaultModalLogic.ts — REQ-004, REQ-006, PROP-008
 *
 * Logic for the VaultSetupModal submit flow.
 * Coordinates try_vault_path → invoke_configure_vault → invoke_app_startup.
 *
 * EFFECTFUL SHELL: calls TauriAdapter IPC methods.
 * REQ-021: write access to appShellStore restricted here and AppShell.svelte.
 */

import type { VaultPath, VaultPathError } from "promptnotes-domain-types/shared/value-objects";
import type { VaultConfigError, AppStartupError } from "promptnotes-domain-types/shared/errors";
import type { Result } from "promptnotes-domain-types/util/result";
import { setAppShellState } from "./appShellStore.js";
import { routeStartupResult } from "./routeStartupResult.js";

// ── VaultModalState ────────────────────────────────────────────────────────

/**
 * State shape reported to the component via onStateChange callback.
 */
export type VaultModalState = {
  readonly isSaving: boolean;
  readonly hasError: boolean;
  readonly errorKind?: "vault-path-error" | "vault-config-error" | "unexpected-error";
  readonly errorMessage?: string;
};

// ── VaultModalDeps ─────────────────────────────────────────────────────────

/**
 * Dependencies injected into vaultModalSubmitHandler.
 * In production, backed by TauriAdapter methods.
 * In tests, backed by mock functions.
 */
export type VaultModalDeps = {
  readonly tryVaultPath: (rawPath: string) => Promise<Result<VaultPath, VaultPathError>>;
  readonly invokeConfigureVault: (vaultPath: VaultPath) => Promise<Result<unknown, VaultConfigError>>;
  readonly invokeAppStartup: () => Promise<Result<unknown, AppStartupError>>;
  readonly onStateChange: (state: VaultModalState) => void;
};

// ── vaultModalSubmitHandler ────────────────────────────────────────────────

type SubmitParams = {
  readonly rawPath: string | null | undefined;
  readonly isSaving: boolean;
};

/**
 * REQ-004 / REQ-006 / PROP-008:
 * Handles vault modal form submission.
 *
 * Guards:
 *   - rawPath null/undefined → no-op (EC-07: OS picker cancel)
 *   - isSaving === true → no-op (EC-08: double-submit)
 *
 * Flow:
 *   1. tryVaultPath(rawPath) → on Err: report modal error, stop
 *   2. invokeConfigureVault(vaultPath) → on Err: report modal error, stop
 *   3. invokeAppStartup() → update appShellStore with routed result
 */
export async function vaultModalSubmitHandler(
  deps: VaultModalDeps,
  params: SubmitParams
): Promise<void> {
  const { rawPath, isSaving } = params;

  // EC-07: OS picker cancel → no invoke
  if (rawPath == null) return;

  // EC-08: double-submit suppression
  if (isSaving) return;

  // Signal saving start
  deps.onStateChange({ isSaving: true, hasError: false });

  // Step 1: Validate path via Rust smart constructor
  let vaultPathResult: Result<VaultPath, VaultPathError>;
  try {
    vaultPathResult = await deps.tryVaultPath(rawPath);
  } catch {
    deps.onStateChange({ isSaving: false, hasError: true, errorKind: "unexpected-error" });
    return;
  }

  if (!vaultPathResult.ok) {
    deps.onStateChange({
      isSaving: false,
      hasError: true,
      errorKind: "vault-path-error",
    });
    return;
  }

  const vaultPath = vaultPathResult.value;

  // Step 2: Configure vault (PROP-008: only called after successful try_vault_path)
  let configureResult: Result<unknown, VaultConfigError>;
  try {
    configureResult = await deps.invokeConfigureVault(vaultPath);
  } catch {
    deps.onStateChange({ isSaving: false, hasError: true, errorKind: "unexpected-error" });
    return;
  }

  if (!configureResult.ok) {
    deps.onStateChange({
      isSaving: false,
      hasError: true,
      errorKind: "vault-config-error",
    });
    return;
  }

  // Step 3: Re-run AppStartup pipeline
  try {
    const startupResult = await deps.invokeAppStartup();
    const routed = routeStartupResult(startupResult);
    setAppShellState(routed.state);
    deps.onStateChange({ isSaving: false, hasError: false });
  } catch {
    deps.onStateChange({ isSaving: false, hasError: true, errorKind: "unexpected-error" });
  }
}
