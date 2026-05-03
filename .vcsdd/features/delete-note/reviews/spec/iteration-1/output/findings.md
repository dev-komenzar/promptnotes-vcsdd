# Findings — delete-note Phase 1c iter-1

**Verdict**: FAIL
**Finding count**: 6 (2 BLOCKER, 2 MAJOR, 2 MINOR)
**Dimensions**: spec_fidelity = PASS, verification_readiness = FAIL

## FIND-SPEC-DLN-001
- **Severity**: BLOCKER
- **Dimension**: verification_readiness
- **Location**: `verification-architecture.md:182` ("Emits TagInventoryUpdated via deps.publishInternal when removedTags.length > 0.") vs `verification-architecture.md:19` ("Step 4 | `updateProjectionsAfterDelete` | **Pure core**") and lines 185-191 (return type is plain `UpdatedProjection`, no Promise/effect).
- **Issue**: VA classifies `updateProjectionsAfterDelete` as a Pure core proof target while simultaneously stating its implementation emits a side-effecting `deps.publishInternal` call, contradicting REQ-DLN-001's acceptance criteria which place the `publishInternal` call in the orchestrator.
- **Suggested fix**: Decide explicitly that `updateProjectionsAfterDelete` is pure and that `TagInventoryUpdated` is emitted by the workflow orchestrator after consulting the projection delta; update the docstring at line 182 and add a corresponding PROP that the pure function never receives or invokes any port.

## FIND-SPEC-DLN-002
- **Severity**: BLOCKER
- **Dimension**: verification_readiness
- **Location**: `verification-architecture.md:88-89` ("FsError variants in scope: permission, lock, not-found, unknown. (disk-full is not applicable to a trash operation; would surface as 'unknown'.)") and `verification-architecture.md:205` (PROP-DLN-006 (c): "switch over `FsError.kind` within the `DeletionError.kind === 'fs'` branch compiles") vs canonical `docs/domain/code/ts/src/shared/errors.ts:12-17` (`FsError` union still includes `{ kind: "disk-full" }`).
- **Issue**: `TrashFile` is typed `Promise<Result<void, FsError>>` so `disk-full` is structurally producible, yet the spec excludes it from in-scope variants, the `NoteDeletionFailureReason` mapping table omits it, and PROP-DLN-006(c) demands an exhaustive switch — leaving no defined contract for which layer normalizes `disk-full` to `'unknown'` or how `disk-full` would be tested.
- **Suggested fix**: Either narrow the `TrashFile` error type to a `TrashFsError` subset that excludes `disk-full`, or add an explicit normalization step (port adapter or orchestrator) with a corresponding REQ/PROP that asserts `disk-full → NoteDeletionFailureReason 'unknown'` and verify the exhaustiveness assertion in PROP-DLN-006(c) compiles against the narrowed type.

## FIND-SPEC-DLN-003
- **Severity**: MAJOR
- **Dimension**: verification_readiness
- **Location**: `verification-architecture.md:201` (PROP-DLN-002: "(c) when both pass, returns `Ok(AuthorizedDeletion { frontmatter: snapshot.frontmatter })`") vs `verification-architecture.md:132-135` (`authorizeDeletionPure` Ok requires THREE preconditions: editing check, `Feed.hasNote`, AND `snapshot !== null`).
- **Issue**: PROP-DLN-002 references "both pass" while the documented `Ok` contract has three preconditions, leaving the property statement ambiguous about whether `snapshot === null` is exercised inside Ok-arm property generation, and risking a property test that never triggers the snapshot-null branch.
- **Suggested fix**: Reword PROP-DLN-002(c) to "when all three preconditions hold (editing check, `Feed.hasNote`, `snapshot !== null`)" and add an explicit (d) bullet asserting `snapshot === null` produces `Err({ kind: 'not-in-feed' })`.

## FIND-SPEC-DLN-004
- **Severity**: MAJOR
- **Dimension**: spec_fidelity
- **Location**: `behavioral-spec.md:497` (REQ-DLN-010 acceptance: "`deps.publishInternal(TagInventoryUpdated { addedTags: [], removedTags: [...frontmatter.tags], occurredOn: now })`") vs `docs/domain/code/ts/src/curate/internal-events.ts:42-47` (canonical `TagInventoryUpdated.removedTags: readonly Tag[]` with no semantic definition) and `docs/domain/code/ts/src/curate/read-models.ts:18-20` (TagInventory invariant "usageCount > 0").
- **Issue**: The spec silently equates `removedTags` with the deleted note's `frontmatter.tags` (i.e. "tags whose count was decremented"), but the field name and aggregates.md §3 imply "tags removed from the inventory entries" (only the 1→0 transitions); without a justification this is a contract reinterpretation that could mislead any consumer relying on the field name's natural meaning.
- **Suggested fix**: Add an explicit semantic clause in REQ-DLN-010 stating "`removedTags` enumerates every tag whose `usageCount` changed, not only those pruned to zero", and either propose a contract delta to rename `removedTags` (e.g. `decrementedTags`) or add a property test pinning the chosen interpretation.

## FIND-SPEC-DLN-005
- **Severity**: MINOR
- **Dimension**: spec_fidelity
- **Location**: `behavioral-spec.md:344` (REQ-DLN-003 edge case: "If `Feed.hasNote` returns true but `deps.getNoteSnapshot` returns null... the implementation SHALL treat this as `not-in-feed` equivalent") vs `docs/domain/code/ts/src/shared/errors.ts:60-62` (canonical `AuthorizationError` has only `editing-in-progress` and `not-in-feed`).
- **Issue**: A Feed/snapshot inconsistency (Feed claims the note exists but the snapshot store does not) is structurally a different fault than "note not in Feed", but the spec collapses both into the same discriminator with no `detail` field, eliminating diagnostic signal at the cross-context error boundary.
- **Suggested fix**: Either propose a contract delta adding a third `AuthorizationError` variant (e.g. `{ kind: 'snapshot-missing'; noteId }`) or extend the existing `not-in-feed` shape with an optional `cause` field, and document the choice as a Delta with rationale.

## FIND-SPEC-DLN-006
- **Severity**: MINOR
- **Dimension**: spec_fidelity
- **Location**: `behavioral-spec.md:379` (REQ-DLN-004 acceptance lists `NoteDeletionFailed { kind, noteId, reason, occurredOn }` only) vs `docs/domain/code/ts/src/shared/events.ts:76-82` (`NoteDeletionFailed.detail?: string`) and `docs/domain/code/ts/src/shared/errors.ts:17` (`FsError { kind: 'unknown'; detail: string }`).
- **Issue**: The canonical `FsError` `'unknown'` variant carries a mandatory `detail`, and `NoteDeletionFailed` carries an optional `detail`, but no requirement specifies that `FsError.unknown.detail` is propagated to `NoteDeletionFailed.detail?`, so diagnostic information will silently disappear in the most opaque error path.
- **Suggested fix**: Add an acceptance criterion to REQ-DLN-004 that when `FsError.kind === 'unknown'`, `NoteDeletionFailed.detail === FsError.detail`, and consider a Tier 2 PROP asserting the propagation.
