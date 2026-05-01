# Phase 1c Spec Review — tag-chip-update — iteration 3

**Verdict**: PASS
**Reviewed by**: vcsdd-adversary (fresh context)
**Date**: 2026-05-01

## Per-Dimension Verdict

| Dimension | Verdict | Notes |
|-----------|---------|-------|
| Spec Coverage | PASS | All 12 REQ-TCU-001..012 retained. Workflow 4 §sources fully represented. Coverage Matrix (verification-architecture.md:294-307) maps every requirement to ≥1 PROP-TCU; PROP-TCU-021 added for the `occurredOn` threading invariant covers REQ-TCU-010 and REQ-TCU-012. Five canonical-contract deltas (Deltas 1–5) declared and counted consistently in prose (behavioral-spec.md:21). |
| Spec Testability | PASS | `tagsEqualAsSet` remains the single canonical predicate. PROP-TCU-007's per-cause list now enumerates exactly 3 live causes (`note-not-in-feed`, `hydration-failed`, `frontmatter-invariant`) matching the discriminator in Delta 1. `BuildTagChipSaveRequest` arity widening makes Step 3 unambiguously pure and testable without a Clock dependency. PROP-TCU-021 makes the `occurredOn` threading invariant operationally testable with a fixed-stub assertion. |
| Spec/Canonical Consistency | PASS | Both signature deviations from iter-2 are now declared: (a) `BuildTagChipSaveRequest` is Delta 5 with rationale (behavioral-spec.md:340-361), and (b) `UpdateProjectionsAfterSave` reverts to canonical 3-arg inner form `(deps: CurateDeps) => (feed, inventory, event) => IndexedNote` (verification-architecture.md:228-234, behavioral-spec.md:194), preserving cross-workflow reuse with CaptureAutoSave / DeleteNote. The Delta 5 prose explicitly identifies the canonical line range (`workflows.ts:68-70`) and the divergence ("drops the `deps` curry"). |
| Verification Architecture Soundness | PASS | The `now` threading invariant is now explicit (behavioral-spec.md:598-606): `now === SaveNoteRequested.occurredOn === NoteFileSaved.occurredOn === TagInventoryUpdated.occurredOn`. PROP-TCU-021 (verification-architecture.md:263) operationalises this with a Tier-2 fixed-stub assertion. `updateProjectionsAfterSave` sources `now` from `event.occurredOn` and does NOT take `now` as a parameter; this restores compatibility with the shared canonical signature without losing the timestamp-coherence guarantee. The single-Clock budget (max 1 per invocation) holds because `buildTagChipSaveRequest` is pure (Delta 5) and `updateProjectionsAfterSave` does not call `clockNow`. |
| Error/Edge Case Rigor | PASS | `'tag-vo-invalid'` is removed from Delta 1 (behavioral-spec.md:293-304) and explicitly excluded with rationale (line 234: "the dead-code guarantee is enforced exclusively by a Tier-0 type assertion: `Extract<NoteEditError, { kind: 'tag' }>` is unreachable in `applyTagOperationPure`"). PROP-TCU-007 enumerates exactly 3 causes (verification-architecture.md:249), matching the discriminator surface. PROP-TCU-012's Tier-0 dead-variant assertions remain intact. The FIND-014 "dead code removed" claim and the Delta-1 surface are now consistent. |

**Overall Verdict: PASS** — all three iter-2 findings (FIND-021, FIND-022, FIND-023) resolved cleanly; no new blocker findings introduced. One minor polish observation (FIND-024 below) is non-blocking.

---

## Resolution of iter-2 findings

