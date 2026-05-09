/// editor_wire_sprint8.rs — Sprint 8 Red-phase tests for the Rust IPC wire contract.
///
/// VCSDD Phase 2a (Red): These tests MUST FAIL to compile because the new
/// `EditingSessionStateDto` enum, `BlockTypeDto`, `DtoBlock`, `PendingNextFocusDto`,
/// `compose_state_*` helpers, and `make_editing_state_changed_payload` (new
/// single-argument form) do NOT exist in `src/editor.rs` yet.
///
/// Phase 2b (Green) will introduce them and all tests here must then pass.
///
/// Proof obligations verified here:
///   PROP-IPC-001 — 5-variant exhaustive match (Tier 0 compile-time)
///   PROP-IPC-002 — Idle serializes to exactly {"status":"idle"}
///   PROP-IPC-003 — kebab-case discriminant in each variant
///   PROP-IPC-004 — Editing key-set equality (with/without blocks)
///   PROP-IPC-005 — SaveFailed key-set equality (with/without blocks)
///   PROP-IPC-005 (null literals) — priorFocusedBlockId/pendingNextFocus always serialized null
///   PROP-IPC-006 — Switching key-set equality
///   PROP-IPC-007 — SaveErrorDto.reason skip_serializing_if None / present when Some
///   PROP-IPC-008 — blocks optionality (None=absent, Some([])="blocks":[], Some([...])=array)
///   PROP-IPC-009 — make_editing_state_changed_payload wraps in {"state": ...}
///   PROP-IPC-010 — round-trip over 14-fixture cover set
///   PROP-IPC-013 — compose_state_idle → Idle
///   PROP-IPC-014 — compose_state_for_cancel_switch → Editing fields
///   PROP-IPC-015 — compose_state_for_request_new_note → Editing is_note_empty:true
///   PROP-IPC-016 — compose_state_for_save_ok / compose_state_for_save_err
///   PROP-IPC-017 — compose_state_for_select_past_note
///   PROP-IPC-018 — BlockTypeDto 9-variant exhaustive match (Tier 0 compile-time)
///   PROP-IPC-019 — BlockTypeDto round-trip (valid and invalid)

// Phase 2a: import NEW Sprint-8 symbols that do NOT exist yet.
// This import triggers a compile error ("cannot find type `EditingSessionStateDto`
// in module `promptnotes_lib::editor`") until Phase 2b adds them.
use promptnotes_lib::editor::{
    BlockTypeDto,
    DtoBlock,
    EditingSessionStateDto,
    FsErrorDto,
    PendingNextFocusDto,
    SaveErrorDto,
    compose_state_for_cancel_switch,
    compose_state_for_request_new_note,
    compose_state_for_save_err,
    compose_state_for_save_ok,
    compose_state_for_select_past_note,
    compose_state_idle,
    make_editing_state_changed_payload,
};

