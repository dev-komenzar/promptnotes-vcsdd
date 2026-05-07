# Behavioral Specification: CopyBody

**Feature**: `copy-body`
**Phase**: 1a
**Revision**: 2
**Sprint 3 revision** — block-based migration (sprint 2 baseline preserved unchanged where possible).
**Source of truth**:
- `docs/domain/workflows.md` Workflow 6 (CopyBody)
- `docs/domain/code/ts/src/capture/workflows.ts` (`CopyBody` type, line 107–109)
- `docs/domain/code/ts/src/capture/stages.ts` (`ClipboardText` stage, line 82–86)
- `docs/domain/code/ts/src/capture/ports.ts` (`ClipboardWrite`, `CaptureDeps`)
- `docs/domain/code/ts/src/capture/internal-events.ts` (`NoteBodyCopiedToClipboard`)
- `docs/domain/code/ts/src/capture/commands.ts` (`CopyNoteBody`)
- `docs/domain/code/ts/src/capture/states.ts` (`EditingState`)
- `docs/domain/code/ts/src/shared/note.ts` (`NoteOps.bodyForClipboard` — JSDoc: "内部で `serializeBlocksToMarkdown(note.blocks)` を呼ぶ")
- `docs/domain/code/ts/src/shared/blocks.ts` (`SerializeBlocksToMarkdown` interface and `BlockParseError`)
- `docs/domain/code/ts/src/shared/errors.ts` (`SaveError`, `FsError`)
- `docs/tasks/feature-impact.md` (copy-body entry — derivation note: `bodyForClipboard` internally calls `serializeBlocksToMarkdown(note.blocks)`)
- `docs/domain/event-storming.md`, `domain-events.md`, `glossary.md`, `validation.md`, `ui-fields.md`
**Scope**: CopyBody pipeline only. The pipeline starts when a `CopyNoteBody` command fires for the currently editing note and ends when `ClipboardText` is returned (success) or a `SaveError` is returned (clipboard failure). Excludes: button rendering / keyboard binding (UI concern), past-note copy from feed (out of MVP).

---

## Pipeline Overview

```
EditingState → ClipboardText
```

Stages:

| Stage | Guarantee |
|-------|-----------|
| `EditingState` | Capture session is `editing` with a current `NoteId` |
| `ClipboardText` | Frontmatter-stripped body string + `noteId`; ready for OS clipboard |

The pipeline is **Pure-leaning**: all transformation is pure (`Note → string`). The only side effect is the boundary call `ClipboardWrite(text)` and the internal event publish.

---

## Requirements

### REQ-001: Happy Path — CopyBody returns ClipboardText on success

**EARS**: WHEN a `CopyNoteBody` command fires for an `EditingState` with a resolvable current note AND `ClipboardWrite(text)` succeeds THEN the system SHALL return `Ok(ClipboardText { kind: "ClipboardText", text, noteId })` where `text` equals `Note.bodyForClipboard(currentNote)` and `noteId` equals `state.currentNoteId`.

**Source**: `workflows.ts` line 107–109 (`CopyBody` type), `workflows.md` Workflow 6.

**Acceptance Criteria**:
- Return value is `{ ok: true, value: ClipboardText }`.
- `ClipboardText.kind === "ClipboardText"`.
- `ClipboardText.text === bodyForClipboard(currentNote)`.
- `ClipboardText.noteId === state.currentNoteId`.
- `ClipboardWrite` is invoked exactly once with the produced `text`.
- The internal `NoteBodyCopiedToClipboard` event is published exactly once (see REQ-005).

---

### REQ-002: bodyForClipboard returns body derived from blocks (frontmatter excluded)

**EARS**: WHEN `bodyForClipboard(note)` is invoked THEN the system SHALL return `serializeBlocksToMarkdown(note.blocks)` — a string produced by the canonical block serializer — with no frontmatter prefix, no `---` YAML fences, and no YAML metadata.

**Source**: `note.ts` `bodyForClipboard(note: Note): string` (JSDoc: "内部で `serializeBlocksToMarkdown(note.blocks)` を呼ぶ"); `blocks.ts` `SerializeBlocksToMarkdown` interface; `glossary.md` §4 ("frontmatter は除外"); `event-storming.md` row 10 ("frontmatter は除外").

