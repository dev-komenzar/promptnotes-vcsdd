# Iteration-2 Regression Report

## Summary

Iteration-1 produced 13 findings (5 critical, 6 major, 2 minor). Iteration-2 resolved 11 of 13 cleanly, partially resolved 2, and surfaced 4 new defects. Overall verdict: FAIL. The structural rebuild (DI for timer, reducer-driven banner handlers, DOM test files, banner CSS) was thorough; the residual issues are concentrated in the saving-handshake semantics and the inbound-snapshot bridge.

## Iteration-1 finding status

| ID | iter-1 severity | dim | iter-2 status | Note |
|---|---|---|---|---|
| FIND-001 | critical | spec_fidelity | RESOLVED | Blur-save-first gate present at EditorPane.svelte:163-178 (keyboard) and 237-251 (button). Note FIND-014 surfaces a residual asynchrony defect on the same flow. |
| FIND-002 | critical | structural_integrity | RESOLVED | Raw setTimeout block removed; `timer.scheduleIdleSave`/`timer.cancel` used through injected port. PROP-EDIT-034 covered. |
| FIND-003 | critical | structural_integrity | RESOLVED | Banner CSS rewritten with 5-layer Deep Shadow (line 411), border-left:4px solid #dd5b00 (line 409), border-radius:8px, button typography 15px/600, retry #0075de, secondary rgba(0,0,0,0.05). save-failure-banner.dom.vitest.ts grep tests pass. |
| FIND-004 | critical | edge_case_coverage | RESOLVED | All five mandated DOM test files exist with the prescribed PROP-EDIT-XXX coverage. |
| FIND-005 | critical | spec_fidelity | RESOLVED | Banner button labels verbatim per ui-fields.md §画面 4 (再試行 / 変更を破棄 / 閉じる（このまま編集を続ける）); textContent assertions added. |
| FIND-006 | major | implementation_correctness | RESOLVED | Retry/Discard/Cancel handlers now `dispatch({kind:'RetryClicked'|'DiscardClicked'|'CancelClicked'})` through the reducer. |
| FIND-007 | major | implementation_correctness | PARTIAL | Inbound bridge calls `timer.cancel()` on saving→editing(clean). However, NoteFileSaved/NoteSaveFailed actions and `cancel-idle-timer` command emission remain dead code at runtime — see FIND-017. |
| FIND-008 | major | spec_fidelity | RESOLVED | Idle placeholder rendered with data-testid='idle-placeholder' and Japanese string. |
| FIND-009 | major | spec_fidelity | RESOLVED for EditNoteBody / RequestNewNote / TriggerBlurSave; missed for RetryClicked — see FIND-015. |
| FIND-010 | major | implementation_correctness | RESOLVED | Adapter signatures and invoke payloads now carry full noteId/body/issuedAt/source for save commands. Tier 0 type-shape assertions still compile. |
| FIND-011 | major | edge_case_coverage | RESOLVED | Out-of-pane Ctrl+N test now uses sibling element with bubbles:true; properly distinguishes pane-scoped vs document-level listener. |
| FIND-012 | minor | structural_integrity | RESOLVED | `aria-disabled` binding added to New Note button; editor-accessibility.dom.vitest.ts asserts in switching/idle/editing states. |
| FIND-013 | minor | implementation_correctness | PARTIAL | Schedule guard narrowed to status==='editing'. Overcorrected: PROP-EDIT-037 / EC-EDIT-003 require timer to continue running in save-failed — see FIND-016. |

## New iteration-2 findings

| ID | severity | dim | summary |
|---|---|---|---|
| FIND-014 | critical | spec_fidelity | REQ-EDIT-025 acceptance criterion 2 violated. dispatchTriggerBlurSave and dispatchRequestNewNote fire synchronously in the same JS task; spec requires dispatching RequestNewNote only after the domain transitions out of 'saving'. The new editor-panel.dom.vitest.ts asserts the synchronous order, shaping the test to the implementation rather than to the spec. |
| FIND-015 | major | implementation_correctness | editorReducer's RetryClicked branch hard-codes `issuedAt: ''`. Wire-format violation per §10/§11; Rust validation will reject. FIND-009 ISO-8601 remediation missed this branch. |
| FIND-016 | major | edge_case_coverage | FIND-013 fix overcorrected. EditorPane.svelte:194 guards on status==='editing' so save-failed input does not reschedule the timer, contradicting PROP-EDIT-037 / EC-EDIT-003 (idle timer must continue running in save-failed). The PROP-EDIT-037 DOM test does not spy on timer.scheduleIdleSave so the regression is invisible. |
| FIND-017 | major | verification_readiness | FIND-007 fix bypasses the reducer. Inbound snapshot bridge directly assigns viewState and calls timer.cancel() rather than dispatching DomainSnapshotReceived / NoteFileSaved. NoteFileSaved, NoteSaveFailed, cancel-idle-timer, and the DomainSnapshotReceived reducer branch are now permanently dead code at runtime. The §3.4a normative "reducer is the only code that produces a new EditorViewState" is structurally violated. |

## Dimension verdicts

- **spec_fidelity**: FAIL — REQ-EDIT-025 acceptance criterion 2 violated (FIND-014). Most other spec violations from iter-1 (REQ-EDIT-018/019 labels, REQ-EDIT-009 placeholder, §6 ISO-8601) are now resolved.
- **edge_case_coverage**: FAIL — PROP-EDIT-037 / EC-EDIT-003 timer-in-save-failed coverage missing (FIND-016). All five mandated DOM test files now exist (FIND-004 resolved).
- **implementation_correctness**: FAIL — RetryClicked emits `issuedAt: ''` (FIND-015). Banner handlers, idle placeholder, ARIA wiring now correct.
- **structural_integrity**: PASS — Banner CSS rebuilt to NFR-EDIT-005..007 (FIND-003); injected DebounceTimer is sole setTimeout owner (FIND-002); reducer-driven banner handlers (FIND-006). The structural debt from FIND-017 is classified under verification_readiness because it concerns the reducer/runtime contract rather than module decomposition.
- **verification_readiness**: FAIL — Reducer-bypass in the inbound snapshot bridge leaves dead actions and dead commands (FIND-017). PROP-EDIT-040 is verified by unit tests only; runtime path bypasses it. The dead `NoteFileSaved`/`NoteSaveFailed`/`cancel-idle-timer` triple weakens the totality and exhaustive-switch contracts going into Phase 5.

## Recommendations for Phase 4 routing

- FIND-014 → 1a/2b: spec/test/code triple disagreement; resolve by deciding whether the synchronous order is the spec's actual intent (then update spec) or the asynchronous handshake is mandatory (then rewrite test and add reducer state). Spec text is unambiguous on the asynchronous reading.
- FIND-015 → 2b: extend RetryClicked action payload OR augment the shell's executeCommand for retry-save with a fresh ISO-8601 timestamp. Add ISO-8601 regex assertion to the existing retry test.
- FIND-016 → 2b: broaden the handleInput guard to include save-failed; add `expect(timer.scheduleIdleSave).toHaveBeenCalled()` to PROP-EDIT-037 test.
- FIND-017 → 1a + 2b: reducer/runtime contract decision. Either route inbound snapshots through `dispatch({ kind: 'DomainSnapshotReceived', snapshot })` so the reducer can detect transitions and emit cancel-idle-timer (preferred), or remove NoteFileSaved/NoteSaveFailed/cancel-idle-timer from the public action/command surface and update PROP-EDIT-010.
