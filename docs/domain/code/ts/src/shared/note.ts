// Note Aggregate — Shared Kernel.
//
// 由来:
//   - aggregates.md §1 Note Aggregate
//   - glossary.md §0 (Shared Kernel) / §4 (Note は 3 Context にまたがる)
//
// Note の操作（create / editBody / editFrontmatter / addTag / removeTag）は
// 純粋関数として表現する。呼び出し元 Context により発行 Event の意味は変わる。
// （aggregates.md §1 公開操作 表）

import type { Result } from "../util/result.js";
import type { FrontmatterError, TagError } from "./value-objects.js";
import type {
  Body,
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
  readonly body: Body;
  readonly frontmatter: Frontmatter;
};

// ──────────────────────────────────────────────────────────────────────
// 公開操作（Command メソッド相当の純粋関数群）
// 型シグネチャのみ。実装は本ファイルに含めない（Phase 11+）。
// ──────────────────────────────────────────────────────────────────────

export interface NoteOps {
  /** 空ノート生成。createdAt = updatedAt = now。発行 Event: NewNoteAutoCreated。 */
  create(id: NoteId, now: Timestamp): Note;

  /** 本文更新。updatedAt = now。 */
  editBody(note: Note, body: Body, now: Timestamp): Note;

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

  /** body が空白のみか判定（Capture の破棄判断用）。 */
  isEmpty(note: Note): boolean;

  /** クリップボード用に body のみを返す（frontmatter 除外）。 */
  bodyForClipboard(note: Note): string;
}

export type NoteEditError =
  | { kind: "frontmatter"; reason: FrontmatterError }
  | { kind: "tag"; reason: TagError };
