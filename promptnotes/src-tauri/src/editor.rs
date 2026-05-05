/// editor.rs — Rust backend handlers for ui-editor Sprint 2.
///
/// REQ-EDIT-028: edit_note_body command
/// REQ-EDIT-029: trigger_idle_save command
/// REQ-EDIT-030: trigger_blur_save command
/// REQ-EDIT-031: retry_save command
/// REQ-EDIT-032: discard_current_session command
/// REQ-EDIT-033: cancel_switch command
/// REQ-EDIT-034: copy_note_body command
/// REQ-EDIT-035: request_new_note command
/// REQ-EDIT-036: editing_session_state_changed event emit rules
/// REQ-EDIT-037: fs_write_file_atomic implementation
///
/// All DTOs use `#[serde(rename_all = "camelCase")]` to match the TypeScript
/// EditingSessionState type in `src/lib/editor/types.ts`.
///
/// Design: this module is a thin IPC shell. No domain logic is re-implemented
/// here. The Rust side is responsible only for:
///   1. Performing OS-level I/O (file write, file creation)
///   2. Emitting `editing_session_state_changed` events with typed payloads
///
/// The clipboard write is handled by the TypeScript `clipboardAdapter.ts`
/// using `navigator.clipboard.writeText()` — Rust `copy_note_body` is a thin ack.
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, Emitter};

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(0);

// ── DTOs (must match TS types.ts EditingSessionState) ────────────────────────

/// Maps to TS FsError: { kind: 'permission' | 'disk-full' | 'lock' | 'unknown' }
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FsErrorDto {
    pub kind: String,
}

/// Maps to TS SaveError: { kind: 'fs' | 'validation', reason?: FsErrorDto }
/// reason is skipped when None (matches TS Option<FsErrorDto>).
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SaveErrorDto {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<FsErrorDto>,
}

/// Maps to TS EditingSessionState:
/// { status, isDirty, currentNoteId, pendingNextNoteId, lastError, body }
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EditingSessionStateDto {
    pub status: String,
    pub is_dirty: bool,
    pub current_note_id: Option<String>,
    pub pending_next_note_id: Option<String>,
    pub last_error: Option<SaveErrorDto>,
    pub body: String,
}

// ── Error mapping ─────────────────────────────────────────────────────────────

/// REQ-EDIT-037: Map std::io::ErrorKind to FsErrorDto.kind string.
fn io_error_to_fs_kind(kind: std::io::ErrorKind) -> String {
    match kind {
        std::io::ErrorKind::PermissionDenied => "permission".to_string(),
        std::io::ErrorKind::AlreadyExists | std::io::ErrorKind::AddrInUse => "lock".to_string(),
        std::io::ErrorKind::StorageFull
        | std::io::ErrorKind::WriteZero
        | std::io::ErrorKind::TimedOut => "disk-full".to_string(),
        _ => "unknown".to_string(),
    }
}

// ── fs_write_file_atomic ──────────────────────────────────────────────────────

