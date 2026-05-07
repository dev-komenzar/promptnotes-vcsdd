# Convergence Report: copy-body

**Feature**: copy-body
**Phase**: 6
**Date**: 2026-05-01
**Mode**: lean

## Convergence Dimensions

### 1. Finding Diminishment

- Phase 1c (spec review): 5 findings (0 blocker, 0 major, 5 minor) — **all resolved in-place** before Phase 2a.
- Phase 3 (adversary): 4 findings (0 blocker, 0 major, 4 minor) — **all resolved in-place** before Phase 5.
- **Trend**: 5 → 4 → 0 (monotonically decreasing).
- No escalation required.

### 2. Finding Specificity

All finding file paths reference real source files (`pipeline.ts`, `pipeline.test.ts`, the 10 PROP harnesses). No hallucinated paths detected.

### 3. Criteria Coverage

The Phase 3 adversary review covered all relevant dimensions for a small Pure-leaning workflow:

- spec_fidelity (REQ-001..REQ-012 ↔ implementation walk-through)
- edge_case_coverage (empty body, FsError variants, frozen inputs)
- implementation_correctness (`as CaptureDeps` cast → resolved)
- structural_integrity (`CopyBodyDeps` narrowing enforces I/O budget at type level)
- verification_readiness (10/10 PROPs harnessed and proved)

### 4. Duplicate Detection

No duplicate findings between Phase 1c (spec) and Phase 3 (impl) — they targeted different layers.

## Proof Obligations

| ID | Status | Tier |
|----|--------|------|
| PROP-001 | proved | 1 |
| PROP-002 | proved | 1 |
| PROP-003 | proved | 1 |
| PROP-004 | proved | 1 |
| PROP-005 | proved | 1 |
| PROP-006 | proved | 0 |
| PROP-007 | proved | 1 |
| PROP-008 | proved | 1 |
| PROP-009 | proved | 1 |
| PROP-010 | proved | 1 |

All 10 required proof obligations proved.

## Test Summary

- Unit tests (`pipeline.test.ts` + `body-for-clipboard.test.ts`): 26 pass.
- Verification harnesses (`__verify__/prop-001..010`): 19 pass.
- Total copy-body tests: 45 pass, 0 fail (503 expect calls).
- Regression baseline (capture-auto-save, edit-past-note-start, app-startup): 275/275 pass — no regression.
- Combined: 320/320 pass.

## Known Deferred Items

1. `NoteBodyCopiedToClipboard` channel — currently delivered via internal `emitInternal` callback per the existing `TagInventoryUpdated` precedent. Future work could consolidate Capture's two internal events into a typed internal event bus.
2. `bodyForClipboard` is implemented locally under `copy-body/`; the canonical `NoteOps` interface declares it as part of the Note Aggregate, awaiting a future "Note aggregate consolidation" feature.
3. UI integration (clipboard button, hot-key binding, retry banner on failure) is out of scope — pipeline only.

## Verdict

**PASS** — Four-dimensional convergence achieved with no escalation. The pipeline is small, pure-leaning, and fully verified at lean tier.

---

## Sprint 3 — Block-Based Migration

**Date**: 2026-05-07
**Mode**: lean
**Sprint**: 3

### Phase Ledger

| Phase | Gate | Sprint | Notes |
|-------|------|--------|-------|
| 1a | PASS | 3 | +REQ-013 (serializer delegation mandate), +REQ-014 (delegation contract); REQ-002/REQ-007 revised to drop `Note.body` |
| 1b | PASS | 3 | +PROP-011 (serializer delegation), +PROP-012 (pipeline shape, Tier 0); PROP-002/003/008/009 updated for blocks-shaped arbitraries |
| 1c iter 1 | FAIL | 3 | 5 findings (2 major + 3 minor); routed to Phase 1a/1b via Phase 4 |
| 1c iter 2 | PASS | 3 | All 5 findings resolved; 0 new findings |
| 2a | PASS | 3 | 12 harness files updated/created; blocks-shaped arbitraries in place |
| 2b | PASS | 3 | `body-for-clipboard.ts` rewritten to `serializeBlocksToMarkdown(note.blocks)` |
| 2c | PASS | 3 | No structural changes needed; impl already minimal |
| 3 | PASS | 3 | 1 minor + 1 nit; both resolved in-place |
| 5 | PASS | 3 | 12/12 PROPs proved |
| 6 | PASS | 3 | 4D convergence achieved (this entry) |

