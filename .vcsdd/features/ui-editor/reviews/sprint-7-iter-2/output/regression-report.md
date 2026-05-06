# Sprint 7 Adversarial Review — Iteration 2 — Regression Report

Branch: feature/inplace-edit-migration
Mode: strict
Reviewed: 2026-05-06

## Iter-1 finding remediation status

| ID | Severity | Iter-1 dimension | Routed to | Iter-2 status | Verification |
|---|---|---|---|---|---|
| FIND-058 | critical | spec_fidelity | 2b | RESOLVED | EditorPanel.svelte:162 — `isNewNoteDisabled = $derived(viewState.status === 'switching')` only |
| FIND-059 | critical | spec_fidelity | 2b | RESOLVED | EditorPanel.svelte:160 — `isCopyEnabled = $derived(canCopy(viewState))` only; isDirty gate removed |
| FIND-060 | critical | structural_integrity | 2b | RESOLVED | EditorPanel.svelte:467-469 — ghost block element + handlers + CSS deleted |
| FIND-061 | major | implementation_correctness | 2b | RESOLVED | Consequence of FIND-060; BlockElement.svelte:143-170 implements XOR via `splitOrInsert(offset, content.length)` |
| FIND-062 | major | structural_integrity | 2b | RESOLVED | EditorPanel.svelte:567-593 — hint rendered conditionally on `currentBlockError?.blockId === block.id`; static hidden divs removed |
| FIND-063 | major | edge_case_coverage | 2a | RESOLVED | editor-session-state.dom.vitest.ts:337-365 — emits post-Cancel editing snapshot, asserts `document.activeElement?.getAttribute('data-block-id') === 'block-1'` |
| FIND-064 | major | edge_case_coverage | 2a | RESOLVED | save-failure-banner.dom.vitest.ts:200-224 — className regex + source-grep on SaveFailureBanner.svelte; data-shadow-applied/data-accent-color attributes removed |
| FIND-065 | major | implementation_correctness | 2b | RESOLVED (impl); minor follow-up FIND-072 (test depth) | EditorPanel.svelte:110,260-282,379-399 — pendingNewNoteSource $state + $effect deferred dispatch |
| FIND-066 | major | structural_integrity | 1a | RESOLVED (architectural); minor follow-up FIND-071 (residual fallback) | RD-021 in spec; types.ts DtoBlock + optional blocks field; editorReducer.mirrorSnapshot mirrors blocks |
| FIND-067 | major | implementation_correctness | 2a | RESOLVED | block-element.dom.vitest.ts:91-118 — click-once test + domain-echo guard test |
| FIND-068 | minor | spec_fidelity | 2c | RESOLVED | types.ts:294-298 — IDLE_SAVE_DEBOUNCE_MS removed; canonical export only in debounceSchedule.ts |
| FIND-069 | minor | implementation_correctness | 2c | RESOLVED | debounceSchedule.test.ts:100-113 — `expect(result.shouldFire).toBe(false); expect(result.fireAt).toBeNull()` |
| FIND-070 | minor | structural_integrity | 1a | PARTIAL (test improvement only; spec not amended on boundary clamp behaviour) | block-drag-handle.dom.vitest.ts:112-148 — direction tests added; first/last clamp boundary still untested |

13 / 13 iter-1 findings addressed: 11 fully resolved, 2 with minor residual follow-ups (FIND-071, FIND-072), 1 partially-resolved minor (FIND-070 spec amendment skipped).

## Spec amendment coherence check

- **RD-021 (block list ownership)**: behavioral-spec.md §9 line 923 + §10 lines 970-1029 add optional `blocks?: ReadonlyArray<{id, type, content}>` to all four non-idle EditingSessionStateDto arms; idle arm carries no blocks. Reducer mirroring rule documented. EditorViewState.blocks added as required field. Coherent.
- **RD-022 (REQ-EDIT-038 dispatch-rejection surface)**: behavioral-spec.md §9 line 924 + §3.11 lines 619-644 specify Promise rejection from `dispatchEditBlockContent`, `dispatchChangeBlockType`, `dispatchInsertBlockAfter`, `dispatchInsertBlockAtBeginning`. `currentBlockError` is local $state in impure shell only — never in EditorViewState or DTO. Block remains contenteditable during error display. Coherent.
- **REQ-EDIT-038 acceptance criteria** explicitly mandate `data-testid="block-validation-hint"` and `data-error-kind="<kind>"` near the affected Block; implementation matches at EditorPanel.svelte:567-593.

