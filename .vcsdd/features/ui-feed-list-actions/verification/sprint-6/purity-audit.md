# Purity Boundary Audit

## Feature: ui-feed-list-actions | Sprint: 6 | Date: 2026-05-10

---

## Declared Boundaries

From `specs/verification-architecture.md` §2 and §Sprint 6 Purity Boundary Notes:

### Pure Core Modules (unchanged since Sprint 1, no Sprint 6 additions)

| Module | Tier | Key exports | Forbidden APIs |
|--------|------|-------------|----------------|
| `feedRowPredicates.ts` | pure | `isEditingNote`, `isDeleteButtonDisabled`, `bodyPreviewLines`, `timestampLabel`, `needsEmptyParagraphFallback` (added Sprint 5) | canonical purity-audit grep pattern |
| `feedReducer.ts` | pure | `feedReducer(state, action)` | canonical purity-audit grep pattern |
| `deleteConfirmPredicates.ts` | pure | `deletionErrorMessage`, `canOpenDeleteModal` | canonical purity-audit grep pattern |

### Effectful Shell Modules (relevant to Sprint 6)

| Module | Tier | Sprint 6 delta |
|--------|------|----------------|
| `FeedRow.svelte` | impure | Added `effectiveMount = $derived(shouldMountBlocks && blockEditorAdapter !== null)` (line 201); `.row-button` wrapped in `{#if !effectiveMount}` (line 330); `.block-editor-surface` mount gate changed to `{#if effectiveMount}` (line 453) |
| `editingSessionChannel.ts` | impure (INBOUND only) | No Sprint 6 changes |
| `createBlockEditorAdapter.ts` | impure (OUTBOUND only) | No Sprint 6 changes |
| `tauriFeedAdapter.ts` | impure (OUTBOUND only) | No Sprint 6 changes |
| `FeedList.svelte` | impure | No Sprint 6 changes |

### Sprint 6 Purity Boundary Declaration (from verification-architecture.md)

The spec states: "Sprint 6 は `FeedRow.svelte` 内の既存 preview 系 DOM 要素を `{#if !effectiveMount}` で囲む purely structural な変更であり、新規 pure helper を追加しない。`effectiveMount := shouldMountBlocks && blockEditorAdapter !== null` という $derived 1 行 (適用境界に adapter null race を組み込む、EC-FEED-024 対応)。§2 Purity Boundary Map に新規行は追加しない。"

---

## Observed Boundaries

### Pure core modules — Sprint 6 changes

**Finding**: No pure core modules (`feedRowPredicates.ts`, `feedReducer.ts`, `deleteConfirmPredicates.ts`) were modified in Sprint 6.

**Verification**: `git diff vcsdd/ui-feed-list-actions/sprint-4-baseline..HEAD -- promptnotes/src/lib/feed/feedRowPredicates.ts promptnotes/src/lib/feed/feedReducer.ts promptnotes/src/lib/feed/deleteConfirmPredicates.ts` confirms no changes to pure modules in Sprint 5 or Sprint 6 (feedRowPredicates.ts has Sprint 5 additions but no Sprint 6 changes).

**Canonical purity-audit grep** (canonical pattern from §1):
- `feedRowPredicates.ts`: 0 hits (exit 1)
- Verified via `security-results/purity-audit-raw.txt`

**Verdict**: No purity violations in pure core modules.

### effectiveMount $derived — purity analysis

The Sprint 6 core addition is `const effectiveMount = $derived(shouldMountBlocks && blockEditorAdapter !== null)` at `FeedRow.svelte:201`.

**Inputs**:
- `shouldMountBlocks`: also a `$derived` value (lines 192-198), computed from `viewState.editingNoteId === noteId && viewState.editingStatus ∈ {editing,saving,switching,save-failed}` — pure boolean of prop values
- `blockEditorAdapter !== null`: prop value check — pure boolean

**Output**: pure boolean — no side effects, no I/O, no `Date.now()`, no `crypto.randomUUID()`, no DOM access

**Classification**: `effectiveMount` is a deterministic derived value of two reactive inputs. It behaves as a pure function `(shouldMountBlocks: boolean, blockEditorAdapter: T | null) => boolean`. The `$derived` rune in Svelte 5 is lazy and synchronous — it contains no side effects by construction.

**Verdict**: `effectiveMount` satisfies purity requirements. It resides inside the Effectful Shell (`FeedRow.svelte`) but the derived expression itself has no forbidden API usage.

### No new effectful shell modules added

Sprint 6 introduces no new `.svelte` files, no new `.ts` channel/adapter modules. The CRIT-304 1-file constraint confirms this.

**Verification**: `git diff 5f1faec..HEAD --name-only | grep '^promptnotes/src/lib/' | grep -v '__tests__'` returns only `promptnotes/src/lib/feed/FeedRow.svelte`.

### click routing — no new dispatch paths

`dispatchSelectPastNote` (tauriFeedAdapter OUTBOUND) is called exclusively via the `.feed-row-button` click handler, which remains within `{#if !effectiveMount}`. In cell 1 (effectiveMount=true), the handler is unmounted — no new dispatch call paths exist.

`dispatchFocusBlock` (blockEditorAdapter OUTBOUND) is called by `BlockElement` click handlers within the `.block-editor-surface`. This path is unchanged from Sprint 5 (it was always OUTBOUND-only via createBlockEditorAdapter).

**Verdict**: No new effectful dispatch paths introduced. Existing IPC channel discipline maintained.

### Svelte store audit (PROP-FEED-030)

No `from 'svelte/store'` imports appear in Sprint 6 changes. Sprint 6 uses only Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`).

---

## Summary

**Declared boundaries**: Sprint 6 declared no new pure modules and no new effectful shell modules. `FeedRow.svelte` remains in the Effectful Shell tier. The single Sprint 6 addition (`effectiveMount` $derived) is a pure boolean expression of reactive inputs, placed inside an already-impure shell component.

**Observed boundaries**: Match declarations exactly.
- No new pure helpers added (Sprint 6 Purity Boundary Notes: "新規 pure helper を追加しない" — confirmed)
- No new effectful shell modules added (confirmed by CRIT-304 1-file check)
- `effectiveMount` is a pure boolean $derived with no forbidden API usage
- All canonical purity-audit grep hits remain at 0 for pure core modules
- CSS hiding prohibition (PROP-FEED-S6-003) enforced — no `display:none`/`visibility:hidden`/`opacity:0` in FeedRow.svelte

**Mismatches**: None detected.

**Hidden side effects**: None detected. The `effectiveMount` expression has no observable side effects — it gates DOM structure reactively without triggering I/O or stateful mutation.

**Verifier-hostile coupling**: None introduced. The `{#if !effectiveMount}` / `{#if effectiveMount}` guards are transparent to the test suite — vitest + jsdom tests can observe DOM presence/absence directly, and fast-check runs 500 property-based checks with stratified coverage.

**Required follow-up before Phase 6**: None. All boundaries match declarations, no new violations detected, all 7 required PROP-FEED-S6-001..007 proved clean.
