# Behavioral Specification: DeleteNote

**Feature**: `delete-note`
**Phase**: 1a
**Revision**: 2
**Source of truth**: `docs/domain/workflows.md` Workflow 5 (lines 467–555), `docs/domain/code/ts/src/curate/workflows.ts`, `docs/domain/code/ts/src/curate/stages.ts`, `docs/domain/code/ts/src/curate/ports.ts`, `docs/domain/code/ts/src/curate/internal-events.ts`, `docs/domain/code/ts/src/curate/aggregates.ts`, `docs/domain/code/ts/src/curate/read-models.ts`, `docs/domain/code/ts/src/shared/snapshots.ts`, `docs/domain/code/ts/src/shared/events.ts`, `docs/domain/code/ts/src/shared/errors.ts`, `docs/domain/code/ts/src/simulations/08_delete_note.spec.ts`
**Scope**: Note deletion pipeline — Curate context authorize phase + Vault-side trash I/O + projection update. Pipeline terminates after `Promise<Result<UpdatedProjection, DeletionError>>` is produced. Confirmation modal flow (request → confirm/cancel UI), the UI disable logic for the editing note's delete button, and any editor-session coordination are explicitly out of scope: the workflow input is `DeletionConfirmed` (the user has already confirmed). The public events `DeleteNoteRequested`, `NoteFileDeleted`, and `NoteDeletionFailed` are this workflow's cross-context output; emitting them is in scope. `NoteDeletionRequestedInternal`, `NoteDeletionConfirmedInternal`, and `NoteDeletionCanceled` are Capture/UI-layer internal events and are out of scope here.

---

## Revision 2 Changes

This revision addresses all 6 findings from the Phase 1c iter-1 verdict.

- **FIND-SPEC-DLN-001 (BLOCKER)**: `updateProjectionsAfterDelete` is now strictly pure — it computes and returns the projection delta (`UpdatedProjection`) without invoking any port. The orchestrator (not `updateProjectionsAfterDelete`) is responsible for consulting the delta and emitting `TagInventoryUpdated` via `deps.publishInternal`. The Pipeline Overview diagram is updated: Step 4 no longer lists the `TagInventoryUpdated` emission; that emission is now shown as an orchestrator step after Step 4. The docstring in Port Contracts is updated to remove the `publishInternal` call. PROP-DLN-016 (NEW) asserts that `updateProjectionsAfterDelete` invokes no port.

- **FIND-SPEC-DLN-002 (BLOCKER)**: `TrashFile` is typed `Promise<Result<void, FsError>>` and `FsError` structurally includes `disk-full`. Rather than narrowing the port type, the spec now declares an explicit normalization step: `disk-full → NoteDeletionFailureReason 'unknown'`. REQ-DLN-013 (NEW) specifies this mapping and the acceptance criteria. PROP-DLN-017 (NEW) asserts the normalization is total and exhaustive. The `FsError → NoteDeletionFailureReason` table in REQ-DLN-004 is updated to include the `disk-full` row. PROP-DLN-006(c) exhaustiveness switch now covers `disk-full` correctly.

- **FIND-SPEC-DLN-003 (MAJOR)**: PROP-DLN-002(c) reworded from "when both pass" (which implied two conditions) to "when all three preconditions hold" to match the actual three-condition guard (`editingCurrentNoteId !== noteId` AND `Feed.hasNote` AND `snapshot !== null`). A new explicit bullet (d) is added asserting that `snapshot === null` alone produces `Err({ kind: 'not-in-feed' })`.

- **FIND-SPEC-DLN-004 (MAJOR)**: REQ-DLN-010 clarifies the semantic of `removedTags`: it enumerates the tags from the deleted note's `frontmatter.tags` whose `usageCount` was decremented (regardless of whether the count reached zero). A tag with `usageCount > 1` after decrement is still listed in `removedTags` because its count changed. Only tags with `usageCount === 1` before deletion are pruned from `TagInventory.entries` per aggregates.md §3 invariant 1 (`usageCount > 0`). Acceptance criteria in REQ-DLN-010 updated accordingly.

- **FIND-SPEC-DLN-005 (MINOR)**: REQ-DLN-003 now documents that when `Feed.hasNote` returns true but `deps.getNoteSnapshot` returns null (Feed/snapshot inconsistency), the error discriminator remains `not-in-feed` but an optional `cause: 'snapshot-missing'` field is included. Delta 6 (NEW) extends `AuthorizationError { kind: 'not-in-feed' }` with `cause?: 'snapshot-missing'` to carry diagnostic signal without breaking existing exhaustiveness checks.

- **FIND-SPEC-DLN-006 (MINOR)**: REQ-DLN-004 acceptance criteria now includes an explicit criterion that when `FsError.kind === 'unknown'`, `NoteDeletionFailed.detail === FsError.detail` (the mandatory `detail` string is propagated). PROP-DLN-018 (NEW) asserts this propagation as a Tier-2 proof obligation.

---

## Pipeline Overview

```
DeletionConfirmed
    ↓ Step 1: authorizeDeletion       [pure: in-memory read — editingCurrentNoteId, Feed.hasNote]
AuthorizedDeletion
    ↓ Clock.now() — single call here, after authorization succeeds
    ↓ Step 2: buildDeleteNoteRequested [pure: construct DeleteNoteRequested]
    ↓ emit: DeleteNoteRequested (public event)
    ↓ Step 3: trashFile               [ASYNC write I/O — OS trash] ← only async hop
TrashedFile | FsError
    ↓ Step 4: updateProjectionsAfterDelete [pure: Feed.removeNoteRef + TagInventory.applyNoteDeleted → UpdatedProjection delta]
UpdatedProjection
    ↓ orchestrator: emit NoteFileDeleted (public) on success path
    ↓ orchestrator: emit TagInventoryUpdated (internal) when removedTags.length > 0
    ↓ orchestrator: emit NoteDeletionFailed (public) on fs error path
```

Side-effect locations:
- Step 1: in-memory read only (pure relative to external state)
- Step 2: pure construction
- Step 3: **write I/O, async** — the only `await` point
- Step 4: **pure computation** — returns `UpdatedProjection` delta; no port calls, no event emissions
- Orchestrator (after Step 4): emits `NoteFileDeleted`, `TagInventoryUpdated` (when applicable), or `NoteDeletionFailed`

