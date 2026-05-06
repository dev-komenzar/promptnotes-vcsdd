---
sprintNumber: 1
feature: ui-filter-search
mode: strict
language: typescript
scope: "Search input with 200ms debounce, sort direction toggle, computeVisible pipeline (tag OR + search AND + sort), feedReducer extension (SearchApplied/SearchCleared/SortDirectionToggled), FeedList toolbar integration, unified feed-search-empty-state"
---

# Sprint 1 Contract — ui-filter-search

## Scope

This sprint delivers the full ui-filter-search feature in a single sprint:
- Pure core: `searchPredicate`, `sortByUpdatedAt`, `computeVisible`
- Reducer extensions: `SearchApplied`, `SearchCleared`, `SortDirectionToggled`
- Effectful shell: `SearchInput.svelte` (debounce 200ms), `SortToggle.svelte`
- FeedList integration: search-toolbar, unified empty state
- Type extensions: `FeedViewState.searchQuery`, `FeedViewState.sortDirection`

## Overall Pass Threshold

All 5 dimensions PASS. Each CRIT criterion within a dimension is individually required (no partial credit). NON-CRIT criteria allow the stated threshold.

---

## Dimension 1: spec_fidelity

**Description**: All REQ-FILTER-001..017 items from behavioral-spec.md have executable test assertions, and PROP-FILTER-002..004 / 006..009 / 011..019 / 022..025 are each covered in at least one named test file.

### CRIT Criteria

- **CRIT-SF-001** — Every REQ-FILTER-001 through REQ-FILTER-017 has at least one executable test assertion (not a stub) that names the REQ ID in a describe/it block or comment. Pass threshold: `grep -r "REQ-FILTER-0" promptnotes/src/lib/feed/__tests__/` returns a match for each of the 17 REQ IDs, AND `bun test` exits 0 for all files that cite those IDs.

- **CRIT-SF-002** — PROP-FILTER-002, 003, 004, 006, 007, 008, 009, 011, 012, 013, 014 (Tier 1 unit/reducer props) each pass in `feedReducer.search.test.ts` or `computeVisible.test.ts` or `searchPredicate.test.ts` or `sortByUpdatedAt.test.ts`. Pass threshold: all named test files exit 0 under `bun test`.

### NON-CRIT Criteria

- **NC-SF-001** — PROP-FILTER-015, 016 (empty-state props) covered in `FeedList.search-empty.dom.vitest.ts`. Pass threshold: file exists and both tests pass in DOM runner.

**Evidence sources**: `feedReducer.search.test.ts`, `computeVisible.test.ts`, `searchPredicate.test.ts`, `sortByUpdatedAt.test.ts`, `searchDebounce.test.ts`, `SearchInput.dom.vitest.ts`, `SortToggle.dom.vitest.ts`, `FeedList.search-empty.dom.vitest.ts`

---

## Dimension 2: edge_case_coverage

**Description**: All 28 edge cases defined in behavioral-spec.md §4.1 Edge Case Catalog (EC-S-001..016, EC-T-001..005, EC-C-001..007) have at least one executable test assertion. EC-T-004 and EC-C-007 are explicitly required as CRIT because they guard race-freedom obligations PROP-FILTER-022 and PROP-FILTER-024.

### CRIT Criteria

- **CRIT-EC-001** — All 28 EC IDs (EC-S-001 through EC-S-016, EC-T-001 through EC-T-005, EC-C-001 through EC-C-007) appear as named test cases in the test suite. Pass threshold: `grep -r "EC-S-\|EC-T-\|EC-C-" promptnotes/src/lib/feed/__tests__/` returns at least one match per EC ID. Each matched test must contain an executable assertion, not only a label.

- **CRIT-EC-002** — EC-T-004 (toggle sort while debounce pending) and EC-C-007 (DomainSnapshotReceived while debounce mid-flight) each have a dedicated test asserting no reducer-shell race. These guard PROP-FILTER-022 and PROP-FILTER-024. Pass threshold: test for EC-T-004 verifies `SortDirectionToggled` state is preserved when `SearchApplied` fires after it; test for EC-C-007 verifies `DomainSnapshotReceived` does not cancel the pending timer and the subsequent `SearchApplied` applies correctly.

### NON-CRIT Criteria

- **NC-EC-001** — EC-S-011 (control chars), EC-S-012 (10 000-char query), EC-S-013 (RTL chars), EC-S-015 (regex chars literal) have tests in `feedReducer.search.test.ts` or `searchPredicate.prop.test.ts`. Pass threshold: at least one of these ECs is covered by a property test (fast-check) in the property test suite.

**Evidence sources**: `feedReducer.search.test.ts`, `computeVisible.test.ts`, `dom/SearchInput.dom.vitest.ts`, `searchPredicate.prop.test.ts`

---

## Dimension 3: implementation_correctness

**Description**: The implementation is bug-free for the obligations that are hardest to verify by inspection: reducer totality (PROP-FILTER-005), searchPredicate correctness (PROP-FILTER-010), sort determinism (PROP-FILTER-014), debounce coalescing (PROP-FILTER-022), whitespace-only query (PROP-FILTER-023), and Esc-cancels-timer (PROP-FILTER-024).

