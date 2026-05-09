# Spec Review Verdict — edit-past-note-start Sprint 2 Revision 5 (Phase 1c)

**Reviewed by**: vcsdd-adversary (fresh context)
**Reviewed at**: 2026-05-07T01:00:00.000Z
**Mode**: lean
**Iteration**: 3 (Sprint 2)
**Artifacts under review**:
- `.vcsdd/features/edit-past-note-start/specs/behavioral-spec.md` (Revision 5)
- `.vcsdd/features/edit-past-note-start/specs/verification-architecture.md` (Revision 5)

## Per-dimension verdicts

| Dimension | Verdict | Notes |
|-----------|---------|-------|
| spec_fidelity | FAIL | Revision 5 introduces a normative `Err(ContractViolationError)` return that is incompatible with the explicitly-unchanged `Result<NewSession, SwitchError>` result type — the spec contradicts its own Type Contract Delta 2 (FIND-EPNS-S2-R5-001). |
| edge_case_coverage | PASS | All 8 prior findings' edge cases addressed: PC-001..004 enumerated; same-noteId same-blockId idempotence (edge case L610); save-failed × same-noteId (L613); save-failed × cross-noteId both success and failure (REQ-006); snapshot=null + cross-noteId (PC-001, REQ-013, L606); parseMarkdownToBlocks failure (PC-002, L608); isEmpty boundary (REQ-002 edge cases L227-231). |
| verification_readiness | FAIL | PROP-EPNS-027 is structurally unverifiable as written: it asserts `Err(ContractViolationError)` is returned, but the workflow's declared return type cannot carry that variant (FIND-EPNS-S2-R5-001 ripple). PROP coverage matrix otherwise complete (all REQs ≥1 PROP, 5 required:true on 001..005, enumerative PROP-026 for SaveError mapping, fixed-point PROP-028 for idempotent re-focus). |
| purity_boundary_clarity | PASS | `classifyCurrentSession(state, request, currentNote)` is now structurally pure — all inputs explicit per Type Contract Delta 1. `previousFrontmatter` is an explicit field on `EditPastNoteStartInput`, no side-channel. `flushCurrentSession` and `startNewSession` purity tier per path is documented. |
| internal_consistency | FAIL | The Type Contract Deltas section (lines 46-93) enumerates Delta 1 (`ClassifyCurrentSession` widening) and Delta 2 (`EditPastNoteStart` input struct) but explicitly states "result type `Result<NewSession, SwitchError>` is unchanged" (line 92). REQ-EPNS-013 (lines 540-566) and PC-001/PC-004 normatively require returning `Err(ContractViolationError)`. These two statements are mutually contradictory within the same revision (FIND-EPNS-S2-R5-001). |

## Overall verdict: FAIL

**Resolution status of Revision 4 findings (sprint-2-revision-4)**:

| Prior Finding | Status in Rev 5 | Evidence |
|---|---|---|
| FIND-EPNS-S2-001 (NoteOps.isEmpty) | RESOLVED | REQ-002 lines 214-224 cite `shared/note.ts:174` directly; CaptureAutoSave's broader local predicate is explicitly disambiguated. |
| FIND-EPNS-S2-002 (classifyCurrentSession purity) | RESOLVED | Signature widened to `(state, request, currentNote)` per Type Contract Delta 1 (lines 50-69); REQ-007 line 374-377 reflects this; PROP-001 re-anchored to widened signature. |
| FIND-EPNS-S2-003 (REQ-008 vs REQ-005 contradiction) | RESOLVED | REQ-008 path-conditional table (lines 421-428) covers all 6 paths; same-note rows preserve isDirty (EditingState) and `save-failed` status (SaveFailedState); explicit "isDirty: false reset ONLY applies to cross-note paths" (line 430). |
| FIND-EPNS-S2-004 (previousFrontmatter channel) | RESOLVED | `EditPastNoteStartInput` struct (lines 117-131) names `previousFrontmatter` as explicit field; provenance & lifecycle documented (lines 145-149); "side-channel" language removed. |
| FIND-EPNS-S2-005 (SaveError mapping enumerative PROP) | RESOLVED | PROP-EPNS-026 (verification-arch line 187) enumerates all 6 SaveError discriminants; coverage matrix updated (line 217). |
| FIND-EPNS-S2-006 (parseMarkdownToBlocks failure undefined) | PARTIALLY RESOLVED | PC-002 says implementation MUST throw on parse failure; PC-001/PC-004 say return `Err(ContractViolationError)`; REQ-013 + PROP-027 cover precondition contracts. **However the result-type incompatibility (FIND-EPNS-S2-R5-001) blocks completion.** |
| FIND-EPNS-S2-007 (idempotent re-focus PROP) | RESOLVED | PROP-EPNS-028 (verification-arch line 189) covers fixed-point property: 2 calls → 2 BlockFocused emits, identical state, isDirty preserved. |
| FIND-EPNS-S2-008 (Clock.now dirty-fail call site) | RESOLVED | REQ-004 line 302 has explicit "Clock.now() call site" bullet anchoring `flushCurrentSession`; PROP-024 description (verification-arch line 185) cross-references REQ-004. |

