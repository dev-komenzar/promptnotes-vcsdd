---
coherence:
  node_id: "req:ui-tag-chip"
  type: req
  name: "ui-tag-chip 行動仕様"
  depends_on:
    - id: "governance:implement-mapping"
      relation: derives_from
    - id: "design:ui-fields"
      relation: derives_from
    - id: "design:workflows"
      relation: derives_from
    - id: "design:aggregates"
      relation: derives_from
    - id: "governance:glossary"
      relation: specifies
    - id: "governance:design-system"
      relation: depends_on
  modules:
    - "ui-tag-chip"
    - "tag-chip-update"
    - "apply-filter-or-search"
  source_files:
    - "promptnotes/src/lib/feed/TagFilterSidebar.svelte"
    - "promptnotes/src/lib/feed/FeedRow.svelte"
    - "promptnotes/src/lib/feed/feedReducer.ts"
    - "promptnotes/src/lib/feed/tagInventory.ts"
    - "promptnotes/src/lib/feed/tauriFeedAdapter.ts"
    - "promptnotes/src/lib/domain/tag-chip-update"
    - "promptnotes/src/lib/domain/apply-filter-or-search"
---

# Behavioral Specification — ui-tag-chip

Feature: `ui-tag-chip`
Mode: strict
Language: typescript
Phase: 1a (iteration 2 — addressing FIND-001..FIND-014)

## 1. Feature Overview

This feature makes tag chips interactive on feed rows and adds a tag filter sidebar to the left panel. Users can add/remove tags directly on feed rows without opening the editor, and filter the feed by selecting tags in the sidebar.

### 1.1 Scope

**Included:**
- Interactive tag chips on feed rows: "×" to remove, "+" to add
- Autocomplete suggest from `TagInventory.entries` when adding tags
- Tag normalization via `parseFilterInput` (which wraps `tryNewTag`) with `TagError` UI feedback
- Left sidebar tag filter list (usageCount descending, `#tag (count)` format)
- `ApplyTagFilter` / `RemoveTagFilter` / `ClearFilter` actions
- Multi-select OR semantics within tags
- Unused tag auto-hide (usageCount > 0 invariant)
- DESIGN.md token compliance

**Excluded:**
- Free-text search (feature 5: `ui-filter-search`)
- Sort toggle (feature 5)
- Frontmatter field filters (MVP scope)
- Tag management in editor (feature 2: `ui-editor`)

### 1.2 Dependencies (already completed)

| Dependency | Status | Used for |
|-----------|--------|---------|
| `tag-chip-update` domain pipeline | complete | `AddTagViaChip` / `RemoveTagViaChip` command handling |
| `apply-filter-or-search` domain pipeline | complete | `parseFilterInput` + `applyFilterOrSearch` for filter |
| `ui-feed-list-actions` (feature 3) | complete | FeedList, FeedRow, feedReducer, FeedViewState |

### 1.3 Integration Boundaries

- **Domain pipelines**: Import from `$lib/domain/tag-chip-update/` and `$lib/domain/apply-filter-or-search/` — do NOT reimplement
- **Tag normalization**: The domain module's `index.ts` barrel currently does not re-export `tryNewTag` (it is documented as an implementation detail of `parseFilterInput`). This feature requests that **`tryNewTag` be added to the `apply-filter-or-search` barrel export** (`index.ts`) so the UI layer can use it without bypassing encapsulation. The UI needs distinct `TagError.kind` values (`"empty"`, `"only-whitespace"`) to display appropriate error messages, which the `parseFilterInput` wrapper erases to `{ kind: "invalid-tag" }`. Until the barrel is updated, the feature imports directly from `try-new-tag.js` with a `// TODO: use barrel re-export after domain module updated` comment. See FIND-001 resolution.
- **TagInventory computation**: TagInventory (usageCounts) is computed client-side from the existing `noteMetadata` in `FeedViewState`, rather than requiring a new field in `FeedDomainSnapshot`. This avoids any Rust/Tauri IPC changes. See FIND-004 resolution.
- **Feed reducer**: Extend `feedReducer` in `$lib/feed/` with new actions. The `DomainSnapshotReceived` handler preserves UI-local state (`activeFilterTags`, `loadingStatus`) from the previous state, stores `allNoteIds` from the snapshot, and re-applies the active tag filter if any tags are selected. See FIND-003 resolution.
- **Tag filter computation**: Performed in the pure reducer by filtering `allNoteIds` against `noteMetadata` tags using OR semantics. This avoids requiring domain types (`Feed`, `NoteFileSnapshot[]`) at the UI layer while maintaining semantic equivalence with `applyFilterOrSearch`.
- **Tauri commands**: One new Rust command added in sprint-2 bugfix: `write_file_atomic(path, contents)` — exports the existing `fs_write_file_atomic` internal function as a `#[tauri::command]` for tag chip saves. The adapter serializes frontmatter YAML + body to markdown and calls this command. See bugfix-tag-save.md.
- **Post-save UI refresh**: After `write_file_atomic` succeeds, `FeedList.dispatchCommand` updates `currentViewState.noteMetadata` locally (Svelte `$state` reactivity triggers immediate re-render) — no vault re-scan needed.
- **Max tag length**: Tags longer than **100 characters** (after normalization) shall be rejected with a UI message. This is a UI-layer constraint only (the domain pipeline and storage layers accept unbounded length). Rationale: tag chips have max-width 160px, and 100 chars covers any practical use case while preventing layout abuse. See FIND-010 resolution.