---

## Pipeline Input

The outer curry captures workflow-scoped UI state that is not a long-lived port:

```typescript
// Outer-curry arguments (workflow-scoped snapshots — see Delta 4):
//   deps: DeleteNoteDeps
//   feed: Feed                         — current Curate Feed at command time
//   inventory: TagInventory             — current Curate TagInventory at command time
//   editingCurrentNoteId: NoteId | null — Capture EditingSessionState.currentNoteId (read-only)
//
// Inner argument (the confirmed command):
//   confirmed: DeletionConfirmed = { kind: 'DeletionConfirmed'; noteId: NoteId }
```

`DeletionConfirmed` is produced after the user dismisses the confirmation modal. It represents a user intent that has already been gated by the UI. The workflow does NOT produce or handle the modal flow itself.

External state injected via `DeleteNoteDeps` (superset of `CurateDeps` — see Delta 2):
- `deps.clockNow` — wall-clock time source (called exactly once per write-path invocation)
- `deps.getNoteSnapshot(noteId)` — returns `NoteFileSnapshot | null` from Curate's in-memory snapshot store; used to source `frontmatter` for `AuthorizedDeletion`
- `deps.publish(event)` — emits a `PublicDomainEvent` (used for `DeleteNoteRequested`, `NoteFileDeleted`, `NoteDeletionFailed`)
- `deps.publishInternal(event)` — emits a `CurateInternalEvent` (used for `TagInventoryUpdated`; called by the orchestrator, NOT by `updateProjectionsAfterDelete`)
- `deps.trashFile(filePath)` — async OS trash port (NEW — see Delta 1)
- `deps.getAllSnapshots()` — not needed for this workflow (no refreshSort); present on deps for consistency with sibling workflows but NOT called by DeleteNote

---

## Pipeline Output

```typescript
// Canonical signature (workflows.ts:91-96):
type DeleteNote = (
  deps: CurateDeps,
) => (
  authorized: AuthorizedDeletion,
) => Promise<Result<UpdatedProjection, DeletionError>>;

// Implementation signature (Delta 4 applied — see Cross-context Dependencies):
type DeleteNote = (
  deps: DeleteNoteDeps,
  feed: Feed,
  inventory: TagInventory,
  editingCurrentNoteId: NoteId | null,
) => (
  confirmed: DeletionConfirmed,
) => Promise<Result<UpdatedProjection, DeletionError>>;
```

The workflow is an `async` function. It never `throw`s. All errors are reified as `Err(DeletionError)` in the resolved `Promise`. The only `await` point is Step 3 (`trashFile`). Authorization errors (Step 1) are synchronous and short-circuit before any `await`.

---

## Idempotency Note

**First call**: `authorizeDeletion` passes (note is in Feed, not editing-in-progress) → `trashFile` is called → file is moved to OS trash → `NoteFileDeleted` is emitted → projections are updated.

**Second call (same noteId)**:
- If `authorizeDeletion` runs first: `Feed.hasNote(noteId)` returns false (note was removed from Feed after first call) → returns `Err(DeletionError { kind: 'authorization', reason: { kind: 'not-in-feed', noteId } })`. No trash attempt.
- If the first call's projection update has not yet completed (race, unlikely in single-threaded MVP): `trashFile` is called again → OS trash returns `not-found` (file already trashed) → see `fs.not-found` decision in Error Type Reconciliation.

**Rule**: The workflow does not implement an explicit idempotency key. Idempotency on the happy path is enforced structurally by `Feed.hasNote` at authorization time. A note that has been successfully deleted will no longer be in the Feed, so a second authorization attempt will fail with `not-in-feed`.

---

## Clock.now() Budget

Single `Clock.now()` call per invocation, made in the orchestrator after `authorizeDeletion` succeeds. This single `now` is threaded through:
- `DeleteNoteRequested.occurredOn = now`
- `NoteFileDeleted.occurredOn = now` (echoed by Vault port or constructed in orchestrator)
- `NoteDeletionFailed.occurredOn = now` (on fs failure path)
- `TagInventoryUpdated.occurredOn = now`

| Path | Clock.now() calls | Notes |
|------|-------------------|-------|
| `editing-in-progress` error | 0 | fails at Step 1, before Clock call |
| `not-in-feed` error | 0 | fails at Step 1, before Clock call |
| `fs.permission` / `fs.lock` / `fs.disk-full` / `fs.unknown` error | 1 | Clock called; trashFile called; Err returned |
| `fs.not-found` (already trashed) | 1 | Clock called; trashFile returns not-found; see §8 |
| happy path (trash succeeds) | 1 | Clock called once up-front; threaded through Steps 2–4 |

Maximum `Clock.now()` calls per invocation: **1**.

---

## Purity Boundary Candidates

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Step 1 | `authorizeDeletion` | **Effectful shell (read)** | Calls `deps.getNoteSnapshot(noteId)` (in-memory read port) to source the snapshot's `frontmatter`, and reads `editingCurrentNoteId` (outer-curry arg) and `feed` (outer-curry arg). The function is deterministic given fixed inputs but depends on external state via `getNoteSnapshot`. Returns `Result<AuthorizedDeletion, DeletionError>` synchronously. |
| Step 1 (pure core) | `authorizeDeletionPure` | **Pure core — proof target** | `(noteId: NoteId, editingCurrentNoteId: NoteId | null, feed: Feed, snapshot: NoteFileSnapshot | null) => Result<AuthorizedDeletion, DeletionError>`. Deterministic given fixed inputs. No ports. The authorization decision logic in isolation. Property-test and formal-proof target. |
| Step 2 | `buildDeleteNoteRequested` | **Pure core** | `(authorized: AuthorizedDeletion, now: Timestamp) => DeleteNoteRequested`. Pure construction. No clock call (uses pre-obtained `now`). Canonical signature from `workflows.ts:99-102`. |
| Step 3 | `trashFile` | **Effectful shell (I/O, async)** | OS trash write. Async (`Promise`). Returns `Result<void, FsError>`. Non-deterministic (filesystem, OS). The only `await` point in the workflow. |
| Step 4 | `updateProjectionsAfterDelete` | **Pure core** | `(feed: Feed, inventory: TagInventory, event: NoteFileDeleted) => UpdatedProjection`. Calls `Feed.removeNoteRef(feed, event.noteId)` and `TagInventory.applyNoteDeleted(inventory, event.frontmatter, now)`. Sources `now` from `event.occurredOn`. Returns new immutable `UpdatedProjection`. **Does NOT call any port** — in particular, does NOT call `deps.publishInternal`. The orchestrator consults the returned `UpdatedProjection` and emits `TagInventoryUpdated` when `removedTags.length > 0`. |
| Orchestrator (after Step 4) | event emission | **Effectful shell** | Calls `deps.publish(NoteFileDeleted)` and, when applicable, `deps.publishInternal(TagInventoryUpdated)`. These calls happen in the orchestrator after Step 4 returns the pure `UpdatedProjection`. |

