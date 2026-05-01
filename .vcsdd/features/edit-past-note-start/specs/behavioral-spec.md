# Behavioral Specification: EditPastNoteStart

**Feature**: `edit-past-note-start`
**Phase**: 1a
**Revision**: 3
**Source of truth**: `docs/domain/workflows.md` Workflow 3, `docs/domain/code/ts/src/capture/states.ts`, `docs/domain/code/ts/src/capture/stages.ts`, `docs/domain/code/ts/src/capture/internal-events.ts`, `docs/domain/code/ts/src/shared/events.ts`, `docs/domain/code/ts/src/shared/errors.ts`
**Scope**: Synchronous workflow in Capture context that handles switching from the current editing session to a past note selected in the feed. Workflow terminates after the 3-step pipeline completes or returns a `SwitchError`. UI reaction to errors and the CaptureAutoSave internals are out of scope.

**Revision 2 changes** (addressing FIND-SPEC-001 through FIND-SPEC-008):
- Pipeline input now includes `currentNote: Note | null` to supply Note data for SaveFailedState (FIND-SPEC-001)
- Same-note re-selection is a pre-pipeline guard with its own `Clock.now()` call (FIND-SPEC-002)
- `SaveError → NoteSaveFailureReason` mapping defined explicitly (FIND-SPEC-003)
- `NoteFileSaved` field sourcing specified (FIND-SPEC-005)
- Same-note check clarified for all states (FIND-SPEC-006)
- Clock.now() budget updated (FIND-SPEC-007)

**Revision 3 changes** (addressing FIND-SPEC-009 through FIND-SPEC-013):
- Clock.now() budget standardized to ≤2 per workflow invocation (FIND-SPEC-009)
- EmptyNoteDiscarded.occurredOn deterministically sourced from flush step's own Clock.now() call (FIND-SPEC-010)
- Pipeline input now includes `previousFrontmatter: Frontmatter | null` for BlurSave (FIND-SPEC-011)
- Same-note guard on SaveFailedState clarified: emits focus event, error state unchanged (FIND-SPEC-012)
- PROP-EPNS-013 updated to include empty path (2 calls) (FIND-SPEC-013)

---

## Pipeline Overview

```
[Pre-pipeline guard: same-note check]
    ↓ (not same note)
PastNoteSelection → CurrentSessionDecision → FlushedCurrentSession → NewSession
```

Each stage carries stronger guarantees than the previous. The `classifyCurrentSession` step is pure. `flushCurrentSession` may perform I/O (blur save) only when the current session is dirty. `startNewSession` is in-memory with a single `Clock.now()` call.

## Pipeline Input

```typescript
type EditPastNoteStartInput = {
  readonly selection: PastNoteSelection;              // from PastNoteSelected event
  readonly currentState: EditingSessionState;         // current session state
  readonly currentNote: Note | null;                  // current Note being edited (null when idle)
  readonly previousFrontmatter: Frontmatter | null;   // frontmatter before current edits (for TagInventory delta)
};
```

The caller (application layer) provides `currentNote` and `previousFrontmatter` from the in-memory editing buffer. This is necessary because `SaveFailedState` and `EditingState` do not carry `Note` directly — the Note and its pre-edit frontmatter live in the editing buffer, not in the state machine. `previousFrontmatter` is passed to the BlurSave port for `NoteFileSaved.previousFrontmatter` field sourcing.

---

## Requirements

### REQ-EPNS-001: Happy Path — no-current session, select past note immediately

**EARS**: WHEN `PastNoteSelected` arrives AND `EditingSessionState.status === 'idle'` THEN the system SHALL classify the current session as `'no-current'`, skip the flush step (no-op), hydrate the selected `NoteFileSnapshot` into a `Note`, set `EditingSessionState` to `editing(selectedNoteId, isDirty: false)`, and emit `EditorFocusedOnPastNote`.

**Edge Cases**:
- `IdleState` with `status: 'idle'`: the only state that yields `'no-current'` — no `EmptyNoteDiscarded` event is emitted.
- `currentNote` is `null` for `IdleState`; this is expected and does not affect classification.

**Acceptance Criteria**:
- `classifyCurrentSession(IdleState, null)` returns `{ kind: 'no-current' }`.
- `FlushedCurrentSession.result === 'no-op'`.
- `NewSession.noteId === selectedNoteId`.
- `EditingSessionState.status === 'editing'` with `currentNoteId === selectedNoteId` and `isDirty === false`.
- `EditorFocusedOnPastNote { kind: 'editor-focused-on-past-note', noteId: selectedNoteId, occurredOn: Timestamp }` is emitted exactly once.
- No `EmptyNoteDiscarded` event is emitted.
- No save I/O is performed.

