---
coherence:
  node_id: "design:delete-note-verification"
  type: design
  name: "delete-note 検証アーキテクチャ（純粋性境界・証明義務）"
  depends_on:
    - id: "req:delete-note"
      relation: derives_from
    - id: "design:aggregates"
      relation: derives_from
    - id: "design:type-contracts"
      relation: derives_from
  modules:
    - "delete-note"
  source_files:
    - "promptnotes/src/lib/domain/__tests__/delete-note"
---

# Verification Architecture: DeleteNote

**Feature**: `delete-note`
**Phase**: 1b
**Revision**: 2
**Mode**: lean
**Source**: `docs/domain/workflows.md` Workflow 5 (lines 467–555), `docs/domain/code/ts/src/curate/workflows.ts`, `docs/domain/code/ts/src/curate/stages.ts`, `docs/domain/code/ts/src/curate/ports.ts`, `docs/domain/code/ts/src/curate/internal-events.ts`, `docs/domain/code/ts/src/curate/aggregates.ts`, `docs/domain/code/ts/src/curate/read-models.ts`, `docs/domain/code/ts/src/shared/snapshots.ts`, `docs/domain/code/ts/src/shared/events.ts`, `docs/domain/code/ts/src/shared/errors.ts`, `docs/domain/code/ts/src/simulations/08_delete_note.spec.ts`

---

## Revision 2 Changes

This revision addresses all 6 findings from the Phase 1c iter-1 verdict.

- **FIND-SPEC-DLN-001 (BLOCKER)**: Purity Boundary Map updated: `updateProjectionsAfterDelete` is now strictly **pure core** — no port calls. The contradictory docstring ("emits `deps.publishInternal`") is removed from the Port Contract. The `TagInventoryUpdated` emission is now shown as an orchestrator step (Effectful shell row) that executes after `updateProjectionsAfterDelete` returns. PROP-DLN-016 (NEW, Tier 2, required: true) asserts that `updateProjectionsAfterDelete` invokes no port (verified by spy call-count === 0 on `publishInternal` within the function body).

- **FIND-SPEC-DLN-002 (BLOCKER)**: PROP-DLN-006(c) exhaustiveness switch now includes an arm for `FsError.kind === 'disk-full'` (maps to `'unknown'`). PROP-DLN-017 (NEW, Tier 2, required: true) asserts that the `disk-full → 'unknown'` normalization mapping is total (no unhandled `disk-full` path exists) and that `NoteDeletionFailed.detail === 'disk-full'` when the source error is `disk-full`.

- **FIND-SPEC-DLN-003 (MAJOR)**: PROP-DLN-002(c) reworded from "when both pass" to "when all three preconditions hold" (`editingCurrentNoteId !== noteId` AND `Feed.hasNote` AND `snapshot !== null`). Bullet (d) added: `snapshot === null` alone (with `Feed.hasNote` returning true) produces `Err({ kind: 'not-in-feed', cause: 'snapshot-missing' })` (see Delta 6 in behavioral-spec.md).

- **FIND-SPEC-DLN-004 (MAJOR)**: PROP-DLN-010 updated: `removedTags` enumerates all tags from `frontmatter.tags` whose `usageCount` was decremented (not only those pruned to zero). The property test verifies both the decrement-to-zero pruning case and the decrement-without-pruning case.

- **FIND-SPEC-DLN-005 (MINOR)**: PROP-DLN-002(d) (bullet within PROP-DLN-002) asserts the `snapshot-missing` cause field. Port Contract for `authorizeDeletionPure` updated to reflect the three-branch outcome including `cause: 'snapshot-missing'`.

- **FIND-SPEC-DLN-006 (MINOR)**: PROP-DLN-018 (NEW, Tier 2, required: false) asserts `FsError.unknown.detail` propagation to `NoteDeletionFailed.detail`. The `EventBusPublish` Port Contract note updated to state the `detail` propagation requirement.

---

