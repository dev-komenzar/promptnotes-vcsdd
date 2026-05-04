---
findingId: FIND-008
severity: major
dimension: spec_fidelity
category: spec_gap
targets:
  - promptnotes/src/lib/editor/EditorPane.svelte:233
  - promptnotes/src/lib/editor/EditorPane.svelte:275-283
---

# FIND-008: REQ-EDIT-009 (`idle` placeholder message) is not rendered

## Spec requirement
behavioral-spec.md REQ-EDIT-009 acceptance criteria:
- "A placeholder message is visible (e.g., 'ノートを選択してください' or similar)."

## Observed
`EditorPane.svelte` renders the same `<textarea>` for every status. In `idle` it sets `readonly` (line 280) but does not render any placeholder text or guidance message. There is no separate "select a note" affordance.

The `<textarea>` element does not even have a `placeholder=` attribute that would satisfy the spec text "編集中ノートなし" / "ノートを選択してください" from ui-fields.md §UI 状態と型の対応.

## Why tests pass anyway
`EditorPane.state-mirror.dom.vitest.ts`'s idle-status sub-suite only asserts `textarea.readOnly || textarea.disabled` is true. It does not assert that any placeholder message is present in the DOM. PROP-EDIT-024 explicitly requires "a placeholder message is present" but no test in the current suite enforces this.

## Required remediation
Add a placeholder element rendered iff `viewState.status === 'idle'` carrying the spec string. Add the corresponding assertion in the missing `editor-session-state.dom.vitest.ts` (FIND-004).
