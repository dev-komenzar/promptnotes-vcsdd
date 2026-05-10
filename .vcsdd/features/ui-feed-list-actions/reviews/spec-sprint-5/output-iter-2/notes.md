# Sprint 5 Spec Review — Iteration 2 Notes

**Reviewer**: VCSDD Adversary (fresh context, no Builder history)
**Scope**: Re-verify resolution of all 16 iter-1 findings AND search for new issues introduced by iter-2 corrections.

---

## Iter-1 → Iter-2 Resolution Verification (16/16 resolved)

### spec_fidelity dimension

| Iter-1 finding | Resolution check | Verdict |
|---|---|---|
| FIND-S5-SPEC-001 (5-arm DTO wire shape) | Behavioral-spec L965-977 now contains the explicit 5-arm table with `status` discriminator, required/optional fields, and TS rehydration 規約 citing `docs/domain/code/ts/src/capture/states.ts` and `editor.rs` as source of truth. Migration doc参照禁止 problem also resolved. | RESOLVED |
| FIND-S5-SPEC-002 (state source-of-truth) | L1009-1027 contains the State source-of-truth table (viewState mount-gate vs editingSessionState data-source) and the 4-row 矛盾解決規約 (cache + fallback). | RESOLVED |
| FIND-S5-SPEC-003 (2x2 truth table) | L1029-1038 contains the explicit 4-cell truth table over (editingStatus, editingNoteId === self.noteId), and PROP-FEED-S5-006 covers all 4 cells. (See however FIND-S5-SPEC-iter2-007 for residual ambiguity.) | RESOLVED (with new minor issue) |
| FIND-S5-SPEC-004 (fallback state ownership) | L1117-1130 declares `fallbackAppliedFor` per-row $state with explicit start condition, idempotency rule, reset rule. (See however FIND-S5-SPEC-iter2-005 for an idempotency loophole.) | RESOLVED (with new medium issue) |
| FIND-S5-SPEC-005 (EC-FEED-016 contradictory text at L695) | L695 now contains strikethrough markdown `~~EditorPane receives focusedBlockId: null...~~` and an explicit Sprint 5 supersession note pointing to REQ-FEED-031. | RESOLVED |
| FIND-S5-SPEC-006 (critical: unknown blockId) | REQ-FEED-031 (L1101) now mandates `dispatchInsertBlockAtBeginning` BEFORE `dispatchFocusBlock`, eliminating the "focus to unknown blockId" violation. (See however FIND-S5-SPEC-iter2-003 for a critical residual gap: Rust handler existence is not verified.) | RESOLVED at TS layer; CRITICAL gap at cross-feature layer |
| FIND-S5-SPEC-007 (option (b) per-row sub) | REQ-FEED-029 L957 explicitly forbids per-row listen, mandates centralized subscription. PROP-FEED-S5-003 enforces `wc -l == 1` for the listen registration count. | RESOLVED |
| FIND-S5-SPEC-008 (REQ-FEED-033 delegation) | L1190-1195 contains the Cross-feature delegation note explicitly enumerating REQ-BE-027's identifier set vs REQ-FEED-033's set, noting the only overlap is `EditorIpcAdapter`. | RESOLVED |

### verification_readiness dimension

| Iter-1 finding | Resolution check | Verdict |
|---|---|---|
| FIND-S5-SPEC-009 (jsdom layout) | PROP-FEED-S5-002 L706 now uses (a) grep on +page.svelte source for `height: 100vh`, (b) DOM existence check; explicitly removes `getBoundingClientRect`. | RESOLVED |
| FIND-S5-SPEC-010 (executable commands for S5-003/S5-012) | PROP-FEED-S5-003 L707 has self-contained `[ "$(grep ... | wc -l)" -eq 1 ]` enforcing exactly 1 listener. PROP-FEED-S5-012 L716 has self-contained `awk` range + grep command. (awk range pattern is fragile but acceptable as Tier 0; over-capture direction is safe.) | RESOLVED |
| FIND-S5-SPEC-011 (mock-emit protocol) | PROP-FEED-S5-005 L709 specifies sync mockEmit ordering, observation inside feed_state_changed handler, and cross-references S5-012 for handler async-free check. (See however FIND-S5-SPEC-iter2-006 for ambiguity on observation point.) | RESOLVED (with new medium issue) |
| FIND-S5-SPEC-012 (S5-013 zero new evidence) | PROP-FEED-S5-013 L717 replaced with positive `git diff <baseline>..HEAD` check on emit lines. (See however FIND-S5-SPEC-iter2-002 for baseline tag/rev ambiguity.) | RESOLVED (with new medium issue) |
| FIND-S5-SPEC-013 (createBlockEditorAdapter PROPs) | PROP-FEED-S5-016 (tsc assignability) at L720 + PROP-FEED-S5-017 (16 invokes + name set diff) at L721 both added. REQ-FEED-030 contains the canonical 16-row Adapter command-mapping table. (See however FIND-S5-SPEC-iter2-001 for the issuedAt omission.) | RESOLVED at structural layer; HIGH gap on payload schema |
| FIND-S5-SPEC-014 (no PROPs for EC-FEED-018/019/020) | PROP-FEED-S5-018, S5-019, S5-020 added at L722-724. Coverage matrix L769-771 maps each EC explicitly. | RESOLVED |
| FIND-S5-SPEC-015 (boundary audit for editingSessionChannel.ts) | PROP-FEED-S5-021 L725 added (`invoke(` 0 hits + `@tauri-apps/api/core` 0 hits). Cross-reference at L697 corrected to point to PROP-FEED-S5-021. | RESOLVED |
| FIND-S5-SPEC-016 (S5-009 ambiguous test path) | PROP-FEED-S5-009 L713 now declares fast-check as the only canonical test path. Test Strategy table L736 lists only the property test file. | RESOLVED |

