# Phase 1c Spec Review — Sprint 2 / Revision 6 (Re-Review)

**Feature**: `edit-past-note-start`
**Sprint**: 2
**Revision**: 6
**Iteration**: 4 (of 5 lean cap; this is iteration 5/5 of Phase 1a per user notice — revision counter equals 6, but this is the 4th adversary iteration of 1c for sprint 2)
**Reviewer**: adversary (fresh context, zero Builder bias)
**Mode**: lean
**Timestamp**: `2026-05-07T01:30:00.000Z`

## Verdict: PASS

All five dimensions PASS. No critical or major findings. Three minor advisories recorded for follow-up but they do not block Phase 2a entry. `ContractViolationError` is fully purged from both spec files (no live type definition, no return-type usage, no Err-variant usage; only historical changelog mentions remain).

---

## Dimension Verdicts

| Dimension | Verdict |
|-----------|---------|
| spec_fidelity | PASS |
| edge_case_coverage | PASS |
| verification_readiness | PASS |
| purity_boundary_clarity | PASS |
| internal_consistency | PASS |

---

## ContractViolationError Purge Audit

Search performed across both `behavioral-spec.md` (629 lines) and `verification-architecture.md` (239 lines).

**Live references**: 0.
**Historical/changelog references**: 5 (all in "Revision 6 Changes" / "Revision 5 Changes" tables describing the removal). These are necessary changelog text, not live type usage.

Specifically verified:
- No `Err(ContractViolationError)` in any return type, signature, or error variant.
- `Result<NewSession, SwitchError>` is the sole return type for the workflow (behavioral-spec lines 7, 95, 104, 107, 109; verification-architecture port contract row).
- No type definition `type ContractViolationError = ...` anywhere.
- `shared/errors.ts` is unchanged per behavioral-spec line 20.

PURGE COMPLETE.

---

## Dimension 1: spec_fidelity — PASS

Verified:
- `BlockFocusRequest { kind, noteId, blockId, snapshot: NoteFileSnapshot | null }` matches `stages.ts` definition (behavioral-spec lines 151-157).
- `CurrentSessionDecision` 4-variant union with `same-note` (behavioral-spec lines 414-420; verification-architecture lines 161-164).
- `NewSession.focusedBlockId: BlockId` field (behavioral-spec lines 454-462).
- `SwitchError.pendingNextFocus: { noteId, blockId }` shape (behavioral-spec lines 295-301, 521).
- `BlockFocused` is `CaptureInternalEvent`, NOT `PublicDomainEvent` (REQ-EPNS-010 acceptance criteria; PROP-EPNS-016).
- `EmptyNoteDiscarded` is `PublicDomainEvent` (REQ-EPNS-009).
- `Result<NewSession, SwitchError>` preserved as workflow return; PC-001/PC-004 violations throw (Promise reject) — no widening of the result Err variant. Type Contract Delta 2 explicitly clarified as informational-only with the Revision 6 note (behavioral-spec lines 86, 109).
- Throw pattern (`throw Error(...)`) matches `classifyCurrentSession` convention with file/line citation `promptnotes/src/lib/domain/edit-past-note-start/classify-current-session.ts:62-66` (behavioral-spec line 561).

No discrepancies between spec and contract sources.

---

## Dimension 2: edge_case_coverage — PASS (with minor advisory)

Verified:
- PC-001..PC-004 each have a defined violation behavior (behavioral-spec lines 176-200).
- Same-note + same-blockId (idempotent re-focus) covered (behavioral-spec line 623; PROP-EPNS-028).
- Same-note + different blockId covered (behavioral-spec line 622; REQ-005).
- Same-note + null snapshot covered (line 344; expected case).
- Save-failed + cross-note + save-success covered (line 624; REQ-006).
- Save-failed + cross-note + save-fail covered (line 625; REQ-006, PROP-012).
- Save-failed + same-note covered (line 626; PROP-018).
- Save-failed + same-note + same-blockId covered (line 627; idempotent).
- Empty + save-failed cross-note: always classified `dirty` not `empty` (line 628; REQ-007 classification table footnote).
- isDirty preservation on same-note covered (line 629; PROP-010).
- isEmpty boundary cases enumerated (lines 244-248): single empty paragraph, single whitespace paragraph, multi-block, non-paragraph single block, divider-only.

