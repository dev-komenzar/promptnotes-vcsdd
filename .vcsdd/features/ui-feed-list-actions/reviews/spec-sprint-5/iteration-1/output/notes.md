# Sprint 5 spec review — fresh-context adversary notes

Reviewer: adversary (zero Builder context)
Scope: REQ-FEED-028, REQ-FEED-029, EC-FEED-016 Sprint 5 amendment, REQ-FEED-022 Sprint 5 amendment, and PROP-FEED-S5-001..005.
Verdict: FAIL on both dimensions (spec_fidelity, verification_readiness).

## Artifacts read

- `.vcsdd/features/ui-feed-list-actions/reviews/spec-sprint-5/iteration-1/input/manifest.json` (entirety)
- `behavioral-spec.md` — full structural read of front matter (lines 1-71), Sprint 4 amendments touching REQ-FEED-009/EC-FEED-016 (lines 247-282, 696, 472), REQ-FEED-022 original wire contract (lines 591-609), REQ-FEED-024 Sprint 4 amendment (lines 640-697), REQ-FEED-025 (lines 708-789), REQ-FEED-026 (lines 793-836), REQ-FEED-027 (lines 838-883), Sprint 5 section (lines 903-996).
- `verification-architecture.md` — front matter (lines 1-50), Sprint 4 §13 (lines 605-676), Sprint 5 §14 (lines 679-745).
- `promptnotes/src/lib/domain/app-startup/initialize-capture.ts` (entirety, 155 lines)
- `promptnotes/src-tauri/src/feed.rs` lines 1-208 and 370-450 (DTO definitions, idle_editing helper, scan_vault_feed, feed_initial_state)
- `promptnotes/src-tauri/src/editor.rs` lines 1-80 (PendingNextFocusDto, BlockTypeDto definitions)
- `docs/domain/workflows.md` lines 1-30 (Workflow 1 AppStartup table row)
- `docs/domain/code/ts/src/lib/domain/app-startup/initialize-capture.ts` — **File does not exist** (negative read result, confirming FIND-S5-SPEC-001)

## What I considered and rejected as findings

- **Block-DTO vs body-DTO contradiction (Sprint 4 vs Sprint 5):** The Sprint 5 rationale (line 907, 909) explicitly states "Sprint 4 で確立した block-aware DTO は…廃止済み" and "Sprint 5 は `body: string` ベースの DTO を前提に進行する". Reading the Sprint 4 amendments for REQ-FEED-024/025/026/027, those amendments are framed as "block-aware migration" that has since been reverted. The reversion is contextually documented in the rationale, and the existing Rust DTOs (`EditingSubDto` at feed.rs:47, `NoteRowMetadataDto` at feed.rs:77 with `body: String` field) confirm body is a String. I considered raising this as a contradiction but the Sprint 5 prose is internally consistent: REQ-FEED-028 step 5 (`body: ""`) and EC-FEED-016 Sprint 5 amendment (`body: ""` entry in note_metadata) both use the string field. The Sprint 4 ACs that reference `blocks` arrays remain in the spec, but Sprint 5 prose deprecates them implicitly. This is a structural mess that a Phase 4 spec consolidation pass should clean up, but it does not block Sprint 5 implementation if the implementer reads the rationale first. **No finding raised** — but flagged as latent risk.

- **Acceptance Criteria line 945 ("feedReducer の DomainSnapshotReceived アクションが editingNoteId を新規 ID に設定する"):** The TS `feedReducer` already does this for `EditingStateChanged` cause (it mirrors `editing.currentNoteId` to `editingNoteId`). For `InitialLoad` cause the current reducer code likely also mirrors it (no special-casing). I did not read `feedReducer.ts` to verify — that is a Phase 3 implementation review concern, not a spec gap. **No finding raised.**

- **REQ-FEED-029 EARS clause ("CodeMirror エディタを即座にマウントし、フォーカスを与えなければならない"):** This is a behavior claim on a component owned by the `note-body-editor` feature, not `ui-feed-list-actions`. The traceability cross-references that feature's `FeedRow.svelte` `{#if editingNoteId === noteId}` logic at line 960, 973. The spec is integrating across feature boundaries, which is appropriate for a sprint that connects two features. However, the "focus" AC at line 964 (`document.activeElement` verification) requires CodeMirror to call `view.focus()` on mount — a behavior owned by the editor component, not this spec. The cross-feature contract is implicit and not stated as a separate REQ. Borderline — could be a finding, but the cross-reference at line 960 is enough to put the implementer on the right path. **No finding raised** — but adjacent to FIND-S5-SPEC-005.

## Per-finding justification (FAIL rationale)

### Spec fidelity dimension (FAIL — 7 findings)

- **FIND-S5-SPEC-001 (high):** Traceability paths pointing to non-existent files is a process-level failure of the spec. Phase 5 verification requires actually opening these files to compare TS canonical vs. Rust port. Dead paths break that gate. Verified by direct Read of both the dead path and the live path.

- **FIND-S5-SPEC-002 (high):** This is the most important spec-fidelity gap. The existing Rust state uses full file paths as note_ids in the wire snapshot (`scan_vault_feed` at feed.rs:399). REQ-FEED-028 introduces a stem-based ID for the new note and a stem-based existing-ID set for collision check, but does not explain how these two namespaces coexist in the published snapshot. The implementer cannot read the spec and produce a single coherent design without making unwritten choices.

