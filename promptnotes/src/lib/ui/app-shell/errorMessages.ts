/**
 * errorMessages.ts — REQ-005, REQ-007, PROP-003
 *
 * Pure functions: map domain error variants → Japanese UI messages.
 * Exhaustive switches enforce compile-time coverage of all variants.
 *
 * Purity boundary: PURE CORE — deterministic, no side effects.
 */

import type { VaultPathError } from "promptnotes-domain-types/shared/value-objects";
import type { VaultConfigError } from "promptnotes-domain-types/shared/errors";

// ── mapVaultPathError ─────────────────────────────────────────────────────

/**
 * REQ-005 / PROP-003: Exhaustive mapping over VaultPathError variants.
 * TypeScript enforces coverage — adding a variant without updating this
 * switch causes a compile error.
 */
export function mapVaultPathError(error: VaultPathError): string {
  switch (error.kind) {
    case "empty":
      return "フォルダを選択してください";
    case "not-absolute":
      return "絶対パスを指定してください";
    default: {
      const _exhaustive: never = error;
      return `不明なエラー: ${(_exhaustive as { kind: string }).kind}`;
    }
  }
}

// ── mapVaultConfigError ───────────────────────────────────────────────────

/**
 * REQ-007: Maps VaultConfigError to Japanese startup-error modal messages.
 */
export function mapVaultConfigError(error: VaultConfigError): string {
  switch (error.kind) {
    case "unconfigured":
      return "Vault フォルダが設定されていません";
    case "path-not-found":
      return "設定したフォルダが見つかりません。再設定するか、フォルダを復元してください";
    case "permission-denied":
      return "フォルダへのアクセス権限がありません";
    default: {
      const _exhaustive: never = error;
      return `不明なエラー: ${(_exhaustive as { kind: string }).kind}`;
    }
  }
}
