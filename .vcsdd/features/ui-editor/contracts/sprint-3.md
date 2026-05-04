---
sprintNumber: 3
feature: ui-editor
status: approved
negotiationRound: 0
scope: "Remediation sprint addressing all 13 Phase-3 iter-1 adversary findings: REQ-EDIT-025 blur-save-first, debounce timer integration via injected DebounceTimer, banner DESIGN.md tokens (5-layer Deep Shadow / #dd5b00 / 8px / 15px-600), banner button label normalization to ui-fields.md §画面 4, banner click → reducer flow, inbound NoteFileSaved/NoteSaveFailed translation, idle-state placeholder, ISO-8601 issuedAt, full-payload adapter wire format per verification-architecture.md §10, ARIA-disabled coverage, isDirty-gated idle scheduling, fixed Ctrl+N out-of-pane test bubbling, and 5 mandated PROP-EDIT-020a/020b/032/033/034/037/038/039 integration tests."
criteria:
  - id: CRIT-001
    dimension: spec_fidelity
    description: "FIND-001: REQ-EDIT-025 blur-save-first when editing+isDirty"
    weight: 0.10
    passThreshold: "editor-panel.dom.vitest.ts:108-147 asserts dispatchTriggerBlurSave is called before dispatchRequestNewNote when status=editing+isDirty=true."
  - id: CRIT-002
    dimension: structural_integrity
    description: "FIND-002: DebounceTimer integration replaces direct setTimeout"
    weight: 0.10
    passThreshold: "EditorPane uses timer.scheduleIdleSave/cancel; computeNextFireAt drives schedule; verified via EditorPane.idle-save.dom.vitest.ts."
  - id: CRIT-003
    dimension: structural_integrity
    description: "FIND-003: banner styling matches DESIGN.md tokens"
    weight: 0.10
    passThreshold: "save-failure-banner.dom.vitest.ts grep checks 5-layer Deep Shadow / #dd5b00 / 8px radius / 15px-600 button typography."
  - id: CRIT-004
    dimension: edge_case_coverage
    description: "FIND-004: 5 missing integration test files added"
    weight: 0.10
    passThreshold: "editor-panel/save-failure-banner/editor-session-state/editor-validation/editor-accessibility .dom.vitest.ts present and passing."
  - id: CRIT-005
    dimension: spec_fidelity
    description: "FIND-005: banner button labels match ui-fields.md §画面 4 verbatim"
    weight: 0.07
    passThreshold: "save-failure-banner.dom.vitest.ts asserts text content '再試行' / '変更を破棄' / '閉じる（このまま編集を続ける）'."
  - id: CRIT-006
    dimension: implementation_correctness
    description: "FIND-006: banner click → reducer (no adapter bypass)"
    weight: 0.07
    passThreshold: "save-failure-banner.dom.vitest.ts asserts dispatch({kind:'RetryClicked'/'DiscardClicked'/'CancelClicked'}) flow."
  - id: CRIT-007
    dimension: implementation_correctness
    description: "FIND-007: inbound state-channel events translate to NoteFileSaved/NoteSaveFailed"
    weight: 0.08
    passThreshold: "editor-session-state.dom.vitest.ts:203-256 saving→editing+isDirty=false fires timer.cancel; saving→save-failed renders banner."
  - id: CRIT-008
    dimension: spec_fidelity
    description: "FIND-008: REQ-EDIT-009 idle-state placeholder rendered"
    weight: 0.05
    passThreshold: "editor-session-state.dom.vitest.ts:135-165 asserts data-testid='idle-placeholder' visible when status=idle."
  - id: CRIT-009
    dimension: implementation_correctness
    description: "FIND-009: issuedAt is ISO-8601 string"
    weight: 0.06
    passThreshold: "editor-validation.dom.vitest.ts:173-243 asserts new Date(clock.now()).toISOString() format."
  - id: CRIT-010
    dimension: implementation_correctness
    description: "FIND-010: adapter forwards full EditorCommand payload (noteId/body/issuedAt/source)"
    weight: 0.10
    passThreshold: "tauriEditorAdapter.dom.vitest.ts asserts each invoke() receives the full payload object per §10."
  - id: CRIT-011
    dimension: edge_case_coverage
    description: "FIND-011: keyboard out-of-pane test uses bubbles:true"
    weight: 0.04
    passThreshold: "EditorPane.new-note.dom.vitest.ts:207 dispatches with bubbles:true via document; the assertion would catch a bug in pane scoping."
  - id: CRIT-012
    dimension: structural_integrity
    description: "FIND-012: ARIA-disabled on +新規 button and banner buttons"
    weight: 0.05
    passThreshold: "editor-accessibility.dom.vitest.ts:141-195 asserts aria-disabled=true|false on disabled+enabled states."
  - id: CRIT-013
    dimension: edge_case_coverage
    description: "FIND-013: idle save not scheduled when isDirty=false"
    weight: 0.04
    passThreshold: "EditorPane.idle-save.dom.vitest.ts:93-133 asserts timer.scheduleIdleSave is not called when input keeps isDirty=false."
  - id: CRIT-014
    dimension: verification_readiness
    description: "Sprint-1 + app-shell regression baselines unchanged"
    weight: 0.04
    passThreshold: "bun test src/lib/editor → 126/126; bun test src/lib/ui/app-shell/__tests__ → 220/220; bun run test:dom -- src/lib/ui/app-shell/__tests__/dom → 4/4."
---

# Sprint 3: ui-editor Phase-3 Remediation

## 1. Sprint Goal
Address all 13 Phase-3 iter-1 adversary findings (5 critical / 6 major / 2 minor) and re-establish convergence so Phase 3 iter-2 returns PASS. No new behavior; no spec changes; reconciliation only.

## 2. Coverage matrix
Each finding maps 1:1 to a CRIT in the YAML above. See `.vcsdd/features/ui-editor/reviews/phase-3/iteration-1/output/findings/FIND-001.md..FIND-013.md` for the original observations and the canonical remediation each CRIT enforces.

## 3. Run commands
```bash
bun test src/lib/editor                          # Sprint 1 pure-core (126/126 frozen)
bun run test:dom -- src/lib/editor/__tests__/dom # Sprint 2 + Sprint 3 DOM + adapter tests
bun test src/lib/ui/app-shell/__tests__          # app-shell regression
bun run test:dom -- src/lib/ui/app-shell/__tests__/dom # app-shell DOM regression
bun run check                                    # svelte-check + tsc
bun run build                                    # vite build sanity
```

## 4. Definition of Done
- All 6 commands pass green.
- Phase 3 iter-2 adversary returns 0 critical + 0 major across all 5 dimensions.
