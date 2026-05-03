---
id: FIND-604
severity: high
dimension: verification_readiness
category: test_coverage
relatedReqs: [REQ-020]
relatedCrits: [CRIT-003, CRIT-018]
routeToPhase: 2a
duplicateOf: null
---

# FIND-604 — CRIT-003 and CRIT-018 conditional-rendering verification is missing

## Citation

- `contracts/sprint-3.md` CRIT-003 passThreshold — "negative-scope.test.ts or startup-error-routing.test.ts verifies conditional rendering".
- `contracts/sprint-3.md` CRIT-018 passThreshold — "startup-error-routing.test.ts or negative-scope.test.ts asserts main content absent in Loading/UnexpectedError states".
- `promptnotes/src/lib/ui/app-shell/__tests__/startup-error-routing.test.ts:1-177` — five describe blocks, none of which read or assert against `AppShell.svelte` source or rendered DOM.
- `promptnotes/src/lib/ui/app-shell/__tests__/negative-scope.test.ts:108-249` — forbidden-symbol scan only (editor / search / tag-chip / brand-cast patterns); zero `<header>` / `<main>` / `{#if state === "Loading"}` checks.

## Description

The contract specifically nominated which test files must verify the structural conditional-rendering invariant — and neither file actually does so. The 1235-test green count establishes only that the named tests pass, not that the contracted checks exist.

This is the leak that allowed FIND-601 (header missing in Loading) and FIND-602 (main not empty in Loading) to ship green. A reviewer trusting the green log without inspecting the actual test bodies would conclude the rework completed; a static check of test contents shows the rework is unverified.

## Suggested remediation

Add explicit static-source-scan tests in `startup-error-routing.test.ts`:

```ts
import * as fs from "fs";
import * as path from "path";

const SVELTE_FILE = path.resolve(process.cwd(), "src/lib/ui/app-shell/AppShell.svelte");
const src = fs.readFileSync(SVELTE_FILE, "utf-8");

// CRIT-003: header rendered in Loading + Configured
test("CRIT-003: <header> rendered when state === 'Loading'", () => {
  // assert that a {#if ...Loading...} block surrounds a <header> element
  // (regex or block-scope check)
});

test("CRIT-003: <header> NOT rendered when state === 'Unconfigured' or 'StartupError'", () => {
  // ...
});

// CRIT-018: main absent in Loading and UnexpectedError
test("CRIT-018: full main content only inside {#if state === 'Configured'}", () => {
  // ...
});
```

Without these, the contract's declared verification surface is not actually covered.
