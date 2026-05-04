---
id: FIND-014
severity: major
dimension: spec_fidelity
targets: ["behavioral-spec.md §3.5 REQ-EDIT-016", "behavioral-spec.md §3.9 REQ-EDIT-027", "verification-architecture.md PROP-EDIT-032", "ui-fields.md §画面 4"]
---

## Observation

REQ-EDIT-016 (lines 244-252) says for `validation.empty-body-on-idle`: "サイレント（破棄パスへ、バナーを表示しない）". REQ-EDIT-027 acceptance line 412-415 expands: "no inline error message is shown; the save silently discards (per REQ-EDIT-016)".

But "save silently discards" has no successor state in the spec. `aggregates.md` state-transition table line 280 has `editing + SelectPastNote(N) かつ note.isEmpty() → editing(N)` (`EmptyNoteDiscarded`). For an idle-save discard with no pending switch, what state does `EditingSessionState` transition to? `idle`? Stays in `editing` with `isDirty=true`? The body becomes empty so future idle saves repeatedly discard?

`workflows.md §Workflow 2 エラーカタログ` (line 276) says "サイレント（破棄パスへ）" but does not specify the post-discard `EditingSessionState`. The behavioral spec inherits this gap silently.

PROP-EDIT-032 (line 142) only asserts "no inline error is shown; the textarea is never `disabled`" — it does not pin down the state transition.

## Why it fails

A user could trim their note to empty whitespace, the idle timer fires, `prepareSaveRequest` returns `empty-body-on-idle`, and the spec gives no answer for what UI state results. Possibilities Phase 2 might pick:
1. Stay in `editing` with `isDirty=true` and immediately re-fire idle on next keystroke (spam).
2. Transition to `idle` (loses session — likely bad UX since the user may type something).
3. Transition to a new state `discarded` not in the 5-status enum (illegal).

## Concrete remediation

Add to REQ-EDIT-016 (or a new acceptance bullet on REQ-EDIT-027) the explicit successor state for `validation.empty-body-on-idle`. Recommended (matching `EmptyNoteDiscarded` semantics in `aggregates.md`): "After `validation.empty-body-on-idle`, `EditingSessionState` transitions to `editing` with `isDirty = false` and the idle debounce timer is cleared. Subsequent `EditNoteBody` dispatches resume the normal cycle." Cite `aggregates.md:280` and `workflows.md §Workflow 2 エラーカタログ`. Add a PROP-EDIT-XXX integration test asserting this transition.
