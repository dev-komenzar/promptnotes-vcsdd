// Note Aggregate — Shared Kernel.
//
// 由来:
//   - aggregates.md §1 Note Aggregate（ブロックベース WYSIWYG モデル）
//   - glossary.md §0 (Shared Kernel) / §6 (Block も Shared Kernel)
//
// Note の構成は `id` + `blocks: Block[]` + `frontmatter`。
// `body: Body` は `serializeBlocksToMarkdown(blocks)` の派生プロパティとして
// `NoteOps.body(note)` 経由で取得する（TS の record 型では getter を持てないため
// namespace 関数として表現）。
//
// 操作群（create / editBlockContent / insertBlockAfter / ... / editFrontmatter /
// addTag / removeTag）は純粋関数として表現する。呼び出し元 Context により
// 発行 Event の意味は変わる（aggregates.md §1 公開操作 表）。

import type { Result } from "../util/result.js";
import type {
  BlockContentError,
  BlockIdError,
  BlockTypeError,
  FrontmatterError,
  TagError,
} from "./value-objects.js";
import type {
  BlockContent,
  BlockId,
  BlockType,
  Body,
  Frontmatter,
  FrontmatterPatch,
  NoteId,
  Tag,
  Timestamp,
} from "./value-objects.js";

// ──────────────────────────────────────────────────────────────────────
// Block Sub-entity（aggregates.md §1 Block）
// ──────────────────────────────────────────────────────────────────────

/** Note Aggregate 内に閉じる Sub-entity。独立した Aggregate ではない
 * （ライフサイクルは親 Note と一蓮托生、永続化単位も親 Note 単位）。
 * 不変条件:
 *   1. id は Note 内で一意
 *   2. content は BlockType に応じた制約を満たす（divider は空、code は複数行可、他は単一行）
 *   3. Note は最低 1 ブロックを保持（最後の 1 ブロックは削除不可、空 paragraph に置換）
 */
export type Block = {
  readonly id: BlockId;
  readonly type: BlockType;
  readonly content: BlockContent;
};

// ──────────────────────────────────────────────────────────────────────
// Note Aggregate Root（blocks ベース）
// ──────────────────────────────────────────────────────────────────────

export type Note = {
  readonly id: NoteId;
  /** 本文を構成するブロックの順序付き列。各ブロックは独立した編集単位。
   * 不変条件: 必ず 1 件以上（空 Note は `[empty paragraph]` で表現）。 */
  readonly blocks: ReadonlyArray<Block>;
  readonly frontmatter: Frontmatter;
};

// ──────────────────────────────────────────────────────────────────────
// 公開操作（Command メソッド相当の純粋関数群）
// 型シグネチャのみ。実装は本ファイルに含めない（Phase 11+）。
// すべて不変 Note インスタンスを返す（aggregates.md §1）。
// ──────────────────────────────────────────────────────────────────────

export interface NoteOps {
  /** 空ノート生成。`blocks = [empty paragraph]`、createdAt = updatedAt = now。
   * 発行 Event: NewNoteAutoCreated。 */
  create(id: NoteId, now: Timestamp): Note;

  // ── Block 操作群（aggregates.md §1 Block 操作） ──

  /** 指定ブロックの content を更新。updatedAt = now。
   * 発行 Event: BlockContentEdited（Internal）／永続化時 NoteAutoSaved*。 */
  editBlockContent(
    note: Note,
    blockId: BlockId,
    content: BlockContent,
    now: Timestamp,
  ): Result<Note, NoteEditError>;

  /** 指定ブロックの直後に新規ブロック挿入（Enter キー相当）。
   * 発行 Event: BlockInserted。 */
  insertBlockAfter(
    note: Note,
    prevBlockId: BlockId,
    type: BlockType,
    content: BlockContent,
    now: Timestamp,
  ): Result<Note, NoteEditError>;

  /** 先頭に新規ブロック挿入。 */
  insertBlockAtBeginning(
    note: Note,
    type: BlockType,
    content: BlockContent,
    now: Timestamp,
  ): Note;

  /** ブロック削除。最後の 1 ブロックは削除不可（空 paragraph に置換される）。
   * 発行 Event: BlockRemoved。 */
  removeBlock(note: Note, blockId: BlockId, now: Timestamp): Result<Note, NoteEditError>;

  /** 行頭 Backspace 相当：前ブロックと content を結合し、自身を削除。
   * 先頭ブロックでは no-op（または block-not-found）。
   * 発行 Event: BlocksMerged。 */
  mergeBlockWithPrevious(
    note: Note,
    blockId: BlockId,
    now: Timestamp,
  ): Result<Note, NoteEditError>;

  /** テキスト中央 Enter 相当：offset で content を 2 分し、後半を新規 paragraph
   * として直後に挿入。発行 Event: BlockSplit。 */
  splitBlock(
    note: Note,
    blockId: BlockId,
    offset: number,
    now: Timestamp,
  ): Result<Note, NoteEditError>;

  /** 種別変換（`# ` 入力で heading-1 へ等）。content は保持（型制約に応じて
   * 再検証されるため、code → paragraph 等で複数行の場合はエラーを返す）。
   * 発行 Event: BlockTypeChanged。 */
  changeBlockType(
    note: Note,
    blockId: BlockId,
    newType: BlockType,
    now: Timestamp,
  ): Result<Note, NoteEditError>;

  /** 並べ替え（drag & drop）。toIndex は 0 以上 blocks.length 未満。
   * 発行 Event: BlockMoved。 */
  moveBlock(
    note: Note,
    blockId: BlockId,
    toIndex: number,
    now: Timestamp,
  ): Result<Note, NoteEditError>;

  // ── Frontmatter / Tag 操作（変更なし） ──

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

  /** 派生プロパティ取得：`serializeBlocksToMarkdown(note.blocks)` を返す。
   * Vault への保存・クリップボードコピー・検索の入力として利用。
   * （TS の record 型では getter を持てないため、ここで namespace 関数として提供） */
  body(note: Note): Body;

  /** Note が「空ノート」かを判定（Capture の破棄判断用）。
   * 定義: blocks.length === 1 かつ blocks[0] が空 content の paragraph。 */
  isEmpty(note: Note): boolean;

  /** クリップボード用に body のみを文字列で返す（frontmatter 除外）。
   * 内部で `serializeBlocksToMarkdown(note.blocks)` を呼ぶ。 */
  bodyForClipboard(note: Note): string;
}

// ──────────────────────────────────────────────────────────────────────
// エラー型
// ──────────────────────────────────────────────────────────────────────

export type NoteEditError =
  | { kind: "frontmatter"; reason: FrontmatterError }
  | { kind: "tag"; reason: TagError }
  | { kind: "block"; reason: BlockOperationError };

/** Block 操作で発生しうる失敗。aggregates.md §1 Block 不変条件に対応。 */
export type BlockOperationError =
  | { kind: "block-not-found"; blockId: BlockId }
  | { kind: "last-block-cannot-be-removed" }
  | { kind: "split-offset-out-of-range"; offset: number }
  | { kind: "move-index-out-of-range"; toIndex: number }
  | { kind: "merge-on-first-block"; blockId: BlockId }
  | { kind: "incompatible-content-for-type"; reason: BlockContentError }
  | { kind: "invalid-block-id"; reason: BlockIdError }
  | { kind: "invalid-block-type"; reason: BlockTypeError };
