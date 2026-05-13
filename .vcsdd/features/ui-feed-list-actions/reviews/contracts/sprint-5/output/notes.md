# Sprint 5 Contract Review — Per-Criterion Audit

Reviewer: VCSDD Adversary (fresh context, no Builder history)
Contract digest echoed: `7a30dafd08e8767591be8bf51a5e2ec0f4e0528296a774f46a1671df52c178dc`
Iteration: 2 (negotiationRound 1 + 1)

## Per-criterion verdict

### CRIT-S5-001 — REQ-FEED-028 auto-create (PASS with comment)
- spec map (behavioral-spec.md:916-972): correct REQ id, conditions match.
- passThreshold names 3 concrete cargo tests; all 3 PASS per green-phase.log:31-33,42.
- Implementation in feed.rs:577-594 + compose_initial_snapshot_with_autocreate (feed.rs:517-565) matches the AC list.
- Comment: existing-one-note prepend test (feed_handlers.rs:1088-1140) and empty-vault test (1032-1077) are precise and binary.

### CRIT-S5-002 — PROP-FEED-S5-001/002/003 NoteId determinism/collision/format (PASS)
- spec map (verification-architecture.md:706-708): tier 2 props match. proptest strategy `0i64..253_402_300_800_000` matches `existing.len() ≤ 1023` bound.
- passThreshold names 4 cargo tests; all 4 PASS per green-phase.log.
- The proptest in feed_handlers.rs:1004-1019 exercises the full input domain bound and asserts non-containment.
- Implementation feed.rs:443-504 is pure (no SystemTime/fs/rand) — matches purity boundary §14.

### CRIT-S5-003 — PROP-FEED-S5-005 TS/Rust parity (PASS with comment)
- spec map (verification-architecture.md:710): 4 named edge cases match exactly.
- passThreshold `cargo test test_next_available_note_id_ts_parity_snapshot PASS (4 cases)` — test feed_handlers.rs:1207-1255 contains 4 assertions for cases (a)/(b)/(c)/(d).
- Comment: spec calls for 'cargo test + vitest 共有 JSON fixture'. The contract's passThreshold only mentions cargo test, but the TS-side parity check is in `parserParity` or equivalent — I did not find a separate Rust-vs-TS JSON fixture verification in the artifacts list. Acceptable since the snapshot constants are hard-coded inline in both languages, but a shared JSON fixture file would be more robust. Not a fail-grade issue for this contract.

### CRIT-S5-004 — REQ-FEED-029 mount-time editor (FAIL)
- See FIND-S5-CONTRACT-001 and FIND-S5-CONTRACT-002.
- The contract's passThreshold uses only feedReducer.sprint5.test.ts (4 unit tests). REQ-FEED-029 AC includes (i) CodeMirror mounts, (ii) document.activeElement on the editor, (iii) `+page.svelte` calls `feed_initial_state` once. None of (i)/(ii)/(iii) are gated by the 4 unit tests.
- The passThreshold also claims test contents ('cause.kind InitialLoad maintained', 'pendingNextFocus null') that have no corresponding `expect()` assertion in the actual test file (only the input snapshot carries these — there is no output assertion).

### CRIT-S5-005 — Vault Scan Semantics (FAIL)
- See FIND-S5-CONTRACT-003 and FIND-S5-CONTRACT-004.
- description lists 5 spec sub-items (case-insensitive ext, non-recursive, dot-file exclusion, symlink non-follow, lowercase stem collision namespace) but passThreshold only verifies (1) and (5).
- Implementation feed.rs:394-432 does NOT exclude dot-files (e.g. `.foo.md`) and does NOT call `file_type().is_file()` to skip symlinks/dirs. The contract's passThreshold of '手動 grep + 関連 cargo test PASS' is not binary-evaluable.