## Purity Boundary Map

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Step 1 | `authorizeDeletion` | **Effectful shell (read)** | Calls `deps.getNoteSnapshot(noteId)` (in-memory read port) to source the snapshot's `frontmatter`. Reads `editingCurrentNoteId` and `feed` from the outer-curry closure. Synchronous. Returns `Result<AuthorizedDeletion, DeletionError>`. |
| Step 1 (pure core) | `authorizeDeletionPure` | **Pure core — proof target** | `(noteId: NoteId, editingCurrentNoteId: NoteId | null, feed: Feed, snapshot: NoteFileSnapshot | null) => Result<AuthorizedDeletion, DeletionError>`. Deterministic given fixed inputs. No ports. The authorization decision logic in isolation. Property-test and formal-proof target. |
| Step 2 | `buildDeleteNoteRequested` | **Pure core** | `(authorized: AuthorizedDeletion, now: Timestamp) => DeleteNoteRequested`. Pure construction. No clock call (uses pre-obtained `now`). Canonical signature from `workflows.ts:99-102`. |
| Step 3 | `trashFile` | **Effectful shell (I/O, async)** | OS trash write. Async (`Promise`). Returns `Result<void, FsError>`. Non-deterministic (filesystem, OS). The only `await` point in the workflow. |
| Step 4 | `updateProjectionsAfterDelete` | **Pure core** | `(feed: Feed, inventory: TagInventory, event: NoteFileDeleted) => UpdatedProjection`. Calls `Feed.removeNoteRef(feed, event.noteId)` and `TagInventory.applyNoteDeleted(inventory, event.frontmatter, event.occurredOn)`. Sources `now` from `event.occurredOn`. Returns new immutable `UpdatedProjection`. **Does NOT call any port.** Does NOT emit `TagInventoryUpdated`. Does NOT call `deps.publishInternal`. |
| Orchestrator (after Step 4) | event emission | **Effectful shell** | After `updateProjectionsAfterDelete` returns `UpdatedProjection`, the orchestrator inspects `removedTags` and calls `deps.publishInternal(TagInventoryUpdated)` when `removedTags.length > 0`. Also calls `deps.publish(NoteFileDeleted)` on the success path, or `deps.publish(NoteDeletionFailed)` on the error path. |

**Formally verifiable core (pure functions)**:
- `authorizeDeletionPure` — the authorization decision logic (primary proof target)
- `buildDeleteNoteRequested` — event construction
- `updateProjectionsAfterDelete` — projection delta computation (Feed removal + TagInventory decrement); no port invocations

**Effectful shell**:
- `authorizeDeletion` orchestration wrapper (reads `getNoteSnapshot`)
- `trashFile` (write I/O, async)
- `deps.publish` (public event bus) — orchestrator calls this
- `deps.publishInternal` (internal event bus) — orchestrator calls this after Step 4

**Relationship between `authorizeDeletion` and `authorizeDeletionPure`**:
```typescript
// Pure core (proof target)
type AuthorizeDeletionPure = (
  noteId: NoteId,
  editingCurrentNoteId: NoteId | null,
  feed: Feed,
  snapshot: NoteFileSnapshot | null,
) => Result<AuthorizedDeletion, DeletionError>;
// Three-branch outcome:
//   (a) editingCurrentNoteId === noteId → Err({ kind: 'editing-in-progress' })
//   (b) !Feed.hasNote(feed, noteId)     → Err({ kind: 'not-in-feed' })
//   (c) snapshot === null               → Err({ kind: 'not-in-feed', cause: 'snapshot-missing' })
//   (d) all pass                        → Ok(AuthorizedDeletion { frontmatter: snapshot.frontmatter })

// Effectful shell (canonical — matches workflows.ts:83-89)
type AuthorizeDeletion = (
  deps: CurateDeps,
  feed: Feed,
  editingCurrentNoteId: NoteId | null,
) => (confirmed: DeletionConfirmed) => Result<AuthorizedDeletion, DeletionError>;

// Implementation relationship:
// authorizeDeletion := (deps, feed, editingCurrentNoteId) => (confirmed) =>
//   authorizeDeletionPure(confirmed.noteId, editingCurrentNoteId, feed, deps.getNoteSnapshot(confirmed.noteId))
```

---

## Port Contracts

