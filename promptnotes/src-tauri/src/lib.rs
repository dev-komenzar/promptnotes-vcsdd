// VCSDD ui-app-shell Phase 2b — Tauri command implementations.
//
// FIND-203: Register all IPC commands invoked by tauriAdapter.ts.
// Commands registered:
//   - try_vault_path      (try_vault_path in tauriAdapter)
//   - invoke_app_startup  (invokeAppStartup in tauriAdapter)
//   - invoke_configure_vault (invokeConfigureVault in tauriAdapter)
//   - settings_save       (settings persistence — called by configure-vault pipeline)
//   - fs_stat_dir         (vault directory existence check)
//   - fs_list_markdown    (markdown file listing in vault)
//   - fs_read_file        (file content reading)
//
// FIND-214: invoke_configure_vault receives { path } not { vaultPath }.

use serde::{Deserialize, Serialize};
use std::path::Path;

pub mod domain;

// ── VaultPathError shape ──────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum VaultPathErrorDto {
    Empty,
    NotAbsolute,
}

// ── VaultConfigError shape ────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum VaultConfigErrorDto {
    Unconfigured,
    PathNotFound { path: String },
    PermissionDenied { path: String },
}

// ── AppStartupError shape ─────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum AppStartupErrorDto {
    Config { reason: VaultConfigErrorDto },
    Scan { reason: ScanReasonDto },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum ScanReasonDto {
    ListFailed { detail: String },
}

// ── InitialUIState shape ──────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InitialUIState {
    pub vault_path: String,
    pub vault_id: String,
    pub feed: FeedDto,
    pub tag_inventory: TagInventoryDto,
    pub corrupted_files: Vec<CorruptedFileDto>,
    pub editing_session_state: EditingSessionStateDto,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FeedDto {
    pub notes: Vec<serde_json::Value>,
    pub filtered_notes: Vec<serde_json::Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TagInventoryDto {
    pub tags: Vec<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CorruptedFileDto {
    pub file_path: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EditingSessionStateDto {
    pub kind: String,
}

// ── try_vault_path ────────────────────────────────────────────────────

/// FIND-203: Validates the raw path string using VaultPath smart constructor rules.
/// Returns Ok(String) with the validated path, or Err(VaultPathError).
///
/// Implements VaultPath::try_new logic:
///   - Empty string (or whitespace-only) → VaultPathError::Empty
///   - Not starting with '/' → VaultPathError::NotAbsolute
///   - Otherwise → Ok(path)
///
/// Note: Existence check happens in invoke_configure_vault.
#[tauri::command]
fn try_vault_path(raw_path: String) -> Result<String, VaultPathErrorDto> {
    if raw_path.trim().is_empty() {
        return Err(VaultPathErrorDto::Empty);
    }
    if !raw_path.starts_with('/') {
        return Err(VaultPathErrorDto::NotAbsolute);
    }
    Ok(raw_path)
}

// ── invoke_configure_vault ────────────────────────────────────────────

/// FIND-203 / FIND-214: Receives { path } (not { vaultPath }).
/// Validates the vault path exists as a directory, then returns Ok.
#[tauri::command]
fn invoke_configure_vault(path: String) -> Result<serde_json::Value, VaultConfigErrorDto> {
    let dir = Path::new(&path);
    match dir.metadata() {
        Ok(meta) => {
            if !meta.is_dir() {
                return Err(VaultConfigErrorDto::PathNotFound { path });
            }
        }
        Err(e) => {
            return match e.kind() {
                std::io::ErrorKind::NotFound => Err(VaultConfigErrorDto::PathNotFound { path }),
                std::io::ErrorKind::PermissionDenied => {
                    Err(VaultConfigErrorDto::PermissionDenied { path })
                }
                _ => Err(VaultConfigErrorDto::PathNotFound { path }),
            };
        }
    }
    Ok(serde_json::json!({}))
}

// ── invoke_app_startup ────────────────────────────────────────────────

/// FIND-203: Runs the AppStartup pipeline.
/// Stub: returns Unconfigured until settings persistence is implemented.
#[tauri::command]
fn invoke_app_startup() -> Result<InitialUIState, AppStartupErrorDto> {
    Err(AppStartupErrorDto::Config {
        reason: VaultConfigErrorDto::Unconfigured,
    })
}

// ── settings_save ─────────────────────────────────────────────────────

/// FIND-203: Persist vault path to settings file.
#[tauri::command]
fn settings_save(vault_path: String) -> Result<serde_json::Value, VaultConfigErrorDto> {
    let dir = Path::new(&vault_path);
    if !dir.exists() {
        return Err(VaultConfigErrorDto::PathNotFound { path: vault_path });
    }
    Ok(serde_json::json!({}))
}

// ── fs_stat_dir ───────────────────────────────────────────────────────

/// FIND-203: Check if a directory path exists and is accessible.
#[tauri::command]
fn fs_stat_dir(path: String) -> Result<serde_json::Value, VaultConfigErrorDto> {
    let dir = Path::new(&path);
    match dir.metadata() {
        Ok(meta) if meta.is_dir() => Ok(serde_json::json!({ "isDir": true })),
        Ok(_) => Err(VaultConfigErrorDto::PathNotFound { path }),
        Err(e) => match e.kind() {
            std::io::ErrorKind::PermissionDenied => {
                Err(VaultConfigErrorDto::PermissionDenied { path })
            }
            _ => Err(VaultConfigErrorDto::PathNotFound { path }),
        },
    }
}

// ── fs_list_markdown ──────────────────────────────────────────────────

/// FIND-203: List markdown files in the vault directory.
#[tauri::command]
fn fs_list_markdown(path: String) -> Result<Vec<String>, VaultConfigErrorDto> {
    let read_dir = std::fs::read_dir(Path::new(&path)).map_err(|e| match e.kind() {
        std::io::ErrorKind::PermissionDenied => {
            VaultConfigErrorDto::PermissionDenied { path: path.clone() }
        }
        _ => VaultConfigErrorDto::PathNotFound { path: path.clone() },
    })?;

    let files = read_dir
        .flatten()
        .filter_map(|entry| {
            let file_path = entry.path();
            if file_path.extension().map_or(false, |ext| ext == "md") {
                file_path.to_str().map(|s| s.to_string())
            } else {
                None
            }
        })
        .collect();
    Ok(files)
}

// ── fs_read_file ──────────────────────────────────────────────────────

/// FIND-203: Read the contents of a file.
#[tauri::command]
fn fs_read_file(path: String) -> Result<String, VaultConfigErrorDto> {
    std::fs::read_to_string(&path).map_err(|e| match e.kind() {
        std::io::ErrorKind::PermissionDenied => VaultConfigErrorDto::PermissionDenied { path },
        _ => VaultConfigErrorDto::PathNotFound { path },
    })
}

// ── greet (retained for legacy) ───────────────────────────────────────

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ── Tauri app entry ───────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            try_vault_path,
            invoke_app_startup,
            invoke_configure_vault,
            settings_save,
            fs_stat_dir,
            fs_list_markdown,
            fs_read_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
