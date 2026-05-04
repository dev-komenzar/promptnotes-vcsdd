---
id: FIND-004
severity: critical
dimension: spec_fidelity
targets: ["behavioral-spec.md §3.4 REQ-EDIT-014", "verification-architecture.md §2 editorReducer.ts row", "verification-architecture.md PROP-EDIT-007", "verification-architecture.md PROP-EDIT-008", "behavioral-spec.md §9 RD-005"]
---

## Observation

REQ-EDIT-014 (`behavioral-spec.md:215-222`) asserts:
> The system shall NOT mutate `EditingSessionState` directly from UI event handlers. All state transitions must be driven by domain events: `EditingSessionState` is received as a reactive prop or store read from the domain layer ... No Svelte component in `ui-editor` constructs or mutates an `EditingSessionState` object.

But `verification-architecture.md §2` (line 29) describes `editorReducer.ts` as a *pure UI-layer module* whose signature is `editorReducer(state: EditorReducerState, action: EditorAction): EditorReducerState` and whose role explicitly includes the `editing + NoteBodyEdited → isDirty=true` etc. transitions. PROP-EDIT-007 (line 117) goes further: "`editorReducer(state, action)` returns a defined, well-formed `EditorReducerState` object for every (status, action) pair... `isDirty` is a property of `EditorReducerState` (owned by the pure reducer, not by the Svelte component)".

So the spec says simultaneously:
- (a) the domain layer owns `EditingSessionState` and the UI is read-only against it (REQ-EDIT-014, RD-005), AND
- (b) the UI feature ships a pure reducer that produces a state with the same `status`+`isDirty` shape (PROP-EDIT-007/008, §2).

Either (i) `EditorReducerState` is the same value as `EditingSessionState` and the UI is in fact computing transitions (violating REQ-EDIT-014); or (ii) it is a distinct UI-side projection, in which case the reducer is duplicating domain logic and the spec must say what is duplicated, why, and how the two stay in sync.

## Why it fails

State ownership is the central design decision of an orchestration-only feature. Strict mode cannot accept "Phase 2 will figure out which one we meant". A wrong choice here forks all reducer property tests, banner conditions, and the Tauri adapter contract.

## Concrete remediation

Add a new §3.4a "State Ownership Contract" subsection to `behavioral-spec.md` answering:
1. Is `EditorReducerState` identical to, a strict subset of, or disjoint from `EditingSessionState`?
2. Who emits transitions: the Rust domain (via Tauri events / store push) or the TS reducer?
3. If both, which is authoritative? What invariant guarantees they agree?

Then update `verification-architecture.md §2` editorReducer.ts row to cite that subsection and rename `EditorReducerState` to make the relationship explicit (e.g., `EditorViewState` or `MirroredEditingSessionState`). PROP-EDIT-007 and PROP-EDIT-008 must restate which state is being asserted on.
