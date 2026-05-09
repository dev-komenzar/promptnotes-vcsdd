/// editor.rs — Rust backend handlers for ui-editor Sprint 8.
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
/// Sprint 8 IPC wire contract:
/// REQ-IPC-001..020 — EditingSessionStateDto is now a 5-arm tagged enum.
/// REQ-IPC-013 — All emit sites use the singular make_editing_state_changed_payload.
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

// ── DTOs (must match TS types.ts EditingSessionStateDto) ─────────────────────

/// Maps to TS FsError: { kind: 'permission' | 'disk-full' | 'lock' | 'not-found' | 'unknown' }
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct FsErrorDto {
    pub kind: String,
}

/// Maps to TS SaveError: { kind: 'fs' | 'validation', reason?: FsErrorDto }
/// reason is skipped when None (matches TS Option<FsErrorDto>).
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SaveErrorDto {
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<FsErrorDto>,
}

/// Maps to TS PendingNextFocus: { noteId: string; blockId: string }
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PendingNextFocusDto {
    pub note_id: String,
    pub block_id: String,
}

/// Maps to TS BlockType — the 9 valid block type literals.
/// Uses kebab-case with explicit renames for heading-1/2/3.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BlockTypeDto {
    Paragraph,
    #[serde(rename = "heading-1")]
    Heading1,
    #[serde(rename = "heading-2")]
    Heading2,
    #[serde(rename = "heading-3")]
    Heading3,
    Bullet,
    Numbered,
    Code,
    Quote,
    Divider,
}

/// Maps to TS DtoBlock: { id: string; type: BlockType; content: string }
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct DtoBlock {
    pub id: String,
    #[serde(rename = "type")]
    pub block_type: BlockTypeDto,
    pub content: String,
}

