# Behavioral Specification: CaptureAutoSave

**Feature**: `capture-auto-save`
**Phase**: 1a
**Revision**: 1
**Source of truth**: `docs/domain/workflows.md` Workflow 2, `docs/domain/aggregates.md`, `docs/domain/domain-events.md`, `docs/domain/glossary.md`, `docs/domain/code/ts/src/capture/stages.ts`, `docs/domain/code/ts/src/capture/workflows.ts`, `docs/domain/code/ts/src/capture/states.ts`, `docs/domain/code/ts/src/shared/errors.ts`, `docs/domain/code/ts/src/shared/events.ts`
**Scope**: CaptureAutoSave pipeline only (idle save and blur save). Excludes: idle timer management (UI concern), debounce logic (UI concern), EditPastNoteStart flush (Workflow 3), HandleSaveFailure (Workflow 8). The pipeline starts when a save trigger fires and ends when `IndexedNote` is produced or an error is returned.

---

## Pipeline Overview

```
DirtyEditingSession → ValidatedSaveRequest → SerializedMarkdown → PersistedNote → IndexedNote
```

Each intermediate type carries stronger guarantees than the previous. The pipeline has a Capture-side front half (Steps 1–2, TypeScript) and a Vault-side back half (Step 3, Rust/Tauri). Step 4 (`updateProjections`) runs in the Curate context (TypeScript, in-memory).

**Trigger sources**: `NoteAutoSavedAfterIdle` (debounce ~2s) maps to `trigger: "idle"`; `NoteAutoSavedOnBlur` (focus out) maps to `trigger: "blur"`. Both enter the same pipeline.

---

## Requirements

### REQ-001: Happy Path — Full pipeline produces IndexedNote

**EARS**: WHEN a save trigger fires (idle or blur) AND the current `EditingSessionState` is `editing` with `isDirty=true` AND the body is non-empty THEN the system SHALL produce `Result<IndexedNote, SaveError>` where `IndexedNote` confirms that the note file has been written and the Curate projections (Feed, TagInventory) have been updated.

**Edge Cases**:
- Trigger is `idle` but body is empty: see REQ-003 (EmptyNoteDiscarded route).
- Trigger is `blur` with empty body: allowed — proceeds to save (see REQ-004).
- `isDirty=false`: the pipeline SHOULD NOT be invoked. Precondition enforcement is the caller's responsibility (UI/timer layer). If invoked with `isDirty=false`, behavior is undefined by this spec.

**Acceptance Criteria**:
- The pipeline returns `{ ok: true, value: IndexedNote }` on the happy path.
- `NoteFileSaved` public domain event is emitted exactly once (see REQ-009).
- `EditingSessionState` transitions through `editing → saving → editing` with `isDirty=false` and `lastSaveResult='success'` on return.
- `SaveNoteRequested` public domain event is emitted before the Vault write (see REQ-008).

---

### REQ-002: Step 1 — prepareSaveRequest validates and produces ValidatedSaveRequest

**EARS**: WHEN a `DirtyEditingSession` is provided with `trigger: "idle" | "blur"` THEN the system SHALL call `Clock.now()` to obtain a `Timestamp`, update `Note.frontmatter.updatedAt` to that timestamp, and produce a `ValidatedSaveRequest` containing `noteId`, `body`, `frontmatter` (with updated `updatedAt`), `previousFrontmatter`, `trigger`, and `requestedAt`.

**Validation rules** (source: `workflows.md` Step 1):
- `updatedAt >= createdAt` — enforced by Note aggregate invariant.
- Tag deduplication — enforced by Frontmatter VO.
- Empty body check — handled separately (REQ-003, REQ-004).

**Acceptance Criteria**:
- `ValidatedSaveRequest.kind === "ValidatedSaveRequest"`.
- `ValidatedSaveRequest.requestedAt` equals the `Timestamp` from `Clock.now()`.
- `ValidatedSaveRequest.frontmatter.updatedAt` equals `requestedAt`.
- `ValidatedSaveRequest.previousFrontmatter` carries the frontmatter state before this save operation (may be `null` for a never-saved note).
- `ValidatedSaveRequest.trigger` preserves the original trigger source.