---

## 2. EARS Requirements

### REQ-TAG-001 — Tag chip display on feed rows

**Ubiquitous**: THE SYSTEM SHALL render each note's tags as interactive pill badges (`<span class="tag-chip">`) within the feed row, following the existing DESIGN.md pill badge styling (bg `#f2f9ff`, text `#097fe8`, border-radius `9999px`, padding `4px 8px`, font-size `12px`, font-weight `600`).

### REQ-TAG-002 — Remove tag button on each chip

**Ubiquitous**: THE SYSTEM SHALL display a remove button ("×") on the right side of each tag chip in feed rows.

**Event-driven**: WHEN the remove button ("×") on a tag chip is clicked, THE SYSTEM SHALL:
1. IF a tag input is currently open on the same row, close the input first
2. Dispatch `RemoveTagViaChip { noteId, tag }` through the tag-chip-update domain pipeline

### REQ-TAG-003 — Idempotent tag removal

**Conditional**: IF a remove request targets a tag not present on the note, THEN THE SYSTEM SHALL silently succeed (idempotent; the domain pipeline short-circuits before I/O).

### REQ-TAG-004 — Add tag button on feed row

**Ubiquitous**: THE SYSTEM SHALL display an add tag button ("+") at the end of the tag list on each feed row.

**Event-driven**: WHEN the "+" button is clicked, THE SYSTEM SHALL:
1. Close any tag input currently open on a different row (enforcing single-input-across-all-rows invariant)
2. Display an inline tag input field on the clicked row with autocomplete suggestions sourced from `TagInventory.entries`

### REQ-TAG-005 — Tag input with autocomplete

**State-driven**: WHILE the tag input is focused, THE SYSTEM SHALL show a dropdown list of matching `TagInventory.entries` (filtered by user-typed prefix, case-insensitive), ordered by `usageCount` descending.

**Event-driven**: WHEN the user selects a suggestion from the autocomplete list or presses Enter with valid input, THE SYSTEM SHALL:
1. Normalize the raw string via `tryNewTag(raw)`
2. If normalization fails, display the appropriate `TagError` message adjacent to the input
3. If normalization succeeds and the tag does not exceed 100 characters (after normalization), dispatch `AddTagViaChip { noteId, tag }` through the tag-chip-update domain pipeline
4. If normalization succeeds but the tag exceeds 100 characters, display "タグが長すぎます（100文字以内）" and do NOT dispatch

**Event-driven**: WHEN the user presses Arrow Up/Down keys, THE SYSTEM SHALL move focus through the autocomplete suggestion list. WHEN the user presses Enter on a highlighted suggestion, THE SYSTEM SHALL select it.

### REQ-TAG-006 — TagError UI feedback

**Conditional**: IF `tryNewTag` returns `TagError` with `kind: "empty"` or `kind: "only-whitespace"`, THEN THE SYSTEM SHALL display "タグは空にできません" near the tag input and NOT dispatch the command.

### REQ-TAG-007 — Tag input dismissal

**Event-driven**: WHEN the user presses the Escape key while the tag input is focused, THE SYSTEM SHALL close the input without dispatching any command, discarding the typed text.