**Minor advisory** (FIND-EPNS-S2-R6-001 below): PC-001's asymmetric "same-note + non-null snapshot" sub-case (silently ignored) is documented at PC-001 (line 181) but NOT in the Edge Case Catalog and NOT covered by any PROP. Acceptable as advisory because the prescribed behavior is "no error, snapshot ignored" — a no-op — but a regression risk exists if implementation accidentally consumes the snapshot.

---

## Dimension 3: verification_readiness — PASS (with minor advisories)

Verified:
- 28 proof obligations (PROP-EPNS-001 through PROP-EPNS-028).
- `required: true` set is exactly {PROP-001, PROP-002, PROP-003, PROP-004, PROP-005} — the five highest-risk invariants. This complies with the lean policy stated in verification-architecture lines 211-218.
- PROP-EPNS-027 is testable: explicit `await expect(promise).rejects.toThrow()` (or sync `expect(() => ...).toThrow()`) plus port spies on `clockNow`, `blurSave`, `emit`. State snapshot-and-compare to assert no mutation (verification-architecture line 199).
- PROP-EPNS-027 enumerates 4 sub-cases (a-d): PC-001 cross-note+null-snapshot, PC-002 parse failure, PC-004 editing+null, PC-004 save-failed+null.
- Coverage matrix lists every REQ-001..REQ-013 with at least one PROP (verification-architecture lines 222-237).

**Minor advisory** (FIND-EPNS-S2-R6-002): PROP-EPNS-027 omits the PC-004 "idle + currentNote !== null" sub-case as an explicit (e) test entry. The behavioral spec acceptance criterion at line 578 specifies this case must throw with the same throw pattern. PROP-027 should enumerate it as a fifth sub-case. Currently it is implicitly covered by the PC-004 generic phrasing but not by an explicit test case — a property-level coverage gap.

**Minor advisory** (FIND-EPNS-S2-R6-003): PROP-EPNS-027 (verification-architecture line 199) and REQ-EPNS-013 acceptance criterion (behavioral-spec line 574) reference a port name `hydrateSnapshot` to be spied on. The actual port in the port-contracts section is named `parseMarkdownToBlocks` (verification-architecture line 143; renamed in Revision 4 per the changelog row at line 42). The intent is unambiguous (spy the markdown→blocks parse function), but the stale name `hydrateSnapshot` is internally inconsistent with the port contract.

These advisories do not block Phase 2a entry because (a) they are minor stylistic/coverage gaps that the test author can discover and fix without changing requirements, and (b) the underlying behaviors are well specified at the requirement level. They should be picked up by the Builder during 2a test authoring.

---

## Dimension 4: purity_boundary_clarity — PASS

Verified:
- `classifyCurrentSession` is pure: signature `(EditingSessionState, BlockFocusRequest, Note | null) → CurrentSessionDecision` with all inputs as explicit parameters (verification-architecture line 154-158; behavioral-spec line 388-394).
- No external buffer access: the Revision 5 widening explicitly notes "fast-check can generate arbitrary `(state, request, currentNote)` tuples without needing to mock an external buffer" (verification-architecture line 68). Purity claim is structurally verifiable.
- `Clock.now()` is NEVER called inside `classifyCurrentSession` (REQ-EPNS-007 acceptance line 428; PROP-EPNS-019).
- `previousFrontmatter` is a typed input field on `EditPastNoteStartInput` (behavioral-spec lines 143-148; verification-architecture lines 79-90), explicitly NOT a side-channel (verification-architecture line 110: "NOT a side-channel — it is an explicit input field").
- Pure core: `classifyCurrentSession`, `parseMarkdownToBlocks`. Effectful shell: `flushCurrentSession` (empty/dirty), `startNewSession`, `emit`. No-op shell: `flushCurrentSession` (same-note/no-current). Purity boundary map at verification-architecture lines 52-60 is consistent with behavioral-spec lines 600-608.

