# Security Report — configure-vault

**Feature**: configure-vault
**Sprint**: 2
**Date**: 2026-05-02
**Mode**: lean

---

## Tooling

| Tool | Status | Notes |
|------|--------|-------|
| Semgrep | not installed | `which semgrep` returned no result; recorded as not-applicable in `security-results/semgrep.log` |
| TypeScript strict / svelte-check | ran — 0 errors in configure-vault files | 2 pre-existing errors in `edit-past-note-start` (unrelated feature); configure-vault source files compile cleanly across all 374 files checked |
| Bun test (property harnesses) | PASS — 50 tests, 0 fail | `security-results/` captures test run at `fuzz-results/property-tests.log` |
| Purity grep | PASS — 0 matches | `grep -rn "Date.now|Math.random|process.|new Date|globalThis"` on all 4 configure-vault source files; see `security-results/purity-grep.log` |

Raw outputs:
- `security-results/semgrep.log` — not-applicable record
- `security-results/svelte-check.log` — full svelte-check output (2 errors, none in configure-vault)
- `security-results/purity-grep.log` — grep evidence showing zero ambient global access

---

## Threat Surface Analysis

This domain pipeline does not perform network I/O, shell execution, filesystem reads/writes, or process spawning directly. All side effects are injected as named ports through `ConfigureVaultDeps`. The actual FS access, settings persistence, clock read, and event emission happen entirely at the Tauri command layer (outside this pipeline's scope).

### Path-string handling

`VaultPath` is a branded type. The smart constructor (Rust side, at the Tauri command boundary) rejects empty strings and non-absolute paths before the pipeline is invoked. Inside the pipeline, `pathStr = input.userSelectedPath as unknown as string` is used only as a pass-through argument to the injected `deps.statDir(pathStr)` and as the `path` field in `VaultConfigError`. There is no string interpolation, no shell metacharacter exposure, and no filesystem operation performed by the pipeline itself.

### Event payload construction

`VaultDirectoryConfigured` is constructed from already-validated inputs (`deps.vaultId`, `input.userSelectedPath`, `now`). No string interpolation or dynamic key access is involved. The event payload cannot be poisoned from within the pure pipeline.

### Secret material

No secret material (tokens, passwords, keys) is handled by this pipeline. The vault path is a filesystem path only.

### Wycheproof / cryptographic checks

Not applicable. This pipeline performs no cryptographic operations.

---

## Svelte-Check Results (configure-vault scope)

svelte-check completed with 374 files checked, 2 errors, 0 warnings. Both errors are in `edit-past-note-start` (a different feature, pre-existing type mismatch on `SwitchError`). Zero errors in configure-vault source or test files.

---

## Summary

The configure-vault domain pipeline presents a minimal attack surface. No ambient globals, no direct I/O, no secret handling, no cryptographic operations. All effectful boundaries are injected ports; security responsibility for those ports rests with the Tauri command layer.

**Semgrep**: not installed — recorded as not-applicable. Install with `pip install semgrep` for automated SAST in future sprints.

**TypeScript strict**: all configure-vault files compile cleanly (0 errors, 0 warnings in scope).

**Recommendations for the Tauri command boundary (out of scope for this pipeline)**:
1. Validate `VaultPath` origin — ensure the path originates from the OS folder picker and not from untrusted user-supplied text.
2. Restrict allowed roots if multi-tenant deployment is ever planned.
3. Log `VaultDirectoryConfigured` events with a rate-limit guard to prevent rapid repeated configure calls from flooding the event bus.
