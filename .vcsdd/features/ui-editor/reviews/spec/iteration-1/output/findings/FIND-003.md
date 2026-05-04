---
id: FIND-003
severity: critical
dimension: spec_fidelity
targets: ["behavioral-spec.md §3.7 REQ-EDIT-025", "behavioral-spec.md §5 EC-EDIT-008", "verification-architecture.md PROP-EDIT-020"]
---

## Observation

REQ-EDIT-025 (`behavioral-spec.md:371-379`) states unconditionally:

> When `RequestNewNote` is dispatched while `EditingSessionState.isDirty === true`, the system shall trigger blur-save semantics first (`TriggerBlurSave { source: 'capture-blur' }`), wait for the domain to process the save (transition from `saving` back), and only then allow the domain's `RequestNewNote` pipeline to create the new note.

EC-EDIT-008 (`behavioral-spec.md:566-570`) describes Ctrl+N pressed while `status === 'save-failed'` (note that in `save-failed` the spec elsewhere asserts `isDirty === true` is retained):

> The UI dispatches `RequestNewNote { source: 'ctrl-N' }` and defers to the domain's state machine response. ... The UI does not independently block the Ctrl+N/Cmd+N dispatch.

These two clauses are mutually exclusive. REQ-EDIT-025 says the UI MUST gate `RequestNewNote` behind a programmatic blur-save when dirty; EC-EDIT-008 says the UI does NOT gate it (dispatches directly) in save-failed (which is a dirty state). PROP-EDIT-020 (`verification-architecture.md:130`) inherits the contradiction by combining both behaviours into one integration property.

## Why it fails

In strict mode this leaves Phase 2 with two incompatible implementations:
- gating implementation: in `save-failed`, the user presses Ctrl+N and nothing visible happens (UI tries blur-save, save fails again, RequestNewNote is suspended); or
- pass-through implementation: in `save-failed`, Ctrl+N dispatches RequestNewNote and the domain decides what to do.

A test suite written from this spec could pass either implementation; the build verifier cannot detect the choice was wrong. This is precisely the ambiguity that strict mode exists to forbid.

## Concrete remediation

Resolve the contradiction explicitly in the behavioral spec. Recommended: amend REQ-EDIT-025 to read "When `RequestNewNote` is dispatched while `EditingSessionState.status === 'editing'` AND `isDirty === true`, ..." (i.e., the blur-save gate applies only in `editing` state). Then add an explicit acceptance criterion to REQ-EDIT-025 and to EC-EDIT-008 stating: "When `status === 'save-failed'`, `RequestNewNote` is dispatched without a preceding `TriggerBlurSave`; the domain's `HandleSaveFailure` workflow owns the resolution." Update PROP-EDIT-020 to encode both branches as separate sub-properties.