### CRIT Criteria

- **CRIT-IC-001** — PROP-FILTER-005: `feedReducer` never throws for any `SearchApplied { query }` where `query` is any string (length 0..10000, any Unicode). Pass threshold: `searchPredicate.prop.test.ts` (or `feedReducer.property.test.ts` or `prop/feedReducer.totality.test.ts`) contains a fast-check property test for PROP-FILTER-005 that passes under `bun test`.

- **CRIT-IC-002** — PROP-FILTER-010: `searchPredicate` uses `String.prototype.toLowerCase()` (not `toLocaleLowerCase()`), is case-insensitive substring, returns `true` for empty needle. Pass threshold: property test for PROP-FILTER-010 passes under `bun test`; `grep -n "toLocaleLowerCase" promptnotes/src/lib/feed/searchPredicate.ts` returns zero matches.

- **CRIT-IC-003** — PROP-FILTER-014: `sortByUpdatedAt` tiebreak by `noteId` lexicographic in the same sort direction is deterministic. Pass threshold: `sortByUpdatedAt.test.ts` contains a test for EC-T-001 that passes.

- **CRIT-IC-004** — PROP-FILTER-022: rapid keystrokes within 200ms window dispatch exactly one `SearchApplied` after the last keystroke + 200ms silence. Pass threshold: `dom/SearchInput.dom.vitest.ts` (vitest fake timers, debounce-related `it()` blocks covering EC-S-016) covers this and passes.

- **CRIT-IC-005** — PROP-FILTER-023: whitespace-only query `"   "` dispatched via `SearchApplied` does NOT short-circuit to no-search in the reducer. Pass threshold: unit test in `feedReducer.search.test.ts` for EC-S-002 passes.

- **CRIT-IC-006** — PROP-FILTER-024: Esc while debounce pending cancels the timer and fires `SearchCleared` immediately. Pass threshold: `dom/SearchInput.dom.vitest.ts` (vitest fake timers, EC-S-005 `it()` block) covers this and passes.

### NON-CRIT Criteria

- **NC-IC-001** — All existing tests (pre-sprint baseline) continue to pass after the sprint's changes. Pass threshold: all previously passing bun tests still pass; any DOM test failures are limited to failures that existed before this sprint (recorded in `evidence/regression-baseline.json`).

**Evidence sources**: `searchPredicate.prop.test.ts`, `prop/feedReducer.totality.test.ts`, `sortByUpdatedAt.test.ts`, `feedReducer.search.test.ts`, `dom/SearchInput.dom.vitest.ts`, `evidence/regression-baseline.json`

---

## Dimension 4: structural_integrity

**Description**: `computeVisible` is the single source of truth for `visibleNoteIds` recomputation. No duplicated tag-filter or search-filter logic exists between `feedReducer` and `computeVisible`. Dead code is absent. `SearchInputChanged` is not in the `FeedAction` union.

### CRIT Criteria

- **CRIT-SI-001** — `computeVisible` is the single source of truth: all four reducer cases (`SearchApplied`, `SearchCleared`, `SortDirectionToggled`, `DomainSnapshotReceived`) call `computeVisible` and do not inline tag-filter or search-filter logic. Pass threshold: `grep -n "allNoteIds.filter" promptnotes/src/lib/feed/feedReducer.ts` returns zero matches outside of `computeVisible.ts`.

- **CRIT-SI-002** — `SearchInputChanged` is absent from `FeedAction`. Pass threshold: `grep -rn "SearchInputChanged" promptnotes/src/lib/feed/` returns zero matches (PROP-FILTER-021).

- **CRIT-SI-003** — No dead code for `FilterApplied` / `FilterCleared` handling was removed from `FeedList.svelte` during 2c refactor, and the refactor extracted `searchSortOf` as a named helper in `feedReducer`. Pass threshold: `grep -n "searchSortOf" promptnotes/src/lib/feed/feedReducer.ts` returns at least one match; `grep -n "filterApplied" promptnotes/src/lib/feed/FeedList.svelte` returns zero matches (dead state removed in 2c).

### NON-CRIT Criteria

- **NC-SI-001** — TypeScript compiles cleanly: `tsc --noEmit` exits 0 on `types.ts` and `feedReducer.ts` (PROP-FILTER-021 compile gate). Pass threshold: `tsc --noEmit` exits 0.

**Evidence sources**: `promptnotes/src/lib/feed/feedReducer.ts`, `promptnotes/src/lib/feed/computeVisible.ts`, `promptnotes/src/lib/feed/FeedList.svelte`, `promptnotes/src/lib/feed/types.ts`

---

## Dimension 5: verification_readiness

**Description**: All 25 PROP-FILTER-001..025 proof obligations are either covered by a passing test / grep audit, or explicitly deferred with a reason. Tier 0 grep audits are runnable as-is. Tier 2 property tests exist and pass. Phase 5 harnesses can be wired without structural changes.

### CRIT Criteria

