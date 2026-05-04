# Phase 1c Findings Routing — ui-feed-list-actions

Generated: 2026-05-04
Review iteration: iterations['1b'] = 1 (no escalation required)
Routing decision: **transition to Phase 1a** (earliest impacted phase)

---

## Routing Table

| Finding | Severity | Route | Fix Summary |
|---------|----------|-------|-------------|
| FIND-SPEC-01 | high | **1a** | Rename all `FeedViewState.status` refs in behavioral-spec.md to `editingStatus` (REQ-FEED-006) or `loadingStatus` (REQ-FEED-008) |
| FIND-SPEC-02 | high | **1b** | Add §10b enumerating `FeedAction` discriminated union; reconcile every EARS REQ clause to a kind |
| FIND-SPEC-03 | high | **1b** | Renumber IPC-boundary grep audit to PROP-FEED-032; add to §4 obligation table and §6 coverage matrix |
| FIND-SPEC-04 | high | **1a** | Drop `'not-found'` from UI-side `NoteDeletionFailureReason` or add explicit cross-reference to REQ-DLN-005 and remove EC-FEED-010 |
| FIND-SPEC-05 | high | **1b** | Resolve `timestampLabel` purity contradiction: move to effectful shell OR tighten canonical grep pattern; update both spec and PROP-FEED-031 |
| FIND-SPEC-06 | medium | **1b** | Replace PROP-FEED-001 symmetry with `isEditingNote(x, null) === false ∀x` |
| FIND-SPEC-07 | medium | **1b** | Extend PROP-FEED-007 to cover all 7 `FeedViewState` fields; add `lastDeletionError` reset property |
| FIND-SPEC-08 | medium | **1b** | Add PROPs for `timestampLabel` determinism and tag iteration; fix §6 coverage matrix mis-routing |
| FIND-SPEC-09 | medium | **1b** | Restate PROP-FEED-012 exhaustive switch as `'permission' | 'lock' | 'not-found' | 'unknown'`; drop `disk-full` |
| FIND-SPEC-10 | medium | **1a** | Broaden REQ-FEED-009 EARS to `status ∈ {'switching', 'save-failed'}`; update PROP-FEED-023 |
| FIND-SPEC-11 | medium | **1a** | Rewrite REQ-FEED-005 EARS with negative precondition `AND editingStatus ∉ {'saving','switching'}`; cross-ref REQ-FEED-006 |
| FIND-SPEC-12 | medium | **1b** | Enumerate which `FeedAction` kinds emit `'refresh-feed'`; add property test assertion; pin in §10 |
| FIND-SPEC-13 | low | **1a** | Pin `timestampLabel` to fixed locale (`'ja-JP'`) or add `locale` param |
| FIND-SPEC-14 | low | **1a** | Nominate explicit px value for Tag Pill `max-width`; add to DESIGN.md §10 if reusable |
| FIND-SPEC-15 | low | **1a** | Replace "または" with "must use `<button>`" in REQ-FEED-005 and REQ-FEED-015 |
| FIND-SPEC-16 | low | **1b** | Reorder verification-architecture sections so §9 precedes §10 |

---

## Phase Distribution

| Phase | Findings | IDs |
|-------|----------|-----|
| 1a (behavioral-spec) | 7 | FIND-SPEC-01, 04, 10, 11, 13, 14, 15 |
| 1b (verification-architecture) | 9 | FIND-SPEC-02, 03, 05, 06, 07, 08, 09, 12, 16 |

---

## Routing Decision

**Target phase: 1a**

VCSDD routing rule requires returning to the earliest impacted phase. FIND-SPEC-01 (high severity) requires editing `behavioral-spec.md` to rename `FeedViewState.status` references — that is a Phase 1a artifact. FIND-SPEC-04 (high severity) also requires a behavioral-spec rewrite. Since Phase 1a precedes Phase 1b, the pipeline returns to 1a. The Phase 1b fixes (FIND-SPEC-02, 03, 05 etc.) will be addressed in the same iteration after 1a is corrected, before re-entering Phase 1c review.

---

## Iteration Status

- `iterations['1b']`: 1 (limit not reached — no escalation needed)
- Next action: Builder corrects both `behavioral-spec.md` and `verification-architecture.md`, then re-runs Phase 1c review
