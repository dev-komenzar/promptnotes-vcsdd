# Spec Review Findings — handle-save-failure (Phase 1c, iter 1)

## FIND-SPEC-001 (critical) — Input contract contradicts canonical workflow signature
**Dimension**: correctness
**Files**: `specs/behavioral-spec.md:29-34`, `docs/domain/code/ts/src/capture/workflows.ts:115-117`

The spec defines `HandleSaveFailureInput = { state: SaveFailedState; decision: UserDecision }`, but the canonical contract is `(stage: SaveFailedStage, decision: UserDecision) => Promise<ResolvedState>`. `SaveFailedStage` only has `{ kind, noteId, error }` and lacks `currentNoteId`/`pendingNextNoteId`/`lastSaveError` that REQ-HSF-002..006 require. Open Question §3 acknowledges the duality but defers it.

**Remediation**: Reconcile the contract — either widen input to `(stage, state, decision)` and document where the orchestrator obtains `state`, or propose a revision of `workflows.ts:115-117`. Move off Open Questions into a binding REQ.

---

## FIND-SPEC-002 (critical) — `EditingState` shape in REQ-HSF-004 / REQ-HSF-005 ACs is incomplete
**Dimension**: completeness, testability
**Files**: `specs/behavioral-spec.md:122,148`, `docs/domain/code/ts/src/capture/states.ts:24-32`

`EditingState` mandates 6 readonly fields. REQ-HSF-004/005 ACs only assert 3. `lastInputAt`, `idleTimerHandle`, `lastSaveResult` are not specified, so PROP-HSF-004/006/007 cannot pin behavior.

**Remediation**: Specify all six fields per AC. Recommended: `lastInputAt: null`, `idleTimerHandle: null`. For cancel-switch, `lastSaveResult: 'failed'`. For discard-with-pending, choose `null` (fresh session) or `'failed'` and document rationale. Update PROPs to assert the full struct.

---

## FIND-SPEC-003 (critical) — REQ-HSF-001 has no PROP for runtime invariant assertion
**Dimension**: traceability, testability
**Files**: `specs/behavioral-spec.md:42-55`, `specs/verification-architecture.md:108`

REQ-HSF-001 AC requires a runtime `state.status === 'save-failed'` invariant that throws. The matrix maps it to PROP-HSF-005 — but PROP-HSF-005 tests UserDecision exhaustiveness (`decision.kind`), unrelated to the state guard. No PROP exercises the runtime throw on a malformed state.

**Remediation**: Add Tier 2 `PROP-HSF-019: invariant-on-non-save-failed` constructing a deliberately-cast bad state and asserting `SaveError { kind: 'validation', reason: { kind: 'invariant-violated' } }`. Update coverage matrix REQ-HSF-001 → PROP-HSF-019.

---

## FIND-SPEC-004 (major) — Clock.now() budget contradiction for cancel-switch invalid path
**Dimension**: correctness, purity_boundary
**Files**: `specs/behavioral-spec.md:206,216-217`

REQ-HSF-009 EARS says "exactly once" including cancel-switch invalid; the table on line 216 says `0–1`; line 217 hedges to `≤1`. PROP-HSF-013 only validates valid branches.

**Remediation**: Pick a deterministic budget. Recommended: 0 on the invalid branch (short-circuit invariant guard). Update EARS and table to "exactly 1 on valid branches; 0 on cancel-switch invalid". Extend PROP-HSF-013 (or add new) asserting `Clock.now` spy count === 0 on invariant-violation path.

---

## FIND-SPEC-005 (major) — PROP-HSF-001 misnamed: tests determinism, not purity
**Dimension**: testability
**Files**: `specs/verification-architecture.md:66,96`

PROP-HSF-001 encoding `retry(s,t) deepEquals retry(s,t)` is determinism. fast-check cannot detect side effects from this; mutation of a global counter would still satisfy it.

**Remediation**: (a) Rename to `retry-determinism` and weaken rationale; (b) add a sentinel-port property asserting Clock spy / emit spy call counts === 0 inside the pure transition; or (c) move purity proof to type-level (no `CaptureDeps` in the pure transition signature) and cite that.

---

