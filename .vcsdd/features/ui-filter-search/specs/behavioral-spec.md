---
coherence:
  node_id: "req:ui-filter-search"
  type: req
  name: "ui-filter-search 行動仕様"
  modules:
    - "ui-filter-search"
  source_files:
    - "promptnotes/src/lib/feed/SearchInput.svelte"
    - "promptnotes/src/lib/feed/SortToggle.svelte"
    - "promptnotes/src/lib/feed/feedReducer.ts"
    - "promptnotes/src/lib/feed/computeVisible.ts"
    - "promptnotes/src/lib/feed/searchPredicate.ts"
    - "promptnotes/src/lib/feed/sortByUpdatedAt.ts"
    - "promptnotes/src/lib/feed/types.ts"
    - "promptnotes/src/lib/feed/FeedList.svelte"
  conventions:
    - targets:
        - "file:promptnotes/src/lib/feed/SearchInput.svelte"
        - "file:promptnotes/src/lib/feed/SortToggle.svelte"
        - "file:promptnotes/src/lib/feed/feedReducer.ts"
        - "file:promptnotes/src/lib/feed/computeVisible.ts"
        - "file:promptnotes/src/lib/feed/searchPredicate.ts"
        - "file:promptnotes/src/lib/feed/sortByUpdatedAt.ts"
        - "file:promptnotes/src/lib/feed/types.ts"
        - "file:promptnotes/src/lib/feed/FeedList.svelte"
        - "module:ui-filter-search"
      reason: "Behavioral spec must be reviewed when declared source files or modules change (GAP-4 PN-6xl)"
---

# Behavioral Specification — ui-filter-search

Feature: `ui-filter-search`
Mode: strict
Language: typescript
Phase: 1a
Iteration: 4

## 1. Feature Overview

This feature adds free-text search and sort direction toggle to the main feed. Users can type a search query that is debounced and applied to the visible feed, press Esc to clear the search, see a zero-results empty state, and toggle the sort order between newest-first (desc) and oldest-first (asc). All search/sort operations compose with the existing tag filter from `ui-tag-chip` using AND semantics.

### 1.1 Scope

**Included:**
- `SearchInput.svelte` — text input with debounce (200ms), Esc-to-clear keybind
- `SortToggle.svelte` — ▼/▲ toggle button; default `desc`
- `feedReducer` extension: new `FeedAction` variants `SearchApplied`, `SearchCleared`, `SortDirectionToggled`
- `FeedViewState` extension: `searchQuery: string` and `sortDirection: 'asc' | 'desc'`
- Zero-results empty state: unified `feed-search-empty-state` message ("検索条件に一致するノートがありません") used when either search or tag filter produces 0 results; FeedList will display this message when `visibleNoteIds` is empty after any active filter/search
- AND composition of tag filter + search query (implemented inline in reducer, same pattern as `TagFilterToggled`)
- DESIGN.md token compliance (Inputs style, Buttons Secondary/Ghost patterns)

**Excluded:**
- Advanced search modes (regex, fuzzy) — MVP uses case-insensitive substring only
- Search scope selection — `body+tags` fixed internally
- Frontmatter field filters — MVP scope does not expose these in UI
- Tag autocomplete or management — handled by `ui-tag-chip`
- Persistence of search/sort across sessions — in-memory only
- `applyFilterOrSearch` domain function — NOT called in this UI feature (reserved for Tauri-side normalization)

### 1.2 Source References

| Document | Section | Used for |
|---------|---------|---------|
| `docs/domain/ui-fields.md` | §1D 検索ボックス | Input field spec, debounce value, Esc keybind, zero-results |
| `docs/domain/ui-fields.md` | §1E ソート切替 | Sort field fixed, direction toggle, default |
| `docs/domain/ui-fields.md` | §UI 状態と型の対応 | FeedViewState extension constraints |
| `DESIGN.md` | §4 Inputs & Forms | Input styling tokens |
| `DESIGN.md` | §4 Buttons Secondary/Ghost | Sort toggle button style |
| `DESIGN.md` | §10 Token Reference | Normative color/spacing allow-list |

### 1.3 Dependencies (already completed)

| Dependency | Status | Used for |
|-----------|--------|---------|
| `ui-tag-chip` (feature 4) | complete | `activeFilterTags` already in `FeedViewState`; tag filter OR semantics |
| `feedReducer` + `types.ts` | complete | Extended here with search/sort variants |

### 1.4 Integration Boundaries

