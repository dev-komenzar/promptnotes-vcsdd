---
sprintNumber: 5
feature: ui-feed-list-actions
status: approved
negotiationRound: 1
scope: |
  Sprint 5 — in-place editing migration (UI-only). EditorPane abolition + FeedRow embeds BlockElement[] for editing note. editing_session_state_changed subscriber rerouted from old editorStateChannel to a new centralized editingSessionChannel. FeedRow-side empty paragraph fallback (REQ-FEED-031) with best-effort dispatch. Sprint 5 covers REQ-FEED-028..033, EC-FEED-016 (S5 amendment), EC-FEED-018..020, PROP-FEED-S5-001..022.
  Out of scope (deferred to a future sprint with explicit human approval at Phase 1c gate): Group B Rust handlers (9 of 16 BlockEditorAdapter methods — focus/edit/insert/remove/merge/split/changeType/move) — Sprint 5 dispatch is best-effort only.
redLines:
  - "Rust emit ordering (editing_session_state_changed → feed_state_changed) MUST NOT change. Sprint-4 baseline tag: vcsdd/ui-feed-list-actions/sprint-4-baseline (commit d30ab13). Verified by PROP-FEED-S5-013."
  - "src/lib/editor/ MUST NOT be re-introduced (filesystem check PROP-FEED-S5-015)."
  - "+page.svelte MUST NOT import EditorPanel/editorStateChannel/tauriEditorAdapter/editor-main/feed-sidebar/grid-template-columns (PROP-FEED-S5-001)."
  - "All 16 BlockEditorAdapter dispatch payloads MUST include issuedAt: string (PROP-FEED-S5-017 condition (3))."
  - "editing_session_state_changed listener MUST exist exactly once and live in src/lib/feed/editingSessionChannel.ts (PROP-FEED-S5-003)."
  - "editingSessionChannel.ts MUST be INBOUND-only (no invoke / no @tauri-apps/api/core import; PROP-FEED-S5-021)."
  - "Spec source files for Sprint 5 must remain coherent — no edits to Sprint 1-4 REQs except the EC-FEED-016 supersession marker."
