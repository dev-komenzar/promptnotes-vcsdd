# Verification Architecture — ui-filter-search

Feature: `ui-filter-search`
Phase: 1b
Mode: strict
Language: typescript

## 1. Purity Boundary Map

```
┌─────────────────────────────────────────────────────────────┐
│                    EFFECTFUL SHELL                           │
│                                                              │
│  SearchInput.svelte (new component)                          │
│  ├── Holds debounce timer (setTimeout / clearTimeout)        │
│  ├── Fires SearchInputChanged on every keystroke            │
│  ├── Fires SearchCleared on Esc key (cancels timer)         │
│  └── After 200ms silence: dispatches apply-search command   │
│                                                              │
│  SortToggle.svelte (new component)                           │
│  ├── DOM click event → dispatches SortDirectionToggled      │
│  └── Renders ▼/▲ based on sortDirection from viewState      │
│                                                              │
│  FeedList.svelte (extended)                                  │
│  ├── Wires SearchInput and SortToggle props                 │
│  ├── Handles apply-search / clear-search FeedCommand        │
│  │   by calling applyFilterOrSearch from domain             │
│  ├── Handles sort-direction-toggled command by calling      │
│  │   applyFilterOrSearch with new direction                 │
│  └── Updates visibleNoteIds in currentViewState             │
│                                                              │
│  (optional) searchDebounce.ts helper                         │
│  └── Wraps setTimeout/clearTimeout in a named function      │
│      for testability; still effectful (timer API)            │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                    PURE CORE                                 │
│                                                              │
│  feedReducer.ts (extended)                                   │
│  ├── SearchInputChanged: sets searchQuery in state           │
│  │   emits NO command (debounce is effectful shell's job)   │
│  ├── SearchCleared: sets searchQuery: '', emits clear-search │
│  │   command; recomputes visibleNoteIds immediately          │
│  ├── SortDirectionToggled: flips sortDirection,              │
│  │   emits apply-search command; recomputes visibleNoteIds  │
│  └── DomainSnapshotReceived: preserves searchQuery and       │
│      sortDirection; re-applies both to recompute             │
│      visibleNoteIds (AND composition with activeFilterTags)  │
│                                                              │
│  searchPredicate(query, metadata): boolean                   │
│  ├── Pure predicate extracted from applyFilterOrSearch       │
│  ├── Case-insensitive substring in body + space-joined tags │
│  └── Testable in isolation without domain aggregate types    │
│                                                              │
│  types.ts (extended)                                         │
│  ├── FeedViewState + searchQuery: string                     │
│  ├── FeedViewState + sortDirection: 'asc' | 'desc'          │
│  ├── FeedAction + SearchInputChanged / SearchCleared /       │
│  │   SortDirectionToggled                                    │
│  └── FeedCommand + apply-search / clear-search              │
│                                                              │
│  applyFilterOrSearch — domain pipeline (already pure)        │
│  ├── Tag filter (OR), search filter (AND), sort              │
│  └── Called by effectful shell; result drives visibleNoteIds │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 2. Proof Obligations

| ID | Description | Maps to REQ | Tier | Tool |
|----|-------------|-------------|------|------|
| PROP-FILTER-001 | `feedReducer` is pure after extension (no forbidden APIs) | REQ-FILTER-015 | 0 | grep audit |
| PROP-FILTER-002 | `SearchInputChanged` sets `searchQuery`, emits no command | REQ-FILTER-002 / REQ-FILTER-011 | 1 | vitest unit |
| PROP-FILTER-003 | `SearchCleared` sets `searchQuery: ''`, emits `clear-search` | REQ-FILTER-003 / REQ-FILTER-011 | 1 | vitest unit |
| PROP-FILTER-004 | `SortDirectionToggled` flips direction (desc→asc→desc), emits `apply-search` | REQ-FILTER-007 / REQ-FILTER-011 | 1 | vitest unit |
| PROP-FILTER-005 | `feedReducer` totality: never throws for any (state, action) pair | REQ-FILTER-015 | 2 | property test (fast-check) |
| PROP-FILTER-006 | `DomainSnapshotReceived` preserves `searchQuery` and `sortDirection` | REQ-FILTER-010 / REQ-FILTER-012 | 1 | vitest unit |
| PROP-FILTER-007 | `visibleNoteIds` recomputed on `DomainSnapshotReceived` with both active filter and search | REQ-FILTER-012 | 1 | vitest unit |
| PROP-FILTER-008 | `SearchCleared` immediately recomputes `visibleNoteIds` without search predicate | REQ-FILTER-003 | 1 | vitest unit |
| PROP-FILTER-009 | `SortDirectionToggled` immediately recomputes `visibleNoteIds` with new order | REQ-FILTER-007 / REQ-FILTER-009 | 1 | vitest unit |
| PROP-FILTER-010 | `searchPredicate` is case-insensitive substring over body + tags | REQ-FILTER-005 | 2 | property test (fast-check) |
| PROP-FILTER-011 | `searchPredicate` with null/empty query always returns true (no-op) | REQ-FILTER-005 / EC-S-001 | 1 | vitest unit |
| PROP-FILTER-012 | AND composition: tag filter + search both applied on snapshot receipt | REQ-FILTER-008 | 1 | vitest unit |
| PROP-FILTER-013 | Tag filter preserved, search cleared: tag filter still applies | REQ-FILTER-008 / EC-C-003 | 1 | vitest unit |
| PROP-FILTER-014 | Sort order is deterministic; tiebreak by noteId same direction | REQ-FILTER-009 / EC-T-001 | 1 | vitest unit |
| PROP-FILTER-015 | `feed-search-empty-state` shown when visibleNoteIds empty and searchQuery or activeFilterTags non-empty | REQ-FILTER-004 | 1 | DOM test (vitest + jsdom) |
| PROP-FILTER-016 | `feed-empty-state` shown when visibleNoteIds empty, searchQuery empty, activeFilterTags empty | REQ-FILTER-004 | 1 | DOM test (vitest + jsdom) |
| PROP-FILTER-017 | Search input renders with DESIGN.md tokens (border, padding, placeholder color) | REQ-FILTER-001 / REQ-FILTER-014 | 1 | DOM test |
| PROP-FILTER-018 | Sort toggle renders ▼ by default; changes to ▲ on click | REQ-FILTER-006 / REQ-FILTER-007 | 1 | DOM test |
| PROP-FILTER-019 | Esc key on search input fires SearchCleared immediately (no debounce) | REQ-FILTER-003 | 1 | DOM test |
| PROP-FILTER-020 | DESIGN.md token audit: no unlisted hex/rgba in SearchInput.svelte and SortToggle.svelte | REQ-FILTER-014 | 0 | audit script |
| PROP-FILTER-021 | TypeScript: new FeedAction / FeedCommand variants compile; exhaustive switch holds | REQ-FILTER-011 | 0 | tsc compile |
| PROP-FILTER-022 | Rapid keystrokes: applyFilterOrSearch called only after last keystroke + 200ms | REQ-FILTER-002 / EC-S-001 | 1 | vitest with fake timers |
| PROP-FILTER-023 | Whitespace-only query treated as no-search (query: null) | EC-S-002 | 1 | vitest unit |
| PROP-FILTER-024 | Esc while debounce pending: timer cancelled, clear fires immediately | EC-S-005 | 1 | vitest with fake timers |

## 3. Verification Tiers

### Tier 0 — Static / Grep checks (no test runner required)

These checks run in CI before any test suite.

| Check | Target | Gate |
|-------|--------|------|
| Purity audit grep | `feedReducer.ts` | Zero hits for `setTimeout|Date\.now|fetch|invoke|\$state|\$effect|\$derived` |
| TypeScript compile | `types.ts`, `feedReducer.ts` | `tsc --noEmit` exits 0 |
| DESIGN.md token audit | `SearchInput.svelte`, `SortToggle.svelte` | No unlisted hex/rgba values |

Covers: PROP-FILTER-001, PROP-FILTER-020, PROP-FILTER-021

### Tier 1 — Unit / Component / DOM tests (vitest)

Deterministic tests that run in Node.js or jsdom without a browser. Fast (< 30s total).

**Reducer unit tests** (`feedReducer.search.test.ts`):

| Test | Covers |
|------|--------|
| `SearchInputChanged(query)` → state.searchQuery === query, commands === [] | PROP-FILTER-002 |
| `SearchCleared` → state.searchQuery === '', commands contains `clear-search` | PROP-FILTER-003 |
| `SortDirectionToggled` from desc → state.sortDirection === 'asc' | PROP-FILTER-004 |
| `SortDirectionToggled` from asc → state.sortDirection === 'desc' | PROP-FILTER-004 |
| `SortDirectionToggled` emits `apply-search` command with new direction | PROP-FILTER-004 |
| `DomainSnapshotReceived` preserves searchQuery | PROP-FILTER-006 |
| `DomainSnapshotReceived` preserves sortDirection | PROP-FILTER-006 |
| `DomainSnapshotReceived` with searchQuery active: visibleNoteIds filtered | PROP-FILTER-007 |
| `SearchCleared` recomputes visibleNoteIds without search | PROP-FILTER-008 |
| `SortDirectionToggled` recomputes visibleNoteIds in new order | PROP-FILTER-009 |
| `searchPredicate('', metadata)` → true | PROP-FILTER-011 |
| `searchPredicate('hello', {body:'Hello World', tags:[]})` → true | PROP-FILTER-010 |
| `searchPredicate('draft', {body:'', tags:['draft']})` → true | PROP-FILTER-010 |
| AND composition: tag + search both active on snapshot | PROP-FILTER-012 |
| Tag filter preserved after SearchCleared | PROP-FILTER-013 |
| Sort tiebreak deterministic for equal updatedAt | PROP-FILTER-014 |
| Whitespace-only query treated as no-search | PROP-FILTER-023 |

**Debounce unit tests** (`searchDebounce.test.ts`, vitest fake timers):

| Test | Covers |
|------|--------|
| applyFilterOrSearch not called within 200ms of keystroke | PROP-FILTER-022 |
| applyFilterOrSearch called exactly once after 200ms silence | PROP-FILTER-022 |
| Esc cancels pending timer, clear fires immediately | PROP-FILTER-024 |

**DOM tests** (`SearchInput.dom.vitest.ts`, `SortToggle.dom.vitest.ts`):

| Test | Covers |
|------|--------|
| `data-testid="search-input"` present | PROP-FILTER-017 |
| Input border is `1px solid #dddddd` | PROP-FILTER-017 |
| Placeholder text "検索..." | PROP-FILTER-017 |
| `data-testid="sort-toggle"` text is "▼" initially | PROP-FILTER-018 |
| Clicking sort toggle changes text to "▲" | PROP-FILTER-018 |
| Esc key on search input fires SearchCleared | PROP-FILTER-019 |