**Event-driven**: WHEN the user clicks outside the tag input area (blur event), THE SYSTEM SHALL:
1. IF the input is empty (trimmed length === 0): close the input without dispatching
2. IF the input contains non-empty text that passes `tryNewTag` validation: dispatch the add command with the normalized tag, then close the input
3. IF the input contains non-empty text that FAILS `tryNewTag` validation: display the appropriate `TagError` message and keep the input open (do NOT discard user input)

### REQ-TAG-008 — Idempotent tag addition

**Conditional**: IF an add request targets a tag already present on the note, THEN THE SYSTEM SHALL silently succeed (idempotent; the domain pipeline short-circuits before I/O).

### REQ-TAG-009 — Left sidebar tag filter list

**Ubiquitous**: THE SYSTEM SHALL render a tag filter section inside the `feed-sidebar` area, positioned **above the feed list** (FeedList.svelte), as a sibling DOM element within the same parent container. The section shall display each `TagEntry` as `#tagname (usageCount)`.

**Clarification (FIND-012)**: The TagFilterSidebar is rendered as a separate component in the `+page.svelte` layout, inside the `<aside class="feed-sidebar">` element, before `<FeedList>`. This means TagFilterSidebar receives its own props independently from FeedList. The tag inventory data is derived from `feedViewState.noteMetadata` (computed client-side).

**State-driven**: WHILE tag inventory entries exist, THE SYSTEM SHALL display entries sorted by `usageCount` descending.

**Conditional**: IF no notes have tags (tag inventory is empty), THEN THE SYSTEM SHALL NOT display the tag filter section.

### REQ-TAG-010 — Apply tag filter

**Event-driven**: WHEN the user clicks a tag in the sidebar tag filter list, THE SYSTEM SHALL:
1. Add the clicked tag to the active filter set (multi-select)
2. Compute new `visibleNoteIds` by filtering `allNoteIds` (the unfiltered full list) against `noteMetadata` tags using OR semantics (see REQ-TAG-013). Any note whose tags intersect with the active filter set is included.
3. Update `visibleNoteIds` in the view state
4. Visually highlight the selected tag(s) in the sidebar

### REQ-TAG-011 — Remove tag filter

**Event-driven**: WHEN the user clicks an already-selected tag in the sidebar, THE SYSTEM SHALL remove it from the active filter set and recalculate visible notes.

### REQ-TAG-012 — Clear all filters

**Ubiquitous**: THE SYSTEM SHALL display a "すべて解除" (Clear All) link button in the tag filter sidebar.

**Event-driven**: WHEN the "すべて解除" button is clicked, THE SYSTEM SHALL clear all active tag filters and restore `visibleNoteIds` to the full `allNoteIds` list.

### REQ-TAG-013 — Multi-select OR semantics

**Conditional**: IF multiple tags are selected in the filter sidebar, THEN THE SYSTEM SHALL show notes that match ANY of the selected tags (OR semantics within the tags dimension). This behavior is inherited from the domain `FilterCriteria.tags` OR semantics (see aggregates.md §2 invariant 3).

### REQ-TAG-014 — Unused tag auto-hide

**State-driven**: WHILE a tag's usage count (derived from `noteMetadata`) is greater than 0, THE SYSTEM SHALL display it in the sidebar.

**Event-driven**: WHEN the last note with a given tag is deleted or has the tag removed (usage count reaches 0), THE SYSTEM SHALL automatically remove that tag from the sidebar display.

The usage count is computed client-side by counting tag occurrences across `noteMetadata`. If a tag's count drops to 0, it disappears from the sidebar on the next render.

### REQ-TAG-015 — DESIGN.md token compliance

**Ubiquitous**: THE SYSTEM SHALL use DESIGN.md tokens for all styling:
- Tag chips: pill badge pattern (bg `#f2f9ff`, text `#097fe8`, radius `9999px`)
- Interactive buttons: Notion Blue (`#0075de`) for default, Active Blue (`#005bab`) for hover/pressed
- Focus rings: `2px solid #097fe8` with `outline-offset: 2px`
- Tag filter sidebar: Warm White (`#f6f5f4`) for selected state, Warm Gray 300 (`#a39e98`) for secondary text
- Borders: `1px solid rgba(0,0,0,0.1)` (whisper border)
- Spacing: use permitted spacing values (2, 4, 6, 8, 12, 16, 24, 32 px)
- Typography: font-size 12px for tags, 14px for sidebar text

