# Behavioral Specification: ApplyFilterOrSearch

**Feature**: `apply-filter-or-search`
**Phase**: 1a
**Revision**: 1
**Source of truth**:
- `docs/domain/workflows.md` Workflow 7 (ApplyFilterOrSearch)
- `docs/domain/aggregates.md` §2 Feed Aggregate (FilterCriteria semantics, computeVisible)
- `docs/domain/ui-fields.md` §1B (feed rows), §1C (tag filter sidebar), §1D (search box), §1E (sort)
- `docs/domain/glossary.md` Feed, computeVisible, FeedSearchYieldedNoResults, Highlight
- `docs/domain/validation.md` Scenario 5 (tag filter), Scenario 6 (search)
- `docs/domain/code/ts/src/curate/aggregates.ts` — `Feed`, `FilterCriteria`, `SearchQuery`, `SortOrder`, `FeedOps`
- `docs/domain/code/ts/src/curate/stages.ts` — `UnvalidatedFilterInput`, `AppliedFilter`, `VisibleNoteIds`
- `docs/domain/code/ts/src/curate/workflows.ts` — `ParseFilterInput`, `ApplyFilterOrSearch`
- `docs/domain/code/ts/src/simulations/05_apply_filter_search.spec.ts`
- `docs/domain/code/ts/src/shared/value-objects.ts` — `Tag`, `TagSmartCtor`
- `docs/domain/code/ts/src/shared/snapshots.ts` — `NoteFileSnapshot`
**Scope**: The two pure pipeline functions `parseFilterInput` and `applyFilterOrSearch` only. Excludes: debounce/event handling (UI concern), search highlight computation (UI/Read Model concern per glossary §2), TagInventory construction, Feed state mutations (`applyTagFilter`, `clearFilter`, etc.).

---

## Pipeline Overview

```
UnvalidatedFilterInput → [parseFilterInput] → AppliedFilter → [applyFilterOrSearch(feed, snapshots)] → VisibleNoteIds
```

Stages:

| Stage | Guarantee |
|-------|-----------|
| `UnvalidatedFilterInput` | Raw strings from UI; tags not yet validated; search text may be empty/whitespace |
| `AppliedFilter` | All tags are valid `Tag` VOs; search query is `null` if input was empty/whitespace; sortOrder passed through |
| `VisibleNoteIds` | Post-filter, post-search, post-sort `NoteId[]`; `hasZeroResults` flag set correctly |

The pipeline is **fully pure**: no I/O, no clock reads, no shared mutable state. Both functions are referentially transparent.

---

## Requirements

### REQ-001: ParseFilterInput — happy path produces AppliedFilter

**EARS**: WHEN `parseFilterInput` is called with a `UnvalidatedFilterInput` whose `tagsRaw` are all parseable tags AND `fieldsRaw` contains only well-formed entries THEN the system SHALL return `Ok(AppliedFilter { kind: "AppliedFilter", criteria, query, sortOrder })` where every `tagsRaw` element has been converted to a `Tag` VO via `tryNewTag`, `fieldsRaw` is passed through as `criteria.frontmatterFields`, and `sortOrder` is passed through unchanged.

**Source**: `workflows.ts` `ParseFilterInput` type; `stages.ts` `AppliedFilter`; `aggregates.ts` `FilterCriteria`.

**Acceptance Criteria**:
- Return value is `{ ok: true, value: AppliedFilter }`.
- `AppliedFilter.kind === "AppliedFilter"`.
- `AppliedFilter.criteria.tags` has the same length as `tagsRaw` and each element is a valid `Tag` VO.
- `AppliedFilter.criteria.frontmatterFields` equals `fieldsRaw` (reference or structural equality — same entries).
- `AppliedFilter.sortOrder` is structurally identical to `raw.sortOrder`.
- The function is **pure**: no I/O, no mutations, no clock reads.

---

### REQ-002: ParseFilterInput — tag normalization via Tag Smart Constructor

**EARS**: WHEN `parseFilterInput` processes a `tagsRaw` entry THEN the system SHALL delegate normalization to `tryNewTag` (the Tag Smart Constructor) and SHALL NOT implement parallel normalization logic. The returned `Tag` VO reflects the normalized form (trimmed, lowercased, leading `#` removed).

