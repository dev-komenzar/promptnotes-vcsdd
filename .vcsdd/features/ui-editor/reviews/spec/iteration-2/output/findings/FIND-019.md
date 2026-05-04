---
id: FIND-019
severity: major
dimension: verification_readiness
category: verification_tool_mismatch
targets:
  - "verification-architecture.md §3 Tier 3 (lines 91-101)"
  - "verification-architecture.md §5 Branch coverage (lines 238-253)"
  - "verification-architecture.md §7 Phase 5 gate Branch coverage (line 335)"
  - "promptnotes/package.json"
introduced_in: iteration-2
---

## Observation

`verification-architecture.md §3 Tier 3` (lines 91-101) replaces Stryker with:

> Branch coverage ≥ 95% on pure modules measured by `vitest --coverage` (v8 provider).

§5 (line 240) repeats:

> Config: vitest coverage via v8 provider

§7 Phase 5 gate (line 335):

> ≥ 95% branch coverage on `editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts` as reported by `vitest --coverage --reporter=json`. (Replaces Stryker — not installed.)

Run command (line 249): `bun run test -- --coverage` inside `promptnotes/`.

Vitest 4.x (the installed version per `promptnotes/package.json`: `"vitest": "^4.1.5"`) does NOT bundle a coverage provider. Running `vitest --coverage` requires installing one of:

- `@vitest/coverage-v8` (matching the `provider: 'v8'` configuration the spec names), or
- `@vitest/coverage-istanbul`

Reading `promptnotes/package.json` start-to-end confirms the `devDependencies` block contains: `@sveltejs/adapter-static`, `@sveltejs/kit`, `@sveltejs/vite-plugin-svelte`, `@tauri-apps/cli`, `@types/bun`, `@vitest/ui`, `fast-check`, `jsdom`, `promptnotes-domain-types`, `svelte`, `svelte-check`, `typescript`, `vite`, `vitest`. **Neither `@vitest/coverage-v8` nor `@vitest/coverage-istanbul` is present.**

Invoking `vitest --coverage` without the provider package fails at runtime with `Error: Failed to load url ...@vitest/coverage-v8` (or, depending on Vitest version, with a warning followed by no coverage output). Either way, the gate cannot be executed as written.

## Why it fails

This is the same class of defect that iter-1 FIND-002 raised against Stryker and `@testing-library/svelte` — a gate is named in a hard convergence criterion (Phase 5) with tooling that is not installed. The Builder explicitly removed Stryker in remediation but introduced the equivalent dependency on `@vitest/coverage-v8` without adding it to `package.json`. In strict mode, a Phase 5 gate that cannot be invoked is not a gate.

PROP-EDIT-007/008/010/011/031 and the broader pure-tier verification strategy depend on this branch-coverage gate as the replacement for mutation testing. If the gate is unrunnable, the entire Tier 3 substitution argument (line 253: "the equivalent semantic rigor is provided by fast-check property tests (Tier 2) combined with ≥95% branch coverage") collapses on the second clause.

## Concrete remediation

Pick one and execute before Phase 1c can re-converge:

1. **Add the dependency**: include `"@vitest/coverage-v8": "^4.1.5"` (matching the installed `vitest` major version) in `promptnotes/package.json` `devDependencies`. Add an explicit Phase 2 entry criterion: "`bun install` in `promptnotes/` records `@vitest/coverage-v8` in `bun.lock` before any Red test referencing `--coverage` is written." Update §3 Tier 3 to cite the package name verbatim so future reviewers can grep.

2. **Drop the coverage gate** and rely solely on Tier 2 fast-check property tests for pure-module rigor. Update §3 Tier 3, §5, and §7 Phase 5 gate to remove the `≥95% branch coverage` requirement and reword Tier 3 as "Tier 3 — replaced entirely by fast-check property tests (Tier 2)". Then PROP-EDIT-001..011 must be reviewed to confirm property tests alone cover every branch the would-be coverage gate was intended to catch.

Option 1 is recommended (one `bun add -d` invocation; the existing test scaffolding works as-is). Option 2 is a meaningful reduction of rigor and should not be taken without explicit Convergence-team sign-off.