**Formally verifiable core (pure functions)**:
- `authorizeDeletionPure` — the authorization decision logic (primary proof target)
- `buildDeleteNoteRequested` — event construction
- `updateProjectionsAfterDelete` — projection delta computation (Feed removal + TagInventory decrement); no port calls

**Effectful shell**:
- `authorizeDeletion` orchestration wrapper (reads `getNoteSnapshot`)
- `trashFile` (write I/O, async)
- `deps.publish` (public event bus) — called by orchestrator
- `deps.publishInternal` (internal event bus) — called by orchestrator after Step 4

---

## Error Type Reconciliation

`DeleteNote` returns `Promise<Result<UpdatedProjection, DeletionError>>`.

```typescript
// From docs/domain/code/ts/src/shared/errors.ts:
type DeletionError =
  | { kind: 'authorization'; reason: AuthorizationError }
  | { kind: 'fs'; reason: FsError }

type AuthorizationError =
  | { kind: 'editing-in-progress'; noteId: NoteId }
  | { kind: 'not-in-feed'; noteId: NoteId; cause?: 'snapshot-missing' }  // Delta 6: optional cause field
```

### Authorization errors

| Source | Maps to | Classification |
|--------|---------|---------------|
| `editingCurrentNoteId === confirmed.noteId` | `DeletionError { kind: 'authorization', reason: { kind: 'editing-in-progress', noteId } }` | Defensive invariant violation. The UI is supposed to disable the delete button for the currently-editing note per validation.md Scenario 14 / F13. This error is a programming-error-style guard; in correct operation it should never fire. |
| `!Feed.hasNote(feed, confirmed.noteId)` | `DeletionError { kind: 'authorization', reason: { kind: 'not-in-feed', noteId } }` | Structural guard. The note is not in the Feed; there is nothing to delete from the projection perspective. |
| `Feed.hasNote` returns true BUT `deps.getNoteSnapshot` returns null | `DeletionError { kind: 'authorization', reason: { kind: 'not-in-feed', noteId, cause: 'snapshot-missing' } }` | Feed/snapshot inconsistency (programming error). The `cause: 'snapshot-missing'` field carries diagnostic signal. The discriminator remains `not-in-feed` so existing exhaustiveness checks do not need new arms. |

Both authorization errors short-circuit before `Clock.now()` and before any publish.

### Filesystem errors

`FsError` from `trashFile` maps to `NoteDeletionFailureReason`:

```
FsError { kind: 'permission' }  → NoteDeletionFailureReason "permission"
FsError { kind: 'lock' }        → NoteDeletionFailureReason "lock"
FsError { kind: 'not-found' }  → NoteDeletionFailureReason "not-found"  (graceful path — see below)
FsError { kind: 'disk-full' }  → NoteDeletionFailureReason "unknown"    (normalization — see REQ-DLN-013)
FsError { kind: 'unknown' }    → NoteDeletionFailureReason "unknown"
```

`FsError.unknown.detail` (mandatory `string`) is propagated to `NoteDeletionFailed.detail` (optional `string`). When `FsError.kind === 'disk-full'`, `NoteDeletionFailed.detail` is set to `"disk-full"` as a diagnostic string (see REQ-DLN-013).

`DeletionError.kind === 'fs'` → public event `NoteDeletionFailed`.

### Decision: `fs.not-found` — graceful continue (remove from Feed)

**Design choice**: When `trashFile` returns `Err({ kind: 'not-found' })`, the workflow SHALL treat this as "the file was already deleted externally" and proceed as if the trash succeeded. This means:

1. Emit `NoteFileDeleted` (with frontmatter from `AuthorizedDeletion`).
2. Call `updateProjectionsAfterDelete` to remove the note from Feed and decrement TagInventory.
3. Return `Ok(UpdatedProjection)`.
4. Emit a warning log (application layer responsibility, not a domain event).
5. Do NOT emit `NoteDeletionFailed`.

**Rationale**: The `not-found` variant means the file is gone from the filesystem — the OS trash already holds it (or it was deleted by another process such as Obsidian). From the user's perspective, the note is deleted. Returning an `Err` on `not-found` would leave the Feed in an inconsistent state (showing a note whose file no longer exists). The workflows.md UI mapping explicitly calls for "既に削除済み扱いで Feed から外す（warning ログ）" on `fs.not-found`. Therefore `not-found` is mapped to `Ok(UpdatedProjection)` via the same projection update path as a successful trash. The `NoteFileDeleted` public event is emitted so that any other context can react.

This diverges from the other `FsError` variants (`permission`, `lock`, `disk-full`, `unknown`) which all produce `Err(DeletionError { kind: 'fs', ... })` and `NoteDeletionFailed`.

---

## Cross-context Dependencies / Canonical Contract Deltas

This section documents all cross-context function reuse and contract modifications required by this workflow. Phase 2 implementation will apply these deltas. The spec declares them here; modification of the canonical files occurs in Phase 2b.

### Delta 1: `TrashFile` port — NEW export in `docs/domain/code/ts/src/curate/ports.ts`

```typescript
/** Moves the file at the given path to the OS trash. Async.
 *  On success: returns Ok(void).
 *  On failure: returns Err(FsError).
 *  FsError variants in scope: permission, lock, not-found, unknown, disk-full.
 *  disk-full is normalized to NoteDeletionFailureReason 'unknown' by the orchestrator
 *  before emitting NoteDeletionFailed (see REQ-DLN-013).
 *  Analogous to WriteMarkdown declared for TagChipUpdate. */
export type TrashFile = (filePath: string) => Promise<Result<void, FsError>>;
```