**Source**: `value-objects.ts` `TagSmartCtor.tryNew`; aggregates.md §1 ("Tag は string の Smart Constructor で：空文字不可・空白文字不可・小文字正規化・先頭 `#` 除去"); ui-fields.md §1A-2 ("各要素 `try_new_tag` で正規化").

**Acceptance Criteria**:
- A `tagsRaw` entry `"  Claude-Code  "` (leading/trailing whitespace, mixed case) is normalized to `"claude-code"` in `criteria.tags`.
- A `tagsRaw` entry `"#review"` (leading `#`) is normalized to `"review"` in `criteria.tags`.
- A `tagsRaw` entry `"draft"` (already normalized) becomes `"draft"` unchanged.
- Normalization is idempotent: applying the same transformation twice yields the same `Tag`.
- `parseFilterInput` does not contain a hand-rolled lowercase/trim — it calls `tryNewTag` and propagates its `Result`.

---

### REQ-003: ParseFilterInput — invalid tag produces Err

**EARS**: WHEN any element of `tagsRaw` causes `tryNewTag` to return an error (empty string, whitespace-only string, or any string rejected by the Smart Constructor) THEN `parseFilterInput` SHALL return `Err({ kind: "invalid-tag", raw: <the offending string> })` and SHALL NOT return a partial `AppliedFilter`.

**Source**: `workflows.ts` `ParseFilterInput` return type — `Result<AppliedFilter, { kind: "invalid-tag"; raw: string }>`; `value-objects.ts` `TagError`; simulation `05_apply_filter_search.spec.ts` invalid-input test.

**Acceptance Criteria**:
- `tagsRaw: [""]` → `Err({ kind: "invalid-tag", raw: "" })`.
- `tagsRaw: ["   "]` (whitespace-only) → `Err({ kind: "invalid-tag", raw: "   " })`.
- The `raw` field in the error preserves the original pre-normalization string verbatim (not normalized).
- When `tagsRaw` contains multiple elements and the *first* is valid but a later one is invalid, the first valid parse is discarded and `Err` is returned (fail-fast on first invalid tag encountered).
- `AppliedFilter` is **never** returned when any tag is invalid.

---

### REQ-004: ParseFilterInput — empty tagsRaw produces empty criteria.tags

**EARS**: WHEN `tagsRaw` is an empty array THEN the system SHALL return `Ok(AppliedFilter)` with `criteria.tags === []` (empty). This is the no-tag-filter case.

**Source**: aggregates.md §2 ("絞り込み合成は AND" — empty tags means no tag constraint); simulation `05_apply_filter_search.spec.ts` `initialFilter.tags = []`.

**Acceptance Criteria**:
- `tagsRaw: []` → `Ok(AppliedFilter { criteria: { tags: [], ... } })`.
- No `Err` is produced for an empty array.
- `criteria.frontmatterFields` and `query` are still set correctly per the rest of the input.

---

### REQ-005: ParseFilterInput — searchTextRaw normalization

**EARS**: WHEN `searchTextRaw` is `null` OR is an empty string `""` OR is a whitespace-only string (e.g., `"   "`) THEN the system SHALL produce `query: null` in `AppliedFilter`. WHEN `searchTextRaw` is a non-empty, non-whitespace-only string THEN the system SHALL produce `query: { text: searchTextRaw.trim(), scope: "body+frontmatter" }`.

**Source**: ui-fields.md §1D ("空文字許容、空はクリア扱い"); aggregates.ts `SearchQuery.scope` ("MVP は 'body+frontmatter' のみ採用"); workflows.md Workflow 7.

**Acceptance Criteria**:
- `searchTextRaw: null` → `query: null`.
- `searchTextRaw: ""` → `query: null`.
- `searchTextRaw: "   "` (whitespace-only) → `query: null`.
- `searchTextRaw: "middleware"` → `query: { text: "middleware", scope: "body+frontmatter" }`.
- `searchTextRaw: "  middleware  "` (leading/trailing whitespace with content) → `query: { text: "middleware", scope: "body+frontmatter" }` (trimmed).
- `scope` is always `"body+frontmatter"` (MVP fixed; never `"body"` or `"frontmatter"`).

---

### REQ-006: ParseFilterInput — sortOrder passthrough

**EARS**: WHEN `parseFilterInput` is called THEN `raw.sortOrder` SHALL be copied verbatim to `AppliedFilter.sortOrder` without any transformation.

