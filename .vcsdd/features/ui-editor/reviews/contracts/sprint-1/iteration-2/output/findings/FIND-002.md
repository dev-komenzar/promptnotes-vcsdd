# FIND-002: PROP-EDIT-040 referenced by CRIT-012 but not declared in verification-architecture.md §4

**Severity**: minor
**Category**: spec_gap
**Dimension**: verification_readiness
**Location**: `.vcsdd/features/ui-editor/contracts/sprint-1.md` lines 64-65 (CRIT-012 frontmatter), line 70 (introduction prose), line 147 (§4 test plan), line 172 (§5 pass criteria), lines 386, 389 (CRIT-012 prose); cross-referenced against `.vcsdd/features/ui-editor/specs/verification-architecture.md` §4 (PROP-EDIT table ends at PROP-EDIT-039)

## Issue

Iter-1 FIND-001 was remediated by introducing a new CRIT-012 bound to a new proof obligation, `PROP-EDIT-040` (snapshot-mirror equality). The contract references PROP-EDIT-040 in five locations:

- Frontmatter `criteria[].id: CRIT-012` (line 64-65): "Covered by a dedicated deterministic unit test and a fast-check property test."
- §4 test plan (line 147): "PROP-EDIT-040 (snapshot mirroring is identity over state fields — property 'snapshot mirroring is identity over state fields' passes ≥100 fast-check runs)"
- §5 pass criteria (line 172): "CRIT-012 | REQ-EDIT-014 / PROP-EDIT-040"
- §CRIT-012 prose (lines 386-389): "PROP-EDIT-040 (snapshot-mirror equality, introduced by FIND-001 remediation — two proof obligations…)"

However, `verification-architecture.md §4 Proof Obligations` (the authoritative PROP-EDIT registry) ends at PROP-EDIT-039. PROP-EDIT-040 has no row in that table, no PROP statement, no Tier assignment, and no `Required: true/false` flag.

Worse, the contract's own §1 introduction (line 70) explicitly states the PROP range as `PROP-EDIT-001..039, including 020a/020b`:

> "...derived from REQ-EDIT-001..REQ-EDIT-016, REQ-EDIT-022, REQ-EDIT-026, EC-EDIT-001..EC-EDIT-002, EC-EDIT-006, and PROP-EDIT-001..PROP-EDIT-011 as defined in `specs/behavioral-spec.md` (REQ-EDIT-001..027, EC-EDIT-001..010, RD-001..019) and `specs/verification-architecture.md` (PROP-EDIT-001..039, including 020a/020b)."

This contradicts the new CRIT-012 reference to PROP-EDIT-040. The contract introduces a proof obligation it claims is "defined in" verification-architecture.md but is in fact not present there.

## Cross-check against §8 Sprint Adversary Review Targets

§8 item 2 explicitly demands:
> "Every PROP-EDIT-XXX with `Required: true` in `verification-architecture.md §4` that belongs to the pure tier (Tier 1 or Tier 2) is cited in at least one CRIT-NNN pass threshold..."

The reverse direction — that every CRIT-cited PROP-EDIT-XXX must exist in `verification-architecture.md §4` — is not stated explicitly but is the natural symmetric obligation of the traceability matrix. Without it, the contract can mint PROP IDs that have no anchor in the verification spec.

## Required Remediation

Either:
1. Add a PROP-EDIT-040 row to `verification-architecture.md §4` with the property statement `editorReducer(s, { kind: 'DomainSnapshotReceived', snapshot: S }).state` mirrors `S.status / isDirty / currentNoteId / pendingNextNoteId` exactly, Tier 1+2, Tool: vitest + fast-check, Required: true, Pure-or-Shell: pure. Then update contract §1 line 70 to read `PROP-EDIT-001..040` (or `..039 plus 040`).

2. Or rebind CRIT-012 to an existing PROP-EDIT (e.g., extend PROP-EDIT-008's referential-transparency statement to include the snapshot-mirror corollary, and rebind CRIT-012 to PROP-EDIT-008). Update the contract accordingly.

Without one of these, PROP-EDIT-040 is a phantom ID: cited but not defined, and the contract's PROP traceability against the authoritative verification spec is one PROP short of complete.

## Severity rationale (minor, not major)

This is minor rather than major because:
- The CRIT-012 pass threshold itself (line 65) is concrete: it names the test file paths, the deterministic unit test name, and the fast-check property name. A Builder could write the tests verbatim from the contract alone, without reading verification-architecture.md.
- The behavior being asserted (snapshot mirroring) is unambiguous and well-grounded in `behavioral-spec.md §3.4a` and the editorReducer row of `verification-architecture.md §2`.
- The defect is in the registry layer: PROP-EDIT-040 lacks a canonical declaration, but the obligation it represents is concrete and testable.

It still requires remediation because future feature work that consults `verification-architecture.md` for the complete proof-obligation registry will not see PROP-EDIT-040, and the introductory line 70 of the contract is factually incorrect.
