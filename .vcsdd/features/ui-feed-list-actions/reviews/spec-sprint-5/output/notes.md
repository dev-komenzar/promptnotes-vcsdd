# Sprint 5 Spec Review (Iteration 1) — Adversary Notes

**Reviewer**: VCSDD Adversary (fresh context)
**Date**: 2026-05-10
**Scope**: REQ-FEED-028..033 + EC-FEED-016 (Sprint 5) + EC-FEED-018..020 + §14 Sprint 5 Verification Extensions (PROP-FEED-S5-001..015)

## Overall verdict: FAIL (both dimensions)

## spec_fidelity findings (FAIL)

The Sprint 5 spec captures the high-level migration intent and traces back to `block-based-ui-spec-migration.md` Step 2. However, several internal contracts are under-specified, mutually inconsistent, or ambiguous in ways that will be ambiguous to Phase 2a/2b implementers and to the Phase 3 adversary.

Key issues:

1. **5-arm payload contract is asserted but never enumerated for non-`Editing` arms** (FIND-S5-SPEC-001). REQ-FEED-029 says the payload is "REQ-FEED-024 Sprint 4 amendment と同一 (`EditingSessionStateDto` 5-arm)" but Sprint 4 amendment only defined the `Editing` arm wire shape. `Idle | Saving | Switching | SaveFailed` rehydration shapes are not pinned anywhere in this feature. Migrating a subscriber for those arms without a pinned shape is unsafe.

2. **Two state sources (`viewState.editingStatus` from `feedReducer` vs `editingSessionState.kind` from new channel) are never reconciled** (FIND-S5-SPEC-002). REQ-FEED-030 EARS gates BlockElement mount on `viewState.editingStatus` but the new state from `editing_session_state_changed` lives outside `feedReducer`. The relationship/source-of-truth and divergence behaviour are unspecified.

3. **REQ-FEED-030 AC does not exhaustively cover the (editingStatus, editingNoteId) cross-product** (FIND-S5-SPEC-003). EARS guards on both, but the AC mounts/unmount checks only one variable at a time. The case `editingNoteId === self.noteId AND editingStatus === 'idle'` has no AC.

4. **REQ-FEED-031 fallback idempotency is asserted in AC and PROP but no state-ownership mechanism is required** (FIND-S5-SPEC-004). "fallback が 2 回連続発火しない" is a behavioural claim that needs either a pure predicate, a persistent generated-id store, or an explicit AC about FeedRow `$state` lifecycle. Spec leaves "二度目" undefined: same `editingNoteId`, same FeedRow instance, second `editing_session_state_changed` with same absent `blocks` → does fallback re-fire?

5. **EC-FEED-016 in REQ-FEED-024 (lines 695) still describes EditorPane-side fallback** (FIND-S5-SPEC-005). The Sprint 5 amendment supersession is noted in lines 917 and 1120 but the original Sprint 4 EC-FEED-016 prose was not amended in-place, leaving live contradictory text in the same spec.

