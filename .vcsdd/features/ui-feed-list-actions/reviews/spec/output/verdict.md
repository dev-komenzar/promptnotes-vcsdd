# Adversarial Spec Review — ui-feed-list-actions (Phase 1c)

- **Feature**: `ui-feed-list-actions`
- **Mode**: strict
- **Reviewed artifacts**:
  - `.vcsdd/features/ui-feed-list-actions/specs/behavioral-spec.md` (REQ-FEED-001..018, EC-FEED-001..015, NFR-FEED-001..005)
  - `.vcsdd/features/ui-feed-list-actions/specs/verification-architecture.md` (PROP-FEED-001..031)
- **Reviewer context**: fresh; Builder reasoning intentionally not consulted
- **Date**: 2026-05-04

---

## Dimension Verdicts (binary)

| # | Dimension | Verdict | Notes |
|---|-----------|---------|-------|
| 1 | 完全性 (Completeness) | **PASS** | 18 REQ + 15 EC + 5 NFR cover the mandated surface (rendering, click chain, queue restoration, edit-disable, modal, banner, empty/loading, debounce, a11y, redraw). No core requirement is structurally missing. |
| 2 | 明確さ (Clarity) | **FAIL** | `FeedViewState.status` overloaded (REQ-FEED-006 means `editingStatus`, REQ-FEED-008 means `loadingStatus`); `FeedAction` shape and the bridge from public domain events to reducer actions never defined; `timestampLabel` purity stated as "グレーゾーン"; tag pill `max-width` left to "実装定数". |
| 3 | 検証可能性 (Verifiability) | **FAIL** | Coverage matrix mis-routes REQ-FEED-001 (tagged with PROP-FEED-001 which targets a different function); `timestampLabel` has no proof obligation; PROP-FEED-019 is duplicated (banner integration vs IPC-boundary grep); PROP-FEED-007 only mirrors three fields, leaving `loadingStatus`, `visibleNoteIds`, `activeDeleteModalNoteId`, `lastDeletionError` mirroring unverified; PROP-FEED-001 declares symmetry over a signature that is not symmetric (`string` vs `string \| null`). |
| 4 | 整合性 (Consistency) | **FAIL** | REQ-FEED-014 specifies UI handling for `NoteDeletionFailureReason === 'not-found'` even though `delete-note` REQ-DLN-005 guarantees `NoteDeletionFailed` is never emitted on `not-found`; PROP-FEED-012 demands that the UI exhaustive switch include `disk-full` even though `delete-note` REQ-DLN-013 normalizes `disk-full → 'unknown'` upstream and `NoteDeletionFailureReason` does not contain `disk-full`; `pendingNextNoteId` indicator gated only on `save-failed` while aggregates.md models it as live in `switching` too. |
| 5 | Purity boundary | **FAIL** | `timestampLabel` is declared pure but its specified implementation uses `new Date(epochMs).toLocaleString()` which is in the canonical purity-audit grep pattern (`Date\(|new Date`); the spec acknowledges the "グレーゾーン" but does not resolve it. The Intl.DateTimeFormat alternative does not natively accept `epochMs` without going through a `Date` instance, leaving the boundary unenforceable. |

## Overall Verdict: **FAIL**

Strict mode requires every dimension to PASS. Four of five dimensions fail (clarity, verifiability, consistency, purity-boundary). The completeness dimension passes, but it cannot rescue a contract that is internally inconsistent and not mechanically verifiable.

## Severity Counts

| Severity | Count |
|----------|-------|
| high     | 5 |
| medium   | 7 |
| low      | 4 |
| **total**| **16** |

## Recommended Next Action

**差し戻し: Phase 1b（verification-architecture.md 主体、behavioral-spec.md にも整合性修正が必要）**

Rationale:
- All 5 high-severity findings live in either the verification-architecture (PROP-ID duplication, missing PROPs, mirroring scope, purity-boundary leak) or in cross-doc consistency between behavioral-spec and verification-architecture (`status` field overload, `FeedAction` undefined). They are not 1a-level requirement gaps; the EARS surface is complete.
- The `not-found` and `disk-full` consistency findings (FIND-SPEC-04, FIND-SPEC-05) require behavioral-spec edits but no new requirements — they are constrained-rewrites of existing ones to match `delete-note` REQ-DLN-005/013.
- Phase 2a Red-phase entry is **blocked**: PROP-FEED-019 collision and missing `timestampLabel`/`FeedAction` definitions make it impossible to write deterministic failing tests against the contract.

