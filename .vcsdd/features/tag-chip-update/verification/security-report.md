# Security Hardening Report

## Feature: tag-chip-update | Date: 2026-05-01

## Tooling

| Tool | Status | Notes |
|------|--------|-------|
| semgrep | NOT INSTALLED | `pip install semgrep` to enable automated pattern scanning. Manual static review performed as substitute. |
| Wycheproof | NOT APPLICABLE | tag-chip-update contains no cryptographic primitives. No key handling, hash functions, or symmetric/asymmetric encryption. |
| bun run check (svelte-check) | AVAILABLE | Used as the static type-safety gate. Zero errors in all tag-chip-update source and test files. |

Raw execution evidence: `.vcsdd/features/tag-chip-update/verification/security-results/audit-run.txt`

## Audit Scope

Files audited:
- `promptnotes/src/lib/domain/tag-chip-update/pipeline.ts`
- `promptnotes/src/lib/domain/tag-chip-update/apply-tag-operation-pure.ts`
- `promptnotes/src/lib/domain/tag-chip-update/update-projections.ts`
- `promptnotes/src/lib/domain/tag-chip-update/load-current-note.ts`
- `promptnotes/src/lib/domain/tag-chip-update/build-save-request.ts`
- `promptnotes/src/lib/domain/tag-chip-update/_deltas.ts`

## Checks

### [1] Path traversal

CLEAN. tag-chip-update does not accept file paths from user input. The pipeline input is `TagChipCommand { kind, noteId: NoteId, tag: Tag }` where both `NoteId` and `Tag` are branded value objects, not raw strings or path fragments. Path construction is delegated entirely to the Vault adapter layer (injected via `deps.writeMarkdown`) which is outside the scope of this feature. No path concatenation occurs in any tag-chip-update source file.

### [2] YAML injection in serialized note content

CLEAN (inherited). `serializeNote` is reused from the CaptureAutoSave back-end. tag-chip-update constructs only a `SaveNoteRequested` with typed domain values (`NoteId`, `Frontmatter`, `Tag[]`, `Timestamp`). No raw user strings are passed into the serialization layer from this feature. YAML escaping correctness is a CaptureAutoSave concern and is inherited here unchanged.

### [3] PII leakage in error detail strings

CLEAN. Three `detail` fields are populated:
- `pipeline.ts:49`: `"note not found in snapshot store: ${String(command.noteId)}"` — `NoteId` is an opaque timestamp-based identifier (`"2026-04-30-120000-001"` format), not a user name, email, or authored content.
- `load-current-note.ts:47`: `"hydrateNote failed for noteId=..."` — same `NoteId`; no authored content.
- `apply-tag-operation-pure.ts:161`: `err.reason.kind` — resolves to the static string `"updated-before-created"`; no user content.

No `detail` string echoes body text, tag values entered by the user, frontmatter field values, or any user-authored content.

### [4] Prototype pollution via Tag/Frontmatter inputs

CLEAN. `Tag` is a branded primitive string type; it is never used as an object key. `Frontmatter` is spread with `{ ...fm, tags: [...fm.tags, tag], updatedAt: now }` (`apply-tag-operation-pure.ts:42-46`) — this is a typed spread of a branded VO, not arbitrary object construction. `TagInventory.entries` iteration in `update-projections.ts` compares via `String(e.name) === String(tag)` — prototype chain access is not involved. All smart constructors produce branded VOs with no user-controlled key injection.

### [5] Injection in internal event payloads

CLEAN. `TagInventoryUpdated` payload is `{ kind: "tag-inventory-updated", addedTags: Tag[], removedTags: Tag[], occurredOn: Timestamp }` (`update-projections.ts:118-123`). `addedTags`/`removedTags` are derived from `tagDiff(previousFm, event.frontmatter)` — both inputs are typed `Frontmatter` values and their `.tags` fields are `readonly Tag[]` (branded VOs). No raw string or untyped user input enters the event payload.

## Summary

All 5 security checks PASS. No findings.

Semgrep was not available; manual static review was performed across all 6 implementation files. Wycheproof is not applicable (no cryptographic code). The feature's security posture is sound for its threat model: it is a pure in-process domain workflow operating on branded VOs with I/O confined to the Vault adapter port boundary.
