# FIND-025: pipeline.ts has an unused import of serializeBlocksToMarkdown

**Dimension**: traceability_completeness
**Category**: structural_integrity
**Severity**: trivial (advisory — code hygiene only)
**Sprint**: 2
**Phase**: 3

## Evidence

`promptnotes/src/lib/domain/capture-auto-save/pipeline.ts:35`

```ts
import { serializeBlocksToMarkdown } from "./serialize-blocks-to-markdown.js";
```

A full read of `pipeline.ts` (lines 1-225) shows that `serializeBlocksToMarkdown` is never invoked in this file. The `body` field of `SaveNoteRequested` (line 113) and `NoteFileSaved` (line 152) is read directly from `validatedRequest.body`, which was already derived inside `buildValidatedSaveRequest` (`build-validated-save-request.ts:36`).

## Problem

This is a stale import left over after the Sprint 2 refactor (see Phase 2c notes in `state.json:120-126` mentioning "removed dead code"). It does not affect runtime behavior — bundlers will tree-shake unused imports — but it is a small consistency issue: it suggests a reviewer might wonder whether the pipeline is supposed to be re-deriving `body` here as a defensive check (it is not; that would actually violate the single-source-of-truth design where the factory is the only construction site).

The import also adds noise to the dependency graph between `pipeline.ts` and `serialize-blocks-to-markdown.ts` that is misleading for traceability tools.

## Why this is advisory, not blocking

Lint will catch this trivially in a future pass. No correctness impact. No spec violation.

## Recommended fix

Remove the unused import:

```ts
// DELETE this line:
import { serializeBlocksToMarkdown } from "./serialize-blocks-to-markdown.js";
```

Verify with `bun tsc --noEmit` and `bun test` afterwards (both should still pass).
