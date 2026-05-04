# Phase 6 UI Mount Verification Evidence

Feature: `ui-feed-list-actions`
Date: 2026-05-04
Verifier: Claude (Phase 6 convergence)

## Verification Method

Created dev-only preview route at `promptnotes/src/routes/feed-preview/+page.svelte` mounting:
- `FeedList.svelte` (with mock IPC adapter + state channel)
- `FeedRow.svelte` (3 sample notes)
- `DeleteConfirmModal.svelte` (conditional render on click)
- `DeletionFailureBanner.svelte` (conditional render on failure)

Started Vite dev server (`bun run dev`), navigated to `http://localhost:1420/feed-preview`,
exercised each user interaction with Playwright MCP, and confirmed visual + behavioral
correctness against spec.

## Bug Caught by UI Mount Verification (NOT caught by 1471 unit + 188 DOM tests)

**`feedReducer.DeleteButtonClicked` did not mutate `activeDeleteModalNoteId`**

- Symptom in browser: clicking the delete button (×) emitted `request_note_deletion` IPC
  call but the `DeleteConfirmModal` never appeared (`activeDeleteModalNoteId` stayed null).
- Root cause: reducer returned `state` unchanged, only emitting commands. The
  `open-delete-modal` command was a no-op signal (state mutation expected to happen
  in reducer, not shell).
- Why DOM tests missed it: `FeedList.dom.vitest.ts` mounts FeedList with a viewState
  that already has `activeDeleteModalNoteId` set, then asserts modal renders. It never
  exercises the click → reducer → state transition path end-to-end.
- Same defect in `DeleteConfirmed`: reducer did not reset `activeDeleteModalNoteId` to null,
  so confirm button would also leave modal open.

**Fix applied**: `feedReducer.ts`
- `DeleteButtonClicked` now sets `nextState.activeDeleteModalNoteId = action.noteId`
- `DeleteConfirmed` now sets `nextState.activeDeleteModalNoteId = null` and emits
  `close-delete-modal` command alongside `confirm-note-deletion`

**Tests added** (`feedReducer.test.ts`):
- REQ-FEED-011: DeleteButtonClicked sets activeDeleteModalNoteId in next state
- REQ-FEED-011: DeleteButtonClicked emits 2 commands (request-note-deletion + open-delete-modal)
- REQ-FEED-012: DeleteConfirmed sets activeDeleteModalNoteId to null
- REQ-FEED-012: DeleteConfirmed emits 2 commands (confirm-note-deletion + close-delete-modal)

## Verified Visual States

1. **Initial mount** (3 notes rendered with metadata):
   - Each row shows createdAt + updatedAt as Intl.DateTimeFormat('ja-JP') labels
   - Body preview rendered as 2 lines
   - Tag pills rendered (research/ph, tauri/todo, none for note-003)
   - Delete button (×) on each row
   - Screenshot: `feed-preview-initial.png`

2. **Delete confirmation modal open** (after fix):
   - Title "削除の確認"
   - Body "このノートを OS のゴミ箱に送ります。後で復元できます。" (REQ-FEED-012 spec wording)
   - Confirm button "削除（OS ゴミ箱に送る）" — orange #dd5b00 destructive CTA
   - Cancel button "キャンセル" — neutral
   - Screenshot: `feed-preview-modal-open.png`

3. **Deletion failure banner**:
   - Banner at top of feed (FIND-012 placement fix)
   - Left-accent orange border (FIND-005 fix)
   - 5-layer shadow (FIND-010 fix)
   - Text "削除に失敗しました（権限不足）"
   - Retry button "再試行" — Primary Blue #0075de (FIND-003/011 fix)
   - Screenshot: `feed-preview-banner.png`

## Test Results After Fix

```
bun test --run                   1475 pass / 0 fail (130 files)
bun x vitest run                 188 pass / 0 fail (23 files)
```

(Was 1471 + 188 before; +4 new reducer tests verify the bug fix.)

## DESIGN.md Token Audit (in-browser visual)

- Tag pill max-width 160px: visible (tag chips don't overflow)
- Modal red confirm button #dd5b00: visible
- Banner Primary Blue retry button #0075de: visible
- Focus ring #097fe8: not visually exercised this session (keyboard navigation)

## Conclusion

UI mounts correctly with all interactions working as specified. The Phase 6 visual
verification caught a real UX defect that 1659 prior unit/DOM tests did not — proving
the value of mandatory mount audits over pure test-based verification.
