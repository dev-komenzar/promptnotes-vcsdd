# FIND-504 — Scope sentence systemically mislabels FIND-401/402/405

- Dimension: spec_fidelity
- Category: requirement_mismatch
- Severity: medium
- Route to phase: 1c

## Description

The sprint-3 contract scope sentence (frontmatter line 4) propagates the same
finding-mislabeling captured in FIND-501..FIND-503:

> "Covers Rust stub removal (FIND-401/402), conditional DOM rendering
> (FIND-403), write authority moved to AppShell.svelte (FIND-404), TS-side
> pipeline orchestration (FIND-405)..."

Sprint-2 review labelled the findings as:
- FIND-401 = Rust stub removal (single finding, NOT joint with 402)
- FIND-402 = settings persistence (NOT a Rust stub)
- FIND-405 = cross-platform absolute path (NOT TS-side orchestration)

Bundling FIND-401/402 under "Rust stub removal" erases the distinct
settings-persistence diagnosis. Routing "TS-side pipeline orchestration" to
FIND-405 contradicts the sprint-2 FIND-405 description.

Because the scope sentence is the contract's executive summary that downstream
gates and humans read first, this systemic mislabeling undermines the contract's
auditability.

## Evidence

- `.vcsdd/features/ui-app-shell/contracts/sprint-3.md` line 4 (scope frontmatter)
- `.vcsdd/features/ui-app-shell/reviews/sprint-2/output/findings/FIND-401.json`
- `.vcsdd/features/ui-app-shell/reviews/sprint-2/output/findings/FIND-402.json`
- `.vcsdd/features/ui-app-shell/reviews/sprint-2/output/findings/FIND-405.json`
