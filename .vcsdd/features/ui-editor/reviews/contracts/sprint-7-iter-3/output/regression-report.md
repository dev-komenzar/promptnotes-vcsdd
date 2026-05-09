# Sprint 7 Contract Review — Iter-3 Regression Report

**Feature**: ui-editor
**Sprint**: 7
**Iteration**: 3
**Mode**: strict
**Reviewed**: 2026-05-06

## Iter-2 → Iter-3 Resolution Status

All 7 iter-2 findings (FIND-048..054) are resolved at the per-criterion (CRIT-XXX passThreshold) level.

| Iter-2 Finding | Description (paraphrased) | Iter-3 Status | Evidence |
|---|---|---|---|
| FIND-048 (critical) | `bun run test:dom` cannot run pure-tier `*.test.ts` (uses bun:test imports) | RESOLVED | CRIT-703/704/705/714 now use `bun test src/lib/editor/__tests__/...` (Bun native) |
| FIND-049 (critical) | `bun run test:dom` cannot run `*.prop.test.ts` (vitest include excludes) | RESOLVED | CRIT-703 now uses `bun test src/lib/editor/__tests__/prop/`; vitest scope confined to DOM tier |
| FIND-050 (critical) | CRIT-702 `kind:` grep over-counts due to 3 `_Assert*` type aliases | RESOLVED | CRIT-702 replaced with per-name `grep -q "'$k'"` loop using single-quote-wrapped literals; presence-only check is unaffected by extra `_Assert*` occurrences |
| FIND-051 (major) | coverage-summary.json key `branchCoverage.pct` does not exist (actual key `branches.pct`) | RESOLVED | CRIT-713 abandoned the JSON path entirely; switched to Bun stdout coverage with documented purity-grep + Tier-2-property-test fallback |
| FIND-052 (major) | `#dd5b00` count==1 unsatisfiable (appears at 2 locations: data-accent + CSS) | RESOLVED | CRIT-708 changed to `>=1 hit` with explicit acknowledgement: "the orange accent token may appear as both data attribute and CSS, so >=1 is sufficient" |
| FIND-053 (major) | Test names use Unicode `≥`/`→`; contract uses ASCII `>=`/`->` | RESOLVED | Iter-3 thresholds verify ID-string presence (REQ-EDIT-XXX, PROP-EDIT-XXX) rather than full assertion-name match; ID strings are pure ASCII so the Unicode/ASCII split no longer matters |
| FIND-054 (major) | Aggregated counts (e.g. `>=17`) included false positives | RESOLVED | Per-name grep loops in CRIT-702/CRIT-707 replace aggregate counts; the boolean `grep -q` per ID admits no over-count failure mode |

## New Defects Introduced in Iter-3

The iter-3 package addressed every per-criterion defect from iter-2 but failed to propagate the corrections to the Definition of Done section (lines 377-384) and left an internal inconsistency inside CRIT-713 itself.

| New Finding | Severity | Location | Issue |
|---|---|---|---|
| FIND-055 | critical | sprint-7.md L378 (DoD #2) | DoD #2 still claims `bun run test:dom (pure + property + integration)` is a single-command Green-phase gate; this is impossible under vitest.config.ts include pattern |
| FIND-056 | critical | sprint-7.md L379 (DoD #3) | DoD #3 still claims `bun run test:dom -- --coverage` produces ≥95% branch coverage on the 3 pure modules; vitest does not execute the pure-tier `*.test.ts` / `*.prop.test.ts` files where most branches are reached |
| FIND-057 | major | sprint-7.md L281-301 (CRIT-713 internal) | CRIT-713 description states "@vitest/coverage-v8 reports ... The coverage run uses 'bun run test:dom -- --coverage'" but the passThreshold then says "pure tests run via bun test (Bun native); vitest covers the DOM tier only" and uses `bun test --coverage` instead — the criterion contradicts itself |

## Verdict

- **contract_validity**: FAIL (3 findings: 2 critical + 1 major)
- **contract_alignment**: PASS (0 findings; all REQ/EC/PROP IDs cited in passThresholds verified present in their cited test files; all paths exist; the alternative branch-coverage gate at CRIT-713 passThreshold is achievable)

**Strict mode requires zero critical AND zero major findings in BOTH dimensions. The presence of 2 critical and 1 major finding in contract_validity blocks Phase 3.**

## Recommended Iter-4 Patch (Minimal)

A single-section edit to the Definition of Done plus a small description update inside CRIT-713 should resolve all three findings without re-touching any of the CRIT-700..CRIT-714 passThresholds:

1. Replace DoD #2 with two separate gate lines:
   - `cd promptnotes && bun test src/lib/editor/__tests__/` exits 0 (pure + property tiers, Bun native runner)
   - `cd promptnotes && bun run test:dom` exits 0 (DOM tier, vitest)

2. Replace DoD #3 with the CRIT-713 wording:
   - Branch coverage on the three pure modules ≥ 95% per file via `cd promptnotes && bun test --coverage src/lib/editor/__tests__/editor*.test.ts src/lib/editor/__tests__/debounceSchedule.test.ts src/lib/editor/__tests__/prop/`; OR the equivalent gate (CRIT-703 passes AND canonical purity grep returns zero hits AND tsc --strict --noUncheckedIndexedAccess clean).

3. Strike the obsolete `'bun run test:dom -- --coverage' with provider: 'v8'` clause from CRIT-713's description (lines 286-288); the passThreshold already states the correct gate.

No criterion weights change. Total still sums to 1.00.

## Convergence Trajectory

- Iter-1: 13 findings (FIND-035..047)
- Iter-2: 7 findings (FIND-048..054); 9 of 13 iter-1 findings resolved
- Iter-3: 3 findings (FIND-055..057); 7 of 7 iter-2 findings resolved

The trajectory is converging. Iter-3's defects are localised entirely to the Definition of Done section and one description block; they do not propagate to the per-criterion thresholds. A targeted iter-4 patch should achieve PASS without disturbing the rest of the contract.