| Finding | Resolved? | Evidence |
|---------|-----------|----------|
| FIND-SPEC-TCU-021 (`BuildTagChipSaveRequest` signature delta not declared) | YES | New Delta 5 section at behavioral-spec.md:340-361 explicitly declares the signature change with canonical citation (`workflows.ts:68-70`), the new shape `(mutated: MutatedNote, now: Timestamp) => SaveNoteRequested`, rationale ("now is threaded from the orchestrator's single Clock.now() call ... Without this delta, an implementer preserving the canonical curried form would call `deps.clockNow()` inside `buildTagChipSaveRequest`, violating the single-Clock budget"), purity statement, and call-site migration note. Verification-architecture.md:203-214 mirrors the new type. Purity Boundary table (verification-architecture.md:49) reflects pure classification. Delta count "5 (Deltas 1–5)" stated at behavioral-spec.md:21. |
| FIND-SPEC-TCU-022 (`UpdateProjectionsAfterSave` signature delta not declared) | YES | Reverted to canonical 3-arg inner form. (a) `deps` parameter type is `CurateDeps` (not `TagChipUpdateDeps`) — verification-architecture.md:229. (b) Inner signature is `(feed, inventory, event) => IndexedNote` — verification-architecture.md:230-234, behavioral-spec.md:194. (c) `now` is sourced from `event.occurredOn` inside the function (behavioral-spec.md:194, :596, :666). (d) The `occurredOn` threading invariant is explicit (behavioral-spec.md:598-606): `now === SaveNoteRequested.occurredOn === NoteFileSaved.occurredOn === TagInventoryUpdated.occurredOn` by construction. (e) New PROP-TCU-021 (verification-architecture.md:263) operationalises the invariant with a Tier-2 example test asserting all four timestamps are the same `Timestamp` instance under a fixed `now` stub. (f) Cross-workflow compatibility with CaptureAutoSave / DeleteNote is preserved because the canonical 3-arg shape is unchanged. |
| FIND-SPEC-TCU-023 (`tag-vo-invalid` dead-code variant in canonical errors delta) | YES | (a) `'tag-vo-invalid'` removed from `SaveValidationError.cause` discriminator in Delta 1 (behavioral-spec.md:293-304) — exactly 3 causes enumerated. (b) Rationale at line 234 explicitly states why: "Extending the canonical `errors.ts` type with a provably-dead discriminator would bloat the contract without benefit." (c) Dead-code guarantee enforcement is consolidated into the Tier-0 type assertion in PROP-TCU-012 (`Extract<NoteEditError, { kind: 'tag' }>` unreachable). (d) PROP-TCU-007 per-cause variant test list at verification-architecture.md:249 enumerates exactly 3 live causes, matching the discriminator surface. (e) FIND-014's "dead code removed" claim and the Delta-1 surface are now consistent — no resurrected dead variant. |

**Summary: 3 of 3 iter-2 findings fully resolved.**

---

## Regression check vs iter-1 findings (FIND-001..FIND-019)

Spot-check of load-bearing iter-1 fixes:

- **FIND-001 / FIND-003 / FIND-016**: Purity Boundary table (verification-architecture.md:43-52, behavioral-spec.md:185-194) preserves `applyTagOperation` (canonical curried wrapper, effectful shell) and `applyTagOperationPure` (pure core, proof target). PROP-TCU-001 still targets the pure helper. No regression.
- **FIND-002 / FIND-014 / FIND-018**: REQ-TCU-007 still reduced to single live `frontmatter.updated-before-created` variant (behavioral-spec.md:519). Dead variants remain documented for exhaustiveness with Tier-0 type assertions (PROP-TCU-012). No regression.
- **FIND-004 / FIND-005 / FIND-006**: Three new ports (`GetAllSnapshots`, `EventBusPublishInternal`, `WriteMarkdown`) declared and threaded through `TagChipUpdateDeps` (behavioral-spec.md:325-336). No regression.
- **FIND-007**: `TagChipUpdate` async return type `Promise<Result<IndexedNote, SaveError>>` preserved (behavioral-spec.md:117-122). No regression.
- **FIND-008**: Single canonical `tagsEqualAsSet` predicate (behavioral-spec.md:131-134, verification-architecture.md:108-110). No regression.
- **FIND-009**: Immutable `Feed` / `TagInventory` semantics preserved (behavioral-spec.md:109-111, :194). No regression.
- **FIND-010**: `SaveValidationError.cause` structured discriminator preserved with 3 live causes (Delta 1). No regression.
- **FIND-011**: `TagInventoryUpdated.occurredOn` semantic preserved with `occurredOn` threading invariant promoted to load-bearing position (behavioral-spec.md:598-613). No regression.
- **FIND-012 / FIND-013**: Single Clock.now() per invocation, threaded through four sites; idempotent path = 0 Clock calls. Clock budget table preserved (behavioral-spec.md:168-179). No regression.
- **FIND-015**: Non-null `previousFrontmatter` invariant preserved at REQ-TCU-009 (behavioral-spec.md:580-590). No regression.
- **FIND-017**: Cross-context dependencies section preserved (behavioral-spec.md:279-376). No regression.
- **FIND-019**: Structural non-coupling guarantee — `TagChipUpdateDeps` does NOT include editor-buffer keys (behavioral-spec.md:338, verification-architecture.md:170-177). PROP-TCU-020 preserved (verification-architecture.md:262). No regression.

