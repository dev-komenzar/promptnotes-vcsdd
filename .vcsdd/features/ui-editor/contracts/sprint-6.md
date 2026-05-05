---
sprintNumber: 6
feature: ui-editor
status: approved
negotiationRound: 0
scope: Sprint 6 iter-2 — fix 6 adversary findings (FIND-001..006) from sprint-5 review. copy_note_body parameter fix, clippy+doc cleanup, cancel_switch body placeholder fix, tempfile collision counter, source logging.
criteria:
  - id: CRIT-300
    dimension: spec_fidelity
    description: FIND-001 — copy_note_body matches REQ-EDIT-034 spec (2 params: noteId, body only; no issued_at).
    weight: 0.30
    passThreshold: cargo check exits 0; grep confirms copy_note_body fn signature has exactly 2 parameters
  - id: CRIT-301
    dimension: structural_integrity
    description: FIND-002 — zero clippy warnings on editor.rs; doc comment accurately describes unwrap_or_else usage.
    weight: 0.15
    passThreshold: cargo clippy shows 0 editor.rs warnings
  - id: CRIT-302
    dimension: implementation_correctness
    description: FIND-003 — cancel_switch emits empty string as body (not debug string).
    weight: 0.15
    passThreshold: cargo test editor_handlers 18/18 pass
  - id: CRIT-303
    dimension: edge_case_coverage
    description: FIND-005 — fs_write_file_atomic tempfile suffix includes atomic counter for collision avoidance.
    weight: 0.15
    passThreshold: cargo test editor_handlers 18/18 pass
  - id: CRIT-304
    dimension: spec_fidelity
    description: FIND-006 — trigger_idle_save/trigger_blur_save log source discriminator via eprintln!.
    weight: 0.10
    passThreshold: grep confirms eprintln! in both save handlers
  - id: CRIT-305
    dimension: verification_readiness
    description: Sprint 5 baseline zero regression. All 23 cargo tests + 195 vitest tests pass.
    weight: 0.15
    passThreshold: cargo test 23/23 pass; vitest 195/195 pass
---
# Sprint 6 Contract — ui-editor

Iter-2 remediation for adversary findings FIND-001..006.
