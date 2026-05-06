---
coherence:
  node_id: "req:ui-editor"
  type: req
  name: "ui-editor 行動仕様 (block-based)"
  depends_on:
    - id: "governance:implement-mapping"
      relation: derives_from
    - id: "design:ui-fields"
      relation: derives_from
    - id: "design:workflows"
      relation: derives_from
    - id: "design:aggregates"
      relation: derives_from
    - id: "design:type-contracts"
      relation: derives_from
    - id: "governance:design-system"
      relation: depends_on
  modules:
    - "ui-editor"
    - "capture-auto-save"
    - "copy-body"
    - "edit-past-note-start"
    - "handle-save-failure"
  source_files:
    - "promptnotes/src/lib/editor"
---

# Behavioral Specification: ui-editor (Block-based)

**Feature**: `ui-editor`
**Phase**: 1a
**Mode**: strict
**Language**: TypeScript (Svelte 5 + SvelteKit + Tauri 2 desktop)

**Source of truth**:
- `docs/domain/code/ts/src/shared/note.ts` — `Block`, `Note`, `NoteOps` (block 操作 8 メソッド)
- `docs/domain/code/ts/src/shared/blocks.ts` — `serializeBlocksToMarkdown`, `parseMarkdownToBlocks`, `BlockParseError`
- `docs/domain/code/ts/src/shared/value-objects.ts` — `BlockId`, `BlockType`, `BlockContent` (Smart Constructor)
- `docs/domain/code/ts/src/shared/events.ts` — `SaveNoteRequested`, `NoteFileSaved`, `PastNoteSelected` (`blockId` 追加)
- `docs/domain/code/ts/src/capture/commands.ts` — `CaptureCommand` 17 種 (`FocusBlock` / `EditBlockContent` / `InsertBlock` / `RemoveBlock` / `MergeBlocks` / `SplitBlock` / `ChangeBlockType` / `MoveBlock` ほか)
- `docs/domain/code/ts/src/capture/internal-events.ts` — Block 系 Internal Events 9 種
- `docs/domain/code/ts/src/capture/states.ts` — `EditingState.focusedBlockId`, `PendingNextFocus`, `EditingSessionTransitions`
- `docs/domain/code/ts/src/capture/stages.ts` — `BlockFocusRequest`, `CurrentSessionDecision` (`same-note` バリアント), `ValidatedSaveRequest` (`blocks`+`body` 両持ち)
- `docs/domain/code/ts/src/capture/workflows.ts` — `EditPastNoteStart`, `CaptureAutoSave`, `CopyBody`, `HandleSaveFailure`
- `docs/domain/code/ts/src/shared/errors.ts` — `SaveError`, `SwitchError.pendingNextFocus`, `SaveValidationError.empty-body-on-idle`
- `docs/domain/aggregates.md` §1 Note Aggregate (Block Sub-entity), §EditingSessionState
- `docs/domain/workflows.md` Workflow 2 / 3 / 6 / 8 / 10 (BlockEdit)
- `docs/tasks/feature-impact.md` — `ui-editor` を「強く影響」と分類した移行ノート
- `DESIGN.md` — §3 Typography, §4 Inputs & Forms / Buttons / Cards / Distinctive Components, §6 Depth & Elevation, §8 Accessibility & States, §10 Token Reference

**Scope**: UI/orchestration layer for the right-pane editor only. The editor renders one Note as a vertical stack of contenteditable Block elements and translates user input (typing / Enter / Backspace / `/` menu / drag-and-drop / focus changes) into the typed `CaptureCommand` set defined by the block-based contract. It does NOT contain business validation rules; those live in `NoteOps` and `EditingSessionTransitions`. This feature consumes existing `FocusBlock`, `EditBlockContent`, `InsertBlock`, `RemoveBlock`, `MergeBlocks`, `SplitBlock`, `ChangeBlockType`, `MoveBlock`, `TriggerIdleSave`, `TriggerBlurSave`, `CopyNoteBody`, `RequestNewNote`, `RetrySave`, `DiscardCurrentSession`, and `CancelSwitch` commands verbatim — it never invents new variants.

---

## 1. Feature Overview

The `ui-editor` feature renders and orchestrates the note editor panel — the primary capture surface of the application. It presents a Notion-style block editor: each `Block` of the active `Note` is rendered as its own focusable contenteditable element inside a single editor surface. The editor tracks per-block focus, dispatches block-level commands per keystroke / Enter / Backspace / `/` menu / drag, schedules debounced idle autosaves and blur autosaves, displays saving state feedback, and handles save-failure recovery. Two supporting actions — copy body to clipboard and create a new note — are surfaced as buttons (with keyboard shortcuts).

The editor is an orchestration-only component. All business rules — block invariants (`removeBlock` last-block protection, `mergeBlockWithPrevious` first-block guard, `splitBlock` offset range, `BlockContent` constraints), serialisation (`serializeBlocksToMarkdown`), persistence, tag invariants, and `note.isEmpty()` — are delegated to domain functions invoked via Tauri IPC. The editor's sole responsibilities are: (a) translating user input events into the correct `CaptureCommand` with the correct `noteId` / `blockId` / `source` fields, (b) reflecting `EditingSessionState` transitions (including `focusedBlockId`) in the UI without mutating state directly, and (c) surfacing domain error responses as user-recoverable affordances.

**In scope:**
- Block-tree rendering: one focusable contenteditable element per `Block`, ordered by `note.blocks`
- Per-block focus management with `EditingState.focusedBlockId` mirroring (REQ-EDIT-001)
- Per-keystroke `EditBlockContent` dispatch (REQ-EDIT-003)
- Enter / Backspace / `/` menu / Markdown shortcut handling that maps to `InsertBlock` / `SplitBlock` / `MergeBlocks` / `RemoveBlock` / `ChangeBlockType` (REQ-EDIT-006..010)
- Drag-and-drop or keyboard reordering mapping to `MoveBlock` (REQ-EDIT-011)
- Idle-debounce autosave (`IDLE_SAVE_DEBOUNCE_MS = 2000`) and blur autosave (`EditorBlurredAllBlocks` trigger)
- `EditingSessionState` UI mapping for all 5 states: `idle`, `editing`, `saving`, `switching`, `save-failed`
- Save-failure banner with Retry / Discard / Cancel actions; Cancel restores the prior `focusedBlockId`
- Copy Body button (`CopyNoteBody` command, Workflow 6) — derives clipboard text from `serializeBlocksToMarkdown(note.blocks)` server-side
- New Note button and Ctrl+N / Cmd+N shortcut (`RequestNewNote` command); new note focuses the first block (`focusedBlockId = firstBlockId` from `NewNoteAutoCreated`)
- Source discrimination: every save command carries `source: 'capture-idle' | 'capture-blur'`

**Out of scope (belong to other features):**
- List pane / feed note rows and per-row actions (`ui-feed-list-actions`)
- Detail metadata column (tag chips, timestamps) (`ui-tag-chip`, `ui-app-shell`)
- Settings / Vault configuration modal (`configure-vault`, `ui-app-shell`)
- Cross-note search box and tag filter sidebar (`ui-filter-search`)
- Markdown ↔ Block parsing/serialisation correctness — verified by `app-startup` (Hydration) and `capture-auto-save` (serialise) features
- Backend Rust handlers and atomic file writes — covered by `capture-auto-save` / `handle-save-failure`

---

## 2. Stakeholders & Personas

**Primary persona: Note-taker (the only user in MVP)**

The note-taker launches the app to capture prompt ideas or prose quickly, then copies the body into an AI tool. Key concerns:

- Zero friction between opening the app and typing: focus must land in a Block automatically (the first block of the active note, or the first block of a freshly created empty note).
- Block typing must feel native to a Notion-style editor: Enter splits the current block, Backspace at start merges with the previous, `/` opens a block-type menu, `# `/`- `/`> ` etc. convert via `ChangeBlockType`.
- Never lose a draft: autosave must be silent and reliable; failures must be recoverable without losing block content or focus.
- Instant copy: a single click copies the full body (`serializeBlocksToMarkdown(note.blocks)`) without frontmatter contamination.
- Minimal chrome: the editor must not show distracting chrome when saving is proceeding normally; the save-failure banner appears only on error.

---

## 3. Functional Requirements (EARS)

### §3.1 Block Focus and Per-Block Editing

#### REQ-EDIT-001: Block Focus Dispatches FocusBlock and Updates focusedBlockId

When the user clicks into a Block element, or moves the caret into a Block via keyboard navigation (Tab / Arrow / programmatic focus), the system shall dispatch a `FocusBlock { kind: 'focus-block', noteId, blockId, issuedAt }` command. The mirrored `EditorViewState.focusedBlockId` becomes `blockId` once the domain emits the corresponding `BlockFocused` Internal Event and the resulting `EditingState` snapshot arrives via the inbound channel (§10). (ref: capture/commands.ts `FocusBlock`; capture/internal-events.ts `BlockFocused`; capture/states.ts `EditingState.focusedBlockId`; aggregates.md §1 Block Focus)

**Edge Cases**:
- Focus changes within the same Note are NOT note-switches: `EditingSessionTransitions.refocusBlockSameNote` keeps `status === 'editing'` and continues the idle timer (REQ-EDIT-018).
- A focus event into a Block that belongs to a different Note triggers the `EditPastNoteStart` workflow (Workflow 3) via `BlockFocusRequest{ noteId, blockId, snapshot }`; that path is owned by the feed feature, not by `ui-editor`.

**Acceptance Criteria**:
- Clicking a Block element dispatches `FocusBlock` with the matching `(noteId, blockId)` exactly once per focus transition.
- The Block element corresponding to `EditorViewState.focusedBlockId` carries the visible focus ring (DESIGN.md §8 Focus System).
- The UI never sets `focusedBlockId` locally; it reads the field from `EditorViewState` mirrored from the domain snapshot.

---

#### REQ-EDIT-002: focusedBlockId is Read-Only Mirror of EditingState

The `editorReducer` shall mirror `EditingState.focusedBlockId` from incoming domain snapshots and shall NOT author new values. Optimistic local focus changes are limited to the impure shell setting native DOM focus on a Block element; the canonical `focusedBlockId` is owned by the Rust domain. The UI converges within one inbound event cycle. (ref: §3.4a; capture/states.ts `EditingState.focusedBlockId: BlockId | null`)

**Acceptance Criteria**:
- `editorReducer({ kind: 'DomainSnapshotReceived', snapshot: S }).state.focusedBlockId === S.focusedBlockId` for every snapshot `S` of status `editing`.
- No `editorReducer` action other than `DomainSnapshotReceived` overwrites `focusedBlockId`.
- No Svelte component constructs an `EditingState` carrying a synthetic `focusedBlockId`.

---

#### REQ-EDIT-003: Block Content Edit Dispatches EditBlockContent

