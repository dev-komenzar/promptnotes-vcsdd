# Phase 1c Spec Review — tag-chip-update — iteration 1

**Verdict**: FAIL
**Reviewed by**: vcsdd-adversary (fresh context)
**Date**: 2026-05-01

## Per-Dimension Verdict

| Dimension | Verdict | Notes |
|-----------|---------|-------|
| Spec Coverage | FAIL | Missing ports / dependencies (snapshots source for `refreshSort`, `writeMarkdown` port, internal-event bus for `TagInventoryUpdated`) |
| Spec Testability | FAIL | Idempotency comparison semantics ambiguous (set vs array equality); `invariant-violated.detail` strings are non-type-level and brittle |
| Spec/Canonical Consistency | FAIL | `ApplyTagOperation` arity contradicts `workflows.ts:61-66`; `TagChipUpdate` async signature dropped; `Feed/TagInventory` "passed by reference; mutated" contradicts immutable read-model contract |
| Verification Architecture Soundness | FAIL | Purity-boundary contradiction (applyTagOperation depends on `deps.clockNow` yet labelled pure core); coverage matrix ignores missing ports; PROP-TCU-007 cannot distinguish error subcategories at type level |
| Error/Edge Case Rigor | FAIL | REQ-TCU-003 (idempotent) and REQ-TCU-007 (duplicate-tag NoteEditError) are mutually contradictory under the canonical "addTag is idempotent on duplicates" contract |

**Overall Verdict: FAIL** — multiple blocker findings across all five dimensions.

---

## Findings (FAIL triggers)

### FIND-SPEC-TCU-001 — `ApplyTagOperation` arity contradicts canonical `workflows.ts`
- **Dimension**: Spec/Canonical Consistency
- **Severity**: blocker
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:173`, `:432`; `.vcsdd/features/tag-chip-update/specs/verification-architecture.md:16`, `:97-101`
- **Finding**: The canonical signature in `docs/domain/code/ts/src/curate/workflows.ts:61-66` is:
  ```
  ApplyTagOperation = (deps: CurateDeps) => (note, command) => Result<MutatedNote, SaveError>
  ```
  i.e. curried over `deps`, taking only `(note, command)`, and `now` must be obtained internally via `deps.clockNow()`.
  The spec instead declares `applyTagOperation` as `(Note, TagChipCommand, Timestamp) → Result<MutatedNote, NoteEditError>` (and later `→ Result<MutatedNote, SaveError>`), threading `Timestamp` as an explicit argument and dropping the `deps` curry. This is a direct type contradiction with canonical TS.
- **Why it fails**: Phase 2a/2b would have to either deviate from canonical (which the spec does not declare) or rewrite the spec's purity claims (because if `applyTagOperation` curries `deps`, then it is effectful, not "pure core").
- **Suggested resolution**: Choose one of (a) explicitly extend the canonical signature in the spec — `applyTagOperation: (deps) => (note, command) => Result<MutatedNote, SaveError>` — and reclassify the function as **effectful shell (clock)**, OR (b) introduce an internal pure helper `applyTagOperationPure(note, command, now): Result<MutatedNote, NoteEditError>` and have the canonical `applyTagOperation` thinly wrap it with `deps.clockNow()`. State the choice explicitly and update purity-boundary classification, proof obligations, and the Clock budget accordingly.

### FIND-SPEC-TCU-002 — `addTag` idempotency contract is internally contradictory
- **Dimension**: Error/Edge Case Rigor
- **Severity**: blocker
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:229-247` (REQ-TCU-003) vs `:311-331` (REQ-TCU-007); `docs/domain/code/ts/src/shared/note.ts:55-56`
- **Finding**: `NoteOps.addTag` is documented in `note.ts:55` as "重複は idempotent" — i.e., adding a duplicate tag returns `Ok(Note)` with the unchanged tag set. REQ-TCU-003 relies on exactly this: "the idempotency check happens after `applyTagOperation` returns — not inside `applyTagOperation` itself." This presumes `addTag` returns Ok with same tags on duplicate.
  But REQ-TCU-007 also defines an error mapping for `NoteEditError { kind: 'frontmatter', reason: { kind: 'duplicate-tag', tag } }` — which can only arise if `addTag` does NOT short-circuit and instead delegates to `Frontmatter.tryNew` which rejects duplicates per `value-objects.ts:79`.
  These two are mutually exclusive: if `addTag` is idempotent, the duplicate-tag NoteEditError mapping in REQ-TCU-007 is dead code; if `addTag` returns the duplicate-tag error, REQ-TCU-003's "Ok with same tags after applyTagOperation" path never triggers.
