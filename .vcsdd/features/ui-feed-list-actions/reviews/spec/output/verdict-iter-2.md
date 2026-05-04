# Phase 1c Spec Re-Review — Verdict (iter-2)

Feature: `ui-feed-list-actions`
Reviewer: vcsdd-adversary (fresh context, strict mode, Opus 4.7)
Date: 2026-05-04
Iteration: **2** (`iterations['1a'] = 2`, `iterations['1b'] = 2`)

---

## Overall Verdict: **FAIL**

Five new findings (high=1, medium=3, low=1). The iter-1 corrections are mostly sound — 16/16 prior findings are resolved on the surface — but the introduction of `FeedAction.DomainSnapshotReceived` as the single conduit for every public domain event surfaced a new structural gap: the `FeedDomainSnapshot` payload type that the reducer pivots on is never defined, and PROP-FEED-035's "iff" condition is internally contradictory.

These are blockers for Phase 2a. Without a defined `FeedDomainSnapshot` type the reducer cannot be implemented, integration mocks have no shape to satisfy, and PROP-FEED-007a/b/d cannot be expressed as a fast-check property.

---

## Per-Dimension Binary Verdicts

| # | Dimension | Verdict | Notes |
|---|-----------|---------|-------|
| 1 | 完全性 (Completeness) | **PASS** | 18 REQs cover every required behaviour: row rendering (001-004), row click chain (005-006), pendingNextNoteId restore (009), edit-in-progress delete suppression (010), confirm modal (011-012), banner (014), empty state (007), loading (008), debounce (006), a11y (015-016), refresh on save/filter (017-018), delete re-render (013). All listed UI obligations from `ui-fields.md §1B` and `workflows.md §3/§5` are present. |
| 2 | 明確さ (Clarity) | **FAIL** | `FeedDomainSnapshot` referenced in §9b/§4 but never defined (FIND-SPEC-2-01). PROP-FEED-013 acceptance omits `loadingStatus !== 'ready'` precondition that REQ-FEED-006 explicitly includes (FIND-SPEC-2-04). REQ-FEED-014 specifies a `'unknown'` banner string but is silent about `NoteDeletionFailed.detail` propagation, even though upstream REQ-DLN-013 makes `detail = 'disk-full'` semantically meaningful (FIND-SPEC-2-05). |
| 3 | 検証可能性 (Verifiability) | **FAIL** | PROP-FEED-035 claims `'refresh-feed' iff action.kind ∈ {'DomainSnapshotReceived'} かつ新規 noteId が visibleNoteIds に含まれる更新` and immediately appends "フィルタ更新でも emit する" — the iff and the appended set are inconsistent (FIND-SPEC-2-02). PROP-FEED-007d mentions `snapshot が NoteFileDeleted トリガー (削除成功)` but no field on `FeedDomainSnapshot` lets the reducer detect "this snapshot was caused by a delete" vs. a save (FIND-SPEC-2-03). Until both are tightened the property tests are unwritable. |
| 4 | 整合性 (Consistency) | **FAIL** | REQ-FEED-017 requires `'refresh-feed'` emission on `NoteFileSaved`, but §9b's emission rule is gated on "新規 noteId が visibleNoteIds に含まれる更新" — a save does not add a new noteId, only re-orders an existing one, so by the §9b condition save would not emit refresh (FIND-SPEC-2-02 again). The iter-2 patch added the §9b rule but did not reconcile it with REQ-FEED-017's wording. |
| 5 | Purity Boundary | **PASS** | `timestampLabel(epochMs, locale)` now uses `Intl.DateTimeFormat(locale, options).format(epochMs)` directly — `Intl.DateTimeFormat#format` accepts a number (ms since epoch) so `new Date(...)` is genuinely unnecessary. canonical purity-audit grep pattern matches this implementation as zero-hits. PROP-FEED-031 + PROP-FEED-032 + PROP-FEED-030 form a clean Tier-0 boundary fence. Pure modules' Forbidden-API columns are explicit. |

---

## Severity Counts (iter-2 deltas)

| Severity | New Findings |
|----------|--------------|
| high | 1 |
| medium | 3 |
| low | 1 |
| **total** | **5** |