7 of 8 prior findings fully resolved; FIND-006 partially resolved. **One NEW critical finding** introduced by Revision 5's incomplete Type Contract Delta enumeration.

## Findings

### FIND-EPNS-S2-R5-001 (severity: critical) — `ContractViolationError` return contradicts Type Contract Delta 2's "result type unchanged" claim

- **Dimension**: spec_fidelity / internal_consistency / verification_readiness (cross-cutting)
- **Phase rooted**: 1a (REQ-013 normative `SHALL`) + 1b (Type Contract Delta enumeration + PROP-027)
- **Where**:
  - behavioral-spec.md Type Contract Delta 2, line 92: "The result type `Result<NewSession, SwitchError>` is unchanged"
  - behavioral-spec.md REQ-EPNS-013 EARS, line 542: "the system SHALL return `Err(ContractViolationError)` immediately"
  - behavioral-spec.md PC-001 line 163: "workflow rejects with `ContractViolationError { kind: 'contract-violation', ... }`"
  - behavioral-spec.md PC-004 line 182: same `ContractViolationError` return
  - behavioral-spec.md REQ-EPNS-013 acceptance lines 562-566: "Cross-note + snapshot === null: workflow returns `Err(ContractViolationError)` with no I/O performed"
  - behavioral-spec.md ContractViolationError type definition lines 555-560 (inline in spec; not in `shared/errors.ts`)
  - verification-architecture.md PROP-EPNS-027 line 188: "workflow returns `Err(ContractViolationError)` with no I/O performed and no state change"
  - `docs/domain/code/ts/src/capture/workflows.ts` lines 108-113: existing `EditPastNoteStart` declares `Promise<Result<NewSession, SwitchError>>` — no `ContractViolationError` arm
  - `docs/domain/code/ts/src/shared/errors.ts`: `ContractViolationError` is NOT a member of any error union; it has no port-level definition

- **Issue**:
  Revision 5's Type Contract Deltas section explicitly enumerates two deltas (signature widening for `ClassifyCurrentSession`, input-struct adoption for `EditPastNoteStart`) and explicitly states the result type `Result<NewSession, SwitchError>` is **unchanged** (line 92).

  Yet REQ-EPNS-013 introduces a third return shape — `Err(ContractViolationError)` — for two distinct precondition violations (PC-001 cross-note + null snapshot; PC-004 currentNote/state inconsistency). The `ContractViolationError` type is defined inline in the behavioral spec (lines 555-560) but is NOT a member of `SwitchError`, `SaveError`, or any other union in `shared/errors.ts`. There is no Type Contract Delta documenting a result-type widening such as `Result<NewSession, SwitchError | ContractViolationError>` or a new union error wrapper.

  This is a flat internal contradiction:
  - **As specified**, REQ-EPNS-013's `Err(ContractViolationError)` cannot type-check against `Result<NewSession, SwitchError>`. TypeScript will reject the implementation.
  - **As verified**, PROP-EPNS-027 asserts the workflow "returns `Err(ContractViolationError)`". Without a type-contract path for that return, the obligation is structurally unverifiable: a fast-check or example test cannot witness an Err arm whose type does not exist in the function signature.

  Note that PC-002 (parseMarkdownToBlocks failure) takes a different escape — "implementation MUST throw" — which IS compatible with the existing return type (throws bypass the Result channel). PC-003 is "behavior undefined". Only PC-001 and PC-004 normatively require the typed Err return that the current contract cannot express.

  The Builder's pre-emptive concern ("ContractViolationError type — REQ-EPNS-013 introduces this type but it's not yet in `shared/errors.ts`. Spec marks it as a future addition") confirms awareness of the type-contract gap, but the resolution chosen (defer the type definition while keeping the normative Err return) is structurally incoherent. A "future delta" cannot satisfy a present-tense `SHALL`-return obligation.

