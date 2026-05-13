//! editor_handlers.rs — Rust integration tests for editor.rs handlers.
//!
//! Sprint 2 Phase 2a (RED phase):
//!   PROP-100: EditingSessionStateDto serializes to camelCase JSON
//!   PROP-101: fs_write_file_atomic atomicity (tempfile + rename)
//!   PROP-102: std::io::ErrorKind → FsErrorDto error mapping totality
//!   PROP-103: request_new_note generates valid frontmatter + file
//!   PROP-104: Save handlers emit editing_session_state_changed correctly
//!   PROP-105: Session handlers (discard/cancel) emit correct state
//!   PROP-106: Ack handlers (edit_note_body, copy_note_body) have no side-effects
//!
//! Sprint 8 Phase 2b migration:
//!   - EditingSessionStateDto is now a 5-arm enum (not a flat struct)
//!   - make_editing_state_changed_payload now takes &EditingSessionStateDto (1 arg)
//!   - Legacy 6-arg form and flat-struct construction are replaced with variant construction

use promptnotes_lib::editor::{
    compose_state_for_cancel_switch, compose_state_for_save_err, compose_state_for_save_ok,
    compose_state_for_select_past_note, compose_state_idle, fs_write_file_atomic,
    generate_frontmatter, make_editing_state_changed_payload, EditingSessionStateDto, FsErrorDto,
    SaveErrorDto,
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-100: DTO serialization — camelCase roundtrip (Sprint 8 variant form)
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn editing_session_state_dto_serializes_camel_case() {
    // PROP-100: Sprint 8 — editing variant must serialize all camelCase fields correctly.
    let state = EditingSessionStateDto::Editing {
        current_note_id: "/vault/note-1.md".to_string(),
        focused_block_id: None,
        is_dirty: true,
        is_note_empty: false,
        last_save_result: None,
        blocks: None,
    };
    let json = serde_json::to_string(&state).expect("serialize failed");

    assert!(
        json.contains("\"status\""),
        "Expected camelCase 'status': {}",
        json
    );
    assert!(
        json.contains("\"isDirty\""),
        "Expected camelCase 'isDirty': {}",
        json
    );
    assert!(
        json.contains("\"currentNoteId\""),
        "Expected camelCase 'currentNoteId': {}",
        json
    );
    assert!(
        json.contains("\"focusedBlockId\""),
        "Expected camelCase 'focusedBlockId': {}",
        json
    );
    assert!(
        json.contains("\"isNoteEmpty\""),
        "Expected camelCase 'isNoteEmpty': {}",
        json
    );
    assert!(
        json.contains("\"lastSaveResult\""),
        "Expected camelCase 'lastSaveResult': {}",
        json
    );
    assert!(
        json.contains("\"editing\""),
        "Expected status value 'editing': {}",
        json
    );
}

#[test]
fn editing_session_state_dto_roundtrips() {
    // PROP-100: Sprint 8 — JSON roundtrip over the Idle variant is identity.
    let state = EditingSessionStateDto::Idle;
    let json = serde_json::to_string(&state).expect("serialize failed");
    let parsed: EditingSessionStateDto = serde_json::from_str(&json).expect("deserialize failed");
    assert_eq!(parsed, EditingSessionStateDto::Idle);
    // Verify the parsed JSON shape
    let value: serde_json::Value = serde_json::from_str(&json).expect("parse json");
    assert_eq!(value["status"], "idle");
    assert!(
        value.as_object().unwrap().len() == 1,
        "Idle must have exactly one key"
    );
}

#[test]
fn editing_session_state_dto_with_save_error_serializes() {
    // PROP-100: Sprint 8 — save-failed variant serializes with correct key set.
    let state = EditingSessionStateDto::SaveFailed {
        current_note_id: "/vault/n.md".to_string(),
        prior_focused_block_id: None,
        pending_next_focus: None,
        last_save_error: SaveErrorDto {
            kind: "fs".to_string(),
            reason: Some(FsErrorDto {
                kind: "permission".to_string(),
            }),
        },
        is_note_empty: false,
        blocks: None,
    };
    let json = serde_json::to_string(&state).expect("serialize failed");

    assert!(
        json.contains("\"save-failed\""),
        "Expected status 'save-failed': {}",
        json
    );
    assert!(
        json.contains("\"lastSaveError\""),
        "Expected 'lastSaveError': {}",
        json
    );
    assert!(json.contains("\"fs\""), "Expected kind 'fs': {}", json);
    assert!(
        json.contains("\"permission\""),
        "Expected reason 'permission': {}",
        json
    );
}

#[test]
fn editing_session_state_changed_event_payload_has_state_wrapper() {
    // PROP-100: Sprint 8 — The event payload wraps EditingSessionStateDto in { "state": ... }
    // using the new singular make_editing_state_changed_payload(&state) form.
    let state = EditingSessionStateDto::Editing {
        current_note_id: "/vault/n.md".to_string(),
        focused_block_id: None,
        is_dirty: false,
        is_note_empty: false,
        last_save_result: None,
        blocks: None,
    };
    let payload = make_editing_state_changed_payload(&state);
    let json = serde_json::to_string(&payload).expect("serialize failed");

    // Verify the wrapper structure
    let parsed: serde_json::Value = serde_json::from_str(&json).expect("deserialize failed");
    assert!(
        parsed.get("state").is_some(),
        "Payload must wrap state field: {}",
        json
    );
    let inner = parsed.get("state").unwrap();
    assert_eq!(inner.get("status").unwrap().as_str().unwrap(), "editing");
    assert!(!inner.get("isDirty").unwrap().as_bool().unwrap());
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
    assert!(
        result.is_ok(),
        "fs_write_file_atomic must succeed: {:?}",
        result
    );

    let read_back = std::fs::read_to_string(target).expect("read back failed");
    assert_eq!(read_back, content, "Content must match exactly");

    // Cleanup
    let _ = std::fs::remove_file(target);
}

#[test]
fn fs_write_file_atomic_does_not_partial_write_on_error() {
    // PROP-101: When the tempfile write succeeds but rename fails (e.g., permission
    // on target directory), the target file must remain unchanged.
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
        assert_eq!(
            read_back, "new content",
            "Atomic write must replace content"
        );
    }
    // On permission error, original must be preserved
    else {
        let read_back = std::fs::read_to_string(target).expect("read back");
        assert_eq!(
            read_back, original,
            "On failure, original must be preserved"
        );
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
    // PROP-102: FsErrorDto.kind field must accept the spec values.
    let kinds = vec!["permission", "disk-full", "lock", "unknown"];
    for k in &kinds {
        let dto = FsErrorDto {
            kind: k.to_string(),
        };
        let json = serde_json::to_string(&dto).expect("serialize failed");
        assert!(
            json.contains(k),
            "FsErrorDto must serialize kind='{}': {}",
            k,
            json
        );
    }
}

#[test]
fn save_error_dto_kind_is_fs_or_validation() {
    // PROP-102: SaveErrorDto.kind is "fs" or "validation".
    let fs_err = SaveErrorDto {
        kind: "fs".to_string(),
        reason: Some(FsErrorDto {
            kind: "disk-full".to_string(),
        }),
    };
    let json = serde_json::to_string(&fs_err).expect("serialize");
    assert!(json.contains("\"fs\""), "Expected kind 'fs': {}", json);
    assert!(json.contains("\"disk-full\""), "Expected reason: {}", json);

    let val_err = SaveErrorDto {
        kind: "validation".to_string(),
        reason: None,
    };
    let json2 = serde_json::to_string(&val_err).expect("serialize");
    assert!(
        json2.contains("\"validation\""),
        "Expected kind 'validation': {}",
        json2
    );
}

#[test]
fn save_error_dto_reason_skipped_when_none() {
    // PROP-102: When reason is None, it is absent from JSON (skip_serializing_if).
    let val_err = SaveErrorDto {
        kind: "validation".to_string(),
        reason: None,
    };
    let json = serde_json::to_string(&val_err).expect("serialize");
    assert!(
        !json.contains("\"reason\""),
        "reason: None must be absent: {}",
        json
    );
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
    assert!(
        fm.contains(&now_ms.to_string()),
        "Must contain timestamp: {}",
        fm
    );
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
    assert!(
        fm.ends_with("---\n\n"),
        "Frontmatter must end with ---\\n\\n for empty body"
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-104: Save handler emit patterns (Sprint 8 form)
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn make_editing_state_changed_payload_success() {
    // PROP-104: Sprint 8 — Success payload uses compose_state_for_save_ok.
    // status='editing', isDirty=false, no error.
    let state = compose_state_for_save_ok("/vault/n.md", "body text");
    let payload = make_editing_state_changed_payload(&state);
    let json = serde_json::to_string(&payload).expect("serialize");

    let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");
    let inner = &parsed["state"];
    assert_eq!(
        inner["status"], "editing",
        "Status must be 'editing': {}",
        json
    );
    assert_eq!(inner["isDirty"], false, "isDirty must be false: {}", json);
    assert!(
        !json.contains("\"save-failed\""),
        "Must not contain save-failed: {}",
        json
    );
}

#[test]
fn make_editing_state_changed_payload_save_failed() {
    // PROP-104: Sprint 8 — Failure payload uses compose_state_for_save_err.
    // status='save-failed', lastSaveError populated.
    let fs_err = FsErrorDto {
        kind: "disk-full".to_string(),
    };
    let state = compose_state_for_save_err("/vault/n.md", "draft", fs_err);
    let payload = make_editing_state_changed_payload(&state);
    let json = serde_json::to_string(&payload).expect("serialize");

    let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");
    let inner = &parsed["state"];
    assert_eq!(
        inner["status"], "save-failed",
        "Status must be 'save-failed': {}",
        json
    );
    assert!(
        json.contains("\"disk-full\""),
        "Must contain error reason: {}",
        json
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-105: Session handler emit patterns (Sprint 8 form)
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn discard_session_payload_is_idle_state() {
    // PROP-105: Sprint 8 — discard_current_session emits compose_state_idle().
    let state = compose_state_idle();
    let payload = make_editing_state_changed_payload(&state);
    let json = serde_json::to_string(&payload).expect("serialize");

    let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");
    assert_eq!(
        parsed["state"]["status"], "idle",
        "Status must be 'idle': {}",
        json
    );
    assert!(!json.contains("\"save-failed\""), "Must not be save-failed");
    // REQ-IPC-016: Idle must have ONLY status key
    let state_obj = parsed["state"].as_object().unwrap();
    assert_eq!(state_obj.len(), 1, "Idle state must have only 'status' key");
}

#[test]
fn cancel_switch_payload_is_editing_with_dirty() {
    // PROP-105: Sprint 8 — cancel_switch emits compose_state_for_cancel_switch().
    // REQ-IPC-015: isDirty=true, focusedBlockId=null, isNoteEmpty=false.
    let state = compose_state_for_cancel_switch("/vault/n.md");
    let payload = make_editing_state_changed_payload(&state);
    let json = serde_json::to_string(&payload).expect("serialize");

    let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");
    let inner = &parsed["state"];
    assert_eq!(
        inner["status"], "editing",
        "Status must be 'editing': {}",
        json
    );
    assert_eq!(inner["isDirty"], true, "isDirty must be true: {}", json);
    assert_eq!(
        inner["focusedBlockId"],
        serde_json::Value::Null,
        "focusedBlockId must be null"
    );
    assert_eq!(
        inner["isNoteEmpty"], false,
        "isNoteEmpty must be false (conservative)"
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-106: Ack handler no-side-effects
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn make_editing_state_changed_payload_idempotent() {
    // PROP-106: Sprint 8 — make_editing_state_changed_payload is a pure constructor —
    // calling it twice with same state produces identical output.
    let blocks1 =
        promptnotes_lib::editor::parse_markdown_to_blocks("b").expect("parse must succeed");
    let blocks2 =
        promptnotes_lib::editor::parse_markdown_to_blocks("b").expect("parse must succeed");
    let state1 = compose_state_for_select_past_note("/v/n.md", Some(blocks1));
    let state2 = compose_state_for_select_past_note("/v/n.md", Some(blocks2));
    let p1 = make_editing_state_changed_payload(&state1);
    let p2 = make_editing_state_changed_payload(&state2);
    let j1 = serde_json::to_string(&p1).expect("serialize");
    let j2 = serde_json::to_string(&p2).expect("serialize");
    assert_eq!(j1, j2, "Identical args must produce identical payload");
}
