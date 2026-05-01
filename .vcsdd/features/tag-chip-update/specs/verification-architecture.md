# Verification Architecture: TagChipUpdate

**Feature**: `tag-chip-update`
**Phase**: 1b
**Revision**: 3
**Mode**: lean
**Source**: `docs/domain/workflows.md` Workflow 4, `docs/domain/code/ts/src/curate/workflows.ts`, `docs/domain/code/ts/src/curate/stages.ts`, `docs/domain/code/ts/src/curate/ports.ts`, `docs/domain/code/ts/src/curate/internal-events.ts`, `docs/domain/code/ts/src/curate/read-models.ts`, `docs/domain/code/ts/src/shared/note.ts`, `docs/domain/code/ts/src/shared/value-objects.ts`, `docs/domain/code/ts/src/shared/events.ts`, `docs/domain/code/ts/src/shared/errors.ts`

---

## Revision 3 Changes

This revision addresses all 3 findings from the Phase 1c iter-2 verdict (FIND-SPEC-TCU-021, FIND-SPEC-TCU-022, FIND-SPEC-TCU-023).

- **FIND-021**: Port Contract for `BuildTagChipSaveRequest` updated to the new delta signature `(mutated: MutatedNote, now: Timestamp) => SaveNoteRequested`. The Purity Boundary table entry for Step 3 reflects this. Cross-reference added to behavioral-spec.md Delta 5.
- **FIND-022**: `UpdateProjectionsAfterSave` Port Contract reverted to canonical 3-arg inner shape: `(deps: CurateDeps) => (feed, inventory, event) => IndexedNote`. The 4th positional `now: Timestamp` argument is removed. `now` is sourced from `event.occurredOn` inside the function. The `occurredOn` threading invariant (`now === SaveNoteRequested.occurredOn === NoteFileSaved.occurredOn === TagInventoryUpdated.occurredOn`) is made explicit. PROP-TCU-016 updated to reflect the 3-arg inner form. Purity Boundary table Step 6 updated.
- **FIND-023**: `SaveValidationError.cause` in PROP-TCU-007 per-cause test list now enumerates exactly 3 causes (`note-not-in-feed`, `hydration-failed`, `frontmatter-invariant`). `'tag-vo-invalid'` is removed from the Port Contract discriminator definition. The Tier-0 type assertion in PROP-TCU-012 (`Extract<NoteEditError, { kind: 'tag' }>` is unreachable) is confirmed as the sole enforcement mechanism for the dead `tag` variant.

---

## Revision 2 Changes

- **FIND-001 / FIND-003 / FIND-016**: Purity Boundary Map updated. `applyTagOperation` (canonical) reclassified as **effectful shell (clock)**. `applyTagOperationPure` (internal pure helper) added as **pure core** and the proof target. PROP-TCU-001 updated to target `applyTagOperationPure`.
- **FIND-002 / FIND-014 / FIND-018**: Dead `NoteEditError` variants (`tag`, `duplicate-tag`) removed. PROP-TCU-012 reduced to a single live variant test (`frontmatter.updated-before-created`). Dead-variant Tier-0 type assertion added.
- **FIND-004**: `GetAllSnapshots` port added to Port Contracts. `getAllSnapshots` added to `TagChipUpdateDeps`.
- **FIND-005**: `WriteMarkdown` port anchored to `TagChipUpdateDeps`. Canonical port shape declared.
- **FIND-006**: `EventBusPublishInternal` port added to Port Contracts. `publishInternal` added to `TagChipUpdateDeps`.
- **FIND-007**: `TagChipUpdate` async return type `Promise<Result<IndexedNote, SaveError>>` restated.
- **FIND-008**: `tagsEqualAsSet` predicate defined once in Port Contracts; all PROP-TCU references use it.
- **FIND-009**: `updateProjectionsAfterSave` Port Contract clarified: returns new `IndexedNote` with new immutable `Feed`/`TagInventory` instances.
- **FIND-010**: PROP-TCU-007 refined to assert `SaveValidationError.cause` discriminator (per-cause variant), not just top-level `kind`.
- **FIND-011**: `TagInventoryUpdated.occurredOn` semantic documented in Port Contracts.
- **FIND-012 / FIND-013**: PROP-TCU-015 revised: Clock budget = max 1 call per invocation; idempotent paths = 0 calls.
- **FIND-015**: PROP-TCU-005 updated to assert non-null `previousFrontmatter`. Type-level proof obligation added.
- **FIND-017**: Cross-context Port Contracts section added with `serializeNote` and `writeMarkdown` anchors.
- **FIND-019**: PROP-TCU-020 (NEW) — non-coupling type assertion: `keyof TagChipUpdateDeps` does not include editor-buffer keys.
- Coverage Matrix updated for all new/changed PROP-TCU entries.