- **`feedReducer`**: Extend — add `SearchApplied`, `SearchCleared`, `SortDirectionToggled` to `FeedAction`. Remove `SearchInputChanged` (pending input is shell-local state, not reducer state). Do NOT create a separate reducer.
- **`FeedViewState`**: Extend with `searchQuery: string` (empty string = no query) and `sortDirection: 'asc' | 'desc'` (default `'desc'`).
- **Debounce**: `SearchInput.svelte` (effectful shell) holds pending input as local Svelte state. A 200ms debounce timer fires after the last keystroke. On timer expiry, the shell dispatches `SearchApplied` to the reducer. `SearchInputChanged` action does NOT exist — `searchQuery` in the reducer is only set on debounce expiry (via `SearchApplied`) or cleared (via `SearchCleared`).
- **Filter computation**: Reducer performs inline `allNoteIds.filter(...)` — same pattern as `TagFilterToggled`. `applyFilterOrSearch` domain function is NOT called. The search predicate is `searchPredicate(needle: string, haystack: string): boolean` extracted as a pure helper.
- **`FilterApplied` / `FilterCleared`**: Existing actions in `FeedAction`. These are NOT used in `ui-filter-search`. They remain for backward compatibility but this feature introduces only `SearchApplied`, `SearchCleared`, `SortDirectionToggled`.
- **`DomainSnapshotReceived`**: Reducer preserves `searchQuery` and `sortDirection` exactly like `activeFilterTags` and `loadingStatus`. Shell's pending debounce timer is NOT cancelled on snapshot receipt. Reducer recomputes `visibleNoteIds` using current `searchQuery` + `activeFilterTags` + `sortDirection`.
- **Tauri IPC**: No new Rust commands. Search/sort are pure client-side computations over `noteMetadata`.

### 1.5 Purity Boundary Analysis

**Pure Core**:
- `feedReducer` (extended with new action variants): deterministic, no I/O
- `searchPredicate(needle: string, haystack: string): boolean` — case-insensitive substring check. Uses `String.prototype.toLowerCase()` (locale-independent ASCII folding). Non-ASCII characters (Japanese kana/kanji, Turkish i, German ß) pass through without case transformation.
- `sortByUpdatedAt(direction: 'asc' | 'desc'): (a: { noteId: string; updatedAt: number }, b: { noteId: string; updatedAt: number }) => number` — curried-comparator factory. Returns a comparator that operates on minimal metadata objects (not raw IDs and not the full `NoteRowMetadata` map). Primary key: `updatedAt` epoch ms. Tiebreak: `noteId` lexicographic in the same direction. `noteMetadata` is NOT a parameter — the call-site in `computeVisible` maps note IDs to `{ noteId, updatedAt }` objects before sorting.
- `FeedViewState` type extensions

**Effectful Shell**:
- `SearchInput.svelte`: holds raw pending input (local Svelte `$state`), debounce timer (`setTimeout` / `clearTimeout`). On debounce expiry, dispatches `SearchApplied` to reducer.
- `SortToggle.svelte`: emits DOM click event → dispatches `SortDirectionToggled` to reducer
- `FeedList.svelte`: wires reducer state to `SearchInput` and `SortToggle` props; dispatches actions

**NOT in pure core** (decision — FIND-SPEC-FILTER-001/002/003):
- `applyFilterOrSearch` domain function is effectful-shell territory; not called from reducer or pure core of this feature
- Debounce timer lives exclusively in `SearchInput.svelte` (effectful)

---

## 2. Operational Flow

The following pseudocode shows the canonical data flow from user input to re-render. This resolves FIND-SPEC-FILTER-001.

