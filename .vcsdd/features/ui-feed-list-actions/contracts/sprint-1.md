---
sprintNumber: 1
feature: ui-feed-list-actions
status: approved
negotiationRound: 1
scope: "Full Sprint 1 implementation of ui-feed-list-actions: pure core (feedReducer.ts, feedRowPredicates.ts, deleteConfirmPredicates.ts, types.ts), effectful shell (tauriFeedAdapter.ts, feedStateChannel.ts, clockHelpers.ts), and Svelte 5 components (FeedList.svelte, FeedRow.svelte, DeleteConfirmModal.svelte, DeletionFailureBanner.svelte). All under promptnotes/src/lib/feed/. Covers 18 REQ-FEED-001..018, 15 EC-FEED-001..015, 5 NFR-FEED-001..005, and 38 PROP-FEED-001..035 (PROP-FEED-007 split into 007a/b/c/d). NOTE: clockHelpers.ts is an effectful shell helper that wraps `new Date().toISOString()` for component-tier event timestamping; not subject to PROP-FEED-031 canonical purity grep (effectful by design). EXPLICITLY INCLUDED: bun:test pure-core suites + vitest+jsdom DOM integration suites. EXPLICITLY EXCLUDED: Tauri Rust commands (delegated to existing delete-note / edit-past-note-start backends), keyboard accelerator hooks, screen-reader announcement live-region orchestration."
criteria:
  - id: CRIT-001
    dimension: spec_fidelity
    description: "REQ-FEED-001/002/003 — row rendering: createdAt/updatedAt timestamps via timestampLabel(epochMs, locale), 2-line body preview via bodyPreviewLines, tag pill iteration via tagOrderPreserving. timestampLabel uses Intl.DateTimeFormat (no `new Date`); bodyPreviewLines is total over all string inputs; tag iteration preserves order and length. Covered by PROP-FEED-033, PROP-FEED-003, PROP-FEED-004, PROP-FEED-034."
    weight: 0.12
    passThreshold: "promptnotes/src/lib/feed/__tests__/feedRowPredicates.test.ts (bun:test) describe 'REQ-FEED-001 / PROP-FEED-033: timestampLabel determinism' all assertions pass 100% (deterministic Intl format, idempotent over equal epochMs); describe 'REQ-FEED-002 / PROP-FEED-003: bodyPreviewLines length ≤ maxLines' fast-check property passes ≥200 numRuns; describe 'REQ-FEED-002 / PROP-FEED-004: bodyPreviewLines content matches split+slice' fast-check property passes ≥200 numRuns; describe 'REQ-FEED-003 / PROP-FEED-034: tag array order and length preservation' fast-check property passes ≥200 numRuns."
  - id: CRIT-002
    dimension: spec_fidelity
    description: "REQ-FEED-005/006/009 — row click chain + pendingNextNoteId mirror: FeedRowClicked dispatched only when editingStatus ∈ {idle, editing, save-failed} AND loadingStatus === 'ready' (positive precondition + edge_case fan-out from REQ-FEED-006); pending-switch indicator visible iff pendingNextNoteId !== null. Covered by feedReducer.test.ts FeedRowClicked guard tests, FeedRow.dom.vitest.ts PROP-FEED-013/023 DOM assertions."
    weight: 0.12
    passThreshold: "promptnotes/src/lib/feed/__tests__/feedReducer.test.ts (bun:test): FeedRowClicked guard — when editingStatus ∈ {saving, switching} OR loadingStatus !== 'ready', commands === [] (PROP-FEED-005 totality + REQ-FEED-006 derived). promptnotes/src/lib/feed/__tests__/dom/FeedRow.dom.vitest.ts (vitest+jsdom) describe 'PROP-FEED-013 / REQ-FEED-005: row click dispatches SelectPastNote' click while editingStatus='editing' and loadingStatus='ready' → exactly one 'select-past-note' command emitted; describe 'PROP-FEED-023 / REQ-FEED-009: pending-switch-indicator when pendingNextNoteId matches' indicator [data-testid=pending-switch-indicator] visible iff pendingNextNoteId === row.noteId. All assertions pass 100%."
  - id: CRIT-003
    dimension: spec_fidelity
    description: "REQ-FEED-010/011/012 — delete-flow guards and modal: delete button disabled (type-level + UI-level) when editing same note (REQ-FEED-010); valid click opens DeleteConfirmModal (REQ-FEED-011); modal contains 'OS のゴミ箱' text, role='dialog', confirm button red color #dd5b00 from DESIGN.md, Esc/backdrop dismiss (REQ-FEED-012). Covered by PROP-FEED-002, PROP-FEED-014, PROP-FEED-015, PROP-FEED-016, PROP-FEED-017, PROP-FEED-018, PROP-FEED-029."
    weight: 0.10
    passThreshold: "promptnotes/src/lib/feed/__tests__/feedRowPredicates.test.ts (bun:test) describe 'REQ-FEED-010 / PROP-FEED-002: isDeleteButtonDisabled safety' — isDeleteButtonDisabled(row, editing) === true iff row.noteId === editing fast-check property passes ≥200 numRuns. promptnotes/src/lib/feed/__tests__/dom/FeedRow.dom.vitest.ts describe 'PROP-FEED-014 / REQ-FEED-010: disabled delete button when editing same note' assertions pass 100%; describe 'PROP-FEED-015 / REQ-FEED-011: valid delete button click dispatches RequestNoteDeletion' assertions pass 100%. promptnotes/src/lib/feed/__tests__/dom/DeleteConfirmModal.dom.vitest.ts (vitest+jsdom) describe 'PROP-FEED-016 / REQ-FEED-012: modal content and structure' (role='dialog', text contains 'OS のゴミ箱', red confirm button), describe 'PROP-FEED-017 / REQ-FEED-012: Esc key dispatches CancelNoteDeletion (EC-FEED-011)', describe 'PROP-FEED-018 / REQ-FEED-012: Backdrop click dispatches CancelNoteDeletion (EC-FEED-012)', describe 'PROP-FEED-029 / REQ-FEED-012: confirm button click dispatches ConfirmNoteDeletion' all assertions pass 100%."
  - id: CRIT-004
    dimension: spec_fidelity
    description: "REQ-FEED-014 — deletion-failure banner with detail propagation: deletionErrorMessage(reason, detail?) returns non-empty Japanese string for 3 reasons {'permission','lock','unknown'}; appends '（{detail}）' suffix when detail !== undefined for 'unknown' (FIND-SPEC-3-01 lastDeletionError shape decision); banner has role='alert', retry button dispatches ConfirmNoteDeletion. Covered by PROP-FEED-008, PROP-FEED-009, PROP-FEED-019, PROP-FEED-028."
    weight: 0.08
    passThreshold: "promptnotes/src/lib/feed/__tests__/deleteConfirmPredicates.test.ts (bun:test) describe 'PROP-FEED-008: deletionErrorMessage totality' — for each reason in {'permission','lock','unknown'}, deletionErrorMessage(reason) returns string of length > 0; describe 'PROP-FEED-009: deletionErrorMessage non-empty and detail appended for unknown' — deletionErrorMessage('unknown', 'disk-full') === '削除に失敗しました（disk-full）', deletionErrorMessage('unknown', undefined) === '削除に失敗しました'. All assertions pass 100%. promptnotes/src/lib/feed/__tests__/dom/DeletionFailureBanner.dom.vitest.ts (vitest+jsdom) describe 'PROP-FEED-019 / REQ-FEED-014: DeletionFailureBanner DOM presence' (role='alert' rendered iff lastDeletionError !== null), describe 'PROP-FEED-019 / REQ-FEED-014: retry button dispatches ConfirmNoteDeletion', describe 'PROP-FEED-028 / REQ-FEED-014: banner text matches error reason' all assertions pass 100%."
  - id: CRIT-005
    dimension: spec_fidelity
    description: "REQ-FEED-007/008/013/017/018 — feed projection state: empty / filtered-empty / loading states are mutually exclusive; row removed on NoteFileDeleted (REQ-FEED-013); 'refresh-feed' command emitted iff action.kind ∈ {'FilterApplied','FilterCleared'} OR (action.kind === 'DomainSnapshotReceived' AND cause.kind ∈ {'NoteFileSaved','NoteFileDeleted'}) — biconditional from PROP-FEED-035. Covered by PROP-FEED-020, PROP-FEED-021, PROP-FEED-022, PROP-FEED-024, PROP-FEED-025, PROP-FEED-035."
    weight: 0.10
    passThreshold: "promptnotes/src/lib/feed/__tests__/dom/FeedList.dom.vitest.ts (vitest+jsdom) describe 'PROP-FEED-020 / REQ-FEED-007: empty feed state without filter' (renders empty-state element when visibleNoteIds=[] and filterApplied=false), describe 'PROP-FEED-021 / REQ-FEED-007: filtered empty state (EC-FEED-003)' (renders filtered-empty-state when visibleNoteIds=[] and filterApplied=true), describe 'PROP-FEED-022 / REQ-FEED-008: loading state (EC-FEED-015)' (skeleton renders when loadingStatus='loading'), describe 'PROP-FEED-024 / REQ-FEED-013: deleted note row disappears from DOM' (after NoteFileDeleted snapshot, that row's [data-testid=feed-row-{noteId}] absent), describe 'PROP-FEED-025 / REQ-FEED-018: filter update changes visible rows' all assertions pass 100%. promptnotes/src/lib/feed/__tests__/refreshFeedEmission.test.ts (bun:test, extracted during Phase 2c refactor from feedReducer.property.test.ts) describe \"PROP-FEED-035: 'refresh-feed' emission biconditional (fast-check)\" all biconditional cases pass with numRuns ≥ 300 covering 5 cause variants {NoteFileSaved, NoteFileDeleted, NoteDeletionFailed, EditingStateChanged, InitialLoad} × {FilterApplied, FilterCleared, DomainSnapshotReceived}."
  - id: CRIT-006
    dimension: edge_case_coverage
    description: "All 15 EC-FEED-001..015 from behavioral-spec.md have a named test in either bun:test or vitest+jsdom suites. Each EC is bound to a specific test path + describe block. EC-FEED-010 ('not-found' deletion reason) is documented as wire-unreachable per delete-note REQ-DLN-005 — defensive-only, no runtime test required."
    weight: 0.12
    passThreshold: "Each EC-FEED-NNN is verified by exactly one named test as follows. EC-FEED-001 (空状態): FeedList.dom.vitest.ts > 'PROP-FEED-020 / REQ-FEED-007: empty feed state without filter'. EC-FEED-002 (1件のみ): feedReducer.test.ts > 'PROP-FEED-007b: visibleNoteIds matches snapshot' fast-check covers length=1 case ≥200 runs. EC-FEED-003 (フィルタ後0件): FeedList.dom.vitest.ts > 'PROP-FEED-021 / REQ-FEED-007: filtered empty state (EC-FEED-003)'. EC-FEED-004 (saving 中クリック抑止): feedReducer.test.ts FeedRowClicked guard with editingStatus='saving' returns commands=[]. EC-FEED-005 (switching 中クリック抑止): feedReducer.test.ts FeedRowClicked guard with editingStatus='switching' returns commands=[]. EC-FEED-006 (編集中ノートの削除ボタン disabled): feedRowPredicates.test.ts > 'REQ-FEED-010 / PROP-FEED-002: isDeleteButtonDisabled safety' — isDeleteButtonDisabled(rowNoteId, editingNoteId) === true iff rowNoteId === editingNoteId fast-check property passes ≥200 numRuns (REQ-FEED-010 / NFR-FEED-001). EC-FEED-007 (permission エラー): deleteConfirmPredicates.test.ts > 'PROP-FEED-008: deletionErrorMessage totality' — deletionErrorMessage('permission') length > 0. EC-FEED-008 (lock エラー): deleteConfirmPredicates.test.ts > 'PROP-FEED-008' — deletionErrorMessage('lock') length > 0. EC-FEED-009 (unknown + detail): deleteConfirmPredicates.test.ts > 'PROP-FEED-009: deletionErrorMessage non-empty and detail appended for unknown' — deletionErrorMessage('unknown', 'disk-full') === '削除に失敗しました（disk-full）'. EC-FEED-010 (not-found): NOT TESTED — documented in REQ-FEED-014 cross-ref to delete-note REQ-DLN-005 as wire-unreachable. EC-FEED-011 (Esc cancel): DeleteConfirmModal.dom.vitest.ts > 'PROP-FEED-017 / REQ-FEED-012: Esc key dispatches CancelNoteDeletion (EC-FEED-011)'. EC-FEED-012 (backdrop cancel): DeleteConfirmModal.dom.vitest.ts > 'PROP-FEED-018 / REQ-FEED-012: Backdrop click dispatches CancelNoteDeletion (EC-FEED-012)'. EC-FEED-013 (modal 中の削除ボタン disable): feedRowPredicates.test.ts > 'PROP-FEED-002' — isDeleteButtonDisabled fast-check covers activeDeleteModalNoteId !== null cases ≥200 runs. EC-FEED-014 (削除ノート行消失): FeedList.dom.vitest.ts > 'PROP-FEED-024 / REQ-FEED-013: deleted note row disappears from DOM'. EC-FEED-015 (loading 中クリック抑止): feedReducer.test.ts FeedRowClicked guard with loadingStatus !== 'ready' returns commands=[] AND FeedList.dom.vitest.ts > 'PROP-FEED-022 / REQ-FEED-008: loading state' renders skeleton. All listed assertions pass 100%."
  - id: CRIT-007
    dimension: implementation_correctness
    description: "feedReducer is total and referentially transparent — for every (state, action) pair the reducer returns a defined {state: FeedViewState; commands: ReadonlyArray<FeedCommand>}, never throws, all commands[].kind values are within the FeedCommand discriminated union; same input always produces deep-equal output. Covered by PROP-FEED-005, PROP-FEED-006."
    weight: 0.10
    passThreshold: "promptnotes/src/lib/feed/__tests__/feedReducer.test.ts (bun:test) describe 'PROP-FEED-005: feedReducer totality' fast-check property 'PROP-FEED-005d: fast-check — totality over all (state, action) pairs' passes ≥300 numRuns (no undefined state, no throw, no out-of-enum status, no unknown command kind); describe 'PROP-FEED-006: feedReducer referential transparency' fast-check property 'PROP-FEED-006b: fast-check — same inputs always deep-equal' passes ≥200 numRuns. tsc --noEmit on promptnotes/ exits 0 for promptnotes/src/lib/feed/ (no new type errors)."
  - id: CRIT-008
    dimension: implementation_correctness
    description: "DomainSnapshotReceived mirroring (FIND-SPEC-3-01 resolution): when reducer receives a DomainSnapshotReceived action with snapshot S, the resulting FeedViewState mirrors S.editing.{status, currentNoteId, pendingNextNoteId} and S.feed.visibleNoteIds and S.delete.{activeDeleteModalNoteId, lastDeletionError}; cause.kind === 'NoteFileDeleted' resets lastDeletionError to null (REQ-FEED-014 cross-ref). Covered by PROP-FEED-007a/b/c/d."
    weight: 0.10
    passThreshold: "promptnotes/src/lib/feed/__tests__/feedReducer.test.ts (bun:test) describe 'PROP-FEED-007a: DomainSnapshotReceived mirrors editing fields' fast-check 'PROP-FEED-007a-fast-check: editingStatus/editingNoteId/pendingNextNoteId mirrored' passes ≥200 numRuns; describe 'PROP-FEED-007b: DomainSnapshotReceived mirrors visibleNoteIds' fast-check 'PROP-FEED-007b-fast-check: visibleNoteIds always mirrors snapshot' passes ≥200 numRuns; describe 'PROP-FEED-007c: LoadingStateChanged mirrors loadingStatus (REQ-FEED-008)' fast-check 'PROP-FEED-007c-fast-check: loadingStatus always mirrored' passes ≥200 numRuns; describe 'PROP-FEED-007d: DomainSnapshotReceived mirrors delete fields (FIND-SPEC-3-01)' fast-check 'PROP-FEED-007d-fast-check: NoteFileDeleted always yields lastDeletionError===null' passes ≥200 numRuns AND fast-check 'PROP-FEED-007d-fast-check: activeDeleteModalNoteId mirrors snapshot.delete.activeDeleteModalNoteId' passes ≥200 numRuns."
  - id: CRIT-009
    dimension: structural_integrity
    description: "NFR-FEED-005 — pure core boundary enforced by canonical grep audit on feedRowPredicates.ts, feedReducer.ts, deleteConfirmPredicates.ts; IPC boundary enforced on tauriFeedAdapter.ts (no `listen`) and feedStateChannel.ts (no `invoke`). Covers PROP-FEED-030, PROP-FEED-031, PROP-FEED-032. Also exhaustive switch enforcement (PROP-FEED-011, PROP-FEED-012) on NoteDeletionFailureReason at type level."
    weight: 0.10
    passThreshold: "promptnotes/src/lib/feed/__tests__/purityAudit.test.ts (bun:test) describe \"PROP-FEED-030: grep 'svelte/store' in src/lib/feed/ → zero hits\" assertion 'pure core has no svelte/store import' passes (zero matches). describe 'PROP-FEED-031: canonical purity-audit pattern → zero hits in pure modules' assertion enforces grep pattern `\\bDate\\.now\\b|\\bDate\\(|new Date\\b` returns zero hits over feedRowPredicates.ts, feedReducer.ts, deleteConfirmPredicates.ts; pattern also includes `@tauri-apps/api`, `window\\.`, `document\\.`, `setTimeout`. promptnotes/src/lib/feed/__tests__/ipcBoundary.test.ts (bun:test) describe 'PROP-FEED-032: IPC boundary audit' assertion 'tauriFeedAdapter.ts has no listen' passes (zero matches outside imports), assertion 'feedStateChannel.ts has no invoke' passes (zero matches outside imports). promptnotes/src/lib/feed/__tests__/deleteConfirmPredicates.test.ts (bun:test) describe 'PROP-FEED-011/012: exhaustive switch — Tier 0 type-level obligations' compile-time @ts-expect-error assertion passes (NoteDeletionFailureReason exactly 3-variant; adding a 4th variant yields compile error). All assertions pass 100%."
  - id: CRIT-010
    dimension: verification_readiness
    description: "NFR-FEED-001/002/003 — a11y and DESIGN.md token compliance: feed rows are <button> elements (not div role='button'); focus ring 2px solid #097fe8 on :focus-visible; tag pill max-width 160px (DESIGN.md §10 Component Dimension Tokens); banner role='alert'; modal role='dialog' with aria-labelledby. Covers DOM a11y assertions in PROP-FEED-013/014/015/016/019."
    weight: 0.06
    passThreshold: "promptnotes/src/lib/feed/__tests__/dom/FeedRow.dom.vitest.ts (vitest+jsdom) describe 'FeedRow DOM structure requirements' assertions: feed row uses <button> tag (not <div role='button'>) passes 100%; delete button has data-testid='delete-button' attribute passes 100%. promptnotes/src/lib/feed/__tests__/dom/DeleteConfirmModal.dom.vitest.ts describe 'PROP-FEED-016 / REQ-FEED-012: modal content and structure' assertion modal has role='dialog' AND aria-labelledby attribute passes 100%. promptnotes/src/lib/feed/__tests__/dom/DeletionFailureBanner.dom.vitest.ts describe 'PROP-FEED-019 / REQ-FEED-014: DeletionFailureBanner DOM presence' assertion banner has role='alert' passes 100%. NFR-FEED-003 (DESIGN.md token compliance) verified by source-grep at Phase 3: `grep -E 'max-width:\\s*160px|max-width:160px' promptnotes/src/lib/feed/FeedRow.svelte` returns ≥1 hit (Pill max-width); `grep -E '#dd5b00|color:\\s*#dd5b00' promptnotes/src/lib/feed/DeleteConfirmModal.svelte` returns ≥1 hit (red confirm button); `grep -E '#097fe8|focus.*ring|focus-visible' promptnotes/src/lib/feed/FeedRow.svelte` returns ≥1 hit (focus ring color). All grep checks pass at Phase 3 review time."
