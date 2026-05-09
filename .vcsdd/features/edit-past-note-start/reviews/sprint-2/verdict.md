# Phase 3 Adversarial Review — edit-past-note-start Sprint 2

**Feature**: edit-past-note-start
**Sprint**: 2 (block-based migration)
**Phase**: 3 (adversarial review)
**Mode**: lean
**Iteration**: 1
**Reviewer**: adversary (fresh-context)
**Timestamp**: 2026-05-07T02:45:00.000Z
**Spec under review**: behavioral-spec.md Revision 6, verification-architecture.md Revision 6

---

## Overall Verdict: **FAIL**

A dimension is FAIL if it contains a critical or major finding. 3 of 5 dimensions FAIL. The implementation has correct happy-path behavior but contains a documented spec gap (PC-004 idle direction not enforced), a contract-shape divergence (sync vs async), an unaddressed advisory (R6-001/002/003), and a structural gap where the spec mandates state transitions that the implementation does not perform.

---

## Dimensions

| Dimension | Verdict |
|-----------|---------|
| spec_implementation_fidelity | **FAIL** |
| proof_obligation_coverage    | **FAIL** |
| purity_boundary_compliance   | **PASS** |
| error_handling_robustness    | **FAIL** |
| regression_safety            | **PASS** |

---

## Findings

| ID | Severity | Dimension | Category | Summary |
|----|----------|-----------|----------|---------|
| FIND-EPNS-S2-P3-001 | major | spec_implementation_fidelity | requirement_mismatch | PC-004 idle + non-null `currentNote` direction is not enforced by the pipeline (spec REQ-EPNS-013 mandates throw; impl only catches the editing/save-failed direction) |
| FIND-EPNS-S2-P3-002 | major | spec_implementation_fidelity | spec_gap | REQ-EPNS-008 path-conditional `EditingSessionState` post-conditions are NOT implemented by the pipeline. The pipeline returns `NewSession` only and explicitly delegates state mutation to the caller (`pipeline.ts:78`). Tests acknowledge this gap (`pipeline.test.ts:589`). |
| FIND-EPNS-S2-P3-003 | major | proof_obligation_coverage | test_coverage | Three Revision-6 advisory findings (FIND-EPNS-S2-R6-001..003) were deferred to Phase 2a but were NOT addressed: no test for PC-001 same-note + non-null snapshot (silent-ignore), no test or impl for PC-004 idle + non-null currentNote, and `hydrateSnapshot` port-name reference remains in spec |
| FIND-EPNS-S2-P3-004 | major | error_handling_robustness | requirement_mismatch | PC-002 enforcement violates "no port invoked" spec claim. `startNewSession` calls `clockNow()` BEFORE `parseMarkdownToBlocks`, so on PC-002 throw the clock IS invoked. Either impl must reorder, or spec PC-002 must be relaxed. PROP-EPNS-027 (b) test does not check `clockNow` invocation — the test misses this regression. |
| FIND-EPNS-S2-P3-005 | major | spec_implementation_fidelity | requirement_mismatch | Type contract `workflows.ts` declares `EditPastNoteStart` and `BlurSave` as `Promise<Result<...>>` (async) but implementation is synchronous (`Result<...>` directly, no Promise). The async/sync drift breaks the published port contract. Tests mirror the sync impl, so they do not catch the contract divergence. |
| FIND-EPNS-S2-P3-006 | minor | spec_implementation_fidelity | requirement_mismatch | `classify-current-session.ts:84-90` reimplements `isEmptyNote` inline instead of calling canonical `NoteOps.isEmpty` from `shared/note.ts:174`. Spec REQ-EPNS-002 line 239 explicitly forbids workflow-local redefinition. |
| FIND-EPNS-S2-P3-007 | minor | structural_integrity (mapped to error_handling_robustness for verdict) | spec_gap | `pipeline.ts:142-148` `isCrossNoteRequest` helper duplicates the same-note detection that the spec assigns solely to `classifyCurrentSession` ("classification is the sole decision point"). Used only for PC-001 pre-check, but is a structural duplication. |
| FIND-EPNS-S2-P3-008 | minor | proof_obligation_coverage | test_quality | PROP-EPNS-028 (c) "EditingSessionState idempotent fixed point" is not asserted by the harness — the test verifies (a), (b), (d) and absence-of-side-effects only. Sub-claim (c) is silently dropped because the impl does not mutate state. |

---

## Detailed evidence per finding

### FIND-EPNS-S2-P3-001 (major) — PC-004 idle direction not enforced

- **Spec**: `behavioral-spec.md:197-199` (PC-004) and `behavioral-spec.md:578` (REQ-EPNS-013 acceptance criteria) require: "PC-004 violation (idle + `currentNote !== null`): same throw pattern; ... No port is invoked. No state-machine field is mutated."
- **Implementation**: `pipeline.ts:99-106` only checks `(currentState.status === "editing" || currentState.status === "save-failed") && currentNote === null`. The reverse direction (`status === "idle" && currentNote !== null`) is silently allowed.
- **Impact**: A caller that violates the precondition by passing a non-null `currentNote` while in idle state will not be told about its bug. The workflow will continue and produce results that may inappropriately reference an in-memory note.
- **Repro**: invoke `runEditPastNoteStartPipeline` with `currentState: makeIdleState()`, `currentNote: <a non-null Note>`, cross-note snapshot. Expected: throw. Actual: completes without error (cross-note path, since idle is always cross-note).
- **Routing**: Phase 2b (impl fix) + Phase 2a (add test).

