// Capture Context — Internal Application Events（Capture 内 UI 状態更新用）。
// Public Domain Event は shared/events.ts。
//
// 由来:
//   - domain-events.md §Internal Application Events / Capture 内（ブロックベース UI）
//   - glossary.md §1 Capture が発する／受ける Domain Event
//   - aggregates.md §1 Block 操作 → 発行 Event 表
//
// ブロックベース UI 化により、Block レベルのイベントはすべて Internal。
// Cross-Context へは `SaveNoteRequested`（Note 全体スナップショット）でのみ流れる。

import type {
  BlockContent,
  BlockId,
  BlockType,
  NoteId,
  Timestamp,
} from "../shared/value-objects.js";

export type CaptureInternalEvent =
  | NewNoteAutoCreated
  | BlockFocused
  | BlockBlurred
  | EditorBlurredAllBlocks
  | BlockContentEdited
  | BlockInserted
  | BlockRemoved
  | BlocksMerged
  | BlockSplit
  | BlockTypeChanged
  | BlockMoved
  | NoteFrontmatterEditedInline
  | NewNoteRequested
  | NoteAutoSavedAfterIdle
  | NoteAutoSavedOnBlur
  | NoteBodyCopiedToClipboard
  | EditingSessionDiscarded
  | RetrySaveRequested;

// ──────────────────────────────────────────────────────────────────────
// 新規ノート / セッション系
// ──────────────────────────────────────────────────────────────────────

export type NewNoteAutoCreated = {
  readonly kind: "new-note-auto-created";
  readonly noteId: NoteId;
  /** 新規 Note は `[empty paragraph]` で生成され、その先頭ブロックが
   * 直後に `BlockFocused` で focus を取得する。 */
  readonly firstBlockId: BlockId;
  readonly occurredOn: Timestamp;
};

export type NewNoteRequested = {
  readonly kind: "new-note-requested";
  readonly source: "explicit-button" | "ctrl-N";
  readonly occurredOn: Timestamp;
};

export type EditingSessionDiscarded = {
  readonly kind: "editing-session-discarded";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// Block Focus / Blur 系（旧 EditorFocusedOnNewNote / EditorFocusedOnPastNote / EditorBlurred を統合）
// ──────────────────────────────────────────────────────────────────────

/** 特定 Block にキャレットが入った（新規・過去いずれの Note でも同一イベント）。
 * glossary.md §1：旧 `EditorFocusedOnNewNote` / `EditorFocusedOnPastNote` を統合。 */
export type BlockFocused = {
  readonly kind: "block-focused";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  readonly occurredOn: Timestamp;
};

/** 個別 Block からフォーカスが外れた（同一 Note 内の別 Block へ移った場合等。
 * 次に `BlockFocused` が来なければ `EditorBlurredAllBlocks` に進む）。 */
export type BlockBlurred = {
  readonly kind: "block-blurred";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  readonly occurredOn: Timestamp;
};

/** 同一 Note の全ブロックからフォーカスが外れた（blur save トリガ）。
 * 旧 `EditorBlurred` の置換。 */
export type EditorBlurredAllBlocks = {
  readonly kind: "editor-blurred-all-blocks";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// Block 構造・内容変更系（一過性、すべて Internal）
// aggregates.md §1 Block 操作 → 発行 Event 表
// ──────────────────────────────────────────────────────────────────────

/** キー入力単位のブロック内容変更（一過性）。旧 `NoteBodyEdited` の置換。 */
export type BlockContentEdited = {
  readonly kind: "block-content-edited";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  readonly afterContent: BlockContent;
  readonly occurredOn: Timestamp;
};

/** 新規ブロック挿入（Enter キー、`/` メニュー等）。 */
export type BlockInserted = {
  readonly kind: "block-inserted";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  /** 挿入位置の前ブロック ID。null なら先頭挿入（insertBlockAtBeginning）。 */
  readonly prevBlockId: BlockId | null;
  readonly type: BlockType;
  readonly occurredOn: Timestamp;
};

/** ブロック削除。最後の 1 ブロックは削除不可（空 paragraph に置換される）。 */
export type BlockRemoved = {
  readonly kind: "block-removed";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  readonly occurredOn: Timestamp;
};

/** 前ブロックとの結合（行頭 Backspace）。 */
export type BlocksMerged = {
  readonly kind: "blocks-merged";
  readonly noteId: NoteId;
  /** 結合元（消えたブロック）。 */
  readonly removedBlockId: BlockId;
  /** 結合先（content が拡張されたブロック）。 */
  readonly survivorBlockId: BlockId;
  readonly occurredOn: Timestamp;
};

/** ブロック分割（テキスト中央 Enter）。後半は新規 paragraph として直後に挿入。 */
export type BlockSplit = {
  readonly kind: "block-split";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  readonly newBlockId: BlockId;
  readonly offset: number;
  readonly occurredOn: Timestamp;
};

/** ブロック種別変換（`# ` → heading-1 等）。 */
export type BlockTypeChanged = {
  readonly kind: "block-type-changed";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  readonly fromType: BlockType;
  readonly toType: BlockType;
  readonly occurredOn: Timestamp;
};

/** ブロック並べ替え（drag & drop）。 */
export type BlockMoved = {
  readonly kind: "block-moved";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  readonly toIndex: number;
  readonly occurredOn: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// Frontmatter / Save / その他
// ──────────────────────────────────────────────────────────────────────

export type NoteFrontmatterEditedInline = {
  readonly kind: "note-frontmatter-edited-inline";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

/** SaveNoteRequested を発行するトリガ（idle）。 */
export type NoteAutoSavedAfterIdle = {
  readonly kind: "note-auto-saved-after-idle";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

/** SaveNoteRequested を発行するトリガ（blur）。 */
export type NoteAutoSavedOnBlur = {
  readonly kind: "note-auto-saved-on-blur";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

export type NoteBodyCopiedToClipboard = {
  readonly kind: "note-body-copied-to-clipboard";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

export type RetrySaveRequested = {
  readonly kind: "retry-save-requested";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};
