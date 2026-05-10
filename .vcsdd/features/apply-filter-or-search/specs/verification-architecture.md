---
coherence:
  node_id: "design:apply-filter-or-search-verification"
  type: design
  name: "apply-filter-or-search 検証アーキテクチャ（純粋性境界・証明義務）"
  depends_on:
    - id: "req:apply-filter-or-search"
      relation: derives_from
    - id: "design:aggregates"
      relation: derives_from
    - id: "design:type-contracts"
      relation: derives_from
  modules:
    - "apply-filter-or-search"
  source_files:
    - "promptnotes/src/lib/domain/__tests__/apply-filter-or-search"
---

# Verification Architecture: ApplyFilterOrSearch

**Feature**: `apply-filter-or-search`
**Phase**: 1b
**Revision**: 2
**Mode**: lean
**Source**:
- `docs/domain/workflows.md` Workflow 7 (ApplyFilterOrSearch)
- `docs/domain/aggregates.md` §2 Feed Aggregate
- `docs/domain/code/ts/src/curate/aggregates.ts` — `Feed`, `FilterCriteria`, `SearchQuery`, `SortOrder`
- `docs/domain/code/ts/src/curate/stages.ts` — `UnvalidatedFilterInput`, `AppliedFilter`, `VisibleNoteIds`
- `docs/domain/code/ts/src/curate/workflows.ts` — `ParseFilterInput`, `ApplyFilterOrSearch`
- `docs/domain/code/ts/src/shared/value-objects.ts` — `Tag`, `TagSmartCtor`
- behavioral-spec.md REQ-001 .. REQ-016 (revision 2)

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
| **PROP-003** | 0 | yes | Neither function has I/O — no `Date.now`, `Math.random`, `fetch`, Tauri command, or file system access is reachable from either call graph | Tier-0 code review: neither function signature includes a `deps` parameter; static import graph contains no port modules. Confirmed by TypeScript compile-time import graph inspection. | REQ-015 |
| **PROP-004** | 1 | yes | Tag OR within set — a snapshot is included iff at least one `criteria.tags` element appears in `snapshot.frontmatter.tags` | Property test: generate arbitrary (snapshot-set, tagFilter) pairs; verify `ids` contains exactly those snapshots satisfying OR predicate and excludes those that do not | REQ-008 |
| **PROP-005** | 1 | yes | Heterogeneous criteria AND composition — snapshot must satisfy ALL active criteria (tag AND frontmatterFields AND search) | Property test: generate inputs with all three criteria active; assert only snapshots meeting all three appear in `ids`; assert any snapshot failing exactly one criterion is excluded | REQ-009 |
| **PROP-006** | 1 | yes | Sort total order and direction — for `direction="desc"`, `ids[i].updatedAt >= ids[i+1].updatedAt`; for identical `updatedAt` with `direction="desc"`, `ids[i]` >= `ids[i+1]` (NoteId lexicographic descending); for `direction="asc"` the inverse holds | Property test: generate arbitrary sorted outputs; assert pairwise comparator holds for both "desc" and "asc" directions; generate tiebreak cases | REQ-012 |
| **PROP-007** | 1 | yes | Sort determinism — same input always produces the same ordering (no non-deterministic comparison) | Property test: run `applyFilterOrSearch` twice on identical inputs; assert `ids` arrays are deeply equal | REQ-012, REQ-015 |
| **PROP-008** | 1 | yes | Two-sided candidate set constraint — (a) output `ids` is always a subset of `feed.noteRefs`; (b) for every `id` in `result.ids`, there exists `s` in `snapshots` such that `s.noteId === id`; generate cases where some `noteRefs` lack matching snapshots | Property test: generate snapshot arrays larger than `feed.noteRefs` and `noteRefs` with deliberate unresolvable entries; assert BOTH: every output id ∈ `feed.noteRefs` AND every output id has a matching snapshot | REQ-007 |
| **PROP-009** | 1 | yes | `hasZeroResults` iff `ids.length === 0` (both directions) | Property test: generate arbitrary (feed, applied, snaps) triples; assert `result.hasZeroResults === (result.ids.length === 0)` with ≥500 runs; also assert empty `ids` never has `hasZeroResults: false` | REQ-013 |
| **PROP-010** | 1 | yes | Empty/whitespace `searchTextRaw` collapses to `query: null` — `parseFilterInput` with `searchTextRaw` of `null`, `""`, or any whitespace-only string always produces `AppliedFilter.query === null` | Property test: `fc.stringOf(fc.constant(' '), { minLength: 0, maxLength: 20 })` for whitespace-only; null; empty string — assert `query === null` | REQ-005 |
| **PROP-011a** | 0 | yes | `tryNewTag` reuse — `parseFilterInput` calls `tryNewTag` and does NOT contain parallel normalization logic (no independent lowercase/trim implementation) | Tier-0 code review: confirm the implementation calls `tryNewTag` from `value-objects.ts` for every tag in `tagsRaw`; confirm no independent regex, lowercase, or trim operations on tag strings exist in `parseFilterInput`'s body | REQ-002 |
| **PROP-011b** | 1 | yes | Error raw field preservation at runtime — `Err.raw` in the returned error equals the original input string verbatim, not a normalized form | Property test (`fast-check`): generate arbitrary `tagsRaw` arrays containing ≥1 element that causes `tryNewTag` to return `Err`; assert `parseFilterInput(raw).error.raw === raw.tagsRaw[i]` (the original pre-normalization string); ≥200 runs | REQ-002, REQ-003 |
| **PROP-012** | 1 | yes | Sort respects `direction` — ascending and descending produce reverse orderings for the same input when all `updatedAt` values are distinct | Property test: run `applyFilterOrSearch` with same (feed, applied, snaps) for both directions; assert `idsDesc` is the reverse of `idsAsc` when all `updatedAt` values are distinct | REQ-012 |
| **PROP-013** | 1 | yes | `sortOrder` passthrough — for all valid `raw` inputs where `parseFilterInput` returns `Ok`, `result.value.sortOrder` deepEquals `raw.sortOrder` (both `field` and `direction` preserved verbatim, no override) | Property test (`fast-check`): generate arbitrary valid `UnvalidatedFilterInput` (both desc and asc directions); assert `parseFilterInput(raw).value.sortOrder` deepEquals `raw.sortOrder`; ≥200 runs | REQ-006 |
| **PROP-014** | 1 | yes | Case-insensitive substring search semantics — when `applied.query` is non-null, snapshot ∈ result.ids iff `query.text.toLowerCase()` is a substring of `(snapshot.body + ' ' + snapshot.frontmatter.tags.join(' ')).toLowerCase()` AND all other criteria pass | Property test (`fast-check`): generate snapshots and query texts mixing case variants; include regex metacharacters in query text (`.`, `*`, `(`, `[`) to confirm literal treatment; assert the exact inclusion/exclusion predicate; ≥200 runs | REQ-011 |
| **PROP-015** | 1 | yes | Frontmatter field filter semantics — case-sensitive exact match per field, AND across map entries, empty map is no-op | Property test: (a) generate (field, value) pairs where value matches exactly, mismatches by case, mismatches by content; assert correct inclusion/exclusion. (b) generate multi-entry maps; assert snapshot must match ALL entries. (c) generate empty map; assert all snapshots pass | REQ-010 |
| **PROP-016** | 1 | yes | Tag deduplication after normalization — when `tagsRaw` contains multiple entries that normalize to the same `Tag`, `criteria.tags` contains that `Tag` exactly once; first-occurrence order is preserved | Property test: generate `tagsRaw` with known duplicate entries (same raw string, different case, leading `#`); assert `criteria.tags` has no duplicate `Tag` values (by structural equality) and preserves first-occurrence order | REQ-001, REQ-002 |
| **PROP-017** | 1 | yes | Fail-fast on first invalid tag — for any `raw` whose `tagsRaw` contains ≥1 invalid entry, `parseFilterInput(raw)` returns `Err` with `Err.raw === offending raw string` (the first invalid entry encountered); ≥200 runs mixing valid prefix + invalid suffix and vice versa | Property test (`fast-check`): generate `tagsRaw` with a valid prefix and an invalid entry at a known position; assert `Err.raw` equals the first invalid entry's raw string | REQ-003 |
| **PROP-018** | 1 | yes | No-filter no-search exact intersection — when no criteria are active, `result.ids` contains exactly the set-theoretic intersection of `feed.noteRefs` and `snapshots[*].noteId` (two-sided: no inflation, no deflation), in sort order | Property test: generate (noteRefs, snapshots) pairs with intentional asymmetry (noteRefs entries lacking snapshots, snapshots lacking noteRef entries); assert `result.ids` equals the intersection exactly | REQ-014 |

