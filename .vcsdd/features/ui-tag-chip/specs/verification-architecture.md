# Verification Architecture — ui-tag-chip

Feature: `ui-tag-chip`
Phase: 1b
Mode: strict
Language: typescript

## 1. Purity Boundary Map

```
┌─────────────────────────────────────────────────────────────┐
│                    EFFECTFUL SHELL                           │
│                                                              │
│  FeedList.svelte (Svelte component)                         │
│  ├── subscribe to FeedStateChannel (IPC events)             │
│  ├── TauriFeedAdapter.dispatchXxx() calls                   │
│  ├── TagChipUpdate pipeline invocation (write I/O)          │
│  └── ApplyFilterOrSearch pipeline invocation (pure, but     │
│      fed from snapshots obtained via IPC)                   │
│                                                              │
│  TagChip.svelte / TagAutocomplete.svelte (new components)   │
│  ├── User input handling (keyboard, click)                  │
│  ├── DOM manipulation (focus, blur)                         │
│  └── Delegates to feedReducer for state changes             │
│                                                              │
│  TagFilterSidebar.svelte (new component)                    │
│  ├── Renders TagInventory.entries from FeedViewState        │
│  └── Click handlers → feedReducer → commands               │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                    PURE CORE                                 │
│                                                              │
│  feedReducer.ts (extended)                                   │
│  ├── TagAddClicked handler                                  │
│  ├── TagRemoveClicked handler                               │
│  ├── TagInputCommitted handler (validates via tryNewTag)    │
│  ├── TagInputCancelled handler                              │
│  ├── TagFilterToggled handler                               │
│  ├── TagFilterCleared handler                               │
│  └── DomainSnapshotReceived → tagInventory mirror           │
│                                                              │
│  tryNewTag(raw) — from domain/apply-filter-or-search/       │
│  parseFilterInput(raw) — from domain/                       │
│  applyFilterOrSearch(feed, applied, snapshots) — from domain│
│                                                              │
│  types.ts (extended)                                         │
│  ├── FeedViewState + tagInventory, activeFilterTags          │
│  ├── FeedAction + tag variants                              │
│  ├── FeedCommand + tag variants                             │
│  └── FeedDomainSnapshot + tagInventory                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 2. Proof Obligations

### PROP-TAG-001 — Tag chip DOM structure
**Maps to**: REQ-TAG-001
**Tier**: 1 (component render test)
**Assertion**: Each tag chip in a feed row renders with correct HTML structure (span.tag-chip with text content, containing a remove button with aria-label).

### PROP-TAG-002 — Remove button dispatches RemoveTagViaChip
**Maps to**: REQ-TAG-002
**Tier**: 1 (integration test with mocked adapter)
**Assertion**: Clicking "×" on a tag chip dispatches `remove-tag-via-chip` command with correct noteId and tag.

### PROP-TAG-003 — Idempotent remove: domain short-circuits
**Maps to**: REQ-TAG-003
**Tier**: 0 (delegated to tag-chip-update domain tests — already proved)
**Assertion**: Covered by PROP-TCU-004 in tag-chip-update feature. UI layer does not need to re-verify.

### PROP-TAG-004 — "+" button displays tag input
**Maps to**: REQ-TAG-004
**Tier**: 1 (component render test)
**Assertion**: Clicking "+" on a feed row sets `tagAutocompleteVisibleFor` to that noteId and renders an input field.

### PROP-TAG-005 — Autocomplete suggestions from TagInventory
**Maps to**: REQ-TAG-005
**Tier**: 2 (property test)
**Assertion**: For any TagInventory and any input prefix, displayed suggestions are a subset of TagInventory.entries whose names contain the prefix (case-insensitive), sorted by usageCount descending.

### PROP-TAG-006 — Autocomplete selection dispatches AddTagViaChip
**Maps to**: REQ-TAG-005
**Tier**: 1 (integration test)
**Assertion**: Selecting a suggestion or pressing Enter with valid input dispatches `add-tag-via-chip` with normalized tag.

### PROP-TAG-007 — TagError "empty" displays error message
**Maps to**: REQ-TAG-006
**Tier**: 1 (component test)
**Assertion**: Submitting empty string shows "タグは空にできません" and does NOT dispatch a command.

### PROP-TAG-008 — TagError "only-whitespace" displays error message
**Maps to**: REQ-TAG-006
**Tier**: 1 (component test)
**Assertion**: Submitting whitespace-only string shows "タグは空にできません" and does NOT dispatch a command.

### PROP-TAG-009 — Escape closes tag input without dispatch
**Maps to**: REQ-TAG-007
**Tier**: 1 (component test)
**Assertion**: Pressing Escape while tag input is focused closes the input and dispatches no command.

### PROP-TAG-010 — Blur with valid text commits tag
**Maps to**: REQ-TAG-007
**Tier**: 1 (component test)
**Assertion**: Blurring the tag input with valid non-empty text dispatches `add-tag-via-chip`.

### PROP-TAG-011 — Idempotent add: domain short-circuits
**Maps to**: REQ-TAG-008
**Tier**: 0 (delegated to tag-chip-update domain tests)
**Assertion**: Covered by PROP-TCU-004 in tag-chip-update feature.

### PROP-TAG-012 — Tag filter sidebar renders entries by usageCount desc
**Maps to**: REQ-TAG-009
**Tier**: 2 (property test)
**Assertion**: For any non-empty TagInventory, the sidebar renders entries in descending usageCount order. Each entry is labeled `#name (count)`.

