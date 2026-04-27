//! Vault Context — 外界依存ポート（DMMF: 関数型シグネチャで表現）。
//!
//! 由来: workflows.md §依存（ポート）一覧
//!
//! DMMF 原則: 依存は関数型でモジュール境界に明示。DI コンテナは前提にしない。
//! 実装は Tauri/Rust 側で `impl trait` か関数値の注入で渡す。

use crate::errors::FsError;
use crate::result::DomainResult;
use crate::value_objects::{Frontmatter, NoteId, Timestamp, VaultPath};

// ──────────────────────────────────────────────────────────────────────
// Settings ポート（読み書き）
// workflows.md Workflow 1 (loadVaultConfig), Workflow 9 (ConfigureVault)
// ──────────────────────────────────────────────────────────────────────

pub trait SettingsPort {
    fn load(&self) -> DomainResult<Option<VaultPath>, FsError>;
    fn save(&self, path: &VaultPath) -> DomainResult<(), FsError>;
}

// ──────────────────────────────────────────────────────────────────────
// FileSystem ポート
// workflows.md Workflow 1 (statDir, listMarkdown, readFile)
//          Workflow 2 (writeFileAtomic), Workflow 5 (trashFile)
// ──────────────────────────────────────────────────────────────────────

pub trait FileSystemPort {
    fn stat_dir(&self, path: &str) -> DomainResult<bool, FsError>;
    fn list_markdown(&self, path: &VaultPath) -> DomainResult<Vec<String>, FsError>;
    fn read_file(&self, path: &str) -> DomainResult<String, FsError>;
    /// 原子的書き込み（一時ファイル → rename を期待）。
    fn write_file_atomic(&self, path: &str, content: &str) -> DomainResult<(), FsError>;
    fn trash_file(&self, path: &str) -> DomainResult<(), FsError>;
}

// ──────────────────────────────────────────────────────────────────────
// Frontmatter Parser / Serializer
// workflows.md Workflow 1 (parse), Workflow 2 (toYaml)
// ──────────────────────────────────────────────────────────────────────

pub struct ParsedNoteFile {
    pub body: String,
    pub frontmatter_raw: String,
}

pub trait FrontmatterParserPort {
    /// raw な YAML パース後の生データを返す。Note Aggregate への変換は ACL 責務。
    fn parse(
        &self,
        raw: &str,
    ) -> DomainResult<ParsedNoteFile, crate::snapshots::HydrationFailureReason>;
}

pub trait FrontmatterSerializerPort {
    /// 純粋関数。`---\n{yaml}\n---\n{body}` 形式の文字列を生成。
    fn to_yaml(&self, frontmatter: &Frontmatter) -> String;
}

// ──────────────────────────────────────────────────────────────────────
// Clock ポート — purity-violating
// workflows.md 多数の Workflow
// ──────────────────────────────────────────────────────────────────────

pub trait ClockPort {
    fn now(&self) -> Timestamp;
}

// ──────────────────────────────────────────────────────────────────────
// NoteId 割り当て — 2 層構造
// aggregates.md §1 衝突回避設計（Phase 1c F-001 で純粋性境界を分離）
// ──────────────────────────────────────────────────────────────────────

/// Pure helper — 既存 NoteId 集合と希望 Timestamp から衝突なき NoteId を返す。
/// 副作用なし、同一入力 → 同一出力。fast-check property test の対象。
///
/// Phase 11+ 実装。Tier 1 検証可能。
pub fn next_available_note_id(
    _preferred: Timestamp,
    _existing_ids: &std::collections::HashSet<NoteId>,
) -> NoteId {
    todo!("Phase 11+ 実装：preferred と衝突するなら -1, -2 ... を付与")
}

/// Effectful Aggregate method — Vault 内部 NoteId 集合を読み取り、
/// `next_available_note_id` に委譲する境界。
///
/// 純粋性境界：このトレイトは effectful（Vault state read）。
/// アルゴリズム本体は `next_available_note_id` 側にある。
pub trait NoteIdAllocatorPort {
    fn allocate(&self, now: Timestamp) -> NoteId;
}
