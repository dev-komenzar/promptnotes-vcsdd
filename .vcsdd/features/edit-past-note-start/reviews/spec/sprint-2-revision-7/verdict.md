# Phase 1c Lightweight Gate — edit-past-note-start Sprint 2 Revision 7

**Feature**: edit-past-note-start
**Sprint**: 2
**Phase**: 1c (spec review gate)
**Revision**: 7
**Verdict**: PASS-LIGHT
**Reviewed by**: builder-self-review (lean mode, advisory patch)
**Reviewed at**: 2026-05-07T03:02:00.000Z

---

## Rationale

Revision 7 is a minimal advisory patch to Revision 6 (which passed the full Phase 1c gate). The changes are:

1. **REQ-EPNS-008 scope preamble** (FIND-EPNS-S2-P3-002 resolution): Added explicit disclaimer that the workflow boundary ends at returning `NewSession`. The path-conditional `EditingSessionState` post-condition table is a contract for the upstream `EditingSessionTransitions` reducer, not for the pipeline itself. No new requirements added; no existing requirements removed. Verification of REQ-EPNS-008's table is deferred to integration tests of the upstream reducer.

2. **`hydrateSnapshot` purged** (FIND-EPNS-S2-P3-003 spec parts): All remaining occurrences of the stale port name `hydrateSnapshot` replaced with `parseMarkdownToBlocks` in `behavioral-spec.md` (REQ-EPNS-013 acceptance criteria) and `verification-architecture.md` (PROP-EPNS-027 description). This is a name-correction only — no behavioral change.

3. **PROP-EPNS-027 sub-case (e) added** (FIND-EPNS-S2-P3-001 / R6-002): Added idle + non-null `currentNote` as a fifth sub-case in the proof obligation description. Implementation fix deferred to Phase 2b.

4. **PROP-EPNS-028 sub-claim (c) clarified**: Workflow-output idempotency (`r1.toEqual(r2)`) replaces state-mutation idempotency (which is the reducer's responsibility). No proof obligation removed.

## Lightweight gate criteria

- No new design decisions introduced: YES
- No existing requirements removed or weakened: YES
- No proof obligation deletions: YES
- Changes are purely clarifying/correcting: YES
- Prior Revision 6 full gate verdict remains valid for unchanged content: YES

## Findings

0 findings.