---

# Sprint 1: ui-feed-list-actions full implementation

This contract captures 10 acceptance criteria (CRIT-001..CRIT-010) derived from REQ-FEED-001..018, EC-FEED-001..015, NFR-FEED-001..005, and PROP-FEED-001..035 (007 split into 007a/b/c/d) as defined in `specs/behavioral-spec.md` and `specs/verification-architecture.md`.

The spec passed Phase 1c adversary review (iter-3 PASS) and human approval. Phase 2b green implementation passed 1463 bun:test + 174 vitest+jsdom (cross-feature) with 0 failures. Phase 2c refactor maintained green status. This contract is a renegotiation (negotiationRound: 1) addressing 8 findings from contract-review iter-1.

## Sprint Goal

Full working feed list with row click (select past note), delete confirmation modal, deletion failure banner with retry, filter/loading empty states, and all purity/IPC boundary constraints enforced. Shippable artifact: bun 1463 pass + vitest 174 pass (4 feed DOM files among them: FeedList.dom.vitest.ts, FeedRow.dom.vitest.ts, DeleteConfirmModal.dom.vitest.ts, DeletionFailureBanner.dom.vitest.ts), bun run check on feed/ produces 0 new errors.

## Dimension Distribution

| Dimension | CRITs | Weight Total |
|-----------|-------|--------------|
| spec_fidelity | CRIT-001, 002, 003, 004, 005 | 0.52 |
| edge_case_coverage | CRIT-006 | 0.12 |
| implementation_correctness | CRIT-007, 008 | 0.20 |
| structural_integrity | CRIT-009 | 0.10 |
| verification_readiness | CRIT-010 | 0.06 |
| **Total** | **10 CRIT** | **1.00** |