### Tier Definitions (lean mode)

- **Tier 0** — Compile-time / code-review only (TypeScript type-check, import graph inspection, never-branch exhaustiveness). No runtime test required. Does NOT cover runtime value invariants.
- **Tier 1** — Property-based or example-based runtime tests using `bun:test` + `fast-check`. Default ≥100 runs; ≥200 runs for error field / semantic claims; ≥1000 runs for determinism/purity claims (PROP-001, PROP-002, PROP-009).
- **Tier 2 / 3** — Not required in lean mode (no Kani, no formal proof).

All eighteen PROPs are required in lean mode. The pipeline is small and fully pure, so complete property coverage is inexpensive.

---

## Test Harness Layout

Tests live under `promptnotes/src/lib/domain/__tests__/apply-filter-or-search/`:

```
apply-filter-or-search/
  parse-filter-input.test.ts           # REQ-001..REQ-006 (unit + example-based)
  apply-filter-or-search.test.ts       # REQ-007..REQ-014 (unit + example-based)
  apply-filter-or-search.perf.test.ts  # REQ-016 (performance benchmark, dedicated file)
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
    prop-011a-trynew-tag-reuse.harness.test.ts
    prop-011b-error-raw-field.harness.test.ts
    prop-012-sort-direction.harness.test.ts
    prop-013-sort-order-passthrough.harness.test.ts
    prop-014-search-semantics.harness.test.ts
    prop-015-frontmatter-field-semantics.harness.test.ts
    prop-016-tag-dedup.harness.test.ts
    prop-017-fail-fast-invalid-tag.harness.test.ts
    prop-018-no-filter-exact-intersection.harness.test.ts
```

