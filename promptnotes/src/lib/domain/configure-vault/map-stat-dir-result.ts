/**
 * map-stat-dir-result.ts — Pure statDir result collapse helper.
 *
 * REQ-002 / REQ-003 / REQ-004 / REQ-005
 * PROP-CV-001: Pure (Tier 1)
 * PROP-CV-002: Complete 7-case collapse rule (Tier 1)
 *
 * Collapse rule:
 *   Ok(true)                → Ok(void)
 *   Ok(false)               → Err(path-not-found)
 *   Err(not-found)          → Err(path-not-found)
 *   Err(permission)         → Err(permission-denied)
 *   Err(disk-full|lock|unknown) → Err(path-not-found)
 */

import type { Result } from "promptnotes-domain-types/util/result";
import type { FsError, VaultConfigError } from "promptnotes-domain-types/shared/errors";

export function mapStatDirResult(
  statResult: Result<boolean, FsError>,
  pathStr: string,
): Result<void, VaultConfigError> {
  if (statResult.ok) {
    if (statResult.value) {
      return { ok: true, value: undefined };
    }
    return { ok: false, error: { kind: "path-not-found", path: pathStr } };
  }

  if (statResult.error.kind === "permission") {
    return { ok: false, error: { kind: "permission-denied", path: pathStr } };
  }

  return { ok: false, error: { kind: "path-not-found", path: pathStr } };
}