---

### REQ-EPNS-002: Happy Path — empty session, discard and select past note

**EARS**: WHEN `PastNoteSelected` arrives AND `EditingSessionState.status === 'editing'` AND the current note body is empty (whitespace-only per `NoteOps.isEmpty`) THEN the system SHALL classify the current session as `'empty'`, emit `EmptyNoteDiscarded` for the current note, hydrate the selected snapshot, set `EditingSessionState` to `editing(selectedNoteId)`, and emit `EditorFocusedOnPastNote`.

**Edge Cases**:
- Body is exactly `""` (empty string): classified as empty.
- Body is `"   \n\t"` (whitespace only): classified as empty per `NoteOps.isEmpty`.
- Body has at least one non-whitespace character: NOT empty — see REQ-EPNS-003.

**Acceptance Criteria**:
- `classifyCurrentSession(EditingState where isEmpty(note), note)` returns `{ kind: 'empty', noteId: currentNoteId }`.
- `EmptyNoteDiscarded { kind: 'empty-note-discarded', noteId: currentNoteId, occurredOn: Timestamp }` is emitted exactly once, before `EditorFocusedOnPastNote`.
- `FlushedCurrentSession.result === 'discarded'`.
- `NewSession.noteId === selectedNoteId`.
- `EditingSessionState.status === 'editing'` with `currentNoteId === selectedNoteId` and `isDirty === false`.
- `EditorFocusedOnPastNote` is emitted after `EmptyNoteDiscarded`.
- No save I/O is performed.

---

### REQ-EPNS-003: Happy Path — dirty session, save succeeds, then select past note

**EARS**: WHEN `PastNoteSelected` arrives AND `EditingSessionState.status === 'editing'` AND the current note body is non-empty (dirty) THEN the system SHALL classify the current session as `'dirty'`, invoke `CaptureAutoSave` blur save, on save success emit `NoteFileSaved`, set `EditingSessionState` to `editing(selectedNoteId)`, and emit `EditorFocusedOnPastNote`.

**Edge Cases**:
- `isDirty === false` but body is non-empty: still classified as `'dirty'` because classification is based on body content (via `NoteOps.isEmpty`), not the `isDirty` flag. The `isDirty` flag tracks editor mutation state; `classifyCurrentSession` uses isEmpty for save-or-discard decisions.

**NoteFileSaved field sourcing**: The `NoteFileSaved` event is produced by the CaptureAutoSave blur save port. Its fields are sourced as follows:
- `noteId`: from the current editing session's `currentNoteId`
- `body`: from the current `Note.body` (the `currentNote` input)
- `frontmatter`: from the current `Note.frontmatter` with `updatedAt` stamped by CaptureAutoSave
- `previousFrontmatter`: from the `DirtyEditingSession.previousFrontmatter` (tracked by Capture state)
- `occurredOn`: stamped by CaptureAutoSave upon successful write

**Acceptance Criteria**:
- `classifyCurrentSession(EditingState where !isEmpty(note), note)` returns `{ kind: 'dirty', noteId: currentNoteId, note: Note }`.
- `CaptureAutoSave` blur save is invoked with the current note.
- `NoteFileSaved` public domain event is emitted upon save success with all required fields.
- `FlushedCurrentSession.result === 'saved'`.
- `NewSession.noteId === selectedNoteId`.
- `EditingSessionState.status === 'editing'` with `currentNoteId === selectedNoteId` and `isDirty === false`.
- `EditorFocusedOnPastNote` is emitted after `NoteFileSaved`.
- `SwitchError` is NOT produced.

---

### REQ-EPNS-004: Error Path — dirty session, save fails during switch

**EARS**: WHEN `PastNoteSelected` arrives AND the current session is `'dirty'` AND `CaptureAutoSave` returns a `SaveError` THEN the system SHALL terminate with `SwitchError { kind: 'save-failed-during-switch', underlying: SaveError, pendingNextNoteId: selectedNoteId }` AND emit `NoteSaveFailed` AND NOT start a new editing session for the selected note.

**SaveError → NoteSaveFailureReason mapping**: The `NoteSaveFailed` event uses `NoteSaveFailureReason` (a flat string union), not `SaveError` (a discriminated union). The mapping is:
- `SaveError { kind: 'fs', reason: { kind: 'permission' } }` → `"permission"`
- `SaveError { kind: 'fs', reason: { kind: 'disk-full' } }` → `"disk-full"`
- `SaveError { kind: 'fs', reason: { kind: 'lock' } }` → `"lock"`
- `SaveError { kind: 'fs', reason: { kind: 'not-found' } }` → `"unknown"` (fs not-found during save is unexpected)
- `SaveError { kind: 'fs', reason: { kind: 'unknown' } }` → `"unknown"`
- `SaveError { kind: 'validation', reason: _ }` → `"unknown"` (validation failures during blur save are internal bugs)