**Rationale**: `trashFile` is the async write I/O boundary for DeleteNote, exactly as `writeMarkdown` is for TagChipUpdate. The path comes from `NoteFileSnapshot.filePath` (per `snapshots.ts` — the snapshot carries `filePath: string` directly). No separate `noteIdToPath` helper is needed: the implementation resolves the path from the snapshot retrieved during `authorizeDeletion` via `deps.getNoteSnapshot(noteId)`. This mirrors how `writeMarkdown` receives a fully-formed `SaveNoteRequested` that contains all required data.

### Delta 2: `DeleteNoteDeps` shape — NEW export in `docs/domain/code/ts/src/curate/ports.ts`

```typescript
/** Superset of CurateDeps required by the DeleteNote workflow.
 *  Structural guarantee: does NOT include any editor-buffer key
 *  (no getEditorBuffer, no editingState). The only Capture-side input is
 *  the read-only editingCurrentNoteId: NoteId | null outer-curry argument.
 *  GetAllSnapshots and EventBusPublishInternal are reused from TagChipUpdate (TCU originator). */
export type DeleteNoteDeps = CurateDeps & {
  /** OS trash write port. Async. */
  readonly trashFile: TrashFile;
  /** Full snapshot collection (consistent with TagChipUpdateDeps; may be used for future
   *  FeedOps.refreshSort if DeleteNote needs re-sort after projection update). */
  readonly getAllSnapshots: GetAllSnapshots;
  /** Internal event bus for CurateInternalEvent (e.g., TagInventoryUpdated).
   *  Called by the orchestrator after Step 4 (updateProjectionsAfterDelete) returns;
   *  NOT called by updateProjectionsAfterDelete itself. */
  readonly publishInternal: EventBusPublishInternal;
};
```

`GetAllSnapshots` and `EventBusPublishInternal` were declared as contract deltas by TagChipUpdate (the originating feature). DeleteNote reuses them without modification.

`DeleteNoteDeps` does NOT include any editor-buffer key (no `getEditorBuffer`, no `editingState`). The `editingCurrentNoteId: NoteId | null` is passed as a read-only outer-curry argument, not as a dep port. This is the structural guarantee that the workflow cannot access mutable Capture editor state.

### Delta 3: `BuildDeleteNoteRequested` — canonical signature restated

The canonical signature from `workflows.ts:99-102` is:

```typescript
export type BuildDeleteNoteRequested = (
  authorized: AuthorizedDeletion,
  now: Timestamp,
) => DeleteNoteRequested;
```

This signature is already fully pure (no `deps` curry, explicit `now`). No widening is needed. The implementation uses the pre-obtained `now` from the orchestrator's single `Clock.now()` call. This matches the Delta 5 pattern established by TagChipUpdate's `BuildTagChipSaveRequest`.

### Delta 4: `DeleteNote` outer curry takes `(deps, feed, inventory, editingCurrentNoteId)`

**Canonical** (`docs/domain/code/ts/src/curate/workflows.ts:91-96`):
```typescript
export type DeleteNote = (
  deps: CurateDeps,
) => (
  authorized: AuthorizedDeletion,
) => Promise<Result<UpdatedProjection, DeletionError>>;
```

**Delta** (implementation signature):
```typescript
export type DeleteNote = (
  deps: DeleteNoteDeps,
  feed: Feed,
  inventory: TagInventory,
  editingCurrentNoteId: NoteId | null,
) => (
  confirmed: DeletionConfirmed,
) => Promise<Result<UpdatedProjection, DeletionError>>;
```

**Rationale**: `feed`, `inventory`, and `editingCurrentNoteId` are workflow-scoped UI state at command time, not long-lived ports. Threading them through the outer curry keeps the inner closure command-only and makes the dependency on current UI state explicit at the call site. This is the same justification as TagChipUpdate Delta 6 (which threads `feed` and `inventory`). For DeleteNote, `editingCurrentNoteId` is additionally required because `authorizeDeletion` needs it for the `editing-in-progress` guard. Folding any of these into `DeleteNoteDeps` would imply they are stable long-lived ports (they are not — they are snapshots of UI state at the moment the command is dispatched).

Note: the inner function's input changes from `authorized: AuthorizedDeletion` (canonical) to `confirmed: DeletionConfirmed` (delta), because the implementation performs authorization internally rather than receiving a pre-authorized stage object. This keeps all authorization logic encapsulated within the workflow and prevents callers from bypassing the authorization step.

### Delta 5: Path resolution for `trashFile` — resolved via `NoteFileSnapshot.filePath`

No new port is needed. `NoteFileSnapshot` (from `shared/snapshots.ts`) carries `filePath: string` directly. During `authorizeDeletion`, `deps.getNoteSnapshot(noteId)` retrieves the snapshot, and `snapshot.filePath` is the argument passed to `deps.trashFile(filePath)` in Step 3. This is the same `getNoteSnapshot` already declared on `CurateDeps` (canonical). The implementation must capture `snapshot.filePath` from the `authorizeDeletion` step and carry it forward as part of `AuthorizedDeletion` (or thread it as a local variable in the orchestrator).

**Implementation note**: `AuthorizedDeletion` (from `stages.ts`) carries `frontmatter: Frontmatter` but not `filePath`. The implementation will either (a) add `filePath: string` to `AuthorizedDeletion` as an implementation-level augmentation, or (b) thread `filePath` as a local variable in the pipeline orchestrator. Option (b) is preferred to avoid changing the canonical stage type. Declare as an internal implementation detail in Phase 2b.

### Delta 6: `AuthorizationError { kind: 'not-in-feed' }` extended with optional `cause` — FIND-SPEC-DLN-005

**Rationale**: When `Feed.hasNote` returns true but `deps.getNoteSnapshot` returns null, the system has detected a Feed/snapshot inconsistency (programming error). The error discriminator remains `not-in-feed` (no new arm needed in exhaustiveness switches), but an optional `cause?: 'snapshot-missing'` field carries diagnostic signal for logging and debugging.

**Delta** (modification to `docs/domain/code/ts/src/shared/errors.ts:60-62`):
```typescript
// Before (Revision 1):
export type AuthorizationError =
  | { kind: 'editing-in-progress'; noteId: NoteId }
  | { kind: 'not-in-feed'; noteId: NoteId };

// After (Delta 6):
export type AuthorizationError =
  | { kind: 'editing-in-progress'; noteId: NoteId }
  | { kind: 'not-in-feed'; noteId: NoteId; cause?: 'snapshot-missing' };
```