- **Why it fails**: Builder, implementer, and reviewer cannot agree on which contract `addTag` honors. The spec must be unambiguous about whether `addTag` is short-circuit-idempotent (Ok branch) or delegates to FrontmatterSmartCtor (Err branch) on duplicate. This single decision determines whether REQ-TCU-003 or REQ-TCU-007 is the correct path for "tag already present".
- **Suggested resolution**: Make a binding decision (recommend: `addTag` is short-circuit-idempotent, returning the input `Note` unchanged when the tag is already present, per `note.ts:55` comment). Then explicitly remove the `duplicate-tag` mapping from REQ-TCU-007 (or label it as defensive/unreachable with a runtime assertion). Add a property test that asserts: `∀ note s.t. tag ∈ note.frontmatter.tags ⇒ addTag(note, tag, now)` is `Ok(note′)` with `note′.frontmatter.tags ≡ note.frontmatter.tags`.

### FIND-SPEC-TCU-003 — Purity boundary contradiction in `applyTagOperation`
- **Dimension**: Verification Architecture Soundness
- **Severity**: blocker
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:173`, `:180`; `.vcsdd/features/tag-chip-update/specs/verification-architecture.md:16`, `:23-26`, `:155-156`
- **Finding**: The verification architecture classifies `applyTagOperation` as **pure core** and a "Property-test and formal-proof target" (verification-architecture.md:16). PROP-TCU-001 (REQUIRED) asserts `applyTagOperation` is referentially transparent. But:
  1. The canonical signature curries `deps`, meaning the implementation MUST call `deps.clockNow()` internally (since canonical does not pass `now` as an argument).
  2. The behavioral spec confirms in REQ-TCU-012 acceptance criterion line 432: "`applyTagOperation` calls `deps.clockNow()` exactly once".
  3. A function that calls `deps.clockNow()` is by definition non-pure (depends on a wall-clock port).
  Therefore the "pure core" classification is wrong, and PROP-TCU-001 (∀-property over fast-check inputs) cannot be tested as stated unless the spec exposes a separate pure helper (see FIND-001 resolution).
- **Why it fails**: The required Tier-1 property obligation cannot be discharged as written. Property-based tests can only target deterministic functions; testing `applyTagOperation(note, command)` with random inputs while it internally calls `deps.clockNow()` would either require stubbing `deps.clockNow` (in which case the "purity" guarantee actually depends on the stub) or accepting non-determinism (in which case the property fails).
- **Suggested resolution**: Either (a) expose `applyTagOperationPure(note, command, now)` as the proof target and have the canonical `applyTagOperation` wrapper call it with `deps.clockNow()`, OR (b) reclassify `applyTagOperation` as effectful shell (clock) and lower PROP-TCU-001 to an example-based test. Update purity-boundary tables in both spec files consistently.

### FIND-SPEC-TCU-004 — `FeedOps.refreshSort` snapshots argument source is undefined
- **Dimension**: Spec Coverage
- **Severity**: blocker
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:178`, `:393`; `docs/domain/code/ts/src/curate/aggregates.ts:71`
- **Finding**: `FeedOps.refreshSort(feed, snapshots: readonly NoteFileSnapshot[]): Feed` requires a snapshots collection. Spec REQ-TCU-010 line 393 demands `FeedOps.refreshSort(feed, snapshots)` is called exactly once but never defines where `snapshots` comes from. `CurateDeps` (`docs/domain/code/ts/src/curate/ports.ts:25-30`) provides only `getNoteSnapshot(noteId): NoteFileSnapshot | null` — single-note access only. There is no `getAllSnapshots()` port. The spec papers over a missing dependency.
- **Why it fails**: An implementation cannot satisfy REQ-TCU-010 with the current canonical port surface. Builder must invent a port not in the canonical. Phase 2b would either bake in an undeclared dependency or skip `refreshSort` entirely.
- **Suggested resolution**: Either (a) declare a new port `getAllSnapshots: () => readonly NoteFileSnapshot[]` on `CurateDeps` and add it to the spec's ports section (and to verification-architecture.md Port Contracts), OR (b) pass the snapshot collection as an additional parameter to `TagChipUpdate` (next to `feed` and `inventory`), OR (c) reformulate the projection update to not require the full snapshot collection (e.g., only update `Feed.noteRefs` ordering for the single mutated note's `updatedAt`). Spec must take an explicit position.