```
SearchInput.svelte (effectful shell):
  onInput(rawValue):
    pendingInput = rawValue          // local $state, not dispatched
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      dispatch({ kind: 'SearchApplied', query: pendingInput })
    }, SEARCH_DEBOUNCE_MS)           // SEARCH_DEBOUNCE_MS = 200

  onKeydown(event):
    if event.key === 'Escape':
      clearTimeout(debounceTimer)    // cancel pending debounce
      pendingInput = ''
      dispatch({ kind: 'SearchCleared' })

feedReducer (pure):
  case 'SearchApplied':
    nextSearchQuery = action.query
    nextVisible = computeVisible(state.allNoteIds, state.noteMetadata,
                                 state.activeFilterTags, nextSearchQuery,
                                 state.sortDirection)
    return { state: { ...state, searchQuery: nextSearchQuery,
                      visibleNoteIds: nextVisible }, commands: [] }

  case 'SearchCleared':
    nextVisible = computeVisible(state.allNoteIds, state.noteMetadata,
                                 state.activeFilterTags, '',
                                 state.sortDirection)
    return { state: { ...state, searchQuery: '',
                      visibleNoteIds: nextVisible }, commands: [] }

  case 'SortDirectionToggled':
    nextDir = state.sortDirection === 'desc' ? 'asc' : 'desc'
    nextVisible = computeVisible(state.allNoteIds, state.noteMetadata,
                                 state.activeFilterTags, state.searchQuery,
                                 nextDir)
    return { state: { ...state, sortDirection: nextDir,
                      visibleNoteIds: nextVisible }, commands: [] }

  case 'DomainSnapshotReceived':
    // snapshot.feed.visibleNoteIds is the unfiltered domain ID list — used as allNoteIds.
    nextVisible = computeVisible(snapshot.feed.visibleNoteIds, snapshot.noteMetadata,
                                 state.activeFilterTags, state.searchQuery,
                                 state.sortDirection)
    nextState = {
      // ── from snapshot (replaced on every DomainSnapshotReceived) ──
      editingStatus:             snapshot.editing.status,
      editingNoteId:             snapshot.editing.currentNoteId,
      pendingNextNoteId:         snapshot.editing.pendingNextNoteId,
      allNoteIds:                snapshot.feed.visibleNoteIds,    // unfiltered domain list
      noteMetadata:              snapshot.noteMetadata,
      activeDeleteModalNoteId:   snapshot.delete.activeDeleteModalNoteId,
      lastDeletionError:         snapshot.cause.kind === 'NoteFileDeleted'
                                   ? null
                                   : snapshot.delete.lastDeletionError,
      // ── preserved from previous state (not overwritten by snapshot) ──
      loadingStatus:             state.loadingStatus,
      activeFilterTags:          state.activeFilterTags,
      tagAutocompleteVisibleFor:
        state.tagAutocompleteVisibleFor !== null &&
        snapshot.noteMetadata[state.tagAutocompleteVisibleFor] !== undefined
          ? state.tagAutocompleteVisibleFor
          : null,  // guard: null if the note was deleted from snapshot (inherited from ui-tag-chip)
      searchQuery:               state.searchQuery,               // NEW — ui-filter-search
      sortDirection:             state.sortDirection,             // NEW — ui-filter-search
      // ── derived ──
      visibleNoteIds:            nextVisible,
    }
    return { state: nextState, commands: [...] }  // commands same as existing DomainSnapshotReceived

computeVisible(allNoteIds, noteMetadata, activeTags, searchQuery, sortDir):
  // Step 1: tag filter (OR)
  tagFiltered = activeTags.length > 0
    ? allNoteIds.filter(id => noteMetadata[id]?.tags.some(t => activeTags.includes(t)))
    : allNoteIds

  // Step 2: search filter (AND, case-insensitive substring)
  needle = searchQuery.toLowerCase()
  searchFiltered = needle !== ''
    ? tagFiltered.filter(id => {
        const m = noteMetadata[id]
        const haystack = (m?.body ?? '') + ' ' + (m?.tags ?? []).join(' ')
        return searchPredicate(needle, haystack)
      })
    : tagFiltered

  // Step 3: sort by updatedAt (tiebreak: noteId)
  // sortByUpdatedAt is a curried factory that receives a direction and returns a comparator.
  // The comparator operates on minimal objects { noteId, updatedAt } — NOT on raw IDs.
  // noteMetadata is NOT passed to sortByUpdatedAt; it is used here to project IDs before sorting.
  const cmp = sortByUpdatedAt(sortDir)
  const sorted = searchFiltered
    .map(id => ({ noteId: id, updatedAt: noteMetadata[id]?.updatedAt ?? 0 }))
    .sort(cmp)
  return sorted.map(r => r.noteId)
```

**Key invariants**:
- `searchQuery` in reducer state is ONLY updated by `SearchApplied` or `SearchCleared`. Never by raw keystrokes.
- Reducer never holds or references a debounce timer.
- `DomainSnapshotReceived` does NOT cancel the shell's pending timer.
- `computeVisible` is the single source of truth for `visibleNoteIds`; identical logic used in all four cases above.
- `snapshot.feed.visibleNoteIds` is the unfiltered domain ID list; it is assigned to `allNoteIds` (NOT to `visibleNoteIds`).

**DomainSnapshotReceived field provenance table**:

| Field | Provenance | Notes |
|-------|-----------|-------|
| `editingStatus` | `snapshot.editing.status` | Replaced on every snapshot |
| `editingNoteId` | `snapshot.editing.currentNoteId` | Replaced on every snapshot |
| `pendingNextNoteId` | `snapshot.editing.pendingNextNoteId` | Replaced on every snapshot |
| `allNoteIds` | `snapshot.feed.visibleNoteIds` | Unfiltered domain ID list; renamed to allNoteIds |
| `noteMetadata` | `snapshot.noteMetadata` | Replaced on every snapshot |
| `activeDeleteModalNoteId` | `snapshot.delete.activeDeleteModalNoteId` | Replaced on every snapshot |
| `lastDeletionError` | `null` if cause is `NoteFileDeleted`, else `snapshot.delete.lastDeletionError` | Replaced on every snapshot |
| `loadingStatus` | `state.loadingStatus` | Preserved from previous state |
| `activeFilterTags` | `state.activeFilterTags` | Preserved from previous state |
| `tagAutocompleteVisibleFor` | `derived (state + snapshot)` | Preserved if the referenced note still exists in `snapshot.noteMetadata`; set to `null` if the note was deleted. Guard: `state.tagAutocompleteVisibleFor !== null && snapshot.noteMetadata[state.tagAutocompleteVisibleFor] !== undefined ? state.tagAutocompleteVisibleFor : null`. Inherited from ui-tag-chip; ui-filter-search must not regress this. |
| `searchQuery` | `state.searchQuery` | Preserved — NEW for ui-filter-search |
| `sortDirection` | `state.sortDirection` | Preserved — NEW for ui-filter-search |
| `visibleNoteIds` | `computeVisible(...)` | Derived: re-run on every snapshot |

---

## 3. EARS Requirements

### REQ-FILTER-001 — Search input field rendering

