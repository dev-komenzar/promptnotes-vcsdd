# Verification Report

## Feature: delete-note | Sprint: 1 | Date: 2026-05-03

## Proof Obligations

| ID | Tier | Required | Status | Tool | Artifact |
|----|------|----------|--------|------|---------|
| PROP-DLN-001 | 1 | true | proved | fast-check | `step1-authorize-deletion.test.ts` |
| PROP-DLN-002 | 2 | true | proved | example-based | `step1-authorize-deletion.test.ts` |
| PROP-DLN-003 | 2 | true | proved | example-based (spy) | `pipeline.test.ts` |
| PROP-DLN-004 | 1 | true | proved | fast-check | `step1-authorize-deletion.test.ts` |
| PROP-DLN-005 | 2 | true | proved | example-based (spy) | `pipeline.test.ts` |
| PROP-DLN-006 | 0 | true | proved | tsc + example-based | `__verify__/prop-dln-007-error-exhaustiveness.harness.test.ts` |
| PROP-DLN-007 | 0 | true | proved | tsc | `__verify__/prop-dln-015-non-coupling.harness.test.ts` |
| PROP-DLN-008 | 2 | false | proved | example-based | `pipeline.test.ts` |
| PROP-DLN-009 | 2 | false | proved | example-based | `pipeline.test.ts` |
| PROP-DLN-010 | 2 | false | proved | example-based (spy) | `pipeline.test.ts` |
| PROP-DLN-011 | 2 | false | proved | example-based (spy) | `pipeline.test.ts` |
| PROP-DLN-012 | 1 | false | proved | fast-check | `step4-update-projections.test.ts` |
| PROP-DLN-013 | 0 | false | proved | tsc | `__verify__/prop-dln-014-event-channels.harness.test.ts` |
| PROP-DLN-014 | 2 | false | proved | example-based | `pipeline.test.ts` |
| PROP-DLN-015 | 3 | false | proved | integration (spy fakes) | `pipeline.test.ts` |
| PROP-DLN-016 | 2 | true | proved | example-based (spy) | `pipeline.test.ts` |
| PROP-DLN-017 | 2 | true | proved | example-based (spy) | `pipeline.test.ts` |
| PROP-DLN-018 | 2 | false | proved | example-based | `pipeline.test.ts` |

## Execution Evidence

### Test run

Command: `cd promptnotes && bunx --bun bun test src/lib/domain/__tests__/delete-note/`
Result: **143 pass, 0 fail** (82 ms, 689 expect() calls, 8 files)

Per-file breakdown:
- `pipeline.test.ts` — 49 tests (PROP-DLN-003, 005, 008–011, 014–018)
- `step1-authorize-deletion.test.ts` — 16 tests (PROP-DLN-001, 002, 004)
- `step2-build-delete-request.test.ts` — 6 tests (step 2 purity and shape)
- `step3-trash-file.test.ts` — 19 tests (FsError variants, trashFile port contract)
- `step4-update-projections.test.ts` — 11 tests (PROP-DLN-012, 016)
- `__verify__/prop-dln-007-error-exhaustiveness.harness.test.ts` — 16 tests (PROP-DLN-006)
- `__verify__/prop-dln-014-event-channels.harness.test.ts` — 14 tests (PROP-DLN-013)
- `__verify__/prop-dln-015-non-coupling.harness.test.ts` — 12 tests (PROP-DLN-007)

### TypeScript check

Command: `cd promptnotes && bunx --bun tsc --noEmit -p . 2>&1 | grep "delete-note"`
Errors in delete-note impl and tests: **0**
Pre-existing errors in OTHER feature test files: 9
(apply-filter-or-search: 6 errors around `fc.stringOf` API version; edit-past-note-start: 3 errors around `SwitchError` type. These are unrelated to delete-note; documented but not fixed per Phase 5 read-only constraint.)

## Results

### PROP-DLN-001: authorizeDeletionPure referential transparency (Tier 1, required)
- **Tool**: fast-check (Tier 1)
- **File**: `step1-authorize-deletion.test.ts`
- **Result**: VERIFIED
- **Evidence**: Property tests run with fc.assert across 100 runs; for all generated (NoteId, NoteId|null, Feed, NoteFileSnapshot|null) inputs, `authorizeDeletionPure(...)` called twice with identical arguments produces structurally equal Result values. Non-vacuous: generators produce a mix of editing/non-editing note IDs, feeds with and without the note, and null/non-null snapshots.

### PROP-DLN-002: Authorization rules — four-branch enumeration (Tier 2, required)
- **Tool**: example-based (Tier 2)
- **File**: `step1-authorize-deletion.test.ts`
- **Result**: VERIFIED
- **Evidence**: Four distinct test cases:
  - (a) `editingCurrentNoteId === noteId` → `Err({ kind: 'editing-in-progress' })`
  - (b) `!Feed.hasNote` → `Err({ kind: 'not-in-feed' })` with no `cause` field
  - (c) `Feed.hasNote true`, `snapshot === null` → `Err({ kind: 'not-in-feed', cause: 'snapshot-missing' })`
  - (d) all preconditions hold → `Ok(AuthorizedDeletion { frontmatter: snapshot.frontmatter })`

