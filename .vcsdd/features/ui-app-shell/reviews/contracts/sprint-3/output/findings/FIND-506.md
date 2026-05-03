# FIND-506 — CRIT-003 contradicts REQ-020 (Loading-state header rendering)

- Dimension: spec_fidelity
- Category: requirement_mismatch
- Severity: medium
- Route to phase: 1c

## Description

Sprint-3 CRIT-003 description (line 20) states: "Header renders only when
state === Configured." The passThreshold (line 22) requires:

> "AppShell.svelte source contains `{#if state === \"Configured\"}<header>`"

Spec REQ-020 (`behavioral-spec.md` line 485) reads:

> "WHILE AppShellState === 'Loading' THE SYSTEM SHALL render only the global
> header shell (without full nav content) and a centered loading affordance."

The clause "render only the global header shell ... and a centered loading
affordance" enumerates what IS rendered in Loading — the header shell IS
rendered. CRIT-003 mandates the header is NOT rendered in Loading (only when
Configured), which contradicts REQ-020's literal EARS clause.

Cross-checked against the implementation at
`promptnotes/src/lib/ui/app-shell/AppShell.svelte:55` — only `Configured`
renders the header, so the `Loading` state shows no header, violating REQ-020.

The contract is permitting an implementation that diverges from spec EARS while
claiming to satisfy "EARS literally" (CRIT-003 description).

## Evidence

- `.vcsdd/features/ui-app-shell/contracts/sprint-3.md` lines 18-22 (CRIT-003)
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md` line 485 (REQ-020 EARS)
- `promptnotes/src/lib/ui/app-shell/AppShell.svelte` lines 55-65
