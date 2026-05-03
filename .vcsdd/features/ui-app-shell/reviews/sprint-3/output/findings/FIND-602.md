---
id: FIND-602
severity: high
dimension: spec_fidelity
category: requirement_mismatch
relatedReqs: [REQ-012, REQ-020]
relatedCrits: [CRIT-018]
routeToPhase: 2b
duplicateOf: null
---

# FIND-602 — Loading state renders skeleton cards inside `<main>`, violating "main feed area SHALL be empty"

## Citation

- `promptnotes/src/lib/ui/app-shell/AppShell.svelte:72-92` — Loading branch renders `<main>` with two non-empty `.skeleton-card` divs.
- `behavioral-spec.md` REQ-020 line 485 — "The main feed area SHALL be empty."
- `contracts/sprint-3.md` CRIT-018 passThreshold — "Loading state has a separate skeleton/affordance block; startup-error-routing.test.ts or negative-scope.test.ts asserts main content absent in Loading/UnexpectedError states."

## Description

REQ-020 explicitly forbids main feed content in Loading. Loading is supposed to be a "centered loading affordance" alongside the (also missing per FIND-601) header shell — i.e., a chrome-only loading screen. The current implementation places skeleton cards inside `<main>`, treating Loading as if it were the empty-feed Configured state (REQ-012's territory).

REQ-012 ("WHEN AppShellState === 'Configured' AND the feed has zero notes THEN the system SHALL render an empty feed skeleton placeholder") owns the skeleton card use case. Loading must not duplicate it.

There is also no test asserting "main content absent in Loading/UnexpectedError" as required by CRIT-018 passThreshold — neither `startup-error-routing.test.ts` nor `negative-scope.test.ts` performs a static source scan or DOM-render check for this constraint. So the implementation drift went unnoticed by the green-phase suite.

## Suggested remediation

Move the loading affordance out of `<main>` into a chrome-level region that is sibling to the header shell, OR omit `<main>` from the Loading branch entirely. Add a static-source-scan test in `startup-error-routing.test.ts` that:

1. Reads `AppShell.svelte` source.
2. Asserts the `{#if state === "Loading"}` block does NOT contain a `<main>` element (or contains a `<main>` that is structurally empty).
3. Asserts the `{#if state === "UnexpectedError"}` block does not render the configured-state main content.

This satisfies CRIT-018's passThreshold literal.
