# Behavioral Specification — ui-filter-search

Feature: `ui-filter-search`
Mode: strict
Language: typescript
Phase: 1a

## 1. Feature Overview

This feature adds free-text search and sort direction toggle to the main feed. Users can type a search query that is debounced and applied to the visible feed, press Esc to clear the search, see a zero-results empty state, and toggle the sort order between newest-first (desc) and oldest-first (asc). All search/sort operations compose with the existing tag filter from `ui-tag-chip` using AND semantics.

### 1.1 Scope

**Included:**
- `SearchInput.svelte` — text input with debounce (200ms), Esc-to-clear keybind
- `SortToggle.svelte` — ▼/▲ toggle button; default `desc`
- `feedReducer` extension: new `FeedAction` variants `SearchInputChanged`, `SearchCleared`, `SortDirectionToggled`
- `FeedViewState` extension: `searchQuery: string` and `sortDirection: 'asc' | 'desc'`
- Zero-results empty state: unified `feed-search-empty-state` message ("検索条件に一致するノートがありません") used when either search or tag filter produces 0 results; FeedList will display this message when `visibleNoteIds` is empty after any active filter/search
- AND composition of tag filter + search query (domain `applyFilterOrSearch` is the single source of truth)
- DESIGN.md token compliance (Inputs style, Buttons Secondary/Ghost patterns)

**Excluded:**
- Advanced search modes (regex, fuzzy) — MVP uses case-insensitive substring only
- Search scope selection — `body+frontmatter` fixed internally
- Frontmatter field filters — MVP scope does not expose these in UI
- Tag autocomplete or management — handled by `ui-tag-chip`
- Persistence of search/sort across sessions — in-memory only

### 1.2 Source References

| Document | Section | Used for |
|---------|---------|---------|
| `docs/domain/ui-fields.md` | §1D 検索ボックス | Input field spec, debounce value, Esc keybind, zero-results |
| `docs/domain/ui-fields.md` | §1E ソート切替 | Sort field fixed, direction toggle, default |
| `docs/domain/ui-fields.md` | §UI 状態と型の対応 | FeedViewState extension constraints |
| `docs/domain/workflows.md` | §Workflow 7 ApplyFilterOrSearch | Pure pipeline: tag filter + search + sort composition |
| `docs/implement.md` | §feature 5 ui-filter-search | MVP scope boundary |
| `DESIGN.md` | §4 Inputs & Forms | Input styling tokens |
| `DESIGN.md` | §4 Buttons Secondary/Ghost | Sort toggle button style |
| `DESIGN.md` | §10 Token Reference | Normative color/spacing allow-list |

### 1.3 Dependencies (already completed)

| Dependency | Status | Used for |
|-----------|--------|---------|
| `apply-filter-or-search` domain pipeline | complete | `applyFilterOrSearch` (search + sort) |
| `ui-tag-chip` (feature 4) | complete | `activeFilterTags` already in `FeedViewState`; tag filter OR semantics |
| `feedReducer` + `types.ts` | complete | Extended here with search/sort variants |

### 1.4 Integration Boundaries

- **Domain pipeline**: Import `applyFilterOrSearch` from `$lib/domain/apply-filter-or-search/apply-filter-or-search.js`. Do NOT reimplement substring matching or sort comparator in the UI layer.
- **`feedReducer`**: Extend — add `SearchInputChanged`, `SearchCleared`, `SortDirectionToggled` to `FeedAction`; add `apply-search`, `clear-search`, `sort-direction-toggled` to `FeedCommand`. Do NOT create a separate reducer.
- **`FeedViewState`**: Extend with `searchQuery: string` (empty string = no query) and `sortDirection: 'asc' | 'desc'` (default `'desc'`).
- **Debounce**: Debounce timer lives in `SearchInput.svelte` (effectful). The reducer is called with `SearchInputChanged` on every keystroke (for `searchQuery` sync), and `applyFilterOrSearch` is only invoked after 200ms of silence via the effectful shell. A `searchDebounce.ts` helper can extract the timer logic for testability, but the reducer itself remains pure.
- **Tag filter composition**: The `TagFilterToggled` / `TagFilterCleared` path in the existing reducer re-computes `visibleNoteIds`. With this feature, whenever `searchQuery` is non-empty, the reducer additionally applies the search predicate on top of the tag-filtered candidate set. Both filters share `allNoteIds` as the base; the composition order is: tag filter (OR within tags) → search filter (AND) → sort.
- **Tauri IPC**: No new Rust commands. Search/sort are pure client-side computations over `noteMetadata`.