**Source**: `stages.ts` `AppliedFilter.sortOrder: SortOrder`; aggregates.ts `SortOrder = { field: "timestamp"; direction: "desc" | "asc" }`.

**Acceptance Criteria**:
- `sortOrder: { field: "timestamp", direction: "desc" }` → `AppliedFilter.sortOrder === { field: "timestamp", direction: "desc" }` (structural equality).
- `sortOrder: { field: "timestamp", direction: "asc" }` → `AppliedFilter.sortOrder === { field: "timestamp", direction: "asc" }`.
- `parseFilterInput` does not synthesize or override the sortOrder.

---

### REQ-007: ApplyFilterOrSearch — feed.noteRefs is the candidate set

**EARS**: WHEN `applyFilterOrSearch` is invoked THEN the output `VisibleNoteIds.ids` SHALL be a subset of `feed.noteRefs`. Any `NoteFileSnapshot` whose `noteId` is NOT in `feed.noteRefs` SHALL NOT appear in the output, even if it passes all filter/search criteria.

**Source**: aggregates.md §2 (`noteRefs: NoteId[]` — "表示候補のノート ID 集合（vault 内の全ノート）"); aggregates.ts `Feed.noteRefs`; simulation `05_apply_filter_search.spec.ts` (`initialFeed.noteRefs = noteIds`).

**Acceptance Criteria**:
- A snapshot present in `snapshots` but absent from `feed.noteRefs` does NOT appear in `ids`.
- A `NoteId` present in `feed.noteRefs` but absent from `snapshots` does NOT appear in `ids` (no unresolvable refs in output).
- All `NoteId` values in the output are members of `feed.noteRefs`.

---

### REQ-008: ApplyFilterOrSearch — tag filter uses OR within selected tags

**EARS**: WHEN `applied.criteria.tags` contains one or more `Tag` values THEN a snapshot SHALL be included in the candidate set if and only if at least one of its `frontmatter.tags` is present in `criteria.tags` (OR semantics within the tag set).

**Source**: aggregates.md §2 불변条件 3 ("同タグ複数選択は OR：タグ A と B を選んだ場合 `A OR B`"); aggregates.ts `FilterCriteria` comment ("同タグ間 OR"); validation.md Scenario 5 ("12 + 3 - 重複 = N 件").

**Acceptance Criteria**:
- A snapshot with `tags: ["claude-code"]` passes when `criteria.tags = [Tag("claude-code")]`.
- A snapshot with `tags: ["review"]` passes when `criteria.tags = [Tag("claude-code"), Tag("review")]` (OR — either match is sufficient).
- A snapshot with `tags: ["draft"]` does NOT pass when `criteria.tags = [Tag("claude-code"), Tag("review")]`.
- A snapshot with `tags: ["claude-code", "review"]` passes when `criteria.tags = [Tag("claude-code")]` (snapshot has a superset of filter tags).
- When `criteria.tags` is empty, all snapshots pass the tag filter (no-op filter).

---

### REQ-009: ApplyFilterOrSearch — heterogeneous criteria use AND composition

**EARS**: WHEN `applied.criteria.tags` is non-empty AND `applied.criteria.frontmatterFields` is non-empty THEN a snapshot SHALL only be included if it satisfies BOTH the tag filter (REQ-008) AND the frontmatter field filter (REQ-010). Similarly, when a non-null `query` is also present, a snapshot must additionally satisfy the search filter (REQ-011). The criteria compose as AND across types.

**Source**: aggregates.md §2 不変条件 2 ("絞り込み合成は AND") and 不変条件 3 ("異種条件間（タグ vs frontmatter フィールド vs search）は AND"); aggregates.ts `FilterCriteria` comment.

**Acceptance Criteria**:
- A snapshot with `tags: ["draft"]` and `frontmatter.custom: "X"` does NOT pass when `criteria.tags = [Tag("claude-code")]` even if `frontmatterFields` is satisfied (tag AND fails).
- A snapshot with `tags: ["claude-code"]` and `body: "hello"` does NOT pass when `criteria.tags = [Tag("claude-code")]` AND `query.text = "middleware"` (search AND fails).
- Only snapshots satisfying all active criteria simultaneously appear in the output.
- When only one criterion type is active (e.g., tags only, search only), the inactive criterion is treated as a universal pass (no-op).

---

