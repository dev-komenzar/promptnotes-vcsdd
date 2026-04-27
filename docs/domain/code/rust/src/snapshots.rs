//! Shared Kernel — DTO that crosses the Vault boundary.
//!
//! 由来:
//!   - glossary.md §3 NoteFileSnapshot, Hydration
//!   - aggregates.md §4 Vault Aggregate / NoteSnapshot
//!   - domain-events.md `VaultScanned`

use crate::value_objects::{Body, Frontmatter, NoteId, Timestamp};

// ──────────────────────────────────────────────────────────────────────
// NoteFileSnapshot
// Vault.scan() が返す読み取り表現。Curate 側で Note Aggregate に変換。
// ──────────────────────────────────────────────────────────────────────

/// 永続化された Note の読み取り表現。
/// `Note` Aggregate に変換するのは Curate 側 ACL の責務。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteFileSnapshot {
    pub note_id: NoteId,
    pub body: Body,
    pub frontmatter: Frontmatter,
    pub file_path: String,
    pub file_mtime: Timestamp,
}

// ──────────────────────────────────────────────────────────────────────
// CorruptedFile — VaultScanned に同梱される失敗ファイル
// domain-events.md `VaultScanned.corruptedFiles`
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CorruptedFile {
    pub file_path: String,
    pub reason: HydrationFailureReason,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HydrationFailureReason {
    YamlParse,
    MissingField,
    InvalidValue,
    Unknown,
}