### 1.5 Purity Boundary Analysis

**Pure Core**:
- `feedReducer` (extended with new action variants): deterministic, no I/O
- Search predicate extracted into `searchPredicate(query: string, metadata: NoteRowMetadata): boolean`: pure, testable in isolation
- Sort comparator `sortByUpdatedAt(direction: 'asc' | 'desc', a: NoteRowMetadata, b: NoteRowMetadata): number`: pure
- `FeedViewState` type extensions

**Effectful Shell**:
- `SearchInput.svelte`: holds debounce timer (`setTimeout` / `clearTimeout`)
- `SortToggle.svelte`: emits DOM click event → dispatches action to reducer
- `FeedList.svelte`: wires reducer state to `SearchInput` and `SortToggle` props; calls `applyFilterOrSearch` after debounce fires (via `apply-search` command handler)

---

## 2. EARS Requirements

### REQ-FILTER-001 — Search input field rendering

**Ubiquitous**: THE SYSTEM SHALL render a text input field (the "search box") in the top area of the feed view, above the feed list, with placeholder text "検索..." and `data-testid="search-input"`. The input SHALL follow the DESIGN.md Inputs style: background `#ffffff`, text `rgba(0,0,0,0.9)`, border `1px solid #dddddd`, padding `6px`, border-radius `4px`, focus outline using Focus Blue (`#097fe8`), placeholder color Warm Gray 300 (`#a39e98`).

**Acceptance Criteria**:
- `<input data-testid="search-input">` is present in the rendered DOM when the feed is loaded
- CSS border value is `1px solid #dddddd`
- Placeholder text is "検索..."

---

### REQ-FILTER-002 — Search query debounce (SEARCH_DEBOUNCE_MS = 200)

**Event-driven**: WHEN the user types into the search input, THE SYSTEM SHALL:
1. Immediately update `FeedViewState.searchQuery` via `SearchInputChanged` action (pure, no filter applied yet)
2. Reset a 200ms debounce timer on every keystroke
3. After 200ms of no further input, apply the search by invoking `applyFilterOrSearch` with the current `searchQuery`, `activeFilterTags`, and `sortDirection`, updating `visibleNoteIds`

**Edge Cases**:
- Rapid typing (each character < 200ms apart): filter is applied only once, 200ms after the last keystroke
- Empty string input: treated as "no search"; `applyFilterOrSearch` is called with `query: null` (empty string maps to null per `parseFilterInput` contract — `searchTextRaw.trim() === ''` → `query: null`)

**Acceptance Criteria**:
- With debounce mock: `applyFilterOrSearch` is NOT called on each keystroke, only after 200ms silence
- Typing "abc" fast then pausing: filter called exactly once with query `{ text: "abc" }`
- Clearing to empty string after 200ms: `applyFilterOrSearch` called with `query: null`, all notes visible (tag filter still applies)

---

### REQ-FILTER-003 — Esc key clears search

**Event-driven**: WHEN the search input has focus AND the user presses the Escape key, THE SYSTEM SHALL:
1. Clear the input field value to empty string
2. Dispatch `SearchCleared` action to the reducer
3. The reducer SHALL set `searchQuery: ''` and recompute `visibleNoteIds` without a search query (tag filter and sort still apply)
4. The feed SHALL immediately reflect the cleared state without waiting for debounce

**Edge Cases**:
- Esc on already-empty input: no-op (no action dispatched, or SearchCleared with no visible change)
- Esc while debounce timer is pending: cancel the timer and clear immediately

**Acceptance Criteria**:
- After typing "hello" and pressing Esc: `searchQuery` becomes `''`, `visibleNoteIds` is recomputed without search filter
- `applyFilterOrSearch` is called immediately on Esc (no debounce delay)

---

### REQ-FILTER-004 — Zero-results empty state

**State-driven**: WHEN `visibleNoteIds` is empty AND at least one of `searchQuery` or `activeFilterTags` is non-empty, THE SYSTEM SHALL display a `data-testid="feed-search-empty-state"` element with text "検索条件に一致するノートがありません".

