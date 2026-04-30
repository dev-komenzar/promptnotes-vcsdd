# Verification Architecture: EditPastNoteStart

**Feature**: `edit-past-note-start`
**Phase**: 1b
**Revision**: 3
**Mode**: lean
**Source**: `docs/domain/workflows.md` Workflow 3, `docs/domain/code/ts/src/capture/states.ts`, `docs/domain/code/ts/src/capture/stages.ts`, `docs/domain/code/ts/src/capture/internal-events.ts`, `docs/domain/code/ts/src/shared/errors.ts`

**Revision 2 changes** (addressing FIND-SPEC-004, FIND-SPEC-007, FIND-SPEC-008):
- PROP-EPNS-004 promoted to `required: true` (FIND-SPEC-004)
- New PROP-EPNS-019: Clock.now() behavior in same-note path (FIND-SPEC-007)
- classifyCurrentSession signature updated to `(state, currentNote)` (FIND-SPEC-008)

**Revision 3 changes** (addressing FIND-SPEC-009, FIND-SPEC-013):
- Clock.now() budget updated to ≤2 per workflow; port contract updated (FIND-SPEC-009)
- PROP-EPNS-013 updated: empty path requires 2 Clock.now() calls (FIND-SPEC-013)
- BlurSave port now receives `previousFrontmatter` (FIND-SPEC-011)

---

## Purity Boundary Map

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Pre-guard | Same-note check | **Effectful shell** | Calls `Clock.now()` for event timestamp; emits `EditorFocusedOnPastNote`; short-circuits pipeline |
| Step 1 | `classifyCurrentSession` | **Pure core** | Accepts `(EditingSessionState, Note \| null)`; returns `CurrentSessionDecision`; no ports, no side effects, deterministic. Property-test target. |
| Step 2a | `flushCurrentSession` (no-current path) | **Pure shell (no-op)** | Returns `FlushedCurrentSession { result: 'no-op' }` with no I/O |
| Step 2b | `flushCurrentSession` (empty path) | **Effectful shell** | Calls `Clock.now()` for timestamp; calls `emit(EmptyNoteDiscarded)` |
| Step 2c | `flushCurrentSession` (dirty path) | **Effectful shell** | Invokes `CaptureAutoSave` blur save (I/O); emits `NoteFileSaved` or `NoteSaveFailed` on result |
| Step 3a | Snapshot → Note hydration | **Pure core** | `NoteFileSnapshot → Note` conversion; deterministic; no ports. Property-test target. |
| Step 3b | `startNewSession` | **Effectful shell** | Calls `Clock.now()` exactly once; calls `emit(EditorFocusedOnPastNote)` |

**Formally verifiable core**: `classifyCurrentSession` and `NoteFileSnapshot → Note` hydration.

**Effectful shell**: pre-guard, `flushCurrentSession` (empty/dirty), `startNewSession`, `emit` port.

---

## Port Contracts

```typescript
// ── Clock ──────────────────────────────────────────────────────────────
/** Returns the current wall-clock time. Called ≤2 times per workflow invocation.
 *  Path-specific budgets:
 *    same-note guard: 1, no-current: 1, empty: 2, dirty-success: 1, dirty-fail: 0 */
type ClockNow = () => Timestamp;

// ── CaptureAutoSave (blur-save port) ──────────────────────────────────
/** Trigger a blur save for the current note. Invoked only when session is dirty.
 *  Returns Ok(NoteFileSaved) on success or Err(SaveError) on failure.
 *  The port handles serialization and file write internally.
 *  On success, returns the NoteFileSaved event with all fields populated.
 *  On failure, returns SaveError; the orchestrator maps it to NoteSaveFailureReason
 *  via the mapping defined in REQ-EPNS-004. */
type BlurSave = (
  noteId: NoteId,
  note: Note,
  previousFrontmatter: Frontmatter | null,
) => Result<NoteFileSaved, SaveError>;

// ── emit ───────────────────────────────────────────────────────────────
/** Publish a domain event to the event bus.
 *  Accepts both PublicDomainEvent and CaptureInternalEvent. */
type Emit = (event: PublicDomainEvent | CaptureInternalEvent) => void;

// ── NoteOps.isEmpty ────────────────────────────────────────────────────
/** Pure predicate: returns true if the Note body is empty or whitespace-only. */
type IsEmpty = (note: Note) => boolean;

// ── Snapshot hydration ─────────────────────────────────────────────────
/** Pure conversion from NoteFileSnapshot to Note.
 *  Snapshot is pre-validated by feed insertion; failure is a programming error. */
type HydrateSnapshot = (snapshot: NoteFileSnapshot) => Note;

// ── classifyCurrentSession (pure) ────────────────────────────────────
/** Pure function: (EditingSessionState, Note | null) → CurrentSessionDecision.
 *  No ports. Referentially transparent.
 *  SavingState and SwitchingState are not valid inputs; callers must guard. */
type ClassifyCurrentSession = (
  state: EditingSessionState,
  currentNote: Note | null,
) => CurrentSessionDecision;
// where:
// type CurrentSessionDecision =
//   | { kind: 'no-current' }
//   | { kind: 'empty'; noteId: NoteId }
//   | { kind: 'dirty'; noteId: NoteId; note: Note };
```

