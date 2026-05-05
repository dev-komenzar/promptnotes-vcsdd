// VCSDD ui-app-shell Phase 2b — Tauri command implementations.
//
// FIND-203: Register all IPC commands invoked by tauriAdapter.ts.
// Commands registered:
//   - try_vault_path        (path validation)
//   - invoke_configure_vault (validate dir + persist settings)
//   - settings_load         (read persisted vault path — FIND-401/402)
//   - settings_save         (persist vault path to OS config dir)
//   - fs_stat_dir           (vault directory existence check)
//   - fs_list_markdown      (markdown file listing in vault)
//   - fs_read_file          (file content reading)
//
// FIND-401: invoke_app_startup removed from Tauri side. Orchestration moves
//   to the TS side (Option A): createTauriAdapter.invokeAppStartup() calls
//   settings_load + fs_stat_dir + fs_list_markdown + fs_read_file primitives
//   and runs the pure TS pipeline (runAppStartupPipeline).
//
// FIND-402: invoke_configure_vault now calls settings_save_impl to persist
//   the settings JSON to the OS-appropriate config directory.
//
// FIND-405: try_vault_path uses Path::new(&path).is_absolute() (cross-platform).
//
// FIND-214: invoke_configure_vault receives { path } not { vaultPath }.

use serde::{Deserialize, Serialize};
use std::path::Path;

pub mod domain;
pub mod editor;
pub mod feed;

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

// ── Settings file helpers ─────────────────────────────────────────────

/// FIND-402: Returns the path to the settings JSON file using the OS-appropriate
/// config directory. On Linux: ~/.config/promptnotes/settings.json.
/// Falls back to ~/.promptnotes/settings.json if dirs unavailable.
fn settings_file_path() -> std::path::PathBuf {
    let config_dir = std::env::var("XDG_CONFIG_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| {
            #[cfg(target_os = "windows")]
            {
                std::env::var("APPDATA")
                    .map(std::path::PathBuf::from)
                    .unwrap_or_else(|_| {
                        let mut p = std::env::temp_dir();
                        p.push("promptnotes-config");
                        p
                    })
            }
            #[cfg(not(target_os = "windows"))]
            {
                let mut home = std::env::var("HOME")
                    .map(std::path::PathBuf::from)
                    .unwrap_or_else(|_| std::path::PathBuf::from("/tmp"));
                home.push(".config");
                home
            }
        });

    let mut p = config_dir;
    p.push("promptnotes");
    p.push("settings.json");
    p
}

/// FIND-402: Write vault path to settings.json.
/// Creates the parent directory if it does not exist.
fn settings_save_impl(vault_path: &str) -> Result<(), VaultConfigErrorDto> {
    let settings_path = settings_file_path();

    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent).map_err(|_| VaultConfigErrorDto::PermissionDenied {
            path: parent.to_string_lossy().to_string(),
        })?;
    }

    let contents = serde_json::json!({ "vaultPath": vault_path });
    std::fs::write(&settings_path, contents.to_string()).map_err(|e| match e.kind() {
        std::io::ErrorKind::PermissionDenied => VaultConfigErrorDto::PermissionDenied {
            path: settings_path.to_string_lossy().to_string(),
        },
        _ => VaultConfigErrorDto::PathNotFound {
            path: settings_path.to_string_lossy().to_string(),
        },
    })?;

    Ok(())
}

/// FIND-401: Read vault path from settings.json.
/// Returns Ok(Some(path)) if configured, Ok(None) if unconfigured.
pub(crate) fn settings_load_impl() -> Result<Option<String>, VaultConfigErrorDto> {
    let settings_path = settings_file_path();

    if !settings_path.exists() {
        return Ok(None);
    }

    let contents = std::fs::read_to_string(&settings_path).map_err(|e| match e.kind() {
        std::io::ErrorKind::PermissionDenied => VaultConfigErrorDto::PermissionDenied {
            path: settings_path.to_string_lossy().to_string(),
        },
        _ => VaultConfigErrorDto::PathNotFound {
            path: settings_path.to_string_lossy().to_string(),
        },
    })?;

    let parsed: serde_json::Value =
        serde_json::from_str(&contents).unwrap_or(serde_json::Value::Null);

    let vault_path = parsed
        .get("vaultPath")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    Ok(vault_path)
}

// ── try_vault_path ────────────────────────────────────────────────────

/// FIND-203: Validates the raw path string using VaultPath smart constructor rules.
/// Returns Ok(String) with the validated path, or Err(VaultPathError).
///
/// FIND-405: Use std::path::Path::new(&path).is_absolute() instead of
/// starts_with('/') — this handles C:\foo on Windows, /foo on Unix, and
/// \\?\C:\foo UNC paths.
#[tauri::command]
fn try_vault_path(raw_path: String) -> Result<String, VaultPathErrorDto> {
    if raw_path.trim().is_empty() {
        return Err(VaultPathErrorDto::Empty);
    }
    if !Path::new(&raw_path).is_absolute() {
        return Err(VaultPathErrorDto::NotAbsolute);
    }
    Ok(raw_path)
}

// ── invoke_configure_vault ────────────────────────────────────────────

/// FIND-203 / FIND-214 / FIND-402:
/// Receives { path } (not { vaultPath }).
/// Validates the vault path exists as a directory, then persists settings.
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

    // FIND-402: Persist settings after successful validation.
    settings_save_impl(&path)?;

    Ok(serde_json::json!({}))
}

// ── settings_load ─────────────────────────────────────────────────────

/// FIND-401: Read persisted vault path from settings.json.
/// Returns the vault path string if configured, or null if not yet configured.
/// Called by the TS-side pipeline orchestrator (Option A: TS owns the pipeline).
#[tauri::command]
fn settings_load() -> Result<Option<String>, VaultConfigErrorDto> {
    settings_load_impl()
}

// ── settings_save ─────────────────────────────────────────────────────

/// FIND-402: Persist vault path to settings.json in the OS config directory.
#[tauri::command]
fn settings_save(vault_path: String) -> Result<serde_json::Value, VaultConfigErrorDto> {
    settings_save_impl(&vault_path)?;
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
            invoke_configure_vault,
            settings_load,
            settings_save,
            fs_stat_dir,
            fs_list_markdown,
            fs_read_file,
            // Sprint 2: ui-feed-list-actions Rust handlers (REQ-FEED-019..022)
            feed::select_past_note,
            feed::request_note_deletion,
            feed::confirm_note_deletion,
            feed::cancel_note_deletion,
            feed::fs_trash_file,
            feed::feed_initial_state,
            // Sprint 2: ui-editor Rust handlers (REQ-EDIT-028..035)
            editor::edit_note_body,
            editor::trigger_idle_save,
            editor::trigger_blur_save,
            editor::retry_save,
            editor::discard_current_session,
            editor::cancel_switch,
            editor::copy_note_body,
            editor::request_new_note,
            // ui-tag-chip: tag chip save
            editor::write_file_atomic,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
