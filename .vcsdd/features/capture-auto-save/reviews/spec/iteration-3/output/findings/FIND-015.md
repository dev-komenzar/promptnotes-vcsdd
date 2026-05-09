# FIND-015: Pipeline scope contradiction — Step 4 (REQ-011/REQ-012) is outside declared Scope

**Dimension**: spec_fidelity
**Severity**: major

## Location
- `behavioral-spec.md` Scope (line 7), REQ-001 acceptance (line 50), REQ-011 (lines 250-261), REQ-012 (lines 265-279), REQ-016 (lines 327-341)

## Evidence

`behavioral-spec.md` L7 (Scope):

> "Excludes: idle timer management (UI concern), debounce logic (UI concern), EditPastNoteStart flush (Workflow 3), HandleSaveFailure (Workflow 8). **The pipeline starts when a save trigger fires and ends when `NoteFileSaved` is returned** or an error/early-exit occurs."

This declares the pipeline ends at the emission of NoteFileSaved. However:

- REQ-011 (L250-261) requires the system to "call `Feed.refreshSort` and `TagInventory.applyDelta`" and produce `IndexedNote` — which happens AFTER NoteFileSaved.
- REQ-012 (L265-279) requires emitting `TagInventoryUpdated` based on tag delta — also post-NoteFileSaved, in Curate context.
- REQ-016 (L341) explicitly mentions "publish occurs in Step 3 ... and optionally in Step 4 (TagInventoryUpdated)".

Furthermore, REQ-001 itself (L50) hedges: "the Curate projections (Feed, TagInventory) have been updated **as a side effect**" — and REQ-001 #2 reconciliation note (L50): "`updateProjections` (Step 4) runs **as a side effect after NoteFileSaved is obtained**, and its result is not surfaced in the pipeline return type."

This is internally inconsistent: the spec simultaneously says (a) the pipeline ends at NoteFileSaved and (b) Step 4 is part of CaptureAutoSave with its own REQs.

Furthermore, REQ-011 says "the system SHALL call `Feed.refreshSort` and `TagInventory.applyDelta`" — but `CaptureDeps` (`ports.ts` L23-28) does NOT include any Feed or TagInventory port. So Step 4 cannot be a Capture-side direct call — it must be event-driven (Curate listens to NoteFileSaved). If event-driven, Step 4 is NOT part of the CaptureAutoSave pipeline at all; it's a separate workflow (Curate's projection-refresh handler).

## Recommended fix

Choose one:

(a) **Tighten Scope** to exclude Step 4 entirely. Move REQ-011 and REQ-012 to a separate spec (e.g., `curate-projection-refresh`) since they belong to a different bounded context (Curate) and a different workflow trigger (NoteFileSaved subscription). Update REQ-001 acceptance to remove the "Curate projections updated as a side effect" sentence (or at least demote it to "Note: Curate handles projection refresh in Workflow X separately"). Remove REQ-016 L341's reference to Step 4 publish.

(b) **Broaden Scope** to include Step 4. Update Scope L7 to say "ends when NoteFileSaved is returned **and Curate projections have refreshed**", and add the missing port surface: list `Feed.refreshSort` and `TagInventory.applyDelta` as ports (or as event-handlers in a different deps record). Acknowledge the cross-context bridge mechanism explicitly.

Option (a) is recommended because:
- It matches the workflow boundary (Capture → Vault → Curate) and bounded-context separation.
- REQ-011/REQ-012 cannot be tested as part of the CaptureAutoSave pipeline anyway; PROP-012/PROP-013 implicitly assume an event-handler context.
- It removes the contradictory "Step 4 is in scope but not callable from Capture" tension.
