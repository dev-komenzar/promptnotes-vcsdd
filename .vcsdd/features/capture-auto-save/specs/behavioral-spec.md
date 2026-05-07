# Behavioral Specification: CaptureAutoSave

**Feature**: `capture-auto-save`
**Phase**: 1a
**Revision**: 4 (FIND-012..019: isEmpty broader rule, factory-pattern convention for ValidatedSaveRequest, pipeline scope clarification, empty-Note variants table, SaveNoteRequested timing consistency)
**Source of truth**: `docs/domain/workflows.md` Workflow 2, `docs/domain/aggregates.md` §1 Note Aggregate（Block Sub-entity）, `docs/domain/domain-events.md`, `docs/domain/glossary.md` §0 Shared Kernel（Block 系語彙）, `docs/domain/code/ts/src/shared/note.ts`, `docs/domain/code/ts/src/shared/blocks.ts`, `docs/domain/code/ts/src/capture/stages.ts`, `docs/domain/code/ts/src/capture/workflows.ts`, `docs/domain/code/ts/src/capture/states.ts`, `docs/domain/code/ts/src/shared/errors.ts`, `docs/domain/code/ts/src/shared/events.ts`
**Scope**: CaptureAutoSave pipeline only (idle save and blur save). Excludes: idle timer management (UI concern), debounce logic (UI concern), EditPastNoteStart flush (Workflow 3), HandleSaveFailure (Workflow 8). The pipeline starts when a save trigger fires and ends when `NoteFileSaved` is emitted (success) or `NoteSaveFailed` is emitted / an error occurs (failure). Step 4 (`updateProjections`) is the Curate-side reaction to `NoteFileSaved` — it is part of the wider Workflow 2 narrative but lies OUTSIDE the CaptureAutoSave pipeline boundary. See cross-context post-conditions section (REQ-011/REQ-012) for traceability.

---

## 改訂履歴 / Revision Log

| 日付 | 反復 | 対象 finding | 概要 |
|------|------|-------------|------|
| 2026-04-30 | 2 | FIND-001 | REQ-001, REQ-017: return type を `Result<NoteFileSaved, SaveError>` に統一（canonical `workflows.ts` CaptureAutoSave 型に準拠）。`IndexedNote` / `SavedNoteAck` は使わない |
| 2026-04-30 | 2 | FIND-002 | REQ-003: EmptyNoteDiscarded は success チャネル（`PrepareSaveRequest` の戻り値）であり `SaveError` ではないことを明示。Error Catalog から `empty-body-on-idle` の UI mapping 行を EmptyNoteDiscarded ルートとして再分類 |
| 2026-04-30 | 2 | FIND-003 | REQ-006: `FrontmatterSerializer.toYaml` は外部ポートではなくモジュール内部の純粋関数として位置づけ。`serializeNote` が依存するのはこの内部関数のみであり、`CaptureDeps` のポートは呼ばない |
| 2026-04-30 | 2 | FIND-004 | REQ-008: `SaveNoteRequested` の発行タイミングを「Step 3 の write 前」から「Step 1 完了直後、状態遷移 `editing → saving` と同時」に修正（canonical `EmitSaveAndTransition` に準拠） |
| 2026-05-07 | 3 | block-migration | 型契約のブロックベース化に伴う再仕様化。`ValidatedSaveRequest` / `SaveNoteRequested` / `NoteFileSaved` の payload に `blocks: ReadonlyArray<Block>` を追加し、`body: Body` は `serializeBlocksToMarkdown(blocks)` 派生フィールドとして両持ち化（domain-events.md L55–56 / L115–116 と整合）。`Note.isEmpty()` 定義を「blocks が `[empty paragraph]` のみ」に再定義。Step 2 `serializeNote` を「`serializeBlocksToMarkdown(blocks)` で本文を、内部 YAML 関数で frontmatter を直列化する合成関数」と再定義し、新たな pure core ターゲットとして `serializeBlocksToMarkdown` を追加。新規 REQ-018（body/blocks 整合不変条件）を追加 |
| 2026-05-07 | 4 | FIND-012 | REQ-003: `Note.isEmpty()` 定義を `aggregates.md` L120/L142 の広義ルール「全ブロックが空（または divider のみ）」に更新。単一空 paragraph のみという狭義定義を破棄。PROP-025 および関連箇所も同期更新 |
| 2026-05-07 | 4 | FIND-013 | REQ-018: ValidatedSaveRequest 構築を factory 関数 `buildValidatedSaveRequest` 経由に限定するコード規約として再定義。型レベル強制ではなくコードレビュー規約として明示。Rust エコー方式（blocks/body を SaveNoteRequested からそのまま転送）を明記 |
| 2026-05-07 | 4 | FIND-015 | Scope 文を更新（Step 4 は Curate-side handler の責務と明記）。REQ-011/REQ-012 を cross-context post-conditions サブセクションへ移動。REQ-016 から Step 4 publish 言及を削除。REQ-001 の reconciliation note を修正 |
| 2026-05-07 | 4 | FIND-016 | REQ-003 に Empty-Note variants テーブルを追加。各形状の idle / blur 動作を明示 |
| 2026-05-07 | 4 | FIND-018 | REQ-008 / REQ-016 / Event Catalog の SaveNoteRequested 発行タイミング表現を「オーケストレーション境界」で統一 |