**Ubiquitous**: THE SYSTEM SHALL render a text input field (the "search box") in the top area of the feed view, above the feed list, with placeholder text "検索..." and `data-testid="search-input"`. The input SHALL follow the DESIGN.md Inputs style: background `#ffffff`, text `rgba(0,0,0,0.9)`, border `1px solid #dddddd`, padding `6px`, border-radius `4px`, focus outline using Focus Blue (`#097fe8`), placeholder color Warm Gray 300 (`#a39e98`).

**Acceptance Criteria**:
- `<input data-testid="search-input">` is present in the rendered DOM when the feed is loaded
- CSS border value is `1px solid #dddddd`
- Placeholder text is "検索..."
- Verification: `SearchInput.dom.vitest.ts` — DOM assertions on rendered component

---

### REQ-FILTER-002 — Search query debounce (SEARCH_DEBOUNCE_MS = 200)

**Event-driven**: WHEN the user types into the search input, THE SYSTEM SHALL:
1. Update the component-local pending input (`$state` in `SearchInput.svelte`) on every keystroke — NOT dispatch to the reducer
2. Reset a 200ms debounce timer on every keystroke
3. After 200ms of no further input, dispatch `{ kind: 'SearchApplied', query: pendingInput }` to the reducer
4. The reducer sets `searchQuery` and recomputes `visibleNoteIds` inline (tag filter AND search AND sort)

**Edge Cases**:
- Rapid typing (each character < 200ms apart): `SearchApplied` dispatched only once, 200ms after the last keystroke
- Empty string debounce: `SearchApplied` with `query: ''` dispatched; reducer treats as "no search"

**Acceptance Criteria**:
- With vitest fake timers: `SearchApplied` is NOT dispatched within 200ms of any single keystroke
- Typing "abc" fast then pausing 200ms: `SearchApplied` dispatched exactly once with `{ query: 'abc' }`
- `SearchInputChanged` action does NOT exist in `FeedAction`
- Verification: `searchDebounce.test.ts` with fake timers; `feedReducer.search.test.ts`

---

### REQ-FILTER-003 — Esc key clears search

**Event-driven**: WHEN the search input has focus AND the user presses the Escape key, THE SYSTEM SHALL:
1. Cancel the pending debounce timer (if any)
2. Clear the component-local pending input to `''`
3. Dispatch `{ kind: 'SearchCleared' }` to the reducer
4. The reducer SHALL set `searchQuery: ''` and recompute `visibleNoteIds` without a search query (tag filter and sort still apply)
5. The feed SHALL immediately reflect the cleared state without waiting for debounce

**Edge Cases** (see §4.1 for authoritative definitions):
- EC-S-005 (§4.1): Rapid keystroke followed by Esc before debounce — timer cancelled on Esc; `SearchCleared` fired immediately
- EC-S-010 (§4.1): Esc key with no pending debounce — timer cancel is no-op; `SearchCleared` dispatched; no visible change if already empty

**Acceptance Criteria**:
- After typing "hello" and pressing Esc: `searchQuery` becomes `''`, `visibleNoteIds` recomputed without search filter
- `visibleNoteIds` update is immediate (no debounce delay)
- Verification: `searchDebounce.test.ts` (fake timers), `SearchInput.dom.vitest.ts` (key event)

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
- Verification: `FeedList.search-empty.dom.vitest.ts`

---

### REQ-FILTER-005 — Search match semantics: case-insensitive substring

**Ubiquitous**: THE SYSTEM SHALL apply case-insensitive substring matching against the concatenation of note body text and space-joined tag names (body + tags). This is the MVP search method; no regex or fuzzy matching.

**Ubiquitous**: THE SYSTEM SHALL implement the case fold via `String.prototype.toLowerCase()` (locale-independent). This means:
- ASCII A-Z are folded to a-z
- Japanese hiragana/katakana/kanji are NOT case-folded (no change)
- Turkish I/ı, German ß, and other non-ASCII characters are handled by the JavaScript engine's default behavior (NOT `toLocaleLowerCase()`). `toLocaleLowerCase()` is PROHIBITED in `searchPredicate`.
- Matching is exact substring (no romanization, no normalization)

**Conditional**: IF `searchQuery` (after debounce) is non-empty, THEN the reducer SHALL apply `searchPredicate` over each candidate note.

**Conditional**: IF `searchQuery` is empty string, THEN no search predicate is applied (universal pass).

**Acceptance Criteria**:
- Search "hello" matches note with body "Hello World" (ASCII case-fold)
- Search "hello" does NOT match note with body "Goodbye"
- Search "draft" matches note with tag "draft" (even if body does not contain "draft")
- Search "" (empty) shows all notes (subject to tag filter)
- Search "テスト" matches body "テスト" exactly (no case change for Japanese)
- `searchPredicate` uses `.toLowerCase()` not `.toLocaleLowerCase()`
- Verification: `feedReducer.search.test.ts`, `searchPredicate.property.test.ts`

---

### REQ-FILTER-006 — Sort toggle button rendering

**Ubiquitous**: THE SYSTEM SHALL render a sort toggle button with `data-testid="sort-toggle"` in the top area of the feed view, adjacent to the search box. The button SHALL display "▼" when `sortDirection === 'desc'` and "▲" when `sortDirection === 'asc'`. The initial value SHALL be `'desc'` (newest first).

