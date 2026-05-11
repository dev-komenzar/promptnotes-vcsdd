// Capture Context — Commands.
//
// 由来:
//   - event-storming.md Capture 側 Command（単一 Markdown 本文モデルに再構成）
//   - aggregates.md §1 公開操作 / §EditingSessionState 遷移トリガ
//
// 単一 Markdown 本文モデルでは、本文編集は `EditNoteBody` コマンドで表現する。

import type { NoteId, Tag, Timestamp } from "../shared/value-objects.js";

/** すべての Command の判別可能ユニオン。 */
export type CaptureCommand =
  | RequestNewNote
  | FocusNote
  | EditNoteBody
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
  readonly source: "explicit-button" | "ctrl-N";
  readonly issuedAt: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// ノード操作系
// ──────────────────────────────────────────────────────────────────────

/** 特定 Note にフォーカス（クリック）。
 * EditingSessionState を idle → editing もしくは editing → switching へ遷移させる。 */
export type FocusNote = {
  readonly kind: "focus-note";
  readonly noteId: NoteId;
  readonly issuedAt: Timestamp;
};

/** Note body 編集（キー入力単位）。aggregates.md §1 editBody。 */
export type EditNoteBody = {
  readonly kind: "edit-note-body";
  readonly noteId: NoteId;
  readonly body: string;
  readonly issuedAt: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// Tag / Save / その他
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
