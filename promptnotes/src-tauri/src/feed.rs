//! feed.rs — Rust backend handlers for ui-feed-list-actions Sprint 2.
//!
//! REQ-FEED-019: fs_trash_file command
//! REQ-FEED-020: select_past_note, request_note_deletion,
//!               confirm_note_deletion, cancel_note_deletion handlers
//! REQ-FEED-021: feed_state_changed event emit rules
//! REQ-FEED-022: feed_initial_state command
//!
//! All DTOs use `#[serde(rename_all = "camelCase")]` to match the TypeScript
//! FeedDomainSnapshot type in `src/lib/feed/types.ts`.
//!
//! Design: this module is a thin IPC shell. No domain logic is re-implemented
//! here. State management is client-side (TypeScript feedReducer). The Rust
//! side is responsible only for:
//!   1. Performing OS-level I/O (file deletion, file listing)
//!   2. Emitting `feed_state_changed` events with typed payloads

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
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
    pub pending_next_focus: Option<crate::editor::PendingNextFocusDto>,
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

pub fn idle_editing() -> EditingSubDto {
    EditingSubDto {
        status: "idle".to_string(),
        current_note_id: None,
        pending_next_focus: None,
    }
}

pub fn no_delete() -> DeleteSubDto {
    DeleteSubDto {
        active_delete_modal_note_id: None,
        last_deletion_error: None,
    }
}

/// Build a snapshot for EditingStateChanged (used by select_past_note).
///
/// FIND-S2-05: vault_path is used to populate feed.visibleNoteIds with the
/// current vault scan so the TS client never receives an empty feed on note selection.
fn make_editing_state_changed_snapshot(note_id: &str, vault_path: &str) -> FeedDomainSnapshotDto {
    let (visible_note_ids, note_metadata) = scan_vault_feed(vault_path);
    FeedDomainSnapshotDto {
        editing: EditingSubDto {
            status: "editing".to_string(),
            current_note_id: Some(note_id.to_string()),
            pending_next_focus: None,
        },
        feed: FeedSubDto {
            visible_note_ids,
            filter_applied: false,
        },
        delete: no_delete(),
        note_metadata,
        cause: CauseDto::EditingStateChanged,
    }
}

/// Build a snapshot for NoteFileDeleted (used by confirm_note_deletion on success).
///
/// FIND-S2-06: vault_path is used to populate the post-deletion feed state so
/// remaining notes are not cleared from the TS client's visibleNoteIds.
fn make_note_deleted_snapshot(note_id: &str, vault_path: &str) -> FeedDomainSnapshotDto {
    let (visible_note_ids, note_metadata) = scan_vault_feed(vault_path);
    FeedDomainSnapshotDto {
        editing: idle_editing(),
        feed: FeedSubDto {
            visible_note_ids,
            filter_applied: false,
        },
        delete: no_delete(),
        note_metadata,
        cause: CauseDto::NoteFileDeleted {
            deleted_note_id: note_id.to_string(),
        },
    }
}

