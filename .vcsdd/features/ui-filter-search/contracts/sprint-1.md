---
sprintNumber: 1
feature: ui-filter-search
scope: "Search input with 200ms debounce, sort direction toggle, computeVisible pipeline (tag OR + search AND + sort), feedReducer extension (SearchApplied/SearchCleared/SortDirectionToggled), FeedList toolbar integration, unified feed-search-empty-state"
negotiationRound: 0
status: approved
---

# Sprint 1 Contract — ui-filter-search

## Scope

This sprint delivers the full ui-filter-search feature in a single sprint:
- Pure core: `searchPredicate`, `sortByUpdatedAt`, `computeVisible`
- Reducer extensions: `SearchApplied`, `SearchCleared`, `SortDirectionToggled`
- Effectful shell: `SearchInput.svelte` (debounce 200ms), `SortToggle.svelte`
- FeedList integration: search-toolbar, unified empty state
- Type extensions: `FeedViewState.searchQuery`, `FeedViewState.sortDirection`

## Criteria

- id: CRIT-001
  dimension: spec_fidelity
  description: All REQ-FILTER-001..017 items from behavioral-spec.md have corresponding test cases
  weight: 0.30
  passThreshold: Every requirement ID appears in at least one test file
  status: PASS
  evidence: feedReducer.search.test.ts, computeVisible.test.ts, searchPredicate.test.ts, sortByUpdatedAt.test.ts, SearchInput.dom.vitest.ts, SortToggle.dom.vitest.ts, FeedList.search-empty.dom.vitest.ts, searchPredicate.prop.test.ts

- id: CRIT-002
  dimension: edge_case_coverage
  description: Edge cases from behavioral-spec.md EC catalog are tested
  weight: 0.25
  passThreshold: Every critical edge case (EC-S-*, EC-T-*, EC-C-*) has an explicit test
  status: PASS
  evidence: EC-S-002 (whitespace-only query), EC-S-005 (Esc cancels debounce), EC-S-007 (note deleted while search active), EC-S-008 (tag-name search), EC-S-009 (Japanese no case change), EC-S-010 (Esc no pending), EC-S-014 (multiple Esc), EC-S-016 (rapid keystrokes coalesced), EC-T-001 (tiebreak noteId), EC-T-002 (updatedAt=0), EC-T-003 (sort while search active), EC-C-003 (tag filter preserved after SearchCleared), EC-C-004 (tag+search both empty), EC-C-006 (sort varies order not set)

- id: CRIT-003
  dimension: purity_boundary
  description: Pure core (searchPredicate, sortByUpdatedAt, computeVisible, feedReducer) is free of side effects; effectful shell (SearchInput.svelte debounce timer) is isolated
  weight: 0.20
  passThreshold: purityAudit.test.ts passes; no setTimeout in pure modules
  status: PASS
  evidence: purityAudit.test.ts lists searchPredicate.ts, sortByUpdatedAt.ts, computeVisible.ts in PURE_MODULES; debounce timer is inside SearchInput.svelte only

- id: CRIT-004
  dimension: regression_safety
  description: No pre-existing test regressions introduced by this sprint
  weight: 0.15
  passThreshold: All 1650 bun tests pass; DOM test failures are only pre-existing TagFilterSidebar ones
  status: PASS
  evidence: green-phase.txt — 1650/1650 bun pass; 248/253 DOM pass (5 pre-existing TagFilterSidebar failures)

- id: CRIT-005
  dimension: design_compliance
  description: DESIGN.md token compliance for SearchInput and SortToggle components
  weight: 0.10
  passThreshold: data-testid, aria-label, placeholder, class attributes match spec; DESIGN.md token classes verified structurally
  status: PASS
  evidence: SearchInput.dom.vitest.ts PROP-FILTER-017/025 pass; SortToggle.dom.vitest.ts REQ-FILTER-014/PROP-FILTER-025 pass
