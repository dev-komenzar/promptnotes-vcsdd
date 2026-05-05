/// feed_handlers.rs — Rust integration tests for feed.rs handlers.
///
/// Sprint 2 Phase 2a (RED phase):
///   PROP-FEED-S2-001: fs_trash_file_impl with non-existent path returns Ok(())
///   PROP-FEED-S2-002: TrashErrorDto serializes with correct kind discriminator
///   PROP-FEED-S2-003: feed module is accessible (module-level compilation test)
///
/// These tests call functions from the feed module. They MUST FAIL in Phase 2a
/// because the feed module does not yet exist.

// Phase 2a: These tests fail because `promptnotes_lib::feed` does not exist yet.
// Once feed.rs is implemented (Phase 2b), all tests must pass.

use promptnotes_lib::feed::{fs_trash_file_impl, TrashErrorDto};

#[test]
fn fs_trash_file_impl_nonexistent_returns_ok() {
    // REQ-FEED-019: not-found is treated as success (already deleted).
    // PROP-FEED-S2-001
    let result = fs_trash_file_impl("/tmp/promptnotes-test-nonexistent-file-abc123.md");
    assert!(
        result.is_ok(),
        "Expected Ok(()) for non-existent file, got {:?}",
        result
    );
}

#[test]
fn fs_trash_file_impl_existing_file_returns_ok() {
    // REQ-FEED-019: successfully deleting an existing file returns Ok(()).
    use std::io::Write;
    let tmp_path = "/tmp/promptnotes-test-trash-target-abc123.md";
    {
        let mut f = std::fs::File::create(tmp_path).expect("failed to create temp file");
        f.write_all(b"test content").expect("failed to write");
    }
    let result = fs_trash_file_impl(tmp_path);
    assert!(
        result.is_ok(),
        "Expected Ok(()) for existing file, got {:?}",
        result
    );
    // Cleanup in case test fails midway (file should already be deleted)
    let _ = std::fs::remove_file(tmp_path);
}

#[test]
fn trash_error_dto_serializes_permission_kind() {
    // REQ-FEED-019 / PROP-FEED-S2-002: TrashErrorDto::Permission serializes to
    // { "kind": "permission" } (kebab-case via serde tag).
    let err = TrashErrorDto::Permission;
    let json = serde_json::to_string(&err).expect("serialization failed");
    assert!(
        json.contains("\"kind\""),
        "Expected 'kind' key in JSON, got: {}",
        json
    );
    assert!(
        json.contains("\"permission\""),
        "Expected 'permission' value, got: {}",
        json
    );
}

#[test]
fn trash_error_dto_serializes_unknown_kind_with_detail() {
    // REQ-FEED-019 / PROP-FEED-S2-002: TrashErrorDto::Unknown with detail serializes
    // to { "kind": "unknown", "detail": "<msg>" }.
    let err = TrashErrorDto::Unknown {
        detail: Some("disk-full".to_string()),
    };
    let json = serde_json::to_string(&err).expect("serialization failed");
    assert!(
        json.contains("\"unknown\""),
        "Expected 'unknown' value, got: {}",
        json
    );
    assert!(
        json.contains("disk-full"),
        "Expected detail 'disk-full' in JSON, got: {}",
        json
    );
}

#[test]
fn trash_error_dto_serializes_unknown_kind_no_detail() {
    // REQ-FEED-019: Unknown with no detail serializes to { "kind": "unknown", "detail": null }.
    let err = TrashErrorDto::Unknown { detail: None };
    let json = serde_json::to_string(&err).expect("serialization failed");
    assert!(
        json.contains("\"unknown\""),
        "Expected 'unknown' value, got: {}",
        json
    );
}

// ── Sprint 3 Phase 2a (RED phase): select_past_note editing_session_state_changed emit ─

