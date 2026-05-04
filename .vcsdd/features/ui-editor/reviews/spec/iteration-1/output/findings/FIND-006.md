---
id: FIND-006
severity: major
dimension: verification_readiness
targets: ["verification-architecture.md §3 Integration tier (line 94-95)", "verification-architecture.md PROP-EDIT-024", "verification-architecture.md PROP-EDIT-025", "behavioral-spec.md §3.4 REQ-EDIT-009", "behavioral-spec.md §3.4 REQ-EDIT-010"]
---

## Observation

`verification-architecture.md §3` line 94 lists, under "Notable responsibilities of the integration tier":

> Focus placement on mount (REQ-EDIT-009 placeholder, REQ-EDIT-010 auto-focus).

There is **no** "auto-focus" acceptance criterion in REQ-EDIT-010 (`behavioral-spec.md:170-179`). REQ-EDIT-010's acceptance bullets cover textarea interactivity, the dirty indicator, the Copy button enable rule, and "no spinner / no error banner". Auto-focus on mount is not a stated requirement anywhere in §3 or §4 of the behavioral spec, despite §2 of behavioral-spec.md (Stakeholders) saying "focus must land in the Body textarea automatically".

PROP-EDIT-024 (line 134) says only that the textarea is "readonly or absent from the DOM" in `idle`; it does not assert auto-focus on transition to `editing`. PROP-EDIT-025 (line 135) similarly says nothing about focus.

## Why it fails

Either (a) auto-focus is a real requirement and the persona note in §2 is the canonical source — in which case it must be promoted to a numbered REQ-EDIT and have a PROP, or (b) auto-focus is not a requirement and §3 of verification-architecture.md is asserting coverage of a non-existent REQ. In strict mode, both readings are defects: (a) leaves a behavior unverifiable, (b) misleads the test author into writing tests against a non-spec.

## Concrete remediation

Decide: add a REQ-EDIT-028 "On transition from `idle` to `editing` (or on initial mount when `status === 'editing'`), the Body textarea receives DOM focus exactly once" with a clear acceptance criterion, and add a PROP-EDIT-XXX integration test for it; OR delete the "REQ-EDIT-010 auto-focus" reference in verification-architecture.md §3 line 94.