This mapping is the responsibility of the `flushCurrentSession` step (or the CaptureAutoSave port adapter).

**Edge Cases**:
- `EditingSessionState` after failure: transitions to `SaveFailedState { status: 'save-failed', currentNoteId, pendingNextNoteId: selectedNoteId, lastSaveError }`.

**Acceptance Criteria**:
- `SwitchError.kind === 'save-failed-during-switch'`.
- `SwitchError.pendingNextNoteId === selectedNoteId` (the note the user selected).
- `SwitchError.underlying` carries the exact `SaveError` from `CaptureAutoSave`.
- `NoteSaveFailed { kind: 'note-save-failed', noteId: currentNoteId, reason: NoteSaveFailureReason, occurredOn }` is emitted with correctly mapped reason.
- `EditingSessionState.status === 'save-failed'` after the error.
- `EditingSessionState.pendingNextNoteId === selectedNoteId` after the error.
- `EditorFocusedOnPastNote` is NOT emitted.
- `NewSession` stage is NOT reached.
- `Clock.now()` is NOT called (startNewSession is never reached).

---

### REQ-EPNS-005: Edge Case — same note re-selected (pre-pipeline guard, no-op)

**EARS**: WHEN `PastNoteSelected` arrives AND the selected `noteId` equals the currently editing note's ID THEN the system SHALL treat the selection as a no-op: no flush, no new session creation, and emit `EditorFocusedOnPastNote` to refocus the editor on the same note.

**Same-note detection**: The check compares `selection.noteId` against:
- `EditingState.currentNoteId` — the currently editing note
- `SaveFailedState.currentNoteId` — the note whose save failed (NOT `pendingNextNoteId`). When same-note is detected on SaveFailedState, the guard emits `EditorFocusedOnPastNote` but does NOT clear the save-failed status or error. The `EditingSessionState` remains in `save-failed` status — the user must still choose Retry/Discard/Cancel to resolve the error. The focus event merely re-affirms the current editor target.
- `IdleState` — has no `currentNoteId`; same-note check always fails (proceeds to pipeline)
- `SavingState` / `SwitchingState` — not valid inputs (see REQ-EPNS-007)

**Clock.now() sourcing**: The `EditorFocusedOnPastNote.occurredOn` is sourced from `Clock.now()` called once in the pre-pipeline guard. This is the only Clock.now() call when the same-note path is taken.

**Acceptance Criteria**:
- No save I/O is performed.
- `EmptyNoteDiscarded` is NOT emitted.
- `NoteFileSaved` is NOT emitted.
- `EditingSessionState` is unchanged (same `status`, same `currentNoteId`, same `isDirty` / `lastSaveError`).
- `EditorFocusedOnPastNote { noteId: selectedNoteId, occurredOn: Clock.now() }` is emitted exactly once.
- `SwitchError` is NOT produced.
- `classifyCurrentSession` is NOT called (pre-pipeline guard short-circuits).
- When `status === 'save-failed'`: the save-failed state persists; the focus event does not imply error resolution.

---

### REQ-EPNS-006: Edge Case — selecting a past note while in `save-failed` state

**EARS**: WHEN `PastNoteSelected` arrives AND `EditingSessionState.status === 'save-failed'` AND the selected note is different from `currentNoteId` THEN the system SHALL classify the session as `'dirty'` using the `currentNote` from the pipeline input, attempt a new save via `CaptureAutoSave`, and on success proceed to `startNewSession`; on failure return `SwitchError` with the new `SaveError` and `pendingNextNoteId` updated to the newly selected note.

**Note sourcing for SaveFailedState**: `SaveFailedState` does not contain a `Note` field. The `currentNote` is provided by the pipeline input `EditPastNoteStartInput.currentNote`, which the caller retrieves from the in-memory editing buffer. `classifyCurrentSession(SaveFailedState, currentNote)` returns `{ kind: 'dirty', noteId: state.currentNoteId, note: currentNote }`.

**Edge Cases**:
- `SaveFailedState.pendingNextNoteId` may be non-null (a previous switch was interrupted): the new `selectedNoteId` supersedes the old `pendingNextNoteId`.
- `SaveFailedState.pendingNextNoteId === null` (idle save failed): treat as a clean switch to the selected note.

