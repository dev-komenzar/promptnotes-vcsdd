---
id: FIND-011
severity: major
dimension: spec_fidelity
targets: ["behavioral-spec.md §3.4 REQ-EDIT-009", "behavioral-spec.md §3.4 REQ-EDIT-011", "behavioral-spec.md §3.4 REQ-EDIT-012", "behavioral-spec.md §3.4 REQ-EDIT-013"]
---

## Observation

REQ-EDIT-009 (line 158) explicitly states: "The New Note button remains enabled in `idle` state (creating a note is always valid)."

REQ-EDIT-011 (saving), REQ-EDIT-012 (switching), and REQ-EDIT-013 (save-failed) say nothing about the New Note button enable/disable rule. REQ-EDIT-023 (the New Note dispatch) does not say either. REQ-EDIT-025 implies New Note is reachable in any state but does not say the button itself is enabled.

`ui-fields.md §UI 状態と型の対応` (lines 245-251) does not enumerate the New Note button per state — only Copy and Delete columns are listed.

## Why it fails

For four of the five `EditingSessionState.status` values, the spec is silent on whether the New Note button is `disabled`/`aria-disabled`. EC-EDIT-010 says "New Note attempted while state is saving" is dispatched and the editor locks input — implying the button is *enabled* in saving. But the spec never says so. Phase 2 will guess.

## Concrete remediation

Add a single-row table or one acceptance bullet per REQ-EDIT-011/012/013 stating the New Note button enable rule:
- `idle`: enabled (already stated)
- `editing`: enabled
- `saving`: enabled (per EC-EDIT-010 it is reachable; the domain queues the intent)
- `switching`: disabled (input is locked; the user already triggered a switch)
- `save-failed`: enabled (per EC-EDIT-008 the dispatch is allowed; the domain decides)

Or, if simpler, add a single REQ-EDIT-028 "New Note button is always enabled except in `switching` state."
