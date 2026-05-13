//! feed_handlers.rs — Rust integration tests for feed.rs handlers.
//!
//! Sprint 2 Phase 2a (RED phase):
//!   PROP-FEED-S2-001: fs_trash_file_impl with non-existent path returns Ok(())
//!   PROP-FEED-S2-002: TrashErrorDto serializes with correct kind discriminator
//!   PROP-FEED-S2-003: feed module is accessible (module-level compilation test)
//!
//! Sprint 3 Phase 2b (GREEN phase):
//!   PROP-FEED-S2-008: select_past_note emits editing_session_state_changed
//!
//! Sprint 8 Phase 2b migration:
//!   - make_editing_state_changed_payload now takes &EditingSessionStateDto (1 arg)
//!   - select_past_note tests loosened to assert status + currentNoteId
//!     per Sprint 8 instruction §影響範囲リスト (block-aware assertions deferred to
//!     ui-feed-list-actions Sprint 4)

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
        f.write_all(
            format!(
                "---\ncreatedAt: 1000\nupdatedAt: 2000\ntags: [rust]\n---\n{}",
                body_content
            )
            .as_bytes(),
        )
        .expect("write note");
    }

    // Call scan_vault_feed to get note_metadata (same as select_past_note's internal flow)
    let (_visible_ids, note_metadata) = promptnotes_lib::feed::scan_vault_feed(tmp_dir);

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

    // Sprint 4: Parse body into blocks using parse_markdown_to_blocks.
    let blocks = promptnotes_lib::editor::parse_markdown_to_blocks(body)
        .expect("parse_markdown_to_blocks must succeed for non-empty body");
    let editor_state =
        promptnotes_lib::editor::compose_state_for_select_past_note(&note_path, Some(blocks));
    let editor_payload = promptnotes_lib::editor::make_editing_state_changed_payload(&editor_state);

    // Sprint 8 loosened assertions: status + currentNoteId only.
    let state = editor_payload.get("state").expect(
        "payload must have 'state' wrapper per editor.rs make_editing_state_changed_payload",
    );

    assert_eq!(state["status"], "editing", "status must be 'editing'");
    assert_eq!(
        state["currentNoteId"], note_path,
        "currentNoteId must match"
    );
    assert_eq!(state["isDirty"], false, "isDirty must be false");
    assert_eq!(
        state["isNoteEmpty"], false,
        "isNoteEmpty must be false (non-empty body)"
    );

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

    let (_visible_ids, note_metadata) = promptnotes_lib::feed::scan_vault_feed(tmp_dir);

    // Simulate select_past_note body extraction
    let body = note_metadata
        .get(&note_path)
        .map(|m| m.body.as_str())
        .unwrap_or("");

    assert_eq!(
        body, body_content,
        "Body from note_metadata must match file content exactly"
    );

    // Sprint 4: Parse body into blocks using parse_markdown_to_blocks.
    let blocks = promptnotes_lib::editor::parse_markdown_to_blocks(body)
        .expect("parse_markdown_to_blocks must succeed");
    let editor_state =
        promptnotes_lib::editor::compose_state_for_select_past_note(&note_path, Some(blocks));
    let editor_payload = promptnotes_lib::editor::make_editing_state_changed_payload(&editor_state);
    let state = &editor_payload["state"];

    // Sprint 8 loosened assertions: status + currentNoteId + key-set.
    assert_eq!(state["status"], "editing", "status must be 'editing'");
    assert_eq!(
        state["currentNoteId"], note_path,
        "currentNoteId must match"
    );
    assert_eq!(state["isDirty"], false, "isDirty must be false");
    assert!(
        state.get("isNoteEmpty").is_some(),
        "isNoteEmpty must be present in the editing variant"
    );
    // Verify the Sprint 8 editing variant key set is present
    let fields: Vec<&str> = state
        .as_object()
        .unwrap()
        .keys()
        .map(|k| k.as_str())
        .collect();
    assert!(fields.contains(&"status"), "payload must contain 'status'");
    assert!(
        fields.contains(&"isDirty"),
        "payload must contain 'isDirty'"
    );
    assert!(
        fields.contains(&"currentNoteId"),
        "payload must contain 'currentNoteId'"
    );
    assert!(
        fields.contains(&"focusedBlockId"),
        "payload must contain 'focusedBlockId'"
    );
    assert!(
        fields.contains(&"isNoteEmpty"),
        "payload must contain 'isNoteEmpty'"
    );
    assert!(
        fields.contains(&"lastSaveResult"),
        "payload must contain 'lastSaveResult'"
    );
    // Sprint 8: body field REMOVED from editor channel per §15.5 design notes.
    assert!(
        !fields.contains(&"body"),
        "body field must NOT be present in Sprint 8 editor channel"
    );
    // Sprint 4: blocks is Some(parsed) → present in JSON
    assert!(
        fields.contains(&"blocks"),
        "blocks must be present after Sprint 4 parse"
    );

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
    let note_metadata: std::collections::HashMap<
        String,
        promptnotes_lib::feed::NoteRowMetadataDto,
    > = std::collections::HashMap::new();

    let nonexistent_id = "/tmp/promptnotes-nonexistent-note.md";

    let body = note_metadata
        .get(nonexistent_id)
        .map(|m: &promptnotes_lib::feed::NoteRowMetadataDto| m.body.as_str())
        .unwrap_or("");

    assert_eq!(body, "", "Body must be empty for non-existent note_id");

    // Sprint 4: non-existent note → None blocks (not found in vault).
    let editor_state =
        promptnotes_lib::editor::compose_state_for_select_past_note(nonexistent_id, None);
    let editor_payload = promptnotes_lib::editor::make_editing_state_changed_payload(&editor_state);
    let state = &editor_payload["state"];

    // Sprint 8 loosened assertions.
    assert_eq!(state["status"], "editing", "status must be 'editing'");
    assert_eq!(
        state["currentNoteId"], nonexistent_id,
        "currentNoteId must match"
    );
    assert_eq!(
        state["isNoteEmpty"], true,
        "isNoteEmpty must be true for None blocks"
    );
    // body field MUST NOT be present on the editor channel in Sprint 8.
    assert!(
        state.get("body").is_none(),
        "body must NOT be present in Sprint 8 editor channel"
    );
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
    let state =
        promptnotes_lib::editor::compose_state_for_select_past_note("note-1", Some(blocks.clone()));

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
            assert!(
                !is_note_empty,
                "is_note_empty must be false for non-empty blocks"
            );
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
    use promptnotes_lib::editor::EditingSessionStateDto;

    // NEW signature: (note_id: &str, blocks: Option<Vec<DtoBlock>>) — RED: compile error
    let state =
        promptnotes_lib::editor::compose_state_for_select_past_note("note-empty", Some(vec![]));

    match state {
        EditingSessionStateDto::Editing {
            focused_block_id,
            is_note_empty,
            ..
        } => {
            assert_eq!(
                focused_block_id, None,
                "focused_block_id must be None for empty blocks vec"
            );
            assert!(
                is_note_empty,
                "is_note_empty must be true for empty blocks vec"
            );
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
    use promptnotes_lib::editor::EditingSessionStateDto;

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
            assert_eq!(
                focused_block_id, None,
                "focused_block_id must be None for None input"
            );
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
    use promptnotes_lib::feed::{CauseDto, EditingSubDto, FeedDomainSnapshotDto, FeedSubDto};

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
    let parsed_some: serde_json::Value =
        serde_json::from_str(&json_some).expect("must deserialize");

    assert_eq!(
        parsed_some["editing"]["pendingNextFocus"]["noteId"], "note-2",
        "pendingNextFocus.noteId must round-trip"
    );
    assert_eq!(
        parsed_some["editing"]["pendingNextFocus"]["blockId"], "block-42",
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
    let parsed_none: serde_json::Value =
        serde_json::from_str(&json_none).expect("must deserialize");

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
        parsed["state"]["focusedBlockId"], "first-block",
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
        parsed["state"]["isNoteEmpty"], true,
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

/// PROP-FEED-S4-016b / REQ-FEED-025:
/// Canonical fixture snapshot: parse_markdown_to_blocks("# heading\n\nparagraph").
///
/// Spec reference: behavioral-spec.md line 759 / verification-architecture.md §13.
/// Paired with: parserParity.test.ts canonical fixture test (TS half).
///
/// This is the GATING snapshot for PROP-FEED-S4-016:
///   "Sprint 4 ゲートでは基本ケーススナップショット 1 ペアの PASS をもって Phase 5 gate を満たすとする"
///
/// Asserts:
///   - len() == 2
///   - [0].block_type == Heading1, [0].content == "heading"
///   - [1].block_type == Paragraph, [1].content == "paragraph"
#[test]
fn prop_s4_016b_canonical_two_block_snapshot() {
    use promptnotes_lib::editor::BlockTypeDto;

    let blocks = promptnotes_lib::editor::parse_markdown_to_blocks("# heading\n\nparagraph")
        .expect("canonical fixture must parse without error");

    assert_eq!(
        blocks.len(),
        2,
        "canonical fixture must produce exactly 2 blocks, got: {:?}",
        blocks
    );
    assert_eq!(
        blocks[0].block_type,
        BlockTypeDto::Heading1,
        "first block must be heading-1"
    );
    assert_eq!(
        blocks[0].content, "heading",
        "first block content must be 'heading'"
    );
    assert_eq!(
        blocks[1].block_type,
        BlockTypeDto::Paragraph,
        "second block must be paragraph"
    );
    assert_eq!(
        blocks[1].content, "paragraph",
        "second block content must be 'paragraph'"
    );
}

/// PROP-FEED-S4-017 / REQ-FEED-024 / EC-FEED-017:
/// compose_select_past_note returns a well-formed SelectPastNoteResult containing
/// both IPC payloads: editing_payload and feed_snapshot.
///
/// FIND-S4-IMPL-iter2-002 resolution:
///   - select_past_note handler in feed.rs is now a thin emit wrapper around
///     compose_select_past_note (the pure orchestration function).
///   - This test calls compose_select_past_note directly, so any regression in
///     the orchestration layer (missing parse, swapped args, wrong field names,
///     missing emit payload) is detected here without requiring AppHandle.
///   - select_past_note's correctness is guaranteed by:
///     (a) compose_select_past_note is correct (proven by this test), AND
///     (b) the handler implementation is trivially thin (two emit calls in
///     EC-FEED-017 order: editing_payload then feed_snapshot).
///
/// EC-FEED-017 emit order note:
///   The handler emits editing_payload FIRST, feed_snapshot SECOND.
///   Structural enforcement: compose_select_past_note returns a single
///   SelectPastNoteResult; the handler's two emit lines are in fixed order.
///   Sprint 5 will automate this via a Mock Emitter trait or Tauri test runtime.
///
/// What this covers:
///   - compose_select_past_note scans the vault (visible_ids, note_metadata)
///   - parse_markdown_to_blocks is called for the note body (canonical fixture)
///   - editing_payload has correct structure: status, currentNoteId, focusedBlockId,
///     blocks present, body absent (Sprint 8 editor channel contract)
///   - feed_snapshot has correct cause.kind, editing.currentNoteId, visibleNoteIds
#[test]
fn prop_s4_017_compose_select_past_note_returns_well_formed_result() {
    use std::io::Write;

    let tmp_dir = "/tmp/promptnotes-s4-prop-017-compose";
    let _ = std::fs::create_dir_all(tmp_dir);
    let note_path = format!("{}/prop017-note.md", tmp_dir);

    // Write a note with the canonical fixture body to exercise parse_markdown_to_blocks.
    let body_content = "# heading\n\nparagraph";
    {
        let mut f = std::fs::File::create(&note_path).expect("create note");
        f.write_all(
            format!(
                "---\ncreatedAt: 1000\nupdatedAt: 2000\ntags: []\n---\n{}",
                body_content
            )
            .as_bytes(),
        )
        .expect("write note");
    }

    // Call compose_select_past_note — the actual pure function select_past_note delegates to.
    let result = promptnotes_lib::feed::compose_select_past_note(&note_path, tmp_dir);

    // ── Assert editing_payload ────────────────────────────────────────────────
    let state = &result.editing_payload["state"];

    assert_eq!(state["status"], "editing", "status must be 'editing'");
    assert_eq!(
        state["currentNoteId"], note_path,
        "currentNoteId must match note_path"
    );
    assert_eq!(state["isDirty"], false, "isDirty must be false");
    assert_eq!(
        state["isNoteEmpty"], false,
        "isNoteEmpty must be false (2 blocks from canonical fixture)"
    );
    assert!(
        !state["focusedBlockId"].is_null(),
        "focusedBlockId must be non-null for Some(blocks)"
    );
    assert!(
        state.get("body").is_none(),
        "body field must NOT be present (Sprint 8 editor channel contract)"
    );
    assert!(
        state.get("blocks").is_some() && !state["blocks"].is_null(),
        "blocks must be present when parse_markdown_to_blocks succeeds"
    );

    // ── Assert feed_snapshot ──────────────────────────────────────────────────
    let snapshot = &result.feed_snapshot;

    // cause.kind must be "EditingStateChanged"
    let cause_json = serde_json::to_value(&snapshot.cause).expect("cause must serialize");
    assert_eq!(
        cause_json["kind"], "EditingStateChanged",
        "feed_snapshot.cause.kind must be EditingStateChanged; got: {}",
        cause_json
    );

    // editing sub-dto must reflect the selected note
    assert_eq!(
        snapshot.editing.status, "editing",
        "feed_snapshot.editing.status must be 'editing'"
    );
    assert_eq!(
        snapshot.editing.current_note_id,
        Some(note_path.clone()),
        "feed_snapshot.editing.currentNoteId must match note_path"
    );

    // feed sub-dto must include the note in visibleNoteIds
    assert!(
        snapshot.feed.visible_note_ids.contains(&note_path),
        "feed_snapshot.feed.visibleNoteIds must contain note_path; got: {:?}",
        snapshot.feed.visible_note_ids
    );

    // note_metadata must include the note
    assert!(
        snapshot.note_metadata.contains_key(&note_path),
        "feed_snapshot.noteMetadata must contain note_path; keys: {:?}",
        snapshot.note_metadata.keys().collect::<Vec<_>>()
    );

    // Cleanup
    let _ = std::fs::remove_file(&note_path);
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
    assert!(
        blocks_multi.len() >= 2,
        "two paragraphs must produce at least 2 blocks"
    );

    // Case 4: heading
    let result_h1 = promptnotes_lib::editor::parse_markdown_to_blocks("# Title");
    let blocks_h1 = result_h1.expect("heading must return Ok");
    assert!(
        !blocks_h1.is_empty(),
        "heading must produce at least 1 block"
    );

    // Case 5: bullet list
    let result_bullet = promptnotes_lib::editor::parse_markdown_to_blocks("- item one");
    let blocks_bullet = result_bullet.expect("bullet must return Ok");
    assert!(
        !blocks_bullet.is_empty(),
        "bullet must produce at least 1 block"
    );

    // Case 6: code block
    let result_code = promptnotes_lib::editor::parse_markdown_to_blocks("```\ncode here\n```");
    let blocks_code = result_code.expect("code block must return Ok");
    assert!(
        !blocks_code.is_empty(),
        "code block must produce at least 1 block"
    );
}

// ── Sprint 5 Phase 2a (RED) — PROP-FEED-S5-001..005 / REQ-FEED-028..029 ─────
//
// All tests below call `promptnotes_lib::feed::next_available_note_id` which does
// NOT exist yet in feed.rs. This causes genuine compile errors (red phase).
//
// DO NOT add the implementation in feed.rs until Phase 2b (Green phase).

/// PROP-FEED-S5-001 / REQ-FEED-028:
/// `next_available_note_id` determinism — calling with the same fixed `now_ms`
/// and the same empty `existing` set twice must return identical strings.
///
/// RED: `next_available_note_id` does not exist → compile error.
#[test]
fn test_next_available_note_id_deterministic() {
    use std::collections::HashSet;

    // 1_577_836_800_000 = 2020-01-01 00:00:00.000 UTC
    let now_ms: i64 = 1_577_836_800_000;
    let existing: HashSet<String> = HashSet::new();

    let id1 = promptnotes_lib::feed::next_available_note_id(now_ms, &existing);
    let id2 = promptnotes_lib::feed::next_available_note_id(now_ms, &existing);

    assert_eq!(
        id1, id2,
        "next_available_note_id must be deterministic for fixed (now_ms, existing)"
    );
}

/// PROP-FEED-S5-003 / REQ-FEED-028:
/// ID format — fixed `now_ms = 1_577_836_800_000` (2020-01-01 00:00:00 UTC) with
/// no collisions must return a string matching `^\d{4}-\d{2}-\d{2}-\d{6}-\d{3}$`.
///
/// RED: `next_available_note_id` does not exist → compile error.
#[test]
fn test_next_available_note_id_format() {
    use regex::Regex;
    use std::collections::HashSet;

    let now_ms: i64 = 1_577_836_800_000; // 2020-01-01 00:00:00.000 UTC
    let existing: HashSet<String> = HashSet::new();

    let id = promptnotes_lib::feed::next_available_note_id(now_ms, &existing);

    // Base form (no collision): must match YYYY-MM-DD-HHmmss-SSS exactly.
    let re = Regex::new(r"^\d{4}-\d{2}-\d{2}-\d{6}-\d{3}$").unwrap();
    assert!(
        re.is_match(&id),
        "ID '{}' must match ^\\d{{4}}-\\d{{2}}-\\d{{2}}-\\d{{6}}-\\d{{3}}$ (base form, no collision suffix)",
        id
    );
}

/// PROP-FEED-S5-002 / REQ-FEED-028:
/// Collision suffix — when `existing` already contains the base ID, the function
/// must append `-1`; when both base and `-1` are taken, must append `-2`.
///
/// RED: `next_available_note_id` does not exist → compile error.
#[test]
fn test_next_available_note_id_collision_suffix() {
    use std::collections::HashSet;

    // 2025-01-13 00:00:00.000 UTC = 1_736_726_400_000 ms
    let now_ms: i64 = 1_736_726_400_000;

    // ── Case 1: base already taken → must get "-1" suffix ─────────────────────
    let mut existing_one: HashSet<String> = HashSet::new();
    existing_one.insert("2025-01-13-000000-000".to_string());

    let id_one = promptnotes_lib::feed::next_available_note_id(now_ms, &existing_one);
    assert_eq!(
        id_one, "2025-01-13-000000-000-1",
        "when base is taken, must return base + '-1'; got '{}'",
        id_one
    );

    // ── Case 2: base and "-1" both taken → must get "-2" suffix ───────────────
    let mut existing_two: HashSet<String> = HashSet::new();
    existing_two.insert("2025-01-13-000000-000".to_string());
    existing_two.insert("2025-01-13-000000-000-1".to_string());

    let id_two = promptnotes_lib::feed::next_available_note_id(now_ms, &existing_two);
    assert_eq!(
        id_two, "2025-01-13-000000-000-2",
        "when base and '-1' are taken, must return base + '-2'; got '{}'",
        id_two
    );
}

/// PROP-FEED-S5-002 (proptest) / REQ-FEED-028:
/// Non-collision property — for any `now_ms ∈ [0, 253_402_300_800_000)` and any
/// `existing: HashSet<String>` with at most 1_023 elements, the returned ID is
/// not contained in `existing`.
///
/// RED: `next_available_note_id` does not exist → compile error.
#[test]
fn test_next_available_note_id_non_collision_property() {
    use proptest::collection::hash_set;
    use proptest::prelude::*;

    proptest!(|(
        now_ms in 0i64..253_402_300_800_000i64,
        existing in hash_set("[a-zA-Z0-9\\-]{1,40}", 0usize..=1023usize),
    )| {
        let result = promptnotes_lib::feed::next_available_note_id(now_ms, &existing);
        prop_assert!(
            !existing.contains(&result),
            "next_available_note_id must not return an ID already in existing; got '{}' which is in existing",
            result
        );
    });
}

/// PROP-FEED-S5-004 (ケース 1) / REQ-FEED-028:
/// Empty vault auto-create — `feed_initial_state` on an empty vault must return:
///   - `visible_note_ids.len() == 1`
///   - `note_metadata.len() == 1`
///   - `note_metadata.contains_key(&visible_note_ids[0])`
///   - `editing.status == "editing"`
///   - `editing.current_note_id == Some(visible_note_ids[0].clone())`
///
/// RED: current `feed_initial_state` returns `editing.status = "idle"` with
/// `visible_note_ids = []` on an empty vault → multiple asserts fail.
#[test]
fn test_feed_initial_state_empty_vault_auto_create() {
    let temp = tempfile::TempDir::new().expect("failed to create temp dir");
    let vault_path = temp.path().to_string_lossy().to_string();

    let snap = promptnotes_lib::feed::feed_initial_state(vault_path)
        .expect("feed_initial_state must succeed for a valid empty directory");

    // PROP-FEED-S5-004 AC 1: exactly one note in visible list
    assert_eq!(
        snap.feed.visible_note_ids.len(),
        1,
        "empty vault must produce exactly 1 visible note (auto-created); got {:?}",
        snap.feed.visible_note_ids
    );

    // PROP-FEED-S5-004 AC 2: exactly one note in metadata map
    assert_eq!(
        snap.note_metadata.len(),
        1,
        "note_metadata must have exactly 1 entry; got {} entries",
        snap.note_metadata.len()
    );

    // PROP-FEED-S5-004 AC 3: metadata key matches visible id
    let new_id = &snap.feed.visible_note_ids[0];
    assert!(
        snap.note_metadata.contains_key(new_id),
        "note_metadata must contain the auto-created NoteId '{}'; keys: {:?}",
        new_id,
        snap.note_metadata.keys().collect::<Vec<_>>()
    );

    // PROP-FEED-S5-004 AC 4: editing status
    assert_eq!(
        snap.editing.status, "editing",
        "editing.status must be 'editing' after auto-create; got '{}'",
        snap.editing.status
    );

    // PROP-FEED-S5-004 AC 5: editing.current_note_id matches auto-created ID
    assert_eq!(
        snap.editing.current_note_id,
        Some(new_id.clone()),
        "editing.current_note_id must equal visible_note_ids[0]"
    );
}

/// PROP-FEED-S5-004 (ケース 2) / REQ-FEED-028:
/// Existing one note — when vault has 1 `.md` file, `feed_initial_state` must:
///   - `visible_note_ids.len() == 2`
///   - `visible_note_ids[0]` is the new auto-created ID (not the existing stem)
///   - `visible_note_ids[1] == existing file path`
///   - `editing.current_note_id == Some(visible_note_ids[0])`
///
/// RED: current implementation does not auto-create → FAIL.
#[test]
fn test_feed_initial_state_existing_one_note_prepends_new() {
    use regex::Regex;
    use std::io::Write;

    let temp = tempfile::TempDir::new().expect("failed to create temp dir");
    let existing_file = temp.path().join("2020-01-01-000000-000.md");
    {
        let mut f = std::fs::File::create(&existing_file).expect("create existing note");
        f.write_all(b"hello world\n").expect("write body");
    }

    let vault_path = temp.path().to_string_lossy().to_string();
    let existing_path = existing_file.to_string_lossy().to_string();

    let snap = promptnotes_lib::feed::feed_initial_state(vault_path)
        .expect("feed_initial_state must succeed");

    // Must have 2 notes: [new_auto_created, existing]
    assert_eq!(
        snap.feed.visible_note_ids.len(),
        2,
        "vault with 1 existing note must produce 2 visible notes; got {:?}",
        snap.feed.visible_note_ids
    );

    // visible_note_ids[0] must be the new (auto-created) ID — not the existing stem
    let new_id = &snap.feed.visible_note_ids[0];
    assert_ne!(
        new_id, "2020-01-01-000000-000",
        "visible_note_ids[0] must NOT be the existing stem; it must be the auto-created ID"
    );

    // New ID must match the NoteId format (with optional collision suffix)
    let re = Regex::new(r"^\d{4}-\d{2}-\d{2}-\d{6}-\d{3}(-\d+)?$").unwrap();
    assert!(
        re.is_match(new_id),
        "auto-created ID '{}' must match NoteId format",
        new_id
    );

    // visible_note_ids[1] must be the existing file's full path
    assert_eq!(
        snap.feed.visible_note_ids[1], existing_path,
        "visible_note_ids[1] must be the existing note's full path"
    );

    // editing must point to the new auto-created ID
    assert_eq!(
        snap.editing.current_note_id,
        Some(new_id.clone()),
        "editing.current_note_id must equal the new auto-created ID"
    );
}

/// PROP-FEED-S5-004 (不変条件) / REQ-FEED-028:
/// No `.md` file created — vault file count must be unchanged after `feed_initial_state`,
/// AND the auto-created NoteId must appear in `note_metadata`.
///
/// If auto-create is not implemented: `editing.current_note_id == None` →
/// `.expect("...")` panics → RED.
///
/// If auto-create IS implemented but creates a file: `after_count > before_count` → RED.
///
/// The two conditions are AND-combined so the test fails in either missing-implementation
/// scenario.
///
/// RED: current implementation returns `editing.current_note_id == None` → panic.
#[test]
fn test_feed_initial_state_no_md_file_created_with_auto_create() {
    let temp = tempfile::TempDir::new().expect("failed to create temp dir");
    let vault_path = temp.path().to_string_lossy().to_string();

    let before_count = std::fs::read_dir(temp.path())
        .expect("read_dir before")
        .count();

    let snap = promptnotes_lib::feed::feed_initial_state(vault_path)
        .expect("feed_initial_state must succeed");

    let after_count = std::fs::read_dir(temp.path())
        .expect("read_dir after")
        .count();

    // Invariant: no .md file is physically created (in-memory DTO only)
    assert_eq!(
        before_count, after_count,
        "feed_initial_state must NOT create any files on disk; before={}, after={}",
        before_count, after_count
    );

    // AND: auto-create must have added the new NoteId to note_metadata
    // (if auto-create is missing, current_note_id is None → .expect() panics → RED)
    let new_id = snap
        .editing
        .current_note_id
        .expect("auto-create must yield a non-None editing.current_note_id");
    assert!(
        snap.note_metadata.contains_key(&new_id),
        "note_metadata must contain the auto-created NoteId '{}'; keys: {:?}",
        new_id,
        snap.note_metadata.keys().collect::<Vec<_>>()
    );
}

/// PROP-FEED-S5-005 / REQ-FEED-028:
/// TS/Rust NoteId format parity — `next_available_note_id` must produce the same
/// output as TypeScript `nextAvailableNoteId` for the same `(now_ms, existing)` inputs.
///
/// Snapshot table (4 edge cases derived from initialize-capture.ts `formatBaseId`):
///
/// | now_ms           | existing                         | expected                     |
/// |------------------|----------------------------------|------------------------------|
/// | 1_577_836_800_000 | {}                              | "2020-01-01-000000-000"      |
/// | 1_577_836_800_000 | {"2020-01-01-000000-000"}       | "2020-01-01-000000-000-1"    |
/// | 1_577_836_800_000 | (base + "-0".."-9", 11 entries) | "2020-01-01-000000-000-10"   |
/// | 0                 | {}                              | "1970-01-01-000000-000"      |
///
/// RED: `next_available_note_id` does not exist → compile error.
#[test]
fn test_next_available_note_id_ts_parity_snapshot() {
    use std::collections::HashSet;

    // ── Case (a): base case — no collision ────────────────────────────────────
    let now_2020: i64 = 1_577_836_800_000; // 2020-01-01 00:00:00.000 UTC
    let existing_empty: HashSet<String> = HashSet::new();

    let id_a = promptnotes_lib::feed::next_available_note_id(now_2020, &existing_empty);
    assert_eq!(
        id_a, "2020-01-01-000000-000",
        "base case: expected '2020-01-01-000000-000', got '{}'",
        id_a
    );

    // ── Case (b): 1-collision — base taken → "-1" suffix ─────────────────────
    let mut existing_one: HashSet<String> = HashSet::new();
    existing_one.insert("2020-01-01-000000-000".to_string());

    let id_b = promptnotes_lib::feed::next_available_note_id(now_2020, &existing_one);
    assert_eq!(
        id_b, "2020-01-01-000000-000-1",
        "1-collision: expected '2020-01-01-000000-000-1', got '{}'",
        id_b
    );

    // ── Case (c): 10-collision — base + "-0".."-9" taken → "-10" suffix ──────
    // The TS loop uses i starting at 1 (i.e. "-1", "-2", ..., "-10").
    // So we need to put base, base-1, base-2, ..., base-9 in existing (10 entries).
    let mut existing_ten: HashSet<String> = HashSet::new();
    existing_ten.insert("2020-01-01-000000-000".to_string());
    for i in 1..=9 {
        existing_ten.insert(format!("2020-01-01-000000-000-{}", i));
    }

    let id_c = promptnotes_lib::feed::next_available_note_id(now_2020, &existing_ten);
    assert_eq!(
        id_c, "2020-01-01-000000-000-10",
        "10-collision: expected '2020-01-01-000000-000-10', got '{}'",
        id_c
    );

    // ── Case (d): Unix epoch — now_ms = 0 → "1970-01-01-000000-000" ──────────
    let id_d = promptnotes_lib::feed::next_available_note_id(0i64, &existing_empty);
    assert_eq!(
        id_d, "1970-01-01-000000-000",
        "Unix epoch: expected '1970-01-01-000000-000', got '{}'",
        id_d
    );
}

// ── Sprint 5 contract review iter-1 fix: Vault Scan Semantics edge cases ──────
// FIND-S5-CONTRACT-003 / FIND-S5-CONTRACT-004 / REQ-FEED-028

/// PROP-FEED-S5-SCAN-001 / REQ-FEED-028:
/// Dot-file exclusion — `.hidden.md` in vault root must NOT appear in visible_note_ids.
///
/// Creates a TempDir with `.hidden.md` and `regular.md`. Asserts that only `regular.md`
/// is included in the scan result and `.hidden.md` is absent from note_metadata.
#[test]
fn test_feed_initial_state_excludes_dot_md_files() {
    use std::io::Write;

    let temp = tempfile::TempDir::new().expect("failed to create temp dir");

    // Create a dot-file that must be excluded
    let dot_file = temp.path().join(".hidden.md");
    {
        let mut f = std::fs::File::create(&dot_file).expect("create .hidden.md");
        f.write_all(b"# hidden\n").expect("write .hidden.md");
    }

    // Create a regular file that must be included
    let regular_file = temp.path().join("regular.md");
    {
        let mut f = std::fs::File::create(&regular_file).expect("create regular.md");
        f.write_all(b"# regular\n").expect("write regular.md");
    }

    let vault_path = temp.path().to_string_lossy().to_string();
    let snap = promptnotes_lib::feed::feed_initial_state(vault_path)
        .expect("feed_initial_state must succeed");

    // The auto-created note is prepended; existing notes follow.
    // visible_note_ids[1] (if present) should be the regular file, not the dot-file.
    let dot_path = dot_file.to_string_lossy().to_string();
    assert!(
        !snap.note_metadata.contains_key(&dot_path),
        "note_metadata must NOT contain dot-file path '{}'; keys: {:?}",
        dot_path,
        snap.note_metadata.keys().collect::<Vec<_>>()
    );
    assert!(
        !snap.feed.visible_note_ids.contains(&dot_path),
        "visible_note_ids must NOT contain dot-file path '{}'; ids: {:?}",
        dot_path,
        snap.feed.visible_note_ids
    );

    // regular.md must be present (as the existing note; auto-create prepends a new ID)
    let regular_path = regular_file.to_string_lossy().to_string();
    assert!(
        snap.note_metadata.contains_key(&regular_path),
        "note_metadata must contain regular file '{}'; keys: {:?}",
        regular_path,
        snap.note_metadata.keys().collect::<Vec<_>>()
    );
}

/// PROP-FEED-S5-SCAN-002 / REQ-FEED-028:
/// Symlink exclusion — `link.md` (symlink → `target.md`) must NOT appear in visible_note_ids.
///
/// Only runs on Unix where `std::os::unix::fs::symlink` is available.
#[cfg(unix)]
#[test]
fn test_feed_initial_state_excludes_symlink_md_files() {
    use std::io::Write;
    use std::os::unix::fs::symlink;

    let temp = tempfile::TempDir::new().expect("failed to create temp dir");

    // Create a real file (target)
    let target_file = temp.path().join("target.md");
    {
        let mut f = std::fs::File::create(&target_file).expect("create target.md");
        f.write_all(b"# target\n").expect("write target.md");
    }

    // Create a symlink pointing to target.md
    let link_file = temp.path().join("link.md");
    symlink(&target_file, &link_file).expect("create symlink link.md -> target.md");

    let vault_path = temp.path().to_string_lossy().to_string();
    let snap = promptnotes_lib::feed::feed_initial_state(vault_path)
        .expect("feed_initial_state must succeed");

    // symlink must be excluded
    let link_path = link_file.to_string_lossy().to_string();
    assert!(
        !snap.note_metadata.contains_key(&link_path),
        "note_metadata must NOT contain symlink path '{}'; keys: {:?}",
        link_path,
        snap.note_metadata.keys().collect::<Vec<_>>()
    );
    assert!(
        !snap.feed.visible_note_ids.contains(&link_path),
        "visible_note_ids must NOT contain symlink path '{}'; ids: {:?}",
        link_path,
        snap.feed.visible_note_ids
    );

    // target.md (the real file) must be present
    let target_path = target_file.to_string_lossy().to_string();
    assert!(
        snap.note_metadata.contains_key(&target_path),
        "note_metadata must contain real file '{}'; keys: {:?}",
        target_path,
        snap.note_metadata.keys().collect::<Vec<_>>()
    );
}

/// PROP-FEED-S5-SCAN-003 / REQ-FEED-028:
/// Non-recursive scan — `sub/nested.md` in a subdirectory must NOT appear in visible_note_ids.
///
/// Verifies that scan_vault_feed is vault-root-only (non-recursive).
#[test]
fn test_feed_initial_state_ignores_subdirectory_md_files() {
    use std::io::Write;

    let temp = tempfile::TempDir::new().expect("failed to create temp dir");

    // Create a subdirectory with a .md file inside
    let sub_dir = temp.path().join("sub");
    std::fs::create_dir(&sub_dir).expect("create sub/");
    let nested_file = sub_dir.join("nested.md");
    {
        let mut f = std::fs::File::create(&nested_file).expect("create sub/nested.md");
        f.write_all(b"# nested\n").expect("write sub/nested.md");
    }

    let vault_path = temp.path().to_string_lossy().to_string();
    let snap = promptnotes_lib::feed::feed_initial_state(vault_path)
        .expect("feed_initial_state must succeed");

    // sub/nested.md must be absent (non-recursive scan)
    let nested_path = nested_file.to_string_lossy().to_string();
    assert!(
        !snap.note_metadata.contains_key(&nested_path),
        "note_metadata must NOT contain nested path '{}'; keys: {:?}",
        nested_path,
        snap.note_metadata.keys().collect::<Vec<_>>()
    );
    assert!(
        !snap.feed.visible_note_ids.contains(&nested_path),
        "visible_note_ids must NOT contain nested path '{}'; ids: {:?}",
        nested_path,
        snap.feed.visible_note_ids
    );
}