### REQ-TAG-016 — Accessibility

**Ubiquitous**: THE SYSTEM SHALL ensure:
- Tag chip remove buttons have `aria-label="タグ '{tag}' を削除"`
- Add tag buttons have `aria-label="タグを追加"`
- Tag filter sidebar items have `role="checkbox"` with `aria-checked` reflecting selection state
- All interactive elements are keyboard-focusable with visible focus rings
- Tag input field supports Enter to confirm and Escape to cancel

### REQ-TAG-017 — Integration: use domain pipelines

**Ubiquitous**: THE SYSTEM SHALL import and call the existing domain pipelines without reimplementing them:
- `tagChipUpdate` from `$lib/domain/tag-chip-update/pipeline.js`
- `parseFilterInput` from `$lib/domain/apply-filter-or-search/parse-filter-input.js`
- `tryNewTag` from `$lib/domain/apply-filter-or-search/try-new-tag.js` (pending barrel re-export per §1.3)
- Tag filtering uses OR semantics matching `applyFilterOrSearch` domain semantics, computed directly in the pure reducer from `noteMetadata` + `allNoteIds` (the UI layer does not have access to `Feed`/`NoteFileSnapshot` domain types)

**Ubiquitous**: THE SYSTEM SHALL extend `FeedViewState` with `tagAutocompleteVisibleFor: string | null` field (noteId with open tag input, or null; mutually exclusive across all rows).

**Ubiquitous**: THE SYSTEM SHALL maintain `activeFilterTags` (the set of currently selected filter tag strings) as a **UI-layer state** that is NOT mirrored from `FeedDomainSnapshot`. The `DomainSnapshotReceived` handler in `feedReducer` preserves `activeFilterTags` from the previous state (following the existing `loadingStatus` preservation pattern on `feedReducer.ts` line 35). See FIND-003 resolution.

**Ubiquitous**: THE SYSTEM SHALL extend `FeedAction` and `FeedCommand` discriminated unions with new variants for tag chip operations and filter operations.

### REQ-TAG-018 — TagInventory computation

**Ubiquitous**: THE SYSTEM SHALL compute tag inventory (usageCount per tag) **client-side** from the existing `noteMetadata` in `FeedViewState`, rather than extending `FeedDomainSnapshot`. The computation is pure: iterate over all `noteMetadata` entries, count tag occurrences, produce `{ name: string, usageCount: number }[]` sorted by usageCount descending. This avoids any Rust/Tauri IPC changes. See FIND-004 resolution.

The tag inventory is recomputed on every `DomainSnapshotReceived` action (when `noteMetadata` changes). For up to 500 notes, the O(N*T) computation where N=notes and T=average tags per note is well within the 16ms budget.

### REQ-TAG-019 — Zero-filter state

**Conditional**: IF `activeFilterTags` is empty (no tags selected), THEN all notes SHALL be visible (no filter applied), and no tags in the sidebar SHALL be highlighted.

---

## 3. Edge Case Catalog

### 3.1 Input Edge Cases

| ID | Edge Case | Expected Behavior |
|----|----------|-------------------|
| EC-001 | Empty string submitted as tag | `tryNewTag` returns `{ kind: "empty" }`. Display "タグは空にできません". Do NOT dispatch. |
| EC-002 | Whitespace-only string submitted | `tryNewTag` returns `{ kind: "only-whitespace" }`. Display "タグは空にできません". Do NOT dispatch. |
| EC-003 | String with only "#" submitted | `tryNewTag` normalizes to empty → "only-whitespace" error. |
| EC-004 | Tag with leading "#" | `tryNewTag` strips it. e.g. "#draft" → "draft". |
| EC-005 | Tag with mixed case | `tryNewTag` lowercases. e.g. "Draft" → "draft". |
| EC-006 | Tag with leading/trailing whitespace | `tryNewTag` trims. |
| EC-007 | Tag input closed via blur with valid text | Submit the normalized tag, close input. |
| EC-007a | Tag input blurred with invalid text (non-empty, fails tryNewTag) | Display TagError message, keep input open (do NOT discard user input). Added per FIND-002. |
| EC-007b | Tag input blurred while empty (trimmed length 0) | Close input silently, no dispatch. |
| EC-007c | Tag longer than 100 characters after normalization | Display "タグが長すぎます（100文字以内）", do NOT dispatch, keep input open. Added per FIND-010. |

