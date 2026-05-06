// Block ↔ Markdown 変換 — Shared Kernel（純粋関数）。
//
// 由来:
//   - aggregates.md §1.6「Note ↔ Markdown の双方向変換」
//   - glossary.md §3 Vault Context（Markdown ↔ Block Conversion）
//   - workflows.md Workflow 10 BlockEdit / Workflow 11 hydrate / Workflow 2 serializeNote
//
// 純粋関数として ACL 層に置く。Vault の Hydration / 保存、Capture のコピー、
// Curate の検索はすべてこのペアを経由する。
//
// ラウンドトリップ性質:
//   - parseMarkdownToBlocks(serializeBlocksToMarkdown(b)) == b（Block ID は新規採番されるため、ID を除いた構造一致）
//   - serializeBlocksToMarkdown(parseMarkdownToBlocks(m)) ≈ m（外見上の差異は許容）
// 完全な byte 一致は保証しない（Obsidian 等の外部編集との共存のため）。
// 代わりに「意味上同値」を不変条件とする。

import type { Result } from "../util/result.js";
import type { Block } from "./note.js";

// ──────────────────────────────────────────────────────────────────────
// Block 解析エラー
// ──────────────────────────────────────────────────────────────────────

/** Markdown → Block[] 解析の失敗ケース。
 *
 * 注意: aggregates.md §1.5 invariant により「未知ブロックは paragraph で逃がす」方針のため、
 * BlockParseError は通常の Markdown 解析では発生しない。構造的破綻ケース
 * （例：YAML frontmatter 直後の本文が解析不能、ファイル終端で閉じ忘れの code fence 等）
 * のみ報告する。Vault Hydration では HydrationFailureReason "block-parse" として扱われ、
 * 該当ファイルは corruptedFiles に分類される。
 */
export type BlockParseError =
  | { kind: "unterminated-code-fence"; line: number }
  | { kind: "malformed-structure"; line: number; detail: string };

// ──────────────────────────────────────────────────────────────────────
// 純粋関数シグネチャ
// ──────────────────────────────────────────────────────────────────────

/** Block 列を Markdown 文字列に直列化する（純粋関数）。
 * Vault への保存・クリップボードコピー・検索の入力として利用。 */
export interface SerializeBlocksToMarkdown {
  (blocks: ReadonlyArray<Block>): string;
}

/** Markdown 文字列を Block 列に解析する（純粋関数）。
 * 既知の構造のみ厳格に解析し、未知ブロックは paragraph 化で逃がす。
 * 構造的に破綻したケースのみ BlockParseError を返す。 */
export interface ParseMarkdownToBlocks {
  (markdown: string): Result<ReadonlyArray<Block>, BlockParseError>;
}
