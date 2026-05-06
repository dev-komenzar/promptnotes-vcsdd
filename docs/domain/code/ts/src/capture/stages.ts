// Capture Context — ワークフロー中間型（DMMF stages）。
//
// 由来:
//   - workflows.md Workflow 2 (CaptureAutoSave) Capture 側ステージ
//   - workflows.md Workflow 3 (EditPastNoteStart) ステージ系列
//   - workflows.md Workflow 6 (CopyBody) 概要
//   - workflows.md Workflow 8 (HandleSaveFailure) 概要

import type { SaveError } from "../shared/errors.js";
import type { Block, Note } from "../shared/note.js";
import type { NoteFileSnapshot } from "../shared/snapshots.js";
import type {
  BlockId,
  Body,
  Frontmatter,
  NoteId,
  Timestamp,
} from "../shared/value-objects.js";

// ──────────────────────────────────────────────────────────────────────
// CaptureAutoSave 前段ステージ（Capture 側）
// DirtyEditingSession → ValidatedSaveRequest
// SerializedMarkdown 以降は Vault Context（Rust）の責務。
// ──────────────────────────────────────────────────────────────────────

/** isDirty=true で、現在の Note（blocks 含む）スナップショットと frontmatter を持つ。
 * `note.blocks` がブロックベース UI 化後の一次データ。 */
export type DirtyEditingSession = {
  readonly kind: "DirtyEditingSession";
  readonly noteId: NoteId;
  readonly note: Note;
  readonly previousFrontmatter: Frontmatter | null;
  readonly trigger: "idle" | "blur";
};

/** blocks/frontmatter が整合し、保存可能と判定された状態。
 * `body` は `serializeBlocksToMarkdown(blocks)` の派生フィールド。
 * 実装側で常に `body === serializeBlocksToMarkdown(blocks)` を保証する
 * （domain-events.md L115–116 と整合）。 */
export type ValidatedSaveRequest = {
  readonly kind: "ValidatedSaveRequest";
  readonly noteId: NoteId;
  readonly blocks: ReadonlyArray<Block>;
  /** `serializeBlocksToMarkdown(blocks)` 派生。Vault が直接ファイルに書く文字列。 */
  readonly body: Body;
  readonly frontmatter: Frontmatter;
  readonly previousFrontmatter: Frontmatter | null;
  readonly trigger: "idle" | "blur";
  readonly requestedAt: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// EditPastNoteStart ステージ系列（ブロックベース UI 化、aggregates.md L315 / L326）
// BlockFocusRequest → CurrentSessionDecision → FlushedCurrentSession → NewSession
//
// ブロックベース UI 採用後は「過去ノート選択専用モード」は存在せず、発動契機は
// クリック／キーボードでの Block Focus 取得そのもの。同一 Note 内ブロック移動と
// 別 Note ブロック移動を Workflow 内で区別する。
// ──────────────────────────────────────────────────────────────────────

/** Block Focus 取得要求。`snapshot` は別 Note への切替時のみ必要。
 * 同一 Note 内ブロック移動では snapshot=null（既存の note を継続使用）。
 * aggregates.md L331。 */
export type BlockFocusRequest = {
  readonly kind: "BlockFocusRequest";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  /** 別 Note への切替時に渡される。同一 Note 内ブロック移動では null。 */
  readonly snapshot: NoteFileSnapshot | null;
};

/** 現セッション分類結果。flush 戦略を決定する。
 * 同一 Note 内ブロック移動の場合は `same-note` を返し、flush をスキップ。 */
export type CurrentSessionDecision =
  | { readonly kind: "no-current" }
  | { readonly kind: "empty"; readonly noteId: NoteId }
  | { readonly kind: "dirty"; readonly noteId: NoteId; readonly note: Note }
  | {
      readonly kind: "same-note";
      readonly noteId: NoteId;
      readonly note: Note;
    };

/** 現セッションの flush（破棄 or save）が完了した状態。 */
export type FlushedCurrentSession = {
  readonly kind: "FlushedCurrentSession";
  /** flush の結果として何が起きたかを記録。
   * `same-note-skipped` は同一 Note 内ブロック移動で flush 不要だった場合。 */
  readonly result: "discarded" | "saved" | "no-op" | "same-note-skipped";
};

/** 新編集セッション。focusedBlockId はフォーカス取得対象ブロック。 */
export type NewSession = {
  readonly kind: "NewSession";
  readonly noteId: NoteId;
  readonly note: Note;
  readonly focusedBlockId: BlockId;
  readonly startedAt: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// CopyBody ステージ
// workflows.md Workflow 6
// ──────────────────────────────────────────────────────────────────────

/** クリップボード書き込み待機の文字列。 */
export type ClipboardText = {
  readonly kind: "ClipboardText";
  readonly text: string;
  readonly noteId: NoteId;
};

// ──────────────────────────────────────────────────────────────────────
// HandleSaveFailure ステージ
// workflows.md Workflow 8
// ──────────────────────────────────────────────────────────────────────

export type SaveFailedStage = {
  readonly kind: "SaveFailedStage";
  readonly noteId: NoteId;
  readonly error: SaveError;
};

export type UserDecision =
  | { readonly kind: "retry-save" }
  | { readonly kind: "discard-current-session" }
  | { readonly kind: "cancel-switch" };

export type ResolvedState = {
  readonly kind: "ResolvedState";
  readonly resolution: "retried" | "discarded" | "cancelled";
};
