# ui-editor — Phase 1c Iteration 5 Regression Report

**Feature**: `ui-editor`
**Phase**: 1c (strict mode)
**Iteration**: 5
**Reviewed**: 2026-05-06
**Overall verdict**: PASS (both dimensions PASS, zero critical, zero major, zero minor)

## Summary

Re-review of the 10 iter-4 findings (FIND-025..034: 4 major + 6 minor) plus the two pre-emptive ambiguity remediations (`isNoteEmpty` DTO projection on non-`editing` arms; `lastSaveResult` field consistency). All ten iter-4 findings are confirmed resolved. No new findings were introduced in iter-5. Both dimensions PASS the strict-mode binary gate.

## Iter-4 finding resolutions

| ID | Severity | Dimension | Resolution evidence |
|---|---|---|---|
| FIND-025 | major | spec_fidelity | RD-017 (behavioral-spec.md L918), PROP-EDIT-007 (§3 L109 + §4 L174), §3 Tier 0 obligation L93 all align on the "17-variant (16 IPC-adapter + 1 local-effect)" framing |
| FIND-026 | major | spec_fidelity | DTO `save-failed` arm at behavioral-spec.md §10 L994-1014 carries `priorFocusedBlockId` flagged as DTO-only projection. RD-011 (L912), RD-018 (L919), REQ-EDIT-029 (L485), EC-EDIT-014 (L818), PROP-EDIT-014 (vc.md L181), PROP-EDIT-040 (vc.md L209), PROP-EDIT-050 (vc.md L219) all reference `priorFocusedBlockId` consistently. §3.6a L391 documents the projection rule for `EditorViewState.focusedBlockId` |
| FIND-027 | major | spec_fidelity | PROP-EDIT-040 §3 L114 + §4 L209 are now per-variant with explicit field sets (idle / editing / saving / switching / save-failed) and an idle-default fallback table. The property is verifiable against the discriminated DTO |
| FIND-028 | major | spec_fidelity | §3 Tier 0 L91 EditorAction enumeration removes `BlurEvent` and explicitly states `EditorBlurredAllBlocks` covers the all-blocks-blurred case. The save-action set is enumerated in line |
| FIND-029 | minor | spec_fidelity | §10 InsertBlock decomposition note at vc.md L448 + adapter binding table L460-461 document the bidirectional wire-format mapping |
| FIND-030 | minor | verification_readiness | Coverage Matrix §6 L336 EC-EDIT-009 row now lists both PROP-EDIT-033 and PROP-EDIT-045 |
| FIND-031 | minor | verification_readiness | §10 Adapter binding table L454-475 explicitly maps `cancel-idle-timer` → `timerModule.cancelIdleSave(currentHandle)` with `IPC: No` |
| FIND-032 | minor | verification_readiness | §10 Wire-boundary source-field erasure note (vc.md L478-486; behavioral-spec.md §10 wire-boundary note L952-977) documents the intentional asymmetry |
| FIND-033 | minor | spec_fidelity | REQ-EDIT-010 L222 + §7 L873 + PROP-EDIT-010 L177 pin the divider rule to `content === '---'` exact equality |
| FIND-034 | minor | verification_readiness | REQ-EDIT-035 L584 acceptance criterion + PROP-EDIT-024c (vc.md L193) cover the `(editing AND isDirty === false)` direct-dispatch case. Coverage Matrix L324 lists 024a/024b/024c |

## Pre-emptive remediations confirmed

- **`isNoteEmpty` DTO projection on `saving` / `switching` / `save-failed`** — behavioral-spec.md §10 L970-1014: every non-`idle` DTO arm carries `isNoteEmpty` with a documented "populated by IPC emission layer" comment. Avoids future Phase-2 ambiguity for predicates like `canCopy`.
- **`lastSaveResult` field consistency** — present on the `editing` DTO arm (behavioral-spec.md §10 L967), on `EditorViewState` (§3.6a L391), in glossary §6 L844, in PROP-EDIT-040 §4 L209 field set + idle defaults, and in `editorReducer.ts` description (vc.md §2 L62). All four locations agree that `lastSaveResult` is mirrored only from the `editing` arm and is `null` for every other status.

## New findings in iter-5

None. Both dimensions PASS.

## Convergence

Strict-mode rule: PASS requires zero critical AND zero major findings per dimension. Both `spec_fidelity` and `verification_readiness` dimensions are clean. Iter-5 is the convergent iteration; the spec is internally consistent, faithful to the type contracts, and the verification architecture is implementable as documented.

## Gate status

**The Phase 1c human-approval gate may now proceed.** Recommended next actions:
1. Run `/vcsdd-gate spec --approve` (or the project-equivalent strict-mode approval command) once a human reviewer signs off the spec.
2. Tag and commit Phase 1c artifacts via `/vcsdd-commit`.
3. Proceed to Phase 2a (Red-phase test generation) for sprint 7.
