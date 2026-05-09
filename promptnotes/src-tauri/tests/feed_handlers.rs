/// feed_handlers.rs — Rust integration tests for feed.rs handlers.
///
/// Sprint 2 Phase 2a (RED phase):
///   PROP-FEED-S2-001: fs_trash_file_impl with non-existent path returns Ok(())
///   PROP-FEED-S2-002: TrashErrorDto serializes with correct kind discriminator
///   PROP-FEED-S2-003: feed module is accessible (module-level compilation test)
///
/// Sprint 3 Phase 2b (GREEN phase):
///   PROP-FEED-S2-008: select_past_note emits editing_session_state_changed
///
/// Sprint 8 Phase 2b migration:
///   - make_editing_state_changed_payload now takes &EditingSessionStateDto (1 arg)
///   - select_past_note tests loosened to assert status + currentNoteId
///     per Sprint 8 instruction §影響範囲リスト (block-aware assertions deferred to
///     ui-feed-list-actions Sprint 4)

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

// ── Sprint 3 Phase 2b (GREEN): select_past_note editing_session_state_changed emit ─
// Sprint 8 migration: assertions loosened to status + currentNoteId
// per §影響範囲リスト (detailed block-aware assertions deferred to ui-feed-list-actions Sprint 4).

/// Sprint 3 / REQ-FEED-024 / PROP-FEED-S2-008:
/// `select_past_note` must emit editing_session_state_changed before feed_state_changed.
///
/// Sprint 8: Loosened to assert status="editing" + currentNoteId only.
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

    // Construct the editing_session_state_changed payload using the new Sprint 8 API.
    // REQ-IPC-014: compose_state_for_select_past_note sets status="editing",
    // currentNoteId=note_path, focusedBlockId=null, isDirty=false, isNoteEmpty=body.is_empty().
    let editor_state = promptnotes_lib::editor::compose_state_for_select_past_note(&note_path, body);
    let editor_payload = promptnotes_lib::editor::make_editing_state_changed_payload(&editor_state);

    // Sprint 8 loosened assertions: status + currentNoteId only.
    let state = editor_payload
        .get("state")
        .expect("payload must have 'state' wrapper per editor.rs make_editing_state_changed_payload");

    assert_eq!(state["status"], "editing", "status must be 'editing'");
    assert_eq!(state["currentNoteId"], note_path, "currentNoteId must match");
    assert_eq!(state["isDirty"], false, "isDirty must be false");
    assert_eq!(state["isNoteEmpty"], false, "isNoteEmpty must be false (non-empty body)");

    // Emit-order verification note (FIND-S3-006):
    // The editing_session_state_changed emit must occur BEFORE feed_state_changed.
    // This ordering is verified via code review + emit call ordering in feed.rs.

    // Cleanup
    let _ = std::fs::remove_file(&note_path);
}

/// Sprint 3 / REQ-FEED-024:
/// When select_past_note is called with a note_id that exists in the vault,
/// the editing_session_state_changed payload must have correct status and currentNoteId.
///
/// Sprint 8: Loosened from 6-field check to status + currentNoteId + key-set check.
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

    // Sprint 8: Verify payload via new singular API.
    let editor_state = promptnotes_lib::editor::compose_state_for_select_past_note(&note_path, body);
    let editor_payload = promptnotes_lib::editor::make_editing_state_changed_payload(&editor_state);
    let state = &editor_payload["state"];

    // Sprint 8 loosened assertions: status + currentNoteId + key-set.
    assert_eq!(state["status"], "editing", "status must be 'editing'");
    assert_eq!(state["currentNoteId"], note_path, "currentNoteId must match");
    assert_eq!(state["isDirty"], false, "isDirty must be false");
    assert!(
        state.get("isNoteEmpty").is_some(),
        "isNoteEmpty must be present in the editing variant"
    );
    // Verify the Sprint 8 editing variant key set is present
    let fields: Vec<&str> = state.as_object().unwrap().keys().map(|k| k.as_str()).collect();
    assert!(fields.contains(&"status"), "payload must contain 'status'");
    assert!(fields.contains(&"isDirty"), "payload must contain 'isDirty'");
    assert!(fields.contains(&"currentNoteId"), "payload must contain 'currentNoteId'");
    assert!(fields.contains(&"focusedBlockId"), "payload must contain 'focusedBlockId'");
    assert!(fields.contains(&"isNoteEmpty"), "payload must contain 'isNoteEmpty'");
    assert!(fields.contains(&"lastSaveResult"), "payload must contain 'lastSaveResult'");
    // Sprint 8: body field REMOVED from editor channel per §15.5 design notes.
    assert!(!fields.contains(&"body"), "body field must NOT be present in Sprint 8 editor channel");
    // Sprint 8: blocks is None → absent
    assert!(!fields.contains(&"blocks"), "blocks must be absent (None in Sprint 8)");

    // Cleanup
    let _ = std::fs::remove_file(&note_path);
}