use std::collections::BTreeSet;

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-001: Exhaustive 5-variant match — compile error if a variant is added
// without updating this match.
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-001 — The enum has exactly 5 variants. An exhaustive match is the
/// compile-time proof; any 6th variant breaks this test.
#[test]
fn prop_ipc_001_enum_has_five_variants() {
    // Construct one representative of each variant.
    let idle = EditingSessionStateDto::Idle;
    let editing = EditingSessionStateDto::Editing {
        current_note_id: "n1".to_string(),
        focused_block_id: None,
        is_dirty: false,
        is_note_empty: true,
        last_save_result: None,
        blocks: None,
    };
    let saving = EditingSessionStateDto::Saving {
        current_note_id: "n1".to_string(),
        is_note_empty: false,
        blocks: None,
    };
    let switching = EditingSessionStateDto::Switching {
        current_note_id: "n1".to_string(),
        pending_next_focus: PendingNextFocusDto {
            note_id: "n2".to_string(),
            block_id: "blk-1".to_string(),
        },
        is_note_empty: false,
        blocks: None,
    };
    let save_failed = EditingSessionStateDto::SaveFailed {
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

    // Exhaustive match — compile error if variant is added.
    let discriminant = |v: &EditingSessionStateDto| -> &'static str {
        match v {
            EditingSessionStateDto::Idle => "idle",
            EditingSessionStateDto::Editing { .. } => "editing",
            EditingSessionStateDto::Saving { .. } => "saving",
            EditingSessionStateDto::Switching { .. } => "switching",
            EditingSessionStateDto::SaveFailed { .. } => "save-failed",
        }
    };

    assert_eq!(discriminant(&idle), "idle");
    assert_eq!(discriminant(&editing), "editing");
    assert_eq!(discriminant(&saving), "saving");
    assert_eq!(discriminant(&switching), "switching");
    assert_eq!(discriminant(&save_failed), "save-failed");
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-002: Idle serializes to exactly {"status":"idle"}
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-002 — compose_state_idle() serializes to a JSON object with exactly
/// one key `status` and value `"idle"`.
#[test]
fn prop_ipc_002_idle_serializes_status_only() {
    let state = compose_state_idle();
    let value = serde_json::to_value(&state).expect("serialize Idle");
    let obj = value.as_object().expect("must be object");
    assert_eq!(obj.len(), 1, "Idle must have exactly one key, got: {:?}", obj.keys().collect::<Vec<_>>());
    assert_eq!(
        obj.get("status").and_then(|v| v.as_str()),
        Some("idle"),
        "status must be 'idle'"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-003: kebab-case discriminant in each variant
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-003 — Each variant carries the correct kebab-case discriminant string.
#[test]
fn prop_ipc_003_status_kebab_case() {
    let cases: Vec<(EditingSessionStateDto, &str)> = vec![
        (EditingSessionStateDto::Idle, "idle"),
        (
            EditingSessionStateDto::Editing {
                current_note_id: "n1".to_string(),
                focused_block_id: None,
                is_dirty: false,
                is_note_empty: true,
                last_save_result: None,
                blocks: None,
            },
            "editing",
        ),
        (
            EditingSessionStateDto::Saving {
                current_note_id: "n1".to_string(),
                is_note_empty: false,
                blocks: None,
            },
            "saving",
        ),
        (
            EditingSessionStateDto::Switching {
                current_note_id: "n1".to_string(),
                pending_next_focus: PendingNextFocusDto {
                    note_id: "n2".to_string(),
                    block_id: "blk-1".to_string(),
                },
                is_note_empty: false,
                blocks: None,
            },
            "switching",
        ),
        (
            EditingSessionStateDto::SaveFailed {
                current_note_id: "n1".to_string(),
                prior_focused_block_id: None,
                pending_next_focus: None,
                last_save_error: SaveErrorDto {
                    kind: "fs".to_string(),
                    reason: None,
                },
                is_note_empty: false,
                blocks: None,
            },
            "save-failed",
        ),
    ];

    for (variant, expected_status) in &cases {
        let value = serde_json::to_value(variant).expect("serialize");
        let status = value
            .as_object()
            .and_then(|o| o.get("status"))
            .and_then(|v| v.as_str())
            .expect("status field must be present");
        assert_eq!(
            status, *expected_status,
            "variant discriminant must be '{}'",
            expected_status
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-004: Editing key-set equality
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-004 — Editing variant has exactly the right key set (with and without blocks).
#[test]
fn prop_ipc_004_editing_key_set_equality() {
    // Without blocks
    let editing_no_blocks = EditingSessionStateDto::Editing {
        current_note_id: "n1".to_string(),
        focused_block_id: None,
        is_dirty: false,
        is_note_empty: true,
        last_save_result: None,
        blocks: None,
    };
    let value = serde_json::to_value(&editing_no_blocks).expect("serialize");
    let actual_keys: BTreeSet<String> = value
        .as_object()
        .expect("must be object")
        .keys()
        .cloned()
        .collect();
    let expected_keys: BTreeSet<String> = [
        "status",
        "currentNoteId",
        "focusedBlockId",
        "isDirty",
        "isNoteEmpty",
        "lastSaveResult",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    assert_eq!(
        actual_keys, expected_keys,
        "Editing (blocks:None) key set mismatch.\nGot: {:?}\nExpected: {:?}",
        actual_keys, expected_keys
    );

    // With blocks: Some([])
    let editing_with_blocks = EditingSessionStateDto::Editing {
        current_note_id: "n1".to_string(),
        focused_block_id: Some("blk-1".to_string()),
        is_dirty: true,
        is_note_empty: false,
        last_save_result: Some("success".to_string()),
        blocks: Some(vec![]),
    };
    let value = serde_json::to_value(&editing_with_blocks).expect("serialize");
    let actual_keys_with_blocks: BTreeSet<String> = value
        .as_object()
        .expect("must be object")
        .keys()
        .cloned()
        .collect();
    let mut expected_with_blocks = expected_keys.clone();
    expected_with_blocks.insert("blocks".to_string());
    assert_eq!(
        actual_keys_with_blocks, expected_with_blocks,
        "Editing (blocks:Some([])) key set mismatch.\nGot: {:?}\nExpected: {:?}",
        actual_keys_with_blocks, expected_with_blocks
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-005: SaveFailed key-set equality
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-005 — SaveFailed variant has exactly the right key set.
#[test]
fn prop_ipc_005_save_failed_key_set_equality() {
    let save_failed_no_blocks = EditingSessionStateDto::SaveFailed {
        current_note_id: "n1".to_string(),
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
    let value = serde_json::to_value(&save_failed_no_blocks).expect("serialize");
    let actual_keys: BTreeSet<String> = value
        .as_object()
        .expect("must be object")
        .keys()
        .cloned()
        .collect();
    let expected_keys: BTreeSet<String> = [
        "status",
        "currentNoteId",
        "priorFocusedBlockId",
        "pendingNextFocus",
        "lastSaveError",
        "isNoteEmpty",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    assert_eq!(
        actual_keys, expected_keys,
        "SaveFailed (blocks:None) key set mismatch.\nGot: {:?}\nExpected: {:?}",
        actual_keys, expected_keys
    );

    // With blocks: Some([])
    let save_failed_with_blocks = EditingSessionStateDto::SaveFailed {
        current_note_id: "n1".to_string(),
        prior_focused_block_id: None,
        pending_next_focus: None,
        last_save_error: SaveErrorDto {
            kind: "fs".to_string(),
            reason: None,
        },
        is_note_empty: false,
        blocks: Some(vec![]),
    };
    let value = serde_json::to_value(&save_failed_with_blocks).expect("serialize");
    let actual_keys_with_blocks: BTreeSet<String> = value
        .as_object()
        .expect("must be object")
        .keys()
        .cloned()
        .collect();
    let mut expected_with_blocks = expected_keys.clone();
    expected_with_blocks.insert("blocks".to_string());
    assert_eq!(
        actual_keys_with_blocks, expected_with_blocks,
        "SaveFailed (blocks:Some([])) key set mismatch.\nGot: {:?}\nExpected: {:?}",
        actual_keys_with_blocks, expected_with_blocks
    );
}

/// PROP-IPC-005 (null literals) — priorFocusedBlockId and pendingNextFocus in
/// SaveFailed must serialize as literal null (NOT be absent) when None.
/// This matches the TS narrowing of `string | null` / `PendingNextFocus | null`.
#[test]
fn prop_ipc_005_save_failed_null_literals_present() {
    let save_failed = EditingSessionStateDto::SaveFailed {
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
    let json = serde_json::to_string(&save_failed).expect("serialize");
    assert!(
        json.contains("\"priorFocusedBlockId\":null"),
        "priorFocusedBlockId must serialize as null literal, not be absent. JSON: {}",
        json
    );
    assert!(
        json.contains("\"pendingNextFocus\":null"),
        "pendingNextFocus must serialize as null literal, not be absent. JSON: {}",
        json
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-006: Switching key-set equality
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-006 — Switching variant has exactly the right key set.
/// pendingNextFocus is always an object {noteId, blockId}, never null.
#[test]
fn prop_ipc_006_switching_key_set_equality() {
    let switching_no_blocks = EditingSessionStateDto::Switching {
        current_note_id: "n1".to_string(),
        pending_next_focus: PendingNextFocusDto {
            note_id: "n2".to_string(),
            block_id: "blk-1".to_string(),
        },
        is_note_empty: false,
        blocks: None,
    };
    let value = serde_json::to_value(&switching_no_blocks).expect("serialize");
    let actual_keys: BTreeSet<String> = value
        .as_object()
        .expect("must be object")
        .keys()
        .cloned()
        .collect();
    let expected_keys: BTreeSet<String> = [
        "status",
        "currentNoteId",
        "pendingNextFocus",
        "isNoteEmpty",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();
    assert_eq!(
        actual_keys, expected_keys,
        "Switching (blocks:None) key set mismatch.\nGot: {:?}\nExpected: {:?}",
        actual_keys, expected_keys
    );

    // Verify pendingNextFocus is an object with noteId and blockId
    let pending = value
        .as_object()
        .and_then(|o| o.get("pendingNextFocus"))
        .expect("pendingNextFocus must be present");
    assert!(pending.is_object(), "pendingNextFocus must be an object, not null");
    let pending_obj = pending.as_object().unwrap();
    assert!(pending_obj.contains_key("noteId"), "pendingNextFocus must have noteId");
    assert!(pending_obj.contains_key("blockId"), "pendingNextFocus must have blockId");

    // With blocks
    let switching_with_blocks = EditingSessionStateDto::Switching {
        current_note_id: "n1".to_string(),
        pending_next_focus: PendingNextFocusDto {
            note_id: "n2".to_string(),
            block_id: "blk-1".to_string(),
        },
        is_note_empty: false,
        blocks: Some(vec![]),
    };
    let value = serde_json::to_value(&switching_with_blocks).expect("serialize");
    let actual_keys_with_blocks: BTreeSet<String> = value
        .as_object()
        .expect("must be object")
        .keys()
        .cloned()
        .collect();
    let mut expected_with_blocks = expected_keys.clone();
    expected_with_blocks.insert("blocks".to_string());
    assert_eq!(
        actual_keys_with_blocks, expected_with_blocks,
        "Switching (blocks:Some([])) key set mismatch"
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-007: SaveErrorDto.reason skip_serializing_if
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-007 — SaveErrorDto with reason:None serializes WITHOUT the `reason` key.
/// With reason:Some(...) the key is present.
#[test]
fn prop_ipc_007_save_error_skip_reason_when_none() {
    let err_none = SaveErrorDto {
        kind: "validation".to_string(),
        reason: None,
    };
    let json_none = serde_json::to_string(&err_none).expect("serialize");
    assert!(
        !json_none.contains("\"reason\""),
        "reason must be absent when None. JSON: {}",
        json_none
    );

    let err_some = SaveErrorDto {
        kind: "fs".to_string(),
        reason: Some(FsErrorDto {
            kind: "permission".to_string(),
        }),
    };
    let json_some = serde_json::to_string(&err_some).expect("serialize");
    assert!(
        json_some.contains("\"reason\""),
        "reason must be present when Some. JSON: {}",
        json_some
    );
    assert!(
        json_some.contains("\"permission\""),
        "FsErrorDto.kind must be serialized. JSON: {}",
        json_some
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-008: blocks optionality
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-008 — blocks field behaviour:
/// None → key absent; Some([]) → "blocks":[] ; Some([...]) → array with elements.
#[test]
fn prop_ipc_008_blocks_optionality() {
    // None → key absent
    let editing_none = EditingSessionStateDto::Editing {
        current_note_id: "n1".to_string(),
        focused_block_id: None,
        is_dirty: false,
        is_note_empty: true,
        last_save_result: None,
        blocks: None,
    };
    let json_none = serde_json::to_string(&editing_none).expect("serialize");
    assert!(
        !json_none.contains("\"blocks\""),
        "blocks must be absent when None. JSON: {}",
        json_none
    );

    // Some([]) → "blocks":[]
    let editing_empty = EditingSessionStateDto::Editing {
        current_note_id: "n1".to_string(),
        focused_block_id: None,
        is_dirty: false,
        is_note_empty: true,
        last_save_result: None,
        blocks: Some(vec![]),
    };
    let json_empty = serde_json::to_string(&editing_empty).expect("serialize");
    assert!(
        json_empty.contains("\"blocks\":[]"),
        "blocks must be present and empty array. JSON: {}",
        json_empty
    );

    // Some([...]) → array with 3 elements
    let blocks_3 = vec![
        DtoBlock {
            id: "blk-1".to_string(),
            block_type: BlockTypeDto::Paragraph,
            content: "Hello".to_string(),
        },
        DtoBlock {
            id: "blk-2".to_string(),
            block_type: BlockTypeDto::Heading1,
            content: "Title".to_string(),
        },
        DtoBlock {
            id: "blk-3".to_string(),
            block_type: BlockTypeDto::Code,
            content: "fn main() {}".to_string(),
        },
    ];
    let editing_3 = EditingSessionStateDto::Editing {
        current_note_id: "n1".to_string(),
        focused_block_id: None,
        is_dirty: false,
        is_note_empty: false,
        last_save_result: None,
        blocks: Some(blocks_3),
    };
    let value_3 = serde_json::to_value(&editing_3).expect("serialize");
    let blocks_arr = value_3
        .as_object()
        .and_then(|o| o.get("blocks"))
        .and_then(|b| b.as_array())
        .expect("blocks must be a JSON array");
    assert_eq!(blocks_arr.len(), 3, "blocks array must have 3 elements");
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-009: make_editing_state_changed_payload wraps in {"state": ...}
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-009 — The helper wraps the variant in {"state": <variant>}.
/// Returned Value is Object with exactly one key "state".
#[test]
fn prop_ipc_009_helper_wraps_in_state() {
    let state = compose_state_idle();
    let payload = make_editing_state_changed_payload(&state);
    let obj = payload.as_object().expect("payload must be a JSON object");
    assert_eq!(
        obj.len(),
        1,
        "payload must have exactly one key 'state', got {:?}",
        obj.keys().collect::<Vec<_>>()
    );
    assert!(
        obj.contains_key("state"),
        "payload must have key 'state', got {:?}",
        obj.keys().collect::<Vec<_>>()
    );
    // The "state" value must itself be an object with status:"idle"
    let inner = obj.get("state").expect("state key must exist");
    assert_eq!(
        inner.as_object().and_then(|o| o.get("status")).and_then(|v| v.as_str()),
        Some("idle")
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-010: Round-trip over the 14-fixture cover set
// ─────────────────────────────────────────────────────────────────────────────

/// Build the 14-fixture cover set from §10.2.1 of verification-architecture.md.
/// Phase 2b must add `#[derive(PartialEq)]` to EditingSessionStateDto and sub-DTOs.
/// Until then, the test body will not compile (PartialEq is missing on Idle etc.).
/// TODO Phase 2b: add #[derive(PartialEq)] to EditingSessionStateDto, PendingNextFocusDto,
///      SaveErrorDto, FsErrorDto, DtoBlock, BlockTypeDto.
fn wire_fixtures() -> Vec<EditingSessionStateDto> {
    vec![
        // F01 — Idle
        EditingSessionStateDto::Idle,

        // F02 — Editing, blocks:None, focused_block_id:None, is_dirty:false, is_note_empty:true
        EditingSessionStateDto::Editing {
            current_note_id: "n1".to_string(),
            focused_block_id: None,
            is_dirty: false,
            is_note_empty: true,
            last_save_result: None,
            blocks: None,
        },

        // F03 — Editing, blocks:Some([]), focused_block_id:Some("blk-1"), is_dirty:true, last_save_result:Some("success")
        EditingSessionStateDto::Editing {
            current_note_id: "n1".to_string(),
            focused_block_id: Some("blk-1".to_string()),
            is_dirty: true,
            is_note_empty: false,
            last_save_result: Some("success".to_string()),
            blocks: Some(vec![]),
        },

        // F04 — Editing, blocks:Some([Paragraph,Heading1,Code,Divider])
        EditingSessionStateDto::Editing {
            current_note_id: "n1".to_string(),
            focused_block_id: Some("blk-2".to_string()),
            is_dirty: false,
            is_note_empty: false,
            last_save_result: None,
            blocks: Some(vec![
                DtoBlock { id: "b1".to_string(), block_type: BlockTypeDto::Paragraph, content: "para".to_string() },
                DtoBlock { id: "b2".to_string(), block_type: BlockTypeDto::Heading1, content: "title".to_string() },
                DtoBlock { id: "b3".to_string(), block_type: BlockTypeDto::Code, content: "fn f() {}".to_string() },
                DtoBlock { id: "b4".to_string(), block_type: BlockTypeDto::Divider, content: "".to_string() },
            ]),
        },

        // F05 — Saving, blocks:None
        EditingSessionStateDto::Saving {
            current_note_id: "n1".to_string(),
            is_note_empty: false,
            blocks: None,
        },

        // F06 — Saving, blocks:Some([Paragraph])
        EditingSessionStateDto::Saving {
            current_note_id: "n1".to_string(),
            is_note_empty: false,
            blocks: Some(vec![
                DtoBlock { id: "b1".to_string(), block_type: BlockTypeDto::Paragraph, content: "text".to_string() },
            ]),
        },

        // F07 — Switching, blocks:None
        EditingSessionStateDto::Switching {
            current_note_id: "n1".to_string(),
            pending_next_focus: PendingNextFocusDto { note_id: "n2".to_string(), block_id: "blk-1".to_string() },
            is_note_empty: false,
            blocks: None,
        },

        // F08 — Switching, blocks:Some([])
        EditingSessionStateDto::Switching {
            current_note_id: "n1".to_string(),
            pending_next_focus: PendingNextFocusDto { note_id: "n2".to_string(), block_id: "blk-1".to_string() },
            is_note_empty: false,
            blocks: Some(vec![]),
        },

        // F09 — SaveFailed, blocks:None, both nullables None, reason:Some(permission)
        EditingSessionStateDto::SaveFailed {
            current_note_id: "n1".to_string(),
            prior_focused_block_id: None,
            pending_next_focus: None,
            last_save_error: SaveErrorDto { kind: "fs".to_string(), reason: Some(FsErrorDto { kind: "permission".to_string() }) },
            is_note_empty: false,
            blocks: None,
        },

        // F10 — SaveFailed, blocks:None, prior_focused_block_id:Some, pending:None, reason:disk-full
        EditingSessionStateDto::SaveFailed {
            current_note_id: "n1".to_string(),
            prior_focused_block_id: Some("blk-1".to_string()),
            pending_next_focus: None,
            last_save_error: SaveErrorDto { kind: "fs".to_string(), reason: Some(FsErrorDto { kind: "disk-full".to_string() }) },
            is_note_empty: false,
            blocks: None,
        },

        // F11 — SaveFailed, blocks:None, both Some, reason:lock
        EditingSessionStateDto::SaveFailed {
            current_note_id: "n1".to_string(),
            prior_focused_block_id: Some("blk-1".to_string()),
            pending_next_focus: Some(PendingNextFocusDto { note_id: "n2".to_string(), block_id: "blk-1".to_string() }),
            last_save_error: SaveErrorDto { kind: "fs".to_string(), reason: Some(FsErrorDto { kind: "lock".to_string() }) },
            is_note_empty: false,
            blocks: None,
        },

        // F12 — SaveFailed, blocks:None, validation error (reason:None), is_note_empty:true
        EditingSessionStateDto::SaveFailed {
            current_note_id: "n1".to_string(),
            prior_focused_block_id: None,
            pending_next_focus: None,
            last_save_error: SaveErrorDto { kind: "validation".to_string(), reason: None },
            is_note_empty: true,
            blocks: None,
        },

        // F13 — SaveFailed, blocks:Some([]), pending:Some, reason:unknown
        EditingSessionStateDto::SaveFailed {
            current_note_id: "n1".to_string(),
            prior_focused_block_id: None,
            pending_next_focus: Some(PendingNextFocusDto { note_id: "n2".to_string(), block_id: "blk-1".to_string() }),
            last_save_error: SaveErrorDto { kind: "fs".to_string(), reason: Some(FsErrorDto { kind: "unknown".to_string() }) },
            is_note_empty: false,
            blocks: Some(vec![]),
        },

        // F14 — SaveFailed, blocks:Some([Heading2,Bullet]), prior:Some, pending:None, reason:not-found
        EditingSessionStateDto::SaveFailed {
            current_note_id: "n1".to_string(),
            prior_focused_block_id: Some("blk-1".to_string()),
            pending_next_focus: None,
            last_save_error: SaveErrorDto { kind: "fs".to_string(), reason: Some(FsErrorDto { kind: "not-found".to_string() }) },
            is_note_empty: false,
            blocks: Some(vec![
                DtoBlock { id: "b1".to_string(), block_type: BlockTypeDto::Heading2, content: "sub".to_string() },
                DtoBlock { id: "b2".to_string(), block_type: BlockTypeDto::Bullet, content: "item".to_string() },
            ]),
        },
    ]
}

/// PROP-IPC-010 — Round-trip over the 14-fixture cover set.
/// Requires #[derive(PartialEq)] on EditingSessionStateDto and sub-DTOs (Phase 2b).
#[test]
fn prop_ipc_010_round_trip_cover_set() {
    for (idx, fixture) in wire_fixtures().into_iter().enumerate() {
        let serialized = serde_json::to_string(&fixture).expect("serialize");
        let deserialized: EditingSessionStateDto =
            serde_json::from_str(&serialized).expect("deserialize");
        assert_eq!(
            fixture, deserialized,
            "Round-trip failed for fixture F{:02}. JSON: {}",
            idx + 1,
            serialized
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-018: BlockTypeDto 9-variant exhaustive match
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-018 — BlockTypeDto has exactly 9 variants. Compile-time exhaustion.
#[test]
fn prop_ipc_018_block_type_dto_nine_variants() {
    let all_variants = [
        BlockTypeDto::Paragraph,
        BlockTypeDto::Heading1,
        BlockTypeDto::Heading2,
        BlockTypeDto::Heading3,
        BlockTypeDto::Bullet,
        BlockTypeDto::Numbered,
        BlockTypeDto::Code,
        BlockTypeDto::Quote,
        BlockTypeDto::Divider,
    ];

    // Exhaustive match — any new variant breaks this.
    let to_str = |v: &BlockTypeDto| -> &'static str {
        match v {
            BlockTypeDto::Paragraph => "paragraph",
            BlockTypeDto::Heading1  => "heading-1",
            BlockTypeDto::Heading2  => "heading-2",
            BlockTypeDto::Heading3  => "heading-3",
            BlockTypeDto::Bullet    => "bullet",
            BlockTypeDto::Numbered  => "numbered",
            BlockTypeDto::Code      => "code",
            BlockTypeDto::Quote     => "quote",
            BlockTypeDto::Divider   => "divider",
        }
    };

    let expected = [
        "paragraph", "heading-1", "heading-2", "heading-3",
        "bullet", "numbered", "code", "quote", "divider",
    ];

    for (variant, expected_str) in all_variants.iter().zip(expected.iter()) {
        assert_eq!(to_str(variant), *expected_str);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-019: BlockTypeDto round-trip (valid strings)
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-019 (valid) — All 9 kebab-case block type strings round-trip correctly.
#[test]
fn prop_ipc_019_block_type_dto_round_trip_valid() {
    let valid_strings = [
        "paragraph",
        "heading-1",
        "heading-2",
        "heading-3",
        "bullet",
        "numbered",
        "code",
        "quote",
        "divider",
    ];

    for s in &valid_strings {
        let json_str = format!("\"{}\"", s);
        let parsed: BlockTypeDto = serde_json::from_str(&json_str)
            .unwrap_or_else(|_| panic!("Should parse valid block type: {}", s));
        let re_serialized = serde_json::to_string(&parsed)
            .unwrap_or_else(|_| panic!("Should serialize block type: {}", s));
        assert_eq!(
            re_serialized,
            json_str,
            "Round-trip failed for block type '{}'",
            s
        );
    }
}

/// PROP-IPC-019 (invalid) — Typos and wrong case strings must return Err.
#[test]
fn prop_ipc_019_block_type_dto_invalid_strings() {
    let invalid_strings = [
        "\"hedaing-1\"",  // typo
        "\"Paragraph\"",  // wrong case
        "\"\"",           // empty
    ];

    for invalid in &invalid_strings {
        let result = serde_json::from_str::<BlockTypeDto>(invalid);
        assert!(
            result.is_err(),
            "Should reject invalid block type string: {}, but got Ok({:?})",
            invalid,
            result.ok()
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-013: compose_state_idle
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-013 — compose_state_idle() returns the Idle variant.
#[test]
fn prop_ipc_013_compose_idle() {
    let state = compose_state_idle();
    match &state {
        EditingSessionStateDto::Idle => {}
        other => panic!("Expected Idle, got a different variant; status in JSON: {}", {
            let v = serde_json::to_value(other).unwrap();
            v["status"].as_str().unwrap_or("?").to_string()
        }),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-014: compose_state_for_cancel_switch
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-014 — compose_state_for_cancel_switch returns Editing with the correct
/// field values per REQ-IPC-015: isDirty:true, focusedBlockId:null, lastSaveResult:null,
/// isNoteEmpty:false.
#[test]
fn prop_ipc_014_compose_cancel_switch() {
    let state = compose_state_for_cancel_switch("/v/n.md");
    match &state {
        EditingSessionStateDto::Editing {
            current_note_id,
            focused_block_id,
            is_dirty,
            is_note_empty,
            last_save_result,
            blocks,
        } => {
            assert_eq!(current_note_id, "/v/n.md");
            assert_eq!(*focused_block_id, None, "focusedBlockId must be null");
            assert!(*is_dirty, "isDirty must be true after cancel_switch");
            assert!(!*is_note_empty, "isNoteEmpty must be false (conservative)");
            assert_eq!(*last_save_result, None, "lastSaveResult must be null");
            assert_eq!(*blocks, None, "blocks must be None in Sprint 8");
        }
        other => panic!(
            "Expected Editing variant, got: {}",
            serde_json::to_value(other).unwrap()["status"]
                .as_str()
                .unwrap_or("?")
        ),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-015: compose_state_for_request_new_note
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-015 — compose_state_for_request_new_note returns Editing with
/// is_note_empty:true (new note has empty body).
#[test]
fn prop_ipc_015_compose_request_new_note() {
    let state = compose_state_for_request_new_note("/v/new.md");
    match &state {
        EditingSessionStateDto::Editing {
            current_note_id,
            is_note_empty,
            is_dirty,
            focused_block_id,
            last_save_result,
            blocks,
        } => {
            assert_eq!(current_note_id, "/v/new.md");
            assert!(*is_note_empty, "new note must have isNoteEmpty:true");
            assert!(!*is_dirty, "new note must have isDirty:false");
            assert_eq!(*focused_block_id, None);
            assert_eq!(*last_save_result, None);
            assert_eq!(*blocks, None);
        }
        other => panic!(
            "Expected Editing variant, got: {}",
            serde_json::to_value(other).unwrap()["status"]
                .as_str()
                .unwrap_or("?")
        ),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-016: compose_state_for_save_ok and compose_state_for_save_err
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-016 — compose_state_for_save_ok produces Editing with isDirty:false,
/// lastSaveResult:"success", isNoteEmpty:body.is_empty().
/// compose_state_for_save_err produces SaveFailed with the right shape.
#[test]
fn prop_ipc_016_compose_save_ok_and_err() {
    // Save OK — non-empty body
    let ok_state = compose_state_for_save_ok("/v/n.md", "some content");
    match ok_state {
        EditingSessionStateDto::Editing {
            current_note_id,
            is_dirty,
            last_save_result,
            is_note_empty,
            focused_block_id,
            blocks,
        } => {
            assert_eq!(current_note_id, "/v/n.md");
            assert!(!is_dirty, "isDirty must be false after save ok");
            assert_eq!(last_save_result.as_deref(), Some("success"));
            assert!(!is_note_empty, "non-empty body → isNoteEmpty:false");
            assert_eq!(focused_block_id, None);
            assert_eq!(blocks, None);
        }
        _ => panic!("Expected Editing for save_ok, got different variant"),
    }

    // Save OK — empty body
    let ok_empty = compose_state_for_save_ok("/v/n.md", "");
    match ok_empty {
        EditingSessionStateDto::Editing { is_note_empty, .. } => {
            assert!(is_note_empty, "empty body → isNoteEmpty:true");
        }
        _ => panic!("Expected Editing for save_ok (empty body)"),
    }

    // Save Err
    let fs_err = FsErrorDto { kind: "permission".to_string() };
    let err_state = compose_state_for_save_err("/v/n.md", "draft", fs_err);
    match err_state {
        EditingSessionStateDto::SaveFailed {
            current_note_id,
            prior_focused_block_id,
            pending_next_focus,
            last_save_error,
            is_note_empty,
            blocks,
        } => {
            assert_eq!(current_note_id, "/v/n.md");
            assert_eq!(prior_focused_block_id, None);
            assert!(pending_next_focus.is_none());
            assert_eq!(last_save_error.kind, "fs");
            assert!(last_save_error.reason.is_some());
            assert!(!is_note_empty, "non-empty body → isNoteEmpty:false");
            assert_eq!(blocks, None);
        }
        _ => panic!("Expected SaveFailed for save_err, got different variant"),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROP-IPC-017: compose_state_for_select_past_note
// ─────────────────────────────────────────────────────────────────────────────

/// PROP-IPC-017 — compose_state_for_select_past_note produces Editing with
/// isNoteEmpty:body.is_empty(), isDirty:false, focusedBlockId:null.
#[test]
fn prop_ipc_017_compose_select_past_note() {
    // Non-empty body
    let state = compose_state_for_select_past_note("note-1", "# Hello");
    match state {
        EditingSessionStateDto::Editing {
            current_note_id,
            is_note_empty,
            is_dirty,
            focused_block_id,
            last_save_result,
            blocks,
        } => {
            assert_eq!(current_note_id, "note-1");
            assert!(!is_note_empty, "non-empty body → isNoteEmpty:false");
            assert!(!is_dirty);
            assert_eq!(focused_block_id, None);
            assert_eq!(last_save_result, None);
            assert_eq!(blocks, None);
        }
        _ => panic!("Expected Editing for select_past_note"),
    }

    // Empty body
    let state_empty = compose_state_for_select_past_note("note-2", "");
    match state_empty {
        EditingSessionStateDto::Editing { is_note_empty, .. } => {
            assert!(is_note_empty, "empty body → isNoteEmpty:true");
        }
        _ => panic!("Expected Editing for select_past_note (empty)"),
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// print_wire_fixtures: generate wire-fixtures.json for PROP-IPC-011 / PROP-IPC-022
// ─────────────────────────────────────────────────────────────────────────────

/// Serializes the 14-fixture cover set and writes them to
/// `promptnotes/src-tauri/tests/fixtures/wire-fixtures.json` as a JSON array.
/// The fixture file is generated; it is NOT hand-authored.
/// PROP-IPC-011: this file is consumed by the TS vitest test
///   `editorStateChannelWireFixtures.dom.vitest.ts`.
#[test]
fn print_wire_fixtures() {
    let fixtures = wire_fixtures();
    let arr: Vec<serde_json::Value> = fixtures
        .iter()
        .map(|f| serde_json::to_value(f).expect("serialize fixture"))
        .collect();
    let json = serde_json::to_string_pretty(&arr).expect("serialize array");

    // Determine output path relative to this test file's manifest directory.
    // CARGO_MANIFEST_DIR is set by cargo at test time.
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let fixtures_dir = std::path::Path::new(manifest_dir).join("tests").join("fixtures");
    std::fs::create_dir_all(&fixtures_dir).expect("create fixtures dir");
    let out_path = fixtures_dir.join("wire-fixtures.json");
    std::fs::write(&out_path, &json).expect("write wire-fixtures.json");

    println!("Wrote {} fixtures to {}", arr.len(), out_path.display());
    assert_eq!(arr.len(), 14, "Cover set must have exactly 14 fixtures");
}