**Acceptance Criteria**:
- `data-testid="sort-toggle"` present in DOM
- Button text is "▼" on initial render
- Button has `aria-label="ソート方向（新しい順/古い順）"` (static label describing the control)
- Button follows DESIGN.md Secondary button style: background `rgba(0,0,0,0.05)`, text `rgba(0,0,0,0.95)`, radius `4px`, padding `8px 16px`
- Verification: `SortToggle.dom.vitest.ts`

---

### REQ-FILTER-007 — Sort direction toggle behavior

**Event-driven**: WHEN the user clicks the sort toggle button, THE SYSTEM SHALL:
1. Dispatch `{ kind: 'SortDirectionToggled' }` to the reducer
2. The reducer SHALL flip `sortDirection` (`'desc'` → `'asc'` or `'asc'` → `'desc'`)
3. Immediately recompute `visibleNoteIds` using `computeVisible` with the new sort direction (no debounce; sort is instant)
4. The feed list SHALL re-render in the new order

**Acceptance Criteria**:
- First click: `sortDirection` changes from `'desc'` to `'asc'`, button shows "▲"
- Second click: `sortDirection` changes back to `'desc'`, button shows "▼"
- Feed order is `updatedAt` ascending on "▲", descending on "▼"
- Tiebreak: notes with identical `updatedAt` are sorted by `noteId` in the same direction (matching `byUpdatedAtThenNoteId` semantics from domain)
- Verification: `feedReducer.search.test.ts`, `SortToggle.dom.vitest.ts`

---

### REQ-FILTER-008 — AND composition: tag filter + search

**Conditional**: IF both `activeFilterTags` is non-empty AND `searchQuery` is non-empty, THEN THE SYSTEM SHALL show only notes that BOTH match at least one active tag (OR within tags) AND contain the search string (case-insensitive substring). This is AND semantics between filter dimensions, consistent with `aggregates.md §2 invariant 3`.

**Acceptance Criteria**:
- Note A has tag "work", body "hello world"
- Note B has tag "personal", body "hello world"
- Active tag filter: "work"; search: "hello"
- Result: only Note A (matches tag AND search)
- Active tag filter: "work"; search: "goodbye"
- Result: empty (matches tag but not search → `feed-search-empty-state`)
- Verification: `feedReducer.search.test.ts`

---

### REQ-FILTER-009 — Sort applies after filter + search composition

**Ubiquitous**: THE SYSTEM SHALL apply sort to the result of tag filter AND search composition. The sort key is `NoteRowMetadata.updatedAt` (epoch milliseconds). Tiebreak: `noteId` lexicographic in the same direction.

**Acceptance Criteria**:
- Three notes pass both tag filter and search; they are ordered by `updatedAt` per `sortDirection`
- Changing sort direction re-orders the same three notes without re-running the filter
- Verification: `feedReducer.search.test.ts`

---

### REQ-FILTER-010 — FeedViewState extensions

**Ubiquitous**: THE SYSTEM SHALL extend `FeedViewState` with:
- `searchQuery: string` — current committed search query (empty string = no active search). Updated only by `SearchApplied` and `SearchCleared`. Preserved across `DomainSnapshotReceived`.
- `sortDirection: 'asc' | 'desc'` — current sort direction. Default: `'desc'`. Preserved across `DomainSnapshotReceived`.

**Conditional**: IF a `DomainSnapshotReceived` action arrives, THE SYSTEM SHALL preserve `searchQuery` and `sortDirection` from the previous state (same as `activeFilterTags` and `loadingStatus` preservation).

**Acceptance Criteria**:
- After `DomainSnapshotReceived`, `searchQuery` retains its previous value
- After `DomainSnapshotReceived`, `sortDirection` retains its previous value
- Initial `FeedViewState` has `searchQuery: ''` and `sortDirection: 'desc'`
- Verification: `feedReducer.search.test.ts`

---

### REQ-FILTER-011 — FeedAction / FeedCommand extensions

**Ubiquitous**: THE SYSTEM SHALL extend `FeedAction` (discriminated union in `types.ts`) with exactly three new variants:
- `{ kind: 'SearchApplied'; query: string }` — fired by shell after 200ms debounce; sets `searchQuery` in state and recomputes `visibleNoteIds`
- `{ kind: 'SearchCleared' }` — fired on Esc or explicit clear; sets `searchQuery: ''` and recomputes `visibleNoteIds`
- `{ kind: 'SortDirectionToggled' }` — fired on toggle button click; flips `sortDirection` and recomputes `visibleNoteIds`

**`SearchInputChanged` does NOT exist** in `FeedAction`. Pending keystrokes are shell-local state only.

**Ubiquitous**: No new `FeedCommand` variants are required for this feature. All three reducer cases return `commands: []`. (The shell manages the debounce timer itself without needing a command from the reducer.)

**Ubiquitous**: Existing `FilterApplied` and `FilterCleared` in `FeedAction` are preserved for backward compatibility. They are NOT used by `ui-filter-search`. This feature uses only `SearchApplied`, `SearchCleared`, `SortDirectionToggled`.

