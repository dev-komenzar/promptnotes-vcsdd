# Behavioral Specification: TagChipUpdate

**Feature**: `tag-chip-update`
**Phase**: 1a
**Revision**: 3
**Source of truth**: `docs/domain/workflows.md` Workflow 4 (lines 394–465), `docs/domain/code/ts/src/curate/workflows.ts`, `docs/domain/code/ts/src/curate/stages.ts`, `docs/domain/code/ts/src/curate/ports.ts`, `docs/domain/code/ts/src/curate/internal-events.ts`, `docs/domain/code/ts/src/curate/aggregates.ts`, `docs/domain/code/ts/src/curate/read-models.ts`, `docs/domain/code/ts/src/shared/note.ts`, `docs/domain/code/ts/src/shared/value-objects.ts`, `docs/domain/code/ts/src/shared/events.ts`, `docs/domain/code/ts/src/shared/errors.ts`
**Scope**: Lightweight tag add/remove on a feed note without opening the editor. Pipeline spans Curate context only, reusing the CaptureAutoSave back-end (serializeNote → writeMarkdown → updateProjections). Workflow terminates after `Promise<Result<IndexedNote, SaveError>>` is produced. UI reactions, debounce coordination, and tag autocomplete are out of scope.

---

## Revision 3 Changes

This revision addresses all 3 findings from the Phase 1c iter-2 verdict (FIND-SPEC-TCU-021, FIND-SPEC-TCU-022, FIND-SPEC-TCU-023).

- **FIND-021**: Added Delta 5 — `BuildTagChipSaveRequest` arity widening to thread `now`. The canonical curried `(deps: CurateDeps) => (mutated: MutatedNote) => SaveNoteRequested` shape is replaced with `(mutated: MutatedNote, now: Timestamp) => SaveNoteRequested` to enable explicit `now` threading from the orchestrator's single `Clock.now()` call. Drops `deps` curry, making the function fully pure. Declared as a new canonical contract delta.
- **FIND-022**: Reverted `updateProjectionsAfterSave` to canonical 3-arg inner shape. Removed the 4th positional argument `now: Timestamp` from the inner function. `now` is now sourced from `event.occurredOn` inside `updateProjectionsAfterSave`, which equals the workflow's single `now` by construction (per the `occurredOn` threading invariant). The `deps` parameter type is reverted to `CurateDeps` (the canonical shared type). Updated Purity Boundary table and all REQ/PROP references.
- **FIND-023**: Removed `'tag-vo-invalid'` from the `SaveValidationError.cause` discriminator delta (Delta 1). The dead variant is covered exclusively by a Tier-0 type assertion (`Extract<NoteEditError, { kind: 'tag' }>` is unreachable in `applyTagOperationPure`). The Delta 1 type now enumerates exactly 3 causes: `note-not-in-feed`, `hydration-failed`, `frontmatter-invariant`.

Additional changes:
- Made explicit the `occurredOn` threading invariant: `now === SaveNoteRequested.occurredOn === NoteFileSaved.occurredOn === TagInventoryUpdated.occurredOn` by construction.
- Delta count is now **5** (Deltas 1–5). The count in prose is updated to match.

---

## Revision 2 Changes

This revision addresses all 19 findings from the Phase 1c iter-1 verdict. Changes summary:

- **FIND-001**: Canonical `ApplyTagOperation` shape preserved as `(deps: CurateDeps) => (note, command) => Result<MutatedNote, SaveError>`. Introduced internal pure helper `ApplyTagOperationPure` as the proof target. Updated purity-boundary table.
- **FIND-002**: `addTag` is short-circuit idempotent per `note.ts:55` comment ("重複は idempotent"). Duplicate tag returns `Ok(note)` unchanged. `duplicate-tag` mapping removed from REQ-TCU-007. This also resolves the REQ-TCU-003/REQ-TCU-007 contradiction.
- **FIND-003**: Purity boundary corrected. `applyTagOperation` (canonical) is effectful shell (clock). `applyTagOperationPure` (internal helper) is pure core and the proof target. Updated throughout.
- **FIND-004**: Declared `GetAllSnapshots` port and `getAllSnapshots` key in `TagChipUpdateDeps` as a canonical contract delta to `ports.ts`. See "Cross-context dependencies / canonical contract deltas".
- **FIND-005**: Introduced `TagChipUpdateDeps = CurateDeps & { writeMarkdown: WriteMarkdown; getAllSnapshots: GetAllSnapshots; publishInternal: EventBusPublishInternal }`. Anchored `writeMarkdown` to Vault adapter reuse. See "Cross-context dependencies / canonical contract deltas".
- **FIND-006**: Declared `EventBusPublishInternal` port and `publishInternal` key in `TagChipUpdateDeps` as a canonical contract delta to `ports.ts`. See "Cross-context dependencies / canonical contract deltas".
- **FIND-007**: Pipeline Output restated as `Promise<Result<IndexedNote, SaveError>>`. Step 5 marked as async hop. Acceptance criterion added: workflow never throws; all errors as `Err(SaveError)`.
- **FIND-008**: Single canonical idempotency predicate `tagsEqualAsSet` defined and used throughout. All "deep-equals", "===", and "same set" phrasings replaced.
- **FIND-009**: "passed by reference; mutated" wording replaced with immutable functional-update semantics. `feed`/`inventory` are immutable inputs; `updateProjectionsAfterSave` returns new instances.
- **FIND-010**: `SaveValidationError` extended with structured `cause` discriminator. Declared as contract delta to `errors.ts`. Error mappings updated to use structured `cause`.
- **FIND-011**: `TagInventoryUpdated.occurredOn` semantic documented explicitly: represents the wall-clock moment at which the tag-chip operation was performed; `SaveNoteRequested.occurredOn` and `TagInventoryUpdated.occurredOn` are the same instant by design (single-Clock decision).
- **FIND-012**: Reduced to a single `Clock.now()` call per workflow invocation, made up-front after `loadCurrentNote` succeeds. Threaded through `applyTagOperationPure`, `SaveNoteRequested.occurredOn`, `MutatedNote.note.frontmatter.updatedAt`, and `TagInventoryUpdated.occurredOn`. Clock budget table updated to single column.
- **FIND-013**: Idempotent path: no-op short-circuit is a pre-`addTag`/`removeTag` membership check on input note's tags. Clock.now() is NOT called before the membership check. Idempotent path Clock budget = 0.
- **FIND-014**: `TagError { empty | only-whitespace }` mapping removed. `tag` is a pre-validated `Tag` brand; `addTag` cannot produce `TagError`. Dead code removed.
- **FIND-015**: Explicit non-null invariant added to REQ-TCU-009: `NoteFileSaved.previousFrontmatter` is always non-null in this workflow, sourced from `MutatedNote.previousFrontmatter`.
- **FIND-016**: `applyTagOperation` and `applyTagOperationPure` error type unified to `Result<MutatedNote, SaveError>`. The `NoteEditError → SaveError` mapping happens inside these functions. No more `NoteEditError` leaking to the outer type surface.
- **FIND-017**: "Cross-context dependencies" section added. Canonical paths for `serializeNote` and `writeMarkdown` declared (both absent from canonical — declared as contract deltas).
- **FIND-018**: REQ-TCU-007 acceptance criteria reduced to the single live `NoteEditError` variant: `{ kind: 'frontmatter', reason: { kind: 'updated-before-created' } }`. Dead variants (`tag`, `duplicate-tag`) removed with explanation.
- **FIND-019**: Added architectural non-coupling claim with structural guarantee: `TagChipUpdateDeps` does not include any editor-buffer key. Proof obligation PROP-TCU-020 added in verification-architecture.md.

