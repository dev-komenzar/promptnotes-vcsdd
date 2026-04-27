//! Vault Context — ワークフロー全体の関数型シグネチャ。
//!
//! 由来: workflows.md Workflow 1, 2 (Vault 側), 5, 9
//!
//! DMMF: ワークフローは「依存を受け取って入力 → Result を返す」
//! の二段カリー化で表現する。

use crate::errors::{AppStartupError, DeletionError, SaveError};
use crate::events::{
    NoteFileDeleted, NoteFileSaved, SaveNoteRequested, VaultDirectoryConfigured, VaultScanned,
};
use crate::result::DomainResult;
use crate::value_objects::{NoteId, VaultPath};
use crate::vault::ports::{
    ClockPort, FileSystemPort, FrontmatterParserPort, FrontmatterSerializerPort, SettingsPort,
};
use crate::vault::stages::RawAppLaunch;

// ──────────────────────────────────────────────────────────────────────
// Workflow 1: AppStartup（Vault 側ステージのみ）
// workflows.md Workflow 1 Step 1 〜 3
// 出力は VaultScanned Public Event を含むタプル。
// HydratedFeed への昇格は Curate（TS 側）の責務。
// ──────────────────────────────────────────────────────────────────────

pub struct AppStartupVaultDeps<S, F, P, C>
where
    S: SettingsPort,
    F: FileSystemPort,
    P: FrontmatterParserPort,
    C: ClockPort,
{
    pub settings: S,
    pub file_system: F,
    pub parser: P,
    pub clock: C,
}

pub fn app_startup_vault_phase<S, F, P, C>(
    _deps: &AppStartupVaultDeps<S, F, P, C>,
    _input: RawAppLaunch,
) -> DomainResult<VaultScanned, AppStartupError>
where
    S: SettingsPort,
    F: FileSystemPort,
    P: FrontmatterParserPort,
    C: ClockPort,
{
    todo!("Phase 11+ 実装")
}

// ──────────────────────────────────────────────────────────────────────
// Workflow 9: ConfigureVault
// workflows.md §概要のみのワークフロー
// ──────────────────────────────────────────────────────────────────────

pub struct ConfigureVaultDeps<S, F, C>
where
    S: SettingsPort,
    F: FileSystemPort,
    C: ClockPort,
{
    pub settings: S,
    pub file_system: F,
    pub clock: C,
}

pub fn configure_vault<S, F, C>(
    _deps: &ConfigureVaultDeps<S, F, C>,
    _user_selected_path: VaultPath,
) -> DomainResult<VaultDirectoryConfigured, crate::errors::FsError>
where
    S: SettingsPort,
    F: FileSystemPort,
    C: ClockPort,
{
    todo!("Phase 11+ 実装")
}

// ──────────────────────────────────────────────────────────────────────
// Workflow 2 後段: SaveNoteRequested → NoteFileSaved | NoteSaveFailed
// workflows.md Workflow 2 Step 2〜3 (serializeNote, writeMarkdown)
// ──────────────────────────────────────────────────────────────────────

pub struct SaveNoteDeps<F, S, C>
where
    F: FileSystemPort,
    S: FrontmatterSerializerPort,
    C: ClockPort,
{
    pub file_system: F,
    pub serializer: S,
    pub clock: C,
}

pub fn save_note<F, S, C>(
    _deps: &SaveNoteDeps<F, S, C>,
    _request: SaveNoteRequested,
) -> DomainResult<NoteFileSaved, SaveError>
where
    F: FileSystemPort,
    S: FrontmatterSerializerPort,
    C: ClockPort,
{
    todo!("Phase 11+ 実装")
}

// ──────────────────────────────────────────────────────────────────────
// Workflow 5 後段: DeleteNoteRequested → NoteFileDeleted | NoteDeletionFailed
// workflows.md Workflow 5 Step 2 (trashFile)
// authorize ステップは Curate 側で先行判定済みの前提。
// ──────────────────────────────────────────────────────────────────────

pub struct DeleteNoteDeps<F, C>
where
    F: FileSystemPort,
    C: ClockPort,
{
    pub file_system: F,
    pub clock: C,
}

pub fn trash_note<F, C>(
    _deps: &DeleteNoteDeps<F, C>,
    _note_id: NoteId,
    _frontmatter_at_delete: crate::value_objects::Frontmatter,
) -> DomainResult<NoteFileDeleted, DeletionError>
where
    F: FileSystemPort,
    C: ClockPort,
{
    todo!("Phase 11+ 実装")
}
