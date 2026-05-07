# Verification Report: EditPastNoteStart

**Feature**: edit-past-note-start
**Phase**: 5 (Sprint 2)
**Date**: 2026-05-07
**Mode**: lean
**Spec revision**: Revision 7

---

## Proof Obligations

| ID | Tier | Required | Status | Tool | Artifact |
|----|------|----------|--------|------|---------|
| PROP-EPNS-001 | 1 | **true** | **proved** | bun test + fast-check | `__verify__/prop-001-classify-purity.harness.test.ts` |
| PROP-EPNS-002 | 1 | **true** | **proved** | bun test + fast-check | `__verify__/prop-002-classify-idle.harness.test.ts` |
| PROP-EPNS-003 | 1 | **true** | **proved** | bun test + fast-check | `__verify__/prop-003-classify-editing.harness.test.ts` |
| PROP-EPNS-004 | 1 | **true** | **proved** | bun test + fast-check | `__verify__/prop-004-classify-save-failed.harness.test.ts` |
| PROP-EPNS-005 | 0 | **true** | **proved** | bun test (TypeScript type exhaustiveness) | `__verify__/prop-005-switch-error-exhaustive.harness.test.ts` |
| PROP-EPNS-006 | 2 | false | verified-via-test | bun test | `step3-start-new-session.test.ts` |
| PROP-EPNS-007 | 2 | false | verified-via-test | bun test | `step2-flush-current-session.test.ts` |
| PROP-EPNS-008 | 2 | false | verified-via-test | bun test | `step2-flush-current-session.test.ts` |
| PROP-EPNS-009 | 2 | false | verified-via-test | bun test | `step2-flush-current-session.test.ts` |
| PROP-EPNS-010 | 2 | false | verified-via-test | bun test | `step1-classify-current-session.test.ts` |
| PROP-EPNS-011 | 2 | false | verified-via-test | bun test | `step2-flush-current-session.test.ts` |
| PROP-EPNS-012 | 2 | false | verified-via-test | bun test | `step2-flush-current-session.test.ts` |
| PROP-EPNS-013 | 1 | false | verified-via-test | bun test | `step1-classify-current-session.test.ts` |
| PROP-EPNS-014 | 2 | false | verified-via-test | bun test | `step1-classify-current-session.test.ts` |
| PROP-EPNS-015 | 2 | false | verified-via-test | bun test | `step3-start-new-session.test.ts` |
| PROP-EPNS-016 | 0 | false | verified-via-test | bun test | `step3-start-new-session.test.ts` |
| PROP-EPNS-017 | 3 | false | verified-via-test | bun test | `pipeline.test.ts` |
| PROP-EPNS-018 | 2 | false | verified-via-test | bun test | `pipeline.test.ts` |
| PROP-EPNS-019 | 1 | false | verified-via-test | bun test | `step1-classify-current-session.test.ts` |
| PROP-EPNS-020 | 1 | false | verified-via-test | bun test | `step3-start-new-session.test.ts` |
| PROP-EPNS-021 | 1 | false | verified-via-test | bun test | `step3-start-new-session.test.ts` |
| PROP-EPNS-022 | 2 | false | verified-via-test | bun test | `step2-flush-current-session.test.ts` |
| PROP-EPNS-023 | 2 | false | verified-via-test | bun test | `step2-flush-current-session.test.ts` |
| PROP-EPNS-024 | 1 | false | verified-via-test | bun test | `step2-flush-current-session.test.ts` |
| PROP-EPNS-025 | 2 | false | verified-via-test | bun test | `step3-start-new-session.test.ts` |
| PROP-EPNS-026 | 1 | false | verified-via-test | bun test | `__verify__/prop-026-save-error-mapping.harness.test.ts` |
| PROP-EPNS-027 | 2 | false | verified-via-test | bun test | `__verify__/prop-027-precondition-throws.harness.test.ts` |
| PROP-EPNS-028 | 2 | false | verified-via-test | bun test | `__verify__/prop-028-idempotent-refocus.harness.test.ts` |

---

## Test Execution

### Required proof harnesses (`__verify__/` — PROP-EPNS-001 through PROP-EPNS-005)

Command: `bun test src/lib/domain/__tests__/edit-past-note-start/__verify__/`
Result: **38 pass, 0 fail**, 14460 expect() calls (8 files, 390ms)
Log: `verification/fuzz-results/sprint2-all-props.log`

### Full feature test suite

Command: `bun test src/lib/domain/__tests__/edit-past-note-start/`
Result: **119 pass, 0 fail**, 14628 expect() calls (12 files, 405ms)
Log: `verification/fuzz-results/sprint2-full-suite.log`

---

## Results — Required Obligations

