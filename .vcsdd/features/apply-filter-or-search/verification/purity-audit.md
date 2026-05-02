# Purity Boundary Audit

## Feature: apply-filter-or-search | Sprint: 1 | Date: 2026-05-01

## Declared Boundaries

From `specs/verification-architecture.md` (Phase 1b, Revision 2):

**Pure core** (verified by PROP-003, PROP-001, PROP-002):
- `tryNewTag(raw: string)` — deterministic `string → Result<Tag, TagValidationError>`, no I/O
- `parseFilterInput(raw: UnvalidatedFilterInput)` — total function, delegates to `tryNewTag`, returns `Result<AppliedFilter, { kind: "invalid-tag"; raw: string }>`
- `applyFilterOrSearch(feed, applied, snapshots)` — subset computation + sort; no clock read, no I/O

**Effectful shell** (out of scope for this pipeline):
- Svelte `$effect` / debounce — reads reactive DOM state, triggers on UI events
- `FeedOps.applyTagFilter` and related aggregate mutators

**Ports explicitly NOT used by either pipeline function** (from verification-architecture.md §Port Contracts):
- `Clock.now`, `FileSystem.*`, `EventBus.publish`, `Clipboard.write`, `Settings.*`

No pipeline function accepts a `deps` parameter; any `deps` parameter would break the pure-core invariant and violate the declared type contract from `docs/domain/code/ts/src/curate/workflows.ts`.

## Observed Boundaries

Inspected all four source files under `promptnotes/src/lib/domain/apply-filter-or-search/`:

### `try-new-tag.ts`
**Imports**: `Tag` from `promptnotes-domain-types/shared/value-objects` (type only), `ok`/`err` from `promptnotes-domain-types/util/result`.
No runtime imports of `fs`, `node:fs`, `fetch`, `@tauri-apps/api`, `Date`, `Math.random`, or any other global.
**Side effects**: none. No mutation of arguments. No module-level mutable state.
**Signature**: `tryNewTag(raw: string): Result<Tag, TagValidationError>` — matches declared pure-core contract.
**Verdict**: pure core, no drift.

### `parse-filter-input.ts`
**Imports**: `Tag` (type), `ParseFilterInput` (type), `ok`/`err`, and `tryNewTag` from `./try-new-tag.js`.
No runtime imports of any port module.
**Side effects**: creates local `Tag[]` array and `Set<string>` per call — these are function-local, not shared state.
**Signature**: `const parseFilterInput: ParseFilterInput = (raw) => ...` — no `deps` parameter; matches declared type contract exactly.
**Delegation**: every tag in `raw.tagsRaw` is processed through `tryNewTag`; no independent lowercase/trim/regex in the function body (PROP-011a confirmed).
**Verdict**: pure core, no drift.

### `apply-filter-or-search.ts`
**Imports**: `Tag`, `NoteFileSnapshot`, `Feed`, `SearchQuery` (types), `AppliedFilter`, `VisibleNoteIds` (types), `ApplyFilterOrSearch` (type). No runtime imports.
**Side effects**: creates function-local `Map` and `Array` per call. The spread `[...filtered].sort(...)` creates a new array — inputs are never mutated (the `snapshots` parameter is `readonly NoteFileSnapshot[]`).
**Clock read check**: `byUpdatedAtThenNoteId` comparator reads `frontmatter.updatedAt.epochMillis` from the snapshot argument — this is data passed in, not a live clock read. No `Date.now()` call exists anywhere in the file.
**Signature**: `const applyFilterOrSearch: ApplyFilterOrSearch = (feed, applied, snapshots) => ...` — no `deps`, no ports, matches declared type contract.
**Verdict**: pure core, no drift.

### `index.ts`
Barrel re-export only. Re-exports `tryNewTag`, `parseFilterInput`, `applyFilterOrSearch`. No logic, no imports beyond the three sibling files.
**Verdict**: transparent; no boundary concern.

## Summary

No drift detected between declared and observed purity boundaries.

All four source files contain only pure computation:
- Zero `fs`/`node:fs` imports
- Zero `fetch` calls
- Zero `@tauri-apps/api` imports
- Zero `Date.now()` calls
- Zero `Math.random()` calls
- Zero global mutable state
- Zero mutation of input arguments (`readonly` enforced on `snapshots`)
- No `deps` parameter on any function

The PROP-003 runtime sentinel tests (prop-003.log) confirm dynamically that neither function triggers `Date.now`, `Math.random`, or `globalThis.fetch` during execution.

**Required follow-up before Phase 6**: none. The purity boundary is clean and consistent with the Phase 1b declaration.

**Residual concern (minor)**: The `prop-011a` harness test has a TypeScript type-annotation gap (svelte-check ERROR) where a branded `Tag` value is compared using `toBe("claude-code")`. This is a harness defect, not a purity boundary concern. Recommend fixing as a minor Phase 4 routing item if a future sprint touches that harness.
