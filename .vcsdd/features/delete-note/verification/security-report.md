# Security Hardening Report

## Feature: delete-note | Date: 2026-05-03

## Tooling

| Tool | Status | Notes |
|------|--------|-------|
| semgrep | NOT INSTALLED | `pip install semgrep` to enable automated pattern scanning. Manual static review performed as substitute. |
| Wycheproof | NOT APPLICABLE | delete-note contains no cryptographic primitives. No key handling, hash functions, or symmetric/asymmetric encryption. |
| tsc --noEmit | AVAILABLE | Zero errors in all delete-note source and test files. |
| bun test | AVAILABLE | 143 pass, 0 fail across 8 test files. |

Raw execution evidence: `.vcsdd/features/delete-note/verification/security-results/audit-run.txt`

## Threat Model Context

delete-note is a Curate-context pure domain pipeline in a Tauri desktop application. It operates as a single-process, single-user workflow. There is no network surface, no multi-user access control, and no cryptographic key management. The threat surface is small: the workflow accepts a typed `DeletionConfirmed` input, reads from an in-memory snapshot store, and delegates the single I/O operation (OS trash) to a typed port. All domain objects are branded TypeScript value objects, not raw strings.

## Audit Scope

Files audited:
- `promptnotes/src/lib/domain/delete-note/pipeline.ts`
- `promptnotes/src/lib/domain/delete-note/authorize-deletion-pure.ts`
- `promptnotes/src/lib/domain/delete-note/authorize-deletion.ts`
- `promptnotes/src/lib/domain/delete-note/build-delete-request.ts`
- `promptnotes/src/lib/domain/delete-note/update-projections.ts`
- `promptnotes/src/lib/domain/delete-note/normalize-fs-error.ts`
- `promptnotes/src/lib/domain/delete-note/_deltas.ts`

## Findings

### FIND-IMPL-DLN-001: TOCTOU race between getNoteSnapshot and trashFile

| Field | Value |
|-------|-------|
| Severity | LOW |
| Surface | `pipeline.ts:77` — second `getNoteSnapshot` call for `filePath` after authorization |
| Status | Accepted |

The `filePath` is retrieved via a second `deps.getNoteSnapshot(authorized.noteId)?.filePath ?? ""` call at pipeline.ts:77, which is distinct from the call made internally during `authorizeDeletion` at line 49. In theory, the snapshot could be mutated between these two calls, yielding a stale or null filePath (falling back to `""`). If filePath is `""`, `trashFile("")` returns `Err({ kind: 'not-found' })`, which the graceful-continue path handles correctly per REQ-DLN-005: `NoteFileDeleted` is emitted, projections are updated, and `Ok(UpdatedProjection)` is returned.

Mitigation in place: the graceful `not-found` path ensures no state corruption even in the theoretical race. The workflow is single-threaded in the Tauri/SvelteKit MVP — concurrent snapshot mutation without external coordination is not possible in the current deployment model.

Recommended future mitigation: carry `filePath` inside `AuthorizedDeletion` (behavioral-spec.md Delta 5, option (a)) to eliminate the second `getNoteSnapshot` call entirely. Deferred to a future sprint.

### Check [1]: Path traversal in filePath

CLEAN. `filePath` is sourced from `NoteFileSnapshot.filePath` (a typed string from the Curate in-memory snapshot store populated by the Vault adapter at startup). The `NoteId` used to look up the snapshot is a branded value object from `DeletionConfirmed.noteId`, not raw user text. No path concatenation or string manipulation occurs in delete-note source files. The filePath is passed as-is to `deps.trashFile(filePath)`, which is a Vault-layer port outside this workflow's scope.

### Check [2]: Event eavesdropping

CLEAN. Both `deps.publish` (PublicDomainEvent) and `deps.publishInternal` (CurateInternalEvent) are single-process in-memory channels. No network serialization. No process boundary crossing at the domain layer. Event payloads carry only typed branded domain values (NoteId, Frontmatter, Timestamp) with no secrets or credentials.

### Check [3]: Error-detail leakage

CLEAN (with note). `NoteDeletionFailed.detail` propagates `FsError.unknown.detail` (a string provided by the Vault-layer `trashFile` implementation). In the domain layer, this propagation is by spec (REQ-DLN-013). If the Vault adapter includes OS path information in the error detail, that path could appear in the event payload shown to the user via the UI. This is acceptable in the single-user desktop context — the note owner sees their own file paths. No cross-user leakage. Sanitization responsibility rests with the Vault adapter, not this domain workflow.

### Check [4]: Prototype pollution

CLEAN. `Tag` is a branded primitive string type, never used as an object key. `Frontmatter.tags` is `readonly Tag[]`. `update-projections.ts` iterates using `String(e.name) === String(tag)` comparisons — no prototype chain hazard. `feedRemoveNoteRef` uses Array.filter with String comparison — safe. No `JSON.parse` of user input within delete-note source.

### Check [5]: Wycheproof (cryptographic test vectors)

NOT APPLICABLE. delete-note contains no cryptographic primitives. No hashing, signing, encryption, or key derivation occurs in this workflow.

## Summary

Security audit complete. Tools attempted:
- semgrep: NOT INSTALLED; manual static review performed across all 7 implementation files
- Wycheproof: NOT APPLICABLE (no cryptographic code)
- tsc --noEmit: AVAILABLE; 0 errors in delete-note files
- bun test: AVAILABLE; 143 pass, 0 fail

Findings: 1 finding (FIND-IMPL-DLN-001 — TOCTOU race, severity LOW, status ACCEPTED).

The feature's security posture is sound for its threat model. The workflow is a pure in-process domain pipeline operating on branded typed VOs with I/O confined to the Vault adapter port boundary. The single accepted finding has a graceful recovery path in place and is low-severity in the single-threaded single-user Tauri MVP context.

Raw execution evidence captured in `.vcsdd/features/delete-note/verification/security-results/audit-run.txt`.