### REQ-010: ApplyFilterOrSearch — frontmatter field filter uses exact match per field

**EARS**: WHEN `applied.criteria.frontmatterFields` is non-empty THEN a snapshot SHALL be included in the candidate set for this criterion if and only if for every `(field, value)` entry in `frontmatterFields`, the snapshot's `frontmatter` has that exact field with that exact value (case-sensitive exact match).

**Source**: aggregates.md §2 `FilterCriteria.frontmatterFields: Map<string, string>` ("field → value"); ui-fields.md §1C ("MVP は frontmatter フィルタ UI を提供しないため発火しない" — but the type supports it).

**Acceptance Criteria**:
- `frontmatterFields: { status: "open" }` passes a snapshot with `frontmatter.status === "open"`.
- `frontmatterFields: { status: "open" }` does NOT pass a snapshot with `frontmatter.status === "Open"` (case-sensitive).
- `frontmatterFields: { status: "open" }` does NOT pass a snapshot with `frontmatter.status === "closed"`.
- When `frontmatterFields` is empty (no entries), all snapshots pass this criterion (no-op).
- Multiple `frontmatterFields` entries must all match (AND within the map itself).

---

### REQ-011: ApplyFilterOrSearch — search uses case-insensitive substring match on body and frontmatter

**EARS**: WHEN `applied.query` is non-null THEN a snapshot SHALL be included if and only if `query.text` (as a literal substring, case-insensitive) appears in the snapshot's `body` string OR in any of its `frontmatter.tags` string representations. No regex semantics apply.

**Source**: aggregates.md §2 `SearchQuery.scope: 'body+frontmatter'` and the `applySearch` operation; ui-fields.md §1D ("部分一致、大文字小文字無視 = MVP 仕様"); validation.md Scenario 6 ("検索でハイライト確認"); glossary.md ("検索：フリーテキストによる絞り込み（本文 + frontmatter）").

**Acceptance Criteria**:
- `query.text = "middleware"` matches a snapshot with `body` containing `"Refactor the auth middleware to..."` (substring found in body).
- `query.text = "MIDDLEWARE"` also matches the same snapshot (case-insensitive).
- `query.text = "claude"` matches a snapshot with `frontmatter.tags = [Tag("claude-code")]` (substring found in a tag name).
- `query.text = "xyzqwerty"` does NOT match any snapshot that lacks this string in body or tag names.
- Special characters in `query.text` (e.g., `.`, `*`, `(`) are treated as literal characters, not regex patterns.
- Scope is always `"body+frontmatter"` for MVP; frontmatter search covers tag name strings only (not `createdAt`/`updatedAt` timestamps).

---

### REQ-012: ApplyFilterOrSearch — sort by updatedAt with NoteId tiebreak

**EARS**: WHEN `applyFilterOrSearch` sorts the filtered result set THEN it SHALL sort by `frontmatter.updatedAt.epochMillis` in the direction specified by `applied.sortOrder.direction`. WHEN two snapshots have identical `updatedAt` values THEN the sort SHALL use `NoteId` (lexicographic ascending) as a tiebreak to produce a deterministic total order.

**Source**: aggregates.md §2 불변条件 4 ("既定ソートはタイムスタンプ降順：最新が上"); aggregates.ts `SortOrder = { field: "timestamp", direction: "desc" | "asc" }`; glossary.md ("ソート：タイムスタンプ昇順／降順、既定は降順").

**Acceptance Criteria**:
- With `sortOrder.direction = "desc"`, a snapshot with later `updatedAt` appears before one with earlier `updatedAt`.
- With `sortOrder.direction = "asc"`, a snapshot with earlier `updatedAt` appears before one with later `updatedAt`.
- Two snapshots with identical `updatedAt.epochMillis` are ordered by `NoteId` ascending (lexicographic).
- The sort is stable with respect to the tiebreak: the same input always produces the same output order (determinism).
- The sort criterion is `updatedAt`, not `createdAt` or `fileMtime`.

---

### REQ-013: ApplyFilterOrSearch — VisibleNoteIds.hasZeroResults flag

**EARS**: WHEN `applyFilterOrSearch` returns a `VisibleNoteIds` THEN `hasZeroResults` SHALL be `true` if and only if `ids.length === 0`.