**Chosen approach**: Extending the existing `not-in-feed` variant with an optional `cause` field is cheaper than adding a new `snapshot-missing` discriminator arm. The `cause` field is optional, so all existing code that pattern-matches on `{ kind: 'not-in-feed' }` continues to compile without modification. The diagnostic signal is available for callers that care to inspect it.

---

## Requirements

### REQ-DLN-001: Happy Path — authorization succeeds, trash succeeds, projections updated

**EARS**: WHEN `DeletionConfirmed { noteId }` is received AND `editingCurrentNoteId !== noteId` AND `Feed.hasNote(feed, noteId)` returns true AND `deps.getNoteSnapshot(noteId)` returns a snapshot AND `trashFile(snapshot.filePath)` succeeds THEN the system SHALL call `Clock.now()` once, emit `DeleteNoteRequested { noteId, occurredOn: now }` as a public event, emit `NoteFileDeleted { noteId, frontmatter, occurredOn: now }` as a public event, call `updateProjectionsAfterDelete(feed, inventory, event)` producing `UpdatedProjection`, emit `TagInventoryUpdated` via `deps.publishInternal` (from the orchestrator) when `removedTags.length > 0`, and return `Ok(UpdatedProjection)`.

**Edge Cases**:
- `frontmatter` in `NoteFileDeleted` is sourced from the Curate snapshot at `authorizeDeletion` time (not from the filesystem after trashing). This ensures the TagInventory delta is computed against a known-good frontmatter.
- `NoteFileDeleted.occurredOn` equals `DeleteNoteRequested.occurredOn` equals the single `now` from `Clock.now()`.
- If the deleted note had no tags (`frontmatter.tags.length === 0`), `TagInventoryUpdated` is NOT emitted.
- `UpdatedProjection.feed` does not contain `noteId` in `noteRefs`.
- `UpdatedProjection.tagInventory` reflects the tag decrements from the deleted note.

**Acceptance Criteria**:
- `Clock.now()` is called exactly once.
- `deps.publish(DeleteNoteRequested { kind: 'delete-note-requested', noteId, occurredOn: now })` is called before `trashFile`.
- `deps.trashFile(snapshot.filePath)` is called exactly once.
- `deps.publish(NoteFileDeleted { kind: 'note-file-deleted', noteId, frontmatter, occurredOn: now })` is called after successful trash.
- `UpdatedProjection.feed.noteRefs` does not include `noteId`.
- `TagInventoryOps.applyNoteDeleted(inventory, frontmatter, now)` is called in `updateProjectionsAfterDelete`.
- When `frontmatter.tags.length > 0`, the orchestrator calls `deps.publishInternal(TagInventoryUpdated { kind: 'tag-inventory-updated', addedTags: [], removedTags: [...], occurredOn: now })` exactly once after `updateProjectionsAfterDelete` returns.
- When `frontmatter.tags.length === 0`, `deps.publishInternal` is NOT called.
- `updateProjectionsAfterDelete` does NOT call `deps.publishInternal`.
- Workflow returns `Ok(UpdatedProjection)`.
- Workflow never throws; all errors as `Err(DeletionError)`.

---

### REQ-DLN-002: Authorization Error — editing-in-progress

**EARS**: WHEN `DeletionConfirmed { noteId }` is received AND `editingCurrentNoteId === noteId` THEN the system SHALL return `Err(DeletionError { kind: 'authorization', reason: { kind: 'editing-in-progress', noteId } })` without calling `Clock.now()`, without calling `trashFile`, and without emitting any events.

**Edge Cases**:
- This is a defensive programming-error-style guard. In correct UI operation the delete button for the currently-editing note is disabled per validation.md Scenario 14 / F13. If this error fires, it indicates a UI bug.
- The error is non-recoverable from the workflow's perspective; the UI layer must handle it (log internally, display hint).
- `editingCurrentNoteId` is the read-only outer-curry argument (sourced from `EditingSessionState.currentNoteId`). The workflow does not modify it.

**Acceptance Criteria**:
- `authorizeDeletion` returns `Err(DeletionError { kind: 'authorization', reason: { kind: 'editing-in-progress', noteId } })`.
- `Clock.now()` is NOT called.
- `trashFile` is NOT called.
- `deps.publish` is NOT called.
- `deps.publishInternal` is NOT called.
- `Feed` and `TagInventory` are unchanged.
- Workflow returns `Err(DeletionError { kind: 'authorization', ... })`.

---

### REQ-DLN-003: Authorization Error — note not in Feed

**EARS**: WHEN `DeletionConfirmed { noteId }` is received AND `editingCurrentNoteId !== noteId` AND `Feed.hasNote(feed, noteId)` returns false THEN the system SHALL return `Err(DeletionError { kind: 'authorization', reason: { kind: 'not-in-feed', noteId } })` without calling `Clock.now()`, without calling `trashFile`, and without emitting any events.

**Edge Cases**:
- This covers the second-call idempotency case: if a note has already been deleted (removed from Feed), a second deletion attempt produces `not-in-feed`.
- Also covers the case where `deps.getNoteSnapshot(noteId)` returns null (no snapshot in Curate store); if `Feed.hasNote` returns false first, the error is `not-in-feed` without checking the snapshot.
- **Snapshot-missing inconsistency** (FIND-SPEC-DLN-005): If `Feed.hasNote` returns true but `deps.getNoteSnapshot` returns null, this is a Feed/snapshot inconsistency (programming error). The implementation SHALL return `Err(DeletionError { kind: 'authorization', reason: { kind: 'not-in-feed', noteId, cause: 'snapshot-missing' } })` — the discriminator remains `not-in-feed` for exhaustiveness compatibility, but `cause: 'snapshot-missing'` carries diagnostic signal (see Delta 6).

**Acceptance Criteria**:
- When `Feed.hasNote` returns false: `authorizeDeletion` returns `Err(DeletionError { kind: 'authorization', reason: { kind: 'not-in-feed', noteId } })` with no `cause` field.
- When `Feed.hasNote` returns true but `getNoteSnapshot` returns null: `authorizeDeletion` returns `Err(DeletionError { kind: 'authorization', reason: { kind: 'not-in-feed', noteId, cause: 'snapshot-missing' } })`.
- `Clock.now()` is NOT called.
- `trashFile` is NOT called.
- `deps.publish` is NOT called.
- `deps.publishInternal` is NOT called.
- `Feed` and `TagInventory` are unchanged.
- Workflow returns `Err(DeletionError { kind: 'authorization', ... })`.

