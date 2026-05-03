# FIND-507 — CRIT-015 evidence-file naming inconsistency

- Dimension: verification_readiness
- Category: verification_tool_mismatch
- Severity: medium
- Route to phase: 1c

## Description

CRIT-015 has an internal inconsistency between its description and its
passThreshold for evidence-file naming.

Description (line 80):

> "Evidence logs sprint-3-red-phase.log, sprint-3-green-phase.log,
> sprint-3-refactor.log all present"

(third file has NO `-phase` suffix)

passThreshold (line 82):

> "Evidence files exist at
> `.vcsdd/features/ui-app-shell/evidence/sprint-3-{red,green,refactor}-phase.log`"

(brace expansion yields `sprint-3-refactor-phase.log` WITH `-phase` suffix)

Actual filesystem state:
- `.vcsdd/features/ui-app-shell/evidence/sprint-3-red-phase.log` ✓ exists
- `.vcsdd/features/ui-app-shell/evidence/sprint-3-green-phase.log` ✓ exists
- `.vcsdd/features/ui-app-shell/evidence/sprint-3-refactor.log` ✓ exists
- `.vcsdd/features/ui-app-shell/evidence/sprint-3-refactor-phase.log` ✗ does
  not exist

A strict literal reading of the brace expansion produces an unsatisfiable
threshold. A lenient reading recovers the description's intent. Either way, the
contract has a falsifiability ambiguity that should be repaired so future
automated gates do not flake.

## Evidence

- `.vcsdd/features/ui-app-shell/contracts/sprint-3.md` lines 78-82 (CRIT-015)
- `.vcsdd/features/ui-app-shell/evidence/` (directory listing)