/// Sprint 3 / REQ-FEED-024 / EC-FEED-016:
/// When note_id is not found in note_metadata, body must be empty string,
/// and isNoteEmpty must be true.
///
/// Sprint 8: Loosened to assert status + currentNoteId + isNoteEmpty.
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

    // Sprint 8: Verify payload via new singular API.
    let editor_state = promptnotes_lib::editor::compose_state_for_select_past_note(nonexistent_id, body);
    let editor_payload = promptnotes_lib::editor::make_editing_state_changed_payload(&editor_state);
    let state = &editor_payload["state"];

    // Sprint 8 loosened assertions.
    assert_eq!(state["status"], "editing", "status must be 'editing'");
    assert_eq!(state["currentNoteId"], nonexistent_id, "currentNoteId must match");
    assert_eq!(state["isNoteEmpty"], true, "isNoteEmpty must be true for empty body");
    // body field MUST NOT be present on the editor channel in Sprint 8.
    assert!(state.get("body").is_none(), "body must NOT be present in Sprint 8 editor channel");
}

// ── Sprint 4 PROP-FEED-S4-001..003, 005, 010, 012..014, 016 ──────────────────
//
// REQ-FEED-024 (amendment), REQ-FEED-025, REQ-FEED-026, REQ-FEED-027
//
// These tests call compose_state_for_select_past_note with the NEW block-aware
// signature:  (note_id: &str, blocks: Option<Vec<DtoBlock>>) -> EditingSessionStateDto
//
// The CURRENT implementation has the OLD signature:
//   (note_id: &str, body: &str) -> EditingSessionStateDto
//
// Therefore ALL tests in this section produce compile errors (genuine red).
// Phase 2b will update the implementation to match the new signature.

/// PROP-FEED-S4-001 / REQ-FEED-025 (ケース 2, non-empty blocks):
/// compose_state_for_select_past_note(note_id, Some(blocks)) must return
/// EditingSessionStateDto::Editing with:
///   - blocks: Some(blocks)
///   - focused_block_id: Some(blocks[0].id)
///   - is_note_empty: false (multiple non-empty blocks)
#[test]
fn prop_s4_001_compose_with_blocks_populates_focused_block_id() {
    use promptnotes_lib::editor::{BlockTypeDto, DtoBlock, EditingSessionStateDto};

    let blocks = vec![
        DtoBlock {
            id: "b1".to_string(),
            block_type: BlockTypeDto::Paragraph,
            content: "hello".to_string(),
        },
        DtoBlock {
            id: "b2".to_string(),
            block_type: BlockTypeDto::Paragraph,
            content: "world".to_string(),
        },
    ];

    // NEW signature: (note_id: &str, blocks: Option<Vec<DtoBlock>>) — RED: compile error
    let state = promptnotes_lib::editor::compose_state_for_select_past_note("note-1", Some(blocks.clone()));

    match state {
        EditingSessionStateDto::Editing {
            blocks: Some(ref b),
            focused_block_id,
            is_note_empty,
            ..
        } => {
            assert_eq!(b.len(), 2, "blocks array must contain both DtoBlocks");
            assert_eq!(
                focused_block_id,
                Some("b1".to_string()),
                "focused_block_id must be first block's id"
            );
            assert!(!is_note_empty, "is_note_empty must be false for non-empty blocks");
        }
        _ => panic!("expected EditingSessionStateDto::Editing arm"),
    }
}