---

## NEW Issues Introduced by Iter-2 Corrections (7 findings)

The iter-2 corrections introduced or left unaddressed seven new issues that meet the bar for emission.

### Critical / High severity

**FIND-S5-SPEC-iter2-003 (CRITICAL, spec_fidelity)** — REQ-FEED-031's iter-2 fix to FIND-S5-SPEC-006 introduces `dispatchInsertBlockAtBeginning` to pre-register the synthetic block with Rust. But REQ-FEED-030 line 1078 explicitly disclaims Rust-side implementation, and NO Sprint 5 PROP verifies the Rust command `editor_insert_block_at_beginning` exists. If the Rust handler is missing, the dispatch rejects, the try/catch at L1152 swallows the error, and the user sees a degraded preview row — the same user-visible failure mode as the original FIND-S5-SPEC-006 bug. The fix is illusory unless cross-feature contract is pinned.

**FIND-S5-SPEC-iter2-001 (HIGH, spec_fidelity)** — REQ-FEED-030's new Adapter command-mapping table omits the `issuedAt` field that ui-block-editor REQ-BE-002b/REQ-BE-003 et al. mandate as part of every dispatch payload. PROP-FEED-S5-016 (tsc) WOULD catch a payload-shape mismatch, but only if the adapter is forced to choose between (a) accept-issuedAt-but-drop and (b) accept-issuedAt-and-forward. PROP-FEED-S5-017 (grep + name set diff) does not check payload schema at all, so silent drop slips past audit.

### Medium severity

**FIND-S5-SPEC-iter2-002 (MEDIUM, verification_readiness)** — PROP-FEED-S5-013's `<sprint-4-baseline-tag-or-rev>` placeholder + unverified example tag (`vcsdd/ui-feed-list-actions/sprint-4-complete`) leave Phase 5 free to substitute any rev (e.g., HEAD~1) and trivially pass. The "positive evidence" framing is only true if a deterministic baseline exists.

**FIND-S5-SPEC-iter2-005 (MEDIUM, spec_fidelity)** — REQ-FEED-031's idempotency rule (L1126-1128) does not handle the (undefined → non-empty → undefined) sequence. After server emits non-empty blocks (replacing the synthetic UUID), then re-emits undefined, the spec mandates reusing the original UUID — but Rust no longer knows about that UUID. The mounted BlockElement becomes a zombie that cannot receive focus or edits.

**FIND-S5-SPEC-iter2-006 (MEDIUM, verification_readiness)** — PROP-FEED-S5-005's "assert inside the feed_state_changed handler" is architecturally ambiguous. feedReducer is pure; the test must spy on the dispatcher to run the assert at the right point in the call stack. The PROP does not specify the spy mechanism, so Phase 2a writers may interpret "inside" loosely as "after" — which is exactly the weak observability iter-1 warned against. The PROP-FEED-S5-012 grep audit is a defense-in-depth backup but cannot substitute for the behavioral check.

### Low severity

**FIND-S5-SPEC-iter2-004 (LOW, verification_readiness)** — verification-architecture.md ends with an orphan dangling table row at line 784 (`| REQ-FEED-024 (S4) | PROP-FEED-S4-012, ...`) that belongs to the §13 Sprint 4 Coverage Matrix (which legitimately ends at line 678). Likely an iter-2 editing artifact.

**FIND-S5-SPEC-iter2-007 (LOW, spec_fidelity)** — REQ-FEED-030 truth table row 2 contains a parenthetical clarification (`(editingNoteId が null でも row は描画される)`) that contradicts the row's column predicate (`editingNoteId === self.noteId`). Combined with the L1038 note that this row is "practically unreachable", PROP-FEED-S5-006 cell 2 becomes a test of an architecturally impossible state without explicit guidance on how to legitimately construct it.

---

## Cross-Feature Consistency Check

I cross-checked REQ-BE-026 (16 dispatch methods) and REQ-BE-027 (forbidden identifiers) against the iter-2 changes:
- The 16 method names in REQ-FEED-030 §Adapter command-mapping match REQ-BE-026 exactly (set equivalence verified by reading both lists).
- REQ-FEED-033's Cross-feature delegation note correctly identifies `EditorIpcAdapter` as the single overlap with REQ-BE-027.
- HOWEVER: the payload column of REQ-FEED-030's mapping table omits `issuedAt`, contradicting REQ-BE-002b's prescribed call site signature. (See FIND-S5-SPEC-iter2-001.)

---

## Convergence Outlook

Iter-2 successfully resolved all 16 iter-1 findings at the surface level. However, the corrections introduced 7 new findings — 1 critical, 1 high, 3 medium, 2 low. The criticality of FIND-S5-SPEC-iter2-003 alone (Rust handler existence not verified) blocks PASS: it represents a silent production failure mode that the iter-2 fix to FIND-S5-SPEC-006 was supposed to eliminate but in fact merely relocated.

Recommendation: route to Phase 1c iteration 3 (last allowed iteration). Priority order for fixes:
1. FIND-S5-SPEC-iter2-003 (critical) — pin cross-feature Rust handler contract
2. FIND-S5-SPEC-iter2-001 (high) — resolve the issuedAt omission in Adapter command-mapping
3. FIND-S5-SPEC-iter2-002, 005, 006 (medium) — tighten baseline-tag, idempotency rule, observation mechanism
4. FIND-S5-SPEC-iter2-004, 007 (low) — clean up orphan table row, fix truth-table parenthetical

If iteration 3 also FAILs, escalate to human review per VCSDD strict-mode protocol.
