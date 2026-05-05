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