---

### REQ-003: Step 1 — Empty body on idle save triggers EmptyNoteDiscarded

**EARS**: WHEN a `DirtyEditingSession` has `trigger: "idle"` AND `Note.isEmpty(note)` returns `true` THEN the system SHALL NOT proceed to Step 2 but SHALL emit `EmptyNoteDiscarded { noteId, occurredOn }` and return early.

**Source**: `workflows.md` Step 1 error column — `EmptyBodyOnIdleSave`.

**Acceptance Criteria**:
- `EmptyNoteDiscarded` public domain event is emitted exactly once with the correct `noteId`.
- The return value is `{ kind: "empty-discarded", event: EmptyNoteDiscarded }` (not an error — this is a valid early-exit route).
- No `SaveNoteRequested` is emitted.
- No file I/O occurs.
- No `NoteFileSaved` or `NoteSaveFailed` is emitted.

---

### REQ-004: Step 1 — Empty body on blur save proceeds to save

**EARS**: WHEN a `DirtyEditingSession` has `trigger: "blur"` AND `Note.isEmpty(note)` returns `true` THEN the system SHALL proceed to Step 2 normally (empty body is saved as a valid note).

**Rationale** (source: `workflows.md` Step 1): Blur save preserves user intent — the user may return to the note later. Only idle save discards empty notes.

**Acceptance Criteria**:
- A `ValidatedSaveRequest` is produced with empty `Body`.
- The pipeline continues through Steps 2, 3, 4.
- `EmptyNoteDiscarded` is NOT emitted.

---

### REQ-005: Step 1 — InvariantViolated error

**EARS**: WHEN `prepareSaveRequest` detects an invariant violation (e.g., `updatedAt < createdAt` after applying `Clock.now()`, which should be impossible under correct clock behavior) THEN the system SHALL return `SaveError { kind: 'validation', reason: { kind: 'invariant-violated', detail: string } }`.

**Acceptance Criteria**:
- `SaveError.kind === 'validation'`.
- `SaveError.reason.kind === 'invariant-violated'`.
- `SaveError.reason.detail` contains a human-readable description.
- No domain events are emitted.
- No file I/O occurs.

---

### REQ-006: Step 2 — serializeNote produces Obsidian-compatible markdown

**EARS**: WHEN a `ValidatedSaveRequest` is provided THEN the system SHALL serialize the frontmatter to YAML and produce a `SerializedMarkdown` string in the format `---\n{yaml}\n---\n{body}`.

**Source**: `workflows.md` Step 2 — `FrontmatterSerializer.toYaml(fm)`.

**Acceptance Criteria**:
- Output format is `---\n{yaml frontmatter}\n---\n{body text}`.
- `serializeNote` is a **pure function**: no I/O, no port calls, deterministic.
- The YAML section contains `tags`, `createdAt`, `updatedAt` fields from the frontmatter.
- The body section is the raw `Body` string (no transformation).
- This step never fails (the VO invariants guarantee valid input; source: `workflows.md` Step 2 error column: "なし").

---

### REQ-007: Step 3 — writeMarkdown performs atomic file write

**EARS**: WHEN a `SerializedMarkdown` and `NoteId` are provided THEN the system SHALL call `FileSystem.writeFileAtomic(path, content)` where `path` is derived from `NoteId` and the configured `VaultPath`, and produce `Result<PersistedNote, SaveError>`.

**Source**: `workflows.md` Step 3 — atomic write (temp file → rename).

**Acceptance Criteria**:
- On success: `PersistedNote` is produced confirming the write.
- On failure: `SaveError { kind: 'fs', reason: FsError }` is returned.
- The file path is `{vaultPath}/{noteId}.md`.
- The write is atomic (implementation detail: temp file then rename, deferred to Phase 2b).

