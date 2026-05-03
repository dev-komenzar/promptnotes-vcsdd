# Findings — delete-note Phase 1c iter-2

**Verdict**: PASS
**Resolved from iter-1**: 6/6
**New findings**: 1 (MINOR, non-blocking)

## Iter-1 resolution audit

| Iter-1 Finding | Severity | Status |
|---|---|---|
| FIND-SPEC-DLN-001 | BLOCKER | RESOLVED |
| FIND-SPEC-DLN-002 | BLOCKER | RESOLVED |
| FIND-SPEC-DLN-003 | MAJOR | RESOLVED |
| FIND-SPEC-DLN-004 | MAJOR | RESOLVED |
| FIND-SPEC-DLN-005 | MINOR | RESOLVED |
| FIND-SPEC-DLN-006 | MINOR | RESOLVED |

## New findings

### FIND-SPEC-DLN-007 (MINOR, non-blocking)

- **Dimension**: spec_fidelity
- **Category**: spec_gap
- **Location**: `behavioral-spec.md` Deltas 1–6 (no Delta 7) vs. `verification-architecture.md:204-223` (deps-less `UpdateProjectionsAfterDelete` signature) vs. canonical `docs/domain/code/ts/src/curate/workflows.ts:131-137` (curried form).
- **Issue**: The Revision 2 fix for FIND-001 changed `UpdateProjectionsAfterDelete` from the canonical `(deps) => (feed, inv, event) => ...` to a deps-less `(feed, inv, event) => ...`. This is a real canonical contract delta but is not enumerated in the behavioral-spec.md "Cross-context Dependencies / Canonical Contract Deltas" section (only Deltas 1–6 are listed there). The signature change is shown only in the verification-architecture.md Port Contracts block.
- **Suggested fix (optional)**: Add "Delta 7: `UpdateProjectionsAfterDelete` becomes deps-less pure" to behavioral-spec.md citing `workflows.ts:131-137`, with rationale that the deps curry is no longer needed because the function makes no port calls.
- **Routing**: Phase 1a (light spec edit). Non-blocking; lean mode tolerates this gap. Defer to Phase 2c if it surfaces during refactor.
