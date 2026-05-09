// Capture Context — Commands.
//
// 由来:
//   - event-storming.md Capture 側 Command（ブロックベース UI 化により再構成）
//   - aggregates.md §1 Block 操作 / §EditingSessionState 遷移トリガ
//   - workflows.md Workflow 10 BlockEdit
//
// ブロックベース UI 化により、旧 `EditNoteBody` は Block 単位の編集コマンド群に
// 分解される。各 Command は EditingSessionState の遷移を起こし、対応する
// Internal Event（BlockContentEdited 等）を発行する。

import type {
  BlockContent,
  BlockId,
  BlockType,
  NoteId,
  Tag,
  Timestamp,
} from "../shared/value-objects.js";

/** すべての Command の判別可能ユニオン。 */
export type CaptureCommand =
  | RequestNewNote
  | FocusBlock
  | EditBlockContent
  | InsertBlock
  | RemoveBlock
  | MergeBlocks
  | SplitBlock
  | ChangeBlockType
  | MoveBlock
  | InsertTagInline
  | RemoveTagInline
  | TriggerIdleSave
  | TriggerBlurSave
  | CopyNoteBody
  | RetrySave
  | DiscardCurrentSession
  | CancelSwitch;

export type RequestNewNote = {
  readonly kind: "request-new-note";
  /** "explicit-button" | "ctrl-N" — discoveryDecisions.newNoteTrigger に従う。 */
  readonly source: "explicit-button" | "ctrl-N";
  readonly issuedAt: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// Block 操作系（旧 EditNoteBody を分解）
// ──────────────────────────────────────────────────────────────────────

/** 特定 Block にフォーカス（クリック or キーボード操作）。
 * EditingSessionState を idle → editing もしくは editing → switching へ遷移させる。 */
export type FocusBlock = {
  readonly kind: "focus-block";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  readonly issuedAt: Timestamp;
};

/** Block 内容編集（キー入力単位）。aggregates.md §1 editBlockContent。 */
export type EditBlockContent = {
  readonly kind: "edit-block-content";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  readonly content: BlockContent;
  readonly issuedAt: Timestamp;
};

/** 新規 Block 挿入。`atBeginning: true` で先頭挿入、それ以外は `prevBlockId` 直後。
 * aggregates.md §1 insertBlockAfter / insertBlockAtBeginning。 */
export type InsertBlock =
  | {
      readonly kind: "insert-block";
      readonly noteId: NoteId;
      readonly atBeginning: false;
      readonly prevBlockId: BlockId;
      readonly type: BlockType;
      readonly content: BlockContent;
      readonly issuedAt: Timestamp;
    }
  | {
      readonly kind: "insert-block";
      readonly noteId: NoteId;
      readonly atBeginning: true;
      readonly type: BlockType;
      readonly content: BlockContent;
      readonly issuedAt: Timestamp;
    };

/** Block 削除。最後の 1 ブロックは削除されず空 paragraph に置換される。 */
export type RemoveBlock = {
  readonly kind: "remove-block";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  readonly issuedAt: Timestamp;
};

/** 行頭 Backspace 相当：前ブロックと結合し自身を削除。aggregates.md §1 mergeBlockWithPrevious。 */
export type MergeBlocks = {
  readonly kind: "merge-blocks";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  readonly issuedAt: Timestamp;
};

/** テキスト中央 Enter 相当：offset で 2 分し、後半を新規 paragraph として直後挿入。
 * aggregates.md §1 splitBlock。 */
export type SplitBlock = {
  readonly kind: "split-block";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  readonly offset: number;
  readonly issuedAt: Timestamp;
};

/** Block 種別変換（`# ` 入力で heading-1 へ等）。aggregates.md §1 changeBlockType。 */
export type ChangeBlockType = {
  readonly kind: "change-block-type";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  readonly newType: BlockType;
  readonly issuedAt: Timestamp;
};

/** Block 並べ替え（drag & drop）。aggregates.md §1 moveBlock。 */
export type MoveBlock = {
  readonly kind: "move-block";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  readonly toIndex: number;
  readonly issuedAt: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// Tag / Save / その他（変更なし）
// ──────────────────────────────────────────────────────────────────────

export type InsertTagInline = {
  readonly kind: "insert-tag-inline";
  readonly noteId: NoteId;
  readonly tag: Tag;
  readonly issuedAt: Timestamp;
};

export type RemoveTagInline = {
  readonly kind: "remove-tag-inline";
  readonly noteId: NoteId;
  readonly tag: Tag;
  readonly issuedAt: Timestamp;
};

export type TriggerIdleSave = {
  readonly kind: "trigger-idle-save";
  readonly noteId: NoteId;
  readonly issuedAt: Timestamp;
};

export type TriggerBlurSave = {
  readonly kind: "trigger-blur-save";
  readonly noteId: NoteId;
  readonly issuedAt: Timestamp;
};

export type CopyNoteBody = {
  readonly kind: "copy-note-body";
  readonly noteId: NoteId;
  readonly issuedAt: Timestamp;
};

export type RetrySave = {
  readonly kind: "retry-save";
  readonly noteId: NoteId;
  readonly issuedAt: Timestamp;
};

export type DiscardCurrentSession = {
  readonly kind: "discard-current-session";
  readonly noteId: NoteId;
  readonly issuedAt: Timestamp;
};

export type CancelSwitch = {
  readonly kind: "cancel-switch";
  readonly noteId: NoteId;
  readonly issuedAt: Timestamp;
};