/// Maps to TS EditingSessionStateDto — 5-arm tagged union.
/// Discriminant field: `status` (kebab-case).
///
/// REQ-IPC-001: status values are "idle" | "editing" | "saving" | "switching" | "save-failed".
/// REQ-IPC-004: editing key-set is exactly {status, currentNoteId, focusedBlockId, isDirty, isNoteEmpty, lastSaveResult[, blocks]}.
/// REQ-IPC-005: saving key-set is exactly {status, currentNoteId, isNoteEmpty[, blocks]}.
/// REQ-IPC-006: switching key-set is exactly {status, currentNoteId, pendingNextFocus, isNoteEmpty[, blocks]}.
/// REQ-IPC-007: save-failed key-set is exactly {status, currentNoteId, priorFocusedBlockId, pendingNextFocus, lastSaveError, isNoteEmpty[, blocks]}.
/// REQ-IPC-011: blocks is omitted when None; present as array when Some.
///
/// IMPORTANT: focused_block_id / prior_focused_block_id / pending_next_focus (Option fields)
/// MUST NOT carry the skip-when-None serde attribute — they serialize as JSON null per
/// REQ-IPC-007 / §15.5 "Forbidden serde annotations on focus fields".
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum EditingSessionStateDto {
    Idle,
    Editing {
        #[serde(rename = "currentNoteId")]
        current_note_id: String,
        #[serde(rename = "focusedBlockId")]
        focused_block_id: Option<String>,
        #[serde(rename = "isDirty")]
        is_dirty: bool,
        #[serde(rename = "isNoteEmpty")]
        is_note_empty: bool,
        #[serde(rename = "lastSaveResult")]
        last_save_result: Option<String>,
        #[serde(rename = "blocks", skip_serializing_if = "Option::is_none")]
        blocks: Option<Vec<DtoBlock>>,
    },
    Saving {
        #[serde(rename = "currentNoteId")]
        current_note_id: String,
        #[serde(rename = "isNoteEmpty")]
        is_note_empty: bool,
        #[serde(rename = "blocks", skip_serializing_if = "Option::is_none")]
        blocks: Option<Vec<DtoBlock>>,
    },
    Switching {
        #[serde(rename = "currentNoteId")]
        current_note_id: String,
        #[serde(rename = "pendingNextFocus")]
        pending_next_focus: PendingNextFocusDto,
        #[serde(rename = "isNoteEmpty")]
        is_note_empty: bool,
        #[serde(rename = "blocks", skip_serializing_if = "Option::is_none")]
        blocks: Option<Vec<DtoBlock>>,
    },
    SaveFailed {
        #[serde(rename = "currentNoteId")]
        current_note_id: String,
        #[serde(rename = "priorFocusedBlockId")]
        prior_focused_block_id: Option<String>,
        #[serde(rename = "pendingNextFocus")]
        pending_next_focus: Option<PendingNextFocusDto>,
        #[serde(rename = "lastSaveError")]
        last_save_error: SaveErrorDto,
        #[serde(rename = "isNoteEmpty")]
        is_note_empty: bool,
        #[serde(rename = "blocks", skip_serializing_if = "Option::is_none")]
        blocks: Option<Vec<DtoBlock>>,
    },
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

// ── Compose helpers (per-variant pure constructors) ───────────────────────────

/// PROP-IPC-013 — Returns the Idle variant.
pub fn compose_state_idle() -> EditingSessionStateDto {
    EditingSessionStateDto::Idle
}

/// PROP-IPC-016 — Returns Editing after a successful save.
/// isDirty: false, lastSaveResult: "success", isNoteEmpty: body.is_empty().
pub fn compose_state_for_save_ok(note_id: &str, body: &str) -> EditingSessionStateDto {
    EditingSessionStateDto::Editing {
        current_note_id: note_id.to_string(),
        focused_block_id: None,
        is_dirty: false,
        is_note_empty: body.is_empty(),
        last_save_result: Some("success".to_string()),
        blocks: None,
    }
}

/// PROP-IPC-016 — Returns SaveFailed after a write error.
/// priorFocusedBlockId: null, pendingNextFocus: null.
pub fn compose_state_for_save_err(note_id: &str, body: &str, fs_err: FsErrorDto) -> EditingSessionStateDto {
    EditingSessionStateDto::SaveFailed {
        current_note_id: note_id.to_string(),
        prior_focused_block_id: None,
        pending_next_focus: None,
        last_save_error: SaveErrorDto {
            kind: "fs".to_string(),
            reason: Some(fs_err),
        },
        is_note_empty: body.is_empty(),
        blocks: None,
    }
}

/// PROP-IPC-014 — Returns Editing for cancel_switch.
/// REQ-IPC-015: isDirty: true, focusedBlockId: null, isNoteEmpty: false (conservative).
pub fn compose_state_for_cancel_switch(note_id: &str) -> EditingSessionStateDto {
    EditingSessionStateDto::Editing {
        current_note_id: note_id.to_string(),
        focused_block_id: None,
        is_dirty: true,
        is_note_empty: false,
        last_save_result: None,
        blocks: None,
    }
}

/// PROP-IPC-015 — Returns Editing for request_new_note.
/// REQ-IPC-018: isDirty: false, focusedBlockId: null, isNoteEmpty: true (new empty note).
pub fn compose_state_for_request_new_note(note_id: &str) -> EditingSessionStateDto {
    EditingSessionStateDto::Editing {
        current_note_id: note_id.to_string(),
        focused_block_id: None,
        is_dirty: false,
        is_note_empty: true,
        last_save_result: None,
        blocks: None,
    }
}

/// PROP-IPC-017 — Returns Editing for select_past_note.
/// REQ-IPC-014: isDirty: false, focusedBlockId: null, isNoteEmpty: body.is_empty().
pub fn compose_state_for_select_past_note(note_id: &str, body: &str) -> EditingSessionStateDto {
    EditingSessionStateDto::Editing {
        current_note_id: note_id.to_string(),
        focused_block_id: None,
        is_dirty: false,
        is_note_empty: body.is_empty(),
        last_save_result: None,
        blocks: None,
    }
}

// ── Payload helper (singular form) ────────────────────────────────────────────

/// REQ-IPC-012 / PROP-IPC-009: Wrap an EditingSessionStateDto in the
/// `{ "state": <variant> }` envelope expected by editorStateChannel.ts.
///
/// This is the ONLY form permitted in Sprint 8 — the legacy 6-positional-arg
/// form is removed. PROP-IPC-021 grep audit enforces this.
pub fn make_editing_state_changed_payload(state: &EditingSessionStateDto) -> serde_json::Value {
    serde_json::json!({ "state": state })
}

// ── Shared save helper ───────────────────────────────────────────────────────

/// Common write+emit logic shared by trigger_idle_save, trigger_blur_save,
/// and retry_save. Writes atomically then emits success/failure state.
fn save_note_and_emit(
    app: &AppHandle,
    note_id: String,
    body: String,
) -> Result<(), String> {
    let state = match fs_write_file_atomic(&note_id, &body) {
        Ok(()) => compose_state_for_save_ok(&note_id, &body),
        Err(io_err) => compose_state_for_save_err(&note_id, &body, io_err),
    };
    let payload = make_editing_state_changed_payload(&state);
    app.emit("editing_session_state_changed", payload)
        .map_err(|e| e.to_string())
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

/// ui-tag-chip: Exposes fs_write_file_atomic as a Tauri command for tag chip saves.
/// Accepts a file path and the complete markdown content (frontmatter + body).
#[tauri::command]
pub fn write_file_atomic(path: String, contents: String) -> Result<(), FsErrorDto> {
    fs_write_file_atomic(&path, &contents)
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
/// REQ-IPC-016: emits the Idle variant (only {"status":"idle"}).
#[tauri::command]
pub fn discard_current_session(
    app: AppHandle,
    note_id: String,
    issued_at: String,
) -> Result<(), String> {
    let _ = (note_id, issued_at);
    let state = compose_state_idle();
    let payload = make_editing_state_changed_payload(&state);
    app.emit("editing_session_state_changed", payload)
        .map_err(|e| e.to_string())
}

/// REQ-EDIT-033: cancel_switch — emit editing state, preserve dirty flag.
/// REQ-IPC-015: isDirty: true, focusedBlockId: null.
#[tauri::command]
pub fn cancel_switch(
    app: AppHandle,
    note_id: String,
    issued_at: String,
) -> Result<(), String> {
    let _ = issued_at;
    let state = compose_state_for_cancel_switch(&note_id);
    let payload = make_editing_state_changed_payload(&state);
    app.emit("editing_session_state_changed", payload)
        .map_err(|e| e.to_string())
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
/// REQ-IPC-018: emits Editing with isNoteEmpty: true, isDirty: false.
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

    // Emit editing state for the new note (REQ-IPC-018)
    let state = compose_state_for_request_new_note(&note_path);
    let payload = make_editing_state_changed_payload(&state);
    app.emit("editing_session_state_changed", payload)
        .map_err(|e| e.to_string())?;

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
    fn editing_session_state_idle_serializes_status_only() {
        let state = EditingSessionStateDto::Idle;
        let value = serde_json::to_value(&state).expect("serialize");
        let obj = value.as_object().expect("object");
        assert_eq!(obj.len(), 1, "Idle must have exactly one key");
        assert_eq!(obj.get("status").and_then(|v| v.as_str()), Some("idle"));
    }

    #[test]
    fn editing_session_state_editing_serializes_camel_case() {
        let state = EditingSessionStateDto::Editing {
            current_note_id: "/v/n.md".to_string(),
            focused_block_id: None,
            is_dirty: true,
            is_note_empty: false,
            last_save_result: None,
            blocks: None,
        };
        let json = serde_json::to_string(&state).expect("serialize");
        assert!(json.contains("\"currentNoteId\""), "camelCase currentNoteId: {}", json);
        assert!(json.contains("\"focusedBlockId\""), "camelCase focusedBlockId: {}", json);
        assert!(json.contains("\"isDirty\""), "camelCase isDirty: {}", json);
        assert!(json.contains("\"isNoteEmpty\""), "camelCase isNoteEmpty: {}", json);
        assert!(json.contains("\"lastSaveResult\""), "camelCase lastSaveResult: {}", json);
        assert!(!json.contains("\"blocks\""), "blocks absent when None: {}", json);
    }

    #[test]
    fn save_error_dto_skips_reason_when_none() {
        let err = SaveErrorDto {
            kind: "validation".to_string(),
            reason: None,
        };
        let json = serde_json::to_string(&err).expect("serialize");
        assert!(!json.contains("\"reason\""), "reason absent when None: {}", json);
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
        assert!(json.contains("\"reason\""), "reason present when Some: {}", json);
        assert!(json.contains("\"disk-full\""));
    }

    #[test]
    fn save_failed_null_literals_are_present() {
        let state = EditingSessionStateDto::SaveFailed {
            current_note_id: "n1".to_string(),
            prior_focused_block_id: None,
            pending_next_focus: None,
            last_save_error: SaveErrorDto {
                kind: "fs".to_string(),
                reason: None,
            },
            is_note_empty: false,
            blocks: None,
        };
        let json = serde_json::to_string(&state).expect("serialize");
        assert!(
            json.contains("\"priorFocusedBlockId\":null"),
            "priorFocusedBlockId must be null literal: {}",
            json
        );
        assert!(
            json.contains("\"pendingNextFocus\":null"),
            "pendingNextFocus must be null literal: {}",
            json
        );
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

    // ── make_editing_state_changed_payload (singular form) ────────────────

    #[test]
    fn make_payload_wraps_in_state_key() {
        let state = compose_state_idle();
        let payload = make_editing_state_changed_payload(&state);
        let json = serde_json::to_string(&payload).expect("serialize");
        assert!(json.starts_with("{\"state\":"), "Must wrap in state: {}", json);
    }

    #[test]
    fn make_payload_editing_state() {
        let state = compose_state_for_select_past_note("/v/n.md", "hello");
        let payload = make_editing_state_changed_payload(&state);
        let json = serde_json::to_string(&payload).expect("serialize");
        assert!(json.contains("\"editing\""));
        assert!(json.contains("\"isDirty\":false"));
        assert!(json.contains("\"/v/n.md\""));
    }

    #[test]
    fn make_payload_save_failed_state() {
        let fs_err = FsErrorDto { kind: "permission".to_string() };
        let state = compose_state_for_save_err("/v/n.md", "draft", fs_err);
        let payload = make_editing_state_changed_payload(&state);
        let json = serde_json::to_string(&payload).expect("serialize");
        assert!(json.contains("\"save-failed\""));
        assert!(json.contains("\"permission\""));
    }

    // ── compose_* helpers ─────────────────────────────────────────────────

    #[test]
    fn compose_idle_returns_idle() {
        assert_eq!(compose_state_idle(), EditingSessionStateDto::Idle);
    }

    #[test]
    fn compose_save_ok_is_dirty_false() {
        let state = compose_state_for_save_ok("/v/n.md", "body");
        match state {
            EditingSessionStateDto::Editing { is_dirty, last_save_result, .. } => {
                assert!(!is_dirty);
                assert_eq!(last_save_result.as_deref(), Some("success"));
            }
            _ => panic!("Expected Editing"),
        }
    }

    #[test]
    fn compose_cancel_switch_is_dirty_true() {
        let state = compose_state_for_cancel_switch("/v/n.md");
        match state {
            EditingSessionStateDto::Editing { is_dirty, .. } => assert!(is_dirty),
            _ => panic!("Expected Editing"),
        }
    }

    #[test]
    fn compose_request_new_note_is_note_empty_true() {
        let state = compose_state_for_request_new_note("/v/new.md");
        match state {
            EditingSessionStateDto::Editing { is_note_empty, .. } => assert!(is_note_empty),
            _ => panic!("Expected Editing"),
        }
    }
}