**State-driven**: WHEN `visibleNoteIds` is empty AND `searchQuery` is empty AND `activeFilterTags` is empty, THE SYSTEM SHALL display the plain `data-testid="feed-empty-state"` element (existing behavior, no change).

**Conditional**: IF the feed has notes but none match the current search + filter combination, THEN THE SYSTEM SHALL display the `feed-search-empty-state` message instead of the `feed-filtered-empty-state` message. The `feed-search-empty-state` message is the unified zero-results message for any combination of active filters and/or search.

**Edge Cases**:
- Query matches nothing + tags match nothing: `feed-search-empty-state`
- Query matches some notes, tags filter those out entirely: `feed-search-empty-state`
- No notes at all in vault (zero notes): `feed-empty-state`
- Note is deleted while search active, feed becomes empty: `feed-search-empty-state` (searchQuery still non-empty)

**Acceptance Criteria**:
- `data-testid="feed-search-empty-state"` is visible when `visibleNoteIds.length === 0 && (searchQuery !== '' || activeFilterTags.length > 0)`
- `data-testid="feed-empty-state"` is visible when `visibleNoteIds.length === 0 && searchQuery === '' && activeFilterTags.length === 0`
- `data-testid="feed-search-empty-state"` text is "検索条件に一致するノートがありません"

---

### REQ-FILTER-005 — Search match semantics: case-insensitive substring

**Ubiquitous**: THE SYSTEM SHALL apply case-insensitive substring matching against the concatenation of note body text and space-joined tag names (scope `body+frontmatter` per `applyFilterOrSearch` implementation). This is the MVP search method; no regex or fuzzy matching.

**Conditional**: IF `searchQuery` is non-empty after trim, THEN THE SYSTEM SHALL call `applyFilterOrSearch` with `query: { text: searchQuery, scope: 'body+frontmatter' }`.

**Conditional**: IF `searchQuery` is empty or whitespace-only after trim, THEN THE SYSTEM SHALL call `applyFilterOrSearch` with `query: null`.

**Acceptance Criteria**:
- Search "hello" matches note with body "Hello World" (case-insensitive)
- Search "hello" does NOT match note with body "Goodbye"
- Search "draft" matches note with tag "draft" (even if body does not contain "draft")
- Search "" (empty) shows all notes (subject to tag filter)

---

### REQ-FILTER-006 — Sort toggle button rendering

**Ubiquitous**: THE SYSTEM SHALL render a sort toggle button with `data-testid="sort-toggle"` in the top area of the feed view, adjacent to the search box. The button SHALL display "▼" when `sortDirection === 'desc'` and "▲" when `sortDirection === 'asc'`. The initial value SHALL be `'desc'` (newest first).

**Acceptance Criteria**:
- `data-testid="sort-toggle"` present in DOM
- Button text is "▼" on initial render
- Button has `aria-label` indicating current sort direction (e.g., "新しい順" for desc, "古い順" for asc)
- Button follows DESIGN.md Secondary button style: background `rgba(0,0,0,0.05)`, text `rgba(0,0,0,0.95)`, radius `4px`, padding `8px 16px`

---

### REQ-FILTER-007 — Sort direction toggle behavior

**Event-driven**: WHEN the user clicks the sort toggle button, THE SYSTEM SHALL:
1. Dispatch `SortDirectionToggled` action to the reducer
2. The reducer SHALL flip `sortDirection` (`'desc'` → `'asc'` or `'asc'` → `'desc'`)
3. Immediately recompute `visibleNoteIds` by calling `applyFilterOrSearch` with the new sort direction (no debounce; sort is instant)
4. The feed list SHALL re-render in the new order

**Acceptance Criteria**:
- First click: `sortDirection` changes from `'desc'` to `'asc'`, button shows "▲"
- Second click: `sortDirection` changes back to `'desc'`, button shows "▼"
- Feed order is `updatedAt` ascending on "▲", descending on "▼"
- Tiebreak: notes with identical `updatedAt` are sorted by `noteId` in the same direction (per `applyFilterOrSearch` DD-1)

---

### REQ-FILTER-008 — AND composition: tag filter + search

**Conditional**: IF both `activeFilterTags` is non-empty AND `searchQuery` is non-empty, THEN THE SYSTEM SHALL show only notes that BOTH match at least one active tag (OR within tags) AND contain the search string (case-insensitive substring). This is the AND semantics between filter dimensions as defined by `applyFilterOrSearch` and `aggregates.md §2 invariant 3`.

