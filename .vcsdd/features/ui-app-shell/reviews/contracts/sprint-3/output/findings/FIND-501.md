# FIND-501 — CRIT-002 misattributes cross-platform path fix to FIND-402

- Dimension: spec_fidelity
- Category: requirement_mismatch
- Severity: critical
- Route to phase: 1c

## Description

Sprint-3 CRIT-002 description states: "FIND-402: try_vault_path uses
`Path::new(&raw_path).is_absolute()` instead of `raw_path.starts_with('/')` for
cross-platform absolute path validation. Also FIND-401 adds settings_load
command (returns Option<String>) and settings_save_impl helper to lib.rs."

Sprint-2 FIND-402 (verified at
`.vcsdd/features/ui-app-shell/reviews/sprint-2/output/findings/FIND-402.json`)
is about settings persistence in `invoke_configure_vault`, not path validation:

> "invoke_configure_vault validates that the supplied path resolves to a
> directory but does NOT persist the vault path to settings."

The cross-platform `is_absolute()` fix corresponds to sprint-2 FIND-405:

> "try_vault_path uses raw_path.starts_with('/') as the absolute-path check.
> This is Unix-only."

CRIT-002 simultaneously:
- attaches "cross-platform path" to FIND-402 (should be FIND-405)
- attaches "settings_load command addition" to FIND-401 (should be FIND-402)

This is structural mislabeling, not abbreviation. The contract's CRIT-to-finding
traceability is corrupted, which makes the audit trail unreliable.

## Evidence

- `.vcsdd/features/ui-app-shell/contracts/sprint-3.md` lines 13-17 (CRIT-002)
- `.vcsdd/features/ui-app-shell/reviews/sprint-2/output/findings/FIND-402.json`
- `.vcsdd/features/ui-app-shell/reviews/sprint-2/output/findings/FIND-405.json`
