# Verification Architecture: ApplyFilterOrSearch

**Feature**: `apply-filter-or-search`
**Phase**: 1b
**Revision**: 1
**Mode**: lean
**Source**:
- `docs/domain/workflows.md` Workflow 7 (ApplyFilterOrSearch)
- `docs/domain/aggregates.md` §2 Feed Aggregate
- `docs/domain/code/ts/src/curate/aggregates.ts` — `Feed`, `FilterCriteria`, `SearchQuery`, `SortOrder`
- `docs/domain/code/ts/src/curate/stages.ts` — `UnvalidatedFilterInput`, `AppliedFilter`, `VisibleNoteIds`
- `docs/domain/code/ts/src/curate/workflows.ts` — `ParseFilterInput`, `ApplyFilterOrSearch`
- `docs/domain/code/ts/src/shared/value-objects.ts` — `Tag`, `TagSmartCtor`
- behavioral-spec.md REQ-001 .. REQ-016

---

## Purity Boundary Map

Both pipeline functions (`parseFilterInput` and `applyFilterOrSearch`) live entirely inside the pure core. Only their consumer — the Svelte `$effect` that fires on UI input — is in the effectful shell.

```
┌─────────────────────────────── Pure Core ─────────────────────────────┐
│                                                                        │
│   tryNewTag(raw: string)                                               │
│      ↓ (called by)                                                     │
│   parseFilterInput(raw: UnvalidatedFilterInput)                        │
│      → Result<AppliedFilter, { kind: "invalid-tag"; raw: string }>     │
│                                                                        │
│   applyFilterOrSearch(                                                 │
│      feed: Feed,                                                       │
│      applied: AppliedFilter,                                           │
│      snapshots: readonly NoteFileSnapshot[]                            │
│   ) → VisibleNoteIds                                                   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
         ↑ called by
┌─────── Effectful Shell ───────┐
│  Svelte $effect (UI reactive) │
│  (reads UI state → calls      │
│  parseFilterInput →           │
│  applyFilterOrSearch →        │
│  updates $visibleIds store)   │
└───────────────────────────────┘
```

**Source reference**: `docs/domain/code/ts/src/curate/workflows.ts` — `ParseFilterInput` and `ApplyFilterOrSearch` type declarations (lines 108–116). Both types take only value arguments and return only values. Neither declaration mentions any port, effect, or `deps` parameter — confirming they sit entirely inside the pure boundary.

| Sub-step | Classification | Rationale |
|----------|----------------|-----------|
| `tryNewTag` (Tag Smart Constructor) | **Pure core** | Deterministic `string → Result<Tag>` with no I/O |
| `parseFilterInput` | **Pure core** | Total function over `UnvalidatedFilterInput`; delegates to `tryNewTag`; returns `Result` |
| `applyFilterOrSearch` — filter stage | **Pure core** | Subset computation over `NoteId[]` using snapshot data; no I/O |
| `applyFilterOrSearch` — search stage | **Pure core** | Case-insensitive substring scan over body/tag strings; no I/O |
| `applyFilterOrSearch` — sort stage | **Pure core** | Comparator over `updatedAt` + `NoteId`; no I/O, no clock read |
| Svelte `$effect` / debounce | **Effectful shell** | Reads reactive state, triggers on DOM events; outside pipeline boundary |
| `FeedOps.applyTagFilter` etc. | **Effectful shell** | Mutates Feed state object; outside pipeline scope |

---

## Port Contracts

Neither `parseFilterInput` nor `applyFilterOrSearch` uses any port. The port table below is provided for completeness only — it documents what is explicitly NOT used.

### NOT used by either pipeline function

| Port | Reason excluded |
|------|----------------|
| `Clock.now` | No timestamp generation inside pure pipeline |
| `FileSystem.*` | No file I/O |
| `EventBus.publish` | No domain events emitted by the pipeline itself |
| `Clipboard.write` | Unrelated workflow (CopyBody) |
| `Settings.*` | Unrelated (Vault configuration) |

The only external call made by `parseFilterInput` is to `tryNewTag` (Tag Smart Constructor), which is itself a pure function (`string → Result<Tag, TagError>`).

---

## Proof Obligations

