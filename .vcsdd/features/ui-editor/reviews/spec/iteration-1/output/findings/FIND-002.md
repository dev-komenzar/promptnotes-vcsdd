---
id: FIND-002
severity: critical
dimension: verification_readiness
targets: ["verification-architecture.md §3 Tier 3", "verification-architecture.md §5 Tooling Map", "verification-architecture.md §7 Phase 5 gate", "promptnotes/package.json"]
---

## Observation

`promptnotes/package.json` (full file read) lists the following dev dependencies:

```
@sveltejs/adapter-static, @sveltejs/kit, @sveltejs/vite-plugin-svelte, @tauri-apps/cli, @types/bun, @vitest/ui, fast-check, jsdom, promptnotes-domain-types, svelte, svelte-check, typescript, vite, vitest
```

There is **no** `@stryker-mutator/core`, `@stryker-mutator/typescript-checker`, `@stryker-mutator/vitest-runner`, or any other Stryker package, yet:

- §3 Tier 3 (lines 77-85) requires Stryker mutation testing on three pure modules with a target score ≥ 80%.
- §5 (lines 192-205) names `promptnotes/stryker.conf.mjs` as a config file and `bunx stryker run` as the run command.
- §7 Phase 5 gate (line 287) makes ≥ 80% Stryker mutation score a hard convergence criterion.

There is also **no** `@testing-library/svelte` and no `axe-core`, even though every PROP-EDIT-012..039 marked `Required: false` cites `@testing-library/svelte` (line 89, line 188, etc.) and PROP-EDIT-033 (line 143) cites `axe-core` for accessibility audit.

## Why it fails

In strict mode, "we'll install it later" is exactly the cop-out the gate exists to catch. ~30 of the 39 PROP-EDIT obligations and one of the four Phase 5 gates depend on toolchains that do not exist in the repo. Phase 2 cannot start the Red phase without `@testing-library/svelte`. Phase 5 cannot run the mutation gate without Stryker. The verification architecture is asserting capabilities the project does not have.

## Concrete remediation

Either:
1. Add explicit setup PROP entries (or a §10 "tool prerequisites" section) listing the exact `bun add -d` invocations and a Phase-2 entry criterion that they must succeed and `package.json` must record the entries before any Red test is written, OR
2. Downgrade Tier 3 (Stryker) from a Phase 5 gate to a non-blocking goal until the tool is installed, and replace `@testing-library/svelte`/`axe-core` references with concrete mock-DOM or contract-test alternatives that use only the currently installed `vitest + jsdom`.

Either path must update `package.json` (or commit a follow-up sprint contract that does) before §7 gates can be claimed achievable.
