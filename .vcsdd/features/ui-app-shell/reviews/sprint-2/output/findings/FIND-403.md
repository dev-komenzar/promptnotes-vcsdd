---
id: FIND-403
severity: medium
dimension: spec_fidelity
category: requirement_mismatch
relatedReqs: [REQ-010, REQ-011, REQ-012]
relatedCrits: [CRIT-007]
routeToPhase: 1c
duplicateOf: FIND-209
---

# FIND-403 — Header / main rendered for ALL states; literal EARS divergence on REQ-010/011/012 not resolved

## Citation
- `promptnotes/src/lib/ui/app-shell/AppShell.svelte:42-52` — `<header>` is rendered unconditionally; only `aria-hidden` and `inert` are toggled.
- `promptnotes/src/lib/ui/app-shell/AppShell.svelte:55-106` — `<main>` is rendered unconditionally; the `{#if state === ...}` guards live INSIDE `<main>`.
- `behavioral-spec.md` REQ-010 line 311 — "WHEN `AppShellState === 'Configured'` THEN the system SHALL render a header bar..."
- `behavioral-spec.md` REQ-011 line 327 — "WHEN `AppShellState === 'Configured'` THEN the system SHALL render a main content area..."
- `behavioral-spec.md` REQ-012 line 341 — "WHEN `AppShellState === 'Configured'` AND the feed has zero notes THEN..."

## Description
The Sprint-1 FIND-209 review highlighted two divergences:
1. (a11y) Modal does not block background → fixed in Sprint-2 via `aria-hidden`/`inert`.
2. (literal EARS) Header/main render in non-Configured states → NOT fixed.

The Sprint-2 contract collapsed FIND-209 into CRIT-007 with a passThreshold focused on a11y attributes only. The literal EARS divergence (header rendered while `state === 'Loading'` or `'UnexpectedError'`) was silently dropped from the closure mapping. Per the FIND-209 remediation note: "Decide explicitly and update both sides."

This is partial closure of FIND-209: the a11y impact is mitigated, but the spec-vs-implementation contradiction persists. A reviewer auditing REQ-010 against `AppShell.svelte` will see a header that violates "WHEN state === 'Configured'" reading.

## Suggested remediation
- Either: revise REQ-010, REQ-011, REQ-012 to read "WHEN `AppShellState !== 'Loading'`" or "for all `AppShellState`" with appropriate caveats, plus update the AC list to explicitly permit header rendering during Loading/UnexpectedError.
- Or: wrap `<header>` and `<main>` in `{#if state === "Configured"}` to match the literal EARS — and add Loading/UnexpectedError chrome shells separately.
- Update `behavioral-spec.md` REQ-010..012 explicitly so future audits pass.
