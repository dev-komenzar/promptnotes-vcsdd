# Purity Audit — ui-tag-chip sprint 3

## Declared Boundaries (from behavioral-spec.md §4)

| Component | Purity | Boundary |
|-----------|--------|----------|
| `tryNewTag(raw)` | Pure | String normalization, no I/O |
| `parseFilterInput(raw)` | Pure | Delegates to `tryNewTag` |
| `applyFilterOrSearch(...)` | Pure | Deterministic filtering/sorting |
| TagInventory computation | Pure | Aggregation over existing data |
| Rendering logic ($derived) | Pure | Svelte `$derived()` computations |
| `feedReducer` (extended) | Pure | Pattern-matched state transitions |
| `tagChipUpdate` pipeline | Effectful | Write I/O through adapter |
| IPC dispatch (Tauri invoke) | Effectful | Cross-process communication |

## Observed Boundaries (sprint 3)

Sprint 3 introduces one new state variable and three modified functions in `FeedRow.svelte`:

| Element | Type | Analysis |
|---------|------|----------|
| `highlightedIndex` ($state) | UI-local mutable state | Lives in the Svelte component (effectful shell). No I/O, no global state. Resets on input change, blur, cancel, and commit. |
| `handleTagInputKeydown` (modified) | Synchronous event handler | Processes ArrowUp/ArrowDown events by mutating `highlightedIndex`. No I/O. Enter with highlight delegates to existing `handleSuggestionClick`. |
| `handleTagInputBlur` (modified) | Synchronous event handler | Added `highlightedIndex = -1` reset. No new I/O. |
| `handleSuggestionClick` (modified) | Synchronous event handler | Added `highlightedIndex = -1` reset. No new I/O. |

**No boundary violations detected.** All sprint 3 changes remain in the effectful shell (Svelte view layer) and do not touch the pure core (`feedReducer`, `tagInventory`, `tryNewTag`, etc.). The highlightedIndex state is UI-local and follows the same pattern as `tagInputText`, `tagErrorText`, and `suggestionClicked`.

## Summary

Purity boundary: INTACT. The sprint 3 additions are entirely within the pre-existing effectful shell boundary (Svelte component). No new I/O paths, no new pure/core modifications, no architecture conformance issues.