### PROP-DLN-003: Save-failure projection isolation (Tier 2, required)
- **Tool**: example-based with spy deps (Tier 2)
- **File**: `pipeline.test.ts`
- **Result**: VERIFIED
- **Evidence**: For each FsError variant (`permission`, `lock`, `disk-full`, `unknown`), `updateProjectionsAfterDelete`, `Feed.removeNoteRef`, `TagInventory.applyNoteDeleted`, and `deps.publishInternal` are not called (verified via spy call-count === 0). Feed and TagInventory remain unchanged.

### PROP-DLN-004: frontmatter sourcing invariant (Tier 1, required)
- **Tool**: fast-check (Tier 1)
- **File**: `step1-authorize-deletion.test.ts`
- **Result**: VERIFIED
- **Evidence**: Property test: for all valid (noteId, feed with noteId, snapshot) inputs where `authorizeDeletionPure` returns `Ok(auth)`, `auth.frontmatter` deep-equals `snapshot.frontmatter`. Covers 100 generated inputs.

### PROP-DLN-005: occurredOn threading + Clock budget (Tier 2, required)
- **Tool**: example-based with spy (Tier 2)
- **File**: `pipeline.test.ts`
- **Result**: VERIFIED
- **Evidence**: Happy-path test with fixed now stub (`epochMillis: 99999`). After a successful run: `DeleteNoteRequested.occurredOn.epochMillis === 99999`, `NoteFileDeleted.occurredOn.epochMillis === 99999`, `TagInventoryUpdated.occurredOn.epochMillis === 99999`. `clockNow` spy call count === 1. `updateProjectionsAfterDelete` sources now from `event.occurredOn` (no second Clock call inside the pure function).

### PROP-DLN-006: Error discriminator exhaustiveness (Tier 0, required)
- **Tool**: tsc --noEmit (Tier 0) + example-based (Tier 0+2)
- **File**: `__verify__/prop-dln-007-error-exhaustiveness.harness.test.ts`
- **Result**: VERIFIED (16 tests, 0 fail)
- **Evidence**:
  - (a) `assertDeletionErrorExhaustive` with `never` default compiles — exactly `'authorization'` and `'fs'` arms
  - (b) `assertAuthorizationErrorExhaustive` with `never` default compiles — exactly `'editing-in-progress'` and `'not-in-feed'` arms; Delta 6 `cause?` field does not add a new discriminator
  - (c) `assertFsErrorExhaustive` with `never` default compiles — all 5 variants covered with explicit arms including `'disk-full'` (FIND-SPEC-DLN-002 satisfied)
  - Runtime tests verify each arm returns the correct mapped value

### PROP-DLN-007: Non-coupling type assertion (Tier 0, required)
- **Tool**: tsc --noEmit (Tier 0)
- **File**: `__verify__/prop-dln-015-non-coupling.harness.test.ts`
- **Result**: VERIFIED (12 tests, 0 fail)
- **Evidence**: Type-level assertions confirm `'getEditorBuffer' extends keyof DeleteNoteDeps` is `false`, `'editingState' extends keyof DeleteNoteDeps` is `false`, `'editingCurrentNoteId' extends keyof DeleteNoteDeps` is `false`. Positive checks confirm all 7 required port keys are present. Runtime structural check confirms no editor keys on a constructed minimal deps object.

### PROP-DLN-008: not-found graceful path (Tier 2, not required)
- **Tool**: example-based (Tier 2)
- **File**: `pipeline.test.ts`
- **Result**: VERIFIED
- **Evidence**: `trashFile` stub returns `Err({ kind: 'not-found' })`. `NoteFileDeleted` emitted, `NoteDeletionFailed` NOT emitted, projections updated, `Ok(UpdatedProjection)` returned.

### PROP-DLN-009: Happy-path full pipeline (Tier 2, not required)
- **Tool**: example-based (Tier 2)
- **File**: `pipeline.test.ts`
- **Result**: VERIFIED
- **Evidence**: `trashFile` returns `Ok(void)`. `UpdatedProjection` returned with `noteId` absent from `feed.noteRefs`. TagInventory decrements verified. `DeleteNoteRequested` emitted before trash, `NoteFileDeleted` emitted after.

### PROP-DLN-010: TagInventoryUpdated emission rule and removedTags semantics (Tier 2, not required)
- **Tool**: example-based with spy (Tier 2)
- **File**: `pipeline.test.ts`
- **Result**: VERIFIED
- **Evidence**: Three sub-cases: (a) note with tag `usageCount: 1` → `publishInternal` called once, tag absent from inventory; (b) note with tag `usageCount: 5` → `publishInternal` called once, tag remains with `usageCount: 4`, tag appears in `removedTags`; (c) note with no tags → `publishInternal` NOT called. Isolation: `updateProjectionsAfterDelete` called in isolation with spy-wrapped publishInternal — call count === 0.

