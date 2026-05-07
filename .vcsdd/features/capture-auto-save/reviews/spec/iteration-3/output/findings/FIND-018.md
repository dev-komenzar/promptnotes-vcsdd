# FIND-018: REQ-008 SaveNoteRequested emission timing is internally inconsistent

**Dimension**: verification_readiness
**Severity**: minor

## Location
- `behavioral-spec.md` REQ-008 (lines 185-205), REQ-016 acceptance L341, Event Catalog L434

## Evidence

REQ-008 main text (L191-193):
> "The canonical `EmitSaveAndTransition` in `workflows.ts` couples `SaveNoteRequested` emission with the `editing → saving` state transition. This occurs **AFTER Step 1 (`prepareSaveRequest`) produces a `ValidatedSaveRequest` and BEFORE the Vault write (Step 3)**."

REQ-008 Acceptance L203:
> "`SaveNoteRequested` is emitted at the `editing → saving` transition, BEFORE `NoteFileSaved` or `NoteSaveFailed`."

REQ-016 acceptance L341:
> "Event emission (`publish`) occurs **in Step 3** (SaveNoteRequested, NoteFileSaved/NoteSaveFailed) and optionally in Step 4 (TagInventoryUpdated)."

Event Catalog L434:
> "`SaveNoteRequested` | **3 (pre-write, at `editing → saving`)** | Capture | Public | always (on validated save) | ..."

These three references contradict each other:

- REQ-008 says "AFTER Step 1 and BEFORE Step 3" — i.e., between Steps 1 and 2 (and 3), not within any of them.
- REQ-016 says "in Step 3" — explicitly inside Step 3.
- Event Catalog labels it "Step 3 (pre-write, at `editing → saving`)" — half-step labeling that creates ambiguity.

There is no defined "Step 1.5" or "Step 2.5" in the pipeline, so the placement is genuinely under-defined. The orchestrator (`CaptureAutoSave`) is the actual emitter, but the spec does not give that step a number.

## Recommended fix

Adopt a single canonical placement and propagate. Recommended:

1. Add a numbered "Step 1b" (or rename Step 2 to "Step 2: emitSaveAndTransition + serializeNote" composition) that explicitly owns:
   - State transition `editing → saving`
   - `SaveNoteRequested` emission

2. Update REQ-008 main text + Acceptance to use the new step number.
3. Update REQ-016 L341 to read: "publish occurs in Step 1b (SaveNoteRequested) and Step 3 (NoteFileSaved/NoteSaveFailed)".
4. Update Event Catalog L434 to use the same step number, dropping the "pre-write" parenthetical.
5. Update Pipeline Overview (L25-31) to show the step.

Alternatively, define explicitly that `SaveNoteRequested` is emitted by the `EmitSaveAndTransition` orchestrator function (not a numbered step) at the `editing → saving` transition, and reword REQ-016 to say "Event emission (`publish`) occurs at the orchestration layer (SaveNoteRequested at editing→saving) and inside Step 3 (NoteFileSaved/NoteSaveFailed)".
