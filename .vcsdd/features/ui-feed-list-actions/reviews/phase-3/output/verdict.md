# Phase 3 Adversarial Review — ui-feed-list-actions Sprint 1

- Feature: `ui-feed-list-actions`
- Sprint: 1
- Iteration: 1 (Phase 3 limit = 5)
- Mode: strict
- Reviewer: VCSDD Adversary (fresh context)
- Timestamp: 2026-05-04T15:00:00Z

## Overall Verdict — FAIL

| Dimension | Verdict | Findings |
|---|---|---|
| spec_fidelity | FAIL | FIND-001, FIND-002, FIND-003, FIND-004, FIND-005 |
| edge_case_coverage | FAIL | FIND-006, FIND-007 |
| implementation_correctness | FAIL | FIND-008, FIND-009 |
| structural_integrity | FAIL | FIND-010, FIND-011, FIND-012 |
| verification_readiness | FAIL | FIND-013, FIND-014 |

Severity counts: high=5, medium=7, low=2 (total 14).

## FIND-CONTRACT-11 (REQ-FEED-015 Enter-key dispatch test) — judgement: 不要 (not required)

The implementation uses a true `<button data-testid="feed-row-button">` element (FeedRow.svelte:71-76). Native `<button>` semantics fire the `click` handler on Enter and on Space keydown without any custom keyboard listener. No `keydown` handler is needed and no separate Enter-key dispatch test is required. The DOM test at FeedRow.dom.vitest.ts:273-284 verifies `tagName === 'BUTTON'`, which is sufficient to anchor the keyboard-equivalence claim. **Phase 5 grep audit can additionally verify that no `role="button"` div is used in feed/.** No new finding raised for FIND-CONTRACT-11.

## Top-3 critical findings

1. **FIND-004 (high)** — FeedList wires FeedRow with `body=""`, `createdAt=0`, `updatedAt=0`, `tags=[]`. REQ-FEED-001/002/003/017 are not deliverable end-to-end: every row will render epoch=0, empty preview, no tags at runtime. Tests pass because assertions check row count only.
2. **FIND-001 (high)** — DeleteConfirmModal body text contradicts REQ-FEED-012 spec wording: spec says "後で復元できます" (can be restored), impl says "この操作は取り消せません" (cannot be undone). Opposite user contract.
3. **FIND-003 / FIND-011 (high)** — Retry button paints `#dd5b00` (Orange/Warn) instead of REQ-FEED-014 mandated `#0075de` (Primary Blue). DESIGN.md token allow-list violated; recovery action collapses with destructive action chromatic affordance.

## Other significant findings

- **FIND-002 (high)** — Confirm button label is "削除する" instead of REQ-FEED-012 mandated "削除（OS ゴミ箱に送る）".
- **FIND-005 / FIND-010 (medium)** — DeletionFailureBanner uses full 1px border instead of "左アクセントボーダー" and 4-layer shadow instead of 5-layer Deep Shadow.
- **FIND-008 (medium)** — feedReducer's command branches (FeedRowClicked / DeleteButtonClicked / DeleteConfirmed / DeleteCancelled / DeletionRetryClicked / DeletionBannerDismissed) are dead code: the shell calls adapters directly. Reducer/shell separation in v-arch §9 is not implemented.
- **FIND-006 (medium)** — `showPendingSwitch` predicate is missing the editingStatus guard from REQ-FEED-009.
- **FIND-007 (medium)** — Disabled delete button has no tooltip / disabled-state aria-label, contrary to REQ-FEED-010 EC.
- **FIND-013 (medium)** — PROP-FEED-034 test is misnamed: it tests bodyPreviewLines, not tag iteration preservation.
- **FIND-014 (high)** — FeedList DOM tests assert only row count and never timestamp/body/tag content; verification suite cannot catch FIND-004 or any future metadata-wiring regression.
- **FIND-009 (low)** — Modal stays interactive between confirm dispatch and snapshot arrival; no in-flight guard.
- **FIND-012 (low)** — Banner placement at bottom of feed-list rather than "フィード上部".

## Builder next-action

Route findings via `/vcsdd-feedback`:

- Phase 2b (impl fix): FIND-001, FIND-002, FIND-003, FIND-004, FIND-005, FIND-006, FIND-007, FIND-009, FIND-010, FIND-011
- Phase 2c (refactor — wiring reducer to shell): FIND-008
- Phase 2a (test reinforcement): FIND-013, FIND-014
- Phase 1a (spec clarification on banner placement): FIND-012

After fixes, re-run Phase 3 adversary at iteration 2 (limit 5).

## Pure / IPC boundary audit (positive evidence)

These checks pass in the current implementation and are NOT flagged:

- `feedRowPredicates.ts`, `feedReducer.ts`, `deleteConfirmPredicates.ts` contain no `Date.now`, `new Date`, `@tauri-apps/api`, `window.`, `document.`, `setTimeout`, `setInterval`, `Math.random`, `$state`, `$effect`, `$derived`, `import.meta`, `invoke(` (PROP-FEED-031).
- `tauriFeedAdapter.ts` contains no `listen`; `feedStateChannel.ts` contains no `invoke` (PROP-FEED-032).
- `clockHelpers.ts` is documented effectful and carve-out per contract.
- FeedRow uses real `<button>` element (REQ-FEED-015 native a11y); focus-visible outline `2px solid #097fe8` present (FeedRow.svelte:155-159, 225-227).
- DeleteConfirmModal applies `border-radius: 16px`, 5-layer Deep Shadow, `#dd5b00` confirm background, `role="dialog"` + `aria-labelledby` (DeleteConfirmModal.svelte:115, 67-68).
- Tag chip `max-width: 160px` and `#f2f9ff`/`#097fe8` colors present (FeedRow.svelte:188-200).
- DeletionFailureBanner has `role="alert"`.

## Convergence signals

- All 10 CRIT-001..CRIT-010 evaluated.
- 14 findings open, 5 dimensions FAIL.
- No duplicate findings detected.
- Iteration upper bound not reached (1/5).