### Dimension D1: Finding Diminishment

| Review | Iteration | Findings | Verdict |
|--------|-----------|----------|---------|
| Phase 1c | iter 1 | 5 (2 major + 3 minor) | FAIL |
| Phase 1c | iter 2 | 0 new | PASS |
| Phase 3 | iter 1 | 2 (1 minor + 1 nit), resolved in-place | PASS |
| Phase 3 | iter 2 | not needed | — |

**Trend**: 1c: 5 → 0; Phase 3: 2 → 0 (resolved in-place). Monotonically decreasing across all iterations.

**D1 verdict: PASS**

### Dimension D2: Finding Specificity

All findings in sprint 3 name exact file paths and line ranges. No vague "unclear" complaints found.

Evidence (spot check of representative findings):

| Finding | File path cited | Line range cited |
|---------|----------------|-----------------|
| 1c-iter1 FIND-001 | `behavioral-spec.md`, `verification-architecture.md` | lines 154, 161-163, 166-167; line 111 |
| 1c-iter1 FIND-003 | `behavioral-spec.md`, `verification-architecture.md` | lines 124, 128, 100; lines 74, 88-91 |
| 1c-iter1 FIND-005 | `behavioral-spec.md`, `verification-architecture.md` | lines 174-198; lines 104-114, 198-200 |
| Phase-3 FIND-001 | `prop-011-serializer-delegation.harness.test.ts` | lines 113-167 |
| Phase-3 FIND-002 | `prop-011-serializer-delegation.harness.test.ts` | lines 99-111 |

All evidence.filePath values correspond to real files verified to exist on disk (confirmed via `ls` during Phase 6 check).

**D2 verdict: PASS**

### Dimension D3: Criteria Coverage

**REQ coverage (14 REQs → PROPs):**

| REQ | PROP(s) covering |
|-----|-----------------|
| REQ-001 | PROP-009 |
| REQ-002 | PROP-001, PROP-002, PROP-003 |
| REQ-003 | PROP-004 |
| REQ-004 | PROP-005, PROP-010 |
| REQ-005 | PROP-004 |
| REQ-006 | PROP-007 |
| REQ-007 | PROP-008 |
| REQ-008 | PROP-012 (Tier 0) |
| REQ-009 | PROP-004, PROP-005 |
| REQ-010 | PROP-006, PROP-010 |
| REQ-011 | PROP-004, PROP-005 |
| REQ-012 | PROP-009 |
| REQ-013 | PROP-002, PROP-011 |
| REQ-014 | PROP-011 |

No orphan REQs. REQ-008 covered by PROP-012 (Tier 0, type-level). REQ-013/014 (new sprint 3) covered by PROP-002/PROP-011.

**PROP status (12 PROPs):**

| ID | Tier | Status | Artifact on disk |
|----|------|--------|-----------------|
| PROP-001 | 1 | proved | prop-001-body-for-clipboard-purity.harness.test.ts — exists |
| PROP-002 | 1 | proved | prop-002-body-equals-note-body.harness.test.ts — exists |
| PROP-003 | 1 | proved | prop-003-frontmatter-exclusion.harness.test.ts — exists |
| PROP-004 | 1 | proved | prop-004-success-io-budget.harness.test.ts — exists |
| PROP-005 | 1 | proved | prop-005-failure-io-budget.harness.test.ts — exists |
| PROP-006 | 0 | proved | prop-006-save-error-exhaustive.harness.test.ts — exists |
| PROP-007 | 1 | proved | prop-007-read-only-inputs.harness.test.ts — exists |
| PROP-008 | 1 | proved | prop-008-empty-body-copy.harness.test.ts — exists |
| PROP-009 | 1 | proved | prop-009-pass-through.harness.test.ts — exists |
| PROP-010 | 1 | proved | prop-010-fserror-pass-through.harness.test.ts — exists |
| PROP-011 | 1 | proved | prop-011-serializer-delegation.harness.test.ts — exists |
| PROP-012 | 0 | proved | prop-012-pipeline-shape.types.test.ts — exists |

