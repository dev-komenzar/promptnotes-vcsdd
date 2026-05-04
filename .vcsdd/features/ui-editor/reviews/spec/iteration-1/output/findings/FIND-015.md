---
id: FIND-015
severity: major
dimension: verification_readiness
targets: ["verification-architecture.md PROP-EDIT-015", "verification-architecture.md PROP-EDIT-035", "verification-architecture.md §5 design-token audit"]
---

## Observation

PROP-EDIT-015 (line 125) requires "design-token audit script" + integration test for banner styling. PROP-EDIT-035 (line 145) requires "All hex / rgba / px values ... members of the DESIGN.md §10 Token Reference allow-list" via `scripts/audit-design-tokens.ts`. §5 (line 213) names the audit script and `bun run audit:tokens` as the run command.

The repository has no `promptnotes/scripts/audit-design-tokens.ts` (verified by file listing — the project's `scripts/` folder either does not exist or does not contain that file), and `promptnotes/package.json` does not define an `audit:tokens` script in its `scripts` block (the `scripts` section contains only `dev`, `build`, `preview`, `check`, `check:watch`, `test:dom`, `test:dom:watch`, `tauri`).

Additionally PROP-EDIT-015 asserts assertions like "`box-shadow` exactly matches the 5-layer Deep Shadow string" and "Button typography uses `font-size: 15px; font-weight: 600`". jsdom does not faithfully compute resolved CSS for `box-shadow` of a `<style>`-scoped Svelte rule, especially with CSS variables and Svelte's CSS scoping suffix. Asserting "exactly matches" against `getComputedStyle` in jsdom is known to be fragile.

## Why it fails

(1) The audit script and its npm-script entry point do not exist; PROP-EDIT-035 and the §7 Phase 5 design-token gate (line 291) cannot be executed.
(2) PROP-EDIT-015's `box-shadow` exact-string assertion is testing a value that jsdom does not reliably surface. This is a "test that would pass even if a critical visual bug were unhandled" — exactly the test-quality smell strict mode must flag.

## Concrete remediation

(1) Add an explicit Phase 2 setup PROP requiring the creation of `promptnotes/scripts/audit-design-tokens.ts` (with a stated input: "every `*.svelte` and `*.ts` file under `src/lib/editor/`; output: list of disallowed hex/rgba/px values with file:line"), and a corresponding `package.json` script entry. (2) Replace the runtime `box-shadow` exact-match assertion with a static-source-grep assertion: the audit script greps the Svelte component source for the literal 5-layer shadow string and fails if it is missing or differs. This is testable, deterministic, and doesn't depend on jsdom CSS resolution.
