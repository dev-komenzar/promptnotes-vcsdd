---
findingId: FIND-014
severity: critical
dimension: spec_fidelity
category: requirement_mismatch
targets:
  - promptnotes/src/lib/editor/EditorPane.svelte:163-178
  - promptnotes/src/lib/editor/EditorPane.svelte:237-251
  - promptnotes/src/lib/editor/__tests__/dom/editor-panel.dom.vitest.ts:153
  - promptnotes/src/lib/editor/__tests__/dom/editor-panel.dom.vitest.ts:201
routeToPhase: "2b"
---

# FIND-014: REQ-EDIT-025 acceptance criterion 2 violated — RequestNewNote dispatched synchronously without waiting for domain to leave 'saving'

## Spec requirement

behavioral-spec.md REQ-EDIT-025 acceptance criteria, second bullet (lines 426-427):

> - When "+ 新規" or Ctrl+N/Cmd+N fires while `EditorViewState.status === 'editing'` AND `isDirty === true`, `TriggerBlurSave` is dispatched with `source: 'capture-blur'` before any new-note intent is processed.
> - **`RequestNewNote` is NOT dispatched until the domain transitions away from `saving`.**
> - If `status` becomes `save-failed` before the new note is created, the new-note action is suspended and the save-failure banner is displayed.

verification-architecture.md PROP-EDIT-020a (line 181) reinforces this:

> When `RequestNewNote` is dispatched while `EditorViewState.status === 'editing'` AND `isDirty === true`, `TriggerBlurSave { source: 'capture-blur' }` is dispatched before any new-note intent is processed. **`RequestNewNote` is not dispatched until the domain snapshot transitions out of `saving`.**

The wording is unambiguous: the implementation must serialise blur-save and new-note around an inbound domain snapshot.

## Observed behaviour

`EditorPane.svelte:237-251` (`handleNewNoteClick`):

```ts
function handleNewNoteClick(): void {
  if (viewState.status === 'editing' && viewState.isDirty) {
    const noteId = viewState.currentNoteId ?? '';
    const issuedAt = new Date(clock.now()).toISOString();
    dispatch({
      kind: 'BlurEvent',
      payload: { noteId, body: viewState.body, issuedAt },
    });
  }
  dispatch({
    kind: 'NewNoteClicked',
    payload: { source: 'explicit-button', issuedAt: new Date(clock.now()).toISOString() },
  });
}
```

The keyboard listener at lines 163-178 has the same structure. Both dispatches are synchronous and share a single JS task — there is no `await`, no Promise chain, no `stateChannel` round-trip, and no guard that checks whether the domain has transitioned out of `saving`. Concretely:

1. `dispatch({ kind: 'BlurEvent', ... })` — reducer transitions state to `'saving'`, emits `[trigger-blur-save]`. `executeCommand` calls `adapter.dispatchTriggerBlurSave(...)` synchronously.
2. `dispatch({ kind: 'NewNoteClicked', ... })` — reducer at editorReducer.ts:230-242 has NO status guard; emits `[request-new-note]` regardless. `executeCommand` calls `adapter.dispatchRequestNewNote(...)` synchronously.

The result: both IPC calls are issued to Rust before any save result, in the same microtask, while the local `viewState.status` is `'saving'`. The third acceptance bullet ("If status becomes save-failed before the new note is created, the new-note action is suspended") is unreachable — the new-note action has already been dispatched.

## Why tests pass anyway

`editor-panel.dom.vitest.ts:153` and `:201` explicitly assert the synchronous order:

```ts
expect(callOrder).toEqual(['dispatchTriggerBlurSave', 'dispatchRequestNewNote']);
```

The test was written to match the current implementation's behaviour rather than the spec wording. A correct implementation would have to:

- Queue the new-note intent (e.g., a `pendingNewNoteSource` field on `EditorViewState`) and dispatch `RequestNewNote` only after a subsequent inbound `DomainSnapshotReceived` shows `status` left `'saving'`, OR
- Await a save result from a Promise the adapter returns and only then dispatch `RequestNewNote`.

Either design contradicts the test. This is a textbook test_quality compound: the spec's second acceptance criterion has no test enforcing it; the test that exists actively prevents the correct implementation.

## Required remediation

- Reshape the spec or the implementation to one consistent contract. If the spec is authoritative, then:
  1. Add a `pendingNewNoteSource` (or equivalent) field to `EditorViewState` and have `NewNoteClicked` (in editing+dirty) record the intent without emitting `request-new-note` immediately.
  2. Add a reducer transition that fires `request-new-note` when the domain snapshot transitions `saving → editing` (success) AND `pendingNewNoteSource !== null`.
  3. Add a reducer transition that drops `pendingNewNoteSource` (and shows banner) when the domain transitions `saving → save-failed`.
- Replace the `editor-panel.dom.vitest.ts` test for PROP-EDIT-020a so it asserts:
  - After +新規 click in editing+dirty: `dispatchTriggerBlurSave` IS called; `dispatchRequestNewNote` is NOT called yet.
  - After a subsequent `stateChannel.emit({status:'editing', isDirty:false, ...})`: `dispatchRequestNewNote` IS called.
  - After a subsequent `stateChannel.emit({status:'save-failed', ...})`: `dispatchRequestNewNote` is NOT called and the banner is visible.
