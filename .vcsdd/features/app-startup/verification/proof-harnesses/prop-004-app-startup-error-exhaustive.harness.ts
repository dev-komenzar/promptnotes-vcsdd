/**
 * PROP-004 検証ハーネス — Phase 5 形式的強化
 *
 * 証明義務: AppStartupError 型は 'config' または 'scan' の kind のみを持つ。
 * 新しいバリアントが追加された場合、switch の never 分岐がコンパイルエラーになる。
 *
 * Tier 0 (TypeScript 型レベル証明 + never ブランチ)
 * required: true
 *
 * 実装: 型レベルの switch 網羅性チェック。never ブランチが到達可能になった場合、
 * コンパイラが "型 'X' を型 'never' に割り当てることはできません" エラーを発生させる。
 */

import { test, expect } from "bun:test";
import type { AppStartupError } from "$lib/domain/app-startup/errors";

// ── Tier 0: 型レベル網羅性証明 ────────────────────────────────────────────

/**
 * 網羅性チェック関数: AppStartupError の全バリアントを switch でハンドルする。
 * 未ハンドルのバリアントが存在する場合、`_: never` への代入がコンパイルエラーになる。
 *
 * PROP-004: 現在の AppStartupError は { kind: 'config' } | { kind: 'scan' } のみ。
 * 第 3 のバリアント (例: { kind: 'network' }) が追加されると、
 * この関数のコンパイルが失敗し、PROP-004 違反を Tier-0 Red として検出できる。
 */
function assertAppStartupErrorExhaustive(e: AppStartupError): string {
  switch (e.kind) {
    case "config":
      // 設定エラー: unconfigured / path-not-found / permission-denied
      return `config:${e.reason.kind}`;
    case "scan":
      // スキャンエラー: list-failed
      return `scan:${e.reason.kind}`;
    default: {
      // never ブランチ: 新しい kind バリアントが追加された場合、
      // e は never 型ではなくなり、この代入がコンパイルエラーになる。
      const _exhaustiveCheck: never = e;
      return _exhaustiveCheck;
    }
  }
}

// ── ランタイム検証: 両バリアントが正しくハンドルされること ─────────────────

test("PROP-004: AppStartupError 'config/unconfigured' が正しくハンドルされる", () => {
  const e: AppStartupError = { kind: "config", reason: { kind: "unconfigured" } };
  const result = assertAppStartupErrorExhaustive(e);
  expect(result).toBe("config:unconfigured");
});

test("PROP-004: AppStartupError 'config/path-not-found' が正しくハンドルされる", () => {
  const e: AppStartupError = {
    kind: "config",
    reason: { kind: "path-not-found", path: "/missing/vault" },
  };
  const result = assertAppStartupErrorExhaustive(e);
  expect(result).toBe("config:path-not-found");
});

test("PROP-004: AppStartupError 'config/permission-denied' が正しくハンドルされる", () => {
  const e: AppStartupError = {
    kind: "config",
    reason: { kind: "permission-denied", path: "/no-access/vault" },
  };
  const result = assertAppStartupErrorExhaustive(e);
  expect(result).toBe("config:permission-denied");
});

test("PROP-004: AppStartupError 'scan/list-failed' が正しくハンドルされる", () => {
  const e: AppStartupError = {
    kind: "scan",
    reason: { kind: "list-failed", detail: "EACCES" },
  };
  const result = assertAppStartupErrorExhaustive(e);
  expect(result).toBe("scan:list-failed");
});

test("PROP-004: AppStartupError の kind は 'config' または 'scan' の 2 種類のみ", () => {
  // ランタイムで kind 値のセットが仕様通りであることを確認する。
  // 型レベルの制約は上記の assertAppStartupErrorExhaustive がコンパイル時に保証する。

  const configError: AppStartupError = {
    kind: "config",
    reason: { kind: "unconfigured" },
  };
  const scanError: AppStartupError = {
    kind: "scan",
    reason: { kind: "list-failed", detail: "test" },
  };

  // 両バリアントが存在すること
  expect(configError.kind).toBe("config");
  expect(scanError.kind).toBe("scan");

  // 'config' と 'scan' の 2 種類だけを網羅する関数が正常にコンパイル済み（型レベル証明済み）
  const kinds = ["config", "scan"] as const;
  expect(kinds).toHaveLength(2);
});

// ── 型レベル補助アサーション ─────────────────────────────────────────────

// AppStartupError の kind を union として抽出し、
// 'config' | 'scan' と同じであることを型レベルで検証する。
type AppStartupErrorKind = AppStartupError["kind"];

// Tier 0 コンパイル時チェック: 'config' は AppStartupErrorKind に代入可能でなければならない
const _configKind: AppStartupErrorKind = "config";
void _configKind;

// Tier 0 コンパイル時チェック: 'scan' は AppStartupErrorKind に代入可能でなければならない
const _scanKind: AppStartupErrorKind = "scan";
void _scanKind;

// 型ユーティリティ: T が never の場合 true
type IsNever<T> = [T] extends [never] ? true : false;

// 'config' | 'scan' 以外の kind が存在しないことの型レベル証明。
// 例えば 'network' を AppStartupError union に追加すると
// Exclude<AppStartupErrorKind, 'config' | 'scan'> は 'network' になり、
// IsNever<...> が false になってこの代入がコンパイルエラーになる。
type _ExtraKinds = Exclude<AppStartupErrorKind, "config" | "scan">;
const _noExtraKinds: IsNever<_ExtraKinds> = true;
void _noExtraKinds;
