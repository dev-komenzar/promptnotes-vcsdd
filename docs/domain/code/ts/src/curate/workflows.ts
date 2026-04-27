// Curate Context — ワークフロー全体の関数型シグネチャ。
//
// 由来:
//   - workflows.md Workflow 1 後段（hydrateFeed, initializeCaptureSession）
//   - workflows.md Workflow 4 (TagChipUpdate)
//   - workflows.md Workflow 5 (DeleteNote)
//   - workflows.md Workflow 7 (ApplyFilterOrSearch)

import type { Result } from "../util/result.js";
import type { DeletionError, SaveError } from "../shared/errors.js";
import type {
  DeleteNoteRequested,
  NoteFileDeleted,
  NoteFileSaved,
  SaveNoteRequested,
  VaultScanned,
} from "../shared/events.js";
import type { Feed } from "./aggregates.js";
import type { TagInventory } from "./read-models.js";
import type {
  AppliedFilter,
  AuthorizedDeletion,
  DeletionConfirmed,
  HydratedFeed,
  IndexedNote,
  InitialUIState,
  MutatedNote,
  TagChipCommand,
  UnvalidatedFilterInput,
  UpdatedProjection,
  VisibleNoteIds,
} from "./stages.js";
import type { CurateDeps } from "./ports.js";

// ──────────────────────────────────────────────────────────────────────
// Workflow 1 後段: VaultScanned → HydratedFeed → InitialUIState
// ──────────────────────────────────────────────────────────────────────

/** Step 3: hydrateFeed — pure（hydrate は port 経由で個別ファイル単位に）。 */
export type HydrateFeed = (
  deps: CurateDeps,
) => (event: VaultScanned) => HydratedFeed;

/** Step 4: initializeCaptureSession — Clock + allocateNoteId 経由で初期 Note 生成。 */
export type InitializeCaptureSession = (
  deps: CurateDeps,
  allocateNoteId: (preferred: import("../shared/value-objects.js").Timestamp) => import("../shared/value-objects.js").NoteId,
) => (hydrated: HydratedFeed) => InitialUIState;

// ──────────────────────────────────────────────────────────────────────
// Workflow 4: TagChipUpdate
// TagChipCommand → MutatedNote → SaveNoteRequested（→ Vault → IndexedNote）
// ──────────────────────────────────────────────────────────────────────

export type LoadCurrentNote = (
  deps: CurateDeps,
) => (
  command: TagChipCommand,
) => Result<import("../shared/note.js").Note, { kind: "not-found" }>;

export type ApplyTagOperation = (
  deps: CurateDeps,
) => (
  note: import("../shared/note.js").Note,
  command: TagChipCommand,
) => Result<MutatedNote, SaveError>;

export type BuildTagChipSaveRequest = (
  deps: CurateDeps,
) => (mutated: MutatedNote) => SaveNoteRequested;

/** タグチップ操作の全体。Vault 通信 + projections 更新まで含む。 */
export type TagChipUpdate = (
  deps: CurateDeps,
) => (
  command: TagChipCommand,
) => Promise<Result<IndexedNote, SaveError>>;

// ──────────────────────────────────────────────────────────────────────
// Workflow 5: DeleteNote — Curate 側 authorize + projections 更新
// ──────────────────────────────────────────────────────────────────────

export type AuthorizeDeletion = (
  deps: CurateDeps,
  feed: Feed,
  editingCurrentNoteId: import("../shared/value-objects.js").NoteId | null,
) => (
  confirmed: DeletionConfirmed,
) => Result<AuthorizedDeletion, DeletionError>;

/** 確認モーダル経由 → DeleteNoteRequested 発行 → Vault → projections 更新。 */
export type DeleteNote = (
  deps: CurateDeps,
) => (
  authorized: AuthorizedDeletion,
) => Promise<Result<UpdatedProjection, DeletionError>>;

/** DeleteNoteRequested の純粋構築。 */
export type BuildDeleteNoteRequested = (
  authorized: AuthorizedDeletion,
  now: import("../shared/value-objects.js").Timestamp,
) => DeleteNoteRequested;

// ──────────────────────────────────────────────────────────────────────
// Workflow 7: ApplyFilterOrSearch — Pure
// ──────────────────────────────────────────────────────────────────────

export type ParseFilterInput = (
  raw: UnvalidatedFilterInput,
) => Result<AppliedFilter, { kind: "invalid-tag"; raw: string }>;

export type ApplyFilterOrSearch = (
  feed: Feed,
  applied: AppliedFilter,
  snapshots: readonly import("../shared/snapshots.js").NoteFileSnapshot[],
) => VisibleNoteIds;

// ──────────────────────────────────────────────────────────────────────
// projections 更新（CaptureAutoSave / TagChipUpdate / DeleteNote 共通）
// workflows.md Step 4 (updateProjections) — 共通ステップ
// ──────────────────────────────────────────────────────────────────────

export type UpdateProjectionsAfterSave = (
  deps: CurateDeps,
) => (
  feed: Feed,
  inventory: TagInventory,
  event: NoteFileSaved,
) => IndexedNote;

export type UpdateProjectionsAfterDelete = (
  deps: CurateDeps,
) => (
  feed: Feed,
  inventory: TagInventory,
  event: NoteFileDeleted,
) => UpdatedProjection;
