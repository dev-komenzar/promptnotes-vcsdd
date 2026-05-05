# Verification Architecture — ui-tag-chip

Feature: `ui-tag-chip`
Phase: 1b (iteration 2 — addressing FIND-005..007, FIND-014)
Mode: strict
Language: typescript

## 1. Purity Boundary Map

```
┌─────────────────────────────────────────────────────────────┐
│                    EFFECTFUL SHELL                           │
│                                                              │
│  FeedList.svelte (extended)                                  │
│  ├── subscribe to FeedStateChannel (IPC events)             │
│  ├── TauriFeedAdapter.dispatchXxx() calls                   │
│  ├── TagChipUpdate pipeline invocation (write I/O)          │
│  └── Commands from feedReducer → adapter calls              │
│                                                              │
│  TagFilterSidebar.svelte (new component)                    │
│  ├── Renders tag list from noteMetadata (computed client)   │
│  ├── Click handlers → feedReducer → commands               │
│  └── Sibling of FeedList in aside.feed-sidebar              │
│                                                              │
│  FeedRow.svelte (extended)                                   │
│  ├── Tag chip "×" and "+" interactive buttons              │
│  ├── Tag input with autocomplete dropdown                   │
│  └── Delegates to feedReducer for state changes             │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                    PURE CORE                                 │
│                                                              │
│  feedReducer.ts (extended)                                   │
│  ├── DomainSnapshotReceived: preserves activeFilterTags     │
│  │   and tagAutocompleteVisibleFor (like loadingStatus)     │
│  ├── TagAddClicked → opens input (mutual exclusion)        │
│  ├── TagRemoveClicked → emits remove-tag-via-chip cmd      │
│  ├── TagInputCommitted → validates via tryNewTag            │
│  ├── TagInputCancelled → closes input                      │
│  ├── TagFilterToggled → toggles activeFilterTags            │
│  └── TagFilterCleared → resets activeFilterTags             │
│                                                              │
│  tagInventoryFromMetadata(noteMetadata): TagEntry[]         │
│  ├── Pure: iterate noteMetadata, count tags                │
│  └── New pure function (no domain dependency)              │
│                                                              │
│  tryNewTag(raw) — from domain/apply-filter-or-search/       │
│  parseFilterInput(raw) — from domain/                       │
│  applyFilterOrSearch(feed, applied, snapshots) — from domain│
│                                                              │
│  types.ts (extended)                                         │
│  ├── FeedViewState + tagAutocompleteVisibleFor              │
│  │   + activeFilterTags (preserved across snapshots)        │
│  ├── FeedAction + tag variants (6 new)                      │
│  ├── FeedCommand + tag variants (5 new)                     │
│  └── FeedDomainSnapshot — NO extension (FIND-004)           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 2. Proof Obligations

### PROP-TAG-001 — Tag chip DOM structure
**Maps to**: REQ-TAG-001
**Tier**: 1 (component render test)
**Assertion**: Each tag chip in a feed row renders with correct HTML structure (span.tag-chip with text content, containing a remove button with aria-label). Uses DESIGN.md tokens for colors/sizes.

### PROP-TAG-002 — Remove button dispatches RemoveTagViaChip
**Maps to**: REQ-TAG-002
**Tier**: 1 (integration test with mocked adapter)
**Assertion**: Clicking "×" on a tag chip dispatches `remove-tag-via-chip` command with correct noteId and tag. When a tag input is open on the same row, the input is closed first before the remove command is dispatched.

### PROP-TAG-003 — Idempotent remove: domain short-circuits
**Maps to**: REQ-TAG-003
**Tier**: 0 (delegated to tag-chip-update domain tests — already proved)
**Assertion**: Covered by PROP-TCU-004 in tag-chip-update feature. UI layer does not need to re-verify.

### PROP-TAG-004 — "+" button displays tag input with mutual exclusion
**Maps to**: REQ-TAG-004
**Tier**: 1 (component render test)
**Assertion**: Clicking "+" on a feed row sets `tagAutocompleteVisibleFor` to that noteId. If another row already has an open input, it closes first (mutual exclusion).

### PROP-TAG-005 — Autocomplete suggestions from computed tag inventory
**Maps to**: REQ-TAG-005
**Tier**: 2 (property test)
**Assertion**: For any noteMetadata and any input prefix, displayed suggestions are a subset of tags present in noteMetadata whose names contain the prefix (case-insensitive), sorted by usageCount descending.

### PROP-TAG-006 — Autocomplete selection dispatches AddTagViaChip
**Maps to**: REQ-TAG-005
**Tier**: 1 (integration test)
**Assertion**: Selecting a suggestion or pressing Enter with valid input dispatches `add-tag-via-chip` with normalized tag.

### PROP-TAG-007 — TagError "empty" displays error message
**Maps to**: REQ-TAG-006
**Tier**: 1 (component test)
**Assertion**: Submitting empty string via tryNewTag shows "タグは空にできません" and does NOT dispatch a command.

### PROP-TAG-008 — TagError "only-whitespace" displays error message
**Maps to**: REQ-TAG-006
**Tier**: 1 (component test)
**Assertion**: Submitting whitespace-only string via tryNewTag shows "タグは空にできません" and does NOT dispatch a command.

### PROP-TAG-009 — Escape closes tag input without dispatch
**Maps to**: REQ-TAG-007
**Tier**: 1 (component test)
**Assertion**: Pressing Escape while tag input is focused closes the input and dispatches `TagInputCancelled`.

### PROP-TAG-010 — Blur with valid text commits tag
**Maps to**: REQ-TAG-007
**Tier**: 1 (component test)
**Assertion**: Blurring the tag input with valid non-empty text dispatches `add-tag-via-chip` and closes input.

### PROP-TAG-010a — Blur with invalid text shows error, keeps input open
**Maps to**: REQ-TAG-007 (EC-007a)
**Tier**: 1 (component test)
**Assertion**: Blurring the tag input with non-empty text that fails tryNewTag validation displays the TagError message and keeps the input open (does NOT discard user input). Added per FIND-006.

### PROP-TAG-010b — Blur with empty input closes silently
**Maps to**: REQ-TAG-007 (EC-007b)
**Tier**: 1 (component test)
**Assertion**: Blurring the tag input when the text is empty (trimmed length 0) closes the input without dispatching any command.

### PROP-TAG-011 — Idempotent add: domain short-circuits
**Maps to**: REQ-TAG-008
**Tier**: 0 (delegated to tag-chip-update domain tests)
**Assertion**: Covered by PROP-TCU-004 in tag-chip-update feature.

### PROP-TAG-012 — Tag filter sidebar renders entries by usageCount desc
**Maps to**: REQ-TAG-009
**Tier**: 2 (property test)
**Assertion**: For any non-empty noteMetadata, the sidebar renders entries in descending usageCount order. Each entry is labeled `#name (count)`.

