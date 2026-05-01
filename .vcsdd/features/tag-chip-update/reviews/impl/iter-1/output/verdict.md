# Phase 3 Adversarial Review — tag-chip-update — iteration 1

**Verdict**: FAIL
**Reviewed by**: vcsdd-adversary (fresh context)
**Date**: 2026-05-01

## Per-Dimension Verdict

| Dimension | Verdict | Notes |
|-----------|---------|-------|
| Spec Implementation Fidelity | FAIL | Pipeline orchestration is largely correct, but the public `tagChipUpdate` signature deviates from the spec's canonical `(deps) => (command) => Promise<...>` shape (impl uses `(deps, feed, inventory) => (command) => ...`). This is an undeclared 6th delta introduced by the implementation without a corresponding spec change. |
| Test Coverage Completeness | FAIL | Two required Tier-0 obligations are vacuously verified: PROP-TCU-007(b) (`SaveValidationError.cause` exhaustiveness) collapses to `never` because of a TypeScript distributive-conditional bug, and PROP-TCU-012 (`NoteEditError` dead-variant assertion) does not actually assert that `Extract<NoteEditError, { kind: 'tag' }>` is unreachable in `applyTagOperationPure` — it only routes the variant to a runtime "dead-tag-variant" return value. Additionally, REQ-TCU-001/REQ-TCU-002 acceptance criteria about `IndexedNote.tagInventory` content (added tag present with `usageCount >= 1`; removed tag absent) are not asserted by the pipeline tests. |
| Implementation Soundness | PASS | Idempotent add/remove short-circuits before `Clock.now()` and before all I/O (`pipeline.ts:63-65`). Save-failure path does NOT call `updateProjectionsAfterSave`, `FeedOps.refreshSort`, or `TagInventoryOps.applyNoteFrontmatterEdited` (`pipeline.ts:87-101`). `previousFrontmatter` is sourced from the loaded note before any mutation (`apply-tag-operation-pure.ts:90`). Clock budget honored: 0 calls on idempotent/not-found/hydration-fail; 1 call on write paths (`pipeline.ts:69` is the only `clockNow()` call site). `tagsEqualAsSet` matches the spec set-equality definition. |
| Type Safety / Canonical Consistency | FAIL | `mapNoteEditErrorToSaveError` (`apply-tag-operation-pure.ts:120-129`) accepts any `NoteEditError` variant and unconditionally returns `cause: 'frontmatter-invariant'`. There is no narrowing to `{ kind: 'frontmatter', reason: { kind: 'updated-before-created' } }`, so a `kind: 'tag'` error or `frontmatter.duplicate-tag` reason — even though declared dead in this workflow — would be silently mapped to the wrong cause without a type-system guard. Combined with the missing genuine PROP-TCU-012 Tier-0 assertion, the dead-variant guarantee is unenforced. The `as unknown as Frontmatter` casts (`apply-tag-operation-pure.ts:46, 65`) and `epochMillis` casts via `as unknown as { epochMillis: number }` (lines 32-33, `update-projections.ts:47-48`) are also un-narrowed structural escapes. |
| Refactor Quality | PASS | Helpers (`isNoOpCommand`, `buildIdempotentResult`, `mapFsErrorToReason`, `tagDiff`) are extracted at appropriate granularity, the comments reflect WHY (REQ/PROP IDs, design decisions) rather than WHAT, and there is no dead code in the executed paths. Step files are small (~50–130 lines each) with clear single responsibilities. |

**overallVerdict is FAIL because three dimensions FAIL.**

## Findings (FAIL triggers)

### FIND-IMPL-TCU-001 — PROP-TCU-007(b) Tier-0 exhaustiveness is vacuous (TypeScript distributive-conditional bug)
- **Dimension**: Test Coverage Completeness
- **Severity**: blocker
- **Location**: `promptnotes/src/lib/domain/__tests__/tag-chip-update/__verify__/prop-007-save-error-cause-exhaustive.harness.test.ts:46-65`
- **Finding**: `assertSaveValidationCauseExhaustive` declares its parameter type as
  ```ts
  cause: SaveValidationErrorDelta extends { kind: "invariant-violated" }
    ? SaveValidationErrorDelta["cause"]
    : never
  ```
  Conditional types only distribute when the *checked type* is a naked generic type parameter. Here `SaveValidationErrorDelta` is a concrete type alias (not a type parameter), so the conditional is evaluated as a whole. The full union `{ kind: 'empty-body-on-idle' } | { kind: 'invariant-violated'; cause; detail }` does NOT extend `{ kind: 'invariant-violated' }` (the `empty-body-on-idle` branch fails). Therefore the conditional resolves to `never`, and `cause` has type `never`. The `switch` is "exhaustive" only because `never` matches no case. The test bodies (lines 96, 100, 104) call `assertSaveValidationCauseExhaustive("note-not-in-feed")` etc., which TypeScript would normally reject, but `bun test` does not run `tsc` and strips types at runtime, so the calls run as plain JavaScript.
