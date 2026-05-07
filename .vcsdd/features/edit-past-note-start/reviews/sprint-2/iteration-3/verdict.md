# Phase 3 Adversarial Re-Review (Iteration 3) — edit-past-note-start Sprint 2

**Feature**: edit-past-note-start
**Sprint**: 2 (block-based migration)
**Phase**: 3 (adversarial re-review)
**Mode**: lean
**Iteration**: 3
**Reviewer**: adversary (fresh-context)
**Timestamp**: 2026-05-07T03:45:00.000Z
**Spec under review**: behavioral-spec.md Revision 7, verification-architecture.md Revision 7
**Prior failure**: iteration-1 verdict (FAIL, 5 major + 3 minor)

---

## Overall Verdict: **PASS**

All 8 Phase 3 findings (FIND-EPNS-S2-P3-001 through FIND-EPNS-S2-P3-008) are verifiably
resolved by direct code/test inspection. All 5 dimensions PASS. Test evidence: 119/119
feature tests pass; 1847/1847 total tests pass; 0 fail; 4 pre-existing todos.

**No critical or major findings remain.** No new issues identified during the re-review.

---

## Dimensions

| Dimension | Verdict |
|-----------|---------|
| spec_implementation_fidelity | **PASS** |
| proof_obligation_coverage    | **PASS** |
| purity_boundary_compliance   | **PASS** |
| error_handling_robustness    | **PASS** |
| regression_safety            | **PASS** |

---

## Per-Finding Resolution Verification

### FIND-EPNS-S2-P3-001 (PC-004 idle+non-null direction) — RESOLVED

- **Implementation**: `pipeline.ts:101-105` throws synchronously at workflow entry when
  `currentState.status === "idle" && currentNote !== null`, BEFORE `classifyCurrentSession`
  or any port invocation:
  ```ts
  if (currentState.status === "idle" && currentNote !== null) {
    throw new Error(
      "EditPastNoteStart: currentNote must be null when state.status is 'idle'"
    );
  }
  ```
- **Test coverage**: `prop-027-precondition-throws.harness.test.ts:331-376` adds sub-case (e)
  with two tests: (1) throws when idle + non-null currentNote; (2) verifies all 4 spy ports
  (clockNow, blurSave, emit, parseMarkdownToBlocks) are NOT invoked.
- **Spec alignment**: `behavioral-spec.md:586,593` PC-004 row and REQ-EPNS-013 acceptance
  criteria both explicitly cover `idle + currentNote !== null` direction.

### FIND-EPNS-S2-P3-002 (REQ-008 scope ambiguity) — RESOLVED

- **Spec**: `behavioral-spec.md:443-447` adds an explicit Revision 7 scope preamble:
  > "REQ-EPNS-008 describes the post-condition contract that the application/state-machine
  > layer must apply when consuming the workflow's NewSession result. The
  > runEditPastNoteStartPipeline workflow itself returns Result<NewSession, SwitchError>
  > only and does NOT mutate EditingSessionState. The path-conditional table below is the
  > contract for the upstream EditingSessionTransitions reducer..."