/// REQ-EDIT-037: Atomic file write using tempfile + rename pattern.
///
/// 1. Write content to a temp file in the same directory as the target.
/// 2. fsync the temp file data (`file.sync_all()`).
/// 3. Rename the temp file to the target path.
///
/// On success, the target file contains exactly `contents`.
/// On failure, the target file is NOT modified (atomicity from rename).
///
/// No `unsafe`, no `unwrap()`. `unwrap_or_else` used only for parent fallback on paths.
pub fn fs_write_file_atomic(target_path: &str, contents: &str) -> Result<(), FsErrorDto> {
    let target = Path::new(target_path);

    // Determine parent directory
    let parent = target.parent().unwrap_or_else(|| Path::new("."));

    // Generate a unique temp file name in the same directory.
    // Combines nanos timestamp + atomic counter to avoid collision.
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| FsErrorDto {
            kind: "unknown".to_string(),
        })?
        .as_nanos();
    let counter = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    let temp_suffix = format!(".tmp.{}.{}", nanos, counter);
    let temp_path = if let Some(stem) = target.file_stem().and_then(|s| s.to_str()) {
        parent.join(format!("{}{}.md", stem, temp_suffix))
    } else {
        parent.join(format!("untitled{}.md", temp_suffix))
    };

    // Write to temp file
    {
        let mut file = std::fs::File::create(&temp_path).map_err(|e| FsErrorDto {
            kind: io_error_to_fs_kind(e.kind()),
        })?;
        file.write_all(contents.as_bytes()).map_err(|e| FsErrorDto {
            kind: io_error_to_fs_kind(e.kind()),
        })?;
        file.sync_all().map_err(|e| FsErrorDto {
            kind: io_error_to_fs_kind(e.kind()),
        })?;
    }

    // Atomic rename
    std::fs::rename(&temp_path, target).map_err(|e| {
        // Best-effort cleanup of temp file on rename failure
        let _ = std::fs::remove_file(&temp_path);
        FsErrorDto {
            kind: io_error_to_fs_kind(e.kind()),
        }
    })?;

    Ok(())
}

// ── Frontmatter generation ────────────────────────────────────────────────────

/// REQ-EDIT-035: Generate YAML frontmatter for a new note.
///
/// Format:
/// ```yaml
/// ---
/// createdAt: <epoch_ms>
/// updatedAt: <epoch_ms>
/// tags: []
/// ---
///
/// ```
/// (trailing newline for empty body)
pub fn generate_frontmatter(now_ms: i64) -> String {
    format!(
        "---\ncreatedAt: {}\nupdatedAt: {}\ntags: []\n---\n\n",
        now_ms, now_ms
    )
}

// ── Payload helper ────────────────────────────────────────────────────────────

/// REQ-EDIT-036: Construct the `{ state: EditingSessionStateDto }` payload
/// wrapper that matches editorStateChannel.ts's `event.payload.state` access pattern.
pub fn make_editing_state_changed_payload(
    status: &str,
    is_dirty: bool,
    current_note_id: Option<String>,
    pending_next_note_id: Option<String>,
    last_error: Option<SaveErrorDto>,
    body: &str,
) -> serde_json::Value {
    let state = EditingSessionStateDto {
        status: status.to_string(),
        is_dirty,
        current_note_id,
        pending_next_note_id,
        last_error,
        body: body.to_string(),
    };
    serde_json::json!({ "state": state })
}

/// Emit `editing_session_state_changed` with the given payload.
fn emit_state_changed(
    app: &AppHandle,
    status: &str,
    is_dirty: bool,
    current_note_id: Option<String>,
    pending_next_note_id: Option<String>,
    last_error: Option<SaveErrorDto>,
    body: &str,
) -> Result<(), String> {
    let payload = make_editing_state_changed_payload(
        status, is_dirty, current_note_id, pending_next_note_id, last_error, body,
    );
    app.emit("editing_session_state_changed", payload)
        .map_err(|e| e.to_string())
}

// ── Shared save helper ───────────────────────────────────────────────────────

