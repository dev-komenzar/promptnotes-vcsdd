# Verification Architecture — ui-filter-search

Feature: `ui-filter-search`
Phase: 1b
Mode: strict
Language: typescript
Iteration: 2

## 1. Purity Boundary Map

```
┌─────────────────────────────────────────────────────────────┐
│                    EFFECTFUL SHELL                           │
│                                                              │
│  SearchInput.svelte (new component)                          │
│  ├── Holds raw pending input as local $state (never sent     │
│  │   to reducer until debounce fires)                        │
│  ├── Holds debounce timer (setTimeout / clearTimeout)        │
│  ├── On timer expiry: dispatches SearchApplied to reducer    │
│  └── On Escape key: clearTimeout + dispatches SearchCleared  │
│                                                              │
│  SortToggle.svelte (new component)                           │
│  ├── DOM click event → dispatches SortDirectionToggled       │
│  └── Renders ▼/▲ based on sortDirection from viewState       │
│                                                              │
│  FeedList.svelte (extended)                                  │
│  ├── Wires SearchInput and SortToggle props                  │
│  └── Dispatches SearchApplied / SearchCleared /              │
│      SortDirectionToggled from child components              │
│                                                              │
│  (optional) createDebounceTimer helper                        │
│  └── Wraps setTimeout/clearTimeout for testability;          │
│      still effectful (timer API)                             │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                    PURE CORE                                 │
│                                                              │
│  feedReducer.ts (extended)                                   │
│  ├── SearchApplied: sets searchQuery, calls computeVisible   │
│  │   to recompute visibleNoteIds; returns commands: []       │
│  ├── SearchCleared: sets searchQuery: '', calls              │
│  │   computeVisible; returns commands: []                    │
│  ├── SortDirectionToggled: flips sortDirection, calls        │
│  │   computeVisible; returns commands: []                    │
│  └── DomainSnapshotReceived: preserves searchQuery and       │
│      sortDirection; calls computeVisible with both active    │
│      filter and search                                       │
│                                                              │
│  computeVisible(allNoteIds, noteMetadata, activeTags,        │
│                 searchQuery, sortDir): readonly string[]      │
│  ├── Step 1: tag filter (OR semantics, same as TagFilter-    │
│  │   Toggled inline logic)                                   │
│  ├── Step 2: search filter (AND, via searchPredicate)        │
│  └── Step 3: sort by updatedAt (tiebreak: noteId)           │
│                                                              │
│  searchPredicate(needle: string, haystack: string): boolean  │
│  ├── Case-insensitive substring: needle.toLowerCase()        │
│  │   in haystack.toLowerCase()                               │
│  ├── Uses String.prototype.toLowerCase() ONLY                │
│  │   (toLocaleLowerCase() is PROHIBITED)                     │
│  └── Empty needle → always returns true                      │
│                                                              │
│  sortByUpdatedAt(direction, noteMetadata): comparator        │
│  ├── Primary key: NoteRowMetadata.updatedAt (epoch ms)       │
│  └── Tiebreak: noteId lexicographic same direction           │
│                                                              │
│  types.ts (extended)                                         │
│  ├── FeedViewState + searchQuery: string                     │
│  ├── FeedViewState + sortDirection: 'asc' | 'desc'           │
│  └── FeedAction + SearchApplied / SearchCleared /            │
│      SortDirectionToggled                                    │
│                                                              │
│  NOT in pure core (decision FIND-SPEC-FILTER-001/002/003):  │
│  ├── applyFilterOrSearch domain function — NOT called from   │
│  │   reducer or any pure function in this feature.           │
│  │   Preserved for future Tauri-side use. Warm-standby.     │
│  └── SearchInputChanged — does NOT exist in FeedAction.      │
│      Pending keystrokes are shell-local $state only.         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 Backward-Compatible Artifacts (not used, not removed)

| Artifact | Status | Decision |
|---------|--------|---------|
| `FilterApplied` in `FeedAction` | Preserved | Backward-compatible. NOT used by ui-filter-search. |
| `FilterCleared` in `FeedAction` | Preserved | Backward-compatible. NOT used by ui-filter-search. |
| `applyFilterOrSearch` domain function | Preserved | NOT called by this UI feature. Reserved for future Tauri-side normalization. |

## 2. Proof Obligations

| ID | Description | Maps to REQ | Tier | Required | Tool |
|----|-------------|-------------|------|----------|------|
| PROP-FILTER-001 | `feedReducer` is pure after extension (no forbidden APIs) | REQ-FILTER-015 | 0 | true | grep audit |
| PROP-FILTER-002 | `SearchApplied(query)` sets `searchQuery`, recomputes `visibleNoteIds`, returns `commands: []` | REQ-FILTER-002 / REQ-FILTER-011 | 1 | true | vitest |
| PROP-FILTER-003 | `SearchCleared` sets `searchQuery: ''`, recomputes `visibleNoteIds`, returns `commands: []` | REQ-FILTER-003 / REQ-FILTER-011 | 1 | true | vitest |
| PROP-FILTER-004 | `SortDirectionToggled` flips direction (desc→asc→desc), recomputes `visibleNoteIds`, returns `commands: []` | REQ-FILTER-007 / REQ-FILTER-011 | 1 | true | vitest |
| PROP-FILTER-005 | `feedReducer` totality: never throws for any (state, action) pair including SearchApplied with any string | REQ-FILTER-015 / REQ-FILTER-017 | 2 | true | property test (fast-check) |
| PROP-FILTER-006 | `DomainSnapshotReceived` preserves `searchQuery` and `sortDirection` | REQ-FILTER-010 / REQ-FILTER-012 | 1 | true | vitest |
| PROP-FILTER-007 | `DomainSnapshotReceived` recomputes `visibleNoteIds` with both active filter and search | REQ-FILTER-012 | 1 | true | vitest |
| PROP-FILTER-008 | `SearchCleared` immediately recomputes `visibleNoteIds` without search predicate | REQ-FILTER-003 | 1 | true | vitest |
| PROP-FILTER-009 | `SortDirectionToggled` immediately recomputes `visibleNoteIds` with new order | REQ-FILTER-007 / REQ-FILTER-009 | 1 | true | vitest |
| PROP-FILTER-010 | `searchPredicate` is case-insensitive substring over haystack; uses `toLowerCase()` not `toLocaleLowerCase()`; empty needle is universal pass | REQ-FILTER-005 / REQ-FILTER-017 | 2 | true | property test (fast-check) |
| PROP-FILTER-011 | `searchPredicate('', haystack)` always returns `true` for any haystack | REQ-FILTER-005 / EC-S-001 | 1 | true | vitest |
| PROP-FILTER-012 | AND composition: tag filter + search both applied in `computeVisible` | REQ-FILTER-008 | 1 | true | vitest |
| PROP-FILTER-013 | Tag filter preserved after `SearchCleared`: `activeFilterTags` still applies | REQ-FILTER-008 / EC-C-003 | 1 | true | vitest |
| PROP-FILTER-014 | Sort order is deterministic; tiebreak by noteId lexicographic same direction | REQ-FILTER-009 / EC-T-001 | 1 | true | vitest |
| PROP-FILTER-015 | `feed-search-empty-state` shown when `visibleNoteIds` empty and `searchQuery` or `activeFilterTags` non-empty | REQ-FILTER-004 | 1 | true | DOM test (vitest + jsdom) |
| PROP-FILTER-016 | `feed-empty-state` shown when `visibleNoteIds` empty, `searchQuery` empty, `activeFilterTags` empty | REQ-FILTER-004 | 1 | true | DOM test (vitest + jsdom) |
| PROP-FILTER-017 | Search input renders with DESIGN.md tokens (border, padding, placeholder color) | REQ-FILTER-001 / REQ-FILTER-014 | 1 | true | DOM test |
| PROP-FILTER-018 | Sort toggle renders ▼ by default; changes to ▲ on click | REQ-FILTER-006 / REQ-FILTER-007 | 1 | true | DOM test |
| PROP-FILTER-019 | Esc key on search input fires `SearchCleared` immediately (no debounce) | REQ-FILTER-003 | 1 | true | DOM test |
| PROP-FILTER-020 | DESIGN.md token audit: no unlisted hex/rgba in `SearchInput.svelte` and `SortToggle.svelte` | REQ-FILTER-014 | 0 | true | grep audit |
| PROP-FILTER-021 | TypeScript: new `FeedAction` variants compile; exhaustive switch holds; `SearchInputChanged` is ABSENT from the union | REQ-FILTER-011 | 0 | true | tsc compile |
| PROP-FILTER-022 | Rapid keystrokes: `SearchApplied` dispatched only after last keystroke + 200ms silence | REQ-FILTER-002 / EC-S-001 | 1 | true | vitest with fake timers |
| PROP-FILTER-023 | Whitespace-only query (`"   "`) dispatched as `SearchApplied` does NOT short-circuit to no-search in reducer | REQ-FILTER-016 / EC-S-002 | 1 | true | vitest unit |
| PROP-FILTER-024 | Esc while debounce pending: timer cancelled, `SearchCleared` fires immediately | EC-S-005 / EC-S-010 | 1 | true | vitest with fake timers |
| PROP-FILTER-025 | `aria-label="ノート検索"` on search input; `aria-label="ソート方向（新しい順/古い順）"` on sort button; both Tab-reachable | REQ-FILTER-013 | 1 | true | DOM test (vitest + jsdom) |

## 3. Verification Tiers

### Tier 0 — Static / Grep checks (no test runner required)

These checks run in CI before any test suite.

| Check | Target | Gate |
|-------|--------|------|
| Purity audit grep | `feedReducer.ts` | Zero hits for `setTimeout\|Date\.now\|fetch\|invoke\|\$state\|\$effect\|\$derived` |
| TypeScript compile | `types.ts`, `feedReducer.ts` | `tsc --noEmit` exits 0; `SearchInputChanged` absent from `FeedAction` |
| DESIGN.md token audit | `SearchInput.svelte`, `SortToggle.svelte` | No unlisted hex/rgba values |

Covers: PROP-FILTER-001, PROP-FILTER-020, PROP-FILTER-021

### Tier 1 — Unit / Component / DOM tests (vitest)

Deterministic tests that run in Node.js or jsdom without a browser. Fast (< 30s total).

**Reducer unit tests** (`feedReducer.search.test.ts`):

| Test | Covers |
|------|--------|
| `SearchApplied(query)` → `state.searchQuery === query`, `commands === []` | PROP-FILTER-002 |
| `SearchApplied('hello')` → `visibleNoteIds` filtered by case-insensitive substring | PROP-FILTER-002 |
| `SearchApplied('')` → no search predicate; all notes visible (subject to tags) | PROP-FILTER-002 |
| `SearchCleared` → `state.searchQuery === ''`, `commands === []` | PROP-FILTER-003 |
| `SearchCleared` → `visibleNoteIds` recomputed without search | PROP-FILTER-008 |
| `SortDirectionToggled` from desc → `state.sortDirection === 'asc'`, `commands === []` | PROP-FILTER-004 |
| `SortDirectionToggled` from asc → `state.sortDirection === 'desc'`, `commands === []` | PROP-FILTER-004 |
| `SortDirectionToggled` → `visibleNoteIds` recomputed in new order | PROP-FILTER-009 |
| `DomainSnapshotReceived` preserves `searchQuery` | PROP-FILTER-006 |
| `DomainSnapshotReceived` preserves `sortDirection` | PROP-FILTER-006 |
| `DomainSnapshotReceived` with `searchQuery` active: `visibleNoteIds` filtered | PROP-FILTER-007 |
| AND composition: tag + search both applied on snapshot | PROP-FILTER-012 |
| Tag filter preserved after `SearchCleared` | PROP-FILTER-013 |
| Sort tiebreak deterministic for equal `updatedAt` | PROP-FILTER-014 |
| `searchPredicate('', 'anything')` → `true` | PROP-FILTER-011 |
| `searchPredicate('hello', 'Hello World')` → `true` (ASCII case-fold) | PROP-FILTER-010 |
| `searchPredicate('draft', 'draft')` → `true` (tag name) | PROP-FILTER-010 |
| Whitespace-only query `'   '` does NOT short-circuit to no-search | PROP-FILTER-023 |

**Debounce unit tests** (`searchDebounce.test.ts`, vitest fake timers):

| Test | Covers |
|------|--------|
| `SearchApplied` not dispatched within 200ms of keystroke | PROP-FILTER-022 |
| `SearchApplied` dispatched exactly once after 200ms silence | PROP-FILTER-022 |
| Esc cancels pending timer; `SearchCleared` fires immediately | PROP-FILTER-024 |
| Multiple keystrokes within 200ms: only one `SearchApplied` dispatched | PROP-FILTER-022 |

**DOM tests** (`SearchInput.dom.vitest.ts`):

| Test | Covers |
|------|--------|
| `data-testid="search-input"` present | PROP-FILTER-017 |
| Input border is `1px solid #dddddd` | PROP-FILTER-017 |
| Placeholder text "検索..." | PROP-FILTER-017 |
| `aria-label="ノート検索"` on input | PROP-FILTER-025 |
| Esc key fires `SearchCleared` (no debounce) | PROP-FILTER-019 |

