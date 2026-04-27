// Curate Context — ワークフロー中間型（DMMF stages）。
//
// 由来:
//   - workflows.md Workflow 1 (AppStartup) の Curate 側ステージ
//     （HydratedFeed → InitialUIState）
//   - workflows.md Workflow 4 (TagChipUpdate) Curate 側ステージ
//   - workflows.md Workflow 5 (DeleteNote) authorize ステージ
//   - workflows.md Workflow 7 (ApplyFilterOrSearch) ステージ

import type { CorruptedFile, NoteFileSnapshot } from "../shared/snapshots.js";
import type { Note } from "../shared/note.js";
import type { Frontmatter, NoteId, Tag } from "../shared/value-objects.js";
import type { Feed, FilterCriteria, SearchQuery, SortOrder } from "./aggregates.js";
import type { TagInventory } from "./read-models.js";

// ──────────────────────────────────────────────────────────────────────
// AppStartup の Curate 側ステージ
// HydratedFeed → InitialUIState
// ──────────────────────────────────────────────────────────────────────

/**
 * 全 snapshot が Note Aggregate に変換済み（壊れファイルは除外）、
 * Feed と TagInventory が構築済みの段階。
 */
export type HydratedFeed = {
  readonly kind: "HydratedFeed";
  readonly feed: Feed;
  readonly tagInventory: TagInventory;
  readonly corruptedFiles: readonly CorruptedFile[];
};

/** 上記 + 最上部の新規ノートが Note.create で生成され、editing 状態。 */
export type InitialUIState = {
  readonly kind: "InitialUIState";
  readonly feed: Feed;
  readonly tagInventory: TagInventory;
  readonly corruptedFiles: readonly CorruptedFile[];
  readonly initialNoteId: NoteId;
};

// ──────────────────────────────────────────────────────────────────────
// TagChipUpdate ステージ
// TagChipCommand → MutatedNote → ValidatedSaveRequest（→ 後段は Vault 共通）
// ──────────────────────────────────────────────────────────────────────

export type TagChipCommand =
  | { readonly kind: "add"; readonly noteId: NoteId; readonly tag: Tag }
  | { readonly kind: "remove"; readonly noteId: NoteId; readonly tag: Tag };

/** タグ操作適用後の Note + 旧 frontmatter（Public Event 用）。 */
export type MutatedNote = {
  readonly kind: "MutatedNote";
  readonly note: Note;
  readonly previousFrontmatter: Frontmatter;
};

// ──────────────────────────────────────────────────────────────────────
// DeleteNote ステージ
// DeletionConfirmed → AuthorizedDeletion（→ Vault 側 TrashedFile → UpdatedProjection）
// ──────────────────────────────────────────────────────────────────────

export type DeletionConfirmed = {
  readonly kind: "DeletionConfirmed";
  readonly noteId: NoteId;
};

/** 削除可と判断された状態（Curate 側 authorize 完了）。 */
export type AuthorizedDeletion = {
  readonly kind: "AuthorizedDeletion";
  readonly noteId: NoteId;
  /** TagInventory 減算用の取得済み frontmatter。 */
  readonly frontmatter: Frontmatter;
};

/** Curate 内 Read Model（Feed + TagInventory）の更新完了。 */
export type UpdatedProjection = {
  readonly kind: "UpdatedProjection";
  readonly feed: Feed;
  readonly tagInventory: TagInventory;
};

// ──────────────────────────────────────────────────────────────────────
// ApplyFilterOrSearch ステージ
// UnvalidatedFilterInput → AppliedFilter → VisibleNoteIds
// ──────────────────────────────────────────────────────────────────────

export type UnvalidatedFilterInput = {
  readonly kind: "UnvalidatedFilterInput";
  readonly tagsRaw: readonly string[];
  readonly fieldsRaw: ReadonlyMap<string, string>;
  readonly searchTextRaw: string | null;
  readonly sortOrder: SortOrder;
};

export type AppliedFilter = {
  readonly kind: "AppliedFilter";
  readonly criteria: FilterCriteria;
  readonly query: SearchQuery | null;
  readonly sortOrder: SortOrder;
};

export type VisibleNoteIds = {
  readonly kind: "VisibleNoteIds";
  readonly ids: readonly NoteId[];
  readonly hasZeroResults: boolean;
};

// ──────────────────────────────────────────────────────────────────────
// IndexedNote — Curate 側 Read Model 更新後の共通最終ステージ
// （CaptureAutoSave / TagChipUpdate の updateProjections 出力）
// ──────────────────────────────────────────────────────────────────────

export type IndexedNote = {
  readonly kind: "IndexedNote";
  readonly noteId: NoteId;
  readonly feed: Feed;
  readonly tagInventory: TagInventory;
};

/** Vault からの NoteFileSnapshot を Note Aggregate に変換した結果。 */
export type HydratedNote = {
  readonly kind: "HydratedNote";
  readonly note: Note;
};
