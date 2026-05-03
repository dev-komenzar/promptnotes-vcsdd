# Purity Boundary Audit

## Feature: delete-note | Sprint: 2 | Date: 2026-05-03

## Declared Boundaries

From `specs/verification-architecture.md` Purity Boundary Map (Revision 2):

| Step | Function | Declared Classification |
|------|----------|------------------------|
| Step 1 | `authorizeDeletion` | Effectful shell (read) — calls `deps.getNoteSnapshot(noteId)`, reads `editingCurrentNoteId` and `feed` from outer-curry closure. Returns `Result<AuthorizedDeletion, DeletionError>` synchronously. |
| Step 1 pure core | `authorizeDeletionPure` | Pure core (proof target) — `(noteId, editingCurrentNoteId, feed, snapshot) => Result<AuthorizedDeletion, DeletionErrorDelta>`. No ports. Deterministic. |
| Step 2 | `buildDeleteNoteRequested` | Pure core — `(authorized, now) => DeleteNoteRequested`. No clock call (uses pre-obtained `now`). |
| Step 3 | `trashFile` | Effectful shell (I/O, async) — OS trash port. The only `await` point. |
| Step 4 | `updateProjectionsAfterDelete` | Pure core — `(feed, inventory, event) => UpdatedProjection`. No port calls. Sources `now` from `event.occurredOn`. |
| Orchestrator (after Step 4) | event emission | Effectful shell — calls `deps.publish(NoteFileDeleted)` and `deps.publishInternal(TagInventoryUpdated)` when `removedTags.length > 0`. |

Additional declared invariants:
- Single `Clock.now()` call per write-path invocation, in the orchestrator after authorization succeeds
- Zero `Clock.now()` calls on authorization-error paths
- `updateProjectionsAfterDelete` does NOT call `deps.publishInternal` (the orchestrator does)
- FIND-SPEC-DLN-001 resolved: `updateProjectionsAfterDelete` is strictly pure (no port calls)

## Observed Boundaries

Reviewing the actual implementation in `promptnotes/src/lib/domain/delete-note/`:

### `authorizeDeletionPure` (`authorize-deletion-pure.ts`)

- Three-precondition guard: `editingCurrentNoteId === noteId` (a), `!feedHasNote` (b), `snapshot === null` (c), all-pass (d).
- `feedHasNote` is a local pure helper function (no port access).
- No `deps` parameter. No `clockNow()` call. No I/O.
- Sprint-2 change: branch (d) now returns `AuthorizedDeletionDelta { frontmatter, filePath }` — `filePath` is sourced from `snapshot.filePath` at authorization time, captured as a data field. This is a pure data extraction from the already-passed `snapshot` argument; it introduces no new effects, no new dependencies, and no port access. The function signature and return type (`Result<AuthorizedDeletionDelta, DeletionErrorDelta>`) are unchanged in structural character — `AuthorizedDeletionDelta` extends `AuthorizedDeletion` with one additional readonly field.
- Returns `Result<AuthorizedDeletionDelta, DeletionErrorDelta>` deterministically.
- PROP-DLN-001 property tests (100 runs) confirm referential transparency still holds after the sprint-2 change.
- PROP-DLN-002 example tests verify all four branches; branch (d) assertions updated to confirm `auth.filePath === snapshot.filePath`.
- PROP-DLN-004 property test: `auth.frontmatter` still deep-equals `snapshot.frontmatter` across 100 generated inputs.
- Classification: Pure core. **MATCHES declared. No purity creep introduced by sprint-2.**

### `authorizeDeletion` (`authorize-deletion.ts`)

- Wraps `authorizeDeletionPure`: calls `deps.getNoteSnapshot(confirmed.noteId)` to source the snapshot, then delegates to the pure core.
- Reads `editingCurrentNoteId` and `feed` from the outer-curry closure.
- No `clockNow()` call. Synchronous.
- Classification: Effectful shell (read). **MATCHES declared.**

### `buildDeleteNoteRequested` (`build-delete-request.ts`)

- Signature: `(authorized: AuthorizedDeletion, now: Timestamp) => DeleteNoteRequested`.
- No `deps` parameter. No clock call. Constructs a typed event from the pre-obtained `now`.
- Pure construction; deterministic given fixed inputs.
- Classification: Pure core. **MATCHES declared.**

### `updateProjectionsAfterDelete` (`update-projections.ts`)

- Signature: `(feed, inventory, event) => UpdatedProjection`.
- No `deps` parameter — structurally impossible to call any port.
- Calls `feedRemoveNoteRef(feed, event.noteId)` — local pure helper using Array.filter.
- Calls `tagInventoryApplyNoteDeleted(inventory, event.frontmatter, event.occurredOn)` — local pure helper using Array iteration.
- Sources `now` from `event.occurredOn` (not a Clock call). REQ-DLN-007 threading invariant satisfied by construction.
- Returns new immutable `UpdatedProjection`. Does NOT mutate `feed` or `inventory`.
- Does NOT call `deps.publishInternal` or any other port.
- PROP-DLN-016 spy test: all 6 port spies show call count === 0 after the call.
- PROP-DLN-012 property test: referential transparency confirmed across generated inputs.
- Classification: Pure core. **MATCHES declared.** FIND-SPEC-DLN-001 fully resolved.

### `normalizeFsError` (`normalize-fs-error.ts`)