| ID | Tier | Required | Statement | Verification | REQ |
|----|-----:|:--------:|-----------|--------------|-----|
| **PROP-001** | 1 | yes | `parseFilterInput` is deterministic — same `UnvalidatedFilterInput` always produces the same `Result<AppliedFilter, ...>` | Property test (`fast-check`): `fc.assert(fc.property(arbUnvalidatedInput, raw => deepEqual(parseFilterInput(raw), parseFilterInput(raw))))` with ≥1000 runs | REQ-015 |
| **PROP-002** | 1 | yes | `applyFilterOrSearch` is deterministic — same `(Feed, AppliedFilter, NoteFileSnapshot[])` always produces the same `VisibleNoteIds` | Property test: assert `deepEqual(applyFilterOrSearch(feed, applied, snaps), applyFilterOrSearch(feed, applied, snaps))` with ≥1000 runs | REQ-015 |
| **PROP-003** | 0 | yes | Neither function has I/O — no `Date.now`, `Math.random`, `fetch`, Tauri command, or file system access is reachable from either call graph | TypeScript compile-time inspection: neither function signature includes a `deps` parameter; static import graph contains no port modules | REQ-015 |
| **PROP-004** | 1 | yes | Tag OR within set — a snapshot is included iff at least one `criteria.tags` element appears in `snapshot.frontmatter.tags` | Property test: generate arbitrary (snapshot-set, tagFilter) pairs; verify `ids` contains exactly those snapshots satisfying OR predicate | REQ-008 |
| **PROP-005** | 1 | yes | Heterogeneous criteria AND composition — snapshot must satisfy ALL active criteria (tag AND frontmatterFields AND search) | Property test: generate inputs with all three criteria active; assert only snapshots meeting all three appear in `ids` | REQ-009 |
| **PROP-006** | 1 | yes | Sort total order and direction — for `direction="desc"`, `ids[i].updatedAt >= ids[i+1].updatedAt`; for identical `updatedAt`, `ids[i] <= ids[i+1]` (NoteId lexicographic) | Property test: generate arbitrary sorted outputs; assert pairwise comparator holds for both "desc" and "asc" | REQ-012 |
| **PROP-007** | 1 | yes | Sort determinism — same input always produces the same ordering (no non-deterministic comparison) | Property test: run `applyFilterOrSearch` twice on identical inputs; assert `ids` arrays are deeply equal | REQ-012, REQ-015 |
| **PROP-008** | 1 | yes | `feed.noteRefs` is the candidate set — output `ids` is always a subset of `feed.noteRefs`; snapshots not in `noteRefs` never appear | Property test: generate snapshot arrays larger than `feed.noteRefs`; assert every `id` in output is present in `feed.noteRefs` | REQ-007 |
| **PROP-009** | 1 | yes | `hasZeroResults` iff `ids.length === 0` | Property test: generate arbitrary (feed, applied, snaps) triples; assert `result.hasZeroResults === (result.ids.length === 0)` with ≥500 runs | REQ-013 |
| **PROP-010** | 1 | yes | Empty/whitespace `searchTextRaw` collapses to `query: null` — `parseFilterInput` with `searchTextRaw` of `null`, `""`, or any whitespace-only string always produces `AppliedFilter.query === null` | Property test: `fc.stringOf(fc.constant(' '), { minLength: 0, maxLength: 20 })` for whitespace-only; null; empty string — assert `query === null` | REQ-005 |
| **PROP-011** | 0 | yes | `tryNewTag` reuse — `parseFilterInput` calls `tryNewTag` and propagates its error verbatim; no parallel normalization logic exists | Code review / TypeScript type-check: the `raw` field in `Err({ kind: "invalid-tag", raw })` matches the pre-normalization input string | REQ-002, REQ-003 |
| **PROP-012** | 1 | yes | Sort respects `direction` — ascending and descending produce reverse orderings for the same input | Property test: run `applyFilterOrSearch` with same (feed, applied, snaps) for both directions; assert `idsDesc` is the reverse of `idsAsc` when all `updatedAt` values are distinct | REQ-012 |

### Tier Definitions (lean mode)

- **Tier 0** — Compile-time / code-review only (TypeScript type-check, import graph inspection, never-branch exhaustiveness). No runtime test required.
- **Tier 1** — Property-based or example-based runtime tests using `vitest` + `fast-check`. Default ≥100 runs; ≥1000 runs for determinism/purity claims (PROP-001, PROP-002, PROP-009).
- **Tier 2 / 3** — Not required in lean mode (no Kani, no formal proof).

All twelve PROPs are required in lean mode. The pipeline is small and fully pure, so complete property coverage is inexpensive.

---

## Test Harness Layout

Tests live under `promptnotes/src/lib/domain/__tests__/apply-filter-or-search/`:

```
apply-filter-or-search/
  parse-filter-input.test.ts           # REQ-001..REQ-006 (unit + example-based)
  apply-filter-or-search.test.ts       # REQ-007..REQ-014 (unit + example-based)
  __verify__/
    prop-001-parse-determinism.harness.test.ts
    prop-002-apply-determinism.harness.test.ts
    prop-003-no-io.harness.test.ts
    prop-004-tag-or-semantics.harness.test.ts
    prop-005-and-composition.harness.test.ts
    prop-006-sort-total-order.harness.test.ts
    prop-007-sort-determinism.harness.test.ts
    prop-008-candidate-set-constraint.harness.test.ts
    prop-009-has-zero-results-flag.harness.test.ts
    prop-010-empty-search-collapses.harness.test.ts
    prop-011-trynew-tag-reuse.harness.test.ts
    prop-012-sort-direction.harness.test.ts
```

