# Behavioral Specification: EditPastNoteStart

**Feature**: `edit-past-note-start`
**Phase**: 1a
**Revision**: 5 (Sprint 2 — addressing 1c FAIL findings FIND-EPNS-S2-001..008)
**Source of truth**: `docs/domain/workflows.md` Workflow 3 (block-based revision), `docs/domain/code/ts/src/capture/stages.ts`, `docs/domain/code/ts/src/capture/workflows.ts`, `docs/domain/code/ts/src/capture/internal-events.ts`, `docs/domain/code/ts/src/capture/states.ts`, `docs/domain/code/ts/src/shared/events.ts`, `docs/domain/code/ts/src/shared/errors.ts`, `docs/domain/code/ts/src/shared/note.ts`, `docs/domain/code/ts/src/shared/blocks.ts`
**Scope**: Synchronous workflow in Capture context that handles a Block Focus Request directed at a past note or a different block within the same note. The pipeline is `BlockFocusRequest → CurrentSessionDecision → FlushedCurrentSession → NewSession`. Workflow terminates with `Result<NewSession, SwitchError>`. UI reaction to errors and CaptureAutoSave internals are out of scope.

---

## Revision 5 Changes (from Revision 4 — per findings FIND-EPNS-S2-001..008)

| Finding | Severity | Resolution |
|---------|----------|------------|
| FIND-EPNS-S2-001 | major | Clarified that this spec uses the canonical `NoteOps.isEmpty` from `shared/note.ts:174` (narrow: single empty-paragraph rule). `CaptureAutoSave` has its own workflow-local predicate `isEmptyOrWhitespaceContent` (broader). No redefinition; removed any phrasing suggesting `NoteOps.isEmpty` has "scope-specific" variants. |
| FIND-EPNS-S2-002 | CRITICAL | Added `currentNote: Note \| null` to `EditPastNoteStartInput`. Widened `ClassifyCurrentSession` signature to `(state, request, currentNote)`. Documented this as a **Type Contract Delta** (future update required in `workflows.ts`). `classifyCurrentSession` is now purely over explicit parameters — purity claim is sound. |
| FIND-EPNS-S2-003 | CRITICAL | Rewrote REQ-EPNS-008 as path-conditional. Same-note path does NOT transition `EditingSessionState`; it updates only `focusedBlockId` (EditingState) or is a no-op state transition (SaveFailedState has no `focusedBlockId` field). Cross-note paths transition to `editing(noteId, isDirty: false)`. Contradiction between REQ-EPNS-008 and REQ-EPNS-005 is resolved. |
| FIND-EPNS-S2-004 | major | Defined `EditPastNoteStartInput` explicitly as a typed struct with `request`, `currentState`, `currentNote`, `previousFrontmatter`. Documented provenance and lifecycle of `previousFrontmatter`. Removed "side-channel" language. |
| FIND-EPNS-S2-005 | major | Added PROP-EPNS-026 (Tier 1, required:false): enumerative `SaveError → NoteSaveFailureReason` mapping property covering all 6 discriminants. Updated coverage matrix. |
| FIND-EPNS-S2-006 | minor | Added Preconditions section before Requirements. Added REQ-EPNS-013 covering precondition violations. Added PROP-EPNS-027 (Tier 2) for precondition contract. |
| FIND-EPNS-S2-007 | minor | Added PROP-EPNS-028 (Tier 2): idempotent re-focus invariant — same `(state, request)` invoked twice produces identical state and exactly 2 `BlockFocused` events. |
| FIND-EPNS-S2-008 | minor | Added explicit "Clock.now() call site" bullet in REQ-EPNS-004 acceptance criteria anchoring `NoteSaveFailed.occurredOn` to `flushCurrentSession` (not BlurSave/CaptureAutoSave). Updated Clock budget table citation. |

---

## Revision 4 Changes (from Revision 3 — for historical reference)

| Area | Revision 3 (Sprint 1) | Revision 4 (Sprint 2) |
|------|-----------------------|----------------------|
| Pipeline input | `PastNoteSelection { noteId, snapshot }` | `BlockFocusRequest { noteId, blockId, snapshot: NoteFileSnapshot \| null }` |
| Same-note detection | Pre-pipeline guard (short-circuits, emits focus event from guard) | Owned by `classifyCurrentSession` — returns `{ kind: 'same-note' }` 4th variant; no pre-pipeline guard exists |
| `CurrentSessionDecision` variants | 3: `no-current`, `empty`, `dirty` | 4: `no-current`, `empty`, `dirty`, `same-note` |
| `FlushedCurrentSession.result` | 3 values: `no-op`, `discarded`, `saved` | 4 values: adds `same-note-skipped` |
| `NewSession` | No block focus field | Adds `focusedBlockId: BlockId` (target block for cursor) |
| Internal event | `EditorFocusedOnPastNote { noteId }` (GONE) | `BlockFocused { kind: 'block-focused', noteId, blockId, occurredOn }` (unified; `capture/internal-events.ts`) |
| `SwitchError` shape | `pendingNextNoteId: NoteId` | `pendingNextFocus: { noteId: NoteId; blockId: BlockId }` |
| `SaveFailedState` pending field | `pendingNextNoteId: NoteId \| null` | `pendingNextFocus: PendingNextFocus \| null` where `PendingNextFocus = { noteId; blockId }` |
| Same-note on `SaveFailedState` | Detection in pre-guard via `currentNoteId` comparison | Classification returns `same-note` when `request.noteId === state.currentNoteId`; flush returns `same-note-skipped`; `SaveFailedState` remains unchanged |
| `NoteOps.isEmpty` definition | Whitespace-only body string | Block-based: canonical `NoteOps.isEmpty` from `shared/note.ts:174` — `blocks.length === 1 && blocks[0]` is empty-content paragraph |
| Snapshot hydration mechanism | Unspecified conversion | `parseMarkdownToBlocks(snapshot.body)` from `shared/blocks.ts`; failure treated as contract violation |
| `previousFrontmatter` in input | Explicit pipeline input field | Explicit field in `EditPastNoteStartInput`; passed from in-memory editing buffer; forwarded to BlurSave port on dirty path |
| Clock.now() budget | Same-note guard=1, no-current=1, empty=2, dirty-success=1, dirty-fail=1 | Same-note (via classify)=1, no-current=1, empty=2, dirty-success=1, dirty-fail=1 (same budget totals; guard call eliminated; classify is zero-clock) |