### FIND-SPEC-TCU-005 — `writeMarkdown` port has no home in `CurateDeps`
- **Dimension**: Spec Coverage / Spec/Canonical Consistency
- **Severity**: blocker
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:23-25`, `:49-58`; `.vcsdd/features/tag-chip-update/specs/verification-architecture.md:62-70`; `docs/domain/code/ts/src/curate/ports.ts:25-30`
- **Finding**: The spec's pipeline (Steps 4-5) and the verification architecture's `WriteMarkdown` port type (verification-architecture.md:62-70) both require a `writeMarkdown` port. But canonical `CurateDeps` does not include one. The spec's external-state list (behavioral-spec.md:49-58) does not declare which dependency object actually carries `writeMarkdown`. Capture's autosave pipeline carries it, but how it is injected into `TagChipUpdate` (which is a Curate workflow) is unspecified.
- **Why it fails**: An implementer cannot wire the workflow without inventing a deps shape that does not exist in the canonical.
- **Suggested resolution**: Decide explicitly: (a) extend `CurateDeps` to include `writeMarkdown: WriteMarkdown` (and update ports.ts as part of the contract delta), OR (b) introduce a separate `TagChipUpdateDeps = CurateDeps & { writeMarkdown: WriteMarkdown }` shape, OR (c) declare that Capture's `saveNote` port is reused and document the cross-context dependency. Cite the chosen option in the spec and ensure it appears in verification-architecture.md Port Contracts.

### FIND-SPEC-TCU-006 — No port for emitting `TagInventoryUpdated` internal event
- **Dimension**: Spec Coverage
- **Severity**: blocker
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:387-390`; `docs/domain/code/ts/src/curate/ports.ts:23-30`; `docs/domain/code/ts/src/curate/internal-events.ts:42-47`
- **Finding**: REQ-TCU-010 declares: "After `updateProjectionsAfterSave`, the workflow publishes a `TagInventoryUpdated` internal event". `TagInventoryUpdated` is a `CurateInternalEvent` (internal-events.ts:42-47). But canonical `CurateDeps.publish: EventBusPublish = (event: PublicDomainEvent) => void` (`ports.ts:23`) only accepts `PublicDomainEvent`. There is NO port for publishing internal events. The spec depends on a port that does not exist.
- **Why it fails**: Implementation cannot emit the internal event without inventing a port. Tests cannot verify emission. The Curate internal-event bus surface is not part of the canonical contract.
- **Suggested resolution**: Either (a) add a `publishInternal: (e: CurateInternalEvent) => void` port to `CurateDeps` (declare canonical delta), OR (b) drop the `TagInventoryUpdated` emission from this workflow's responsibility and route it via the projection-update step in a higher-level coordinator, OR (c) declare the workflow does not emit `TagInventoryUpdated` and document where it is emitted instead. Spec must take an explicit position.

### FIND-SPEC-TCU-007 — `TagChipUpdate` Promise-async signature dropped from spec
- **Dimension**: Spec/Canonical Consistency
- **Severity**: major
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:7`, `:63`; `docs/domain/code/ts/src/curate/workflows.ts:73-77`
- **Finding**: Canonical `TagChipUpdate` returns `Promise<Result<IndexedNote, SaveError>>` (workflows.ts:77). The spec at behavioral-spec.md:63 states "`TagChipUpdate` returns `Result<IndexedNote, SaveError>`" — dropping the `Promise<...>` wrapper. The pipeline overview (line 26) shows `IndexedNote` as the terminal stage but never marks `writeMarkdown` as async.
- **Why it fails**: Implementers might write a synchronous return; tests would need to be authored against the wrong return type. Async error semantics (rejection vs Err) are unspecified.
- **Suggested resolution**: Restate the canonical return type in the spec's Pipeline Output section: `Promise<Result<IndexedNote, SaveError>>`. Specify that `writeMarkdown` is awaited and that the only async hop is Step 5. Add an acceptance criterion: workflow is an async function and never throws; all errors are reified as `Err(SaveError)` in the resolved Result.

### FIND-SPEC-TCU-008 — Idempotency check comparison semantics ambiguous (set vs array)
- **Dimension**: Spec Testability
- **Severity**: major
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:114`, `:119`, `:234`, `:239`, `:261`; `.vcsdd/features/tag-chip-update/specs/verification-architecture.md:17`, `:126-127`
- **Finding**: The spec uses inconsistent language for the no-op check:
  - L114: "tag set is identical" (set)
  - L119: "deep compare on tags set" (set)
  - L234: "tag-set equality: ... deep-equals ... (same set, same order ...)" (set OR array — contradictory)
  - L239 and L261: "contain the same set" (set) and "===" (reference!)
  - verification-architecture.md L17: "Set equality on `tags` arrays" (set, on array)
  - verification-architecture.md L126: "(same set)" (set)
  Tests will diverge based on interpretation: set-semantics tolerates order changes, array deep-equals does not, and `===` (reference equality) is a third, much stricter interpretation that would essentially never hold after `addTag` returns a fresh array.