**Source**: `stages.ts` `VisibleNoteIds.hasZeroResults: boolean`; ui-fields.md §1D ("0 件結果は `VisibleNoteIds.hasZeroResults=true`、特別 UI を表示"); validation.md Scenario 6 ("FeedSearchYieldedNoResults … 0 件状態の特別 UI").

**Acceptance Criteria**:
- `ids: []` → `hasZeroResults: true`.
- `ids: [<any NoteId>]` → `hasZeroResults: false`.
- `hasZeroResults` is never `true` when `ids` is non-empty.
- `hasZeroResults` is never `false` when `ids` is empty.

---

### REQ-014: ApplyFilterOrSearch — no-filter, no-search returns all feed.noteRefs in sort order

**EARS**: WHEN `applied.criteria.tags` is empty AND `applied.criteria.frontmatterFields` is empty AND `applied.query` is null THEN the system SHALL return all `NoteId` values resolvable from both `feed.noteRefs` and `snapshots`, sorted according to `applied.sortOrder`.

**Source**: aggregates.md §2 `clearFilter` / `clearSearch` operations; validation.md Scenario 5 ("フィルタを解除する → 47 件すべて表示").

**Acceptance Criteria**:
- The returned `ids` contains exactly the intersection of `feed.noteRefs` and `snapshots[*].noteId`, no more, no less.
- The returned `ids` are sorted per REQ-012.
- `hasZeroResults` is `false` when the feed contains at least one resolvable snapshot.

---

### REQ-015: Both functions are referentially transparent (purity)

**EARS**: WHEN `parseFilterInput` or `applyFilterOrSearch` is invoked with the same arguments THEN both functions SHALL return the same result on every invocation. Neither function SHALL read from or write to any I/O port, mutate input arguments, access global mutable state, or consult a clock or random source.

**Source**: workflows.md Workflow 7 ("依存：なし（純粋）", "副作用：none"); aggregates.md §2 `computeVisible` — "Pure Function".

**Acceptance Criteria**:
- `parseFilterInput(x) === parseFilterInput(x)` (deep equality) for all valid inputs.
- `applyFilterOrSearch(feed, applied, snapshots) === applyFilterOrSearch(feed, applied, snapshots)` for all valid inputs.
- No `Date.now()`, `Math.random()`, `fetch()`, file system access, or Tauri command call occurs inside either function.
- Input arguments (`feed`, `applied`, `snapshots`, `raw`) are not mutated by either function.
- No module-level mutable state is read or written by either function.

---

### REQ-016: Non-functional — performance bound for MVP scale

**EARS**: WHEN `applyFilterOrSearch` is invoked with up to 1000 `NoteFileSnapshot` entries, up to 5 selected tags, and 1 search term THEN the function SHALL complete in less than 50ms in a standard V8 runtime environment.

**Source**: workflows.md Workflow 7 ("MVP は同期で十分"); validation.md §後回しで良い未検証項目 ("MVP の想定規模は数百件まで").

**Acceptance Criteria**:
- A benchmark with 1000 snapshots, 5 `criteria.tags`, and `query.text = "test"` completes in < 50ms (wall clock, non-minified Bun runtime).
- `parseFilterInput` with 10 tags completes in < 5ms.
- The implementation uses linear scan; no index structures are required at this scale.

---

## Purity Boundary Analysis

| Sub-step | Function | Classification | Rationale |
|----------|----------|----------------|-----------|
| Input normalization | `parseFilterInput` | **Pure core** | Total `UnvalidatedFilterInput → Result<AppliedFilter, ...>`; delegates to `tryNewTag` (also pure); no I/O |
| Tag Smart Constructor | `tryNewTag` (external) | **Pure core** | Deterministic string → Result<Tag> transformation |
| Snapshot filtering | `applyFilterOrSearch` (filter stage) | **Pure core** | `(Feed, AppliedFilter, NoteFileSnapshot[]) → NoteId[]` subset; no I/O |
| Sort | `applyFilterOrSearch` (sort stage) | **Pure core** | Comparator over `updatedAt` + `NoteId`; no I/O |
| Output construction | `applyFilterOrSearch` (final stage) | **Pure core** | `VisibleNoteIds` struct construction |
| UI debounce / event dispatch | Svelte `$effect` (consumer) | **Effectful shell** | Triggers Workflow 7 on user input; outside pipeline boundary |
| Feed state mutation | `applyTagFilter`, `applySearch`, etc. | **Effectful shell** | Separate FeedOps methods that update Feed state; outside pipeline |

