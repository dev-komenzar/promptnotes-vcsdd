// Public Domain Events — Bounded Context をまたぐ Event。
// 真実は Rust 側 (rust/src/events.rs)。
//
// 由来:
//   - domain-events.md §Public Domain Events 一覧
//   - context-map.md BC 間契約

import type {
  NoteDeletionFailureReason,
  NoteSaveFailureReason,
} from "./errors.js";
import type {
  CorruptedFile,
  HydrationFailureReason,
  NoteFileSnapshot,
} from "./snapshots.js";
import type {
  Body,
  Frontmatter,
  NoteId,
  Timestamp,
  VaultId,
  VaultPath,
} from "./value-objects.js";

// ──────────────────────────────────────────────────────────────────────
// Vault Context 発行
// ──────────────────────────────────────────────────────────────────────

export type VaultDirectoryConfigured = {
  readonly kind: "vault-directory-configured";
  readonly vaultId: VaultId;
  readonly path: VaultPath;
  readonly occurredOn: Timestamp;
};

export type VaultDirectoryNotConfigured = {
  readonly kind: "vault-directory-not-configured";
  readonly occurredOn: Timestamp;
};

export type VaultScanned = {
  readonly kind: "vault-scanned";
  readonly vaultId: VaultId;
  readonly snapshots: readonly NoteFileSnapshot[];
  readonly corruptedFiles: readonly CorruptedFile[];
  readonly occurredOn: Timestamp;
};

/** Note ファイルが保存された。 */
export type NoteFileSaved = {
  readonly kind: "note-file-saved";
  readonly noteId: NoteId;
  readonly body: Body;
  readonly frontmatter: Frontmatter;
  /** TagInventory 増分計算のため Curate に旧値を渡す。 */
  readonly previousFrontmatter: Frontmatter | null;
  readonly occurredOn: Timestamp;
};

export type NoteSaveFailed = {
  readonly kind: "note-save-failed";
  readonly noteId: NoteId;
  readonly reason: NoteSaveFailureReason;
  readonly detail?: string;
  readonly occurredOn: Timestamp;
};

export type NoteFileDeleted = {
  readonly kind: "note-file-deleted";
  readonly noteId: NoteId;
  /** TagInventory 減算用。 */
  readonly frontmatter: Frontmatter;
  readonly occurredOn: Timestamp;
};

export type NoteDeletionFailed = {
  readonly kind: "note-deletion-failed";
  readonly noteId: NoteId;
  readonly reason: NoteDeletionFailureReason;
  readonly detail?: string;
  readonly occurredOn: Timestamp;
};

export type NoteHydrationFailed = {
  readonly kind: "note-hydration-failed";
  readonly filePath: string;
  readonly reason: HydrationFailureReason;
  readonly detail?: string;
  readonly occurredOn: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// Capture Context 発行
// ──────────────────────────────────────────────────────────────────────

export type SaveNoteSource =
  | "capture-idle"
  | "capture-blur"
  | "curate-tag-chip"
  | "curate-frontmatter-edit-outside-editor";

/** Note 保存依頼（Domain Event Carrying Command）。
 * payload は Note 全体スナップショットを送る。 */
export type SaveNoteRequested = {
  readonly kind: "save-note-requested";
  readonly noteId: NoteId;
  readonly body: Body;
  readonly frontmatter: Frontmatter;
  readonly previousFrontmatter: Frontmatter | null;
  readonly source: SaveNoteSource;
  readonly occurredOn: Timestamp;
};

export type EmptyNoteDiscarded = {
  readonly kind: "empty-note-discarded";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// Curate Context 発行
// ──────────────────────────────────────────────────────────────────────

/** 過去ノートにフォーカスが入った。 */
export type PastNoteSelected = {
  readonly kind: "past-note-selected";
  readonly noteId: NoteId;
  readonly snapshot: NoteFileSnapshot;
  readonly occurredOn: Timestamp;
};

export type DeleteNoteRequested = {
  readonly kind: "delete-note-requested";
  readonly noteId: NoteId;
  readonly occurredOn: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────
// 全 Public Domain Event の判別可能ユニオン
// ──────────────────────────────────────────────────────────────────────

export type PublicDomainEvent =
  | VaultDirectoryConfigured
  | VaultDirectoryNotConfigured
  | VaultScanned
  | NoteFileSaved
  | NoteSaveFailed
  | NoteFileDeleted
  | NoteDeletionFailed
  | NoteHydrationFailed
  | SaveNoteRequested
  | EmptyNoteDiscarded
  | PastNoteSelected
  | DeleteNoteRequested;