```typescript
// ── ClockNow ───────────────────────────────────────────────────────────
/** Returns the current wall-clock time as a Timestamp.
 *  Called at most ONCE per workflow invocation:
 *    - called in the orchestrator after authorizeDeletion succeeds
 *    - threaded through DeleteNoteRequested.occurredOn,
 *      NoteFileDeleted.occurredOn (or NoteDeletionFailed.occurredOn),
 *      TagInventoryUpdated.occurredOn
 *  Never called on authorization-error paths.
 *  Budget: max 1 call per invocation. */
type ClockNow = () => Timestamp;

// ── GetNoteSnapshot ─────────────────────────────────────────────────────
/** Returns the latest in-memory NoteFileSnapshot for the given NoteId,
 *  or null if the note is not in the Curate snapshot store.
 *  Used by authorizeDeletion to source the frontmatter for AuthorizedDeletion.
 *  NoteFileSnapshot.filePath is the argument passed to trashFile. */
type GetNoteSnapshot = (noteId: NoteId) => NoteFileSnapshot | null;

// ── GetAllSnapshots (reused from TagChipUpdate — TCU originator) ───────
/** Returns all in-memory NoteFileSnapshots held by Curate.
 *  Included in DeleteNoteDeps for structural consistency with TagChipUpdateDeps.
 *  Not called in the current DeleteNote implementation (no refreshSort step).
 *  Delta: originally declared as contract delta by TagChipUpdate. */
type GetAllSnapshots = () => readonly NoteFileSnapshot[];

// ── TrashFile (NEW — contract delta to ports.ts) ───────────────────────
/** Moves the file at the given path to the OS trash. Async.
 *  On success: returns Ok(void).
 *  On failure: returns Err(FsError).
 *  FsError variants structurally producible: permission, lock, not-found, unknown, disk-full.
 *  disk-full is normalized to NoteDeletionFailureReason 'unknown' by the orchestrator
 *  (see REQ-DLN-013 and PROP-DLN-017); it is NOT filtered at the port boundary.
 *  The filePath argument is sourced from NoteFileSnapshot.filePath obtained during
 *  authorizeDeletion (deps.getNoteSnapshot(noteId).filePath).
 *  Analogous to WriteMarkdown declared for TagChipUpdate.
 *  Delta: declare and export TrashFile in docs/domain/code/ts/src/curate/ports.ts. */
type TrashFile = (filePath: string) => Promise<Result<void, FsError>>;

// ── EventBusPublish ────────────────────────────────────────────────────
/** Publish a PublicDomainEvent to the event bus.
 *  Called by the ORCHESTRATOR (not by updateProjectionsAfterDelete).
 *  Call sequence:
 *    1. DeleteNoteRequested — before the trash attempt.
 *    2. NoteFileDeleted — on the success path (happy or not-found graceful path).
 *       OR NoteDeletionFailed — on the permission/lock/disk-full/unknown error path.
 *  NOT called on authorization-error paths.
 *  detail propagation: when NoteDeletionFailed.reason === 'unknown',
 *    NoteDeletionFailed.detail === FsError.detail (when source is FsError.unknown)
 *    or 'disk-full' (when source is FsError.disk-full). */
type EventBusPublish = (event: PublicDomainEvent) => void;

// ── EventBusPublishInternal (reused from TagChipUpdate — TCU originator) ─
/** Publish a CurateInternalEvent to the internal event bus.
 *  Called by the ORCHESTRATOR after updateProjectionsAfterDelete returns UpdatedProjection,
 *  ONLY when removedTags.length > 0.
 *  NOT called by updateProjectionsAfterDelete itself.
 *  NOT called on error paths or when the deleted note has no tags.
 *  Delta: originally declared as contract delta by TagChipUpdate. */
type EventBusPublishInternal = (event: CurateInternalEvent) => void;

// ── DeleteNoteDeps (NEW — contract delta to ports.ts) ─────────────────
/** Superset of CurateDeps required by DeleteNote workflow.
 *  Structural guarantee: does NOT include any editor-buffer key
 *  (no getEditorBuffer, no editingState). The only Capture-side input is
 *  the read-only editingCurrentNoteId: NoteId | null outer-curry argument.
 *  GetAllSnapshots and EventBusPublishInternal are reused from TagChipUpdate (TCU originator). */
type DeleteNoteDeps = CurateDeps & {
  /** OS trash write port. Async. NEW for this workflow. */
  readonly trashFile: TrashFile;
  /** Full snapshot collection (structural consistency with TagChipUpdateDeps;
   *  not called in current implementation). */
  readonly getAllSnapshots: GetAllSnapshots;
  /** Internal event bus for CurateInternalEvent (TagInventoryUpdated).
   *  Called by the orchestrator after Step 4 returns; NOT by updateProjectionsAfterDelete. */
  readonly publishInternal: EventBusPublishInternal;
};

// ── authorizeDeletionPure (pure core — proof target) ──────────────────
/** Pure internal helper. Performs the authorization decision given
 *  the concrete data it needs (no port calls).
 *  Deterministic: same inputs always produce same output.
 *  Three-precondition guard (FIND-SPEC-DLN-003):
 *    (a) editingCurrentNoteId === noteId
 *        → Err(DeletionError { kind: 'authorization', reason: { kind: 'editing-in-progress' } })
 *    (b) !Feed.hasNote(feed, noteId)
 *        → Err(DeletionError { kind: 'authorization', reason: { kind: 'not-in-feed' } })
 *    (c) snapshot === null (Feed.hasNote returned true but snapshot is absent)
 *        → Err(DeletionError { kind: 'authorization', reason: { kind: 'not-in-feed', cause: 'snapshot-missing' } })
 *    (d) all three preconditions hold
 *        → Ok(AuthorizedDeletion { frontmatter: snapshot.frontmatter }) */
type AuthorizeDeletionPure = (
  noteId: NoteId,
  editingCurrentNoteId: NoteId | null,
  feed: Feed,
  snapshot: NoteFileSnapshot | null,
) => Result<AuthorizedDeletion, DeletionError>;

// ── AuthorizeDeletion (canonical effectful shell) ─────────────────────
/** Canonical shape from workflows.ts:83-89. Effectful shell that wraps
 *  authorizeDeletionPure: calls deps.getNoteSnapshot(confirmed.noteId) to
 *  obtain the snapshot, then delegates to the pure core. */
type AuthorizeDeletion = (
  deps: CurateDeps,
  feed: Feed,
  editingCurrentNoteId: NoteId | null,
) => (confirmed: DeletionConfirmed) => Result<AuthorizedDeletion, DeletionError>;
// authorizeDeletion := (deps, feed, editingCurrentNoteId) => (confirmed) =>
//   authorizeDeletionPure(confirmed.noteId, editingCurrentNoteId, feed, deps.getNoteSnapshot(confirmed.noteId))

// ── BuildDeleteNoteRequested (pure core — canonical, no widening needed) ─
/** Constructs a DeleteNoteRequested from an AuthorizedDeletion and
 *  the pre-obtained now. Canonical signature from workflows.ts:99-102.
 *  Already fully pure (no deps curry, explicit now). No widening required.
 *  This matches the Delta 5 pattern established by TagChipUpdate's
 *  BuildTagChipSaveRequest. */
type BuildDeleteNoteRequested = (
  authorized: AuthorizedDeletion,
  now: Timestamp,
) => DeleteNoteRequested;

// ── UpdateProjectionsAfterDelete (pure core — no port calls) ──────────
/** Updates the Feed and TagInventory read models after a note is deleted
 *  (either successfully trashed or gracefully handled on not-found).
 *  Returns a new UpdatedProjection with new immutable Feed and TagInventory instances.
 *  Pure function: same inputs always produce same outputs. NO port invocations.
 *  Does NOT call deps.publishInternal. Does NOT emit TagInventoryUpdated.
 *  The ORCHESTRATOR is responsible for calling deps.publishInternal after this
 *  function returns, when removedTags.length > 0.
 *  Shape: (feed: Feed, inventory: TagInventory, event: NoteFileDeleted) => UpdatedProjection.
 *  (No deps curry — pure function receives only the data it needs.)
 *  Sources now from event.occurredOn (equals the workflow's single Clock.now()
 *  call by the occurredOn threading invariant).
 *  Calls Feed.removeNoteRef(feed, event.noteId) and
 *  TagInventory.applyNoteDeleted(inventory, event.frontmatter, event.occurredOn).
 *  NOT called on any fs-error path (permission, lock, disk-full, unknown); caller must guard.
 *  IS called on the not-found graceful path (per REQ-DLN-005). */
type UpdateProjectionsAfterDelete = (
  feed: Feed,
  inventory: TagInventory,
  event: NoteFileDeleted,
) => UpdatedProjection;
```