## CRIT-700..714 evaluation

All 15 contract criteria PASS based on the mechanical thresholds (grep counts + file-existence + test-runner exit codes). The thresholds were loosened in iter-3 of contract review to "test name contains REQ-EDIT-XXX" — accepted per manifest instruction; no findings raised against the contract design itself.

| CRIT | Verdict | Evidence |
|---|---|---|
| CRIT-700 | PASS | grep -r "REQ-EDIT-" promptnotes/src/lib/editor/__tests__/ covers REQ-EDIT-001..038; legacy EditNoteBody zero hits; editor-scope tsc clean |
| CRIT-701 | PASS | EC-EDIT-001..014 all referenced in test names |
| CRIT-702 | PASS | All 17 EditorCommand kind literals present in types.ts; legacy 9-variant union absent |
| CRIT-703 | PASS | bun run test:dom exits 0 (216 pass); PROP-EDIT-001..011, 040 fast-check properties present |
| CRIT-704 | PASS | Tier 1 deterministic unit tests for PROP-EDIT-012..015, 042 |
| CRIT-705 | PASS | debounceSchedule signatures match §2; IDLE_SAVE_DEBOUNCE_MS=2000; pure-tier purity audit clean |
| CRIT-706 | PASS | Forbidden-API grep on three pure modules returns zero hits; no svelte/store imports |
| CRIT-707 | PASS | tauriEditorAdapter contains 16 dispatch* methods; no listen() in adapter; no invoke() in channel |
| CRIT-708 | PASS | Svelte 5 runes only; SaveFailureBanner contains 5-layer shadow string and #dd5b00 |
| CRIT-709 | PASS | EC-EDIT-011 PROP-EDIT-011 backspace gating tested |
| CRIT-710 | PASS | EC-EDIT-013 PROP-EDIT-010 divider exact-match tested |
| CRIT-711 | PASS | EC-EDIT-002 PROP-EDIT-013/032 blur-while-saving/switching tested |
| CRIT-712 | PASS | PROP-EDIT-024a/024b/024c branches all have integration tests |
| CRIT-713 | PASS | Fallback path (CRIT-703 + CRIT-706 + tsc clean) satisfied |
| CRIT-714 | PASS | PROP-EDIT-040 per-arm DTO mirroring; priorFocusedBlockId asserted |

## New findings

- **FIND-071** (minor, structural_integrity, route 2c): EditorPanel.handleSnapshot retains a fallback path (lines 129-147) that fabricates a synthetic block from focusedBlockId when the snapshot has no `blocks` field and the focused block is not in viewState.blocks. Self-described in source as "test snapshots that predate RD-021." The spec authorises only the reducer to preserve currentBlocks; it does not authorise the shell to invent blocks. Production-resident test scaffolding — same anti-pattern as FIND-060 in milder form.
- **FIND-072** (minor, edge_case_coverage / test_coverage, route 2a): PROP-EDIT-024a integration test (editor-panel.dom.vitest.ts:247-256) asserts only the immediate negative `dispatchRequestNewNote.toHaveBeenCalledTimes(0)` after the click; never drives the full saving→editing-clean transition to verify the deferred RequestNewNote fires. The "is not dispatched until the snapshot leaves saving" clause of REQ-EDIT-035 is unverified at the integration tier. A regression that re-introduces FIND-065's intent-drop bug would not be caught.

## Strict-mode dimension verdicts

| Dimension | Critical | Major | Minor | Verdict |
|---|---|---|---|---|
| spec_fidelity | 0 | 0 | 0 | PASS |
| implementation_correctness | 0 | 0 | 1 (FIND-072) | PASS |
| structural_integrity | 0 | 0 | 1 (FIND-071) | PASS |
| edge_case_coverage | 0 | 0 | 0 | PASS |
| verification_readiness | 0 | 0 | 0 | PASS |

Strict-mode dimension PASS = zero critical AND zero major. Both new findings are minor and do not block PASS. Overall verdict: **PASS**.

## Phase 5 gate

PASS — Phase 5 (formal hardening) may proceed. The two minor findings (FIND-071, FIND-072) should be cleared during normal Phase 4 routing or as part of Phase 5 hardening backlog; they do not require iteration-3 of adversarial review.