When the user types inside the focused Block element, the system shall dispatch `EditBlockContent { kind: 'edit-block-content', noteId, blockId, content, issuedAt }` per input event, where `content` is the full current raw string of the focused Block (sent as raw `string` at the wire boundary — Rust runs `BlockContentSmartCtor.tryNew` or `tryNewMultiline` per §11). The dispatch sets `EditorViewState.isDirty=true` after the domain snapshot returns. (ref: capture/commands.ts `EditBlockContent`; capture/internal-events.ts `BlockContentEdited`; aggregates.md §1 editBlockContent)

**Edge Cases**:
- For a `code` Block, the wire-format `content` may include embedded newlines; the multi-line variant of the Smart Constructor is used Rust-side. The TypeScript wire type is the same `string`.
- For non-`code` Blocks, embedded newline characters in a single input event are reinterpreted by the Rust Smart Constructor as `BlockContentError.kind === 'newline-in-inline'`. The UI treats this as a domain validation error (REQ-EDIT-027).
- Per-character debounce on command dispatch is not required; debounce applies only to the save trigger.

**Acceptance Criteria**:
- Each `input` event in a Block dispatches exactly one `EditBlockContent` carrying the full current Block content.
- `isDirty` is `true` after the resulting `BlockContentEdited` action is processed by `editorReducer`, mirrored from `EditingState.isDirty`.
- The dispatch reuses the focused Block's `(noteId, blockId)` pair from `EditorViewState`.

---

#### REQ-EDIT-004: isDirty Reset After Successful Save

When the domain emits `NoteFileSaved` (received by the `editorReducer` as a snapshot transition `saving → editing` with `isDirty=false`), the reducer shall set `EditorViewState.isDirty=false`, and any pending idle debounce timer shall be cleared via the impure shell reacting to a `'cancel-idle-timer'` `EditorCommand` in the reducer output. (ref: aggregates.md L274 `saving + NoteFileSaved → isDirty=false`; verification-architecture.md §10 EditorCommand union)

**Acceptance Criteria**:
- `EditorViewState.isDirty === false` after the `SaveSuccess` action.
- The idle debounce timer is cancelled before the next edit cycle.
- `EditorViewState.isDirty` remains `true` on `NoteSaveFailed` (save failure does not clear dirty).

---

#### REQ-EDIT-005: Empty Note Predicate — Copy Button Disable