- **Why it fails**: Two implementers could write disagreeing idempotency checks both consistent with the spec; their behavior would differ when `Frontmatter` reorders tags during construction.
- **Suggested resolution**: Pick one canonical comparison and state it once: e.g., "the no-op check is `setEqual(after.tags, before.tags)` where `setEqual(a, b) := a.length === b.length ∧ ∀t∈a, b.includes(t)`". Replace all loose phrasings with that exact predicate. Update PROP-TCU-002/003 to use the same predicate.

### FIND-SPEC-TCU-009 — `Feed`/`TagInventory` "passed by reference; mutated" contradicts immutable read-model contract
- **Dimension**: Spec/Canonical Consistency
- **Severity**: major
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:56-57`; `docs/domain/code/ts/src/curate/aggregates.ts:39-45`; `docs/domain/code/ts/src/curate/read-models.ts:22-26`
- **Finding**: The spec states: "`feed: Feed` — current Curate feed (passed by reference; mutated by `updateProjectionsAfterSave`)" and "`inventory: TagInventory` ... (mutated by `updateProjectionsAfterSave`)". Canonical `Feed` (aggregates.ts:39-45) and `TagInventory` (read-models.ts:22-26) are `readonly` records, and `FeedOps.refreshSort` and `TagInventoryOps.applyNoteFrontmatterEdited` return new `Feed`/`TagInventory` instances respectively. There is no mutation; the operations are functional updates.
- **Why it fails**: An implementer could mistakenly write code that mutates `Feed.noteRefs` in place, violating the immutability invariant. Tests cannot assert "mutation" without violating the type system.
- **Suggested resolution**: Replace "passed by reference; mutated" with: "`feed`/`inventory` are immutable inputs; `updateProjectionsAfterSave` returns a new `Feed`/`TagInventory` via `FeedOps.refreshSort` and `TagInventoryOps.applyNoteFrontmatterEdited`. The caller holds the new instances inside the returned `IndexedNote`."

### FIND-SPEC-TCU-010 — `SaveError.reason.detail` is the only discriminator for distinct error causes
- **Dimension**: Spec Testability / Verification Architecture Soundness
- **Severity**: major
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:65-92`, `:273-307`, `:313-331`; `.vcsdd/features/tag-chip-update/specs/verification-architecture.md:131` (PROP-TCU-007)
- **Finding**: The spec collapses five distinct logical errors — `not-found`, `hydration-fail`, `addTag.tag.empty`, `addTag.tag.only-whitespace`, `addTag.frontmatter.duplicate-tag`, `addTag.frontmatter.updated-before-created` — all into `SaveError { kind: 'validation', reason: { kind: 'invariant-violated', detail: <string> } }`. The only distinguishing field is the `detail` string. PROP-TCU-007 (Tier 0, REQUIRED) asserts type-level exhaustiveness of `SaveError.kind`, but type-level exhaustiveness cannot distinguish these five cases. Tests that need to verify the correct error path was taken must do brittle substring matching on `detail`.
- **Why it fails**: (a) Test brittleness: exact `detail` strings are not part of `SaveError`'s type contract; any wording change breaks tests. (b) Information loss: callers cannot programmatically distinguish "note missing from feed" from "frontmatter duplicate tag" — operational logging and recovery cannot react differently. (c) PROP-TCU-007 over-promises: it claims exhaustiveness coverage of REQ-TCU-005/006/007/008 but only covers the top-level `kind` distinction.
- **Suggested resolution**: Either (a) extend `SaveValidationError` with a structured discriminator (e.g., `{ kind: 'invariant-violated'; cause: 'note-not-in-feed' | 'hydration-failed' | 'tag-vo-invalid' | 'duplicate-tag' | 'timestamp-invariant' }`), with the change reflected in canonical `errors.ts` as a contract delta — OR (b) accept the conflation explicitly and downgrade PROP-TCU-007 (loosen acceptance criteria so tests assert only on `kind = 'validation'` and not on `detail`), and add a separate property obligation per error subcategory keyed off the precondition (e.g., "stub `getNoteSnapshot → null` ⇒ workflow errors") rather than the resulting error shape.