**Block-type → Markdown prefix mapping** (canonical, per `capture-auto-save/serialize-blocks-to-markdown.ts`):

| Block type | Markdown representation |
|-----------|------------------------|
| `paragraph` | `content` (no prefix) |
| `heading-1` | `# content` |
| `heading-2` | `## content` |
| `heading-3` | `### content` |
| `bullet` | `- content` |
| `numbered` | `1. content` |
| `code` | `` ``` ``\n`content`\n`` ``` `` |
| `quote` | `> content` |
| `divider` | `---` |

Blocks are joined with `"\n"`; no trailing newline. The result is the serializer's output — it is **not** a separately stored `note.body` field (no such field exists on the `Note` type).

> **Note**: This table is informational; it MUST NOT be reproduced inside `body-for-clipboard.ts` (see REQ-013/REQ-014). The canonical implementation lives in `promptnotes/src/lib/domain/capture-auto-save/serialize-blocks-to-markdown.ts`.

**Acceptance Criteria**:
- The returned string equals `serializeBlocksToMarkdown(note.blocks)` (string equality, not byte-identity to a stored field).
- The result contains no YAML frontmatter `---\n` delimiter (frontmatter is excluded by construction — `bodyForClipboard` reads only `note.blocks`).
- The result contains no `tags:`, `createdAt:`, or `updatedAt:` keys originating from frontmatter.
- The function is **pure**: deterministic, no I/O, no `Clock.now`.

---

### REQ-003: Clipboard write occurs as the only I/O boundary

**EARS**: WHEN the CopyBody pipeline executes THEN `ClipboardWrite(text)` SHALL be the only file/OS-system port call. `AllocateNoteId` and any file system operation SHALL NOT be invoked, and `Clock.now` SHALL be invoked at most once and only on the success path before publishing the event.

**Source**: `workflows.md` Workflow 6 ("依存：`Clipboard.write(string): Result<void>`"); `ports.ts` `CaptureDeps`.

**Acceptance Criteria**:
- `ClipboardWrite` is called exactly once per invocation (one on the happy path and one on clipboard-error path).
- `Clock.now` is invoked **at most once**, and only after a successful `ClipboardWrite` (see REQ-009 for the exact semantics).
- `AllocateNoteId` is invoked **zero** times.
- No file system port (`writeFileAtomic`, `readFile`, `listMarkdown`, etc.) is invoked.
- `CaptureDeps.publish` (the `PublicDomainEvent` bus) is invoked **zero** times — `NoteBodyCopiedToClipboard` is delivered via the internal `emitInternal` callback in `CopyBodyInfra`, not via `CaptureDeps.publish` (see REQ-005).
- The internal `emitInternal` callback is invoked exactly once on success and zero times on clipboard failure.

---

### REQ-004: Clipboard write failure produces SaveError.fs

**EARS**: WHEN `ClipboardWrite(text)` returns `Err(FsError)` THEN the system SHALL return `Err(SaveError { kind: "fs", reason: FsError })` and SHALL NOT publish `NoteBodyCopiedToClipboard`.

**Source**: `workflows.ts` line 109 (return type `Result<ClipboardText, SaveError>`); `errors.ts` `SaveError = { kind: "fs", reason: FsError } | ...`; `ports.ts` `ClipboardWrite: (text: string) => Result<void, FsError>`.

**Rationale**: The canonical `CopyBody` type uses `SaveError` as the error channel even though the operation is logically "copy" rather than "save". The `fs` variant of `SaveError` is the appropriate carrier for `FsError` from the clipboard port — `validation` is reserved for save-specific validation errors and is not produced by CopyBody.

**Acceptance Criteria**:
- Return value is `{ ok: false, error: { kind: "fs", reason: <original FsError> } }`.
- The wrapped `FsError` is preserved verbatim (kind and any optional `path`/`detail` fields).
- `NoteBodyCopiedToClipboard` is **not** published on the failure path.
- `EventBusPublish` is invoked **zero** times on the failure path.
- The pipeline does **not** emit `SaveError.kind === "validation"` under any input.

---

### REQ-005: NoteBodyCopiedToClipboard emitted on success

**EARS**: WHEN `ClipboardWrite(text)` succeeds THEN the system SHALL publish exactly one `NoteBodyCopiedToClipboard { kind: "note-body-copied-to-clipboard", noteId, occurredOn }` event via the internal Capture event bus (`CopyBodyInfra.emitInternal`), NOT via `CaptureDeps.publish`.