---

## Purity Boundary Map

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Step 1 | `loadCurrentNote` | **Effectful shell (read)** | Calls `deps.getNoteSnapshot` (in-memory read port) and `deps.hydrateNote` (ACL adapter). Non-deterministic: depends on mutable in-memory snapshot store. |
| Pre-Step 2 | `tagsEqualAsSet` membership check | **Pure core** | Membership check `command.tag ∈ note.frontmatter.tags`. No ports, no side effects. Idempotency guard. |
| Step 2 (canonical) | `applyTagOperation` | **Effectful shell (clock)** | `(deps: CurateDeps) => (note, command) => Result<MutatedNote, SaveError>`. Internally calls `deps.clockNow()` to obtain `now`, then delegates to `applyTagOperationPure`. Clock-effectful shell wrapping a pure core. |
| Step 2 (pure helper) | `applyTagOperationPure` | **Pure core — proof target** | `(note: Note, command: TagChipCommand, now: Timestamp) => Result<MutatedNote, SaveError>`. Deterministic given fixed inputs. Calls `NoteOps.addTag` or `NoteOps.removeTag`. No ports. Property-test and formal-proof target. |
| Step 3 | `buildTagChipSaveRequest` | **Pure core** | `(mutated: MutatedNote, now: Timestamp) => SaveNoteRequested`. Pure construction. No clock call (uses pre-obtained `now`). |
| Step 4 | `serializeNote` | **Pure core** | `(req: SaveNoteRequested) => SerializedMarkdown`. Markdown serialization. Deterministic. No ports. |
| Step 5 | `writeMarkdown` | **Effectful shell (I/O, async)** | Vault file write. Async (`Promise`). Produces `NoteFileSaved` or `FsError`. Non-deterministic (disk, OS). Only `await` point in the workflow. |
| Step 6 | `updateProjectionsAfterSave` | **Pure core** | `(deps: CurateDeps) => (Feed, TagInventory, NoteFileSaved) => IndexedNote`. Canonical 3-arg inner form. Sources `now` from `event.occurredOn` (equals the workflow's single `Clock.now()` result by the `occurredOn` threading invariant). Calls `FeedOps.refreshSort(feed, deps.getAllSnapshots())` and `TagInventoryOps.applyNoteFrontmatterEdited`. Returns new immutable `Feed`/`TagInventory` instances (functional update, no mutation). |

**Formally verifiable core (pure functions)**:
- `applyTagOperationPure` — tag mutation logic (primary proof target)
- `tagsEqualAsSet` membership check — idempotency guard
- `buildTagChipSaveRequest` — save request construction
- `serializeNote` — Markdown serialization
- `updateProjectionsAfterSave` — projection delta computation

**Effectful shell**:
- `loadCurrentNote` (read I/O — `getNoteSnapshot`, `hydrateNote`)
- `applyTagOperation` canonical wrapper (clock — delegates to `applyTagOperationPure`)
- `writeMarkdown` (write I/O, async)
- `deps.publish` (public event bus)
- `deps.publishInternal` (internal event bus)

**Relationship between `applyTagOperation` and `applyTagOperationPure`**:
```typescript
// Pure core (proof target)
type ApplyTagOperationPure = (
  note: Note,
  command: TagChipCommand,
  now: Timestamp,
) => Result<MutatedNote, SaveError>;

// Effectful shell (canonical — matches workflows.ts:61-66)
type ApplyTagOperation = (deps: CurateDeps) => (
  note: Note,
  command: TagChipCommand,
) => Result<MutatedNote, SaveError>;

// Implementation relationship:
// applyTagOperation := (deps) => (note, command) =>
//   applyTagOperationPure(note, command, deps.clockNow())
```

---

## Port Contracts

```typescript
// ── ClockNow ───────────────────────────────────────────────────────────
/** Returns the current wall-clock time as a Timestamp.
 *  Called at most ONCE per workflow invocation:
 *    - called up-front in the orchestrator after the non-idempotent path is confirmed
 *    - threaded through applyTagOperationPure, SaveNoteRequested.occurredOn,
 *      TagInventoryUpdated.occurredOn
 *  Never called on not-found, hydration-fail, or idempotent paths.
 *  Budget: max 1 call per invocation. */
type ClockNow = () => Timestamp;

// ── tagsEqualAsSet (canonical predicate) ─────────────────────────────
/** Canonical tag-set equality predicate used for idempotency checks.
 *  Set-semantic: order-independent.
 *  a.length === b.length ∧ ∀t∈a, b.includes(t)
 *  All "identical tag set", "unchanged tags", and "tag-set equality"
 *  references in this spec resolve to this predicate. */
type TagsEqualAsSet = (a: readonly Tag[], b: readonly Tag[]) => boolean;
// := (a, b) => a.length === b.length && a.every(t => b.includes(t))

// ── GetNoteSnapshot ────────────────────────────────────────────────────
/** Returns the latest in-memory NoteFileSnapshot for the given NoteId,
 *  or null if the note is not in the Curate snapshot store.
 *  Null return is a programming-error signal (tag chip only fires for feed notes). */
type GetNoteSnapshot = (noteId: NoteId) => NoteFileSnapshot | null;

// ── GetAllSnapshots (NEW — contract delta to ports.ts) ────────────────
/** Returns all in-memory NoteFileSnapshots held by Curate.
 *  Required by FeedOps.refreshSort(feed, snapshots).
 *  Delta: add to CurateDeps and export from docs/domain/code/ts/src/curate/ports.ts */
type GetAllSnapshots = () => readonly NoteFileSnapshot[];

// ── HydrateNote ────────────────────────────────────────────────────────
/** Pure ACL adapter. Converts a NoteFileSnapshot to a Note aggregate.
 *  Returns Err(HydrationFailureReason) only on programming error / data corruption.
 *  For snapshots already in the Curate feed, this should always return Ok. */
type HydrateNote = (
  snapshot: NoteFileSnapshot,
) => Result<Note, HydrationFailureReason>;

// ── WriteMarkdown (Vault save port — NEW on TagChipUpdateDeps) ────────
/** Writes the serialized Note to the Vault filesystem. Async.
 *  On success: returns Ok(NoteFileSaved).
 *  On failure: returns Err(FsError).
 *  The port is responsible for populating NoteFileSaved.previousFrontmatter
 *  from the SaveNoteRequested.previousFrontmatter field it receives.
 *  In TagChipUpdate, previousFrontmatter is always non-null (sourced from
 *  MutatedNote.previousFrontmatter which is never null).
 *  Delta: declare and export WriteMarkdown in docs/domain/code/ts/src/curate/ports.ts.
 *  Phase 2 injects the same Vault adapter instance as CaptureAutoSave. */
type WriteMarkdown = (
  request: SaveNoteRequested,
) => Promise<Result<NoteFileSaved, FsError>>;

// ── SerializeNote (pure — NEW contract delta) ─────────────────────────
/** Pure function: serializes a SaveNoteRequested into a Markdown string
 *  with YAML frontmatter.
 *  Delta: declare and export SerializeNote type in curate/ports.ts.
 *  SerializedMarkdown is a string alias for the full YAML-frontmatter + body string. */
type SerializeNote = (req: SaveNoteRequested) => SerializedMarkdown;
type SerializedMarkdown = string;

// ── EventBusPublish ────────────────────────────────────────────────────
/** Publish a PublicDomainEvent to the event bus.
 *  Called once with NoteFileSaved on the happy path.
 *  Called once with NoteSaveFailed on the save-failure path.
 *  NOT called on idempotent no-op paths or pre-write error paths. */
type EventBusPublish = (event: PublicDomainEvent) => void;

// ── EventBusPublishInternal (NEW — contract delta to ports.ts) ────────
/** Publish a CurateInternalEvent to the internal event bus.
 *  Called once with TagInventoryUpdated on the happy path.
 *  NOT called on idempotent, error, or save-failure paths.
 *  Delta: add to CurateDeps (or TagChipUpdateDeps) and export from ports.ts */
type EventBusPublishInternal = (event: CurateInternalEvent) => void;

// ── TagChipUpdateDeps (NEW — contract delta to ports.ts) ──────────────
/** Superset of CurateDeps required by TagChipUpdate workflow.
 *  Structural guarantee: does NOT include any editor-buffer key
 *  (no getEditorBuffer, no editingState). This is enforced by the type shape
 *  itself — the workflow cannot access Capture editor state by construction. */
type TagChipUpdateDeps = CurateDeps & {
  readonly writeMarkdown: WriteMarkdown;
  readonly getAllSnapshots: GetAllSnapshots;
  readonly publishInternal: EventBusPublishInternal;
};

// ── applyTagOperationPure (pure core — proof target) ──────────────────
/** Pure internal helper. Applies the TagChipCommand to the Note using the
 *  provided timestamp. Deterministic: same inputs always produce same output.
 *  Returns Ok(MutatedNote) on success (including the idempotent no-op case
 *  reached via this path after pre-check on the non-idempotent branch),
 *  or Err(SaveError { kind: 'validation', cause: 'frontmatter-invariant' })
 *  if addTag returns NoteEditError { kind: 'frontmatter', reason: { kind: 'updated-before-created' } }.
 *  Dead Err variants: TagError (pre-validated Tag brand), duplicate-tag (addTag idempotent). */
type ApplyTagOperationPure = (
  note: Note,
  command: TagChipCommand,
  now: Timestamp,
) => Result<MutatedNote, SaveError>;

// ── applyTagOperation (canonical effectful shell) ─────────────────────
/** Canonical shape from workflows.ts:61-66. Effectful shell that wraps
 *  applyTagOperationPure: calls deps.clockNow() to obtain now, then
 *  delegates. The clock call IS the only side effect here. */
type ApplyTagOperation = (deps: CurateDeps) => (
  note: Note,
  command: TagChipCommand,
) => Result<MutatedNote, SaveError>;
// applyTagOperation := (deps) => (n, c) => applyTagOperationPure(n, c, deps.clockNow())

// ── buildTagChipSaveRequest (pure core — Delta 5) ─────────────────────
/** Constructs a SaveNoteRequested from a MutatedNote and the pre-obtained now.
 *  Delta from canonical (workflows.ts:68-70): drops the (deps: CurateDeps) =>
 *  curry and adds explicit now: Timestamp. Makes the function fully pure (no
 *  Clock call, no ports). now is threaded from the orchestrator's single
 *  Clock.now() call; without this delta the canonical curried form would imply
 *  a second clockNow() call, violating the single-Clock budget.
 *  See behavioral-spec.md Delta 5. */
type BuildTagChipSaveRequest = (
  mutated: MutatedNote,
  now: Timestamp,
) => SaveNoteRequested;

// ── updateProjectionsAfterSave (pure core — canonical 3-arg inner form) ─
/** Updates the Feed and TagInventory read models after a successful disk write.
 *  Returns a new IndexedNote with new immutable Feed and TagInventory instances.
 *  Canonical shape (matches workflows.ts:123-129): (deps: CurateDeps) => (feed, inventory, event) => IndexedNote.
 *  Sources now from event.occurredOn (which equals the workflow's single Clock.now() call by
 *  the occurredOn threading invariant: now === SaveNoteRequested.occurredOn
 *  === NoteFileSaved.occurredOn === TagInventoryUpdated.occurredOn by construction).
 *  Calls FeedOps.refreshSort(feed, deps.getAllSnapshots()) and
 *  TagInventoryOps.applyNoteFrontmatterEdited(inventory, before, after, event.occurredOn).
 *  NOT called on any error path; caller must guard.
 *  TagInventoryUpdated.occurredOn = event.occurredOn: same Timestamp as the workflow's
 *  single Clock call — coherent single moment in the event log. Deliberate design choice. */
type UpdateProjectionsAfterSave = (
  deps: CurateDeps,
) => (
  feed: Feed,
  inventory: TagInventory,
  event: NoteFileSaved,
) => IndexedNote;
```

---

## Proof Obligations

| ID | Description | Covers REQ | Tier | Required | Tool |
|----|-------------|-----------|------|----------|------|
| PROP-TCU-001 | `applyTagOperationPure` is pure: given identical `(Note, TagChipCommand, Timestamp)` inputs, always returns identical `Result<MutatedNote, SaveError>` — referentially transparent | REQ-TCU-001, REQ-TCU-002, REQ-TCU-012 | 1 | **true** | fast-check: ∀ (note, command, ts), `applyTagOperationPure(note, command, ts)` deepEquals `applyTagOperationPure(note, command, ts)` |
| PROP-TCU-002 | Idempotent add: when `command.tag ∈ note.frontmatter.tags`, `applyTagOperationPure` returns `Ok(MutatedNote)` where `tagsEqualAsSet(mutated.note.frontmatter.tags, mutated.previousFrontmatter.tags) === true` | REQ-TCU-003 | 1 | **true** | fast-check: ∀ note with tag present, add-command → `tagsEqualAsSet` holds on MutatedNote |
| PROP-TCU-003 | Idempotent remove: when `command.tag ∉ note.frontmatter.tags`, `applyTagOperationPure` returns `Ok(MutatedNote)` where `tagsEqualAsSet(mutated.note.frontmatter.tags, mutated.previousFrontmatter.tags) === true` | REQ-TCU-004 | 1 | **true** | fast-check: ∀ note without tag, remove-command → `tagsEqualAsSet` holds on MutatedNote |
| PROP-TCU-004 | No-op short-circuit: when pre-check is true (add of present tag OR remove of absent tag), `writeMarkdown`, `deps.publish`, `deps.publishInternal`, and `updateProjectionsAfterSave` are NOT invoked, and `Clock.now()` is NOT called | REQ-TCU-003, REQ-TCU-004, REQ-TCU-012 | 2 | **true** | Example-based test with spy ports: verify all spy.callCount === 0 when pre-check triggers short-circuit |
| PROP-TCU-005 | `previousFrontmatter` sourcing and non-null: `MutatedNote.previousFrontmatter` always equals the `Note.frontmatter` passed into `applyTagOperationPure` (pre-mutation frontmatter). `NoteFileSaved.previousFrontmatter` is always non-null in this workflow. | REQ-TCU-009 | 1 | **true** | fast-check: ∀ (note, command, ts), `Ok(MutatedNote).previousFrontmatter` deepEquals `note.frontmatter`; Tier-0: type assertion `Exclude<NoteFileSaved['previousFrontmatter'], null>` is `Frontmatter` for events emitted by this workflow |
| PROP-TCU-006 | Save-failure projection isolation: when `writeMarkdown` returns `Err(FsError)`, `FeedOps.refreshSort`, `TagInventoryOps.applyNoteFrontmatterEdited`, and `deps.publishInternal` are NOT called; Feed and TagInventory remain as the immutable inputs | REQ-TCU-008 | 2 | **true** | Example-based test: writeMarkdown stub returns Err; verify spy.callCount === 0 for all three |
| PROP-TCU-007 | `SaveError` + `SaveValidationError.cause` exhaustiveness: (a) TypeScript switch over `SaveError.kind` with `never` branch compiles; (b) switch over `SaveValidationError.cause` when `kind === 'invariant-violated'` with `never` branch compiles; (c) per-cause variant tests: inject conditions for `note-not-in-feed`, `hydration-failed`, `frontmatter-invariant` and assert each produces the correct `cause` discriminator | REQ-TCU-005, REQ-TCU-006, REQ-TCU-007, REQ-TCU-008 | 0+2 | **true** | TypeScript type-level: `_IsNever` exhaustiveness pattern; Example-based tests per cause variant |
| PROP-TCU-008 | Happy-path add: full pipeline returns `Ok(IndexedNote)` with `tagInventory` containing the added tag | REQ-TCU-001, REQ-TCU-010 | 2 | false | Example-based test with port fakes; verify `IndexedNote.tagInventory.entries` includes tag |
| PROP-TCU-009 | Happy-path remove: full pipeline returns `Ok(IndexedNote)` with `tagInventory` not containing the removed tag (when usageCount was 1) | REQ-TCU-002, REQ-TCU-010 | 2 | false | Example-based test with port fakes; verify tag entry absent in `tagInventory.entries` |
| PROP-TCU-010 | Not-found error: when `getNoteSnapshot` returns null, workflow returns `Err(SaveError { kind: 'validation', reason: { kind: 'invariant-violated', cause: 'note-not-in-feed' } })` and `Clock.now()` is NOT called | REQ-TCU-005, REQ-TCU-012 | 2 | false | Example-based test: stub `getNoteSnapshot → null`; verify Err shape with `cause` and `clockNow.callCount === 0` |
| PROP-TCU-011 | Hydration-fail error: when `hydrateNote` returns `Err`, workflow returns `Err(SaveError { kind: 'validation', reason: { kind: 'invariant-violated', cause: 'hydration-failed' } })` and `Clock.now()` is NOT called | REQ-TCU-006, REQ-TCU-012 | 2 | false | Example-based test: stub `hydrateNote → Err`; verify Err shape with `cause` and `clockNow.callCount === 0` |
| PROP-TCU-012 | NoteEditError mapping — live variant: `applyTagOperationPure` with a stubbed `addTag` returning `NoteEditError { kind: 'frontmatter', reason: { kind: 'updated-before-created' } }` produces `Err(SaveError { kind: 'validation', reason: { kind: 'invariant-violated', cause: 'frontmatter-invariant' } })`. Dead variants (`tag`, `duplicate-tag`) are type-level unreachable. | REQ-TCU-007 | 0+2 | false | Example-based test for live variant; Tier-0 type assertion: `Extract<NoteEditError, { kind: 'tag' }>` branch in `applyTagOperationPure` is provably dead (pre-validated Tag brand); `Extract<NoteEditError, { kind: 'frontmatter'; reason: { kind: 'duplicate-tag' } }>` is dead (addTag idempotent) |
| PROP-TCU-013 | `SaveNoteRequested.source === 'curate-tag-chip'`: every `SaveNoteRequested` built by this workflow has `source` set to `'curate-tag-chip'` | REQ-TCU-001, REQ-TCU-002 | 1 | false | fast-check: ∀ valid (command, note, now), `buildTagChipSaveRequest(mutated, now).source === 'curate-tag-chip'` |
| PROP-TCU-014 | `SaveNoteRequested.previousFrontmatter === MutatedNote.previousFrontmatter`: the save request carries the correct pre-mutation frontmatter (always non-null in this workflow) | REQ-TCU-009 | 1 | false | fast-check: ∀ MutatedNote, `buildTagChipSaveRequest` output `previousFrontmatter` deepEquals input `previousFrontmatter` and is non-null |
| PROP-TCU-015 | `Clock.now()` call count per path: idempotent=0, not-found=0, hydration-fail=0; all write paths (happy/save-fail/tag-edit-error)=1; never exceeds 1 per invocation | REQ-TCU-012 | 1 | false | fast-check / spy wrapper: instrument `clockNow`; verify call count matches budget table; key assertion: idempotent paths produce 0 calls |
| PROP-TCU-016 | `updateProjectionsAfterSave` is pure: same `(Feed, TagInventory, NoteFileSaved)` inputs always produce same `IndexedNote` (canonical 3-arg inner form; `now` sourced from `event.occurredOn`) | REQ-TCU-010 | 1 | false | fast-check: ∀ (feed, inventory, event), `fn(feed, inventory, event)` deepEquals `fn(feed, inventory, event)` |
| PROP-TCU-017 | Event membership: `TagChipAddedOnFeed` and `TagChipRemovedOnFeed` are members of `CurateInternalEvent` and NOT members of `PublicDomainEvent`; `NoteFileSaved` and `NoteSaveFailed` ARE members of `PublicDomainEvent`; `TagInventoryUpdated` IS a member of `CurateInternalEvent` | REQ-TCU-011 | 0 | false | TypeScript type assertions: `Extract<CurateInternalEvent, { kind: 'tag-chip-added-on-feed' }>` is non-never; `Extract<PublicDomainEvent, { kind: 'tag-chip-added-on-feed' }>` is never; `Extract<CurateInternalEvent, { kind: 'tag-inventory-updated' }>` is non-never |
| PROP-TCU-018 | `NoteSaveFailed` event has correctly mapped `reason` on Vault write failure — each `FsError` variant produces the expected `NoteSaveFailureReason` | REQ-TCU-008 | 2 | false | Example-based test: for each `FsError` variant (permission, disk-full, lock, not-found, unknown), verify `NoteSaveFailed.reason` matches the `SaveError → NoteSaveFailureReason` mapping table |
| PROP-TCU-019 | Full pipeline integration: all happy paths (add new tag, remove existing tag) produce `IndexedNote` where `IndexedNote.noteId === command.noteId`, projections are updated, and `TagInventoryUpdated` is emitted via `publishInternal` | REQ-TCU-001, REQ-TCU-002, REQ-TCU-010 | 3 | false | Integration test with in-memory port fakes for all `TagChipUpdateDeps`; verify `IndexedNote` shape, projection contents, and `publishInternal` spy called once |
| PROP-TCU-020 | Non-coupling type assertion: `keyof TagChipUpdateDeps` does not include any editor-buffer key. Specifically, `TagChipUpdateDeps` does not have `getEditorBuffer` or `editingState` keys. This is a structural guarantee that the workflow cannot access Capture editor state. | REQ-TCU-009 | 0 | false | TypeScript type assertion: `'getEditorBuffer' extends keyof TagChipUpdateDeps ? never : true` compiles as `true`; `'editingState' extends keyof TagChipUpdateDeps ? never : true` compiles as `true` |
| PROP-TCU-021 | `occurredOn` threading invariant: `SaveNoteRequested.occurredOn === NoteFileSaved.occurredOn === TagInventoryUpdated.occurredOn === now` by construction. The Vault write port echoes `SaveNoteRequested.occurredOn` back as `NoteFileSaved.occurredOn`; `updateProjectionsAfterSave` sources `now` from `event.occurredOn` without a second Clock call. | REQ-TCU-010, REQ-TCU-012 | 2 | false | Example-based test: instrument the workflow with a fixed `now` stub; after a happy-path run, assert `SaveNoteRequested.occurredOn === now`, `NoteFileSaved.occurredOn === now`, `TagInventoryUpdated.occurredOn === now` (all three equal the same `Timestamp` instance) |

---

## Verification Tiers

- **Tier 0**: TypeScript type-level proof. No runtime test needed; the type system enforces correctness at compile time. Examples: exhaustiveness of discriminated unions, event channel membership, non-coupling structural guarantees, dead-code variant proofs.
- **Tier 1**: Property-based test with fast-check. Generated random inputs; verifies structural invariants hold for all inputs in the domain.
- **Tier 2**: Example-based unit test (vitest). Concrete inputs and expected outputs; verifies specific scenario behaviors including error paths and spy call counts.
- **Tier 3**: Integration test. Exercises the full pipeline with in-memory port fakes; tests cross-step coordination and end-to-end projection consistency.

Suggested test file layout (Phase 2a planning):
- `tests/unit/curate/applyTagOperationPure.property.test.ts` — PROP-TCU-001, 002, 003, 005
- `tests/unit/curate/tagChipUpdate.example.test.ts` — PROP-TCU-004, 006, 007, 008, 009, 010, 011, 012, 013, 014, 015, 018, 021
- `tests/unit/curate/tagChipUpdate.types.test.ts` — PROP-TCU-007 (Tier-0), PROP-TCU-012 (Tier-0), PROP-TCU-017, PROP-TCU-020
- `tests/unit/curate/updateProjectionsAfterSave.property.test.ts` — PROP-TCU-016
- `tests/integration/curate/tagChipUpdate.integration.test.ts` — PROP-TCU-019

In lean mode, `required: true` is reserved for the highest-risk invariants:
- **PROP-TCU-001** (`applyTagOperationPure` purity) — the entire pure/effectful boundary contract depends on this step being referentially transparent.
- **PROP-TCU-002** (idempotent add produces unchanged tags) — core idempotency claim.
- **PROP-TCU-003** (idempotent remove produces unchanged tags) — symmetric to PROP-TCU-002.
- **PROP-TCU-004** (no-op short-circuit prevents write/publish/Clock) — data correctness; prevents spurious writes and events.
- **PROP-TCU-005** (`previousFrontmatter` sourcing + non-null) — delta correctness for `TagInventoryOps.applyNoteFrontmatterEdited`.
- **PROP-TCU-006** (save-failure does not mutate projections) — state consistency.
- **PROP-TCU-007** (`SaveError` + `SaveValidationError.cause` exhaustiveness) — error handling correctness with structured cause.

---

## Coverage Matrix

| Requirement | PROP IDs |
|-------------|---------|
| REQ-TCU-001 | PROP-TCU-001, PROP-TCU-005, PROP-TCU-008, PROP-TCU-013, PROP-TCU-014, PROP-TCU-019 |
| REQ-TCU-002 | PROP-TCU-001, PROP-TCU-005, PROP-TCU-009, PROP-TCU-013, PROP-TCU-014, PROP-TCU-019 |
| REQ-TCU-003 | PROP-TCU-002, PROP-TCU-004, PROP-TCU-015 |
| REQ-TCU-004 | PROP-TCU-003, PROP-TCU-004, PROP-TCU-015 |
| REQ-TCU-005 | PROP-TCU-007, PROP-TCU-010 |
| REQ-TCU-006 | PROP-TCU-007, PROP-TCU-011 |
| REQ-TCU-007 | PROP-TCU-007, PROP-TCU-012 |
| REQ-TCU-008 | PROP-TCU-006, PROP-TCU-007, PROP-TCU-018 |
| REQ-TCU-009 | PROP-TCU-005, PROP-TCU-014, PROP-TCU-020 |
| REQ-TCU-010 | PROP-TCU-008, PROP-TCU-009, PROP-TCU-016, PROP-TCU-019, PROP-TCU-021 |
| REQ-TCU-011 | PROP-TCU-017 |
| REQ-TCU-012 | PROP-TCU-001, PROP-TCU-004, PROP-TCU-010, PROP-TCU-011, PROP-TCU-015, PROP-TCU-021 |

Every requirement maps to at least one proof obligation. Seven `required: true` obligations (PROP-TCU-001 through PROP-TCU-007) cover the highest-risk invariants across Tiers 0–2. Total proof obligations: 21 (PROP-TCU-001 through PROP-TCU-021).
