# Findings — delete-note Phase 3 sprint-2 iter-1

**Verdict**: PASS
**Resolved from sprint-1**: 5/5
**New findings**: 0

## Resolution audit (sprint-1 → sprint-2)

| Finding | Status | Evidence |
|---|---|---|
| FIND-IMPL-DLN-001 (filePath threading) | RESOLVED | `_deltas.ts` adds `AuthorizedDeletionDelta { filePath: string }`; `authorize-deletion-pure.ts` captures `snapshot.filePath` once; `pipeline.ts` uses `authorized.filePath` (no second `getNoteSnapshot` call, no `?? ""` mask). |
| FIND-IMPL-DLN-002 (`_deltas.ts` convention) | RESOLVED | `behavioral-spec.md` adds explicit "Convention note (FIND-IMPL-DLN-002)" documenting that all deltas live in `_deltas.ts` and that the `as DeletionError` cast at the orchestrator boundary is the structural marker. |
| FIND-IMPL-DLN-003 (NoteFileDeleted.frontmatter deep-equality) | RESOLVED | `pipeline.test.ts:234-261` ("REQ-DLN-006: NoteFileDeleted.frontmatter deep-equals snapshot frontmatter at authorization time") extracts the published `note-file-deleted` event and runs `expect(event?.frontmatter).toEqual(snapshotFrontmatter)`. |
| FIND-IMPL-DLN-004 (removedTags content) | RESOLVED | `pipeline.test.ts:897,916` assert `expect(tagUpdated.removedTags.map(String)).toEqual([String(tag)])` for usageCount:1 and usageCount:5 cases. |
| FIND-IMPL-DLN-005 (PROP-DLN-004 fail-fast) | RESOLVED | `step1-authorize-deletion.test.ts:332-335` replaces `if (result.ok)` gate with `expect(result.ok).toBe(true); if (!result.ok) return; ... expect(auth.frontmatter).toEqual(fm)`. |

## Fresh fidelity scan

- pipeline orchestrator calls `getNoteSnapshot` zero times directly; the only call is inside the `authorizeDeletion` effectful shell (one call per invocation).
- `removedTagsFromDeletion` (pure helper in `update-projections.ts`) is deterministic and pure; no port or clock access.
- `normalize-fs-error.ts` exhaustive switch covers all 5 `FsError` arms with a `_never` guard.
- `updateProjectionsAfterDelete` signature `(feed, inventory, event) => UpdatedProjection` is pure (PROP-DLN-016 enforced structurally).
- Spec Delta 5 implementation note honored via option a (augmented stage type in `_deltas.ts`).
- Sprint-2 evidence: 144/144 delete-note tests pass; 213/213 regression baseline pass.

(none)