### PROP-EPNS-001: classifyCurrentSession purity (referential transparency)
- **Tool**: bun test + fast-check
- **Command**: `bun test src/lib/domain/__tests__/edit-past-note-start/__verify__/prop-001-classify-purity.harness.test.ts`
- **Result**: VERIFIED — 3 pass, 0 fail, 1101 expect() calls
- **Property**: For all `(EditingSessionState, BlockFocusRequest, Note | null)` tuples, `classifyCurrentSession(s,r,n)` deepEquals `classifyCurrentSession(s,r,n)` called twice. Generated via fast-check arbitrary combinators. numRuns sufficient to cover all 5 state variants (idle, editing, save-failed, saving, switching).
- **Verdict**: proved

### PROP-EPNS-002: idle → no-current
- **Tool**: bun test + fast-check
- **Command**: `bun test src/lib/domain/__tests__/edit-past-note-start/__verify__/prop-002-classify-idle.harness.test.ts`
- **Result**: VERIFIED — 2 pass, 0 fail, 1100 expect() calls
- **Property**: For all `(IdleState, request, null)` inputs, result.kind === 'no-current' invariant holds across 100+ generated requests with arbitrary noteId values.
- **Verdict**: proved

### PROP-EPNS-003: editing: isEmpty↔empty, !isEmpty↔dirty (cross-note)
- **Tool**: bun test + fast-check
- **Command**: `bun test src/lib/domain/__tests__/edit-past-note-start/__verify__/prop-003-classify-editing.harness.test.ts`
- **Result**: VERIFIED — 2 pass, 0 fail, 5000 expect() calls
- **Property 1**: For all EditingState + cross-noteId requests where `isEmptyNote(currentNote)` is true, result.kind === 'empty'. Property 2: where `!isEmptyNote(currentNote)` (non-empty note), result.kind === 'dirty'. Uses the canonical NoteOps.isEmpty predicate (single paragraph, whitespace-only content).
- **Verdict**: proved

### PROP-EPNS-004: same-noteId → same-note for EditingState/SaveFailedState
- **Tool**: bun test + fast-check
- **Command**: `bun test src/lib/domain/__tests__/edit-past-note-start/__verify__/prop-004-classify-save-failed.harness.test.ts`
- **Result**: VERIFIED — 3 pass, 0 fail, 7000 expect() calls
- **Property**: For all (EditingState | SaveFailedState) where request.noteId === state.currentNoteId, result.kind === 'same-note' and result.noteId === state.currentNoteId and result.note === currentNote. Generated across both state variants and arbitrary noteId pairs.
- **Verdict**: proved

### PROP-EPNS-005: SwitchError exhaustiveness + pendingNextFocus shape
- **Tool**: bun test (TypeScript type-level + runtime structural check)
- **Command**: `bun test src/lib/domain/__tests__/edit-past-note-start/__verify__/prop-005-switch-error-exhaustive.harness.test.ts`
- **Result**: VERIFIED — 2 pass, 0 fail, 5 expect() calls
- **Check 1**: TypeScript `never` branch in switch over `SwitchError.kind` — compile-time proof that no unhandled variant exists. **Check 2**: Runtime structural assertion that `SwitchError.pendingNextFocus` has exactly `{ noteId, blockId }` fields (not the Sprint 1 `pendingNextNoteId` shape).
- **Verdict**: proved

---

## Non-Required Obligations Summary

All 23 non-required obligations (PROP-EPNS-006..028) are covered by the feature test suite (119 tests, 12 files). Status: `verified-via-test`. No obligation is `pending` or `skipped`.

Notable Sprint 2 additions:
- PROP-EPNS-026 (SaveError → NoteSaveFailureReason mapping): covered by `prop-026-save-error-mapping.harness.test.ts` — all 6 SaveError variants enumerated.
- PROP-EPNS-027 (precondition throw behavior): covered by `prop-027-precondition-throws.harness.test.ts` — all 5 sub-cases (a)–(e) verified, including PC-004 idle+non-null (FIND-EPNS-S2-P3-001), clock-after-parse ordering for PC-002 (FIND-EPNS-S2-P3-004).
- PROP-EPNS-028 (idempotent re-focus): covered by `prop-028-idempotent-refocus.harness.test.ts` — sub-case (c) uses `r1.toEqual(r2)` for workflow output equality (state-mutation idempotency deferred to upstream reducer per REQ-EPNS-008 scope note).

---

## Overall Verdict

**PASS**

- Required obligations proved: 5/5
- Total test suite: 119/119 pass (0 fail)
- Harness suite: 38/38 pass (0 fail)
- Tool: fast-check (property-based) + bun test (TypeScript type exhaustiveness)
- Degradation: none (fast-check available via node_modules)
