---
sprintNumber: 1
feature: ui-tag-chip
status: approved
scope: "Interactive tag chips on feed rows (x remove, + add with autocomplete) and left sidebar tag filter list. Pure core: feedReducer tag action handlers, tagInventory pure computation, type extensions."
criteria:
  - id: CRIT-001
    dimension: spec_fidelity
    description: "REQ-TAG-001..019: all 19 requirements from behavioral-spec.md are implemented. Tag chips display with DESIGN.md pill badge styling."
    weight: 0.25
    passThreshold: "each REQ has implementation evidence"
  - id: CRIT-002
    dimension: spec_fidelity
    description: "Domain pipeline integration: tagChipUpdate and applyFilterOrSearch imported, not reimplemented. tryNewTag exported from domain barrel."
    weight: 0.15
    passThreshold: "grep audit confirms no reimplementation"
  - id: CRIT-003
    dimension: implementation_correctness
    description: "72 new tests pass, 45 regression tests pass."
    weight: 0.20
    passThreshold: "all tests green"
  - id: CRIT-004
    dimension: implementation_correctness
    description: "feedReducer handles all 6 new FeedAction variants exhaustively. activeFilterTags preserved across DomainSnapshotReceived."
    weight: 0.15
    passThreshold: "reducer exhaustiveness verified"
  - id: CRIT-005
    dimension: structural_integrity
    description: "DESIGN.md tokens used: tag chips #f2f9ff/#097fe8, focus rings, whisper borders. Aria labels on interactive elements."
    weight: 0.10
    passThreshold: "DESIGN.md token audit passes"
  - id: CRIT-006
    dimension: verification_readiness
    description: "feedReducer remains pure. tagInventoryFromMetadata pure and deterministic. Effectful shell isolated."
    weight: 0.10
    passThreshold: "purity audit passes"
  - id: CRIT-007
    dimension: edge_case_coverage
    description: "Edge cases: empty tag rejection, max 100 char limit, mutual exclusion, note deletion closes input, overflow."
    weight: 0.05
    passThreshold: "edge case tests pass"
---
