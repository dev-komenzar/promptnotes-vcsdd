/**
 * validate-and-transition.ts — Pure vault aggregate state transition helper.
 *
 * REQ-008: (VaultId, VaultPath, Timestamp) → Vault in Ready status.
 * Pure, deterministic, no I/O, no ports.
 * PROP-CV-004: This function is formally verifiable as pure (Tier 1).
 *
 * Mirrors Rust vault/aggregate.rs lines 16-22.
 */

import type { VaultId, VaultPath, Timestamp } from "promptnotes-domain-types/shared/value-objects";

// ── Vault aggregate type mirror (matches Rust aggregate.rs) ──────────────────

export type VaultStatusReady = {
  readonly kind: "Ready";
  readonly path: VaultPath;
  readonly last_scanned_at: Timestamp | null;
};

export type VaultStatusUnconfigured = {
  readonly kind: "Unconfigured";
};

export type VaultStatus = VaultStatusReady | VaultStatusUnconfigured;

export type Vault = {
  readonly id: VaultId;
  readonly status: VaultStatus;
};

// ── REQ-008: Pure state transition ───────────────────────────────────────────

/**
 * Pure transition: given a vaultId, a user-selected path, and the current
 * timestamp, return the vault aggregate in Ready status with last_scanned_at
 * set to null (first-time configure invariant).
 *
 * Does NOT accept a prior Vault parameter (FIND-001). Any (vaultId, path, now)
 * produces Ready — there is no previous-state guard.
 */
export function validateAndTransitionVault(
  vaultId: VaultId,
  path: VaultPath,
  _now: Timestamp,
): Vault {
  return {
    id: vaultId,
    status: {
      kind: "Ready",
      path,
      last_scanned_at: null,
    },
  };
}
