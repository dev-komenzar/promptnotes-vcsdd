---
id: FIND-022
severity: minor
dimension: verification_readiness
category: spec_gap
targets:
  - "verification-architecture.md §2 tauriEditorAdapter.ts row (line 52)"
  - "verification-architecture.md §2 editorStateChannel.ts row (line 54)"
  - "behavioral-spec.md §10 (line 743)"
  - "behavioral-spec.md §9 RD-011 (line 714)"
introduced_in: iteration-2
---

## Observation

`verification-architecture.md §2` lists two impure shell modules whose responsibilities overlap on the inbound state-event channel:

Line 52 — `tauriEditorAdapter.ts`:

> Concrete implementation of the `EditorIpcAdapter` interface. Wraps Tauri `invoke(...)` calls for outbound commands **and `@tauri-apps/api/event listen(...)` for inbound state events**. ...

Line 54 — `editorStateChannel.ts`:

> Wraps inbound domain state updates. Implements `subscribeToState(handler: (state: EditingSessionState) => void): () => void` by calling `@tauri-apps/api/event listen('editing_session_state_changed', payload => handler(payload.payload.state))`.

Both modules claim to wrap `@tauri-apps/api/event listen('editing_session_state_changed', ...)`. Behavioral-spec.md §10 (lines 740-745) names the channel and says it lives on `EditorIpcAdapter.subscribeToState(handler)`. RD-011 (line 714) says the same.

Three readings are possible:

1. `tauriEditorAdapter.ts` is the concrete `EditorIpcAdapter` and it internally delegates to `editorStateChannel.ts` (composition).
2. `editorStateChannel.ts` is the concrete provider of `subscribeToState` and `tauriEditorAdapter.ts` only handles the outbound `invoke()` side; the §2 line 52 mention of `listen(...)` in the adapter row is a residual/copy-paste error.
3. They are alternative implementations and Phase 2 picks one.

The spec set does not pick.

## Why it fails

Phase 2 will need to author one of: `tauriEditorAdapter.ts`, `editorStateChannel.ts`, or both. The integration test contract (§3 line 116-126, §10 line 749) says tests inject "a hand-rolled mock `EditorIpcAdapter`" — a single object. If both modules exist as separate files, the mock only needs to mock `EditorIpcAdapter`, but the production code path then has two consumers of `@tauri-apps/api/event listen(...)`, which complicates the Phase 5 audit (the §7 grep for `@tauri-apps/api` in shell modules expects exactly the impure-tier modules to import it; auditors must know which file is canonical).

This is minor because the integration test surface is unaffected — but strict mode penalises responsibility ambiguity in module decomposition.

## Concrete remediation

Pick one of the three readings and document it in `verification-architecture.md §2`:

- **Recommended (composition)**: `tauriEditorAdapter.ts` is the sole concrete `EditorIpcAdapter`. It internally imports `editorStateChannel.ts` (or inlines its body — at the author's discretion) to implement `subscribeToState`. Update line 52 to read: "Wraps Tauri `invoke(...)` calls for outbound commands; delegates inbound state subscription to `editorStateChannel.ts` (see line 54)." Update line 54 to read: "Helper module exposed only to `tauriEditorAdapter.ts`; not directly consumed by component code."

- **Alternative (collapse)**: Delete `editorStateChannel.ts` from §2 and fold the `subscribeToState` body directly into `tauriEditorAdapter.ts`. Remove RD-011's reference to a separate channel module; keep only the channel name `editing_session_state_changed`.

Either path also requires updating §8 Threat Model (line 361 — "the sole entry point for all Tauri `invoke(...)` calls from the editor") to clarify whether it is also the sole entry point for inbound `listen(...)` calls.
