---
findingId: FIND-006
severity: major
dimension: implementation_correctness
category: requirement_mismatch
targets:
  - promptnotes/src/lib/editor/EditorPane.svelte:208-218
  - promptnotes/src/lib/editor/editorReducer.ts:158-209
  - promptnotes/src/lib/editor/types.ts:158-175
---

# FIND-006: Banner Retry / Discard / Cancel handlers bypass the reducer; RetryClicked/DiscardClicked/CancelClicked actions are dead code

## Spec / contract requirement
- behavioral-spec.md §3.4a "Who emits transitions" / §3.5 normative subsection: state transitions for Retry / Discard / Cancel must flow through `editorReducer` to keep the impure shell as a thin executor of the reducer's `commands` output (RD-005, RD-010).
- types.ts declares `RetryClicked`, `DiscardClicked`, `CancelClicked` action variants explicitly produced by the banner; reducer cases at lines 158-209 emit `retry-save`, `discard-current-session`, `cancel-switch` commands and (for Retry) transition `state.status` to `'saving'`.

## Observed (`EditorPane.svelte:208-218`)

```ts
function handleRetryClick(): void {
  adapter.dispatchRetrySave();
}

function handleDiscardClick(): void {
  adapter.dispatchDiscardCurrentSession();
}

function handleCancelClick(): void {
  adapter.dispatchCancelSwitch();
}
```

These three handlers call the adapter directly, bypassing `dispatch(...)`. Consequences:

1. The reducer's `RetryClicked` branch (which transitions `state.status` to `'saving'`) is never triggered. The local `viewState` stays at `'save-failed'` until the next inbound `DomainSnapshotReceived`, breaking the optimistic UI guarantee declared in §3.4a.
2. The Tier 0 / verification-architecture.md §10 exhaustive-switch obligation in the impure shell — that every `EditorCommand` variant be handled — is partially neutered: `retry-save`, `discard-current-session`, `cancel-switch` cases in `executeCommand` (lines 100-108) exist but have no live producers.
3. PROP-EDIT-007 (reducer totality over `RetryClicked`/`DiscardClicked`/`CancelClicked` × all statuses) is asserted at the unit level but the runtime never dispatches these actions, so the property is not exercised in production paths.

## Required remediation
Replace the three direct adapter calls with `dispatch({ kind: 'RetryClicked' })`, `dispatch({ kind: 'DiscardClicked' })`, `dispatch({ kind: 'CancelClicked' })`. The existing `executeCommand` switch already maps each emitted command to the corresponding adapter call.