- **Why this matters**:
  Phase 2a (test generation) and Phase 2b (implementation) cannot proceed coherently: a test that asserts `result.kind === 'err' && result.error.kind === 'contract-violation'` will not compile against the existing `EditPastNoteStart` type. The implementation has three incompatible options:
  (a) Throw instead of returning Err — violates REQ-EPNS-013's `SHALL return`.
  (b) Add a new variant to `SwitchError` (e.g., `kind: 'contract-violation'`) — pollutes the SwitchError semantic with non-save-related concerns and is undocumented.
  (c) Widen the result type — a Type Contract Delta NOT enumerated by Revision 5.

  All three force the Builder to make an architectural choice during Phase 2b that should have been resolved at Phase 1a/1b. This is exactly what the 1c gate is meant to prevent.

- **Recommended fix** (choose one explicitly and document as Type Contract Delta 3):
  (a) **Throw-only semantics**: Rewrite REQ-EPNS-013, PC-001, PC-004 to mandate that contract violations throw `ContractViolationError` (an Error subclass), not return Err. Update PROP-EPNS-027 to assert `expect(() => workflow(...)).toThrow(ContractViolationError)`. The result type stays unchanged. Document `ContractViolationError` as a thrown exception type, not a domain error.

  (b) **Widen result type**: Add Type Contract Delta 3: `EditPastNoteStart` returns `Promise<Result<NewSession, SwitchError | ContractViolationError>>`. Define `ContractViolationError` as a top-level type in `shared/errors.ts`. Update PROP-EPNS-027 to discriminate on `result.error.kind`.

  (c) **Fold into SwitchError**: Add `{ kind: 'contract-violation'; message: string }` as a new `SwitchError` variant. PROP-EPNS-005 (SwitchError exhaustiveness) must be updated to cover it. This is semantically odd (contract violations are not "save failed during switch") but is the smallest delta.

  Whichever option is chosen, the spec MUST explicitly document it as a Type Contract Delta and MUST NOT leave the `Result<NewSession, SwitchError>` claim on line 92 standing alongside REQ-EPNS-013's typed-Err return.

---

## Notes (non-blocking observations)

These are observations — not findings — recorded for traceability but do not affect the verdict.

- **Aggregates.md vs `shared/note.ts:174` definition tension**: aggregates.md L120 says `note.isEmpty()` covers "全ブロックが空（または `divider` のみ）" while `shared/note.ts:174` defines it as "blocks.length === 1 かつ blocks[0] が空 content の paragraph" (narrow). Revision 5 chooses the narrow rule and explicitly documents that divider-only is NOT empty by `NoteOps.isEmpty`. This is a docs-vs-code tension that pre-exists this feature and is not within Phase-1c scope to resolve, but the Builder should be aware that either aggregates.md or `shared/note.ts:174` will eventually need to be reconciled (Phase-0 docs work).

- **SaveFailedState same-note focus tracking is UI-layer-only**: Revision 5 correctly observes that `SaveFailedState` (per `states.ts` lines 70-75) has no `focusedBlockId` field, so same-note focus changes during save-failed are not state-machine-visible. The spec defers focus tracking to "the UI layer only (via the `BlockFocused` event)". This is internally consistent given the explicit Scope statement (line 7) that "UI reaction to errors and CaptureAutoSave internals are out of scope". Acceptable as-is.

- **PROP-EPNS-013 isEmpty-agnostic invariant**: Builder's pre-emptive concern is satisfied — the "any currentNote" qualifier (line 174 of verification-architecture.md) is sufficient for fast-check property generation, which produces both empty and non-empty notes by default. No need for explicit isEmpty-true / isEmpty-false sub-cases.
