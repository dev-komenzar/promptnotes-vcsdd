# Verification Report

## Feature: tag-chip-update | Sprint: 1 | Date: 2026-05-01

## Proof Obligations

| ID | Tier | Required | Status | Tool | Artifact |
|----|------|----------|--------|------|---------|
| PROP-TCU-001 | 1 | true | proved | fast-check | `__verify__/prop-001-apply-tag-operation-pure-purity.harness.test.ts` |
| PROP-TCU-002 | 1 | true | proved | fast-check | `__verify__/prop-002-add-tag-idempotent.harness.test.ts` |
| PROP-TCU-003 | 1 | true | proved | fast-check | `__verify__/prop-003-remove-tag-idempotent.harness.test.ts` |
| PROP-TCU-004 | 2 | true | proved | example-based (spy) | `pipeline.test.ts` (REQ-TCU-003/004 suites) |
| PROP-TCU-005 | 1 | true | proved | fast-check + tier-0 | `__verify__/prop-005-prev-frontmatter-non-null.harness.test.ts` |
| PROP-TCU-006 | 2 | true | proved | example-based (spy) | `pipeline.test.ts` (REQ-TCU-008 suite) |
| PROP-TCU-007 | 0+2 | true | proved | tier-0 + example-based | `__verify__/prop-007-save-error-cause-exhaustive.harness.test.ts` |
| PROP-TCU-008 | 2 | false | proved | example-based | `pipeline.test.ts` (REQ-TCU-001 suite) |
| PROP-TCU-009 | 2 | false | proved | example-based | `pipeline.test.ts` (REQ-TCU-002 suite) |
| PROP-TCU-010 | 2 | false | proved | example-based | `pipeline.test.ts` (REQ-TCU-005 suite) |
| PROP-TCU-011 | 2 | false | proved | example-based | `pipeline.test.ts` (REQ-TCU-006 suite) |
| PROP-TCU-012 | 0+2 | false | proved | tier-0 + example-based | `__verify__/prop-012-note-edit-error-dead-variants.harness.test.ts` |
| PROP-TCU-013 | 1 | false | proved | example-based | `pipeline.test.ts` (source='curate-tag-chip' test) |
| PROP-TCU-014 | 1 | false | proved | fast-check | `step3-build-save-request.test.ts` |
| PROP-TCU-015 | 1 | false | proved | spy wrapper | `__verify__/prop-015-clock-budget.harness.test.ts` |
| PROP-TCU-016 | 1 | false | proved | example-based | `step4-update-projections.test.ts` |
| PROP-TCU-017 | 0 | false | proved | tier-0 | `step4-update-projections.test.ts` (event membership assertions) |
| PROP-TCU-018 | 2 | false | proved | example-based | `pipeline.test.ts` (PROP-TCU-018 tests) |
| PROP-TCU-019 | 3 | false | proved | integration (spy fakes) | `pipeline.test.ts` (full-pipeline tests) |
| PROP-TCU-020 | 0 | false | proved | tier-0 | `__verify__/prop-020-non-coupling.harness.test.ts` |
| PROP-TCU-021 | 2 | false | proved | example-based | `__verify__/prop-021-occurredon-coherence.harness.test.ts` |

## Execution Evidence

### Test run

Command: `bun test src/lib/domain/__tests__/tag-chip-update/`
Result: **127 pass, 0 fail** (2.05 s)

Verification harnesses only: `bun test src/lib/domain/__tests__/tag-chip-update/__verify__/`
Result: **40 pass, 0 fail** (2.20 s)

### TypeScript check

Command: `bun run check` from `promptnotes/`
Errors in `tag-chip-update/` impl and tests: **0**
Pre-existing errors in OTHER feature test files (edit-past-note-start): **2**
(These are unrelated to tag-chip-update; documented but not fixed per Phase 5 read-only constraint.)

## Results