If `note.isEmpty()` is true (i.e., `blocks.length === 1 && BlockContent.isEmpty(blocks[0].content) && blocks[0].type === 'paragraph'`), then the system shall disable the Copy Body button. The pure UI predicate `canCopy(view, status)` reads the local mirror `isNoteEmpty: boolean` field from `EditorViewState`; that field is set by the `editorReducer` when mirroring an `EditingSessionState` snapshot (the snapshot's owner Rust domain runs `NoteOps.isEmpty`). (ref: aggregates.md §1 `isEmpty`; shared/note.ts `NoteOps.isEmpty`; shared/value-objects.ts `BlockContentSmartCtor.isEmpty`; ui-fields.md §1A-1; §11)

**Acceptance Criteria**:
- When `EditorViewState.isNoteEmpty === true`, the Copy Body button is rendered with `disabled` and `aria-disabled="true"`.
- When `EditorViewState.isNoteEmpty === false`, the Copy Body button is enabled (subject to status — REQ-EDIT-022).
- The disabled visual uses Warm Gray 300 (`#a39e98`) per DESIGN.md §8.

---

### §3.2 Block Structure Operations

#### REQ-EDIT-006: Enter at End of Block Dispatches InsertBlock

When the user presses Enter while the caret is at the end of a Block's content (`selection.start === selection.end === content.length`), the system shall dispatch `InsertBlock { kind: 'insert-block', atBeginning: false, noteId, prevBlockId, type: 'paragraph', content: '', issuedAt }` and the new Block shall receive focus (the domain emits `BlockInserted` followed by `BlockFocused`; the UI mirrors `focusedBlockId`). (ref: capture/commands.ts `InsertBlock`; aggregates.md §1 `insertBlockAfter`; workflows.md Workflow 10)

**Acceptance Criteria**:
- Enter at the end of a non-empty Block dispatches `InsertBlock` with `atBeginning: false` and `prevBlockId === EditorViewState.focusedBlockId`.
- The newly inserted Block becomes the focused Block once the snapshot returns.
- The newly inserted Block's `type` defaults to `'paragraph'`; `content` is empty.

---

#### REQ-EDIT-007: Enter Mid-Block Dispatches SplitBlock

When the user presses Enter while the caret is strictly inside a Block (`selection.start === selection.end ∈ (0, content.length)`), the system shall dispatch `SplitBlock { kind: 'split-block', noteId, blockId, offset, issuedAt }` where `offset` is the caret index. The text after the caret moves into a new `paragraph` Block inserted directly after, and focus moves to that new Block. (ref: capture/commands.ts `SplitBlock`; capture/internal-events.ts `BlockSplit`; aggregates.md §1 `splitBlock`)

**Acceptance Criteria**:
- Enter mid-block dispatches `SplitBlock` carrying the caret offset.
- The reducer never invents an offset value out of `[0, content.length]`; the impure shell reads it from `Selection.anchorOffset`.
- After the resulting `BlockSplit` snapshot, `EditorViewState.focusedBlockId` matches the newly created Block (`BlockSplit.newBlockId`).

---

#### REQ-EDIT-008: Backspace at Block Start Dispatches MergeBlocks

When the user presses Backspace at the start of a non-first Block (`selection.start === selection.end === 0`), the system shall dispatch `MergeBlocks { kind: 'merge-blocks', noteId, blockId, issuedAt }`. The domain merges the current Block's content into the previous Block and removes the current Block (`BlocksMerged` event); focus follows to the survivor. Backspace at the start of the first Block is a no-op (the domain returns `merge-on-first-block` and the UI treats it silently). (ref: capture/commands.ts `MergeBlocks`; capture/internal-events.ts `BlocksMerged`; aggregates.md §1 `mergeBlockWithPrevious`; shared/note.ts `BlockOperationError.merge-on-first-block`)

**Acceptance Criteria**:
- Backspace at offset 0 in a non-first Block dispatches `MergeBlocks`.
- After the snapshot, `focusedBlockId` mirrors `BlocksMerged.survivorBlockId`.
- Backspace at offset 0 in the first Block dispatches nothing (the UI gates this client-side via `EditorViewState.focusedBlockId === blocks[0].id`).

---

#### REQ-EDIT-009: Empty-Block Backspace / Delete Dispatches RemoveBlock

When the user presses Backspace or Delete on a Block whose content is empty AND the Note has more than one Block, the system shall dispatch `RemoveBlock { kind: 'remove-block', noteId, blockId, issuedAt }`. If the Note has only one Block, the command is NOT dispatched (the domain refuses `last-block-cannot-be-removed`; the UI elides the no-op). Focus moves to the previous Block when one exists, otherwise to the next Block. (ref: capture/commands.ts `RemoveBlock`; aggregates.md §1 `removeBlock` invariant; shared/note.ts `BlockOperationError.last-block-cannot-be-removed`)

**Acceptance Criteria**:
- Backspace/Delete on an empty non-last Block dispatches `RemoveBlock`.
- Backspace/Delete on the only Block of a Note dispatches nothing.
- After the snapshot, `focusedBlockId` matches the neighbouring Block produced by the domain.

---

#### REQ-EDIT-010: Slash Menu and Markdown Shortcut Dispatch ChangeBlockType

When the user invokes the `/` menu inside a Block and selects a Block type, OR types a recognised Markdown prefix at the start of an empty paragraph (`# ` → heading-1, `## ` → heading-2, `### ` → heading-3, `- ` / `* ` → bullet, `1. ` → numbered, ``` ``` ``` → code, `> ` → quote, `---` on its own line → divider), the system shall dispatch `ChangeBlockType { kind: 'change-block-type', noteId, blockId, newType, issuedAt }`. For Markdown shortcuts, the trigger characters are stripped from the Block content via a follow-up `EditBlockContent` dispatch (or the domain returns the cleaned content via `BlockTypeChanged`; UI mirrors). The slash menu surface itself is purely local UI state and never persists. (ref: capture/commands.ts `ChangeBlockType`; capture/internal-events.ts `BlockTypeChanged`; aggregates.md §1 `changeBlockType`)

**Acceptance Criteria**:
- Selecting "Heading 1" in the slash menu dispatches `ChangeBlockType` with `newType: 'heading-1'`.
- Typing `# ` at the start of an empty paragraph dispatches `ChangeBlockType` with `newType: 'heading-1'` and clears the prefix.
- Each of `paragraph | heading-1 | heading-2 | heading-3 | bullet | numbered | code | quote | divider` is reachable from the slash menu and is a valid `BlockType` literal.
- The slash-menu DOM is mounted only while open and torn down on selection or Escape.

---

#### REQ-EDIT-011: Block Reorder Dispatches MoveBlock

When the user drags a Block handle to a new vertical position OR uses the keyboard shortcut Alt+Shift+Up/Down to move the focused Block, the system shall dispatch `MoveBlock { kind: 'move-block', noteId, blockId, toIndex, issuedAt }` where `toIndex` is the new 0-based index in `note.blocks` and `0 <= toIndex < blocks.length`. (ref: capture/commands.ts `MoveBlock`; capture/internal-events.ts `BlockMoved`; aggregates.md §1 `moveBlock`; shared/note.ts `BlockOperationError.move-index-out-of-range`)

**Acceptance Criteria**:
- Drop releases or Alt+Shift+Up/Down dispatches `MoveBlock` with a `toIndex` inside `[0, blocks.length)`.
- The UI reads the source index from the focused Block and the destination index from the drop target / keyboard direction; it does not invent indices outside the Note.
- The drag preview Element is removed from the DOM regardless of dispatch outcome.

---

### §3.3 Idle Autosave

#### REQ-EDIT-012: Idle Debounce Timer

**Spec contract constant**: `IDLE_SAVE_DEBOUNCE_MS = 2000`

When any block-edit command (`EditBlockContent`, `InsertBlock`, `RemoveBlock`, `MergeBlocks`, `SplitBlock`, `ChangeBlockType`, `MoveBlock`) is dispatched while `EditorViewState.isDirty === true`, the impure shell shall (re)start a debounce timer of exactly `IDLE_SAVE_DEBOUNCE_MS` ms. If no further block-edit dispatch occurs before the timer fires, the system shall fire `TriggerIdleSave { kind: 'trigger-idle-save', noteId, issuedAt }` (Workflow 2) with effective `source: 'capture-idle'` (carried on the resulting `SaveNoteRequested` Public Event). Each new block-edit dispatch resets the timer. (ref: capture/commands.ts `TriggerIdleSave`; shared/events.ts `SaveNoteSource = 'capture-idle' | 'capture-blur' | 'curate-tag-chip' | 'curate-frontmatter-edit-outside-editor'`; workflows.md Workflow 2 step 1; aggregates.md §EditingState `applyBlockEdit`)

**Debounce shell contract**: The pure `debounceSchedule.computeNextFireAt({ lastEditAt, lastSaveAt, debounceMs, nowMs })` is invoked by the impure shell. The reducer never schedules timers; it only emits `'cancel-idle-timer'` and `'trigger-idle-save'` `EditorCommand`s for the impure shell to consume. (See §12 Debounce Contract.)

**Acceptance Criteria**:
- After any block-edit dispatch, exactly one `TriggerIdleSave` fires `IDLE_SAVE_DEBOUNCE_MS` ms after the last dispatch.
- A subsequent block-edit dispatch within the window resets the timer; no intermediate `TriggerIdleSave` fires.
- `IDLE_SAVE_DEBOUNCE_MS` is a named exported constant so tests use `vi.useFakeTimers()`.
- The timer is not started while `EditorViewState.isDirty === false`.

---

#### REQ-EDIT-013: Idle Timer Cancelled on Successful Save

When a save completes successfully (per REQ-EDIT-004), the system shall cancel any running idle debounce timer so that `TriggerIdleSave` does not fire redundantly after the save. (ref: workflows.md Workflow 2 「重複保存抑制」)

**Acceptance Criteria**:
- After `NoteFileSaved` is mirrored, the impure shell calls `cancelIdleSave(handle)` exactly once before the next edit cycle.
- A second `TriggerIdleSave` is not dispatched for a body that was already saved.

---

### §3.4 Blur Autosave

#### REQ-EDIT-014: All-Blocks Blur Fires TriggerBlurSave

When the editor surface as a whole loses focus while `EditorViewState.isDirty === true` — i.e., the impure shell observes that the focusout target is outside the editor pane root and no following focus into another Block of the same Note has arrived within the same event loop tick — the system shall dispatch `TriggerBlurSave { kind: 'trigger-blur-save', noteId, issuedAt }` (Workflow 2) with effective `source: 'capture-blur'`, and shall cancel any pending idle debounce timer. (ref: capture/commands.ts `TriggerBlurSave`; capture/internal-events.ts `EditorBlurredAllBlocks`; shared/events.ts `SaveNoteSource`)

**Acceptance Criteria**:
- Blur to outside the editor pane while dirty dispatches `TriggerBlurSave` exactly once with effective `source: 'capture-blur'`.
- A blur from one Block followed by a focus into another Block of the same Note (same event loop tick) does NOT dispatch `TriggerBlurSave`; the editor remains in `editing` and `focusedBlockId` updates via REQ-EDIT-001.
- The pending idle timer is cancelled before `TriggerBlurSave` fires.
- If `EditorViewState.isDirty === false` at the time of all-blocks blur, `TriggerBlurSave` is NOT dispatched.

---

#### REQ-EDIT-015: Blur Does Not Duplicate Idle for the Same Dirty Interval

When `TriggerBlurSave` is dispatched, the system shall ensure the idle debounce timer is cancelled so that `TriggerIdleSave` does NOT also fire for the same dirty interval. Blur and idle MUST NOT both fire for the same dirty editing session. (ref: workflows.md Workflow 2 未解決の問い)

**Acceptance Criteria**:
- Given an idle timer is pending, an all-blocks blur cancels it and dispatches only `TriggerBlurSave`.
- After the save completes, a fresh dirty cycle (`isDirty: false → true`) starts a new debounce window.

---

#### REQ-EDIT-016: Blur Does Not Fire When State Is Already Saving or Switching

If the all-blocks blur event arrives while `EditorViewState.status === 'saving'` or `'switching'`, the system shall NOT dispatch a second `TriggerBlurSave` because a save is already in flight (or the domain's `EditPastNoteStart.flushCurrentSession` step owns the flush). (ref: capture/states.ts; aggregates.md state transition table — `saving` / `switching` have no outgoing `EditorBlurredAllBlocks`-driven autosave)

**Acceptance Criteria**:
- Blur while `status === 'saving'` dispatches nothing.
- Blur while `status === 'switching'` dispatches nothing; the in-flight switch proceeds.

---

### §3.5 Block Focus Maintenance Across Same-Note Moves

#### REQ-EDIT-017: Same-Note Block Focus Does Not Begin a Switch

When the user moves focus to a different Block of the same Note, `EditingSessionTransitions.refocusBlockSameNote` keeps `status === 'editing'` and only updates `focusedBlockId`. The UI shall NOT dispatch any save command, NOT cancel the idle timer, and NOT show any switching affordance. (ref: capture/states.ts `EditingSessionTransitions.refocusBlockSameNote`; capture/stages.ts `CurrentSessionDecision.same-note`; aggregates.md L355)

**Acceptance Criteria**:
- A focus change between Blocks of the same Note dispatches only `FocusBlock` (REQ-EDIT-001).
- No `TriggerBlurSave` or `TriggerIdleSave` is dispatched as a result of the focus move alone.
- The visible focus ring moves; no spinner or banner appears.

---

#### REQ-EDIT-018: Idle Timer Continues Across Same-Note Block Moves

When the user moves focus to another Block of the same Note while the idle timer is pending, the timer SHALL continue running (a same-note move is not a new edit and does not reset the debounce window). The next block-edit dispatch (REQ-EDIT-003 or any structural REQ-EDIT-006..011) does reset the timer per REQ-EDIT-012. (ref: aggregates.md L355–356; capture/states.ts `applyBlockEdit`)

**Acceptance Criteria**:
- Tab/click between Blocks does not call `cancelIdleSave` and does not call `scheduleIdleSave`.
- A subsequent `EditBlockContent` dispatch in the new focused Block resets the timer per REQ-EDIT-012.

---

### §3.6 EditingSessionState UI Mapping

#### REQ-EDIT-019: Idle State — Editor Collapsed

While `EditorViewState.status === 'idle'`, the system shall render the editor area in a collapsed/read-only placeholder state: no Block elements are interactive, the Copy button is disabled, no save indicator is shown. The placeholder text communicates that no note is active. (ref: ui-fields.md §UI 状態と型の対応 `idle` 行)

**Acceptance Criteria**:
- When `status === 'idle'`, the Block tree is either absent from the DOM or rendered with `contenteditable="false"` and `aria-disabled="true"`.
- The Copy button has `disabled` and `aria-disabled="true"`.
- A placeholder message is visible (e.g., "ノートを選択してください").
- The New Note button remains enabled in `idle` state.

---

#### REQ-EDIT-020: Editing State — Active Block Editing

While `EditorViewState.status === 'editing'`, the system shall render the Block tree as interactive: the Block matching `focusedBlockId` is contenteditable and carries the focus ring; non-focused Blocks remain contenteditable but visually de-emphasised per DESIGN.md. When `EditorViewState.isDirty === true`, a dirty indicator is displayed near the editor heading. No save-failure banner is shown. (ref: ui-fields.md §UI 状態と型の対応 `editing` 行; DESIGN.md §4 Inputs & Forms; aggregates.md L274 `EditingSessionState.isDirty`)

**Acceptance Criteria**:
- The Block whose `id === EditorViewState.focusedBlockId` is the active editable element.
- When `isDirty === true`, a visual dirty indicator is present in the DOM.
- The Copy button is enabled when `isNoteEmpty === false` (REQ-EDIT-005).
- No spinner and no error banner is shown.

---

#### REQ-EDIT-021: Saving State — In-Flight Indicator

While `EditorViewState.status === 'saving'`, the system shall render a save-in-progress indicator near the editor heading, keep the Block tree editable (the user may continue typing during save), and show the Copy button enabled when `isNoteEmpty === false`. The system shall NOT make the Block tree `contenteditable="false"` during `saving`. The New Note button is **enabled** in `saving` state (per EC-EDIT-010). (ref: ui-fields.md §UI 状態と型の対応 `saving` 行)

**Acceptance Criteria**:
- A save indicator element is present in the DOM with `aria-label` containing "保存中".
- Block elements remain `contenteditable="true"`.
- The dirty badge may or may not be shown; the saving indicator takes precedence.
- The New Note button is enabled.

---

#### REQ-EDIT-022: Switching State — Block Tree Locked

While `EditorViewState.status === 'switching'`, the system shall render the Block tree as non-interactive (`contenteditable="false"` and `aria-disabled="true"`) with a visual cue indicating a note switch is pending. The Copy button and New Note button shall be disabled. The user cannot make new edits until the switch completes. The pending Block focus target is `EditorViewState.pendingNextFocus = { noteId, blockId }`; the editor uses this only for visual feedback. (ref: ui-fields.md §UI 状態と型の対応 `switching` 行; capture/states.ts `SwitchingState.pendingNextFocus`)

**Acceptance Criteria**:
- Block elements have `contenteditable="false"` and `aria-disabled="true"`.
- The Copy button is disabled.
- The New Note button is `disabled` / `aria-disabled="true"`.
- A visual cue communicates the pending switch.

---

#### REQ-EDIT-023: Save-Failed State — Banner and Degraded Editor

While `EditorViewState.status === 'save-failed'`, the system shall render the save-failure banner (§3.7), keep the Block tree editable, and disable the Copy button. Input continues to accumulate as pending dirty content. The New Note button is **enabled** in `save-failed` state (per EC-EDIT-008 the dispatch is allowed; the domain's `HandleSaveFailure` decides). The banner Cancel button restores focus to the previous `focusedBlockId` (held in `EditorViewState`). (ref: ui-fields.md §UI 状態と型の対応 `save-failed` 行; capture/states.ts `SaveFailedState.pendingNextFocus`)

**Acceptance Criteria**:
- The save-failure banner is visible.
- Block elements remain `contenteditable="true"`.
- The Copy button is `disabled` / `aria-disabled="true"`.
- The New Note button is enabled.

---

#### §3.6a State Ownership Contract

**This subsection is normative.** It resolves the state-ownership ambiguity carried over from prior iterations.

**Canonical `EditingSessionState`** is owned exclusively by the Rust domain layer. The TypeScript `editorReducer` is a **mirror reducer** whose output type is `EditorViewState` — a UI-side projection derived from inbound `EditingSessionState` snapshot events.

**Relationship between `EditorViewState` and `EditingSessionState`**:
- `EditorViewState` is a strict subset of `EditingSessionState`: it contains `status`, `isDirty`, `currentNoteId`, `focusedBlockId`, `pendingNextFocus`, `isNoteEmpty`, `lastSaveError` (when status is `save-failed`).
- `EditorViewState` is NOT the authoritative state. It is a locally-cached projection for UI rendering.
- The reducer's job is UI-projection only: given an inbound domain snapshot action (`DomainSnapshotReceived { snapshot }`), it produces an `EditorViewState` suitable for driving Svelte reactivity.
- Locally-observed action shapes (e.g., `BlockContentEdited` for optimistic `isDirty=true`) are immediately superseded by the next domain snapshot.

**Who emits transitions**: The Rust domain emits transitions. The TypeScript `editorReducer` does NOT author new transitions; it only reflects them into `EditorViewState`.

**Inbound event channel**: See §10 Domain ↔ UI State Synchronization.

**Invariant**: `EditorViewState` must converge to the domain's `EditingSessionState` within one inbound event cycle. Any divergence (e.g., optimistic `isDirty=true`) is transient and overwritten by the next `DomainSnapshotReceived`.

---

#### REQ-EDIT-024: State Transitions Are Domain-Driven

The system shall NOT mutate `EditingSessionState` or `EditorViewState` directly from UI event handlers other than via the `editorReducer`. All canonical state transitions are driven by domain events received via the inbound `editing_session_state_changed` Tauri event channel (§10). The Svelte component calls `editorReducer` with an `EditorAction` and renders the returned `EditorViewState`; it never constructs `EditingSessionState`. (ref: aggregates.md CaptureSession 設計原則; ui-fields.md Phase 11 差し戻し)

**Acceptance Criteria**:
- No Svelte component constructs or mutates an `EditingSessionState` object.
- The canonical state flows from the domain layer via `EditorIpcAdapter.subscribeToState(handler)` (§10).
- The UI re-renders reactively when the `$state`-stored `EditorViewState` is updated by the inbound event callback.
- The `editorReducer` is the only code that produces a new `EditorViewState` from an `EditorAction`.

---

### §3.7 Save-Failure Banner

#### REQ-EDIT-025: Save-Failure Banner Rendered for save-failed State

When `EditorViewState.status === 'save-failed'`, the system shall render a non-modal inline banner within the editor area displaying a user-facing error message derived from `SaveError.kind`. (ref: ui-fields.md §画面 4; workflows.md Workflow 8; shared/errors.ts `SaveError`)

**Acceptance Criteria**:
- The banner is present in the DOM if and only if `status === 'save-failed'`.
- The banner does not use a blocking modal overlay; it is inline.
- The banner has `role="alert"` and `data-testid="save-failure-banner"`.

---

#### REQ-EDIT-026: Save-Failure Banner Message Derived From SaveError.kind

When the save-failure banner is rendered, the system shall display a message corresponding to the `SaveError` nested structure, drawn verbatim from `ui-fields.md §画面 4`:

| `SaveError` structure | User-facing message |
|---|---|
| `{ kind: 'fs', reason: { kind: 'permission' } }` | 「保存に失敗しました（権限不足）」 |
| `{ kind: 'fs', reason: { kind: 'disk-full' } }` | 「保存に失敗しました（ディスク容量不足）」 |
| `{ kind: 'fs', reason: { kind: 'lock' } }` | 「保存に失敗しました（ファイルがロックされています）」 |
| `{ kind: 'fs', reason: { kind: 'not-found' } }` | 「保存に失敗しました（保存先が見つかりません）」 |
| `{ kind: 'fs', reason: { kind: 'unknown' } }` | 「保存に失敗しました」（詳細はログ） |
| `{ kind: 'validation', reason: { kind: 'empty-body-on-idle' } }` | サイレント（破棄パスへ、バナー非表示）。後継状態: `EditorViewState.status === 'editing'`、`isDirty === false`、`isNoteEmpty === true`、idle debounce タイマーはクリア。以降の block-edit は通常サイクルを再開 |
| `{ kind: 'validation', reason: { kind: 'invariant-violated' } }` | 内部バグ: エラーログのみ、バナー非表示（サイレント） |

(ref: shared/errors.ts `FsError` / `SaveError` / `SaveValidationError`; ui-fields.md §画面 4)

**Acceptance Criteria**:
- Each `fs` error kind maps to the exact user-facing message string above.
- `validation.invariant-violated` does NOT render the banner; it logs to `console.error` and leaves the UI unchanged.
- `validation.empty-body-on-idle` does NOT render the banner; the successor `EditorViewState` has `status === 'editing'`, `isDirty === false`, `isNoteEmpty === true`, and the idle debounce timer is cleared.
- The TypeScript switch over `SaveError.kind` and `FsError.kind` is exhaustive (compile-time `never` guarantee).
- The message element has `data-testid="save-failure-message"`.

---

#### REQ-EDIT-027: Save-Failure Banner — Retry Button

When the save-failure banner is visible, the system shall render a 再試行 (Retry) button. When the user activates it, the system shall dispatch `RetrySave { kind: 'retry-save', noteId, issuedAt }`, transitioning the domain from `save-failed` to `saving`. (ref: capture/commands.ts `RetrySave`; capture/states.ts `EditingSessionTransitions.retry`)

**Acceptance Criteria**:
- The Retry button is present and labeled "再試行" when `status === 'save-failed'`.
- Activating the button dispatches `RetrySave` exactly once.
- The button has `data-testid="retry-save-button"`, is keyboard-reachable, and activatable via Enter/Space.
- After dispatch, the banner hides via the `saving` snapshot.

---

#### REQ-EDIT-028: Save-Failure Banner — Discard Button

When the save-failure banner is visible, the system shall render a 破棄 (Discard) button. Activating it dispatches `DiscardCurrentSession { kind: 'discard-current-session', noteId, issuedAt }`. If `EditorViewState.pendingNextFocus` is non-null, the domain `EditingSessionTransitions.discard` returns an `EditingState` for the queued next Block Focus; otherwise it returns `IdleState`. (ref: capture/commands.ts `DiscardCurrentSession`; capture/states.ts `EditingSessionTransitions.discard`)

**Acceptance Criteria**:
- The Discard button is present and labeled "変更を破棄" when `status === 'save-failed'`.
- Activating the button dispatches `DiscardCurrentSession` exactly once.
- The button has `data-testid="discard-session-button"`, is keyboard-reachable, and activatable via Enter/Space.

---

#### REQ-EDIT-029: Save-Failure Banner — Cancel Button

When the save-failure banner is visible, the system shall render a キャンセル (Cancel) button. Activating it dispatches `CancelSwitch { kind: 'cancel-switch', noteId, issuedAt }`, which returns the domain to `editing(currentNoteId, focusedBlockId)` — the user continues editing the prior Block. (ref: capture/commands.ts `CancelSwitch`; capture/states.ts `EditingSessionTransitions.cancelSwitch`)

**Acceptance Criteria**:
- The Cancel button is present and labeled "閉じる（このまま編集を続ける）" when `status === 'save-failed'`.
- Activating the button dispatches `CancelSwitch` exactly once.
- The button has `data-testid="cancel-switch-button"`, is keyboard-reachable, and activatable via Enter/Space.
- After dispatch, the banner hides and the prior `focusedBlockId` regains the visible focus ring.

---

#### REQ-EDIT-030: Save-Failure Banner Visual Style

When the save-failure banner is rendered, the system shall style it as a Deep Card (Level 3) overlay using the 5-layer Deep Shadow, with a left accent border in Orange (`#dd5b00`). All three action buttons must be DESIGN.md-compliant. (ref: DESIGN.md §4 Cards & Containers; §6 Depth & Elevation; §4 Buttons)

**Acceptance Criteria**:
- The banner container uses the 5-layer Deep Shadow: `rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px`.
- The left accent uses `#dd5b00`.
- The banner `border-radius` is 8px.
- Retry button uses Primary Blue (`#0075de` background, white text); Discard and Cancel use Secondary style.
- Button text is 15px weight 600.

---

### §3.8 Copy Body

#### REQ-EDIT-031: Copy Button Dispatches CopyNoteBody

When the user activates the Copy Body button and `EditorViewState.isNoteEmpty === false`, the system shall dispatch `CopyNoteBody { kind: 'copy-note-body', noteId, issuedAt }`. The Rust handler invokes `NoteOps.bodyForClipboard(note)` (which internally calls `serializeBlocksToMarkdown(note.blocks)`) and writes the result to the clipboard. (ref: capture/commands.ts `CopyNoteBody`; shared/note.ts `NoteOps.bodyForClipboard`; shared/blocks.ts `SerializeBlocksToMarkdown`; workflows.md Workflow 6)

**Acceptance Criteria**:
- Activating the Copy button dispatches `CopyNoteBody` with the active `noteId`.
- `CopyNoteBody` is NOT dispatched when `EditorViewState.isNoteEmpty === true`.
- The button has `data-testid="copy-body-button"`, is keyboard-reachable, and activatable via Enter/Space.

---

#### REQ-EDIT-032: Copy Button Disabled State Matrix

The Copy button disabled rule across all 5 statuses:
- `idle` → **disabled** (no active note)
- `editing` → **enabled** when `isNoteEmpty === false`; disabled otherwise
- `saving` → **enabled** when `isNoteEmpty === false`; disabled otherwise
- `switching` → **disabled** (input locked)
- `save-failed` → **disabled**

When disabled, the button has `disabled`, `aria-disabled="true"`, text color `#a39e98`, and no hover interaction. (ref: ui-fields.md §UI 状態と型の対応; DESIGN.md §8 Disabled state)

**Acceptance Criteria**:
- The `disabled` attribute is present in `idle`, `switching`, `save-failed` regardless of `isNoteEmpty`.
- The `disabled` attribute is present when `isNoteEmpty === true` regardless of status.
- The Copy button text/icon uses `#a39e98` when disabled.
- No `click` handler fires while disabled.

---

### §3.9 New Note (+新規ノート)

#### REQ-EDIT-033: New Note Button Dispatches RequestNewNote

When the user activates the "+ 新規" button, the system shall dispatch `RequestNewNote { kind: 'request-new-note', source: 'explicit-button', issuedAt }` (`issuedAt` is a raw ISO-8601 string at the wire boundary — §11). (ref: capture/commands.ts `RequestNewNote`)

**New Note button enable/disable matrix**:
- `idle` → **enabled**
- `editing` → **enabled** (REQ-EDIT-035 may inject blur-save first)
- `saving` → **enabled** (per EC-EDIT-010 the domain queues the intent)
- `switching` → **disabled** (a switch is already in progress)
- `save-failed` → **enabled** (per EC-EDIT-008)

**Acceptance Criteria**:
- Activating "+ 新規" dispatches `RequestNewNote` with `source: 'explicit-button'`.
- The button has `data-testid="new-note-button"`.
- The button is `disabled` / `aria-disabled="true"` only in `switching` state.

---

#### REQ-EDIT-034: Ctrl+N / Cmd+N Dispatches RequestNewNote

When the user presses Ctrl+N (Linux/Windows) or Cmd+N (macOS) **while focus is within the editor pane root element** (the listener is scoped to the editor pane — NOT the global `document`), the system shall dispatch `RequestNewNote { source: 'ctrl-N', issuedAt }`. Both platforms map to the single `'ctrl-N'` source value. (ref: capture/commands.ts `RequestNewNote.source`)

**Platform detection**: `(event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n'`. The dispatched `source` is always `'ctrl-N'`.

**Listener scope**: The listener attaches to the editor pane root via `panelRoot.addEventListener('keydown', ...)`, NOT `document.addEventListener`.

**Acceptance Criteria**:
- Pressing `Ctrl+N` (Linux/Windows) dispatches `RequestNewNote { source: 'ctrl-N' }`.
- Pressing `Cmd+N` (macOS) dispatches `RequestNewNote { source: 'ctrl-N' }`.
- `event.preventDefault()` is called.
- The `n` character is not inserted into any Block.
- The shortcut does NOT fire when focus is outside the editor pane.

---

#### REQ-EDIT-035: New Note When Current Note Is Dirty (status === 'editing') — Blur-Save First

When `RequestNewNote` is dispatched while `EditorViewState.status === 'editing'` AND `isDirty === true`, the system shall trigger blur-save semantics first (`TriggerBlurSave { source: 'capture-blur' }` via REQ-EDIT-014's `EditorBlurredAllBlocks` path), wait for the `saving → editing` snapshot, and only then allow the domain `RequestNewNote` pipeline to create the new note. If the save fails (status becomes `save-failed`), new-note creation is deferred until the user resolves via Retry / Discard / Cancel.

**Explicit carve-out for `save-failed`**: When `status === 'save-failed'` and the user dispatches `RequestNewNote`, the UI does NOT first dispatch `TriggerBlurSave`. It dispatches `RequestNewNote { source }` directly; the domain's `HandleSaveFailure` (Workflow 8) owns resolution. (See §9 RD-009.)

(ref: ui-fields.md §1A-3; aggregates.md `EditingSessionState` `editing → switching`; workflows.md Workflow 8)

**Acceptance Criteria**:
- "+ 新規" / Ctrl+N while `editing` AND `isDirty === true` dispatches `TriggerBlurSave` before `RequestNewNote`.
- `RequestNewNote` is NOT dispatched until the snapshot transitions out of `saving`.
- If the snapshot becomes `save-failed`, the new-note action is suspended and the banner is shown.
- When `status === 'save-failed'`, `RequestNewNote` is dispatched directly without a preceding `TriggerBlurSave`.

---

#### REQ-EDIT-036: New Note Auto-Focuses First Block

When `NewNoteAutoCreated { firstBlockId }` is mirrored into a snapshot (EditingState with `currentNoteId === <new>` and `focusedBlockId === firstBlockId`), the system shall set native DOM focus to the Block element matching `firstBlockId`. (ref: capture/internal-events.ts `NewNoteAutoCreated`; aggregates.md §1 `NoteOps.create`)

**Acceptance Criteria**:
- After `NewNoteAutoCreated` is mirrored, the Block element for `firstBlockId` receives DOM focus exactly once per creation.
- The native focus is set inside an `$effect` reacting to `EditorViewState.focusedBlockId` changes — never inside the pure reducer.

---

### §3.10 Source Discrimination

#### REQ-EDIT-037: Every Save Command Carries Explicit Source

The system shall set the `source` field on every save-triggering `EditorCommand` explicitly in the UI layer. The UI MUST NOT allow the domain to infer the source. The permitted `source` values for `ui-editor` are drawn verbatim from `shared/events.ts SaveNoteSource`:

- `'capture-idle'` — idle debounce timer fired after the user stopped typing
- `'capture-blur'` — all-blocks blur (including programmatic blur-save for note-switch / new-note scenarios)

The values `'curate-tag-chip'` and `'curate-frontmatter-edit-outside-editor'` exist in the same enum but are **out of scope** for this feature. The values `'switch'`, `'manual'`, `'idle'`, and `'blur'` do NOT exist in the domain enum and MUST NOT be used. Note-switch is handled by `EditPastNoteStart` (Workflow 3), not by a distinct source. (ref: shared/events.ts `SaveNoteSource`)

**Acceptance Criteria**:
- `TriggerIdleSave` always carries effective `source: 'capture-idle'` (carried on the `SaveNoteRequested` Public Event built by Capture from this command).
- `TriggerBlurSave` always carries effective `source: 'capture-blur'`.
- No save command is dispatched without an explicit `source` field on the resulting `EditorCommand` payload (§10 EditorCommand union).
- The strings `'idle'`, `'blur'`, `'switch'`, `'manual'` MUST NOT appear as `source` values anywhere in `ui-editor`.

---

### §3.11 Input Field Validation Surface

#### REQ-EDIT-038: Block Validation Error Display

When the domain returns a `BlockOperationError` or `BlockContentError` (via the inbound snapshot's `lastSaveError` field or via a rejected command response), the system shall display the corresponding inline error or hint text near the affected Block without locking the Block. The Block remains contenteditable. The exhaustive error mapping covers (`shared/note.ts BlockOperationError`):

| Error variant | UI surface |
|---|---|
| `block-not-found` | Internal bug — `console.error`, no inline hint |
| `last-block-cannot-be-removed` | Silent (UI never dispatches RemoveBlock for last block per REQ-EDIT-009) |
| `split-offset-out-of-range` | Internal bug — `console.error` |
| `move-index-out-of-range` | Internal bug — `console.error` |
| `merge-on-first-block` | Silent (UI never dispatches MergeBlocks at first block per REQ-EDIT-008) |
| `incompatible-content-for-type` | Inline hint near Block: "このブロック種別に変換できません" |
| `invalid-block-id` / `invalid-block-type` | Internal bug — `console.error` |
| `BlockContentError.control-character` | Inline hint: "制御文字は入力できません" |
| `BlockContentError.newline-in-inline` | Internal bug — `console.error` (UI gates against newlines for non-`code` Blocks per REQ-EDIT-003) |
| `BlockContentError.too-long` | Inline hint: "上限を超えました（max: ${max}）" |

Likewise for `SaveValidationError`:
- `empty-body-on-idle` — silent (REQ-EDIT-026)
- `invariant-violated` — `console.error` only

**Acceptance Criteria**:
- Inline hint area is `aria-describedby`-linked to the affected Block.
- The Block is never `contenteditable="false"` solely because of a validation error.
- The exhaustive switch over `BlockOperationError.kind`, `BlockContentError.kind`, and `SaveValidationError.kind` is enforced by the TypeScript compiler.

---

## 4. Non-Functional Requirements

#### NFR-EDIT-001: Accessibility — Keyboard Reachability

All interactive elements — Block elements, Copy button, New Note button, Retry / Discard / Cancel — shall be reachable via Tab key navigation and activatable via Enter / Space (block elements remain in document tab order with `tabindex="0"` for non-focused blocks, or follow native contenteditable focus order). Tab order: focused Block → Copy → New Note → (when banner visible) Retry → Discard → Cancel. (ref: DESIGN.md §8 Accessibility & States)

**Acceptance Criteria**:
- Block elements are reachable via Tab when not currently focused.
- Buttons have descriptive `aria-label` if the visible label is insufficient.
- Focus ring uses `2px solid #097fe8`.
- ARIA verification is performed via DOM attribute assertions; no `axe-core` dependency.

---

#### NFR-EDIT-002: Accessibility — ARIA Roles and Live Regions

The save indicator shown during `saving` shall have `role="status"` and `aria-live="polite"`. The save-failure banner shall have `role="alert"`. The dirty indicator is `aria-hidden="true"` if decorative. Each Block element exposes `role="textbox"` (or its native equivalent for contenteditable). (ref: DESIGN.md §8)

**Acceptance Criteria**:
- The saving indicator has `role="status"`.
- The banner root element has `role="alert"`.
- No interactive element uses `tabIndex="-1"` while enabled.

---

#### NFR-EDIT-003: Performance — Idle Debounce Timer Overhead

The idle debounce timer uses a single `setTimeout` reference per edit cycle, not accumulating timers. On each block-edit dispatch, the previous timer is cleared before setting the new one. At typical Note sizes (up to ~50 Blocks, each up to ~5,000 chars per `BlockContentError.too-long` budget) there shall be no perceptible input lag. The reducer dispatch must complete synchronously within the event handler. (ref: REQ-EDIT-012)

**Acceptance Criteria**:
- The timer handle is stored in a single `$state` variable and cleared with `clearTimeout` on each new edit.
- Timer count does not grow unboundedly during a typing session.

---

#### NFR-EDIT-004: Performance — No Input Lag at Typical Note Size

The input event handler for any Block shall complete synchronously without blocking the event loop. Debounce scheduling, command dispatch, and state updates must not introduce perceptible lag. (ref: NFR-EDIT-003)

**Acceptance Criteria**:
- The `input` event handler completes without calling any async operation synchronously.
- No `await` inside the `oninput` handler.

---

#### NFR-EDIT-005: DESIGN.md Visual Conformance — Tokens

All hex / rgba / px values used in `ui-editor` Svelte components shall be drawn exclusively from DESIGN.md §10 Token Reference. Block elements use `font-family: -apple-system, ...` (DESIGN.md §3 Body Reading) and the body color `rgba(0,0,0,0.9)`; `code` Blocks use the monospace stack and 13px size. (ref: DESIGN.md §3 Typography; §10 Token Reference)

**Acceptance Criteria**:
- No hex / rgba / px value outside DESIGN.md §10 appears in component source.
- `code` Block uses `font-family: ui-monospace, ...` and `font-size: 13px`.

---

#### NFR-EDIT-006: DESIGN.md Visual Conformance — 4-Weight Typography System

All text uses only `font-weight ∈ {400, 500, 600, 700}` per DESIGN.md §3. Heading-1 / 2 / 3 Blocks use the corresponding heading weights and sizes from DESIGN.md §3.

**Acceptance Criteria**:
- No `font-weight` value outside `{400,500,600,700}` appears in component styles.
- `heading-1` Block matches DESIGN.md §3 H1 (28px / 700).
- `heading-2` Block matches H2 (22px / 600).
- `heading-3` Block matches H3 (18px / 600).

---

#### NFR-EDIT-007: DESIGN.md Visual Conformance — Layered Shadow on Banner

The save-failure banner uses the 5-layer Deep Shadow per DESIGN.md §6 (Deep Card Level 3). No single layer opacity exceeds 0.05. (ref: REQ-EDIT-030)

**Acceptance Criteria**:
- Banner `box-shadow` exactly matches the 5-layer Deep Shadow string.
- Individual shadow layer opacities ≤ 0.05.

---

#### NFR-EDIT-008: Svelte 5 Runes — State Ownership Boundary

All reactive state internal to `ui-editor` (debounce timer handle, slash-menu open/close, drag preview position) uses Svelte 5 rune syntax (`$state`, `$derived`, `$effect`). `isDirty` and `focusedBlockId` are NOT local Svelte state — they are fields of `EditorViewState` (the domain mirror) read from a read-only store / prop. No `writable` stores from Svelte 4 are introduced.

**Acceptance Criteria**:
- Local editor-shell state uses `$state(...)`.
- `isDirty` and `focusedBlockId` are NOT local `$state` variables; they are derived from `EditorViewState`.
- No `import { writable } from 'svelte/store'` for editor-internal state. Verified by `grep -r "from 'svelte/store'" src/lib/editor/` returning zero hits.
- `EditingSessionState` is not mutated inside any `ui-editor` component. Verified by `tsc --strict --noUncheckedIndexedAccess`.

---

## 5. Edge Case Catalogue

#### EC-EDIT-001: Rapid Typing — Debounce Burst Over 10 Seconds

The user types continuously for >10s with no pause longer than `IDLE_SAVE_DEBOUNCE_MS`. Expected: the timer is reset on each block-edit dispatch; at last-edit + 2s, exactly one `TriggerIdleSave` fires; no intermediate saves.

---

#### EC-EDIT-002: All-Blocks Blur During In-Flight Save

Status is `saving` (write in flight) and the user moves focus outside the editor pane. Per REQ-EDIT-016, `TriggerBlurSave` is NOT dispatched. The in-flight save proceeds. The next snapshot transitions to `editing` (or `save-failed`). No double-save.

---

#### EC-EDIT-003: Save Fails, User Continues Typing While Banner Shown

Status is `save-failed`. The user keeps typing. Per REQ-EDIT-023, Block elements remain editable. Each keystroke dispatches `EditBlockContent` and `isDirty` remains `true`. The idle timer continues to run. If `TriggerIdleSave` fires while `save-failed`, the UI dispatches the command; the domain owns the retry gate. The banner remains until Retry / Discard / Cancel.

---

#### EC-EDIT-004: Discard While Save Is Mid-Flight

Status is `saving` (write in progress) and the user reaches `DiscardCurrentSession` (e.g., after a fast `save-failed → saving` Retry round). The UI dispatches `DiscardCurrentSession`; the domain handles the race. The UI does not attempt to cancel the Tauri IPC call.

---

#### EC-EDIT-005: Switching to Another Note via Block Focus While Dirty

Status is `editing` and `isDirty === true`. The user clicks a Block in another Note from the feed (the click is owned by the feed feature). The domain transitions to `switching` with `pendingNextFocus = { noteId: B, blockId: bX }`. Per REQ-EDIT-022, the editor renders the locked state; the idle timer is cancelled. `EditPastNoteStart` (`flushCurrentSession`) handles the flush. On success, the snapshot becomes `editing(B, bX)`; on failure, `save-failed` with `pendingNextFocus` carrying `{ B, bX }`.

---

#### EC-EDIT-006: Same-Note Block Move (No Switching)

Status is `editing`. The user clicks another Block of the same Note. Per REQ-EDIT-017 / REQ-EDIT-018, the snapshot updates only `focusedBlockId`; status stays `editing`; idle timer continues. No `TriggerBlurSave`, no `TriggerIdleSave` from the focus move alone.

---

#### EC-EDIT-007: Empty Note → Non-Empty Transition (Copy Enable)

The user types into the only Block of a freshly-created Note (empty paragraph). Once the Block content is non-whitespace, the domain emits a snapshot with `isNoteEmpty: false`; the Copy button transitions enabled within the same render frame. Conversely, deleting all content reverts to `isNoteEmpty: true` and disables Copy.

---

#### EC-EDIT-008: Ctrl+N Pressed While Save-Failed Banner Is Visible

Status is `save-failed`. Per RD-009, the UI dispatches `RequestNewNote { source: 'ctrl-N' }` directly without a preceding `TriggerBlurSave`. The domain's `HandleSaveFailure` (Workflow 8) owns the resolution. If the domain requires resolution first, it returns `save-failed` again and the banner remains.

---

#### EC-EDIT-009: Idle Timer Running, OS Sleeps and Resumes

A pending `setTimeout` callback fires shortly after OS resume, dispatching `TriggerIdleSave` against the latest Block snapshot. This is acceptable; no formal verification beyond unit-level timer mocks.

---

#### EC-EDIT-010: New Note Attempted While State Is saving

Status is `saving` and the user activates New Note. Per REQ-EDIT-035 + `EditPastNoteStart`, the domain queues the new-note intent (sentinel `pendingNextFocus`). The UI dispatches `RequestNewNote` and reflects the resulting `switching` state until the domain resolves. The New Note button is **enabled** in `saving` (REQ-EDIT-021 / REQ-EDIT-033).

---

#### EC-EDIT-011: Backspace at Start of First Block

The user's caret is at offset 0 of the first Block. Per REQ-EDIT-008, the UI elides the dispatch (gated client-side via `focusedBlockId === blocks[0].id`). The default browser behaviour is `event.preventDefault()`-suppressed only when the elision applies; if there is text to delete normally inside a contenteditable, the browser handles it via REQ-EDIT-003's standard input flow.

---

#### EC-EDIT-012: SplitBlock at End-of-Block (Should Use InsertBlock)

The user presses Enter at offset === content.length. Per REQ-EDIT-006 vs REQ-EDIT-007, the UI dispatches `InsertBlock` (not `SplitBlock`). This is a pure-tier classification: `splitOrInsert(offset, contentLength)` returns `'insert'` when `offset === contentLength`, otherwise `'split'`. (Tested in `editorPredicates.property.test.ts`.)

---

#### EC-EDIT-013: Unknown BlockType in Markdown Shortcut

The user types a Markdown prefix that does not match any `BlockType` literal (e.g., `~~~`). The UI dispatches no `ChangeBlockType`; standard `EditBlockContent` for the typed characters proceeds.

---

#### EC-EDIT-014: SwitchError With pendingNextFocus

A note switch save-fails. `SwitchError.pendingNextFocus = { noteId, blockId }` arrives in the `save-failed` snapshot. The Cancel button restores focus to the prior Block (`currentNoteId`'s `focusedBlockId`); the Discard button calls `EditingSessionTransitions.discard` which the domain may resolve to an `EditingState` for the queued `pendingNextFocus`. (ref: shared/errors.ts `SwitchError`; capture/states.ts `SaveFailedState.pendingNextFocus`)

---

## 6. Glossary

| Term | Definition source |
|---|---|
| `Block` | Note Sub-entity. `{ id: BlockId, type: BlockType, content: BlockContent }`. — shared/note.ts |
| `BlockId` | Note-local stable ID (UUIDv4 or `block-<n>`). — shared/value-objects.ts |
| `BlockType` | One of `paragraph | heading-1 | heading-2 | heading-3 | bullet | numbered | code | quote | divider`. — shared/value-objects.ts |
| `BlockContent` | Branded string. Inline Markdown for non-`code`; multiline for `code`. — shared/value-objects.ts |
| `FocusBlock` | Command dispatched on caret entry into a Block. `{ noteId, blockId, issuedAt }`. — capture/commands.ts |
| `EditBlockContent` | Command dispatched per input event in a focused Block. `{ noteId, blockId, content, issuedAt }`. — capture/commands.ts |
| `InsertBlock` | Command for Enter at end of Block or programmatic insert. `atBeginning: false → { prevBlockId, type, content }` ; `atBeginning: true → { type, content }`. — capture/commands.ts |
| `RemoveBlock` | Command for Backspace/Delete on empty non-last Block. — capture/commands.ts |
| `MergeBlocks` | Command for Backspace at offset 0 of non-first Block. — capture/commands.ts |
| `SplitBlock` | Command for Enter mid-block. `{ blockId, offset }`. — capture/commands.ts |
| `ChangeBlockType` | Command for slash-menu / Markdown shortcut. `{ blockId, newType }`. — capture/commands.ts |
| `MoveBlock` | Command for drag/keyboard reorder. `{ blockId, toIndex }`. — capture/commands.ts |
| `TriggerIdleSave` | Command after `IDLE_SAVE_DEBOUNCE_MS` quiescence. Effective `source: 'capture-idle'`. — capture/commands.ts; shared/events.ts |
| `TriggerBlurSave` | Command on all-blocks blur while dirty. Effective `source: 'capture-blur'`. — capture/commands.ts; shared/events.ts |
| `CopyNoteBody` | Command for Workflow 6. Internally uses `serializeBlocksToMarkdown(note.blocks)`. — capture/commands.ts |
| `RequestNewNote` | Create a new empty note. `source: 'explicit-button' | 'ctrl-N'`. — capture/commands.ts |
| `RetrySave` / `DiscardCurrentSession` / `CancelSwitch` | Workflow 8 commands. — capture/commands.ts |
| `EditingSessionState` | **Domain-owned** state in Rust. 5 statuses. `EditingState.focusedBlockId: BlockId | null`. — capture/states.ts |
| `EditorViewState` | UI-owned mirror. Contains `status`, `isDirty`, `currentNoteId`, `focusedBlockId`, `pendingNextFocus`, `isNoteEmpty`, `lastSaveError`. — §3.6a |
| `pendingNextFocus` | `{ noteId, blockId } \| null`. Non-null on `SwitchingState` / `SaveFailedState` when a switch is queued. — capture/states.ts |
| `serializeBlocksToMarkdown` | Pure function `ReadonlyArray<Block> → string`. — shared/blocks.ts |
| `parseMarkdownToBlocks` | Pure function `string → Result<ReadonlyArray<Block>, BlockParseError>`. — shared/blocks.ts |
| `note.isEmpty()` | Domain predicate: 1 block && empty paragraph. UI mirrors as `isNoteEmpty`. — shared/note.ts |
| `BlockOperationError` | Block-level error union (block-not-found / last-block-cannot-be-removed / split-offset-out-of-range / move-index-out-of-range / merge-on-first-block / incompatible-content-for-type / invalid-block-id / invalid-block-type). — shared/note.ts |
| `BlockParseError` | Markdown parse failure (unterminated-code-fence / malformed-structure). Surfaces in `app-startup` Hydration. — shared/blocks.ts |
| `SaveError` | `{ kind: 'fs', reason: FsError } | { kind: 'validation', reason: SaveValidationError }`. — shared/errors.ts |
| `SwitchError` | `{ kind: 'save-failed-during-switch', underlying: SaveError, pendingNextFocus: { noteId, blockId } }`. — shared/errors.ts |
| `IDLE_SAVE_DEBOUNCE_MS` | Spec constant `2000`. — REQ-EDIT-012 |
| `EditorIpcAdapter` | Interface injected into editor. Outbound `dispatch*` methods + inbound `subscribeToState`. — §10 |
| Workflow 2 (CaptureAutoSave) | Domain pipeline: `DirtyEditingSession → ValidatedSaveRequest → ...`. — workflows.md |
| Workflow 3 (EditPastNoteStart) | Block-focus-driven switch: `BlockFocusRequest → CurrentSessionDecision → FlushedCurrentSession → NewSession`. — workflows.md |
| Workflow 6 (CopyBody) | `Note → ClipboardText` via `bodyForClipboard`. — workflows.md |
| Workflow 8 (HandleSaveFailure) | `SaveFailedState → UserDecision → ResolvedState`. — workflows.md |
| Workflow 10 (BlockEdit) | Per-block edit pipeline. — workflows.md |

---

## 7. Purity Boundary Candidates

The following behaviours are **pure** (deterministic, side-effect-free, formally verifiable) and seed Phase 1b proof obligations:

- **Block focus mirroring**: `editorReducer` mirrors `EditingState.focusedBlockId` from `DomainSnapshotReceived`; pure projection.
- **Optimistic dirty bit**: A locally-observed `BlockContentEdited` action sets `isDirty=true` until the next snapshot supersedes; pure derivation.
- **Source classification**: `classifySource(triggerKind: 'idle' | 'blur'): 'capture-idle' | 'capture-blur'` — pure mapping. Within `ui-editor` only these two values are produced; `'curate-*'` are produced by the Curate context.
- **Copy-enable predicate**: `canCopy(view): boolean = !view.isNoteEmpty && view.status !== 'idle' && view.status !== 'switching' && view.status !== 'save-failed'`. Pure function.
- **Banner message derivation**: `bannerMessageFor(error: SaveError): string | null` — exhaustive switch over `SaveError` and `FsError`.
- **Splitting rule**: `splitOrInsert(offset: number, contentLength: number): 'split' | 'insert'` — pure boundary classifier (REQ-EDIT-006 vs REQ-EDIT-007; EC-EDIT-012).
- **Markdown shortcut classifier**: `classifyMarkdownPrefix(content: string): { newType: BlockType; trimmedContent: string } | null` — pure prefix → BlockType mapping.
- **Backspace-at-zero classifier**: `classifyBackspaceAtZero(focusedIndex: number, blockCount: number): 'merge' | 'remove-empty-noop' | 'first-block-noop' | 'normal-edit'` — pure decision, given offset 0 and the focused index.
- **Debounce schedule**: `debounceSchedule.computeNextFireAt({ lastEditAt, lastSaveAt, debounceMs, nowMs })` (pure).
- **Reducer**: `editorReducer(state: EditorViewState, action: EditorAction): { state: EditorViewState, commands: ReadonlyArray<EditorCommand> }`. Total function.

The following behaviours are **impure** (effectful, outside pure verification):

- **Timer scheduling** (`setTimeout` / `clearTimeout`): impure shell `timerModule.ts`.
- **Clipboard write** is performed by the Rust side of `CopyNoteBody`; the editor has no direct clipboard call.
- **Tauri IPC for save / commands** via `EditorIpcAdapter`.
- **DOM events** (`focusin`, `focusout`, `keydown`, `input`, drag events).
- **`$effect` rune** registering listeners on the editor pane root.
- **Native focus management** (`element.focus()`) reacting to `EditorViewState.focusedBlockId` changes.
- **Inbound domain state subscription** (`EditorIpcAdapter.subscribeToState`).

---

## 8. Open Questions

- **`isNoteEmpty` mirror field source**: The `EditingSessionStateDto` payload from Rust must include a precomputed `isNoteEmpty: boolean` (running `NoteOps.isEmpty` server-side) so the UI does not re-implement the predicate. This is acceptable per §11 and is the confirmed approach — added to the inbound DTO contract in §10. No ambiguity remains; this note is retained for traceability.

_All other formerly open questions resolved; see §9._

---

## 9. Resolved Decisions

| ID | Question summary | Resolution | Source |
|---|---|---|---|
| RD-001 | Permitted `source` enum values | `'capture-idle'` and `'capture-blur'` only (drawn from `shared/events.ts SaveNoteSource`). `'curate-*'` are out of scope. `'switch'`, `'manual'`, `'idle'`, `'blur'` MUST NOT be used. | shared/events.ts |
| RD-002 | `source` for `RequestNewNote` | `'explicit-button'` (button) and `'ctrl-N'` (keyboard, both platforms). | capture/commands.ts |
| RD-003 | Tauri IPC command names | `ui-editor` does NOT hard-code `invoke()` strings. It depends on the injected `EditorIpcAdapter`. Pure-tier modules MUST NOT import `@tauri-apps/api`. Concrete handler names are defined by the backend save-handler features. | verification-architecture.md §2 / §8 |
| RD-004 | Ctrl+N vs Cmd+N | `(event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n'`. Source label always `'ctrl-N'`. | REQ-EDIT-034 |
| RD-005 | `isDirty` ownership | Field of both domain `EditingSessionState` and mirrored `EditorViewState`. UI never authors transitions; superseded by the next snapshot. | aggregates.md L274; §3.6a |
| RD-006 | `note.isEmpty()` predicate at UI | UI reads `EditorViewState.isNoteEmpty` from the snapshot DTO. The Rust domain runs `NoteOps.isEmpty`. UI does not re-implement the predicate. | shared/note.ts; §11 |
| RD-007 | Successor state for `empty-body-on-idle` | After silent discard: `EditorViewState.status === 'editing'`, `isDirty === false`, `isNoteEmpty === true`, idle timer cleared. | aggregates.md L280; REQ-EDIT-026 |
| RD-008 | Ctrl+N listener scope | Editor pane root element only (NOT `document`). | REQ-EDIT-034 |
| RD-009 | REQ-EDIT-035 vs EC-EDIT-008 | When `status === 'save-failed'`, `RequestNewNote` is dispatched directly without preceding `TriggerBlurSave`. The blur-save gate applies only when `status === 'editing'` AND `isDirty === true`. | EC-EDIT-008; REQ-EDIT-035 |
| RD-010 | Reducer signature | `editorReducer(state: EditorViewState, action: EditorAction): { state: EditorViewState, commands: ReadonlyArray<EditorCommand> }`. Total. | verification-architecture.md §2 |
| RD-011 | Inbound channel name | Rust emits `editing_session_state_changed` events with payload `{ state: EditingSessionStateDto }` carrying `status`, `isDirty`, `currentNoteId`, `focusedBlockId`, `pendingNextFocus`, `isNoteEmpty`, `lastSaveError`. | §10 |
| RD-012 | Debounce shell/pure boundary | Pure `computeNextFireAt({ lastEditAt, lastSaveAt, debounceMs, nowMs })`; impure shell calls `setTimeout`. The reducer never schedules timers; emits `'cancel-idle-timer'` / `'trigger-idle-save'` commands. | §12 |
| RD-013 | Brand-type construction at UI boundary | UI sends raw `string`/`number` over Tauri commands. Rust constructs `Body`, `BlockContent`, `BlockId`, `Timestamp`, `NoteId` via Smart Constructors. | §11 |
| RD-014 | New Note button enable matrix | `idle` enabled; `editing` enabled; `saving` enabled; `switching` disabled; `save-failed` enabled. | REQ-EDIT-033 |
| RD-015 | Same-Note Block move ≠ switch | `EditingSessionTransitions.refocusBlockSameNote` keeps `editing`; idle timer continues; no save commands fired. | REQ-EDIT-017; REQ-EDIT-018 |
| RD-016 | `tauriEditorAdapter.ts` vs `editorStateChannel.ts` split | OUTBOUND vs INBOUND only. No overlap. Phase 5 audit greps `invoke` only in adapter, `listen` only in channel. | verification-architecture.md §2 |
| RD-017 | `EditorCommand` discriminated union | 16-variant union matching the new block-based contract. See verification-architecture.md §10. | verification-architecture.md §10 |
| RD-018 | `SwitchError.pendingNextFocus` propagation | The Cancel button restores focus to the prior `focusedBlockId`. `pendingNextFocus = { noteId, blockId }` is rendered as a visual "queued switch" cue but never edited by the UI. | EC-EDIT-014 |
| RD-019 | Slash-menu local state | Slash-menu open/close, query string, and selected index are local `$state` in the impure shell only. They never enter the reducer or the snapshot. | REQ-EDIT-010; NFR-EDIT-008 |
| RD-020 | Drag preview local state | The DnD preview node is local DOM owned by the impure shell. The pure reducer accepts only the final `MoveBlock` command via the dispatch path. | REQ-EDIT-011 |

---

## 10. Domain ↔ UI State Synchronization

This section documents the inbound channel and the wire-format DTO between the Rust domain and the TypeScript UI.

### Outbound commands (TypeScript → Rust)

`EditorIpcAdapter` outbound methods (one per `EditorCommand` variant — see §10 of `verification-architecture.md`):

- `adapter.dispatchFocusBlock(noteId: string, blockId: string, issuedAt: string): Promise<void>`
- `adapter.dispatchEditBlockContent(noteId: string, blockId: string, content: string, issuedAt: string): Promise<void>`
- `adapter.dispatchInsertBlockAfter(noteId: string, prevBlockId: string, type: BlockType, content: string, issuedAt: string): Promise<void>`
- `adapter.dispatchInsertBlockAtBeginning(noteId: string, type: BlockType, content: string, issuedAt: string): Promise<void>`
- `adapter.dispatchRemoveBlock(noteId: string, blockId: string, issuedAt: string): Promise<void>`
- `adapter.dispatchMergeBlocks(noteId: string, blockId: string, issuedAt: string): Promise<void>`
- `adapter.dispatchSplitBlock(noteId: string, blockId: string, offset: number, issuedAt: string): Promise<void>`
- `adapter.dispatchChangeBlockType(noteId: string, blockId: string, newType: BlockType, issuedAt: string): Promise<void>`
- `adapter.dispatchMoveBlock(noteId: string, blockId: string, toIndex: number, issuedAt: string): Promise<void>`
- `adapter.dispatchTriggerIdleSave(noteId: string, source: 'capture-idle', issuedAt: string): Promise<void>`
- `adapter.dispatchTriggerBlurSave(noteId: string, source: 'capture-blur', issuedAt: string): Promise<void>`
- `adapter.dispatchCopyNoteBody(noteId: string, issuedAt: string): Promise<void>`
- `adapter.dispatchRequestNewNote(source: 'explicit-button' | 'ctrl-N', issuedAt: string): Promise<void>`
- `adapter.dispatchRetrySave(noteId: string, issuedAt: string): Promise<void>`
- `adapter.dispatchDiscardCurrentSession(noteId: string, issuedAt: string): Promise<void>`
- `adapter.dispatchCancelSwitch(noteId: string, issuedAt: string): Promise<void>`

All `issuedAt` values are ISO-8601 strings generated by the impure shell. Pure-tier modules never call `new Date()` or `Date.now()`.

### Inbound state updates (Rust → TypeScript)

The Rust backend emits `editing_session_state_changed` whenever `EditingSessionState` transitions. The payload shape is `{ state: EditingSessionStateDto }`. The DTO carries:

```typescript
type EditingSessionStateDto =
  | { status: 'idle' }
  | {
      status: 'editing';
      currentNoteId: string;
      focusedBlockId: string | null;
      isDirty: boolean;
      isNoteEmpty: boolean;
      lastSaveResult: 'success' | 'failed' | null;
    }
  | { status: 'saving'; currentNoteId: string; isNoteEmpty: boolean }
  | {
      status: 'switching';
      currentNoteId: string;
      pendingNextFocus: { noteId: string; blockId: string };
      isNoteEmpty: boolean;
    }
  | {
      status: 'save-failed';
      currentNoteId: string;
      focusedBlockId: string | null;
      pendingNextFocus: { noteId: string; blockId: string } | null;
      lastSaveError: SaveError;
      isNoteEmpty: boolean;
    };
```

`editorStateChannel.ts` implements `subscribeToState(handler: (state: EditingSessionStateDto) => void): () => void` by calling `@tauri-apps/api/event listen('editing_session_state_changed', ...)` and returning an unlisten cleanup. This module is the sole inbound channel; `tauriEditorAdapter.ts` handles outbound `invoke(...)` only.

The impure shell stores the latest snapshot in a `$state` and feeds it through `editorReducer({ kind: 'DomainSnapshotReceived', snapshot })`.

### Test contract for integration tests

Integration tests inject a hand-rolled mock `EditorIpcAdapter` exposing `subscribe(callback)` / `emit(state)` and `vi.fn()` for every outbound dispatch method. No integration test calls real `invoke()`.

---

## 11. Brand Type Construction Contracts

Per `ui-fields.md §重要設計前提` and `shared/value-objects.ts`: `NoteId`, `BlockId`, `BlockContent`, `Body`, `Tag`, `Frontmatter`, `Timestamp`, `VaultPath` are **not constructible in TypeScript** (Brand + unique symbol). The UI sends raw `string` / `number` values over Tauri; Rust constructs branded types via `try_new_*`.

### Command wire-format types

| Command field | Type at UI boundary | Notes |
|---|---|---|
| `noteId` | `string` | From `EditorViewState.currentNoteId` |
| `blockId` | `string` | From `EditorViewState.focusedBlockId` or hit-tested DOM node |
| `content` (EditBlockContent / InsertBlock) | `string` | Raw text; Rust runs `BlockContentSmartCtor` |
| `type` (InsertBlock / ChangeBlockType) | `BlockType` literal union | One of the 9 literals in `value-objects.ts` |
| `offset` (SplitBlock) | `number` | Caret index from `Selection.anchorOffset` |
| `toIndex` (MoveBlock) | `number` | 0-based destination index |
| `issuedAt` | `string` | ISO-8601 generated by impure shell |
| `source` (RequestNewNote) | `'explicit-button' | 'ctrl-N'` | Literal union |

### Predicates at the predicate boundary

`canCopy(view: EditorViewState): boolean` reads `view.isNoteEmpty` (already a `boolean` from the DTO) and `view.status` (literal union). It does NOT operate on branded `Body` / `BlockContent` values.

### Brand IDs in `EditorViewState`

The following appear as opaque `string`-typed fields inside `EditorViewState`:
- `currentNoteId: string | null`
- `focusedBlockId: string | null`
- `pendingNextFocus: { noteId: string; blockId: string } | null`

No `Body`, `Timestamp`, or `BlockContent` brand types are constructed in the TypeScript editor.

---

## 12. Debounce Contract

### Pure function signature

`debounceSchedule.computeNextFireAt({ lastEditAt: number, lastSaveAt: number, debounceMs: number, nowMs: number }): { shouldFire: boolean, fireAt: number | null }`

- `shouldFire === true` iff `lastEditAt + debounceMs <= nowMs` AND no save has occurred since the last edit.
- `fireAt` is the absolute ms timestamp the timer should fire, or `null`.
- `nowMs` is supplied by the caller; the function never calls `Date.now()`.

`debounceSchedule.shouldFireIdleSave(editTimestamps: readonly number[], lastSaveTimestamp: number, debounceMs: number, nowMs: number): boolean` — companion predicate for property tests.

### Shell pattern

On each block-edit dispatch (`EditBlockContent`, `InsertBlock`, `RemoveBlock`, `MergeBlocks`, `SplitBlock`, `ChangeBlockType`, `MoveBlock`):
1. The shell calls `timerModule.cancelIdleSave(currentHandle)`.
2. The shell computes `{ fireAt } = computeNextFireAt({ lastEditAt, lastSaveAt, debounceMs: IDLE_SAVE_DEBOUNCE_MS, nowMs: clock.now() })`.
3. If `fireAt !== null`, the shell calls `timerModule.scheduleIdleSave(fireAt - clock.now(), () => dispatch(TriggerIdleSave))`.
4. The shell stores only `lastEditTimestamp`.

### Property test model

PROP-EDIT-003 / PROP-EDIT-004 use `shouldFireIdleSave` to enumerate boundary cases.

---

## 13. Requirement and Edge Case Index

### Requirements (REQ-EDIT-XXX)

| ID | Summary |
|---|---|
| REQ-EDIT-001 | Block focus dispatches FocusBlock; focusedBlockId mirrored from snapshot |
| REQ-EDIT-002 | focusedBlockId is read-only mirror; reducer authors no values |
| REQ-EDIT-003 | EditBlockContent dispatched per input event in the focused Block |
| REQ-EDIT-004 | isDirty reset and idle timer cancelled after successful save |
| REQ-EDIT-005 | Copy disabled when isNoteEmpty=true (NoteOps.isEmpty) |
| REQ-EDIT-006 | Enter at end of block dispatches InsertBlock (paragraph) |
| REQ-EDIT-007 | Enter mid-block dispatches SplitBlock with caret offset |
| REQ-EDIT-008 | Backspace at offset 0 of non-first block dispatches MergeBlocks |
| REQ-EDIT-009 | Empty-block Backspace/Delete dispatches RemoveBlock (gated against last block) |
| REQ-EDIT-010 | Slash menu / Markdown shortcut dispatches ChangeBlockType |
| REQ-EDIT-011 | Drag / Alt+Shift+Up/Down dispatches MoveBlock |
| REQ-EDIT-012 | Idle debounce timer (IDLE_SAVE_DEBOUNCE_MS=2000) |
| REQ-EDIT-013 | Idle timer cancelled after successful save |
| REQ-EDIT-014 | All-blocks blur fires TriggerBlurSave (capture-blur) |
| REQ-EDIT-015 | Blur and idle do not both fire for the same dirty interval |
| REQ-EDIT-016 | Blur does not fire while saving / switching |
| REQ-EDIT-017 | Same-note block focus does not begin a switch |
| REQ-EDIT-018 | Idle timer continues across same-note block moves |
| REQ-EDIT-019 | Idle state: editor collapsed |
| REQ-EDIT-020 | Editing state: focused block editable, dirty indicator |
| REQ-EDIT-021 | Saving state: spinner, blocks remain editable, New Note enabled |
| REQ-EDIT-022 | Switching state: blocks locked, Copy and New Note disabled |
| REQ-EDIT-023 | Save-failed state: banner shown, blocks editable, Copy disabled, New Note enabled |
| REQ-EDIT-024 | EditingSessionState mutations come only from domain via inbound channel |
| REQ-EDIT-025 | Banner rendered only in save-failed |
| REQ-EDIT-026 | Banner message derived from SaveError.kind per exact mapping |
| REQ-EDIT-027 | Retry button dispatches RetrySave |
| REQ-EDIT-028 | Discard button dispatches DiscardCurrentSession |
| REQ-EDIT-029 | Cancel button dispatches CancelSwitch (restores prior focusedBlockId) |
| REQ-EDIT-030 | Banner styled with Deep Shadow and orange accent |
| REQ-EDIT-031 | Copy button dispatches CopyNoteBody when isNoteEmpty=false |
| REQ-EDIT-032 | Copy button disabled state matrix (5 statuses × isNoteEmpty) |
| REQ-EDIT-033 | New Note button dispatches RequestNewNote(source: 'explicit-button'); enable matrix for all 5 states |
| REQ-EDIT-034 | Ctrl+N / Cmd+N dispatches RequestNewNote(source: 'ctrl-N'); listener scoped to editor pane root |
| REQ-EDIT-035 | New Note while editing+dirty: blur-save first; save-failed: direct dispatch |
| REQ-EDIT-036 | NewNoteAutoCreated auto-focuses firstBlockId via $effect |
| REQ-EDIT-037 | Every save command carries explicit source ∈ {capture-idle, capture-blur} |
| REQ-EDIT-038 | Block validation error display (BlockOperationError / BlockContentError / SaveValidationError) |

### Edge cases (EC-EDIT-XXX)

| ID | Summary |
|---|---|
| EC-EDIT-001 | Rapid typing burst >10s: only one save fires |
| EC-EDIT-002 | All-blocks blur during in-flight save: no duplicate TriggerBlurSave |
| EC-EDIT-003 | Save fails while user keeps typing: blocks remain editable, banner persists |
| EC-EDIT-004 | Discard mid-flight: deferred to domain |
| EC-EDIT-005 | Switch to another note via Block focus while dirty: switching path |
| EC-EDIT-006 | Same-note block move: focusedBlockId update only, no flush |
| EC-EDIT-007 | Empty note → non-empty (Copy enable transition) |
| EC-EDIT-008 | Ctrl+N pressed while save-failed: direct RequestNewNote dispatch |
| EC-EDIT-009 | Idle timer running across OS sleep: timer fires on resume |
| EC-EDIT-010 | New Note attempted while saving: button enabled, domain queues |
| EC-EDIT-011 | Backspace at start of first block: UI elides dispatch |
| EC-EDIT-012 | SplitBlock vs InsertBlock: classifier returns 'insert' at end-of-block |
| EC-EDIT-013 | Unknown Markdown shortcut prefix: no ChangeBlockType, normal EditBlockContent |
| EC-EDIT-014 | SwitchError.pendingNextFocus: Cancel restores prior focusedBlockId |

---

## 14. Migration Notes from Sprint 1–6

The previous (Sprint 1–6) `ui-editor` spec was anchored on a single textarea + `EditNoteBody` model. This Sprint 7 respec replaces that surface with the block-based contract introduced on `feature/inplace-edit-migration`. The substantive deltas:

- `EditNoteBody` → 8 block-operation commands + `FocusBlock` (REQ-EDIT-001..011).
- `NoteBodyEdited` Internal Event → 9 block-level Internal Events (`BlockFocused`, `BlockBlurred`, `EditorBlurredAllBlocks`, `BlockContentEdited`, `BlockInserted`, `BlockRemoved`, `BlocksMerged`, `BlockSplit`, `BlockTypeChanged`, `BlockMoved`).
- `EditingState.focusedBlockId` and `EditingSessionTransitions.refocusBlockSameNote` become first-class spec concepts (REQ-EDIT-001 / 017 / 018).
- `pendingNextNoteId` → `pendingNextFocus: { noteId, blockId }` (capture/states.ts L14).
- `Body.isEmptyAfterTrim` → `note.isEmpty()` mirrored as `EditorViewState.isNoteEmpty` (RD-006).
- New `BlockType` literal union (`paragraph | heading-1..3 | bullet | numbered | code | quote | divider`) drives slash menu and Markdown shortcut decisions (REQ-EDIT-010).
- `serializeBlocksToMarkdown(note.blocks)` is the source of `body` for `SaveNoteRequested` / `bodyForClipboard`; the UI never re-implements serialisation.
- `HydrationFailureReason` gains `'block-parse'`; `ui-editor` defers Hydration to `app-startup`.
- `SwitchError.pendingNextFocus` carries `(noteId, blockId)`; the Cancel button restores the prior block (RD-018).

The numbering of REQ / EC IDs has been re-issued to match the new logical layout (REQ-EDIT-001..038, EC-EDIT-001..014). Prior IDs are not preserved across the respec — implementation, tests, contracts, and Phase 5 audit artefacts will be re-keyed during Sprint 7 TDD.

---
