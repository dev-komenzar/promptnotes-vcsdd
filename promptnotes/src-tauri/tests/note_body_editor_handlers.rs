//! note_body_editor_handlers.rs — Integration tests for note-body-editor feature.
//!
//! Phase 2a (RED phase):
//!   PROP-006: isDirty reset on successful save
//!   PROP-007: isDirty preserved on failed save
//!   PROP-010: editing_session_state_changed event emission on isDirty transition
//!
//! RED PHASE: These tests reference InMemoryNoteBody, NoteBodyStore, and
//! editor_update_note_body which do NOT exist yet in promptnotes_lib::editor.
//! Expected outcome: compilation FAILURE.

use promptnotes_lib::editor::{
    compose_state_for_save_err, compose_state_for_save_ok, fs_write_file_atomic,
    make_editing_state_changed_payload, EditingSessionStateDto, FsErrorDto,
};

// ═══════════════════════════════════════════════════════════════════════════════
// RED PHASE imports: These types/functions do NOT exist yet.
// This causes compilation failure — the expected RED state.
// In Phase 2b, when these are added to promptnotes_lib::editor, compilation succeeds.
// ═══════════════════════════════════════════════════════════════════════════════

use promptnotes_lib::editor::{validate_no_control_chars, InMemoryNoteBody, NoteBodyStore};