**Formally verifiable core**: both `parseFilterInput` and `applyFilterOrSearch`. All PROPs in Phase 1b target these two functions exclusively.

---

## Error Catalog

```ts
// Produced by parseFilterInput
type ParseFilterInputError = { kind: "invalid-tag"; raw: string };

// Produced by applyFilterOrSearch — none (total function, no error path)
```

UI mapping:

| Condition | UI Reaction |
|-----------|------------|
| `{ kind: "invalid-tag" }` | Tag chip input validation — show inline error on the offending chip (UI concern; pipeline returns Err and caller handles display) |
| `hasZeroResults: true` | "該当なし" message in feed panel (validation.md Scenario 6; ui-fields.md §1D) |

---

## Edge Case Catalog

| Edge Case | Expected Behavior | REQ |
|-----------|------------------|-----|
| `tagsRaw: []` | `criteria.tags: []`; no tag constraint | REQ-004 |
| `tagsRaw: [""]` | `Err({ kind: "invalid-tag", raw: "" })` | REQ-003 |
| `tagsRaw: ["   "]` | `Err({ kind: "invalid-tag", raw: "   " })` | REQ-003 |
| `tagsRaw: ["  Claude-Code  "]` | `criteria.tags: [Tag("claude-code")]` | REQ-002 |
| `tagsRaw: ["#draft"]` | `criteria.tags: [Tag("draft")]` (leading `#` removed) | REQ-002 |
| `searchTextRaw: null` | `query: null` | REQ-005 |
| `searchTextRaw: ""` | `query: null` | REQ-005 |
| `searchTextRaw: "   "` | `query: null` | REQ-005 |
| `searchTextRaw: "  foo  "` | `query: { text: "foo", scope: "body+frontmatter" }` | REQ-005 |
| `snapshots` contains noteId not in `feed.noteRefs` | Not included in output | REQ-007 |
| `feed.noteRefs` contains noteId with no matching snapshot | Not included in output | REQ-007 |
| All snapshots filtered out | `{ ids: [], hasZeroResults: true }` | REQ-013 |
| Two snapshots with identical `updatedAt` | Tiebreak by NoteId ascending | REQ-012 |
| `criteria.tags` non-empty, `frontmatterFields` empty, `query` null | Only tag filter applied | REQ-009 |
| All criteria empty/null | All resolvable snapshots returned sorted | REQ-014 |
| Search text with special chars (`.`, `*`) | Literal substring match, no regex | REQ-011 |
| `feed.noteRefs` is empty | `{ ids: [], hasZeroResults: true }` | REQ-013, REQ-014 |
| `snapshots` is empty | `{ ids: [], hasZeroResults: true }` | REQ-013, REQ-014 |

---

## Open Questions

1. **Duplicate NoteId in snapshots array**: Declared impossible by Feed invariant 1 (`noteRefs` has no duplicates). This spec does not define behavior for duplicate `noteId` in the `snapshots` argument — callers may assume the harness provides unique IDs.

2. **Search scope for frontmatter**: MVP scope is `"body+frontmatter"`. For frontmatter, search currently matches against tag name strings only (not `createdAt`/`updatedAt` timestamps). Whether future frontmatter fields (e.g., `status`) should be included in search is deferred to post-MVP.

3. **Search method — substring vs. fuzzy**: Confirmed substring (case-insensitive) for MVP per ui-fields.md §1D ("未確定" note and "部分一致前提"). Fuzzy/regex search deferred per validation.md §後回しで良い未検証項目.

4. **`frontmatterFields` matching against MVP-fixed schema**: The MVP frontmatter schema has only `tags`, `createdAt`, `updatedAt`. The `frontmatterFields` filter targets future user-defined fields. The MVP UI does not expose this filter (ui-fields.md §1C "MVP は frontmatter フィルタ UI を提供しない") — therefore REQ-010 is spec'd but will not be triggered in MVP flows. The implementation must still handle it correctly per the type contract.

5. **Tag normalization for non-ASCII input**: Behavior of `tryNewTag` for Japanese characters, emoji, or full-width characters is deferred to the Tag Smart Constructor's implementation. This spec constrains only that `parseFilterInput` must call `tryNewTag` (REQ-002) and propagate its errors (REQ-003).
