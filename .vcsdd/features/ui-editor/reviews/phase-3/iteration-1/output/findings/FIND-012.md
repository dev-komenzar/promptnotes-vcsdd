---
findingId: FIND-012
severity: minor
dimension: structural_integrity
category: spec_gap
targets:
  - promptnotes/src/lib/editor/EditorPane.svelte:286-303
  - promptnotes/src/lib/editor/EditorPane.svelte:285
---

# FIND-012: New-note and copy buttons lack `aria-disabled` / consistent ARIA wiring

## Spec requirement
- behavioral-spec.md REQ-EDIT-022: "If `Body.isEmptyAfterTrim === true` OR `EditorViewState.status` is one of `idle`, `switching`, `save-failed`, the Copy button shall be rendered in the disabled state: `disabled` HTML attribute, `aria-disabled="true"`...".
- NFR-EDIT-002: "`aria-disabled` is `"true"` on disabled buttons."
- REQ-EDIT-023 acceptance: "The button is `disabled` (and `aria-disabled="true"`) only in `switching` state."

## Observed (`EditorPane.svelte:286-303`)

The Copy button has `aria-disabled={isCopyDisabled ? 'true' : 'false'}` (line 290). Good.

The New Note button at line 296-303 sets only `disabled={isNewNoteDisabled}` and has no `aria-disabled` binding at all. Per NFR-EDIT-002 and REQ-EDIT-023 acceptance criteria, it must carry `aria-disabled="true"` while in `switching` state.

The save-failure banner buttons (Retry / Discard / Cancel) at lines 250-271 have no `aria-disabled` binding and no `aria-label`. While they are not disabled in any state, NFR-EDIT-001 acceptance criteria require descriptive `aria-label` values "when their visible label is insufficient for screen readers" — the labels are short Japanese strings, but the test obligation in PROP-EDIT-033 expects positive ARIA attribute assertions across the whole interactive set.

## Why tests pass anyway
`PROP-EDIT-033` lives in the missing `editor-accessibility.dom.vitest.ts` (FIND-004). The current state-mirror test only checks `disabled === true` on the new-note button and never inspects ARIA attributes.

## Required remediation
- Add `aria-disabled={isNewNoteDisabled ? 'true' : 'false'}` to the New Note button.
- Add ARIA attribute assertions in the missing accessibility test file.
