---
sprintNumber: 4
feature: ui-editor
status: approved
negotiationRound: 0
scope: "Phase-3 iter-2 remediation (FIND-014..017): defer NewNoteClicked through pendingNewNoteIntent, ISO-8601 retry-save issuedAt via RetryClicked.payload, broaden idle scheduling to save-failed, route inbound state-channel snapshots through dispatch(DomainSnapshotReceived) so the reducer remains the only producer of EditorViewState."
criteria:
  - id: CRIT-001
    dimension: spec_fidelity
    description: FIND-014 — defer RequestNewNote until domain transitions saving→editing(clean)
    weight: 0.30
    passThreshold: editor-panel.dom.vitest.ts asserts blur immediate, RequestNewNote deferred, save-failed drops intent
  - id: CRIT-002
    dimension: implementation_correctness
    description: FIND-015 — retry-save issuedAt is ISO-8601 from RetryClicked payload
    weight: 0.25
    passThreshold: save-failure-banner.dom.vitest.ts and editorReducer.test.ts assert retry-save command issuedAt matches /\d{4}-\d{2}-\d{2}T/
  - id: CRIT-003
    dimension: edge_case_coverage
    description: FIND-016 — idle scheduling fires in save-failed too
    weight: 0.20
    passThreshold: editor-session-state.dom.vitest.ts asserts timer.scheduleIdleSave called when status=save-failed and user types
  - id: CRIT-004
    dimension: verification_readiness
    description: FIND-017 — inbound snapshots route through dispatch(DomainSnapshotReceived); reducer emits cancel-idle-timer when isDirty=false
    weight: 0.25
    passThreshold: editorReducer.test.ts and editorReducer.prop.test.ts assert cancel-idle-timer emission; editor-session-state.dom.vitest.ts confirms timer.cancel goes through executeCommand
---

# Sprint 4: Phase-3 iter-2 remediation
Apply iter-2 findings (FIND-014..017) per their remediation sections.
target feature tests: pass / regression baseline: pass.
