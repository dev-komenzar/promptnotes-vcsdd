# Phase 3 Sprint 5 Iteration 2 Adversarial Review Notes

## Iter-1 → Iter-2 fix verification

| Iter-1 Finding | Severity | Resolved? | Evidence |
|----|----|----|----|
| FIND-S5-PHASE3-001 (production wiring missing) | critical | YES | `+page.svelte` now imports `subscribeEditingSessionState` (line 21), `createBlockEditorAdapter` (line 23); instantiates adapter (line 31), holds editingSessionState in $state (line 32), wires subscriber in $effect with cleanup (lines 58-65), passes both as props to FeedList (lines 121-122). FeedList forwards both to each FeedRow (lines 403-404). End-to-end chain present. |
| FIND-S5-PHASE3-002 (test bypasses wiring) | critical | YES | New `main-route-wiring.dom.vitest.ts` (8 tests) asserts the wiring chain via source grep — exactly the alternative path explicitly granted in FIND-S5-PHASE3-002.expectedBehavior. |
| FIND-S5-PHASE3-003 (PROP-FEED-S5-019 not a real double-click) | high | YES (with caveat) | Test now performs 3 clicks: idle→click 1 dispatches, then remounts in switching state, click 2 NOT dispatched, click 3 NOT dispatched. Uses two separate adapters because FeedRow is a presentational component that doesn't drive its own state transitions. Functionally adequate verification of REQ-FEED-006 invariant. |
| FIND-S5-PHASE3-004 (REQ-FEED-031 step 5 wording) | medium | PARTIAL — see iter-2 finding 001 | EARS clause at line 1119 fixed; clarification block at 1121-1122 added; BUT the Acceptance Criteria enumeration at line 1173 STILL contains the OLD shape `{ noteId, newBlock: { id, block_type, content }, issuedAt }`. Spec self-contradicts within the same requirement. New finding: FIND-S5-PHASE3-iter2-001. |

## New issues introduced by iter-2 changes

None of the iter-2 changes introduced runtime regressions:
- The new `subscribeEditingSessionState` $effect has no reactive dependencies and runs once on mount; cleanup returns the unsubscribe function. Correct.
- The grep audit script (PROP-FEED-S5-003) still passes because +page.svelte uses the helper, not `listen(...)` directly — listener count remains 1 (in editingSessionChannel.ts).
- `subscribeEditingSessionState` and `createBlockEditorAdapter` are not on the forbidden-identifier list (PROP-FEED-S5-014), so the regression audit is unaffected.
- The PROP-FEED-S5-019 rewrite uses fresh mock adapters per mount, which is honest for the suppression invariant.

## Spec inconsistency — only remaining issue

Behavioral-spec.md REQ-FEED-031:
- Line 1119 (EARS): `{ noteId, type: 'paragraph', content: '', issuedAt }` ← correct
- Line 1121-1122 (clarification block): explicitly says new shape ← correct
- Line 1173 (Acceptance Criteria step 1): `{ noteId, newBlock: { id: <UUID>, block_type: 'paragraph', content: '' }, issuedAt: <ISO> }` ← **STILL OLD SHAPE**

verification-architecture.md PROP-FEED-S5-011 (line 715) uses the new shape, so behavioral-spec.md:1173 also disagrees with the verification arch.

Implementation, type, and tests all use the new shape. The defect is purely documentary, but it leaves the spec internally self-contradicting. Severity: medium. Phase routing: 1c (spec amendment).

## Convergence assessment

- Iter-1 had 4 findings (2 critical, 1 high, 1 medium, 2 blocking).
- Iter-2 has 1 finding (0 critical, 0 high, 1 medium, 0 blocking).
- The wiring resolution (the most material concern) is verified end-to-end.
- The remaining defect is a localized documentation inconsistency that does not affect runtime behavior, test quality, or any reviewable invariant beyond spec coherence.

Overall verdict: FAIL (one dimension fails on structural integrity due to spec inconsistency). The fix is small and well-scoped — a single line edit in behavioral-spec.md:1173 — and should resolve to PASS on iter-3 if performed.

## Calibration

- Did NOT flag the audit script or PROP-FEED-S5-019 test pattern as new defects — both honestly satisfy their stated invariants given the architectural constraints.
- Did NOT downgrade the spec-AC inconsistency to "minor" or "cosmetic" — it directly undermines the review-loop premise that spec is authoritative, and it's the EXACT defect class FIND-S5-PHASE3-004 was supposed to eliminate.
- Did NOT mass-flag iter-1 findings as "still open"; verified each one against actual file contents.
