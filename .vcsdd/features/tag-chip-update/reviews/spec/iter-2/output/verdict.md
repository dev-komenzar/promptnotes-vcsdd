# Phase 1c Spec Review — tag-chip-update — iteration 2

**Verdict**: FAIL
**Reviewed by**: vcsdd-adversary (fresh context)
**Date**: 2026-05-01

## Per-Dimension Verdict

| Dimension | Verdict | Notes |
|-----------|---------|-------|
| Spec Coverage | PASS | Workflow 4 §sources fully covered; ports `getAllSnapshots` / `writeMarkdown` / `publishInternal` declared as contract deltas with rationale. No silently-dropped step. |
| Spec Testability | PASS | `tagsEqualAsSet` is the single canonical predicate (behavioral-spec.md:118-122); structured `cause` discriminator removes brittle `detail` substring matching; idempotency pre-check is operationally testable (PROP-TCU-004). |
| Spec/Canonical Consistency | **FAIL** | `BuildTagChipSaveRequest` and `UpdateProjectionsAfterSave` signatures deviate from `docs/domain/code/ts/src/curate/workflows.ts` and are NOT declared as contract deltas. The "4 deltas" enumeration is incomplete; two more deltas are silently introduced. |
| Verification Architecture Soundness | **FAIL** | The relation `applyTagOperation := (deps) => (n,c) => applyTagOperationPure(n, c, deps.clockNow())` (verification-architecture.md:73-76, behavioral-spec.md:53) reintroduces a Clock call on the canonical `applyTagOperation` path, which directly contradicts the single-Clock budget that places the call in the orchestrator AFTER the idempotency pre-check (behavioral-spec.md:148-165). On the idempotent path, the canonical `applyTagOperation` would call `clockNow()` if invoked, but the orchestrator must avoid it. The resolution is asymmetric: the workflow uses a different shape than the canonical wrapper, but the spec does not declare which one the workflow actually invokes. |
| Error/Edge Case Rigor | **FAIL** | The `tag-vo-invalid` cause is included in the `SaveValidationError.cause` delta (behavioral-spec.md:216, :286) yet REQ-TCU-007 declares the `tag`-error path is dead (line 487). The spec simultaneously claims (a) dead code removed and (b) extends the canonical error union with a discriminator for the dead variant — an internal contradiction that re-creates the FIND-014 surface. |

**Overall Verdict: FAIL** — three dimensions fail. Two genuinely new defects (signature deltas not declared) plus one regression of FIND-014 (dead-code variant resurrected at the type level).

---

## Resolution of iter-1 findings