---

## Proof Obligations

| ID | Description | Covers REQ | Tier | Required | Tool |
|----|-------------|-----------|------|----------|------|
| PROP-EPNS-001 | `classifyCurrentSession` is pure: same `(EditingSessionState, Note \| null)` input always produces identical `CurrentSessionDecision` output | REQ-EPNS-007, REQ-EPNS-012 | 1 | **true** | fast-check (property: ∀ state & note, fn(state, note) deepEquals fn(state, note)) |
| PROP-EPNS-002 | `classifyCurrentSession(IdleState, null)` always returns `{ kind: 'no-current' }` | REQ-EPNS-001, REQ-EPNS-007 | 1 | **true** | fast-check (property: ∀ idle state, result.kind === 'no-current') |
| PROP-EPNS-003 | `classifyCurrentSession(EditingState, note)`: isEmpty(note) ↔ `'empty'`; !isEmpty(note) ↔ `'dirty'` | REQ-EPNS-002, REQ-EPNS-003, REQ-EPNS-007 | 1 | **true** | fast-check (property: isEmpty ↔ 'empty'; !isEmpty ↔ 'dirty') |
| PROP-EPNS-004 | `classifyCurrentSession(SaveFailedState, note)` always returns `{ kind: 'dirty', noteId: state.currentNoteId, note }` regardless of `pendingNextNoteId` value | REQ-EPNS-006, REQ-EPNS-007 | 1 | **true** | fast-check (property: ∀ SaveFailedState & Note, result.kind === 'dirty' ∧ result.note === note) |
| PROP-EPNS-005 | `SwitchError` type is exhaustive: only `'save-failed-during-switch'` kind exists; switch over it covers all variants with a `never` branch | REQ-EPNS-011 | 0 | **true** | TypeScript type exhaustiveness (never branch in switch) |
| PROP-EPNS-006 | Happy path (no-current): `EditorFocusedOnPastNote` is emitted, no `EmptyNoteDiscarded`, no save I/O | REQ-EPNS-001, REQ-EPNS-009, REQ-EPNS-010 | 2 | false | Example-based test with emit spy and BlurSave stub (not called) |
| PROP-EPNS-007 | Happy path (empty session): `EmptyNoteDiscarded` emitted before `EditorFocusedOnPastNote`; no save I/O | REQ-EPNS-002, REQ-EPNS-009, REQ-EPNS-010 | 2 | false | Example-based test with ordered emit spy |
| PROP-EPNS-008 | Happy path (dirty session, save succeeds): `NoteFileSaved` emitted before `EditorFocusedOnPastNote`; `FlushedCurrentSession.result === 'saved'` | REQ-EPNS-003, REQ-EPNS-010 | 2 | false | Example-based test with BlurSave stub returning Ok |
| PROP-EPNS-009 | Error path (dirty, save fails): `SwitchError` returned; `NoteSaveFailed` emitted; `EditorFocusedOnPastNote` NOT emitted; `EditingSessionState.status === 'save-failed'`; `pendingNextNoteId === selectedNoteId` | REQ-EPNS-004 | 2 | false | Example-based test with BlurSave stub returning Err(SaveError) |
| PROP-EPNS-010 | Same-note re-selection: no flush, no save I/O, `EmptyNoteDiscarded` NOT emitted, `EditingSessionState` unchanged, `EditorFocusedOnPastNote` emitted with Clock.now() timestamp | REQ-EPNS-005 | 2 | false | Example-based test: selectedNoteId === currentNoteId; verify Clock.now called once |
| PROP-EPNS-011 | Save-failed → re-select new note, save succeeds: `NewSession.noteId === newlySelectedNoteId` | REQ-EPNS-006 | 2 | false | Example-based test: SaveFailedState with non-null pendingNextNoteId, select different note, save succeeds |
| PROP-EPNS-012 | Save-failed → re-select new note, save fails again: `SwitchError.pendingNextNoteId === newlySelectedNoteId` (old pending overwritten) | REQ-EPNS-006 | 2 | false | Example-based test: SaveFailedState, select different note, save fails → SwitchError |
| PROP-EPNS-013 | `Clock.now()` call count per path: same-note=1, no-current=1, empty=2, dirty-success=1, dirty-fail=1. Never called in `classifyCurrentSession`. | REQ-EPNS-008, REQ-EPNS-012 | 1 | false | fast-check / spy wrapper: instrument `Clock.now`; verify call count per path matches budget table |
| PROP-EPNS-014 | `Clock.now()` is called exactly once when the workflow terminates with `SwitchError` (for `NoteSaveFailed.occurredOn`) | REQ-EPNS-004, REQ-EPNS-012 | 2 | false | Example-based test: dirty path, save fails → spy confirms Clock.now called once |
| PROP-EPNS-015 | `EmptyNoteDiscarded` is a member of `PublicDomainEvent`; `EditorFocusedOnPastNote` is a member of `CaptureInternalEvent` and is NOT a member of `PublicDomainEvent` | REQ-EPNS-009, REQ-EPNS-010 | 0 | false | TypeScript type assertion: Extract + _IsNever checks |
| PROP-EPNS-016 | Event ordering on empty path: `EmptyNoteDiscarded` strictly before `EditorFocusedOnPastNote` | REQ-EPNS-002, REQ-EPNS-009 | 2 | false | Example-based test with ordered emit spy |
| PROP-EPNS-017 | Event ordering on dirty-success path: `NoteFileSaved` strictly before `EditorFocusedOnPastNote` | REQ-EPNS-003, REQ-EPNS-010 | 2 | false | Example-based test with ordered emit spy |
| PROP-EPNS-018 | Full workflow integration — all three happy paths produce `EditingSessionState.status === 'editing'` with `currentNoteId === selectedNoteId` | REQ-EPNS-001 through REQ-EPNS-003, REQ-EPNS-008 | 3 | false | Integration test with port fakes |
| PROP-EPNS-019 | Same-note path: `EditorFocusedOnPastNote.occurredOn` equals the `Clock.now()` value from the pre-pipeline guard | REQ-EPNS-005, REQ-EPNS-010 | 2 | false | Example-based test: verify event timestamp matches Clock.now() spy return value |

