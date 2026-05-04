---
id: FIND-023
severity: minor
dimension: verification_readiness
category: spec_gap
targets:
  - "verification-architecture.md §10 EditorCommand union (lines 400-411)"
  - "verification-architecture.md §2 editorReducer.ts row (line 41)"
  - "behavioral-spec.md REQ-EDIT-001 acceptance (line 71)"
  - "behavioral-spec.md REQ-EDIT-021 acceptance (line 351)"
  - "behavioral-spec.md §10 outbound adapter signatures (lines 731, 734)"
introduced_in: iteration-2 (via FIND-021 remediation)
---

## Observation

The `EditorCommand` discriminated union added to `verification-architecture.md §10` (line 400-411) to resolve iter-2 FIND-021 enumerates 9 variants. Two of them are missing the `noteId` payload field that the wire-boundary dispatch contract requires:

```
| { kind: 'edit-note-body';  payload: { newBody: string; dirty: true } }
| { kind: 'copy-note-body';  payload: { body: string } }
```

Compare with the outbound adapter signatures in `behavioral-spec.md §10` (lines 731, 734):

```
adapter.dispatchEditNoteBody(noteId: string, body: string, issuedAt: string): Promise<void>
adapter.dispatchCopyNoteBody(noteId: string): Promise<void>
```

And the requirement-level acceptance criteria:

- REQ-EDIT-001 (line 71): "The `EditNoteBody` command's `noteId` matches `EditorViewState.currentNoteId`."
- REQ-EDIT-021 (line 351): "Activating the Copy button dispatches `CopyNoteBody` with the current `noteId`."
- §11 Brand Type Construction Contracts (line 769-770): `EditNoteBody.noteId: string` is a required wire field.

For comparison, the save-triggering variants of `EditorCommand` (`'trigger-idle-save'`, `'trigger-blur-save'`, `'retry-save'`, `'discard-current-session'`, `'cancel-switch'`) all carry `noteId` in their payload. Only `'edit-note-body'` and `'copy-note-body'` omit it.

Also missing from `'edit-note-body'`:
- `issuedAt` (per §11 line 770: required ISO-8601 string at the wire boundary).

## Why it fails

`EditorCommand` is the contract between the pure reducer and the impure shell. The shell consumes the union and translates each variant into an outbound `dispatchXxx(...)` call. If the union does not carry `noteId` for `'edit-note-body'` and `'copy-note-body'`, Phase 2 has two unspecified options:

1. The impure shell reads `noteId` from a side channel (e.g., the current `EditorViewState`) when consuming these specific variants — but no spec text instructs it to.
2. The reducer is supposed to inject `noteId` and the union definition is incomplete.

Either reading introduces hidden coupling that PROP-EDIT-007 (totality / typed `commands` array) and PROP-EDIT-008 (referential transparency) cannot expose, because the union definition itself is silent on the field. The Tier 0 exhaustive-switch obligation in §10 (line 425) cannot help — the compiler would happily accept either form because neither field is required by the type.

The same reasoning applies to `'edit-note-body'` and `issuedAt`: the wire dispatch needs an ISO-8601 string, but the reducer is forbidden from calling `Date.now()` (purity boundary §2 forbidden-API list line 31). Phase 2 again has to guess: does the action payload carry `issuedAt`, does the shell inject it on translation, or does the reducer accept `nowMs` as input?

The same defect class as iter-2 FIND-021 (under-specified contract between pure reducer and impure shell), introduced by the very edit that fixed FIND-021.

## Concrete remediation

Pick one and document it explicitly in `verification-architecture.md §10`:

1. **Augment the union** so every variant carries the wire-format payload. Update the union to:
   ```typescript
   | { kind: 'edit-note-body';  payload: { noteId: string; newBody: string; issuedAt: string; dirty: true } }
   | { kind: 'copy-note-body';  payload: { noteId: string; body: string } }
   ```
   Then add a note that the reducer receives `noteId` (and `issuedAt` for actions that need it) in the inbound `EditorAction` payload — clarify in §2 editorReducer row that all `EditorAction` variants carrying side-effect commands include `currentNoteId` and (where needed) `nowMs` / `issuedAt`. Pure modules MUST NOT call `Date.now()`, so `issuedAt` must be supplied by the impure shell on the action.

2. **Document the shell-augmentation pattern**: keep the union as-is and add to §10 (just below line 411): "The impure shell, when consuming `'edit-note-body'` and `'copy-note-body'` variants, augments the dispatch call with `noteId` read from the current `EditorViewState.currentNoteId` and (for `'edit-note-body'`) `issuedAt = new Date().toISOString()`. The reducer never observes these fields." This makes the coupling explicit and reviewable in Phase 5.

Option 1 is cleaner (the union becomes a complete description of the wire dispatch). Option 2 minimizes spec churn but requires a clear note that the shell is responsible for filling in the missing fields.

Either way, also add a Tier 0 obligation: every variant's payload field set must be a strict superset of (or equal to) the `dispatchXxx` adapter signature's parameter set, audited by a structural type assertion in the impure shell (`type _AssertEditNoteBodyShape = EditorCommand & { kind: 'edit-note-body' } satisfies { payload: { noteId: string; ... } }`).