**Acceptance Criteria**:
- Note A has tag "work", body "hello world"
- Note B has tag "personal", body "hello world"
- Active tag filter: "work"; search: "hello"
- Result: only Note A (matches tag AND search)
- Active tag filter: "work"; search: "goodbye"
- Result: empty (matches tag but not search → `feed-search-empty-state`)

---

### REQ-FILTER-009 — Sort applies after filter + search composition

**Ubiquitous**: THE SYSTEM SHALL apply sort to the result of tag filter AND search composition. The sort key is `frontmatter.updatedAt` (epoch milliseconds from `NoteRowMetadata.updatedAt`). The `applyFilterOrSearch` function handles this order internally (Steps 3–5 filter, Step 6 sort).

**Acceptance Criteria**:
- Three notes pass both tag filter and search; they are ordered by `updatedAt` per `sortDirection`
- Changing sort direction re-orders the same three notes without re-running the filter

---

### REQ-FILTER-010 — FeedViewState extensions

**Ubiquitous**: THE SYSTEM SHALL extend `FeedViewState` with:
- `searchQuery: string` — current search query string (empty string = no active search). Preserved across `DomainSnapshotReceived` (same pattern as `activeFilterTags`).
- `sortDirection: 'asc' | 'desc'` — current sort direction. Default: `'desc'`. Preserved across `DomainSnapshotReceived`.

**Conditional**: IF a `DomainSnapshotReceived` action arrives, THE SYSTEM SHALL preserve `searchQuery` and `sortDirection` from the previous state (same as `activeFilterTags` and `loadingStatus` preservation).

**Acceptance Criteria**:
- After `DomainSnapshotReceived`, `searchQuery` retains its previous value
- After `DomainSnapshotReceived`, `sortDirection` retains its previous value
- Initial `FeedViewState` has `searchQuery: ''` and `sortDirection: 'desc'`

---

### REQ-FILTER-011 — FeedAction / FeedCommand extensions

**Ubiquitous**: THE SYSTEM SHALL extend `FeedAction` (discriminated union in `types.ts`) with:
- `{ kind: 'SearchInputChanged'; query: string }` — fired on every keystroke; sets `searchQuery` in state (no filter applied yet)
- `{ kind: 'SearchCleared' }` — fired on Esc or explicit clear; sets `searchQuery: ''` and recomputes `visibleNoteIds`
- `{ kind: 'SortDirectionToggled' }` — fired on toggle button click; flips `sortDirection` and recomputes `visibleNoteIds`

**Ubiquitous**: THE SYSTEM SHALL extend `FeedCommand` with:
- `{ kind: 'apply-search'; payload: { query: string; direction: 'asc' | 'desc' } }` — emitted by reducer after search-cleared or sort-toggled; consumed by effectful shell to call `applyFilterOrSearch`
- `{ kind: 'clear-search' }` — emitted on `SearchCleared`; effectful shell cancels any pending debounce timer

**Acceptance Criteria**:
- TypeScript exhaustive switch on `FeedAction` compiles with the three new variants
- TypeScript exhaustive switch on `FeedCommand` compiles with the two new variants
- `feedReducer` `default` branch (`_exhaustive: never`) still compiles (no new variants escape the switch)

---

### REQ-FILTER-012 — Search preserved across domain snapshots (note save/delete)

**State-driven**: WHEN a `DomainSnapshotReceived` action arrives (triggered by note save, delete, or editing state change), THE SYSTEM SHALL:
1. Update `allNoteIds` and `noteMetadata` from the snapshot
2. Re-apply the current `activeFilterTags` AND `searchQuery` to compute `visibleNoteIds`
3. Preserve `sortDirection`

**Edge Cases**:
- Note is saved while search "hello" is active: note appears/disappears in results based on whether new body matches
- Note is deleted while search active: note removed from `allNoteIds`; if no other notes match, `feed-search-empty-state` shown

**Acceptance Criteria**:
- After `DomainSnapshotReceived` with a saved note whose new body matches `searchQuery`, that note appears in `visibleNoteIds`
- `applyFilterOrSearch` is called inside the reducer's `DomainSnapshotReceived` handler (not deferred)

---

### REQ-FILTER-013 — Accessibility

