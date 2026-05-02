# Purity Audit — configure-vault

**Feature**: configure-vault
**Sprint**: 2
**Date**: 2026-05-02
**Source**: `specs/verification-architecture.md` §Purity Boundary Map

---

## Declared Boundaries

From `specs/verification-architecture.md`:

| Sub-step | Function | Classification |
|----------|----------|----------------|
| 1 | `statDir(path)` | Effectful shell — injected port |
| 2 | `mapStatDirResult(result, pathStr)` | Pure core |
| 3 | `settingsSave(path)` | Effectful shell — injected port |
| 4 | `mapSettingsSaveError(fsError, pathStr)` | Pure core |
| 5 | `validateAndTransitionVault(vaultId, path, now)` | Pure core |
| 6 (success only) | `clockNow()` | Effectful (purity-violating) — injected port |
| 7 (success only) | `emit(event)` | Effectful shell — injected port |

Formally verifiable core: `mapStatDirResult`, `mapSettingsSaveError`, `validateAndTransitionVault`.

Effectful shell entry point: `configureVault(deps)(input)` — orchestrates ports via `ConfigureVaultDeps`.

---

## Observed Boundaries

Source inspection of all four implementation files:

### `map-stat-dir-result.ts` — declared pure

- Imports: `Result` (type-only), `FsError` (type-only), `VaultConfigError` (type-only) — no runtime imports
- No `Date.now`, `Math.random`, `process.*`, `new Date`, `globalThis` usage (grep: zero matches)
- No closure over mutable state; no module-level `let`/`var`
- Function takes `(statResult, pathStr)` and returns `Result<void, VaultConfigError>` via pure switch-style branching
- Assessment: pure core boundary holds

### `map-settings-save-error.ts` — declared pure

- Imports: `FsError` (type-only), `VaultConfigError` (type-only) — no runtime imports
- No `Date.now`, `Math.random`, `process.*`, `new Date`, `globalThis` usage (grep: zero matches)
- Single-branch conditional returning `VaultConfigError` from `fsError.kind`
- Assessment: pure core boundary holds

### `validate-and-transition.ts` — declared pure

- Imports: `VaultId`, `VaultPath`, `Timestamp` (type-only) — no runtime imports
- No `Date.now`, `Math.random`, `process.*`, `new Date`, `globalThis` usage (grep: zero matches)
- `_now` parameter is unused in the body (FIND-001 from Phase 3 review: the `_` prefix signals intentional non-use); the function returns a `Ready` vault constructed entirely from `vaultId` and `path`
- No module-level mutable state
- Assessment: pure core boundary holds

### `pipeline.ts` — declared effectful shell

- Imports: `mapStatDirResult`, `mapSettingsSaveError`, `validateAndTransitionVault` (from pure helpers) — no direct I/O imports
- All four ports accessed exclusively through `deps` record: `deps.statDir(...)`, `deps.settingsSave(...)`, `deps.clockNow()`, `deps.emit(...)`
- No `Date.now`, `Math.random`, `process.*`, `new Date`, `globalThis` usage (grep: zero matches) — all time acquisition goes through `deps.clockNow()`
- `clockNow` invocation: line 59 (`const now = deps.clockNow()`), reached only after `settingsSave` returns `Ok` — gated to success path, at most once per invocation
- `emit` invocation: line 73 (`deps.emit(event)`), reached only after `clockNow`, at most once per invocation
- Assessment: effectful shell boundary holds; only port access via `deps`, no ambient effectful calls

### Port access evidence

```
pipeline.ts:46  deps.statDir(pathStr)         // Step 1
pipeline.ts:53  deps.settingsSave(...)         // Step 2
pipeline.ts:59  deps.clockNow()                // Step 3 — success path only
pipeline.ts:73  deps.emit(event)               // Step 6 — success path only
```

No other effectful calls exist in the file.

---

## Summary

Purity boundary holds across all four files. Zero drift detected between the declared boundary map and the observed implementation.

Pure helpers (`mapStatDirResult`, `mapSettingsSaveError`, `validateAndTransitionVault`) contain no ambient global access, no mutable module-level state, and no runtime imports beyond their type contracts.

The effectful shell (`pipeline.ts`) accesses all effects exclusively through the injected `deps` record. The `clockNow` port is invoked at most once and only on the success path (line 59), consistent with the REQ-010 clock-discipline requirement. No hidden side effects or verifier-hostile coupling were found.

**FIND-002 from Phase 3** (validateAndTransitionVault return value discarded at pipeline.ts:62): this does not violate purity. The pure helper is called and its return value is not used, making the call dead code in production. The boundary remains intact — the call does not introduce any side effects. This is a structural finding (dead code) rather than a purity violation. It is retained as-is per the Phase 3 review resolution to preserve the contract that the transition is invoked; remediation is deferred to a follow-up sprint.

**No follow-up required before Phase 6** based on purity-boundary analysis.
