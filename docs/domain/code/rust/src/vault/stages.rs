//! Vault Context — ワークフローの中間型（DMMF stages）。
//!
//! 由来: workflows.md Workflow 1 (AppStartup), Workflow 2 (CaptureAutoSave 後段),
//!       Workflow 5 (DeleteNote), Workflow 9 (ConfigureVault)

use crate::snapshots::{CorruptedFile, NoteFileSnapshot};
use crate::value_objects::{Body, Frontmatter, NoteId, Timestamp, VaultPath};

// ──────────────────────────────────────────────────────────────────────
// AppStartup ステージ系列
// RawAppLaunch → ConfiguredVault → ScannedVault
// （HydratedFeed 以降は Curate Context（TS 側）の責務）
// ──────────────────────────────────────────────────────────────────────

/// プロセス起動。何も保証されない。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RawAppLaunch {
    pub launched_at: Timestamp,
}

/// `VaultPath` が読み取り可能なディレクトリとして実在することを保証。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfiguredVault {
    pub path: VaultPath,
}

/// snapshot 一覧と corruptedFiles が揃った段階。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ScannedVault {
    pub path: VaultPath,
    pub snapshots: Vec<NoteFileSnapshot>,
    pub corrupted_files: Vec<CorruptedFile>,
    pub scanned_at: Timestamp,
}

// ──────────────────────────────────────────────────────────────────────
// CaptureAutoSave 後段ステージ（Vault 側）
// SerializedMarkdown → PersistedNote
// ──────────────────────────────────────────────────────────────────────

/// YAML frontmatter + 本文を直列化済みの文字列。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SerializedMarkdown {
    pub note_id: NoteId,
    pub content: String,
    pub body: Body,
    pub frontmatter: Frontmatter,
    pub previous_frontmatter: Option<Frontmatter>,
}

/// 物理ファイルが書き込まれた、または失敗が判明した状態。
/// 失敗は `Result<PersistedNote, SaveError>` で別途扱う。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PersistedNote {
    pub note_id: NoteId,
    pub written_at: Timestamp,
    pub body: Body,
    pub frontmatter: Frontmatter,
    pub previous_frontmatter: Option<Frontmatter>,
}

// ──────────────────────────────────────────────────────────────────────
// DeleteNote ステージ系列（Vault 側）
// AuthorizedDeletion → TrashedFile
// ──────────────────────────────────────────────────────────────────────

/// 削除可と判断された状態。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorizedDeletion {
    pub note_id: NoteId,
    pub frontmatter: Frontmatter,
}

/// OS ゴミ箱への移動完了。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrashedFile {
    pub note_id: NoteId,
    pub frontmatter: Frontmatter,
    pub trashed_at: Timestamp,
}