/// Build a snapshot for NoteDeletionFailed (used by confirm_note_deletion on error).
///
/// FIND-S2-06: vault_path populates the feed so deletion failure does not clear
/// the TS client's feed list.
fn make_deletion_failed_snapshot(
    note_id: &str,
    err: &TrashErrorDto,
    vault_path: &str,
) -> FeedDomainSnapshotDto {
    let (reason, detail) = match err {
        TrashErrorDto::Permission => ("permission".to_string(), None),
        TrashErrorDto::Lock => ("lock".to_string(), None),
        TrashErrorDto::Unknown { detail } => ("unknown".to_string(), detail.clone()),
    };
    let (visible_note_ids, note_metadata) = scan_vault_feed(vault_path);
    FeedDomainSnapshotDto {
        editing: idle_editing(),
        feed: FeedSubDto {
            visible_note_ids,
            filter_applied: false,
        },
        delete: DeleteSubDto {
            active_delete_modal_note_id: Some(note_id.to_string()),
            last_deletion_error: Some(DeletionErrorDto { reason, detail }),
        },
        note_metadata,
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

/// Return type for compose_select_past_note — holds both IPC payloads before
/// they are handed to AppHandle::emit.
///
/// FIND-S4-IMPL-iter2-002 resolution: extracting the pure orchestration logic
/// from select_past_note into this struct + compose_select_past_note makes the
/// composition layer independently testable without AppHandle / Tauri test feature.
#[derive(Debug)]
pub struct SelectPastNoteResult {
    /// Serialized payload for the "editing_session_state_changed" event.
    pub editing_payload: serde_json::Value,
    /// Serialized payload for the "feed_state_changed" event.
    pub feed_snapshot: FeedDomainSnapshotDto,
}

/// Pure orchestration layer for select_past_note.
///
/// Performs the full internal composition (vault scan → parse → compose editor
/// state → build payloads) without emitting any events. The caller (select_past_note
/// Tauri command) is a thin emit wrapper around this function.
///
/// This separation makes the orchestration logic testable in pure Rust tests
/// that cannot construct an AppHandle. See prop_s4_017_compose_select_past_note.
///
/// EC-FEED-016: parse_markdown_to_blocks failure → blocks = None (fallback).
/// EC-FEED-017 emit order: editing_payload must be emitted BEFORE feed_snapshot.
///   The handler emit order is enforced structurally: compose_select_past_note
///   returns a single value; the handler emits editing_payload first, then
///   feed_snapshot. Code review + unit tests on this pure function together
///   provide the correctness guarantee. Sprint 5 will automate EC-FEED-017 via
///   a Mock Emitter trait or Tauri test runtime.
pub fn compose_select_past_note(note_id: &str, vault_path: &str) -> SelectPastNoteResult {
    let snapshot = make_editing_state_changed_snapshot(note_id, vault_path);

    // REQ-FEED-024 amendment / REQ-FEED-025: Parse body into blocks.
    let blocks: Option<Vec<crate::editor::DtoBlock>> =
        if snapshot.note_metadata.contains_key(note_id) {
            let body = snapshot
                .note_metadata
                .get(note_id)
                .map(|m| m.body.as_str())
                .unwrap_or("");
            // EC-FEED-016: BlockParseError → fallback to None
            crate::editor::parse_markdown_to_blocks(body).ok()
        } else {
            None // note not found in vault
        };

    // REQ-FEED-024 / REQ-IPC-014: Compose block-aware editor state.
    let editor_state = crate::editor::compose_state_for_select_past_note(note_id, blocks);
    let editor_payload = crate::editor::make_editing_state_changed_payload(&editor_state);

    SelectPastNoteResult {
        editing_payload: editor_payload,
        feed_snapshot: snapshot,
    }
}

/// REQ-FEED-020: select_past_note — signal that a past note has been selected.
/// Emits editing_session_state_changed then feed_state_changed (EC-FEED-017 order).
/// REQ-FEED-021: emit rule — emitted after state mutation.
///
/// FIND-S2-05: vault_path is required so the snapshot can carry the current
/// visibleNoteIds — preventing the feed list from going blank on note selection.
///
/// FIND-S4-IMPL-iter2-002 resolution: this handler is now a thin emit wrapper
/// around compose_select_past_note. All observable IPC composition logic lives
/// in that pure function and is tested by prop_s4_017_compose_select_past_note.
#[tauri::command]
pub fn select_past_note(
    app: AppHandle,
    note_id: String,
    vault_path: String,
    issued_at: String,
) -> Result<(), String> {
    let _ = issued_at; // timestamp recorded for audit; not used in Rust state

    let result = compose_select_past_note(&note_id, &vault_path);

    // EC-FEED-017: editing_session_state_changed MUST be emitted before feed_state_changed.
    app.emit("editing_session_state_changed", result.editing_payload)
        .map_err(|e| e.to_string())?;
    app.emit("feed_state_changed", result.feed_snapshot)
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
///
/// FIND-S2-01: `file_path` is the absolute OS path of the file to delete.
/// `note_id` is the logical note identifier used in snapshot payloads.
/// These may coincide (when noteId === absoluteFilePath) but are kept separate
/// to make the contract explicit and to allow future divergence.
///
/// FIND-S2-06: vault_path is used to populate the post-deletion feed snapshot
/// so the TS client's feed list shows remaining notes after deletion.
#[tauri::command]
pub fn confirm_note_deletion(
    app: AppHandle,
    note_id: String,
    file_path: String,
    vault_path: String,
    issued_at: String,
) -> Result<(), String> {
    let _ = issued_at;
    match fs_trash_file_impl(&file_path) {
        Ok(_) => {
            let snapshot = make_note_deleted_snapshot(&note_id, &vault_path);
            app.emit("feed_state_changed", snapshot)
                .map_err(|e| e.to_string())
        }
        Err(ref e) => {
            let snapshot = make_deletion_failed_snapshot(&note_id, e, &vault_path);
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

// ── Vault scan helper ─────────────────────────────────────────────────────────

/// Scan `vault_path` for `.md` files and return populated (visible_note_ids, note_metadata).
///
/// REQ-FEED-021 / FIND-S2-05 / FIND-S2-06: used by event-emitting handlers so that
/// every snapshot carries the actual, up-to-date feed state rather than empty_feed().
/// Errors are best-effort ignored (partial scan is better than crashing an event emit).
pub fn scan_vault_feed(vault_path: &str) -> (Vec<String>, HashMap<String, NoteRowMetadataDto>) {
    let dir = Path::new(vault_path);
    let read_dir = match std::fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return (vec![], HashMap::new()),
    };

    let mut visible_note_ids: Vec<String> = Vec::new();
    let mut note_metadata: HashMap<String, NoteRowMetadataDto> = HashMap::new();

    for entry in read_dir.flatten() {
        let file_path = entry.path();
        // Sprint 5 vault scan semantics (REQ-FEED-028 / FIND-S5-SPEC-011):
        // - exclude dot-files (dot-prefixed file name)
        if file_path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| n.starts_with('.'))
        {
            continue;
        }
        // - exclude symlinks and non-regular files (is_file() is false for symlinks in Rust std)
        if !entry.file_type().is_ok_and(|ft| ft.is_file()) {
            continue;
        }
        if file_path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("md"))
        {
            let note_id = match file_path.to_str() {
                Some(s) => s.to_string(),
                None => continue,
            };
            let content = match std::fs::read_to_string(&file_path) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let mtime_ms = entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            let metadata = parse_frontmatter_metadata(&content, mtime_ms);
            visible_note_ids.push(note_id.clone());
            note_metadata.insert(note_id, metadata);
        }
    }

    (visible_note_ids, note_metadata)
}

// ── NoteId generation (pure core) ────────────────────────────────────────────

/// Convert a UNIX epoch millisecond timestamp into a `YYYY-MM-DD-HHmmss-SSS` string (UTC).
///
/// Pure: no side effects, no I/O, deterministic for any fixed `now_ms`.
/// Mirrors TypeScript `formatBaseId` in `initialize-capture.ts:112-126`.
///
/// Input domain: `now_ms ∈ [0, 253_402_300_800_000)` (Year 0001..9999 UTC).
/// Negative values and Year 10000+ are outside the defined input domain.
fn format_base_id(now_ms: i64) -> String {
    // Days-per-month table (non-leap year); index 0 unused, 1 = Jan … 12 = Dec.
    const DAYS_IN_MONTH: [u32; 13] = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    // ── Split milliseconds into whole seconds + ms remainder ──────────────────
    let total_secs = now_ms / 1_000;
    let ms = (now_ms % 1_000) as u32;

    // ── Time-of-day components ─────────────────────────────────────────────────
    let secs_of_day = (total_secs % 86_400) as u32;
    let h = secs_of_day / 3_600;
    let m = (secs_of_day % 3_600) / 60;
    let s = secs_of_day % 60;

    // ── Civil date from days since Unix epoch (1970-01-01) ────────────────────
    // Algorithm: Z algorithm (Howard Hinnant's civil date from days)
    // Reference: https://howardhinnant.github.io/date_algorithms.html
    let z = total_secs / 86_400 + 719_468; // shift epoch to 0000-03-01
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097; // day-of-era [0, 146_096]
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365; // year-of-era [0, 399]
    let y_shifted = yoe + era * 400; // year relative to 0000-03-01 epoch
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100); // day-of-year (March-based) [0, 365]
    let mp = (5 * doy + 2) / 153; // month (March=0 .. Feb=11)
    let d = doy - (153 * mp + 2) / 5 + 1; // day [1, 31]
    let mo = if mp < 10 { mp + 3 } else { mp - 9 }; // month [1, 12]
    let yr = if mo <= 2 { y_shifted + 1 } else { y_shifted }; // year

    // Validate range — outside [1, 9999] would produce wrong output, but spec
    // says inputs in [0, 253_402_300_800_000) are always valid.
    let _ = DAYS_IN_MONTH; // referenced to avoid unused-variable warning in simple cases

    format!(
        "{:04}-{:02}-{:02}-{:02}{:02}{:02}-{:03}",
        yr, mo, d, h, m, s, ms
    )
}

/// Allocate the next non-colliding NoteId for a given wall-clock instant.
///
/// Pure: accepts `now_ms` and `existing` by value/reference — no SystemTime calls.
/// Deterministic: same `(now_ms, existing)` always returns the same ID.
///
/// Format: `YYYY-MM-DD-HHmmss-SSS` (no collision) or `YYYY-MM-DD-HHmmss-SSS-N` (N ≥ 1).
/// Mirrors TypeScript `nextAvailableNoteId` in `initialize-capture.ts:86-104`.
///
/// Termination: `existing` is finite, so the loop always halts in at most
/// `existing.len() + 1` iterations.
pub fn next_available_note_id(now_ms: i64, existing: &HashSet<String>) -> String {
    let base = format_base_id(now_ms);
    if !existing.contains(&base) {
        return base;
    }
    let mut i: u32 = 1;
    loop {
        let candidate = format!("{}-{}", base, i);
        if !existing.contains(&candidate) {
            return candidate;
        }
        i += 1;
    }
}

// ── Initial-state composition (pure) ─────────────────────────────────────────

/// Pure orchestration for `feed_initial_state`: given an already-scanned vault
/// snapshot and a wall-clock `now_ms`, compose the full `FeedDomainSnapshotDto`
/// with the auto-created note prepended.
///
/// REQ-FEED-028: no file I/O is performed here — the caller is responsible for
/// the vault scan and the clock read. This function is deterministic for fixed inputs.
///
/// `existing_visible_ids` and `existing_metadata` come from `scan_vault_feed`.
/// `now_ms` is the UTC Unix millisecond timestamp from `SystemTime::now()`.
fn compose_initial_snapshot_with_autocreate(
    existing_visible_ids: Vec<String>,
    existing_metadata: HashMap<String, NoteRowMetadataDto>,
    now_ms: i64,
) -> FeedDomainSnapshotDto {
    // Build collision-check set using lowercase stems from full paths.
    // REQ-FEED-028 Detailed Behavior §2: collision namespace uses stem, not full path.
    let existing_ids: HashSet<String> = existing_visible_ids
        .iter()
        .map(|full_path| {
            Path::new(full_path)
                .file_stem()
                .map(|s| s.to_string_lossy().to_lowercase())
                .unwrap_or_default()
        })
        .collect();

    let new_id = next_available_note_id(now_ms, &existing_ids);

    let new_metadata = NoteRowMetadataDto {
        body: String::new(),
        created_at: now_ms,
        updated_at: now_ms,
        tags: Vec::new(),
    };

    // Prepend new ID to visible list; keep existing notes after it.
    let mut visible_note_ids = Vec::with_capacity(existing_visible_ids.len() + 1);
    visible_note_ids.push(new_id.clone());
    visible_note_ids.extend(existing_visible_ids);

    let mut note_metadata = existing_metadata;
    note_metadata.insert(new_id.clone(), new_metadata);

    FeedDomainSnapshotDto {
        editing: EditingSubDto {
            status: "editing".to_string(),
            current_note_id: Some(new_id),
            pending_next_focus: None,
        },
        feed: FeedSubDto {
            visible_note_ids,
            filter_applied: false,
        },
        delete: no_delete(),
        note_metadata,
        cause: CauseDto::InitialLoad,
    }
}

/// REQ-FEED-022 (Sprint 5 supersede) / REQ-FEED-028: feed_initial_state.
///
/// Scans `vault_path` for `.md` files, auto-creates a new empty note
/// (in-memory only — no `.md` file is written), and returns a snapshot
/// with `editing.status = "editing"` and `editing.current_note_id` set
/// to the new NoteId.
///
/// Frontmatter parsing: minimal YAML block detection (best-effort).
/// Files that fail to parse are included with default metadata.
#[tauri::command]
pub fn feed_initial_state(vault_path: String) -> Result<FeedDomainSnapshotDto, String> {
    let dir = Path::new(&vault_path);
    std::fs::read_dir(dir)
        .map_err(|e| format!("Cannot read vault directory '{}': {}", vault_path, e))?;

    let (existing_visible_ids, existing_metadata) = scan_vault_feed(&vault_path);

    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    Ok(compose_initial_snapshot_with_autocreate(
        existing_visible_ids,
        existing_metadata,
        now_ms,
    ))
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

    // Detect YAML frontmatter: starts with "---\n" or "---\r\n",
    // ends with "\n---\n" or "\n---\r\n".
    //
    // FIND-S2-07: when the end delimiter is "\n---\r\n" (6 bytes) we must advance
    // end_pos + 6, not + 5, to avoid leaving a leading '\r\n' on the body.
    let fm_start_lf = content.starts_with("---\n");
    let fm_start_crlf = content.starts_with("---\r\n");
    if fm_start_lf || fm_start_crlf {
        // Skip opening delimiter: "---\n" = 4 bytes, "---\r\n" = 5 bytes.
        let header_len = if fm_start_crlf { 5 } else { 4 };
        let rest = &content[header_len..];

        // Find closing delimiter, recording which variant matched.
        let end_lf = rest.find("\n---\n");
        let end_crlf = rest.find("\n---\r\n");

        let (end_pos, body_skip) = match (end_lf, end_crlf) {
            (Some(a), Some(b)) => {
                // Pick the earlier occurrence; if tied prefer LF.
                if a <= b {
                    (a, 5usize)
                } else {
                    (b, 6usize)
                }
            }
            (Some(a), None) => (a, 5usize),
            (None, Some(b)) => (b, 6usize),
            (None, None) => {
                // No closing delimiter found — treat whole content as body.
                return NoteRowMetadataDto {
                    body,
                    created_at,
                    updated_at,
                    tags,
                };
            }
        };

        let fm = &rest[..end_pos];
        body = rest[end_pos + body_skip..].to_string();

        // FIND-S2-03: state-machine parser that tracks the current YAML key so
        // multi-line list items are only collected when key == "tags".
        #[derive(PartialEq)]
        enum YamlKey {
            Tags,
            Other,
            None,
        }
        let mut current_key = YamlKey::None;

        for line in fm.lines() {
            let line = line.trim();
            if let Some(val) = line.strip_prefix("createdAt:") {
                current_key = YamlKey::Other;
                let val = val.trim();
                if let Ok(ms) = val.parse::<i64>() {
                    created_at = ms;
                }
            } else if let Some(val) = line.strip_prefix("updatedAt:") {
                current_key = YamlKey::Other;
                let val = val.trim();
                if let Ok(ms) = val.parse::<i64>() {
                    updated_at = ms;
                }
            } else if let Some(after_tags) = line.strip_prefix("tags:") {
                current_key = YamlKey::Tags;
                // tags: [tag1, tag2] inline form.
                let after_colon = after_tags.trim();
                if after_colon.starts_with('[') && after_colon.ends_with(']') {
                    let inner = &after_colon[1..after_colon.len() - 1];
                    tags = inner
                        .split(',')
                        .map(|t| t.trim().trim_matches('"').trim_matches('\'').to_string())
                        .filter(|t| !t.is_empty())
                        .collect();
                    // Inline form consumed; list items below do not belong here.
                    current_key = YamlKey::Other;
                }
            } else if let Some(list_item) = line.strip_prefix("- ") {
                // FIND-S2-03: only collect list items when we are inside the tags key.
                if current_key == YamlKey::Tags {
                    let tag = list_item
                        .trim()
                        .trim_matches('"')
                        .trim_matches('\'')
                        .to_string();
                    if !tag.is_empty() {
                        tags.push(tag);
                    }
                }
            } else if !line.is_empty() && !line.starts_with('#') {
                // Non-list, non-comment line resets the active key context.
                current_key = YamlKey::None;
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
        assert!(
            json.contains("\"permission\""),
            "Expected 'permission' in: {}",
            json
        );
    }

    #[test]
    fn trash_error_dto_unknown_with_detail_serializes() {
        let err = TrashErrorDto::Unknown {
            detail: Some("disk-full".to_string()),
        };
        let json = serde_json::to_string(&err).expect("serialize failed");
        assert!(
            json.contains("\"unknown\""),
            "Expected 'unknown' in: {}",
            json
        );
        assert!(json.contains("disk-full"), "Expected detail in: {}", json);
    }

    #[test]
    fn feed_domain_snapshot_dto_serializes_camel_case() {
        let snapshot = FeedDomainSnapshotDto {
            editing: EditingSubDto {
                status: "idle".to_string(),
                current_note_id: None,
                pending_next_focus: None,
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
        assert!(
            json.contains("\"currentNoteId\""),
            "Expected 'currentNoteId': {}",
            json
        );
        assert!(
            json.contains("\"pendingNextFocus\""),
            "Expected 'pendingNextFocus': {}",
            json
        );
        assert!(
            json.contains("\"visibleNoteIds\""),
            "Expected 'visibleNoteIds': {}",
            json
        );
        assert!(
            json.contains("\"filterApplied\""),
            "Expected 'filterApplied': {}",
            json
        );
        assert!(
            json.contains("\"activeDeleteModalNoteId\""),
            "Expected 'activeDeleteModalNoteId': {}",
            json
        );
        assert!(
            json.contains("\"noteMetadata\""),
            "Expected 'noteMetadata': {}",
            json
        );
        assert!(
            json.contains("\"InitialLoad\""),
            "Expected 'InitialLoad': {}",
            json
        );
    }

    #[test]
    fn cause_dto_note_file_deleted_serializes() {
        let cause = CauseDto::NoteFileDeleted {
            deleted_note_id: "abc-123".to_string(),
        };
        let json = serde_json::to_string(&cause).expect("serialize failed");
        assert!(
            json.contains("\"NoteFileDeleted\""),
            "Expected 'NoteFileDeleted': {}",
            json
        );
        assert!(
            json.contains("\"deletedNoteId\""),
            "Expected 'deletedNoteId': {}",
            json
        );
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

    // ── FIND-S2-03: state-machine tags parser ────────────────────────────────

    #[test]
    fn parse_frontmatter_metadata_multiline_tags_only_from_tags_key() {
        // FIND-S2-03: List items under non-tags keys must NOT be mixed into tags.
        let content = "---\naliases:\n- alias1\n- alias2\ntags:\n- rust\n- test\n---\nbody text";
        let meta = parse_frontmatter_metadata(content, 0);
        assert_eq!(
            meta.tags,
            vec!["rust", "test"],
            "aliases list items must not appear in tags: {:?}",
            meta.tags
        );
    }

    #[test]
    fn parse_frontmatter_metadata_multiline_tags_with_other_list_before() {
        // FIND-S2-03: references list before tags must not pollute tags.
        let content = "---\nreferences:\n- ref-a\n- ref-b\ntags:\n- my-tag\n---\nbody";
        let meta = parse_frontmatter_metadata(content, 0);
        assert_eq!(
            meta.tags,
            vec!["my-tag"],
            "reference items must not appear in tags: {:?}",
            meta.tags
        );
    }

    #[test]
    fn parse_frontmatter_metadata_multiline_tags_with_other_list_after() {
        // FIND-S2-03: list items after tags key belong to a different key — must stop.
        let content = "---\ntags:\n- tag-a\naliases:\n- alias-x\n---\nbody";
        let meta = parse_frontmatter_metadata(content, 0);
        assert_eq!(
            meta.tags,
            vec!["tag-a"],
            "alias items must not appear in tags: {:?}",
            meta.tags
        );
    }

    // ── FIND-S2-07: CRLF frontmatter body extraction ─────────────────────────

    #[test]
    fn parse_frontmatter_metadata_crlf_body_has_no_leading_cr() {
        // FIND-S2-07: "\n---\r\n" closing delimiter is 6 bytes; body must start
        // immediately after without a leading "\r\n".
        let content = "---\r\ncreatedAt: 1234\r\n---\r\n# Body\r\nText here.";
        let meta = parse_frontmatter_metadata(content, 0);
        assert_eq!(
            meta.created_at, 1234,
            "createdAt must be parsed from CRLF frontmatter"
        );
        assert!(
            !meta.body.starts_with('\r'),
            "Body must not start with CR; got: {:?}",
            &meta.body[..meta.body.len().min(4)]
        );
        assert!(
            !meta.body.starts_with('\n'),
            "Body must not start with bare LF; got: {:?}",
            &meta.body[..meta.body.len().min(4)]
        );
        assert!(
            meta.body.contains("Body"),
            "Body content must be present: {:?}",
            meta.body
        );
    }

    #[test]
    fn parse_frontmatter_metadata_crlf_tags_parsed_correctly() {
        // FIND-S2-07 + FIND-S2-03 combined: CRLF frontmatter with multiline tags.
        let content = "---\r\ntags:\r\n- crlf-tag\r\n---\r\nbody";
        let meta = parse_frontmatter_metadata(content, 0);
        assert_eq!(
            meta.tags,
            vec!["crlf-tag"],
            "CRLF multiline tags must be parsed correctly: {:?}",
            meta.tags
        );
    }

    // ── FIND-S2-01: fs_trash_file_impl contract test ─────────────────────────

    #[test]
    fn fs_trash_file_impl_uses_file_path_not_note_id() {
        // FIND-S2-01: confirm_note_deletion receives both note_id (logical ID) and
        // file_path (OS path). This test verifies fs_trash_file_impl operates on the
        // OS file path and does not depend on the note_id being a file path.
        use std::io::Write;
        let file_path = "/tmp/promptnotes-find-s2-01-test.md";
        // note_id may be any opaque string — here we use a different value.
        let note_id = "note-abc-123";
        assert_ne!(
            note_id, file_path,
            "note_id must differ from file_path in this test"
        );

        // Create the file using file_path (not note_id).
        {
            let mut f = std::fs::File::create(file_path).expect("create temp file");
            f.write_all(b"# Test note").expect("write");
        }
        // Deleting via file_path must succeed.
        let result = fs_trash_file_impl(file_path);
        assert!(
            result.is_ok(),
            "fs_trash_file_impl with file_path must succeed: {:?}",
            result
        );
        // Attempting to delete via note_id must NOT accidentally delete
        // a file (it should return Ok for not-found).
        let result2 = fs_trash_file_impl(note_id);
        assert!(
            result2.is_ok(),
            "Not-found note_id must return Ok: {:?}",
            result2
        );
        // Cleanup
        let _ = std::fs::remove_file(file_path);
    }

    // ── FIND-S2-05/06: snapshot constructors populate vault feed ─────────────

    #[test]
    fn make_editing_state_changed_snapshot_populates_feed_from_vault() {
        // FIND-S2-05: snapshot must NOT have visibleNoteIds = [] when vault has files.
        use std::io::Write;
        let tmp_dir = "/tmp/promptnotes-s2-05-vault";
        let _ = std::fs::create_dir_all(tmp_dir);
        let note_path = format!("{}/note-s2-05.md", tmp_dir);
        {
            let mut f = std::fs::File::create(&note_path).expect("create note");
            f.write_all(b"---\ncreatedAt: 1\n---\nbody").expect("write");
        }

        let snapshot = make_editing_state_changed_snapshot("note-abc", tmp_dir);
        assert!(
            !snapshot.feed.visible_note_ids.is_empty(),
            "visibleNoteIds must not be empty when vault has .md files; got: {:?}",
            snapshot.feed.visible_note_ids
        );
        assert_eq!(snapshot.editing.status, "editing");
        assert_eq!(
            snapshot.editing.current_note_id,
            Some("note-abc".to_string())
        );

        // Cleanup
        let _ = std::fs::remove_file(&note_path);
    }

    #[test]
    fn make_note_deleted_snapshot_populates_remaining_feed_after_deletion() {
        // FIND-S2-06: after deleting one note, snapshot carries remaining notes.
        use std::io::Write;
        let tmp_dir = "/tmp/promptnotes-s2-06-vault";
        let _ = std::fs::create_dir_all(tmp_dir);
        let remaining_path = format!("{}/remaining.md", tmp_dir);
        {
            let mut f = std::fs::File::create(&remaining_path).expect("create remaining note");
            f.write_all(b"---\ncreatedAt: 1\n---\nbody").expect("write");
        }
        // deleted-note.md has already been deleted — only remaining.md is in vault.
        let snapshot = make_note_deleted_snapshot("deleted-note-id", tmp_dir);
        // The snapshot must contain remaining.md's path, not deletedNoteId.
        assert!(
            snapshot
                .feed
                .visible_note_ids
                .iter()
                .any(|id| id.contains("remaining")),
            "visibleNoteIds must contain remaining notes after deletion; got: {:?}",
            snapshot.feed.visible_note_ids
        );
        assert!(
            !snapshot
                .feed
                .visible_note_ids
                .iter()
                .any(|id| id == "deleted-note-id"),
            "deleted-note-id (logical ID) must not appear in visibleNoteIds"
        );

        // Cleanup
        let _ = std::fs::remove_file(&remaining_path);
    }
}
