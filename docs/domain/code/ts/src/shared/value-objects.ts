// Shared Kernel — Value Objects.
// ★ 真実は Rust 側 (rust/src/value_objects.rs)。本ファイルは ts-rs 生成相当の手書きミラー。
//
// 由来:
//   - glossary.md §0 (Shared Kernel)
//   - aggregates.md §1 Note Aggregate / §4 Vault Aggregate
//
// DMMF: Simple 型は brand + Smart Constructor。
// Smart Constructor の検証ロジックは Rust 側で行われ、
// TypeScript からは ts-rs 経由で受け取った値の型ナローイングのために使う。

import type { Brand } from "../util/branded.js";
import type { Result } from "../util/result.js";

// ──────────────────────────────────────────────────────────────────────
// NoteId
// ──────────────────────────────────────────────────────────────────────

export type NoteId = Brand<string, "NoteId">;
export type NoteIdError = { kind: "invalid-format" };

export interface NoteIdSmartCtor {
  /** 形式 `YYYY-MM-DD-HHmmss-SSS[-N]` を検証する。 */
  tryNew(raw: string): Result<NoteId, NoteIdError>;
}

// ──────────────────────────────────────────────────────────────────────
// Timestamp
// ──────────────────────────────────────────────────────────────────────

export type Timestamp = Brand<{ readonly epochMillis: number }, "Timestamp">;
export type TimestampError = { kind: "negative" };

export interface TimestampSmartCtor {
  tryFromEpochMillis(ms: number): Result<Timestamp, TimestampError>;
}

// ──────────────────────────────────────────────────────────────────────
// Tag
// ──────────────────────────────────────────────────────────────────────

export type Tag = Brand<string, "Tag">;
export type TagError = { kind: "empty" } | { kind: "only-whitespace" };

export interface TagSmartCtor {
  /** 正規化（小文字化・先頭 `#` 除去・trim）してから検証。 */
  tryNew(raw: string): Result<Tag, TagError>;
}

// ──────────────────────────────────────────────────────────────────────
// Body
// ──────────────────────────────────────────────────────────────────────

export type Body = Brand<string, "Body">;

export interface BodyApi {
  /** Body は内容に対して制約を持たない（空文字も許容、空判定は別 API）。 */
  fromString(raw: string): Body;
  /** aggregates.md §1 不変条件 4: trim 後に空であれば「空ノート」。 */
  isEmptyAfterTrim(body: Body): boolean;
}

// ──────────────────────────────────────────────────────────────────────
// Frontmatter
// ──────────────────────────────────────────────────────────────────────

/** YAML frontmatter（MVP 固定スキーマ）。glossary.md §0 */
export type Frontmatter = Brand<
  {
    readonly tags: readonly Tag[];
    readonly createdAt: Timestamp;
    readonly updatedAt: Timestamp;
  },
  "Frontmatter"
>;

export type FrontmatterError =
  | { kind: "updated-before-created" }
  | { kind: "duplicate-tag"; tag: Tag };

export interface FrontmatterSmartCtor {
  tryNew(input: {
    tags: readonly Tag[];
    createdAt: Timestamp;
    updatedAt: Timestamp;
  }): Result<Frontmatter, FrontmatterError>;
}

/** 部分更新指示。aggregates.md §1 editFrontmatter */
export type FrontmatterPatch =
  | { kind: "replace-tags"; tags: readonly Tag[] }
  | { kind: "add-tag"; tag: Tag }
  | { kind: "remove-tag"; tag: Tag };

// ──────────────────────────────────────────────────────────────────────
// VaultPath / VaultId
// ──────────────────────────────────────────────────────────────────────

export type VaultPath = Brand<string, "VaultPath">;
export type VaultPathError = { kind: "empty" } | { kind: "not-absolute" };

export interface VaultPathSmartCtor {
  tryNew(raw: string): Result<VaultPath, VaultPathError>;
}

export type VaultId = Brand<string, "VaultId">;

export interface VaultIdApi {
  singleton(): VaultId;
}
