---
sprintNumber: 1
feature: tag-chip-update
scope: Lightweight tag add/remove on a feed note without opening the editor. Pipeline spans Curate context only, reusing CaptureAutoSave back-end.
criteria:
  - id: CRIT-001
    dimension: spec_fidelity
    description: REQ-TCU-001 happy-path add — pipeline applies applyTagOperationPure, writes to Vault, emits NoteFileSaved and TagInventoryUpdated, returns Ok(IndexedNote) with updated tagInventory containing added tag.
    weight: 0.12
    passThreshold: All 11 REQ-TCU-001 acceptance criteria pass; PROP-TCU-001, PROP-TCU-008, PROP-TCU-013, PROP-TCU-019 proved.
  - id: CRIT-002
    dimension: spec_fidelity
    description: REQ-TCU-002 happy-path remove — pipeline applies applyTagOperationPure (remove), writes to Vault, emits NoteFileSaved and TagInventoryUpdated, returns Ok(IndexedNote) with removed tag absent from tagInventory.
    weight: 0.10
    passThreshold: All REQ-TCU-002 acceptance criteria pass; PROP-TCU-002, PROP-TCU-009, PROP-TCU-013, PROP-TCU-019 proved.
  - id: CRIT-003
    dimension: edge_case_coverage
    description: REQ-TCU-003 idempotent add short-circuit — when tag already present, workflow short-circuits before Clock.now() and before all I/O; no events emitted; returns Ok(IndexedNote) unchanged.
    weight: 0.09
    passThreshold: PROP-TCU-004 spy-based assertions confirm clockCallCount===0, writeMarkdownCallCount===0, publishCallCount===0, publishInternalCallCount===0 on idempotent-add path.
  - id: CRIT-004
    dimension: edge_case_coverage
    description: REQ-TCU-004 idempotent remove short-circuit — symmetric to CRIT-003; tag already absent causes same short-circuit.
    weight: 0.09
    passThreshold: PROP-TCU-003, PROP-TCU-004 proved; spy counters all 0 on idempotent-remove path.
  - id: CRIT-005
    dimension: implementation_correctness
    description: REQ-TCU-005 note-not-in-feed error path — getNoteSnapshot returns null; workflow returns Err(SaveError { cause:'note-not-in-feed' }) without calling Clock or any I/O.
    weight: 0.07
    passThreshold: PROP-TCU-007(c) per-cause test for note-not-in-feed passes; PROP-TCU-010 passes.
  - id: CRIT-006
    dimension: implementation_correctness
    description: REQ-TCU-006 hydration-fail error path — hydrateNote returns Err; workflow returns Err(SaveError { cause:'hydration-failed' }) without calling Clock or any I/O.
    weight: 0.07
    passThreshold: PROP-TCU-007(c) per-cause test for hydration-failed passes; PROP-TCU-011 passes.
  - id: CRIT-007
    dimension: implementation_correctness
    description: REQ-TCU-007 NoteEditError mapping — live variant frontmatter.updated-before-created maps to cause:frontmatter-invariant; dead tag and duplicate-tag variants are type-level unreachable.
    weight: 0.08
    passThreshold: PROP-TCU-007(c) per-cause test for frontmatter-invariant passes; PROP-TCU-012 Tier-0 @ts-expect-error directives are non-vacuous.
  - id: CRIT-008
    dimension: implementation_correctness
    description: REQ-TCU-008 Vault write failure — writeMarkdown returns Err(FsError); NoteSaveFailed emitted with correct reason mapping; projections not updated; Feed and TagInventory unchanged.
    weight: 0.08
    passThreshold: PROP-TCU-006 and PROP-TCU-018 proved; spy confirms updateProjectionsAfterSave not called on save-fail path.
  - id: CRIT-009
    dimension: structural_integrity
    description: REQ-TCU-009 previousFrontmatter sourcing and non-null invariant — MutatedNote.previousFrontmatter sourced from loaded Note.frontmatter (not editor buffer); NoteFileSaved.previousFrontmatter always non-null.
    weight: 0.08
    passThreshold: PROP-TCU-005 fast-check property test (200 runs) and Tier-0 type assertion pass; PROP-TCU-014 and PROP-TCU-020 proved; update-projections.ts throws on null previousFrontmatter.
  - id: CRIT-010
    dimension: spec_fidelity
    description: REQ-TCU-010 projection update correctness — updateProjectionsAfterSave calls FeedOps.refreshSort and TagInventoryOps.applyNoteFrontmatterEdited exactly once on happy path; occurredOn threading invariant holds.
    weight: 0.08
    passThreshold: PROP-TCU-016 purity property test; PROP-TCU-019 integration test; PROP-TCU-021 occurredOn coherence test all pass.
  - id: CRIT-011
    dimension: structural_integrity
    description: REQ-TCU-011 event channel membership — TagChipAddedOnFeed and TagChipRemovedOnFeed are CurateInternalEvent members and NOT PublicDomainEvent; NoteFileSaved and NoteSaveFailed ARE PublicDomainEvent; TagInventoryUpdated IS CurateInternalEvent.
    weight: 0.06
    passThreshold: PROP-TCU-017 Tier-0 type assertions compile without error.
  - id: CRIT-012
    dimension: verification_readiness
    description: REQ-TCU-012 Clock budget and I/O boundary — Clock.now() called at most once per invocation; 0 calls on idempotent and pre-write-error paths; 1 call on all write paths; only await point is writeMarkdown.
    weight: 0.08
    passThreshold: PROP-TCU-015 clock-budget harness (8 path scenarios) all pass; PROP-TCU-004 confirms 0 calls on idempotent paths.
