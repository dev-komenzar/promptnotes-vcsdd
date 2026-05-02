/**
 * pipeline.ts — ConfigureVault orchestration pipeline.
 *
 * REQ-001 through REQ-014: Full configure-vault use case.
 * FIND-005: Synchronous return — no Promise wrapper.
 * FIND-006: Port name is `emit`, not `EventBus.publish`.
 *
 * Signature: flat, per REQ-014. `configureVault(deps, userSelectedPath): Result<...>`.
 * The in-memory Vault aggregate is NOT reconstituted inside this pipeline — the
 * next `loadVaultConfig` call will reconstitute it from persisted settings.
 * `validateAndTransitionVault` is exposed standalone (validate-and-transition.ts)
 * for unit-testability; the pipeline does not invoke it.
 *
 * Step order (REQ-013 budget table + ordering invariants):
 *   1. statDir       → on failure: return mapStatDirResult error, STOP
 *   2. settingsSave  → on failure: return mapSettingsSaveError, STOP
 *   3. clockNow      (at-most-once, only on success path)
 *   4. build VaultDirectoryConfigured event
 *   5. emit(event)   (exactly once on success path)
 *   6. return Ok(event)
 */

import type { Result } from "promptnotes-domain-types/util/result";
import type { VaultId, VaultPath, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { FsError, VaultConfigError } from "promptnotes-domain-types/shared/errors";
import type { VaultDirectoryConfigured } from "promptnotes-domain-types/shared/events";

import { mapStatDirResult } from "./map-stat-dir-result";
import { mapSettingsSaveError } from "./map-settings-save-error";

export type ConfigureVaultDeps = {
  readonly vaultId: VaultId;
  readonly statDir: (path: string) => Result<boolean, FsError>;
  readonly settingsSave: (path: VaultPath) => Result<void, FsError>;
  readonly clockNow: () => Timestamp;
  readonly emit: (event: VaultDirectoryConfigured) => void;
};

export type ConfigureVaultInput = {
  readonly userSelectedPath: VaultPath;
};

export function configureVault(
  deps: ConfigureVaultDeps,
  input: ConfigureVaultInput,
): Result<VaultDirectoryConfigured, VaultConfigError> {
  const pathStr = input.userSelectedPath as unknown as string;

  // Step 1: Validate path exists and is a directory
  const statResult = deps.statDir(pathStr);
  const statMapped = mapStatDirResult(statResult, pathStr);
  if (!statMapped.ok) {
    return { ok: false, error: statMapped.error };
  }

  // Step 2: Persist vault path to settings
  const saveResult = deps.settingsSave(input.userSelectedPath);
  if (!saveResult.ok) {
    return { ok: false, error: mapSettingsSaveError(saveResult.error, pathStr) };
  }

  // Step 3: Acquire timestamp (at-most-once, only on success path)
  const now = deps.clockNow();

  // Step 4: Build the public domain event
  const event: VaultDirectoryConfigured = {
    kind: "vault-directory-configured",
    vaultId: deps.vaultId,
    path: input.userSelectedPath,
    occurredOn: now,
  };

  // Step 5: Emit exactly once
  deps.emit(event);

  // Step 6: Return the event
  return { ok: true, value: event };
}