- **CRIT-VR-001** — PROP-FILTER-001 (purity grep audit): `grep -E "setTimeout|Date\.now|Date\(|new Date|Math\.random|fetch|invoke|\$state|\$effect|\$derived" promptnotes/src/lib/feed/feedReducer.ts` returns zero matches. All six forbidden API patterns listed in PROP-FILTER-001 are covered. Pass threshold: grep command exits 1 (no matches found).

- **CRIT-VR-002** — PROP-FILTER-020 (DESIGN.md token audit): `grep -E "#[0-9a-fA-F]{3,6}|rgba\(" promptnotes/src/lib/feed/SearchInput.svelte promptnotes/src/lib/feed/SortToggle.svelte` returns only values listed in DESIGN.md §10 Token Reference. Pass threshold: manual or scripted token comparison yields zero unlisted values.

- **CRIT-VR-003** — The purity audit test file exists at `promptnotes/src/lib/feed/__tests__/purityAudit.test.ts` and lists `searchPredicate.ts`, `sortByUpdatedAt.ts`, `computeVisible.ts` in its `PURE_MODULES` array. Pass threshold: `grep -n "PURE_MODULES" promptnotes/src/lib/feed/__tests__/purityAudit.test.ts` returns a match containing all three module names.

### NON-CRIT Criteria

- **NC-VR-001** — PROP-FILTER-017 (SearchInput DESIGN.md tokens), PROP-FILTER-018 (SortToggle ▼/▲ render), PROP-FILTER-019 (Esc fires SearchCleared), PROP-FILTER-025 (aria-labels + Tab reachability) all pass in DOM test runner (`SearchInput.dom.vitest.ts`, `SortToggle.dom.vitest.ts`). Pass threshold: all four DOM test files exit 0.

- **NC-VR-002** — PROP-FILTER-005 (reducer totality, fast-check) and PROP-FILTER-010 (searchPredicate property, fast-check) test files exist and are wired into the bun test suite. Pass threshold: both files exist under `promptnotes/src/lib/feed/__tests__/` and are included in `bun test` run.

**Evidence sources**: `promptnotes/src/lib/feed/__tests__/purityAudit.test.ts`, `promptnotes/src/lib/feed/feedReducer.ts`, `promptnotes/src/lib/feed/SearchInput.svelte`, `promptnotes/src/lib/feed/SortToggle.svelte`, `searchPredicate.prop.test.ts`, `feedReducer.property.test.ts`

---

## PROP-FILTER Coverage Map

All 25 PROP-FILTER-NNN obligations are assigned to a dimension:

| PROP | Dimension | CRIT/NON-CRIT | Criterion |
|------|-----------|---------------|-----------|
| PROP-FILTER-001 | verification_readiness | CRIT | CRIT-VR-001 |
| PROP-FILTER-002 | spec_fidelity | CRIT | CRIT-SF-002 |
| PROP-FILTER-003 | spec_fidelity | CRIT | CRIT-SF-002 |
| PROP-FILTER-004 | spec_fidelity | CRIT | CRIT-SF-002 |
| PROP-FILTER-005 | implementation_correctness | CRIT | CRIT-IC-001 |
| PROP-FILTER-006 | spec_fidelity | CRIT | CRIT-SF-002 |
| PROP-FILTER-007 | spec_fidelity | CRIT | CRIT-SF-002 |
| PROP-FILTER-008 | spec_fidelity | CRIT | CRIT-SF-002 |
| PROP-FILTER-009 | spec_fidelity | CRIT | CRIT-SF-002 |
| PROP-FILTER-010 | implementation_correctness | CRIT | CRIT-IC-002 |
| PROP-FILTER-011 | spec_fidelity | CRIT | CRIT-SF-002 |
| PROP-FILTER-012 | spec_fidelity | CRIT | CRIT-SF-002 |
| PROP-FILTER-013 | spec_fidelity | CRIT | CRIT-SF-002 |
| PROP-FILTER-014 | implementation_correctness | CRIT | CRIT-IC-003 |
| PROP-FILTER-015 | spec_fidelity | NON-CRIT | NC-SF-001 |
| PROP-FILTER-016 | spec_fidelity | NON-CRIT | NC-SF-001 |
| PROP-FILTER-017 | verification_readiness | NON-CRIT | NC-VR-001 |
| PROP-FILTER-018 | verification_readiness | NON-CRIT | NC-VR-001 |
| PROP-FILTER-019 | verification_readiness | NON-CRIT | NC-VR-001 |
| PROP-FILTER-020 | verification_readiness | CRIT | CRIT-VR-002 |
| PROP-FILTER-021 | structural_integrity | CRIT | CRIT-SI-002 |
| PROP-FILTER-022 | implementation_correctness | CRIT | CRIT-IC-004 |
| PROP-FILTER-023 | implementation_correctness | CRIT | CRIT-IC-005 |
| PROP-FILTER-024 | implementation_correctness | CRIT | CRIT-IC-006 |
| PROP-FILTER-025 | verification_readiness | NON-CRIT | NC-VR-001 |
