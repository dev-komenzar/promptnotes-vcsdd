---
id: FIND-021
severity: minor
dimension: verification_readiness
category: spec_gap
targets:
  - "verification-architecture.md §2 editorReducer.ts row (line 41)"
  - "verification-architecture.md PROP-EDIT-007 (line 87, line 160)"
  - "verification-architecture.md PROP-EDIT-010 (line 163)"
  - "behavioral-spec.md §9 RD-010 (line 713)"
introduced_in: iteration-2
---

## Observation

The reducer signature in `verification-architecture.md §2` (line 41) is:

> `editorReducer(state: EditorViewState, action: EditorAction): { state: EditorViewState, commands: ReadonlyArray<EditorCommand> }`

PROP-EDIT-007 (line 87, restated at line 160) requires `commands: ReadonlyArray<EditorCommand>` to be returned for every (status, action) pair.

PROP-EDIT-010 (line 163) goes further:

> The idle-timer-cancel decision is encoded in the `commands` output (e.g., a `CancelIdleTimer` command); the actual `clearTimeout` call happens in the impure shell reacting to the `commands` array.

`EditorCommand` is therefore expected to be a discriminated union containing at least:
- A save-triggering variant carrying `source: 'capture-idle' | 'capture-blur'` (per PROP-EDIT-002/009).
- A `CancelIdleTimer` variant (per PROP-EDIT-010).

But neither `verification-architecture.md` nor `behavioral-spec.md §9 RD-010` enumerates the `EditorCommand` discriminated union. The behavioral-spec §10 outbound table (line 728-735) lists the *Tauri-wire* dispatch methods on `EditorIpcAdapter` (e.g., `dispatchTriggerIdleSave`), which are a different layer — the impure shell's translation of `EditorCommand` to wire calls, not the union itself.

Without the union being defined:

1. PROP-EDIT-007's claim "`status` is always one of `'idle' | 'editing' | 'saving' | 'switching' | 'save-failed'`" is enumerable, but its claim that `commands` is `ReadonlyArray<EditorCommand>` is not testable as a property because the kind discriminant set is unspecified.
2. PROP-EDIT-010 references `CancelIdleTimer` only as "(e.g., ...)" — Phase 2 may pick a different name (`ClearIdleTimer`, `CancelTimer`) and integration tests that grep for the literal string would silently disagree.
3. The Tier 0 "exhaustive switch on `EditorAction`" guarantee (§3 Tier 0 line 67) needs a parallel "exhaustive switch on `EditorCommand`" in the impure shell, but the latter isn't defined either.

## Why it fails

`EditorCommand` is the contract between the pure reducer and the impure shell. Strict mode cannot leave a contract unenumerated, especially when at least three PROPs (PROP-EDIT-002, PROP-EDIT-009, PROP-EDIT-010) reference its variants.

## Concrete remediation

Add to `verification-architecture.md §2` (or to behavioral-spec.md §9 as a new RD-015) an explicit enumeration:

```
type EditorCommand =
  | { kind: 'TriggerIdleSave', source: 'capture-idle' }
  | { kind: 'TriggerBlurSave', source: 'capture-blur' }
  | { kind: 'CancelIdleTimer' }
  | { kind: 'ScheduleIdleTimer', fireAt: number }
  | ...  // any other shell-directed effects
```

Then PROP-EDIT-010 should cite `{ kind: 'CancelIdleTimer' }` literally (not "e.g."), and add a Tier 0 entry: "Exhaustive switch on `EditorCommand.kind` in the impure shell — adding a new variant without handling it produces a `never` compile error." Update PROP-EDIT-002/009 to cite the union rather than the unbound `EditorCommand`.