- **Why it fails**: PROP-TCU-007 is `required: true` in the lean-mode contract (verification-architecture.md line 288). Adding a 4th `cause` variant to `SaveValidationErrorDelta` (e.g., re-introducing `'tag-vo-invalid'`) would NOT cause this test to fail to compile, because the compiler is comparing against `never` rather than against the actual three-cause discriminator. The Tier-0 exhaustiveness obligation is therefore not actually enforced.
- **Suggested resolution**: Replace the conditional type with a direct `Extract`:
  ```ts
  cause: Extract<SaveValidationErrorDelta, { kind: "invariant-violated" }>["cause"]
  ```
  This narrows the union BEFORE indexing into `cause`, producing `'note-not-in-feed' | 'hydration-failed' | 'frontmatter-invariant'`. Adding a 4th variant would then break the `switch` exhaustiveness as intended.

### FIND-IMPL-TCU-002 — PROP-TCU-012 dead-variant proof does not actually prove unreachability
- **Dimension**: Test Coverage Completeness
- **Severity**: major
- **Location**: `promptnotes/src/lib/domain/__tests__/tag-chip-update/__verify__/prop-012-note-edit-error-dead-variants.harness.test.ts:46-71, 88-97`
- **Finding**: The test defines `type DeadTagVariant = Extract<NoteEditError, { kind: "tag" }>` (line 47) but never asserts this type is `never`. It then defines a `classifyNoteEditError` function (line 54-71) that handles BOTH `'frontmatter'` and `'tag'` branches at runtime, mapping `'tag'` to a `'dead-tag-variant'` return value. The runtime test (lines 88-97) constructs a `kind: 'tag'` error and expects `classifyNoteEditError` to return `'dead-tag-variant'`. This proves only that the classifier handles the variant — it does NOT prove the variant is unreachable in `applyTagOperationPure` (the proof target named in PROP-TCU-012).
- **Why it fails**: The verification-architecture.md spec (line 254) explicitly requires: *"Tier-0 type assertion: `Extract<NoteEditError, { kind: 'tag' }>` branch in `applyTagOperationPure` is provably dead (pre-validated Tag brand)"*. The proof obligation is a structural type-level guarantee about the implementation's error path, not a runtime classification table. Today the impl's `mapNoteEditErrorToSaveError` (`apply-tag-operation-pure.ts:120-129`) silently maps a `kind: 'tag'` `NoteEditError` to `cause: 'frontmatter-invariant'` (the wrong cause), and nothing forbids this. There is no `Exclude<NoteEditError['kind'], 'tag'>` narrowing in the implementation or the test.
- **Suggested resolution**: Add a Tier-0 narrowing helper in `apply-tag-operation-pure.ts` whose signature accepts only the live variant, e.g.:
  ```ts
  type LiveAddTagError = Extract<NoteEditError, { kind: "frontmatter"; reason: { kind: "updated-before-created" } }>;
  function mapLiveAddTagErrorToSaveError(err: LiveAddTagError): SaveErrorDelta { ... }
  ```
  Then in the test:
  ```ts
  type _DeadIsNever = Extract<NoteEditError, { kind: "tag" }> extends never ? true : never;
  ```
  Wait — this would actually evaluate to `false` because the canonical `NoteEditError` *does* include the `tag` variant. The correct approach is to assert that the impl's narrowing function refuses the dead variant:
  ```ts
  // @ts-expect-error — tag variant is dead in this workflow
  mapLiveAddTagErrorToSaveError({ kind: "tag", reason: { kind: "empty" } });
  ```
  This compile-time check fires only if the impl's signature actually narrows.

### FIND-IMPL-TCU-003 — `tagChipUpdate` signature deviates from canonical without a declared delta
- **Dimension**: Spec Implementation Fidelity
- **Severity**: major
- **Location**: `promptnotes/src/lib/domain/tag-chip-update/_deltas.ts:69-79`, `pipeline.ts:28-32`
- **Finding**: The spec's "Pipeline Output" section (`behavioral-spec.md:117-123`) declares the canonical signature as:
  ```ts
  type TagChipUpdate = (deps: TagChipUpdateDeps) => (command: TagChipCommand) => Promise<Result<IndexedNote, SaveError>>
  ```
  The implementation uses
  ```ts
  type TagChipUpdate = (deps: TagChipUpdateDeps, feed: Feed, inventory: TagInventory) => (command: TagChipCommand) => Promise<Result<IndexedNote, SaveErrorDelta>>
  ```
  which threads `feed` and `inventory` through the outer curry rather than via `deps` or via the command. The `_deltas.ts:69-74` "Builder note" justifies this with "the test contract explicitly invokes them this way", but the spec lists exactly five deltas (Delta 1–5) and this 3-argument outer curry is not one of them.
