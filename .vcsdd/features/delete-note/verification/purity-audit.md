# Purity Boundary Audit

## Feature: delete-note | Date: 2026-05-03

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
- Returns `Result<AuthorizedDeletion, DeletionErrorDelta>` deterministically.
- PROP-DLN-001 property tests (100 runs) confirm referential transparency.
- PROP-DLN-002 example tests verify all four branches.
- Classification: Pure core. **MATCHES declared.**

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

- Single `deps.clockNow()` call at line 63, after `authorizeDeletion` returns `Ok`. Zero calls on authorization-error paths (lines 51-55 return early before line 63).
- `deps.publish(deleteRequested)` called at line 69 — before `trashFile`.
- Second `deps.getNoteSnapshot(authorized.noteId)?.filePath` call at line 77 to retrieve `filePath`. This is a noted implementation detail: `filePath` is not carried in `AuthorizedDeletion` (behavioral-spec.md Delta 5, option (b) chosen — thread as local variable). This second call introduces FIND-IMPL-DLN-001 (TOCTOU, low severity — documented in security-report.md).
- `deps.trashFile(filePath)` at line 78 — the only `await` point.
- `updateProjectionsAfterDelete(feed, inventory, noteFileDeleted)` at line 95 — called on success path (trashResult.ok) and not-found graceful path. NOT called on permission/lock/disk-full/unknown paths.
- `deps.publish(noteFileDeleted)` at line 98 — after Step 4.
- `removedTagsFromDeletion(inventory, authorized.frontmatter)` at line 102 — pure helper call to check tag count.
- `deps.publishInternal(tagInventoryUpdated)` at line 110 — conditional, only when `removedTags.length > 0`.
- `deps.publish(noteDeletionFailed)` at line 131 — on fs-error paths.
- Clock budget: 1 on all write paths, 0 on authorization-error paths. Verified by PROP-DLN-011 (9 paths, all pass).
- Classification: Effectful shell (orchestrator). **MATCHES declared.**

## Summary

No unexpected drift detected. All declared purity boundaries are observed in the implementation.

Specific resolutions verified:

- **FIND-SPEC-DLN-001 (BLOCKER — Revision 2)**: `updateProjectionsAfterDelete` does NOT call `deps.publishInternal`. It is a strictly pure function with no `deps` parameter. The orchestrator calls `deps.publishInternal` after the function returns. PROP-DLN-016 spy test confirms zero port calls inside the function. **RESOLVED.**

- **FIND-SPEC-DLN-002 (BLOCKER — Revision 2)**: `normalizeFsError` contains an explicit `'disk-full'` arm in the exhaustive switch. The `never` default guard would catch any future unhandled variant at compile time. PROP-DLN-006(c) Tier-0 exhaustiveness check and PROP-DLN-017 example test both confirm the explicit arm. **RESOLVED.**

One implementation-level note: `authorizeDeletionPure` is called indirectly via `authorizeDeletion` in `authorize-deletion.ts`, which wraps it by passing `deps.getNoteSnapshot(confirmed.noteId)` as the `snapshot` argument. The pure core itself has no port access — the snapshot lookup is performed in the effectful shell and passed as a data argument. This is the exact `AuthorizeDeletion := (deps, feed, editingCurrentNoteId) => (confirmed) => authorizeDeletionPure(confirmed.noteId, editingCurrentNoteId, feed, deps.getNoteSnapshot(confirmed.noteId))` relationship declared in the spec. No drift.

One implementation detail to note for future sprints: `pipeline.ts` makes a second `deps.getNoteSnapshot` call at line 77 to retrieve `filePath` after authorization. The spec (Delta 5) identifies this as option (b) — threading `filePath` as a local variable in the orchestrator rather than adding it to `AuthorizedDeletion`. This is structurally consistent with the declared boundary (the second call is in the effectful orchestrator, not in any pure function) but introduces FIND-IMPL-DLN-001. Migrating to option (a) (carrying `filePath` in `AuthorizedDeletion`) would eliminate this second effectful call. No purity boundary violation — the note is documented here for Phase 6 context.

Required follow-up before Phase 6: None. All declared purity boundaries are observed. All 9 required proof obligations are proved. No unexpected purity drift detected.
