# FIND-019: REQ-017 function-signature contract has no Tier-0 type proof

**Dimension**: traceability_completeness
**Severity**: minor

## Location
- `behavioral-spec.md` REQ-017 (lines 345-359)
- `verification-architecture.md` Coverage Matrix line 187 (REQ-017 row), PROP-017 (line 136)

## Evidence

REQ-017 is fundamentally a TYPE-LEVEL contract:

> EARS L347: "the CaptureAutoSave pipeline ... SHALL conform to the type signature: `(deps: CaptureDeps) => (state: EditingState, trigger: "idle" | "blur") => Promise<Result<NoteFileSaved, SaveError>>`."
>
> Acceptance criteria (L351-356):
> - "The function takes `CaptureDeps` as a curried dependency parameter."
> - "The input state must be `EditingState` (not `IdleState`, `SavingState`, etc.)."
> - "The trigger is `"idle"` or `"blur"`."
> - "The return type is `Promise<Result<NoteFileSaved, SaveError>>`."

These are compile-time properties — they are exactly what `Tier 0` (TypeScript type-level proof) is for, per `verification-architecture.md` L151.

The Coverage Matrix maps REQ-017 only to PROP-017 (L187), which is Tier 3 (integration test). PROP-017 does not assert the type signature; it tests runtime behavior with port fakes. A regression that, e.g., changes the parameter order or accepts `IdleState` instead of `EditingState` would still pass PROP-017 if the test is written against whatever the new signature is.

## Recommended fix

Add a new Tier-0 proof obligation to verification-architecture.md, e.g.:

> "PROP-028: `CaptureAutoSave` type signature compile-time assertion. Define a TypeScript type-level test (e.g., `type _check_capture = Equals<CaptureAutoSave, (deps: CaptureDeps) => (state: EditingState, trigger: "idle" | "blur") => Promise<Result<NoteFileSaved, SaveError>>>` with an `Assert<...>` helper). If the signature drifts, compilation fails. | REQ-017 | 0 | true | TypeScript type-level test"

Update Coverage Matrix REQ-017 row to include PROP-028.

Mark PROP-028 `required: true` since signature drift is a silent contract-break.

Same treatment is justified for REQ-013 (PROP-005, PROP-006 already at Tier 0 — good) and REQ-014 (PROP-007 is Tier 1 fast-check; the mapping is also expressible as an exhaustive switch with `never` branch — could be promoted to Tier 0).