PASS threshold (per task brief): high=0 + medium ≤ 2. **Threshold breached** on both axes.

---

## Iter-1 Findings — Resolution Status

| ID | Iter-1 Severity | Status | Evidence |
|----|----------------|--------|----------|
| FIND-SPEC-01 | high | **解決済み** | `behavioral-spec.md:132,161,168` use `editingStatus`/`loadingStatus`. `verification-architecture.md:339,343` define the two fields separately. |
| FIND-SPEC-02 | high | **解決済み** | `verification-architecture.md:349-365` defines `FeedAction` discriminated union with 10 kinds and Action→REQ mapping table. |
| FIND-SPEC-03 | high | **解決済み** | PROP-FEED-019 in §4 (line 149) is exclusively the DeletionFailureBanner integration test. PROP-FEED-032 (line 162) is the IPC boundary audit. Both appear in §6 coverage matrix. |
| FIND-SPEC-04 | high | **解決済み** | REQ-FEED-014 (line 276) explicitly drops `'not-found'` and cites REQ-DLN-005. EC-FEED-010 removed (line 375 explanation). PROP-FEED-008/009/012 reference only `'permission' \| 'lock' \| 'unknown'`. |
| FIND-SPEC-05 | high | **解決済み** | `timestampLabel(epochMs, locale)` uses `Intl.DateTimeFormat(locale).format(epochMs)`; `verification-architecture.md:30` explicitly notes `Intl.DateTimeFormat#format` accepts a number directly. canonical grep `new Date\b` no longer matches. |
| FIND-SPEC-06 | medium | **解決済み** | PROP-FEED-001 rewritten (`verification-architecture.md:80,128`) as `isEditingNote(x, null) === false ∀x: string`. Symmetry abandoned. |
| FIND-SPEC-07 | medium | **解決済み** | PROP-FEED-007 split into 007a (editingStatus/editingNoteId/pendingNextNoteId), 007b (visibleNoteIds), 007c (loadingStatus), 007d (activeDeleteModalNoteId + lastDeletionError reset). |
| FIND-SPEC-08 | medium | **解決済み** | PROP-FEED-033 (timestampLabel determinism) and PROP-FEED-034 (tag iteration preservation) added; §6 coverage matrix updated for REQ-FEED-001 / REQ-FEED-003. |
| FIND-SPEC-09 | medium | **解決済み** | PROP-FEED-012 restated (line 142) as 3-variant exhaustive switch; explicit notes that `disk-full` is normalized by Curate and `'not-found'` is unreachable. |
| FIND-SPEC-10 | medium | **解決済み** | REQ-FEED-009 EARS (line 175) now reads `editingStatus ∈ {'switching', 'save-failed'}`; PROP-FEED-023 acceptance (line 153) updated. |
| FIND-SPEC-11 | medium | **解決済み** | REQ-FEED-005 EARS (line 112) carries explicit `AND editingStatus ∉ {'saving','switching'} AND loadingStatus === 'ready'` precondition; cross-reference to REQ-FEED-006 added (line 114). |
| FIND-SPEC-12 | medium | **部分的** | §9b lists explicit `'refresh-feed' 排出条件` and PROP-FEED-035 binds emission to action set, BUT the new wording is internally contradictory (see FIND-SPEC-2-02 below). The intent is captured; the formalisation is broken. |
| FIND-SPEC-13 | low | **解決済み** | `timestampLabel(epochMs: number, locale: string)` signature; FeedRow callsite passes `'ja-JP'` (line 36 verification-architecture). |
| FIND-SPEC-14 | low | **解決済み** | REQ-FEED-003 (line 86) names `max-width: 160px` and references DESIGN.md §10 Pill Max-Width Token. DESIGN.md §10 (line 386) now lists "Pill Max-Width 160 px §4 Pill Badge". PROP-FEED-027 grep checks `160px`. |
| FIND-SPEC-15 | low | **解決済み** | REQ-FEED-005 acceptance (line 126) requires `<button>` element. REQ-FEED-015 + the `> Note` block (lines 306-308) explicitly mandate `<button>` and forbid `role="button"` on `<div>`. |
| FIND-SPEC-16 | low | **解決済み** | Section ordering now monotonic: §1–§8, §9 (FeedCommand/FeedViewState/FeedAction), §10 (Out-of-Scope). |

