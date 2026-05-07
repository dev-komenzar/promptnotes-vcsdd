# FIND-021: canonicalCaptureAutoSave is a runtime-throwing placeholder

**Dimension**: verification_readiness
**Category**: test_quality
**Severity**: minor (advisory — does not block Phase 3 PASS)
**Sprint**: 2
**Phase**: 3

## Evidence

`promptnotes/src/lib/domain/capture-auto-save/pipeline.ts:203-214`

```ts
export const canonicalCaptureAutoSave: CaptureAutoSave = (
  deps: CaptureDeps,
): ((state: EditingState, trigger: "idle" | "blur") => Promise<Result<NoteFileSaved, SaveError>>) => {
  return async (_state: EditingState, _trigger: "idle" | "blur"): Promise<Result<NoteFileSaved, SaveError>> => {
    void deps;
    throw new Error(
      "canonicalCaptureAutoSave: application-level assembly required. " +
      "Use makeCaptureAutoSavePipeline(infra)(deps) to construct a working pipeline.",
    );
  };
};
```

`promptnotes/src/lib/domain/__tests__/capture-auto-save/__verify__/prop-028-signature-assertion.harness.test.ts:96-107`

The PROP-028 runtime test only verifies that `canonicalCaptureAutoSave(deps)` returns a function — it does NOT actually invoke that function. The compile-time `Equal<typeof canonicalCaptureAutoSave, CaptureAutoSave>` assertion (line 83-85) passes, but no test exercises the runtime path because doing so would throw.

## Problem

`canonicalCaptureAutoSave` is exported as the canonical `CaptureAutoSave`-typed function (REQ-017 / PROP-028) but is a non-functional stub: any caller invoking the inner async function gets a runtime exception. The actual working pipeline lives in `makeCaptureAutoSavePipeline` which has an extra `infra: PipelineInfra` parameter and therefore does NOT match the canonical signature.

This is a real (acknowledged) tension between the canonical type from `workflows.ts` (which assumes `CaptureDeps` is sufficient) and the actual port surface needed (which includes `noteIsEmpty`, `writeFileAtomic`, state-transition functions, etc.). PROP-028 confirms the type-shape but cannot prove the function actually does anything. The runtime placeholder makes this gap easy to overlook because all 154 tests pass.

## Why this is advisory, not blocking

The spec (REQ-017 NOTE) and code comment both document this as intentional, and the workflow-level integration is verified end-to-end via PROP-017 / PROP-018 against `captureAutoSave(ports)` — which exercises the same orchestration logic with a wider port surface. The runtime contract is functional for the actual application code path; only the canonical-typed export is a stub.

## Recommended fix (deferred to Phase 5 or a future sprint)

Either:
1. Widen `CaptureDeps` in `docs/domain/code/ts/src/capture/ports.ts` to include the missing pipeline ports so `canonicalCaptureAutoSave` can be implemented for real, OR
2. Replace the canonical export with a type-only re-export plus a documented assembly helper, removing the runtime-throwing function entirely so callers cannot accidentally invoke a non-functional stub.

If neither path is taken in Phase 5, add a code-comment warning at the import site (`pipeline.ts:203`) cross-referencing this finding and PROP-028's limitation.