| Finding | Resolved? | Evidence |
|---------|-----------|----------|
| FIND-SPEC-TCU-001 | YES | behavioral-spec.md:104-108 restates canonical `(deps) => (command) => Promise<Result<...>>`. verification-architecture.md:67-71 keeps `ApplyTagOperation` curried. The pure helper `ApplyTagOperationPure` is added at verification-architecture.md:177-181 as the proof target. The choice corresponds to option (b) of the original suggestion. |
| FIND-SPEC-TCU-002 | YES | behavioral-spec.md:127-144 binds the contract: `addTag` is short-circuit-idempotent per `note.ts:55`, the workflow pre-checks before calling `applyTagOperation`, and the duplicate-tag mapping is removed from REQ-TCU-007 (line 487 marks it dead). REQ-TCU-003 and REQ-TCU-007 are no longer mutually exclusive. |
| FIND-SPEC-TCU-003 | YES | verification-architecture.md:35-42 reclassifies `applyTagOperation` as effectful shell (clock); the proof target is `applyTagOperationPure`. PROP-TCU-001 (verification-architecture.md:219) targets the pure helper, which is testable under fast-check. **However see new FIND-SPEC-TCU-021 below for a residual issue introduced by this resolution.** |
| FIND-SPEC-TCU-004 | YES | `GetAllSnapshots` declared as Delta 2 (behavioral-spec.md:294-302; verification-architecture.md:108-112). Threaded through `TagChipUpdateDeps` (behavioral-spec.md:313-322). |
| FIND-SPEC-TCU-005 | PARTIAL | `WriteMarkdown` is anchored to `TagChipUpdateDeps` (behavioral-spec.md:315; verification-architecture.md:122-134) and described as "the same Vault adapter port used by CaptureAutoSave" (behavioral-spec.md:330). Issue: the spec says this type is "NOT currently exported from a canonical file" (behavioral-spec.md:333), yet it never cites where `writeMarkdown` actually lives in the canonical TS / Rust today. Saying "same as CaptureAutoSave" without a file path leaves Phase 2 implementers guessing — the original FIND-005 critique was specifically that `writeMarkdown`'s home is unspecified. The fix renames the gap as a "contract delta" without resolving the canonical location. **Marked PARTIAL but not a fresh blocker** because the delta path (`docs/domain/code/ts/src/curate/ports.ts`) is now declared. |
| FIND-SPEC-TCU-006 | YES | `EventBusPublishInternal` declared as Delta 3 (behavioral-spec.md:303-309; verification-architecture.md:151-156). `publishInternal` added to `TagChipUpdateDeps` (behavioral-spec.md:319). |
| FIND-SPEC-TCU-007 | YES | behavioral-spec.md:104-108 restates canonical `Promise<Result<IndexedNote, SaveError>>`. Pipeline diagram marks Step 5 with "ASYNC write I/O" annotation (line 59). Acceptance criterion line 363 / 384: "Workflow never throws; all errors as `Err(SaveError)`". |
| FIND-SPEC-TCU-008 | YES | Single canonical `tagsEqualAsSet` predicate (behavioral-spec.md:118-122; verification-architecture.md:97-100). All loose phrasings replaced. |
| FIND-SPEC-TCU-009 | YES | behavioral-spec.md:95-96 replaces the "passed by reference; mutated" wording with: "immutable input; `updateProjectionsAfterSave` returns a new `Feed` via `FeedOps.refreshSort`". |
| FIND-SPEC-TCU-010 | YES (with caveat — see new FIND-SPEC-TCU-022) | `SaveValidationError` extended with structured `cause` discriminator (behavioral-spec.md:206-219, :269-290). PROP-TCU-007 refined to assert per-cause variant (verification-architecture.md:225). The structural fix is correct, but the introduced `cause: 'tag-vo-invalid'` regresses FIND-014's "dead code removed" claim — flagged as new FIND-022. |
| FIND-SPEC-TCU-011 | YES | `TagInventoryUpdated.occurredOn` semantics documented at behavioral-spec.md:559-562 and verification-architecture.md:198-202: "represents the wall-clock moment at which the tag-chip operation was performed; SaveNoteRequested.occurredOn and TagInventoryUpdated.occurredOn are the same instant by design — coherent single moment in the event log. This is a deliberate design choice, not a timing shortcut." |
| FIND-SPEC-TCU-012 | YES | Single Clock.now() per invocation, threaded through all four sites (behavioral-spec.md:148-165). Clock budget table updated (lines 154-165) and restated in REQ-TCU-012 (lines 596-605). Maximum: 1. |
| FIND-SPEC-TCU-013 | YES | Idempotent path Clock budget = 0 (behavioral-spec.md:158-159, :600-602). The pre-check is a pure tag-set membership check before `Clock.now()` and before `applyTagOperation` (lines 393-395). |
| FIND-SPEC-TCU-014 | YES | TagError mapping removed; REQ-TCU-007 reduced to single live variant `frontmatter.updated-before-created` (behavioral-spec.md:480). Dead variants documented for exhaustiveness at lines 485-487. |
| FIND-SPEC-TCU-015 | YES | Non-null invariant explicit at REQ-TCU-009 (behavioral-spec.md:542). Tier-0 type assertion in PROP-TCU-005 (verification-architecture.md:223). |
| FIND-SPEC-TCU-016 | YES | `applyTagOperation` and `applyTagOperationPure` both unified to `Result<MutatedNote, SaveError>` (behavioral-spec.md:175-176; verification-architecture.md:65, :71, :181, :190). NoteEditError → SaveError mapping happens inside the pure helper. |
| FIND-SPEC-TCU-017 | PARTIAL | "Cross-context dependencies" section added (behavioral-spec.md:264-336). However, the spec declares `serializeNote` and `writeMarkdown` as "not currently exported from a canonical file" (lines 333-336) and proposes co-locating them in `docs/domain/code/ts/src/curate/ports.ts`. The original finding asked for canonical paths to be cited; the resolution converts the gap into deltas without naming a current Capture/Vault canonical home. **Acceptable for lean mode** because the delta is now explicit; Phase 2 will own the file. |
| FIND-SPEC-TCU-018 | YES | REQ-TCU-007 reduced to the single live `NoteEditError` variant (behavioral-spec.md:480-487). PROP-TCU-012 restated with Tier-0 type assertions for the dead variants (verification-architecture.md:230). |
| FIND-SPEC-TCU-019 | YES | PROP-TCU-020 (NEW) — "Non-coupling type assertion: `keyof TagChipUpdateDeps` does not include any editor-buffer key" (verification-architecture.md:238). Structural guarantee in `TagChipUpdateDeps` (behavioral-spec.md:324). |