---

## Dimension 5: internal_consistency — PASS (with minor advisory)

Verified:
- REQ-EPNS-013 throw behavior consistent with REQ-EPNS-008 path-conditional post-conditions (REQ-008 only specifies post-conditions on successful paths; REQ-013 says no state mutation on throw — non-overlapping, mutually consistent).
- Clock budget table identical across three locations: behavioral-spec lines 541-547, verification-architecture lines 96-101, PROP-EPNS-024 line 196. dirty-fail=1 anchored to REQ-EPNS-004 acceptance line 319 (`flushCurrentSession` calls Clock.now once for `NoteSaveFailed.occurredOn`).
- Coverage matrix exhaustive — every REQ-001..REQ-013 has at least one PROP.
- `same-note` classification rule consistent across REQ-EPNS-005 (line 329), REQ-EPNS-007 classification table (line 406), and CurrentSessionDecision×State matrix (lines 585-591).
- isDirty preservation on same-note paths consistent across REQ-005 acceptance criteria, REQ-008 path-conditional table, and PROP-010 + PROP-028.
- Revision 6 changes table (behavioral-spec lines 15-22) accurately summarizes the diff from Revision 5 (PC-001 / PC-004 collapsed to throw; ContractViolationError removed; result type unchanged; Type Contract Delta 2 informational-only).

**Minor advisory** (FIND-EPNS-S2-R6-003 — same as Dimension 3): the stale `hydrateSnapshot` port name is also an internal-consistency issue between the port-contracts section and PROP-027 / REQ-013 acceptance.

---

## Findings Summary

| ID | Severity | Dimension | Description (one-liner) |
|----|----------|-----------|--------------------------|
| FIND-EPNS-S2-R6-001 | minor | edge_case_coverage | PC-001 same-note + non-null snapshot asymmetric case not in Edge Case Catalog and not PROP-tested |
| FIND-EPNS-S2-R6-002 | minor | verification_readiness | PROP-027 omits PC-004 idle+non-null currentNote as an explicit sub-case |
| FIND-EPNS-S2-R6-003 | minor | verification_readiness, internal_consistency | PROP-027 / REQ-013 reference stale port name `hydrateSnapshot` instead of `parseMarkdownToBlocks` |

**Counts**: critical=0, major=0, minor=3.

PASS gate is granted because all 5 dimensions pass and no critical/major findings remain. The three minor advisories are non-blocking and should be addressed opportunistically during Phase 2a test authoring (test author may add explicit test cases and use the correct port name in spies).

---

## Builder Pre-emptive Concerns Adjudication

1. **PC-004 idle + non-null currentNote sub-case message is implementation-defined** — Acknowledged. REQ-EPNS-013 acceptance line 578 explicitly says "distinct message if desired (implementation detail)". Accepted; PROP-027 omission is a separate minor finding (FIND-S2-R6-002).
2. **PC-002 message is implementation-defined** — Acknowledged. PROP-EPNS-027 (b) explicitly says "specific message is implementation-defined". Accepted; this is appropriate for a programming-error path.
3. **PC-001 same-note + non-null snapshot is silently ignored — Builder rationalized this asymmetry** — Accepted with reservation. The asymmetry is internally consistent with the principle that "snapshot is data for cross-note hydration; same-note doesn't need it". The cross-note + null case throws because there is no recovery path (no data to hydrate from), whereas same-note + non-null has a recovery path (ignore the surplus). However the lack of an explicit Edge Case Catalog entry and PROP coverage is a minor gap → FIND-S2-R6-001.

None of the pre-emptive concerns rise to critical or major.

---

## Recommendation

PASS Phase 1c. Advance Sprint 2 to Phase 2a (Red). The three minor advisories should be carried forward as non-blocking notes for Phase 2a test authoring and may be folded into the test plan without re-opening Phase 1a.