**Ubiquitous**: THE SYSTEM SHALL ensure:
- Search input has `aria-label="ノートを検索"` or an associated `<label>` element
- Sort toggle button has `aria-label` that describes the CURRENT sort order (e.g., "新しい順で並び替え中" for desc, "古い順で並び替え中" for asc) and what clicking will do
- All interactive elements are keyboard-focusable with visible focus rings (Focus Blue `#097fe8`, `2px solid`, `outline-offset: 2px`)
- Tab navigation reaches both the search input and the sort toggle

---

### REQ-FILTER-014 — DESIGN.md token compliance

**Ubiquitous**: THE SYSTEM SHALL use only DESIGN.md token values for all styling:
- Search input: background `#ffffff`, text `rgba(0,0,0,0.9)`, border `1px solid #dddddd`, padding `6px`, border-radius `4px`
- Search input focus: outline `2px solid #097fe8`
- Search input placeholder: color `#a39e98`
- Sort toggle button: Secondary button style — background `rgba(0,0,0,0.05)`, text `rgba(0,0,0,0.95)`, border-radius `4px`, padding `8px 16px`
- No hardcoded spacing values outside the §5 permitted scale (2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 16, 24, 32 px)

---

### REQ-FILTER-015 — feedReducer purity invariant

**Ubiquitous**: THE SYSTEM SHALL maintain `feedReducer` as a pure function. No `setTimeout`, `Date.now`, `fetch`, `invoke`, `$state`, `$effect`, `$derived`, or any side-effectful API may appear in `feedReducer.ts`. The purity-audit grep (PROP-FEED-031 from `ui-feed-list-actions`) must still pass zero hits on `feedReducer.ts` after the extensions.

**Acceptance Criteria**:
- `grep -E "setTimeout|Date\.now|fetch|invoke|\\$state|\\$effect|\\$derived" feedReducer.ts` produces zero matches
- All three new action variants produce deterministic state from (state, action) pairs

---

## 3. Edge Case Catalog

### 3.1 Search Input Edge Cases

| ID | Edge Case | Expected Behavior |
|----|----------|-------------------|
| EC-S-001 | Empty string input (typed or cleared) | `searchQuery` set to `''`. After debounce: `applyFilterOrSearch` called with `query: null`. All notes visible (subject to tag filter). |
| EC-S-002 | Whitespace-only query (e.g., "   ") | `searchQuery` set to `"   "` in state. After debounce: `parseFilterInput` maps `searchTextRaw.trim() === ''` → `query: null`. Treated as no-search. |
| EC-S-003 | Very long query string (1000+ chars) | No client-side length limit imposed. `applyFilterOrSearch` runs substring match normally (may be slow for extreme lengths; acceptable for MVP). |
| EC-S-004 | Query with special regex chars (".*+?[]") | Case-insensitive substring only; no regex engine. These characters are literal. e.g., "a.*b" only matches if body contains the literal string "a.*b". |
| EC-S-005 | Rapid keystroke followed by Esc before debounce | Debounce timer is cancelled on Esc. `SearchCleared` fires immediately. Feed clears instantly. |
| EC-S-006 | Search active when note is deleted | After deletion snapshot: `allNoteIds` no longer contains the deleted note. `applyFilterOrSearch` recomputes `visibleNoteIds` without it. If result is empty, `feed-search-empty-state` shown. |
| EC-S-007 | Search active when note body saved with new content | After save snapshot: `noteMetadata` updated. `applyFilterOrSearch` recomputes — note may appear or disappear depending on new body content. |
| EC-S-008 | Search query with only tag name (no body match needed) | Matches if any note tag name contains the query as a substring. e.g., query "dra" matches note with tag "draft". |
| EC-S-009 | Unicode query (e.g., "テスト") | Case-insensitive substring uses `String.prototype.toLowerCase()`. Japanese hiragana/katakana/kanji: `toLowerCase()` does not change them. Match is exact (no case-folding). |

### 3.2 Sort Edge Cases

| ID | Edge Case | Expected Behavior |
|----|----------|-------------------|
| EC-T-001 | Two notes with identical `updatedAt` | Tiebreak by `noteId` in the same sort direction (per `byUpdatedAtThenNoteId` in `applyFilterOrSearch`). Order is deterministic. |
| EC-T-002 | `updatedAt === 0` (legacy/unset notes) | Treated as epoch 0 ms. Sorted correctly relative to other notes. |
| EC-T-003 | Toggle sort while search is active | Sort direction flips immediately. `applyFilterOrSearch` called with new direction. Search filter preserved. |
| EC-T-004 | Toggle sort while debounce is pending | The debounce fires after 200ms with the current (new) sort direction. No race condition: reducer state is authoritative. |
| EC-T-005 | Toggle sort with no notes in feed | `visibleNoteIds` stays empty. No error. |