---

## Proof Obligations

| ID | Description | Covers REQ | Tier | Required | Tool |
|----|-------------|-----------|------|----------|------|
| PROP-DLN-001 | `authorizeDeletionPure` is pure: given identical `(NoteId, NoteId|null, Feed, NoteFileSnapshot|null)` inputs, always returns identical `Result<AuthorizedDeletion, DeletionError>` — referentially transparent | REQ-DLN-001, REQ-DLN-002, REQ-DLN-003 | 1 | **true** | fast-check: ∀ (noteId, editingId, feed, snapshot), `authorizeDeletionPure(...)` deepEquals `authorizeDeletionPure(...)` |
| PROP-DLN-002 | `authorizeDeletionPure` authorization rules: (a) when `editingCurrentNoteId === noteId`, returns `Err({ kind: 'authorization', reason: { kind: 'editing-in-progress' } })`; (b) when `!Feed.hasNote(feed, noteId)`, returns `Err({ kind: 'authorization', reason: { kind: 'not-in-feed' } })` with no `cause`; (c) when `Feed.hasNote` is true but `snapshot === null`, returns `Err({ kind: 'authorization', reason: { kind: 'not-in-feed', cause: 'snapshot-missing' } })`; (d) when all three preconditions hold (`editingCurrentNoteId !== noteId` AND `Feed.hasNote` AND `snapshot !== null`), returns `Ok(AuthorizedDeletion { frontmatter: snapshot.frontmatter })` | REQ-DLN-002, REQ-DLN-003 | 2 | **true** | Example-based tests for each authorization outcome (four cases); verify `AuthorizedDeletion.frontmatter === snapshot.frontmatter` on the Ok path; verify `cause: 'snapshot-missing'` on the snapshot-null path |
| PROP-DLN-003 | Save-failure projection isolation: when `trashFile` returns `Err(FsError)` where `kind ∈ { 'permission', 'lock', 'disk-full', 'unknown' }`, `Feed.removeNoteRef`, `TagInventory.applyNoteDeleted`, `deps.publishInternal`, and `updateProjectionsAfterDelete` are NOT called; Feed and TagInventory remain as the immutable inputs | REQ-DLN-004, REQ-DLN-013 | 2 | **true** | Example-based test: trashFile stub returns Err for each variant (including disk-full); verify spy.callCount === 0 for all three and workflow returns Err |
| PROP-DLN-004 | `frontmatter` sourcing invariant: `AuthorizedDeletion.frontmatter` always equals `deps.getNoteSnapshot(noteId).frontmatter` (the Curate snapshot at authorization time). `NoteFileDeleted.frontmatter === AuthorizedDeletion.frontmatter`. | REQ-DLN-006 | 1 | **true** | fast-check: ∀ valid (noteId, feed, snapshot), `authorizeDeletionPure(...)` returns `Ok(auth)` where `auth.frontmatter deepEquals snapshot.frontmatter` |
| PROP-DLN-005 | `occurredOn` threading invariant: `DeleteNoteRequested.occurredOn === NoteFileDeleted.occurredOn === TagInventoryUpdated.occurredOn === now` by construction. `updateProjectionsAfterDelete` sources `now` from `event.occurredOn` without a second Clock call. | REQ-DLN-007, REQ-DLN-008 | 2 | **true** | Example-based test: instrument the workflow with a fixed `now` stub; after a happy-path run, assert all three timestamps equal the same `Timestamp` instance; verify `clockNow.callCount === 1` |
| PROP-DLN-006 | Error discriminator exhaustiveness: (a) TypeScript switch over `DeletionError.kind` with `never` branch compiles; (b) switch over `AuthorizationError.kind` with `never` branch compiles; (c) switch over `FsError.kind` within the `DeletionError.kind === 'fs'` branch compiles — including explicit arms for `'permission'`, `'lock'`, `'not-found'`, `'disk-full'`, and `'unknown'` (no `never` arm may silently absorb `disk-full`) | REQ-DLN-002, REQ-DLN-003, REQ-DLN-004, REQ-DLN-013 | 0 | **true** | TypeScript type-level: `_IsNever` exhaustiveness pattern; compile-time enforcement; the `disk-full` arm must be explicit (FIND-SPEC-DLN-002) |
| PROP-DLN-007 | Non-coupling type assertion: `keyof DeleteNoteDeps` does not include any editor-buffer key. Specifically `'getEditorBuffer' extends keyof DeleteNoteDeps` is `false`; `'editingState' extends keyof DeleteNoteDeps` is `false`. | REQ-DLN-011 | 0 | **true** | TypeScript type assertion: structural guarantee enforced by the type shape itself |
| PROP-DLN-008 | `not-found` graceful path: when `trashFile` returns `Err({ kind: 'not-found' })`, the workflow calls `updateProjectionsAfterDelete`, emits `NoteFileDeleted` (not `NoteDeletionFailed`), and returns `Ok(UpdatedProjection)` | REQ-DLN-005 | 2 | false | Example-based test: trashFile stub returns `Err({ kind: 'not-found' })`; verify `NoteFileDeleted` emitted, `NoteDeletionFailed` NOT emitted, projections updated, `Ok(UpdatedProjection)` returned |
| PROP-DLN-009 | Happy-path full pipeline: `Ok(UpdatedProjection)` returned, `Feed.noteRefs` does not contain `noteId`, `TagInventory` reflects decrements, `DeleteNoteRequested` emitted before trash, `NoteFileDeleted` emitted after | REQ-DLN-001, REQ-DLN-012 | 2 | false | Example-based test with port fakes; verify projection contents and event emission order |
| PROP-DLN-010 | `TagInventoryUpdated` emission rule and `removedTags` semantics: (a) emitted exactly once (by orchestrator) when `frontmatter.tags.length > 0`; NOT emitted when `frontmatter.tags.length === 0`; (b) `removedTags` enumerates all tags from `frontmatter.tags` whose `usageCount` was decremented — both pruned-to-zero and decremented-without-pruning tags are included; (c) `updateProjectionsAfterDelete` does NOT call `deps.publishInternal` | REQ-DLN-010 | 2 | false | Example-based tests: (a) note with tags (usageCount: 1) → `publishInternal` called once with `removedTags` containing the tag, entry absent from `TagInventory.entries`; (b) note with tags (usageCount: 5) → `publishInternal` called once with `removedTags` containing the tag, entry still in `TagInventory.entries` with usageCount: 4; (c) note without tags → `publishInternal` NOT called; (d) call `updateProjectionsAfterDelete` in isolation and verify `publishInternal` spy is never invoked |
| PROP-DLN-011 | Clock budget: `clockNow` called 0 times on authorization-error paths (`editing-in-progress`, `not-in-feed`); called exactly 1 time on all write paths (happy, not-found graceful, fs-error variants including disk-full) | REQ-DLN-008 | 2 | false | Example-based tests with spy wrapper: verify `clockNow.callCount` for each path; spy paths: editing-in-progress=0, not-in-feed=0, snapshot-missing=0, happy=1, not-found=1, permission=1, lock=1, disk-full=1, unknown=1 |
| PROP-DLN-012 | `updateProjectionsAfterDelete` is pure: same `(Feed, TagInventory, NoteFileDeleted)` inputs always produce same `UpdatedProjection` (no deps curry; `now` sourced from `event.occurredOn`) | REQ-DLN-012 | 1 | false | fast-check: ∀ (feed, inventory, event), `fn(feed, inventory, event)` deepEquals `fn(feed, inventory, event)` |
| PROP-DLN-013 | Event channel membership: `DeleteNoteRequested`, `NoteFileDeleted`, `NoteDeletionFailed` ∈ `PublicDomainEvent`; `TagInventoryUpdated` ∈ `CurateInternalEvent` and NOT ∈ `PublicDomainEvent` | REQ-DLN-009 | 0 | false | TypeScript type assertions: `Extract<PublicDomainEvent, { kind: 'delete-note-requested' }>` is non-never; `Extract<CurateInternalEvent, { kind: 'tag-inventory-updated' }>` is non-never; `Extract<PublicDomainEvent, { kind: 'tag-inventory-updated' }>` is never |
| PROP-DLN-014 | `NoteDeletionFailed.reason` mapping: each `FsError` variant (permission, lock, disk-full, unknown) produces the expected `NoteDeletionFailureReason`; `disk-full` → `'unknown'` (normalization); `unknown` → `'unknown'` | REQ-DLN-004, REQ-DLN-013 | 2 | false | Example-based test: for each `FsError` variant on the error path, verify `NoteDeletionFailed.reason` matches the mapping table; verify `disk-full` arm is explicit in the switch (not falling through a default) |
| PROP-DLN-015 | Full pipeline integration: happy-path and not-found graceful path produce `Ok(UpdatedProjection)` where `noteId` is absent from `UpdatedProjection.feed.noteRefs` and `TagInventory` reflects tag decrements; `DeleteNoteRequested` emitted before `trashFile`, `NoteFileDeleted` emitted after | REQ-DLN-001, REQ-DLN-005, REQ-DLN-012 | 3 | false | Integration test with in-memory port fakes for all `DeleteNoteDeps`; verify `UpdatedProjection` shape, projection contents, event emission order, and spy call counts |
| PROP-DLN-016 | `updateProjectionsAfterDelete` invokes no port: `deps.publishInternal`, `deps.publish`, `deps.clockNow`, `deps.trashFile`, and all other port functions are NOT called within the body of `updateProjectionsAfterDelete` | REQ-DLN-001, REQ-DLN-010, REQ-DLN-012 | 2 | **true** | Example-based test: call `updateProjectionsAfterDelete(feed, inventory, event)` with spy-wrapped fakes for all ports; verify all spy call counts === 0 after the call; this is the primary enforcement for FIND-SPEC-DLN-001 |
| PROP-DLN-017 | `disk-full → 'unknown'` normalization is total: (a) when `FsError.kind === 'disk-full'`, `NoteDeletionFailed.reason === 'unknown'` and `NoteDeletionFailed.detail === 'disk-full'`; (b) the `FsError → NoteDeletionFailureReason` mapping switch has an explicit `'disk-full'` arm (verified by TypeScript exhaustiveness); (c) `updateProjectionsAfterDelete` is NOT called on the `disk-full` path | REQ-DLN-013 | 2 | **true** | Example-based test: trashFile stub returns `Err({ kind: 'disk-full' })`; verify `NoteDeletionFailed { reason: 'unknown', detail: 'disk-full' }` is emitted; verify `updateProjectionsAfterDelete` spy.callCount === 0; Tier-0 companion: TypeScript exhaustiveness check confirms `disk-full` arm exists |
| PROP-DLN-018 | `FsError.unknown.detail` propagation: when `FsError.kind === 'unknown'`, `NoteDeletionFailed.detail === FsError.detail` (exact string propagation; the mandatory `detail: string` on `FsError.unknown` is not silently dropped) | REQ-DLN-004, REQ-DLN-013 | 2 | false | Example-based test: trashFile stub returns `Err({ kind: 'unknown', detail: 'I/O timeout' })`; verify `NoteDeletionFailed.detail === 'I/O timeout'`; fast-check companion: ∀ detail string, propagation holds |