### PROP-TAG-013 — Empty tag inventory hides sidebar section
**Maps to**: REQ-TAG-009
**Tier**: 1 (render test)
**Assertion**: When TagInventory.entries is empty, the tag filter sidebar section is not rendered.

### PROP-TAG-014 — Click tag filters feed
**Maps to**: REQ-TAG-010
**Tier**: 1 (integration test)
**Assertion**: Clicking a tag in the sidebar dispatches `apply-tag-filter` command and visually highlights the tag.

### PROP-TAG-015 — Click selected tag removes filter
**Maps to**: REQ-TAG-011
**Tier**: 1 (integration test)
**Assertion**: Clicking an already-selected tag dispatches `remove-tag-filter` and removes visual highlight.

### PROP-TAG-016 — Clear all resets filters
**Maps to**: REQ-TAG-012
**Tier**: 1 (integration test)
**Assertion**: Clicking "すべて解除" dispatches `clear-filter` and removes all highlights.

### PROP-TAG-017 — OR semantics (domain)
**Maps to**: REQ-TAG-013
**Tier**: 0 (delegated to apply-filter-or-search domain tests)
**Assertion**: Covered by PROP-AFS-003 in apply-filter-or-search feature.

### PROP-TAG-018 — Unused tag auto-hide (domain)
**Maps to**: REQ-TAG-014
**Tier**: 0 (delegated to TagInventory domain tests)
**Assertion**: Covered by TagInventory invariant validation in tag-chip-update domain feature. UI mirrors what domain provides.

### PROP-TAG-019 — DESIGN.md tokens in rendered output
**Maps to**: REQ-TAG-015
**Tier**: 1 (snapshot test)
**Assertion**: Rendered tag chips and sidebar use DESIGN.md color tokens (no hardcoded non-token values). Verified via CSS snapshot or design token audit test.

### PROP-TAG-020 — Accessibility: aria labels on interactive elements
**Maps to**: REQ-TAG-016
**Tier**: 1 (accessibility test)
**Assertion**: Remove buttons have `aria-label` containing the tag name. Add buttons have `aria-label="タグを追加"`. Filter sidebar items have `role="checkbox"` and `aria-checked`.

### PROP-TAG-021 — Keyboard navigation in autocomplete
**Maps to**: REQ-TAG-016 (EC-021)
**Tier**: 1 (interaction test)
**Assertion**: Arrow Up/Down navigates autocomplete list; Enter selects; Escape closes.

### PROP-TAG-022 — Domain pipeline import (no reimplementation)
**Maps to**: REQ-TAG-017
**Tier**: 3 (static analysis / import audit)
**Assertion**: No file in the feature scope reimplements logic from `tag-chip-update` or `apply-filter-or-search` domain modules. Verified via grep for function/type redefinitions.

