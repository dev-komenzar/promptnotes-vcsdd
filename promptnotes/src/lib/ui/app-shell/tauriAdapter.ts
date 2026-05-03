/**
 * tauriAdapter.ts — REQ-022, PROP-014
 *
 * Tauri IPC adapter: wraps all pipeline commands with timeout enforcement.
 * Bridges the effectful Tauri IPC layer to the pure domain types.
 *
 * EFFECTFUL SHELL: all IPC calls live here.
 *
 * REQ-022: All pipeline IPC calls wrapped with withIpcTimeout.
 * PIPELINE_IPC_TIMEOUT_MS = 30000ms.
 */

import type { InvokeArgs, InvokeOptions } from "@tauri-apps/api/core";
import type { VaultPath, VaultPathError } from "promptnotes-domain-types/shared/value-objects";
import type { AppStartupError, VaultConfigError } from "promptnotes-domain-types/shared/errors";
import type { Result } from "promptnotes-domain-types/util/result";

// ── Timeout constant ──────────────────────────────────────────────────────

/**
 * REQ-022: Client-side pipeline IPC timeout in milliseconds.
 */
export const PIPELINE_IPC_TIMEOUT_MS = 30000 as const;

// ── withIpcTimeout ────────────────────────────────────────────────────────

/**
 * REQ-022 / PROP-014: Races a Promise against a timeout sentinel.
 * If the timeout fires first, rejects with an Error containing "timeout".
 */
export function withIpcTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = PIPELINE_IPC_TIMEOUT_MS
): Promise<T> {
  const timeoutSentinel = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`IPC timeout after ${timeoutMs}ms`)),
      timeoutMs
    )
  );
  return Promise.race([promise, timeoutSentinel]);
}

// ── TauriAdapter interface ────────────────────────────────────────────────

/**
 * The adapter interface used by bootOrchestrator and vaultModalLogic.
 * All methods are async and return Result-shaped objects.
 * Using loose return types to accommodate test mocks that create
 * object literals without `as const` (ok: boolean vs ok: true/false).
 */
export type TauriAdapter = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly invokeAppStartup: () => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly tryVaultPath: (rawPath: string) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly invokeConfigureVault: (vaultPath: VaultPath) => Promise<any>;
};

// ── TauriAdapterDeps ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InvokeFn = (command: string, args?: InvokeArgs, options?: InvokeOptions) => Promise<any>;

type TauriAdapterDeps = {
  readonly invoke: InvokeFn;
};

// ── createTauriAdapter ────────────────────────────────────────────────────

/**
 * REQ-022: Factory for the production TauriAdapter.
 * Wraps every IPC call with withIpcTimeout.
 *
 * In tests, pass a mock invoke function.
 */
export function createTauriAdapter(deps: TauriAdapterDeps): TauriAdapter {
  return {
    invokeAppStartup: () =>
      withIpcTimeout(
        deps.invoke("invoke_app_startup") as Promise<Result<unknown, AppStartupError>>
      ),

    tryVaultPath: (rawPath: string) =>
      withIpcTimeout(
        deps.invoke("try_vault_path", { rawPath }) as Promise<Result<VaultPath, VaultPathError>>
      ),

    invokeConfigureVault: (vaultPath: VaultPath) =>
      withIpcTimeout(
        deps.invoke("invoke_configure_vault", { vaultPath }) as Promise<Result<unknown, VaultConfigError>>
      ),
  };
}