**Source**: `internal-events.ts` line 79–83; `event-storming.md` row 10; `glossary.md` §4 row "NoteBodyCopiedToClipboard | Internal | コピー実行"; `domain-events.md` line 170.

**Channel decision** (FIND-candidate): `NoteBodyCopiedToClipboard` is an **Internal Application Event** (per `internal-events.ts`), NOT a `PublicDomainEvent` (it is absent from the union in `events.ts` line 139–151). However, `CaptureDeps.publish` is typed as `(event: PublicDomainEvent) => void`. This spec resolves the mismatch by treating the event as part of an **internal Capture event bus** that is structurally compatible with `PublicDomainEvent` at runtime but is not added to the public union. Phase 1b will record this as an architectural finding for confirmation; the implementation will use a separate `emitInternal` callback (mirroring the `TagInventoryUpdated` pattern in `capture-auto-save/pipeline.ts` line 47).

**Acceptance Criteria**:
- The event has `kind === "note-body-copied-to-clipboard"`.
- `event.noteId === state.currentNoteId`.
- `event.occurredOn` is a `Timestamp` value (see REQ-009 for source).
- The event is emitted **after** the successful clipboard write returns.
- The event is emitted **exactly once** per successful copy.

---

### REQ-006: copyBody preserves note state (read-only)

**EARS**: WHEN `copyBody` executes THEN the system SHALL NOT mutate the input `EditingState`, the resolved `Note`, or any frontmatter / body value object. The pipeline SHALL be a read-only operation with respect to domain state.

**Source**: `workflows.md` Workflow 6 副作用 column ("write I/O（OS clipboard）" only — no domain state writes); `aggregates.md` Note Aggregate operations are pure.

**Acceptance Criteria**:
- `Note`, `Frontmatter`, `Body`, and `EditingState` instances passed in are not modified (TypeScript `readonly` is enforced by types; runtime check via reference equality).
- `EditingState.lastSaveResult`, `isDirty`, and `lastInputAt` are unchanged before vs. after the call.
- No state-machine transition (`beginAutoSave`, `onSaveSucceeded`, etc.) is invoked.

---

### REQ-007: Empty and minimal block arrangements are copied as-is

**EARS**: WHEN the current note contains only an empty paragraph block (`note.blocks === [{ id: <BlockId>, type: "paragraph", content: "" }]`) or other minimal block arrangements THEN the system SHALL still produce `ClipboardText.text` equal to `serializeBlocksToMarkdown(note.blocks)` and SHALL still invoke `ClipboardWrite` and emit `NoteBodyCopiedToClipboard` on success.

Note: `<BlockId>` denotes any valid `BlockId` value; generators construct fresh IDs per Block invariant 1 (id is unique within the Note).

**Rationale**: Unlike `CaptureAutoSave` Workflow 2 which discards empty bodies on idle save, CopyBody has no notion of "empty" being invalid — the user is explicitly asking to copy. The `bodyForClipboard` operation is total (defined for all `Note` values, including minimal block arrangements).

**Source**: `note.ts` `bodyForClipboard(note: Note): string` (no precondition); `note.ts` `NoteOps.isEmpty` (definition: "blocks.length === 1 かつ blocks[0] が空 content の paragraph"); `workflows.md` Workflow 6 (no empty-body branch).

**Minimal block fixture examples** (`<BlockId>` is any valid `BlockId` value; generators construct fresh IDs):
- `[{ id: <BlockId>, type: "paragraph", content: "" }]` → serializer returns `""` → `ClipboardWrite("")` is invoked.
- `[{ id: <BlockId>, type: "divider", content: "" }]` → serializer returns `"---"` → `ClipboardWrite("---")` is invoked.
- A whitespace-only paragraph `[{ id: <BlockId>, type: "paragraph", content: "   \n" }]` → serializer returns `"   \n"` verbatim (no trimming by the pipeline).