Proceed to Phase 2a only after Phase 1b is re-iterated and re-reviewed.

---

## Findings Summary (full detail in `findings.md`)

### High (5)
- **FIND-SPEC-01**: `FeedViewState.status` field name overloaded across REQ-FEED-006 (editing) and REQ-FEED-008 (loading); type system cannot reconcile.
- **FIND-SPEC-02**: `FeedAction` discriminated union is referenced (PROP-FEED-005, PROP-FEED-007) but never defined in either spec; no bridge between domain events (`NoteFileSaved`, `NoteFileDeleted`, `FeedFilterByTagApplied`) and reducer actions.
- **FIND-SPEC-03**: PROP-FEED-019 is assigned to two unrelated obligations (DeletionFailureBanner integration vs IPC-boundary grep audit) — duplicate ID makes coverage matrix unreliable.
- **FIND-SPEC-04**: REQ-FEED-014 specifies `'not-found'` UI handling that contradicts `delete-note` REQ-DLN-005 (no `NoteDeletionFailed` is ever emitted for `not-found`).
- **FIND-SPEC-05**: `timestampLabel` declared pure but implementation explicitly uses `new Date(...)`, which the canonical purity-audit grep flags. Boundary is unenforceable as written.

### Medium (7)
- **FIND-SPEC-06**: PROP-FEED-001 symmetry over `(string, string)` mismatches signature `(string, string \| null)`.
- **FIND-SPEC-07**: PROP-FEED-007 only mirrors 3 of 7 `FeedViewState` fields; `loadingStatus`, `visibleNoteIds`, `activeDeleteModalNoteId`, `lastDeletionError` mirroring is unspecified.
- **FIND-SPEC-08**: REQ-FEED-001 / REQ-FEED-003 have no pure proof obligation for `timestampLabel` and tag iteration; coverage matrix misroutes them to PROP-FEED-001/027.
- **FIND-SPEC-09**: PROP-FEED-012 names `disk-full` exhaustiveness for the UI even though `disk-full` is normalized away by Curate before reaching the UI; conflates layers.
- **FIND-SPEC-10**: REQ-FEED-009 gates the pending-switch indicator only on `save-failed`, ignoring `switching` state where `pendingNextNoteId` is also set per aggregates.md.
- **FIND-SPEC-11**: REQ-FEED-005's EARS rule (always emit `SelectPastNote`) directly contradicts its own edge case (do not emit during `saving` / `switching`); needs to be re-stated as "WHEN ... AND status ∉ {saving, switching} THEN ...".
- **FIND-SPEC-12**: `'refresh-feed'` command emission rule (REQ-FEED-017) is not tied to a `FeedAction` kind; reducer cannot deterministically decide when to emit.

### Low (4)
- **FIND-SPEC-13**: `timestampLabel` locale not specified — output is non-deterministic across systems, making property tests environment-dependent.
- **FIND-SPEC-14**: Tag Pill `max-width` left to "実装定数"; cannot grep-audit.
- **FIND-SPEC-15**: REQ-FEED-005 allows either `role="button"` or `<button>`; should pin to `<button>` per a11y best practice.
- **FIND-SPEC-16**: Verification-architecture section ordering (§9 placed after §10) is irregular and confusing.

---

## Convergence Signals

- `findingCount`: 16
- `evaluatedDimensions`: [完全性, 明確さ, 検証可能性, 整合性, purity-boundary] — all 5 evaluated
- `duplicateFindings`: none (each finding cites distinct artifact passages)
- Cross-feature contracts checked: `delete-note` (REQ-DLN-005, REQ-DLN-013), `edit-past-note-start` (REQ-EPNS-005, REQ-EPNS-006), `ui-editor` (canonical purity-audit pattern), `aggregates.md` (EditingSessionState transitions), `ui-fields.md` §1B / §画面 3 / §画面 4, `DESIGN.md` §10 token allow-list.
