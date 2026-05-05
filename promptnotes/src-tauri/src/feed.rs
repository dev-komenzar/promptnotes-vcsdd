/// feed.rs — Rust backend handlers for ui-feed-list-actions Sprint 2.
///
/// REQ-FEED-019: fs_trash_file command
/// REQ-FEED-020: select_past_note, request_note_deletion,
///               confirm_note_deletion, cancel_note_deletion handlers
/// REQ-FEED-021: feed_state_changed event emit rules
/// REQ-FEED-022: feed_initial_state command
///
/// All DTOs use `#[serde(rename_all = "camelCase")]` to match the TypeScript
/// FeedDomainSnapshot type in `src/lib/feed/types.ts`.
///
/// Design: this module is a thin IPC shell. No domain logic is re-implemented
/// here. State management is client-side (TypeScript feedReducer). The Rust
/// side is responsible only for:
///   1. Performing OS-level I/O (file deletion, file listing)
///   2. Emitting `feed_state_changed` events with typed payloads

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tauri::{AppHandle, Emitter};

// ── TrashErrorDto ─────────────────────────────────────────────────────────────

/// Error variants for fs_trash_file.
/// Serialized as tagged union: { "kind": "permission" } etc.
/// Matches NoteDeletionFailureReason in types.ts ('permission' | 'lock' | 'unknown').
///
/// REQ-FEED-019: permission/lock/unknown variants.
/// Note: 'lock' is not directly detectable on all platforms via std::io; we
/// map it to 'unknown' in practice. The variant is kept in the type for
/// forward compatibility.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum TrashErrorDto {
    Permission,
    Lock,
    Unknown { detail: Option<String> },
}