- Signature: `(err: FsError) => NormalizedFsError`.
- Pure mapping: exhaustive switch over `FsError.kind` with `never` default guard.
- No external dependencies. No I/O. No clock.
- Returns `{ reason: NoteDeletionFailureReason, detail: string | undefined }` deterministically.
- PROP-DLN-006(c) Tier-0 exhaustiveness check confirms explicit `'disk-full'` arm (FIND-SPEC-DLN-002 resolved).
- PROP-DLN-017 test confirms `disk-full → { reason: 'unknown', detail: 'disk-full' }`.
- PROP-DLN-018 test confirms `unknown → { reason: 'unknown', detail: FsError.detail }`.
- Classification: Pure core (pure mapping). **CONSISTENT WITH declared intent.**

### `removedTagsFromDeletion` (`update-projections.ts`, exported helper)

- Signature: `(inventory: TagInventory, frontmatter: Frontmatter) => readonly Tag[]`.
- Pure helper: filters `frontmatter.tags` against `inventory.entries` by name match.
- No ports. No clock. No mutation.
- Called by the orchestrator to determine whether to emit `TagInventoryUpdated`.
- Classification: Pure core (helper). **Consistent with declared boundary intent.**

### `pipeline.ts` — orchestrator (`deleteNote`)

- Single `deps.clockNow()` call after `authorizeDeletion` returns `Ok`. Zero calls on authorization-error paths (early return before the Clock call).
- `deps.publish(deleteRequested)` — before `trashFile`.
- Sprint-2 change: `deps.trashFile(authorized.filePath)` — uses `filePath` from `AuthorizedDeletionDelta` directly. The second `deps.getNoteSnapshot` call and `?? ""` fallback have been removed. FIND-IMPL-DLN-001 mitigated.
- `deps.trashFile(authorized.filePath)` — the only `await` point.
- `updateProjectionsAfterDelete(feed, inventory, noteFileDeleted)` — called on success path and not-found graceful path. NOT called on permission/lock/disk-full/unknown paths.
- `deps.publish(noteFileDeleted)` — after Step 4.
- `removedTagsFromDeletion(inventory, authorized.frontmatter)` — pure helper call to check tag count.
- `deps.publishInternal(tagInventoryUpdated)` — conditional, only when `removedTags.length > 0`.
- `deps.publish(noteDeletionFailed)` — on fs-error paths.
- Clock budget: 1 on all write paths, 0 on authorization-error paths. Verified by PROP-DLN-011 (9 paths, all pass).
- Classification: Effectful shell (orchestrator). **MATCHES declared.**

## Summary

No unexpected drift detected. All declared purity boundaries are observed in the sprint-2 implementation.

Specific resolutions verified:

- **FIND-SPEC-DLN-001 (BLOCKER — Revision 2)**: `updateProjectionsAfterDelete` does NOT call `deps.publishInternal`. It is a strictly pure function with no `deps` parameter. The orchestrator calls `deps.publishInternal` after the function returns. PROP-DLN-016 spy test confirms zero port calls inside the function. **RESOLVED.**

- **FIND-SPEC-DLN-002 (BLOCKER — Revision 2)**: `normalizeFsError` contains an explicit `'disk-full'` arm in the exhaustive switch. The `never` default guard would catch any future unhandled variant at compile time. PROP-DLN-006(c) Tier-0 exhaustiveness check and PROP-DLN-017 example test both confirm the explicit arm. **RESOLVED.**

- **FIND-IMPL-DLN-001 (TOCTOU — sprint-2 mitigation)**: The second `deps.getNoteSnapshot` call in `pipeline.ts` is now eliminated. `filePath` is captured in `authorizeDeletionPure` (pure core — from the already-provided `snapshot` argument) and carried through `AuthorizedDeletionDelta` to the orchestrator. The orchestrator uses `authorized.filePath` directly at Step 3. No port call, no effectful access, no fallback string introduced in any pure function. **MITIGATED.**

Sprint-2 purity re-confirmation:

All 7 functions audited for purity creep introduced by the sprint-2 changes:

| Function | Sprint-2 Change | Purity Status |
|----------|----------------|---------------|
| `authorizeDeletionPure` | Returns extended `AuthorizedDeletionDelta { frontmatter, filePath }` | Still pure — `filePath` sourced from `snapshot` argument, no new dependencies |
| `authorizeDeletion` | Pass-through; delegates to updated pure core | Still effectful shell only (read) |
| `buildDeleteNoteRequested` | No change | Still pure core |
| `updateProjectionsAfterDelete` | No change | Still pure core; 0 port calls confirmed by PROP-DLN-016 |
| `normalizeFsError` | No change | Still pure mapping |
| `removedTagsFromDeletion` | No change | Still pure helper |
| `deleteNote` (orchestrator) | Removed second `getNoteSnapshot` call; uses `authorized.filePath` | Still effectful shell; no effectful access moved into any pure function |

No purity creep introduced by sprint-2. All 7 functions remain in their declared classification.

One implementation-level note confirmed in sprint-2: `authorizeDeletionPure` is called indirectly via `authorizeDeletion` in `authorize-deletion.ts`, which wraps it by passing `deps.getNoteSnapshot(confirmed.noteId)` as the `snapshot` argument. The pure core itself has no port access — the snapshot lookup is performed in the effectful shell and passed as a data argument. No drift.

Required follow-up before Phase 6: None. All declared purity boundaries are observed. All 9 required proof obligations are proved. No unexpected purity drift detected. FIND-IMPL-DLN-001 mitigated in sprint-2.
