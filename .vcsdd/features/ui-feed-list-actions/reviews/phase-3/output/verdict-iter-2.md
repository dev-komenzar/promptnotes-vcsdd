# Phase 3 Adversarial Review — ui-feed-list-actions Sprint 1 Iteration 2

- Feature: `ui-feed-list-actions`
- Sprint: 1
- Iteration: 2 (Phase 3 limit = 5)
- Mode: strict
- Reviewer: VCSDD Adversary (fresh context)
- Timestamp: 2026-05-04T16:30:00Z

## Overall Verdict — FAIL

| Dimension | Verdict | Findings |
|---|---|---|
| spec_fidelity | PASS | — |
| edge_case_coverage | PASS | — |
| implementation_correctness | FAIL | FIND-I2-001 |
| structural_integrity | PASS | — |
| verification_readiness | PASS | — |

Severity counts: high=1, medium=0, low=0 (total 1).

---

## iter-1 Findings Resolution Audit (14/14)

| ID | iter-1 sev | Resolution Status |
|---|---|---|
| FIND-001 (high) | RESOLVED | DeleteConfirmModal.svelte:92 now reads "後で復元できます"; DOM test at DeleteConfirmModal.dom.vitest.ts:69-78 asserts both presence and absence of old wording. |
| FIND-002 (high) | RESOLVED | Confirm button label is "削除（OS ゴミ箱に送る）" (DeleteConfirmModal.svelte:110); DOM test at line 84-93 asserts exact trimmed text. |
| FIND-003 (high) | RESOLVED | DeletionFailureBanner.svelte:77-87: retry button background is `#0075de`, padding `8px 16px`, weight-600, font-size 15px — fully matching REQ-FEED-014 Primary Blue spec. |
| FIND-004 (high) | RESOLVED | FeedList.svelte now reads `noteMetadata` from `currentViewState.noteMetadata` and passes `meta.body`, `meta.createdAt`, `meta.updatedAt`, `meta.tags` to FeedRow (lines 192-203). `rowMetadata()` fallback is defensive only. |
| FIND-005 (medium) | RESOLVED | DeletionFailureBanner.svelte:57-60: `border: none; border-left: 4px solid #dd5b00;` — left-accent only. 5-layer Deep Shadow present (5 rgba shadow values in box-shadow). |
| FIND-006 (medium) | RESOLVED | `showPendingSwitch` in FeedRow.svelte:53-56 now requires BOTH `pendingNextNoteId === noteId` AND `editingStatus ∈ {'switching', 'save-failed'}`. Tests at FeedRow.dom.vitest.ts:378-423 cover all guard branches. |
| FIND-007 (medium) | RESOLVED | `deleteAriaLabel` and `deleteTitle` now dynamically set to "編集を終了してから削除してください" when `deleteDisabled`. DOM test at FeedRow.dom.vitest.ts:342-358 asserts exact value on both attributes. |
| FIND-008 (medium) | RESOLVED | FeedList now routes all user interactions through feedReducer: `handleRowClick`, `handleDeleteButtonClick`, `handleDeleteConfirm`, `handleDeleteCancel`, `handleRetryDeletion` all dispatch through reducer then consume commands via `dispatchCommand`. |
| FIND-009 (low) | RESOLVED | `isConfirmPending` guard in DeleteConfirmModal.svelte:30 prevents double-dispatch. DOM test at line 99-113 exercises rapid double-click and asserts exactly 1 dispatch. |
| FIND-010 (medium) | RESOLVED | Same as FIND-005 — structural_integrity manifestation of the same border/shadow fix. Confirmed resolved. |
| FIND-011 (high) | RESOLVED | Same physical file as FIND-003 — retry button now uses `#0075de` (Primary Blue). Confirmed resolved. |
| FIND-012 (low) | RESOLVED | DeletionFailureBanner is rendered before the row list in FeedList.svelte:168-176 (top of feed container). |
| FIND-013 (medium) | RESOLVED | feedRowPredicates.test.ts now has a `tagOrderPreserving` helper (line 248) and three tests (PROP-FEED-034a/b/c/d/e) exercising tag array order/length via fast-check over `readonly string[]` arbitrary. The mislabeled bodyPreviewLines test has been corrected. |
| FIND-014 (high) | RESOLVED | FeedList.dom.vitest.ts now includes metadata content tests (lines 261-369): `row-created-at` textContent matches `timestampLabel(CREATED_AT, 'ja-JP')`, `row-body-preview` contains first body line, tag-chip count equals TAGS.length and order preserved. |

All 14 iter-1 findings are properly resolved by verified file changes.

---

