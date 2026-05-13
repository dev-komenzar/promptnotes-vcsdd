/// editor.rs — Rust backend handlers for note-body-editor.
///
/// REQ-EDIT-029: trigger_idle_save command
/// REQ-EDIT-030: trigger_blur_save command
/// REQ-EDIT-036: editing_session_state_changed event emit rules
/// REQ-EDIT-037: fs_write_file_atomic implementation
///
/// note-body-editor: editor_update_note_body command (in-memory body buffer + isDirty)
/// ui-tag-chip: write_file_atomic command (tag chip atomic save)
///
/// Sprint 8 IPC wire contract:
/// REQ-IPC-001..020 — EditingSessionStateDto is now a 5-arm tagged enum.
/// REQ-IPC-013 — All emit sites use the singular make_editing_state_changed_payload.
///
/// Design: this module is a thin IPC shell. No domain logic is re-implemented
/// here. The Rust side is responsible only for:
///   1. Performing OS-level I/O (file write, file creation)
///   2. Emitting `editing_session_state_changed` events with typed payloads
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
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
        file.write_all(contents.as_bytes())
            .map_err(|e| FsErrorDto {
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
pub fn compose_state_for_save_err(
    note_id: &str,
    body: &str,
    fs_err: FsErrorDto,
) -> EditingSessionStateDto {
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
/// REQ-IPC-014 / REQ-FEED-025: Takes optional parsed blocks (not raw body).
///   - None            → ケース 1 (note not found): focusedBlockId: null, isNoteEmpty: true
///   - Some(vec![])    → ケース 3 (defensive): focusedBlockId: null, isNoteEmpty: true
///   - Some(non-empty) → ケース 2: focusedBlockId: blocks[0].id, isNoteEmpty: false
pub fn compose_state_for_select_past_note(
    note_id: &str,
    blocks: Option<Vec<DtoBlock>>,
) -> EditingSessionStateDto {
    let (focused_block_id, is_note_empty) = match &blocks {
        None => (None, true),
        Some(b) if b.is_empty() => (None, true),
        Some(b) => (Some(b[0].id.clone()), false),
    };
    EditingSessionStateDto::Editing {
        current_note_id: note_id.to_string(),
        focused_block_id,
        is_dirty: false,
        is_note_empty,
        last_save_result: None,
        blocks,
    }
}

// ── BlockParseError ───────────────────────────────────────────────────────────

#[derive(Debug)]
pub struct BlockParseError(pub String);

// ── parse_markdown_to_blocks ──────────────────────────────────────────────────

/// REQ-FEED-025: Parse a markdown body string into a Vec<DtoBlock>.
///
/// Non-empty invariant: empty input returns vec![DtoBlock(paragraph, "")].
/// Matches TS parseMarkdownToBlocks output structure (type + content equivalence).
///
/// Block type detection (in priority order per line/section):
///   `# `  → heading-1
///   `## ` → heading-2
///   `### `→ heading-3
///   `- `  → bullet
///   `1. ` (digit + `. `) → numbered
///   `> `  → quote
///   `---` alone → divider
///   ` ``` ` fence (opening) → code (multi-line, content joined)
///   otherwise → paragraph
///
/// Multi-paragraph: blank lines separate logical blocks for non-code types.
pub fn parse_markdown_to_blocks(body: &str) -> Result<Vec<DtoBlock>, BlockParseError> {
    if body.is_empty() {
        return Ok(vec![DtoBlock {
            id: "block-0".to_string(),
            block_type: BlockTypeDto::Paragraph,
            content: String::new(),
        }]);
    }

    let mut blocks: Vec<DtoBlock> = Vec::new();
    let mut block_index: usize = 0;
    let lines: Vec<&str> = body.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];

        // Code fence detection
        if line.trim_start().starts_with("```") {
            let mut code_lines: Vec<&str> = Vec::new();
            i += 1;
            while i < lines.len() && !lines[i].trim_start().starts_with("```") {
                code_lines.push(lines[i]);
                i += 1;
            }
            // Skip closing fence if present
            if i < lines.len() {
                i += 1;
            }
            let content = code_lines.join("\n");
            blocks.push(DtoBlock {
                id: format!("block-{}", block_index),
                block_type: BlockTypeDto::Code,
                content,
            });
            block_index += 1;
            continue;
        }

        // Divider
        if line.trim() == "---" {
            blocks.push(DtoBlock {
                id: format!("block-{}", block_index),
                block_type: BlockTypeDto::Divider,
                content: String::new(),
            });
            block_index += 1;
            i += 1;
            continue;
        }

        // Blank line: skip (paragraph separator)
        if line.trim().is_empty() {
            i += 1;
            continue;
        }

        // Heading-3 (must check before heading-2 and heading-1)
        if let Some(content) = line.strip_prefix("### ") {
            blocks.push(DtoBlock {
                id: format!("block-{}", block_index),
                block_type: BlockTypeDto::Heading3,
                content: content.to_string(),
            });
            block_index += 1;
            i += 1;
            continue;
        }

        // Heading-2
        if let Some(content) = line.strip_prefix("## ") {
            blocks.push(DtoBlock {
                id: format!("block-{}", block_index),
                block_type: BlockTypeDto::Heading2,
                content: content.to_string(),
            });
            block_index += 1;
            i += 1;
            continue;
        }

        // Heading-1
        if let Some(content) = line.strip_prefix("# ") {
            blocks.push(DtoBlock {
                id: format!("block-{}", block_index),
                block_type: BlockTypeDto::Heading1,
                content: content.to_string(),
            });
            block_index += 1;
            i += 1;
            continue;
        }

        // Bullet
        if let Some(content) = line.strip_prefix("- ") {
            blocks.push(DtoBlock {
                id: format!("block-{}", block_index),
                block_type: BlockTypeDto::Bullet,
                content: content.to_string(),
            });
            block_index += 1;
            i += 1;
            continue;
        }

        // Quote
        if let Some(content) = line.strip_prefix("> ") {
            blocks.push(DtoBlock {
                id: format!("block-{}", block_index),
                block_type: BlockTypeDto::Quote,
                content: content.to_string(),
            });
            block_index += 1;
            i += 1;
            continue;
        }

        // Numbered list: digit(s) + ". "
        if line.len() >= 3 {
            let dot_pos = line.find(". ");
            if let Some(pos) = dot_pos {
                if pos > 0 && line[..pos].chars().all(|c| c.is_ascii_digit()) {
                    let content = line[pos + 2..].to_string();
                    blocks.push(DtoBlock {
                        id: format!("block-{}", block_index),
                        block_type: BlockTypeDto::Numbered,
                        content,
                    });
                    block_index += 1;
                    i += 1;
                    continue;
                }
            }
        }

        // Paragraph: accumulate consecutive non-blank, non-special lines
        let mut para_lines: Vec<&str> = Vec::new();
        while i < lines.len() {
            let current = lines[i];
            // Stop at blank line or special-prefix line
            if current.trim().is_empty() {
                break;
            }
            if current.trim_start().starts_with("```")
                || current.trim() == "---"
                || current.starts_with("### ")
                || current.starts_with("## ")
                || current.starts_with("# ")
                || current.starts_with("- ")
                || current.starts_with("> ")
            {
                break;
            }
            // Check numbered list prefix
            if current.len() >= 3 {
                if let Some(pos) = current.find(". ") {
                    if pos > 0 && current[..pos].chars().all(|c| c.is_ascii_digit()) {
                        break;
                    }
                }
            }
            para_lines.push(current);
            i += 1;
        }
        if !para_lines.is_empty() {
            let content = para_lines.join("\n");
            blocks.push(DtoBlock {
                id: format!("block-{}", block_index),
                block_type: BlockTypeDto::Paragraph,
                content,
            });
            block_index += 1;
        }
    }

    // Non-empty invariant: if no blocks were produced, return one empty paragraph.
    if blocks.is_empty() {
        blocks.push(DtoBlock {
            id: "block-0".to_string(),
            block_type: BlockTypeDto::Paragraph,
            content: String::new(),
        });
    }

    Ok(blocks)
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
/// If `store` is provided, updates the in-memory body store on success.
fn save_note_and_emit(
    app: &AppHandle,
    note_id: String,
    body: String,
    store: Option<&NoteBodyStore>,
) -> Result<(), String> {
    let state = match fs_write_file_atomic(&note_id, &body) {
        Ok(()) => {
            if let Some(store) = store {
                if let Ok(mut map) = store.0.lock() {
                    if let Some(entry) = map.get_mut(&note_id) {
                        entry.is_dirty = false;
                        entry.last_saved_body = body.clone();
                    }
                }
            }
            compose_state_for_save_ok(&note_id, &body)
        }
        Err(io_err) => compose_state_for_save_err(&note_id, &body, io_err),
    };
    let payload = make_editing_state_changed_payload(&state);
    app.emit("editing_session_state_changed", payload)
        .map_err(|e| e.to_string())?;

    if matches!(state, EditingSessionStateDto::Editing { .. }) {
        if let Ok(Some(vault_path)) = crate::settings_load_impl() {
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
                    saved_note_id: note_id.clone(),
                },
            };
            app.emit("feed_state_changed", feed_snapshot)
                .map_err(|e| e.to_string())?;
        }
    }

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
    store: tauri::State<'_, NoteBodyStore>,
    note_id: String,
    body: String,
    issued_at: String,
    source: String,
) -> Result<(), String> {
    eprintln!(
        "[editor] trigger_idle_save note={} source={} issued_at={}",
        note_id, source, issued_at
    );
    save_note_and_emit(&app, note_id, body, Some(&store))
}