### FIND-SPEC-TCU-011 — `TagInventoryUpdated.occurredOn` semantic shift not declared
- **Dimension**: Spec Testability
- **Severity**: major
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:387-390`
- **Finding**: REQ-TCU-010 says: "`TagInventoryUpdated.occurredOn` reuses the `SaveNoteRequested.occurredOn` timestamp ... No additional `Clock.now()` call is needed." This means the timestamp on `TagInventoryUpdated` reflects when the save was requested (Step 3), not when the inventory was actually updated (Step 6, after disk I/O completed). Time may have advanced significantly between the two (e.g., disk write under load). Consumers reading the internal-event log will see an out-of-order timeline (`NoteFileSaved.occurredOn` > `TagInventoryUpdated.occurredOn` would be impossible in practice, but the relationship is unspecified, and a consumer expecting "occurredOn = projection-mutation time" will be misled).
- **Why it fails**: The spec optimizes for Clock-call count without declaring the semantic consequence. Property obligation PROP-TCU-015 only checks call counts, not timestamp coherence.
- **Suggested resolution**: Either (a) explicitly document the semantic: "`TagInventoryUpdated.occurredOn` represents the wall-clock time at which the save request was issued, NOT the time the projection was mutated. Consumers requiring projection-mutation time must look at a downstream event." This must be in the spec body and in `internal-events.ts` doc-comment; OR (b) accept a third Clock.now() call after `updateProjectionsAfterSave` and fix the budget table accordingly. Either way, update the Clock budget and the `internal-events.ts` documentation.

### FIND-SPEC-TCU-012 — Two distinct `Clock.now()` calls per write path are unjustified
- **Dimension**: Spec Testability
- **Severity**: major
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:148-164`, `:206`, `:225`, `:421-437`
- **Finding**: The spec mandates two `Clock.now()` calls per happy-path: once for `addTag/removeTag.now` (stamps `frontmatter.updatedAt`), once for `SaveNoteRequested.occurredOn`. These two timestamps may differ by microseconds. The spec offers no rationale for why they should differ. From a domain perspective, "the time the user added a tag chip" and "the time the save request was emitted for that tag chip add" are the same moment.
- **Why it fails**: (a) Test complexity: example-based tests must thread two distinct timestamps; property-based tests have to inject either one or both. (b) Domain inconsistency: `frontmatter.updatedAt` and `SaveNoteRequested.occurredOn` could legitimately be identical and provide a clean cross-event correlation. (c) Comparable workflow CaptureAutoSave likely takes a similar position (reusing one `now`); the spec does not justify the divergence.
- **Suggested resolution**: Reduce to a single `deps.clockNow()` call at the start of the workflow (after load + hydration succeed) and thread the same `Timestamp` through `addTag/removeTag.now` AND `SaveNoteRequested.occurredOn`. Update the Clock budget: happy paths = 1, save-fail = 1, idempotent = 1, errors = 0. PROP-TCU-015 must be updated. If two distinct calls are intended, justify the divergence in the spec body (e.g., "`updatedAt` is the mutation moment; `occurredOn` is the bus-publish moment, and we deliberately distinguish for audit").

