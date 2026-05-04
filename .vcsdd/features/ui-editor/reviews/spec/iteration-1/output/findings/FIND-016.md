---
id: FIND-016
severity: major
dimension: spec_fidelity
targets: ["behavioral-spec.md §3.4 REQ-EDIT-014", "behavioral-spec.md §1 Scope", "verification-architecture.md §2 tauriEditorAdapter.ts"]
---

## Observation

REQ-EDIT-014 (line 215) says the editor reflects domain-driven `EditingSessionState`. behavioral-spec.md §1 (line 15) says: "This feature consumes existing `EditNoteBody`, `TriggerIdleSave`, `TriggerBlurSave`, `CopyNoteBody`, `RequestNewNote`, `RetrySave`, `DiscardCurrentSession`, and `CancelSwitch` commands verbatim."

These commands are dispatched by the UI to the domain. But the spec does not say how the UI **receives** the resulting `EditingSessionState` updates. RD-003 (line 649) defers Tauri command names but is silent on the **inbound** event channel: how does Rust → TS push the new `EditingSessionState` (e.g., `editing → saving → editing` after a successful save)?

`verification-architecture.md §2 tauriEditorAdapter.ts` (line 40) says it "Wraps Tauri `invoke(...)` calls" — `invoke` is request/response, not pub/sub. To receive state updates the adapter would need to use `@tauri-apps/api/event listen()` or similar. This is not mentioned anywhere.

## Why it fails

Without a documented inbound state-update channel, REQ-EDIT-014 ("the UI re-renders reactively when the store value changes") is ungrounded. Phase 2 must invent: poll? Tauri event listen? A Svelte writable store mutated by a setInterval that calls `invoke('get_state')`? Each choice has different test surfaces.

This also intersects FIND-004 (state ownership). If the domain owns state, the channel-of-truth definition is mandatory.

## Concrete remediation

Add to `verification-architecture.md §2` an `editorStateChannel.ts` (or a clause on `tauriEditorAdapter.ts`) defining: "Inbound `EditingSessionState` updates arrive via `@tauri-apps/api/event listen('editing-session-state-changed', payload)`. The pure tier never observes this; the impure shell stores the latest payload in a single `$state` and the Svelte component reads it. Test contract: integration tests use a hand-rolled mock channel implementing `subscribe(callback)` / `emit(state)`." Update REQ-EDIT-014 acceptance to cite this channel.