### FIND-EPNS-S2-P3-002 (major) — REQ-EPNS-008 state transitions not implemented

- **Spec**: `behavioral-spec.md:438-447` defines an authoritative path-conditional `EditingSessionState` post-condition table: idle/empty/dirty-success/save-failed→success → `editing` with `isDirty: false`; same-note on EditingState → only `focusedBlockId` updated; same-note on SaveFailedState → no change.
- **Implementation**: `pipeline.ts:82-136` `runEditPastNoteStartPipeline` returns only `Result<NewSession, SwitchError>`. It never returns or transitions an `EditingSessionState`. Comment at `pipeline.ts:78` says: "For EditingState: caller is responsible for updating EditingSessionState.focusedBlockId. For SaveFailedState: ... state is unchanged."
- **Test acknowledgement**: `pipeline.test.ts:589` says verbatim "Pipeline does not mutate state directly; this is tested via startNewSession behavior". The acceptance criteria from REQ-EPNS-008 about `EditingSessionState` are therefore untested at the pipeline level.
- **Impact**: The state machine described in the spec is not the unit under test. Verification of REQ-EPNS-008's path-conditional table is delegated to a layer above the pipeline (caller), but no test exists for that integration. The `isDirty` preservation invariant (a data-safety claim in PROP-EPNS-004) is tested only by absence-of-blurSave-call in PROP-EPNS-028 (d), not by direct state observation.
- **Routing**: Phase 1a (clarify scope) or Phase 2b (extend impl to return updated state). If Phase 1a, REQ-EPNS-008 must explicitly demote state mutations to "informational", not workflow output.

### FIND-EPNS-S2-P3-003 (major) — Three R6 advisory findings unaddressed

- **R6-001**: Spec says "PC-001 same-note + `snapshot !== null`: snapshot silently ignored; no error thrown" (`behavioral-spec.md:181`). No test in `__tests__/edit-past-note-start/` verifies this silent-ignore behavior. Searched all 12 test files; no case constructs `request.noteId === state.currentNoteId` with `snapshot: makeSnapshot(...)`.
- **R6-002**: Same as FIND-EPNS-S2-P3-001 — spec mandates idle + non-null currentNote throw; impl does not enforce it; no test verifies it.
- **R6-003**: `verification-architecture.md:199` PROP-EPNS-027 description still says "verified by spy on `clockNow`, `blurSave`, `hydrateSnapshot`, `emit`". `behavioral-spec.md:574` REQ-EPNS-013 acceptance criteria also still references `hydrateSnapshot`. The port is named `parseMarkdownToBlocks` in the implementation. Stale port name remains in two spec files.
- **Tracking beads**: BEAD-051, BEAD-052, BEAD-053 are still `status: "open"` in `state.json`.
- **Routing**: Phase 1a (purge `hydrateSnapshot`), Phase 2a (add R6-001/R6-002 tests), Phase 2b (R6-002 impl).

### FIND-EPNS-S2-P3-004 (major) — PC-002 throw violates "no port invoked"

- **Spec**: `behavioral-spec.md:575` REQ-EPNS-013 acceptance criteria: "PC-002 violation (`parseMarkdownToBlocks` failure): implementation throws Error... No port is invoked; no state mutation." `verification-architecture.md:199` repeats: "no port is invoked (verified by spy on `clockNow`, `blurSave`, `hydrateSnapshot`, `emit`)".
- **Implementation**: `start-new-session.ts:41` calls `const startedAt = ports.clockNow();` BEFORE line 43 `const note = resolveNote(...)` which calls `parseMarkdownToBlocks`. On parse failure, `clockNow` has already been invoked exactly once.
- **Test gap**: PROP-EPNS-027 (b) at `prop-027-precondition-throws.harness.test.ts:194-225` only asserts `expect(events).toHaveLength(0)`. It does NOT spy on `clockNow` and does NOT assert clock was uncalled. The test inadvertently passes.
- **Impact**: Either the implementation must defer `clockNow()` until after `resolveNote()`, or the spec must relax PC-002 to "no events emitted" rather than "no port invoked". As-is, spec and impl disagree silently.
- **Routing**: Phase 2b (reorder calls in start-new-session) and Phase 2a (strengthen PROP-027 (b) to spy on clock).

### FIND-EPNS-S2-P3-005 (major) — Async/sync contract drift