---

### REQ-008: Step 3 — SaveNoteRequested emitted before write

**EARS**: WHEN `writeMarkdown` is about to perform the file write THEN the system SHALL emit `SaveNoteRequested` public domain event with `source` mapped from the trigger: `trigger: "idle"` → `source: "capture-idle"`, `trigger: "blur"` → `source: "capture-blur"`.

**Source**: `events.ts` `SaveNoteSource` type; `workflows.md` Workflow 2 発行イベント.

**Acceptance Criteria**:
- `SaveNoteRequested.kind === "save-note-requested"`.
- `SaveNoteRequested.noteId` matches the note being saved.
- `SaveNoteRequested.body` and `SaveNoteRequested.frontmatter` match the `ValidatedSaveRequest`.
- `SaveNoteRequested.previousFrontmatter` carries the pre-save frontmatter (may be `null`).
- `SaveNoteRequested.source` is `"capture-idle"` or `"capture-blur"` per the trigger.
- `SaveNoteRequested` is emitted BEFORE `NoteFileSaved` or `NoteSaveFailed`.

---

### REQ-009: Step 3 — NoteFileSaved emitted on successful write

**EARS**: WHEN `FileSystem.writeFileAtomic` succeeds THEN the system SHALL emit `NoteFileSaved` public domain event.

**Source**: `events.ts` `NoteFileSaved` type; `workflows.md` Step 3.

**Acceptance Criteria**:
- `NoteFileSaved.kind === "note-file-saved"`.
- `NoteFileSaved.noteId`, `.body`, `.frontmatter`, `.previousFrontmatter` match the saved note.
- `NoteFileSaved.occurredOn` is a valid `Timestamp`.
- `NoteFileSaved` is emitted exactly once per successful save.
- `NoteFileSaved` is emitted AFTER `SaveNoteRequested`.

---

### REQ-010: Step 3 — NoteSaveFailed emitted on write failure

**EARS**: WHEN `FileSystem.writeFileAtomic` fails with `FsError` THEN the system SHALL emit `NoteSaveFailed` public domain event AND return `SaveError { kind: 'fs', reason: FsError }`.

**FsError → NoteSaveFailureReason mapping**:

| `FsError.kind` | `NoteSaveFailureReason` |
|---|---|
| `permission` | `"permission"` |
| `disk-full` | `"disk-full"` |
| `lock` | `"lock"` |
| `not-found` | `"unknown"` |
| `unknown` | `"unknown"` |

**Source**: `errors.ts` `NoteSaveFailureReason`; `workflows.md` Step 3 error column.

**Acceptance Criteria**:
- `NoteSaveFailed.kind === "note-save-failed"`.
- `NoteSaveFailed.noteId` matches the note that failed to save.
- `NoteSaveFailed.reason` follows the mapping table above.
- `NoteSaveFailed` is emitted AFTER `SaveNoteRequested`.
- `NoteFileSaved` is NOT emitted when `NoteSaveFailed` is emitted.
- The pipeline returns `SaveError` and does NOT proceed to Step 4.

---

### REQ-011: Step 4 — updateProjections refreshes Feed and TagInventory

**EARS**: WHEN a `PersistedNote` is available (Step 3 succeeded) THEN the system SHALL call `Feed.refreshSort` and `TagInventory.applyDelta` in the Curate context to produce `IndexedNote`.

**Source**: `workflows.md` Step 4.

**Acceptance Criteria**:
- Feed sort order is refreshed to reflect the new `updatedAt`.
- `TagInventory` is updated with any tag additions or removals (delta from `previousFrontmatter` to `frontmatter`).
- `IndexedNote` is produced.
- This step has no file I/O — it is an in-memory projection update.
- This step never fails (source: `workflows.md` Step 4 error column: "なし").

---

### REQ-012: Step 4 — TagInventoryUpdated emitted on tag delta