### FIND-SPEC-TCU-013 — Idempotent path Clock.now() budget contradicts canonical `applyTagOperation`
- **Dimension**: Verification Architecture Soundness
- **Severity**: major
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:155-156`, `:247`, `:432`
- **Finding**: Spec says idempotent paths consume one `Clock.now()` call inside `applyTagOperation`. But on the idempotent add path, the no-op short-circuit happens AFTER `applyTagOperation` returns (REQ-TCU-003: "the idempotency check happens after `applyTagOperation` returns"), so `applyTagOperation` already paid the Clock cost. Yet REQ-TCU-003 line 247 still asserts: "`Clock.now()` is called exactly once (for `applyTagOperation`'s `now` parameter)". Note that `addTag` then computes a new `Frontmatter.updatedAt = now` even though we will throw the result away. This means `MutatedNote.note.frontmatter.updatedAt !== MutatedNote.previousFrontmatter.updatedAt` strictly — yet REQ-TCU-003 acceptance line 239 says the tag set is unchanged but is silent on `updatedAt`. The idempotency check on tag-set-equality (FIND-008) ignores `updatedAt`. So `MutatedNote.note` is NOT equal to the input `note` (it has a new `updatedAt`); but we discard it. That's wasteful and silently mutates the note's "last touched" timestamp without persisting it.
- **Why it fails**: The spec's idempotent path produces a `Note` object with an `updatedAt` that differs from the input but is then discarded (because no save). If a downstream consumer (or test) keys off `MutatedNote.note.frontmatter.updatedAt` it will see a value that should never have existed. Also, on idempotent remove, `removeTag` returns a `Note` with new `updatedAt` — and this is discarded too, which means the spec's "removeTag is idempotent (returns same Note unchanged)" assumption (REQ-TCU-004 line 256) is FALSE: `removeTag(note, absent_tag, now)` returns a Note with `frontmatter.updatedAt = now`, which differs from `note.frontmatter.updatedAt`.
- **Suggested resolution**: Tighten the idempotency check or the addTag/removeTag contract. Either (a) gate the `Clock.now()` call: check the no-op condition by inspecting only the tags BEFORE calling `addTag/removeTag` (no Clock call needed for no-op detection — pure tag-set membership check on the input note), and short-circuit before `addTag/removeTag` is invoked. Update Clock budget: idempotent paths = 0 calls. OR (b) accept that `addTag/removeTag` always stamps `updatedAt` and document in REQ-TCU-004 that "removeTag is idempotent on tag-set, but updates `updatedAt`; the no-op short-circuit discards this `Note` and the wall-clock side effect is benign".

### FIND-SPEC-TCU-014 — Non-coverage of edge case: empty initial tags + empty add (impossible by VO but unstated)
- **Dimension**: Spec Coverage / Edge Case Rigor
- **Severity**: major
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:43-47`, `:316-317`
- **Finding**: REQ-TCU-007 maps `NoteEditError { kind: 'tag', reason: { kind: 'empty' | 'only-whitespace' } }` to invariant-violated. But spec line 47 explicitly says: "`tag` is already a validated `Tag` value object (normalized: lowercase, `#` stripped, trimmed). The workflow never receives raw strings." If `tag` is already a valid `Tag` brand, then `addTag(note, tag, now)` cannot fail with `TagError { kind: 'empty' | 'only-whitespace' }` — those errors are produced by `TagSmartCtor.tryNew` from raw strings (`value-objects.ts:43-48`), not by `addTag`. So the mapping in REQ-TCU-007 covers an unreachable code path.
- **Why it fails**: The spec mandates tests for an unreachable error path. Either the type-level guarantee is false (raw strings DO leak in), or the mapping is dead. Both are spec defects.
- **Suggested resolution**: Either (a) remove `TagError` from the `NoteEditError → SaveError` mapping in REQ-TCU-007 (since branded `Tag` cannot trigger it), and document that `applyTagOperation` only needs to handle `FrontmatterError` paths — OR (b) explicitly state that `addTag` re-validates the Tag VO defensively and document why; then keep the mapping. Either way, the spec must reconcile the "tag is pre-validated" claim with the existence of a `TagError` mapping.

### FIND-SPEC-TCU-015 — `previousFrontmatter` non-null vs `NoteFileSaved.previousFrontmatter: Frontmatter | null`
- **Dimension**: Spec/Canonical Consistency
- **Severity**: major
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:367-381`; `docs/domain/code/ts/src/shared/events.ts:50-58`; `docs/domain/code/ts/src/curate/stages.ts:51-55`
- **Finding**: `MutatedNote.previousFrontmatter: Frontmatter` is non-null (stages.ts:54). `NoteFileSaved.previousFrontmatter: Frontmatter | null` allows null (events.ts:56). REQ-TCU-009 acceptance line 378 says "`NoteFileSaved.previousFrontmatter === MutatedNote.previousFrontmatter`" — i.e., the spec asserts non-null in this workflow. But the spec does not declare an invariant: "for `TagChipUpdate`, `NoteFileSaved.previousFrontmatter` is always non-null." Without this, a tester cannot tell whether to write a null-check or assert non-null.
- **Why it fails**: Implementer/tester would not know which side of the union is required. Type-narrowing in tests would require an `if (saved.previousFrontmatter !== null)` guard whose else branch is unspecified.
- **Suggested resolution**: Add to REQ-TCU-009 an explicit invariant: "in `TagChipUpdate`, `NoteFileSaved.previousFrontmatter` is always non-null because the source `MutatedNote.previousFrontmatter` is the loaded note's frontmatter and is never null." Add a Tier-0 type-level proof obligation that asserts `Exclude<NoteFileSaved['previousFrontmatter'], null>` is the type seen by the consumer in this pipeline, OR add a Tier-2 example test asserting non-null on every emitted `NoteFileSaved`.

### FIND-SPEC-TCU-016 — `applyTagOperation` error type is not consistently `SaveError` or `NoteEditError`
- **Dimension**: Spec/Canonical Consistency
- **Severity**: major
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:173`, `:327`; `.vcsdd/features/tag-chip-update/specs/verification-architecture.md:97-101`; `docs/domain/code/ts/src/curate/workflows.ts:61-66`
- **Finding**: Behavioral-spec L173 declares `applyTagOperation: ... → Result<MutatedNote, NoteEditError>`. REQ-TCU-007 acceptance L327 says `applyTagOperation` returns `Err(SaveError { ... })`. Verification-architecture.md L101 also says `Result<MutatedNote, SaveError>`. Canonical workflows.ts:66 says `Result<MutatedNote, SaveError>`. So three references say `SaveError`, one says `NoteEditError`. This is an internal contradiction within the spec.
- **Why it fails**: Implementer cannot know which error type the function returns. Tests would target the wrong type. The mapping (NoteEditError → SaveError) location is also undefined — does it happen inside `applyTagOperation`, or in a wrapper?
- **Suggested resolution**: Pick one — recommended: `applyTagOperation` returns `Result<MutatedNote, SaveError>` matching canonical, and the NoteEditError → SaveError mapping happens INSIDE `applyTagOperation` after calling `NoteOps.addTag`. Update the purity-boundary table to reflect the wrapping. Remove the contradicting reference at L173.

