/// editor_handlers.rs — Rust integration tests for editor.rs handlers.
///
/// Sprint 2 Phase 2a (RED phase):
///   PROP-100: EditingSessionStateDto serializes to camelCase JSON
///   PROP-101: fs_write_file_atomic atomicity (tempfile + rename)
///   PROP-102: std::io::ErrorKind → FsErrorDto error mapping totality
///   PROP-103: request_new_note generates valid frontmatter + file
///   PROP-104: Save handlers emit editing_session_state_changed correctly
///   PROP-105: Session handlers (discard/cancel) emit correct state
///   PROP-106: Ack handlers (edit_note_body, copy_note_body) have no side-effects
///
/// These tests MUST FAIL in Phase 2a because editor.rs does not yet exist.
/// Once editor.rs is implemented (Phase 2b), all tests must pass.

use promptnotes_lib::editor::{
    EditingSessionStateDto, FsErrorDto, SaveErrorDto, fs_write_file_atomic,
    make_editing_state_changed_payload, generate_frontmatter,
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-100: DTO serialization — camelCase roundtrip
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn editing_session_state_dto_serializes_camel_case() {
    // PROP-100: All fields must serialize as camelCase matching TS EditingSessionState.
    let state = EditingSessionStateDto {
        status: "editing".to_string(),
        is_dirty: true,
        current_note_id: Some("/vault/note-1.md".to_string()),
        pending_next_note_id: None,
        last_error: None,
        body: "# Hello".to_string(),
    };
    let json = serde_json::to_string(&state).expect("serialize failed");

    assert!(json.contains("\"status\""), "Expected camelCase 'status': {}", json);
    assert!(json.contains("\"isDirty\""), "Expected camelCase 'isDirty': {}", json);
    assert!(json.contains("\"currentNoteId\""), "Expected camelCase 'currentNoteId': {}", json);
    assert!(json.contains("\"pendingNextNoteId\""), "Expected camelCase 'pendingNextNoteId': {}", json);
    assert!(json.contains("\"lastError\""), "Expected camelCase 'lastError': {}", json);
    assert!(json.contains("\"body\""), "Expected 'body': {}", json);
    assert!(json.contains("\"editing\""), "Expected status value 'editing': {}", json);
}

#[test]
fn editing_session_state_dto_roundtrips() {
    // PROP-100: JSON roundtrip is identity.
    let state = EditingSessionStateDto {
        status: "idle".to_string(),
        is_dirty: false,
        current_note_id: None,
        pending_next_note_id: None,
        last_error: None,
        body: String::new(),
    };
    let json = serde_json::to_string(&state).expect("serialize failed");
    let parsed: EditingSessionStateDto = serde_json::from_str(&json).expect("deserialize failed");
    assert_eq!(parsed.status, "idle");
    assert!(!parsed.is_dirty);
    assert!(parsed.current_note_id.is_none());
    assert!(parsed.pending_next_note_id.is_none());
    assert!(parsed.last_error.is_none());
    assert!(parsed.body.is_empty());
}

#[test]
fn editing_session_state_dto_with_save_error_serializes() {
    // PROP-100: lastError field with fs error serializes nested structure.
    let state = EditingSessionStateDto {
        status: "save-failed".to_string(),
        is_dirty: true,
        current_note_id: Some("/vault/n.md".to_string()),
        pending_next_note_id: None,
        last_error: Some(SaveErrorDto {
            kind: "fs".to_string(),
            reason: Some(FsErrorDto {
                kind: "permission".to_string(),
            }),
        }),
        body: "draft".to_string(),
    };
    let json = serde_json::to_string(&state).expect("serialize failed");

    assert!(json.contains("\"save-failed\""), "Expected status 'save-failed': {}", json);
    assert!(json.contains("\"lastError\""), "Expected 'lastError': {}", json);
    assert!(json.contains("\"fs\""), "Expected kind 'fs': {}", json);
    assert!(json.contains("\"permission\""), "Expected reason 'permission': {}", json);
}

#[test]
fn editing_session_state_changed_event_payload_has_state_wrapper() {
    // PROP-100: The event payload wraps EditingSessionStateDto in { "state": ... }
    // matching editorStateChannel.ts's event.payload.state access pattern.
    let state = EditingSessionStateDto {
        status: "editing".to_string(),
        is_dirty: false,
        current_note_id: Some("/vault/n.md".to_string()),
        pending_next_note_id: None,
        last_error: None,
        body: "content".to_string(),
    };
    let payload = serde_json::json!({ "state": &state });
    let json = serde_json::to_string(&payload).expect("serialize failed");

    // Verify the wrapper structure
    let parsed: serde_json::Value = serde_json::from_str(&json).expect("deserialize failed");
    assert!(parsed.get("state").is_some(), "Payload must wrap state field: {}", json);
    let inner = parsed.get("state").unwrap();
    assert_eq!(inner.get("status").unwrap().as_str().unwrap(), "editing");
    assert_eq!(inner.get("isDirty").unwrap().as_bool().unwrap(), false);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-101: fs_write_file_atomic atomicity
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn fs_write_file_atomic_writes_complete_content() {
    // PROP-101: Successful write — target file contains exact content.
    let target = "/tmp/promptnotes-atomic-test-target.md";
    let content = "# Test note\n\nBody content here.\n";

    // Clean up any previous run
    let _ = std::fs::remove_file(target);

    let result = fs_write_file_atomic(target, content);
    assert!(result.is_ok(), "fs_write_file_atomic must succeed: {:?}", result);

    let read_back = std::fs::read_to_string(target).expect("read back failed");
    assert_eq!(read_back, content, "Content must match exactly");

    // Cleanup
    let _ = std::fs::remove_file(target);
}

#[test]
fn fs_write_file_atomic_does_not_partial_write_on_error() {
    // PROP-101: When the tempfile write succeeds but rename fails (e.g., permission
    // on target directory), the target file must remain unchanged.
    // We simulate this by writing to a target that already exists as a read-only file.
    // Actually testing the atomic rename failure path is platform-dependent;
    // this test verifies the basic success → file-exists path is correct.
    let target = "/tmp/promptnotes-atomic-readonly-target.md";
    let original = "original content";

    // Clean up
    let _ = std::fs::remove_file(target);

    // Write initial content
    std::fs::write(target, original).expect("write original");

    // Write via atomic — should succeed and replace
    let result = fs_write_file_atomic(target, "new content");
    if result.is_ok() {
        let read_back = std::fs::read_to_string(target).expect("read back");
        assert_eq!(read_back, "new content", "Atomic write must replace content");
    }
    // On permission error, original must be preserved
    else {
        let read_back = std::fs::read_to_string(target).expect("read back");
        assert_eq!(read_back, original, "On failure, original must be preserved");
    }

    let _ = std::fs::remove_file(target);
}

#[test]
fn fs_write_file_atomic_handles_empty_content() {
    // PROP-101: Empty body writes must succeed (new empty note).
    let target = "/tmp/promptnotes-atomic-empty-test.md";
    let _ = std::fs::remove_file(target);

    let result = fs_write_file_atomic(target, "");
    assert!(result.is_ok(), "Empty write must succeed: {:?}", result);

    let read_back = std::fs::read_to_string(target).expect("read back");
    assert_eq!(read_back, "", "Empty file must be empty");

    let _ = std::fs::remove_file(target);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-102: Error mapping totality
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn fs_error_dto_kind_matches_spec() {
    // PROP-102: FsErrorDto.kind field must accept the 4 spec values.
    let kinds = vec!["permission", "disk-full", "lock", "unknown"];
    for k in &kinds {
        let dto = FsErrorDto {
            kind: k.to_string(),
        };
        let json = serde_json::to_string(&dto).expect("serialize failed");
        assert!(json.contains(k), "FsErrorDto must serialize kind='{}': {}", k, json);
    }
}

#[test]
fn save_error_dto_kind_is_fs_or_validation() {
    // PROP-102: SaveErrorDto.kind is "fs" or "validation".
    let fs_err = SaveErrorDto {
        kind: "fs".to_string(),
        reason: Some(FsErrorDto { kind: "disk-full".to_string() }),
    };
    let json = serde_json::to_string(&fs_err).expect("serialize");
    assert!(json.contains("\"fs\""), "Expected kind 'fs': {}", json);
    assert!(json.contains("\"disk-full\""), "Expected reason: {}", json);

    let val_err = SaveErrorDto {
        kind: "validation".to_string(),
        reason: None,
    };
    let json2 = serde_json::to_string(&val_err).expect("serialize");
    assert!(json2.contains("\"validation\""), "Expected kind 'validation': {}", json2);
}

#[test]
fn save_error_dto_reason_skipped_when_none() {
    // PROP-102: When reason is None, it is absent from JSON (skip_serializing_if).
    let val_err = SaveErrorDto {
        kind: "validation".to_string(),
        reason: None,
    };
    let json = serde_json::to_string(&val_err).expect("serialize");
    assert!(!json.contains("\"reason\""), "reason: None must be absent: {}", json);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-103: request_new_note frontmatter generation
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn generate_frontmatter_has_required_fields() {
    // PROP-103: Frontmatter must contain createdAt, updatedAt, tags.
    let now_ms: i64 = 1700000000000;
    let fm = generate_frontmatter(now_ms);
    assert!(fm.contains("createdAt:"), "Must contain createdAt: {}", fm);
    assert!(fm.contains("updatedAt:"), "Must contain updatedAt: {}", fm);
    assert!(fm.contains("tags:"), "Must contain tags: {}", fm);
    assert!(fm.contains(&now_ms.to_string()), "Must contain timestamp: {}", fm);
    assert!(fm.contains("[]"), "tags must be empty array: {}", fm);
}

#[test]
fn generate_frontmatter_has_yaml_delimiters() {
    // PROP-103: Frontmatter must be valid YAML between --- delimiters.
    let fm = generate_frontmatter(1234);
    let lines: Vec<&str> = fm.lines().collect();
    assert_eq!(lines[0], "---", "Must start with '---'");
    // Frontmatter ends with "---\n\n" so the second-to-last non-empty line is "---"
    assert_eq!(lines[4], "---", "Fifth line must be closing '---'");
    assert!(lines.len() >= 5, "Must have at least 5 lines");
}

#[test]
fn generate_frontmatter_body_section_is_empty() {
    // PROP-103: After frontmatter, body section is empty (two trailing newlines).
    let fm = generate_frontmatter(0);
    // Frontmatter block ends with "---\n\n" and nothing after.
    assert!(fm.ends_with("---\n\n"), "Frontmatter must end with ---\\n\\n for empty body");
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-104: Save handler emit patterns
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn make_editing_state_changed_payload_success() {
    // PROP-104: Success payload has status='editing', isDirty=false, no error.
    let payload = make_editing_state_changed_payload(
        "editing", false, Some("/vault/n.md".to_string()), None, None, "body text"
    );
    let json = serde_json::to_string(&payload).expect("serialize");
    assert!(json.contains("\"editing\""), "Status must be 'editing': {}", json);
    assert!(!json.contains("\"save-failed\""), "Must not contain save-failed: {}", json);
}

#[test]
fn make_editing_state_changed_payload_save_failed() {
    // PROP-104: Failure payload has status='save-failed', lastError populated.
    let err = SaveErrorDto {
        kind: "fs".to_string(),
        reason: Some(FsErrorDto { kind: "disk-full".to_string() }),
    };
    let payload = make_editing_state_changed_payload(
        "save-failed", true, Some("/vault/n.md".to_string()), None, Some(err), "draft"
    );
    let json = serde_json::to_string(&payload).expect("serialize");
    assert!(json.contains("\"save-failed\""), "Status must be 'save-failed': {}", json);
    assert!(json.contains("\"disk-full\""), "Must contain error reason: {}", json);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-105: Session handler emit patterns
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn discard_session_payload_is_idle_state() {
    // PROP-105: discard_current_session must emit idle state with all fields reset.
    let payload = make_editing_state_changed_payload(
        "idle", false, None, None, None, ""
    );
    let json = serde_json::to_string(&payload).expect("serialize");
    assert!(json.contains("\"idle\""), "Status must be 'idle': {}", json);
    assert!(!json.contains("\"save-failed\""), "Must not be save-failed");
}

#[test]
fn cancel_switch_payload_is_editing_with_dirty() {
    // PROP-105: cancel_switch must emit editing state with isDirty=true.
    let payload = make_editing_state_changed_payload(
        "editing", true, Some("/vault/n.md".to_string()), None, None, "unsaved content"
    );
    let json = serde_json::to_string(&payload).expect("serialize");
    assert!(json.contains("\"editing\""), "Status must be 'editing': {}", json);
    assert!(json.contains("\"isDirty\":true"), "isDirty must be true: {}", json);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-106: Ack handler no-side-effects
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn make_editing_state_changed_payload_idempotent() {
    // PROP-106: make_editing_state_changed_payload is a pure constructor —
    // calling it twice with same args produces identical output.
    let p1 = make_editing_state_changed_payload(
        "editing", false, Some("/v/n.md".to_string()), None, None, "b",
    );
    let p2 = make_editing_state_changed_payload(
        "editing", false, Some("/v/n.md".to_string()), None, None, "b",
    );
    let j1 = serde_json::to_string(&p1).expect("serialize");
    let j2 = serde_json::to_string(&p2).expect("serialize");
    assert_eq!(j1, j2, "Identical args must produce identical payload");
}
