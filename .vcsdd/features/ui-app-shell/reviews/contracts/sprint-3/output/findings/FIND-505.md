# FIND-505 — Sprint-3 contract lacks explicit prior-sprint inheritance

- Dimension: spec_fidelity
- Category: spec_gap
- Severity: high
- Route to phase: 1c

## Description

Sprint-3 contract does not explicitly inherit unaddressed CRIT coverage from
prior sprints. The strict-mode acceptance criterion requires every
REQ-001..REQ-022 covered in at least one passThreshold OR explicitly stated as
inherited. The contract scope sentence only says "No spec changes" (frontmatter
line 4) — that does not constitute explicit inheritance of prior CRITs.

Concrete coverage gaps in sprint-3 (no CRIT covers, no inheritance stated):
- REQ-009 (corrupted files banner)
- REQ-010 (header style)
- REQ-011 (main area / spacing scale)
- REQ-012 (skeleton)
- REQ-013 (card shadow)
- REQ-014 (corrupted banner style)
- REQ-015 (4-weight typography)
- REQ-018 (modal display ≤ 100ms)
- REQ-019 (color tokens)
- REQ-020 (Loading state header rendering — partially covered only as initial value)

PROPs not in any passThreshold:
- PROP-003 (VaultPathError exhaustiveness)
- PROP-004 (corruptedFiles banner predicate)
- PROP-005 (modal closeable)
- PROP-006 (token audit)
- PROP-007 (5 routing paths)
- PROP-008 (configure-vault after success)
- PROP-009 (scan error → banner only)
- PROP-013 (in-process re-mount)

Without an explicit "sprint-1 CRIT-X and sprint-2 CRIT-Y carry forward
unchanged" clause, a strict reviewer cannot determine whether these REQs are
intentionally re-asserted or silently dropped.

## Evidence

- `.vcsdd/features/ui-app-shell/contracts/sprint-3.md` lines 1-93 (whole contract)
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md` REQ-009 through REQ-020
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md` PROP-003..PROP-013