/// PROP-FEED-S4-002 / REQ-FEED-025 (ケース 3, defensive — contract-unreachable):
/// compose_state_for_select_past_note(note_id, Some(vec![])) must return
/// EditingSessionStateDto::Editing with:
///   - focused_block_id: None (no first block)
///   - is_note_empty: true
///
/// Note: ケース (3) is contract-unreachable via parse_markdown_to_blocks non-empty
/// invariant. This test exists as a defensive spec only.
#[test]
fn prop_s4_002_compose_with_empty_blocks_vec_is_note_empty_true() {
    use promptnotes_lib::editor::{EditingSessionStateDto};

    // NEW signature: (note_id: &str, blocks: Option<Vec<DtoBlock>>) — RED: compile error
    let state = promptnotes_lib::editor::compose_state_for_select_past_note("note-empty", Some(vec![]));

    match state {
        EditingSessionStateDto::Editing {
            focused_block_id,
            is_note_empty,
            ..
        } => {
            assert_eq!(
                focused_block_id,
                None,
                "focused_block_id must be None for empty blocks vec"
            );
            assert!(is_note_empty, "is_note_empty must be true for empty blocks vec");
        }
        _ => panic!("expected EditingSessionStateDto::Editing arm"),
    }
}

/// PROP-FEED-S4-003 / REQ-FEED-025 (ケース 1, None):
/// compose_state_for_select_past_note(note_id, None) must return
/// EditingSessionStateDto::Editing with:
///   - blocks: None (field absent in JSON via skip_serializing_if)
///   - focused_block_id: None
///   - is_note_empty: true
#[test]
fn prop_s4_003_compose_with_none_blocks_gives_empty_state() {
    use promptnotes_lib::editor::{EditingSessionStateDto};

    // NEW signature: (note_id: &str, blocks: Option<Vec<DtoBlock>>) — RED: compile error
    let state = promptnotes_lib::editor::compose_state_for_select_past_note("note-none", None);

    match state {
        EditingSessionStateDto::Editing {
            blocks,
            focused_block_id,
            is_note_empty,
            ..
        } => {
            assert_eq!(blocks, None, "blocks must be None for None input");
            assert_eq!(focused_block_id, None, "focused_block_id must be None for None input");
            assert!(is_note_empty, "is_note_empty must be true for None input");
        }
        _ => panic!("expected EditingSessionStateDto::Editing arm"),
    }
}

/// PROP-FEED-S4-005 / REQ-FEED-026:
/// EditingSubDto in feed.rs must contain pending_next_focus: Option<PendingNextFocusDto>
/// (not pending_next_note_id: Option<String>).
///
/// This serde test verifies the field is present and round-trips correctly.
/// RED: EditingSubDto currently has pending_next_note_id instead of pending_next_focus.
#[test]
fn prop_s4_005_editing_sub_dto_has_pending_next_focus_field() {
    use promptnotes_lib::editor::PendingNextFocusDto;
    use promptnotes_lib::feed::EditingSubDto;

    // Construct an EditingSubDto with the NEW field pending_next_focus.
    // RED: EditingSubDto currently has pending_next_note_id, not pending_next_focus.
    let dto = EditingSubDto {
        status: "switching".to_string(),
        current_note_id: Some("note-1".to_string()),
        // NEW field — compile error with current EditingSubDto definition:
        pending_next_focus: Some(PendingNextFocusDto {
            note_id: "note-2".to_string(),
            block_id: "block-1".to_string(),
        }),
    };

    let json = serde_json::to_string(&dto).expect("EditingSubDto must serialize");
    assert!(
        json.contains("pendingNextFocus"),
        "JSON must contain 'pendingNextFocus' (camelCase), got: {}",
        json
    );
    assert!(
        !json.contains("pendingNextNoteId"),
        "JSON must NOT contain deprecated 'pendingNextNoteId', got: {}",
        json
    );
    assert!(
        json.contains("\"noteId\""),
        "JSON must contain nested 'noteId', got: {}",
        json
    );
    assert!(
        json.contains("\"blockId\""),
        "JSON must contain nested 'blockId', got: {}",
        json
    );
}

