# Sprint 5 Contract Review — Adversary Notes (negotiation round 1, iter 2)

**Feature**: `ui-feed-list-actions`
**Contract**: `.vcsdd/features/ui-feed-list-actions/contracts/sprint-5.md`
**Contract digest**: `98ecbe6aed1f9375431bfbee2afcab53116a275c3424656fbf45b78b80277302`
**Overall verdict**: **FAIL** (4 of 5 dimensions FAIL — spec_fidelity, edge_case_coverage, structural_integrity, verification_readiness; 1 PASS — implementation_correctness)

## Scope acknowledgement (NOT re-litigated)

Per the prompt instructions and Phase 1c PASS at iter-3 with explicit human approval:

- **Group A/B Rust handler scope split** (9 of 16 dispatches deferred) — accepted as design.
- **Sprint 5 known constraint** (block edits do NOT persist to Rust during Sprint 5) — accepted.
- **Best-effort dispatch chain** (try/catch wrapping all Group B invokes) — accepted.

The findings below are **strictly about contract integrity** — places where the contract's `passThreshold` claims more verification coverage than the cited tests actually deliver, OR where contract claims rely on artefacts not in the manifest.

## Findings summary

| ID | Dimension | Severity | One-line |
|----|-----------|----------|----------|
| FIND-S5-CONTRACT-001 | spec_fidelity | high | CRIT-201 PROP-FEED-S5-005 test verifies handler synchronicity only; cross-event ordering + 5-arm coverage absent |
| FIND-S5-CONTRACT-002 | spec_fidelity | high | CRIT-203 PROP-FEED-S5-011 scenario (d) is a tautological no-op `expect(true).toBe(true)` |
| FIND-S5-CONTRACT-003 | edge_case_coverage | high | CRIT-207 / EC-FEED-018 PROP-FEED-S5-018 asserts opposite of spec; promised FeedList-level test not in manifest |
| FIND-S5-CONTRACT-004 | structural_integrity | medium | CRIT-200 DOM portion of PROP-FEED-S5-002 references main-route.dom.vitest.ts not in manifest |
| FIND-S5-CONTRACT-005 | verification_readiness | high | Contract passes mechanical Phase 3 evaluation but does not entail satisfying spec REQs (composite of 001/002/003) |

## Dimension verdicts

### spec_fidelity — FAIL

The CRIT/REQ mapping is structurally complete (CRIT-200..207 cover REQ-FEED-028..033 + EC-FEED-016 S5 amendment + EC-FEED-018..020). However two `passThreshold` clauses depend on PROPs whose test implementations are weaker than verification-architecture.md §14 specifies (FIND-001, FIND-002).

### edge_case_coverage — FAIL

EC-FEED-019 (PROP-FEED-S5-019, double-click race) and EC-FEED-020 (PROP-FEED-S5-020, late-mount handler) are correctly bound by CRIT-207 and the cited test files (`FeedRow.dom.vitest.ts`, `feed-list-editing-channel.dom.vitest.ts`). EC-FEED-018 (PROP-FEED-S5-018, filter excludes editingNoteId) fails: the test in `feed-row-block-embed.dom.vitest.ts` asserts the OPPOSITE of the spec at the row level and explicitly delegates to a FeedList-level test that is not present in the manifest (FIND-003).

### implementation_correctness — PASS

The redLines and CRITs are traceable to actual code obligations in the implementation:

- `createBlockEditorAdapter.ts` contains exactly 16 invoke sites with the correct command names and `issuedAt` payload field on every dispatch.
- `editingSessionChannel.ts` contains the single centralized `listen('editing_session_state_changed', ...)`, is INBOUND-only, and the handler is synchronous (no `await` / `setTimeout` / `queueMicrotask`).
- `FeedRow.svelte` correctly implements the 2x2 truth table (`shouldMountBlocks` derived), the fallback restart conditions (i)/(ii)/(iii) including the `lastBlocksWasNonEmpty` reset, and the best-effort try/catch dispatch chain.
- The Sprint-4 baseline tag `vcsdd/ui-feed-list-actions/sprint-4-baseline` (commit `d30ab13`) exists and is referenced by the audit script.
- The grep audit script encodes PROP-FEED-S5-001/003/004/012/013/014/015/017/021 as executable bash with proper exit codes.