### PROP-TAG-013 — Empty tag inventory hides sidebar section
**Maps to**: REQ-TAG-009
**Tier**: 1 (render test)
**Assertion**: When no tags exist in noteMetadata, the tag filter sidebar section is not rendered.

### PROP-TAG-014 — Click tag in sidebar applies filter
**Maps to**: REQ-TAG-010
**Tier**: 1 (integration test)
**Assertion**: Clicking a tag in the sidebar dispatches `apply-tag-filter` command and visually highlights the tag. Uses existing `FilterApplied` action without modification.

### PROP-TAG-015 — Click selected tag removes filter
**Maps to**: REQ-TAG-011
**Tier**: 1 (integration test)
**Assertion**: Clicking an already-selected tag dispatches `remove-tag-filter` and removes visual highlight.

### PROP-TAG-016 — Clear all resets filters
**Maps to**: REQ-TAG-012
**Tier**: 1 (integration test)
**Assertion**: Clicking "すべて解除" dispatches `clear-filter` and removes all highlights. Uses existing `FilterCleared` action.

### PROP-TAG-017 — OR semantics (domain)
**Maps to**: REQ-TAG-013
**Tier**: 0 (delegated to apply-filter-or-search domain tests)
**Assertion**: Covered by PROP-AFS-003 in apply-filter-or-search feature.

### PROP-TAG-018 — Unused tag auto-hide (client-side computation)
**Maps to**: REQ-TAG-014
**Tier**: 2 (property test)
**Assertion**: For any noteMetadata, the computed tag inventory contains ONLY tags with usageCount > 0. When a tag's last occurrence is removed, it disappears from the sidebar on next render.

### PROP-TAG-019 — DESIGN.md tokens in rendered output
**Maps to**: REQ-TAG-015
**Tier**: 1 (snapshot test)
**Assertion**: Rendered tag chips and sidebar use DESIGN.md color tokens (no hardcoded non-token values). Verified via CSS snapshot or design token audit test.

