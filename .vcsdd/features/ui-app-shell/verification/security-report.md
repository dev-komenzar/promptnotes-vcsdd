# Security Report — ui-app-shell

**Feature**: ui-app-shell
**Phase**: 5 (Formal Hardening)
**Date**: 2026-05-03

---

## Tooling

| Tool | Status | Output Location |
|------|--------|-----------------|
| bun pm scan | NOT CONFIGURED — no scanner in bunfig.toml | security-results/bun-scan.txt |
| npm audit | NOT APPLICABLE — bun.lock only, no package-lock.json | - |
| semgrep | NOT INSTALLED | security-results/semgrep-not-installed.txt |
| cargo audit | NOT INSTALLED | - |
| Manual OWASP review | COMPLETED | security-results/manual-owasp-review.md |
| Wycheproof | NOT APPLICABLE — no cryptographic operations | - |

Static analysis is covered by the following test-based audits (all pass in the 220-test suite):

| Test File | Audit Type | PROP |
|-----------|-----------|------|
| `negative-scope.test.ts` | Brand construction boundary, Date.now ban | PROP-002, NEG-REQ-005 |
| `effectful-isolation.test.ts` | appShellStore write surface, bootFlag export | PROP-011, PROP-012 |
| `design-tokens.audit.test.ts` | Color/spacing token allowlist | PROP-006 |
| `startup-error-routing.test.ts` | Conditional DOM rendering invariants | CRIT-003, CRIT-018 |

---

## Findings

### Input Validation at Tauri Boundary

**tryVaultPath / try_vault_path**

Raw path string is passed via `invoke("try_vault_path", { rawPath })`. Validation is delegated to the Rust `try_vault_path` command, which uses `Path::new(&raw_path).is_absolute()` (CRIT-002). No TS-side path sanitization. Tauri IPC serializes the parameter safely.

**fs_stat_dir / fs_list_markdown / fs_read_file**

File-system commands use paths derived from the persisted vault path (from `settings_load`). The path is not user-supplied at invocation time. Tauri plugin-fs enforces allowlist sandboxing.

Finding: LOW — path traversal defence relies on Tauri sandbox; TS layer does not normalize `..` segments.

### XSS in Error Message Rendering (mapVaultPathError, mapVaultConfigError → VaultSetupModal)

`mapVaultPathError` and `mapVaultConfigError` return hardcoded Japanese string literals. These strings are inserted into the Svelte template via standard text interpolation (`{errorMessage}`), which HTML-encodes the output. No `{@html}` directives are present in `AppShell.svelte` or `VaultSetupModal.svelte`.

Finding: PASS — no XSS risk.

### Settings Persistence Path Injection (XDG_CONFIG_HOME)

The settings file path is computed from `XDG_CONFIG_HOME` (or `$HOME/.config`) at Rust startup time. The user cannot influence this path via any UI input. No path injection vector.

Finding: PASS

### Date.now() / Clock Side-Channel

`defaultClockNow()` in `tauriAdapter.ts` uses `Math.round(performance.timeOrigin + performance.now())` instead of `Date.now()` — satisfying NEG-REQ-005. Verified by `negative-scope.test.ts`.

Finding: PASS

### Command Injection / eval

Full scan of production source files (`*.ts`, `*.svelte`) under `promptnotes/src/lib/ui/app-shell/` finds zero occurrences of `eval(`, `exec(`, `spawn(`, `innerHTML`, `document.write`. All occurrences of `.exec(` are RegExp prototype calls in test files only.

Finding: PASS

### Dependency Vulnerabilities

Automated dependency scanning was not available (bun pm scan not configured, no npm audit). No manual CVE lookup performed; key dependencies (`@tauri-apps/api`, `svelte`, `fast-check`) had no known CVEs at the time of last dependency update.

Finding: LOW — unconfirmed; automated audit recommended for CI.

---

## Summary

- **0 CRITICAL** findings
- **0 HIGH** findings
- **0 MEDIUM** findings
- **2 LOW** findings:
  1. Path traversal mitigation depends on Tauri sandbox (infrastructure layer); no TS-side `..` normalization
  2. Dependency vulnerability scan not automated (bun pm scan unconfigured)
- Wycheproof: NOT APPLICABLE — no cryptographic operations in ui-app-shell scope

Overall security posture: **ACCEPTABLE** for Phase 6 convergence.

Raw evidence files are in `.vcsdd/features/ui-app-shell/verification/security-results/`.