- The named upstream callers (`focusOnBlock`, `refocusBlockSameNote`) are explicitly listed.
  Verification of REQ-EPNS-008's table is correctly deferred to integration tests of the
  upstream reducer (out of scope for this workflow's unit tests).

### FIND-EPNS-S2-P3-003 (R6 advisories carryover) — RESOLVED

- **R6-001** (PC-001 same-note + non-null snapshot silent-ignore):
  `pipeline.test.ts:880-960` adds two tests under
  `"pipeline — R6-001: same-note + non-null snapshot is silently ignored"`:
  - "same-note path proceeds normally when snapshot is non-null (silent ignore)" — asserts
    `result.value.note === currentNote` (existing note reused, snapshot ignored).
  - "same-note + non-null snapshot: BlockFocused emitted once, no blurSave" — asserts
    `blurSaveCount === 0` and exactly one `block-focused` event.
- **R6-002** (PC-004 idle + non-null sub-case): see FIND-001 above. Sub-case (e) of
  PROP-EPNS-027 added at `prop-027:329-376`.
- **R6-003** (`hydrateSnapshot` stale port name): purged from active spec text. The only
  remaining occurrences in `behavioral-spec.md` and `verification-architecture.md` are
  inside Revision-history changelogs (lines 16, 49, 64 of behavioral-spec.md and lines 16,
  49 of verification-architecture.md) — historical references, NOT in current contract
  text. The active text uses `parseMarkdownToBlocks` consistently
  (e.g., `behavioral-spec.md:194,584,589`; `verification-architecture.md:16,143-152,206`).

### FIND-EPNS-S2-P3-004 (PC-002 clock before parse) — RESOLVED

- **Implementation**: `start-new-session.ts:48-52` reorders so `resolveNote()` (which calls
  `parseMarkdownToBlocks`) runs BEFORE `ports.clockNow()`:
  ```ts
  const note = resolveNote(request, decision, ports);
  // REQ-EPNS-012: exactly one Clock.now() call per invocation (after parse, before emit)
  const startedAt = ports.clockNow();
  ```
  On PC-002 parse failure, `resolveNote` throws (line 99-101) before `clockNow` is called.
- **Test coverage**: `prop-027-precondition-throws.harness.test.ts:380-413` extended sub-case
  (b) explicitly spies on `clockNow` and asserts `clockCallCount === 0` after a parse-failure
  throw. The earlier "no events emitted" assertion is also present.

### FIND-EPNS-S2-P3-005 (sync/async drift) — RESOLVED

- **Type contract** (`docs/domain/code/ts/src/capture/workflows.ts:114-119`):
  `EditPastNoteStart` returns `Promise<Result<NewSession, SwitchError>>`.
- **Implementation**:
  - `pipeline.ts:93-96` declares `runEditPastNoteStartPipeline` as `async` returning
    `Promise<Result<NewSession, SwitchError>>`.
  - `pipeline.ts:51-55` declares `blurSave: (...) => Promise<Result<NoteFileSaved, SaveError>>`.
  - `flush-current-session.ts:45-50` declares `flushCurrentSession` as `async`; awaits
    `ports.blurSave(...)` at line 72.
  - Pipeline awaits flush at line 132.
- **Tests**: All test files verified to use `await runEditPastNoteStartPipeline(...)` and
  `Promise.resolve(...)` stubs. Spot-checks confirmed in `pipeline.test.ts:206-207`,
  `prop-027:86,200,387`, `prop-028:67-68`. Async migration is complete and consistent.

### FIND-EPNS-S2-P3-006 (local isEmpty re-implementation) — RESOLVED

- **New file**: `is-empty-note.ts` (32 lines) — exports the canonical `isEmptyNote(note)`
  with explicit comment: "Canonical NoteOps.isEmpty implementation per shared/note.ts:174."
- **Import**: `classify-current-session.ts:16` imports `isEmptyNote` from `./is-empty-note.js`.
  No inline reimplementation remains in classify-current-session.ts; comment at line 78-79
  documents the move and references FIND-006.
- The function body matches the spec definition (`behavioral-spec.md:240-246`): single
  paragraph block whose content is empty or whitespace-only.

### FIND-EPNS-S2-P3-007 (duplicate same-note check) — RESOLVED

- **Implementation**: `pipeline.ts` contains NO `isCrossNoteRequest` helper or equivalent
  noteId comparison. The PC-001 cross-note check at lines 122-129 derives crossness from
  `classifyCurrentSession`'s decision:
  ```ts
  const decision = classifyCurrentSession(currentState, request, currentNote);
  // ...
  const isCrossNote = decision.kind !== "same-note";
  if (isCrossNote && request.snapshot === null) {
    throw new Error(
      "EditPastNoteStart: cross-note request requires non-null snapshot"
    );
  }
  ```
- Classifier is now the SOLE same-note authority. Comment at `pipeline.ts:118` documents the
  invariant.

### FIND-EPNS-S2-P3-008 (PROP-028 fixed-point) — RESOLVED

- **Test**: `prop-028-idempotent-refocus.harness.test.ts:235-271` adds the
  `(c) both invocations return structurally equal NewSession objects` test. Uses a fixed
  clock (`fixedTimestamp = makeTimestamp(42000)`) to make `startedAt` deterministic across
  the two calls, then asserts `expect(r1).toEqual(r2)` at line 270.
- **Spec alignment**: `verification-architecture.md:207` PROP-EPNS-028 sub-claim (c) is now
  explicitly defined as workflow-output equality (`r1 toEqual r2`), with EditingSessionState
  mutation idempotency correctly deferred to the upstream reducer (per the REQ-008 scope
  preamble from FIND-002).

---

## Five-Dimension Re-Review Detail

### 1. spec_implementation_fidelity — PASS

- Same-note path correctly returns `Ok(NewSession)` reusing `currentNote`; no save I/O
  (`pipeline.ts` + `flush-current-session.ts:55-57` + `start-new-session.ts:86-88`).
- All 4 PC violations throw synchronously with the spec-mandated message prefixes:
  - PC-001 cross-note + null snapshot: "cross-note request requires non-null snapshot"
    (`pipeline.ts:126-128`).
  - PC-002 parse failure: throws via `start-new-session.ts:99-101`.
  - PC-004 editing/save-failed + null currentNote: "currentNote must not be null when
    state.status is 'editing' or 'save-failed'" (`pipeline.ts:108-115`).
  - PC-004 idle + non-null currentNote: "currentNote must be null when state.status is
    'idle'" (`pipeline.ts:101-105`).
- SaveError → NoteSaveFailureReason mapping (REQ-EPNS-004) intact at
  `flush-current-session.ts:111-123` and exhaustively tested by
  `prop-026-save-error-mapping.harness.test.ts`.

### 2. proof_obligation_coverage — PASS

- All 28 PROP-EPNS-001..028 have runnable harnesses (verified via traceability beads
  `BEAD-058..BEAD-065` plus integrated coverage in step1/step2/step3/pipeline test files
  per `state.json` `BEAD-054..BEAD-057`).
- PROP-EPNS-026 enumerates all 6 SaveError discriminants.
- PROP-EPNS-027 enumerates all 5 sub-cases (a)-(e); sub-case (b) now asserts clock NOT
  called on parse failure; sub-case (e) covers idle+non-null direction.
- PROP-EPNS-028 covers sub-cases (a),(b),(c),(d) with (c) using `r1.toEqual(r2)` fixed-clock
  workflow-output equality assertion.

### 3. purity_boundary_compliance — PASS

- `classifyCurrentSession` is pure: no port references; only branches on `state.status`,
  compares noteIds, and calls `isEmptyNote` (also pure). Throws for invalid states
  (`saving`/`switching`) and inconsistent inputs.
- `flushCurrentSession`:
  - same-note path: zero I/O (`flush-current-session.ts:55-57`).
  - no-current path: zero I/O (line 52-53).
  - empty path: 1 `clockNow` + 1 `emit`.
  - dirty-success: `await blurSave` + `emit(saved)`.
  - dirty-fail: `await blurSave` + 1 `clockNow` + `emit(failed)`.
- `startNewSession` Clock count: exactly 1 in all reachable paths
  (`start-new-session.ts:52`); on PC-002 throw, 0 (verified by extended PROP-027(b) test).

### 4. error_handling_robustness — PASS

- All 4 PC violation paths throw with descriptive messages and zero port invocation
  (verified by `prop-027` sub-cases (a)-(e) plus `pipeline.test.ts:778-811` PC-001 spy test).
- SwitchError shape (`flush-current-session.ts:96-105`): `kind: "save-failed-during-switch"`,
  `underlying: SaveError`, `pendingNextFocus: { noteId, blockId }` — matches REQ-EPNS-011
  and is verified by `pipeline.test.ts:714-748` and `prop-005-switch-error-exhaustive`.
- Async error propagation: `pipeline.test.ts:773-855` and all `prop-027` tests use
  `await expect(...).rejects.toThrow(...)` confirming Promise rejection paths work.

### 5. regression_safety — PASS

- Evidence log `sprint-2-bundled-green-phase.log:25-31`: 1847 pass, 4 todo, 0 fail across
  149 files (1851 total, 27671 expect calls). 4 todos are pre-existing.
- No modifications to type contract files under `docs/domain/code/ts/src/`; the workflow
  contract `EditPastNoteStart` was already async (`workflows.ts:114-119`), so no contract
  change was required for FIND-005.
- Other features (capture-auto-save, copy-body, vault-scan, etc.) confirmed in the test
  baseline (149 test files / 1851 tests / 0 fail).

---

## Anti-Leniency Calibration

I actively searched for residual issues during this re-review. The following candidate
concerns were ruled out:

- **`hydrateSnapshot` in changelogs**: present in Revision 4 history table only; NOT in the
  active normative spec text. This is correct historical preservation.
- **PROP-028 sub-case (c) deferral**: the spec change explicitly redefines (c) as workflow
  output equality (not state equality), making it directly testable at the workflow boundary.
  State-mutation idempotency is correctly deferred to the upstream reducer's tests.
- **`blurSave` async stubs in tests**: spot-checked all `.test.ts` and `.harness.test.ts`
  files — every blurSave fake returns `Promise.resolve(...)`. No sync stub regressions.
- **`docs/domain/code/ts/src/capture/workflows.ts`**: read directly; `EditPastNoteStart` is
  declared `Promise<Result<NewSession, SwitchError>>`; impl signature matches.
- **PC-002 ordering**: confirmed `resolveNote` runs before `clockNow` in
  `start-new-session.ts:49-52`; the comment at lines 38-40 documents the FIND-004 fix; the
  test at `prop-027:380-413` enforces the invariant.

No negative observations remain. The 8 P3 findings are all verifiably resolved with
matching code, tests, and spec changes. Convergence achieved.

---

## Convergence Signals

- **Findings count**: 0 critical, 0 major, 0 minor.
- **Test pass rate**: 119/119 feature, 1847/1847 total (0 fail, 4 pre-existing todos).
- **All 8 P3 findings**: each independently verified resolved via direct code/test
  inspection (not just self-claim from the evidence log).
- **All 28 proof obligations**: covered by harness tests or integrated tests per
  state.json traceability.
- **Spec/impl/contract triangle**: aligned (Revision 7 spec + impl + workflows.ts contract).