---

## Type Contract Deltas

The following changes are implied by this spec and MUST be applied to `docs/domain/code/ts/src/capture/workflows.ts` in a subsequent contract-update step. The type contract files are NOT modified now.

### Delta 1: `ClassifyCurrentSession` signature widening

**Current** (in `workflows.ts`):
```typescript
export type ClassifyCurrentSession = (
  current: EditingSessionState,
  request: BlockFocusRequest,
) => CurrentSessionDecision;
```

**Required** (per FIND-EPNS-S2-002 resolution):
```typescript
export type ClassifyCurrentSession = (
  current: EditingSessionState,
  request: BlockFocusRequest,
  currentNote: Note | null,
) => CurrentSessionDecision;
```

**Rationale**: `EditingState` and `SaveFailedState` do not carry a `Note` field. Classification for `dirty`/`empty` decisions (and for `same-note` payload) requires the in-memory `Note` from the editing buffer. Adding `currentNote` as an explicit parameter preserves referential transparency — the function remains purely over its arguments. The pipeline orchestrator sources `currentNote` from `EditPastNoteStartInput.currentNote`. The caller passes `null` for `IdleState` (no current note). `SavingState` and `SwitchingState` are guarded by the caller (precondition).

### Delta 2: `EditPastNoteStart` result type widening (informational)

**Current** (in `workflows.ts`):
```typescript
export type EditPastNoteStart = (
  deps: CaptureDeps,
) => (
  current: EditingSessionState,
  request: BlockFocusRequest,
) => Promise<Result<NewSession, SwitchError>>;
```

**Required** (per FIND-EPNS-S2-002 and FIND-EPNS-S2-004 resolution): The signature adopts the explicit input struct:
```typescript
export type EditPastNoteStart = (
  deps: CaptureDeps,
) => (
  input: EditPastNoteStartInput,
) => Promise<Result<NewSession, SwitchError>>;
```

The result type `Result<NewSession, SwitchError>` is unchanged — `NewSession` is always returned on success, even for same-note paths. The `EditingSessionState` post-condition is path-conditional (see REQ-EPNS-008).

---

## Pipeline Overview

```
EditPastNoteStartInput { request, currentState, currentNote, previousFrontmatter }
    ↓
classifyCurrentSession (pure: state, request, currentNote → decision)
    ↓ CurrentSessionDecision: no-current | empty | dirty | same-note
flushCurrentSession (effectful only for dirty/empty paths)
    ↓ FlushedCurrentSession: no-op | discarded | saved | same-note-skipped
startNewSession (in-memory; hydrates snapshot for cross-note; reuses note for same-note)
    ↓ NewSession { noteId, note, focusedBlockId, startedAt }
    → emit BlockFocused { noteId, blockId, occurredOn }
```

**Architectural note**: In Revision 3, a pre-pipeline guard detected same-note re-selection and short-circuited before classification. In Revision 4/5, that guard is eliminated. Classification (`classifyCurrentSession`) is the sole decision point for same-note detection. This matches `stages.ts` comment: "同一 Note 内ブロック移動の場合は `same-note` を返し、flush をスキップ". The `classifyCurrentSession` function receives `currentNote: Note | null` as an explicit parameter and compares `request.noteId` with `state.currentNoteId` across all applicable state variants.

---

## Pipeline Input

```typescript
// Explicit input struct for EditPastNoteStart (Revision 5)
type EditPastNoteStartInput = {
  readonly request: BlockFocusRequest;
  readonly currentState: EditingSessionState;
  /** The in-memory Note currently loaded in the editing buffer.
   *  null when currentState.status === 'idle' (no active note).
   *  Sourced from the application layer's editing buffer, NOT from BlockFocusRequest.
   *  Passed as explicit parameter to classifyCurrentSession (see Type Contract Delta 1). */
  readonly currentNote: Note | null;
  /** The frontmatter of the current note BEFORE any edits in the current editing session.
   *  Used by flushCurrentSession on the dirty path to pass to BlurSave for TagInventory delta.
   *  null if the note has never been saved (new note) or if the state is idle.
   *  Sourced from the application layer's editing buffer alongside currentNote. */
  readonly previousFrontmatter: Frontmatter | null;
};

// From stages.ts: BlockFocusRequest definition
type BlockFocusRequest = {
  readonly kind: "BlockFocusRequest";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  /** Present when switching to a different note. null for intra-note block movement. */
  readonly snapshot: NoteFileSnapshot | null;
};
```

**`currentNote` provenance**: The application layer (Capture context orchestrator) maintains an in-memory editing buffer containing the currently loaded `Note`. When `EditPastNoteStart` is invoked, the orchestrator reads `currentNote` from this buffer and passes it as an explicit input field. `IdleState` has no current note; the orchestrator passes `null`. `EditingState` and `SaveFailedState` always have a current note in the buffer; the orchestrator passes the buffer's `Note`.

**`previousFrontmatter` provenance and lifecycle**:
1. **Source**: When a note is loaded into the editing session (at `startNewSession`), the application layer records `note.frontmatter` as `previousFrontmatter`.
2. **Mutation**: `previousFrontmatter` is NOT updated by block edits during the session — it captures the frontmatter state at session-start.
3. **Consumption**: On the dirty cross-note path, `flushCurrentSession` passes `previousFrontmatter` to `BlurSave` for `TagInventory` delta computation (`NoteFileSaved.previousFrontmatter`).
4. **Discarded after flush**: Once the session is flushed (note saved or discarded), `previousFrontmatter` is no longer relevant; the new session begins with a fresh `previousFrontmatter`.

**`snapshot` invariant**: `snapshot` is `null` for same-note intra-block movement (the existing `note` in editing state is re-used). For cross-note movement, `snapshot` is non-null and has been pre-validated by vault scan hydration. See Preconditions section.

---

## Preconditions

The following preconditions MUST hold at workflow entry. Violations are handled by REQ-EPNS-013.

### PC-001: snapshot presence iff cross-note

`request.snapshot !== null` if and only if `request.noteId !== currentState.currentNoteId` (cross-note requires a snapshot; same-note requires `snapshot === null` because the in-memory note is reused).