The Group A/B split is documented in the adapter source and in `REQ-FEED-030 §Sprint 5 Rust handler scope split`, traceable end-to-end.

### structural_integrity — FAIL

The contract is largely self-contained, but CRIT-200's passThreshold names a DOM-test artefact (`main-route.dom.vitest.ts` Sprint 5 extension) that is not in the manifest's tests array (FIND-004). CRIT-205's classification under `verification_readiness` instead of `structural_integrity`/boundary is a minor concern not separately filed.

### verification_readiness — FAIL

While each criterion's `passThreshold` is expressible as a concrete command (grep / wc / diff / vitest test name / git diff exit code), CRIT-201 and CRIT-203 are bound to PROP-FEED-S5-005 and PROP-FEED-S5-011 whose actual tests do not verify the properties the contract description and verification-architecture.md §14 promise. Phase 3 will mechanically observe "PROP PASS" while the underlying behaviour (cross-event ordering, restart-condition (iii)) is not exercised. This is the composite finding FIND-005, which argues the contract as written **cannot bind Phase 3 to spec satisfaction**.

## What's strong about this contract

- **redLines section is excellent**: 7 specific, executable invariants with PROP back-references. The Sprint-4 baseline tag pin (commit `d30ab13`) is a model for cross-sprint regression protection.
- **Adversary calibration notes** at the end of the contract pre-empt obvious mis-criticisms (Group B reject is expected, two state slices are by design, etc.). This is good adversary-process design.
- **CRIT-202 / CRIT-205 / CRIT-206** are well-bound: the implementation_correctness checks are traceable to specific PROP IDs with concrete grep / type / DOM evidence.
- **Mode of execution is clear**: `scripts/sprint-5-grep-audit.sh` is a single-file source-of-truth for the static-grep half of the gate, runnable by humans and CI alike.

## What needs fixing before this contract can bind Phase 3

The contract should not be approved as-is. Suggested resolution path (preferred order):

1. **Tighten PROP-FEED-S5-011 scenario (d)**: extract a pure helper `shouldRestartFallback(prevWasNonEmpty, currentAbsent, fallbackAppliedFor, currentNoteId): boolean` and unit-test the four-condition truth table. This avoids the Svelte 5 prop-mutation limitation and provides genuine restart-condition (iii) coverage. **Updates FIND-002.**
2. **Tighten PROP-FEED-S5-005**: add `vi.spyOn(feedReducer)` + dual-event emit + at least one Editing/Switching parameterization. **Updates FIND-001.**
3. **Add a FeedList-level Sprint 5 DOM test** that exercises EC-FEED-018 (filter→unmount→re-visible→cache restore) and add it to the manifest. **Updates FIND-003.**
4. **Add `main-route.dom.vitest.ts` to the manifest** (or amend CRIT-200 passThreshold to remove the DOM clause). **Updates FIND-004.**

After (1)-(4), FIND-005 (composite) auto-resolves.

If the team prefers option (B) for any of the above (acknowledge the gap in the contract text rather than expand the test), the contract should explicitly say so in the criterion's `passThreshold` so Phase 3 doesn't over-credit the gate.

## Out-of-scope reminders (per prompt)

The following were considered and **not** flagged as findings:
- Group A/B Rust handler scope split — pre-approved at Phase 1c gate.
- `editingSessionState` and `viewState` as two separate state slices — pre-approved.
- `fallbackAppliedFor` per-row state — pre-approved.
- Sprint 5 not modifying editor.rs / feed.rs — pre-approved (PROP-FEED-S5-013).
- Block edits not persisting to Rust during Sprint 5 — pre-approved scope constraint.
