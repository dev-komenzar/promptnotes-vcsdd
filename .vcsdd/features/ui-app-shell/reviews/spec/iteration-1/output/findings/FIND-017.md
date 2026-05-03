# FIND-017: `appShellStore` and `bootFlag` are classified as EFFECTFUL with no proof obligation guarding their isolation

- **id**: FIND-017
- **severity**: major
- **dimension**: verification_readiness

## citation
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:36` (`appShellStore` (Svelte writable store): "in-memory write — Svelte リアクティビティ")
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:37` (`bootFlag` シングルトン: "in-memory write — 一度限りのフラグ")
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:55-65` (PROP table — no PROP guards the singleton-isolation of `bootFlag`)

## description
The purity-boundary map labels `appShellStore` and `bootFlag` as EFFECTFUL (in-memory writes), but no proof obligation enforces:
- `bootFlag` is module-scoped (i.e., not accidentally re-exported as a top-level mutable that tests can leak across).
- `appShellStore` is only writable through a single, audited entry point (the spec mentions `appShellStore.update()` "only" as the contract, but no PROP enforces it — i.e., `appShellStore.set(...)` from a stray import would silently violate REQ-002 routing).
- HMR reset semantics: when Vite re-imports the module that owns `bootFlag`, does the singleton get rebuilt (allowing a second `invoke_app_startup` call)? This directly affects PROP-001b (FIND-007).

The strict-mode checklist asks "Is the purity boundary map complete and correctly classified (PURE / EFFECTFUL / ADAPTER)?" — the classification is correct, but the boundary contract is unguarded. Strict mode's stronger commitment ("lean toward more requireds than lean") means we should have at least one PROP that protects the singleton invariant.

## suggestedRemediation
Add `PROP-009: appShellStore mutation surface is restricted` — Tier 0 ESLint rule that forbids `appShellStore.set` outside a single audited file (e.g. `app-shell-store.ts`). Add `PROP-010: bootFlag is module-scoped and survives HMR re-mount` — Tier 1 test that imports the module twice via dynamic `import()` and asserts `bootFlag` retains its value (or, if the design intentionally permits HMR reset, declares the consequence on PROP-001b).
