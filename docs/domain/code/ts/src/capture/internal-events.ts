// Capture Context — Internal Application Events（Capture 内 UI 状態更新用）。
// Public Domain Event は shared/events.ts。
//
// 由来:
//   - domain-events.md §Internal Application Events / Capture 内（単一 Markdown 本文モデル）
//   - glossary.md §1 Capture が発する／受ける Domain Event
//   - aggregates.md §1 公開操作 → 発行 Event 表
//
// 単一 Markdown 本文モデルでは、編集イベントはすべて Internal。
// Cross-Context へは `SaveNoteRequested`（Note 全体スナップショット）でのみ流れる。

import type { NoteId, Timestamp } from "../shared/value-objects.js";

export type CaptureInternalEvent =
  | NewNoteAutoCreated
  | NoteFocused
  | EditorBlurred
  | NoteBodyEdited
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
// Focus / Blur 系
// ──────────────────────────────────────────────────────────────────────

/** 特定 Note にキャレットが入った（新規・過去いずれの Note でも同一イベント）。 */
export type NoteFocused = {
  readonly kind: "note-focused";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

/** エディタからフォーカスが外れた（blur save トリガ）。 */
export type EditorBlurred = {
  readonly kind: "editor-blurred";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// 編集系（一過性、すべて Internal）
// ──────────────────────────────────────────────────────────────────────

/** キー入力単位の本文変更（一過性）。 */
export type NoteBodyEdited = {
  readonly kind: "note-body-edited";
  readonly noteId: NoteId;
  readonly afterBody: string;
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
