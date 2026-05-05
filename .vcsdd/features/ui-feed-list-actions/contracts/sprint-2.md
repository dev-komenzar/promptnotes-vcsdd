---
sprintNumber: 2
feature: ui-feed-list-actions
status: approved
negotiationRound: 1
scope: Sprint 2 vertical slice — Rust backend handlers (feed.rs), AppShell two-column layout in +page.svelte (DESIGN.md tokens), FeedList vaultPath prop threading, frontmatter parser. Covers REQ-FEED-019..023, PROP-100..106.
criteria:
  - id: CRIT-100
    dimension: spec_fidelity
    description: REQ-FEED-019 — fs_trash_file_impl maps NotFound→Ok, PermissionDenied→Err(Permission), other→Err(Unknown). Cargo integration tests verify all three branches.
    weight: 0.20
    passThreshold: cargo test feed_handlers — 5 integration tests pass (fs_trash_file_impl_nonexistent_returns_ok, fs_trash_file_impl_existing_file_returns_ok, trash_error_dto_serializes_permission_kind, trash_error_dto_serializes_unknown_kind_with_detail, trash_error_dto_serializes_unknown_kind_no_detail)
  - id: CRIT-101
    dimension: spec_fidelity
    description: REQ-FEED-021 — feed_state_changed DTOs serialize camelCase fields and TrashErrorDto serializes as tagged union. Unit tests cover all variants.
    weight: 0.15
    passThreshold: cargo test lib — 22 unit tests pass including feed_domain_snapshot_dto_serializes_camel_case and cause_dto_note_file_deleted_serializes
  - id: CRIT-102
    dimension: implementation_correctness
    description: REQ-FEED-020 — select_past_note and confirm_note_deletion Tauri commands compile and emit typed snapshots with correct vault scan (FIND-S2-05/06).
    weight: 0.15
    passThreshold: cargo check exits 0 with no feed.rs errors; unit tests make_editing_state_changed_snapshot_populates_feed_from_vault and make_note_deleted_snapshot_populates_remaining_feed_after_deletion pass
  - id: CRIT-103
    dimension: spec_fidelity
    description: REQ-FEED-023 — +page.svelte two-column layout with CSS grid-template-columns 320px 1fr and height 100vh. DOM test verifies layout presence.
    weight: 0.15
    passThreshold: vitest main-route.dom.vitest.ts 7 tests pass
  - id: CRIT-104
    dimension: structural_integrity
    description: DESIGN.md token compliance — grid-template-columns 320px 1fr, height 100vh, #e9e9e7 whisper border, #f7f7f5 warm neutral all present in +page.svelte via grep.
    weight: 0.15
    passThreshold: grep -nE confirms all four DESIGN.md tokens present in src/routes/+page.svelte
  - id: CRIT-105
    dimension: verification_readiness
    description: Rust safety — zero unsafe blocks, zero unwrap/panic/todo/unimplemented calls in feed.rs. Cargo clippy exits 0 (warnings only, no errors).
    weight: 0.10
    passThreshold: grep unsafe = 0 hits in feed.rs; grep -cE .unwrap()|panic! = 0; cargo clippy exits 0
  - id: CRIT-106
    dimension: edge_case_coverage
    description: Frontmatter parser robustness — CRLF line endings, multi-key YAML lists (FIND-S2-07, FIND-S2-03), plain content fallback. All 11 unit tests in parse_frontmatter_metadata cover these paths.
    weight: 0.10
    passThreshold: cargo test lib — parse_frontmatter_metadata_* tests pass including crlf variants and state-machine tag isolation tests
---

# Sprint 2 Contract — ui-feed-list-actions

Pre-approved by architect for Sprint 2 scope extension (1c-sprint-2 gate PASS at 2026-05-05T01:00:02.000Z).