## Test Runner Conventions

- **bun:test** suites are under `promptnotes/src/lib/feed/__tests__/*.test.ts` (run via `bun test --run`).
- **vitest+jsdom** suites are under `promptnotes/src/lib/feed/__tests__/dom/*.vitest.ts` (run via `bun x vitest run`, jsdom env per `vitest.config.ts:22` glob).

## Pass Evidence (Phase 2b → 2c, baseline)

```
bun test --run                   1463 pass / 0 fail
bun x vitest run                 174 pass (23 files) / 0 fail
  └─ feed/__tests__/dom/         4 files, all pass
bun run check (feed/ scope)      0 new errors
PROP-FEED-030/031/032 grep       0 hits
```

## Out-of-scope Documentation

- **clockHelpers.ts**: Effectful shell helper providing `nowIso(): string`. Wraps `new Date().toISOString()` for component-tier event timestamping (REQ-FEED-005 / 011 dispatched commands carry `issuedAt: string`). Lives in shell tier alongside `tauriFeedAdapter.ts` / `feedStateChannel.ts`. **NOT subject** to PROP-FEED-031 canonical purity grep — by design effectful. Documented here because verification-architecture.md §2 enumerates only `tauriFeedAdapter.ts` and `feedStateChannel.ts`; the addition is a Phase 2c refactor outcome (extracted from scattered `new Date().toISOString()` calls in 3 components).
- **EC-FEED-010**: Removed from CRIT-006 — the `'not-found'` deletion failure reason never reaches the UI per delete-note REQ-DLN-005 (ハンドラは NoteFileDeleted のみ emit). Documented as defensive-only in REQ-FEED-014 cross-reference; not a runtime user-observable case.

## Iteration History

- iter-1 (FAIL): high=2 (CRIT-002 universal quantifier vs partial coverage; CRIT-005 vitest count repo-wide), medium=4, low=2.
- iter-2 (this version): 10 CRIT split with explicit per-EC binding, feed-scoped vitest threshold, named bun:test/vitest runner, explicit clockHelpers.ts documentation.