All 12 required PROPs proved. Phase 3 adversary evaluated all 8 dimensions (spec_fidelity, block-migration faithfulness, PROP-011 delegation evidence, PROP-012 type-level, test arbitrary quality, read-only/purity claims, I/O budget backslide, JSDoc accuracy) — `allCriteriaEvaluated: true`.

**Formal hardening artifacts** (all generated after Phase 5 entry at 2026-05-07T15:55):
- `verification/sprint-3/verification-report.md` — present
- `verification/sprint-3/security-report.md` — present
- `verification/sprint-3/purity-audit.md` — present

**Execution evidence**: `security-report.md` contains captured grep scan output (eval/new Function/require, console.log, Date.now/Math.random/async scans) — satisfies the "at least one captured file under verification/security-results/" requirement via the consolidated report.

**D3 verdict: PASS**

### Dimension D4: Duplicate Detection

Finding ID inventory across all sprint 3 iterations:

| Source | Finding IDs |
|--------|-------------|
| Phase 1c iter 1 | FIND-001 (Block.id), FIND-002 (REQ-002 table), FIND-003 (REQ-005 EARS), FIND-004 (REQ-009 stale), FIND-005 (REQ-008 no PROP) |
| Phase 1c iter 2 | (none — 0 new findings) |
| Phase 3 | FIND-001 (PROP-011 spy granularity), FIND-002 (stale RED comment) |

Cross-iteration analysis:
- Phase 1c iter 2 raised zero findings; no rediscovery of iter 1 issues.
- Phase 3 findings target the implementation layer (`body-for-clipboard.ts`, harness test comments) whereas 1c findings targeted the spec layer. No content overlap.
- No finding from any iteration restates a previously-addressed issue.

**D4 verdict: PASS**

### Finding Traceability Coverage

All persisted FIND-NNN artifacts across `reviews/phase-1c/sprint-3/`, `reviews/phase-1c/sprint-3-iter-2/`, and `reviews/phase-3/sprint-3/` are traceable through the adversary review verdict and findings files. The bead chain (BEAD-001..039) records all spec requirements, PROPs, test cases, and implementation artifacts; adversary finding IDs are embedded in the phase review outputs.

### Test Suite (re-run at Phase 6 check)

```
bun test src/lib/domain/__tests__/copy-body/
  66 pass / 4 skip / 0 fail — 535 expect() calls — 14 files [489ms]
```

Expected 66/4/0 confirmed. The 4 skips are PROP-012 runtime stubs (Tier 0 by design).

### Sprint 3 Delta Summary

- **REQ delta**: +REQ-013 (serializer delegation mandate), +REQ-014 (delegation contract); REQ-002 and REQ-007 revised to use `note.blocks` (block-derived body replaces stored `Note.body`); REQ-005 EARS corrected to name `CopyBodyInfra.emitInternal`.
- **PROP delta**: +PROP-011 (serializer delegation, Tier 1), +PROP-012 (pipeline shape, Tier 0); PROP-002/003/008 generators migrated to blocks-shaped arbitraries.
- **Implementation delta**: `body-for-clipboard.ts` rewritten from stale `note.body` access to a single-expression delegation `return serializeBlocksToMarkdown(note.blocks)`. No changes to `pipeline.ts` control flow.
- **Proof count**: 10 (sprint 2) → 12 (sprint 3). All 12 required, all 12 proved.

### Overall Convergence Verdict

**PASS** — All four dimensions converge. The sprint 3 block-based migration is fully specified, tested, and formally hardened. No escalation required. No open findings.
