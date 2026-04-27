//! Public Domain Events — Bounded Context をまたぐ Event。
//!
//! 由来:
//!   - domain-events.md §Public Domain Events 一覧
//!   - context-map.md BC 間契約
//!
//! Internal Application Event は各 Context のローカル責務なのでここには含めない。
//! `occurredOn` は全 Event 共通の基底プロパティ（domain-events.md 冒頭）。

use crate::errors::{NoteDeletionFailureReason, NoteSaveFailureReason};
use crate::snapshots::{CorruptedFile, HydrationFailureReason, NoteFileSnapshot};
use crate::value_objects::{Body, Frontmatter, NoteId, Timestamp, VaultId, VaultPath};

// ──────────────────────────────────────────────────────────────────────
// 全 Public Domain Event の判別可能ユニオン
// 単一の `enum` に集約することで、購読側で網羅性をコンパイラが強制可能。
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PublicDomainEvent {
    // ── Vault Context 発行 ────────────────────────────────────────
    VaultDirectoryConfigured(VaultDirectoryConfigured),
    VaultDirectoryNotConfigured(VaultDirectoryNotConfigured),
    VaultScanned(VaultScanned),
    NoteFileSaved(NoteFileSaved),
    NoteSaveFailed(NoteSaveFailed),
    NoteFileDeleted(NoteFileDeleted),
    NoteDeletionFailed(NoteDeletionFailed),
    NoteHydrationFailed(NoteHydrationFailed),
    // ── Capture Context 発行 ──────────────────────────────────────
    SaveNoteRequested(SaveNoteRequested),
    EmptyNoteDiscarded(EmptyNoteDiscarded),
    // ── Curate Context 発行 ───────────────────────────────────────
    PastNoteSelected(PastNoteSelected),
    DeleteNoteRequested(DeleteNoteRequested),
}

// ──────────────────────────────────────────────────────────────────────
// Vault Context 発行
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultDirectoryConfigured {
    pub vault_id: VaultId,
    pub path: VaultPath,
    pub occurred_on: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultDirectoryNotConfigured {
    pub occurred_on: Timestamp,
}

/// Enrichment：snapshot 全体 + 失敗ファイル一覧を載せる。
/// Curate は再問い合わせ不要で Feed を組み立てられる。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VaultScanned {
    pub vault_id: VaultId,
    pub snapshots: Vec<NoteFileSnapshot>,
    pub corrupted_files: Vec<CorruptedFile>,
    pub occurred_on: Timestamp,
}

/// Enrichment：旧 frontmatter を含めて TagInventory 差分計算を Curate 内で完結。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteFileSaved {
    pub note_id: NoteId,
    pub body: Body,
    pub frontmatter: Frontmatter,
    pub previous_frontmatter: Option<Frontmatter>,
    pub occurred_on: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteSaveFailed {
    pub note_id: NoteId,
    pub reason: NoteSaveFailureReason,
    pub detail: Option<String>,
    pub occurred_on: Timestamp,
}

/// Enrichment：frontmatter を含める（TagInventory 減算用）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteFileDeleted {
    pub note_id: NoteId,
    pub frontmatter: Frontmatter,
    pub occurred_on: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteDeletionFailed {
    pub note_id: NoteId,
    pub reason: NoteDeletionFailureReason,
    pub detail: Option<String>,
    pub occurred_on: Timestamp,
}

/// 運用中の単発 hydrate 失敗（起動時の集約は VaultScanned.corruptedFiles）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteHydrationFailed {
    pub file_path: String,
    pub reason: HydrationFailureReason,
    pub detail: Option<String>,
    pub occurred_on: Timestamp,
}

// ──────────────────────────────────────────────────────────────────────
// Capture Context 発行
// ──────────────────────────────────────────────────────────────────────

/// Domain Event Carrying Command。
/// Capture と Curate の両方が発行できるため `source` で発生元を識別。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SaveNoteRequested {
    pub note_id: NoteId,
    pub body: Body,
    pub frontmatter: Frontmatter,
    /// 旧 frontmatter は Capture/Curate 側が保持しており、
    /// `NoteFileSaved` の Enrichment 用に Vault が転送する目的で同梱。
    pub previous_frontmatter: Option<Frontmatter>,
    pub source: SaveNoteSource,
    pub occurred_on: Timestamp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SaveNoteSource {
    CaptureIdle,
    CaptureBlur,
    CurateTagChip,
    CurateFrontmatterEditOutsideEditor,
}

/// Capture → Curate のみで Vault には伝播しない。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EmptyNoteDiscarded {
    pub note_id: NoteId,
    pub occurred_on: Timestamp,
}

// ──────────────────────────────────────────────────────────────────────
// Curate Context 発行
// ──────────────────────────────────────────────────────────────────────

/// Curate → Capture の境界をまたぐ唯一の同期的トリガ。
/// snapshot を Enrichment して Capture が再問い合わせ不要にする。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PastNoteSelected {
    pub note_id: NoteId,
    pub snapshot: NoteFileSnapshot,
    pub occurred_on: Timestamp,
}

/// Domain Event Carrying Command（Curate → Vault）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeleteNoteRequested {
    pub note_id: NoteId,
    pub occurred_on: Timestamp,
}