/// Common write+emit logic shared by trigger_idle_save, trigger_blur_save,
/// and retry_save. Writes atomically then emits success/failure state.
fn save_note_and_emit(
    app: &AppHandle,
    note_id: String,
    body: String,
) -> Result<(), String> {
    match fs_write_file_atomic(&note_id, &body) {
        Ok(()) => {
            emit_state_changed(app, "editing", false, Some(note_id), None, None, &body)
        }
        Err(io_err) => {
            let save_err = SaveErrorDto {
                kind: "fs".to_string(),
                reason: Some(io_err),
            };
            emit_state_changed(
                app, "save-failed", true, Some(note_id), None, Some(save_err), &body,
            )
        }
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// REQ-EDIT-028: edit_note_body — thin acknowledgement, no side effects.
/// The body buffer is owned by the TS editorReducer; Rust just acks.
#[tauri::command]
pub fn edit_note_body(
    note_id: String,
    new_body: String,
    issued_at: String,
    dirty: bool,
) -> Result<(), String> {
    let _ = (note_id, new_body, issued_at, dirty);
    Ok(())
}

/// REQ-EDIT-029: trigger_idle_save — atomic write + emit state.
#[tauri::command]
pub fn trigger_idle_save(
    app: AppHandle,
    note_id: String,
    body: String,
    issued_at: String,
    source: String,
) -> Result<(), String> {
    eprintln!("[editor] trigger_idle_save note={} source={} issued_at={}", note_id, source, issued_at);
    save_note_and_emit(&app, note_id, body)
}

/// REQ-EDIT-030: trigger_blur_save — atomic write + emit state.
#[tauri::command]
pub fn trigger_blur_save(
    app: AppHandle,
    note_id: String,
    body: String,
    issued_at: String,
    source: String,
) -> Result<(), String> {
    eprintln!("[editor] trigger_blur_save note={} source={} issued_at={}", note_id, source, issued_at);
    save_note_and_emit(&app, note_id, body)
}

/// REQ-EDIT-031: retry_save — re-attempt atomic write + emit state.
#[tauri::command]
pub fn retry_save(
    app: AppHandle,
    note_id: String,
    body: String,
    issued_at: String,
) -> Result<(), String> {
    let _ = issued_at;
    save_note_and_emit(&app, note_id, body)
}

/// REQ-EDIT-032: discard_current_session — emit idle state, no file I/O.
#[tauri::command]
pub fn discard_current_session(
    app: AppHandle,
    note_id: String,
    issued_at: String,
) -> Result<(), String> {
    let _ = (note_id, issued_at);
    emit_state_changed(&app, "idle", false, None, None, None, "")
}

/// REQ-EDIT-033: cancel_switch — emit editing state, preserve dirty flag.
/// No file I/O — just emit that we're back in editing mode.
#[tauri::command]
pub fn cancel_switch(
    app: AppHandle,
    note_id: String,
    issued_at: String,
) -> Result<(), String> {
    let _ = issued_at;
    emit_state_changed(
        &app, "editing", true, Some(note_id), None, None, "",
    )
}

/// REQ-EDIT-034: copy_note_body — thin acknowledgement.
/// Clipboard write is handled by TS clipboardAdapter.ts (navigator.clipboard API).
/// Rust does NOT access the OS clipboard.
/// Parameter shape matches TS adapter: `{ noteId: string; body: string }` only.
#[tauri::command]
pub fn copy_note_body(
    note_id: String,
    body: String,
) -> Result<(), String> {
    let _ = (note_id, body);
    Ok(())
}

/// REQ-EDIT-035: request_new_note — generate new note ID, create empty .md file
/// with frontmatter, emit editing state.
///
/// Vault path is read from settings via `settings_load_impl()`.
#[tauri::command]
pub fn request_new_note(
    app: AppHandle,
    source: String,
    issued_at: String,
) -> Result<(), String> {
    let _ = (source, issued_at);

    // Read vault path from settings
    let vault_path = crate::settings_load_impl()
        .map_err(|_| "Failed to read vault settings".to_string())?
        .ok_or_else(|| "Vault not configured".to_string())?;

    // Generate unique note ID using timestamp nanos
    let now_ns = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "System clock error".to_string())?
        .as_nanos();
    let note_path = format!("{}/{}.md", vault_path.trim_end_matches('/'), now_ns);

    // Current epoch ms for frontmatter
    let now_ms = now_ns as i64 / 1_000_000;

    // Create the .md file atomically with frontmatter
    let contents = generate_frontmatter(now_ms);
    fs_write_file_atomic(&note_path, &contents)
        .map_err(|e| format!("Failed to create new note: {:?}", e))?;

    // Emit editing state for the new note
    emit_state_changed(
        &app, "editing", false, Some(note_path.clone()), None, None, "",
    )?;

    // Emit feed_state_changed so the feed sidebar refreshes with the new note
    let (visible_note_ids, note_metadata) = crate::feed::scan_vault_feed(&vault_path);
    let feed_snapshot = crate::feed::FeedDomainSnapshotDto {
        editing: crate::feed::idle_editing(),
        feed: crate::feed::FeedSubDto {
            visible_note_ids,
            filter_applied: false,
        },
        delete: crate::feed::no_delete(),
        note_metadata,
        cause: crate::feed::CauseDto::NoteFileSaved {
            saved_note_id: note_path,
        },
    };
    app.emit("feed_state_changed", feed_snapshot)
        .map_err(|e| e.to_string())
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── DTO serialization ─────────────────────────────────────────────────

    #[test]
    fn editing_session_state_dto_serializes_camel_case_inline() {
        let state = EditingSessionStateDto {
            status: "editing".to_string(),
            is_dirty: true,
            current_note_id: Some("/v/n.md".to_string()),
            pending_next_note_id: None,
            last_error: None,
            body: "text".to_string(),
        };
        let json = serde_json::to_string(&state).expect("serialize");
        assert!(json.contains("\"currentNoteId\""));
        assert!(json.contains("\"pendingNextNoteId\""));
        assert!(json.contains("\"isDirty\""));
        assert!(json.contains("\"lastError\":null"));
    }

    #[test]
    fn save_error_dto_skips_reason_when_none() {
        let err = SaveErrorDto {
            kind: "validation".to_string(),
            reason: None,
        };
        let json = serde_json::to_string(&err).expect("serialize");
        assert!(!json.contains("\"reason\""));
    }

    #[test]
    fn save_error_dto_includes_reason_when_some() {
        let err = SaveErrorDto {
            kind: "fs".to_string(),
            reason: Some(FsErrorDto {
                kind: "disk-full".to_string(),
            }),
        };
        let json = serde_json::to_string(&err).expect("serialize");
        assert!(json.contains("\"reason\""));
        assert!(json.contains("\"disk-full\""));
    }

    // ── Error mapping ─────────────────────────────────────────────────────

    #[test]
    fn io_error_to_fs_kind_permission_denied() {
        assert_eq!(
            io_error_to_fs_kind(std::io::ErrorKind::PermissionDenied),
            "permission"
        );
    }

    #[test]
    fn io_error_to_fs_kind_already_exists() {
        assert_eq!(
            io_error_to_fs_kind(std::io::ErrorKind::AlreadyExists),
            "lock"
        );
    }

    #[test]
    fn io_error_to_fs_kind_storage_full() {
        assert_eq!(
            io_error_to_fs_kind(std::io::ErrorKind::StorageFull),
            "disk-full"
        );
    }

    #[test]
    fn io_error_to_fs_kind_unknown() {
        assert_eq!(
            io_error_to_fs_kind(std::io::ErrorKind::NotFound),
            "unknown"
        );
    }

    #[test]
    fn io_error_to_fs_kind_all_variants_testable() {
        // PROP-102: Verify key mappings
        use std::io::ErrorKind;
        let cases = vec![
            (ErrorKind::PermissionDenied, "permission"),
            (ErrorKind::AlreadyExists, "lock"),
            (ErrorKind::AddrInUse, "lock"),
            (ErrorKind::StorageFull, "disk-full"),
            (ErrorKind::WriteZero, "disk-full"),
            (ErrorKind::TimedOut, "disk-full"),
            (ErrorKind::NotFound, "unknown"),
            (ErrorKind::ConnectionRefused, "unknown"),
            (ErrorKind::Interrupted, "unknown"),
        ];
        for (kind, expected) in &cases {
            assert_eq!(
                io_error_to_fs_kind(*kind),
                *expected,
                "ErrorKind::{:?} should map to '{}'",
                kind,
                expected
            );
        }
    }

    // ── fs_write_file_atomic ──────────────────────────────────────────────

    #[test]
    fn fs_write_file_atomic_writes_and_reads_back() {
        let target = "/tmp/promptnotes-unit-atomic-test.md";
        let _ = std::fs::remove_file(target);

        let result = fs_write_file_atomic(target, "# Content");
        assert!(result.is_ok(), "write must succeed: {:?}", result);

        let content = std::fs::read_to_string(target).expect("read");
        assert_eq!(content, "# Content");

        let _ = std::fs::remove_file(target);
    }

    #[test]
    fn fs_write_file_atomic_overwrites_existing() {
        let target = "/tmp/promptnotes-unit-atomic-overwrite.md";
        let _ = std::fs::remove_file(target);

        std::fs::write(target, "old").expect("write old");
        let result = fs_write_file_atomic(target, "new");
        assert!(result.is_ok(), "overwrite must succeed: {:?}", result);

        let content = std::fs::read_to_string(target).expect("read");
        assert_eq!(content, "new");

        let _ = std::fs::remove_file(target);
    }

    #[test]
    fn fs_write_file_atomic_handles_unicode() {
        let target = "/tmp/promptnotes-unit-atomic-unicode-日本語.md";
        let _ = std::fs::remove_file(target);

        let result = fs_write_file_atomic(target, "こんにちは世界\n# テスト");
        assert!(result.is_ok(), "unicode write must succeed: {:?}", result);

        let content = std::fs::read_to_string(target).expect("read");
        assert_eq!(content, "こんにちは世界\n# テスト");

        let _ = std::fs::remove_file(target);
    }

    // ── generate_frontmatter ──────────────────────────────────────────────

    #[test]
    fn generate_frontmatter_has_correct_structure() {
        let fm = generate_frontmatter(1700000000000);
        let lines: Vec<&str> = fm.lines().collect();
        assert_eq!(lines[0], "---", "Must start with ---");
        assert!(lines[1].starts_with("createdAt: 1700000000000"));
        assert!(lines[2].starts_with("updatedAt: 1700000000000"));
        assert_eq!(lines[3], "tags: []");
        assert_eq!(lines[4], "---");
        assert_eq!(lines.len(), 6, "Must have empty line after --- (body placeholder)");
    }

    // ── make_editing_state_changed_payload ────────────────────────────────

    #[test]
    fn make_payload_wraps_in_state_key() {
        let payload = make_editing_state_changed_payload(
            "idle", false, None, None, None, "",
        );
        let json = serde_json::to_string(&payload).expect("serialize");
        assert!(json.starts_with("{\"state\":"), "Must wrap in state: {}", json);
    }

    #[test]
    fn make_payload_editing_state() {
        let payload = make_editing_state_changed_payload(
            "editing", false, Some("/v/n.md".to_string()), None, None, "hello",
        );
        let json = serde_json::to_string(&payload).expect("serialize");
        assert!(json.contains("\"editing\""));
        assert!(json.contains("\"isDirty\":false"));
        assert!(json.contains("\"/v/n.md\""));
        assert!(json.contains("\"hello\""));
    }

    #[test]
    fn make_payload_save_failed_state() {
        let err = SaveErrorDto {
            kind: "fs".to_string(),
            reason: Some(FsErrorDto {
                kind: "permission".to_string(),
            }),
        };
        let payload = make_editing_state_changed_payload(
            "save-failed", true, Some("/v/n.md".to_string()), None, Some(err), "draft",
        );
        let json = serde_json::to_string(&payload).expect("serialize");
        assert!(json.contains("\"save-failed\""));
        assert!(json.contains("\"isDirty\":true"));
        assert!(json.contains("\"permission\""));
    }
}