## FIND-SPEC-006 (major) — `cancelSwitch` semantics not traced to a cited source
**Dimension**: correctness, traceability
**Files**: `specs/behavioral-spec.md:6,144,148-150`, `docs/domain/code/ts/src/capture/states.ts:118-119`, `docs/domain/workflows.md:586`

`states.ts:119` only declares `cancelSwitch(state, now): EditingState` — no `isDirty`/`lastSaveResult` constraint. `workflows.md:586` says only `editing(currentNoteId) に戻る`. The spec's `isDirty: true`/`lastSaveResult: 'failed'` claims (and similar for REQ-HSF-004) are not cited. Likely source `aggregates.md` is not in the spec's source-of-truth header.

**Remediation**: Add `docs/domain/aggregates.md` to the source-of-truth header and cite the section that mandates the semantics. If aggregates.md doesn't mandate them, mark as new design decisions with rationale.

---

## FIND-SPEC-007 (major) — REQ-HSF-006 ambiguous on throw vs return-Result
**Dimension**: correctness, testability
**Files**: `specs/behavioral-spec.md:160,168`, `specs/verification-architecture.md:77`, `docs/domain/code/ts/src/capture/workflows.ts:115-117`

EARS line 160 says "throwing"; AC line 168 says "throws (or returns an error result)"; PROP-HSF-012 says "throws/rejects". Canonical signature is `Promise<ResolvedState>` — no Result variant.

**Remediation**: Pick one. Given `Promise<ResolvedState>`: (a) `Promise.reject(InvariantViolated)` or (b) sync throw before returning a Promise. Update EARS/AC/PROP-HSF-012 wording. Drop "or returns an error result".

---

## FIND-SPEC-008 (minor) — Adversary prompt path was wrong; spec is correct
**Dimension**: traceability
**Files**: `specs/behavioral-spec.md:6,25`, `docs/domain/code/ts/src/capture/internal-events.ts:21-22,85-95`

The review prompt referenced `shared/internal-events.ts` (does not exist). Actual file is `capture/internal-events.ts` (the spec correctly cites it). Both events exist (lines 85-95). Open Question §1 is honest.

**Remediation**: No change needed.

---

## FIND-SPEC-009 (minor) — `SaveFailedStage.error` has no documented consumer
**Dimension**: spec_gap
**Files**: `docs/domain/code/ts/src/capture/stages.ts:93-97`, `specs/behavioral-spec.md:36`

`SaveFailedStage.error: SaveError` carried in but not observed by any REQ; emitted events drop it.

**Remediation**: Add explicit non-functional REQ: "The `SaveError` carried by `SaveFailedStage` is observed for logging only; it does NOT appear in any emitted `CaptureInternalEvent`. Telemetry consumers subscribe to the public `NoteSaveFailed` event for failure reasons."

---

## FIND-SPEC-010 (minor) — Tier 0 PROPs lack a concrete encoding artifact
**Dimension**: testability
**Files**: `specs/verification-architecture.md:70,81,89`

PROP-HSF-005, PROP-HSF-016 are Tier 0 type-level. The harness/tooling (`@ts-expect-error`? `tsd`? `expect-type`?) is unspecified. If `tsc` silently passes, these PROPs disappear from green-phase evidence.

**Remediation**: Specify the tooling concretely, e.g. "Tier 0 PROPs are encoded in `tests/types/handle-save-failure.type-test.ts` using `@ts-expect-error`; `tsc --noEmit` runs in CI and treats absence of expected errors as failure." Otherwise downgrade to Tier 2 with a runtime mock.

---

## FIND-SPEC-011 (minor) — Open Question §1 lacks explicit fallback contract
**Dimension**: spec_gap
**Files**: `specs/behavioral-spec.md:278`

OQ §1 (no `CancelSwitchRequested`) parks the question without stating the fallback. REQ-HSF-005 implicitly is the fallback (zero events; UI relies on returned `ResolvedState`), but the link is not explicit.

**Remediation**: Append to OQ §1: "Until resolved, the cancel-switch path emits zero events; the UI must rely on the synchronous `ResolvedState { resolution: 'cancelled' }` return value to update its state."