**Acceptance Criteria**:
- `classifyCurrentSession(SaveFailedState, currentNote)` returns `{ kind: 'dirty', noteId: currentNoteId, note: currentNote }`.
- On save success: `FlushedCurrentSession.result === 'saved'` and `NewSession.noteId === selectedNoteId`.
- On save failure: `SwitchError.pendingNextNoteId === selectedNoteId` (the newly selected note, not the old `pendingNextNoteId`).
- `EditingSessionState.pendingNextNoteId` is updated to the new `selectedNoteId` after the failure.

---

### REQ-EPNS-007: Pure Step — classifyCurrentSession

**EARS**: WHEN `classifyCurrentSession` is called with an `EditingSessionState` and `currentNote: Note | null` THEN the system SHALL return a `CurrentSessionDecision` deterministically with no side effects and no I/O.

**Classification table**:

| `EditingSessionState.status` | `currentNote` | `CurrentSessionDecision.kind` | Rationale |
|---|---|---|---|
| `'idle'` | `null` | `'no-current'` | No active note; nothing to flush |
| `'editing'` | `Note` where `NoteOps.isEmpty(note)` | `'empty'` | Empty note; discard without save |
| `'editing'` | `Note` where `!NoteOps.isEmpty(note)` | `'dirty'` | Has content; must save before switching |
| `'save-failed'` | `Note` (non-null) | `'dirty'` | Save previously failed; content is present and must be saved or explicitly discarded |
| `'saving'` | any | NOT APPLICABLE | Cannot initiate switch while auto-save is in progress (out of scope) |
| `'switching'` | any | NOT APPLICABLE | Already switching; concurrent switch not handled |

**Function signature**:
```typescript
type ClassifyCurrentSession = (
  state: EditingSessionState,
  currentNote: Note | null,
) => CurrentSessionDecision;
```

**Acceptance Criteria**:
- `classifyCurrentSession` accepts `EditingSessionState` and `Note | null` as inputs; it calls no ports.
- The function is referentially transparent: same inputs always produce same `CurrentSessionDecision`.
- `SavingState` and `SwitchingState` are NOT valid inputs; the caller guards against them.
- `CurrentSessionDecision` is a discriminated union: `{ kind: 'no-current' }` | `{ kind: 'empty', noteId }` | `{ kind: 'dirty', noteId, note }`.

---

### REQ-EPNS-008: In-Memory Step — startNewSession

**EARS**: WHEN `FlushedCurrentSession` is available THEN the system SHALL hydrate the selected `NoteFileSnapshot` into a `Note`, create a `NewSession { kind, noteId, note, startedAt: Clock.now() }`, and transition `EditingSessionState` to `editing(noteId, isDirty: false)`.

**Edge Cases**:
- Snapshot hydration is always valid at this stage (snapshot was pre-validated when inserted into the feed); if hydration fails, it is a programming error.
- `startedAt` uses `Clock.now()` called exactly once during `startNewSession`.

**Acceptance Criteria**:
- `NewSession.noteId === selectedNoteId`.
- `NewSession.note` is hydrated from `PastNoteSelection.snapshot`.
- `NewSession.startedAt` equals the `Clock.now()` call result.
- `EditingSessionState.status === 'editing'`.
- `EditingSessionState.currentNoteId === selectedNoteId`.
- `EditingSessionState.isDirty === false`.
- `EditingSessionState.lastInputAt === null`.
- `EditingSessionState.idleTimerHandle === null`.
- `EditingSessionState.lastSaveResult === null`.
- `EditorFocusedOnPastNote { noteId: selectedNoteId, occurredOn: NewSession.startedAt }` is emitted.
- `Clock.now()` is called exactly once per `startNewSession` invocation.

---

### REQ-EPNS-009: Events — EmptyNoteDiscarded is a public domain event

**EARS**: WHEN the current session is classified as `'empty'` THEN the system SHALL emit `EmptyNoteDiscarded` as a public domain event (member of `PublicDomainEvent` union).

**Acceptance Criteria**:
- `EmptyNoteDiscarded` is a member of the `PublicDomainEvent` union (source: `shared/events.ts`).
- `EmptyNoteDiscarded { kind: 'empty-note-discarded', noteId: currentNoteId, occurredOn: Timestamp }`.
- `EmptyNoteDiscarded.occurredOn` is sourced from `Clock.now()` called once by `flushCurrentSession` on the empty path. This is a distinct call from the `Clock.now()` in `startNewSession`.
- It is emitted before `EditorFocusedOnPastNote`.
- It is emitted at most once per workflow invocation.

