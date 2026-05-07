# Purity Boundary Audit: capture-auto-save

**Feature**: capture-auto-save
**Phase**: 5 (Sprint 2)
**Date**: 2026-05-07

## Declared Boundaries

From verification-architecture.md Purity Boundary Map (Revision 4.1):

| Function | Classification | Source File |
|----------|---------------|-------------|
| `serializeBlocksToMarkdown` | Pure core (Shared Kernel) | serialize-blocks-to-markdown.ts |
| `serializeNote` | Pure core | serialize-note.ts |
| `noteIsEmpty` / `isEmptyOrWhitespaceContent` | Pure core | note-is-empty.ts |
| `mapTriggerToSource` | Pure core | pipeline.ts (inline) |
| `mapFsErrorToReason` | Pure core | pipeline.ts (inline) |
| `buildValidatedSaveRequest` | Pure core (factory) | build-validated-save-request.ts |
| `parseMarkdownToBlocks` | Pure core (round-trip complement) | parse-markdown-to-blocks.ts |
| `prepareSaveRequest` | Mixed (Clock.now() once) | prepare-save-request.ts |
| `Clock.now()` | Effectful shell | injected via CaptureDeps.clockNow |
| `FileSystem.writeFileAtomic` | Effectful shell | injected via PipelineInfra.writeFileAtomic |
| `publish()` | Effectful shell | injected via CaptureDeps.publish |
| `updateProjections` | Out of scope (Curate context) | update-projections.ts |

## Observed Boundaries

### serializeBlocksToMarkdown (serialize-blocks-to-markdown.ts)

Imports:
```typescript
import type { Block } from "promptnotes-domain-types/shared/note";
```
Only import: the domain `Block` type (no I/O modules, no `fs`, no `path`, no `node:*`).
No `CaptureDeps` parameter. Function signature: `(blocks: ReadonlyArray<Block>): string`.
Verdict: PURE CORE — matches declared boundary.

### serializeNote (serialize-note.ts)

Imports:
```typescript
import type { Frontmatter, Timestamp, Tag } from "promptnotes-domain-types/shared/value-objects";
import type { ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";
import { toEpochMillis } from "./timestamp-utils.js";
```
No I/O modules. `toEpochMillis` is itself a pure extraction of epoch millis from the branded Timestamp type.
No `CaptureDeps` parameter. Function signature: `(request: ValidatedSaveRequest): string`.
Verdict: PURE CORE — matches declared boundary.

### noteIsEmpty / isEmptyOrWhitespaceContent (note-is-empty.ts)

Imports:
```typescript
import type { Note } from "promptnotes-domain-types/shared/note";
```
No I/O modules. No ports. Pure structural traversal of `note.blocks`.
`isEmptyOrWhitespaceContent` is a regex predicate `/^\s*$/` — deterministic.
Verdict: PURE CORE — matches declared boundary.

### buildValidatedSaveRequest (build-validated-save-request.ts)

Imports:
```typescript
import type { ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";
import type { Block, ... } from "promptnotes-domain-types/shared/...";
import { serializeBlocksToMarkdown } from "./serialize-blocks-to-markdown.js";
```
No I/O modules. Calls `serializeBlocksToMarkdown` (itself pure) to derive body.
No `CaptureDeps` parameter. Function is a pure factory.
Verdict: PURE CORE — matches declared boundary (Sprint 2 new function).

### parseMarkdownToBlocks (parse-markdown-to-blocks.ts)

Imports:
```typescript
import type { Result } from "promptnotes-domain-types/util/result";
import type { Block } from "promptnotes-domain-types/shared/note";
import type { BlockId, BlockType, BlockContent } from "promptnotes-domain-types/shared/value-objects";
```
No I/O modules. No `CaptureDeps`.
Note: uses a module-level counter (`_blockCounter`) for fresh BlockId generation.
This is deterministic in the sense that it produces new unique IDs per call, but
the IDs themselves are not stable across test runs. This is documented behavior
(blocks.ts L13) and does not affect correctness — PROP-026 verifies structural
equality modulo BlockId.
Verdict: PURE CORE (modulo BlockId freshness) — matches declared boundary.

### prepareSaveRequest (prepare-save-request.ts)

Imports:
```typescript
import type { Result } from "promptnotes-domain-types/util/result";
import type { ... } from "promptnotes-domain-types/...";
import { isBefore, toEpochMillis } from "./timestamp-utils.js";
import { buildValidatedSaveRequest } from "./build-validated-save-request.js";
```
No I/O modules. Accepts `PrepareSaveRequestDeps { clockNow, noteIsEmpty, publish }`.
Calls `deps.clockNow()` exactly once per invocation (proved by PROP-014).
Verdict: MIXED — matches declared boundary.

### pipeline.ts effectful shell

- `deps.clockNow()`: called once, in Step 1 via `prepareSaveRequest` (PROP-014 proved)
- `infra.writeFileAtomic(filePath, serialized)`: called once, in Step 3
- `deps.publish(event)`: called at most 2 times per run (SaveNoteRequested + NoteFileSaved or NoteSaveFailed)

No file I/O modules imported directly (`fs`, `path`, `node:fs`). All I/O flows through
injected port parameters.
Verdict: EFFECTFUL SHELL correctly confined — matches declared boundary.

### mapTriggerToSource / mapFsErrorToReason (pipeline.ts inline)

Both are pure switch-statement mappings over finite input sets.
`mapTriggerToSource` is inlined (the `source` field assignment uses a ternary).
`mapFsErrorToReason` is a module-level function.
No imports beyond type declarations. Verdict: PURE CORE.

### updateProjections (update-projections.ts)

Imports:
```typescript
import type { Frontmatter } from "promptnotes-domain-types/shared/value-objects";
import type { NoteFileSaved } from "promptnotes-domain-types/shared/events";
```
No I/O modules. Accepts `UpdateProjectionsDeps { refreshSort, applyTagDelta, emitInternal }`.
These are Curate-internal ports (not CaptureDeps). Classified as out-of-scope (Curate context).
Verdict: OUT OF SCOPE — matches declared boundary.

## Summary

No core/shell drift detected. All pure-core functions import zero I/O modules (`fs`, `path`, `node:*`). None accept a `CaptureDeps` parameter. Sprint 2 additions (`serializeBlocksToMarkdown`, `buildValidatedSaveRequest`, `parseMarkdownToBlocks`, `isEmptyOrWhitespaceContent`) are all pure — confirmed by import inspection.

The only noted deviation from strict purity in the pure-core tier is `parseMarkdownToBlocks`'s module-level counter for BlockId generation. This is documented behavior (blocks.ts L13) and does not affect verifiable properties (PROP-026 asserts structural equality modulo BlockId).

No follow-up required before Phase 6.