### FIND-SPEC-TCU-017 — Step 1 and Step 6 are also part of the canonical `TagChipUpdate` but spec leaves them as named sub-functions without canonical signatures
- **Dimension**: Spec Coverage
- **Severity**: major
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:13-27`, `:53`; `docs/domain/code/ts/src/curate/workflows.ts:55-59`, `:123-129`
- **Finding**: The spec names sub-steps `loadCurrentNote`, `applyTagOperation`, `buildTagChipSaveRequest`, `serializeNote`, `writeMarkdown`, `updateProjectionsAfterSave`. Of these, only `LoadCurrentNote`, `ApplyTagOperation`, `BuildTagChipSaveRequest`, `TagChipUpdate`, and `UpdateProjectionsAfterSave` have canonical TS signatures. `serializeNote` and `writeMarkdown` are referenced but not exported from the canonical Curate context — they belong to the Capture or Vault context. The spec does not point to where these signatures live or whether they are reused as-is.
- **Why it fails**: Builder cannot wire Steps 4 and 5 from canonical without locating their definitions (which are out of the cited sources). Verification-architecture.md merely declares a local `WriteMarkdown` port without anchoring to the canonical Capture/Vault file.
- **Suggested resolution**: Add to the spec a "Cross-context dependencies" section listing exact canonical paths for `serializeNote` and `writeMarkdown` (likely under `docs/domain/code/ts/src/capture/...` or `docs/domain/code/ts/src/vault/...`). If canonical does not export these, declare a contract delta and propose where they should be added.

### FIND-SPEC-TCU-018 — REQ-TCU-007 acceptance criterion has wrong target function for the error
- **Dimension**: Spec Testability
- **Severity**: major
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:327`
- **Finding**: REQ-TCU-007 acceptance: "`applyTagOperation` returns `Err(SaveError { kind: 'validation', reason: { kind: 'invariant-violated' } })` when `addTag` returns `NoteEditError`." But `NoteOps.addTag` itself returns `Result<Note, NoteEditError>` (`note.ts:56`). The acceptance criterion implicitly requires `applyTagOperation` to call `addTag`, observe the `NoteEditError`, and re-wrap it as `SaveError`. The mapping logic is non-trivial (requires switching on kind/reason). The acceptance criterion does not specify which `NoteEditError` reasons should be exercised in tests, leaving Tier 2 test coverage incomplete (only one variant tested in PROP-TCU-012).
- **Why it fails**: PROP-TCU-012 says "NoteOps.addTag stub returns NoteEditError" but does not enumerate which variants must be tested. With four `NoteEditError` reasons in the spec mapping, four tests are needed for full coverage. The verification-architecture.md table does not reflect this.
- **Suggested resolution**: Expand PROP-TCU-012 into table-driven tests, enumerating each `NoteEditError` variant and the expected `SaveError.detail` (or, per FIND-010, the structured discriminator). Document this in verification-architecture.md Coverage Matrix.