6. **Cross-feature contract gap with ui-block-editor REQ-BE-002b: `dispatchFocusBlock` for a client-generated UUID** (FIND-S5-SPEC-006). REQ-FEED-031 line 1048 mandates `dispatchFocusBlock({ noteId, blockId })` immediately after fallback, with `blockId` being a UUID the UI invented. This block ID is **not present in Rust's note state**. ui-block-editor scope-out at lines 91-93 says Note Aggregate invariants are domain layer's job. The contract for what Rust does when `dispatchFocusBlock` arrives with an unknown `blockId` (note exists, block doesn't) is not in either spec. The Sprint 5 spec line 1053 asserts "Rust 側は `currentNoteId` mismatch で no-op" — but this is a `blockId` mismatch, not a `currentNoteId` mismatch.

7. **REQ-FEED-029 option (b) (per-row subscription) is allowed but cannot satisfy REQ-FEED-032 single-source semantics** (FIND-S5-SPEC-007). Sprint 5 spec admits both (a) centralized and (b) per-row subscription as compliant. But REQ-FEED-032 AC line 1073 talks about a single global `editingSessionState` arriving by the time `feedReducer.DomainSnapshotReceived` is processed. With option (b), there is no global state; per-row state is private and `feedReducer` (which owns `editingNoteId/editingStatus`) cannot read it. The "permitted" alternative is provably non-compliant with the downstream invariant.

8. **REQ-FEED-033 forbidden-identifier regex duplicates ui-block-editor REQ-BE-027 with subtly different scope, no delegation contract** (FIND-S5-SPEC-008). Sprint 5 spec adds `EditorPanel`, `editorStateChannel`, `tauriEditorAdapter` to the regex (which REQ-BE-027 does not), and restricts to `src/lib/feed/`, `+page.svelte`, `src/lib/block-editor/`. `src/lib/block-editor/` is also covered by REQ-BE-027 with a different identifier set. Two parallel regex audits over the same directory will drift. The Sprint 5 spec should either (a) defer to REQ-BE-027 for `src/lib/block-editor/` and remove that path from REQ-FEED-033, or (b) declare authoritative ownership.

## verification_readiness findings (FAIL)

The 15 new PROP-FEED-S5-XXX obligations are largely well-mapped to the new requirements, but several have executability or coverage problems that would make Phase 5 hardening trivial.

Key issues:

9. **PROP-FEED-S5-002 `getBoundingClientRect().height === 100vh` is not measurable in jsdom** (FIND-S5-SPEC-009). jsdom returns 0 for layout queries; the spec requires a runtime layout assertion that the chosen tooling cannot perform. Must be replaced by a CSS source assertion or inline-style assertion.

10. **PROP-FEED-S5-003 / S5-012 lack the rigour of S5-001/S5-004/S5-014** (FIND-S5-SPEC-010). S5-001/S5-004/S5-014 ship full executable grep commands. S5-003 ships a regex but no instructions for verifying singular vs multiple listener registration (REQ-FEED-029 prefers option (a)). S5-012 declares a constraint ("no `await`/`Promise.then`/`setTimeout`/`queueMicrotask` in the handler") but provides no executable command — it just refers to "PROP-FEED-S5-003 で識別された箇所". Tier 0 grep audits must be self-contained scripts.

11. **PROP-FEED-S5-005 timing assertion has no formalized mock-emit ordering protocol** (FIND-S5-SPEC-011). The PROP description doesn't specify how the mock emitter sequences `editing_session_state_changed → feed_state_changed`, what `await`/`flushSync` boundary is checked, or what the integration test does to expose a potential async update bug. Trivially passable.

12. **PROP-FEED-S5-013 is purely a Sprint 4 regression check** (FIND-S5-SPEC-012). It does not introduce new evidence. If `wire_audit.sh` was a no-op artifact in Sprint 4 (it wasn't required to change in Sprint 5), then PROP-FEED-S5-013 contributes zero new verification. Sprint 5 needs a positive byte-/golden-comparison or a `git diff --quiet` style assertion against Sprint 4 baseline for `editor.rs::make_editing_state_changed_payload` and `feed.rs::select_past_note`.

13. **`createBlockEditorAdapter` factory has no PROP-FEED-S5-XXX verifying the 16-dispatch wiring** (FIND-S5-SPEC-013). Test Strategy line 746 lists the new file but no PROP asserts that the produced adapter satisfies REQ-BE-026's 16-method contract or that each method actually `invoke`s a distinct Tauri channel. PROP-FEED-S5-008 only checks one method via mock adapter — the production wiring is untested at Sprint 5 scope.

14. **EC-FEED-018, EC-FEED-019, EC-FEED-020 have no PROP coverage** (FIND-S5-SPEC-014). Three new edge cases in the catalog map to zero PROP-FEED-S5 obligations. Strict mode requires every documented edge case to be verifiable.

15. **`editingSessionChannel.ts` is added to Purity Boundary Map as INBOUND-only but no PROP enforces the boundary** (FIND-S5-SPEC-015). Analogous to PROP-FEED-032's `grep "invoke" feedStateChannel.ts` zero-hit gate, Sprint 5 needs `grep "invoke(" editingSessionChannel.ts` zero-hit. Without this, the new module can drift into bidirectional behaviour and break the OUTBOUND/INBOUND separation the architecture relies on.

16. **PROP-FEED-S5-009 has two test-path designations (property + example) without canonical resolution** (FIND-S5-SPEC-016). Coverage Matrix lists it under Tier 2 fast-check, but Test Strategy lists both `feedRowPredicates.property.test.ts` AND `feedRowPredicates.test.ts` (vitest example) for the same PROP. Phase 2a implementer needs guidance on which is canonical (the convention elsewhere is one PROP → one canonical test file, with examples appearing in the unit test).

## Cross-feature consistency check (per manifest)

I cross-checked claims against `ui-block-editor` behavioural spec REQ-BE-001..027:

- REQ-FEED-030 references REQ-BE-001..010, REQ-BE-013/014, REQ-BE-015/016, REQ-BE-026 — all are real and the references are consistent.
- The `BlockEditorAdapter` 16-method contract is correctly enumerated by REQ-BE-026 lines 689-707 — Sprint 5 spec does not redefine these primitives (correct).
- REQ-BE-002b dispatch contract (`focusBlock` from `focusin`/`click`) is consistent with REQ-FEED-031's `dispatchFocusBlock` invocation, modulo the noted unknown-blockId gap (FIND-S5-SPEC-006).

## Migration doc consistency check

`docs/tasks/block-based-ui-spec-migration.md` Step 2 lists 4 bullets:
1. REQ-FEED-023 全面書き換え → covered by REQ-FEED-028 (PASS)
2. `editing_session_state_changed` IPC 再配線 → covered by REQ-FEED-029 (PASS, but see FIND-S5-SPEC-001)
3. EC-FEED-016 再定義 → covered by REQ-FEED-031 (PASS, but see FIND-S5-SPEC-005)
4. `FeedViewState` 見直し → only superficially covered (no Sprint 5 REQ explicitly redefines `editingStatus` semantics for in-place model; spec says "意味の再定義" but the Sprint 5 REQs do not enumerate the new semantics — see FIND-S5-SPEC-002)

## Recommendation

Both dimensions FAIL. The spec needs another iteration to:
- Pin the 5-arm payload wire shape (or formally delegate to ui-editor IPC contract with explicit reference)
- Reconcile the dual state sources (`feedReducer` mirror vs `editingSessionState` channel)
- Specify the unknown-blockId contract with Rust capture state for client-generated UUIDs
- Add PROPs for EC-FEED-018/019/020 and the `editingSessionChannel.ts` boundary
- Fix the jsdom-incompatible PROP-FEED-S5-002 layout assertion
- Provide executable grep commands for all Tier 0 PROPs
- Decide canonical test path for PROP-FEED-S5-009
