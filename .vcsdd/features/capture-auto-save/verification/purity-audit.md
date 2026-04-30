# Purity Boundary Audit: capture-auto-save

**Feature**: capture-auto-save
**Phase**: 5
**Date**: 2026-04-30

## Declared Boundaries

| Function | Classification | Rationale |
|----------|---------------|-----------|
| `serializeNote` | Pure core | No CaptureDeps, deterministic |
| `Note.isEmpty` / `noteIsEmpty` | Pure core | No ports, deterministic |
| `prepareSaveRequest` (validation) | Pure core | Invariant checks are pure |
| `prepareSaveRequest` (overall) | Mixed | `Clock.now()` is effectful |
| `writeMarkdown` / `writeFileAtomic` | Effectful shell | Write I/O |
| `publish()` | Effectful shell | Event bus I/O |
| `updateProjections` | In-memory write | No file I/O, Curate state mutation |

## Observed Boundaries

- `serializeNote` (serialize-note.ts): zero CaptureDeps parameters; `serializeNote.length === 1`. Calls only `frontmatterToYaml` and `formatTimestamp`, both module-internal pure helpers. Matches declared boundary.
- `prepareSaveRequest` (prepare-save-request.ts): takes `PrepareSaveRequestDeps { clockNow, noteIsEmpty, publish }`. Calls `deps.clockNow()` exactly once per invocation (proved by PROP-014). Matches declared mixed classification.
- `pipeline.ts`: correctly sequences effectful steps (Step 1 clock, Step 3 write, event publication) and pure steps (Step 2 serialize). Timestamp flows through `ValidatedSaveRequest.requestedAt` as pure data.
- `updateProjections` (update-projections.ts): `applyTagDelta` and `refreshSort` are port calls. Tag diff is pure. Matches declared boundary.

## Summary

No core/shell drift detected. All declared purity boundaries correctly implemented. `FrontmatterSerializerToYaml` is a module-internal pure function, not an injected port. Timestamp access centralized in `timestamp-utils.ts`. No follow-up required.
