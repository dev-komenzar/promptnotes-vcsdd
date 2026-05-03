---
id: FIND-603
severity: high
dimension: structural_integrity
category: requirement_mismatch
relatedReqs: [REQ-014, REQ-009]
relatedCrits: []
routeToPhase: 2c
duplicateOf: null
---

# FIND-603 — Duplicate `CORRUPTED_BANNER_STYLES` export hides REQ-014 violation in production rendering

## Citation

- `promptnotes/src/lib/ui/app-shell/designTokens.ts:114-120` — exports `CORRUPTED_BANNER_STYLES` with `fontSize: "14px"` and `border: \`1px solid ${DESIGN_TOKENS.warnColor}\`` (i.e., `1px solid #dd5b00`).
- `promptnotes/src/lib/ui/app-shell/corruptedBanner.ts:18-24` — exports a DIFFERENT `CORRUPTED_BANNER_STYLES` with `fontSize: "16px"` and `border: DESIGN_TOKENS.whisperBorder` (i.e., `1px solid rgba(0,0,0,0.1)`).
- `promptnotes/src/lib/ui/app-shell/AppShell.svelte:10` — imports `CORRUPTED_BANNER_STYLES` from `./designTokens.js` (the spec-wrong one).
- `promptnotes/src/lib/ui/app-shell/__tests__/corrupted-banner.unit.test.ts:124-132` — imports `CORRUPTED_BANNER_STYLES` from `./corruptedBanner` (the spec-correct one) and asserts 16px / whisperBorder.
- `behavioral-spec.md` REQ-014 line 372-382 — banner SHALL be 16px weight 500, `1px solid rgba(0,0,0,0.1)`.

## Description

Two distinct symbols share the same name and live one directory level apart in the same feature. The unit test happens to import the spec-correct one and asserts the right values (so it stays green). The component happens to import the spec-wrong one and ships with the wrong styles to production.

This is a self-defeating test: a developer reading `corrupted-banner.unit.test.ts` would conclude the banner styles match REQ-014. But the banner that actually renders in `AppShell.svelte` uses different values that violate REQ-014 (14px text, 1px solid orange border instead of whisper border). REQ-014 carries forward from sprint-1 unchanged, so this is a regression that no current test will catch.

The structural pattern — two exports, same name, mutually inconsistent, one directory hop apart — is intrinsically fragile. Either symbol could be deleted "as unused" by an automated tool, breaking the other consumer.

## Suggested remediation

1. Delete the `CORRUPTED_BANNER_STYLES` export from `designTokens.ts` (or rename it to something obviously divergent like `CORRUPTED_BANNER_LEGACY_DRAFT`) and have a single source of truth for the corrupted banner style constants.
2. Update `AppShell.svelte` to import `CORRUPTED_BANNER_STYLES` from `./corruptedBanner.js`.
3. Add a static-source-scan test that grep-asserts there is exactly one `export const CORRUPTED_BANNER_STYLES` symbol across the feature directory.
4. Add a regression test that imports `CORRUPTED_BANNER_STYLES` via the same path AppShell.svelte uses and asserts REQ-014 values, so the import-mismatch class of bug is caught next time.