/// PROP-FEED-S4-010 / REQ-FEED-027:
/// FeedDomainSnapshotDto serde round-trip:
/// editing.pendingNextFocus must serialize as { noteId, blockId } when Some,
/// and null when None.
///
/// RED: EditingSubDto currently has pending_next_note_id, not pending_next_focus.
#[test]
fn prop_s4_010_feed_domain_snapshot_pending_next_focus_round_trip() {
    use promptnotes_lib::editor::PendingNextFocusDto;
    use promptnotes_lib::feed::{EditingSubDto, FeedDomainSnapshotDto, FeedSubDto, DeleteSubDto, CauseDto};

    // Case A: pending_next_focus is Some
    let dto_some = FeedDomainSnapshotDto {
        editing: EditingSubDto {
            status: "switching".to_string(),
            current_note_id: Some("note-1".to_string()),
            // NEW field — RED: compile error
            pending_next_focus: Some(PendingNextFocusDto {
                note_id: "note-2".to_string(),
                block_id: "block-42".to_string(),
            }),
        },
        feed: FeedSubDto {
            visible_note_ids: vec!["note-1".to_string(), "note-2".to_string()],
            filter_applied: false,
        },
        delete: promptnotes_lib::feed::no_delete(),
        note_metadata: std::collections::HashMap::new(),
        cause: CauseDto::EditingStateChanged,
    };

    let json_some = serde_json::to_string(&dto_some).expect("must serialize");
    let parsed_some: serde_json::Value = serde_json::from_str(&json_some).expect("must deserialize");

    assert_eq!(
        parsed_some["editing"]["pendingNextFocus"]["noteId"],
        "note-2",
        "pendingNextFocus.noteId must round-trip"
    );
    assert_eq!(
        parsed_some["editing"]["pendingNextFocus"]["blockId"],
        "block-42",
        "pendingNextFocus.blockId must round-trip"
    );

    // Case B: pending_next_focus is None → must serialize as null
    let dto_none = FeedDomainSnapshotDto {
        editing: EditingSubDto {
            status: "editing".to_string(),
            current_note_id: Some("note-1".to_string()),
            pending_next_focus: None,
        },
        feed: FeedSubDto {
            visible_note_ids: vec!["note-1".to_string()],
            filter_applied: false,
        },
        delete: promptnotes_lib::feed::no_delete(),
        note_metadata: std::collections::HashMap::new(),
        cause: CauseDto::EditingStateChanged,
    };

    let json_none = serde_json::to_string(&dto_none).expect("must serialize");
    let parsed_none: serde_json::Value = serde_json::from_str(&json_none).expect("must deserialize");

    // pendingNextFocus must be null (not skip_serializing_if — per REQ-FEED-027)
    assert!(
        parsed_none["editing"]["pendingNextFocus"].is_null(),
        "pendingNextFocus must be null when None, got: {}",
        parsed_none["editing"]["pendingNextFocus"]
    );
    assert!(
        !json_none.contains("pendingNextNoteId"),
        "JSON must NOT contain deprecated pendingNextNoteId"
    );
}

/// PROP-FEED-S4-012 / REQ-FEED-024 (amendment):
/// compose_state_for_select_past_note(note_id, Some(blocks)) →
/// make_editing_state_changed_payload → serde_json::to_string:
/// the resulting JSON must NOT contain 'body' key.
///
/// RED: compose_state_for_select_past_note currently takes (note_id, body: &str).
#[test]
fn prop_s4_012_payload_chain_no_body_field() {
    use promptnotes_lib::editor::{BlockTypeDto, DtoBlock};

    let blocks = vec![DtoBlock {
        id: "block-a".to_string(),
        block_type: BlockTypeDto::Paragraph,
        content: "test content".to_string(),
    }];

    // NEW signature — RED: compile error
    let state = promptnotes_lib::editor::compose_state_for_select_past_note("note-x", Some(blocks));
    let payload = promptnotes_lib::editor::make_editing_state_changed_payload(&state);
    let json = serde_json::to_string(&payload).expect("must serialize");

    assert!(
        !json.contains("\"body\""),
        "JSON payload must NOT contain 'body' field, got: {}",
        json
    );
}

/// PROP-FEED-S4-013 / REQ-FEED-024 (amendment):
/// compose_state_for_select_past_note(note_id, Some(blocks)) →
/// make_editing_state_changed_payload chain → JSON must contain
/// focusedBlockId equal to blocks[0].id.
///
/// RED: compose_state_for_select_past_note currently takes (note_id, body: &str).
#[test]
fn prop_s4_013_payload_chain_focused_block_id_matches_first_block() {
    use promptnotes_lib::editor::{BlockTypeDto, DtoBlock};

    let blocks = vec![
        DtoBlock {
            id: "first-block".to_string(),
            block_type: BlockTypeDto::Heading1,
            content: "Title".to_string(),
        },
        DtoBlock {
            id: "second-block".to_string(),
            block_type: BlockTypeDto::Paragraph,
            content: "Content".to_string(),
        },
    ];

    // NEW signature — RED: compile error
    let state = promptnotes_lib::editor::compose_state_for_select_past_note("note-y", Some(blocks));
    let payload = promptnotes_lib::editor::make_editing_state_changed_payload(&state);
    let json = serde_json::to_string(&payload).expect("must serialize");
    let parsed: serde_json::Value = serde_json::from_str(&json).expect("must deserialize");

    assert_eq!(
        parsed["state"]["focusedBlockId"],
        "first-block",
        "focusedBlockId must equal blocks[0].id ('first-block'), got: {}",
        parsed["state"]["focusedBlockId"]
    );
}