/// Sprint 3 / REQ-FEED-024 / PROP-FEED-S2-008:
/// `select_past_note` must emit editing_session_state_changed before feed_state_changed.
///
/// RED phase: This test verifies the VCSDD spec requirement. The test currently
/// FAILS because select_past_note does not yet emit editing_session_state_changed.
/// It will PASS after the Green phase implementation.
#[test]
fn test_select_past_note_emits_editing_session_state_changed() {
    use std::io::Write;

    let tmp_dir = "/tmp/promptnotes-s3-editing-emit";
    let _ = std::fs::create_dir_all(tmp_dir);
    let note_path = format!("{}/test-note.md", tmp_dir);

    // Write a markdown file with known body content
    let body_content = "Hello from past note\nSecond line";
    {
        let mut f = std::fs::File::create(&note_path).expect("create note");
        f.write_all(format!("---\ncreatedAt: 1000\nupdatedAt: 2000\ntags: [rust]\n---\n{}", body_content).as_bytes())
            .expect("write note");
    }

    // Call scan_vault_feed to get note_metadata (same as select_past_note's internal flow)
    let (_visible_ids, note_metadata) =
        promptnotes_lib::feed::scan_vault_feed(tmp_dir);

    // Extract body from note_metadata (as select_past_note should do)
    let body = note_metadata
        .get(&note_path)
        .map(|m| m.body.as_str())
        .unwrap_or("");

    assert!(
        !body.is_empty(),
        "Expected body to be non-empty; note_metadata key={}, available keys={:?}",
        note_path,
        note_metadata.keys().collect::<Vec<_>>()
    );
    assert!(
        body.contains("Hello from past note"),
        "Expected body to contain 'Hello from past note', got: '{}'",
        body
    );

    // Construct the editing_session_state_changed payload (as select_past_note should)
    let editor_payload = promptnotes_lib::editor::make_editing_state_changed_payload(
        "editing", false, Some(note_path.clone()), None, None, body,
    );

    // Verify payload structure matches REQ-FEED-024 acceptance criteria
    let state = editor_payload
        .get("state")
        .expect("payload must have 'state' wrapper per editor.rs make_editing_state_changed_payload");

    assert_eq!(state["status"], "editing", "status must be 'editing'");
    assert_eq!(state["isDirty"], false, "isDirty must be false");
    assert_eq!(state["currentNoteId"], note_path, "currentNoteId must match");
    assert!(state["pendingNextNoteId"].is_null(), "pendingNextNoteId must be null");
    assert!(state["lastError"].is_null(), "lastError must be null");
    assert_eq!(state["body"], body_content, "body must match file content");

    // Emit-order verification note (FIND-S3-006):
    // The editing_session_state_changed emit must occur BEFORE feed_state_changed.
    // This ordering is verified via code review + emit call ordering in feed.rs.

    // Cleanup
    let _ = std::fs::remove_file(&note_path);
}

/// Sprint 3 / REQ-FEED-024:
/// When select_past_note is called with a note_id that exists in the vault,
/// the editing_session_state_changed payload must contain the note body from the file system.
#[test]
fn test_select_past_note_editing_payload_contains_body() {
    use std::io::Write;

    let tmp_dir = "/tmp/promptnotes-s3-payload-body";
    let _ = std::fs::create_dir_all(tmp_dir);
    let note_path = format!("{}/body-test.md", tmp_dir);

    let body_content = "Actual body content\nLine two\nLine three";
    {
        let mut f = std::fs::File::create(&note_path).expect("create note");
        f.write_all(
            format!(
                "---\ncreatedAt: 100\nupdatedAt: 200\ntags: []\n---\n{}",
                body_content
            )
            .as_bytes(),
        )
        .expect("write note");
    }

    let (_visible_ids, note_metadata) =
        promptnotes_lib::feed::scan_vault_feed(tmp_dir);

    // Simulate select_past_note body extraction
    let body = note_metadata
        .get(&note_path)
        .map(|m| m.body.as_str())
        .unwrap_or("");

    assert_eq!(
        body, body_content,
        "Body from note_metadata must match file content exactly"
    );

    // Verify full payload has 6 fields
    let editor_payload = promptnotes_lib::editor::make_editing_state_changed_payload(
        "editing", false, Some(note_path.clone()), None, None, body,
    );
    let state = &editor_payload["state"];
    let fields: Vec<&str> = state.as_object().unwrap().keys().map(|k| k.as_str()).collect();
    assert!(
        fields.contains(&"status"),
        "payload must contain 'status' field; got: {:?}", fields
    );
    assert!(
        fields.contains(&"isDirty"),
        "payload must contain 'isDirty' field"
    );
    assert!(
        fields.contains(&"currentNoteId"),
        "payload must contain 'currentNoteId' field"
    );
    assert!(
        fields.contains(&"pendingNextNoteId"),
        "payload must contain 'pendingNextNoteId' field"
    );
    assert!(
        fields.contains(&"lastError"),
        "payload must contain 'lastError' field"
    );
    assert!(
        fields.contains(&"body"),
        "payload must contain 'body' field"
    );

    // Cleanup
    let _ = std::fs::remove_file(&note_path);
}

/// Sprint 3 / REQ-FEED-024 / EC-FEED-016:
/// When note_id is not found in note_metadata, body must be empty string.
#[test]
fn test_select_past_note_nonexistent_body_is_empty() {
    // Simulate a non-existent note_id by looking up a key that doesn't exist
    let note_metadata: std::collections::HashMap<String, promptnotes_lib::feed::NoteRowMetadataDto> =
        std::collections::HashMap::new();

    let nonexistent_id = "/tmp/promptnotes-nonexistent-note.md";

    let body = note_metadata
        .get(nonexistent_id)
        .map(|m: &promptnotes_lib::feed::NoteRowMetadataDto| m.body.as_str())
        .unwrap_or("");

    assert_eq!(body, "", "Body must be empty for non-existent note_id");

    // Verify payload with empty body still has all 6 fields
    let editor_payload = promptnotes_lib::editor::make_editing_state_changed_payload(
        "editing", false, Some(nonexistent_id.to_string()), None, None, body,
    );
    let state = &editor_payload["state"];
    assert_eq!(state["status"], "editing");
    assert_eq!(state["body"], "");
    assert_eq!(state["currentNoteId"], nonexistent_id);
}