**FeedList empty-state DOM tests** (`FeedList.search-empty.dom.vitest.ts`):

| Test | Covers |
|------|--------|
| `feed-search-empty-state` shown when visibleNoteIds empty + searchQuery set | PROP-FILTER-015 |
| `feed-empty-state` shown when no notes, no filter | PROP-FILTER-016 |
| `feed-search-empty-state` text is "検索条件に一致するノートがありません" | PROP-FILTER-015 |

### Tier 2 — Property tests (fast-check)

Generative tests that run after Tier 1 in CI. May take up to 60s.

| Property | Test file | Covers |
|----------|-----------|--------|
| For any string query and any NoteRowMetadata, `searchPredicate` is true iff body+tags contains query as case-insensitive substring | `searchPredicate.property.test.ts` | PROP-FILTER-010 |
| `feedReducer` never throws for any (FeedViewState, FeedAction) pair (totality) | `feedReducer.property.test.ts` | PROP-FILTER-005 |

### Tier 3 — Formal proof

Not required for this feature. The pure functions (`searchPredicate`, `feedReducer` extension) are covered by Tier 2 property tests. Tier 3 is reserved for security-critical boundaries (e.g., `configure-vault`).

## 4. Test File Map

| File (under `promptnotes/src/`) | Tier | Phase |
|--------------------------------|------|-------|
| `lib/feed/__tests__/feedReducer.search.test.ts` | 1 | 2a |
| `lib/feed/__tests__/searchDebounce.test.ts` | 1 | 2a |
| `lib/feed/__tests__/dom/SearchInput.dom.vitest.ts` | 1 | 2a |
| `lib/feed/__tests__/dom/SortToggle.dom.vitest.ts` | 1 | 2a |
| `lib/feed/__tests__/dom/FeedList.search-empty.dom.vitest.ts` | 1 | 2a |
| `lib/feed/__tests__/searchPredicate.property.test.ts` | 2 | 2a |
| `lib/feed/__tests__/feedReducer.property.test.ts` | 2 | 2a (extends existing) |