---

## Verification Tiers

- **Tier 0**: TypeScript type-level proof. No runtime test needed; the type system enforces correctness at compile time. Examples: exhaustiveness of discriminated unions, event channel membership, non-coupling structural guarantees, `disk-full` arm presence.
- **Tier 1**: Property-based test with fast-check. Generated random inputs; verifies structural invariants hold for all inputs in the domain.
- **Tier 2**: Example-based unit test (vitest). Concrete inputs and expected outputs; verifies specific scenario behaviors including error paths and spy call counts.
- **Tier 3**: Integration test. Exercises the full pipeline with in-memory port fakes; tests cross-step coordination and end-to-end projection consistency.

Suggested test file layout (Phase 2a planning):
- `promptnotes/src/lib/domain/__tests__/delete-note/authorize-deletion-pure.property.test.ts` — PROP-DLN-001, PROP-DLN-002, PROP-DLN-004
- `promptnotes/src/lib/domain/__tests__/delete-note/delete-note.example.test.ts` — PROP-DLN-003, PROP-DLN-005, PROP-DLN-008, PROP-DLN-009, PROP-DLN-010, PROP-DLN-011, PROP-DLN-014, PROP-DLN-016, PROP-DLN-017, PROP-DLN-018
- `promptnotes/src/lib/domain/__tests__/delete-note/delete-note.types.test.ts` — PROP-DLN-006, PROP-DLN-007, PROP-DLN-013
- `promptnotes/src/lib/domain/__tests__/delete-note/update-projections-after-delete.property.test.ts` — PROP-DLN-012
- `promptnotes/src/lib/domain/__tests__/delete-note/delete-note.integration.test.ts` — PROP-DLN-015