### 3.3 Composition Edge Cases

| ID | Edge Case | Expected Behavior |
|----|----------|-------------------|
| EC-C-001 | Tag filter active, then search entered | Result is AND of tag-matched AND search-matched notes. |
| EC-C-002 | Search active, then tag filter toggled | Result is AND of current search + new tag set. |
| EC-C-003 | Both tag filter cleared and search cleared | `visibleNoteIds` = all notes sorted by current `sortDirection`. |
| EC-C-004 | Tag filter produces 3 notes; search narrows to 0 | `feed-search-empty-state` shown (at least one dimension active). |
| EC-C-005 | No tag filter, search produces 0 results | `feed-search-empty-state` shown (searchQuery is non-empty). |
| EC-C-006 | Both dimensions produce results, sort varies order | Only sort changes; set of visible notes unchanged. |
| EC-C-007 | `DomainSnapshotReceived` while both active | Both `activeFilterTags` and `searchQuery` preserved. `visibleNoteIds` recomputed with both active. |

---

## 4. Non-Functional Requirements

### 4.1 Performance

- Debounce timer: exactly `SEARCH_DEBOUNCE_MS = 200` ms (constant, not configurable at runtime)
- Search filter computation on `DomainSnapshotReceived`: must complete within 50ms for up to 500 notes
- Sort toggle response: immediate (no debounce), must re-render within 16ms (one frame) for up to 500 notes
- `searchPredicate` per note: O(1) relative to note count; O(body.length + tags.join(' ').length) per note

### 4.2 Accessibility

- WCAG 2.1 Level AA minimum
- Search input: keyboard focus visible (`2px solid #097fe8`)
- Sort toggle: keyboard activatable (Enter and Space keys trigger the toggle action)

### 4.3 Design System

- All colors, spacing, fonts from DESIGN.md §10 Token Reference
- No hex or rgba values in component source files that are not listed in DESIGN.md §10

---

## 5. Type Contract Extensions

### 5.1 FeedViewState additions

```ts
// Added to existing FeedViewState (readonly fields, preserved across DomainSnapshotReceived):
searchQuery: string;               // '' = no active search. Set by SearchInputChanged / SearchCleared.
sortDirection: 'asc' | 'desc';    // Default: 'desc'. Set by SortDirectionToggled.
```

Initial values for `FeedViewState` construction:
```ts
searchQuery: '',
sortDirection: 'desc',
```

### 5.2 FeedAction additions

```ts
// New variants added to existing FeedAction union:
| { kind: 'SearchInputChanged'; query: string }
| { kind: 'SearchCleared' }
| { kind: 'SortDirectionToggled' }
```

### 5.3 FeedCommand additions

```ts
// New variants added to existing FeedCommand union:
| { kind: 'apply-search'; payload: { query: string; direction: 'asc' | 'desc' } }
| { kind: 'clear-search' }
```

---

## 6. Done Definition

This feature is **Done** when:

1. `SearchInput.svelte` renders with correct DESIGN.md tokens, debounces at 200ms, clears on Esc
2. `SortToggle.svelte` renders ▼/▲, defaults to `desc`, toggles on click
3. `feedReducer` handles `SearchInputChanged`, `SearchCleared`, `SortDirectionToggled` without mutation or side effects
4. `FeedViewState` contains `searchQuery` and `sortDirection`; both are preserved across `DomainSnapshotReceived`
5. `visibleNoteIds` reflects tag filter AND search AND sort composition at all times
6. `feed-search-empty-state` is shown when `visibleNoteIds` is empty and at least one of searchQuery / activeFilterTags is active
7. All REQ-FILTER-001..015 have corresponding passing test cases
8. All PROP-FILTER-001..N in verification-architecture.md are proved
9. Purity-audit grep on `feedReducer.ts` produces zero hits
10. DESIGN.md token audit passes (no unlisted hex/rgba in new component files)
11. Phase 3 adversarial review PASS
12. Phase 6 convergence PASS