**Summary: 16 fully resolved, 2 partial-but-acceptable, 1 introduced regression.**

---

## New findings (FAIL triggers)

### FIND-SPEC-TCU-021 — `BuildTagChipSaveRequest` signature deviates from canonical and is NOT declared as a contract delta
- **Dimension**: Spec/Canonical Consistency
- **Severity**: blocker
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:177`; `docs/domain/code/ts/src/curate/workflows.ts:68-70`
- **Finding**: Canonical (`workflows.ts:68-70`):
  ```typescript
  export type BuildTagChipSaveRequest = (
    deps: CurateDeps,
  ) => (mutated: MutatedNote) => SaveNoteRequested;
  ```
  Spec (behavioral-spec.md:177):
  > Step 3 | `buildTagChipSaveRequest` | **Pure core** | `(mutated: MutatedNote, now: Timestamp) => SaveNoteRequested`. Pure construction using the pre-obtained `now`. No Clock call.

  This drops the `(deps: CurateDeps) =>` curry and adds an explicit `now: Timestamp` parameter. The spec's "Cross-context Dependencies / Canonical Contract Deltas" section (lines 264-336) enumerates exactly 4 deltas — `SaveValidationError.cause`, `GetAllSnapshots`, `EventBusPublishInternal`, `TagChipUpdateDeps` — and does NOT list a delta for `BuildTagChipSaveRequest`. Yet the spec relies on a 2-arg `(MutatedNote, Timestamp) => SaveNoteRequested` shape that is structurally incompatible with the canonical curried form.
- **Why it fails**: An implementer reading canonical TS will write the function with `deps` curry; an implementer reading the spec will write it with `now` threading. Tests would target one or the other. The single-Clock budget claim depends on `now` being threaded explicitly (line 152: "this single `now` is threaded through ... `buildTagChipSaveRequest`"). If the canonical curried form is preserved and `now` is fetched via `deps.clockNow()` inside `buildTagChipSaveRequest`, then the function would be effectful (clock) and the budget calculation in lines 154-165 is wrong. The current spec resolves this contradiction implicitly but never declares the divergence as a delta.
- **Suggested resolution**: Add a 5th delta to the "Cross-context Dependencies / Canonical Contract Deltas" section: explicitly extend `BuildTagChipSaveRequest` to `(mutated: MutatedNote, now: Timestamp) => SaveNoteRequested` (drop the `deps` curry), with rationale ("now is threaded from the orchestrator's single Clock call"). Reference the delta from the purity-boundary table.

### FIND-SPEC-TCU-022 — `UpdateProjectionsAfterSave` signature deviates from canonical and is NOT declared as a contract delta
- **Dimension**: Spec/Canonical Consistency / Verification Architecture Soundness
- **Severity**: blocker
- **Location**: `.vcsdd/features/tag-chip-update/specs/verification-architecture.md:203-210`; `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:180`, `:557-566`; `docs/domain/code/ts/src/curate/workflows.ts:123-129`
- **Finding**: Canonical (`workflows.ts:123-129`):
  ```typescript
  export type UpdateProjectionsAfterSave = (
    deps: CurateDeps,
  ) => (
    feed: Feed,
    inventory: TagInventory,
    event: NoteFileSaved,
  ) => IndexedNote;
  ```
  Spec (verification-architecture.md:203-210):
  ```typescript
  type UpdateProjectionsAfterSave = (
    deps: TagChipUpdateDeps,
  ) => (
    feed: Feed,
    inventory: TagInventory,
    event: NoteFileSaved,
    now: Timestamp,
  ) => IndexedNote;
  ```
  Two divergences: (a) `deps` widened from `CurateDeps` to `TagChipUpdateDeps`; (b) inner arity grows from 3 to 4 with an added `now: Timestamp`. The "Cross-context Dependencies / Canonical Contract Deltas" section enumerates 4 deltas and does not include this one. The behavioral-spec at line 180 echoes the 4-arg shape (`(Feed, TagInventory, NoteFileSaved, Timestamp) => IndexedNote`) without acknowledging the divergence.
- **Why it fails**: This is a load-bearing signature: `updateProjectionsAfterSave` is shared with CaptureAutoSave / DeleteNote per workflows.ts comment ("CaptureAutoSave / TagChipUpdate / DeleteNote 共通"). Widening its `deps` parameter or adding a `now` arg breaks contract reuse for the other two workflows. If the spec actually intends to override the shared signature for TagChipUpdate only, that must be declared as a delta with rationale. If the spec intends to keep the canonical 3-arg shape, then where does the `now` for `TagInventoryUpdated.occurredOn` come from? The spec relies on the orchestrator threading `now` into `updateProjectionsAfterSave`, but the canonical shape does not accept `now`.
- **Suggested resolution**: Either (a) declare a 5th/6th delta widening `UpdateProjectionsAfterSave` to `(deps: TagChipUpdateDeps) => (feed, inventory, event, now) => IndexedNote` with rationale ("`now` needed for `TagInventoryUpdated.occurredOn`; `TagChipUpdateDeps` needed for `getAllSnapshots`"), AND propagate the same widening to CaptureAutoSave / DeleteNote OR justify why this workflow gets a separate type. OR (b) keep the canonical 3-arg shape and source `now` from `event.occurredOn` (which is `NoteFileSaved.occurredOn` and equals the workflow's single `now` by construction). Whichever path is chosen, the divergence (or its absence) must be declared explicitly.

### FIND-SPEC-TCU-023 — `tag-vo-invalid` cause is dead code and re-introduces FIND-014's surface
- **Dimension**: Error/Edge Case Rigor
- **Severity**: major
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:216`, `:286`, `:480-487`; `.vcsdd/features/tag-chip-update/specs/verification-architecture.md:225`
- **Finding**: The Revision-2 changes summary at line 28 says: "FIND-014: `TagError { empty | only-whitespace }` mapping removed. `tag` is a pre-validated `Tag` brand; `addTag` cannot produce `TagError`. Dead code removed." But the canonical-delta section adds a `cause: 'tag-vo-invalid'` variant to `SaveValidationError` (line 216, line 286, marked "defensive: pre-validated branded Tag should never trigger"). REQ-TCU-007 simultaneously declares that the `tag` `NoteEditError` variant is dead code unreachable in this workflow (line 486). PROP-TCU-007 (verification-architecture.md:225) requires "per-cause variant tests: inject conditions for `note-not-in-feed`, `hydration-failed`, `frontmatter-invariant` and assert each produces the correct `cause` discriminator" — this list deliberately omits `tag-vo-invalid`, confirming it has no triggering scenario. So the spec extends the canonical `errors.ts` type with a discriminator value that no test exercises and no path produces.
- **Why it fails**: (a) Contract bloat: extending shared canonical errors with provably-dead discriminator values increases coupling without benefit and contradicts the FIND-014 resolution claim. (b) Phase 2 implementers face an exhaustiveness mismatch: a `switch` on `SaveValidationError.cause` must include a `'tag-vo-invalid'` branch with a `never`-asserting body, which contradicts the "dead-variant Tier-0 type assertion" mentioned in the changes summary at line 14 of verification-architecture.md. (c) The change introduces a delta to `errors.ts` without explicit justification of why the dead branch must be present at the canonical type level rather than only as an internal exhaustiveness comment.
- **Suggested resolution**: Either (a) remove `'tag-vo-invalid'` from the `SaveValidationError.cause` discriminator delta and rely on the type-level assertion that `Extract<NoteEditError, { kind: 'tag' }>` is unreachable in `applyTagOperationPure` (which is what FIND-014's resolution actually demands), OR (b) keep the variant but add explicit rationale to the delta: "defensive variant for hypothetical future raw-string entry points; not reachable in TagChipUpdate" and add a Tier-0 type assertion that no path in `TagChipUpdate` produces `cause: 'tag-vo-invalid'`. Whichever, reconcile with the FIND-014 "dead code removed" claim.

---

## Suggestions (non-blocking)

- **PROP-TCU-002 / PROP-TCU-003 redundancy on idempotent path**: These properties test `applyTagOperationPure` with the tag-already-present (or tag-already-absent) input. Under the new design, the workflow orchestrator pre-checks membership and never calls `applyTagOperationPure` on the idempotent path (REQ-TCU-003 line 399: "`applyTagOperation` is NOT called"). The properties are still valid as unit tests of `addTag`/`removeTag` semantics, but PROP-TCU-002's REQ coverage column maps it only to REQ-TCU-003, which is the workflow-level idempotency requirement. Since the workflow path doesn't reach `applyTagOperationPure`, PROP-TCU-002 only covers the underlying `NoteOps.addTag` contract, not REQ-TCU-003's workflow behavior — that is covered by PROP-TCU-004. Consider re-mapping or relabeling.
- **`WriteMarkdown` canonical anchor (residual FIND-005)**: The spec correctly declares `WriteMarkdown` as a delta on `ports.ts`, but never documents whether the type already exists informally in any Capture or Vault file in the canonical TS tree. A one-line citation ("`writeMarkdown` is the port currently consumed by Capture's autosave; this declaration formalizes its location") would harden the cross-context reuse claim.
- **Pipeline diagram async marker**: The marker "[ASYNC write I/O — Vault] ← only async hop" is good, but consider also marking the workflow itself as `async` at the top of the pipeline for symmetry with the canonical `Promise<Result<...>>` return type.
- **REQ-TCU-008 immutability invariant**: The `Feed`/`TagInventory` "are unchanged (immutable inputs remain; no new instances are created on this path)" assertion at line 532 is welcome, but consider adding a Tier-0 / Tier-2 assertion that `IndexedNote.feed === feed` (reference equality) on the save-fail path, to give the test a concrete handle. Currently PROP-TCU-006 stops at "spy.callCount === 0 for all three", which doesn't prove the returned `IndexedNote` carries the original references.
- **`occurredOn` proof**: PROP-TCU-013 / PROP-TCU-014 cover `source` and `previousFrontmatter` but no proof obligation directly asserts `SaveNoteRequested.occurredOn === now` (the threaded timestamp). PROP-TCU-001 covers it implicitly through `applyTagOperationPure` purity, but the wiring through `buildTagChipSaveRequest` deserves its own check given the deviating signature (FIND-021).

---

## Convergence Signals

- Findings count: iter-1=19 → iter-2=3 (FIND-021, FIND-022, FIND-023)
- Resolution rate: 16 of 19 fully resolved, 2 partial-acceptable, 1 introduced regression (FIND-010 → FIND-023)
- Three new blocker/major findings introduced by Revision 2 changes:
  - FIND-021 (blocker): `BuildTagChipSaveRequest` signature delta not declared
  - FIND-022 (blocker): `UpdateProjectionsAfterSave` signature delta not declared
  - FIND-023 (major): `tag-vo-invalid` dead-code variant in canonical errors delta
- Recommended ordering for the Builder's iter-3:
  1. Declare the 5th and 6th canonical contract deltas (FIND-021, FIND-022) OR conform to canonical signatures
  2. Resolve `tag-vo-invalid` per FIND-023
  3. Re-verify the Clock budget table holds under whichever signature shape is chosen

**Finding IDs to pass to recordGate**: FIND-SPEC-TCU-021, FIND-SPEC-TCU-022, FIND-SPEC-TCU-023
