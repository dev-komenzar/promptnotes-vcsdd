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
 *
 * FIND-208 fix: The sentinel timer is cleared via clearTimeout when the
 * underlying promise resolves or rejects, preventing leaked timers in tests
 * and in production when calls complete well before the timeout.
 */
export function withIpcTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = PIPELINE_IPC_TIMEOUT_MS
): Promise<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  const timeoutSentinel = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error(`IPC timeout after ${timeoutMs}ms`)),
      timeoutMs
    );
  });
  return Promise.race([promise, timeoutSentinel]).finally(() => {
    clearTimeout(timerId);
  });
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
 * Wraps tryVaultPath and invokeConfigureVault with withIpcTimeout per REQ-022.
 *
 * FIND-208 fix: invokeAppStartup is NOT wrapped here. The single timeout for
 * invokeAppStartup lives in bootOrchestrator.ts where timeoutMs is configurable
 * (critical for test isolation). Wrapping here AND there created two leaked
 * setTimeout handles racing each other. REQ-022 is satisfied: all three pipeline
 * IPC commands are timeout-guarded — invokeAppStartup via bootOrchestrator,
 * tryVaultPath and invokeConfigureVault here.
 *
 * In tests, pass a mock invoke function.
 */
export function createTauriAdapter(deps: TauriAdapterDeps): TauriAdapter {
  return {
    // FIND-208: No withIpcTimeout here — bootOrchestrator owns the single timeout.
    invokeAppStartup: () =>
      deps.invoke("invoke_app_startup") as Promise<Result<unknown, AppStartupError>>,

    tryVaultPath: (rawPath: string) =>
      withIpcTimeout(
        deps.invoke("try_vault_path", { rawPath }) as Promise<Result<VaultPath, VaultPathError>>
      ),

    // FIND-214: parameter renamed from { vaultPath } to { path } per spec
    invokeConfigureVault: (vaultPath: VaultPath) =>
      withIpcTimeout(
        deps.invoke("invoke_configure_vault", { path: vaultPath }) as Promise<Result<unknown, VaultConfigError>>
      ),
  };
}