### PROP-DLN-011: Clock budget (Tier 2, not required)
- **Tool**: example-based with spy (Tier 2)
- **File**: `pipeline.test.ts`
- **Result**: VERIFIED
- **Evidence**: 9 paths verified: `editing-in-progress=0`, `not-in-feed=0`, `snapshot-missing=0`, `happy=1`, `not-found=1`, `permission=1`, `lock=1`, `disk-full=1`, `unknown=1`.

### PROP-DLN-012: updateProjectionsAfterDelete is pure (Tier 1, not required)
- **Tool**: fast-check (Tier 1)
- **File**: `step4-update-projections.test.ts`
- **Result**: VERIFIED
- **Evidence**: Property test: for all generated (Feed, TagInventory, NoteFileDeleted) inputs, calling `updateProjectionsAfterDelete(feed, inventory, event)` twice produces structurally equal `UpdatedProjection` values. Confirms referential transparency.

### PROP-DLN-013: Event channel membership (Tier 0, not required)
- **Tool**: tsc --noEmit (Tier 0)
- **File**: `__verify__/prop-dln-014-event-channels.harness.test.ts`
- **Result**: VERIFIED (14 tests, 0 fail)
- **Evidence**: TypeScript `Extract<>` assertions confirm all three public events are members of `PublicDomainEvent`; `TagInventoryUpdated` is a member of `CurateInternalEvent` and is NOT a member of `PublicDomainEvent`; UI-layer events (`NoteDeletionRequestedInternal`, `NoteDeletionConfirmedInternal`, `NoteDeletionCanceled`) are members of `CurateInternalEvent`.

### PROP-DLN-014: NoteDeletionFailed.reason mapping (Tier 2, not required)
- **Tool**: example-based (Tier 2)
- **File**: `pipeline.test.ts`
- **Result**: VERIFIED
- **Evidence**: For each `FsError` variant on the error path: `permission → 'permission'`, `lock → 'lock'`, `disk-full → 'unknown'` (explicit arm), `unknown → 'unknown'`. `disk-full` arm is explicit in `normalizeFsError` switch (not absorbed by default).

### PROP-DLN-015: Full pipeline integration (Tier 3, not required)
- **Tool**: integration with in-memory port fakes (Tier 3)
- **File**: `pipeline.test.ts`
- **Result**: VERIFIED
- **Evidence**: Full pipeline run with in-memory fakes for all `DeleteNoteDeps` ports. Happy path: `noteId` absent from `UpdatedProjection.feed.noteRefs`, TagInventory reflects tag decrements, `DeleteNoteRequested` emitted before trash, `NoteFileDeleted` emitted after, spy call counts correct. Not-found graceful path: same projection outcome, no `NoteDeletionFailed`.

### PROP-DLN-016: updateProjectionsAfterDelete invokes no port (Tier 2, required)
- **Tool**: example-based with spy (Tier 2)
- **File**: `pipeline.test.ts`
- **Result**: VERIFIED
- **Evidence**: `updateProjectionsAfterDelete(feed, inventory, event)` called in isolation. Spy wrappers on `deps.publishInternal`, `deps.publish`, `deps.clockNow`, `deps.trashFile`, `deps.getNoteSnapshot`, `deps.getAllSnapshots` all show call count === 0 after the call. Primary enforcement for FIND-SPEC-DLN-001.

### PROP-DLN-017: disk-full normalization is total (Tier 2, required)
- **Tool**: example-based with spy (Tier 2)
- **File**: `pipeline.test.ts`
- **Result**: VERIFIED
- **Evidence**: `trashFile` stub returns `Err({ kind: 'disk-full' })`. `NoteDeletionFailed { reason: 'unknown', detail: 'disk-full' }` emitted. `updateProjectionsAfterDelete` NOT called (spy call count === 0). Tier-0 companion: explicit `'disk-full'` arm in `normalizeFsError` switch verified by tsc exhaustiveness check (PROP-DLN-006(c)).

### PROP-DLN-018: FsError.unknown.detail propagation (Tier 2, not required)
- **Tool**: example-based (Tier 2)
- **File**: `pipeline.test.ts`
- **Result**: VERIFIED
- **Evidence**: `trashFile` stub returns `Err({ kind: 'unknown', detail: 'I/O timeout' })`. `NoteDeletionFailed.detail === 'I/O timeout'` (exact propagation). Fast-check companion in `step3-trash-file.test.ts` verifies propagation holds for arbitrary detail strings.

## Summary

- Required obligations: 9
- Proved: 9
- Failed: 0
- Skipped: 0
- Non-required obligations: 9
- Non-required proved: 9
- Total obligations: 18 / 18 proved
- Total test count: **143 pass, 0 fail**
- TypeScript check (delete-note files): **0 errors**
