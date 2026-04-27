// Capture Context — ワークフロー中間型（DMMF stages）。
//
// 由来:
//   - workflows.md Workflow 2 (CaptureAutoSave) Capture 側ステージ
//   - workflows.md Workflow 3 (EditPastNoteStart) ステージ系列
//   - workflows.md Workflow 6 (CopyBody) 概要
//   - workflows.md Workflow 8 (HandleSaveFailure) 概要

import type { SaveError } from "../shared/errors.js";
import type { Note } from "../shared/note.js";
import type { NoteFileSnapshot } from "../shared/snapshots.js";
import type {
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

/** isDirty=true で、現在の body / frontmatter snapshot を持つ。 */
export type DirtyEditingSession = {
  readonly kind: "DirtyEditingSession";
  readonly noteId: NoteId;
  readonly note: Note;
  readonly previousFrontmatter: Frontmatter | null;
  readonly trigger: "idle" | "blur";
};

/** body/frontmatter が整合し、保存可能と判定された状態。 */
export type ValidatedSaveRequest = {
  readonly kind: "ValidatedSaveRequest";
  readonly noteId: NoteId;
  readonly body: Body;
  readonly frontmatter: Frontmatter;
  readonly previousFrontmatter: Frontmatter | null;
  readonly trigger: "idle" | "blur";
  readonly requestedAt: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// EditPastNoteStart ステージ系列
// PastNoteSelection → CurrentSessionDecision → FlushedCurrentSession → NewSession
// ──────────────────────────────────────────────────────────────────────

export type PastNoteSelection = {
  readonly kind: "PastNoteSelection";
  readonly noteId: NoteId;
  readonly snapshot: NoteFileSnapshot;
};

/** 現セッション分類結果。flush 戦略を決定する。 */
export type CurrentSessionDecision =
  | { readonly kind: "no-current" }
  | { readonly kind: "empty"; readonly noteId: NoteId }
  | { readonly kind: "dirty"; readonly noteId: NoteId; readonly note: Note };

/** 現セッションの flush（破棄 or save）が完了した状態。 */
export type FlushedCurrentSession = {
  readonly kind: "FlushedCurrentSession";
  /** flush の結果として何が起きたかを記録。 */
  readonly result: "discarded" | "saved" | "no-op";
};

export type NewSession = {
  readonly kind: "NewSession";
  readonly noteId: NoteId;
  readonly note: Note;
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
