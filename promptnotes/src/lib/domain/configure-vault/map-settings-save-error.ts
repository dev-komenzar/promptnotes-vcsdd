/**
 * map-settings-save-error.ts — Pure Settings.save FsError collapse helper.
 *
 * REQ-006: FsError(permission) → permission-denied
 * REQ-007: FsError(disk-full|lock|unknown|not-found) → path-not-found
 * PROP-CV-003: Complete 5-variant collapse rule (Tier 1)
 * PROP-CV-013: Permission specifically maps to permission-denied, not path-not-found.
 * PROP-CV-014: disk-full maps to path-not-found, not permission-denied.
 *
 * Signature takes a pathStr second arg so the resulting VaultConfigError
 * carries the correct path for display (matches test assertions).
 */

import type { FsError, VaultConfigError } from "promptnotes-domain-types/shared/errors";

export function mapSettingsSaveError(fsError: FsError, pathStr: string): VaultConfigError {
  if (fsError.kind === "permission") {
    return { kind: "permission-denied", path: pathStr };
  }
  return { kind: "path-not-found", path: pathStr };
}