**No regressions detected for FIND-001 through FIND-019.**

---

## Coverage Matrix verification

Verification-architecture.md:294-307 maps:

| Requirement | PROP IDs | Coverage |
|-------------|----------|----------|
| REQ-TCU-001 | 001, 005, 008, 013, 014, 019 | OK |
| REQ-TCU-002 | 001, 005, 009, 013, 014, 019 | OK |
| REQ-TCU-003 | 002, 004, 015 | OK |
| REQ-TCU-004 | 003, 004, 015 | OK |
| REQ-TCU-005 | 007, 010 | OK |
| REQ-TCU-006 | 007, 011 | OK |
| REQ-TCU-007 | 007, 012 | OK |
| REQ-TCU-008 | 006, 007, 018 | OK |
| REQ-TCU-009 | 005, 014, 020 | OK |
| REQ-TCU-010 | 008, 009, 016, 019, 021 | OK (021 newly added) |
| REQ-TCU-011 | 017 | OK |
| REQ-TCU-012 | 001, 004, 010, 011, 015, 021 | OK (021 newly added) |

Every REQ-TCU-001..012 maps to ≥1 PROP-TCU. PROP-TCU-021 properly threaded into the matrix. Total proof obligations: 21 (PROP-TCU-001..021), consistent with the prose claim at verification-architecture.md:309.

---

## New findings (iter-3)

### FIND-SPEC-TCU-024 — Residual ambiguity: pipeline does not pin which of `applyTagOperation` (canonical wrapper) vs `applyTagOperationPure` (helper) is invoked at Step 2

