// Note Aggregate — Shared Kernel.
//
// 由来:
//   - aggregates.md §1 Note Aggregate（Markdown 単一本文モデル）
//   - glossary.md §0 (Shared Kernel)
//
// Note の構成は `id` + `body: string` + `frontmatter`。
//
// 操作群（create / editBody / editFrontmatter / addTag / removeTag）は純粋関数として
// 表現する。呼び出し元 Context により発行 Event の意味は変わる（aggregates.md §1 公開操作 表）。

import type { Result } from "../util/result.js";
import type { FrontmatterError, TagError } from "./value-objects.js";
import type {
  Frontmatter,
  FrontmatterPatch,
  NoteId,
  Tag,
  Timestamp,
} from "./value-objects.js";

// ──────────────────────────────────────────────────────────────────────
// Note Aggregate Root
// ──────────────────────────────────────────────────────────────────────

export type Note = {
  readonly id: NoteId;
  /** 本文（Markdown 文字列）。 */
  readonly body: string;
  readonly frontmatter: Frontmatter;
};

// ──────────────────────────────────────────────────────────────────────
// 公開操作（Command メソッド相当の純粋関数群）
// 型シグネチャのみ。実装は本ファイルに含めない（Phase 11+）。
// すべて不変 Note インスタンスを返す（aggregates.md §1）。
// ──────────────────────────────────────────────────────────────────────

export interface NoteOps {
  /** 空ノート生成。`body = ""`、createdAt = updatedAt = now。
   * 発行 Event: NewNoteAutoCreated。 */
  create(id: NoteId, now: Timestamp): Note;

  /** body を更新。`updatedAt = now`。
   * 発行 Event: NoteBodyEdited（Internal）／永続化時 NoteAutoSaved*。 */
  editBody(note: Note, body: string, now: Timestamp): Note;

  // ── Frontmatter / Tag 操作 ──

  /**
   * Frontmatter の部分更新。
   * Capture 内 inline 編集 / Curate のタグチップ操作の双方が呼ぶ。
   * tag 重複や時刻整合などの不変条件は Frontmatter VO 構築失敗として返る。
   */
  editFrontmatter(
    note: Note,
    patch: FrontmatterPatch,
    now: Timestamp,
  ): Result<Note, NoteEditError>;

  /** タグ追加（重複は idempotent）。 */
  addTag(note: Note, tag: Tag, now: Timestamp): Result<Note, NoteEditError>;

  /** タグ削除（不在は idempotent）。 */
  removeTag(note: Note, tag: Tag, now: Timestamp): Note;

  // ── 派生・問い合わせ ──

  /** Note が「空ノート」かを判定（Capture の破棄判断用）。
   * 定義: body が空文字列または空白のみ。 */
  isEmpty(note: Note): boolean;

  /** クリップボード用に body を文字列で返す（frontmatter 除外）。 */
  bodyForClipboard(note: Note): string;
}

// ──────────────────────────────────────────────────────────────────────
// エラー型
// ──────────────────────────────────────────────────────────────────────

export type NoteEditError =
  | { kind: "frontmatter"; reason: FrontmatterError }
  | { kind: "tag"; reason: TagError };
