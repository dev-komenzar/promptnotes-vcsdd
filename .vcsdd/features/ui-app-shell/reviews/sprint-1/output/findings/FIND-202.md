---
id: FIND-202
severity: critical
dimension: spec_fidelity
category: requirement_mismatch
relatedReqs: [REQ-009, REQ-014]
relatedProps: [PROP-004]
relatedCrits: [CRIT-004, CRIT-010]
routeToPhase: 2b
---

# FIND-202 — Corrupted-files banner is never rendered in the DOM

## Citation
- `promptnotes/src/lib/ui/app-shell/AppShell.svelte:75-78` — `Configured` branch renders only `<slot />`; no banner element
- `promptnotes/src/lib/ui/app-shell/componentTestIds.ts:1-19` — no `corrupted-files-banner` testid is defined
- `promptnotes/src/lib/ui/app-shell/routeStartupResult.ts:56-62` — produces `showCorruptedBanner: boolean`, but no consumer in any `.svelte` file
- `promptnotes/src/lib/ui/app-shell/__tests__/corrupted-banner.unit.test.ts` — only tests the pure function `shouldShowCorruptedBanner` and the style constants; no DOM assertion

## Description
REQ-009 mandates: "WHEN `InitialUIState.corruptedFiles.length >= 1` THEN the system SHALL render a yellow warning banner within the main feed area" and the AC explicitly requires "バナーは `data-testid="corrupted-files-banner"` を持つ".

The implementation:
1. Does not render any element when `state === 'Configured'` aside from `<slot />`.
2. Has no constant `CORRUPTED_FILES_BANNER_TESTID = "corrupted-files-banner"` and no Svelte template that emits one.
3. Computes `showCorruptedBanner` in `routeStartupResult` but the value is never consumed — `AppShell.svelte` reads only `state` from the store, not the route flags.
4. Does not pass `corruptedFiles.length` to any rendered element; `buildCorruptedBannerMessage(count)` is exported but never called from any component.

CRIT-004 passThreshold demands "corrupted-banner.unit.test.ts REQ-009 AC assertions pass 100%". The current test only verifies pure logic; the AC "the banner is in the DOM with the right testid and a count message" is unverified and unimplemented.

## Suggested remediation
- Add a `<aside data-testid="corrupted-files-banner" role="status">{{ buildCorruptedBannerMessage(corruptedFiles.length) }}</aside>` (or equivalent Svelte block) inside the `Configured` branch of `AppShell.svelte`.
- Surface `corruptedFiles` from `routeStartupResult` (currently only `showCorruptedBanner` boolean is exposed, the count is dropped).
- Add a DOM-mounted test (`@testing-library/svelte`) that asserts the banner appears for length ≥ 1 and is absent for length 0.
