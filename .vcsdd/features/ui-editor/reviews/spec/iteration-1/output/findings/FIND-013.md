---
id: FIND-013
severity: major
dimension: verification_readiness
targets: ["verification-architecture.md §2 editorReducer.ts row", "verification-architecture.md PROP-EDIT-002", "verification-architecture.md PROP-EDIT-009", "behavioral-spec.md §3.8 REQ-EDIT-026"]
---

## Observation

`verification-architecture.md §2` line 29 says `editorReducer.ts` exports `editorReducer(state, action): EditorReducerState` — a state→state pure transition. The same row asserts the impure shell "dispatches commands and applies results".

PROP-EDIT-002 (line 112) and PROP-EDIT-009 (line 119) both say "every save command **produced by `editorReducer`** carries the `source` value passed in by the action payload unchanged." But a state→state reducer does not produce commands — by definition it returns next state. If commands are output, the reducer must return a `(nextState, command[])` tuple or `(nextState, effect[])` — neither is in the §2 signature.

REQ-EDIT-026 (line 384-399) places the `source`-discrimination obligation on the UI layer dispatch site, not on the reducer.

## Why it fails

PROP-EDIT-002 and PROP-EDIT-009 are written against a function signature that does not exist in §2. Phase 2 cannot Red-test "the reducer produces a command with source=X" because the reducer's output type is `EditorReducerState`. Either:
1. The reducer signature is wrong in §2 and must be `editorReducer(state, action): { state: EditorReducerState, effects: SaveCommand[] }`, or
2. PROP-EDIT-002/009 are testing the wrong layer and should target the impure shell (integration tier).

## Concrete remediation

Choose:
- Option A: Update `§2 editorReducer.ts` signature to return effects: `editorReducer(state, action): { nextState: EditorReducerState, effects: readonly EditorEffect[] }` where `EditorEffect = { kind: 'save', command: TriggerIdleSave | TriggerBlurSave }`. Update PROP-EDIT-002/009 to assert against `effects`, not `produced commands`.
- Option B: Move PROP-EDIT-002/009 to the integration tier (and drop their `Required: true` flag), have them assert that the impure shell — when fed the reducer's `nextState` — emits the correct `source` value via the mock `EditorIpcAdapter`.

In either case, restate PROP-EDIT-002/009 with concrete signatures so a property test can be written.