**Acceptance Criteria**:
- `copyBody` invoked on a note with `blocks === [{ id: <BlockId>, type: "paragraph", content: "" }]` returns `Ok(ClipboardText { text: "" })`.
- `copyBody` invoked on a whitespace-only paragraph block returns `Ok(ClipboardText { text: "   \n" })` (content preserved verbatim).
- `ClipboardWrite("")` is invoked when the serialized result is `""` (whether the OS clipboard accepts empty strings is the port's concern; the pipeline does not branch on this).
- `EmptyNoteDiscarded` is **not** emitted (this is a CaptureAutoSave-only event).
- The pipeline does not branch on block count or content — all `Note` values are treated uniformly.

---

### REQ-008: Pipeline orchestrator shape — copyBody function signature

**EARS**: WHEN the CopyBody pipeline is invoked THEN it SHALL conform to a function signature derived from the canonical `CopyBody` type plus the infrastructure ports needed to resolve the current note and the timestamp.

**Source**: `workflows.ts` line 107–109 — `CopyBody = (deps: CaptureDeps) => (state: EditingState) => Result<ClipboardText, SaveError>`.

**Practical shape** (mirrors `capture-auto-save/pipeline.ts` two-layer pattern):

```ts
export type CopyBodyInfra = {
  readonly getCurrentNote: () => Note;
  readonly bodyForClipboard: (note: Note) => string;
  readonly emitInternal: (event: NoteBodyCopiedToClipboard) => void;
};

export function makeCopyBodyPipeline(
  infra: CopyBodyInfra,
): (deps: CaptureDeps) => (state: EditingState) => Result<ClipboardText, SaveError>;
```

**Acceptance Criteria**:
- The factory returns a function matching the canonical `CopyBody` type modulo the `infra` closure.
- The returned pipeline is **synchronous** (returns `Result`, not `Promise<Result>`) — distinct from `CaptureAutoSave` which is async.
- The pipeline accepts `EditingState` only — `IdleState`, `SavingState`, `SwitchingState`, `SaveFailedState` are rejected at the type level (TypeScript narrowing).
- A flat-ports convenience function `copyBody(ports: CopyBodyDeps)` is also exported for tests, mirroring the pattern in `capture-auto-save/pipeline.ts` line 175–185.

---

### REQ-009: Timestamp source for NoteBodyCopiedToClipboard

**EARS**: WHEN `NoteBodyCopiedToClipboard` is emitted THEN `occurredOn` SHALL be obtained from `CaptureDeps.clockNow()`.

**Source**: `ports.ts` `ClockNow: () => Timestamp`; `internal-events.ts` `occurredOn: Timestamp`.

Timestamp budget is stated directly in REQ-003 and verified by PROP-004 / PROP-005.

**Acceptance Criteria**:
- On successful copy: `clockNow()` is called exactly once, and its return value is the `occurredOn` of the emitted event.
- On clipboard failure: `clockNow()` is called zero times.
- The pipeline does not call `clockNow` before deciding whether the clipboard write succeeded (i.e., timestamp acquisition happens lazily, after the I/O).

---

### REQ-010: SaveError exhaustiveness on the error channel

**EARS**: WHEN the CopyBody pipeline returns an error THEN the error SHALL be of type `SaveError`, and within `SaveError` only the `{ kind: "fs", reason: FsError }` variant SHALL ever be produced — `{ kind: "validation", ... }` SHALL NOT be produced.

**Source**: `errors.ts` `SaveError`; `workflows.md` Workflow 6 ("エラー：clipboard 書き込み失敗（極稀）" — no validation errors listed).

**Acceptance Criteria**:
- `result.error.kind === "fs"` for every error case.
- The five `FsError` variants (`permission`, `disk-full`, `lock`, `not-found`, `unknown`) are all reachable / passed-through.
- TypeScript exhaustiveness check (never branch in switch over `SaveError.kind`) confirms the validation branch is dead in this pipeline (Phase 5 PROP-006).

---

### REQ-011: Non-functional — Pipeline I/O budget

**EARS**: WHEN the CopyBody pipeline executes a single invocation THEN the I/O budget SHALL be:

| Path | `clipboardWrite` | `clockNow` | `publish` (internal) | other I/O |
|------|-----------------:|-----------:|---------------------:|----------:|
| Success | exactly 1 | exactly 1 | exactly 1 | 0 |
| Clipboard failure | exactly 1 | 0 | 0 | 0 |

**Source**: synthesis of REQ-003, REQ-005, REQ-009.

**Acceptance Criteria** (verified via spy assertions in Phase 2a tests, and property-test in Phase 5 PROP-006):
- The counts above hold for every input.
- No retry / backoff is performed inside the pipeline (one clipboard attempt only — UI handles retry banner if added later).

---

### REQ-012: Caller precondition — getCurrentNote().id matches state.currentNoteId

**EARS**: WHEN `copyBody` is invoked THEN the caller SHALL ensure `infra.getCurrentNote().id === state.currentNoteId`. The pipeline does NOT itself check this invariant; behavior under violation is undefined by this spec.

**Rationale**: `state.currentNoteId` (used as the event/result `noteId`) and `getCurrentNote()` (used to derive `text`) come from two different reads of the Capture session. Enforcing this consistency is the orchestration layer's responsibility, mirroring the `CaptureAutoSave` precedent where the `EditingState`/`getCurrentNote` consistency is also a caller invariant. PROP-009 inputs are restricted to the consistent case.

**Acceptance Criteria**:
- Documentation in `pipeline.ts` JSDoc explicitly states this precondition.
- Property tests (PROP-009) generate inputs where `note.id === state.currentNoteId`.
- No runtime assertion is added (lean: trust the caller; consistent with the precedent in `capture-auto-save/pipeline.ts`).

---

### REQ-013: Block serialization invariant

**EARS**: WHEN `bodyForClipboard(note)` is invoked THEN the system SHALL return a value equal to `serializeBlocksToMarkdown(note.blocks)` for all `Note` values; the function MUST NOT carry its own block-type → markdown prefix table.

**Source**: `docs/domain/code/ts/src/shared/note.ts` JSDoc on `bodyForClipboard` ("内部で `serializeBlocksToMarkdown(note.blocks)` を呼ぶ"); `docs/domain/code/ts/src/shared/blocks.ts` `SerializeBlocksToMarkdown` interface.

**Rationale**: The block-type → Markdown prefix table is a shared kernel concern defined in `blocks.ts` and canonically implemented in `capture-auto-save/serialize-blocks-to-markdown.ts`. Duplicating this table in `body-for-clipboard.ts` would create two sources of truth that can diverge. The function must delegate to the canonical serializer.

**Acceptance Criteria**:
- `bodyForClipboard(note)` returns a string equal to `serializeBlocksToMarkdown(note.blocks)` for every `Note` value tested.
- The implementation file `body-for-clipboard.ts` does not contain a `switch` or `if`-chain over `block.type` values — it delegates to the canonical serializer.
- PROP-002 (serializer delegation property test) passes.

---

### REQ-014: Implementation delegates to canonical block serializer

**EARS**: WHEN the `bodyForClipboard` function is implemented THEN it SHALL import and call `serializeBlocksToMarkdown` from the canonical serializer source rather than parsing or recomputing the block-to-markdown mapping internally.

**Source**: `docs/tasks/feature-impact.md` copy-body entry; `capture-auto-save/serialize-blocks-to-markdown.ts` (canonical implementation for this migration sprint).

**Implementation guidance**: Importing `serializeBlocksToMarkdown` from `../capture-auto-save/serialize-blocks-to-markdown.js` is the current canonical source. Cross-feature import is acceptable for this migration sprint and is recorded as a finding for a later "shared kernel extraction" refactor (see Findings to Carry Forward in `verification-architecture.md`). When a shared kernel utility is extracted, the import path will change; the behavioral contract expressed in REQ-013 remains stable.

**Acceptance Criteria**:
- The import path resolves to the `capture-auto-save` serializer (or a future shared utility that replaces it).
- PROP-011 (serializer delegation spy test) passes — `serializeBlocksToMarkdown` is called exactly once per `bodyForClipboard` invocation.
- No duplicate prefix table exists in `copy-body/body-for-clipboard.ts`.

---

## Purity Boundary Candidates (Preview for Phase 1b)

| Sub-step | Classification | Rationale |
|----------|----------------|-----------|
| `getCurrentNote` (infra) | Effectful | Reads from Capture in-memory state |
| `bodyForClipboard` | **Pure core** | Total function via `serializeBlocksToMarkdown(note.blocks)`; pure under the serializer's purity (PROP-001 transitive) |
| `clipboardWrite` | **Effectful shell** | OS clipboard write |
| `publish(NoteBodyCopiedToClipboard)` | Effectful shell | Internal event bus |
| `clockNow` (success only) | Effectful (purity-violating) | OS time read |

The pure core target is `bodyForClipboard`. Property-testable claims:

- **PROP-001**: Determinism — `bodyForClipboard(note)` is referentially transparent (transitive from serializer purity).
- **PROP-002**: Serializer delegation — `bodyForClipboard(note) === serializeBlocksToMarkdown(note.blocks)` for all valid `Note` values.
- **PROP-003**: Frontmatter exclusion — for any `note` with non-empty `frontmatter.tags`, the returned string does not contain `tags:` substring originating from frontmatter (a sentinel-tag harness can verify this; exclusion holds by construction since `bodyForClipboard` reads only `note.blocks`).

---

## Error Catalog (consolidated)

```ts
type SaveError =
  | { kind: 'fs'; reason: FsError }   // produced by CopyBody on clipboard failure
  | { kind: 'validation'; reason: SaveValidationError }  // NOT produced by CopyBody

type FsError =
  | { kind: 'permission'; path?: string }
  | { kind: 'disk-full' }
  | { kind: 'lock'; path?: string }
  | { kind: 'not-found'; path?: string }
  | { kind: 'unknown'; detail: string }
```

UI mapping:

| Condition | UI Reaction |
|-----------|------------|
| Success | Silent (or transient toast — UI concern, out of pipeline scope) |
| `fs.permission` / `fs.lock` / `fs.unknown` | Clipboard failure banner ("コピーに失敗しました") — `ui-fields.md` line 75 |
| `fs.disk-full` / `fs.not-found` | Same as above (treated as generic clipboard failure; these variants are unlikely from a clipboard port but the type system permits them) |

---

## Event Catalog (consolidated)

| Event | Step | Emitter Context | Type | Condition |
|-------|------|----------------|------|-----------|
| `NoteBodyCopiedToClipboard` | post-clipboard-write | Capture | **Internal** (Application Event) | clipboard write success |

No `PublicDomainEvent` is emitted by CopyBody.

---

## Out-of-Scope Clarifications

- **Past-note copy from feed**: MVP does not support copying a past note from the feed view without first opening it. Only the currently editing note is copyable. (Source: `validation.md` line 434 — only "コピーボタン" in the editor; `ui-fields.md` line 75.)
- **Idle-timer reset on copy**: Whether copying resets the idle timer is a UI/timer concern, not a pipeline concern. The pipeline does not interact with `EditingState.idleTimerHandle`.
- **Selection vs. full body**: The MVP `bodyForClipboard` returns the full body. Partial selection copy is OS-level (Cmd+C) and bypasses this pipeline.

---

## Implementation Notes (sprint 3)

### Derivation chain

Sprint 3 migrates `bodyForClipboard` from the sprint 2 implementation (which referenced a now-nonexistent `note.body` stored field) to the block-based derivation:

```
Note.blocks: ReadonlyArray<Block>
  → serializeBlocksToMarkdown(note.blocks): string
  → bodyForClipboard(note): string   [identity — no further transformation]
```

The function `bodyForClipboard` is a thin wrapper: it calls `serializeBlocksToMarkdown` with `note.blocks` as the sole argument and returns the result directly. No prefix table, no regex, no custom join logic belongs in `body-for-clipboard.ts`.

### Serializer source (sprint 3)

The canonical serializer is `promptnotes/src/lib/domain/capture-auto-save/serialize-blocks-to-markdown.ts`. For sprint 3, `body-for-clipboard.ts` imports directly from this file (`../capture-auto-save/serialize-blocks-to-markdown.js`). This cross-feature import is a **known non-blocking finding** tracked in `verification-architecture.md` ("Sprint 3 / serializer source"). A future "shared kernel extraction" feature will relocate the serializer to a shared utility and update the import path without changing the behavioral contract.

### Note type shape (sprint 3 vs sprint 2)

Sprint 2 tests used a `Note` shaped as `{ id, body: string, frontmatter }`. Sprint 3 tests must use `{ id, blocks: ReadonlyArray<Block>, frontmatter }`. The test arbitrary generators in `__tests__/copy-body/` must be updated in Phase 2a to construct block-shaped notes. The behavioral pipeline contracts (REQ-001 through REQ-012) are unaffected — only the `Note` construction in test fixtures changes.
