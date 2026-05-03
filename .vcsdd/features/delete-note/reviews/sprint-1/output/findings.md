# Findings — delete-note Phase 3 sprint-1 iter-1

**Verdict**: PASS
**Per-dimension**: spec_fidelity=PASS · test_coverage=PASS · implementation_correctness=PASS · purity_boundary=PASS · edge_case_handling=PASS
**Severity summary**: 0 BLOCKER · 0 MAJOR · 5 MINOR (non-blocking)

All MINOR findings recorded for traceability. Lean mode tolerates MINOR remnants at convergence.

## FIND-IMPL-DLN-001
- **Severity**: MINOR · **Dimension**: implementation_correctness · **Category**: code_structure
- **Location**: `promptnotes/src/lib/domain/delete-note/pipeline.ts:77` — `const filePath = deps.getNoteSnapshot(authorized.noteId)?.filePath ?? "";`
- **Issue**: Orchestrator calls `deps.getNoteSnapshot` a second time to source `filePath`; the `?? ""` fallback silently masks a TOCTOU race. Spec Delta 5 prefers threading `filePath` as a local from authorization.
- **Suggested fix**: Capture `snapshot.filePath` once during `authorizeDeletion` and thread it into the `trashFile(filePath)` call.

## FIND-IMPL-DLN-002
- **Severity**: MINOR · **Dimension**: spec_fidelity · **Category**: spec_ambiguity
- **Location**: `promptnotes/src/lib/domain/delete-note/pipeline.ts:54` (`as DeletionError` cast) vs. canonical `docs/domain/code/ts/src/shared/errors.ts:60-62` (unmodified `AuthorizationError`)
- **Issue**: Spec Delta 6 directs Phase 2b to extend canonical `AuthorizationError.not-in-feed` with `cause?: 'snapshot-missing'`; impl carries the field via `_deltas.ts/AuthorizationErrorDelta` only and casts at the orchestrator boundary. Canonical contract not modified.
- **Suggested fix**: Either modify canonical `errors.ts` per Delta 6 and drop the cast, OR record an explicit decision that all deltas are kept in `_deltas.ts` rather than mutating canonical sources.

## FIND-IMPL-DLN-003
- **Severity**: MINOR · **Dimension**: test_coverage · **Category**: test_coverage
- **Location**: `promptnotes/src/lib/domain/__tests__/delete-note/pipeline.test.ts:219-232,724-745`
- **Issue**: REQ-DLN-006 acceptance requires `NoteFileDeleted.frontmatter === AuthorizedDeletion.frontmatter`, but no pipeline test deep-equality-asserts the published event's `frontmatter` against the source snapshot's frontmatter. Tests only check the event was emitted by `kind`.
- **Suggested fix**: Add a pipeline test that extracts the published `note-file-deleted` event and `expect(event.frontmatter).toEqual(snapshot.frontmatter)`.

## FIND-IMPL-DLN-004
- **Severity**: MINOR · **Dimension**: test_coverage · **Category**: test_coverage
- **Location**: `promptnotes/src/lib/domain/__tests__/delete-note/pipeline.test.ts:851-911`
- **Issue**: Tests assert `TagInventoryUpdated` is emitted with empty `addedTags`, but never assert the content of `removedTags`. A regression returning `removedTags: []` while still hitting the orchestrator's `length > 0` guard via a different path would not be caught.
- **Suggested fix**: Add `expect(tagUpdated.removedTags.map(String)).toEqual([String(tag)])` to the usageCount:1 and usageCount:5 cases.

## FIND-IMPL-DLN-005
- **Severity**: MINOR · **Dimension**: test_coverage · **Category**: test_quality
- **Location**: `promptnotes/src/lib/domain/__tests__/delete-note/step1-authorize-deletion.test.ts:320-338` (PROP-DLN-004 property block)
- **Issue**: Property assertion is gated on `if (result.ok)`. A regression returning `Err` for valid inputs would silently pass with zero `expect` calls — vacuous.
- **Suggested fix**: Use `expect(result.ok).toBe(true); if (!result.ok) return; expect(...)` so the property fails fast on any unexpected `Err`.