### CRIT-S5-006 — Refactor / Quality gate (PASS with serious comment, see FIND-S5-CONTRACT-006)
- spec map: passThreshold has concrete commands and numeric assertions (157 PASS, 1813 PASS, clippy 0 warnings, fmt 0 diff).
- These match green-phase.log:5-8 exactly. evidence is consistent.
- Comment / FAIL on structural_integrity dimension: trade-off §5 expands artifactsTouched into editor.rs / lib.rs / tests/ to absorb pre-existing clippy debt under the Sprint 5 contract. This is retroactive scope creep that the contract document itself acknowledges with the phrase 'scope creep許容'. Sprint 5 should not be the gate that swallows unrelated tech debt.

### CRIT-S5-007 — EC-FEED-016 Sprint 5 amendment (FAIL)
- See FIND-S5-CONTRACT-005.
- description promises 'atomic' insertion of note_metadata + visible_note_ids prepend. passThreshold does not actually verify atomicity — single-threaded happy-path PASS would satisfy it.
- The 'asymmetry with select_past_note race condition' is documented in spec EC-FEED-016 Sprint 5 amendment (behavioral-spec.md:1016-1029) but the contract does not have a passThreshold gating the select_past_note path. CRIT-S5-007 description mentions it but provides no test to verify the select_past_note Sprint 4 behavior is unchanged. (Note: the wider regression suite would catch this, but the contract does not explicitly bind it.)

## Cross-criterion concerns

### Weight sum
0.20 + 0.20 + 0.15 + 0.15 + 0.10 + 0.10 + 0.10 = 1.00. PASS.

### Evidence consistency
- red-phase.log:5 says 'red-test-count: 9' but lists 8 Rust items + 1 TS suite (which is 4 tests). The numeric '9' is therefore misleading (true count is 8 Rust + 4 TS = 12 if counted per test, or 9 if counted per spec line). Minor evidence cosmetic; not a finding.
- green-phase.log:5 reports '27 passed (19 prior + 8 new)' — verified by reading feed_handlers.rs Sprint 5 section: exactly 8 new Sprint 5 tests added. Consistent.
- bun test 1813 PASS matches both red and green logs (the 4 Sprint 5 TS tests were added in RED and pre-existed-as-pass per the RED log's own admission, which raises a subtle issue: are these tests truly 'red' if they already PASS at RED phase? See note below).

### TS test RED status (out-of-scope concern, not a contract finding)
red-phase.log:40-45 acknowledges the 4 Sprint 5 TS tests already PASS at RED time because `feedReducer` already mirrors `editing.currentNoteId → editingNoteId` (feedReducer.ts:58-59). This means the TS half of CRIT-S5-004 provides no Phase-2a gating value — the tests were green-from-creation. The contract does not flag this as a TDD-discipline issue. This is more a Phase 2a/2b discipline matter than a contract-document defect, so I have not raised a separate finding, but it indicates the contract criteria CRIT-S5-004 is weaker than its weight (0.15) implies.

### bdTasks
PN-2r3, PN-5im, PN-knv — I did not verify these are claimed/in-progress (no bd CLI access here). Per the contract Approval section line 73, they are claimed by takuya. Out of scope for adversarial review.

### Sprint contract document structure
- YAML frontmatter is well-formed (verifiable by `yq`-style parse; not run here).
- Required fields present: sprintNumber, feature, status, negotiationRound, scope, bdTasks, artifactsTouched, criteria, plus prose sections Context / Negotiated trade-offs / Approval.
- Each criterion has id / dimension / description / weight / passThreshold. Schema-conformant.

## Overall judgment

Two FAIL dimensions (spec_fidelity, implementation_correctness) and two more dimensions with FAIL findings (edge_case_coverage, structural_integrity). The contract is well-organized and most criteria are binary-evaluable, but CRIT-S5-004 and CRIT-S5-005 have passThresholds that are weaker than the spec they claim to gate, and trade-off §5 imports unrelated tech debt into the Sprint 5 gate.

Severity counts: 0 critical / 3 high / 3 medium / 0 low. Overall verdict: **FAIL**.