---

## Pipeline Overview

```
DirtyEditingSession (note.blocks)
  → ValidatedSaveRequest (blocks + derived body)
  → SerializedMarkdown
  → PersistedNote
```

Each intermediate type carries stronger guarantees than the previous. The pipeline has a Capture-side front half (Steps 1–2, TypeScript) and a Vault-side back half (Step 3, Rust/Tauri). Step 4 (`updateProjections`) is the Curate context reaction to `NoteFileSaved` and is NOT part of this pipeline.

**Block-based primary representation** (Revision 3): the editor maintains state as `Note.blocks: ReadonlyArray<Block>`. `body: Body` is a **derived field** computed via `serializeBlocksToMarkdown(blocks)`. The pipeline carries both representations through `ValidatedSaveRequest`, `SaveNoteRequested`, and `NoteFileSaved` — `blocks` for downstream Block-aware consumers (Curate, EditPastNoteStart re-hydration), `body` for the file-bytes boundary and search/legacy compatibility. The implementation MUST guarantee `body === serializeBlocksToMarkdown(blocks)` at every carrier site (REQ-018).

**Trigger sources**: `NoteAutoSavedAfterIdle` (debounce ~2s) maps to `trigger: "idle"`; `NoteAutoSavedOnBlur` (focus out) maps to `trigger: "blur"`. Both enter the same pipeline.

---

## Requirements

### REQ-001: Happy Path — Full pipeline produces NoteFileSaved

**EARS**: WHEN a save trigger fires (idle or blur) AND the current `EditingSessionState` is `editing` with `isDirty=true` AND the body is non-empty THEN the system SHALL produce `Result<NoteFileSaved, SaveError>` where `NoteFileSaved` confirms that the note file has been written.

**Return type reconciliation** (resolves FIND-001):
- The canonical return type is `Promise<Result<NoteFileSaved, SaveError>>` per `workflows.ts` line 73 (`CaptureAutoSave` type).
- `workflows.md` uses the informal name `SavedNoteAck` for the same concept — this spec uses `NoteFileSaved` exclusively.
- `IndexedNote` (from `workflows.md` stage pipeline) is an internal concept: after `NoteFileSaved` is emitted, the Curate context independently updates Feed/TagInventory in response to the event (out of pipeline scope; see REQ-011/REQ-012 cross-context section).

**Edge Cases**:
- Trigger is `idle` but body is empty: see REQ-003 (EmptyNoteDiscarded route — success channel, not error).
- Trigger is `blur` with empty body: allowed — proceeds to save (see REQ-004).
- `isDirty=false`: the pipeline SHOULD NOT be invoked. Precondition enforcement is the caller's responsibility (UI/timer layer). If invoked with `isDirty=false`, behavior is undefined by this spec.

**Acceptance Criteria**:
- The pipeline returns `{ ok: true, value: NoteFileSaved }` on the happy path.
- `NoteFileSaved.blocks` carries the full `ReadonlyArray<Block>` of the saved note and `NoteFileSaved.body === serializeBlocksToMarkdown(NoteFileSaved.blocks)`.
- `NoteFileSaved` public domain event is emitted exactly once (see REQ-009).
- `EditingSessionState` transitions through `editing → saving → editing` with `isDirty=false` and `lastSaveResult='success'` on return.
- `SaveNoteRequested` public domain event is emitted at the orchestration boundary (see REQ-008).

