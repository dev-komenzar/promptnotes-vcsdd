---
findingId: FIND-001
severity: critical
dimension: spec_fidelity
category: requirement_mismatch
targets:
  - promptnotes/src/lib/editor/editorReducer.ts:228-240
  - promptnotes/src/lib/editor/EditorPane.svelte:201-206
  - promptnotes/src/lib/editor/EditorPane.svelte:153-162
routeToPhase: "2b"
---

# FIND-001: REQ-EDIT-025 blur-save-first gate is absent for `NewNoteClicked`

## Spec requirement
behavioral-spec.md REQ-EDIT-025:
"When `RequestNewNote` is dispatched while `EditorViewState.status === 'editing'` AND `EditorViewState.isDirty === true`, the system shall trigger blur-save semantics first (`TriggerBlurSave { source: 'capture-blur' }`) ... and only then allow the domain's `RequestNewNote` pipeline to create the new note."

The spec further states (RD-009, EC-EDIT-008) that the carve-out for `save-failed` is to dispatch `RequestNewNote` directly without the blur-save preamble. All other states with `isDirty === true && status === 'editing'` MUST emit the blur-save first.

## Observed behaviour
The reducer's `NewNoteClicked` branch (`editorReducer.ts:228-240`) emits exactly one command — `request-new-note` — for every status, including `editing+isDirty=true`. It never emits `trigger-blur-save` first.

The EditorPane.svelte `handleNewNoteClick` (lines 201-206) and the keyboard `attachKeyboardListener` callback (lines 153-162) both call `dispatch({ kind: 'NewNoteClicked', ... })` without inspecting `viewState.status` or `isDirty`. As a result:

- Pressing Ctrl+N while editing a dirty note dispatches only `request-new-note`. No `trigger-blur-save` precedes it.
- Clicking +新規 while editing a dirty note has the same defect.

## Evidence
`editorReducer.ts:228-240` (NewNoteClicked case has no editing+dirty branch):

```ts
case 'NewNoteClicked': {
  const commands: EditorCommand[] = [
    {
      kind: 'request-new-note',
      payload: {
        source: action.payload.source,
        issuedAt: action.payload.issuedAt,
      },
    },
  ];
  return { state, commands };
}
```

## Why tests pass anyway
Sprint 2 has no integration test for PROP-EDIT-020a / PROP-EDIT-020b. `editor-panel.dom.vitest.ts` is missing. `EditorPane.new-note.dom.vitest.ts` only verifies the dispatch goes through; it never asserts the absence of `dispatchTriggerBlurSave` for the `save-failed` carve-out, nor the presence of `dispatchTriggerBlurSave` before `dispatchRequestNewNote` for the `editing+dirty` path.

## Required remediation
- Update `editorReducer` so `NewNoteClicked` in `editing+isDirty=true` returns `commands: [{kind:'trigger-blur-save', ...}, {kind:'request-new-note', ...}]` (or a queued single command, per the chosen design), AND also transitions `state.status` to `'saving'`.
- Add `editor-panel.dom.vitest.ts` with both PROP-EDIT-020a (editing+dirty → blur-save then request-new-note) and PROP-EDIT-020b (save-failed → request-new-note alone) assertions on the mock adapter call order.