### 3.2 State Edge Cases

| ID | Edge Case | Expected Behavior |
|----|----------|-------------------|
| EC-008 | Adding a duplicate tag (already on note) | Domain pipeline short-circuits (idempotent). No I/O. Chip already displayed. |
| EC-009 | Removing a tag not on the note | Domain pipeline short-circuits (idempotent). No error. |
| EC-010 | TagInventory is empty (no notes have tags) | Sidebar section hidden. "+" button on rows still functional (free-text input, no autocomplete). |
| EC-011 | All notes have zero tags | Sidebar hidden. Rows show no tag chips, only "+" button. |
| EC-012 | Rapid add/remove clicks on same row | **FIXED (FIND-009)**: The tagChipUpdate domain pipeline returns a Promise but does NOT internally serialize concurrent calls targeting the same noteId. The UI shell is responsible for sequencing: it awaits each pipeline call before issuing the next for the same noteId. The feedReducer emits one command at a time, and the effectful shell processes commands sequentially. |
| EC-013 | Feed row with many tags (overflow) | Tag chips wrap to multiple lines (`flex-wrap: wrap`). Individual chips truncated at max-width 160px with ellipsis. |
| EC-014 | Last note with tag X has tag removed | TagInventory (computed client-side) updates → usageCount drops to 0 → tag disappears from sidebar. |
| EC-015 | All tags filtered → no visible notes | "フィルター条件に一致するノートがありません" message displayed (already handled by existing `isFilteredEmpty` logic in FeedList). |
| EC-016 | Filter active, then new note saved matching filter | Note appears in filtered view after save snapshot arrives. |
| EC-017 | Active filter tags persist across note switches | `activeFilterTags` is preserved by feedReducer across `DomainSnapshotReceived` actions (same pattern as `loadingStatus` preservation). Switching notes (FeedRowClicked → select-past-note) emits a snapshot; the reducer mirrors editingState but preserves `activeFilterTags`. |

### 3.3 Interaction Edge Cases

| ID | Edge Case | Expected Behavior |
|----|----------|-------------------|
| EC-018 | Click "×" on chip while tag input is open on same row | Close the input first (no dispatch), then process the remove. Handled by REQ-TAG-002 step 1. |
| EC-018a | Click "+" on row B while tag input is open on row A | Close input on row A (no dispatch), open input on row B. Enforced by single-input-across-all-rows invariant (mutual exclusion via `tagAutocompleteVisibleFor`). Added per FIND-008. |
| EC-019 | Autocomplete dropdown shows 0 results | Display "一致するタグがありません" message if input is non-empty. |
| EC-020 | Autocomplete with many matches (e.g., 50 tags) | Scrollable dropdown, max-height ~200px. |
| EC-021 | Keyboard navigation in autocomplete | Arrow Up/Down to move through suggestions, Enter to select, Escape to close. |
| EC-022 | Tag normalization produces same tag as existing selected filter tag | No special handling needed; domain handles dedup. |
| EC-023 | Note deletion while tag input is open on that note | When `DomainSnapshotReceived` arrives with the note removed from `noteMetadata`, the feedReducer clears `tagAutocompleteVisibleFor` if it matches the deleted noteId. Added per FIND-011. |

---

## 4. Purity Boundary Analysis

### 4.1 Pure Core

| Component | Purity | Reason |
|-----------|--------|--------|
| `tryNewTag(raw)` | Pure | String normalization, no I/O, deterministic |
| `parseFilterInput(raw)` | Pure | Delegates to `tryNewTag`, constructs `AppliedFilter` |
| `applyFilterOrSearch(feed, applied, snapshots)` | Pure | Deterministic filtering/sorting |
| TagInventory computation from noteMetadata | Pure | Aggregation over existing data, no I/O |
| Rendering logic (derived values) | Pure | Svelte `$derived()` computations |
| `feedReducer` (extended) | Pure | Pattern-matched state transitions, no I/O |

### 4.2 Effectful Shell

| Component | Effect | Boundary Strategy |
|-----------|--------|-------------------|
| `tagChipUpdate` pipeline dispatch | Write I/O (file save), event publish | Call through adapter/WRITE_MARKDOWN port |
| IPC dispatch (Tauri invoke) | Cross-process communication | Through `TauriFeedAdapter` |
| TagInventory snapshot retrieval | N/A — computed client-side from noteMetadata | Pure computation; no I/O needed |
| Clipboard write | OS clipboard | Not in scope for this feature |