- **Why it fails**: REQ-TCU-001 acceptance criteria reference the canonical signature. `behavioral-spec.md:108-110` says feed/inventory are *inputs to invocation*, but the canonical type signature shown in the same spec contradicts this. The implementation has unilaterally chosen the 3-arg form to match its tests; the test contract should have been justified as Delta 6 in the spec, OR feed/inventory should have been folded into `TagChipUpdateDeps`, OR they should have been part of the inner `TagChipCommand` envelope.
- **Suggested resolution**: Either (a) declare Delta 6 in `behavioral-spec.md` Revision 4 explicitly aligning the canonical signature with the implementation, (b) refactor `tagChipUpdate` to accept `feed` and `inventory` via `deps` (e.g., `deps.getCurrentFeed()`, `deps.getCurrentInventory()`), or (c) wrap them into a stage object passed alongside `command`. Until then, downstream consumers cannot rely on the spec to predict the impl's signature.

### FIND-IMPL-TCU-004 — `mapNoteEditErrorToSaveError` accepts any `NoteEditError` variant without narrowing, silently misclassifying dead variants
- **Dimension**: Type Safety / Canonical Consistency
- **Severity**: major
- **Location**: `promptnotes/src/lib/domain/tag-chip-update/apply-tag-operation-pure.ts:120-129`
- **Finding**:
  ```ts
  function mapNoteEditErrorToSaveError(err: NoteEditError): SaveErrorDelta {
    return {
      kind: "validation",
      reason: {
        kind: "invariant-violated",
        cause: "frontmatter-invariant",
        detail: err.reason.kind,
      },
    };
  }
  ```
  The function's parameter type is the full `NoteEditError = { kind: 'frontmatter'; reason: FrontmatterError } | { kind: 'tag'; reason: TagError }`. It unconditionally returns `cause: 'frontmatter-invariant'`. If the inline `addTag` or a future replacement ever returned `{ kind: 'tag', reason: { kind: 'empty' } }` (e.g., a regression that bypassed the `Tag` brand), it would be silently mapped to `cause: 'frontmatter-invariant'` with `detail: 'empty'` — semantically incorrect and undetectable from the caller's perspective.
- **Why it fails**: REQ-TCU-007 (live variant only) and the dead-variant guarantee in REQ-TCU-009 / spec Delta 1 rationale (`behavioral-spec.md:234`, `verification-architecture.md:185`) rely on the impl ENFORCING the dead-variant property. The current code does the opposite — it accepts and laundrys the dead variant.
- **Suggested resolution**: Narrow the parameter type to the live variant only:
  ```ts
  type LiveAddTagError = Extract<NoteEditError, { kind: "frontmatter"; reason: { kind: "updated-before-created" } }>;
  function mapLiveAddTagErrorToSaveError(err: LiveAddTagError): SaveErrorDelta { ... }
  ```
  At the call site, use a type guard or exhaustive switch that proves the dead branches are unreachable. This wires the dead-variant guarantee into the type system rather than relying on a comment.

### FIND-IMPL-TCU-005 — REQ-TCU-001/002 acceptance criteria for `IndexedNote.tagInventory` content are not asserted in tests
- **Dimension**: Test Coverage Completeness
- **Severity**: major
- **Location**: `promptnotes/src/lib/domain/__tests__/tag-chip-update/pipeline.test.ts:223-308 (REQ-TCU-001), 312-354 (REQ-TCU-002)`, plus PROP-TCU-008/009 listed under happy-path
- **Finding**: REQ-TCU-001 acceptance criteria (`behavioral-spec.md:397-398`) require: *"`IndexedNote.tagInventory` includes `tag` with `usageCount >= 1`"* and *"`IndexedNote.feed` is a new `Feed` instance returned by `FeedOps.refreshSort`"*. The corresponding tests in `pipeline.test.ts` only assert `result.ok === true`, that a `note-file-saved` event was published once, and that `tag-inventory-updated` was emitted once — none of them inspect `IndexedNote.tagInventory.entries` to confirm the tag is present with `usageCount >= 1`. The same gap exists for REQ-TCU-002 / PROP-TCU-009: there is no test asserting that the removed tag is absent from `IndexedNote.tagInventory` after the pipeline returns. The `update-projections.ts` `applyNoteFrontmatterEdited` logic (lines 58-89) is therefore not exercised through the public surface of the workflow — only through `update-projections`-specific tests (file existence presumed but unconfirmed) which would not catch a regression that, e.g., short-circuited `updateProjectionsAfterSave` to return the original inventory.
- **Why it fails**: PROP-TCU-008 and PROP-TCU-009 are explicit pipeline integration obligations. Spy-based assertions on event emission are necessary but not sufficient — they don't confirm that the value returned in `Ok(IndexedNote)` reflects the projection update.
- **Suggested resolution**: Add to each happy-path test:
  ```ts
  if (!result.ok) throw new Error("expected Ok");
  const entries = result.value.tagInventory.entries;
  const found = entries.find(e => String(e.name) === String(tag));
  expect(found?.usageCount ?? 0).toBeGreaterThanOrEqual(1); // add path
  // and for remove path: expect(found).toBeUndefined();
  ```