Implementation lives under `promptnotes/src/lib/domain/apply-filter-or-search/`:

```
apply-filter-or-search/
  parse-filter-input.ts          # parseFilterInput pure function (REQ-001..REQ-006)
  apply-filter-or-search.ts      # applyFilterOrSearch pure function (REQ-007..REQ-014)
  index.ts                       # barrel re-export
```

**Tooling**: `vitest` + `fast-check` — already present in `promptnotes/package.json` (established by the `copy-body` feature). No new dependencies are introduced.

---

## Type-Level Contracts

The canonical type signatures from `docs/domain/code/ts/src/curate/workflows.ts` are authoritative. Implementation must conform exactly:

```typescript
// From workflows.ts (source of truth — do not modify)
export type ParseFilterInput = (
  raw: UnvalidatedFilterInput,
) => Result<AppliedFilter, { kind: "invalid-tag"; raw: string }>;

export type ApplyFilterOrSearch = (
  feed: Feed,
  applied: AppliedFilter,
  snapshots: readonly NoteFileSnapshot[],
) => VisibleNoteIds;
```

Implementation exports must be assignable to these types:

```typescript
// promptnotes/src/lib/domain/apply-filter-or-search/parse-filter-input.ts
export const parseFilterInput: ParseFilterInput = ...;

// promptnotes/src/lib/domain/apply-filter-or-search/apply-filter-or-search.ts
export const applyFilterOrSearch: ApplyFilterOrSearch = ...;
```

No additional parameters (deps, ports, callbacks) are permitted. Adding a `deps` parameter would break the pure-core invariant and violate the type contract.

---

## REQ-to-PROP Coverage Matrix

| REQ | Covered by PROP |
|-----|----------------|
| REQ-001 | PROP-001 (determinism), PROP-011 (tryNewTag delegation) |
| REQ-002 | PROP-011 (tag normalization via Smart Constructor) |
| REQ-003 | PROP-011 (error raw field), PROP-010 (whitespace edge case) |
| REQ-004 | PROP-004 (empty tags = no-op), PROP-001 |
| REQ-005 | PROP-010 (null/empty/whitespace → query=null) |
| REQ-006 | PROP-001 (sortOrder passthrough verified via structural equality) |
| REQ-007 | PROP-008 (candidate set constraint) |
| REQ-008 | PROP-004 (tag OR semantics) |
| REQ-009 | PROP-005 (AND composition) |
| REQ-010 | PROP-005 (AND composition covers frontmatterFields) |
| REQ-011 | PROP-005 (search in AND composition), PROP-004 |
| REQ-012 | PROP-006 (total order), PROP-007 (sort determinism), PROP-012 (direction) |
| REQ-013 | PROP-009 (hasZeroResults flag) |
| REQ-014 | PROP-008, PROP-009 |
| REQ-015 | PROP-001, PROP-002, PROP-003 |
| REQ-016 | Performance benchmark in `apply-filter-or-search.test.ts` (not a PROP; example-based) |

No orphan REQs. REQ-016 (performance) is verified by a dedicated example-based benchmark rather than a property test, as performance bounds are not expressible as universal properties in fast-check.

---

## Findings to Carry Forward

| Finding | Target Phase | Description |
|---------|--------------|-------------|
| `frontmatterFields` filter is specced but not exposed by MVP UI | 2a / implementation note | REQ-010 must be implemented and tested even though the MVP UI (ui-fields.md §1C) does not expose frontmatter field filtering. Future UI expansion should work without implementation changes. |
| Search scope covers tag names only (not timestamps) | 1c review | The spec defines frontmatter search as covering `frontmatter.tags` string representations. Whether future frontmatter fields should be searchable is deferred. Confirm this interpretation at spec review. |
| `tryNewTag` Smart Constructor is Rust-side in production | 2b note | `value-objects.ts` declares `TagSmartCtor.tryNew` as the TypeScript mirror; actual validation runs Rust-side via Tauri command in production. For pure TS unit tests, the TypeScript implementation of `tryNewTag` must be provided as a test double or the domain layer must accept an injectable `tryNewTag` parameter. If injection is chosen, it must remain inside the pure boundary (no I/O). Confirm injection strategy at Phase 2a. |

---

## Acceptance Gate (Phase 1c, lean)

- All twelve PROPs above have a one-sentence verification plan stated in this document.
- Every behavioral-spec.md REQ is covered by at least one PROP (coverage matrix above shows no orphan REQs).
- Adversary review (lean) checks for: missing edge cases, purity violations, mismatched type contracts, incomplete AND/OR coverage.
- No human approval required (lean mode default).
