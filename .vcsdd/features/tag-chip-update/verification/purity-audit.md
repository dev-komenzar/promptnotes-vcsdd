# Purity Boundary Audit

## Feature: tag-chip-update | Date: 2026-05-01

## Declared Boundaries

From `verification-architecture.md` Purity Boundary Map:

| Step | Function | Declared Classification |
|------|----------|------------------------|
| Step 1 | `loadCurrentNote` | Effectful shell (read) — calls `deps.getNoteSnapshot` + `deps.hydrateNote` |
| Pre-Step 2 | `tagsEqualAsSet` | Pure core — membership check, no ports, no side effects |
| Step 2 canonical | `applyTagOperation` | Effectful shell (clock) — calls `deps.clockNow()`, delegates to pure helper |
| Step 2 pure helper | `applyTagOperationPure` | Pure core (proof target) — deterministic, no ports |
| Step 3 | `buildTagChipSaveRequest` | Pure core — `(mutated, now) => SaveNoteRequested`, no clock call |
| Step 4 | `serializeNote` | Pure core — `(req) => SerializedMarkdown`, deterministic |
| Step 5 | `writeMarkdown` | Effectful shell (I/O, async) — Vault write port |
| Step 6 | `updateProjectionsAfterSave` | Pure core — `(deps)(feed, inventory, event) => IndexedNote`; calls `deps.getAllSnapshots()` and `deps.publishInternal()` (effect confined to deps call, pure transform logic) |

Additional declared boundaries:
- Single `Clock.now()` call per write-path invocation, in the orchestrator before Step 2
- No `Clock.now()` on idempotent or pre-write-error paths
- `TagInventoryUpdated.occurredOn` threaded from `NoteFileSaved.occurredOn` (not a second Clock call)

## Observed Boundaries

Reviewing the actual implementation:

### `loadCurrentNote` (`load-current-note.ts`)
- Calls `deps.getNoteSnapshot(command.noteId)` — effectful read port. Confirmed.
- Calls `deps.hydrateNote(snapshot)` — effectful ACL adapter. Confirmed.
- Does NOT call `deps.clockNow()`. Confirmed.
- Classification: Effectful shell (read). **MATCHES declared.**

### `tagsEqualAsSet` (`apply-tag-operation-pure.ts:74-81`)
- Pure function: compares two Tag arrays with a Set. No deps, no side effects.
- Classification: Pure core. **MATCHES declared.**

### `applyTagOperationPure` (`apply-tag-operation-pure.ts:85-131`)
- No ports of any kind. Calls only inline `addTag`/`removeTag` helper functions.
- `addTag` and `removeTag` are themselves pure (no deps, no I/O, no clock).
- Returns `Result<MutatedNote, SaveErrorDelta>` deterministically given fixed inputs.
- PROP-TCU-001 property tests (200 runs) confirm referential transparency.
- Classification: Pure core. **MATCHES declared.**

### `applyTagOperation` (canonical shell)
- Not present as a standalone exported function in the implementation. The orchestrator in `pipeline.ts` calls `deps.clockNow()` directly on line 69, then passes `now` to `applyTagOperationPure`. This matches the spirit of the declared "effectful shell calls clock, delegates to pure helper" pattern, though the shell is inlined in the orchestrator rather than exported separately. This is an acceptable structural simplification: the clock call occurs at `pipeline.ts:69` immediately before `applyTagOperationPure(note, command, now)` on line 70.
- Classification: Equivalent to declared effectful shell (clock). **CONSISTENT WITH declared intent; structural inline is acceptable.**

### `buildTagChipSaveRequest` (`build-save-request.ts`)
- Pure function: `(mutated: MutatedNote, now: Timestamp) => SaveNoteRequested`.
- No deps, no clock call. `now` is received as a parameter (threaded from orchestrator).
- Delta 5 shape confirmed: 2-arg form (not the canonical curried `(deps)(mutated)` form).
- Classification: Pure core. **MATCHES declared.**

