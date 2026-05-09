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
// Block 系 VO（aggregates.md §1 Note Aggregate / Block Sub-entity, glossary.md §0）
// ──────────────────────────────────────────────────────────────────────

/** Note 内ローカルな安定 ID。並べ替え・差分計算用。永続化時は Markdown に直列化されるため
 * ファイル上には現れず、再読み込み時に再採番される。形式は実装詳細（UUID v4 or `block-<n>`）。 */
export type BlockId = Brand<string, "BlockId">;
export type BlockIdError = { kind: "invalid-format" } | { kind: "empty" };

export interface BlockIdSmartCtor {
  tryNew(raw: string): Result<BlockId, BlockIdError>;
  /** Note Aggregate 内で衝突しない新 ID を採番。実装側は uuid v4 か単調増加の `block-<n>`。 */
  generate(): BlockId;
}

/** Block 種別の MVP セット。aggregates.md §1 BlockType。
 * 拡張（チェックリスト・テーブル・埋め込み・ネスト）は MVP 範囲外。 */
export type BlockType =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "bullet"
  | "numbered"
  | "code"
  | "quote"
  | "divider";

export type BlockTypeError = { kind: "unknown-type"; raw: string };

export interface BlockTypeSmartCtor {
  tryNew(raw: string): Result<BlockType, BlockTypeError>;
}

/** Block 内のインラインテキスト。インライン Markdown（**bold**, `code`, [link](url)）を保持可能。
 * 制御文字は拒否。改行は除去（複数行はブロック分割で表現）。
 * `code` ブロック専用バリアントは内部で複数行を許容する（aggregates.md §1）。 */
export type BlockContent = Brand<string, "BlockContent">;
export type BlockContentError =
  | { kind: "control-character" }
  | { kind: "newline-in-inline" }
  | { kind: "too-long"; max: number };

export interface BlockContentSmartCtor {
  /** 通常の Block 用：制御文字拒否・改行除去（複数行は `splitBlock` で表現）。 */
  tryNew(raw: string): Result<BlockContent, BlockContentError>;
  /** `code` ブロック専用：制御文字（タブ・改行）は許容。 */
  tryNewMultiline(raw: string): Result<BlockContent, BlockContentError>;
  /** 中身が空かどうか。`note.isEmpty()` の判定に利用。 */
  isEmpty(content: BlockContent): boolean;
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
