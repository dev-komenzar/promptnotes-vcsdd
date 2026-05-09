# Sprint 7 Adversarial Review — Regression Report

- Feature: `ui-editor`
- Phase: 3
- Mode: strict
- Sprint: 7, iteration 1
- Reviewed: 2026-05-06

## Overall verdict: **FAIL**

Four of five dimensions FAIL; only `verification_readiness` PASSES. All 15 CRIT-700..714 contract thresholds pass mechanically, but they cannot catch the substantive defects this review identified.

## Dimension summary

| Dimension | Verdict | Critical | Major | Minor |
|---|---|---|---|---|
| spec_fidelity | FAIL | 2 | 0 | 1 |
| implementation_correctness | FAIL | 0 | 3 | 1 |
| structural_integrity | FAIL | 1 | 2 | 1 |
| edge_case_coverage | FAIL | 0 | 2 | 0 |
| verification_readiness | PASS | 0 | 0 | 0 |
| **Total** | | **3** | **7** | **3** |

## Per-criterion thresholds

CRIT-700..714 all PASS (grep counts, test exit codes, file structure). See `verdict.json.convergenceSignals.criteriaResults` for the full table. Strict-mode dimension PASS requires zero critical AND zero major findings inside the dimension — that is the binding constraint here, not the threshold table.

## Most consequential findings

1. **FIND-060 (critical, structural_integrity)** — `EditorPanel.svelte` renders an off-screen "ghost block" element with its own keyboard handler whose explicit purpose (per the source comment) is "test-harness hook". Production code carries scaffolding that exists solely for the test runner; tests for REQ-EDIT-006/007/008/009/EC-EDIT-005 query the ghost first and never exercise the real `BlockElement.svelte` keystroke path.
2. **FIND-058 (critical, spec_fidelity)** — `+新規` button is disabled when `editing && isDirty`, which contradicts REQ-EDIT-033 / PROP-EDIT-022 ("disabled only in switching") and breaks REQ-EDIT-035's prescribed flow (a real-browser user cannot click a disabled button to trigger `TriggerBlurSave→RequestNewNote`). PROP-EDIT-024a passes only because jsdom `dispatchEvent('click')` bypasses the disabled gate.
3. **FIND-065 (major, implementation_correctness)** — REQ-EDIT-035 says `RequestNewNote` is "deferred until the snapshot leaves saving", but the implementation drops it. There is no queued intent and no `$effect` that re-fires `RequestNewNote` after `saving→editing`; the user remains on the same note.

## Routing

- Phase 1a (spec gaps): FIND-066 (block-tree inbound channel), FIND-070 (reorder boundary semantics).
- Phase 2a (test rewrites): FIND-063 (EC-EDIT-014 focus restoration), FIND-064 (banner shadow assertion), FIND-067 (FocusBlock dedup test).
- Phase 2b (implementation fixes): FIND-058, FIND-059, FIND-060, FIND-061, FIND-062, FIND-065.
- Phase 2c (cleanup): FIND-068, FIND-069.

## Phase 5 readiness

Phase 5 (formal hardening) **MUST NOT proceed**. The four FAILing dimensions must be resolved first. The pure tier (`editorReducer.ts`, `editorPredicates.ts`, `debounceSchedule.ts`, `types.ts`) is sound and the Phase 5 purity audit, branch coverage fallback, and security greps would all pass — but the shell-tier defects falsify the integration-tier evidence that Phase 5 relies on.

## Tests run / verified

Verified by inspection of:
- `promptnotes/src/lib/editor/*.ts`, `*.svelte` (10 source files)
- `promptnotes/src/lib/editor/__tests__/*.test.ts` and `__tests__/prop/*.prop.test.ts` and `__tests__/dom/*.dom.vitest.ts` (full suite)
- `.vcsdd/features/ui-editor/contracts/sprint-7.md` (CRIT-700..714)
- `.vcsdd/features/ui-editor/specs/{behavioral-spec,verification-architecture}.md`
- `.vcsdd/features/ui-editor/evidence/sprint-7-{red,green,refactor}.log`
- `promptnotes/{package.json,vitest.config.ts}`

Threshold-level commands (`bun test`, `bun run test:dom`) were not re-executed; per the contract their pass status is asserted by `sprint-7-green-phase.log` (215/215 vitest pass, 0 editor-scope tsc errors, zero non-editor regressions).
