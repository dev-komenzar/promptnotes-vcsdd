//! Shared Kernel — Domain errors.
//!
//! 由来:
//!   - workflows.md エラーカタログ統合
//!   - workflows.md Workflow 1 〜 5 のエラーカタログ
//!
//! 設計方針:
//!   - 例外を投げず、すべて `Result<Ok, Err>`。
//!   - エラーは判別可能ユニオン (Rust の `enum`) で全域関数を保証。
//!   - UI マッピングはアプリケーション層の責務、ドメインは reason のみ運ぶ。

// ──────────────────────────────────────────────────────────────────────
// FsError — 全 fs 操作の共通基底
// workflows.md エラーカタログ統合
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FsError {
    Permission { path: Option<String> },
    DiskFull,
    Lock { path: Option<String> },
    NotFound { path: Option<String> },
    Unknown { detail: String },
}

// ──────────────────────────────────────────────────────────────────────
// AppStartup ワークフロー（workflow 1）
// workflows.md Workflow 1: AppStartup エラーカタログ
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VaultConfigError {
    Unconfigured,
    PathNotFound { path: String },
    PermissionDenied { path: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ScanError {
    ListFailed { detail: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AppStartupError {
    Config(VaultConfigError),
    Scan(ScanError),
}

// ──────────────────────────────────────────────────────────────────────
// CaptureAutoSave ワークフロー（workflow 2）
// workflows.md Workflow 2 エラーカタログ
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SaveValidationError {
    /// idle save 時に空 body — 破棄ルートへ。
    EmptyBodyOnIdle,
    /// Note Aggregate 不変条件違反。
    InvariantViolated { detail: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SaveError {
    Validation(SaveValidationError),
    Fs(FsError),
}

// ──────────────────────────────────────────────────────────────────────
// EditPastNoteStart ワークフロー（workflow 3）
// workflows.md Workflow 3 エラーカタログ
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SwitchError {
    SaveFailedDuringSwitch {
        underlying: SaveError,
        pending_next_note_id: crate::value_objects::NoteId,
    },
}

// ──────────────────────────────────────────────────────────────────────
// DeleteNote ワークフロー（workflow 5）
// workflows.md Workflow 5 エラーカタログ
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthorizationError {
    EditingInProgress { note_id: crate::value_objects::NoteId },
    NotInFeed { note_id: crate::value_objects::NoteId },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeletionError {
    Authorization(AuthorizationError),
    Fs(FsError),
}

// ──────────────────────────────────────────────────────────────────────
// NoteSaveFailed / NoteDeletionFailed の reason 列挙
// domain-events.md `NoteSaveFailed.reason` / `NoteDeletionFailed.reason`
// ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoteSaveFailureReason {
    Permission,
    DiskFull,
    Lock,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NoteDeletionFailureReason {
    Permission,
    Lock,
    NotFound,
    Unknown,
}