### FIND-IMPL-TCU-006 — `update-projections.ts` masks the spec's non-null `previousFrontmatter` invariant with a silent `?? event.frontmatter` fallback
- **Dimension**: Implementation Soundness
- **Severity**: major
- **Location**: `promptnotes/src/lib/domain/tag-chip-update/update-projections.ts:104`
- **Finding**:
  ```ts
  const previousFm = event.previousFrontmatter ?? event.frontmatter;
  ```
  The spec REQ-TCU-009 (`behavioral-spec.md:580-583`) and PROP-TCU-005 establish a non-null invariant: *"`NoteFileSaved.previousFrontmatter` is always non-null in this workflow."* If the invariant ever broke (e.g., a Vault adapter that fails to forward `previousFrontmatter`), the fallback would compute `tagDiff(after, after) = { added: [], removed: [] }`, silently emitting an empty `TagInventoryUpdated` event and leaving the inventory unchanged. The bug would be invisible from the workflow's return value and the published events.
- **Why it fails**: The fallback is defensive coding that contradicts the spec's "by construction" guarantee. Either the invariant holds (in which case the fallback is dead code that should be eliminated and replaced with an assertion) or it does not (in which case a hidden incorrect-state bug is introduced).
- **Suggested resolution**: Replace with an explicit assertion:
  ```ts
  if (event.previousFrontmatter === null) {
    throw new Error("invariant violated: tag-chip-update NoteFileSaved.previousFrontmatter must be non-null");
  }
  const previousFm = event.previousFrontmatter;
  ```
  Or, even better, narrow `NoteFileSaved` at the Vault-port boundary so that `previousFrontmatter: Frontmatter` (non-null) by type. Either approach removes the silent failure mode.

## Suggestions (non-blocking)

- **SUGG-IMPL-TCU-001 (Refactor Quality)**: `apply-tag-operation-pure.ts` performs raw structural casts to extract `epochMillis` (`(fm.createdAt as unknown as { epochMillis: number }).epochMillis`, lines 32-33). The same pattern recurs in `update-projections.ts:47-48`. Consider extracting a single internal helper `tsToMillis(t: Timestamp): number` near the value-object alias to centralize the cast and simplify diffs if `Timestamp` later changes.
- **SUGG-IMPL-TCU-002 (Test Coverage Completeness)**: The pipeline test for "save-fail still calls Clock once" (`pipeline.test.ts:846-861`) asserts `_clockCallCount === 1` but does not also assert `_publishInternalCallCount === 0` and `_writeMarkdownCallCount === 1` (write attempted, not skipped). Add those assertions to lock down the full save-fail spy profile in one test.
- **SUGG-IMPL-TCU-003 (Spec Implementation Fidelity)**: `pipeline.ts:82` calls `deps.publish(saveRequest)` (publishing `SaveNoteRequested`) before `writeMarkdown`. The spec lists `SaveNoteRequested` as the input to `writeMarkdown`, not necessarily an event emitted on the public bus before write. Verify this is intentional; if not, drop the redundant publish.
- **SUGG-IMPL-TCU-004 (Refactor Quality)**: `pipeline.ts:43` performs an unsafe-feeling cast `(loadError as { kind: string }).kind === "not-found"`. Use a discriminated narrowing instead, e.g. `if ("kind" in loadError && loadError.kind === "not-found")`, then `else` branch handles the `SaveErrorDelta` case without further casts.

## Convergence Signals

- Findings count: 6 (1 blocker, 5 major)
- Vacuous test count: 2 (PROP-TCU-007(b), PROP-TCU-012)
- Required PROP coverage gaps: PROP-TCU-007(b) Tier-0 not enforced (vacuous due to TS distributive bug); PROP-TCU-012 Tier-0 dead-variant guarantee not actually proven; PROP-TCU-008/009 assertion content missing from happy-path tests
- Recommended routing: FIND-IMPL-TCU-001, -002, -005 → Phase 2a (test repair / additional coverage); FIND-IMPL-TCU-003 → Phase 1a (spec Revision 4 to declare Delta 6, or impl reshape); FIND-IMPL-TCU-004, -006 → Phase 2b (impl narrowing + assertion replacement)