- **Type contract**: `docs/domain/code/ts/src/capture/workflows.ts:81` `CaptureAutoSave` returns `Promise<Result<NoteFileSaved, SaveError>>`. Same file `:114-119` `EditPastNoteStart` returns `Promise<Result<NewSession, SwitchError>>`. Spec port contract `verification-architecture.md:114-118` declares `BlurSave` as `Promise<Result<NoteFileSaved, SaveError>>`.
- **Implementation**:
  - `pipeline.ts:43-50` `EditPastNoteStartPorts.blurSave` is declared as synchronous `Result<NoteFileSaved, SaveError>` (no Promise).
  - `pipeline.ts:82-85` `runEditPastNoteStartPipeline` returns synchronous `Result<NewSession, SwitchError>` (no Promise).
- **Impact**: A real `CaptureAutoSave` implementation is async (file I/O) — when wired to this pipeline, the type-incompatible blurSave port will not satisfy the published `BlurSave` contract. The Sprint 2 migration silently changed the async contract to sync. Either the pipeline must be made async, or the type contract must be amended (Type Contract Delta 3).
- **Routing**: Phase 1a (declare new contract delta) or Phase 2b (re-async the pipeline).

### FIND-EPNS-S2-P3-006 (minor) — `isEmptyNote` re-implemented locally

- **Spec**: `behavioral-spec.md:239` "This is the **canonical, single-source-of-truth** definition from `NoteOps` in the Shared Kernel. This spec uses it directly — no workflow-local redefinition."
- **Implementation**: `classify-current-session.ts:84-90` defines a local `isEmptyNote(note)` function that hardcodes the rule (`blocks.length === 1 && blocks[0].type === 'paragraph' && content.trim().length === 0`) instead of importing the canonical `NoteOps.isEmpty`. Risk: the canonical definition could evolve and this duplicate could drift.
- **Routing**: Phase 2c (refactor to use canonical implementation, once exported from the domain types package).

### FIND-EPNS-S2-P3-007 (minor) — `isCrossNoteRequest` duplicates classification logic

- **Spec**: `behavioral-spec.md:127, 331` "There is NO pre-pipeline guard; classification is the sole decision point."
- **Implementation**: `pipeline.ts:142-148` `isCrossNoteRequest(state, request)` performs the same noteId comparison that `classifyCurrentSession` does. Used only for PC-001 pre-check, but creates two locations where same-note detection lives.
- **Routing**: Phase 2c — reorganize so PC-001 is checked from inside `classifyCurrentSession` or via a single shared predicate exported from `classify-current-session.ts`.

### FIND-EPNS-S2-P3-008 (minor) — PROP-EPNS-028 (c) silently dropped

- **Spec**: `verification-architecture.md:200` PROP-EPNS-028 sub-claim (c): "EditingSessionState after the second call equals EditingSessionState after the first call (idempotent fixed point)".
- **Implementation/Test**: `prop-028-idempotent-refocus.harness.test.ts` does not assert (c). The test states are constructed locally and never compared after the call because the pipeline does not return updated state (see FIND-EPNS-S2-P3-002).
- **Routing**: Either remove sub-claim (c) from the spec (since the pipeline does not own state mutation) or add a state-comparison harness once the pipeline is extended.

---

## Positive observations (anti-leniency calibration)

- BlockFocused emission and `editor-focused-on-past-note` absence are explicitly tested (`pipeline.test.ts:870`, `step3:339-355`). PASS regression check.
- `pendingNextFocus.{noteId, blockId}` shape verified at every error path (`step2:457-480`, `pipeline.test.ts:471-473`, prop-005 harness).
- SaveError → NoteSaveFailureReason mapping is enumerated for all 6 fs/validation discriminants (`step2:426-455` and `prop-026:89-156`).
- 1841/1845 runtime tests pass (4 pre-existing todos). Regression baseline preserved.
- BlurSave NOT invoked on same-note path is verified by both `step2:380-399` and `prop-028:202-230` — data-safety claim PROP-EPNS-004 holds at runtime.

These positive observations do not lift the FAIL — the open major findings remain.

---

## Recommended routing

| Finding | Phase | Reason |
|---------|-------|--------|
| FIND-EPNS-S2-P3-001 | 2b + 2a | Add idle+non-null PC-004 throw; add test |
| FIND-EPNS-S2-P3-002 | 1a or 2b | Decide if pipeline owns state transitions |
| FIND-EPNS-S2-P3-003 | 1a + 2a + 2b | Purge `hydrateSnapshot`; add R6-001 / R6-002 tests; impl R6-002 |
| FIND-EPNS-S2-P3-004 | 2b + 2a | Reorder `clockNow` after `resolveNote`; spy on clock in PROP-027 (b) |
| FIND-EPNS-S2-P3-005 | 1a or 2b | Reconcile async/sync contract |
| FIND-EPNS-S2-P3-006 | 2c | Use canonical `NoteOps.isEmpty` |
| FIND-EPNS-S2-P3-007 | 2c | Eliminate duplicate same-note detection |
| FIND-EPNS-S2-P3-008 | 1b or 2a | Remove sub-claim (c) or add harness |

Earliest affected phase: **1a** (FIND-005 contract drift if treated as new delta; FIND-002 if state-transition scope must be clarified; FIND-003 R6-003 stale port name).
