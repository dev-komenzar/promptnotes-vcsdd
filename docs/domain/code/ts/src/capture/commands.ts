// Capture Context — Commands.
//
// 由来:
//   - event-storming.md Capture 側 Command
//   - aggregates.md §CaptureSession EditingSessionState の遷移トリガ

import type { Body, NoteId, Tag, Timestamp } from "../shared/value-objects.js";

/** すべての Command の判別可能ユニオン。 */
export type CaptureCommand =
  | RequestNewNote
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
  /** "explicit-button" | "ctrl-N" — discoveryDecisions.newNoteTrigger に従う。 */
  readonly source: "explicit-button" | "ctrl-N";
  readonly issuedAt: Timestamp;
};

export type EditNoteBody = {
  readonly kind: "edit-note-body";
  readonly noteId: NoteId;
  readonly body: Body;
  readonly issuedAt: Timestamp;
};

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
