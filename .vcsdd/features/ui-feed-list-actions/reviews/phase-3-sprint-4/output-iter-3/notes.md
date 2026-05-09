# Phase 3 sprint-4 iter-3 review notes

## iter-2 findings 解消状況: 2/2 RESOLVED

**FIND-S4-IMPL-iter2-001 (parserParity scope contradiction)** — RESOLVED.
The empty-string test case is removed. The test file's module-level doc comment
now explicitly carves out empty/whitespace inputs as architecturally fixed
divergence (TS REQ-018/PROP-031 → `Ok([])`; Rust REQ-FEED-025 → `Ok([paragraph(""])`).
The remaining 6 cases are non-empty fixtures with content+type tuple assertions.
The Sprint 4 gating snapshot (canonical fixture `# heading\n\nparagraph`) is
preserved on both Rust and TS halves.

**FIND-S4-IMPL-iter2-002 (handler antipattern)** — RESOLVED via remediation
option (b). `feed.rs` now exposes `pub struct SelectPastNoteResult` and
`pub fn compose_select_past_note(note_id, vault_path)`. `select_past_note`
becomes a 4-line emit wrapper. `prop_s4_017_compose_select_past_note_returns_well_formed_result`
calls `compose_select_past_note` directly and asserts on both `editing_payload`
(status / currentNoteId / focusedBlockId / blocks present / body absent /
isDirty / isNoteEmpty) and `feed_snapshot` (cause.kind / editing fields /
visibleNoteIds / noteMetadata). A regression in the orchestration layer
(missing parse, swapped args, missing field) now fails this test.

## 新規懸念

None of severity sufficient to block. Two pre-existing items inherited from
earlier iterations are noted but **not regressions**:

1. REQ-FEED-025 spec text (behavioral-spec.md:716-723) still claims TS↔Rust
   consistency on the empty-input invariant, but the production TS parser
   (parse-markdown-to-blocks.ts:78-82) returns `Ok([])`. The test layer no
   longer perpetuates this — iter-3's divergence note carves it out — but the
   spec wording remains imprecise. This is a Sprint 5 follow-up.
2. The single-empty-paragraph special form (spec line 765:
   `Some([{id, Paragraph, ""}])` → `is_note_empty: true`) is not enforced by
   `compose_state_for_select_past_note` (editor.rs:317-321) and not tested.
   Inherited from iter-1 baseline; out of scope for an iter-3 regression check.

## PASS 理由 / Phase 5 進行可能根拠

- 5 dimension すべて PASS (regression check)
- iter-2 findings 完全解消 (2/2)
- PROP-FEED-S4-016 gating snapshot 1 ペア (Rust prop_s4_016b + TS canonical
  fixture test) 揃って PASS
- prop_s4_017 が実体の orchestration を exercise (no antipattern)
- wire shape は Sprint 4 amendment (REQ-FEED-024 / REQ-FEED-025) と整合
- purity boundary preserved (no new IPC entanglement)

Phase 5 (formal hardening) への進行を阻む adversarial finding はなし。
escalate 不要。