---

### REQ-DLN-004: Filesystem Error — permission, lock, disk-full, or unknown

**EARS**: WHEN `authorizeDeletion` succeeds AND `trashFile(filePath)` returns `Err(FsError)` where `FsError.kind ∈ { 'permission', 'lock', 'disk-full', 'unknown' }` THEN the system SHALL emit `NoteDeletionFailed { noteId, reason: <mapped>, detail?: <propagated>, occurredOn: now }` as a public event, NOT call `updateProjectionsAfterDelete`, and return `Err(DeletionError { kind: 'fs', reason: FsError })`.

**State consistency invariant**: `updateProjectionsAfterDelete` is NOT invoked on the fs-error path. The in-memory projections must remain consistent with the filesystem state. Since the trash failed, the file still exists, and the note must remain in the Feed and TagInventory.

**FsError → NoteDeletionFailureReason mapping**:
```
FsError { kind: 'permission' }  → NoteDeletionFailureReason "permission"
FsError { kind: 'lock' }        → NoteDeletionFailureReason "lock"
FsError { kind: 'disk-full' }  → NoteDeletionFailureReason "unknown"  (normalization — see REQ-DLN-013)
FsError { kind: 'unknown' }    → NoteDeletionFailureReason "unknown"
```

**detail propagation**:
- `FsError { kind: 'unknown', detail: string }` → `NoteDeletionFailed.detail = FsError.detail` (see REQ-DLN-013, FIND-SPEC-DLN-006)
- `FsError { kind: 'disk-full' }` → `NoteDeletionFailed.detail = 'disk-full'` (diagnostic string for the normalized-unknown case)
- All other `FsError` variants → `NoteDeletionFailed.detail` is omitted (undefined)

**Edge Cases**:
- `NoteFileDeleted` is NOT emitted on this path.
- `TagInventoryUpdated` is NOT emitted.
- `Feed.removeNoteRef` is NOT called.
- `TagInventory.applyNoteDeleted` is NOT called.
- `DeleteNoteRequested` WAS already emitted before the trash attempt; it cannot be "un-emitted".

**Acceptance Criteria**:
- `trashFile` returns `Err(FsError)` with `kind ∈ { 'permission', 'lock', 'disk-full', 'unknown' }`.
- `deps.publish(NoteDeletionFailed { kind: 'note-deletion-failed', noteId, reason: <mapped>, occurredOn: now })` is called exactly once.
- When `FsError.kind === 'unknown'`: `NoteDeletionFailed.detail === FsError.detail` (propagation of the mandatory `detail` string).
- When `FsError.kind === 'disk-full'`: `NoteDeletionFailed.detail === 'disk-full'` (diagnostic string; reason is `'unknown'`).
- When `FsError.kind ∈ { 'permission', 'lock' }`: `NoteDeletionFailed.detail` is omitted (undefined).
- `NoteFileDeleted` is NOT emitted.
- `TagInventoryUpdated` is NOT emitted.
- `updateProjectionsAfterDelete` is NOT called.
- `Feed` and `TagInventory` are unchanged.
- Workflow returns `Err(DeletionError { kind: 'fs', reason: FsError })`.
- `Clock.now()` was called exactly once (before the trash attempt).

---

### REQ-DLN-005: Filesystem Error — not-found (graceful continue)

**EARS**: WHEN `authorizeDeletion` succeeds AND `trashFile(filePath)` returns `Err({ kind: 'not-found' })` THEN the system SHALL treat the file as already deleted: emit `NoteFileDeleted { noteId, frontmatter, occurredOn: now }` as a public event, call `updateProjectionsAfterDelete` to remove the note from Feed and decrement TagInventory, emit `TagInventoryUpdated` (from the orchestrator) when `removedTags.length > 0`, and return `Ok(UpdatedProjection)`.

**Design decision**: `fs.not-found` maps to `Ok(UpdatedProjection)`, not to `Err`. The file is absent from the filesystem (deleted externally by Obsidian or another process), so the correct user-visible outcome is the same as a successful deletion: the note is no longer in the Feed. Returning `Err` on `not-found` would leave the Feed showing a phantom note. Rationale: workflows.md UI mapping for `fs.not-found` states "既に削除済み扱いで Feed から外す（warning ログ）". The warning log is an application-layer concern (not a domain event).

**Edge Cases**:
- `NoteDeletionFailed` is NOT emitted on this path (despite being an fs error — `not-found` is handled gracefully).
- The `frontmatter` in `NoteFileDeleted` is still sourced from the Curate snapshot at authorization time (same invariant as REQ-DLN-001).
- The `occurredOn` threading invariant holds: `DeleteNoteRequested.occurredOn === NoteFileDeleted.occurredOn === now`.

**Acceptance Criteria**:
- `trashFile` returns `Err({ kind: 'not-found' })`.
- `NoteDeletionFailed` is NOT emitted.
- `deps.publish(NoteFileDeleted { noteId, frontmatter, occurredOn: now })` is called exactly once.
- `updateProjectionsAfterDelete` IS called with the same arguments as on the happy path.
- `UpdatedProjection.feed.noteRefs` does not include `noteId`.
- When `frontmatter.tags.length > 0`, the orchestrator calls `deps.publishInternal(TagInventoryUpdated { ... })`.
- Workflow returns `Ok(UpdatedProjection)`.
- `Clock.now()` was called exactly once.

---

### REQ-DLN-006: `frontmatter` sourcing invariant — Curate snapshot at authorization time

**EARS**: WHEN `authorizeDeletion` succeeds THEN `AuthorizedDeletion.frontmatter` SHALL equal `deps.getNoteSnapshot(noteId).frontmatter` at the moment of authorization — the frontmatter of the Curate-side in-memory snapshot, not the frontmatter of any editor buffer.