Suggestions addressed:
- Duplicate Clock budget table removed; single corrected version retained.
- REQ-TCU-007 edge case "applies only to add path" promoted to acceptance criterion.
- Pipeline diagram updated with async marker on Step 5.

---

## Pipeline Overview

```
TagChipCommand
    ↓ Step 1: loadCurrentNote        [effectful: in-memory read]
Note
    ↓ Step 1.5: idempotency gate     [pure: tagsEqualAsSet membership check]
    ↓ (non-idempotent path only)
    ↓ Clock.now() — single call here, before Step 2
Timestamp (now)
    ↓ Step 2: applyTagOperationPure  [pure core — proof target]
       wraps via: applyTagOperation: (deps)(note, command) calls applyTagOperationPure(note, command, deps.clockNow())
MutatedNote
    ↓ Step 3: buildTagChipSaveRequest [pure — now already in MutatedNote]
SaveNoteRequested (source: 'curate-tag-chip', occurredOn: now)
    ↓ Step 4: serializeNote           [pure — shared]
SerializedMarkdown
    ↓ Step 5: writeMarkdown           [ASYNC write I/O — Vault] ← only async hop
NoteFileSaved | FsError
    ↓ Step 6: updateProjectionsAfterSave [pure — shared]
IndexedNote
```

The pipeline is triggered when `TagChipAddedOnFeed` or `TagChipRemovedOnFeed` fires in the Curate internal event bus. A `TagChipCommand` is constructed from the internal event and passed into `TagChipUpdate`.

---

## Pipeline Input

```typescript
// Constructed by the Curate application layer from a CurateInternalEvent.
type TagChipUpdateInput =
  | TagChipAddedOnFeed   // { kind: 'tag-chip-added-on-feed'; noteId: NoteId; tag: Tag; occurredOn: Timestamp }
  | TagChipRemovedOnFeed; // { kind: 'tag-chip-removed-on-feed'; noteId: NoteId; tag: Tag; occurredOn: Timestamp }

// The application layer translates the internal event into a TagChipCommand:
type TagChipCommand =
  | { readonly kind: 'add';    readonly noteId: NoteId; readonly tag: Tag }
  | { readonly kind: 'remove'; readonly noteId: NoteId; readonly tag: Tag };
```

The `tag` field is already a validated `Tag` value object (normalized: lowercase, `#` stripped, trimmed). The workflow never receives raw strings. `TagChipCommand.tag` carries only the VO; normalization has already occurred at the UI / event-construction layer.

External state injected via `TagChipUpdateDeps` (superset of `CurateDeps` — see "Cross-context dependencies"):
- `deps.clockNow` — wall-clock time source (called exactly once per write-path invocation, never on idempotent or pre-load error paths)
- `deps.getNoteSnapshot(noteId)` — returns `NoteFileSnapshot | null` from Curate's in-memory snapshot store
- `deps.hydrateNote(snapshot)` — pure ACL; converts `NoteFileSnapshot → Result<Note, HydrationFailureReason>`
- `deps.publish(event)` — emits a `PublicDomainEvent` to the event bus (public: `NoteFileSaved`, `NoteSaveFailed`)
- `deps.publishInternal(event)` — emits a `CurateInternalEvent` to the internal bus (NEW port — see contract delta)
- `deps.writeMarkdown(request)` — async Vault write port (NEW port on deps — see contract delta)
- `deps.getAllSnapshots()` — returns all in-memory snapshots for `FeedOps.refreshSort` (NEW port — see contract delta)

Additionally the caller provides via `TagChipUpdate` invocation:
- `feed: Feed` — current Curate feed (immutable input; `updateProjectionsAfterSave` returns a new `Feed` via `FeedOps.refreshSort`)
- `inventory: TagInventory` — current Curate tag inventory (immutable input; `updateProjectionsAfterSave` returns a new `TagInventory` via `TagInventoryOps.applyNoteFrontmatterEdited`)

---

## Pipeline Output

```typescript
// Canonical signature (workflows.ts:73-77):
type TagChipUpdate = (
  deps: TagChipUpdateDeps,
) => (
  command: TagChipCommand,
) => Promise<Result<IndexedNote, SaveError>>;
```

The workflow is an `async` function. It never `throw`s. All errors are reified as `Err(SaveError)` in the resolved `Promise`. The only `await` point is Step 5 (`writeMarkdown`).

---

## Idempotency Predicate (canonical — used throughout this spec)

```
tagsEqualAsSet(a: readonly Tag[], b: readonly Tag[]): boolean
  := a.length === b.length ∧ ∀t∈a, b.includes(t)
```

This predicate is the canonical test for the no-op short-circuit. It is set-semantic (order-independent). All references to "identical tag set", "unchanged tags", or "tag-set equality" in this spec resolve to this predicate.

---

## Idempotency Decision