### FIND-SPEC-TCU-019 — Coverage matrix omits proof obligation for "previousFrontmatter never sourced from editor buffer"
- **Dimension**: Verification Architecture Soundness / Spec Testability
- **Severity**: major
- **Location**: `.vcsdd/features/tag-chip-update/specs/behavioral-spec.md:373`; `.vcsdd/features/tag-chip-update/specs/verification-architecture.md:165-181`
- **Finding**: REQ-TCU-009 (Concurrent editor note paragraph) declares: "If the same note is currently open in the Capture editor, the editor's in-memory frontmatter is NOT used. The Curate snapshot is the authoritative source." But this is an architectural claim about non-coupling that the proof obligations do not exercise. PROP-TCU-005 only verifies that `MutatedNote.previousFrontmatter == note.frontmatter passed in`. There is no obligation that asserts `applyTagOperation` does NOT receive the editor buffer's frontmatter (e.g., a test where `getNoteSnapshot` and a hypothetical editor-buffer port disagree, and the workflow uses the snapshot).
- **Why it fails**: A regression where the workflow accidentally reads from the Capture editor buffer would not be caught by any current test. The spec asserts a non-coupling invariant without testing it.
- **Suggested resolution**: Add a Tier-2 example obligation: "PROP-TCU-020 — workflow does not consult Capture editor state. Inject a `getEditorBuffer` spy port (or omit any such port from `CurateDeps`) and assert that the workflow path uses only `getNoteSnapshot` to source the loaded Note. The spy must record zero calls." Alternatively, explicitly document that the absence of any editor port from `CurateDeps` is itself the structural guarantee, and add a type-level assertion that `keyof CurateDeps` does not include any editor-buffer key.

---

## Suggestions (non-blocking)

- The duplicate Clock.now() budget table (lines 132-146 then 148-160 in behavioral-spec.md) is confusing — keep only the corrected version (lines 148-160) and delete the first attempt. The text explaining the correction belongs to a CHANGELOG, not the spec body.
- REQ-TCU-007's Edge Cases note "REQ-TCU-007 applies only to the `add` operation path" is good; consider promoting it to an acceptance criterion: "the workflow has no NoteEditError path for the `remove` command kind".
- The pipeline overview ASCII diagram (lines 13-27) could be simplified by using arrows/labels consistently and marking which step is async (Step 5).
- "MutatedNote.previousFrontmatter" deepEquals checks should use a canonical equality predicate (e.g., `eq.frontmatter(a, b)`) declared once and reused, rather than ad-hoc `===` and "deep-equals" interchangeably.
- Consider adding an acceptance criterion: "`SaveNoteRequested.body === MutatedNote.note.body`" — body should be unchanged; this protects against accidental body mutation when only tags should be edited.
- The verification-architecture.md Verification Tiers section (lines 147-152) is good but could explicitly list, per tier, the file-system layout the test files will live at (e.g., `tests/unit/curate/applyTagOperation.property.test.ts`), to make Phase 2a planning concrete.

---

## Convergence Signals

- New findings vs prior iterations: 19 (this is iter-1 baseline)
- Open questions raised by Builder addressed in spec:
  - **Q1 — `NoteOps.addTag` contract (idempotent vs duplicate-tag)**: NO — both branches are claimed in the spec creating contradiction (FIND-002).
  - **Q2 — `NoteOps.removeTag` updatedAt and idempotency check basis**: PARTIAL — spec sets idempotency on tag-set-equality (good) but never acknowledges the `updatedAt` side effect on no-op (FIND-013).
  - **Q3 — Error type unification (`{kind:'not-found'} → SaveError`)**: YES — mapping documented at L65-72.
  - **Q4 — `Clock.now()` budget per path**: YES on enumeration; FAIL on justification of two-call design (FIND-012) and on idempotent-path Clock semantics (FIND-013).
  - **Q5 — Projection consistency on save failure**: YES — REQ-TCU-008 explicitly forbids projection mutation on save failure.
  - **Q6 — `previousFrontmatter` sourcing**: YES — explicit at L369-373; but PROP-TCU obligations under-test the non-coupling claim (FIND-019).
  - **Q7 — `TagInventoryUpdated` emission channel/timestamp**: PARTIAL — declared as Curate internal at L387-390 but the canonical bus port for internal events does not exist (FIND-006); timestamp reuse semantics unstated (FIND-011).
  - **Q8 — `updateProjectionsAfterSave` snapshots input source**: NO — undefined (FIND-004).

Spec must iterate before Phase 2a may begin. Recommended ordering for the Builder's iter-2: address FIND-001/002/003 first (canonical signature + addTag contract + purity boundary; these unlock the proof obligations), then FIND-004/005/006 (missing ports), then the remaining issues.