**Rationale**: `NoteFileDeleted.frontmatter` is used by `TagInventory.applyNoteDeleted` to compute the tag usageCount decrements. If the wrong frontmatter is used (e.g., from an unsaved editor buffer), the TagInventory delta is incorrect. This parallels TCU's `previousFrontmatter` invariant: the Curate snapshot is the authoritative source, not any Capture editor state.

**Edge Cases**:
- If the note is currently open in the Capture editor with unsaved tag changes, the editor's in-memory frontmatter diverges from the Curate snapshot. The Curate snapshot wins for this workflow. The editor's unsaved changes are not part of the deletion event's tag accounting.
- The structural guarantee is enforced by `DeleteNoteDeps` not including any editor-buffer port.

**Acceptance Criteria**:
- `AuthorizedDeletion.frontmatter` equals `deps.getNoteSnapshot(noteId).frontmatter` (the Curate snapshot frontmatter at authorization time).
- `NoteFileDeleted.frontmatter === AuthorizedDeletion.frontmatter`.
- `TagInventoryOps.applyNoteDeleted` is called with `AuthorizedDeletion.frontmatter` as the `frontmatter` argument.
- A Tier-0 type-level assertion confirms `DeleteNoteDeps` does not include any editor-buffer key.

---

### REQ-DLN-007: `occurredOn` threading invariant

**EARS**: WHEN the `DeleteNote` workflow executes on a write path THEN the single `Timestamp` produced by `Clock.now()` SHALL be threaded through every time-stamped artifact: `DeleteNoteRequested.occurredOn`, `NoteFileDeleted.occurredOn` (or `NoteDeletionFailed.occurredOn`), and `TagInventoryUpdated.occurredOn`.

**occurredOn threading chain**:
```
now = deps.clockNow()
  → DeleteNoteRequested.occurredOn = now
  → NoteFileDeleted.occurredOn = now         (happy path and not-found graceful path)
  → NoteDeletionFailed.occurredOn = now      (permission/lock/disk-full/unknown error path)
  → TagInventoryUpdated.occurredOn = now     (when emitted, sourced from event.occurredOn)
```