**Decision**: When `command.kind === 'add'` and `tagsEqualAsSet` detects `command.tag ∈ note.frontmatter.tags` (tag already present), OR when `command.kind === 'remove'` and `¬(command.tag ∈ note.frontmatter.tags)` (tag already absent), the workflow SHALL short-circuit BEFORE calling `applyTagOperation` and BEFORE calling `Clock.now()`. This is a pure pre-check on the loaded note's tag membership.

Rationale:
1. Writing an unchanged note wastes I/O with no semantic effect.
2. It would produce a spurious `NoteFileSaved` event and a `TagInventoryUpdated` with empty delta, misleading consumers.
3. The pre-check ensures `Clock.now()` is never called on idempotent paths (Clock budget = 0 on those paths).
4. This matches the `NoteOps.addTag` "重複は idempotent" comment (`note.ts:55`): `addTag` itself returns `Ok(note)` unchanged when the tag is already present — the pre-check mirrors this at the workflow orchestration level.

On the no-op short-circuit path:
- `Clock.now()` is NOT called.
- `applyTagOperation` is NOT called.
- `SaveNoteRequested` is NOT emitted.
- `NoteFileSaved` is NOT emitted.
- `TagInventoryUpdated` is NOT emitted.
- Feed and TagInventory projections are NOT mutated.
- The workflow returns `Ok(IndexedNote)` with the current (unchanged) `feed` and `inventory`.

---

## Clock.now() Budget

Single `Clock.now()` call per workflow invocation, made in the orchestrator after `loadCurrentNote` succeeds and the non-idempotent path is confirmed. This single `now` is threaded through:
- `applyTagOperationPure(note, command, now)` — stamps `Note.frontmatter.updatedAt`
- `SaveNoteRequested.occurredOn = now`
- `TagInventoryUpdated.occurredOn = now`

| Path | Clock.now() calls | Notes |
|------|-------------------|-------|
| not-found error | 0 | fails at Step 1, before Clock call |
| hydration-fail error | 0 | fails at Step 1, before Clock call |
| idempotent add (tag already present) | 0 | short-circuits before Clock call |
| idempotent remove (tag already absent) | 0 | short-circuits before Clock call |
| tag-edit-error (addTag returns Err) | 1 | Clock called; applyTagOperationPure called; error returned |
| happy add (write succeeds) | 1 | Clock called once up-front; threaded through Steps 2–6 |
| happy remove (write succeeds) | 1 | same as happy add |
| save-fail (add or remove) | 1 | Clock called once; write fails; Err(SaveError.fs) returned |

Maximum `Clock.now()` calls per invocation: **1**.

---

