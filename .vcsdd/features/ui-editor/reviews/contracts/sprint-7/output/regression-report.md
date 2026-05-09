# Sprint 7 Contract Review — Regression Report

**Feature**: ui-editor
**Sprint**: 7
**Mode**: strict
**Iteration**: 1
**Reviewed**: 2026-05-06
**Verdict**: FAIL

## Summary

The Sprint 7 contract is unfit for grading and cannot drive Phase 3 review. The defects cluster around two themes: (1) basic well-formedness (the declared weight total is wrong), and (2) passThresholds that reference commands, files, JSON keys, regex patterns, and test names that do not match the actual artefacts produced in Phase 2b/2c.

## Per-Dimension Verdicts

| Dimension | Verdict | Critical | Major | Minor |
|---|---|---|---|---|
| contract_validity | FAIL | 4 | 3 | 0 |
| contract_alignment | FAIL | 2 | 4 | 0 |

(FIND-035..047; FIND-046 and FIND-047 also touch validity but are routed primarily to alignment.)

## Critical defects (would block Phase 3)

1. **FIND-035** — Declared `Weight Total = 1.00`, actual sum is **1.10** (15 weights summed). Strict-mode well-formedness violated.
2. **FIND-036** — `bun run test` script does not exist in `promptnotes/package.json`. CRIT-703, CRIT-704, CRIT-705, CRIT-712 passThresholds invoke it.
3. **FIND-037** — `editorPredicates.property.test.ts`, `editorReducer.property.test.ts`, `debounceSchedule.property.test.ts` are absent. CRIT-702, CRIT-703, CRIT-714 reference named properties inside non-existent files.
4. **FIND-038** — DOM vitest tests live under `__tests__/dom/` (per `vitest.config.ts` include pattern), but CRIT-709..712 cite paths under `__tests__/` directly.
5. **FIND-039** — CRIT-702 `grep -c "kind:" types.ts == 17` is structurally wrong; types.ts has many more `kind:` lines than 17 across multiple unions (EditorAction, EditorCommand, FsError, etc.).
6. **FIND-040** — CRIT-707 `grep -c "dispatch" tauriEditorAdapter.ts == 16` will exceed 16 due to JSDoc comment lines mentioning `dispatch* methods`.
7. **FIND-041** — CRIT-708 banner shadow grep pattern `rgba(0,0,0,0.01) 0px 1px 3px` (no spaces) does not match the source which uses `rgba(0, 0, 0, 0.01) 0px 1px 3px` (spaces).

## Major defects (still block Phase 3 in strict mode)

8. **FIND-042** — CRIT-713 queries `branchCoverage.pct` JSON key; @vitest/coverage-v8 uses `branches.pct`.
9. **FIND-043** — CRIT-704 cites exact assertion-name strings that do not match actual test names in `editorReducer.test.ts`.
10. **FIND-044** — CRIT-700 invokes raw `tsc --noEmit --strict --noUncheckedIndexedAccess` but the project gate is `bun run check` (svelte-check), and 179 pre-existing project-wide errors will fail a raw tsc invocation.
11. **FIND-045** — CRIT-701 EC-EDIT regex `EC-EDIT-0[0-1][0-9]` is broader than the 14 spec'd IDs and the threshold "14 distinct ID matches" is ambiguous against `grep -rn` output.
12. **FIND-046** — CRIT-707 description says editorStateChannel `contains only subscribeToState(handler)`; the actual file exports `subscribeToEditorState` and `createEditorStateChannel` — neither named exactly `subscribeToState`.
13. **FIND-047** — CRIT-703 demands `>=100 fast-check runs`, but the actual tests are bun:test example-based (50-case cross-product), not fast-check property runs.

## What's NOT in dispute

- The Phase 2c log indicates the implementation produces 215 passing DOM vitest tests with zero failures, with editor-scope clean type-check.
- The 17-variant EditorCommand union and 5-arm EditingSessionStateDto are correctly specified in `types.ts` (including `priorFocusedBlockId` on save-failed).
- The pure-tier modules (`editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts`) appear free of forbidden APIs.
- The OUTBOUND/INBOUND split is honoured at the source level (`tauriEditorAdapter.ts` calls `invoke` only; `editorStateChannel.ts` calls `listen` only).

These positive aspects are not in dispute, but the contract as written cannot mechanically distinguish PASS from FAIL on them because the passThreshold strings do not match reality.

## Recommendation

**Block Phase 3.** Send the contract back for revision. The negotiation round must, at minimum:

- Fix the weight arithmetic (re-balance to 1.00, e.g., reduce CRIT-700 to 0.06 or proportionally rescale).
- Replace `bun run test` with `bun run test:dom` or add a `test` script.
- Either add the missing `*.property.test.ts` files (with real fast-check `numRuns >= 100`) or rewrite the property-test passThresholds to reference the existing example-based `*.test.ts` files with verifiable assertion names.
- Correct test paths to `__tests__/dom/<name>.dom.vitest.ts`.
- Replace structurally broken greps (`grep -c "kind:"`, `grep -c "dispatch"`, the rgba pattern) with regexes anchored to method/property declarations and that match the actual whitespace style.
- Replace `branchCoverage.pct` with `branches.pct`.
- Either scope the tsc check to editor files (`tsc --noEmit -p tsconfig.editor.json` or equivalent) or accept `bun run check` with editor-scope filter.
- Make assertion-name passThresholds quote the actual test names verbatim, or relax to grep-pattern matching of REQ-EDIT/EC-EDIT IDs that are guaranteed to appear.