In lean mode, `required: true` is reserved for the highest-risk invariants:
- **PROP-DLN-001** (`authorizeDeletionPure` purity) — the entire pure/effectful boundary for Step 1 depends on this.
- **PROP-DLN-002** (authorization rule correctness) — the three-precondition authorization guard (`editing-in-progress`, `not-in-feed`, `snapshot-missing`) is the primary safety gate.
- **PROP-DLN-003** (save-failure projection isolation) — prevents phantom state updates when the trash fails; state consistency; now covers `disk-full`.
- **PROP-DLN-004** (`frontmatter` sourcing invariant) — TagInventory delta correctness depends on the correct frontmatter source.
- **PROP-DLN-005** (`occurredOn` threading + Clock budget) — causal coherence across all events in this workflow.
- **PROP-DLN-006** (error discriminator exhaustiveness) — ensures all error cases including `disk-full` are handled at compile time.
- **PROP-DLN-007** (non-coupling type assertion) — structural guarantee that the Curate workflow cannot access Capture editor state.
- **PROP-DLN-016** (`updateProjectionsAfterDelete` invokes no port) — primary enforcement for the purity boundary contradiction identified in FIND-SPEC-DLN-001.
- **PROP-DLN-017** (`disk-full → 'unknown'` normalization is total) — prevents `disk-full` from being unhandled despite the structural `FsError` union; primary enforcement for FIND-SPEC-DLN-002.

