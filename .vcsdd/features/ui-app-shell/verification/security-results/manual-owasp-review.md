# Manual OWASP Review — ui-app-shell
Date: 2026-05-03

## Scope

Source files reviewed:
- promptnotes/src/lib/ui/app-shell/tauriAdapter.ts
- promptnotes/src/lib/ui/app-shell/bootOrchestrator.ts
- promptnotes/src/lib/ui/app-shell/vaultModalLogic.ts
- promptnotes/src/lib/ui/app-shell/appShellStore.ts
- promptnotes/src/lib/ui/app-shell/AppShell.svelte
- promptnotes/src/lib/ui/app-shell/VaultSetupModal.svelte
- promptnotes/src/lib/ui/app-shell/errorMessages.ts

---

## A01 - Broken Access Control (Path Traversal)

### try_vault_path / fs_stat_dir / fs_list_markdown / fs_read_file

- `tryVaultPath(rawPath: string)` passes the raw path directly to the Tauri `try_vault_path` command.
- Rust side uses `Path::new(&raw_path).is_absolute()` for cross-platform validation (CRIT-002).
- `fs_stat_dir`, `fs_list_markdown`, `fs_read_file` are Tauri IPC commands backed by `tauri-plugin-fs`.
- Tauri plugin-fs is sandboxed by the `allowlist` in `tauri.conf.json`.
- No path traversal normalization is performed on the TypeScript side — deferred to Rust validation and Tauri sandbox.

Finding: LOW — same infrastructure-layer dependence as app-startup feature. Tauri allowlist provides mitigation; documentation of `..` normalization in Rust layer is recommended for future sprints.

### Settings Persistence (XDG_CONFIG_HOME)

- `settings_load` / `settings_save_impl` use `XDG_CONFIG_HOME` (or `$HOME/.config`) fallback.
- No user-supplied path is used to construct the settings file path (it is fixed at startup).
- No injection vector exists.

Finding: PASS

---

## A02 - Cryptographic Failures

- No cryptographic operations in ui-app-shell scope.
- Wycheproof: NOT APPLICABLE.

Finding: N/A

---

## A03 - Injection (XSS, Command Injection)

### XSS in error message rendering

- `mapVaultPathError` and `mapVaultConfigError` return hardcoded Japanese string literals.
- These are inserted into the DOM via Svelte text interpolation (`{errorMessage}`), NOT via `{@html}`.
- No `@html` usage found anywhere in `AppShell.svelte` or `VaultSetupModal.svelte`.
- Svelte's default template interpolation HTML-encodes text nodes.

Finding: PASS — no XSS risk.

### Command Injection

- No `eval()`, `exec()`, `spawn()`, `Function()`, or `document.write()` calls in production source.
- `innerHTML` and `dangerouslySetInnerHTML` patterns absent.

Finding: PASS

---

## A04 - Insecure Design

- Pure-core / EFFECTFUL / ADAPTER purity boundary enforced by PROP-011 static audit.
- Write access to `appShellStore` restricted to two designated files (PROP-011 proved).
- Boot-flag HMR semantics isolate module state properly (PROP-012 proved).

Finding: PASS

---

## A05 - Security Misconfiguration

- No `process.env` direct reads in app-shell TypeScript source.
- `defaultClockNow()` uses `performance.timeOrigin + performance.now()` — not `Date.now()` — avoiding the NEG-REQ-005 pattern (PROP-002 / CRIT-013).

Finding: PASS

---

## A06 - Vulnerable Components

- Automated dependency scan not available (bun pm scan not configured, no npm audit).
- Key dependencies: `@tauri-apps/api`, `svelte`, `fast-check` (dev).
- No known CVEs identified via manual review of current versions.

Finding: LOW (unconfirmed — automated audit unavailable)

---

## A07 - Identification and Authentication

- Not applicable — desktop app, no authentication layer in scope.

---

## A08 - Software and Data Integrity

- All IPC data comes from the local Tauri process (no external HTTP).
- No remote code execution vectors.

Finding: PASS

---

## A09 - Security Logging and Monitoring

- Out of scope for this sprint.

---

## A10 - Server-Side Request Forgery (SSRF)

- Not applicable — desktop app, no HTTP client in app-shell scope.

---

## Summary

| OWASP Category | Status | Severity |
|----------------|--------|----------|
| A01 Path Traversal | Infrastructure-layer dependency | LOW |
| A02 Cryptographic Failures | N/A | N/A |
| A03 Injection (XSS/Command) | PASS | - |
| A04 Insecure Design | PASS | - |
| A05 Security Misconfiguration | PASS | - |
| A06 Vulnerable Components | Unconfirmed (no auto-scan) | LOW |
| A07 Auth | N/A | N/A |
| A08 Software Integrity | PASS | - |
| A09 Logging | Out of scope | - |
| A10 SSRF | N/A | N/A |

Critical/HIGH findings: 0
Medium findings: 0
Low findings: 2 (path traversal infrastructure dependency, unconfirmed dependency CVEs)