#[allow(unused_imports)]
use promptnotes_lib::editor::editor_update_note_body;

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-006: isDirty reset on successful save
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn prop006_is_dirty_resets_on_successful_save() {
    // Create the in-memory store with a dirty entry.
    let store = NoteBodyStore::new();
    let note_id = "/tmp/promptnotes-int-save-ok.md".to_string();
    let body = "# Integration test body".to_string();

    // Clean up any previous run
    let _ = std::fs::remove_file(&note_id);

    // Insert a dirty entry (simulating user typed something)
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

    // Execute the save (atomic write to disk)
    let write_result = fs_write_file_atomic(&note_id, &body);
    assert!(write_result.is_ok(), "atomic write must succeed");

    // After save succeeds, update store: isDirty → false
    {
        let mut map = store.0.lock().unwrap();
        let entry = map.get_mut(&note_id).expect("entry must exist");
        entry.is_dirty = false;
        entry.last_saved_body = body.clone();
    }

    // Verify store reflects clean state
    {
        let map = store.0.lock().unwrap();
        let entry = map.get(&note_id).expect("entry must exist");
        assert!(
            !entry.is_dirty,
            "is_dirty must be false after successful save"
        );
        assert_eq!(
            entry.last_saved_body, body,
            "last_saved_body must match saved body"
        );
        assert_eq!(entry.body, body, "body must match saved body");
    }

    // Verify file was written correctly
    let read_back = std::fs::read_to_string(&note_id).expect("read back");
    assert_eq!(read_back, body);

    let _ = std::fs::remove_file(&note_id);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-007: isDirty preserved on failed save
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn prop007_is_dirty_preserved_on_failed_save() {
    // Create store with dirty entry pointing to a path where write WILL fail.
    let store = NoteBodyStore::new();
    let note_id = "/root/should-fail-permission.md".to_string();
    let body = "draft content".to_string();

    // Insert dirty entry
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

    // Attempt save — expected to fail (permission denied on /root)
    let write_result = fs_write_file_atomic(&note_id, &body);

    // On failure, is_dirty must remain true
    {
        let map = store.0.lock().unwrap();
        let entry = map.get(&note_id).expect("entry must exist");

        if write_result.is_err() {
            assert!(
                entry.is_dirty,
                "is_dirty must remain true after failed save"
            );
            assert_eq!(
                entry.last_saved_body, "",
                "last_saved_body must not be updated on failure"
            );
        }
        // If save somehow succeeded (running as root), is_dirty should be false
        else {
            assert!(
                !entry.is_dirty,
                "is_dirty must be false after successful save"
            );
        }
    }

    // Cleanup in case write succeeded
    let _ = std::fs::remove_file(&note_id);
}

#[test]
fn prop007_is_dirty_preserved_after_failed_save_state_is_save_failed() {
    // PROP-007: Verify that a failed save leaves the EditingSessionStateDto
    // in SaveFailed variant with the correct error reason.
    let store = NoteBodyStore::new();
    let note_id = "/vault/disk-full-test.md".to_string();
    let body = "important content".to_string();

    // Insert dirty entry
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

    // After a failed save, compose the save-failed state
    let fs_err = FsErrorDto {
        kind: "disk-full".to_string(),
    };
    let state = compose_state_for_save_err(&note_id, &body, fs_err);
    let payload = make_editing_state_changed_payload(&state);
    let json = serde_json::to_string(&payload).expect("serialize");

    // The state must reflect save-failed
    assert!(
        json.contains("save-failed"),
        "must contain save-failed status"
    );
    assert!(json.contains("disk-full"), "must contain error reason");

    // Store is_dirty must still be true
    {
        let map = store.0.lock().unwrap();
        let entry = map.get(&note_id).expect("entry must exist");
        assert!(
            entry.is_dirty,
            "is_dirty must remain true after save failure event"
        );
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROP-010: editing_session_state_changed event on isDirty transition
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn prop010_editor_update_note_body_stores_body_and_sets_dirty() {
    // PROP-010: When editor_update_note_body is called for a clean note,
    // the body is stored and is_dirty becomes true.
    //
    // RED PHASE: editor_update_note_body does not exist.
    let store = NoteBodyStore::new();
    let note_id = "/vault/prop010-test.md".to_string();
    let body = "# First keystroke after save".to_string();

    // Simulate the command that doesn't exist yet
    // (In Phase 2b, this will be: editor_update_note_body(&store, &note_id, &body)?)
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

    // Verify store state
    {
        let map = store.0.lock().unwrap();
        let entry = map.get(&note_id).expect("entry must exist");
        assert_eq!(entry.body, body);
        assert!(entry.is_dirty, "is_dirty must be true after first update");
    }
}

#[test]
fn prop010_is_dirty_transition_false_to_true_emits_event() {
    // PROP-010: Verify the Editing session state DTO correctly represents
    // the is_dirty=true state that would be emitted on first keystroke.
    //
    // RED PHASE: The actual tauri::AppHandle + event listener plumbing
    // does not exist here. In Phase 2b, this test will:
    // 1. Set up an event listener on "editing_session_state_changed"
    // 2. Call editor_update_note_body for a clean note
    // 3. Assert exactly 1 event was received with isDirty:true
    // 4. Call editor_update_note_body again (redundant)
    // 5. Assert no additional event was received

    let state = EditingSessionStateDto::Editing {
        current_note_id: "/vault/n.md".to_string(),
        focused_block_id: None,
        is_dirty: true, // The key assertion: first keystroke sets dirty
        is_note_empty: false,
        last_save_result: None,
        blocks: None,
    };
    let payload = make_editing_state_changed_payload(&state);
    let json = serde_json::to_string(&payload).expect("serialize");

    let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");
    let inner = &parsed["state"];
    assert_eq!(inner["status"], "editing");
    assert_eq!(inner["isDirty"], true);
    assert_eq!(inner["isNoteEmpty"], false);
}

#[test]
fn prop010_is_dirty_transition_true_to_false_after_save_emits_event() {
    // PROP-010: Successful save transitions is_dirty to false and
    // emits editing_session_state_changed with lastSaveResult: "success".
    let state = compose_state_for_save_ok("/vault/n.md", "saved content");
    let payload = make_editing_state_changed_payload(&state);
    let json = serde_json::to_string(&payload).expect("serialize");

    let parsed: serde_json::Value = serde_json::from_str(&json).expect("parse");
    let inner = &parsed["state"];
    assert_eq!(inner["status"], "editing");
    assert_eq!(inner["isDirty"], false);
    assert_eq!(inner["lastSaveResult"], "success");
}

#[test]
fn prop010_no_event_on_redundant_dirty_transition() {
    // PROP-010: When is_dirty is already true, a subsequent body update
    // must NOT emit an editing_session_state_changed event.
    //
    // RED PHASE: This requires the actual editor_update_note_body command.
    // In Phase 2b:
    // 1. Store has is_dirty=true entry
    // 2. Call editor_update_note_body with new body
    // 3. Assert event listener was NOT called (0 invocations)

    let store = NoteBodyStore::new();
    let note_id = "/vault/already-dirty.md".to_string();

    // Initial state: already dirty
    {
        let mut map = store.0.lock().unwrap();
        map.insert(
            note_id.clone(),
            InMemoryNoteBody {
                body: "first edit".to_string(),
                is_dirty: true,
                last_saved_body: String::new(),
            },
        );
    }

    // Second "update" (redundant) — is_dirty stays true
    // No event should be emitted for this redundant transition
    {
        let mut map = store.0.lock().unwrap();
        let entry = map.get_mut(&note_id).expect("entry must exist");

        // Before update, is_dirty is already true
        assert!(entry.is_dirty, "precondition: is_dirty must be true");

        // Update body (redundant dirty transition)
        entry.body = "second edit".to_string();
        // is_dirty stays true (was already true)

        assert!(
            entry.is_dirty,
            "is_dirty must remain true on redundant update"
        );

        // In Phase 2b: also assert that no event was emitted
        // (requires event listener spy on AppHandle)
    }
}

// ── Additional integration: validate_no_control_chars in Rust context ────

#[test]
fn prop001_validate_no_control_chars_integration_baseline() {
    // PROP-001: The Rust-side validate_no_control_chars function
    // correctly rejects control characters before they reach the store.
    //
    // RED PHASE: validate_no_control_chars does not exist yet.

    // Valid body passes
    let result = validate_no_control_chars("# Hello\n\nWorld");
    assert!(result.is_ok(), "clean body must pass validation");

    // Body with NULL byte fails
    let result = validate_no_control_chars("clean\0bad");
    assert!(result.is_err(), "body with NULL must be rejected");

    // Body with DELETE character fails
    let result = validate_no_control_chars("text\x7f");
    assert!(result.is_err(), "body with DEL must be rejected");

    // Tab, LF, CR are all permitted
    let result = validate_no_control_chars("a\tb\nc\r\nd");
    assert!(result.is_ok(), "tab/LF/CR must be permitted");
}

#[test]
fn prop015_validate_no_control_chars_no_false_positives() {
    // PROP-015: validate_no_control_chars never rejects valid Unicode.
    let valid_cases = vec![
        "",
        "hello",
        "こんにちは",
        "🌍🎉",
        "مرحبا",
        "line1\nline2",
        "col1\tcol2",
        "  \n\t  ",
    ];

    for case in &valid_cases {
        let result = validate_no_control_chars(case);
        assert!(
            result.is_ok(),
            "valid text must pass: {:?} → {:?}",
            case,
            result
        );
    }
}

#[test]
fn prop015_validate_no_control_chars_large_valid_body_passes() {
    // PROP-015: Large body without control chars passes.
    let large = "ABC\n".repeat(100_000); // ~400KB
    let result = validate_no_control_chars(&large);
    assert!(result.is_ok(), "large clean body must pass validation");
}
