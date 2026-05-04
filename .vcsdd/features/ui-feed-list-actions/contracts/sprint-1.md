---
sprintNumber: 1
feature: ui-feed-list-actions
scope: "Full Sprint 1 implementation of ui-feed-list-actions: pure core (feedReducer.ts, feedRowPredicates.ts, deleteConfirmPredicates.ts, types.ts), effectful shell (tauriFeedAdapter.ts, feedStateChannel.ts, clockHelpers.ts), and Svelte components (FeedList.svelte, FeedRow.svelte, DeleteConfirmModal.svelte, DeletionFailureBanner.svelte). Covers 18 REQ-FEED requirements and all PROP-FEED proof obligations for the feed list, row selection, delete confirmation modal, deletion failure banner, filter state, and loading state."
negotiationRound: 0
status: approved
criteria:
  - id: CRIT-001
    dimension: spec_fidelity
    description: All REQ-FEED-001..REQ-FEED-018 items from behavioral-spec.md have corresponding test cases in feedReducer.test.ts, feedRowPredicates.test.ts, or DOM vitest files
    weight: 0.25
    passThreshold: Every REQ-FEED-XXX ID appears in at least one test file; feedReducer.test.ts and feedRowPredicates.test.ts each have passing tests for their respective REQ-FEED scope
  - id: CRIT-002
    dimension: edge_case_coverage
    description: Edge cases EC-FEED-001..EC-FEED-015 from spec are tested; specifically EC-FEED-003 (filtered empty state), EC-FEED-004 (saving blocks row click), EC-FEED-005 (switching blocks row click), EC-FEED-014 (deleted note row absent), EC-FEED-015 (loading blocks row click)
    weight: 0.25
    passThreshold: EC-FEED-001 tested in FeedList.dom.vitest.ts; EC-FEED-003 tested in FeedList.dom.vitest.ts; EC-FEED-004/005/015 tested in feedReducer.test.ts; EC-FEED-014 tested in FeedList.dom.vitest.ts
  - id: CRIT-003
    dimension: implementation_correctness
    description: PROP-FEED-030/031/032 purity and IPC boundary constraints hold — pure core modules contain no forbidden APIs; tauriFeedAdapter.ts has no listen; feedStateChannel.ts has no invoke
    weight: 0.20
    passThreshold: purityAudit.test.ts 4/4 pass; ipcBoundary.test.ts 3/3 pass; grep for new Date/Date( in pure modules returns 0 hits
  - id: CRIT-004
    dimension: implementation_correctness
    description: feedReducer is total and pure — PROP-FEED-005/006/007a/007b/007c/007d all pass; refresh-feed biconditional (PROP-FEED-035) holds
    weight: 0.20
    passThreshold: feedReducer.test.ts all assertions pass including fast-check properties with numRuns≥200; PROP-FEED-035g biconditional fast-check passes with numRuns≥300
  - id: CRIT-005
    dimension: spec_fidelity
    description: DOM integration tests cover the rendered Svelte component tree — FeedList, FeedRow, DeleteConfirmModal, DeletionFailureBanner all have passing vitest DOM tests
    weight: 0.10
    passThreshold: vitest 174 tests pass across 23 files; all 4 DOM test files (FeedList.dom.vitest.ts, FeedRow.dom.vitest.ts, DeleteConfirmModal.dom.vitest.ts, DeletionFailureBanner.dom.vitest.ts) pass with 0 failures
---

# Sprint 1: ui-feed-list-actions full implementation

This contract captures 5 acceptance criteria derived from REQ-FEED-001..REQ-FEED-018, EC-FEED-001..EC-FEED-015, and PROP-FEED-001..PROP-FEED-035 as defined in `specs/behavioral-spec.md` and `specs/verification-architecture.md`.

The spec passed Phase 1c adversary review (iter-3 PASS) and human approval. All criteria have been met by the Phase 2b green implementation. Phase 2c refactor maintains all criteria.

## Sprint Goal

Full working feed list with row click (select past note), delete confirmation modal, deletion failure banner with retry, filter/loading empty states, and all purity/IPC boundary constraints enforced. Shippable artifact: bun 1463 pass + vitest 174 pass, type errors in feed/ = 0.

## Pass Evidence (Phase 2b → 2c)

bun test --run: 1463 pass, 0 fail
vitest run: 174 pass (23 files), 0 fail
bun run check feed/ errors: 0
purityAudit.test.ts: 4/4 pass
ipcBoundary.test.ts: 3/3 pass
