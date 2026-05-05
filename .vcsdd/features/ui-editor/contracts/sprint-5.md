---
sprintNumber: 5
feature: ui-editor
status: approved
negotiationRound: 0
scope: Sprint 5 vertical slice — Rust backend handlers (editor.rs) with 8 Tauri commands (REQ-EDIT-028..037), DTO serde camelCase conformity, fs_write_file_atomic tempfile+rename pattern, editing_session_state_changed event emit. Covers PROP-100..106.
criteria:
  - id: CRIT-200
    dimension: spec_fidelity
    description: REQ-EDIT-028..035 — all 8 Tauri commands compile and register in invoke_handler! macro (edit_note_body, trigger_idle_save, trigger_blur_save, retry_save, discard_current_session, cancel_switch, copy_note_body, request_new_note).
    weight: 0.25
    passThreshold: cargo check exits 0 with no editor.rs errors; grep confirms 8 editor:: entries in lib.rs invoke_handler!
  - id: CRIT-201
    dimension: implementation_correctness
    description: REQ-EDIT-036 — editing_session_state_changed event payload DTO conforms to TS EditingSessionState type (status, isDirty, currentNoteId, pendingNextNoteId, lastError, body fields in camelCase).
    weight: 0.20
    passThreshold: cargo test editor_handlers — 18 integration tests pass including DTO serialization tests (fs_error_dto_kind_matches_spec, save_error_dto_kind_is_fs_or_validation, save_error_dto_reason_skipped_when_none, editing_session_state_dto_serializes_camel_case)
  - id: CRIT-202
    dimension: implementation_correctness
    description: REQ-EDIT-037 — fs_write_file_atomic uses tempfile + rename pattern for atomic writes. Handles empty content and produces no partial writes on error.
    weight: 0.15
    passThreshold: cargo test editor_handlers — fs_write_file_atomic_handles_empty_content, fs_write_file_atomic_writes_complete_content, fs_write_file_atomic_does_not_partial_write_on_error pass
  - id: CRIT-203
    dimension: edge_case_coverage
    description: request_new_note generates unique note IDs with empty frontmatter (createdAt, updatedAt epoch ms, tags []). Event payload states correctly reflect editing status.
    weight: 0.15
    passThreshold: cargo test editor_handlers — make_editing_state_changed_payload_success, make_editing_state_changed_payload_save_failed, make_editing_state_changed_payload_idempotent, generate_frontmatter_body_section_is_empty pass
  - id: CRIT-204
    dimension: structural_integrity
    description: Rust safety — zero unsafe blocks, zero unwrap/panic/todo/unimplemented in editor.rs. Sprint 1 regression: all 195 vitest tests pass.
    weight: 0.15
    passThreshold: grep 'unsafe' = 0 hits in editor.rs; grep -cE '.unwrap()|panic!' = 0 in editor.rs; vitest 195/195 pass
  - id: CRIT-205
    dimension: verification_readiness
    description: Sprint 1 baseline zero regression. Existing feed.rs tests (5) + new editor tests (18) all pass. Cargo clippy no new warnings.
    weight: 0.10
    passThreshold: cargo test — 23/23 pass (18 editor + 5 feed); cargo clippy editor.rs exits 0 new warnings
---
# Sprint 5 Contract — ui-editor

Pre-approved by architect for Sprint 5 scope extension (1c-sprint-2 gate PASS).
