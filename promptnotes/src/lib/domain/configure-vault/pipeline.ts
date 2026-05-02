/**
 * pipeline.ts — ConfigureVault orchestration pipeline.
 *
 * REQ-001 through REQ-014: Full configure-vault use case.
 * FIND-005: Synchronous return — no Promise wrapper.
 * FIND-006: Port name is `emit`, not `EventBus.publish`.
 *
 * Step order (REQ-013 budget table + ordering invariants):
 *   1. statDir       → on failure: return mapStatDirResult error, STOP
 *   2. settingsSave  → on failure: return mapSettingsSaveError, STOP
 *   3. clockNow      (at-most-once, only on success path)
 *   4. validateAndTransitionVault (pure; result not published)
 *   5. build VaultDirectoryConfigured event
 *   6. emit(event)   (exactly once on success path)
 *   7. return Ok(event)
 */

import type { Result } from "promptnotes-domain-types/util/result";
import type { VaultId, VaultPath, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { FsError, VaultConfigError } from "promptnotes-domain-types/shared/errors";
import type { VaultDirectoryConfigured } from "promptnotes-domain-types/shared/events";

import { mapStatDirResult } from "./map-stat-dir-result";
import { mapSettingsSaveError } from "./map-settings-save-error";
import { validateAndTransitionVault } from "./validate-and-transition";

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
): (input: ConfigureVaultInput) => Result<VaultDirectoryConfigured, VaultConfigError> {
  return (input: ConfigureVaultInput): Result<VaultDirectoryConfigured, VaultConfigError> => {
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

    // Step 4: Pure aggregate transition (result not published — internal invariant check)
    validateAndTransitionVault(deps.vaultId, input.userSelectedPath, now);

    // Step 5: Build the public domain event
    const event: VaultDirectoryConfigured = {
      kind: "vault-directory-configured",
      vaultId: deps.vaultId,
      path: input.userSelectedPath,
      occurredOn: now,
    };

    // Step 6: Emit exactly once
    deps.emit(event);

    // Step 7: Return the event
    return { ok: true, value: event };
  };
}