- **Dimension**: Verification Architecture Soundness
- **Severity**: minor (non-blocking)
- **Category**: spec_gap / purity_boundary
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:64-77` (pipeline diagram), `:185-194` (Purity Boundary table); `.vcsdd/features/tag-chip-update/specs/verification-architecture.md:43-52`, `:78-86`, `:193-201`
- **Finding**: The pipeline diagram at behavioral-spec.md:66-67 shows "Step 2: applyTagOperationPure" as the actual call invoked by the orchestrator, with the canonical wrapper described as a "wraps via" relationship: `applyTagOperation := (deps) => (n,c) => applyTagOperationPure(n, c, deps.clockNow())`. Yet the Purity Boundary table at line 189 lists "Step 2 (canonical) | `applyTagOperation` | **Effectful shell (clock)** | ... Internally calls `deps.clockNow()` to obtain `now`, then delegates to `applyTagOperationPure`." Acceptance criteria for error/idempotent paths phrase the negation in canonical name terms (REQ-TCU-003:438 "`applyTagOperation` is NOT called"; REQ-TCU-005:490 "`applyTagOperation` is NOT called"; REQ-TCU-007:535 "`applyTagOperation` with a stubbed `addTag`..."). Acceptance criteria for the happy path use the pure-helper name (REQ-TCU-001:391 "`applyTagOperationPure` returns `Ok(MutatedNote)` ...").
- **Why it's a defect (minor)**: An implementer reading the Purity Boundary table could reasonably implement Step 2 by invoking `applyTagOperation(deps)(note, command)` (the canonical curried wrapper). On the non-idempotent path this would result in TWO `clockNow()` calls per workflow invocation: one up-front by the orchestrator (line 64 "Clock.now() — single call here, before Step 2") and one inside the wrapper. The Clock budget table (line 168-179) and PROP-TCU-015 both claim max 1 per invocation, which only holds if Step 2 invokes `applyTagOperationPure` directly with the pre-obtained `now`. The dominant interpretation (workflow calls pure helper directly) is supported by the pipeline diagram, REQ-TCU-001 acceptance criteria, and PROP-TCU-001 targeting `applyTagOperationPure`, so this is recoverable — but the spec does not state explicitly: "this workflow invokes `applyTagOperationPure` directly; the canonical curried `applyTagOperation` wrapper is preserved for type-contract conformance but is not the call site used by `TagChipUpdate`."
- **Why minor (not blocker)**: The dominant interpretation is consistent across pipeline diagram, acceptance criteria, PROP targeting, and Clock budget table. A careful Phase-2 implementer reading all four signals will land on the correct shape. This is a polish/clarity issue, not a structural defect.
- **Suggested resolution**: Add one explicit sentence at the end of the Purity Boundary table or in a new "Step 2 invocation contract" subsection: "This workflow invokes `applyTagOperationPure(note, command, now)` directly with the pre-obtained `now`. The canonical curried `applyTagOperation` wrapper is preserved in `workflows.ts` for type-contract conformance but is not the call site used by `TagChipUpdate`'s orchestrator." Optionally restate the relevant acceptance criteria to use the pure-helper name uniformly (or explicitly note that "not called" applies whether one reads the canonical wrapper name or the pure helper name).

---

## Suggestions (non-blocking, carried forward / new)

- **PROP-TCU-002 / PROP-TCU-003 redundancy on idempotent path** (carried from iter-2): These properties test `applyTagOperationPure` with the tag-already-present (or tag-already-absent) input, but the workflow orchestrator never invokes `applyTagOperationPure` on the idempotent path (the pre-check fires first). The properties remain valid as unit tests of `addTag`/`removeTag` semantics, but their REQ-TCU-003 / REQ-TCU-004 mapping in the coverage matrix is more accurately "underlying NoteOps contract" than "workflow idempotency", which is covered by PROP-TCU-004. Consider relabelling the coverage column.
- **`WriteMarkdown` canonical anchor** (carried from iter-2): The spec correctly declares `WriteMarkdown` as a delta on `ports.ts`, but a one-line citation of where the port is currently consumed by Capture's autosave (e.g., the file path of the Vault adapter implementation) would harden the cross-context reuse claim. Phase 2 will own the canonical placement; not a blocker.
- **REQ-TCU-008 reference-equality assertion** (carried from iter-2): PROP-TCU-006 stops at "spy.callCount === 0 for all three". A stronger Tier-2 assertion `IndexedNote.feed === feed` and `IndexedNote.tagInventory === inventory` (reference equality on the save-fail path) would prove the unchanged claim more precisely than "no calls observed".
- **PROP-TCU-021's tier**: Marking PROP-TCU-021 as Tier 2 (example-based with fixed-stub) is appropriate, but consider promoting at least one assertion ("`SaveNoteRequested.occurredOn === NoteFileSaved.occurredOn`") to a Tier-0 type-level lemma if the Vault write port type can be made to express the echo guarantee (e.g., a phantom-typed `Timestamp` parameter). Optional polish.
- **Pipeline diagram Step 2 invocation clarity** (new — see FIND-024): A single declarative sentence pinning the actual call site at Step 2 would close the residual ambiguity.

---

## Convergence Signals

- Findings count trajectory: iter-1 = 19 → iter-2 = 3 → iter-3 = 1 (minor, non-blocking).
- Resolution rate: 3 of 3 iter-2 findings fully resolved. No regression of FIND-001..019.
- Coverage matrix: complete. Every REQ-TCU-001..012 maps to ≥1 PROP-TCU.
- Delta count consistency: prose claims "5 (Deltas 1–5)" (behavioral-spec.md:21); five numbered Delta sections present (lines 283, 308, 317, 325, 340). Match.
- Total proof obligations: 21 (PROP-TCU-001..021), prose-consistent.
- New blocker findings: 0.
- New minor findings: 1 (FIND-SPEC-TCU-024 — pipeline Step 2 invocation ambiguity).

**Recommended for iter-3 → Phase 1c gate PASS.** The single minor finding (FIND-024) does not block progression; it can be addressed as a polish item in Phase 2a or carried forward as a known clarity gap.

**Finding IDs to pass to recordGate** (informational only, non-blocking): FIND-SPEC-TCU-024
