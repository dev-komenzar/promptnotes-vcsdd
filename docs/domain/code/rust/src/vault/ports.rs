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
/// Format: `YYYY-MM-DD-HHmmss-SSS` (UTC) with optional `-N` collision suffix (N >= 1).
/// PROP-003: result ∉ existing_ids.
/// PROP-022: deterministic — same inputs produce same NoteId.
pub fn next_available_note_id(
    preferred: Timestamp,
    existing_ids: &std::collections::HashSet<NoteId>,
) -> NoteId {
    let base = format_base_note_id(preferred);

    if !existing_ids.contains(&NoteId::from_validated(base.clone())) {
        return NoteId::from_validated(base.clone());
    }

    // Collision: try suffix -1, -2, ... until a free slot is found.
    let mut i: u32 = 1;
    loop {
        let candidate = format!("{}-{}", base, i);
        if !existing_ids.contains(&NoteId::from_validated(candidate.clone())) {
            return NoteId::from_validated(candidate);
        }
        i += 1;
    }
}

/// Format a Timestamp as a NoteId base string: `YYYY-MM-DD-HHmmss-SSS` (UTC).
/// Pure — no system clock access; deterministic for any fixed Timestamp.
fn format_base_note_id(ts: Timestamp) -> String {
    use chrono::{DateTime, Utc};

    let ms = ts.epoch_millis();
    let secs = ms / 1000;
    let millis_part = (ms % 1000) as u32;

    let dt: DateTime<Utc> = DateTime::from_timestamp(secs, 0)
        .unwrap_or_else(|| DateTime::from_timestamp(0, 0).unwrap());

    format!(
        "{}-{:03}",
        dt.format("%Y-%m-%d-%H%M%S"),
        millis_part
    )
}

/// Effectful Aggregate method — Vault 内部 NoteId 集合を読み取り、
/// `next_available_note_id` に委譲する境界。
///
/// 純粋性境界：このトレイトは effectful（Vault state read）。
/// アルゴリズム本体は `next_available_note_id` 側にある。
pub trait NoteIdAllocatorPort {
    fn allocate(&self, now: Timestamp) -> NoteId;
}