### 4.3 Architecture Conformance

The feature follows the existing FeedReducer pattern established by `ui-feed-list-actions`:
1. **Pure reducer** (`feedReducer.ts`): Accepts `FeedAction`, returns `{ state, commands }`. Never performs I/O.
2. **Effectful shell** (`FeedList.svelte` + `TagFilterSidebar.svelte`): Subscribes to state channel, dispatches commands to adapter.
3. **Domain pipeline calls**: Happen in the effectful shell, not in the reducer.
4. **UI-local state preservation**: `activeFilterTags` and `tagAutocompleteVisibleFor` are preserved across `DomainSnapshotReceived` actions in the reducer, following the existing `loadingStatus` pattern.

---

## 5. Non-Functional Constraints

### 5.1 Performance
- Tag chip add/remove operations must complete within 500ms (domain pipeline is lightweight, sync write)
- Autocomplete filtering must respond within 16ms (60fps) on up to 100 tags
- Filter recalculation must complete within 50ms on up to 500 notes
- TagInventory client-side computation must complete within 16ms on up to 500 notes with up to 10 tags each

### 5.2 Accessibility
- WCAG 2.1 Level AA compliance for all interactive elements
- Minimum contrast ratio 4.5:1 for text
- Keyboard-navigable autocomplete with ARIA listbox pattern

### 5.3 Design System
- All colors, spacing, fonts from DESIGN.md tokens
- No hardcoded values outside DESIGN.md palette

---

## 6. Type Contracts (extensions to existing types)

### 6.1 FeedViewState extensions

```ts
// Added fields (preserved across DomainSnapshotReceived, like loadingStatus):
tagAutocompleteVisibleFor: string | null; // noteId with open tag input, or null. Single-input invariant: only one row at a time.
activeFilterTags: readonly string[];       // currently selected filter tag strings. Preserved by reducer across snapshots.
allNoteIds: readonly string[];             // unfiltered full note ID list from the last DomainSnapshot. Used as source for tag filter computation. Added in bugfix (tag filter application).

// TagInventory is NOT stored in FeedViewState. It is a $derived value computed
// from noteMetadata in the component layer. See REQ-TAG-018.
```

### 6.2 FeedAction extensions

```ts
// New variants added to existing FeedAction union:
| { kind: 'TagAddClicked'; noteId: string }
| { kind: 'TagRemoveClicked'; noteId: string; tag: string }
| { kind: 'TagInputCommitted'; noteId: string; rawTag: string }
| { kind: 'TagInputCancelled' }
| { kind: 'TagFilterToggled'; tag: string }
| { kind: 'TagFilterCleared' }

// Existing variants reused without modification:
// FilterApplied, FilterCleared — these already accept visibleNoteIds and work as-is.
```

### 6.3 FeedCommand extensions

```ts
// New variants added to existing FeedCommand union:
// (sprint-2: payload extended with body, existingTags, timestamps for tag chip save)
| { kind: 'add-tag-via-chip'; payload: {
    noteId: string; tag: string; body: string;
    existingTags: readonly string[]; createdAt: number; updatedAt: number;
    issuedAt: string;
  } }
| { kind: 'remove-tag-via-chip'; payload: {
    noteId: string; tag: string; body: string;
    existingTags: readonly string[]; createdAt: number; updatedAt: number;
    issuedAt: string;
  } }
| { kind: 'apply-tag-filter'; payload: { tag: string } }
| { kind: 'remove-tag-filter'; payload: { tag: string } }
| { kind: 'clear-filter' }
```

### 6.4 FeedDomainSnapshot — NO extension

`FeedDomainSnapshot` is NOT extended (FIND-004 resolution). TagInventory is computed client-side from `noteMetadata` which is already available in the existing snapshot type.

### 6.5 Domain barrel export addition

The `apply-filter-or-search/index.ts` barrel shall add:
```ts
export { tryNewTag } from "./try-new-tag.js";
```
This enables the UI layer to import tag normalization directly for user-facing `TagError` feedback, rather than losing error detail through `parseFilterInput`'s `{ kind: "invalid-tag" }` wrapper.
