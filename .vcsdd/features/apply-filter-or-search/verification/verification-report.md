# Verification Report

## Feature: apply-filter-or-search | Sprint: 1 | Date: 2026-05-01

## Proof Obligations

| ID | Tier | Required | Status | Tool | Artifact |
|----|------|----------|--------|------|---------|
| PROP-001 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-001.log |
| PROP-002 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-002.log |
| PROP-003 | 0 | true | proved | sentinel-patch + bun:test | verification/fuzz-results/prop-003.log |
| PROP-004 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-004.log |
| PROP-005 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-005.log |
| PROP-006 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-006.log |
| PROP-007 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-007.log |
| PROP-008 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-008.log |
| PROP-009 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-009.log |
| PROP-010 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-010.log |
| PROP-011a | 0 | true | proved (code review) | static source inspection | verification/fuzz-results/prop-011a.log |
| PROP-011b | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-011b.log |
| PROP-012 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-012.log |
| PROP-013 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-013.log |
| PROP-014 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-014.log |
| PROP-015 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-015.log |
| PROP-016 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-016.log |
| PROP-017 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-017.log |
| PROP-018 | 1 | true | proved | fast-check + bun:test | verification/fuzz-results/prop-018.log |

Note: PROP-011a and PROP-011b are both listed above as they appear in verification-architecture.md. In state.json they are registered as PROP-011 (combined, pointing to prop-011b.log for the runtime artifact) because the state schema requires numeric-only IDs. PROP-011a's tier-0 guarantee (static code review) is documented in the purity-audit.md.

## Results

### PROP-001: parseFilterInput is deterministic
- **Tool**: fast-check v3.23.2 + bun:test
- **Command**: `bun test src/lib/domain/__tests__/apply-filter-or-search/__verify__/prop-001-parse-determinism.harness.test.ts`
- **Result**: VERIFIED
- **Runs**: 1000 (seed 1001) + 200 (seed 1002)
- **Tests**: 2 pass, 0 fail

### PROP-002: applyFilterOrSearch is deterministic
- **Tool**: fast-check + bun:test
- **Command**: `bun test ...prop-002-apply-determinism.harness.test.ts`
- **Result**: VERIFIED
- **Runs**: 1000 + 200
- **Tests**: 2 pass, 0 fail

### PROP-003: No I/O in either function
- **Tool**: Runtime sentinel patch + bun:test (Tier 0 with runtime anchors)
- **Command**: `bun test ...prop-003-no-io.harness.test.ts`
- **Result**: VERIFIED
- **Tests**: 7 pass, 0 fail
- **Note**: Tier-0 guarantee. Patches `Date.now`, `Math.random`, and `globalThis.fetch` to detect any calls; none were detected. Static import graph inspected separately in purity-audit.md.

### PROP-004: Tag OR semantics within set
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 2 pass, 0 fail

### PROP-005: Heterogeneous criteria AND composition
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 3 pass, 0 fail

### PROP-006: Sort total order and direction
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 2 pass, 0 fail

### PROP-007: Sort determinism
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 2 pass, 0 fail

### PROP-008: Two-sided candidate set constraint
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 4 pass, 0 fail

### PROP-009: hasZeroResults iff ids.length === 0
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 4 pass, 0 fail

### PROP-010: Empty/whitespace searchTextRaw collapses to query null
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 7 pass, 0 fail

### PROP-011a: tryNewTag reuse — no parallel normalization logic
- **Tool**: Static source inspection + bun:test
- **Result**: VERIFIED
- **Tests**: 3 pass, 0 fail
- **Note**: Tier-0. `parseFilterInput` imports and calls `tryNewTag` from `./try-new-tag.js` exclusively. No independent regex, lowercase, or trim operations on tag strings exist in the function body. One type-check warning found by svelte-check in the harness itself (line 109: `tags[0]` compared to a `string` literal while typed as branded `Tag`); this is a harness type annotation gap and does not affect runtime correctness — bun:test confirms all assertions pass.

### PROP-011b: Error raw field preservation
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 4 pass, 0 fail

### PROP-012: Sort respects direction — ascending vs descending reversal
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 1 pass, 0 fail

### PROP-013: sortOrder passthrough verbatim
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 3 pass, 0 fail

### PROP-014: Case-insensitive substring search semantics
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 5 pass, 0 fail

### PROP-015: Frontmatter field filter semantics
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 3 pass, 0 fail

### PROP-016: Tag deduplication after normalization
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 4 pass, 0 fail

### PROP-017: Fail-fast on first invalid tag
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 4 pass, 0 fail

### PROP-018: No-filter no-search exact intersection
- **Tool**: fast-check + bun:test
- **Result**: VERIFIED — 4 pass, 0 fail

## Graceful Degradation

No degradation required. All PROPs are Tier 0 or Tier 1. The declared mode is lean TypeScript; Tier 2/3 tools (Kani, formal model checkers) are not required and were not invoked.

## Summary

- Required obligations: 19 (18 unique IDs, with PROP-011 split into 011a/011b in spec; registered as 18 in state.json)
- Proved: 19 (all 19 harness files pass)
- Failed: 0
- Skipped: 0
- Total test cases executed: 66 tests across 19 harness files
- Execution time: 8.47s (full suite run)
- Open issues: one type-annotation gap in prop-011a harness (svelte-check ERROR on line 109); does not affect runtime correctness; recommend a Phase 4 minor fix to cast `tags[0] as unknown as string` in that assertion