---

### REQ-002: Step 1 — prepareSaveRequest validates and produces ValidatedSaveRequest

**EARS**: WHEN a `DirtyEditingSession` is provided with `trigger: "idle" | "blur"` THEN the system SHALL call `Clock.now()` to obtain a `Timestamp`, update `Note.frontmatter.updatedAt` to that timestamp, and produce a `ValidatedSaveRequest` containing `noteId`, `blocks`, `body` (= `serializeBlocksToMarkdown(blocks)`), `frontmatter` (with updated `updatedAt`), `previousFrontmatter`, `trigger`, and `requestedAt`.

**Validation rules** (source: `workflows.md` Step 1; `stages.ts` `ValidatedSaveRequest`):
- `updatedAt >= createdAt` — enforced by Note aggregate invariant.
- Tag deduplication — enforced by Frontmatter VO.
- Block invariants — enforced by Note aggregate (blocks.length ≥ 1; per-Block content/type compatibility per `aggregates.md` §1).
- Empty body check — handled separately via `Note.isEmpty()` (REQ-003, REQ-004).
- Body/blocks coherence — `body === serializeBlocksToMarkdown(blocks)` (REQ-018).

**Acceptance Criteria**:
- `ValidatedSaveRequest.kind === "ValidatedSaveRequest"`.
- `ValidatedSaveRequest.blocks` is the same `ReadonlyArray<Block>` reference as `note.blocks` from the input session (block content is not re-edited at this step).
- `ValidatedSaveRequest.body` equals `serializeBlocksToMarkdown(ValidatedSaveRequest.blocks)` (the derived-body invariant; see REQ-018).
- `ValidatedSaveRequest.requestedAt` equals the `Timestamp` from `Clock.now()`.
- `ValidatedSaveRequest.frontmatter.updatedAt` equals `requestedAt`.
- `ValidatedSaveRequest.previousFrontmatter` carries the frontmatter state before this save operation (may be `null` for a never-saved note).
- `ValidatedSaveRequest.trigger` preserves the original trigger source.

---

### REQ-003: Step 1 — Empty body on idle save triggers EmptyNoteDiscarded

**EARS**: WHEN a `DirtyEditingSession` has `trigger: "idle"` AND `Note.isEmpty(note)` returns `true` THEN the system SHALL NOT proceed to Step 2 but SHALL emit `EmptyNoteDiscarded { noteId, occurredOn }` and return `Err(SaveError { kind: 'validation', reason: { kind: 'empty-body-on-idle' } })`.

**`Note.isEmpty` definition** (Revision 4 — broader rule per `aggregates.md` L120 and L142):

`isEmpty(note)` returns `true` iff **all blocks are either (a) an empty/whitespace-only paragraph or (b) a divider**. Formally:

```
note.isEmpty() === note.blocks.every(b =>
  b.type === "divider" ||
  (b.type === "paragraph" && isEmptyOrWhitespaceContent(b.content))
)
```

where `isEmptyOrWhitespaceContent` is defined in the verification architecture. A divider is empty by Block type invariant (`aggregates.md` §1: "divider は常に空 content"). The function returns `false` for any block of type `heading-1`, `heading-2`, `heading-3`, `bullet`, `numbered`, `code`, or `quote` — regardless of content — because these types carry structural-distinctiveness that constitutes non-empty user intent (structural-distinctiveness rule, derived from `aggregates.md` L88 "空 paragraph は許容" — only paragraph and divider are afforded the "structurally empty" classification).

**Source**: `aggregates.md` L120 ("全ブロックが空（または `divider` のみ）の Note はファイル化されない（Capture 側ルール）。判定は `note.isEmpty()` が担う") and L142 ("`note.isEmpty(): boolean` | 全ブロックが空（または divider のみ）か判定"); `workflows.md` Step 1 error column — `EmptyBodyOnIdleSave`; `errors.ts` `SaveValidationError`; `note.ts` `NoteOps.isEmpty`.

**Empty-Note variants** (per FIND-016 — exhaustive enumeration):

