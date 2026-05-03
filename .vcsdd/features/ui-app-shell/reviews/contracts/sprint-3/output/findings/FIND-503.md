# FIND-503 — CRIT-014 misattributes settings persistence to FIND-401

- Dimension: spec_fidelity
- Category: requirement_mismatch
- Severity: high
- Route to phase: 1c

## Description

Sprint-3 CRIT-014 description: "FIND-401: settings file path uses
XDG_CONFIG_HOME (or fallback $HOME/.config)/promptnotes/settings.json.
settings_load returns Option<String> ... invoke_configure_vault calls
settings_save_impl(&path) after validation to persist vault path."

Sprint-2 FIND-401 is the Rust stub removal (`invoke_app_startup` is hardcoded
`Err(Unconfigured)`), not settings persistence. Sprint-2 FIND-402 explicitly
diagnoses:

> "invoke_configure_vault validates that the supplied path resolves to a
> directory but does NOT persist the vault path to settings."

That is the actual finding being closed by the XDG_CONFIG_HOME / settings_save_impl
work. The contract should attribute this CRIT to FIND-402, not FIND-401.

## Evidence

- `.vcsdd/features/ui-app-shell/contracts/sprint-3.md` lines 73-77 (CRIT-014)
- `.vcsdd/features/ui-app-shell/reviews/sprint-2/output/findings/FIND-401.json`
- `.vcsdd/features/ui-app-shell/reviews/sprint-2/output/findings/FIND-402.json`
