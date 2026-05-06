# Sprint 7 Contract iter-2 Regression Report — ui-editor

## Summary

Iter-2 of the Sprint 7 contract was reviewed against the iter-1 finding set FIND-035..FIND-047 (13 findings: 6 critical + 7 major). Result: **9 of 13 cleanly resolved**, **3 partially resolved**, **1 not addressed**. Four genuinely new defects (FIND-048..FIND-051 in contract_validity; FIND-052..FIND-054 in contract_alignment) are present, of which two are critical.

Overall verdict: **FAIL** in both dimensions. Phase 3 may NOT proceed.

## Iter-1 Findings — Resolution Status

| Finding | Severity (iter-1) | Status (iter-2) | Notes |
|---|---|---|---|
| FIND-035 | critical | RESOLVED | Weights now sum to exactly 1.00 (manual recomputation: 0.14+0.08+0.05+0.12+0.09+0.06+0.07+0.06+0.04+0.05+0.04+0.04+0.04+0.06+0.06 = 1.00). |
| FIND-036 | critical | RESOLVED at script-name level | All passThresholds use `bun run test:dom` which exists. But see FIND-048 — the script does not run the prop/unit tests cited. |
| FIND-037 | critical | RESOLVED | Files `__tests__/prop/{editorPredicates,editorReducer,debounceSchedule}.prop.test.ts` exist and use `fc.assert(fc.property(...), { numRuns: 100 })`. |
| FIND-038 | critical | RESOLVED | Contract paths now correctly point at `__tests__/dom/<name>.dom.vitest.ts`. |
| FIND-039 | critical | PARTIAL | Contract uses targeted alternation `kind: 'X'\|kind: 'Y'\|...` but three additional matches occur in `_Assert*` types — see FIND-050. |
| FIND-040 | critical | RESOLVED | Contract uses `^\s*dispatch[A-Z]` regex. |
| FIND-041 | critical | RESOLVED | Contract uses `0px 23px 52px` substring (matches actual CSS). |
| FIND-042 | major | NOT RESOLVED | Contract still queries `branchCoverage.pct`; correct key is `branches.pct` — see FIND-049. |
| FIND-043 | major | PARTIAL | Some assertion strings now match (e.g., `'REQ-EDIT-004: NoteFileSaved sets isDirty=false'`). But Unicode `→`/`≥` versus ASCII `->`/`>=` mismatches persist in CRIT-703/704/705/714 — see FIND-052. |
| FIND-044 | major | RESOLVED | Type-check now scoped via `bun run check 2>&1 \| grep "src/lib/editor/" \| grep -E "ERROR\|WARNING" \| wc -l == 0`. |
| FIND-045 | major | RESOLVED | Regex `EC-EDIT-0(0[1-9]\|1[0-4])` matches exactly the 14 spec IDs (001..014). |
| FIND-046 | major | PARTIAL | DOM assertion names cited in CRIT-712 match the source. CRIT-707 still says editorStateChannel.ts "contains only subscribeToState(handler)" but actual exports are `subscribeToEditorState` and `createEditorStateChannel` (the named export `subscribeToState` exists only on the object returned by `createEditorStateChannel`). Phrasing remains ambiguous but defensible if read as "the only inbound subscription handler shape exposed is subscribeToState". |
| FIND-047 | major | RESOLVED | Property tests now exist with `fc.assert` + `fc.property` invocations and explicit `{ numRuns: 100 }` configuration. |

## New Findings (iter-2)

| Finding | Dimension | Severity | Summary |
|---|---|---|---|
| FIND-048 | contract_validity | critical | `bun run test:dom` runs only `*.vitest.ts` files; CRIT-703/704/705/714 require pure-tier and Tier-1 tests (which use `bun:test`) to pass via that command. The two test runners are disjoint. |
| FIND-049 | contract_validity | major | CRIT-713 still queries `branchCoverage.pct` (correct key is `branches.pct`). FIND-042 carry-forward. |
| FIND-050 | contract_validity | critical | CRIT-702 `kind:` alternation grep returns 20, not 17, because three `_Assert*` type aliases at lines 275/279/283 of types.ts also match. |
| FIND-051 | contract_validity | major | CRIT-708 `grep -c "#dd5b00" SaveFailureBanner.svelte == 1` is unsatisfiable; source contains `#dd5b00` on lines 36 (data-attribute) and 70 (CSS), so grep returns 2. |
| FIND-052 | contract_alignment | critical | Unicode/ASCII mismatch in CRIT-703/704/705/714 assertion names (source uses `≥` and `→`; contract uses `>=` and `->`). Carry-forward of FIND-043. |
| FIND-053 | contract_alignment | major | CRIT-710 cites `'---'` (single-quoted) but slash-menu.dom.vitest.ts test names use `"---"` (double-quoted). |
| FIND-054 | contract_alignment | major | vitest.config.ts has no `coverage` configuration; CRIT-713 assumes `coverage-summary.json` will be produced by `bun run test:dom -- --coverage` but no provider/reporter/exclude is configured. |

## Critical-vs-Major Tally

- contract_validity: 4 findings (2 critical, 2 major) — FAIL.
- contract_alignment: 3 findings (1 critical, 2 major) — FAIL.

Strict mode rule: PASS iff zero critical AND zero major in BOTH dimensions. Both conditions violated. **FAIL**.

## Required Remediations Before iter-3

1. (FIND-048) Either:
   - Add a `bun run test` script that aggregates `bun test` (for `bun:test`-flagged files) AND `vitest run` (for `*.vitest.ts`); rewrite all CRIT-703/704/705/709/710/711/712/714 passThresholds to use the aggregated script; or
   - Convert all `*.test.ts` and `*.prop.test.ts` files in `__tests__/` to vitest (replace `import from 'bun:test'` with `import from 'vitest'`) and broaden vitest.config.ts include to cover them; or
   - Split the passThresholds into two commands and document explicitly which command verifies which CRIT.
2. (FIND-049) Replace `branchCoverage.pct` with `branches.pct` in CRIT-713.
3. (FIND-050) Re-scope CRIT-702 grep to extract only the EditorCommand union body (e.g., `sed -n '/export type EditorCommand =/,/^[^|]/p' types.ts | grep -c "kind: '"`), or change the threshold to `outputs at least 17`.
4. (FIND-051) Either change CRIT-708 to `>= 1` or `== 2` for `#dd5b00`, or remove the `data-accent-color="#dd5b00"` attribute from SaveFailureBanner.svelte (note: this is a source-edit dependency and should not be silently introduced; clarify in the contract).
5. (FIND-052) Replace ASCII `>=` with Unicode `≥` and ASCII `->` with Unicode `→` throughout CRIT-703/704/705/714 assertion-name citations to match actual source strings.
6. (FIND-053) Replace `'---'` with `\"---\"` (and `'--- '` with `\"--- \"`) in CRIT-710 assertion-name citations.
7. (FIND-054) Add `coverage.provider`, `coverage.reporter`, and `coverage.exclude` to vitest.config.ts as in-scope edits, and reflect that change in the contract DoD.

## Phase 3 Decision

Phase 3 (Red phase / TDD) **MAY NOT** proceed against this contract. The contract still has at least four passThresholds that are mechanically unevaluable (FIND-048, FIND-049, FIND-050, FIND-051), and assertion-name strings would cause spurious failures during sprint review (FIND-052, FIND-053). Route back to contract negotiation for iter-3.
