---
id: FIND-213
severity: minor
dimension: verification_readiness
category: test_coverage
relatedReqs: [REQ-011]
relatedProps: [PROP-006]
relatedCrits: [CRIT-008, CRIT-015]
routeToPhase: 2a
---

# FIND-213 — PROP-006 spacing audit only matches the first px in compound declarations and skips many properties

## Citation
- `promptnotes/src/lib/ui/app-shell/__tests__/design-tokens.audit.test.ts:247` — `const spacingPattern = /(?:padding|margin|gap|top|left|right|bottom|width|height)\s*:\s*[\d.]+px/g;`
- `promptnotes/src/lib/ui/app-shell/__tests__/design-tokens.audit.test.ts:248` — `const pxValuePattern = /([\d.]+)px/;` (only first match)

## Description
The PROP-006 spacing audit:
1. Matches only `padding | margin | gap | top | left | right | bottom | width | height`. It does NOT match `padding-top`, `padding-bottom`, `margin-left`, `padding-inline`, `border-radius`, `font-size`, `line-height`, `inset`, etc. A non-token `padding-top: 13px` would slip through silently.
2. For compound declarations like `padding: 8px 16px 24px 32px`, the regex's first capture only catches `8px`. The remaining values (16, 24, 32) are not validated.
3. The regex tolerates floating-point values without bounding (e.g. `padding: 13.5px` would parse `13.5` and miss the allowlist, but no test verifies the audit catches that).

Combined with the test coverage gap: nothing in the existing test set drops a non-token spacing value into a Svelte file to confirm the audit would actually fail. The audit is therefore unverified to be effective ("does the audit catch a violation?" has no positive test case).

NFR-07 lists `[2, 3, 4, 5, 5.6, 6, 6.4, 7, 8, 11, 12, 14, 16, 24, 32]`. CRIT-015 demands "no spacing value outside permitted scale detected by audit". The audit's narrow regex makes that claim weaker than advertised.

## Suggested remediation
- Broaden the property list (`padding(-(top|right|bottom|left|inline|block))?`, `margin(-...)?`, `border-radius`, `inset`, `gap`, `column-gap`, `row-gap`, plus shorthand `padding`/`margin` parsed multi-value).
- After matching a property, scan ALL `\d+(?:\.\d+)?px` tokens within its value, not just the first.
- Add a self-test: write a fixture file with a known bad value (e.g., `padding: 13px`), run the audit logic against it, and assert it reports a violation. This guards against regression of the audit itself.