criteria:
  - id: CRIT-200
    dimension: spec_fidelity
    description: REQ-FEED-028 — +page.svelte single-column layout. EditorPanel/editorStateChannel/tauriEditorAdapter/editor-main/feed-sidebar/grid-template-columns are all 0-hit on grep; main-route.dom.vitest.ts asserts FeedList is the sole content surface and feed-main has height 100vh in CSS source.
    weight: 0.12
    passThreshold: PROP-FEED-S5-001 grep audit exit 1 (no match); PROP-FEED-S5-002 grep ≥ 1 hit on `height:\s*100vh` in +page.svelte AND DOM test confirms FeedList present, EditorPanel absent.
  - id: CRIT-201
    dimension: spec_fidelity
    description: REQ-FEED-029 — single centralized editing_session_state_changed subscriber in src/lib/feed/editingSessionChannel.ts. 5-arm EditingSessionStateDto wire shape exhaustively dispatched (Idle/Editing/Saving/Switching/SaveFailed). FeedRow does not register any listen() for this event. Old editorStateChannel references in production code = 0 hits.
    weight: 0.13
    passThreshold: PROP-FEED-S5-003 grep wc -l == 1 + listener path includes editingSessionChannel.ts; PROP-FEED-S5-004 exit 1 (no editorStateChannel hits); PROP-FEED-S5-021 exit 0 (INBOUND only); PROP-FEED-S5-005 mock-emitter integration test PASS.
  - id: CRIT-202
    dimension: implementation_correctness
    description: REQ-FEED-030 — FeedRow embeds BlockElement[] for editing note. 2x2 truth table (editingStatus × editingNoteId === self.noteId) integration tests pass for all 4 cells. createBlockEditorAdapter() returns BlockEditorAdapter-typed object with 16 invoke calls; command name set matches REQ-FEED-030 §Adapter command-mapping table; every dispatch payload includes issuedAt.
    weight: 0.20
    passThreshold: PROP-FEED-S5-006 (4/4 cells) PASS, PROP-FEED-S5-007 (save-failure-banner) PASS, PROP-FEED-S5-008 (dispatchEditBlockContent on input) PASS, PROP-FEED-S5-016 tsc exit 0, PROP-FEED-S5-017 grep wc -l == 16 + diff exit 0 + issuedAt count ≥ 16.
  - id: CRIT-203
    dimension: edge_case_coverage
    description: REQ-FEED-031 — empty paragraph fallback. needsEmptyParagraphFallback pure helper covers null/undefined/[] equivalence classes via fast-check. Fallback dispatch chain (insert→focus) attempted in correct order with try/catch; reject does NOT break UI. fallbackAppliedFor state ownership prevents UUID churn under (a) repeated undefined, (b) noteA→noteB→noteA cycle, (c) undefined→non-empty→undefined transition (FIND-S5-SPEC-iter2-005), (d) non-empty only.
    weight: 0.18
    passThreshold: PROP-FEED-S5-009 fast-check PASS, PROP-FEED-S5-010 (DOM fallback BlockElement, UUID v4) PASS, PROP-FEED-S5-011 all 5 scenarios PASS.
  - id: CRIT-204
    dimension: structural_integrity
    description: REQ-FEED-032 — Sprint 4 emit-order baseline preserved. Subscriber handler in editingSessionChannel.ts is synchronous (no await/then/setTimeout/queueMicrotask). PROP-FEED-S5-013 git diff against vcsdd/ui-feed-list-actions/sprint-4-baseline shows zero +/- emit lines in editor.rs / feed.rs. wire_audit.sh PASS.
    weight: 0.10
    passThreshold: PROP-FEED-S5-012 awk + grep exit 1; PROP-FEED-S5-013 git diff grep exit 1 + wire_audit.sh exit 0; PROP-FEED-S5-005 covers UI-side timing.
  - id: CRIT-205
    dimension: verification_readiness
    description: REQ-FEED-033 — Forbidden-identifier regression audit. EditorPanel/editorStateChannel/tauriEditorAdapter/editorReducer/editorPredicates/EditorViewState/EditorAction/EditorCommand/EditorIpcAdapter all 0-hit in production code under src/lib/feed/, src/routes/+page.svelte, src/lib/block-editor/. src/lib/editor/ directory does not exist on filesystem.
    weight: 0.07
    passThreshold: PROP-FEED-S5-014 grep exit 1; PROP-FEED-S5-015 ! test -d exit 0.
  - id: CRIT-206
    dimension: implementation_correctness
    description: Sprint 5 known constraint (Group B Rust handler unimplemented, REQ-FEED-031 best-effort) — UI continues to function (BlockElement renders, contenteditable accepts input, focus visual works) when ALL 9 Group B dispatches are configured to reject in mock adapter. Console.warn is observed (positive evidence dispatches were attempted).
    weight: 0.10
    passThreshold: PROP-FEED-S5-022 (4 sub-assertions a/b/c/d) PASS in feed-row-best-effort-dispatch.dom.vitest.ts.
  - id: CRIT-207
    dimension: edge_case_coverage
    description: EC-FEED-018 (filter excludes editingNoteId), EC-FEED-019 (double-click race), EC-FEED-020 (handler-late mount) — all 3 new Sprint 5 edge cases covered by integration tests.
    weight: 0.10
    passThreshold: PROP-FEED-S5-018 PASS, PROP-FEED-S5-019 PASS, PROP-FEED-S5-020 PASS.
gates:
  phase2: |
    Red phase (Phase 2a) entry: Required:true PROPs (S5-001..S5-022 marked Required:true) have failing tests; regression baseline (Sprint 1-4 tests) green.
  phase3: |
    Adversarial review (Phase 3) entry: pure modules ≥ 95% branch coverage; all Required:true PROPs PASS; all Required:false integration tests PASS.
  phase5: |
    Formal hardening (Phase 5) entry: see verification-architecture.md §14 Phase 5 gate.
---

# Sprint 5 Contract — ui-feed-list-actions

Pre-approved by architect (Phase 1c-sprint-5 gate PASS at 2026-05-10T03:30:00.000Z; adversary iter-3 PASS + human approval recorded in state.json gates).

## Critical scope acknowledgement (recorded in human approval)

Sprint 5 ships **UI-only** the in-place editing migration. The 9 Group B BlockEditorAdapter dispatch methods (`focus`/`edit`/`insert{After,AtBeginning}`/`remove`/`merge`/`split`/`changeType`/`move`) target Tauri commands that **do NOT yet exist on the Rust side**. Sprint 5 wraps them in `try/catch` so the UI continues to function while showing a console warning. **User-typed text in past notes is NOT persisted to disk during Sprint 5.** Persistence is the responsibility of a future sprint that owns the Capture Context Rust implementation (see migration doc Step 2: "Rust バックエンドの変更 → UI spec 確定後に別タスクで扱う").

## Adversary calibration notes for Phase 3

- Group B dispatch reject is **expected and correct** in Sprint 5; do NOT flag as a bug.
- `editingSessionState` and `viewState` are **two separate state slices** by design (REQ-FEED-030 State source-of-truth subsection); do NOT request consolidation into a single store.
- `fallbackAppliedFor` per-row state is intentional UI-only; do NOT request promoting it to feedReducer.
- Sprint 5 modifies neither editor.rs nor feed.rs (PROP-FEED-S5-013 enforces this); do NOT request Rust-side changes.