- **On violation** (cross-note + `snapshot === null`): workflow rejects with `ContractViolationError { kind: 'contract-violation', message: 'snapshot is required for cross-note focus' }` — see REQ-EPNS-013.
- **On violation** (same-note + `snapshot !== null`): treated as a programming error; the snapshot is silently ignored. No error is returned.

### PC-002: snapshot body is parseable

`parseMarkdownToBlocks(snapshot.body)` succeeds for any snapshot delivered to this workflow. Snapshots are pre-validated at vault scan time; a parse failure indicates a programming error in the caller (not a recoverable runtime error).

- **On violation**: implementation MUST throw an internal error (`ContractViolationError` or equivalent). Silently falling back to an empty Note is prohibited.

### PC-003: state is not saving or switching

`currentState.status !== 'saving' && currentState.status !== 'switching'` at workflow entry. The caller (application layer) guards against invoking `EditPastNoteStart` while a save or switch is in progress.

- **On violation**: behavior is undefined by this spec; the caller is responsible for the guard. The implementation MAY assert-throw in development builds.

### PC-004: currentNote is consistent with state

If `currentState.status === 'idle'` then `currentNote === null`. If `currentState.status === 'editing' || currentState.status === 'save-failed'` then `currentNote !== null`.

- **On violation**: workflow rejects with `ContractViolationError { kind: 'contract-violation', message: 'currentNote must be non-null for editing/save-failed states' }` — see REQ-EPNS-013.

---

## Requirements

### REQ-EPNS-001: Happy Path — idle state, cross-note block focus

**EARS**: WHEN `BlockFocusRequest` arrives AND `EditingSessionState.status === 'idle'` THEN the system SHALL classify the current session as `'no-current'`, skip the flush step (no-op), hydrate the selected `NoteFileSnapshot` into a `Note` via `parseMarkdownToBlocks`, set `EditingSessionState` to `editing(noteId, focusedBlockId: blockId, isDirty: false)`, and emit `BlockFocused { noteId, blockId }`.

**Edge Cases**:
- `IdleState` has no `currentNoteId`; same-note check always fails for idle (no note to compare against), so classification always returns `no-current` regardless of `request.noteId`.
- `currentNote` is `null` for `IdleState`; this is expected and is a valid input to `classifyCurrentSession`.
- `snapshot` MUST be non-null for the idle path (idle means no current note; the target is always a different note). See PC-001.

**Acceptance Criteria**:
- `classifyCurrentSession(IdleState, request, null)` returns `{ kind: 'no-current' }`.
- `FlushedCurrentSession.result === 'no-op'`.
- `NewSession.noteId === request.noteId`.
- `NewSession.focusedBlockId === request.blockId`.
- `NewSession.note` is hydrated from `request.snapshot` via `parseMarkdownToBlocks(snapshot.body)`.
- `EditingSessionState.status === 'editing'` with `currentNoteId === request.noteId`, `focusedBlockId === request.blockId`, `isDirty === false`.
- `BlockFocused { kind: 'block-focused', noteId: request.noteId, blockId: request.blockId, occurredOn: Timestamp }` is emitted exactly once.
- No `EmptyNoteDiscarded` event is emitted.
- No save I/O is performed.

---

### REQ-EPNS-002: Happy Path — editing state, empty note, cross-note block focus

**EARS**: WHEN `BlockFocusRequest` arrives AND `EditingSessionState.status === 'editing'` AND `request.noteId !== state.currentNoteId` AND the current note satisfies `NoteOps.isEmpty(note)` THEN the system SHALL classify the session as `'empty'`, emit `EmptyNoteDiscarded` for the current note, hydrate the selected snapshot, set `EditingSessionState` to `editing(request.noteId, focusedBlockId: request.blockId)`, and emit `BlockFocused`.

**`NoteOps.isEmpty` canonical definition** (source: `shared/note.ts:174`):

```
isEmpty(note): boolean
  Defined as: blocks.length === 1 AND blocks[0].type === 'paragraph'
              AND isEmptyOrWhitespaceContent(blocks[0].content)
```

This is the **canonical, single-source-of-truth** definition from `NoteOps` in the Shared Kernel. This spec uses it directly — no workflow-local redefinition. The definition matches `aggregates.md §1 ビジネス不変条件 4` entry (`note.isEmpty()`), which documents it via the `shared/note.ts` implementation.

**Relationship to `CaptureAutoSave` predicate**: `CaptureAutoSave` does NOT use `NoteOps.isEmpty` for its idle-save discard decision. It has its own workflow-local predicate (`isEmptyOrWhitespaceContent`) that is broader (multi-empty-paragraph, divider-only, mixed empty/divider). That predicate is internal to `CaptureAutoSave` and is not canonical. The canonical `NoteOps.isEmpty` is narrow by design: only a single empty paragraph represents the "fresh, untouched new note" state. Notes with dividers, headings, or multiple blocks are NOT empty by the canonical rule.