- **FIND-S5-SPEC-003 (high):** The unconditional "create new note on every call" semantics is destructive. The TS reference (`initializeCaptureSession`, used in workflows.md Workflow 1 'startup-only') does not have this problem because it is scoped to a single startup pipeline. Porting to Rust without preserving the scope is a real defect — the new Rust handler could be called repeatedly by adapter retries, AppShell remounts, dev hot-reload, etc. The spec does not enumerate call sites and does not require idempotency.

- **FIND-S5-SPEC-004 (medium):** EC-FEED-016 amendments stack carelessly. The Sprint 5 amendment overreaches by claiming the orphan-editingNoteId case is universally unreachable — but the Sprint 4 amendment's `select_past_note` race condition still exists. Aggregate by amendment: easy to mis-read.

- **FIND-S5-SPEC-005 (medium):** Manifest claims PN-knv coverage but spec explicitly defers the ctrl+N keybinding. Inconsistency between manifest and spec.

- **FIND-S5-SPEC-006 (medium):** REQ-FEED-022 line 603 ("empty vault returns visibleNoteIds = []") is directly contradicted by REQ-FEED-028 line 940 ("visible_note_ids.len() == 1"). The Sprint 5 amendment at line 985-987 acknowledges that `editing.status` changes but does not retire or strike-through the contradictory AC on `visibleNoteIds = []`. The Sprint 4 amendment convention (lines 264-267) uses HTML comment markup `<!-- OLD: ... -->` for retired ACs; Sprint 5 does not. Two ACs in the spec say opposite things.

- **FIND-S5-SPEC-011 (medium):** Vault scan semantics (case, recursion, symlinks, dot-files) are under-specified. The spec inherits but does not restate REQ-FEED-022's `non-recursive` rule.

### Verification readiness dimension (FAIL — 4 findings)

- **FIND-S5-SPEC-007 (high):** PROP-FEED-S5-005 (TS/Rust parity) is the defining cross-language contract and is the only obligation that catches Rust port divergence from the TS canonical algorithm. Marking it `required: false` with one snapshot pair is unsupported. Compare with PROP-FEED-S4-016 which is the analogous Sprint 4 parity obligation marked `required: true`. The downgrade in Sprint 5 has no rationale.

- **FIND-S5-SPEC-008 (medium):** PROP-FEED-S5-003 regex `^\d{4}-...` is incompatible with the `i64` type signature for `now_ms`. proptest with `any::<i64>()` strategy will fail on legitimate inputs (negative or year-10000+ epochMillis). Either constrain the input range or widen the regex.

- **FIND-S5-SPEC-009 (medium):** PROP-FEED-S5-002 non-collision has no termination argument and no bound on `existing` set size. Proptest could generate pathological HashSets that cause the helper loop to non-terminate.

- **FIND-S5-SPEC-010 (medium):** PROP-FEED-S5-004 integration test fixture is unspecified (no tempdir contract, no Clock injection mechanism, no seeded-file format). The spec demands "fixed Clock" but does not introduce a Clock abstraction. The collision test (line 942 "Clock 固定 + 既存 ID 1 件") is operationally undefined for an impure shell function that calls `SystemTime::now()` directly.

## Cross-cutting concern: amendment hygiene

The spec accumulates amendments by appending sections (Sprint 2, 3, 4, 5) without updating the original REQ text. Sprint 4 used strikethrough markup `<!-- OLD: ... -->` for retired ACs (e.g., lines 264-267). Sprint 5 abandons this convention. This is not itself a finding but is the root cause of FIND-S5-SPEC-006 (contradictory ACs surviving in the spec). Recommendation for Sprint 6+: adopt the strikethrough convention for *every* AC that is retired by a later amendment, and add a "Superseded by" annotation. Without this, the spec is asymptotically unreadable.

## What would flip these verdicts to PASS

For spec_fidelity:
1. Fix the dead traceability paths (FIND-001) — trivial 5-line edit.
2. Explicitly resolve the stem-vs-path namespace question (FIND-002) — requires either a Rust refactor decision in the spec or a clear documentation of asymmetry.
3. Specify call-site discipline for `feed_initial_state` (FIND-003) — either idempotency or single-call-per-mount.
4. Strike out contradictory REQ-FEED-022 ACs (FIND-006) — trivial edit.
5. Tighten EC-FEED-016 Sprint 5 amendment scope (FIND-004) — one sentence change.
6. Resolve PN-knv coverage claim (FIND-005) — either drop from manifest or add REQ-FEED-030.
7. Specify vault scan semantics (FIND-011) — short bullet list.

For verification_readiness:
1. Mark PROP-FEED-S5-005 as `required: true` and expand snapshot matrix (FIND-007).
2. Either bound `now_ms` range or widen the regex (FIND-008).
3. Add a termination argument or bound on `existing.len()` (FIND-009).
4. Specify the integration test fixture (FIND-010), including Clock injection if needed.

None of the findings is on its own a "critical" severity — but the cumulative effect of 11 findings on a ~94-line spec patch is FAIL on both dimensions per the calibration rules. The medium-severity floor in strict mode is `FAIL` for the affected dimension. There are 3 high-severity findings, all of which independently mandate FAIL.

## Anti-leniency self-check

- I did not write "overall the spec is reasonable but" — the spec has structural problems (FIND-002, FIND-003) that an implementer cannot resolve unilaterally.
- I did not classify any finding as "minor" — every finding is graded against the strict mode calibration table.
- I cited line numbers and verified citations via Read.
- One finding (FIND-001) was verified by *attempting* to read the cited path and getting "File does not exist".
- I considered Sprint 4 vs Sprint 5 contradictions on the block-DTO front and chose not to raise a finding because the rationale at line 907/909 explicitly retires the Sprint 4 block-DTO scope. This is the kind of "explicit deferral with named justification" the calibration rules permit.