### `serializeNote`
- Not implemented in tag-chip-update implementation files. `pipeline.ts` does not call `serializeNote` explicitly — `SaveNoteRequested` is passed directly to `deps.writeMarkdown` without explicit serialization at this layer. This is consistent with the architectural note that serialization occurs inside the Vault adapter (the `writeMarkdown` port encapsulates serialization). No purity violation: the absence of an explicit `serializeNote` call does not introduce hidden side effects; it moves serialization responsibility into the effectful shell (Step 5).
- Classification: Pure core concern encapsulated in port. **NO DRIFT; consistent with declared boundary.**

### `writeMarkdown` (port, Step 5)
- `deps.writeMarkdown(saveRequest)` at `pipeline.ts:85` — async, awaited. Only `await` point.
- Classification: Effectful shell (I/O, async). **MATCHES declared.**

### `updateProjectionsAfterSave` (`update-projections.ts:93-133`)
- Outer function: `(deps: TagChipUpdateDeps) => (feed, inventory, event) => IndexedNote`.
- Inner function contains:
  - `deps.getAllSnapshots()` call — this is a read port, not truly "pure" in a strict sense.
  - `deps.publishInternal(tagInventoryUpdated)` call — an effectful emit.
  - All other operations (refreshSort, applyNoteFrontmatterEdited, tagDiff) are pure transforms.
- The spec declares Step 6 as "Pure core" but acknowledges `publishInternal` as an effect via `deps`. This is the standard Haskell-style "reader over IO" pattern where the outer deps curry carries effectful capabilities. The inner lambda is deterministic with respect to its data inputs `(feed, inventory, event)`, with effects confined to the deps surface.
- **Observed drift: minor discrepancy between spec label "pure core" and actual presence of `deps.publishInternal()` call inside the inner function.** This was visible in the spec text: "Calls `FeedOps.refreshSort(feed, deps.getAllSnapshots())` and `TagInventoryOps.applyNoteFrontmatterEdited`... Returns new immutable `Feed`/`TagInventory` instances." The spec also states "Calls `deps.publishInternal`" in the `TagInventoryUpdated` event documentation. The classification is "pure relative to data inputs" (returns deterministic `IndexedNote` given fixed inputs), with effects isolated to the deps injection layer.
- This matches the spec intent: `deps.publishInternal` is the declared effect; the transform logic itself is pure.
- Classification: Pure transform with declared effects via deps. **NO UNEXPECTED DRIFT; the effect is declared and confined.**

### `pipeline.ts tagChipUpdate` (orchestrator)
- Single `deps.clockNow()` call at `pipeline.ts:69` — after idempotency check, before `applyTagOperationPure`.
- Clock is NOT called on idempotent paths (lines 63-65 short-circuit before line 69).
- Clock is NOT called on `not-found` or `hydration-fail` paths (return on lines 39-57).
- `deps.publish` called 1-2 times depending on path (SaveNoteRequested, then NoteFileSaved or NoteSaveFailed).
- `deps.writeMarkdown` called exactly once on write paths.
- `updateProjectionsAfterSave` called ONLY on write-success path (line 109).
- Clock budget verified by PROP-TCU-015 tests (8 scenarios, all pass).
- Classification: Orchestrator. **MATCHES declared single-Clock-per-write-path invariant.**

## Summary

No unexpected drift detected. All declared purity boundaries are observed in the implementation.

One structural note: `applyTagOperation` as a named exported function does not exist in the implementation. Instead, the clock call is inlined in the orchestrator (`pipeline.ts:69`) immediately before `applyTagOperationPure`. This is structurally equivalent to the declared "effectful shell wrapping pure helper" pattern and introduces no correctness concern.

The `updateProjectionsAfterSave` classification as "pure core" in the spec table is a slight overstatement — the inner function calls `deps.getAllSnapshots()` (read port) and `deps.publishInternal()` (write port). However, the spec text explicitly documents both effects, and PROP-TCU-016 property tests verify referential transparency of the data outputs. This was a pre-existing spec/impl terminology delta, not a new finding introduced in Phase 5.

Required follow-up before Phase 6: None. The observed boundary map is consistent with the declared verification architecture. All 21 proof obligations pass.