**DOM tests** (`SortToggle.dom.vitest.ts`):

| Test | Covers |
|------|--------|
| `data-testid="sort-toggle"` text is "▼" initially | PROP-FILTER-018 |
| Clicking sort toggle changes text to "▲" | PROP-FILTER-018 |
| `aria-label="ソート方向（新しい順/古い順）"` on button | PROP-FILTER-025 |
| Both search input and sort toggle are Tab-reachable | PROP-FILTER-025 |

**FeedList empty-state DOM tests** (`FeedList.search-empty.dom.vitest.ts`):

| Test | Covers |
|------|--------|
| `feed-search-empty-state` shown when `visibleNoteIds` empty + `searchQuery` set | PROP-FILTER-015 |
| `feed-search-empty-state` shown when `visibleNoteIds` empty + `activeFilterTags` non-empty | PROP-FILTER-015 |
| `feed-empty-state` shown when no notes, no filter, no search | PROP-FILTER-016 |
| `feed-search-empty-state` text is "検索条件に一致するノートがありません" | PROP-FILTER-015 |

### Tier 2 — Property tests (fast-check)

Generative tests that run after Tier 1 in CI. May take up to 60s.

| Property | Test file | Covers |
|----------|-----------|--------|
| For any ASCII string needle and any string haystack: `searchPredicate(needle, haystack)` is true iff `haystack.toLowerCase().includes(needle.toLowerCase())`. Uses ASCII-printable characters only (avoids Turkish/German case-fold divergence). Non-ASCII inputs: `searchPredicate` must not throw; result may differ from locale-aware matching. | `searchPredicate.property.test.ts` | PROP-FILTER-010 |
| `feedReducer` never throws for any `(FeedViewState, FeedAction)` pair; `SearchApplied.query` generator produces strings of length 0..10000, any Unicode | `feedReducer.property.test.ts` | PROP-FILTER-005 |

