---
id: FIND-601
severity: critical
dimension: spec_fidelity
category: requirement_mismatch
relatedReqs: [REQ-010, REQ-020]
relatedCrits: [CRIT-003, CRIT-018]
routeToPhase: 2b
duplicateOf: null
---

# FIND-601 — Header is NOT rendered in Loading state, violating REQ-020 and CRIT-003

## Citation

- `promptnotes/src/lib/ui/app-shell/AppShell.svelte:55-65` — `<header>` is wrapped in `{#if state === "Configured"}` only.
- `promptnotes/src/lib/ui/app-shell/AppShell.svelte:72-92` — Loading branch renders `<main>` with a skeleton, but **no `<header>`** is present anywhere in the Loading state.
- `behavioral-spec.md` REQ-020 line 485 — "WHILE `AppShellState === 'Loading'` THE SYSTEM SHALL render only the global header shell (without full nav content) and a centered loading affordance."
- `contracts/sprint-3.md` CRIT-003 passThreshold — "AppShell.svelte source renders `<header>` in Loading state (skeleton/empty nav) and Configured state".
- `contracts/sprint-3.md` CRIT-018 — "In Loading state the main area shows only a centered loading affordance alongside the header shell."

## Description

The whole purpose of the sprint-3 rework on FIND-403 was to switch from `aria-hidden`/`inert` toggling to conditional DOM rendering while still satisfying REQ-020 — which explicitly mandates that the global header shell renders during `Loading`. CRIT-003 passThreshold was written to enforce this dual-rendering invariant.

The implementation does the opposite: the conditional render is correctly added, but `<header>` is bound to **only** `Configured`. The Loading branch contains no header element. The phrase in CRIT-018 "alongside the header shell" makes it textually obvious that header presence in Loading is required.

Operationally: while the AppStartup IPC is in-flight (which can take up to PIPELINE_IPC_TIMEOUT_MS = 30000 ms in the worst case, REQ-022), the user sees a skeleton with no header chrome whatsoever — this is a regression versus REQ-020 and breaks the visual continuity the spec demands.

## Suggested remediation

Wrap a stripped-down `<header>` (no nav content) in a separate `{#if state === "Loading" || state === "Configured"}` block, OR render the header above the per-state `{#if}` blocks unconditionally and gate only its inner nav content. Add a static-source-scan test in `startup-error-routing.test.ts` (or `negative-scope.test.ts`) that asserts the AppShell.svelte source contains a `<header>` element inside a conditional that includes the `Loading` state — matching the CRIT-003 / CRIT-018 passThreshold language.
