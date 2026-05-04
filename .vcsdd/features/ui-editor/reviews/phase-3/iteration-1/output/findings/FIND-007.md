---
findingId: FIND-007
severity: major
dimension: implementation_correctness
category: spec_gap
targets:
  - promptnotes/src/lib/editor/EditorPane.svelte:62-83
  - promptnotes/src/lib/editor/editorReducer.ts:133-146
  - promptnotes/src/lib/editor/types.ts:148-157
---

# FIND-007: NoteFileSaved/NoteSaveFailed actions are dead code; cancel-idle-timer command never fires; save-success path leaks idle-save timers

## Spec / contract requirement
- behavioral-spec.md REQ-EDIT-005 / aggregates.md:275: `saving + NoteFileSaved → isDirty=false`; the idle debounce timer must be cancelled on save success.
- sprint-1.md CRIT-008 / PROP-EDIT-010: editorReducer emits `{kind:'cancel-idle-timer'}` for `NoteFileSaved`. The impure shell handles `cancel-idle-timer` by calling `clearTimeout`.
- editorReducer.ts:133-146 implements this correctly at the reducer level.

## Observed runtime path
`EditorPane.svelte`'s only inbound entry point is `stateChannel.subscribe(...)` (lines 136-148), which dispatches into `viewState` directly *without going through the reducer* and only consumes `DomainSnapshotReceived`-shaped state. Specifically the `$effect`:

```ts
$effect(() => {
  const unsubscribe = stateChannel.subscribe((state) => {
    viewState = {
      status: state.status, isDirty: state.isDirty, ...
    };
  });
  return unsubscribe;
});
```

Consequences:

1. **`NoteFileSaved` action is never produced.** No code path constructs `{ kind: 'NoteFileSaved', ... }`. Therefore the reducer branch at lines 133-146 — including the `{ kind: 'cancel-idle-timer' }` command — never executes at runtime. PROP-EDIT-010 is verified by unit tests but the property is not active in production.
2. **`NoteSaveFailed` action is also never produced.** Same reason. The save-failed transition is only ever observed via the inbound state snapshot.
3. **The local `idleSaveHandle` (FIND-002) is not cancelled on save success.** Because `executeCommand`'s `cancel-idle-timer` case (line 97-99) maps to the local `cancelIdleSave()` function, but the command is never emitted, the only way the local `idleSaveHandle` is cleared is on a fresh `oninput` (which calls `clearTimeout` at line 66) or on `onblur` (line 78). If the user types, the timer fires, the save succeeds, and the user does not type again, the second `setTimeout` for the next dirty interval (after a fresh edit) is fine — but if the domain reaches `editing` with `isDirty=false` via `DomainSnapshotReceived` and the user has not yet typed, a previously-scheduled timer that pre-dates the save still fires (it is guarded only by the `if (viewState.status === 'editing' && viewState.isDirty)` check at line 72, so the dispatch is suppressed but the timer wakes the event loop unnecessarily). More importantly the design contract — that the reducer emits `cancel-idle-timer` and the shell honours it — is not exercised, so a regression that breaks the guarded check would not be caught.

## Why tests pass anyway
- Sprint 1 unit tests verify the reducer emits `cancel-idle-timer` for `NoteFileSaved`. They do not call into the shell.
- Sprint 2 DOM tests (`EditorPane.idle-save.dom.vitest.ts`) only test the burst-fire path and do not simulate `NoteFileSaved` arriving from anywhere; they observe the snapshot path instead.

## Required remediation
- Either dispatch `NoteFileSaved` / `NoteSaveFailed` from the inbound subscription handler (e.g. by translating snapshot transitions into the corresponding action kind), OR remove `NoteFileSaved` / `NoteSaveFailed` from `EditorAction` and rely entirely on `DomainSnapshotReceived` (and update the reducer accordingly) — the spec / RD-005 supports either design but the current code claims the former while implementing the latter.
- Either way, add a DOM test that asserts: after a snapshot transitions `saving → editing` with `isDirty=false`, the local idle timer is cancelled (spy on `clearTimeout` or `timer.cancel`).