**Acceptance Criteria**:
- TypeScript exhaustive switch on `FeedAction` compiles with the three new variants
- `feedReducer` `default` branch (`_exhaustive: never`) still compiles (no new variants escape the switch)
- Verification: `tsc --noEmit` (PROP-FILTER-021)

---

### REQ-FILTER-012 — Search preserved across domain snapshots (note save/delete)

**State-driven**: WHEN a `DomainSnapshotReceived` action arrives (triggered by note save, delete, or editing state change), THE SYSTEM SHALL:
1. Update `allNoteIds` and `noteMetadata` from the snapshot
2. Re-apply the current `activeFilterTags` AND `searchQuery` to compute `visibleNoteIds`
3. Preserve `sortDirection`
4. NOT cancel the shell's pending debounce timer

**Edge Cases**:
- EC-S-006: Note is saved while search "hello" is active: note appears/disappears in results based on whether new body matches
- EC-S-007: Note is deleted while search active: note removed from `allNoteIds`; if no other notes match, `feed-search-empty-state` shown
- EC-C-007: Shell's pending debounce timer is mid-flight when snapshot arrives: snapshot processes immediately; timer continues; when timer fires, `SearchApplied` is dispatched with the latest pending input (no race — reducer is synchronous, state is authoritative)

**Acceptance Criteria**:
- After `DomainSnapshotReceived` with a saved note whose new body matches `searchQuery`, that note appears in `visibleNoteIds`
- `searchQuery` is preserved in the new state after `DomainSnapshotReceived`
- Verification: `feedReducer.search.test.ts`

---

### REQ-FILTER-013 — Accessibility

**Ubiquitous**: THE SYSTEM SHALL ensure:
- Search input has `aria-label="ノート検索"` (matches REQ-FILTER-013 canonical label; REQ-FILTER-006 uses a separate static label for the sort toggle)
- Sort toggle button has `aria-label="ソート方向（新しい順/古い順）"` (static label, not dynamic — describes the control purpose)
- All interactive elements are keyboard-focusable with visible focus rings (Focus Blue `#097fe8`, `2px solid`, `outline-offset: 2px`)
- Tab navigation reaches both the search input and the sort toggle in document order

**Acceptance Criteria**:
- `aria-label="ノート検索"` on `<input data-testid="search-input">`
- `aria-label="ソート方向（新しい順/古い順）"` on `<button data-testid="sort-toggle">`
- Both elements reachable via Tab key
- Verification: `SearchInput.dom.vitest.ts`, `SortToggle.dom.vitest.ts` (PROP-FILTER-025)

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
- `grep -E "setTimeout|Date\.now|fetch|invoke|\$state|\$effect|\$derived" feedReducer.ts` produces zero matches
- All three new action variants produce deterministic state from (state, action) pairs
- Verification: PROP-FILTER-001 (Tier 0 grep audit)

---

### REQ-FILTER-016 — Whitespace-only query treated as no-search

**Conditional**: IF the debounced `SearchApplied` query string is whitespace-only (e.g. `"   "`), THEN the reducer SHALL treat it as a non-empty query and apply it literally as a substring search. The empty-query special case is triggered ONLY by `query === ''` (exact empty string).

**Note**: Whitespace-only query will match notes whose body or tags happen to contain spaces. This is intentional literal-substring behavior. If the UI wants to treat whitespace-only as "no search", `SearchInput.svelte` may trim before dispatching — but this is a UI-layer decision, not a reducer-layer decision.

**Acceptance Criteria**:
- `feedReducer` with `SearchApplied { query: '   ' }`: applies `searchPredicate('   ', haystack)` — may match some notes
- `feedReducer` with `SearchApplied { query: '' }`: no search predicate applied; all notes visible (subject to tag filter)
- Verification: `feedReducer.search.test.ts` (EC-S-002 cases)

---

### REQ-FILTER-017 — Adversarial input handling

**Ubiquitous**: THE SYSTEM SHALL handle pathological search inputs without throwing, hanging, or corrupting state:
- EC-S-011: Control characters (`\n`, `\t`, `\0`) in query — `String.includes` processes them literally; they match if present in haystack
- EC-S-012: Extremely long query (up to 10 000 characters) — `searchPredicate` runs substring match; performance may degrade for very long queries but correctness is maintained
- EC-S-013: RTL characters (Arabic, Hebrew) in query — substring match only; text direction is irrelevant to `String.includes`
- EC-S-014: Multiple consecutive Esc presses — second and subsequent presses dispatch `SearchCleared` with already-empty `searchQuery`; no visible change (no-op in reducer)
- EC-S-015: Special regex characters (`.*+?[]()`) in query — treated as literal characters (no regex engine)

**Acceptance Criteria**:
- `feedReducer` never throws for any string value of `SearchApplied.query` (length 0..10000, any Unicode)
- `searchPredicate` never throws for any string inputs
- Verification: `feedReducer.property.test.ts` (PROP-FILTER-005), `searchPredicate.property.test.ts` (PROP-FILTER-010)

---

## 4. Edge Case Catalog

### 4.1 Search Input Edge Cases

