# FIND-003: `EditorAction` variant set is not enumerated; CRIT-007 reducer-totality cross-product is open-ended

**Severity**: minor
**Category**: spec_gap
**Dimension**: spec_fidelity
**Location**: `.vcsdd/features/ui-editor/contracts/sprint-1.md` line 79 (§2 types.ts row), lines 36-40 (CRIT-007)

## Issue

`§2 In-Scope Modules` describes `EditorAction` only as "a discriminated union of all actions accepted by the reducer" — without enumerating the variant kinds. The behavioral spec mentions specific action kinds inline (`NoteBodyEdited`, `SaveSuccess`, `SaveFailed`, `BlurEvent`, `DomainSnapshotReceived`), and the `verification-architecture.md §10` section pins the 9-variant **EditorCommand** union but does NOT pin a corresponding closed `EditorAction` union.

CRIT-007 asserts reducer totality "for every (status, action) pair in the cross-product." Without a pinned `EditorAction` variant set, the cross-product is implementation-defined: a fast-check arbitrary covering only a subset of action kinds (e.g., omitting `DomainSnapshotReceived` or `BlurEvent`) would still pass the property test. The contract gives no binary criterion that detects this.

Tier 0 partial mitigation: CRIT-010's `tsc --noEmit --strict --noUncheckedIndexedAccess` enforces an exhaustive switch on `EditorAction`, so once the union is declared, the compiler will require every variant to be handled in the reducer. This catches "implementation drops a variant" but does NOT catch "the property test's `EditorAction` arbitrary fails to enumerate every variant kind".

## Cross-check against verification-architecture.md

verification-architecture.md §3 Tier 0 does say `EditorAction` exhaustive switch is required at compile time, but §10 only enumerates `EditorCommand`. The action union is referenced (§2 editorReducer row, §4 PROP-EDIT-007) without enumeration. The contract inherits this gap.

## Required Remediation

Either:
1. Enumerate the `EditorAction` variant kinds in §2 types.ts (at minimum: `NoteBodyEdited`, `SaveSuccess`, `SaveFailed`, `BlurEvent`, `DomainSnapshotReceived`, plus any UI-event actions for retry/discard/cancel/copy/new-note flows).
2. Or strengthen CRIT-007's pass threshold to require an explicit Set-membership assertion that the fast-check arbitrary covers each declared variant kind at least once during the ≥100 runs (e.g., `expect(observedKinds).toEqual(new Set([...AllEditorActionKinds]))`).

Without one of these, "totality over the cross-product" remains under-specified at the contract level, and the property test's coverage of the action axis depends on Builder discretion.