---

## Coverage Matrix

| Requirement | PROP IDs |
|-------------|---------|
| REQ-DLN-001 | PROP-DLN-001, PROP-DLN-004, PROP-DLN-005, PROP-DLN-009, PROP-DLN-015, PROP-DLN-016 |
| REQ-DLN-002 | PROP-DLN-001, PROP-DLN-002, PROP-DLN-006, PROP-DLN-011 |
| REQ-DLN-003 | PROP-DLN-001, PROP-DLN-002, PROP-DLN-006, PROP-DLN-011 |
| REQ-DLN-004 | PROP-DLN-003, PROP-DLN-006, PROP-DLN-011, PROP-DLN-014, PROP-DLN-018 |
| REQ-DLN-005 | PROP-DLN-005, PROP-DLN-008, PROP-DLN-011, PROP-DLN-015 |
| REQ-DLN-006 | PROP-DLN-004, PROP-DLN-007 |
| REQ-DLN-007 | PROP-DLN-005 |
| REQ-DLN-008 | PROP-DLN-005, PROP-DLN-011 |
| REQ-DLN-009 | PROP-DLN-013 |
| REQ-DLN-010 | PROP-DLN-010, PROP-DLN-016 |
| REQ-DLN-011 | PROP-DLN-007 |
| REQ-DLN-012 | PROP-DLN-009, PROP-DLN-012, PROP-DLN-015, PROP-DLN-016 |
| REQ-DLN-013 | PROP-DLN-003, PROP-DLN-006, PROP-DLN-014, PROP-DLN-017, PROP-DLN-018 |

Every requirement maps to at least one proof obligation. Nine `required: true` obligations (PROP-DLN-001 through PROP-DLN-007, PROP-DLN-016, PROP-DLN-017) cover the highest-risk invariants across Tiers 0–2. Total proof obligations: 18 (PROP-DLN-001 through PROP-DLN-018).