---

### REQ-EPNS-010: Events — EditorFocusedOnPastNote is a Capture-internal event

**EARS**: WHEN the workflow completes successfully (via `startNewSession` or via same-note pre-pipeline guard) THEN the system SHALL emit `EditorFocusedOnPastNote` as a Capture-internal application event (NOT a public domain event).

**Acceptance Criteria**:
- `EditorFocusedOnPastNote` is a member of `CaptureInternalEvent` (source: `capture/internal-events.ts`).
- `EditorFocusedOnPastNote` is NOT a member of `PublicDomainEvent`.
- `EditorFocusedOnPastNote { kind: 'editor-focused-on-past-note', noteId: selectedNoteId, occurredOn: Timestamp }`.
- `occurredOn` is sourced from `Clock.now()` — either from `startNewSession` (normal paths) or from the pre-pipeline guard (same-note path).
- It is the final event emitted on any successful path through the workflow.

---

### REQ-EPNS-011: Error Type — SwitchError shape

**EARS**: WHEN the workflow terminates with a save failure THEN the system SHALL return `SwitchError { kind: 'save-failed-during-switch', underlying: SaveError, pendingNextNoteId: NoteId }`.

**Acceptance Criteria**:
- `SwitchError.kind === 'save-failed-during-switch'` (sole variant).
- `SwitchError.underlying` is of type `SaveError` (source: `shared/errors.ts`).
- `SwitchError.pendingNextNoteId` is the `NoteId` of the note the user attempted to switch to.
- The `SwitchError` type has exactly one discriminant value: `'save-failed-during-switch'`; the TypeScript type is exhaustively handled with a `never` branch.

---

### REQ-EPNS-012: Non-functional — I/O boundary and Clock budget

**EARS**: WHEN the `EditPastNoteStart` workflow executes THEN the system SHALL call `Clock.now()` at most twice per workflow invocation. I/O occurs only in `flushCurrentSession` (CaptureAutoSave blur save). `classifyCurrentSession` performs zero I/O and zero Clock calls.

**Clock.now() call sites (deterministic, no ambiguity)**:

| Path | flushCurrentSession calls | startNewSession calls | Total |
|------|--------------------------|----------------------|-------|
| Same-note (pre-pipeline guard) | 0 | 0 (not reached) | 1 (guard) |
| No-current (idle) | 0 (no-op) | 1 | 1 |
| Empty (discard) | 1 (`EmptyNoteDiscarded.occurredOn`) | 1 (`NewSession.startedAt`) | 2 |
| Dirty (save succeeds) | 0 (CaptureAutoSave handles its own timestamps) | 1 | 1 |
| Dirty (save fails) | 1 (`NoteSaveFailed.occurredOn`) | 0 (not reached) | 1 |

**Acceptance Criteria**:
- `classifyCurrentSession` has no port dependencies: no `Clock`, no `CaptureAutoSave`, no filesystem.
- `flushCurrentSession` calls `CaptureAutoSave` exactly once when session is dirty; calls `Clock.now()` exactly once on the empty path for `EmptyNoteDiscarded.occurredOn`; calls `Clock.now()` zero times on no-current and dirty paths.
- `startNewSession` calls `Clock.now()` exactly once.
- Total `Clock.now()` call budget per workflow run: ≤2 calls (maximum on empty path: flush + startNewSession; dirty-fail path: 1 call for NoteSaveFailed.occurredOn).
- `Clock.now()` is never called inside `classifyCurrentSession`.

---

## Purity Boundary Candidates

| Step | Classification | Rationale |
|------|---------------|-----------|
| Pre-pipeline guard (same-note check) | Effectful shell | Calls `Clock.now()` and `emit`; short-circuits pipeline |
| `classifyCurrentSession` | Pure core | Deterministic; no ports; `(EditingSessionState, Note \| null) → CurrentSessionDecision` is referentially transparent |
| `flushCurrentSession` (no-current) | Pure shell (no-op) | Returns `FlushedCurrentSession { result: 'no-op' }` without any I/O |
| `flushCurrentSession` (empty) | Effectful shell | Calls `Clock.now()` and `emit(EmptyNoteDiscarded)` |
| `flushCurrentSession` (dirty) | Effectful shell | Invokes `CaptureAutoSave` blur save; emits `NoteFileSaved` or `NoteSaveFailed` |
| Snapshot → Note hydration | Pure core | Deterministic `NoteFileSnapshot → Note` conversion; no ports |
| `startNewSession` | Effectful shell | Calls `Clock.now()` once; emits `EditorFocusedOnPastNote` |