Implementation lives under `promptnotes/src/lib/domain/apply-filter-or-search/`:

```
apply-filter-or-search/
  parse-filter-input.ts          # parseFilterInput pure function (REQ-001..REQ-006)
  apply-filter-or-search.ts      # applyFilterOrSearch pure function (REQ-007..REQ-014)
  index.ts                       # barrel re-export
```

### Performance Test Layout (REQ-016)

The performance benchmark lives in a **dedicated file** `apply-filter-or-search.perf.test.ts` to separate it from correctness unit tests. It uses a labelled `describe("perf", ...)` block.

**Methodology** (pinned):
1. 1 warmup run (result discarded).
2. 5 measurement runs using `performance.now()` before/after the call.
3. Median of the 5 measurements is compared against the 50ms threshold.
4. Runtime: `bun:test` (the project's established test harness — see `promptnotes/package.json`).
5. Platform: development machine (not CI). The bound is advisory in CI environments.

Example structure:
```typescript
import { describe, test, expect } from "bun:test";

describe("perf", () => {
  test("applyFilterOrSearch with 1000 snapshots completes in < 50ms (median of 5 runs)", () => {
    // ... setup 1000 snapshots ...
    // warmup
    applyFilterOrSearch(feed, applied, snapshots);
    // measure 5 times
    const times = Array.from({ length: 5 }, () => {
      const t0 = performance.now();
      applyFilterOrSearch(feed, applied, snapshots);
      return performance.now() - t0;
    });
    const median = times.sort((a, b) => a - b)[2];
    expect(median).toBeLessThan(50);
  });
});
```

### Tooling

**Test runner**: `bun:test` — confirmed present via `@types/bun ^1.3.13` in `promptnotes/package.json`. This is the established harness for all domain tests in this codebase (confirmed by existing test files in `__tests__/copy-body/`, `__tests__/app-startup/`, etc., which all use `import { describe, test, expect } from "bun:test"`).

**Property testing**: `fast-check ^4.7.0` — present in `promptnotes/package.json` devDependencies.

**No additional Phase 2a dependencies are required.** Both `bun:test` and `fast-check` are already available.

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

| REQ | Covered by PROP | Natural mis-implementation caught |
|-----|----------------|-----------------------------------|
| REQ-001 | PROP-001 (determinism), PROP-011a (tryNewTag delegation), PROP-016 (dedup) | Omitting dedup; not calling tryNewTag |
| REQ-002 | PROP-011a (no parallel normalization), PROP-016 (dedup after normalization) | Hand-rolling lowercase instead of delegating; missing dedup |
| REQ-003 | PROP-011b (Err.raw verbatim), PROP-017 (fail-fast) | Normalizing the error raw field; processing past first invalid tag |
| REQ-004 | PROP-004 (empty tags = no-op), PROP-001 | Returning Err for empty array |
| REQ-005 | PROP-010 (null/empty/whitespace → query=null) | Trimming query.text; treating "  " as non-null query |
| REQ-006 | PROP-013 (sortOrder passthrough deepEquals) | Ignoring raw.sortOrder; synthesizing default direction |
| REQ-007 | PROP-008 (two-sided candidate set) | Emitting noteRefs without snapshot resolution; including extra-feed snapshots |
| REQ-008 | PROP-004 (tag OR semantics) | Implementing AND instead of OR; requiring all tags to match |
| REQ-009 | PROP-005 (AND composition) | Treating any criterion match as sufficient |
| REQ-010 | PROP-015 (frontmatter field semantics) | Case-insensitive match; OR instead of AND across fields; no-op for non-empty map |
| REQ-011 | PROP-014 (search semantics — case-insensitive substring) | Case-sensitive search; full-string equality; treating query as regex |
| REQ-012 | PROP-006 (total order), PROP-007 (sort determinism), PROP-012 (direction reversal) | Ignoring direction; fixed ascending tiebreak regardless of direction |
| REQ-013 | PROP-009 (hasZeroResults both directions) | Setting hasZeroResults=false when ids is empty; hasZeroResults=true when ids non-empty |
| REQ-014 | PROP-018 (exact intersection), PROP-009 | Returning empty set when criteria inactive; including unresolvable noteRefs |
| REQ-015 | PROP-001, PROP-002, PROP-003 | I/O inside pipeline; mutating inputs |
| REQ-016 | Performance benchmark in `apply-filter-or-search.perf.test.ts` (not a PROP; example-based) | O(n²) scan or regex compilation per invocation |

No orphan REQs. REQ-016 (performance) is verified by a dedicated example-based benchmark rather than a universal property, as performance bounds are not expressible as universal properties in fast-check.

---

## Findings to Carry Forward

| Finding | Target Phase | Description |
|---------|--------------|-------------|
| `frontmatterFields` filter is specced but not exposed by MVP UI | 2a / implementation note | REQ-010 must be implemented and tested even though the MVP UI (ui-fields.md §1C) does not expose frontmatter field filtering. Future UI expansion should work without implementation changes. |
| DD-1 tiebreak rule pending upstream doc amendment | Post-Phase 6 | NoteId tiebreak direction recorded as DD-1 in behavioral-spec.md. Requires amendment to `aggregates.md` §2 불변条件 and `glossary.md` ソート entry. |
| DD-2 search scope pending upstream doc amendment | Post-Phase 6 | Frontmatter search = tags only, recorded as DD-2. Requires amendment if future text-typed frontmatter fields are added. |
| `tryNewTag` Smart Constructor is Rust-side in production | 2b note | `value-objects.ts` declares `TagSmartCtor.tryNew` as the TypeScript mirror; actual validation runs Rust-side via Tauri command in production. For pure TS unit tests, the TypeScript implementation of `tryNewTag` must be provided as a test double or the domain layer must accept an injectable `tryNewTag` parameter. If injection is chosen, it must remain inside the pure boundary (no I/O). Confirm injection strategy at Phase 2a. |

---

## Acceptance Gate (Phase 1c, lean)

- All eighteen PROPs above have a one-sentence verification plan stated in this document.
- Every behavioral-spec.md REQ is covered by at least one PROP that would detect a natural mis-implementation (REQ↔PROP matrix above documents the natural mis-implementation caught by each).
- Tier assignments are honest: Tier-0 claims cover only compile-time and code-review verifiable properties; all runtime value invariants are assigned Tier 1.
- Design decisions (DD-1, DD-2) are explicitly labeled with rationale; their PROPs (PROP-006, PROP-012, PROP-014) cover the behavioral consequences.
- Test harness and tooling claims are accurate: `bun:test` + `fast-check` confirmed in `promptnotes/package.json`; no vitest dependency exists or is claimed.
- Performance harness is isolated in `apply-filter-or-search.perf.test.ts` with pinned methodology (1 warmup, median of 5, `bun:test`, development machine, soft bound).