**Summary**: 15 of 16 fully resolved, 1 partially resolved (FIND-SPEC-12 re-emerges as FIND-SPEC-2-02).

---

## Newly Discovered Findings (iter-2)

See `findings-iter-2.md` for the detailed table. Headline list:

| ID | Severity | Dimension | One-line |
|----|----------|-----------|----------|
| FIND-SPEC-2-01 | **high** | 明確さ, 検証可能性 | `FeedDomainSnapshot` is referenced as `FeedAction.DomainSnapshotReceived.snapshot` but its type fields are never enumerated; the reducer cannot be implemented or tested. |
| FIND-SPEC-2-02 | medium | 検証可能性, 整合性 | PROP-FEED-035 simultaneously claims `'refresh-feed' iff action.kind ∈ {'DomainSnapshotReceived'}` and adds "FilterApplied / FilterCleared でも emit"; the iff and the appendix contradict. Also REQ-FEED-017 requires refresh on `NoteFileSaved` (no new noteId), which the §9b "新規 noteId が visibleNoteIds に含まれる" condition would forbid. |
| FIND-SPEC-2-03 | medium | 検証可能性 | PROP-FEED-007d claims "snapshot が NoteFileDeleted トリガー (削除成功) のとき lastDeletionError === null" but no field on `FeedDomainSnapshot` distinguishes a delete-success snapshot from a save-success snapshot. Property is unverifiable as written. |
| FIND-SPEC-2-04 | medium | 明確さ | PROP-FEED-013 acceptance only checks `editingStatus ∈ {'saving','switching'}`; omits `loadingStatus !== 'ready'` even though REQ-FEED-006 EARS (line 132) gates dispatch on both. Property under-specifies the requirement. |
| FIND-SPEC-2-05 | low | 整合性 | REQ-FEED-014 maps `'unknown'` → "削除に失敗しました" but is silent on `NoteDeletionFailed.detail` (which carries `'disk-full'` per delete-note REQ-DLN-013, REQ-DLN-004 line 419). Diagnostic information is dropped at the UI layer with no spec acknowledgment. |

---

## Recommended Next Action

**Route back to Phase 1b (verification-architecture)**.

Justification:
- All five new findings are in the `FeedAction` / `FeedDomainSnapshot` / PROP-FEED-035 area, which is owned by `verification-architecture.md` §4 and §9b.
- Behavioral-spec REQ-FEED-014 needs a small note about `detail` (FIND-SPEC-2-05) — Phase 1a — but that single low-severity edit can ride along with the 1b round.
- The iter-2 corrections to `behavioral-spec.md` are sound; no other Phase 1a edits are required.

Estimated effort: ~30-45 minutes for the Builder. Add `FeedDomainSnapshot` type definition to §9b (mirror `EditingSessionState` + `Feed` projection), tighten PROP-FEED-035 to a non-iff form (e.g., "`'refresh-feed' ∈ commands` for actions in {DomainSnapshotReceived where visibleNoteIds delta exists, FilterApplied, FilterCleared, ... NoteFileSaved-trigger}"), and add an explicit `lastUpstreamEvent` discriminator (or restructure `DomainSnapshotReceived` into kind-tagged subactions) so PROP-FEED-007d is testable.

**Do NOT proceed to Phase 2a.** Iteration limit (`iterations['1b'] = 2` → 3 after this round) is not yet exhausted; no escalation required.

---

## State Snapshot After This Review

- `gates['1c'].verdict` = `FAIL`
- `currentPhase` = `1c` (no transition)
- `iterations['1c']` = 2 (after recordGate)
- Recommended `transitionPhase` target: `1b` (Builder/orchestrator action)

---

## Reviewer Signature

Adversary: vcsdd-adversary (Opus 4.7 fresh-context instance, no prior conversation memory)
Method: read-only review of `behavioral-spec.md` + `verification-architecture.md` + cross-references in `delete-note` spec, `aggregates.md`, `ui-fields.md §1B`, `workflows.md §3/§5`, `DESIGN.md §10`.
