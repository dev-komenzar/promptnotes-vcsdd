# Phase 1c Spec Re-Review — Findings (iter-3)

Feature: `ui-feed-list-actions`
Reviewer: vcsdd-adversary (fresh context, strict mode, iter-3)
Date: 2026-05-04

Summary: 1 new finding (high=0, medium=0, low=1). Overall **PASS** (within threshold).

---

## Low Severity (1)

### FIND-SPEC-3-01 — `FeedDomainSnapshot.delete.lastDeletionError` → `FeedViewState.lastDeletionError` shape conversion partially specified

- **Severity**: low
- **Dimensions**: 整合性 (Consistency), 明確さ (Clarity)
- **Targets**: `verification-architecture.md` §9 `FeedViewState`, §9b `FeedDomainSnapshot.delete.lastDeletionError`, REQ-FEED-014 acceptance, PROP-FEED-007d
- **Evidence**:
  - `verification-architecture.md:345`: `readonly lastDeletionError: NoteDeletionFailureReason | null;` (UI-flat — only the reason string)
  - `verification-architecture.md:366`: `readonly lastDeletionError: { reason: 'permission' | 'lock' | 'unknown'; detail?: string } | null;` (raw shape — reason + detail)
  - `behavioral-spec.md:284`: banner row `'unknown' + detail` → `「削除に失敗しました（{detail}）」`
  - `behavioral-spec.md:305`: pure acceptance `deletionErrorMessage('unknown', 'disk-full')` returns suffix-bearing string
  - `verification-architecture.md:137` (PROP-FEED-007d): only specifies the `null`-reset case for `cause.kind === 'NoteFileDeleted'`. **Says nothing** about how the populated `S.delete.lastDeletionError = { reason, detail? }` mirrors into `FeedViewState.lastDeletionError: NoteDeletionFailureReason | null`.

- **Problem**: Reducer must convert `{reason; detail?} | null` → `NoteDeletionFailureReason | null`, which discards `detail`. The banner consumer (`DeletionFailureBanner.svelte`) needs `detail` to call `deletionErrorMessage(reason, detail)` per REQ-FEED-014; if it only sees `FeedViewState.lastDeletionError` (a flat reason), `detail` is unrecoverable in production flow. The pure unit test passes (it constructs `'disk-full'` directly), but no documented production data path delivers `'disk-full'` to that function. Same root cause underlies the implicit provenance of `DeletionRetryClicked.noteId` — `FeedViewState` does not currently preserve the failed-noteId.

- **Builder context (acknowledged)**: Builder explicitly stated this is an intentional shape divergence — snapshot raw shape, ViewState flat type, with reducer-side conversion. The `behavioral-spec.md:286` "Detail 取り扱い方針" note implies detail flows to the banner; the conduit (which type carries detail across the pure/shell boundary into the banner) is not pinned down.

- **Why low (not blocking)**: Phase 2 implementer has at least three valid resolutions:
  1. Widen `FeedViewState.lastDeletionError` to `{ reason: NoteDeletionFailureReason; detail?: string; noteId: string } | null` (preferred — also resolves where `DeletionRetryClicked` reads its `noteId`).
  2. Add separate `lastDeletionErrorDetail: string | null` and `lastDeletionErrorNoteId: string | null` mirror fields.
  3. Have `DeletionFailureBanner.svelte` consume snapshot-derived props directly, bypassing the flat reducer field.
  All three are mechanical Phase 2 decisions; no spec error, only an under-specified edge.

- **Recommended fix (one-line, optional pre-Phase-2a edit)**: In `verification-architecture.md` §9, change `lastDeletionError: NoteDeletionFailureReason | null` to `lastDeletionError: { readonly reason: NoteDeletionFailureReason; readonly detail?: string; readonly noteId: string } | null`, and extend PROP-FEED-007d with the populated-case mirroring rule. May be applied before Phase 2a or carried into Phase 2a as a failing-test-driven decision.