### PROP-TAG-020 — Accessibility: aria labels on interactive elements
**Maps to**: REQ-TAG-016
**Tier**: 1 (accessibility test)
**Assertion**: Remove buttons have `aria-label` containing the tag name. Add buttons have `aria-label="タグを追加"`. Filter sidebar items have `role="checkbox"` and `aria-checked`.

### PROP-TAG-021 — Keyboard navigation in autocomplete
**Maps to**: REQ-TAG-005
**Tier**: 1 (interaction test)
**Assertion**: Arrow Up/Down navigates autocomplete list; Enter selects; Escape closes. Fixed traceability (FIND-014): keyboard navigation is functional UX behavior, maps to the autocomplete requirement.

### PROP-TAG-022 — Domain pipeline import (no reimplementation)
**Maps to**: REQ-TAG-017
**Tier**: 3 (static analysis / import audit)
**Assertion**: No file in the feature scope reimplements logic from `tag-chip-update` or `apply-filter-or-search` domain modules. Verified via grep for function/type redefinitions.

### PROP-TAG-023 — FeedViewState type extension (activeFilterTags and tagAutocompleteVisibleFor)
**Maps to**: REQ-TAG-017
**Tier**: 3 (type-level test)
**Assertion**: `FeedViewState` includes `activeFilterTags` (readonly string[]) and `tagAutocompleteVisibleFor` (string | null). TypeScript compilation verifies.

### PROP-TAG-024 — activeFilterTags preservation across DomainSnapshotReceived
**Maps to**: REQ-TAG-017 (FIND-003 resolution)
**Tier**: 1 (reducer unit test)
**Assertion**: When `DomainSnapshotReceived` action is dispatched, `feedReducer` produces a state where `activeFilterTags` equals the previous state's `activeFilterTags` (preserved, not overwritten). Same preservation pattern as `loadingStatus`.

### PROP-TAG-025 — feedReducer handles all new FeedAction variants
**Maps to**: REQ-TAG-017
**Tier**: 2 (property test)
**Assertion**: feedReducer is a total function over the extended FeedAction type. Every new variant produces a valid state and commands array. No variant throws or returns undefined.

### PROP-TAG-026 — Exhaustive matching in feedReducer
**Maps to**: REQ-TAG-017
**Tier**: 3 (type-level test)
**Assertion**: feedReducer's switch statement exhaustively covers all FeedAction variants (TypeScript `never` check on default branch).

### PROP-TAG-027 — Zero-filter state
**Maps to**: REQ-TAG-019
**Tier**: 1 (component test)
**Assertion**: When `activeFilterTags` is empty, no tags are highlighted in sidebar and all notes are visible.

### PROP-TAG-028 — Tag chip overflow wrapping (EC-013)
**Maps to**: REQ-TAG-001 (EC-013)
**Tier**: 1 (component render test)
**Assertion**: When a feed row has 10+ tags, the tag list uses `flex-wrap: wrap` (verified via computed style), individual chips are truncated at max-width 160px with `text-overflow: ellipsis`, and no chip overflows its container. Added per FIND-005.

### PROP-TAG-029 — Close-input-before-remove interaction (EC-018)
**Maps to**: REQ-TAG-002 (EC-018)
**Tier**: 1 (component integration test)
**Assertion**: When tag input is open on a row and user clicks "×" on a chip in the same row, the input closes (tagAutocompleteVisibleFor set to null) BEFORE the remove-tag-via-chip command is dispatched. The remove command is still dispatched after input closure. Added per FIND-007.

### PROP-TAG-030 — TagInventory pure computation from noteMetadata
**Maps to**: REQ-TAG-018
**Tier**: 2 (property test)
**Assertion**: For any noteMetadata (Record<noteId, { tags: string[] }>), the computed tag inventory satisfies:
- Each entry has usageCount > 0
- Entries are unique by name
- Entries are sorted by usageCount descending
- UsageCount equals the actual count of notes containing that tag

### PROP-TAG-031 — Single-input mutual exclusion (EC-018a)
**Maps to**: REQ-TAG-004 (EC-018a)
**Tier**: 1 (component integration test)
**Assertion**: When tag input is open on row A and user clicks "+" on row B, row A's input closes (TagInputCancelled dispatched) and row B's input opens (TagAddClicked dispatched). Only one row's input is visible at any time.

### PROP-TAG-032 — Max tag length rejection (EC-007c)
**Maps to**: REQ-TAG-005 (EC-007c)
**Tier**: 1 (component test)
**Assertion**: Submitting a tag longer than 100 characters (after normalization) displays "タグが長すぎます（100文字以内）", does NOT dispatch a command, and keeps the input open.