| Variant | blocks | `isEmpty()` | idle behavior | blur behavior |
|---------|--------|-------------|---------------|---------------|
| single-empty-para | `[paragraph("")]` | **true** | Discard (EmptyNoteDiscarded) | Save |
| multi-empty-para | `[paragraph(""), paragraph("")]` | **true** | Discard | Save |
| whitespace-para | `[paragraph(" \t")]` | **true** | Discard | Save |
| divider-only | `[divider]` | **true** | Discard | Save |
| divider-and-empty | `[divider, paragraph("")]` | **true** | Discard | Save |
| empty-heading | `[heading-1("")]` | **false** (structural-distinctiveness rule) | Save | Save |
| empty-bullet | `[bullet("")]` | **false** (structural-distinctiveness rule) | Save | Save |
| nonempty | `[paragraph("hi")]` | **false** | Save | Save |

**Decision on empty-heading / empty-bullet**: An empty `heading-1("") ` has empty content but its block type is not `paragraph` or `divider`. Per `aggregates.md` L88 and the structural-distinctiveness rule stated above, only `paragraph` and `divider` blocks contribute to the "structurally empty" classification. A note containing `[heading-1("")]` is therefore NOT empty and SHALL be saved even on idle trigger (no data-loss risk because the user explicitly inserted a heading-type block).

**Two-layer channel design** (Sprint 4 reconciliation with canonical `CaptureAutoSave` type):

The empty-idle path operates at two layers:

1. **`prepareSaveRequest` layer** (internal): Returns `Ok({kind:"empty-discarded"})`. The function successfully classified the input as empty — this is a valid classification result, not an error at this function's abstraction level.

2. **`CaptureAutoSave` pipeline layer** (canonical API): The canonical return type is `Result<NoteFileSaved, SaveError>` per `workflows.ts` line 73. Since no file was saved, there is no `NoteFileSaved` to return in the Ok channel. The pipeline converts the empty-discarded result into `Err({ kind: 'validation', reason: { kind: 'empty-body-on-idle' } })`, using the `SaveValidationError` variant that exists in `errors.ts` precisely for this purpose.

The `EmptyNoteDiscarded` event is emitted regardless — it conveys domain semantics (the note was discarded). The return type conveys API semantics (no file was saved).

**Acceptance Criteria**:
- `EmptyNoteDiscarded` public domain event is emitted exactly once with the correct `noteId`.
- `prepareSaveRequest` internally returns `Ok({ kind: "empty-discarded" })`.
- The pipeline returns `Err(SaveError { kind: 'validation', reason: { kind: 'empty-body-on-idle' } })` at the `CaptureAutoSave` API boundary.
- No `SaveNoteRequested` is emitted.
- No file I/O occurs.
- No `NoteFileSaved` or `NoteSaveFailed` is emitted.
- `EditingSessionState` does NOT transition to `saving` (see REQ-015).
- All five true-isEmpty variants in the empty-Note variants table (single-empty-para, multi-empty-para, whitespace-para, divider-only, divider-and-empty) are discarded on idle trigger.

---

### REQ-004: Step 1 — Empty body on blur save proceeds to save

**EARS**: WHEN a `DirtyEditingSession` has `trigger: "blur"` AND `Note.isEmpty(note)` returns `true` THEN the system SHALL proceed to Step 2 normally (empty body is saved as a valid note).

**Rationale** (source: `workflows.md` Step 1): Blur save preserves user intent — the user may return to the note later. Only idle save discards empty notes.

**Acceptance Criteria**:
- A `ValidatedSaveRequest` is produced with `isEmpty(note) === true` blocks and `body === serializeBlocksToMarkdown(blocks)` (typically the empty string or whitespace-only string per `serializeBlocksToMarkdown` semantics).
- The pipeline continues through Steps 2, 3.
- `EmptyNoteDiscarded` is NOT emitted.
- All five true-isEmpty variants in the empty-Note variants table (single-empty-para, multi-empty-para, whitespace-para, divider-only, divider-and-empty) proceed to save on blur trigger.

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

**EARS**: WHEN a `ValidatedSaveRequest` is provided THEN the system SHALL serialize the frontmatter to YAML and the blocks to a Markdown body via `serializeBlocksToMarkdown(blocks)`, and produce a `SerializedMarkdown` string in the format `---\n{yaml}\n---\n{body}`.