`updateProjectionsAfterDelete` sources `now` from `event.occurredOn` (which equals the orchestrator's single `Clock.now()` result by construction). It does NOT call `deps.clockNow()` itself.

**Acceptance Criteria**:
- `DeleteNoteRequested.occurredOn === now` (the single Clock.now() result).
- `NoteFileDeleted.occurredOn === now` (same value on the success path).
- `NoteDeletionFailed.occurredOn === now` (same value on the fs-error path).
- `TagInventoryUpdated.occurredOn === now` (when emitted, same value).
- `updateProjectionsAfterDelete` does NOT call `deps.clockNow()`.
- `buildDeleteNoteRequested` does NOT call `deps.clockNow()`.
- `Clock.now()` is called at most once per invocation.

---

### REQ-DLN-008: Clock budget invariant

**EARS**: WHEN the `DeleteNote` workflow executes THEN `Clock.now()` SHALL be called at most once per invocation, and zero times on authorization-error paths.

**Acceptance Criteria**:
- On `editing-in-progress` error path: `Clock.now()` is NOT called (0 calls).
- On `not-in-feed` error path: `Clock.now()` is NOT called (0 calls).
- On all write paths (happy, not-found graceful, permission/lock/disk-full/unknown error): `Clock.now()` is called exactly once, after authorization succeeds and before `buildDeleteNoteRequested`.
- Maximum `Clock.now()` calls per invocation: **1**.

---

### REQ-DLN-009: Event channel membership

**EARS**: WHEN the `DeleteNote` workflow emits events THEN `DeleteNoteRequested`, `NoteFileDeleted`, and `NoteDeletionFailed` SHALL be emitted via `deps.publish` as members of `PublicDomainEvent`; `TagInventoryUpdated` SHALL be emitted via `deps.publishInternal` as a member of `CurateInternalEvent`; `NoteDeletionRequestedInternal`, `NoteDeletionConfirmedInternal`, and `NoteDeletionCanceled` are NOT emitted by this workflow (they are UI-layer events).

**Acceptance Criteria**:
- `DeleteNoteRequested` (kind: `'delete-note-requested'`) is a member of `PublicDomainEvent`.
- `NoteFileDeleted` (kind: `'note-file-deleted'`) is a member of `PublicDomainEvent`.
- `NoteDeletionFailed` (kind: `'note-deletion-failed'`) is a member of `PublicDomainEvent`.
- `TagInventoryUpdated` (kind: `'tag-inventory-updated'`) is a member of `CurateInternalEvent`.
- `TagInventoryUpdated` is NOT a member of `PublicDomainEvent`.
- `NoteDeletionRequestedInternal`, `NoteDeletionConfirmedInternal`, `NoteDeletionCanceled` are members of `CurateInternalEvent` and are NOT emitted by this workflow.
- TypeScript type assertions confirming event channel membership compile without error.

---

### REQ-DLN-010: `TagInventoryUpdated` emission rule

**EARS**: WHEN the orchestrator receives `UpdatedProjection` from `updateProjectionsAfterDelete` THEN `TagInventoryUpdated` SHALL be emitted via `deps.publishInternal` IF AND ONLY IF `removedTags.length > 0` (i.e., at least one tag's `usageCount` was decremented as a result of the deletion).

**Rationale**: Emitting `TagInventoryUpdated` with `removedTags: []` would be a spurious event with no semantic content. UI consumers would trigger a re-render with no visual change. Suppressing the event when there is no delta is the correct behavior.

**Semantic clarification (FIND-SPEC-DLN-004)**: `removedTags` enumerates the tags from the deleted note's `frontmatter.tags` whose `usageCount` was **decremented** — not only those whose count reached zero. A tag with `usageCount: 5` before deletion has `usageCount: 4` after; it is still listed in `removedTags` because its count changed. Per aggregates.md §3 invariant 1 (`usageCount > 0`), only tags whose `usageCount` reaches zero are pruned from `TagInventory.entries`. Tags with `usageCount > 1` before deletion remain in `entries` with a decremented count. Both pruned and decremented tags are included in `removedTags`.

**Edge Cases**:
- A note with `frontmatter.tags = []` produces `removedTags: []` → no `TagInventoryUpdated` emitted.
- A note with `frontmatter.tags = ['draft']` where `'draft'` has `usageCount: 1` produces `removedTags: [Tag('draft')]` → `TagInventoryUpdated` emitted; `TagInventory.entries` no longer contains `'draft'` (zero-count entries are pruned per aggregates.md §3 invariant 1: `usageCount > 0`).
- A note with `frontmatter.tags = ['draft']` where `'draft'` has `usageCount: 5` produces `removedTags: [Tag('draft')]` → `TagInventoryUpdated` emitted; `usageCount` becomes 4 (entry remains in `entries`).
- `addedTags` is always `[]` in this workflow (deletion cannot add tags to the inventory).
- The `removedTags` field in `TagInventoryUpdated` carries `readonly Tag[]` per `internal-events.ts:45`.

**Acceptance Criteria**:
- When `frontmatter.tags.length === 0`: the orchestrator does NOT call `deps.publishInternal`.
- When `frontmatter.tags.length > 0`: the orchestrator calls `deps.publishInternal(TagInventoryUpdated { addedTags: [], removedTags: <decremented tags>, occurredOn: now })` exactly once.
- `TagInventoryUpdated.addedTags` is always `[]` in this workflow.
- `TagInventoryUpdated.removedTags` contains exactly the tags from `AuthorizedDeletion.frontmatter.tags` whose `usageCount` was decremented (the full set of deleted note's tags that existed in the inventory, regardless of whether their count reached zero).
- `updateProjectionsAfterDelete` does NOT call `deps.publishInternal`; the orchestrator does.

---

### REQ-DLN-011: Non-coupling — `DeleteNoteDeps` does not include editor-buffer ports

**EARS**: WHEN `DeleteNoteDeps` is defined THEN it SHALL NOT include any editor-buffer or Capture-state port. The only Capture-side input is the read-only `editingCurrentNoteId: NoteId | null` outer-curry argument used purely for the authorization guard.

**Rationale**: The DeleteNote workflow is a Curate-context operation. It must not depend on mutable Capture editor state via dependency injection. Accessing editor state through a port would couple the Curate workflow to Capture internals, violating context boundary. The `editingCurrentNoteId` is passed as a read-only value (not a port function), making the authorization decision purely data-driven at the moment of invocation.

**Acceptance Criteria**:
- `'getEditorBuffer' extends keyof DeleteNoteDeps` evaluates to `false` (TypeScript type assertion).
- `'editingState' extends keyof DeleteNoteDeps` evaluates to `false` (TypeScript type assertion).
- `'editingCurrentNoteId' extends keyof DeleteNoteDeps` evaluates to `false` (it is an outer-curry argument, not a dep).
- `DeleteNoteDeps` contains only: `clockNow`, `hydrateNote`, `getNoteSnapshot`, `publish`, `trashFile`, `getAllSnapshots`, `publishInternal`.

---

### REQ-DLN-012: Projection update correctness — Feed and TagInventory

**EARS**: WHEN `trashFile` returns `Ok(void)` OR `Err({ kind: 'not-found' })` THEN the system SHALL call `updateProjectionsAfterDelete(feed, inventory, event)` which SHALL invoke `Feed.removeNoteRef(feed, event.noteId)` and `TagInventory.applyNoteDeleted(inventory, event.frontmatter, event.occurredOn)` and return a new `UpdatedProjection { kind: 'UpdatedProjection', feed: newFeed, tagInventory: newInventory }` where `newFeed` and `newInventory` are new immutable instances.

**Acceptance Criteria**:
- `Feed.removeNoteRef(feed, noteId)` is called exactly once on the success path (happy or not-found graceful).
- `TagInventory.applyNoteDeleted(inventory, frontmatter, now)` is called exactly once on the success path.
- `UpdatedProjection.feed.noteRefs` does not contain `noteId`.
- `UpdatedProjection.tagInventory` reflects decremented (or removed) entries for all tags in `frontmatter.tags`.
- `updateProjectionsAfterDelete` is NOT called on `permission`, `lock`, `disk-full`, or `unknown` fs-error paths.
- The returned `UpdatedProjection.feed` is a new `Feed` instance (immutable update, no mutation of the input `feed`).
- The returned `UpdatedProjection.tagInventory` is a new `TagInventory` instance (immutable update).
- `updateProjectionsAfterDelete` does NOT call `deps.publishInternal` or any other port.

---

### REQ-DLN-013: `disk-full` normalization and `FsError.unknown.detail` propagation

**EARS**: WHEN `trashFile` returns `Err(FsError)` where `FsError.kind === 'disk-full'` THEN the orchestrator SHALL emit `NoteDeletionFailed { reason: 'unknown', detail: 'disk-full', occurredOn: now }` — normalizing `disk-full` to the `'unknown'` failure reason. WHEN `FsError.kind === 'unknown'` THEN the orchestrator SHALL emit `NoteDeletionFailed { reason: 'unknown', detail: FsError.detail, occurredOn: now }` — propagating the mandatory `detail` string.

**Rationale (FIND-SPEC-DLN-002)**: `FsError` structurally includes `disk-full` (from `shared/errors.ts:14`) but no `NoteDeletionFailureReason` variant exists for it, and no `TrashFsError` narrowing type is introduced. The explicit normalization step resolves the contradiction without narrowing the port type. Keeping canonical `FsError` avoids an ad-hoc narrow type and ensures the exhaustiveness switch in PROP-DLN-006(c) covers `disk-full` explicitly.

**Rationale (FIND-SPEC-DLN-006)**: `FsError.unknown.detail` is mandatory (`detail: string` without `?`). `NoteDeletionFailed.detail` is optional (`detail?: string` per `events.ts:80`). The propagation criterion ensures the mandatory detail is not silently dropped when the failure reason is `unknown`.

**Acceptance Criteria**:
- When `FsError.kind === 'disk-full'`: `NoteDeletionFailed.reason === 'unknown'` and `NoteDeletionFailed.detail === 'disk-full'`.
- When `FsError.kind === 'unknown'`: `NoteDeletionFailed.reason === 'unknown'` and `NoteDeletionFailed.detail === FsError.detail` (exact string propagation).
- On all other `FsError` variants (`permission`, `lock`): `NoteDeletionFailed.detail` is `undefined`.
- The `FsError → NoteDeletionFailureReason` mapping switch must include an arm for `disk-full` (does not rely on the default/never branch to handle it).
- `updateProjectionsAfterDelete` is NOT called when `FsError.kind === 'disk-full'`.