// ── FeedDomainSnapshot DTOs ───────────────────────────────────────────────────
// These mirror the TypeScript FeedDomainSnapshot type in types.ts exactly.
// All fields use camelCase via serde(rename_all = "camelCase").

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EditingSubDto {
    pub status: String,
    pub current_note_id: Option<String>,
    pub pending_next_note_id: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FeedSubDto {
    pub visible_note_ids: Vec<String>,
    pub filter_applied: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeletionErrorDto {
    pub reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeleteSubDto {
    pub active_delete_modal_note_id: Option<String>,
    pub last_deletion_error: Option<DeletionErrorDto>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteRowMetadataDto {
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub tags: Vec<String>,
}

/// Cause discriminated union — matches FeedDomainSnapshot.cause in types.ts.
/// Uses serde tag = "kind" with rename_all = "camelCase" so variant names
/// serialize as-is (PascalCase variants → need explicit rename).
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "kind")]
pub enum CauseDto {
    #[serde(rename = "NoteFileSaved")]
    NoteFileSaved {
        #[serde(rename = "savedNoteId")]
        saved_note_id: String,
    },
    #[serde(rename = "NoteFileDeleted")]
    NoteFileDeleted {
        #[serde(rename = "deletedNoteId")]
        deleted_note_id: String,
    },
    #[serde(rename = "NoteDeletionFailed")]
    NoteDeletionFailed {
        #[serde(rename = "failedNoteId")]
        failed_note_id: String,
    },
    #[serde(rename = "EditingStateChanged")]
    EditingStateChanged,
    #[serde(rename = "InitialLoad")]
    InitialLoad,
}

/// Top-level snapshot DTO. Mirrors FeedDomainSnapshot in types.ts.
/// REQ-FEED-021: every feed_state_changed event carries this payload.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FeedDomainSnapshotDto {
    pub editing: EditingSubDto,
    pub feed: FeedSubDto,
    pub delete: DeleteSubDto,
    pub note_metadata: HashMap<String, NoteRowMetadataDto>,
    pub cause: CauseDto,
}

// ── Default / helper constructors ─────────────────────────────────────────────

fn idle_editing() -> EditingSubDto {
    EditingSubDto {
        status: "idle".to_string(),
        current_note_id: None,
        pending_next_note_id: None,
    }
}

fn empty_feed() -> FeedSubDto {
    FeedSubDto {
        visible_note_ids: vec![],
        filter_applied: false,
    }
}

fn no_delete() -> DeleteSubDto {
    DeleteSubDto {
        active_delete_modal_note_id: None,
        last_deletion_error: None,
    }
}

/// Build a snapshot for EditingStateChanged (used by select_past_note).
fn make_editing_state_changed_snapshot(note_id: &str) -> FeedDomainSnapshotDto {
    FeedDomainSnapshotDto {
        editing: EditingSubDto {
            status: "editing".to_string(),
            current_note_id: Some(note_id.to_string()),
            pending_next_note_id: None,
        },
        feed: empty_feed(),
        delete: no_delete(),
        note_metadata: HashMap::new(),
        cause: CauseDto::EditingStateChanged,
    }
}

/// Build a snapshot for NoteFileDeleted (used by confirm_note_deletion on success).
fn make_note_deleted_snapshot(note_id: &str) -> FeedDomainSnapshotDto {
    FeedDomainSnapshotDto {
        editing: idle_editing(),
        feed: empty_feed(),
        delete: no_delete(),
        note_metadata: HashMap::new(),
        cause: CauseDto::NoteFileDeleted {
            deleted_note_id: note_id.to_string(),
        },
    }
}

/// Build a snapshot for NoteDeletionFailed (used by confirm_note_deletion on error).
fn make_deletion_failed_snapshot(note_id: &str, err: &TrashErrorDto) -> FeedDomainSnapshotDto {
    let (reason, detail) = match err {
        TrashErrorDto::Permission => ("permission".to_string(), None),
        TrashErrorDto::Lock => ("lock".to_string(), None),
        TrashErrorDto::Unknown { detail } => ("unknown".to_string(), detail.clone()),
    };
    FeedDomainSnapshotDto {
        editing: idle_editing(),
        feed: empty_feed(),
        delete: DeleteSubDto {
            active_delete_modal_note_id: Some(note_id.to_string()),
            last_deletion_error: Some(DeletionErrorDto { reason, detail }),
        },
        note_metadata: HashMap::new(),
        cause: CauseDto::NoteDeletionFailed {
            failed_note_id: note_id.to_string(),
        },
    }
}

// ── fs_trash_file_impl (pure-ish, testable without AppHandle) ─────────────────

/// REQ-FEED-019: Move file at `path` to trash / delete it.
///
/// Implementation note: Uses `std::fs::remove_file` as a minimal implementation.
/// True OS trash requires the `trash` crate (Phase 5 upgrade path).
///
/// Error mapping:
///   NotFound          → Ok(()) (already deleted — REQ-DLN-005)
///   PermissionDenied  → Err(TrashErrorDto::Permission)
///   Other             → Err(TrashErrorDto::Unknown { detail: Some(e.to_string()) })
pub fn fs_trash_file_impl(path: &str) -> Result<(), TrashErrorDto> {
    match std::fs::remove_file(path) {
        Ok(_) => Ok(()),
        Err(e) => match e.kind() {
            std::io::ErrorKind::NotFound => Ok(()), // already deleted
            std::io::ErrorKind::PermissionDenied => Err(TrashErrorDto::Permission),
            _ => Err(TrashErrorDto::Unknown {
                detail: Some(e.to_string()),
            }),
        },
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

/// REQ-FEED-020: select_past_note — signal that a past note has been selected.
/// Emits feed_state_changed with EditingStateChanged cause.
/// REQ-FEED-021: emit rule — emitted after state mutation.
#[tauri::command]
pub fn select_past_note(
    app: AppHandle,
    note_id: String,
    issued_at: String,
) -> Result<(), String> {
    let _ = issued_at; // timestamp recorded for audit; not used in Rust state
    let snapshot = make_editing_state_changed_snapshot(&note_id);
    app.emit("feed_state_changed", snapshot)
        .map_err(|e| e.to_string())
}

/// REQ-FEED-020: request_note_deletion — open delete confirmation modal.
/// Client-side only (modal state managed in TypeScript feedReducer).
/// No Rust side-effect; no event emit.
#[tauri::command]
pub fn request_note_deletion(note_id: String, issued_at: String) -> Result<(), String> {
    let _ = (note_id, issued_at);
    Ok(())
}

/// REQ-FEED-020: confirm_note_deletion — delete the file and emit result.
/// Calls fs_trash_file_impl, then emits feed_state_changed.
/// REQ-FEED-021: emit rule — emitted after fs deletion attempt (success or failure).
#[tauri::command]
pub fn confirm_note_deletion(
    app: AppHandle,
    note_id: String,
    issued_at: String,
) -> Result<(), String> {
    let _ = issued_at;
    match fs_trash_file_impl(&note_id) {
        Ok(_) => {
            let snapshot = make_note_deleted_snapshot(&note_id);
            app.emit("feed_state_changed", snapshot)
                .map_err(|e| e.to_string())
        }
        Err(ref e) => {
            let snapshot = make_deletion_failed_snapshot(&note_id, e);
            app.emit("feed_state_changed", snapshot)
                .map_err(|e| e.to_string())?;
            // Return Ok(()) — the error is communicated via the event, not
            // as a command error, so the TS caller receives the snapshot.
            Ok(())
        }
    }
}

/// REQ-FEED-020: cancel_note_deletion — close delete modal without deletion.
/// No Rust side-effect; no event emit.
#[tauri::command]
pub fn cancel_note_deletion(note_id: String, issued_at: String) -> Result<(), String> {
    let _ = (note_id, issued_at);
    Ok(())
}

/// REQ-FEED-019: fs_trash_file — public Tauri command wrapping fs_trash_file_impl.
/// Exposed as a standalone command for cases where the TS adapter calls it directly.
#[tauri::command]
pub fn fs_trash_file(path: String) -> Result<(), TrashErrorDto> {
    fs_trash_file_impl(&path)
}

/// REQ-FEED-022: feed_initial_state — scan vault dir and return initial snapshot.
///
/// Scans `vault_path` for `.md` files, reads each file to extract frontmatter
/// (createdAt, updatedAt, tags), and returns a FeedDomainSnapshotDto.
///
/// Frontmatter parsing: minimal YAML block detection.
/// Files that fail to parse are included with default metadata (best-effort).
#[tauri::command]
pub fn feed_initial_state(vault_path: String) -> Result<FeedDomainSnapshotDto, String> {
    let dir = Path::new(&vault_path);

    let read_dir = std::fs::read_dir(dir)
        .map_err(|e| format!("Cannot read vault directory '{}': {}", vault_path, e))?;

    let mut visible_note_ids: Vec<String> = Vec::new();
    let mut note_metadata: HashMap<String, NoteRowMetadataDto> = HashMap::new();

    for entry in read_dir.flatten() {
        let file_path = entry.path();
        if file_path.extension().map_or(false, |ext| ext == "md") {
            let note_id = file_path
                .to_str()
                .unwrap_or("")
                .to_string();

            // Read content (best-effort; skip unreadable files)
            let content = match std::fs::read_to_string(&file_path) {
                Ok(c) => c,
                Err(_) => continue,
            };

            // Get file modification time as fallback timestamp (milliseconds)
            let mtime_ms = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| {
                    t.duration_since(std::time::UNIX_EPOCH).ok()
                })
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);

            let metadata = parse_frontmatter_metadata(&content, mtime_ms);

            visible_note_ids.push(note_id.clone());
            note_metadata.insert(note_id, metadata);
        }
    }

    Ok(FeedDomainSnapshotDto {
        editing: idle_editing(),
        feed: FeedSubDto {
            visible_note_ids,
            filter_applied: false,
        },
        delete: no_delete(),
        note_metadata,
        cause: CauseDto::InitialLoad,
    })
}

/// Parse minimal frontmatter from markdown content.
/// Looks for YAML front matter block delimited by `---`.
/// Extracts `createdAt`, `updatedAt` (as epoch ms integers) and `tags` (list).
/// Falls back to `fallback_ms` for timestamps and empty tags if parsing fails.
fn parse_frontmatter_metadata(content: &str, fallback_ms: i64) -> NoteRowMetadataDto {
    let mut created_at = fallback_ms;
    let mut updated_at = fallback_ms;
    let mut tags: Vec<String> = Vec::new();
    let mut body = content.to_string();

    // Detect YAML frontmatter: starts with "---\n", ends with "\n---\n"
    if content.starts_with("---\n") || content.starts_with("---\r\n") {
        let rest = &content[4..];
        if let Some(end_pos) = rest.find("\n---\n").or_else(|| rest.find("\n---\r\n")) {
            let fm = &rest[..end_pos];
            body = rest[end_pos + 5..].to_string(); // skip "\n---\n"

            for line in fm.lines() {
                let line = line.trim();
                if let Some(val) = line.strip_prefix("createdAt:") {
                    let val = val.trim();
                    if let Ok(ms) = val.parse::<i64>() {
                        created_at = ms;
                    }
                } else if let Some(val) = line.strip_prefix("updatedAt:") {
                    let val = val.trim();
                    if let Ok(ms) = val.parse::<i64>() {
                        updated_at = ms;
                    }
                } else if line.starts_with("tags:") {
                    // tags: [tag1, tag2] or multi-line list
                    let after_colon = line["tags:".len()..].trim();
                    if after_colon.starts_with('[') && after_colon.ends_with(']') {
                        // Inline list: [tag1, tag2]
                        let inner = &after_colon[1..after_colon.len() - 1];
                        tags = inner
                            .split(',')
                            .map(|t| t.trim().trim_matches('"').trim_matches('\'').to_string())
                            .filter(|t| !t.is_empty())
                            .collect();
                    }
                } else if line.starts_with("- ") {
                    // Multi-line list item under tags:
                    // Only collect if we're in a tags context (simplified: collect all - items)
                    let tag = line[2..].trim().trim_matches('"').trim_matches('\'').to_string();
                    if !tag.is_empty() {
                        tags.push(tag);
                    }
                }
            }
        }
    }

    NoteRowMetadataDto {
        body,
        created_at,
        updated_at,
        tags,
    }
}

// ── Unit tests ────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fs_trash_file_impl_nonexistent_returns_ok() {
        let result = fs_trash_file_impl("/tmp/promptnotes-feed-module-nonexistent-xyz.md");
        assert!(result.is_ok(), "Non-existent file should return Ok(())");
    }

    #[test]
    fn trash_error_dto_permission_serializes() {
        let err = TrashErrorDto::Permission;
        let json = serde_json::to_string(&err).expect("serialize failed");
        assert!(json.contains("\"permission\""), "Expected 'permission' in: {}", json);
    }

    #[test]
    fn trash_error_dto_unknown_with_detail_serializes() {
        let err = TrashErrorDto::Unknown {
            detail: Some("disk-full".to_string()),
        };
        let json = serde_json::to_string(&err).expect("serialize failed");
        assert!(json.contains("\"unknown\""), "Expected 'unknown' in: {}", json);
        assert!(json.contains("disk-full"), "Expected detail in: {}", json);
    }

    #[test]
    fn feed_domain_snapshot_dto_serializes_camel_case() {
        let snapshot = FeedDomainSnapshotDto {
            editing: EditingSubDto {
                status: "idle".to_string(),
                current_note_id: None,
                pending_next_note_id: None,
            },
            feed: FeedSubDto {
                visible_note_ids: vec!["note1".to_string()],
                filter_applied: false,
            },
            delete: DeleteSubDto {
                active_delete_modal_note_id: None,
                last_deletion_error: None,
            },
            note_metadata: HashMap::new(),
            cause: CauseDto::InitialLoad,
        };
        let json = serde_json::to_string(&snapshot).expect("serialize failed");
        // Verify camelCase field names
        assert!(json.contains("\"editing\""), "Expected 'editing': {}", json);
        assert!(json.contains("\"currentNoteId\""), "Expected 'currentNoteId': {}", json);
        assert!(json.contains("\"pendingNextNoteId\""), "Expected 'pendingNextNoteId': {}", json);
        assert!(json.contains("\"visibleNoteIds\""), "Expected 'visibleNoteIds': {}", json);
        assert!(json.contains("\"filterApplied\""), "Expected 'filterApplied': {}", json);
        assert!(json.contains("\"activeDeleteModalNoteId\""), "Expected 'activeDeleteModalNoteId': {}", json);
        assert!(json.contains("\"noteMetadata\""), "Expected 'noteMetadata': {}", json);
        assert!(json.contains("\"InitialLoad\""), "Expected 'InitialLoad': {}", json);
    }

    #[test]
    fn cause_dto_note_file_deleted_serializes() {
        let cause = CauseDto::NoteFileDeleted {
            deleted_note_id: "abc-123".to_string(),
        };
        let json = serde_json::to_string(&cause).expect("serialize failed");
        assert!(json.contains("\"NoteFileDeleted\""), "Expected 'NoteFileDeleted': {}", json);
        assert!(json.contains("\"deletedNoteId\""), "Expected 'deletedNoteId': {}", json);
        assert!(json.contains("abc-123"), "Expected note id: {}", json);
    }

    #[test]
    fn parse_frontmatter_metadata_falls_back_on_plain_content() {
        let content = "# Hello\n\nThis is body text.";
        let meta = parse_frontmatter_metadata(content, 1000);
        assert_eq!(meta.created_at, 1000);
        assert_eq!(meta.updated_at, 1000);
        assert!(meta.tags.is_empty());
        assert!(meta.body.contains("Hello"));
    }

    #[test]
    fn parse_frontmatter_metadata_extracts_fields() {
        let content = "---\ncreatedAt: 1700000000000\nupdatedAt: 1700000001000\ntags: [rust, test]\n---\n# Note body\nContent here.";
        let meta = parse_frontmatter_metadata(content, 0);
        assert_eq!(meta.created_at, 1700000000000);
        assert_eq!(meta.updated_at, 1700000001000);
        assert_eq!(meta.tags, vec!["rust", "test"]);
        assert!(meta.body.contains("Note body"));
    }
}