**Source**: `workflows.md` Step 2 — `FrontmatterSerializer.toYaml(fm)`; `blocks.ts` `SerializeBlocksToMarkdown`.

**Composition** (Revision 3): `serializeNote` is a composition of two pure functions:
1. `frontmatterToYaml(frontmatter)` — internal YAML serializer (resolved per FIND-003 / FIND-006: a module-level pure function, NOT a `CaptureDeps` port).
2. `serializeBlocksToMarkdown(blocks)` — Shared Kernel pure function from `blocks.ts`. Used by Vault (file write), Capture (clipboard via `bodyForClipboard`), and Curate (search index). The same function is used to derive `ValidatedSaveRequest.body` in Step 1, so when `serializeNote` reads `request.body`, the result is identical to recomputing `serializeBlocksToMarkdown(request.blocks)` (REQ-018).

`serializeNote` MAY consume `request.body` directly (since REQ-018 guarantees it equals `serializeBlocksToMarkdown(request.blocks)`) OR recompute from `request.blocks`. Both are observationally equivalent.

**Purity clarification** (resolves FIND-003):
- `serializeNote` is a **pure function** that takes only a `ValidatedSaveRequest` as input and returns `SerializedMarkdown`.
- `FrontmatterSerializer.toYaml` is listed in `workflows.md` as a dependency, but it is an **internal pure function** (module-level helper), NOT an external port injected via `CaptureDeps`. The canonical `CaptureDeps` in `ports.ts` does not include it.
- `SerializeBlocksToMarkdown` (`blocks.ts`) is a Shared Kernel pure function — also NOT a `CaptureDeps` port. It is depended upon directly at module import time.
- `serializeNote` has **zero `CaptureDeps` port calls**. It may internally use a YAML serialization library (e.g., `js-yaml`), but this is a build-time dependency, not a runtime port.

**Acceptance Criteria**:
- Output format is `---\n{yaml frontmatter}\n---\n{body text}`.
- `serializeNote` is a **pure function**: no I/O, no `CaptureDeps` port calls, deterministic.
- `serializeNote` function signature has no `deps` parameter — it takes only `ValidatedSaveRequest`.
- The YAML section contains `tags`, `createdAt`, `updatedAt` fields from the frontmatter.
- The body section equals `serializeBlocksToMarkdown(request.blocks)` (and equivalently `request.body` per REQ-018).
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

### REQ-008: SaveNoteRequested emitted at orchestration boundary (editing → saving)

**EARS**: WHEN `prepareSaveRequest` produces a `ValidatedSaveRequest` AND the state transitions from `editing` to `saving` THEN the system SHALL emit `SaveNoteRequested` public domain event with `source` mapped from the trigger: `trigger: "idle"` → `source: "capture-idle"`, `trigger: "blur"` → `source: "capture-blur"`.

**Source**: `events.ts` `SaveNoteSource` type; `workflows.ts` `EmitSaveAndTransition` type (line 149–155).

**Emission timing** (resolves FIND-004, FIND-018):
`SaveNoteRequested` is emitted at the **orchestration boundary** BETWEEN Step 1 and Step 3 — concretely, when `EmitSaveAndTransition(deps)(request, state)` is invoked AFTER `prepareSaveRequest` succeeds AND BEFORE `dispatchSaveRequest` (Step 3 wrapper) is called. Step 2 (`serializeNote`) may run before or after this emission since it has no observable side effects. `SaveNoteRequested` is NOT emitted inside `writeMarkdown` itself — it is emitted at the orchestration layer when the state machine transitions to `saving`.

