---
findingId: FIND-016
severity: major
dimension: edge_case_coverage
category: test_coverage
targets:
  - promptnotes/src/lib/editor/EditorPane.svelte:194
  - promptnotes/src/lib/editor/__tests__/dom/editor-session-state.dom.vitest.ts:264-296
routeToPhase: "2b"
---

# FIND-016: FIND-013 remediation overcorrected — idle timer no longer scheduled in save-failed state, violating PROP-EDIT-037 / EC-EDIT-003

## Spec / contract requirement

verification-architecture.md PROP-EDIT-037 (line 199):

> In `status === 'save-failed'`, continued textarea input continues to dispatch `EditNoteBody` and the banner remains visible. **The idle debounce timer continues to run (spy on `timerModule.scheduleIdleSave`).** `isDirty` remains `true` in `EditorViewState`.

behavioral-spec.md EC-EDIT-003 (line 581):

> Per REQ-EDIT-013, the textarea remains editable. Each keystroke dispatches `EditNoteBody`, accumulating further dirty content. The `isDirty` flag remains `true`. **The idle debounce timer continues to run.** If `TriggerIdleSave` fires while the state is still `save-failed`, the domain must handle the retry gate — the UI dispatches the command and reflects whatever state the domain returns.

The contract is explicit: in save-failed, scheduleIdleSave must continue to be called on each input so the domain's retry-gate machinery can engage.

## Observed (`EditorPane.svelte:182-212`)

```ts
function handleInput(e: Event): void {
  const textarea = e.currentTarget as HTMLTextAreaElement;
  const noteId = viewState.currentNoteId ?? '';
  const issuedAt = new Date(clock.now()).toISOString();
  dispatch({
    kind: 'NoteBodyEdited',
    payload: { newBody: textarea.value, noteId, issuedAt },
  });
  // FIND-013: only schedule when status === 'editing'
  if (viewState.status === 'editing') {
    const fireAt = clock.now() + IDLE_SAVE_DEBOUNCE_MS;
    timer.scheduleIdleSave(fireAt, () => { ... });
  }
}
```

The FIND-013 fix added the `if (viewState.status === 'editing')` guard at line 194. After the dispatch, `viewState.status` reflects the reducer's transition. The reducer's `NoteBodyEdited` case (editorReducer.ts:39-63) accepts `editing` AND `save-failed` and updates `body`/`isDirty=true` without changing `status`. So in save-failed input:

- `viewState.status` remains `'save-failed'` after dispatch.
- `if (viewState.status === 'editing')` is FALSE.
- `timer.scheduleIdleSave` is NEVER called.

This contradicts PROP-EDIT-037 / EC-EDIT-003.

## Why tests pass anyway

`editor-session-state.dom.vitest.ts:264-296` (the PROP-EDIT-037 test) asserts only:
1. The save-failure banner is visible.
2. The textarea accepts input (`textarea.disabled === false`).
3. `adapter.dispatchEditNoteBody` is called.

It does NOT inspect `timer.scheduleIdleSave` call count despite the spec property mandating it. The spec's "(spy on `timerModule.scheduleIdleSave`)" instruction is omitted from the assertion.

This is also a structural inconsistency with iter-2 FIND-001 fixes. The iter-1 FIND-013 description noted the spec's requirement was the precondition, not "always-schedule"; the fix went too narrow. The reducer accepts NoteBodyEdited in both editing and save-failed (correctly, per the action grammar), but the shell only reschedules the timer in editing.

## Required remediation

- Broaden the guard in `handleInput` to `if (viewState.status === 'editing' || viewState.status === 'save-failed')`. The pre-fire callback at line 197 already protects against firing when state is not editing+dirty, so a stale fire in save-failed is benign (the reducer's IdleTimerFired branch returns no commands when status !== 'editing'+dirty).
- Add to `editor-session-state.dom.vitest.ts` PROP-EDIT-037 test:
  ```ts
  expect(timer.scheduleIdleSave).toHaveBeenCalled();
  ```
  using a real `makeMockTimer()` instance (the current test uses `makeMockTimer()` but never inspects it).
- Optional: also assert the timer's callback dispatches IdleTimerFired and the reducer correctly suppresses the command (defensive test for the retry-gate path).
