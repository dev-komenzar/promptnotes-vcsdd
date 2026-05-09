# FIND-023: Pipeline integration tests universally mock noteIsEmpty; real predicate never exercised end-to-end

**Dimension**: edge_case_coverage
**Category**: test_quality
**Severity**: minor (advisory)
**Sprint**: 2
**Phase**: 3

## Evidence

`promptnotes/src/lib/domain/__tests__/capture-auto-save/pipeline.test.ts:131`

```ts
noteIsEmpty: () => false,
```

`promptnotes/src/lib/domain/__tests__/capture-auto-save/pipeline.test.ts:379, 394, 423`

```ts
const emptyPorts = { ...ports, noteIsEmpty: () => true };
```

`promptnotes/src/lib/domain/__tests__/capture-auto-save/__verify__/prop-024-body-blocks-coherence.harness.test.ts:226`

```ts
noteIsEmpty: () => false,
```

`promptnotes/src/lib/domain/__tests__/capture-auto-save/__verify__/prop-003-empty-idle-discard.harness.test.ts:182, 202, 221, 242`

```ts
noteIsEmpty: () => true, // always empty
```

`promptnotes/src/lib/domain/__tests__/capture-auto-save/__verify__/prop-004-empty-blur-save.harness.test.ts:174, 195, 213, 230`

```ts
noteIsEmpty: () => true, // empty body
```

Every pipeline-level and step-1-level test injects a constant function for `noteIsEmpty` rather than the actual `noteIsEmpty` from `note-is-empty.ts`.

## Problem

REQ-003 acceptance criterion #8 states:
> All five true-isEmpty variants in the empty-Note variants table (single-empty-para, multi-empty-para, whitespace-para, divider-only, divider-and-empty) are discarded on idle trigger.

This is a pipeline-level claim. PROP-025 verifies the unit-level `noteIsEmpty` against all 8 variants, and PROP-003 verifies the pipeline routing assuming `noteIsEmpty` returns true. But there is **no integration test** that constructs a `divider-only` Note, wires the actual `noteIsEmpty` into `prepareSaveRequest`, runs the pipeline with `trigger: "idle"`, and asserts an `EmptyNoteDiscarded` event was emitted.

Failure mode this gap allows: imagine a future regression that re-introduces the narrow rule (`blocks.length === 1 && blocks[0].type === "paragraph" && content === ""`) in `noteIsEmpty.ts`. PROP-025 would catch the unit-level regression. But if instead the regression were "the pipeline forgot to wire `noteIsEmpty` and uses a hardcoded narrow check" (e.g., `prepareSaveRequest` ignores `deps.noteIsEmpty` and inlines its own predicate), all current pipeline tests would still pass because they all mock the predicate.

## Why this is advisory, not blocking

The compositional argument is sound: PROP-025 + PROP-003 + the impl's `prepareSaveRequest` correctly threading `deps.noteIsEmpty(input.note)` into the branch (`prepare-save-request.ts:34`) jointly imply the integration. The threading is visually verifiable from the source. No actual regression exists in Sprint 2.

## Recommended fix (could be Sprint 3)

Add at least one integration test that:
1. Imports the real `noteIsEmpty` from `$lib/domain/capture-auto-save/note-is-empty`.
2. Constructs a divider-only Note.
3. Runs `captureAutoSave({ ...ports, noteIsEmpty })(state, "idle")`.
4. Asserts the result is `Err({kind:'validation', reason:{kind:'empty-body-on-idle'}})` AND an `EmptyNoteDiscarded` event was published.

A parallel test for `divider-and-empty` and `whitespace-para` would close the loop on REQ-003 acceptance #8 at the integration tier.