**Acceptance Criteria**:
- `SaveNoteRequested.kind === "save-note-requested"`.
- `SaveNoteRequested.noteId` matches the note being saved.
- `SaveNoteRequested.blocks` equals `ValidatedSaveRequest.blocks` (same `ReadonlyArray<Block>`).
- `SaveNoteRequested.body` equals `ValidatedSaveRequest.body` and `serializeBlocksToMarkdown(SaveNoteRequested.blocks)` (REQ-018).
- `SaveNoteRequested.frontmatter` matches the `ValidatedSaveRequest.frontmatter`.
- `SaveNoteRequested.previousFrontmatter` carries the pre-save frontmatter (may be `null`).
- `SaveNoteRequested.source` is `"capture-idle"` or `"capture-blur"` per the trigger.
- `SaveNoteRequested` is emitted at the orchestration boundary (post-Step 1, pre-Step 3), BEFORE `NoteFileSaved` or `NoteSaveFailed`.
- `SaveNoteRequested` is NOT emitted on the EmptyNoteDiscarded path (REQ-003).

---

### REQ-009: Step 3 — NoteFileSaved emitted on successful write

**EARS**: WHEN `FileSystem.writeFileAtomic` succeeds THEN the system SHALL emit `NoteFileSaved` public domain event.

**Source**: `events.ts` `NoteFileSaved` type; `workflows.md` Step 3.

**Acceptance Criteria**:
- `NoteFileSaved.kind === "note-file-saved"`.
- `NoteFileSaved.noteId`, `.blocks`, `.body`, `.frontmatter`, `.previousFrontmatter` match the saved note.
- `NoteFileSaved.body === serializeBlocksToMarkdown(NoteFileSaved.blocks)` (REQ-018).
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
- The pipeline returns `SaveError` and does NOT proceed further.

---

## Cross-context post-conditions (Curate-side handler of `NoteFileSaved`)

The following requirements describe behavior that occurs OUTSIDE the CaptureAutoSave pipeline boundary. They are traced here for completeness because they are part of `workflows.md` Workflow 2. Verification responsibility lies in the Curate-side handler (or equivalent integration test), NOT in this feature's verification architecture. The `apply-filter-or-search` feature spec does not currently cover this area; a dedicated Curate projection-refresh spec is the correct future home for these requirements.

### REQ-011: Curate-side — updateProjections refreshes Feed and TagInventory

**EARS**: WHEN a `NoteFileSaved` event is observed by the Curate context handler THEN the Curate handler SHALL call `Feed.refreshSort` and `TagInventory.applyDelta` to produce `IndexedNote`.

**Source**: `workflows.md` Step 4.

**Cross-context note**: This requirement is traced here for workflow completeness. CaptureAutoSave has no `Feed` or `TagInventory` ports (see `ports.ts` — `CaptureDeps` contains only `clockNow`, `allocateNoteId`, `clipboardWrite`, `publish`). The Curate handler fires independently in response to the `NoteFileSaved` public domain event.