**Edge Cases**:
- Single empty paragraph `[paragraph("")]`: isEmpty → `true`; classified as `empty`.
- Single whitespace-only paragraph `[paragraph("  ")]`: isEmpty → `true`; classified as `empty`.
- More than one block (even if all empty): isEmpty → `false`; classified as `dirty`. A multi-block structure represents user-initiated block operations (e.g., pressing Enter), which constitute meaningful content.
- Non-paragraph single block (e.g., `[heading-1("")]`): isEmpty → `false`; classified as `dirty`. A non-paragraph block type is intentional user content.
- Note with a single divider block `[divider]`: isEmpty → `false` (not a paragraph); classified as `dirty`. (Contrast: `CaptureAutoSave`'s local predicate would classify divider-only as discardable — but that predicate is NOT used here.)

**Acceptance Criteria**:
- `classifyCurrentSession(EditingState where isEmpty(currentNote) && noteIds differ, request, currentNote)` returns `{ kind: 'empty', noteId: state.currentNoteId }`.
- `EmptyNoteDiscarded { kind: 'empty-note-discarded', noteId: state.currentNoteId, occurredOn: Timestamp }` is emitted exactly once, before `BlockFocused`.
- `FlushedCurrentSession.result === 'discarded'`.
- `NewSession.noteId === request.noteId`.
- `NewSession.focusedBlockId === request.blockId`.
- `EditingSessionState.status === 'editing'` with `currentNoteId === request.noteId` and `isDirty === false`.
- `BlockFocused` is emitted after `EmptyNoteDiscarded`.
- No save I/O is performed.

---

### REQ-EPNS-003: Happy Path — editing state, dirty note, save succeeds, cross-note block focus

**EARS**: WHEN `BlockFocusRequest` arrives AND `EditingSessionState.status === 'editing'` AND `request.noteId !== state.currentNoteId` AND `!NoteOps.isEmpty(currentNote)` THEN the system SHALL classify the session as `'dirty'`, invoke `CaptureAutoSave` blur save, on save success emit `NoteFileSaved`, set `EditingSessionState` to `editing(request.noteId, focusedBlockId: request.blockId)`, and emit `BlockFocused`.

**`NoteFileSaved` field sourcing** (block-based, Revision 4):
- `noteId`: from `state.currentNoteId` (the note being saved, NOT the target note)
- `blocks`: from `currentNote.blocks` (current editing buffer blocks)
- `body`: `serializeBlocksToMarkdown(blocks)` (derived; CaptureAutoSave computes this)
- `frontmatter`: from `currentNote.frontmatter` with `updatedAt` stamped by CaptureAutoSave
- `previousFrontmatter`: from `EditPastNoteStartInput.previousFrontmatter`
- `occurredOn`: stamped by CaptureAutoSave upon successful write

**Edge Cases**:
- `isDirty === false` but note is non-empty: still classified as `'dirty'` because classification is based on `NoteOps.isEmpty`, not the `isDirty` flag.

**Acceptance Criteria**:
- `classifyCurrentSession(EditingState where !isEmpty(currentNote) && noteIds differ, request, currentNote)` returns `{ kind: 'dirty', noteId: state.currentNoteId, note: currentNote }`.
- `CaptureAutoSave` blur save is invoked with the current note and `previousFrontmatter`.
- `NoteFileSaved` public domain event is emitted with `blocks` and derived `body === serializeBlocksToMarkdown(blocks)`.
- `FlushedCurrentSession.result === 'saved'`.
- `NewSession.noteId === request.noteId`.
- `NewSession.focusedBlockId === request.blockId`.
- `EditingSessionState.status === 'editing'` with `currentNoteId === request.noteId` and `isDirty === false`.
- `BlockFocused` is emitted after `NoteFileSaved`.
- `SwitchError` is NOT produced.

---

### REQ-EPNS-004: Error Path — dirty note, save fails during cross-note switch

**EARS**: WHEN `BlockFocusRequest` arrives AND the current session is classified as `'dirty'` AND `CaptureAutoSave` returns a `SaveError` THEN the system SHALL terminate with `SwitchError { kind: 'save-failed-during-switch', underlying: SaveError, pendingNextFocus: { noteId: request.noteId, blockId: request.blockId } }` AND emit `NoteSaveFailed` AND NOT start a new editing session.

**`SwitchError.pendingNextFocus` shape** (Revision 4):
```typescript
type SwitchError = {
  kind: "save-failed-during-switch";
  underlying: SaveError;
  pendingNextFocus: { readonly noteId: NoteId; readonly blockId: BlockId };
};
```
`pendingNextFocus.noteId` and `pendingNextFocus.blockId` identify the block that the user was attempting to focus when the save failed. This supersedes the Sprint 1 `pendingNextNoteId: NoteId` field.

**`SaveError → NoteSaveFailureReason` mapping** (unchanged from Revision 3):
- `SaveError { kind: 'fs', reason: { kind: 'permission' } }` → `"permission"`
- `SaveError { kind: 'fs', reason: { kind: 'disk-full' } }` → `"disk-full"`
- `SaveError { kind: 'fs', reason: { kind: 'lock' } }` → `"lock"`
- `SaveError { kind: 'fs', reason: { kind: 'not-found' } }` → `"unknown"`
- `SaveError { kind: 'fs', reason: { kind: 'unknown' } }` → `"unknown"`
- `SaveError { kind: 'validation', reason: _ }` → `"unknown"`

**State transition on failure**: `EditingState` (or `SaveFailedState` on a re-attempt) → `SaveFailedState { status: 'save-failed', currentNoteId: state.currentNoteId, pendingNextFocus: { noteId: request.noteId, blockId: request.blockId }, lastSaveError }`.

**Acceptance Criteria**:
- `SwitchError.kind === 'save-failed-during-switch'`.
- `SwitchError.pendingNextFocus === { noteId: request.noteId, blockId: request.blockId }`.
- `SwitchError.underlying` carries the exact `SaveError` from `CaptureAutoSave`.
- `NoteSaveFailed { kind: 'note-save-failed', noteId: state.currentNoteId, reason: NoteSaveFailureReason, occurredOn }` is emitted with correctly mapped reason.
- **Clock.now() call site**: `flushCurrentSession` (dirty-fail path) calls `Clock.now()` exactly once to stamp `NoteSaveFailed.occurredOn`. `CaptureAutoSave` / `BlurSave` does NOT emit `NoteSaveFailed` — it returns `Err(SaveError)` to `flushCurrentSession`, which constructs and emits the `NoteSaveFailed` event using a single `Clock.now()` call. This anchors the clock budget entry "dirty-fail: 1" in REQ-EPNS-012.
- `EditingSessionState.status === 'save-failed'` after the error.
- `EditingSessionState.pendingNextFocus === { noteId: request.noteId, blockId: request.blockId }` after the error.
- `BlockFocused` is NOT emitted.
- `NewSession` stage is NOT reached.

---

### REQ-EPNS-005: Same-Note Path — intra-note block movement

**EARS**: WHEN `BlockFocusRequest` arrives AND `request.noteId === state.currentNoteId` (for `EditingState` or `SaveFailedState`) THEN the system SHALL classify the session as `'same-note'`, return `FlushedCurrentSession { result: 'same-note-skipped' }` with no I/O, and call `startNewSession` with the existing `currentNote` (no hydration), setting `focusedBlockId = request.blockId`, then emit `BlockFocused { noteId: request.noteId, blockId: request.blockId }`.

**Design decision — classification owns same-note**: The `classifyCurrentSession` function receives `currentNote: Note | null` and compares `request.noteId` to `state.currentNoteId`. When they match, it returns `{ kind: 'same-note', noteId: state.currentNoteId, note: currentNote }`. There is NO pre-pipeline guard; classification is the sole decision point.

**Same-note on `IdleState`**: `IdleState` has no `currentNoteId`. No same-note classification is possible. Classification always returns `no-current` for `IdleState`.

**State post-conditions for same-note path** (path-conditional — see REQ-EPNS-008):

- **Same-note on `EditingState`**: `EditingSessionState.focusedBlockId` is updated to `request.blockId`. `isDirty` is PRESERVED (not cleared). `status` remains `'editing'`. The editing session continues; idle-save timer is NOT reset.
- **Same-note on `SaveFailedState`**: `SaveFailedState` has no `focusedBlockId` field (`states.ts` lines 70-75). Therefore the state machine does NOT update any field in `SaveFailedState`. `status` remains `'save-failed'`. `lastSaveError` is PRESERVED. `pendingNextFocus` is PRESERVED. The save-failed banner remains visible to the user. Focus is tracked by the UI layer only (via the `BlockFocused` event), not by the state machine for this path.
- **`NewSession` is always returned** on successful same-note paths. The `NewSession` value is informational (provides `focusedBlockId` to callers). The `EditingSessionState` post-condition above is path-conditional and independent of whether `NewSession` is returned.

**Same-note edge cases**:
- `request.noteId === state.currentNoteId && request.blockId === state.focusedBlockId` (idempotent re-focus on EditingState): treated identically to any same-note movement — `BlockFocused` is emitted once with the current `blockId`. `isDirty` preserved. No error or no-op short-circuit.
- `request.noteId === state.currentNoteId && request.blockId !== state.focusedBlockId` (normal intra-note block move): standard same-note path.
- `request.snapshot === null` on same-note path: expected — no hydration occurs, existing `currentNote` is reused.

**Acceptance Criteria**:
- `classifyCurrentSession(EditingState where noteIds match, request, currentNote)` returns `{ kind: 'same-note', noteId: request.noteId, note: currentNote }`.
- `classifyCurrentSession(SaveFailedState where noteIds match, request, currentNote)` returns `{ kind: 'same-note', noteId: request.noteId, note: currentNote }`.
- No save I/O is performed.
- `EmptyNoteDiscarded` is NOT emitted.
- `NoteFileSaved` is NOT emitted.
- `FlushedCurrentSession.result === 'same-note-skipped'`.
- `NewSession.focusedBlockId === request.blockId`.
- `NewSession.note` is the same `Note` object from `currentNote` (not hydrated from snapshot).
- `NewSession` is returned (even on same-note path).
- For `EditingState`: `EditingSessionState.focusedBlockId === request.blockId` after the workflow; `EditingSessionState.isDirty` is unchanged (preserved, not cleared).
- For `SaveFailedState`: `EditingSessionState.status === 'save-failed'` after the workflow; `lastSaveError` unchanged; `pendingNextFocus` unchanged. No `focusedBlockId` field update (the field does not exist on `SaveFailedState`).
- `BlockFocused { kind: 'block-focused', noteId: request.noteId, blockId: request.blockId, occurredOn }` is emitted exactly once.
- `SwitchError` is NOT produced.

---

### REQ-EPNS-006: Save-Failed State — cross-note block focus attempts re-save

**EARS**: WHEN `BlockFocusRequest` arrives AND `EditingSessionState.status === 'save-failed'` AND `request.noteId !== state.currentNoteId` THEN the system SHALL classify the session as `'dirty'`, attempt a new save via `CaptureAutoSave`, and on success proceed to `startNewSession`; on failure return `SwitchError` with the new `pendingNextFocus`.

**Note sourcing for `SaveFailedState`**: `SaveFailedState` does not contain a `Note` field. The `currentNote` is provided by `EditPastNoteStartInput.currentNote` — sourced from the application layer's in-memory editing buffer. `classifyCurrentSession` receives it as the explicit `currentNote` parameter. The `dirty` decision carries `note: Note` taken from this parameter. This is pure: the function depends only on its explicit arguments.

**`pendingNextFocus` supersession**: If `SaveFailedState.pendingNextFocus` was previously set (from an earlier failed switch), the new `request.noteId` + `request.blockId` supersede it entirely. The new `SwitchError.pendingNextFocus` points to the newly requested block.

**Edge Cases**:
- `SaveFailedState.pendingNextFocus === null` (idle save failed, not a switch failure): new cross-note request creates a fresh `pendingNextFocus`.
- `SaveFailedState.pendingNextFocus !== null` (prior failed switch): new request overwrites it with the current `request.noteId` + `request.blockId`.

**Acceptance Criteria**:
- `classifyCurrentSession(SaveFailedState, request, currentNote)` returns `{ kind: 'dirty', noteId: state.currentNoteId, note: currentNote }` when `request.noteId !== state.currentNoteId`.
- On save success: `FlushedCurrentSession.result === 'saved'` and `NewSession.noteId === request.noteId`.
- On save failure: `SwitchError.pendingNextFocus === { noteId: request.noteId, blockId: request.blockId }`.
- Old `pendingNextFocus` is discarded (not merged or carried forward).

---

### REQ-EPNS-007: Pure Step — classifyCurrentSession

**EARS**: WHEN `classifyCurrentSession` is called with an `EditingSessionState`, `BlockFocusRequest`, and `Note | null` THEN the system SHALL return a `CurrentSessionDecision` deterministically with no side effects and no I/O.

**Function signature** (Revision 5 — Type Contract Delta 1):
```typescript
type ClassifyCurrentSession = (
  current: EditingSessionState,
  request: BlockFocusRequest,
  currentNote: Note | null,
) => CurrentSessionDecision;
```

This signature widens the Revision 4 type contract. The addition of `currentNote` preserves referential transparency: the function depends only on its explicit parameters. The application layer (pipeline orchestrator) resolves `currentNote` from `EditPastNoteStartInput` before calling `classifyCurrentSession`.

**Classification table** (all state × request combinations):

| `EditingSessionState.status` | `request.noteId` vs `currentNoteId` | `NoteOps.isEmpty(currentNote)` | `CurrentSessionDecision.kind` | Rationale |
|---|---|---|---|---|
| `'idle'` | n/a (no currentNoteId) | n/a (currentNote is null) | `'no-current'` | No active session |
| `'editing'` | `=== currentNoteId` | any | `'same-note'` | Intra-note block move; flush skip |
| `'editing'` | `!== currentNoteId` | `true` | `'empty'` | Empty note; discard without save |
| `'editing'` | `!== currentNoteId` | `false` | `'dirty'` | Has content; must save before switch |
| `'save-failed'` | `=== currentNoteId` | any | `'same-note'` | Intra-note block move during save-failed; flush skip; error state preserved |
| `'save-failed'` | `!== currentNoteId` | any | `'dirty'` | Must attempt re-save before switching (regardless of isEmpty; see note below) |
| `'saving'` | any | any | NOT APPLICABLE | Caller must guard; concurrent save in progress |
| `'switching'` | any | any | NOT APPLICABLE | Caller must guard; already switching |

**Note on `SaveFailedState` + cross-note isEmpty**: `SaveFailedState` always returns `'dirty'` regardless of `NoteOps.isEmpty(currentNote)`. Rationale: a note that has entered the save-failed path was previously in an `EditingState` with `isDirty === true`; discarding it via the `'empty'` path would silently drop content the user attempted to save. The `'empty'` discard path is only safe when the system is confident the note was never meaningfully changed (`EditingState` only).

**`CurrentSessionDecision` type** (from `stages.ts`):
```typescript
type CurrentSessionDecision =
  | { readonly kind: "no-current" }
  | { readonly kind: "empty"; readonly noteId: NoteId }
  | { readonly kind: "dirty"; readonly noteId: NoteId; readonly note: Note }
  | { readonly kind: "same-note"; readonly noteId: NoteId; readonly note: Note };
```

**Acceptance Criteria**:
- `classifyCurrentSession` accepts `(EditingSessionState, BlockFocusRequest, Note | null)` as inputs; it calls no ports.
- The function is referentially transparent: same `(state, request, currentNote)` inputs always produce the same `CurrentSessionDecision`.
- `SavingState` and `SwitchingState` are NOT valid inputs; the caller guards against them (PC-003).
- `same-note` is returned whenever `request.noteId === state.currentNoteId` for `EditingState` or `SaveFailedState`.
- `note` is carried in the `dirty` and `same-note` decision variants (for use by `flushCurrentSession` and `startNewSession` respectively).
- `Clock.now()` is NEVER called inside `classifyCurrentSession`.

---

### REQ-EPNS-008: In-Memory Step — startNewSession and EditingSessionState post-conditions

**EARS**: WHEN `FlushedCurrentSession` is available AND the path is cross-note THEN the system SHALL construct a `NewSession { kind, noteId, note, focusedBlockId, startedAt: Clock.now() }`, emit `BlockFocused`, and transition `EditingSessionState` to `editing(noteId, focusedBlockId: blockId, isDirty: false)`. WHEN the path is same-note THEN the system SHALL construct `NewSession` with the existing note and `focusedBlockId: request.blockId`, emit `BlockFocused`, and update `EditingSessionState` as specified by path-conditional post-conditions below.

**Path-conditional `EditingSessionState` post-conditions**:

| Path | Prior state | `EditingSessionState` post-condition |
|------|-------------|-------------------------------------|
| `no-current` (idle → cross-note) | `IdleState` | `status: 'editing'`, `currentNoteId: request.noteId`, `focusedBlockId: request.blockId`, `isDirty: false` |
| `empty` (cross-note discard) | `EditingState` | `status: 'editing'`, `currentNoteId: request.noteId`, `focusedBlockId: request.blockId`, `isDirty: false` |
| `dirty-success` (cross-note save) | `EditingState` | `status: 'editing'`, `currentNoteId: request.noteId`, `focusedBlockId: request.blockId`, `isDirty: false` |
| `save-failed → cross-note → save-success` | `SaveFailedState` | `status: 'editing'`, `currentNoteId: request.noteId`, `focusedBlockId: request.blockId`, `isDirty: false` |
| `same-note` on `EditingState` | `EditingState` | `focusedBlockId: request.blockId` updated; `isDirty` PRESERVED; `status` remains `'editing'` |
| `same-note` on `SaveFailedState` | `SaveFailedState` | NO state change (SaveFailedState has no `focusedBlockId` field); `status` remains `'save-failed'`; `lastSaveError` PRESERVED; `pendingNextFocus` PRESERVED |

The `isDirty: false` reset ONLY applies to cross-note paths. It NEVER applies to same-note paths. This is the authoritative, path-conditional statement of the `isDirty` post-condition; REQ-EPNS-005 acceptance criteria and this table are the joint source of truth.

**Cross-note path (snapshot hydration)**: When the decision was `no-current`, `empty`, or `dirty` — meaning the target note is a different one — the `note` for `NewSession` is hydrated from `request.snapshot` via `parseMarkdownToBlocks(snapshot.body)`. On parse failure, see PC-002 and REQ-EPNS-013.

**Same-note path (no hydration)**: When the decision was `same-note`, the `note` in `NewSession` is taken directly from the `same-note` decision payload (`currentNote` from `EditPastNoteStartInput`). No `parseMarkdownToBlocks` call is made. `focusedBlockId` is set to `request.blockId`.

**`NewSession` type** (from `stages.ts`):
```typescript
type NewSession = {
  readonly kind: "NewSession";
  readonly noteId: NoteId;
  readonly note: Note;
  readonly focusedBlockId: BlockId;
  readonly startedAt: Timestamp;
};
```

**Acceptance Criteria (cross-note paths)**:
- `NewSession.noteId === request.noteId`.
- `NewSession.focusedBlockId === request.blockId`.
- `NewSession.startedAt` equals the `Clock.now()` call result in `startNewSession`.
- `NewSession.note` is hydrated from `request.snapshot` via `parseMarkdownToBlocks`.
- `EditingSessionState.status === 'editing'`.
- `EditingSessionState.currentNoteId === request.noteId`.
- `EditingSessionState.focusedBlockId === request.blockId`.
- `EditingSessionState.isDirty === false`.
- `BlockFocused { kind: 'block-focused', noteId: request.noteId, blockId: request.blockId, occurredOn: NewSession.startedAt }` is emitted exactly once.
- `Clock.now()` is called exactly once per `startNewSession` invocation.

**Acceptance Criteria (same-note paths)**:
- `NewSession.noteId === request.noteId`.
- `NewSession.focusedBlockId === request.blockId`.
- `NewSession.note` is the existing `currentNote` (not hydrated from snapshot).
- `NewSession` is returned from the workflow (Ok result, not an error).
- For `EditingState` prior: `EditingSessionState.focusedBlockId === request.blockId`; `isDirty` value is identical to its pre-call value.
- For `SaveFailedState` prior: `EditingSessionState.status === 'save-failed'` (unchanged); `lastSaveError` unchanged; `pendingNextFocus` unchanged.
- `BlockFocused` is emitted exactly once.
- `Clock.now()` is called exactly once (in `startNewSession`).

---

### REQ-EPNS-009: Events — EmptyNoteDiscarded is a public domain event

**EARS**: WHEN the current session is classified as `'empty'` THEN the system SHALL emit `EmptyNoteDiscarded` as a public domain event.

**Acceptance Criteria**:
- `EmptyNoteDiscarded` is a member of the `PublicDomainEvent` union (source: `shared/events.ts`).
- `EmptyNoteDiscarded { kind: 'empty-note-discarded', noteId: state.currentNoteId, occurredOn: Timestamp }`.
- `EmptyNoteDiscarded.occurredOn` is sourced from `Clock.now()` called once by `flushCurrentSession` on the empty path. This is a distinct call from the `Clock.now()` in `startNewSession`.
- It is emitted before `BlockFocused`.
- It is emitted at most once per workflow invocation.

---

### REQ-EPNS-010: Events — BlockFocused is a Capture-internal event

**EARS**: WHEN the workflow completes successfully (via all paths through `startNewSession`) THEN the system SHALL emit `BlockFocused` as a Capture-internal application event (NOT a public domain event).

**Revision 4 note**: The Revision 3 `EditorFocusedOnPastNote` event is GONE. It is replaced by `BlockFocused` which unifies "editor focused on past note" and "editor focused on new note" into a single block-level event. This event is now emitted for all successful paths including same-note intra-block movement.

**Acceptance Criteria**:
- `BlockFocused` is a member of `CaptureInternalEvent` (source: `capture/internal-events.ts`).
- `BlockFocused` is NOT a member of `PublicDomainEvent`.
- `BlockFocused { kind: 'block-focused', noteId: request.noteId, blockId: request.blockId, occurredOn: Timestamp }`.
- `noteId` equals `request.noteId` (the target note, not the current/previous note).
- `blockId` equals `request.blockId` (the specific block that received focus).
- `occurredOn` equals `NewSession.startedAt` (the `Clock.now()` from `startNewSession`).
- It is the final event emitted on any successful path through the workflow.
- It is emitted exactly once per successful workflow invocation.

---

### REQ-EPNS-011: Error Type — SwitchError shape

**EARS**: WHEN the workflow terminates with a save failure THEN the system SHALL return `SwitchError { kind: 'save-failed-during-switch', underlying: SaveError, pendingNextFocus: { noteId: NoteId, blockId: BlockId } }`.

**Revision 4 note**: `pendingNextNoteId: NoteId` from Sprint 1 is replaced by `pendingNextFocus: { noteId, blockId }` to carry the full block-level focus target (source: `shared/errors.ts` `SwitchError`).

**Acceptance Criteria**:
- `SwitchError.kind === 'save-failed-during-switch'` (sole variant).
- `SwitchError.underlying` is of type `SaveError` (source: `shared/errors.ts`).
- `SwitchError.pendingNextFocus` is `{ noteId: NoteId; blockId: BlockId }` — the block the user was attempting to focus.
- `SwitchError.pendingNextFocus.noteId === request.noteId`.
- `SwitchError.pendingNextFocus.blockId === request.blockId`.
- The `SwitchError` type has exactly one discriminant value; TypeScript exhaustiveness is enforceable with a `never` branch.

---

### REQ-EPNS-012: Non-functional — I/O boundary and Clock budget

**EARS**: WHEN the `EditPastNoteStart` workflow executes THEN the system SHALL call `Clock.now()` at most twice per workflow invocation. I/O occurs only in `flushCurrentSession` for save operations. `classifyCurrentSession` performs zero I/O and zero Clock calls.

**Clock.now() call budget** (per path):

| Path | `flushCurrentSession` calls | `startNewSession` calls | Total | Call site anchor |
|------|-------|-------|-------|-----------------|
| Same-note (intra-block move, any state) | 0 (no-op via `same-note-skipped`) | 1 | 1 | `startNewSession` for `NewSession.startedAt` / `BlockFocused.occurredOn` |
| No-current (idle) | 0 (no-op) | 1 | 1 | `startNewSession` for `NewSession.startedAt` / `BlockFocused.occurredOn` |
| Empty (discard) | 1 (`EmptyNoteDiscarded.occurredOn`) | 1 (`NewSession.startedAt`) | 2 | `flushCurrentSession` (empty path); `startNewSession` |
| Dirty, save succeeds | 0 (CaptureAutoSave handles its own timestamps) | 1 | 1 | `startNewSession` for `NewSession.startedAt` / `BlockFocused.occurredOn` |
| Dirty, save fails | 1 (`NoteSaveFailed.occurredOn` — see REQ-EPNS-004) | 0 (not reached) | 1 | `flushCurrentSession` (dirty-fail path); `startNewSession` not reached |

**Acceptance Criteria**:
- `classifyCurrentSession` has no port dependencies: no `Clock`, no `CaptureAutoSave`, no filesystem.
- `flushCurrentSession` calls `CaptureAutoSave` exactly once when session is `dirty`; calls `Clock.now()` exactly once on the empty path; calls `Clock.now()` zero times on no-current, dirty-success, and same-note paths; calls `Clock.now()` exactly once on the dirty-fail path (for `NoteSaveFailed.occurredOn` — see REQ-EPNS-004 acceptance criteria).
- `startNewSession` calls `Clock.now()` exactly once (for `NewSession.startedAt` and `BlockFocused.occurredOn`).
- Total `Clock.now()` budget per workflow run: ≤2 calls.

---

### REQ-EPNS-013: Precondition Violations — explicit error handling

**EARS**: WHEN `EditPastNoteStart` receives an input that violates a defined precondition (PC-001 cross-note with null snapshot; PC-004 state/currentNote inconsistency) THEN the system SHALL return `Err(ContractViolationError)` immediately without performing any I/O or state transitions.

**Precondition violation behaviors** (summary):

| Precondition | Violation | Behavior |
|-------------|-----------|----------|
| PC-001: snapshot non-null iff cross-note | cross-note + `request.snapshot === null` | `Err({ kind: 'contract-violation', message: 'snapshot required for cross-note focus' })` |
| PC-001: same-note has no snapshot | same-note + `request.snapshot !== null` | Snapshot silently ignored; workflow proceeds normally |
| PC-002: snapshot body parseable | `parseMarkdownToBlocks(snapshot.body)` returns `Err` | Implementation MUST throw (programming error); silent fallback to empty Note is PROHIBITED |
| PC-003: state not saving/switching | `status === 'saving'` or `'switching'` | Behavior undefined; implementation MAY assert-throw in dev builds |
| PC-004: currentNote consistency | idle + `currentNote !== null`, or editing/save-failed + `currentNote === null` | `Err({ kind: 'contract-violation', message: 'currentNote inconsistent with state' })` |

**`ContractViolationError` type**:
```typescript
type ContractViolationError = {
  readonly kind: "contract-violation";
  readonly message: string;
};
```

**Acceptance Criteria**:
- Cross-note + `snapshot === null`: workflow returns `Err(ContractViolationError)` with no I/O performed.
- Editing state + `currentNote === null`: workflow returns `Err(ContractViolationError)` with no I/O performed.
- Parse failure in `parseMarkdownToBlocks`: implementation throws (not returns Err); this is a programming error, not a recoverable runtime error.
- On any `ContractViolationError` return: `EditingSessionState` is NOT modified; no events are emitted.

---

## CurrentSessionDecision × EditingSessionState Matrix

| State | same-noteId request | cross-noteId + isEmpty(note) | cross-noteId + !isEmpty(note) |
|-------|---------------------|----------------------|------------------------|
| `idle` | `no-current` (no id to compare; currentNote is null) | `no-current` | `no-current` |
| `editing` | `same-note` | `empty` | `dirty` |
| `save-failed` | `same-note` | `dirty` (not `empty` — see REQ-EPNS-007 note) | `dirty` |
| `saving` | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE |
| `switching` | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE |

Note: `SaveFailedState` does not apply `isEmpty` for cross-note classification — it always returns `dirty` regardless of whether the note is empty. The `empty` discard path is only safe when the system is confident the note was never meaningfully filled (`EditingState` only).

---

## Purity Boundary Candidates

| Step | Classification | Rationale |
|------|---------------|-----------|
| `classifyCurrentSession` | **Pure core** | Deterministic; no ports; `(EditingSessionState, BlockFocusRequest, Note \| null) → CurrentSessionDecision` is referentially transparent. All inputs are explicit parameters. Formally verifiable. |
| `flushCurrentSession` (same-note path) | **Pure shell (no-op)** | Returns `{ result: 'same-note-skipped' }` without any I/O |
| `flushCurrentSession` (no-current path) | **Pure shell (no-op)** | Returns `{ result: 'no-op' }` without any I/O |
| `flushCurrentSession` (empty path) | **Effectful shell** | Calls `Clock.now()` and `emit(EmptyNoteDiscarded)` |
| `flushCurrentSession` (dirty path) | **Effectful shell** | Invokes `CaptureAutoSave` blur save; emits `NoteFileSaved` or `NoteSaveFailed` (with `Clock.now()` on failure) |
| `parseMarkdownToBlocks` (hydration) | **Pure core** | Shared Kernel pure function (`blocks.ts`); `string → Result<Block[], BlockParseError>`; deterministic |
| `startNewSession` (cross-note) | **Effectful shell** | Calls `parseMarkdownToBlocks` (pure, but called here) + `Clock.now()` once; emits `BlockFocused` |
| `startNewSession` (same-note) | **Effectful shell** | Calls `Clock.now()` once; no hydration; emits `BlockFocused` |

**Formally verifiable pure core**: `classifyCurrentSession`, `parseMarkdownToBlocks`.
**Effectful shell**: all `flushCurrentSession` paths except no-op/same-note-skip, `startNewSession`.

---

## Edge Case Catalog

| Edge Case | Input conditions | Expected behavior |
|-----------|-----------------|-------------------|
| snapshot=null + cross-noteId | `request.snapshot === null && request.noteId !== state.currentNoteId` | `Err(ContractViolationError)` — see REQ-EPNS-013, PC-001 |
| currentNote=null + editing state | `currentState.status === 'editing' && currentNote === null` | `Err(ContractViolationError)` — see REQ-EPNS-013, PC-004 |
| snapshot body parse failure | `parseMarkdownToBlocks(snapshot.body)` returns Err | Implementation MUST throw (programming error); NOT a recoverable Err return |
| same-noteId, different blockId | `request.noteId === state.currentNoteId && request.blockId !== state.focusedBlockId` | Standard same-note path; `BlockFocused` emitted with new `blockId`; `isDirty` preserved |
| same-noteId, same blockId (idempotent) | `request.noteId === state.currentNoteId && request.blockId === state.focusedBlockId` | Same-note path; `BlockFocused` emitted once; state updated idempotently (`isDirty` preserved) |
| save-failed + new noteId + save succeeds | `SaveFailedState`, `request.noteId !== currentNoteId`, save succeeds | Old `pendingNextFocus` overwritten; `NewSession` with new noteId; state → editing |
| save-failed + new noteId + save fails | `SaveFailedState`, `request.noteId !== currentNoteId`, save fails | `SwitchError.pendingNextFocus` = new `{ noteId, blockId }`; old pending discarded |
| save-failed + same noteId (same-note) | `SaveFailedState`, `request.noteId === currentNoteId` | Classification returns `same-note`; flush returns `same-note-skipped`; `SaveFailedState` status PRESERVED (not cleared); `BlockFocused` emitted; no save I/O |
| save-failed + same noteId + same blockId | `SaveFailedState`, exact same focus | Same-note path; idempotent; `BlockFocused` emitted; save-failed status preserved; no state change |
| empty + save-failed cross-note | `SaveFailedState`, `request.noteId !== currentNoteId`, note is single empty paragraph | Always `dirty` (not `empty`) — see REQ-EPNS-007 classification table; re-save attempted |
| isDirty=true, same-note move | `EditingState { isDirty: true }`, `request.noteId === state.currentNoteId` | `isDirty` remains `true` after workflow; not cleared; idle-save timer continues |
