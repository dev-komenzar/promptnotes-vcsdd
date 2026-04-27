//! Vault Aggregate.
//!
//! 由来: aggregates.md §4 Vault Aggregate

use crate::errors::FsError;
use crate::result::DomainResult;
use crate::snapshots::NoteFileSnapshot;
use crate::value_objects::{NoteId, Timestamp, VaultId, VaultPath};

// ──────────────────────────────────────────────────────────────────────
// VaultStatus — 状態機械の OR 型
// 不変条件 1: path 未設定なら Unconfigured
// 不変条件 2: Scanning の間は新たな scan を受け付けない
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VaultStatus {
    Unconfigured,
    Ready { path: VaultPath, last_scanned_at: Option<Timestamp> },
    Scanning { path: VaultPath, started_at: Timestamp },
}

// ──────────────────────────────────────────────────────────────────────
// Vault — 状態機械型 Aggregate
// 状態ごとに保持データが異なるため OR 型で表現し、
// 「未設定なのに save しようとする」状態を型レベルで防ぐ。
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Vault {
    pub id: VaultId,
    pub status: VaultStatus,
}

impl Vault {
    /// 起動直後の Vault（まだ設定読み込み前）。
    pub fn unconfigured(id: VaultId) -> Self {
        Self {
            id,
            status: VaultStatus::Unconfigured,
        }
    }
}

// ──────────────────────────────────────────────────────────────────────
// 状態遷移関数（aggregates.md §4 公開操作）
// ──────────────────────────────────────────────────────────────────────

/// path 検証して Ready 状態へ遷移。
/// 実在検証は port `FileSystem::stat_dir` 経由で別途行うため、
/// ここでは状態遷移の純粋関数だけを表現する。
pub fn configure(
    _vault: Vault,
    _path: VaultPath,
    _now: Timestamp,
) -> DomainResult<Vault, FsError> {
    todo!("Phase 11+ 実装")
}

/// Scanning へ遷移。
pub fn begin_scan(_vault: Vault, _now: Timestamp) -> DomainResult<Vault, FsError> {
    todo!("Phase 11+ 実装")
}

/// Scanning から Ready へ遷移し、snapshot 一覧を返す。
pub fn complete_scan(
    _vault: Vault,
    _snapshots: Vec<NoteFileSnapshot>,
    _now: Timestamp,
) -> DomainResult<Vault, FsError> {
    todo!("Phase 11+ 実装")
}

/// 既存ファイル名と衝突しない NoteId を返す。
/// glossary.md §0 / aggregates.md §1 衝突回避設計
/// `existing_ids` は Vault が保持する全 NoteId（scan 結果から構築）。
pub fn allocate_note_id(
    _existing_ids: &[NoteId],
    _preferred: Timestamp,
) -> NoteId {
    todo!("Phase 11+ 実装")
}
