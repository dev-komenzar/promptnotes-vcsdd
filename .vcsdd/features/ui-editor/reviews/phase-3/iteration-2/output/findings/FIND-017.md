---
findingId: FIND-017
severity: major
dimension: verification_readiness
category: spec_gap
targets:
  - promptnotes/src/lib/editor/types.ts:151
  - promptnotes/src/lib/editor/types.ts:157
  - promptnotes/src/lib/editor/editorReducer.ts:134-157
  - promptnotes/src/lib/editor/EditorPane.svelte:138-142
routeToPhase: "2b"
---

# FIND-017: FIND-007 fix bypasses the reducer — NoteFileSaved/NoteSaveFailed actions and cancel-idle-timer command are dead code at runtime

## Spec / contract requirement

- behavioral-spec.md §3.4a (line 232): "The Rust domain emits transitions. The TypeScript `editorReducer` does NOT author new transitions; it only reflects them into `EditorViewState`."
- verification-architecture.md PROP-EDIT-010 (line 171): "After a `NoteFileSaved` action, `editorReducer` transitions the state such that `state.isDirty === false` and `commands` does not include a re-fire idle-save command. The idle-timer-cancel decision is encoded in the `commands` output as `{ kind: 'cancel-idle-timer' }` (see §10 `EditorCommand` union); **the actual `clearTimeout` call happens in the impure shell reacting to the `commands` array.** The impure shell must handle `{ kind: 'cancel-idle-timer' }` via exhaustive switch (§10 Tier 0 obligation)."
- types.ts:151,157 declare `NoteFileSaved` and `NoteSaveFailed` as live members of the `EditorAction` discriminated union. The reducer's `NoteFileSaved` branch (editorReducer.ts:134-147) emits `[{ kind: 'cancel-idle-timer' }]`.

## Observed runtime path

`EditorPane.svelte:132-156` — the only inbound entry point — subscribes to `stateChannel.subscribe`:

```ts
const unsubscribe = stateChannel.subscribe((state) => {
  const incomingStatus = state.status;
  const prevStatus = previousStatus;

  if (prevStatus === 'saving' && incomingStatus === 'editing' && !state.isDirty) {
    timer.cancel();   // ← direct adapter call, NOT via reducer
  }
  previousStatus = incomingStatus;

  viewState = { status, isDirty, ... };   // ← direct assignment, NOT via reducer
});
```

The subscription:
1. Calls `timer.cancel()` directly when the inbound transition is saving→editing(clean). This bypasses the reducer's `cancel-idle-timer` command.
2. Mutates `viewState` directly via assignment. This bypasses the reducer's `DomainSnapshotReceived` action even though the reducer has a branch for it (editorReducer.ts:118-132).

Consequences:

- **`NoteFileSaved` and `NoteSaveFailed` actions are never produced at runtime.** No code path constructs `{ kind: 'NoteFileSaved', ... }` or `{ kind: 'NoteSaveFailed', ... }`. The 11-variant `EditorAction` union has 2 dead variants. The `editorReducer` totality contract (PROP-EDIT-007) covers them but they are unreachable from the impure shell.
- **`cancel-idle-timer` command is never emitted at runtime.** The reducer's `NoteFileSaved` branch can produce it but the branch never executes. The shell's `executeCommand` `'cancel-idle-timer'` case (EditorPane.svelte:94-96) is a phantom handler.
- **`DomainSnapshotReceived` action is never dispatched at runtime.** The shell directly assigns to `viewState` instead of calling `dispatch({ kind: 'DomainSnapshotReceived', snapshot: state })`. The reducer's mirroring branch (PROP-EDIT-040) is verified by unit tests but not exercised in production.

The §3.4a normative invariant — "`editorReducer` is the only code that produces a new `EditorViewState`" (REQ-EDIT-014 acceptance, line 248) — is structurally violated by the snapshot-bridge's direct assignment.

## Why tests pass anyway

- `editorReducer.test.ts` and `.property.test.ts` exercise the reducer in isolation — they do not require any runtime code path.
- The DOM tests assert observable adapter call counts and DOM presence; they do not introspect whether the path goes through the reducer or not.
- `editor-session-state.dom.vitest.ts:203-233` asserts `timer.cancel` is called on saving→editing(clean), which the direct bridge satisfies just as well as a reducer round-trip would. The test does not verify the reducer was invoked.

## Why this matters for verification readiness

- The reducer claims totality over the 11-action × 5-status grid, but 2 of those 11 actions are now permanently dead code. A future maintainer who removes them (legitimately, since they have no producer) will need to remove the cancel-idle-timer command emission as well, undoing PROP-EDIT-010's encoded design.
- The §3.4a contract — "no Svelte component constructs or mutates an EditingSessionState object" (REQ-EDIT-014 acceptance) — is met for `EditingSessionState` per se but the spirit (state changes go through the reducer) is broken.
- Phase 5's exhaustive-switch audit on `executeCommand` will flag `cancel-idle-timer` as unreachable if any tooling counts edges.

## Required remediation

Pick one consistent design:

**Design A (preferred): route inbound snapshots through the reducer**

```ts
const unsubscribe = stateChannel.subscribe((state) => {
  dispatch({ kind: 'DomainSnapshotReceived', snapshot: state });
  // Reducer's DomainSnapshotReceived branch detects saving→editing(clean) and
  // emits cancel-idle-timer; executeCommand handles it via timer.cancel().
});
```

This requires extending the reducer's `DomainSnapshotReceived` branch to detect the transition (current vs previous state.status) and emit `cancel-idle-timer` accordingly. Alternatively, add explicit `NoteFileSaved` / `NoteSaveFailed` synthetic-action dispatches from the bridge based on the transition diff.

**Design B: remove dead code**

Delete `NoteFileSaved` and `NoteSaveFailed` from the `EditorAction` union and the reducer. Update the `cancel-idle-timer` command's producer comment to acknowledge it is emitted by the snapshot bridge rather than the reducer. Update PROP-EDIT-010 in the spec accordingly.

Either design is acceptable; the current state — typed actions with no producers, command variants emitted by code that never runs — is not.
