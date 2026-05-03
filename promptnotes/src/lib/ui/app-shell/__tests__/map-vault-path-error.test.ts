/**
 * map-vault-path-error.test.ts — REQ-005, PROP-003
 *
 * REQ-005: Vault 設定モーダル — VaultPathError 変換後のエラー表示
 *   - VaultPathError.kind === 'empty' → 「フォルダを選択してください」
 *   - VaultPathError.kind === 'not-absolute' → 「絶対パスを指定してください」
 *   - TypeScript exhaustive switch: new variant causes compile error
 *
 * PROP-003: 全 VaultPathError variant に UI メッセージマッピングが存在する（網羅性）
 *   Tier 0: exhaustive switch compile-time guarantee
 *   Tier 1: runtime confirmation of all variants
 *
 * RED PHASE: imports below MUST fail — module does not exist yet.
 */

import { describe, test, expect } from "bun:test";
import type { VaultPathError } from "promptnotes-domain-types/shared/value-objects";

// RED PHASE: This import MUST FAIL — module does not exist yet.
import {
  mapVaultPathError,
  mapVaultConfigError,
} from "$lib/ui/app-shell/errorMessages";

// ── PROP-003: mapVaultPathError exhaustive mapping ────────────────────────────

describe("PROP-003: mapVaultPathError is exhaustive over all VaultPathError variants", () => {
  test("PROP-003: 'empty' variant maps to 「フォルダを選択してください」", () => {
    const err: VaultPathError = { kind: "empty" };
    expect(mapVaultPathError(err)).toBe("フォルダを選択してください");
  });

  test("PROP-003: 'not-absolute' variant maps to 「絶対パスを指定してください」", () => {
    const err: VaultPathError = { kind: "not-absolute" };
    expect(mapVaultPathError(err)).toBe("絶対パスを指定してください");
  });

  test("PROP-003: returns a non-empty string for every VaultPathError variant", () => {
    const variants: VaultPathError[] = [
      { kind: "empty" },
      { kind: "not-absolute" },
    ];
    for (const v of variants) {
      const msg = mapVaultPathError(v);
      expect(typeof msg).toBe("string");
      expect(msg.length).toBeGreaterThan(0);
    }
  });

  // EC-04: empty string submission → Empty variant message
  test("EC-04: empty string → VaultPathError.Empty → 「フォルダを選択してください」", () => {
    const err: VaultPathError = { kind: "empty" };
    expect(mapVaultPathError(err)).toBe("フォルダを選択してください");
  });

  // EC-05: whitespace-only → after trim → Empty variant message
  test("EC-05: whitespace-only input → VaultPathError.Empty (same message as EC-04)", () => {
    // Whitespace is trimmed Rust-side to empty → Empty variant
    const err: VaultPathError = { kind: "empty" };
    expect(mapVaultPathError(err)).toBe("フォルダを選択してください");
  });

  // Relative path → NotAbsolute variant
  test("relative path input → VaultPathError.NotAbsolute → 「絶対パスを指定してください」", () => {
    const err: VaultPathError = { kind: "not-absolute" };
    expect(mapVaultPathError(err)).toBe("絶対パスを指定してください");
  });
});

// ── PROP-003 (Tier 0): Compile-time exhaustiveness ───────────────────────────

describe("PROP-003 (Tier 0): exhaustive switch compiles without error", () => {
  test("exhaustive switch over VaultPathError has never fallthrough at compile time", () => {
    // This test exists purely to confirm the exhaustive switch compiles.
    // At runtime it always passes; TS enforces exhaustiveness.
    function handleExhaustive(e: VaultPathError): string {
      switch (e.kind) {
        case "empty":
          return "empty-msg";
        case "not-absolute":
          return "not-absolute-msg";
        default: {
          const _exhaustive: never = e;
          return `unknown:${(_exhaustive as { kind: string }).kind}`;
        }
      }
    }

    expect(handleExhaustive({ kind: "empty" })).toBe("empty-msg");
    expect(handleExhaustive({ kind: "not-absolute" })).toBe("not-absolute-msg");
  });
});

// ── mapVaultConfigError exhaustive mapping ───────────────────────────────────

describe("REQ-007: mapVaultConfigError covers path-not-found and permission-denied", () => {
  test("'path-not-found' maps to 「設定したフォルダが見つかりません。再設定するか、フォルダを復元してください」", () => {
    const msg = mapVaultConfigError({ kind: "path-not-found", path: "/vault" });
    expect(msg).toBe("設定したフォルダが見つかりません。再設定するか、フォルダを復元してください");
  });

  test("'permission-denied' maps to 「フォルダへのアクセス権限がありません」", () => {
    const msg = mapVaultConfigError({ kind: "permission-denied", path: "/vault" });
    expect(msg).toBe("フォルダへのアクセス権限がありません");
  });
});