### PROP-TAG-033 — Note deletion closes tag input (EC-023)
**Maps to**: EC-023
**Tier**: 1 (reducer unit test)
**Assertion**: When `DomainSnapshotReceived` arrives with a noteId removed from noteMetadata, and that noteId matches `tagAutocompleteVisibleFor`, the reducer sets `tagAutocompleteVisibleFor` to null.

## 3. Verification Tier Assignment

| Tier | Count | Description |
|------|-------|-------------|
| 0 | 3 | Delegated to existing domain feature proofs (no new proofs needed at UI layer) |
| 1 | 20 | Component render tests, integration tests, accessibility tests, reducer unit tests (vitest + svelte-testing-library) |
| 2 | 4 | Property tests (fast-check) for autocomplete logic, sorting, inventory computation, reducer totality |
| 3 | 3 | Type-level tests, static analysis (TypeScript compilation, grep audit) |

## 4. Test Architecture

### 4.1 Framework
- **vitest** for unit and integration tests
- **@testing-library/svelte** for component rendering tests
- **fast-check** for property-based tests (Tier 2)

### 4.2 Test File Structure

```
promptnotes/src/lib/
├── feed/
│   ├── __tests__/
│   │   ├── feedReducer.tag.test.ts          # PROP-TAG-024, 025, 026, 033
│   │   ├── tagInventory.test.ts             # PROP-TAG-005, 018, 030 (property tests)
│   │   ├── TagChip.test.ts                  # PROP-TAG-001, 002, 004, 028, 029, 031
│   │   ├── TagAutocomplete.test.ts          # PROP-TAG-006, 007, 008, 009, 010, 010a, 010b, 021, 032
│   │   └── TagFilterSidebar.test.ts         # PROP-TAG-012, 013, 014, 015, 016, 027
│   └── ...
└── components/
    ├── __tests__/
    │   └── TagChip.accessibility.test.ts    # PROP-TAG-020
    └── ...
```

### 4.3 Mock Strategy

- **Domain pipelines**: Wagyu-mock the `tagChipUpdate` and `applyFilterOrSearch` functions for reducer/component tests
- **Adapter**: Jest mock for `TauriFeedAdapter` with test spies on dispatch methods
- **StateChannel**: Provide test `FeedStateChannel` that emits controlled snapshots
- **tryNewTag**: Use the real pure function (no mock needed — it's pure)

### 4.4 Integration Test Topology

```
FeedList (real) + mock adapter + mock stateChannel
  └── FeedRow (real) + TagChip interactions
        └── tag add flow: click "+" → input opens → type → select/Enter → verify dispatch
        └── tag remove flow: click "×" → verify dispatch (+ close input if open)
        └── mutual exclusion: open input on A, click "+" on B → A closes, B opens

TagFilterSidebar (real) + mock adapter + mock noteMetadata
  └── render tags by usageCount
  └── click tag → verify dispatch + highlight
  └── click selected tag → verify dispatch + unhighlight
  └── click "すべて解除" → verify dispatch + all unhighlighted
  └── empty noteMetadata → sidebar not rendered
```

## 5. Type-Level Guarantees

### 5.1 FeedAction exhaustiveness

The extended `FeedAction` type must be a discriminated union. The `feedReducer` must use a `switch` statement whose default branch assigns to `never`, guaranteeing compile-time exhaustiveness checking.

### 5.2 No reimplementation of domain types

The feature must import domain types from `docs/domain/code/ts/src/` or `$lib/domain/` rather than redefining them locally. A grep audit (Tier 3) verifies this.

### 5.3 Purity audit

`feedReducer.ts` must remain pure. A grep check for forbidden APIs (Math.random, Date.now, fetch, setTimeout, localStorage, etc.) across all pure-core files must yield zero matches. The existing PROP-FEED-031 purity audit pattern is extended to new files.

### 5.4 activeFilterTags preservation

The `DomainSnapshotReceived` handler in feedReducer MUST preserve `activeFilterTags` from the previous state. A unit test (PROP-TAG-024) verifies this explicitly. The preservation follows the same pattern as `loadingStatus` on feedReducer.ts:35.

## 6. Verification Tooling

| Tool | Purpose | Tier |
|------|---------|------|
| vitest | Unit/component/integration tests | 1 |
| @testing-library/svelte | Component render/interaction tests | 1 |
| fast-check | Property-based tests | 2 |
| tsc --noEmit | Type-level verification | 3 |
| eslint | Code quality, import restrictions | 3 |
| grep audit | Forbidden API detection, no-reimplementation check | 3 |
