# FIND-502 — CRIT-005 misattributes TS-side orchestration to FIND-405

- Dimension: spec_fidelity
- Category: requirement_mismatch
- Severity: high
- Route to phase: 1c

## Description

Sprint-3 CRIT-005 description: "FIND-405: tauriAdapter.ts invokeAppStartup
orchestrates TS-side pipeline..."

Sprint-2 FIND-405 is the cross-platform absolute-path issue (Unix-only
`starts_with('/')`), not TS-side orchestration. TS-side orchestration is the
natural consequence of removing the Rust `invoke_app_startup` stub — that is
sprint-2 FIND-401's remediation surface, not FIND-405's.

The misattribution leaves the actual cross-platform fix without a clean closure
citation in the contract beyond CRIT-002's misattribution (see FIND-501). Either
CRIT-005 should reference FIND-401 (Rust stub removal forcing TS orchestration)
or the description must explicitly acknowledge that FIND-401's fix produced the
TS orchestration as a derived consequence.

## Evidence

- `.vcsdd/features/ui-app-shell/contracts/sprint-3.md` lines 28-32 (CRIT-005)
- `.vcsdd/features/ui-app-shell/reviews/sprint-2/output/findings/FIND-405.json`
- `.vcsdd/features/ui-app-shell/reviews/sprint-2/output/findings/FIND-401.json`
