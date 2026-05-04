---
findingId: FIND-013
severity: minor
dimension: implementation_correctness
category: test_quality
targets:
  - promptnotes/src/lib/editor/EditorPane.svelte:165-175
  - promptnotes/src/lib/editor/__tests__/dom/EditorPane.body-input.dom.vitest.ts:114-115
---

# FIND-013: `oninput` schedules an idle save unconditionally; `editing+isDirty` precondition is enforced only at fire-time

## Spec requirement
- behavioral-spec.md REQ-EDIT-004 acceptance: "The timer is not started when `EditorViewState.isDirty === false`."

## Observed (`EditorPane.svelte:165-175`)

```ts
function handleInput(e: Event): void {
  const textarea = e.currentTarget as HTMLTextAreaElement;
  const noteId = viewState.currentNoteId ?? '';
  const issuedAt = clock.now().toString();
  dispatch({
    kind: 'NoteBodyEdited',
    payload: { newBody: textarea.value, noteId, issuedAt },
  });
  // Schedule idle save directly (not through timer.scheduleIdleSave)
  scheduleIdleSave();
}
```

`scheduleIdleSave()` is called on every `oninput` regardless of the resulting `viewState.status` or `isDirty`. The pre-fire guard at line 72 (`if (viewState.status === 'editing' && viewState.isDirty)`) blocks the dispatch of `TriggerIdleSave` but the timer itself is still scheduled and clears + re-arms across keystrokes.

The acceptance criterion is violated literally — the timer is started even when `isDirty === false` could plausibly hold (e.g., after an `oninput` that happens because of programmatic textarea reset or a synthetic event that the reducer treats as a no-op due to `state.status !== 'editing'`).

In addition, when `viewState.status === 'idle'` the reducer's `NoteBodyEdited` branch returns the state unchanged (`editorReducer.ts:42-44`) and emits no commands, but the component still schedules an idle save — which will never dispatch (the inner guard catches it) but does waste timer churn and obscures intent.

## Why tests pass anyway
No test asserts on the absence of `setTimeout` calls when status is not `'editing'`. The `EditorPane.idle-save.dom.vitest.ts` test always emits an `editingSnapshot` before the input, so the precondition is incidentally satisfied.

## Required remediation
- Move `scheduleIdleSave()` into the reducer's command output (`{ kind: 'schedule-idle-timer', payload: {...} }` or similar) and let `executeCommand` call it; OR
- Wrap the call in `if (viewState.status === 'editing') scheduleIdleSave();` so the precondition matches the spec.

Combined with FIND-002 (the injected timer should be the scheduling channel), the fix here naturally falls out of routing through the reducer's `commands` pipeline.
