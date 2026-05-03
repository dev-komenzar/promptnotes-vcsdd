---
id: FIND-209
severity: major
dimension: spec_fidelity
category: requirement_mismatch
relatedReqs: [REQ-003, REQ-010, REQ-011, REQ-012]
relatedCrits: [CRIT-003, CRIT-008]
routeToPhase: 2b
---

# FIND-209 — Header / main / skeleton render in states the spec gates them out of; modal does not block background per AC

## Citation
- `promptnotes/src/lib/ui/app-shell/AppShell.svelte:31-39` — `<header>` is rendered for **every** state (no `{#if state === "Configured"}` guard)
- `promptnotes/src/lib/ui/app-shell/AppShell.svelte:42-79` — `<main>` is also unconditional; the conditional only chooses what to show inside it
- REQ-010 / REQ-011 / REQ-012 EARS — all begin with "WHEN `AppShellState === 'Configured'`"
- REQ-003 AC — "バックグラウンドのフィードコンテンツ: DOM に存在するが `aria-hidden="true"` + `inert` 属性で隠蔽"

## Description
1. REQ-010, REQ-011, REQ-012 are conditioned on `AppShellState === 'Configured'`. The implementation renders the header and `<main>` always (regardless of state), and only varies the children. Strictly read, this is divergence: when `state === 'Loading'` or `'UnexpectedError'` the header should not render.
2. REQ-003 mandates that while the modal is open, the background content must be `aria-hidden="true"` and `inert`. `AppShell.svelte` applies neither attribute to the `<header>` or `<main>` while the modal is shown. Keyboard users can still tab to the header content underneath the overlay.
3. REQ-008 requires the inline banner to render only in `UnexpectedError` (banner only, no other UI). The current implementation also renders the (always-on) header alongside the banner. Whether that is acceptable depends on intent, but it is not what the EARS literally says.

Contract CRIT-003 passThreshold "VaultSetupModal renders and blocks interaction" is not actually verified — the modal renders, but the background remains interactable.

## Suggested remediation
- Either (a) add `{#if state === "Configured"}` guards around header / main per the literal EARS, or (b) revise the spec to permit always-on chrome and document this in `behavioral-spec.md`. Decide explicitly and update both sides.
- When `state === "Unconfigured" || state === "StartupError"`, apply `inert` and `aria-hidden="true"` to the chrome (or move the modal into a portal that isolates it).
