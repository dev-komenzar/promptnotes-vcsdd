# Iteration 3 → Iteration 4 Regression Report

## Context

Sprint 7 is a respec iteration. Both `behavioral-spec.md` (1132 lines) and `verification-architecture.md` (505 lines) were rewritten end-to-end against the new block-based TypeScript type contracts on the `feature/inplace-edit-migration` branch. REQ / EC / PROP IDs were re-issued and are not preserved across the respec (per behavioral-spec.md §14 Migration Notes line 1130). Therefore most prior findings are obsolete by construction — the surfaces they cited no longer exist.

## Iter-3 Findings Status

| Prior ID | Status in iter-4 | Reason |
|---|---|---|
| FIND-019 (major: missing @vitest/coverage-v8) | obsolete due to respec | The Phase 5 / Tier 3 sections were rewritten and the package was already installed in iter-3. The new §3 Tier 3 (line 116-129), §5 (line 265-271), and §7 Phase 5 gate (line 363) all cite `@vitest/coverage-v8` consistently. Nothing to recheck. |
| FIND-020 (minor: PROP duplication) | obsolete due to respec | The PROP-EDIT-XXX list was rewritten; the renumbered union (PROP-EDIT-001..051 with 024a/024b sub-variants) does not duplicate properties as in iter-2. PROP-EDIT-009 is still marked subsumed (line 176, Required: false) — the structural pattern from iter-3 is preserved. |
| FIND-021 (minor: EditorCommand enumeration) | obsolete due to respec | The 9-variant EditorCommand union from prior iterations was replaced wholesale by a 17-variant union in §10 (lines 425-443). Different surface area; new finding FIND-025 supersedes the topic with an arity contradiction. |
| FIND-022 (minor: adapter responsibility split) | obsolete due to respec | The §2 tauriEditorAdapter.ts / editorStateChannel.ts split with explicit OUTBOUND-only / INBOUND-only annotations is preserved (lines 75-76); RD-016 still echoes it. Nothing to recheck. |
| FIND-023 (minor: EditorCommand payload completeness for edit-note-body / copy-note-body) | obsolete due to respec | The legacy `edit-note-body` command kind was deleted entirely as part of Sprint 7's block-based rewrite. The Phase 5 audit grep at §7 line 369 actively forbids the old name. The new EditorCommand variants for block-level commands all carry noteId + blockId + issuedAt explicitly. |
| FIND-024 (minor: computeNextFireAt signature mismatch between behavioral-spec §12 and verification-architecture §2) | obsolete due to respec | The new behavioral-spec §12 (lines 1024-1046) and verification-architecture §2 (line 63) both define `computeNextFireAt({ lastEditAt: number, lastSaveAt: number, debounceMs: number, nowMs: number })` with identical four-field shape. The shell pattern at §12 step 2-3 references the same `nowMs: clock.now()` value consistently. Resolved. |

## New Iter-4 Findings (10 total)

| ID | Severity | Dimension | Topic |
|---|---|---|---|
| FIND-025 | major | spec_fidelity | EditorCommand union has 17 variants but 16 is asserted in 3 places |
| FIND-026 | major | spec_fidelity | DTO save-failed.focusedBlockId not in canonical SaveFailedState |
| FIND-027 | major | spec_fidelity | PROP-EDIT-040 field-for-field mirror impossible against discriminated DTO union |
| FIND-028 | major | spec_fidelity | EditorAction 'BlurEvent' undefined |
| FIND-029 | minor | spec_fidelity | EditorCommand insert-block-{after,at-beginning} kind decomposition vs CaptureCommand 'insert-block' lacks wire-format mapping |
| FIND-030 | minor | verification_readiness | Coverage Matrix EC-EDIT-009 → PROP-EDIT-045 contradicts PROP-EDIT-045's own deferral to PROP-EDIT-033 |
| FIND-031 | minor | verification_readiness | EditorCommand cancel-idle-timer adapter binding undocumented |
| FIND-032 | minor | verification_readiness | dispatchTriggerIdleSave/Blur source parameter wire-boundary erasure undocumented |
| FIND-033 | minor | spec_fidelity | classifyMarkdownPrefix '---' divider line-context unenforceable from signature |
| FIND-034 | minor | verification_readiness | REQ-EDIT-035 leaves editing+isDirty=false unspecified |

## Severity Breakdown

- critical: 0
- major: 4
- minor: 6
- total: 10

## Strict-Mode Gate

Strict mode requires dimension PASS = zero critical AND zero major. Both dimensions have ≥1 major finding (spec_fidelity: 3 majors FIND-025, 026, 027, 028; verification_readiness: 0 majors with findings ascribed there are minors only — but FIND-027 being a property-test specification error also blocks Phase 2 entry, so it has cross-dimension impact). Overall verdict FAIL. Human approval gate must NOT proceed.

## Recommended Routing

- FIND-026, FIND-033, FIND-034 → Phase 1a (`/vcsdd-feedback` to behavioral-spec.md REQ/EC level)
- FIND-025, FIND-027, FIND-028, FIND-029, FIND-030, FIND-031, FIND-032 → Phase 1b (`/vcsdd-feedback` to verification-architecture.md PROP/§10/§6 level)