| ID | Edge Case | Expected Behavior |
|----|----------|-------------------|
| EC-S-001 | Empty string dispatched via `SearchApplied` | Reducer sets `searchQuery: ''`. No search predicate applied. All notes visible (subject to tag filter). |
| EC-S-002 | Whitespace-only query `"   "` dispatched via `SearchApplied` | Reducer applies `searchPredicate('   ', haystack)` literally. Matches notes with spaces in body/tags. |
| EC-S-003 | Very long query string (10 000 chars) | No client-side length limit. `searchPredicate` runs normally. Performance may degrade but correctness preserved. |
| EC-S-004 | Query with special regex chars (".*+?[]") | Case-insensitive substring only; no regex engine. Characters are literal. |
| EC-S-005 | Rapid keystroke followed by Esc before debounce | Debounce timer cancelled on Esc. `SearchCleared` fired immediately. Feed clears. |
| EC-S-006 | Search active when note is deleted | After `DomainSnapshotReceived`: `allNoteIds` no longer contains deleted note. `visibleNoteIds` recomputed. If empty, `feed-search-empty-state` shown. |
| EC-S-007 | Search active when note body saved with new content | After `DomainSnapshotReceived`: `noteMetadata` updated. `visibleNoteIds` recomputed — note may appear or disappear. |
| EC-S-008 | Query with only tag name (no body match needed) | Matches if any note tag name contains query as substring. e.g. query "dra" matches note with tag "draft". |
| EC-S-009 | Unicode query "テスト" | `toLowerCase()` does not change Japanese. Match is exact substring. |
| EC-S-010 | Esc key with no pending debounce | Timer cancel is no-op. `SearchCleared` dispatched. No visible change if already empty. |
| EC-S-011 | Control characters in query (\n, \t, \0) | `String.includes` processes literally. Match if present in haystack. |
| EC-S-012 | Extremely long query (10 000 chars) | No crash. Correctness preserved. |
| EC-S-013 | RTL characters in query | Substring match only. No directional difference. |
| EC-S-014 | Multiple consecutive Esc presses | Second+ press: `SearchCleared` with already-empty query. No-op. |
| EC-S-015 | Special regex chars in query | Treated as literal characters. |
| EC-S-016 | Rapid keystrokes within debounce window | Multiple keystrokes arriving within the 200ms window: only one `SearchApplied` is dispatched, 200ms after the LAST keystroke. Each new keystroke resets the debounce timer. REQ link: REQ-FILTER-002. |

### 4.2 Sort Edge Cases

| ID | Edge Case | Expected Behavior |
|----|----------|-------------------|
| EC-T-001 | Two notes with identical `updatedAt` | Tiebreak by `noteId` lexicographic in the same sort direction. Order is deterministic. |
| EC-T-002 | `updatedAt === 0` (legacy/unset notes) | Treated as epoch 0 ms. Sorted correctly relative to other notes. |
| EC-T-003 | Toggle sort while search is active | Sort direction flips immediately. `computeVisible` called with new direction. Search filter preserved. |
| EC-T-004 | Toggle sort while debounce is pending | Sort dispatched immediately. Shell's pending debounce timer continues. When timer fires, `SearchApplied` updates `searchQuery` with current `sortDirection`. No race — reducer state is authoritative. |
| EC-T-005 | Toggle sort with no notes in feed | `visibleNoteIds` stays empty. No error. |

### 4.3 Composition Edge Cases

| ID | Edge Case | Expected Behavior |
|----|----------|-------------------|
| EC-C-001 | Tag filter active, then search entered | Result is AND of tag-matched AND search-matched notes. |
| EC-C-002 | Search active, then tag filter toggled | Result is AND of current search + new tag set. |
| EC-C-003 | Both tag filter cleared and search cleared | `visibleNoteIds` = all notes sorted by current `sortDirection`. |
| EC-C-004 | Tag filter produces 3 notes; search narrows to 0 | `feed-search-empty-state` shown (at least one dimension active). |
| EC-C-005 | No tag filter, search produces 0 results | `feed-search-empty-state` shown (searchQuery is non-empty). |
| EC-C-006 | Both dimensions produce results, sort varies order | Only sort changes; set of visible notes unchanged. |
| EC-C-007 | `DomainSnapshotReceived` while debounce mid-flight | Snapshot processes synchronously. Shell's timer continues. When timer fires, `SearchApplied` dispatched with latest pending input. No race. |

### 4.4 EC → REQ Reverse-Lookup Index

Each EC ID appears exactly once in §4.1–§4.3 (the single source of truth). REQ cross-references in individual requirements point here by ID.