### PROP-TAG-023 — FeedViewState type extension
**Maps to**: REQ-TAG-017
**Tier**: 3 (type-level test)
**Assertion**: `FeedViewState` includes `tagInventory` and `activeFilterTags` fields. Compilation succeeds with these extensions.

### PROP-TAG-024 — FeedDomainSnapshot carries tagInventory
**Maps to**: REQ-TAG-018
**Tier**: 3 (type-level test)
**Assertion**: `FeedDomainSnapshot` type extends with `tagInventory` field. TypeScript compilation verifies.

### PROP-TAG-025 — feedReducer handles all new FeedAction variants
**Maps to**: REQ-TAG-017
**Tier**: 2 (property test)
**Assertion**: feedReducer is a total function over the extended FeedAction type. Every new variant produces a valid state and commands array. No variant throws or returns undefined.

### PROP-TAG-026 — Exhaustive matching in feedReducer
**Maps to**: REQ-TAG-017
**Tier**: 3 (type-level test)
**Assertion**: feedReducer's switch statement exhaustively covers all FeedAction variants (TypeScript `never` check on default branch).

### PROP-TAG-027 — Zero-filter state (REQ-TAG-019)
**Maps to**: REQ-TAG-019
**Tier**: 1 (component test)
**Assertion**: When `activeFilterTags` is empty, no tags are highlighted in sidebar and all notes are visible.

## 3. Verification Tier Assignment

| Tier | Count | Description |
|------|-------|-------------|
| 0 | 5 | Delegated to existing domain feature proofs (no new proofs needed at UI layer) |
| 1 | 14 | Component render tests, integration tests, accessibility tests (vitest + svelte-testing-library) |
| 2 | 3 | Property tests (fast-check) for autocomplete logic, sorting, reducer totality |
| 3 | 5 | Type-level tests, static analysis (TypeScript compilation, grep audit) |

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
│   │   ├── feedReducer.tag.test.ts          # PROP-TAG-025, 026
│   │   ├── TagChip.test.ts                  # PROP-TAG-001, 002, 004
│   │   ├── TagAutocomplete.test.ts          # PROP-TAG-005, 006, 007, 008, 009, 010
│   │   └── TagFilterSidebar.test.ts         # PROP-TAG-012, 013, 014, 015, 016, 027
│   └── ...
└── components/
    ├── __tests__/
    │   └── TagChip.accessibility.test.ts    # PROP-TAG-020, 021
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
  └── FeedRow (real) + TagChip (real)
        └── tag add flow: click "+" → type → select → verify dispatch
        └── tag remove flow: click "×" → verify dispatch

TagFilterSidebar (real) + mock adapter
  └── click tag → verify dispatch + highlight
  └── click selected tag → verify dispatch + unhighlight
  └── click "すべて解除" → verify dispatch + all unhighlighted
```

## 5. Type-Level Guarantees

### 5.1 FeedAction exhaustiveness

The extended `FeedAction` type must be a discriminated union. The `feedReducer` must use a `switch` statement whose default branch assigns to `never`, guaranteeing compile-time exhaustiveness checking.

### 5.2 No reimplementation of domain types

The feature must import domain types from `docs/domain/code/ts/src/` or `$lib/domain/` rather than redefining them locally. A grep audit (Tier 3) verifies this.

### 5.3 Purity audit

`feedReducer.ts` must remain pure. A grep check for forbidden APIs (Math.random, Date.now, fetch, setTimeout, localStorage, etc.) across all pure-core files must yield zero matches. The existing PROP-FEED-031 purity audit pattern is extended to new files.

## 6. Verification Tooling

| Tool | Purpose | Tier |
|------|---------|------|
| vitest | Unit/component/integration tests | 1 |
| @testing-library/svelte | Component render/interaction tests | 1 |
| fast-check | Property-based tests | 2 |
| tsc --noEmit | Type-level verification | 3 |
| eslint | Code quality, import restrictions | 3 |
| grep audit | Forbidden API detection, no-reimplementation check | 3 |
