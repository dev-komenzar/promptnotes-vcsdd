---
findingId: FIND-010
severity: major
dimension: implementation_correctness
category: spec_gap
targets:
  - promptnotes/src/lib/editor/tauriEditorAdapter.ts:53
  - promptnotes/src/lib/editor/tauriEditorAdapter.ts:55-59
  - promptnotes/src/lib/editor/EditorPane.svelte:91-95
---

# FIND-010: Save commands lose `noteId` / `body` / `issuedAt` between the reducer's command output and the adapter's wire payload

## Spec requirement
- verification-architecture.md §10 EditorCommand union:
  - `'trigger-idle-save'` payload: `{ source: 'capture-idle'; noteId: string; body: string; issuedAt: string }`.
  - `'trigger-blur-save'` payload: `{ source: 'capture-blur'; noteId: string; body: string; issuedAt: string }`.
- behavioral-spec.md §10 outbound dispatches table makes `dispatchTriggerIdleSave` and `dispatchTriggerBlurSave` accept only `source`, but workflows.md §Workflow 2 step 1 (`prepareSaveRequest`) needs `noteId` and `body` to construct a `ValidatedSaveRequest`. The wire payload shape must include them.
- sprint-2.md §2 adapter table: `dispatchTriggerIdleSave(source)` / `dispatchTriggerBlurSave(source)` payload shapes are `{ source: 'capture-idle' }` and `{ source: 'capture-blur' }`. This is internally inconsistent with verification-architecture.md §10.

## Observed
`tauriEditorAdapter.ts:55-59`:

```ts
dispatchTriggerIdleSave(source: 'capture-idle'): Promise<void> {
  return invoke(CMD.triggerIdleSave, { source });
},
dispatchTriggerBlurSave(source: 'capture-blur'): Promise<void> {
  return invoke(CMD.triggerBlurSave, { source });
},
```

`EditorPane.svelte:91-95`:

```ts
case 'trigger-idle-save':
  adapter.dispatchTriggerIdleSave(cmd.payload.source);
  break;
case 'trigger-blur-save':
  adapter.dispatchTriggerBlurSave(cmd.payload.source);
  break;
```

The reducer correctly produces `EditorCommand`s with `source`, `noteId`, `body`, `issuedAt` (verification-architecture.md §10), but the impure shell discards every field except `source` before invoking. Once the Rust backend feature lands and tries to read `noteId` / `body` from the IPC payload, every save will fail.

Similarly `dispatchEditNoteBody` is invoked correctly with all four fields (good), and `dispatchRetrySave`, `dispatchDiscardCurrentSession`, `dispatchCancelSwitch` are all invoked with `{}` payload — but the reducer's output for those carries `noteId` (and for retry-save also `body` / `issuedAt`). Sprint-2 §2 explicitly aligns the adapter payloads with `{}`. The two contracts are at war and the implementation chose the lossy one.

## Why tests pass anyway
- `tauriEditorAdapter.dom.vitest.ts` was authored against the lossy contract from sprint-2 §2; it asserts the empty payload pattern.
- No test reconciles the verification-architecture.md §10 EditorCommand payload contract with the wire payload.

## Required remediation
- Pick one source-of-truth and propagate. Either:
  (a) Update the adapter signatures + invoke payload shapes to include `noteId, body, issuedAt` for save and retry; OR
  (b) Update verification-architecture.md §10 to make the save command payloads `{ source }` only (and rely on the Rust side reading body from a separate channel).
- Update the corresponding adapter unit tests to assert the new shape.

## Note on review classification
This is partly a spec-internal contradiction (sprint-2 §2 vs verification-architecture.md §10), so it cannot be solved by the implementer alone — but the implementer adopted the side that loses information without flagging the conflict, which is itself a finding.
