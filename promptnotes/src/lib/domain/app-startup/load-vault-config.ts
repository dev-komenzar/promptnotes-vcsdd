// app-startup/load-vault-config.ts
// Step 1: Load and validate vault configuration.
//
// REQ-001: Happy path — loads VaultPath and verifies directory existence.
// REQ-003: Unconfigured — Settings.load() returns null → Err config/unconfigured.
// REQ-004: PathNotFound — statDir returns Ok(false) or Err(not-found).
// REQ-005: PermissionDenied — statDir returns Err(permission).
// REQ-006: null Settings.load maps to Unconfigured (not PathNotFound).
// PROP-014: VaultDirectoryNotConfigured emitted exactly once on Unconfigured.
// PROP-016: Happy-path emits NO domain event.

import type { Result } from "promptnotes-domain-types/util/result";
import type { VaultPath } from "promptnotes-domain-types/shared/value-objects";
import type { AppStartupError, FsError } from "promptnotes-domain-types/shared/errors";
import type { ConfiguredVault } from "./stages.js";

// ── Port definitions ────────────────────────────────────────────────────────

/**
 * Dependencies injected into loadVaultConfig.
 * All ports are synchronous pure-returning functions; async boundary is the
 * function itself (returns Promise for Tauri command compatibility).
 */
export type LoadVaultConfigPorts = {
  /** Read persisted vault path from settings store. Never throws. */
  readonly settingsLoad: () => Result<VaultPath | null, never>;
  /** Stat the given path; Ok(true) means it is a directory that exists. */
  readonly statDir: (path: string) => Result<boolean, FsError>;
  /** Emit a domain event to the application event bus. */
  readonly emit: (event: { kind: string; [k: string]: unknown }) => void;
};

// ── Implementation ─────────────────────────────────────────────────────────

/**
 * Step 1 of the AppStartup pipeline.
 *
 * Purity boundary: this function itself is effectful (reads settings, stats
 * the filesystem, emits events). The decision logic is kept linear and
 * deterministic given the port return values.
 */
export async function loadVaultConfig(
  ports: LoadVaultConfigPorts
): Promise<Result<ConfiguredVault, AppStartupError>> {
  const settingsResult = ports.settingsLoad();
  // settingsLoad returns Result<VaultPath | null, never>, always Ok.
  if (!settingsResult.ok) {
    // Never branch — settingsLoad error type is `never`.
    return { ok: false, error: settingsResult.error };
  }
  const vaultPath = settingsResult.value;

  // REQ-006 / REQ-003: null path → unconfigured (never PathNotFound).
  if (vaultPath === null) {
    // PROP-014: emit VaultDirectoryNotConfigured exactly once.
    ports.emit({
      kind: "vault-directory-not-configured",
      occurredOn: { epochMillis: Date.now() },
    });
    return {
      ok: false,
      error: { kind: "config", reason: { kind: "unconfigured" } },
    };
  }

  // REQ-001: non-null path — verify directory existence via statDir port.
  const pathStr = vaultPath as unknown as string;
  const statResult = ports.statDir(pathStr);

  if (statResult.ok) {
    if (statResult.value) {
      // PROP-016: happy path emits no events.
      return {
        ok: true,
        value: { kind: "ConfiguredVault", vaultPath },
      };
    } else {
      // Ok(false) — path exists but is not a directory, treat as not-found.
      return {
        ok: false,
        error: {
          kind: "config",
          reason: { kind: "path-not-found", path: pathStr },
        },
      };
    }
  } else {
    // statDir returned Err — classify by FsError kind.
    const fsKind = statResult.error.kind;
    if (fsKind === "permission") {
      return {
        ok: false,
        error: {
          kind: "config",
          reason: { kind: "permission-denied", path: pathStr },
        },
      };
    } else {
      // All other FsError kinds (not-found, disk-full, lock, unknown) map to
      // path-not-found as the safe default per verification-architecture.md.
      return {
        ok: false,
        error: {
          kind: "config",
          reason: { kind: "path-not-found", path: pathStr },
        },
      };
    }
  }
}