**EARS**: WHEN `updateProjections` detects a tag difference between `previousFrontmatter.tags` and `frontmatter.tags` THEN the system SHALL emit `TagInventoryUpdated` event.

**Source**: `workflows.md` Step 4 発行 Event.

**Edge Cases**:
- No tag change: `TagInventoryUpdated` is NOT emitted.
- `previousFrontmatter` is `null` (first save of a new note with tags): all tags are additions → `TagInventoryUpdated` is emitted.
- `previousFrontmatter` is `null` and new note has no tags: no delta → `TagInventoryUpdated` is NOT emitted.

**Acceptance Criteria**:
- `TagInventoryUpdated` is emitted if and only if `previousFrontmatter?.tags` differs from `frontmatter.tags`.
- `TagInventoryUpdated` is an internal Curate event (not in `PublicDomainEvent` union — to be confirmed in Phase 1b).

---

### REQ-013: SaveError type exhaustiveness

**EARS**: WHEN any step in the CaptureAutoSave pipeline produces an error THEN the error SHALL be of type `SaveError`, which is exhaustively typed as `{ kind: 'validation', reason: SaveValidationError } | { kind: 'fs', reason: FsError }`.

**Source**: `errors.ts` `SaveError` type.

**Acceptance Criteria**:
- `SaveValidationError` has exactly two variants: `{ kind: 'empty-body-on-idle' }` and `{ kind: 'invariant-violated', detail: string }`.
- `FsError` has exactly five variants: `permission`, `disk-full`, `lock`, `not-found`, `unknown`.
- No other error type escapes the pipeline boundary.
- TypeScript exhaustiveness check (never branch in switch) validates this at compile time.

---

### REQ-014: Trigger source mapping is exhaustive

**EARS**: WHEN a save trigger fires THEN the `trigger` field SHALL be `"idle"` or `"blur"`, and `SaveNoteRequested.source` SHALL map as: `"idle"` → `"capture-idle"`, `"blur"` → `"capture-blur"`.

**Source**: `events.ts` `SaveNoteSource` type; `stages.ts` `DirtyEditingSession.trigger`.

**Acceptance Criteria**:
- `DirtyEditingSession.trigger` is typed as `"idle" | "blur"` — no other values.
- The mapping `trigger → source` is deterministic and exhaustive.
- `"curate-tag-chip"` and `"curate-frontmatter-edit-outside-editor"` sources are NOT produced by CaptureAutoSave (they belong to Workflow 4).

---

### REQ-015: EditingSessionState transitions during save

**EARS**: WHEN the CaptureAutoSave pipeline executes THEN `EditingSessionState` SHALL transition as follows:
- On pipeline entry: `editing` (with `isDirty=true`) → `saving` (via `beginAutoSave`).
- On success: `saving` → `editing` (with `isDirty=false`, `lastSaveResult='success'`, via `onSaveSucceeded`).
- On failure: `saving` → `save-failed` (with `lastSaveError: SaveError`, via `onSaveFailed`).

**Source**: `states.ts` `EditingSessionTransitions`.