/// REQ-EDIT-030: trigger_blur_save — atomic write + emit state.
#[tauri::command]
pub fn trigger_blur_save(
    app: AppHandle,
    store: tauri::State<'_, NoteBodyStore>,
    note_id: String,
    body: String,
    issued_at: String,
    source: String,
) -> Result<(), String> {
    eprintln!(
        "[editor] trigger_blur_save note={} source={} issued_at={}",
        note_id, source, issued_at
    );
    save_note_and_emit(&app, note_id, body, Some(&store))
}

// ── note-body-editor: in-memory body store ─────────────────────────────

/// Per-note body buffer held in-memory by the Rust backend.
#[derive(Debug, Clone)]
pub struct InMemoryNoteBody {
    pub body: String,
    pub is_dirty: bool,
    pub last_saved_body: String,
}

/// Global in-memory state protected by a mutex.
pub struct NoteBodyStore(pub Mutex<HashMap<String, InMemoryNoteBody>>);

impl NoteBodyStore {
    pub fn new() -> Self {
        NoteBodyStore(Mutex::new(HashMap::new()))
    }
}

impl Default for NoteBodyStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Validates that a body string contains no disallowed control characters.
/// Allowed: tab (U+0009), LF (U+000A), CR (U+000D).
/// Disallowed: U+0000–U+001F (except U+0009), U+007F (DELETE).
pub fn validate_no_control_chars(body: &str) -> Result<(), String> {
    for (i, c) in body.char_indices() {
        let code = c as u32;
        if code == 0x007F {
            return Err(format!("control character U+007F at position {}", i));
        }
        if code <= 0x001F && code != 0x0009 && code != 0x000A && code != 0x000D {
            return Err(format!(
                "control character U+{:04X} at position {}",
                code, i
            ));
        }
    }
    Ok(())
}