## Purity Boundary Candidates

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Step 1 | `loadCurrentNote` | **Effectful shell (read)** | Calls `deps.getNoteSnapshot` (in-memory read port) and `deps.hydrateNote` (ACL adapter). Returns `Result<Note, {kind:'not-found'}>`. |
| Pre-Step 2 | `tagsEqualAsSet` membership check | **Pure core** | Inspects `note.frontmatter.tags` for membership of `command.tag`. No ports, no side effects. |
| Step 2 (canonical) | `applyTagOperation` | **Effectful shell (clock)** | `(deps: CurateDeps) => (note, command) => Result<MutatedNote, SaveError>`. Internally calls `deps.clockNow()` to obtain `now`, then delegates to `applyTagOperationPure`. |
| Step 2 (pure helper) | `applyTagOperationPure` | **Pure core — proof target** | `(note: Note, command: TagChipCommand, now: Timestamp) => Result<MutatedNote, SaveError>`. Deterministic given fixed inputs. Calls `NoteOps.addTag` or `NoteOps.removeTag`. No ports. Property-test and formal-proof target. |
| Step 3 | `buildTagChipSaveRequest` | **Pure core** | `(mutated: MutatedNote, now: Timestamp) => SaveNoteRequested`. Pure construction using the pre-obtained `now`. No Clock call. |
| Step 4 | `serializeNote` | **Pure core** | `(req: SaveNoteRequested) => SerializedMarkdown`. Markdown string. Deterministic. No ports. |
| Step 5 | `writeMarkdown` | **Effectful shell (I/O)** | Vault write. Async. Returns `NoteFileSaved` or `FsError`. |
| Step 6 | `updateProjectionsAfterSave` | **Pure core** | `(deps: CurateDeps) => (Feed, TagInventory, NoteFileSaved) => IndexedNote`. Canonical 3-arg inner form. Sources `now` from `event.occurredOn` (which equals the workflow's single `Clock.now()` result by construction — see `occurredOn` threading invariant). Calls `FeedOps.refreshSort(feed, deps.getAllSnapshots())` and `TagInventoryOps.applyNoteFrontmatterEdited`. Returns new `Feed`/`TagInventory` instances (functional update, no mutation). |

**Formally verifiable core (pure functions)**:
- `applyTagOperationPure` — the tag mutation logic (proof target)
- `tagsEqualAsSet` membership check — idempotency guard
- `buildTagChipSaveRequest` — save request construction
- `serializeNote` — Markdown serialization
- `updateProjectionsAfterSave` — projection delta computation

**Effectful shell**:
- `loadCurrentNote` (read I/O)
- `applyTagOperation` canonical wrapper (clock, delegates to pure helper)
- `writeMarkdown` (write I/O, async)
- `deps.publish` (event bus — public)
- `deps.publishInternal` (event bus — internal)

---

## Error Type Reconciliation

`TagChipUpdate` returns `Promise<Result<IndexedNote, SaveError>>` (canonical type from `workflows.ts`).

### Structured cause discriminator (contract delta applied)

After the `SaveValidationError` contract delta (see "Cross-context dependencies"), the relevant discriminators are:

```typescript
// Delta to docs/domain/code/ts/src/shared/errors.ts:
type SaveValidationError =
  | { kind: 'empty-body-on-idle' }  // unchanged — Capture-only
  | { kind: 'invariant-violated';
      cause:
        | 'note-not-in-feed'          // getNoteSnapshot returned null
        | 'hydration-failed'          // hydrateNote returned Err
        | 'frontmatter-invariant'     // addTag returned NoteEditError { kind: 'frontmatter', reason: { kind: 'updated-before-created' } }
        ;
      detail: string;
    };
```

Note: `'tag-vo-invalid'` is NOT included. The `tag` variant of `NoteEditError` is dead code in this workflow (`command.tag` is a pre-validated `Tag` brand). The dead-code guarantee is enforced exclusively by a Tier-0 type assertion: `Extract<NoteEditError, { kind: 'tag' }>` is unreachable in `applyTagOperationPure`. Extending the canonical `errors.ts` type with a provably-dead discriminator would bloat the contract without benefit.

### Mapping table

`LoadCurrentNote` returns `Result<Note, { kind: 'not-found' }>`. The `not-found` variant maps to:
```
{ kind: 'not-found' }
  → SaveError { kind: 'validation', reason: { kind: 'invariant-violated', cause: 'note-not-in-feed', detail: 'note not in feed: <noteId>' } }
```

`HydrationFailureReason` maps to:
```
HydrationFailureReason (any variant)
  → SaveError { kind: 'validation', reason: { kind: 'invariant-violated', cause: 'hydration-failed', detail: 'hydration failed for snapshot: <noteId>' } }
```

`NoteEditError` from `NoteOps.addTag` — live variants only (after binding decision):

```
NoteEditError { kind: 'frontmatter', reason: { kind: 'updated-before-created' } }
  → SaveError { kind: 'validation', reason: { kind: 'invariant-violated', cause: 'frontmatter-invariant', detail: 'timestamp invariant violated: updatedAt before createdAt' } }
```

Dead variants (unreachable in this workflow — documented for exhaustiveness):
- `NoteEditError { kind: 'tag', reason: { kind: 'empty' | 'only-whitespace' } }` — dead code because `command.tag` is a pre-validated `Tag` brand. `addTag` cannot produce `TagError` when called with a branded `Tag`.
- `NoteEditError { kind: 'frontmatter', reason: { kind: 'duplicate-tag' } }` — dead code because `addTag` is short-circuit idempotent per `note.ts:55`; the workflow pre-checks tag membership before calling `applyTagOperation` on the non-idempotent path, and `addTag` itself returns `Ok(note)` unchanged on duplicate.

`FsError` from `writeMarkdown` maps directly:
```
FsError { kind: 'permission' | 'disk-full' | 'lock' | 'not-found' | 'unknown' }
  → SaveError { kind: 'fs', reason: FsError }
```

`SaveError → NoteSaveFailureReason` mapping (for `NoteSaveFailed` public event):
```
SaveError { kind: 'fs', reason: { kind: 'permission' } } → "permission"
SaveError { kind: 'fs', reason: { kind: 'disk-full' } }  → "disk-full"
SaveError { kind: 'fs', reason: { kind: 'lock' } }       → "lock"
SaveError { kind: 'fs', reason: { kind: 'not-found' } }  → "unknown"
SaveError { kind: 'fs', reason: { kind: 'unknown' } }    → "unknown"
SaveError { kind: 'validation', reason: _ }              → "unknown"
```

---

## Cross-context Dependencies / Canonical Contract Deltas

This section documents all cross-context function reuse and contract modifications required by this workflow. Phase 2 implementation will apply these deltas. The spec declares them here; modification of the canonical files occurs in Phase 2b.

### Delta 1: `SaveValidationError` structured cause — `docs/domain/code/ts/src/shared/errors.ts`

Current:
```typescript
type SaveValidationError =
  | { kind: 'empty-body-on-idle' }
  | { kind: 'invariant-violated'; detail: string };
```

Delta (extend with structured `cause`):
```typescript
type SaveValidationError =
  | { kind: 'empty-body-on-idle' }
  | { kind: 'invariant-violated';
      cause:
        | 'note-not-in-feed'
        | 'hydration-failed'
        | 'frontmatter-invariant'
        ;
      detail: string;
    };
```

Rationale: Allows callers to programmatically distinguish error subcategories without string matching on `detail`. Exactly 3 cause variants are live; `'tag-vo-invalid'` is excluded because the `tag` variant of `NoteEditError` is dead in this workflow (pre-validated `Tag` brand). The dead-code guarantee is enforced by the Tier-0 type assertion in PROP-TCU-012.

### Delta 2: `GetAllSnapshots` port and `CurateDeps` extension — `docs/domain/code/ts/src/curate/ports.ts`

```typescript
/** Curate が保持する全 snapshot の読み出し（in-memory）— refreshSort 用。 */
export type GetAllSnapshots = () => readonly NoteFileSnapshot[];
```

Required because `FeedOps.refreshSort(feed, snapshots: readonly NoteFileSnapshot[])` needs the full snapshot collection, and current `CurateDeps` only provides single-note `getNoteSnapshot`.

### Delta 3: `EventBusPublishInternal` port — `docs/domain/code/ts/src/curate/ports.ts`

```typescript
export type EventBusPublishInternal = (event: CurateInternalEvent) => void;
```

Required because `TagInventoryUpdated` is a `CurateInternalEvent`, and the existing `CurateDeps.publish: EventBusPublish = (event: PublicDomainEvent) => void` only accepts `PublicDomainEvent`.

### Delta 4: `TagChipUpdateDeps` shape — `docs/domain/code/ts/src/curate/ports.ts`

```typescript
export type TagChipUpdateDeps = CurateDeps & {
  /** Vault write port. Same port shape reused from Vault adapter (also used by CaptureAutoSave). */
  readonly writeMarkdown: WriteMarkdown;
  /** Full snapshot collection for FeedOps.refreshSort. */
  readonly getAllSnapshots: GetAllSnapshots;
  /** Internal event bus for CurateInternalEvent (e.g., TagInventoryUpdated). */
  readonly publishInternal: EventBusPublishInternal;
};
```

`TagChipUpdateDeps` does NOT include any editor-buffer key (e.g., no `getEditorBuffer`, no `editingState`). This is the structural guarantee that the workflow cannot access Capture editor state (see REQ-TCU-009 and PROP-TCU-020).

### Delta 5 — `BuildTagChipSaveRequest` arity widening to thread `now`

**Canonical** (`docs/domain/code/ts/src/curate/workflows.ts:68-70`):
```typescript
export type BuildTagChipSaveRequest = (
  deps: CurateDeps,
) => (mutated: MutatedNote) => SaveNoteRequested;
```

**Delta**:
```typescript
export type BuildTagChipSaveRequest = (
  mutated: MutatedNote,
  now: Timestamp,
) => SaveNoteRequested;
```

**Rationale**: `now` is threaded from the orchestrator's single `Clock.now()` call (per the single-Clock budget). Dropping the `deps` curry makes the function pure and removes the implicit second `clockNow()` call that the canonical curried form would imply. Without this delta, an implementer preserving the canonical curried form would call `deps.clockNow()` inside `buildTagChipSaveRequest`, violating the single-Clock budget (max 1 call per invocation).

**Migration**: when other workflows reuse this constructor, they must pass their own `now`. The change is additive at the call site (callers already need `now` for their own purposes).

**Purity**: with the `deps` curry dropped and `now` threaded explicitly, `buildTagChipSaveRequest` is fully pure (no clock call, no ports).

---

### Cross-context function reuse

`serializeNote` and `writeMarkdown` are reused from the Vault/Capture pipeline. Canonical location:

- `writeMarkdown` — the same Vault adapter port used by CaptureAutoSave. Canonical port shape:
  ```typescript
  type WriteMarkdown = (request: SaveNoteRequested) => Promise<Result<NoteFileSaved, FsError>>;
  ```
  This type is NOT currently exported from a canonical file. **Contract delta**: declare and export `WriteMarkdown` in `docs/domain/code/ts/src/curate/ports.ts` (co-located with `TagChipUpdateDeps`). Phase 2 impl will inject the same Vault adapter instance as CaptureAutoSave.

- `serializeNote` — pure function: `(req: SaveNoteRequested) => SerializedMarkdown`. **Contract delta**: this function is not currently exported from a canonical file. Declare and export `SerializeNote` type in `docs/domain/code/ts/src/curate/ports.ts`. Phase 2 will provide the implementation. The `SerializedMarkdown` type is a `string` alias representing the full YAML-frontmatter + Markdown body string.

---

## Requirements

### REQ-TCU-001: Happy Path — tag add, note updated and persisted

**EARS**: WHEN `TagChipAddedOnFeed { noteId, tag }` fires AND `getNoteSnapshot(noteId)` returns a snapshot AND `hydrateNote(snapshot)` succeeds AND `tagsEqualAsSet` confirms `tag` is absent from the note's current frontmatter THEN the system SHALL call `Clock.now()` once, apply `applyTagOperationPure(note, { kind: 'add', noteId, tag }, now)`, build `SaveNoteRequested { source: 'curate-tag-chip', occurredOn: now }`, serialize and write the updated note to Vault, emit `NoteFileSaved`, update Curate projections, emit `TagInventoryUpdated` via `publishInternal`, and return `Ok(IndexedNote)`.

**Edge Cases**:
- `tag` is a pre-normalized `Tag` VO (no raw strings enter this workflow).
- `previousFrontmatter` is sourced from the loaded `Note.frontmatter` before `applyTagOperationPure` is called.
- The returned `IndexedNote.feed` and `IndexedNote.tagInventory` reflect the tag addition (new immutable instances from `FeedOps.refreshSort` and `TagInventoryOps.applyNoteFrontmatterEdited`).

**Acceptance Criteria**:
- `applyTagOperationPure` returns `Ok(MutatedNote)` where `MutatedNote.note.frontmatter.tags` contains `tag`.
- `MutatedNote.previousFrontmatter` equals the original `Note.frontmatter` (before mutation).
- `SaveNoteRequested.source === 'curate-tag-chip'`.
- `SaveNoteRequested.occurredOn === now` (same `Timestamp` instance as was passed to `applyTagOperationPure`).
- `SaveNoteRequested.previousFrontmatter === MutatedNote.previousFrontmatter`.
- `NoteFileSaved` public domain event is emitted: `deps.publish(NoteFileSaved)` called exactly once.
- `IndexedNote.tagInventory` includes `tag` with `usageCount >= 1`.
- `IndexedNote.feed` is a new `Feed` instance returned by `FeedOps.refreshSort`.
- `IndexedNote.tagInventory` is a new `TagInventory` instance returned by `TagInventoryOps.applyNoteFrontmatterEdited`.
- Workflow returns `Ok(IndexedNote)`.
- `Clock.now()` is called exactly once per invocation.
- Workflow never throws; all errors as `Err(SaveError)`.

---

### REQ-TCU-002: Happy Path — tag remove, note updated and persisted

**EARS**: WHEN `TagChipRemovedOnFeed { noteId, tag }` fires AND `getNoteSnapshot(noteId)` returns a snapshot AND `hydrateNote(snapshot)` succeeds AND `tagsEqualAsSet` confirms `tag` is present in the note's current frontmatter THEN the system SHALL call `Clock.now()` once, apply `applyTagOperationPure(note, { kind: 'remove', noteId, tag }, now)`, build `SaveNoteRequested { source: 'curate-tag-chip', occurredOn: now }`, serialize and write the updated note to Vault, emit `NoteFileSaved`, update Curate projections, emit `TagInventoryUpdated` via `publishInternal`, and return `Ok(IndexedNote)`.

**Edge Cases**:
- `previousFrontmatter` is sourced from the loaded `Note.frontmatter` before `applyTagOperationPure` is called.
- The returned `IndexedNote.tagInventory` reflects the tag removal (usageCount decremented or entry removed if usageCount reaches 0). New immutable instance.

**Acceptance Criteria**:
- `applyTagOperationPure` returns `Ok(MutatedNote)` where `MutatedNote.note.frontmatter.tags` does NOT contain `tag`.
- `MutatedNote.previousFrontmatter` equals the original `Note.frontmatter` (before mutation).
- `SaveNoteRequested.source === 'curate-tag-chip'`.
- `SaveNoteRequested.occurredOn === now`.
- `NoteFileSaved` public domain event is emitted exactly once.
- `IndexedNote.tagInventory` does not contain `tag` if it had `usageCount === 1` before; usageCount is decremented if `usageCount > 1`.
- Workflow returns `Ok(IndexedNote)`.
- `Clock.now()` is called exactly once.
- Workflow never throws; all errors as `Err(SaveError)`.

---

### REQ-TCU-003: Idempotency — add of already-present tag short-circuits before Clock call

**EARS**: WHEN `TagChipAddedOnFeed { noteId, tag }` fires AND `getNoteSnapshot(noteId)` returns a snapshot AND `hydrateNote(snapshot)` succeeds AND the pre-check determines `command.tag ∈ note.frontmatter.tags` (using `tagsEqualAsSet`-equivalent membership check) THEN the system SHALL short-circuit BEFORE calling `Clock.now()` and BEFORE calling `applyTagOperation`: no `SaveNoteRequested` is emitted, no Vault write is performed, no `NoteFileSaved` is emitted, no `TagInventoryUpdated` is emitted, projections are unchanged, and the workflow returns `Ok(IndexedNote)` with the current (unmodified) `feed` and `inventory`.

**Edge Cases**:
- The no-op detection is based on direct tag membership: `command.tag ∈ note.frontmatter.tags` (a `b.includes(t)` check, not a full `tagsEqualAsSet` over the whole array).
- The short-circuit happens BEFORE `applyTagOperation` is called. `NoteOps.addTag` is never invoked on this path.
- Because `NoteOps.addTag` is also short-circuit idempotent per `note.ts:55`, these two checks are consistent: the workflow-level pre-check and the `addTag` contract both handle the duplicate case, but the workflow-level pre-check fires first.

**Acceptance Criteria**:
- Pre-check confirms `tag ∈ note.frontmatter.tags`.
- `applyTagOperation` is NOT called.
- `Clock.now()` is NOT called.
- `SaveNoteRequested` is NOT emitted.
- `NoteFileSaved` is NOT emitted.
- `TagInventoryUpdated` is NOT emitted.
- `deps.publish` is NOT called.
- `deps.publishInternal` is NOT called.
- Vault write port is NOT called.
- `Feed` is unchanged (same reference or `tagsEqualAsSet`-equivalent structure).
- `TagInventory` is unchanged.
- Workflow returns `Ok(IndexedNote { noteId, feed: unchanged, tagInventory: unchanged })`.

---

### REQ-TCU-004: Idempotency — remove of absent tag short-circuits before Clock call

**EARS**: WHEN `TagChipRemovedOnFeed { noteId, tag }` fires AND `getNoteSnapshot(noteId)` returns a snapshot AND `hydrateNote(snapshot)` succeeds AND the pre-check determines `command.tag ∉ note.frontmatter.tags` THEN the system SHALL short-circuit BEFORE calling `Clock.now()` identically to REQ-TCU-003.

**Edge Cases**:
- `NoteOps.removeTag` contract: "タグ削除（不在は idempotent）" (`note.ts:59`). The workflow-level pre-check fires before `removeTag` is called; both are consistent.
- `NoteOps.removeTag` signature is `(note: Note, tag: Tag, now: Timestamp) => Note` (no `Result` wrapper, never fails). Because the pre-check fires first, `removeTag` is never called on this path.

**Acceptance Criteria**:
- Pre-check confirms `tag ∉ note.frontmatter.tags`.
- `applyTagOperation` is NOT called.
- `Clock.now()` is NOT called.
- `SaveNoteRequested` is NOT emitted.
- `NoteFileSaved` is NOT emitted.
- `TagInventoryUpdated` is NOT emitted.
- `deps.publish` is NOT called.
- `deps.publishInternal` is NOT called.
- Vault write port is NOT called.
- `Feed` and `TagInventory` are unchanged.
- Workflow returns `Ok(IndexedNote { noteId, feed: unchanged, tagInventory: unchanged })`.

---

### REQ-TCU-005: Error Path — note not in Curate snapshot store

**EARS**: WHEN `TagChipAddedOnFeed` or `TagChipRemovedOnFeed` fires AND `deps.getNoteSnapshot(noteId)` returns `null` THEN the system SHALL terminate with `Err(SaveError { kind: 'validation', reason: { kind: 'invariant-violated', cause: 'note-not-in-feed', detail: 'note not in feed: <noteId>' } })`.

**Rationale**: A note that is not found in the Curate snapshot store when the tag chip fires is a programming error — the feed UI should only expose tag chips for notes that exist in the feed. Therefore the error is classified as `invariant-violated` (not a file-system error).

**Edge Cases**:
- This is treated as a programming error (caller invariant), not a recoverable file-system error.
- No `NoteSaveFailed` public event is emitted (the save was never attempted).

**Acceptance Criteria**:
- `LoadCurrentNote` returns `Err({ kind: 'not-found' })`.
- The workflow maps to `Err(SaveError { kind: 'validation', reason: { kind: 'invariant-violated', cause: 'note-not-in-feed' } })`.
- `deps.publish` is NOT called.
- `deps.publishInternal` is NOT called.
- `applyTagOperation` is NOT called.
- `buildTagChipSaveRequest` is NOT called.
- `Clock.now()` is NOT called.
- `Feed` and `TagInventory` are unchanged.

---

### REQ-TCU-006: Error Path — snapshot hydration failure

**EARS**: WHEN `getNoteSnapshot(noteId)` returns a non-null snapshot AND `deps.hydrateNote(snapshot)` returns `Err(HydrationFailureReason)` THEN the system SHALL terminate with `Err(SaveError { kind: 'validation', reason: { kind: 'invariant-violated', cause: 'hydration-failed', detail: 'hydration failed for snapshot: <noteId>' } })`.

**Rationale**: A snapshot in the Curate feed should always be hydratable. A hydration failure for such a snapshot indicates a programming error or data corruption. It is classified as `invariant-violated`.

**Edge Cases**:
- No `NoteSaveFailed` public event is emitted (save was never attempted).
- `applyTagOperation` is NOT called.

**Acceptance Criteria**:
- `deps.hydrateNote(snapshot)` returns `Err(reason)` for any `reason` variant.
- The workflow returns `Err(SaveError { kind: 'validation', reason: { kind: 'invariant-violated', cause: 'hydration-failed' } })`.
- `deps.publish` is NOT called.
- `deps.publishInternal` is NOT called.
- `Clock.now()` is NOT called.
- `Feed` and `TagInventory` are unchanged.

---

### REQ-TCU-007: Error Path — NoteEditError from addTag (live variant only)

**EARS**: WHEN `NoteOps.addTag(note, tag, now)` returns `Err(NoteEditError { kind: 'frontmatter', reason: { kind: 'updated-before-created' } })` THEN the system SHALL terminate with `Err(SaveError { kind: 'validation', reason: { kind: 'invariant-violated', cause: 'frontmatter-invariant', detail: 'timestamp invariant violated: updatedAt before createdAt' } })`.

**Live NoteEditError variants (exhaustive)**:
- `{ kind: 'frontmatter', reason: { kind: 'updated-before-created' } }` — clock invariant violated. Unreachable in normal operation (requires a `now` timestamp earlier than `note.frontmatter.createdAt`), but kept for defensive exhaustiveness. Maps to `cause: 'frontmatter-invariant'`.

**Dead NoteEditError variants (unreachable in this workflow)**:
- `{ kind: 'tag', reason: { kind: 'empty' | 'only-whitespace' } }` — dead code. `command.tag` is a pre-validated `Tag` brand; `addTag` cannot produce `TagError` when called with a branded `Tag`.
- `{ kind: 'frontmatter', reason: { kind: 'duplicate-tag' } }` — dead code. `addTag` is short-circuit idempotent per `note.ts:55`; the workflow pre-check guarantees `command.tag ∉ note.frontmatter.tags` before `applyTagOperation` is called on the non-idempotent path.

**Edge Cases**:
- `NoteOps.removeTag` has return type `Note` (not `Result<Note, NoteEditError>`) — remove never fails. Therefore REQ-TCU-007 applies ONLY to the `add` operation path.
- There is no `NoteEditError` path for the `remove` command kind.

**Acceptance Criteria**:
- `applyTagOperation` with a stubbed `addTag` returning `NoteEditError { kind: 'frontmatter', reason: { kind: 'updated-before-created' } }` produces `Err(SaveError { kind: 'validation', reason: { kind: 'invariant-violated', cause: 'frontmatter-invariant' } })`.
- The `tag` and `duplicate-tag` `NoteEditError` variants are dead code; a Tier-0 type-level assertion confirms they cannot appear in the live error path of `applyTagOperationPure`.
- `buildTagChipSaveRequest` is NOT called.
- `deps.publish` is NOT called.
- `deps.publishInternal` is NOT called.
- Vault write port is NOT called.
- `Feed` and `TagInventory` are unchanged.

---

### REQ-TCU-008: Error Path — Vault write failure

**EARS**: WHEN `writeMarkdown` returns `Err(FsError)` THEN the system SHALL emit `NoteSaveFailed` as a public domain event, NOT update Curate projections (Feed and TagInventory remain unchanged — immutable inputs are not replaced), and return `Err(SaveError { kind: 'fs', reason: FsError })`.

**State consistency invariant**: `FeedOps.refreshSort` and `TagInventoryOps.applyNoteFrontmatterEdited` are NOT invoked on the save-failure path. The in-memory state must remain consistent with what is on disk. Since the disk write failed, the projections must not advance.

**SaveError → NoteSaveFailureReason mapping** (for `NoteSaveFailed.reason`):
```
SaveError { kind: 'fs', reason: { kind: 'permission' } } → "permission"
SaveError { kind: 'fs', reason: { kind: 'disk-full' } }  → "disk-full"
SaveError { kind: 'fs', reason: { kind: 'lock' } }       → "lock"
SaveError { kind: 'fs', reason: { kind: 'not-found' } }  → "unknown"
SaveError { kind: 'fs', reason: { kind: 'unknown' } }    → "unknown"
SaveError { kind: 'validation', reason: _ }              → "unknown"
```

**Edge Cases**:
- `NoteFileSaved` is NOT emitted on this path.
- `TagInventoryUpdated` is NOT emitted.
- `FeedOps.refreshSort` is NOT called.
- `TagInventoryOps.applyNoteFrontmatterEdited` is NOT called.

**Acceptance Criteria**:
- `writeMarkdown` produces `Err(FsError)`.
- `deps.publish(NoteSaveFailed)` is called exactly once with correctly mapped `reason`.
- `FeedOps.refreshSort` is NOT called.
- `TagInventoryOps.applyNoteFrontmatterEdited` is NOT called.
- Workflow returns `Err(SaveError { kind: 'fs', reason: FsError })`.
- `Feed` and `TagInventory` are unchanged (immutable inputs remain; no new instances are created on this path).

---

### REQ-TCU-009: previousFrontmatter sourcing and non-null invariant

**EARS**: WHEN `MutatedNote` is constructed THEN `MutatedNote.previousFrontmatter` SHALL equal the `Note.frontmatter` value that was loaded from the Curate snapshot store — specifically, the frontmatter of the hydrated `Note` before any tag mutation is applied.

**This is the key field** that `TagInventoryOps.applyNoteFrontmatterEdited` uses to compute the tag delta (`before` parameter). Sourcing from any other location (e.g., the editor's in-memory buffer) would corrupt the inventory diff.

**Non-null invariant**: In `TagChipUpdate`, `NoteFileSaved.previousFrontmatter` is always non-null. The source is `MutatedNote.previousFrontmatter`, which is the loaded `Note.frontmatter` — always a `Frontmatter` value, never null. The `null` branch of `NoteFileSaved.previousFrontmatter: Frontmatter | null` does not occur in this workflow. This is a type-narrowing guarantee: every `NoteFileSaved` emitted by this workflow has `previousFrontmatter !== null`.

**Concurrent editor note**: If the same note is currently open in the Capture editor, the editor's in-memory frontmatter is NOT used. The Curate snapshot is the authoritative source for this workflow. This workflow does not coordinate with the Capture editor session. Structural guarantee: `TagChipUpdateDeps` does not include any editor-buffer port (no `getEditorBuffer`, no `editingState`). Therefore the workflow cannot access Capture editor state by construction.

**Acceptance Criteria**:
- `applyTagOperationPure(note, command, now)` sets `MutatedNote.previousFrontmatter = note.frontmatter` (the frontmatter of the Note returned by `loadCurrentNote`), not any editor buffer value.
- `SaveNoteRequested.previousFrontmatter === MutatedNote.previousFrontmatter`.
- `NoteFileSaved.previousFrontmatter === MutatedNote.previousFrontmatter` (the Vault write port must forward this field; it is always non-null in this workflow).
- `TagInventoryOps.applyNoteFrontmatterEdited(inventory, before: MutatedNote.previousFrontmatter, after: MutatedNote.note.frontmatter, now)` is called in `updateProjectionsAfterSave` with these exact arguments.
- A Tier-0 type-level proof obligation asserts `NoteFileSaved['previousFrontmatter']` is narrowed to `Frontmatter` (non-null) for all events emitted by this workflow.

---

### REQ-TCU-010: Projection update correctness

**EARS**: WHEN `writeMarkdown` returns `Ok(NoteFileSaved)` THEN the system SHALL call `updateProjectionsAfterSave(deps)(feed, inventory, event)` (canonical 3-arg inner form) which SHALL invoke `FeedOps.refreshSort(feed, deps.getAllSnapshots())` and `TagInventoryOps.applyNoteFrontmatterEdited(inventory, before, after, event.occurredOn)` and return a new `IndexedNote { kind: 'IndexedNote', noteId, feed: newFeed, tagInventory: newInventory }` where `newFeed` and `newInventory` are new immutable instances. `event.occurredOn` equals the workflow's single `now` by construction (see occurredOn threading invariant).

**occurredOn threading invariant**: The single `now` produced by `Clock.now()` is threaded through every time-stamped artifact in the workflow:
```
now
  → applyTagOperationPure(note, command, now)           (stamps Note.frontmatter.updatedAt)
  → buildTagChipSaveRequest(mutated, now)               (→ SaveNoteRequested.occurredOn = now)
  → writeMarkdown(SaveNoteRequested)                    (→ NoteFileSaved.occurredOn = now, echoed by Vault)
  → updateProjectionsAfterSave(deps)(feed, inv, event)  (sources now = event.occurredOn)
  → TagInventoryUpdated.occurredOn = event.occurredOn
```

Therefore: `now === SaveNoteRequested.occurredOn === NoteFileSaved.occurredOn === TagInventoryUpdated.occurredOn` by construction. The Vault write port echoes `SaveNoteRequested.occurredOn` back as `NoteFileSaved.occurredOn`; `updateProjectionsAfterSave` then sources `now` from `event.occurredOn` without a second `Clock.now()` call.

**TagInventoryUpdated event**: After `updateProjectionsAfterSave`, the workflow publishes a `TagInventoryUpdated` internal event via `deps.publishInternal`:
- `addedTags`: tags in `after.tags` that are not in `before.tags`
- `removedTags`: tags in `before.tags` that are not in `after.tags`
- `occurredOn: event.occurredOn` — sourced from `NoteFileSaved.occurredOn`, which equals the workflow's single `now` by construction (see threading invariant above). `SaveNoteRequested.occurredOn` and `TagInventoryUpdated.occurredOn` are the same instant by design: in this synchronous in-memory pipeline, the projection mutation is functionally instantaneous, and consumers reading the event log see a coherent single moment. This is a deliberate design choice, not a timing shortcut.

**Acceptance Criteria**:
- `FeedOps.refreshSort(feed, deps.getAllSnapshots())` is called exactly once on the happy path.
- `TagInventoryOps.applyNoteFrontmatterEdited(inventory, before, after, now)` is called exactly once on the happy path.
- `IndexedNote.feed` is the result of `FeedOps.refreshSort` (new `Feed` instance).
- `IndexedNote.tagInventory` is the result of `applyNoteFrontmatterEdited` (new `TagInventory` instance).
- `deps.publishInternal(TagInventoryUpdated { kind: 'tag-inventory-updated', addedTags, removedTags, occurredOn: event.occurredOn })` is called exactly once on the happy path.
- `TagInventoryUpdated.occurredOn === NoteFileSaved.occurredOn === SaveNoteRequested.occurredOn === now` by construction (occurredOn threading invariant).
- On the add path: `IndexedNote.tagInventory` contains `tag` with incremented (or new) `usageCount`.
- On the remove path: `IndexedNote.tagInventory` entry for `tag` has decremented `usageCount` or is absent.
- `updateProjectionsAfterSave` is NOT called on any error path.

---

### REQ-TCU-011: Event channel — TagChipAddedOnFeed and TagChipRemovedOnFeed are Curate internal events

**EARS**: WHEN the feed UI emits a tag chip interaction THEN the system SHALL emit `TagChipAddedOnFeed` or `TagChipRemovedOnFeed` as Curate internal events (members of `CurateInternalEvent`), and the application layer SHALL translate them into `TagChipCommand` before invoking `TagChipUpdate`.

**Acceptance Criteria**:
- `TagChipAddedOnFeed` and `TagChipRemovedOnFeed` are members of `CurateInternalEvent` (source: `curate/internal-events.ts`).
- These events are NOT members of `PublicDomainEvent`.
- `NoteFileSaved` IS a member of `PublicDomainEvent` and is emitted by `deps.publish` after successful write.
- `NoteSaveFailed` IS a member of `PublicDomainEvent` and is emitted by `deps.publish` on write failure.
- `TagInventoryUpdated` IS a member of `CurateInternalEvent` and is emitted by `deps.publishInternal` after projection update.

---

### REQ-TCU-012: Non-functional — Clock budget and I/O boundary

**EARS**: WHEN the `TagChipUpdate` workflow executes THEN the system SHALL call `Clock.now()` at most once per invocation (on write paths only). I/O occurs only in `writeMarkdown` (async). Steps 2 (pure helper), 3, 4, 6 are free of I/O.

**Clock.now() call sites**:

| Path | Clock.now() calls |
|------|-------------------|
| not-found error | 0 |
| hydration-fail error | 0 |
| idempotent add (tag already present) | 0 |
| idempotent remove (tag already absent) | 0 |
| tag-edit-error (addTag returns Err) | 1 |
| happy add (write succeeds) | 1 |
| happy remove (write succeeds) | 1 |
| save-fail (add or remove) | 1 |

Maximum `Clock.now()` calls per workflow invocation: **1**.

**Acceptance Criteria**:
- `Clock.now()` is called at most once per invocation.
- On idempotent paths (add of already-present tag, remove of already-absent tag): `Clock.now()` is NOT called.
- On not-found and hydration-fail paths: `Clock.now()` is NOT called.
- On all write paths (happy or save-fail): `Clock.now()` is called exactly once, up-front after the non-idempotent path is confirmed.
- `loadCurrentNote` does NOT call `deps.clockNow()`.
- `updateProjectionsAfterSave` does NOT call `deps.clockNow()` (it sources `now` from `event.occurredOn`, which equals the orchestrator's single `Clock.now()` result by construction — the `now` value is threaded via `SaveNoteRequested.occurredOn` → `NoteFileSaved.occurredOn` → `event.occurredOn`).
- `buildTagChipSaveRequest` uses the `now` obtained by the orchestrator; it does NOT call `deps.clockNow()` itself.