**Acceptance Criteria** (Curate handler's responsibility):
- Feed sort order is refreshed to reflect the new `updatedAt`.
- `TagInventory` is updated with any tag additions or removals (delta from `previousFrontmatter` to `frontmatter`).
- `IndexedNote` is produced.
- This step has no file I/O — it is an in-memory projection update.
- This step never fails (source: `workflows.md` Step 4 error column: "なし").

---

### REQ-012: Curate-side — TagInventoryUpdated emitted on tag delta

**EARS**: WHEN the Curate handler detects a tag difference between `previousFrontmatter.tags` and `frontmatter.tags` (from the received `NoteFileSaved` event) THEN the Curate handler SHALL emit `TagInventoryUpdated` event.

**Source**: `workflows.md` Step 4 発行 Event.

**Edge Cases**:
- No tag change: `TagInventoryUpdated` is NOT emitted.
- `previousFrontmatter` is `null` (first save of a new note with tags): all tags are additions → `TagInventoryUpdated` is emitted.
- `previousFrontmatter` is `null` and new note has no tags: no delta → `TagInventoryUpdated` is NOT emitted.

**Cross-context note**: `TagInventoryUpdated` is emitted by the Curate handler post-NoteFileSaved (out of CaptureAutoSave pipeline scope). The emission is not tested by this feature's verification architecture PROPs.

**Acceptance Criteria** (Curate handler's responsibility):
- `TagInventoryUpdated` is emitted if and only if `previousFrontmatter?.tags` differs from `frontmatter.tags`.
- `TagInventoryUpdated` is an internal Curate event (not in `PublicDomainEvent` union — to be confirmed in the Curate projection-refresh spec).

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

Step 2 (`serializeNote`) SHALL be a pure function with zero I/O. The same applies to `serializeBlocksToMarkdown` (Shared Kernel pure function used to derive `body`).

**Acceptance Criteria**:
- `serializeNote` calls no ports and has no side effects.
- `serializeBlocksToMarkdown` calls no ports and has no side effects (Shared Kernel pure function, `blocks.ts`).
- `Clock.now()` is called exactly once in the pipeline (in Step 1, `prepareSaveRequest`).
- `FileSystem.writeFileAtomic()` is called exactly once (in Step 3, `writeMarkdown`).
- Event emission (`publish`) occurs at the orchestration boundary between Step 1 and Step 3 (SaveNoteRequested, at `editing → saving` transition) and inside Step 3 (NoteFileSaved/NoteSaveFailed). TagInventoryUpdated is emitted by the Curate handler post-NoteFileSaved (out of pipeline scope).

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

**NOTE on EmptyNoteDiscarded encoding** (Sprint 4 reconciliation):
The `CaptureAutoSave` top-level type returns `Result<NoteFileSaved, SaveError>`. The EmptyNoteDiscarded route returns `Err({ kind: 'validation', reason: { kind: 'empty-body-on-idle' } })` to comply with this canonical signature. The `EmptyNoteDiscarded` event is emitted separately to convey domain semantics.

---

### REQ-018: Body/blocks coherence invariant (Revision 3 — block-based migration)

**EARS**: WHENEVER a stage type or public domain event in the CaptureAutoSave pipeline carries both a `blocks: ReadonlyArray<Block>` field and a `body: Body` field — namely `ValidatedSaveRequest`, `SaveNoteRequested`, and `NoteFileSaved` — THEN the implementation SHALL guarantee `body === serializeBlocksToMarkdown(blocks)`.

**Source**: `stages.ts` `ValidatedSaveRequest` L36–50 ("実装側で常に `body === serializeBlocksToMarkdown(blocks)` を保証する"); `events.ts` `NoteFileSaved` L52–66 / `SaveNoteRequested` L110–125 ("`serializeBlocksToMarkdown(blocks)` の派生"); `domain-events.md` L55–56 / L115–116.

**Rationale**: `blocks` is the primary state for editor and downstream Block-aware consumers (Curate Hydration via `parseMarkdownToBlocks`, EditPastNoteStart re-focus). `body` exists for the file-bytes boundary (Vault writes the string), search index input (Curate `SearchScope`), and legacy compatibility. Carrying both representations risks drift; this invariant pins the relationship to a single pure function.

**Factory-pattern convention** (resolves FIND-013): The TypeScript structural record type cannot enforce absence of direct object-literal construction. Therefore:

> All producers of `ValidatedSaveRequest` MUST go through a single factory function `buildValidatedSaveRequest(noteId, blocks, frontmatter, previousFrontmatter, trigger, requestedAt): ValidatedSaveRequest` defined in the capture module. The factory derives `body` internally via `serializeBlocksToMarkdown(blocks)`. Direct object-literal construction is forbidden by code review / lint convention but cannot be enforced at the type level.

**Cross-language clarification** (resolves FIND-013):

> The Rust-side Vault implementation receives the inbound `SaveNoteRequested.blocks` and `SaveNoteRequested.body` and echoes both fields unchanged into the outbound `NoteFileSaved` event. The Rust side does NOT re-derive body from blocks. PROP-024 verifies coherence at TS-side construction sites (factory + event echo); the Rust echo is treated as a black-box pass-through verified by integration test PROP-017/PROP-018.

See `events.ts` L52–66 (`NoteFileSaved`) / L115–125 (`SaveNoteRequested`) for payload field layout.

**Acceptance Criteria**:
- At every construction site of `ValidatedSaveRequest`, the producer SHALL call `buildValidatedSaveRequest(...)` which computes `body = serializeBlocksToMarkdown(blocks)` and assigns both fields atomically. Direct object-literal construction is a lint/code-review violation.
- `SaveNoteRequested` MUST be built by `BuildSaveNoteRequested(request: ValidatedSaveRequest) → SaveNoteRequested` (`workflows.ts` L145–147), which propagates `blocks` and `body` directly from `request`. No site MAY synthesize `body` from any source other than `serializeBlocksToMarkdown(blocks)`.
- `NoteFileSaved.blocks` and `NoteFileSaved.body` carry the same `blocks` and the same `body` as the originating `SaveNoteRequested`. The Vault-side implementation echoes both fields from the received `SaveNoteRequested` without re-serializing.
- For test purposes, the equation `event.body === serializeBlocksToMarkdown(event.blocks)` SHALL hold for every emitted `SaveNoteRequested` and `NoteFileSaved` (verified by PROP-024 in Phase 1b).

**Failure mode** (informational): If implementation accidentally produces `body !== serializeBlocksToMarkdown(blocks)` (e.g., by mutating `blocks` after deriving `body`, or by reading a stale cached `body`), the spec considers this a Tier-1 invariant violation. There is no defined error variant in `SaveError` for this case — the invariant is an internal correctness property, not a user-visible failure.

---

## Purity Boundary Candidates (Preview for Phase 1b)

| Step | Classification | Rationale |
|------|---------------|-----------|
| Step 1: `prepareSaveRequest` | Mixed | `Clock.now()` is the only effectful call; validation logic and `serializeBlocksToMarkdown(blocks)` (called to derive `body`) are pure |
| Step 1 (derive body): `serializeBlocksToMarkdown` | **Pure core** | Shared Kernel pure function (`blocks.ts`); deterministic, no ports |
| Step 1 (empty check): `Note.isEmpty(note)` | **Pure core** | Pure structural check on `blocks` (all blocks are empty paragraph or divider); property-test target |
| Step 2: `serializeNote` | **Pure core** | Composition of `serializeBlocksToMarkdown(blocks)` + internal YAML serializer; no ports, no I/O |
| Step 3: `writeMarkdown` | **Effectful shell** | `FileSystem.writeFileAtomic` + event emission |
| Curate handler: `updateProjections` | **Out of scope** | Curate Read Model update triggered by NoteFileSaved; not a CaptureAutoSave pipeline step |

The pure core targets are `serializeBlocksToMarkdown` and `serializeNote`. Property-testable claims: deterministic serialization (purity), structural roundtrip with `parseMarkdownToBlocks` (`blocks.ts` invariant `parseMarkdownToBlocks(serializeBlocksToMarkdown(b)) ≈ b` modulo new BlockId), Obsidian-compatible format, body/blocks coherence invariant (REQ-018).

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

**NOTE on `SaveValidationError.empty-body-on-idle`** (FIND-002 resolution):
The `empty-body-on-idle` variant exists in `errors.ts` but is NOT used as a `SaveError` in the CaptureAutoSave pipeline. The empty-idle case is handled via the success channel (`EmptyNoteDiscarded` event + early return), not the error channel. The variant is retained in the type system for potential external use but is not exercised by this workflow.

UI mapping:

| Condition | UI Reaction |
|-----------|------------|
| EmptyNoteDiscarded (idle + empty) | Silent (not an error — early exit) |
| `invariant-violated` | Internal bug: error log + silent |
| `permission` / `disk-full` / `lock` | Save failure banner with retry button, `EditingSessionState.status='save-failed'` |
| `not-found` / `unknown` | Save failure banner with retry button |

---

## Event Catalog (consolidated)

| Event | Step | Emitter Context | Type | Condition | Block-related payload |
|-------|------|----------------|------|-----------|----------------------|
| `EmptyNoteDiscarded` | 1 | Capture | Public | idle trigger + `Note.isEmpty(note)` (= 全ブロックが empty paragraph or divider) | `noteId` のみ（blocks/body は載せない） |
| `SaveNoteRequested` | Orchestration boundary (post-Step 1) | Capture | Public | always (on validated save) | `blocks: ReadonlyArray<Block>` + `body = serializeBlocksToMarkdown(blocks)`（REQ-018） |
| `NoteFileSaved` | 3 (post-write) | Vault | Public | write success | `blocks: ReadonlyArray<Block>` + `body`（REQ-018 同上） |
| `NoteSaveFailed` | 3 (post-write) | Vault | Public | write failure | `noteId` + `reason`（blocks/body は載せない） |
| `TagInventoryUpdated` | Curate handler (post-NoteFileSaved) | Curate | Internal | tag delta detected | tag delta のみ（blocks 非依存）— out of CaptureAutoSave scope |