**Acceptance Criteria**:
- The state machine transitions follow `EditingSessionTransitions` interface signatures.
- `SavingState.savingStartedAt` is set from `Clock.now()`.
- On success, `EditingState.lastSaveResult === 'success'`.
- On failure, `SaveFailedState.lastSaveError` carries the `SaveError`.
- On EmptyNoteDiscarded (REQ-003), the state does NOT transition to `saving` — it remains `editing` (or transitions per Capture's internal decision, out of scope for this pipeline spec).

---

### REQ-016: Non-functional — I/O boundary confinement

**EARS**: WHEN the CaptureAutoSave pipeline executes THEN I/O SHALL occur only in:
- Step 1: `Clock.now()` (one call).
- Step 3: `FileSystem.writeFileAtomic()` (one call), event emission.
- Step 4: in-memory projection update (no file I/O).

Step 2 (`serializeNote`) SHALL be a pure function with zero I/O.

**Acceptance Criteria**:
- `serializeNote` calls no ports and has no side effects.
- `Clock.now()` is called exactly once in the pipeline (in Step 1, `prepareSaveRequest`).
- `FileSystem.writeFileAtomic()` is called exactly once (in Step 3, `writeMarkdown`).
- Event emission (`publish`) occurs in Step 3 (SaveNoteRequested, NoteFileSaved/NoteSaveFailed) and optionally in Step 4 (TagInventoryUpdated).

---

### REQ-017: Pipeline orchestrator shape — CaptureAutoSave function signature

**EARS**: WHEN the CaptureAutoSave pipeline is invoked THEN it SHALL conform to the type signature: `(deps: CaptureDeps) => (state: EditingState, trigger: "idle" | "blur") => Promise<Result<NoteFileSaved, SaveError>>`.

**Source**: `workflows.ts` `CaptureAutoSave` type.

**Acceptance Criteria**:
- The function takes `CaptureDeps` as a curried dependency parameter.
- The input state must be `EditingState` (not `IdleState`, `SavingState`, etc.).
- The trigger is `"idle"` or `"blur"`.
- The return type is `Promise<Result<NoteFileSaved, SaveError>>`.
- The EmptyNoteDiscarded route is handled internally and does not appear in the top-level return type (it is surfaced via event emission only).

**NOTE on return type**: The `CaptureAutoSave` type signature in `workflows.ts` returns `Result<NoteFileSaved, SaveError>`. The EmptyNoteDiscarded route is a valid early exit that does not constitute an error — the implementation handles it by emitting the event and returning an appropriate result. The exact encoding of the "empty discarded" result in the `Result` type is an implementation decision deferred to Phase 2b.

---

## Purity Boundary Candidates (Preview for Phase 1b)

| Step | Classification | Rationale |
|------|---------------|-----------|
| Step 1: `prepareSaveRequest` | Mixed | `Clock.now()` is the only effectful call; validation logic is pure |
| Step 2: `serializeNote` | **Pure core** | No ports, no I/O, deterministic YAML serialization |
| Step 3: `writeMarkdown` | **Effectful shell** | `FileSystem.writeFileAtomic` + event emission |
| Step 4: `updateProjections` | In-memory write | Curate Read Model update; no file I/O |

The pure core target is `serializeNote`. Property-testable claims: deterministic serialization, Obsidian-compatible format, roundtrip with parser.

---

## Error Catalog (consolidated)

```ts
type SaveError =
  | { kind: 'validation'; reason: SaveValidationError }
  | { kind: 'fs'; reason: FsError }

type SaveValidationError =
  | { kind: 'empty-body-on-idle' }
  | { kind: 'invariant-violated'; detail: string }

type FsError =
  | { kind: 'permission'; path?: string }
  | { kind: 'disk-full' }
  | { kind: 'lock'; path?: string }
  | { kind: 'not-found'; path?: string }
  | { kind: 'unknown'; detail: string }
```

UI mapping:

| Error | UI Reaction |
|-------|------------|
| `empty-body-on-idle` | Silent (EmptyNoteDiscarded route) |
| `invariant-violated` | Internal bug: error log + silent |
| `permission` / `disk-full` / `lock` | Save failure banner with retry button, `EditingSessionState.status='save-failed'` |
| `not-found` / `unknown` | Save failure banner with retry button |

---

## Event Catalog (consolidated)

| Event | Step | Emitter Context | Type | Condition |
|-------|------|----------------|------|-----------|
| `EmptyNoteDiscarded` | 1 | Capture | Public | idle trigger + empty body |
| `SaveNoteRequested` | 3 (pre-write) | Capture | Public | always (on validated save) |
| `NoteFileSaved` | 3 (post-write) | Vault | Public | write success |
| `NoteSaveFailed` | 3 (post-write) | Vault | Public | write failure |
| `TagInventoryUpdated` | 4 | Curate | Internal | tag delta detected |