negotiationRound: 0
status: approved
---

# Sprint 1 Contract — tag-chip-update

This contract captures the 12 acceptance criteria (CRIT-001..012) derived from REQ-TCU-001..012 as defined in `specs/behavioral-spec.md` Revision 4 and `specs/verification-architecture.md` Revision 4.

The contract was finalized after the spec passed Phase 1c adversarial review at iter-3 (PASS, 2026-05-01). It is presented here in the canonical VCSDD contract format to satisfy the state-library gate prerequisite for Phase 6 → complete transition.

### CRIT-001

REQ-TCU-001 happy-path add. See PROP-TCU-001, PROP-TCU-008, PROP-TCU-013, PROP-TCU-014, PROP-TCU-019.

### CRIT-002

REQ-TCU-002 happy-path remove. See PROP-TCU-001, PROP-TCU-009, PROP-TCU-013, PROP-TCU-014, PROP-TCU-019.

### CRIT-003

REQ-TCU-003 idempotent add. See PROP-TCU-002, PROP-TCU-004, PROP-TCU-015.

### CRIT-004

REQ-TCU-004 idempotent remove. See PROP-TCU-003, PROP-TCU-004, PROP-TCU-015.

### CRIT-005

REQ-TCU-005 note-not-in-feed error. See PROP-TCU-007, PROP-TCU-010.

### CRIT-006

REQ-TCU-006 hydration-fail error. See PROP-TCU-007, PROP-TCU-011.

### CRIT-007

REQ-TCU-007 NoteEditError live/dead variant mapping. See PROP-TCU-007, PROP-TCU-012.

### CRIT-008

REQ-TCU-008 Vault write failure. See PROP-TCU-006, PROP-TCU-007, PROP-TCU-018.

### CRIT-009

REQ-TCU-009 previousFrontmatter sourcing and non-null invariant. See PROP-TCU-005, PROP-TCU-014, PROP-TCU-020.

### CRIT-010

REQ-TCU-010 projection update correctness and occurredOn threading. See PROP-TCU-016, PROP-TCU-019, PROP-TCU-021.

### CRIT-011

REQ-TCU-011 event channel membership. See PROP-TCU-017.

### CRIT-012

REQ-TCU-012 Clock budget and I/O boundary. See PROP-TCU-001, PROP-TCU-004, PROP-TCU-010, PROP-TCU-011, PROP-TCU-015, PROP-TCU-021.