| EC ID | Category | Linked REQ(s) |
|-------|----------|---------------|
| EC-S-001 | Search input | REQ-FILTER-002, REQ-FILTER-005, REQ-FILTER-016 |
| EC-S-002 | Search input | REQ-FILTER-016 |
| EC-S-003 | Search input | REQ-FILTER-017 |
| EC-S-004 | Search input | REQ-FILTER-017 |
| EC-S-005 | Search input | REQ-FILTER-003 |
| EC-S-006 | Search input | REQ-FILTER-012 |
| EC-S-007 | Search input | REQ-FILTER-012 |
| EC-S-008 | Search input | REQ-FILTER-005 |
| EC-S-009 | Search input | REQ-FILTER-005 |
| EC-S-010 | Search input | REQ-FILTER-003 |
| EC-S-011 | Search input | REQ-FILTER-017 |
| EC-S-012 | Search input | REQ-FILTER-017 |
| EC-S-013 | Search input | REQ-FILTER-017 |
| EC-S-014 | Search input | REQ-FILTER-017 |
| EC-S-015 | Search input | REQ-FILTER-017 |
| EC-S-016 | Search input | REQ-FILTER-002 / PROP-FILTER-022 |
| EC-T-001 | Sort timing | REQ-FILTER-007, REQ-FILTER-009 |
| EC-T-002 | Sort timing | REQ-FILTER-007, REQ-FILTER-009 |
| EC-T-003 | Sort timing | REQ-FILTER-007, REQ-FILTER-008 |
| EC-T-004 | Sort timing | REQ-FILTER-007, REQ-FILTER-010 |
| EC-T-005 | Sort timing | REQ-FILTER-007 |
| EC-C-001 | Composition | REQ-FILTER-008 |
| EC-C-002 | Composition | REQ-FILTER-008 |
| EC-C-003 | Composition | REQ-FILTER-008 |
| EC-C-004 | Composition | REQ-FILTER-004, REQ-FILTER-008 |
| EC-C-005 | Composition | REQ-FILTER-004 |
| EC-C-006 | Composition | REQ-FILTER-009 |
| EC-C-007 | Composition | REQ-FILTER-010, REQ-FILTER-012 |

---

## 5. Non-Functional Requirements

### 5.1 Performance

- Debounce timer: exactly `SEARCH_DEBOUNCE_MS = 200` ms (constant, not configurable at runtime)
- Search filter computation on `DomainSnapshotReceived`: must complete within 50ms for up to 500 notes
- Sort toggle response: immediate (no debounce), must re-render within 16ms (one frame) for up to 500 notes
- `searchPredicate` per note: O(body.length + tags.join(' ').length) per note

### 5.2 Accessibility

- WCAG 2.1 Level AA minimum
- Search input: keyboard focus visible (`2px solid #097fe8`), `aria-label="ノート検索"`
- Sort toggle: keyboard activatable (Enter and Space keys trigger the toggle action), `aria-label="ソート方向（新しい順/古い順）"`

### 5.3 Design System

- All colors, spacing, fonts from DESIGN.md §10 Token Reference
- No hex or rgba values in component source files that are not listed in DESIGN.md §10

---

## 6. Type Contract Extensions

### 6.1 FeedViewState additions

```ts
// Added to existing FeedViewState (readonly fields, preserved across DomainSnapshotReceived):
searchQuery: string;               // '' = no active search. Set ONLY by SearchApplied / SearchCleared.
sortDirection: 'asc' | 'desc';    // Default: 'desc'. Set by SortDirectionToggled.
```

Initial values for `FeedViewState` construction:
```ts
searchQuery: '',
sortDirection: 'desc',
```

### 6.2 FeedAction additions

```ts
// New variants added to existing FeedAction union:
| { kind: 'SearchApplied';        query: string }   // fired by shell after debounce
| { kind: 'SearchCleared' }                          // fired on Esc; immediate clear
| { kind: 'SortDirectionToggled' }                   // fired on sort button click

// NOT added (shell-local state only):
// SearchInputChanged — does not exist in FeedAction
```

### 6.3 FeedCommand — no new variants

No new `FeedCommand` variants are introduced by this feature. The three new reducer cases all return `commands: []`.

---

## 7. Done Definition

This feature is **Done** when all of the following artifact-verifiable conditions hold:

1. `SearchInput.svelte` renders with correct DESIGN.md tokens, debounces at 200ms, clears on Esc, dispatches `SearchApplied` (not `SearchInputChanged`)
2. `SortToggle.svelte` renders ▼/▲, defaults to `desc`, dispatches `SortDirectionToggled` on click
3. `feedReducer` handles `SearchApplied`, `SearchCleared`, `SortDirectionToggled` without mutation or side effects; `SearchInputChanged` case is absent
4. `FeedViewState` contains `searchQuery` and `sortDirection`; both are preserved across `DomainSnapshotReceived`
5. `visibleNoteIds` reflects tag filter AND search AND sort composition at all times (via `computeVisible`)
6. `feed-search-empty-state` is shown when `visibleNoteIds` is empty and at least one of `searchQuery` / `activeFilterTags` is active
7. All REQ-FILTER-001..017 have corresponding passing vitest test cases (test IDs reference the REQ number)
8. All PROP-FILTER-001..025 in verification-architecture.md have passed (grep audit / vitest / fast-check as per tier)
9. `grep -E "setTimeout|Date\.now|fetch|invoke|\$state|\$effect|\$derived" feedReducer.ts` produces zero matches
10. `grep -rE "#[0-9a-fA-F]{3,6}|rgba?\(" SearchInput.svelte SortToggle.svelte` produces only values listed in DESIGN.md §10
