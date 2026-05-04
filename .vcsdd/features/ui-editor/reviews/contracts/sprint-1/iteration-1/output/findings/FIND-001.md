# FIND-001: CRIT-001 passThreshold does not bind DomainSnapshotReceived mirroring assertion

**Severity**: major
**Category**: requirement_mismatch
**Dimension**: spec_fidelity
**Location**: `.vcsdd/features/ui-editor/contracts/sprint-1.md` lines 6-10 (CRIT-001 frontmatter), lines 220-228 (CRIT-001 prose section)

## Issue

CRIT-001 claims to cover REQ-EDIT-014 ("State Transitions Are Domain-Driven") with the description text: "DomainSnapshotReceived mirrors snapshot fields directly" and "Covered by PROP-EDIT-001 and PROP-EDIT-008." The §5 Pass Criteria table for CRIT-001 also lists "DomainSnapshotReceived assertions pass 100%" alongside the other action assertions.

However, the authoritative YAML `passThreshold` for CRIT-001 (frontmatter line 10) names only:

> "PROP-EDIT-001 proved: editorReducer.property.test.ts property 'idempotent-dirty' passes ≥100 fast-check runs; editorReducer.test.ts SaveSuccess/SaveFailed/NoteBodyEdited assertions pass 100%. PROP-EDIT-008 proved: editorReducer.property.test.ts property 'referential-transparency' passes ≥100 fast-check runs."

`DomainSnapshotReceived` is absent from the binary pass criterion. Neither PROP-EDIT-001 (`isDirty(body, body) === false`) nor PROP-EDIT-008 (referential transparency: `editorReducer(s,a)` called twice yields deep-equal output) asserts that, for an action of the form `{ kind: 'DomainSnapshotReceived', snapshot }`, the resulting `EditorViewState` has its `status`, `isDirty`, `currentNoteId`, and `pendingNextNoteId` fields equal to the snapshot's corresponding fields.

Consequence: an implementation could handle `DomainSnapshotReceived` as a no-op, return the prior state unchanged, or arbitrarily transform fields, and still satisfy CRIT-001's binary pass threshold. The §5 narrative claim and the YAML claim diverge on what is actually being graded.

## Cross-check against verification-architecture.md

`verification-architecture.md §4` defines proof obligations PROP-EDIT-001..039. None explicitly proves the mirror equality `editorReducer(s, { kind: 'DomainSnapshotReceived', snapshot }).state` ⊇ snapshot fields:

- PROP-EDIT-001: idempotent dirty / SaveSuccess sets isDirty=false — does not cover mirroring.
- PROP-EDIT-007: reducer totality (state defined, status in 5-enum) — does not cover field equality.
- PROP-EDIT-008: referential transparency — does not cover field equality.
- PROP-EDIT-029: REQ-EDIT-014 grep+tsc audit — targets `*.svelte` files (Sprint 2 deferred) and only checks that components don't mutate state directly; does not assert the reducer mirrors correctly.

The mirroring behavior is asserted in `verification-architecture.md §2` editorReducer row prose ("DomainSnapshotReceived { snapshot } → mirror snapshot fields directly") but no PROP pins it.

## Required Remediation

Either:
1. Amend CRIT-001's YAML `passThreshold` to add a concrete assertion: e.g., "editorReducer.test.ts assertion: for any state s and any snapshot S, `editorReducer(s, { kind: 'DomainSnapshotReceived', snapshot: S }).state` has `status === S.status`, `isDirty === S.isDirty`, `currentNoteId === S.currentNoteId`, `pendingNextNoteId === S.pendingNextNoteId` passes 100%."
2. Or add a new CRIT-NNN bound to a new PROP-EDIT (e.g., PROP-EDIT-040 mirror-equality) and adjust weights to keep the sum at 1.00.

Until one of these remediation paths lands, the binary YAML pass criterion does not cover REQ-EDIT-014's mirroring acceptance criterion, and CRIT-001's REQ coverage claim is overstated.