## New Finding: FIND-I2-001 (high)

### `DeleteCancelled` reducer never emits `cancel-note-deletion` — CancelNoteDeletion IPC command is dead in production wiring

**Dimension**: implementation_correctness
**Category**: requirement_mismatch
**Severity**: high
**REQ refs**: REQ-FEED-012

The FIND-008 fix introduced the feedReducer command bus. However, the `DeleteCancelled` branch in `feedReducer.ts:77-83` emits only `{ kind: 'close-delete-modal' }`, never `{ kind: 'cancel-note-deletion', payload: { noteId, issuedAt } }`. Verification-architecture.md §9b explicitly maps `DeleteCancelled → { kind: cancel-note-deletion } + { kind: close-delete-modal }`.

Because `FeedList.svelte:211` wires `onClose={handleDeleteCancel}`, all cancel paths (Esc, backdrop click, cancel button) route through `handleDeleteCancel → feedReducer(DeleteCancelled)`. The emitted command array contains only `close-delete-modal`, never `cancel-note-deletion`. Consequently `dispatchCancelNoteDeletion` is never called through the production path.

REQ-FEED-012 acceptance criterion: "キャンセル時に `dispatchCancelNoteDeletion` が 1 回呼ばれる" is not satisfied in production.

The existing DOM test (`DeleteConfirmModal.dom.vitest.ts:227-240`) passes only because it mounts `DeleteConfirmModal` without an `onClose` prop — exercising the adapter fallback branch in `handleCancel`, not the command bus path used by `FeedList`.

Evidence: `promptnotes/src/lib/feed/feedReducer.ts:77-83`

---

## Purity / IPC / DESIGN.md Token Audit (positive evidence retained from iter-1)

**PROP-FEED-031 purity**: `feedRowPredicates.ts`, `feedReducer.ts`, `deleteConfirmPredicates.ts` contain no `Date.now`, `new Date`, `@tauri-apps/api`, `window.`, `document.`, `setTimeout`, `setInterval`, `$state`, `$effect`, `$derived`, `invoke(` — PASS.

**PROP-FEED-032 IPC boundary**: `tauriFeedAdapter.ts` contains no `listen`; `feedStateChannel.ts` contains no `invoke` — PASS.

**DESIGN.md tokens**:
- FeedRow.svelte: `max-width: 160px` (tag chip, line 229), `#f2f9ff` tag background (line 221), `#097fe8` tag text + focus ring (lines 188, 221), `rgba(0,0,0,0.1)` whisper border (line 162), 4-layer card shadow (line 164), `border-radius: 12px` (line 163) — PASS.
- DeleteConfirmModal.svelte: `rgba(0,0,0,0.5)` scrim (line 120), 5-layer Deep Shadow (line 134), `border-radius: 16px` (line 131), `#dd5b00` confirm background (line 169) — PASS.
- DeletionFailureBanner.svelte: `border-left: 4px solid #dd5b00` (line 59), 5-layer Deep Shadow (line 65), `#0075de` retry button (line 78) — PASS.
- FeedRow.svelte `role="button"` div absent — pure `<button>` element used — PASS.

**PROP-FEED-034 (tag iteration)**: feedRowPredicates.test.ts now tests `tagOrderPreserving` over arbitrary tag arrays — PASS.
**PROP-FEED-013 (FIND-013 fix)**: tag array iteration correctly tested — PASS.
**FIND-014 fix**: FeedList.dom.vitest.ts now asserts metadata content values — PASS.

---

## Convergence Signals

- All 10 CRIT-001..CRIT-010 evaluated.
- 14 iter-1 findings resolved: 14/14.
- 1 new finding (FIND-I2-001, high) — blocks PASS.
- 4 dimensions now PASS; 1 dimension (implementation_correctness) FAIL.
- Iteration upper bound: 2/5, not reached.

## Builder Next-Action

Route FIND-I2-001 to Phase 2b:

In `feedReducer.ts` `DeleteCancelled` case, add `cancel-note-deletion` command emission before `close-delete-modal`. The `noteId` must come from `state.activeDeleteModalNoteId`. If `activeDeleteModalNoteId` is null (defensive), the command should still use `''` or be skipped conditionally. Additionally, add a `feedReducer.test.ts` example test asserting that `DeleteCancelled` with a non-null `activeDeleteModalNoteId` in state emits both `cancel-note-deletion` and `close-delete-modal` commands. Add an integration test via `FeedList` that verifies `dispatchCancelNoteDeletion` is called when cancel is triggered through the full command bus wiring.

After fix, re-run Phase 3 adversary at iteration 3 (limit 5).