### PROP-TCU-001: applyTagOperationPure referential transparency
- **Tool**: fast-check (Tier 1)
- **Command**: `bun test src/lib/domain/__tests__/tag-chip-update/__verify__/prop-001-apply-tag-operation-pure-purity.harness.test.ts`
- **Result**: VERIFIED (2 property tests, 200+100 runs each, seed=42 and seed=7)
- **Input space**: `arbNote() × arbTagChipCommand() × Timestamp[1M..2B]` — non-vacuous; generators produce varied notes with 0..5 tags and commands of both `add`/`remove` kinds.

### PROP-TCU-002: Idempotent add produces unchanged tags
- **Tool**: fast-check (Tier 1)
- **Command**: `bun test src/lib/domain/__tests__/tag-chip-update/__verify__/prop-002-add-tag-idempotent.harness.test.ts`
- **Result**: VERIFIED (2 property tests, 200 runs each, seed=42 and seed=99)
- **Input space**: `arbNoteWithTag(tag) × tag × Timestamp[1M..2B]` — tag guaranteed present in frontmatter by construction; non-vacuous.

### PROP-TCU-003: Idempotent remove produces unchanged tags
- **Tool**: fast-check (Tier 1)
- **Command**: `bun test src/lib/domain/__tests__/tag-chip-update/__verify__/prop-003-remove-tag-idempotent.harness.test.ts`
- **Result**: VERIFIED (2 property tests, 200 runs each, seed=42 and seed=7)
- **Input space**: `arbNoteWithoutTag(absentTag) × absentTag × Timestamp[1M..2B]` — tag guaranteed absent by construction; non-vacuous.

### PROP-TCU-004: No-op short-circuit prevents write/publish/Clock
- **Tool**: example-based with spy deps (Tier 2)
- **Evidence**: `pipeline.test.ts` — REQ-TCU-003 suite (5 tests) and REQ-TCU-004 suite (4 tests); spy counters for `_clockCallCount`, `_writeMarkdownCallCount`, `_publishCallCount`, `_publishInternalCallCount` all verified === 0.
- **Result**: VERIFIED

### PROP-TCU-005: previousFrontmatter sourcing and non-null
- **Tool**: fast-check (Tier 1) + tier-0 type assertion
- **Command**: `bun test src/lib/domain/__tests__/tag-chip-update/__verify__/prop-005-prev-frontmatter-non-null.harness.test.ts`
- **Result**: VERIFIED (3 tests including tier-0 compile-time proof and 2 property tests, 200 runs each)

### PROP-TCU-006: Save-failure projection isolation
- **Tool**: example-based with spy deps (Tier 2)
- **Evidence**: `pipeline.test.ts` — REQ-TCU-008 suite; `_publishInternalCallCount === 0` on all save-failure paths; `updateProjectionsAfterSave` not called (verified structurally by test: no `TagInventoryUpdated` emitted).
- **Result**: VERIFIED

### PROP-TCU-007: SaveError + SaveValidationError.cause exhaustiveness
- **Tool**: tier-0 TypeScript exhaustiveness + example-based (Tier 0+2)
- **Evidence**: `prop-007-save-error-cause-exhaustive.harness.test.ts` — (a) `assertSaveErrorDeltaExhaustive` switch with `never` default compiles; (b) `Extract<SaveValidationErrorDelta, { kind: "invariant-violated" }>["cause"]` resolves to 3-variant union, negative `@ts-expect-error "totally-fake-cause"` is non-vacuous; (c) per-cause runtime tests for `note-not-in-feed`, `hydration-failed`, `frontmatter-invariant`.
- **Result**: VERIFIED (13 tests)

### PROP-TCU-008..021 (non-required)
All non-required obligations are covered by tests in `pipeline.test.ts`, `step2-apply-tag-operation-pure.test.ts`, `step3-build-save-request.test.ts`, `step4-update-projections.test.ts`, and dedicated `__verify__/` harnesses. All pass.

## Summary

- Required obligations (PROP-TCU-001..007): **7 / 7 proved**
- Non-required obligations (PROP-TCU-008..021): **14 / 14 evaluated and proved**
- Total obligations proved: **21 / 21**
- Failed: **0**
- Skipped: **0**
- Total test count: **127 pass, 0 fail**
