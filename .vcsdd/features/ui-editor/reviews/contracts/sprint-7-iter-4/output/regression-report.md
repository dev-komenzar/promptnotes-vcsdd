# Sprint 7 Contract Review — Iter-4 Regression Report

Mode: strict
Feature: ui-editor
Sprint: 7
Iteration: 4
Reviewed at: 2026-05-06

## Iter-3 finding disposition

| Finding | Severity | Disposition | Evidence |
|---|---|---|---|
| FIND-055 | critical | RESOLVED | Contract line 383: DoD #2 now reads "`cd promptnotes && bun test` exits 0 (or with only pre-existing non-editor failures) AND `cd promptnotes && bun run test:dom` exits 0 with zero failures." The per-tier split aligns with vitest.config.ts include pattern (lines 22-25) and the per-criterion runner usage in CRIT-703..705/CRIT-714. |
| FIND-056 | critical | RESOLVED | Contract line 384: DoD #3 now reads "preferred path is `cd promptnotes && bun test --coverage src/lib/editor/__tests__/editor*.test.ts src/lib/editor/__tests__/debounceSchedule.test.ts src/lib/editor/__tests__/prop/` reports >= 95% branches per pure module; if the Bun coverage output is unavailable in this environment, the equivalent rigour is provided by Tier 2 fast-check property tests (CRIT-703) plus the canonical purity audit (CRIT-706) plus `tsc --strict --noUncheckedIndexedAccess` exit 0 on the pure modules." This is a verbatim mirror of CRIT-713 passThreshold. |
| FIND-057 | major | RESOLVED | Contract lines 284-291 (CRIT-713 description): now states "Coverage is therefore measured via `bun test --coverage` whose stdout reports per-file branch %. As a fallback when Bun coverage output is environmentally unavailable, the equivalent rigour is provided by the Tier 2 fast-check property tests (CRIT-703) plus the canonical purity audit (CRIT-706) plus a clean `tsc --strict --noUncheckedIndexedAccess`." The obsolete `bun run test:dom -- --coverage` reference is removed; description and passThreshold now agree on `bun test --coverage` as the primary gate. |

## New findings (FIND-058+)

None. No new critical or major findings emerged under strict-mode review of contract_validity or contract_alignment.

## Cross-document consistency check

| Authoritative section | Pure-tier runner | DOM-tier runner | Coverage runner |
|---|---|---|---|
| DoD note (line 380) | bun test | bun run test:dom | n/a |
| DoD #1 (line 382) | bun test | bun run test:dom | n/a |
| DoD #2 (line 383) | bun test | bun run test:dom | n/a |
| DoD #3 (line 384) | n/a | n/a | bun test --coverage (with property-test fallback) |
| CRIT-703 passThreshold | bun test src/lib/editor/__tests__/prop/ | bun run test:dom | n/a |
| CRIT-704 passThreshold | bun test src/lib/editor/__tests__/editor*.test.ts | n/a | n/a |
| CRIT-705 passThreshold | bun test src/lib/editor/__tests__/debounceSchedule.test.ts | n/a | n/a |
| CRIT-713 description | n/a | n/a | bun test --coverage |
| CRIT-713 passThreshold | n/a | n/a | bun test --coverage (fallback documented) |
| CRIT-714 passThreshold | bun test src/lib/editor/__tests__/prop/editorReducer.prop.test.ts | n/a | n/a |

The runner partition is now internally consistent across every authoritative section.

## Weight integrity

CRIT-700 (0.14) + CRIT-701 (0.08) + CRIT-702 (0.05) + CRIT-703 (0.12) + CRIT-704 (0.09) + CRIT-705 (0.06) + CRIT-706 (0.07) + CRIT-707 (0.06) + CRIT-708 (0.04) + CRIT-709 (0.05) + CRIT-710 (0.04) + CRIT-711 (0.04) + CRIT-712 (0.04) + CRIT-713 (0.06) + CRIT-714 (0.06) = 1.00 exact.

## Strict-mode gate decision

PASS gate met (zero critical AND zero major findings in BOTH dimensions). Phase 3 may proceed against `.vcsdd/features/ui-editor/contracts/sprint-7.md` at iteration 4.
