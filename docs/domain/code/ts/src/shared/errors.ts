// Shared Kernel — Domain errors crossing context boundaries.
// 真実は Rust 側 (rust/src/errors.rs)。
//
// 由来: workflows.md エラーカタログ統合 / Workflow 1〜5

import type { BlockId, NoteId } from "./value-objects.js";

// ──────────────────────────────────────────────────────────────────────
// FsError — 全 fs 操作の共通基底
// ──────────────────────────────────────────────────────────────────────

export type FsError =
  | { kind: "permission"; path?: string }
  | { kind: "disk-full" }
  | { kind: "lock"; path?: string }
  | { kind: "not-found"; path?: string }
  | { kind: "unknown"; detail: string };

// ──────────────────────────────────────────────────────────────────────
// Workflow 1: AppStartup
// ──────────────────────────────────────────────────────────────────────

export type VaultConfigError =
  | { kind: "unconfigured" }
  | { kind: "path-not-found"; path: string }
  | { kind: "permission-denied"; path: string };

export type ScanError = { kind: "list-failed"; detail: string };

export type AppStartupError =
  | { kind: "config"; reason: VaultConfigError }
  | { kind: "scan"; reason: ScanError };

// ──────────────────────────────────────────────────────────────────────
// Workflow 2: CaptureAutoSave
// ──────────────────────────────────────────────────────────────────────

/** 保存依頼の検証失敗。
 * `empty-body-on-idle`: 全ブロックが空 paragraph のみ（`note.isEmpty()` が真）の状態で
 * idle save トリガが発火したケース。ブロックベース UI 化後も「派生 body が空」を意味する
 * 同一の不変条件として扱う。 */
export type SaveValidationError =
  | { kind: "empty-body-on-idle" }
  | { kind: "invariant-violated"; detail: string };

export type SaveError =
  | { kind: "validation"; reason: SaveValidationError }
  | { kind: "fs"; reason: FsError };

// ──────────────────────────────────────────────────────────────────────
// Workflow 3: EditPastNoteStart
// ──────────────────────────────────────────────────────────────────────

/** ノート切替中に保存失敗が発生したことを表す。
 * `pendingNextFocus` は切替先の Block Focus（noteId + blockId、aggregates.md L342）。
 * 同一 Note 内のブロック間移動はそもそも switching を経由しないため、
 * このエラーは常に別 Note への切替時にのみ発生する。 */
export type SwitchError = {
  kind: "save-failed-during-switch";
  underlying: SaveError;
  pendingNextFocus: { readonly noteId: NoteId; readonly blockId: BlockId };
};

// ──────────────────────────────────────────────────────────────────────
// Workflow 5: DeleteNote
// ──────────────────────────────────────────────────────────────────────

export type AuthorizationError =
  | { kind: "editing-in-progress"; noteId: NoteId }
  | { kind: "not-in-feed"; noteId: NoteId };

export type DeletionError =
  | { kind: "authorization"; reason: AuthorizationError }
  | { kind: "fs"; reason: FsError };

// ──────────────────────────────────────────────────────────────────────
// NoteSaveFailed / NoteDeletionFailed の reason
// domain-events.md `NoteSaveFailed.reason` / `NoteDeletionFailed.reason`
// ──────────────────────────────────────────────────────────────────────

export type NoteSaveFailureReason =
  | "permission"
  | "disk-full"
  | "lock"
  | "unknown";

export type NoteDeletionFailureReason =
  | "permission"
  | "lock"
  | "not-found"
  | "unknown";