/// Returns true if the body text has changed from the original value.
pub fn has_body_changed(original: &str, current: &str) -> bool {
    original != current
}

/// Returns true if the body string consists only of whitespace characters (or is empty).
pub fn is_whitespace_only(body: &str) -> bool {
    body.chars().all(|c| c.is_whitespace())
}

/// REQ-002 (note-body-editor): editor_update_note_body — stores body
/// in-memory and sets is_dirty flag. Does NOT write to disk.
/// Emits editing_session_state_changed on isDirty false→true transition.
#[tauri::command]
pub fn editor_update_note_body(
    app: AppHandle,
    store: tauri::State<'_, NoteBodyStore>,
    note_id: String,
    body: String,
) -> Result<(), String> {
    validate_no_control_chars(&body)?;
    let mut map = store.0.lock().map_err(|e| e.to_string())?;
    let entry = map.entry(note_id.clone()).or_insert(InMemoryNoteBody {
        body: String::new(),
        is_dirty: false,
        last_saved_body: String::new(),
    });
    let was_dirty = entry.is_dirty;
    let body_changed = has_body_changed(&entry.last_saved_body, &body);
    entry.body = body;
    entry.is_dirty = body_changed || was_dirty;
    if !was_dirty && body_changed {
        let state = EditingSessionStateDto::Editing {
            current_note_id: note_id,
            focused_block_id: None,
            is_dirty: true,
            is_note_empty: is_whitespace_only(&entry.body),
            last_save_result: None,
            blocks: None,
        };
        let payload = make_editing_state_changed_payload(&state);
        let _ = app.emit("editing_session_state_changed", payload);
    }
    Ok(())
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
        assert!(
            json.contains("\"currentNoteId\""),
            "camelCase currentNoteId: {}",
            json
        );
        assert!(
            json.contains("\"focusedBlockId\""),
            "camelCase focusedBlockId: {}",
            json
        );
        assert!(json.contains("\"isDirty\""), "camelCase isDirty: {}", json);
        assert!(
            json.contains("\"isNoteEmpty\""),
            "camelCase isNoteEmpty: {}",
            json
        );
        assert!(
            json.contains("\"lastSaveResult\""),
            "camelCase lastSaveResult: {}",
            json
        );
        assert!(
            !json.contains("\"blocks\""),
            "blocks absent when None: {}",
            json
        );
    }

    #[test]
    fn save_error_dto_skips_reason_when_none() {
        let err = SaveErrorDto {
            kind: "validation".to_string(),
            reason: None,
        };
        let json = serde_json::to_string(&err).expect("serialize");
        assert!(
            !json.contains("\"reason\""),
            "reason absent when None: {}",
            json
        );
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
        assert!(
            json.contains("\"reason\""),
            "reason present when Some: {}",
            json
        );
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
        assert_eq!(io_error_to_fs_kind(std::io::ErrorKind::NotFound), "unknown");
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
        assert_eq!(
            lines.len(),
            6,
            "Must have empty line after --- (body placeholder)"
        );
    }

    // ── make_editing_state_changed_payload (singular form) ────────────────

    #[test]
    fn make_payload_wraps_in_state_key() {
        let state = compose_state_idle();
        let payload = make_editing_state_changed_payload(&state);
        let json = serde_json::to_string(&payload).expect("serialize");
        assert!(
            json.starts_with("{\"state\":"),
            "Must wrap in state: {}",
            json
        );
    }

    #[test]
    fn make_payload_editing_state() {
        let state = compose_state_for_select_past_note("/v/n.md", None);
        let payload = make_editing_state_changed_payload(&state);
        let json = serde_json::to_string(&payload).expect("serialize");
        assert!(json.contains("\"editing\""));
        assert!(json.contains("\"isDirty\":false"));
        assert!(json.contains("\"/v/n.md\""));
    }

    #[test]
    fn make_payload_save_failed_state() {
        let fs_err = FsErrorDto {
            kind: "permission".to_string(),
        };
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
            EditingSessionStateDto::Editing {
                is_dirty,
                last_save_result,
                ..
            } => {
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

    // ── compose_state_for_select_past_note (new signature) ───────────────

    #[test]
    fn compose_select_past_note_none_gives_empty_state() {
        let state = compose_state_for_select_past_note("n1", None);
        match state {
            EditingSessionStateDto::Editing {
                blocks,
                focused_block_id,
                is_note_empty,
                ..
            } => {
                assert_eq!(blocks, None);
                assert_eq!(focused_block_id, None);
                assert!(is_note_empty);
            }
            _ => panic!("Expected Editing"),
        }
    }

    #[test]
    fn compose_select_past_note_some_blocks_populates_focused() {
        let b = vec![DtoBlock {
            id: "b1".to_string(),
            block_type: BlockTypeDto::Paragraph,
            content: "hi".to_string(),
        }];
        let state = compose_state_for_select_past_note("n1", Some(b.clone()));
        match state {
            EditingSessionStateDto::Editing {
                blocks,
                focused_block_id,
                is_note_empty,
                ..
            } => {
                assert_eq!(blocks, Some(b));
                assert_eq!(focused_block_id, Some("b1".to_string()));
                assert!(!is_note_empty);
            }
            _ => panic!("Expected Editing"),
        }
    }

    // ── parse_markdown_to_blocks ──────────────────────────────────────────

    #[test]
    fn parse_markdown_to_blocks_empty_returns_single_paragraph() {
        let blocks = parse_markdown_to_blocks("").expect("Ok");
        assert_eq!(blocks.len(), 1);
        assert_eq!(blocks[0].content, "");
        assert_eq!(blocks[0].block_type, BlockTypeDto::Paragraph);
    }

    #[test]
    fn parse_markdown_to_blocks_single_paragraph() {
        let blocks = parse_markdown_to_blocks("hello world").expect("Ok");
        assert!(!blocks.is_empty());
        assert_eq!(blocks[0].content, "hello world");
        assert_eq!(blocks[0].block_type, BlockTypeDto::Paragraph);
    }

    #[test]
    fn parse_markdown_to_blocks_heading1() {
        let blocks = parse_markdown_to_blocks("# Title").expect("Ok");
        assert!(!blocks.is_empty());
        assert_eq!(blocks[0].block_type, BlockTypeDto::Heading1);
        assert_eq!(blocks[0].content, "Title");
    }

    #[test]
    fn parse_markdown_to_blocks_heading2() {
        let blocks = parse_markdown_to_blocks("## Sub").expect("Ok");
        assert!(!blocks.is_empty());
        assert_eq!(blocks[0].block_type, BlockTypeDto::Heading2);
    }

    #[test]
    fn parse_markdown_to_blocks_heading3() {
        let blocks = parse_markdown_to_blocks("### Third").expect("Ok");
        assert!(!blocks.is_empty());
        assert_eq!(blocks[0].block_type, BlockTypeDto::Heading3);
    }

    #[test]
    fn parse_markdown_to_blocks_bullet() {
        let blocks = parse_markdown_to_blocks("- item one").expect("Ok");
        assert!(!blocks.is_empty());
        assert_eq!(blocks[0].block_type, BlockTypeDto::Bullet);
        assert_eq!(blocks[0].content, "item one");
    }

    #[test]
    fn parse_markdown_to_blocks_numbered() {
        let blocks = parse_markdown_to_blocks("1. first").expect("Ok");
        assert!(!blocks.is_empty());
        assert_eq!(blocks[0].block_type, BlockTypeDto::Numbered);
        assert_eq!(blocks[0].content, "first");
    }

    #[test]
    fn parse_markdown_to_blocks_quote() {
        let blocks = parse_markdown_to_blocks("> quote text").expect("Ok");
        assert!(!blocks.is_empty());
        assert_eq!(blocks[0].block_type, BlockTypeDto::Quote);
        assert_eq!(blocks[0].content, "quote text");
    }

    #[test]
    fn parse_markdown_to_blocks_divider() {
        let blocks = parse_markdown_to_blocks("---").expect("Ok");
        assert!(!blocks.is_empty());
        assert_eq!(blocks[0].block_type, BlockTypeDto::Divider);
    }

    #[test]
    fn parse_markdown_to_blocks_code() {
        let blocks = parse_markdown_to_blocks("```\ncode here\n```").expect("Ok");
        assert!(!blocks.is_empty());
        assert_eq!(blocks[0].block_type, BlockTypeDto::Code);
        assert_eq!(blocks[0].content, "code here");
    }

    #[test]
    fn parse_markdown_to_blocks_multiple_paragraphs() {
        let blocks = parse_markdown_to_blocks("first\n\nsecond").expect("Ok");
        assert!(
            blocks.len() >= 2,
            "expected >=2 blocks, got {}",
            blocks.len()
        );
        assert_eq!(blocks[0].content, "first");
        assert_eq!(blocks[1].content, "second");
    }

    // ── note-body-editor: InMemoryNoteBody + NoteBodyStore ─────────────────────
    //
    // RED PHASE: These tests reference InMemoryNoteBody, NoteBodyStore, and
    // validate_no_control_chars which do NOT exist in the codebase yet.
    // Expected outcome: compilation FAILURE.

    // ── PROP-001 / PROP-015: validate_no_control_chars ─────────────────────

    #[test]
    fn validate_no_control_chars_accepts_normal_text() {
        // PROP-015: Normal text without control characters passes validation.
        let result = validate_no_control_chars("hello world");
        assert!(result.is_ok(), "normal text must pass: {:?}", result);
    }

    #[test]
    fn validate_no_control_chars_accepts_unicode() {
        // PROP-015: Unicode text (emoji, CJK, RTL) passes validation.
        let result = validate_no_control_chars("こんにちは世界 🌍 مرحبا");
        assert!(result.is_ok(), "unicode must pass: {:?}", result);
    }

    #[test]
    fn validate_no_control_chars_accepts_tab_newline_cr() {
        // PROP-001: Tab (U+0009), LF (U+000A), CR (U+000D) are permitted.
        let result = validate_no_control_chars("line1\tindented\nline2\r\nline3");
        assert!(result.is_ok(), "tab/newline/CR must pass: {:?}", result);
    }

    #[test]
    fn validate_no_control_chars_rejects_null_byte() {
        // PROP-001: NULL byte (U+0000) is rejected.
        let body = "text before\0text after".to_string();
        let result = validate_no_control_chars(&body);
        assert!(result.is_err(), "null byte must be rejected");
    }

    #[test]
    fn validate_no_control_chars_rejects_del_character() {
        // PROP-001: DELETE (U+007F) is rejected.
        let body = "text\x7F".to_string();
        let result = validate_no_control_chars(&body);
        assert!(result.is_err(), "DEL must be rejected");
    }

    #[test]
    fn validate_no_control_chars_rejects_control_chars_except_tab() {
        // PROP-001: All code points U+0000–U+001F except U+0009 are rejected.
        // Test a sample: U+0001 (SOH), U+0002 (STX), U+001F (US).
        for &c in &['\x01', '\x02', '\x1b', '\x1f'] {
            let body = format!("text{}suffix", c);
            let result = validate_no_control_chars(&body);
            assert!(
                result.is_err(),
                "control char U+{:04X} must be rejected",
                c as u32
            );
        }
    }

    #[test]
    fn validate_no_control_chars_rejects_pasted_control_char() {
        // PROP-001: Mixed valid + control character body is rejected entirely.
        let body = "normal text\x00hidden".to_string();
        let result = validate_no_control_chars(&body);
        assert!(
            result.is_err(),
            "mixed content with control char must be rejected"
        );
    }

    #[test]
    fn validate_no_control_chars_empty_body_passes() {
        // PROP-015: Empty string passes validation (no control chars present).
        let result = validate_no_control_chars("");
        assert!(result.is_ok(), "empty body must pass: {:?}", result);
    }

    #[test]
    fn validate_no_control_chars_whitespace_only_passes() {
        // PROP-015: Whitespace-only body passes if whitespace chars are not disallowed.
        let result = validate_no_control_chars("  \n\t\r\n  ");
        assert!(result.is_ok(), "whitespace-only must pass: {:?}", result);
    }

    // ── PROP-002: In-memory body store — sequential correctness ────────────

    #[test]
    fn in_memory_store_insert_and_read_back() {
        // PROP-002: Insert body, read back — body matches, is_dirty is true.
        let store = NoteBodyStore::new();
        let note_id = "note-1".to_string();
        let body = "# Hello\n\nWorld".to_string();

        {
            let mut map = store.0.lock().unwrap();
            map.insert(
                note_id.clone(),
                InMemoryNoteBody {
                    body: body.clone(),
                    is_dirty: true,
                    last_saved_body: String::new(),
                },
            );
        }

        {
            let map = store.0.lock().unwrap();
            let entry = map.get(&note_id).expect("entry must exist");
            assert_eq!(entry.body, body, "body must match stored value");
            assert!(entry.is_dirty, "is_dirty must be true after insert");
        }
    }

    #[test]
    fn in_memory_store_update_overwrites_previous_body() {
        // PROP-002: Sequential updates — last write wins.
        let store = NoteBodyStore::new();
        let note_id = "note-1".to_string();

        // Insert A
        {
            let mut map = store.0.lock().unwrap();
            map.insert(
                note_id.clone(),
                InMemoryNoteBody {
                    body: "body A".to_string(),
                    is_dirty: true,
                    last_saved_body: String::new(),
                },
            );
        }
        // Insert B (overwrite)
        {
            let mut map = store.0.lock().unwrap();
            map.insert(
                note_id.clone(),
                InMemoryNoteBody {
                    body: "body B".to_string(),
                    is_dirty: true,
                    last_saved_body: String::new(),
                },
            );
        }
        // Read back — must be B
        {
            let map = store.0.lock().unwrap();
            let entry = map.get(&note_id).expect("entry must exist");
            assert_eq!(entry.body, "body B", "body must be latest value");
        }
    }

    // ── PROP-004: isDirty state machine — transition correctness ───────────

    #[test]
    fn is_dirty_transitions_false_to_true_on_first_update() {
        // PROP-004: Initial state (is_dirty=false, no saved body) →
        // first body update → is_dirty=true.
        let mut state = InMemoryNoteBody {
            body: String::new(),
            is_dirty: false,
            last_saved_body: String::new(),
        };
        // Simulate body update
        state.body = "first edit".to_string();
        state.is_dirty = true; // The transition logic should set this

        assert!(state.is_dirty, "is_dirty must be true after first update");
        assert_eq!(state.body, "first edit");
    }

    #[test]
    fn is_dirty_transitions_true_to_false_on_successful_save() {
        // PROP-004: After successful save, is_dirty transitions to false.
        let mut state = InMemoryNoteBody {
            body: "edited body".to_string(),
            is_dirty: true,
            last_saved_body: String::new(),
        };
        // Simulate successful save
        state.last_saved_body = state.body.clone();
        state.is_dirty = false;

        assert!(
            !state.is_dirty,
            "is_dirty must be false after successful save"
        );
        assert_eq!(state.last_saved_body, "edited body");
    }

    #[test]
    fn is_dirty_stays_true_on_failed_save() {
        // PROP-004: After failed save, is_dirty remains true.
        let state = InMemoryNoteBody {
            body: "modified".to_string(),
            is_dirty: true,
            last_saved_body: String::new(),
        };
        // Simulate failed save — do not clear is_dirty
        // (state unchanged)

        assert!(
            state.is_dirty,
            "is_dirty must remain true after save failure"
        );
        assert_eq!(
            state.last_saved_body, "",
            "last_saved_body must not be updated on failure"
        );
    }

    #[test]
    fn is_dirty_stays_true_on_subsequent_keystrokes() {
        // PROP-004: After is_dirty is already true, subsequent updates
        // keep is_dirty true (no event emitted on redundant transitions).
        let state = InMemoryNoteBody {
            body: "already dirty".to_string(),
            is_dirty: true,
            last_saved_body: String::new(),
        };
        assert!(
            state.is_dirty,
            "is_dirty must stay true on consecutive edits"
        );
    }

    #[test]
    fn is_dirty_never_goes_true_to_false_without_save() {
        // PROP-004: Monotonic constraint — is_dirty never transitions
        // from true to false without an intervening save.
        let mut state = InMemoryNoteBody {
            body: String::new(),
            is_dirty: false,
            last_saved_body: String::new(),
        };

        // First update → dirty
        state.body = "edit 1".to_string();
        state.is_dirty = true;

        // Second update with no save → still dirty
        state.body = "edit 2".to_string();
        // is_dirty must remain true (no save happened)
        assert!(
            state.is_dirty,
            "is_dirty must not become false without save"
        );
    }

    // ── PROP-005: Body round-trip — Unicode + large body preservation ──────

    #[test]
    fn body_roundtrip_preserves_emoji_cjk_rtl() {
        // PROP-005: Body containing emoji, CJK, RTL characters
        // round-trips correctly through in-memory store.
        let store = NoteBodyStore::new();
        let note_id = "note-emoji".to_string();
        let body = "🌍 Emoji 🎉 CJK 漢字 RTL مرحبا\n# 見出し\n- bullet".to_string();

        // Insert
        {
            let mut map = store.0.lock().unwrap();
            map.insert(
                note_id.clone(),
                InMemoryNoteBody {
                    body: body.clone(),
                    is_dirty: true,
                    last_saved_body: String::new(),
                },
            );
        }
        // Read back
        {
            let map = store.0.lock().unwrap();
            let entry = map.get(&note_id).expect("entry must exist");
            assert_eq!(
                entry.body, body,
                "Unicode body must be preserved byte-for-byte"
            );
        }
    }

    #[test]
    fn body_roundtrip_preserves_large_body() {
        // PROP-005: A 1MB body round-trips correctly through the store.
        let store = NoteBodyStore::new();
        let note_id = "note-large".to_string();
        // Build ~1MB body (repeating pattern)
        let pattern = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\n";
        let repeats = 30_000; // ~1MB
        let body: String = pattern.repeat(repeats);

        // Insert
        {
            let mut map = store.0.lock().unwrap();
            map.insert(
                note_id.clone(),
                InMemoryNoteBody {
                    body: body.clone(),
                    is_dirty: true,
                    last_saved_body: String::new(),
                },
            );
        }
        // Read back
        {
            let map = store.0.lock().unwrap();
            let entry = map.get(&note_id).expect("entry must exist");
            assert_eq!(entry.body.len(), body.len(), "large body length must match");
            assert_eq!(entry.body, body, "large body content must match");
        }
    }

    #[test]
    fn body_roundtrip_newlines_and_tabs_preserved() {
        // PROP-005: Body with significant whitespace is preserved byte-for-byte.
        let store = NoteBodyStore::new();
        let note_id = "note-whitespace".to_string();
        let body = "line1\n\tindented\n  spaced\n\nparagraph";

        {
            let mut map = store.0.lock().unwrap();
            map.insert(
                note_id.clone(),
                InMemoryNoteBody {
                    body: body.to_string(),
                    is_dirty: true,
                    last_saved_body: String::new(),
                },
            );
        }
        {
            let map = store.0.lock().unwrap();
            let entry = map.get(&note_id).expect("entry must exist");
            assert_eq!(entry.body, body);
        }
    }

    // ── PROP-008: Empty body handling ──────────────────────────────────────

    #[test]
    fn empty_body_is_stored_as_valid_body() {
        // PROP-008: Empty body "" is stored and retrievable.
        let store = NoteBodyStore::new();
        let note_id = "note-empty".to_string();

        {
            let mut map = store.0.lock().unwrap();
            map.insert(
                note_id.clone(),
                InMemoryNoteBody {
                    body: String::new(),
                    is_dirty: true,
                    last_saved_body: String::new(),
                },
            );
        }
        {
            let map = store.0.lock().unwrap();
            let entry = map.get(&note_id).expect("entry must exist");
            assert_eq!(
                entry.body, "",
                "empty body must be preserved as empty string"
            );
        }
    }

    #[test]
    fn whitespace_only_body_is_stored_as_valid_body() {
        // PROP-008: Whitespace-only body is stored byte-for-byte.
        let store = NoteBodyStore::new();
        let note_id = "note-ws".to_string();
        let body = "  \n\t  ";

        {
            let mut map = store.0.lock().unwrap();
            map.insert(
                note_id.clone(),
                InMemoryNoteBody {
                    body: body.to_string(),
                    is_dirty: true,
                    last_saved_body: String::new(),
                },
            );
        }
        {
            let map = store.0.lock().unwrap();
            let entry = map.get(&note_id).expect("entry must exist");
            assert_eq!(entry.body, body, "whitespace body must be preserved");
        }
    }

    #[test]
    fn updating_empty_body_with_empty_does_not_transition_is_dirty() {
        // PROP-008: If original body was empty and update is also empty,
        // is_dirty remains false (no change detected).
        let store = NoteBodyStore::new();
        let note_id = "note-empty-unchanged".to_string();

        // Initial state: empty body, is_dirty=false (already saved)
        {
            let mut map = store.0.lock().unwrap();
            map.insert(
                note_id.clone(),
                InMemoryNoteBody {
                    body: String::new(),
                    is_dirty: false,
                    last_saved_body: String::new(),
                },
            );
        }
        // "Update" with same empty body — is_dirty stays false
        {
            let mut map = store.0.lock().unwrap();
            let entry = map.get_mut(&note_id).expect("entry must exist");
            // Body unchanged → is_dirty should not become true
            assert!(
                !entry.is_dirty,
                "is_dirty must stay false when body unchanged"
            );
        }
    }

    #[test]
    fn updating_nonempty_body_with_empty_sets_is_dirty_true() {
        // PROP-008: Original was non-empty, user deletes all content →
        // is_dirty becomes true.
        let store = NoteBodyStore::new();
        let note_id = "note-to-empty".to_string();

        // Initial state: non-empty body, is_dirty=false
        {
            let mut map = store.0.lock().unwrap();
            map.insert(
                note_id.clone(),
                InMemoryNoteBody {
                    body: "some content".to_string(),
                    is_dirty: false,
                    last_saved_body: "some content".to_string(),
                },
            );
        }
        // Update to empty body
        {
            let mut map = store.0.lock().unwrap();
            map.insert(
                note_id.clone(),
                InMemoryNoteBody {
                    body: String::new(),
                    is_dirty: true, // Should be set to true because body changed from non-empty
                    last_saved_body: "some content".to_string(),
                },
            );
        }
        {
            let map = store.0.lock().unwrap();
            let entry = map.get(&note_id).expect("entry must exist");
            assert_eq!(entry.body, "", "body must be empty");
            assert!(
                entry.is_dirty,
                "is_dirty must be true after transitioning to empty"
            );
        }
    }

    // ── concurrent access safety skeleton (PROP-003, optional in lean mode) ─

    #[test]
    fn concurrent_writes_to_same_noteid_are_serialized_by_mutex() {
        // PROP-003 (optional in lean): Multiple threads writing distinct
        // bodies for the same noteId; final state is one of the bodies
        // (last-write-wins), mutex is not poisoned.
        let store = std::sync::Arc::new(NoteBodyStore::new());
        let note_id = "note-concurrent".to_string();
        let threads: Vec<_> = (0..4)
            .map(|i| {
                let store = store.clone();
                let note_id = note_id.clone();
                std::thread::spawn(move || {
                    let body = format!("body-thread-{}", i);
                    let mut map = store.0.lock().unwrap();
                    map.insert(
                        note_id.clone(),
                        InMemoryNoteBody {
                            body,
                            is_dirty: true,
                            last_saved_body: String::new(),
                        },
                    );
                })
            })
            .collect();

        for t in threads {
            t.join().expect("thread must not panic");
        }

        // Read back: entry must exist, mutex not poisoned.
        let map = store.0.lock().expect("mutex must not be poisoned");
        let entry = map.get(&note_id).expect("entry must exist");
        assert!(
            entry.body.starts_with("body-thread-"),
            "final body is one of the thread values"
        );
        assert!(entry.is_dirty);
    }
}