/// PROP-FEED-S4-014 / REQ-FEED-024 (amendment) / EC-FEED-016:
/// compose_state_for_select_past_note(note_id, None) →
/// make_editing_state_changed_payload chain → JSON must have:
///   - focusedBlockId: null
///   - blocks key absent
///   - isNoteEmpty: true
///
/// RED: compose_state_for_select_past_note currently takes (note_id, body: &str).
#[test]
fn prop_s4_014_payload_chain_none_blocks_gives_null_focused_and_empty() {
    // NEW signature — RED: compile error
    let state = promptnotes_lib::editor::compose_state_for_select_past_note("note-missing", None);
    let payload = promptnotes_lib::editor::make_editing_state_changed_payload(&state);
    let json = serde_json::to_string(&payload).expect("must serialize");
    let parsed: serde_json::Value = serde_json::from_str(&json).expect("must deserialize");

    assert!(
        parsed["state"]["focusedBlockId"].is_null(),
        "focusedBlockId must be null for None blocks, got: {}",
        parsed["state"]["focusedBlockId"]
    );
    assert_eq!(
        parsed["state"]["isNoteEmpty"],
        true,
        "isNoteEmpty must be true for None blocks"
    );
    // blocks field must be absent (None → skip_serializing_if = "Option::is_none")
    assert!(
        parsed["state"].get("blocks").is_none()
            || parsed["state"]["blocks"] == serde_json::Value::Null,
        "blocks key must be absent from JSON for None input, got: {}",
        parsed["state"]
    );
    assert!(
        !json.contains("\"body\""),
        "JSON payload must NOT contain 'body' field"
    );
}

/// PROP-FEED-S4-016 / REQ-FEED-025:
/// parse_markdown_to_blocks Rust implementation snapshot comparison.
///
/// This test verifies that parse_markdown_to_blocks exists and returns
/// expected output for basic cases. The function does NOT exist yet →
/// genuine compile error (red).
///
/// Cases: empty string, single paragraph, multi-paragraph, heading, bullet, code.
#[test]
fn prop_s4_016_parse_markdown_to_blocks_basic_cases() {
    // parse_markdown_to_blocks does NOT exist yet in editor.rs or feed.rs.
    // This call will cause a compile error (genuine red).

    // Case 1: empty string → non-empty Vec (1 empty paragraph, non-empty invariant)
    let result_empty = promptnotes_lib::editor::parse_markdown_to_blocks("");
    let blocks_empty = result_empty.expect("empty string must return Ok");
    assert!(
        !blocks_empty.is_empty(),
        "parse_markdown_to_blocks non-empty invariant: must return at least 1 block for empty input"
    );
    assert_eq!(
        blocks_empty[0].content, "",
        "single empty paragraph block for empty input"
    );

    // Case 2: single paragraph
    let result_para = promptnotes_lib::editor::parse_markdown_to_blocks("hello world");
    let blocks_para = result_para.expect("single paragraph must return Ok");
    assert!(!blocks_para.is_empty(), "must have at least 1 block");
    assert_eq!(blocks_para[0].content, "hello world");

    // Case 3: two paragraphs (separated by blank line)
    let result_multi = promptnotes_lib::editor::parse_markdown_to_blocks("first\n\nsecond");
    let blocks_multi = result_multi.expect("two paragraphs must return Ok");
    assert!(blocks_multi.len() >= 2, "two paragraphs must produce at least 2 blocks");

    // Case 4: heading
    let result_h1 = promptnotes_lib::editor::parse_markdown_to_blocks("# Title");
    let blocks_h1 = result_h1.expect("heading must return Ok");
    assert!(!blocks_h1.is_empty(), "heading must produce at least 1 block");

    // Case 5: bullet list
    let result_bullet = promptnotes_lib::editor::parse_markdown_to_blocks("- item one");
    let blocks_bullet = result_bullet.expect("bullet must return Ok");
    assert!(!blocks_bullet.is_empty(), "bullet must produce at least 1 block");

    // Case 6: code block
    let result_code = promptnotes_lib::editor::parse_markdown_to_blocks("```\ncode here\n```");
    let blocks_code = result_code.expect("code block must return Ok");
    assert!(!blocks_code.is_empty(), "code block must produce at least 1 block");
}