---

## Verification Tiers

- **Tier 0**: TypeScript type-level proof. No runtime test needed; the type system enforces it at compile time.
- **Tier 1**: Property-based test with fast-check. Generated random inputs; checks structural invariants.
- **Tier 2**: Example-based unit test. Concrete inputs and expected outputs; verifies specific behaviors.
- **Tier 3**: Integration test. Exercises the full pipeline with port fakes/stubs; tests cross-step coordination.

In lean mode, `required: true` is reserved for the highest-risk invariants:
- **PROP-EPNS-001** (`classifyCurrentSession` purity) — core correctness claim; the entire pure/effectful boundary contract depends on this step being side-effect-free.
- **PROP-EPNS-002** (idle → no-current) — entry-condition for the skip-flush fast path; misclassification here would cause spurious save I/O.
- **PROP-EPNS-003** (empty/dirty classification) — determines whether a blur save is triggered; misclassification would either cause data loss (dirty note treated as empty) or spurious I/O (empty note saved).
- **PROP-EPNS-004** (save-failed → dirty) — data-loss risk: misclassification of SaveFailedState could discard unsaved content.
- **PROP-EPNS-005** (`SwitchError` exhaustiveness) — ensures no unhandled error variant reaches the caller.

---

## Coverage Matrix

| Requirement | PROP IDs |
|-------------|---------|
| REQ-EPNS-001 | PROP-EPNS-002, PROP-EPNS-006, PROP-EPNS-018 |
| REQ-EPNS-002 | PROP-EPNS-003, PROP-EPNS-007, PROP-EPNS-016, PROP-EPNS-018 |
| REQ-EPNS-003 | PROP-EPNS-003, PROP-EPNS-008, PROP-EPNS-017, PROP-EPNS-018 |
| REQ-EPNS-004 | PROP-EPNS-009, PROP-EPNS-014 |
| REQ-EPNS-005 | PROP-EPNS-010, PROP-EPNS-019 |
| REQ-EPNS-006 | PROP-EPNS-004, PROP-EPNS-011, PROP-EPNS-012 |
| REQ-EPNS-007 | PROP-EPNS-001, PROP-EPNS-002, PROP-EPNS-003, PROP-EPNS-004 |
| REQ-EPNS-008 | PROP-EPNS-013, PROP-EPNS-018 |
| REQ-EPNS-009 | PROP-EPNS-006, PROP-EPNS-007, PROP-EPNS-015, PROP-EPNS-016 |
| REQ-EPNS-010 | PROP-EPNS-006, PROP-EPNS-007, PROP-EPNS-008, PROP-EPNS-015, PROP-EPNS-017, PROP-EPNS-019 |
| REQ-EPNS-011 | PROP-EPNS-005 |
| REQ-EPNS-012 | PROP-EPNS-001, PROP-EPNS-013, PROP-EPNS-014 |

Every requirement has at least one proof obligation. Five `required: true` obligations (PROP-EPNS-001 through PROP-EPNS-005) cover the highest-risk invariants and span Tiers 0–1. Total proof obligations: 19 (PROP-EPNS-001 through PROP-EPNS-019).
