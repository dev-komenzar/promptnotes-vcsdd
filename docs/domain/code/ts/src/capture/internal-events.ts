// Capture Context — Internal Application Events（Capture 内 UI 状態更新用）。
// Public Domain Event は shared/events.ts。
//
// 由来:
//   - domain-events.md §Internal Application Events / Capture 内
//   - glossary.md §1 Capture が発する／受ける Domain Event

import type { NoteId, Timestamp } from "../shared/value-objects.js";

export type CaptureInternalEvent =
  | NewNoteAutoCreated
  | EditorFocusedOnNewNote
  | EditorFocusedOnPastNote
  | NoteBodyEdited
  | NoteFrontmatterEditedInline
  | EditorBlurred
  | NewNoteRequested
  | NoteAutoSavedAfterIdle
  | NoteAutoSavedOnBlur
  | NoteBodyCopiedToClipboard
  | EditingSessionDiscarded
  | RetrySaveRequested;

export type NewNoteAutoCreated = {
  readonly kind: "new-note-auto-created";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

export type EditorFocusedOnNewNote = {
  readonly kind: "editor-focused-on-new-note";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

/** Public Event `PastNoteSelected` 受信後に Capture 内で発生する状態遷移イベント。 */
export type EditorFocusedOnPastNote = {
  readonly kind: "editor-focused-on-past-note";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

export type NoteBodyEdited = {
  readonly kind: "note-body-edited";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

export type NoteFrontmatterEditedInline = {
  readonly kind: "note-frontmatter-edited-inline";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

export type EditorBlurred = {
  readonly kind: "editor-blurred";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

export type NewNoteRequested = {
  readonly kind: "new-note-requested";
  readonly source: "explicit-button" | "ctrl-N";
  readonly occurredOn: Timestamp;
};

export type NoteAutoSavedAfterIdle = {
  readonly kind: "note-auto-saved-after-idle";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

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

export type EditingSessionDiscarded = {
  readonly kind: "editing-session-discarded";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

export type RetrySaveRequested = {
  readonly kind: "retry-save-requested";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};