**Unicode boundary for PROP-FILTER-010**: The property test generates:
1. ASCII printable strings (0x20..0x7E): exact case-insensitive match must hold
2. Arbitrary Unicode strings: `searchPredicate` must not throw; no correctness assertion beyond no-throw (locale behavior is undefined for non-ASCII in `toLowerCase()`)

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
| PROP-FILTER-002 | SearchApplied: sets searchQuery, recomputes visibleNoteIds, commands:[] | 1 | true | vitest |
| PROP-FILTER-003 | SearchCleared: resets query, recomputes visibleNoteIds, commands:[] | 1 | true | vitest |
| PROP-FILTER-004 | SortDirectionToggled: flips direction, recomputes visibleNoteIds, commands:[] | 1 | true | vitest |
| PROP-FILTER-005 | feedReducer totality over all (state, action) incl. adversarial strings | 2 | true | fast-check |
| PROP-FILTER-006 | DomainSnapshotReceived preserves searchQuery + sortDirection | 1 | true | vitest |
| PROP-FILTER-007 | DomainSnapshotReceived recomputes visibleNoteIds with search active | 1 | true | vitest |
| PROP-FILTER-008 | SearchCleared immediately recomputes visibleNoteIds | 1 | true | vitest |
| PROP-FILTER-009 | SortDirectionToggled immediately recomputes visibleNoteIds | 1 | true | vitest |
| PROP-FILTER-010 | searchPredicate: ASCII case-insensitive; no-throw for all Unicode | 2 | true | fast-check |
| PROP-FILTER-011 | searchPredicate empty needle is universal pass | 1 | true | vitest |
| PROP-FILTER-012 | AND composition: tag + search on computeVisible | 1 | true | vitest |
| PROP-FILTER-013 | Tag filter preserved after search cleared | 1 | true | vitest |
| PROP-FILTER-014 | Sort is deterministic with tiebreak | 1 | true | vitest |
| PROP-FILTER-015 | feed-search-empty-state DOM appearance | 1 | true | vitest+jsdom |
| PROP-FILTER-016 | feed-empty-state DOM appearance (no filter/search) | 1 | true | vitest+jsdom |
| PROP-FILTER-017 | SearchInput DESIGN.md token compliance (DOM) | 1 | true | vitest+jsdom |
| PROP-FILTER-018 | SortToggle ▼/▲ toggle behavior (DOM) | 1 | true | vitest+jsdom |
| PROP-FILTER-019 | Esc key fires SearchCleared immediately (DOM) | 1 | true | vitest+jsdom |
| PROP-FILTER-020 | DESIGN.md token audit on new .svelte files | 0 | true | grep audit |
| PROP-FILTER-021 | TypeScript exhaustive switch compile; SearchInputChanged absent | 0 | true | tsc |
| PROP-FILTER-022 | Debounce: SearchApplied only after 200ms silence | 1 | true | vitest fake-timers |
| PROP-FILTER-023 | Whitespace-only query not short-circuited in reducer | 1 | true | vitest |
| PROP-FILTER-024 | Esc cancels pending debounce timer | 1 | true | vitest fake-timers |
| PROP-FILTER-025 | aria-label attributes correct; Tab-reachable | 1 | true | vitest+jsdom |