## 5. Regression Baseline

The following test files from prior features must remain green throughout Phase 2a–2c:

| Test file | Feature |
|-----------|---------|
| `feedReducer.tag.test.ts` | ui-tag-chip |
| `tagInventory.test.ts` | ui-tag-chip |
| `types.tag.test.ts` | ui-tag-chip |
| `dom/TagFilterSidebar.dom.vitest.ts` | ui-tag-chip |
| `tagSaveAdapter.test.ts` | ui-tag-chip |
| All `ui-feed-list-actions` tests | ui-feed-list-actions |

## 6. Proof Obligation Summary Table

| ID | Description | Tier | Required | Tool |
|----|-------------|------|----------|------|
| PROP-FILTER-001 | feedReducer purity after extension | 0 | true | grep |
| PROP-FILTER-002 | SearchInputChanged: sets searchQuery, no command | 1 | true | vitest |
| PROP-FILTER-003 | SearchCleared: resets query, emits clear-search | 1 | true | vitest |
| PROP-FILTER-004 | SortDirectionToggled: flips direction, emits apply-search | 1 | true | vitest |
| PROP-FILTER-005 | feedReducer totality over all (state, action) | 2 | true | fast-check |
| PROP-FILTER-006 | DomainSnapshotReceived preserves searchQuery + sortDirection | 1 | true | vitest |
| PROP-FILTER-007 | DomainSnapshotReceived recomputes visibleNoteIds with search active | 1 | true | vitest |
| PROP-FILTER-008 | SearchCleared immediately recomputes visibleNoteIds | 1 | true | vitest |
| PROP-FILTER-009 | SortDirectionToggled immediately recomputes visibleNoteIds | 1 | true | vitest |
| PROP-FILTER-010 | searchPredicate case-insensitive substring semantics | 2 | true | fast-check |
| PROP-FILTER-011 | searchPredicate empty/null query is universal pass | 1 | true | vitest |
| PROP-FILTER-012 | AND composition: tag + search on snapshot receipt | 1 | true | vitest |
| PROP-FILTER-013 | Tag filter preserved after search cleared | 1 | true | vitest |
| PROP-FILTER-014 | Sort is deterministic with tiebreak | 1 | true | vitest |
| PROP-FILTER-015 | feed-search-empty-state DOM appearance | 1 | true | vitest+jsdom |
| PROP-FILTER-016 | feed-empty-state DOM appearance (no filter/search) | 1 | true | vitest+jsdom |
| PROP-FILTER-017 | SearchInput DESIGN.md token compliance (DOM) | 1 | true | vitest+jsdom |
| PROP-FILTER-018 | SortToggle ▼/▲ toggle behavior (DOM) | 1 | true | vitest+jsdom |
| PROP-FILTER-019 | Esc key fires SearchCleared immediately (DOM) | 1 | true | vitest+jsdom |
| PROP-FILTER-020 | DESIGN.md token audit on new .svelte files | 0 | true | audit script |
| PROP-FILTER-021 | TypeScript exhaustive switch compile check | 0 | true | tsc |
| PROP-FILTER-022 | Debounce: applyFilterOrSearch only after 200ms silence | 1 | true | vitest fake-timers |
| PROP-FILTER-023 | Whitespace-only query treated as no-search | 1 | true | vitest |
| PROP-FILTER-024 | Esc cancels pending debounce timer | 1 | true | vitest fake-timers |
