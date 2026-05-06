# Purity Audit — ui-filter-search Phase 5

## Declared Boundaries

From `specs/verification-architecture.md` section 1 (Purity Boundary Map):

| Component | Layer | Declared Purity |
|-----------|-------|----------------|
| `feedReducer.ts` (extended) | Pure core | No forbidden APIs; SearchApplied/SearchCleared/SortDirectionToggled return commands:[] |
| `computeVisible.ts` | Pure core | No I/O; deterministic pipeline: tag filter -> search filter -> sort |
| `searchPredicate.ts` | Pure core | Uses `String.prototype.toLowerCase()` and `includes()` only; no `toLocaleLowerCase()` |
| `sortByUpdatedAt.ts` | Pure core | Curried comparator; no metadata parameter; no I/O |
| `types.ts` (extended) | Pure core | Type definitions only; documents forbidden API list in JSDoc |
| `SearchInput.svelte` | Effectful shell | Holds `$state` for pending input; uses `setTimeout`/`clearTimeout` for debounce |
| `SortToggle.svelte` | Effectful shell | DOM click -> dispatches `SortDirectionToggled` |
| `FeedList.svelte` (extended) | Effectful shell | Wires child components; dispatches actions to reducer |

Forbidden APIs in pure core (per PROP-FILTER-001):
`setTimeout`, `setInterval`, `Date.now`, `Date(`, `new Date`, `Math.random`

## Observed Boundaries

### Pure core files — grep audit results

| File | setTimeout | setInterval | Date.now | Date( | new Date | Math.random |
|------|-----------|------------|---------|-------|---------|------------|
| `searchPredicate.ts` | 0 | 0 | 0 | 0 | 0 | 0 |
| `sortByUpdatedAt.ts` | 0 | 0 | 0 | 0 | 0 | 0 |
| `computeVisible.ts` | 0 | 0 | 0 | 0 | 0 | 0 |
| `feedReducer.ts` | 0 | 0 | 0 | 0 | 0 | 0 |
| `types.ts` | comment only | comment only | comment only | comment only | comment only | comment only |

All hits in `types.ts` appear on lines 9, 11, 12 within a JSDoc block comment (`/** ... */`) that documents the forbidden API contract. No executable usage.

### Purity audit test

`purityAudit.test.ts` — 7 tests, all passing. This test statically reads the source files and asserts zero forbidden API occurrences in the pure core module set.

### Effectful shell review

`SearchInput.svelte`:
- Uses `setTimeout`/`clearTimeout` for the 200ms debounce timer (expected; documented in verification architecture)
- Uses Svelte `$state` for local `pendingValue` (expected; shell-local only)
- Dispatches `SearchApplied` and `SearchCleared` to the reducer only after debounce expiry or Escape key respectively
- No reducer calls or state mutations inside the pending keystroke window

`SortToggle.svelte`:
- No timer usage, no `$state` beyond what Svelte renders from props
- Single `onclick` handler dispatches `SortDirectionToggled` — no local mutable state

`FeedList.svelte` (extended):
- Wires `SearchInput` and `SortToggle` into the existing `feedReducer` dispatch pattern
- No new I/O introduced in the extended sections

### Property-based verification of pure core

PROP-FILTER-005 (fast-check, 6 sub-properties):
- `feedReducer` tested against 300 adversarial `(state, SearchApplied{query: 0..10000 chars})` pairs — never threw
- `feedReducer` tested against 200 `(state, SearchCleared)` pairs — never threw
- `feedReducer` tested against 200 `(state, SortDirectionToggled)` pairs — never threw
- Referential transparency: same `(state, SearchApplied{query})` produces identical JSON output — 200 runs

PROP-FILTER-010 (fast-check, 4 sub-properties):
- `searchPredicate` ASCII correctness: 500 runs, all match `haystack.toLowerCase().includes(needle.toLowerCase())`
- Unicode no-throw: 300 runs over arbitrary Unicode pairs
- Long strings no-throw: 100 runs up to 10,000 chars
- Self-match reflexivity: 200 runs

## Summary

Purity boundary: INTACT. No drift detected between declared and observed boundaries.

- Pure core files (searchPredicate, sortByUpdatedAt, computeVisible, feedReducer) contain zero forbidden API calls.
- Effectful shell components (SearchInput.svelte, SortToggle.svelte, FeedList.svelte) correctly confine all timer usage and Svelte reactivity primitives to the shell layer.
- Property tests provide generative evidence that the pure core is deterministic and total.
- No hidden side effects, no verifier-hostile coupling, no core/shell drift.
- No follow-up required before Phase 6.
