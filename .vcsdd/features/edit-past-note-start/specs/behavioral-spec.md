# Behavioral Specification: EditPastNoteStart

**Feature**: `edit-past-note-start`
**Phase**: 1a
**Revision**: 4 (Sprint 2 — Block-Based Migration)
**Source of truth**: `docs/domain/workflows.md` Workflow 3 (block-based revision), `docs/domain/code/ts/src/capture/stages.ts`, `docs/domain/code/ts/src/capture/workflows.ts`, `docs/domain/code/ts/src/capture/internal-events.ts`, `docs/domain/code/ts/src/capture/states.ts`, `docs/domain/code/ts/src/shared/events.ts`, `docs/domain/code/ts/src/shared/errors.ts`, `docs/domain/code/ts/src/shared/note.ts`, `docs/domain/code/ts/src/shared/blocks.ts`
**Scope**: Synchronous workflow in Capture context that handles a Block Focus Request directed at a past note or a different block within the same note. The pipeline is `BlockFocusRequest → CurrentSessionDecision → FlushedCurrentSession → NewSession`. Workflow terminates with `Result<NewSession, SwitchError>`. UI reaction to errors and CaptureAutoSave internals are out of scope.

---

## Revision 4 Changes (from Revision 3)

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
| `NoteOps.isEmpty` definition | Whitespace-only body string | Block-based: `blocks.length === 1 && blocks[0]` is empty-content paragraph (narrower than CaptureAutoSave's broader rule — see REQ-EPNS-007 rationale) |
| Snapshot hydration mechanism | Unspecified conversion | `parseMarkdownToBlocks(snapshot.body)` from `shared/blocks.ts`; failure treated as contract violation |
| `previousFrontmatter` in input | Explicit pipeline input field | Still required for `BlurSave` port; derived from `note.frontmatter` context in editing buffer, passed through |
| Clock.now() budget | Same-note guard=1, no-current=1, empty=2, dirty-success=1, dirty-fail=1 | Same-note (via classify)=1, no-current=1, empty=2, dirty-success=1, dirty-fail=1 (same budget totals; guard call eliminated; classify is zero-clock) |

---

## Pipeline Overview

```
BlockFocusRequest (noteId, blockId, snapshot?)
    ↓
classifyCurrentSession (pure)
    ↓ CurrentSessionDecision: no-current | empty | dirty | same-note
flushCurrentSession (effectful only for dirty/empty paths)
    ↓ FlushedCurrentSession: no-op | discarded | saved | same-note-skipped
startNewSession (in-memory; hydrates snapshot for cross-note; reuses note for same-note)
    ↓ NewSession { noteId, note, focusedBlockId, startedAt }
    → emit BlockFocused { noteId, blockId, occurredOn }
```

**Architectural note**: In Revision 3, a pre-pipeline guard detected same-note re-selection and short-circuited before classification. In Revision 4, that guard is eliminated. Classification (`classifyCurrentSession`) is the sole decision point for same-note detection. This matches `stages.ts` comment: "同一 Note 内ブロック移動の場合は `same-note` を返し、flush をスキップ". The `classifyCurrentSession` function compares `request.noteId` with the current session's `currentNoteId` across all applicable state variants.

---

## Pipeline Input

```typescript
// From workflows.ts: EditPastNoteStart signature
type EditPastNoteStart = (deps: CaptureDeps) => (
  current: EditingSessionState,
  request: BlockFocusRequest,
) => Promise<Result<NewSession, SwitchError>>;

// From stages.ts: BlockFocusRequest definition
type BlockFocusRequest = {
  readonly kind: "BlockFocusRequest";
  readonly noteId: NoteId;
  readonly blockId: BlockId;
  /** Present when switching to a different note. null for intra-note block movement. */
  readonly snapshot: NoteFileSnapshot | null;
};
```

**`previousFrontmatter` sourcing**: The `BlurSave` port still requires `previousFrontmatter: Frontmatter | null` (for `NoteFileSaved.previousFrontmatter` / TagInventory delta). This value is NOT carried inside `BlockFocusRequest` — it is held in the editing buffer alongside the current `Note`. The caller (application layer) passes it to `flushCurrentSession` via `CaptureDeps` context or equivalent. It is NOT part of `BlockFocusRequest`; it is a side-channel from the Capture editing buffer.

**`snapshot` invariant**: `snapshot` is `null` for same-note intra-block movement (the existing `note` in editing state is re-used). For cross-note movement, `snapshot` is non-null and has been pre-validated by vault scan hydration. The workflow assumes pre-validated snapshots; parse failure in hydration is treated as a contract violation (see REQ-EPNS-008).

---

## Requirements

### REQ-EPNS-001: Happy Path — idle state, cross-note block focus

**EARS**: WHEN `BlockFocusRequest` arrives AND `EditingSessionState.status === 'idle'` THEN the system SHALL classify the current session as `'no-current'`, skip the flush step (no-op), hydrate the selected `NoteFileSnapshot` into a `Note` via `parseMarkdownToBlocks`, set `EditingSessionState` to `editing(noteId, focusedBlockId: blockId, isDirty: false)`, and emit `BlockFocused { noteId, blockId }`.

**Edge Cases**:
- `IdleState` has no `currentNoteId`; same-note check always fails for idle (no note to compare against), so classification always returns `no-current` regardless of `request.noteId`.
- `currentNote` is `null` for `IdleState`; this is expected.
- `snapshot` MUST be non-null for the idle path (idle means no current note; the target is always a different note). If `snapshot` is null on the idle path, it is a caller precondition violation (out of scope).

**Acceptance Criteria**:
- `classifyCurrentSession(IdleState, request)` returns `{ kind: 'no-current' }`.
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

**`NoteOps.isEmpty` definition for EditPastNoteStart scope**: A note is empty if `blocks.length === 1 && blocks[0].type === 'paragraph' && isEmptyOrWhitespaceContent(blocks[0].content)`. This is the narrower definition applicable to the discard decision in `EditPastNoteStart` — a note with a single empty paragraph is the canonical "new, untouched" note state. (Note: `CaptureAutoSave` uses a broader definition including dividers; this workflow uses the narrower one because it applies only to the standard initial-state empty note — a note with only dividers is intentional user content and would be dirty in this context.)

**Edge Cases**:
- Single empty paragraph `[paragraph("")]`: classified as empty.
- Single whitespace-only paragraph `[paragraph("  ")]`: classified as empty.
- More than one block (even if all empty): NOT classified as empty by this workflow — treated as `dirty` because the multi-block structure represents user-initiated block operations. (The one-block invariant for "new untouched note" applies here.)
- Non-paragraph single block (e.g., `[heading-1("")]`): NOT empty — treated as `dirty`.

**Acceptance Criteria**:
- `classifyCurrentSession(EditingState where isEmpty(note) && noteIds differ, request)` returns `{ kind: 'empty', noteId: state.currentNoteId }`.
- `EmptyNoteDiscarded { kind: 'empty-note-discarded', noteId: state.currentNoteId, occurredOn: Timestamp }` is emitted exactly once, before `BlockFocused`.
- `FlushedCurrentSession.result === 'discarded'`.
- `NewSession.noteId === request.noteId`.
- `NewSession.focusedBlockId === request.blockId`.
- `EditingSessionState.status === 'editing'` with `currentNoteId === request.noteId` and `isDirty === false`.
- `BlockFocused` is emitted after `EmptyNoteDiscarded`.
- No save I/O is performed.

---

### REQ-EPNS-003: Happy Path — editing state, dirty note, save succeeds, cross-note block focus

**EARS**: WHEN `BlockFocusRequest` arrives AND `EditingSessionState.status === 'editing'` AND `request.noteId !== state.currentNoteId` AND `!NoteOps.isEmpty(note)` THEN the system SHALL classify the session as `'dirty'`, invoke `CaptureAutoSave` blur save, on save success emit `NoteFileSaved`, set `EditingSessionState` to `editing(request.noteId, focusedBlockId: request.blockId)`, and emit `BlockFocused`.

**`NoteFileSaved` field sourcing** (block-based, Revision 4):
- `noteId`: from `state.currentNoteId` (the note being saved, NOT the target note)
- `blocks`: from `note.blocks` (current editing buffer blocks)
- `body`: `serializeBlocksToMarkdown(blocks)` (derived; CaptureAutoSave computes this)
- `frontmatter`: from `note.frontmatter` with `updatedAt` stamped by CaptureAutoSave
- `previousFrontmatter`: from the editing buffer's `previousFrontmatter` field
- `occurredOn`: stamped by CaptureAutoSave upon successful write

**Edge Cases**:
- `isDirty === false` but note is non-empty: still classified as `'dirty'` because classification is based on `NoteOps.isEmpty`, not the `isDirty` flag.

**Acceptance Criteria**:
- `classifyCurrentSession(EditingState where !isEmpty(note) && noteIds differ, request)` returns `{ kind: 'dirty', noteId: state.currentNoteId, note: Note }`.
- `CaptureAutoSave` blur save is invoked with the current note.
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
- `EditingSessionState.status === 'save-failed'` after the error.
- `EditingSessionState.pendingNextFocus === { noteId: request.noteId, blockId: request.blockId }` after the error.
- `BlockFocused` is NOT emitted.
- `NewSession` stage is NOT reached.

---

### REQ-EPNS-005: Same-Note Path — intra-note block movement (cross-note classification returns same-note)

**EARS**: WHEN `BlockFocusRequest` arrives AND `request.noteId === state.currentNoteId` (for `EditingState` or `SaveFailedState`) THEN the system SHALL classify the session as `'same-note'`, return `FlushedCurrentSession { result: 'same-note-skipped' }` with no I/O, and call `startNewSession` with the existing `note` (no hydration), setting `focusedBlockId = request.blockId`, then emit `BlockFocused { noteId: request.noteId, blockId: request.blockId }`.

**Design decision — classification owns same-note**: The `classifyCurrentSession` function compares `request.noteId` to `state.currentNoteId`. When they match, it returns `{ kind: 'same-note', noteId, note }`. There is NO pre-pipeline guard; classification is the sole decision point. This means `flushCurrentSession` receives a `same-note` decision and returns `same-note-skipped` without any I/O. `startNewSession` then re-uses the existing `note` from the decision payload and sets `focusedBlockId = request.blockId`.

**Same-note on `IdleState`**: `IdleState` has no `currentNoteId`. No same-note classification is possible. Classification always returns `no-current` for `IdleState`.

**Same-note edge cases**:
- `request.noteId === state.currentNoteId && request.blockId === state.focusedBlockId` (idempotent re-focus): treated identically to any same-note movement — `BlockFocused` is emitted once with the current `blockId`. No error or no-op short-circuit.
- `request.noteId === state.currentNoteId && request.blockId !== state.focusedBlockId` (normal intra-note block move): standard same-note path.
- `request.snapshot === null` on same-note path: expected — no hydration occurs, existing `note` is reused.

**Acceptance Criteria**:
- `classifyCurrentSession(EditingState where noteIds match, request)` returns `{ kind: 'same-note', noteId: request.noteId, note: currentNote }`.
- No save I/O is performed.
- `EmptyNoteDiscarded` is NOT emitted.
- `NoteFileSaved` is NOT emitted.
- `FlushedCurrentSession.result === 'same-note-skipped'`.
- `NewSession.focusedBlockId === request.blockId`.
- `NewSession.note` is the same `Note` object from `state` (not hydrated from snapshot).
- `EditingSessionState` updates only `focusedBlockId` (session is NOT terminated and restarted with a clean dirty flag — it continues from the current dirty status).
- `BlockFocused { kind: 'block-focused', noteId: request.noteId, blockId: request.blockId, occurredOn }` is emitted exactly once.
- `SwitchError` is NOT produced.

---

### REQ-EPNS-006: Save-Failed State — cross-note block focus attempts re-save

**EARS**: WHEN `BlockFocusRequest` arrives AND `EditingSessionState.status === 'save-failed'` AND `request.noteId !== state.currentNoteId` THEN the system SHALL classify the session as `'dirty'`, attempt a new save via `CaptureAutoSave`, and on success proceed to `startNewSession`; on failure return `SwitchError` with the new `pendingNextFocus`.

**Note sourcing for `SaveFailedState`**: `SaveFailedState` does not contain a `Note` field. The `currentNote` is provided by the application layer (from the in-memory editing buffer) — `classifyCurrentSession` receives it as the `current` parameter's associated context. For the workflow's purposes, the function signature `classifyCurrentSession(state: EditingSessionState, request: BlockFocusRequest) => CurrentSessionDecision` accesses the current `Note` from the editing buffer, not from the state object directly. The `dirty` decision carries `note: Note` taken from the editing buffer.

**`pendingNextFocus` supersession**: If `SaveFailedState.pendingNextFocus` was previously set (from an earlier failed switch), the new `request.noteId` + `request.blockId` supersede it entirely. The new `SwitchError.pendingNextFocus` points to the newly requested block.

**Edge Cases**:
- `SaveFailedState.pendingNextFocus === null` (idle save failed, not a switch failure): new cross-note request creates a fresh `pendingNextFocus`.
- `SaveFailedState.pendingNextFocus !== null` (prior failed switch): new request overwrites it with the current `request.noteId` + `request.blockId`.

**Acceptance Criteria**:
- `classifyCurrentSession(SaveFailedState, request)` returns `{ kind: 'dirty', noteId: state.currentNoteId, note: currentNote }` when `request.noteId !== state.currentNoteId`.
- On save success: `FlushedCurrentSession.result === 'saved'` and `NewSession.noteId === request.noteId`.
- On save failure: `SwitchError.pendingNextFocus === { noteId: request.noteId, blockId: request.blockId }`.
- Old `pendingNextFocus` is discarded (not merged or carried forward).

---

### REQ-EPNS-007: Pure Step — classifyCurrentSession

**EARS**: WHEN `classifyCurrentSession` is called with an `EditingSessionState` and `BlockFocusRequest` THEN the system SHALL return a `CurrentSessionDecision` deterministically with no side effects and no I/O.

**Function signature** (from `workflows.ts`):
```typescript
type ClassifyCurrentSession = (
  current: EditingSessionState,
  request: BlockFocusRequest,
) => CurrentSessionDecision;
```

**Classification table** (all state × request combinations):

| `EditingSessionState.status` | `request.noteId` vs `currentNoteId` | `isEmpty(note)` | `CurrentSessionDecision.kind` | Rationale |
|---|---|---|---|---|
| `'idle'` | n/a (no currentNoteId) | n/a | `'no-current'` | No active session |
| `'editing'` | `=== currentNoteId` | any | `'same-note'` | Intra-note block move; flush skip |
| `'editing'` | `!== currentNoteId` | `true` | `'empty'` | Empty note; discard without save |
| `'editing'` | `!== currentNoteId` | `false` | `'dirty'` | Has content; must save before switch |
| `'save-failed'` | `=== currentNoteId` | any | `'same-note'` | Intra-note block move during save-failed; flush skip; error state preserved |
| `'save-failed'` | `!== currentNoteId` | any | `'dirty'` | Must attempt re-save before switching |
| `'saving'` | any | any | NOT APPLICABLE | Caller must guard; concurrent save in progress |
| `'switching'` | any | any | NOT APPLICABLE | Caller must guard; already switching |

**`CurrentSessionDecision` type** (from `stages.ts`):
```typescript
type CurrentSessionDecision =
  | { readonly kind: "no-current" }
  | { readonly kind: "empty"; readonly noteId: NoteId }
  | { readonly kind: "dirty"; readonly noteId: NoteId; readonly note: Note }
  | { readonly kind: "same-note"; readonly noteId: NoteId; readonly note: Note };
```

**Acceptance Criteria**:
- `classifyCurrentSession` accepts `(EditingSessionState, BlockFocusRequest)` as inputs; it calls no ports.
- The function is referentially transparent: same inputs always produce the same `CurrentSessionDecision`.
- `SavingState` and `SwitchingState` are NOT valid inputs; the caller guards against them.
- `same-note` is returned whenever `request.noteId === state.currentNoteId` for `EditingState` or `SaveFailedState`.
- `note` is carried in the `dirty` and `same-note` decision variants (for use by `flushCurrentSession` and `startNewSession` respectively).

---

### REQ-EPNS-008: In-Memory Step — startNewSession

**EARS**: WHEN `FlushedCurrentSession` is available THEN the system SHALL construct a `NewSession { kind, noteId, note, focusedBlockId, startedAt: Clock.now() }`, emit `BlockFocused`, and transition `EditingSessionState` to `editing(noteId, focusedBlockId: blockId, isDirty: false)`.

**Cross-note path (snapshot hydration)**: When the decision was `no-current`, `empty`, or `dirty` — meaning the target note is a different one — the `note` for `NewSession` is hydrated from `request.snapshot` via `parseMarkdownToBlocks(snapshot.body)`. `parseMarkdownToBlocks` returns `Result<Block[], BlockParseError>`. Failure here is treated as a contract violation (invariant violation / throw) because snapshots are pre-validated at vault scan time. The workflow assumes the caller will never pass a snapshot that fails Block parsing; if it does, behavior is undefined by this spec and the implementation should throw with an internal error.

**Same-note path (no hydration)**: When the decision was `same-note`, the `note` in `NewSession` is taken directly from the `same-note` decision payload (which is the current note from `EditingState` or the editing buffer). No `parseMarkdownToBlocks` call is made. `focusedBlockId` is set to `request.blockId`.

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

**Acceptance Criteria**:
- `NewSession.noteId === request.noteId`.
- `NewSession.focusedBlockId === request.blockId`.
- `NewSession.startedAt` equals the `Clock.now()` call result in `startNewSession`.
- `NewSession.note` is hydrated from `request.snapshot` via `parseMarkdownToBlocks` for cross-note paths.
- `NewSession.note` is the existing `note` from the session (no hydration) for the `same-note` path.
- `EditingSessionState.status === 'editing'`.
- `EditingSessionState.currentNoteId === request.noteId`.
- `EditingSessionState.focusedBlockId === request.blockId`.
- `EditingSessionState.isDirty === false`.
- `BlockFocused { kind: 'block-focused', noteId: request.noteId, blockId: request.blockId, occurredOn: NewSession.startedAt }` is emitted exactly once.
- `Clock.now()` is called exactly once per `startNewSession` invocation.

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

| Path | `flushCurrentSession` calls | `startNewSession` calls | Total |
|------|-------|-------|-------|
| Same-note (intra-block move, any state) | 0 (no-op via `same-note-skipped`) | 1 | 1 |
| No-current (idle) | 0 (no-op) | 1 | 1 |
| Empty (discard) | 1 (`EmptyNoteDiscarded.occurredOn`) | 1 (`NewSession.startedAt`) | 2 |
| Dirty, save succeeds | 0 (CaptureAutoSave handles its own timestamps) | 1 | 1 |
| Dirty, save fails | 1 (`NoteSaveFailed.occurredOn`) | 0 (not reached) | 1 |

**Acceptance Criteria**:
- `classifyCurrentSession` has no port dependencies: no `Clock`, no `CaptureAutoSave`, no filesystem.
- `flushCurrentSession` calls `CaptureAutoSave` exactly once when session is `dirty`; calls `Clock.now()` exactly once on the empty path; calls `Clock.now()` zero times on no-current, dirty, and same-note paths.
- `startNewSession` calls `Clock.now()` exactly once (for `NewSession.startedAt` and `BlockFocused.occurredOn`).
- Total `Clock.now()` budget per workflow run: ≤2 calls.

---

## CurrentSessionDecision × EditingSessionState Matrix

| State | same-noteId request | cross-noteId + isEmpty | cross-noteId + !isEmpty |
|-------|---------------------|----------------------|------------------------|
| `idle` | `no-current` (no id to compare) | `no-current` | `no-current` |
| `editing` | `same-note` | `empty` | `dirty` |
| `save-failed` | `same-note` | `dirty` (note from buffer) | `dirty` (note from buffer) |
| `saving` | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE |
| `switching` | NOT APPLICABLE | NOT APPLICABLE | NOT APPLICABLE |

Note: `SaveFailedState` does not apply `isEmpty` for cross-note classification — it always returns `dirty` regardless of whether the note is empty. Rationale: a save-failed note has already been in the dirty path; discarding it via `isEmpty` would silently drop content that the user attempted to save. The empty path is only taken when the system is confident the note was never meaningfully filled (`EditingState` only).

---

## Purity Boundary Candidates

| Step | Classification | Rationale |
|------|---------------|-----------|
| `classifyCurrentSession` | **Pure core** | Deterministic; no ports; `(EditingSessionState, BlockFocusRequest) → CurrentSessionDecision` is referentially transparent. Formally verifiable. |
| `flushCurrentSession` (same-note path) | **Pure shell (no-op)** | Returns `{ result: 'same-note-skipped' }` without any I/O |
| `flushCurrentSession` (no-current path) | **Pure shell (no-op)** | Returns `{ result: 'no-op' }` without any I/O |
| `flushCurrentSession` (empty path) | **Effectful shell** | Calls `Clock.now()` and `emit(EmptyNoteDiscarded)` |
| `flushCurrentSession` (dirty path) | **Effectful shell** | Invokes `CaptureAutoSave` blur save; emits `NoteFileSaved` or `NoteSaveFailed` |
| `parseMarkdownToBlocks` (hydration) | **Pure core** | Shared Kernel pure function (`blocks.ts`); `string → Result<Block[], BlockParseError>`; deterministic |
| `startNewSession` (cross-note) | **Effectful shell** | Calls `parseMarkdownToBlocks` (pure, but called here) + `Clock.now()` once; emits `BlockFocused` |
| `startNewSession` (same-note) | **Effectful shell** | Calls `Clock.now()` once; no hydration; emits `BlockFocused` |

**Formally verifiable pure core**: `classifyCurrentSession`, `parseMarkdownToBlocks`.
**Effectful shell**: all `flushCurrentSession` paths except no-op/same-note-skip, `startNewSession`.

---

## Edge Case Catalog

| Edge Case | Input conditions | Expected behavior |
|-----------|-----------------|-------------------|
| snapshot=null + cross-noteId | `request.snapshot === null && request.noteId !== state.currentNoteId` | Caller precondition violation; behavior undefined by this spec (caller must supply snapshot for cross-note) |
| same-noteId, different blockId | `request.noteId === state.currentNoteId && request.blockId !== state.focusedBlockId` | Standard same-note path; `BlockFocused` emitted with new `blockId` |
| same-noteId, same blockId (idempotent) | `request.noteId === state.currentNoteId && request.blockId === state.focusedBlockId` | Same-note path; `BlockFocused` emitted once; state updated (idempotent) |
| save-failed + new noteId + save succeeds | `SaveFailedState`, `request.noteId !== currentNoteId`, save succeeds | Old `pendingNextFocus` overwritten; `NewSession` with new noteId |
| save-failed + new noteId + save fails | `SaveFailedState`, `request.noteId !== currentNoteId`, save fails | `SwitchError.pendingNextFocus` = new `{ noteId, blockId }`; old pending discarded |
| save-failed + same noteId (same-note) | `SaveFailedState`, `request.noteId === currentNoteId` | Classification returns `same-note`; flush returns `same-note-skipped`; `SaveFailedState` status PRESERVED (not cleared); `BlockFocused` emitted; no save I/O |
| save-failed + same noteId + same blockId | `SaveFailedState`, exact same focus | Same-note path; idempotent; `BlockFocused` emitted; save-failed status preserved |
| empty + save-failed cross-note | `SaveFailedState`, `request.noteId !== currentNoteId` | Always `dirty` (not `empty`) — see classification table; re-save attempted |
