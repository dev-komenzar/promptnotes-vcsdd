# Spec Review Verdict — handle-save-failure (Phase 1c, sprint-2, iter 1)

**Sprint**: 2
**Iteration**: 1
**Overall**: PASS
**Mode**: lean
**Reviewer**: fresh-context vcsdd-adversary
**Date**: 2026-05-08
**Scope**: block-based domain type migration (`pendingNextNoteId` → `pendingNextFocus`, new `EditingState.focusedBlockId`)

## Per-dimension verdict

| Dimension              | Verdict | Notes                                                                                                                                                                                                                                                                                                                                                                                                  |
|------------------------|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| spec_fidelity          | PASS    | All semantic content uses `pendingNextFocus`. Remaining `pendingNextNoteId` mentions are confined to Revision-3 migration tables (behavioral-spec.md §Revision History; verification-architecture.md §Revision History). SoT header line numbers verified exact: states.ts 14–17 / 35–45 / 59–64 / 70–75 / 93–149; workflows.ts 138–144; errors.ts 58–62. REQ-HSF-004 AC threads `focusedBlockId === state.pendingNextFocus.blockId`; REQ-HSF-005 AC sets `focusedBlockId: null` (Option A). |
| structural_integrity   | PASS    | Coverage matrix maps every REQ-HSF-001..012 to ≥1 PROP. Total PROP count 22 (PROP-HSF-001..022). PROP-HSF-022 added for blockId-threading invariant. Purity Boundary Map / Port Contracts updated coherently to the new types. No orphan PROPs.                                                                                                                                                          |
| test_strength          | PASS    | PROP-HSF-022 (new) pins `discard(s, now).focusedBlockId === s.pendingNextFocus.blockId` (Tier 2 example + fast-check). PROP-HSF-006/-007 enumerate **all 7** `EditingState` fields. PROP-HSF-008 non-leak now also checks the constituent `blockId` key. PROP-HSF-004 includes `focusedBlockId === null` for cancel-switch.                                                                              |
| adversarial_calibration| PASS    | No "all six"/"all 6" remaining in semantic AC text (only inside Revision-2 history row, which is correct historiography). REQ-HSF-006 detail string updated to `'cancel-switch requires pendingNextFocus'`. Open Question §1 (no `CancelSwitchRequested` event) preserved with its fallback contract. PROP-HSF-008 leak surface widened to include `blockId`.                                            |
| scope_discipline       | PASS    | Spec did NOT widen `SaveFailedState` with `currentFocusedBlockId`. REQ-HSF-005 explicitly documents Option A and cites states.ts L70–75 as authoritative. Migration stayed on the rename + new-field surface; no incidental scope creep.                                                                                                                                                                |

## Severity totals (sprint-2 iter 1)

- critical = **0**
- major    = **0**
- minor    = **1** (parked; non-blocking; pre-existing from sprint-1)
- total    = **1**

## Cross-check vs SoT (verified by re-reading the source files in this session)

| SoT artifact (file:line)                                          | Spec claim                                                       | Match |
|-------------------------------------------------------------------|------------------------------------------------------------------|-------|
| `docs/domain/code/ts/src/capture/states.ts:14-17`                 | `PendingNextFocus = { noteId, blockId }`                          | ✓     |
| `docs/domain/code/ts/src/capture/states.ts:35-45`                 | `EditingState` has 7 fields incl. `focusedBlockId: BlockId\|null` | ✓     |
| `docs/domain/code/ts/src/capture/states.ts:59-64`                 | `SwitchingState.pendingNextFocus: PendingNextFocus`               | ✓     |
| `docs/domain/code/ts/src/capture/states.ts:70-75`                 | `SaveFailedState.pendingNextFocus: PendingNextFocus \| null`      | ✓     |
| `docs/domain/code/ts/src/capture/states.ts:93-149`                | `EditingSessionTransitions` interface (incl. discard L144, cancelSwitch L147 doc comments) | ✓ |
| `docs/domain/code/ts/src/capture/workflows.ts:138-144`            | `HandleSaveFailure = (deps) => (stage, state, decision) => …`     | ✓     |
| `docs/domain/code/ts/src/shared/errors.ts:58-62`                  | `SwitchError.pendingNextFocus: { noteId, blockId }`               | ✓     |
| `docs/domain/aggregates.md:367`                                   | `save-failed | CancelSwitch | editing(currentNoteId, focusedBlockId)` row | ✓ |
| `docs/domain/aggregates.md:366`                                   | `save-failed | DiscardCurrentSession | editing(pendingNextFocus) or idle` row | ✓ |

## Decision

PASS. The block-migration delta has been absorbed exactly:

- Type renames are propagated through every binding requirement and proof obligation.
- The new `focusedBlockId` field is correctly threaded on the discard-with-pending path (= `state.pendingNextFocus.blockId`) and explicitly set to `null` on the cancel-switch path under documented Option A.
- AC field counts moved from 6 to 7 in REQ-HSF-004/005; the verbal "all seven" claim now matches the actual field enumeration.
- PROP-HSF-022 closes the new invariant gap. PROP-HSF-008 was updated to assert the additional `blockId` non-leak surface.
- No accidental `SaveFailedState` widening; Option A is the chosen, documented stance.

Proceed to Phase 2a (Test Generation — Red) for sprint-2.

See `findings.md` for the single parked minor finding (carried over from sprint-1; non-blocking for this gate).
