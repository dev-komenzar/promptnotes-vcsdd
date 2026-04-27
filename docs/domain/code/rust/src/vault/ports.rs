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
// Vault.allocateNoteId（Capture からの依存）
// aggregates.md §1 衝突回避設計
// ──────────────────────────────────────────────────────────────────────

pub trait NoteIdAllocatorPort {
    fn allocate(&self, preferred: Timestamp) -> NoteId;
}
