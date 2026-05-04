---
id: FIND-010
severity: major
dimension: spec_fidelity
targets: ["behavioral-spec.md §3.7 REQ-EDIT-024", "verification-architecture.md §2 keyboardListener.ts row", "behavioral-spec.md §5 EC-EDIT-007"]
---

## Observation

REQ-EDIT-024 (`behavioral-spec.md:355-368`) says:
> When the user presses Ctrl+N (Linux/Windows) or Cmd+N (macOS) **while the editor panel has focus or is within the application window**, the system shall dispatch `RequestNewNote { source: 'ctrl-N' }`.

`verification-architecture.md §2` (line 41) says the listener is implemented via `document.addEventListener('keydown', ...)` — a global listener on the entire SvelteKit document. There is no scoping to "editor panel has focus" or "within the application window".

This matters because:
- A Tauri desktop app's "application window" and "document" are the same thing (no inter-window concern), so "within the application window" is vacuous.
- "Editor panel has focus" implies the listener should NOT fire when, for example, a Settings modal (out-of-scope per §1) has captured focus. With a global `document` listener it WILL fire, and could trigger a `RequestNewNote` while the user is configuring a vault path — an obvious UX defect.
- The acceptance criterion at line 365 reinforces "fires regardless of which element within the editor panel has focus". This conflicts with the implementation choice in `verification-architecture.md §2`.

## Why it fails

REQ-EDIT-024 says the listener is scoped to the editor panel. The verification architecture says it is scoped to the document. These cannot both be true. A test like "press Ctrl+N while Settings modal is open: RequestNewNote MUST/MUST-NOT be dispatched" would assert opposite outcomes depending on which spec sentence is canonical. Strict mode forbids that ambiguity.

## Concrete remediation

Pick one and update both documents to match:
- Option A (recommended for MVP single-window app): Document-level listener with an explicit guard "but suppressed while a modal dialog within the application is open" — and either define a global `isModalOpen` boolean read from `ui-app-shell` or define a Svelte context the listener checks. Add an acceptance criterion: "Ctrl+N while a modal in another feature is open: NOT dispatched."
- Option B: Editor-panel-scoped listener attached via `$effect` to the `EditorPanel.svelte` root element. Update §2 keyboardListener.ts row to say `panelRoot.addEventListener('keydown', ...)` not `document.addEventListener`.

Either way, EC-EDIT-007 and EC-EDIT-008 must explicitly cover the modal-overlap case.
