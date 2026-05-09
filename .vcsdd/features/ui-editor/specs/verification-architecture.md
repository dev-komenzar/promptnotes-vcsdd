---
coherence:
  node_id: "design:ui-editor-verification"
  type: design
  name: "ui-editor 検証アーキテクチャ（純粋性境界・証明義務、block-based）"
  depends_on:
    - id: "req:ui-editor"
      relation: derives_from
    - id: "design:aggregates"
      relation: derives_from
    - id: "design:type-contracts"
      relation: derives_from
  modules:
    - "ui-editor"
  source_files:
    - "promptnotes/src/lib/editor/__tests__"
---

# Verification Architecture: ui-editor (Block-based)

**Feature**: `ui-editor`
**Phase**: 1b
**Mode**: strict
**Language**: TypeScript (Svelte 5 + SvelteKit + Tauri 2 desktop)

**Source of truth**:
- `specs/behavioral-spec.md` (REQ-EDIT-001..038, EC-EDIT-001..014)
- `docs/domain/code/ts/src/shared/note.ts`, `shared/blocks.ts`, `shared/value-objects.ts`, `shared/events.ts`, `shared/errors.ts`
- `docs/domain/code/ts/src/capture/commands.ts`, `capture/internal-events.ts`, `capture/states.ts`, `capture/stages.ts`, `capture/workflows.ts`
- `docs/domain/aggregates.md` (Block Sub-entity, EditingSessionState)
- `docs/domain/workflows.md` (Workflow 2 / 3 / 6 / 8 / 10)

---

## 1. Purpose & Scope

This document defines the verification strategy for the block-based `ui-editor` feature. The feature is an orchestration-only UI layer that translates user events (block focus/blur, per-block input, Enter / Backspace at offset 0 / mid-block, slash menu, Markdown shortcut, drag/keyboard reorder, button clicks, Ctrl+N) into the typed `CaptureCommand` set for blocks, and reflects `EditingSessionState` transitions (including `focusedBlockId`) back into the Svelte component tree.

The verification strategy separates the deterministic pure core (block-level classifiers, debounce schedule, banner-message derivation, and the mirror reducer) from the effectful shell (Svelte components, contenteditable input, focus / drag listeners, timer scheduling, Tauri IPC adapters). All Tier 2 property tests target pure modules exclusively; DOM, IPC, and focus behaviours are covered by integration tests using vitest + jsdom + raw Svelte 5 mount API.

**State model note**: `EditingSessionState` is owned by the Rust domain. The TypeScript `editorReducer` is a **mirror reducer** producing `EditorViewState`. See `behavioral-spec.md §3.6a` and `§10`.

---

## 2. Purity Boundary Map

A module is **pure** if and only if its exported functions are deterministic, perform no I/O, and contain none of the following API calls.

**Canonical forbidden-API grep pattern** (Phase 5 purity audit):

```
Math\.random|crypto\.|performance\.|window\.|globalThis|self\.|document\.|navigator\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\.now|Date\(|new Date|\$state\b|\$effect\b|\$derived\b|import\.meta|invoke\(|@tauri-apps/api
```

Pure modules must also pass `tsc --strict --noUncheckedIndexedAccess`.

### Pure core modules

| Module | Layer | Exports | Forbidden APIs |
|---|---|---|---|
| `editorPredicates.ts` | pure | `canCopy(view: EditorViewState): boolean` — `false` for `status ∈ {'idle','switching','save-failed'}` regardless of `isNoteEmpty`; `!view.isNoteEmpty` for `status ∈ {'editing','saving'}`. `bannerMessageFor(error: SaveError): string \| null` — exhaustive switch over `SaveError` (`fs` × `FsError`, `validation` × `SaveValidationError`). `classifySource(triggerKind: 'idle' \| 'blur'): 'capture-idle' \| 'capture-blur'`. `splitOrInsert(offset: number, contentLength: number): 'split' \| 'insert'` — `'insert'` iff `offset === contentLength`. `classifyMarkdownPrefix(content: string): { newType: BlockType; trimmedContent: string } \| null` — pure prefix → BlockType mapping (`# ` → heading-1, `## ` → heading-2, `### ` → heading-3, `- ` / `* ` → bullet, `1. ` → numbered, `` ` `` `` ` `` `` ` `` → code, `> ` → quote, `---` → divider **only when `content === '---'` exactly**; any other string starting with `---` returns `null`). `classifyBackspaceAtZero(focusedIndex: number, blockCount: number): 'merge' \| 'remove-empty-noop' \| 'first-block-noop' \| 'normal-edit'`. MUST NOT import `@tauri-apps/api`. | All APIs in §2 canonical pattern |
| `editorReducer.ts` | pure | `editorReducer(state: EditorViewState, action: EditorAction): { state: EditorViewState, commands: ReadonlyArray<EditorCommand> }`. Total. `EditorViewState` mirrors `EditingSessionStateDto` (not the raw `EditingSessionState`) and contains `status`, `isDirty`, `currentNoteId`, `focusedBlockId`, `pendingNextFocus`, `isNoteEmpty`, `lastSaveError`, `lastSaveResult` (mirrored from the `editing` arm DTO field; null for all other statuses — see `behavioral-spec.md §3.6a`, `§10`, `§11`). `isDirty` and `focusedBlockId` transitions: `editing + BlockContentEdited → isDirty=true`; `saving + NoteFileSaved → isDirty=false`; `saving + NoteSaveFailed → isDirty=true` retained; `DomainSnapshotReceived { snapshot: S } → state mirrors per-variant fields of S` (see PROP-EDIT-040 for the per-variant field sets and absent-field defaults; for `save-failed` snapshots, `S.priorFocusedBlockId` is copied to `state.focusedBlockId`). The `commands` output carries save commands whose `source` field equals the `source` carried in the triggering action payload — the reducer never infers, transforms, or defaults `source`. PROP-EDIT-007 / 008 / 009 reference this signature. MUST NOT import `@tauri-apps/api`. | All APIs in §2 canonical pattern |
| `debounceSchedule.ts` | pure | `computeNextFireAt({ lastEditAt: number, lastSaveAt: number, debounceMs: number, nowMs: number }): { shouldFire: boolean, fireAt: number \| null }`. `shouldFireIdleSave(editTimestamps: readonly number[], lastSaveTimestamp: number, debounceMs: number, nowMs: number): boolean`. `nextFireAt(lastEditTimestamp: number, debounceMs: number): number`. The actual `setTimeout` call lives in the impure shell. Shell pattern: on each block-edit dispatch, the shell calls `cancelIdleSave(handle)` then `scheduleIdleSave(fireAt - clock.now(), callback)` based on `computeNextFireAt`. The shell stores only `lastEditTimestamp`. (ref: behavioral-spec.md §12) MUST NOT import `@tauri-apps/api`. | All APIs in §2 canonical pattern |

### Effectful shell modules

| Module | Layer | Reason |
|---|---|---|
| `EditorPanel.svelte` | impure | Svelte 5 component: uses `$state`, `$derived`, `$effect`. Owns the editor pane root. Renders the Block tree (one child component per Block). Attaches Ctrl+N keyboard listener to its root via `panelRoot.addEventListener('keydown', ...)`. Reacts to `EditorViewState.focusedBlockId` changes via `$effect` and calls `element.focus()` on the matching Block element. Holds a local `$state currentBlockError: { blockId: string; error: { kind: string; max?: number } } \| null` (impure shell only; NOT part of `EditorViewState`) to surface Promise-rejection-driven block validation errors per REQ-EDIT-038 (RD-022). The rendered block list is `$derived(viewState.blocks)` — `blocks` is owned by `EditorViewState` (mirrored from DTO when present, falling back to current state when absent per RD-021). |
| `BlockElement.svelte` | impure | Svelte 5 component: contenteditable element for one Block. Handles per-block `oninput` / `onkeydown` (Enter / Backspace / `/`) / `onfocusin` / `onfocusout` events, dispatching the matching `EditorAction` to the parent. Visual style varies by `block.type`. Slash-menu DOM is mounted/unmounted as a child. |
| `SaveFailureBanner.svelte` | impure | Svelte 5 component: renders conditional DOM keyed on `EditorViewState.status === 'save-failed'`. Owns Retry / Discard / Cancel click handlers. |
| `SlashMenu.svelte` | impure | Svelte 5 component: floating menu over a Block. Owns local `$state` for query string and selected index. On selection dispatches the corresponding `EditorAction` (`InsertBlock` for divider, `ChangeBlockType` for heading/bullet/etc.). |
| `BlockDragHandle.svelte` | impure | Svelte 5 component: drag handle adornment. Listens to `dragstart` / `dragend` and emits `MoveBlock` actions on drop. |
| `timerModule.ts` | impure | `scheduleIdleSave(delayMs, callback): TimerHandle`, `cancelIdleSave(handle): void`. Wraps `setTimeout` / `clearTimeout`. Injected. |
| `tauriEditorAdapter.ts` | impure | **OUTBOUND only.** Concrete implementation of the outbound `EditorIpcAdapter` methods listed in `behavioral-spec.md §10`. Wraps Tauri `invoke(...)` for all 16 outbound methods. Does NOT call `@tauri-apps/api/event listen(...)` and does NOT subscribe to state events. (RD-016) |
| `editorStateChannel.ts` | impure | **INBOUND only.** Implements `subscribeToState(handler: (state: EditingSessionStateDto) => void): () => void` by calling `@tauri-apps/api/event listen('editing_session_state_changed', payload => handler(payload.payload.state))`. Does NOT call `invoke(...)`. (RD-016) |
| `keyboardListener.ts` | impure | Wraps `panelRoot.addEventListener('keydown', ...)` for the Ctrl+N / Cmd+N shortcut. Scoped to editor pane root; teardown via cleanup. |
| `clipboardAdapter.ts` | impure (legacy) | Reserved for future direct clipboard writes. In the block-based contract, `CopyNoteBody` is fulfilled by Rust (uses `bodyForClipboard` server-side). The TS adapter currently only forwards the IPC. |

---

## 3. Verification Tier Assignments

### Tier 0 — Type-level / static guarantees

- **Exhaustive switch on `EditorViewState.status`**: All switches in `editorReducer.ts`, `EditorPanel.svelte`, `BlockElement.svelte` over `status` include a `never` default branch.
- **Exhaustive switch on `SaveError.kind` and nested `FsError.kind` / `SaveValidationError.kind`**: `bannerMessageFor` is exhaustive; unhandled variants produce a compile-time `never` error.
- **Exhaustive switch on `BlockType`**: any UI mapping from `BlockType` to a Svelte component or CSS class includes a `never` default branch.
- **Exhaustive switch on `BlockOperationError.kind` and `BlockContentError.kind`**: the error-display pure helper enforces totality.
- **Branded `EditorCommandSaveSource`**: the `source` field on `'trigger-idle-save'` / `'trigger-blur-save'` is the literal union `'capture-idle' | 'capture-blur'`. Passing `'idle'`, `'blur'`, `'switch'`, `'manual'`, or any other string is a compile error.
- **`EditorAction` discriminated union**: `editorReducer.ts` accepts a discriminated union covering all UI-triggered actions: `BlockContentEdited`, `BlockInserted`, `BlockRemoved`, `BlocksMerged`, `BlockSplit`, `BlockTypeChanged`, `BlockMoved`, `BlockFocused`, `BlockBlurred`, `EditorBlurredAllBlocks`, `DomainSnapshotReceived`, plus the save-action set (`TriggerIdleSave`, `TriggerBlurSave`, `NoteFileSaved`, `NoteSaveFailed`, `RetrySave`, `DiscardCurrentSession`, `CancelSwitch`). `EditorBlurredAllBlocks` covers the all-blocks-blurred case (REQ-EDIT-014); there is no separate `BlurEvent` variant.
- **`EditorViewState` ≠ `EditingSessionStateDto`**: declared as separate types. The reducer returns `EditorViewState` only; no component constructs the DTO.
- **`EditorCommand` exhaustive-switch obligation in the impure shell**: every `EditorCommand` variant (§10) is handled via an exhaustive switch on `kind`. Adding a new variant without updating the switch is a compile error.

### Tier 1 — Pure unit tests (vitest, deterministic)

- `editorPredicates.test.ts`: example-based tests for every branch of `canCopy`, `bannerMessageFor`, `classifySource`, `splitOrInsert`, `classifyMarkdownPrefix`, `classifyBackspaceAtZero`.
- `editorReducer.test.ts`: example-based tests for every (status, action) pair from `aggregates.md §EditingSessionState` × the new block-level action union.
- `debounceSchedule.test.ts`: example-based boundary tests for `computeNextFireAt` and `shouldFireIdleSave`.

### Tier 2 — Property tests (fast-check, pure modules only)

- **PROP-EDIT-001** (`editorPredicates.ts`): For all `BlockType b` and content `c`, `splitOrInsert(c.length, c.length) === 'insert'` and for any `0 ≤ k < c.length`, `splitOrInsert(k, c.length) === 'split'`.
- **PROP-EDIT-002** (`editorReducer.ts`): Save-source equality — every `EditorCommand` of kind `'trigger-idle-save'` / `'trigger-blur-save'` produced by the reducer carries `source` drawn from `EditorCommandSaveSource = 'capture-idle' | 'capture-blur'`, and the value equals the `source` carried in the triggering action payload. (ref: shared/events.ts; behavioral-spec.md §9 RD-001)
- **PROP-EDIT-003** (`debounceSchedule.ts`): For any sequence of edit timestamps `{t1..tn}` with `tn + debounceMs ≤ nowMs` and no edit in `(tn, nowMs)`, `shouldFireIdleSave` returns `true` and `computeNextFireAt` returns `{ shouldFire: true, fireAt: tn + debounceMs }`.
- **PROP-EDIT-004** (`debounceSchedule.ts`): Blur-cancels-idle in the pure model — given `tb < ts`, the schedule reports the blur takes precedence; idle does not also fire.
- **PROP-EDIT-005** (`editorPredicates.ts`): Banner exhaustiveness — `bannerMessageFor` returns a non-empty string for every `{ kind: 'fs', reason: _ }` (5 `FsError` variants: `permission`, `disk-full`, `lock`, `not-found`, `unknown`) and `null` for every `{ kind: 'validation', reason: _ }`. Total; never throws; never returns `undefined`.
- **PROP-EDIT-006** (`editorPredicates.ts`): `canCopy` parity — for `status ∈ {'idle','switching','save-failed'}`, `canCopy === false` for any view; for `status ∈ {'editing','saving'}`, `canCopy === !view.isNoteEmpty`.
- **PROP-EDIT-007** (`editorReducer.ts`): Reducer totality — for every (status, action) pair, `editorReducer` returns `{ state: EditorViewState, commands: ReadonlyArray<EditorCommand> }` where `state.status` is one of the 5 enum values, `commands` is always `ReadonlyArray` (never `undefined`), and each element's `kind` is one of the 17 variants in §10 `EditorCommand` union (16 IPC-adapter variants + 1 local-effect variant `cancel-idle-timer`).
- **PROP-EDIT-008** (`editorReducer.ts`): Reducer purity — calling `editorReducer(state, action)` twice with deep-equal arguments produces deep-equal results.
- **PROP-EDIT-009** (`editorReducer.ts`): Source-absence corollary — the reducer never inserts `source` into a save `EditorCommand` not present in the action input. Subsumed by PROP-EDIT-002 (no separate test required); declared for completeness.
- **PROP-EDIT-010** (`editorPredicates.ts`): Markdown shortcut totality — `classifyMarkdownPrefix` returns `{ newType, trimmedContent }` for every recognised prefix and `null` otherwise; for unknown prefixes (e.g., `~~~`) returns `null` deterministically.
- **PROP-EDIT-011** (`editorPredicates.ts`): Backspace classifier coverage — `classifyBackspaceAtZero(0, blockCount)` returns `'first-block-noop'`; `classifyBackspaceAtZero(k, n)` for `0 < k < n` returns `'merge'`. Every `(k, n)` pair returns a defined enum member.
- **PROP-EDIT-040** (`editorReducer.ts`): DomainSnapshotReceived per-variant mirroring — for any `s` and any `S: EditingSessionStateDto`, `editorReducer(s, { kind: 'DomainSnapshotReceived', snapshot: S }).state.status === S.status` AND for every field `f` present in the `S.status` arm of the DTO union, `state[f] === S[f]`. For `save-failed` snapshots, `S.priorFocusedBlockId` is copied into `state.focusedBlockId`. For fields absent from the source variant, the reducer sets them to idle defaults (see §4 PROP-EDIT-040 for the full per-variant field sets and defaults table).

### Tier 3 — Branch coverage gate (@vitest/coverage-v8)

Replaces Stryker (not installed). Equivalent rigour via:
1. Tier 2 fast-check property tests (semantic-mutation resistance).
2. Branch coverage ≥ 95% on pure modules via `@vitest/coverage-v8`.

Scope:
- `promptnotes/src/lib/editor/editorPredicates.ts`
- `promptnotes/src/lib/editor/editorReducer.ts`
- `promptnotes/src/lib/editor/debounceSchedule.ts`

Exclude pattern: `**/__tests__/**, **/*.svelte`.

Run: `bun run test:dom -- --coverage` inside `promptnotes/`.

### Integration tier — vitest + jsdom + raw Svelte 5 mount API

Pattern follows `promptnotes/src/lib/ui/app-shell/__tests__/dom/AppShell.dom.vitest.ts` — using `import { mount, unmount, flushSync } from 'svelte'`, NOT `@testing-library/svelte`.

Files: `promptnotes/src/lib/editor/__tests__/*.dom.vitest.ts`

Notable responsibilities of the integration tier:
- Block tree DOM rendering: one element per Block, `block.type` → CSS class / tag mapping.
- Block focus: clicking a Block dispatches `FocusBlock`; `EditorViewState.focusedBlockId` mirroring sets DOM focus on the matching element.
- Per-block `oninput`: dispatches `EditBlockContent`.
- Enter at end-of-block dispatches `InsertBlock`; mid-block dispatches `SplitBlock` with caret offset.
- Backspace at offset 0 of non-first block dispatches `MergeBlocks`; first-block backspace dispatches nothing.
- Empty-block Backspace/Delete dispatches `RemoveBlock` (gated against last block).
- Slash menu open / select dispatches `ChangeBlockType` (or `InsertBlock` for divider).
- Markdown shortcut (`# ` etc.) dispatches `ChangeBlockType` and trims the prefix.
- Drag / Alt+Shift+Up dispatches `MoveBlock`.
- Same-note focus changes do NOT cancel idle timer or dispatch save commands.
- All-blocks blur dispatches `TriggerBlurSave` only when no follow-up focus into another Block of the same Note arrives.
- 5-state UI mapping (`idle`, `editing`, `saving`, `switching`, `save-failed`).
- Banner DOM presence keyed on `status === 'save-failed'`.
- Retry / Discard / Cancel button click dispatch counts.
- Cancel restores prior `focusedBlockId` (focus ring returns to original Block).
- Copy button `disabled` toggling on `isNoteEmpty`.
- New Note button enable matrix (5 statuses × disabled).
- Ctrl+N / Cmd+N: scoped to editor pane root, NOT `document`; preventDefault asserted.
- `vi.useFakeTimers()` debounce scenarios (REQ-EDIT-012, EC-EDIT-001).
- Inbound state update via mock `subscribeToState` callback + `flushSync()`.
- ARIA attribute assertions: `role`, `aria-disabled`, `aria-label`, `tabIndex`.

---

## 4. Proof Obligations

The table contains one `PROP-EDIT-XXX` entry for every REQ-EDIT-001..038 from Phase 1a. Where two requirements describe the same property from complementary angles, they are merged into a single PROP. Where a requirement is inherently integration-tier (DOM focus events, button click dispatch, ARIA attribute placement), `Required` is `false` and the integration test path is cited.

| PROP-ID | Requirement (REQ-EDIT-XXX) | Property Statement | Tier | Tool | Required | Pure-or-Shell |
|---|---|---|---|---|---|---|
| PROP-EDIT-001 | REQ-EDIT-006, REQ-EDIT-007, EC-EDIT-012 | `splitOrInsert(offset, contentLength)` returns `'insert'` iff `offset === contentLength`; otherwise `'split'`. Pure total function. | 2 | fast-check | true | pure |
| PROP-EDIT-002 | REQ-EDIT-037 | Every save `EditorCommand` (`'trigger-idle-save'` / `'trigger-blur-save'`) carries a `source` drawn from `'capture-idle' | 'capture-blur'`, equal to the triggering action's `source` payload. The reducer never invents `'idle'` / `'blur'` / `'switch'` / `'manual'`. | 2 | fast-check | true | pure |
| PROP-EDIT-003 | REQ-EDIT-012, EC-EDIT-001 | Given timestamps `{t1..tn}` with `tn + debounceMs ≤ nowMs` and no further edit in `(tn, nowMs)`, `shouldFireIdleSave` returns `true` and `computeNextFireAt` returns `{ shouldFire: true, fireAt: tn + debounceMs }`. For any edit within the debounce window, `shouldFireIdleSave` returns `false`. | 2 | fast-check | true | pure |
| PROP-EDIT-004 | REQ-EDIT-014, REQ-EDIT-015 | Blur-cancels-idle pure model — given `tb < ts`, the model reports the blur save takes precedence; idle MUST NOT also fire. | 2 | fast-check | true | pure |
| PROP-EDIT-005 | REQ-EDIT-025, REQ-EDIT-026 | `bannerMessageFor` returns a non-empty string for every `{ kind: 'fs', reason: _ }` (5 variants) and `null` for every `{ kind: 'validation', reason: _ }`. Total; never throws; never returns `undefined`. | 2 | fast-check + tsc exhaustive switch | true | pure |
| PROP-EDIT-006 | REQ-EDIT-005, REQ-EDIT-032, EC-EDIT-007 | For `status ∈ {'idle','switching','save-failed'}`, `canCopy(view) === false` for any view. For `status ∈ {'editing','saving'}`, `canCopy(view) === !view.isNoteEmpty`. | 2 | fast-check | true | pure |
| PROP-EDIT-007 | REQ-EDIT-019, REQ-EDIT-020, REQ-EDIT-021, REQ-EDIT-022, REQ-EDIT-023 | Reducer totality — for every (status, action) pair, `editorReducer(state, action)` returns `{ state: EditorViewState, commands: ReadonlyArray<EditorCommand> }` where `state.status` is one of the 5 enum values, `commands` is always `ReadonlyArray` (never `undefined`), and each element's `kind` is one of the 17 variants in §10 (16 IPC-adapter variants + 1 local-effect variant `cancel-idle-timer`). The function never throws. | 2 | fast-check | true | pure |
| PROP-EDIT-008 | REQ-EDIT-024 | Reducer purity — calling `editorReducer(state, action)` twice with deep-equal arguments produces deep-equal `{ state, commands }`. No `Date.now()`, no randomness, no global mutable state. | 2 | fast-check | true | pure |
| PROP-EDIT-009 | REQ-EDIT-037 | **Source-absence invariant** (corollary of PROP-EDIT-002; subsumed; no separate test required). The reducer never inserts a `source` into a save `EditorCommand` not present in the action input. | 2 | fast-check | false | pure |
| PROP-EDIT-010 | REQ-EDIT-010, EC-EDIT-013 | `classifyMarkdownPrefix` returns `{ newType, trimmedContent }` for every recognised prefix (`# `, `## `, `### `, `- `, `* `, `1. `, `` ` `` `` ` `` `` ` ``, `> `) and `null` for any other input. Deterministic. **Divider rule**: returns `{ newType: 'divider', trimmedContent: '' }` iff `content === '---'` exactly (no surrounding whitespace, no trailing characters). For any input beginning with `---` but not equal to `'---'` (e.g. `'---more'`, `'--- '`), returns `null`. | 2 | fast-check | true | pure |
| PROP-EDIT-011 | REQ-EDIT-008, EC-EDIT-011 | `classifyBackspaceAtZero(focusedIndex, blockCount)` returns `'first-block-noop'` iff `focusedIndex === 0`; returns `'merge'` for `0 < focusedIndex < blockCount`. Total over all valid `(k, n)`. | 2 | fast-check | true | pure |
| PROP-EDIT-012 | REQ-EDIT-013, REQ-EDIT-004 | After a `NoteFileSaved` action, `editorReducer` transitions the state such that `state.isDirty === false` and `commands` includes `{ kind: 'cancel-idle-timer' }`. The actual `clearTimeout` call happens in the impure shell. | 1 | vitest | true | pure |
| PROP-EDIT-013 | REQ-EDIT-016, EC-EDIT-002 | `editorReducer` applied to `(state_with_status_saving, { kind: 'EditorBlurredAllBlocks' })` returns no `'trigger-blur-save'` command. Likewise for `state_with_status_switching`. | 1 | vitest | true | pure |
| PROP-EDIT-014 | REQ-EDIT-001, REQ-EDIT-002 | For snapshots `S` of status `'editing'`: `editorReducer(s, { kind: 'DomainSnapshotReceived', snapshot: S }).state.focusedBlockId === S.focusedBlockId`. For snapshots `S` of status `'save-failed'`: `state.focusedBlockId === S.priorFocusedBlockId` (the DTO-only projection field; see `behavioral-spec.md §10`). The reducer never writes a value to `focusedBlockId` other than via `DomainSnapshotReceived`. | 1 | vitest | true | pure |
| PROP-EDIT-015 | REQ-EDIT-017, REQ-EDIT-018 | Same-note `BlockFocused` action: the reducer keeps `state.status === 'editing'` and emits no save / cancel-timer commands. (Tested as a Tier 1 example covering the canonical refocusBlockSameNote case.) | 1 | vitest | true | pure |
| PROP-EDIT-016 | REQ-EDIT-027 | Activating Retry in `status === 'save-failed'` dispatches `RetrySave` exactly once via the mock adapter. The banner DOM disappears when the mock adapter emits `status === 'saving'`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `save-failure-banner.dom.vitest.ts` |
| PROP-EDIT-017 | REQ-EDIT-028 | Activating Discard dispatches `DiscardCurrentSession` exactly once. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `save-failure-banner.dom.vitest.ts` |
| PROP-EDIT-018 | REQ-EDIT-029 | Activating Cancel dispatches `CancelSwitch` exactly once. After `editing` snapshot returns, the prior `focusedBlockId` regains DOM focus. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `save-failure-banner.dom.vitest.ts` |
| PROP-EDIT-019 | REQ-EDIT-030, NFR-EDIT-007 | Banner Svelte source contains the literal 5-layer Deep Shadow string; left accent uses `#dd5b00`; `border-radius: 8px`. Buttons use `font-size: 15px; font-weight: 600`. | Integration + grep | vitest grep + DESIGN.md manual review | false | shell — `save-failure-banner.dom.vitest.ts` |
| PROP-EDIT-020 | REQ-EDIT-031 | Copy button click dispatches `CopyNoteBody` with the active `noteId` when `canCopy === true`; no dispatch when `false`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-panel.dom.vitest.ts` |
| PROP-EDIT-021 | REQ-EDIT-032 | Copy button has `disabled` and `aria-disabled="true"` in `idle`, `switching`, `save-failed` states and when `isNoteEmpty === true`. Disabled text colour `#a39e98` asserted via grep. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-panel.dom.vitest.ts` |
| PROP-EDIT-022 | REQ-EDIT-033 | "+ 新規" click dispatches `RequestNewNote { source: 'explicit-button' }`. Disabled only in `switching`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-panel.dom.vitest.ts` |
| PROP-EDIT-023 | REQ-EDIT-034, EC-EDIT-007 | Keydown on the editor pane root with `(ctrlKey || metaKey) && key.toLowerCase() === 'n'` dispatches `RequestNewNote { source: 'ctrl-N' }`, calls `event.preventDefault()`, and does not insert `'n'` into any Block. No dispatch when keydown fires on `document` directly. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-panel.dom.vitest.ts` |
| PROP-EDIT-024a | REQ-EDIT-035 (`editing` sub-case) | `RequestNewNote` while `editing` AND `isDirty === true` dispatches `TriggerBlurSave { source: 'capture-blur' }` first; `RequestNewNote` is not dispatched until the snapshot leaves `saving`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-panel.dom.vitest.ts` |
| PROP-EDIT-024b | REQ-EDIT-035, EC-EDIT-008 (`save-failed` sub-case) | `RequestNewNote` while `save-failed` is dispatched directly without preceding `TriggerBlurSave`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-panel.dom.vitest.ts` |
| PROP-EDIT-024c | REQ-EDIT-035 (`editing + isDirty === false` sub-case) | `RequestNewNote` while `editing` AND `isDirty === false` is dispatched directly without preceding `TriggerBlurSave`. No save IPC call is made. This branch is distinct from PROP-EDIT-024a (which gates on `isDirty === true`). | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-panel.dom.vitest.ts` |
| PROP-EDIT-025 | REQ-EDIT-001, REQ-EDIT-003 | Clicking a Block dispatches `FocusBlock`; subsequent `oninput` events dispatch `EditBlockContent` with the full current Block content. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `block-element.dom.vitest.ts` |
| PROP-EDIT-026 | REQ-EDIT-006 | Enter at the end of a non-empty Block dispatches `InsertBlock { atBeginning: false, prevBlockId: focusedBlockId, type: 'paragraph', content: '' }`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `block-element.dom.vitest.ts` |
| PROP-EDIT-027 | REQ-EDIT-007 | Enter mid-block dispatches `SplitBlock { offset }` carrying the caret offset from `Selection.anchorOffset`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `block-element.dom.vitest.ts` |
| PROP-EDIT-028 | REQ-EDIT-008, EC-EDIT-011 | Backspace at offset 0 of a non-first Block dispatches `MergeBlocks`; first-Block dispatches nothing. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `block-element.dom.vitest.ts` |
| PROP-EDIT-029 | REQ-EDIT-009 | Backspace/Delete on an empty non-last Block dispatches `RemoveBlock`. Backspace/Delete on the only Block dispatches nothing. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `block-element.dom.vitest.ts` |
| PROP-EDIT-030 | REQ-EDIT-010, EC-EDIT-013 | Selecting "Heading 1" in the slash menu dispatches `ChangeBlockType { newType: 'heading-1' }`. Typing `# ` at the start of an empty paragraph dispatches `ChangeBlockType` and trims the prefix. Unknown prefix typed at start does not dispatch `ChangeBlockType`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `slash-menu.dom.vitest.ts` |
| PROP-EDIT-031 | REQ-EDIT-011 | Drop on a new vertical position OR Alt+Shift+Up/Down dispatches `MoveBlock { toIndex }` within `[0, blocks.length)`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `block-drag-handle.dom.vitest.ts` |
| PROP-EDIT-032 | REQ-EDIT-014, REQ-EDIT-016, EC-EDIT-002, EC-EDIT-006 | All-blocks blur while `editing` AND `isDirty === true` dispatches `TriggerBlurSave` and cancels the idle timer. Blur followed by a focus into another Block of the same Note within the same tick does NOT dispatch. Blur while `saving` / `switching` dispatches nothing. | Integration | vitest + jsdom + Svelte 5 mount + `vi.useFakeTimers()` | false | shell — `editor-panel.dom.vitest.ts` |
| PROP-EDIT-033 | REQ-EDIT-012, REQ-EDIT-013, EC-EDIT-001 | With `vi.useFakeTimers()`: after the last block-edit dispatch, advancing time by `IDLE_SAVE_DEBOUNCE_MS` (2000ms) fires `TriggerIdleSave` exactly once. Advancing by 1999ms fires nothing. Continuous bursts reset the timer with no intermediate fire. After `NoteFileSaved` the impure shell calls `cancelIdleSave`. | Integration | vitest + jsdom + Svelte 5 mount + `vi.useFakeTimers()` | false | shell — `editor-panel.dom.vitest.ts` |
| PROP-EDIT-034 | REQ-EDIT-019 | In `status === 'idle'`: Block tree is `contenteditable="false"` or absent; Copy button has `disabled` and `aria-disabled="true"`; placeholder text present; New Note button enabled. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-session-state.dom.vitest.ts` |
| PROP-EDIT-035 | REQ-EDIT-020 | In `status === 'editing'` with `isDirty === true`: focused Block is contenteditable and carries focus ring; dirty indicator present; Copy enabled when `isNoteEmpty === false`; no banner. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-session-state.dom.vitest.ts` |
| PROP-EDIT-036 | REQ-EDIT-021 | In `status === 'saving'`: save indicator with `aria-label` containing "保存中"; Block tree remains contenteditable; `role="status"`; New Note enabled. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-session-state.dom.vitest.ts` |
| PROP-EDIT-037 | REQ-EDIT-022 | In `status === 'switching'`: Block tree `contenteditable="false"` and `aria-disabled="true"`; Copy disabled; New Note disabled; visible "queued switch" cue (rendered from `pendingNextFocus`). | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-session-state.dom.vitest.ts` |
| PROP-EDIT-038 | REQ-EDIT-023 | In `status === 'save-failed'`: banner visible (`data-testid="save-failure-banner"`); Block tree remains editable; Copy disabled; New Note enabled. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-session-state.dom.vitest.ts` |
| PROP-EDIT-039 | REQ-EDIT-024 | No `ui-editor` component source mutates `EditingSessionState` or `EditorViewState` outside `editorReducer`. Verified by `tsc --strict` and `grep -r "EditingSessionState\|EditorViewState" src/lib/editor/*.svelte` showing no assignment patterns. | 0 | `tsc --strict` + grep audit | true | pure/shell boundary |
| PROP-EDIT-040 | REQ-EDIT-002, REQ-EDIT-024 | `DomainSnapshotReceived` per-variant mirroring: for any `s` and any `S: EditingSessionStateDto`, `editorReducer(s, { kind: 'DomainSnapshotReceived', snapshot: S }).state.status === S.status`, AND for every field `f` present in the `S.status` arm of the DTO union, `state[f] === S[f]`. Per-variant field sets (from `behavioral-spec.md §10`): `'idle'` → only `status`; `'editing'` → `status`, `currentNoteId`, `focusedBlockId`, `isDirty`, `isNoteEmpty`, `lastSaveResult`; `'saving'` → `status`, `currentNoteId`, `isNoteEmpty`; `'switching'` → `status`, `currentNoteId`, `pendingNextFocus`, `isNoteEmpty`; `'save-failed'` → `status`, `currentNoteId`, `priorFocusedBlockId`, `pendingNextFocus`, `lastSaveError`, `isNoteEmpty`. For fields absent from the source variant, the reducer sets them to their idle default: `currentNoteId → null`, `focusedBlockId → null`, `priorFocusedBlockId → null`, `isDirty → false`, `isNoteEmpty → true`, `pendingNextFocus → null`, `lastSaveError → null`, `lastSaveResult → null`. | 2 | fast-check + vitest | true | pure |
| PROP-EDIT-041 | REQ-EDIT-025 | The save-failure banner is in the DOM iff `status === 'save-failed'`. Banner root has `role="alert"` and `data-testid="save-failure-banner"`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `save-failure-banner.dom.vitest.ts` |
| PROP-EDIT-042 | REQ-EDIT-026 | `bannerMessageFor({ kind: 'fs', reason: { kind: 'permission' } })` returns `'保存に失敗しました（権限不足）'`. Equivalent assertions for `disk-full`, `lock`, `not-found`, `unknown`. `bannerMessageFor({ kind: 'validation', ... })` returns `null`. Switch is exhaustive. | 1 | vitest | true | pure |
| PROP-EDIT-043 | REQ-EDIT-038, REQ-EDIT-026 | Inline error display: `BlockOperationError.kind === 'incompatible-content-for-type'` shows the corresponding hint near the affected Block; `BlockContentError.kind === 'control-character'` likewise. `SaveValidationError.invariant-violated` calls `console.error` and renders no inline UI. `SaveValidationError.empty-body-on-idle` results in successor `EditorViewState` with `status === 'editing'`, `isDirty === false`, `isNoteEmpty === true`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-validation.dom.vitest.ts` |
| PROP-EDIT-044 | NFR-EDIT-001, NFR-EDIT-002 | All interactive elements (focused Block, Copy, New Note, Retry, Discard, Cancel) have non-negative `tabIndex` when enabled. Saving indicator has `role="status"`. Banner has `role="alert"`. `aria-disabled="true"` on disabled buttons. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-accessibility.dom.vitest.ts` |
| PROP-EDIT-045 | NFR-EDIT-003, NFR-EDIT-004, EC-EDIT-009 | Idle debounce timer uses a single handle per edit cycle (spy on `timerModule.scheduleIdleSave`). `oninput` handler completes synchronously without `await`. OS sleep/resume covered only by the timer mock test (PROP-EDIT-033). | Integration | vitest + jsdom + Svelte 5 mount + `vi.useFakeTimers()` | false | shell — `editor-panel.dom.vitest.ts` |
| PROP-EDIT-046 | NFR-EDIT-005, NFR-EDIT-006, NFR-EDIT-007 | All hex / rgba / px values are members of DESIGN.md §10 Token Reference. No `font-weight` outside `{400,500,600,700}`. `code` Block uses monospace 13px. Heading-1/2/3 sizes match DESIGN.md §3. Verified via DESIGN.md manual checklist + grep. | Manual review + grep | DESIGN.md checklist; `grep -r "font-weight" src/lib/editor/` | false | shell — manual review |
| PROP-EDIT-047 | NFR-EDIT-008 | No `import { writable } from 'svelte/store'` in any `ui-editor` source for editor-internal state. Local state uses `$state(...)`. `EditingSessionState` is not mutated inside any component. Verified by grep + `tsc --strict`. | 0 | grep audit + `tsc --strict` | true | pure/shell boundary |
| PROP-EDIT-048 | EC-EDIT-003 | In `status === 'save-failed'`, continued input continues to dispatch `EditBlockContent`; banner remains visible; idle debounce continues to run; `isDirty` remains `true`. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-session-state.dom.vitest.ts` |
| PROP-EDIT-049 | EC-EDIT-004 | `DiscardCurrentSession` from the banner propagates to the mock adapter regardless of in-flight save status; UI does not cancel the IPC. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `save-failure-banner.dom.vitest.ts` |
| PROP-EDIT-050 | EC-EDIT-005, EC-EDIT-014 | In `status === 'switching'` (driven by mock adapter): Block tree locked; New Note disabled; idle timer cancelled. When snapshot transitions to `editing(B, bX)`, the new Block tree mounts and the focused Block matches `bX`. On `save-failed` with `pendingNextFocus`, Cancel returns to the block identified by `priorFocusedBlockId` on the `save-failed` DTO arm. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-session-state.dom.vitest.ts` |
| PROP-EDIT-051 | REQ-EDIT-036 | Mock adapter emits a snapshot for a freshly-created note (`currentNoteId === <new>`, `focusedBlockId === firstBlockId`). The `$effect` reacting to `focusedBlockId` calls `element.focus()` on the matching Block element exactly once. | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `editor-panel.dom.vitest.ts` |

---

## 5. Tooling Map

### Pure unit tests

Path pattern: `promptnotes/src/lib/editor/__tests__/*.test.ts`

Files:
- `editorPredicates.test.ts` — Tier 1 (PROP-EDIT-005 / 010 / 011 / 042; example-based covers for `splitOrInsert`, `classifyMarkdownPrefix`, `classifyBackspaceAtZero`, `bannerMessageFor`)
- `editorReducer.test.ts` — Tier 1 (PROP-EDIT-007 example cross-product, PROP-EDIT-008, PROP-EDIT-012, PROP-EDIT-013, PROP-EDIT-014, PROP-EDIT-015)
- `debounceSchedule.test.ts` — Tier 1 (PROP-EDIT-003 / 004 boundary cases)

Run command: `bun run test` inside `promptnotes/`.

### Property tests (fast-check)

Path pattern: `promptnotes/src/lib/editor/__tests__/*.property.test.ts`

Files:
- `editorPredicates.property.test.ts` — PROP-EDIT-001, PROP-EDIT-005, PROP-EDIT-006, PROP-EDIT-010, PROP-EDIT-011
- `editorReducer.property.test.ts` — PROP-EDIT-002, PROP-EDIT-007, PROP-EDIT-008, PROP-EDIT-009, PROP-EDIT-040
- `debounceSchedule.property.test.ts` — PROP-EDIT-003, PROP-EDIT-004

Run command: `bun run test`.

### Component / integration tests (DOM tier)

Path pattern: `promptnotes/src/lib/editor/__tests__/*.dom.vitest.ts`

Pattern: vitest + jsdom + `mount`/`unmount`/`flushSync` + `vi.fn()` mock adapter (NO `@testing-library/svelte`).

Files:
- `editor-panel.dom.vitest.ts` — PROP-EDIT-020 .. 023, 024a, 024b, 024c, 032, 033, 045, 051
- `block-element.dom.vitest.ts` — PROP-EDIT-025 .. 029
- `slash-menu.dom.vitest.ts` — PROP-EDIT-030
- `block-drag-handle.dom.vitest.ts` — PROP-EDIT-031
- `editor-session-state.dom.vitest.ts` — PROP-EDIT-034 .. 038, 048, 050
- `save-failure-banner.dom.vitest.ts` — PROP-EDIT-016, 017, 018, 019, 041, 049
- `editor-validation.dom.vitest.ts` — PROP-EDIT-043
- `editor-accessibility.dom.vitest.ts` — PROP-EDIT-044

Run command: `bun run test:dom` inside `promptnotes/`.

### Branch coverage (Tier 3 replacement for Stryker)

Package: `@vitest/coverage-v8`. Scope: `editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts`. Exclude pattern: `**/__tests__/**, **/*.svelte`.

Run command: `bun run test:dom -- --coverage`.

Target: ≥ 95% branch coverage per file.

### Static / lint checks

- `tsc --noEmit --strict --noUncheckedIndexedAccess` inside `promptnotes/` — enforces Tier 0 exhaustive switch and state ownership.
- Purity audit grep (Phase 5): canonical pattern in §2 against the three pure modules — must return zero hits.
- Svelte 4 store audit: `grep -r "from 'svelte/store'" src/lib/editor/` — zero hits (PROP-EDIT-047).
- State mutation audit: `grep -r "EditingSessionState\|EditorViewState" src/lib/editor/*.svelte` — no assignment patterns (PROP-EDIT-039).
- Design-token manual review: DESIGN.md conformance applied to all `src/lib/editor/*.svelte` source.

---

## 6. Coverage Matrix

Every REQ-EDIT-001..038 and EC-EDIT-001..014 must appear below.

| ID | PROP-EDIT-XXX | Tier | Test path |
|---|---|---|---|
| REQ-EDIT-001 | PROP-EDIT-014 (pure), PROP-EDIT-025 (integration) | 1 + Integration | `editorReducer.test.ts`, `block-element.dom.vitest.ts` |
| REQ-EDIT-002 | PROP-EDIT-014, PROP-EDIT-040 | 1 + 2 | `editorReducer.test.ts`, `editorReducer.property.test.ts` |
| REQ-EDIT-003 | PROP-EDIT-025 | Integration | `block-element.dom.vitest.ts` |
| REQ-EDIT-004 | PROP-EDIT-012 | 1 | `editorReducer.test.ts` |
| REQ-EDIT-005 | PROP-EDIT-006 (pure), PROP-EDIT-021 (integration) | 2 + Integration | `editorPredicates.property.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-006 | PROP-EDIT-001 (pure), PROP-EDIT-026 (integration) | 2 + Integration | `editorPredicates.property.test.ts`, `block-element.dom.vitest.ts` |
| REQ-EDIT-007 | PROP-EDIT-001 (pure), PROP-EDIT-027 (integration) | 2 + Integration | `editorPredicates.property.test.ts`, `block-element.dom.vitest.ts` |
| REQ-EDIT-008 | PROP-EDIT-011 (pure), PROP-EDIT-028 (integration) | 2 + Integration | `editorPredicates.property.test.ts`, `block-element.dom.vitest.ts` |
| REQ-EDIT-009 | PROP-EDIT-029 | Integration | `block-element.dom.vitest.ts` |
| REQ-EDIT-010 | PROP-EDIT-010 (pure), PROP-EDIT-030 (integration) | 2 + Integration | `editorPredicates.property.test.ts`, `slash-menu.dom.vitest.ts` |
| REQ-EDIT-011 | PROP-EDIT-031 | Integration | `block-drag-handle.dom.vitest.ts` |
| REQ-EDIT-012 | PROP-EDIT-003 (pure), PROP-EDIT-033 (integration) | 2 + Integration | `debounceSchedule.property.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-013 | PROP-EDIT-012, PROP-EDIT-033 | 1 + Integration | `editorReducer.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-014 | PROP-EDIT-004 (pure), PROP-EDIT-032 (integration) | 2 + Integration | `debounceSchedule.property.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-015 | PROP-EDIT-004, PROP-EDIT-032 | 2 + Integration | `debounceSchedule.property.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-016 | PROP-EDIT-013 (pure), PROP-EDIT-032 (integration) | 1 + Integration | `editorReducer.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-017 | PROP-EDIT-015 | 1 | `editorReducer.test.ts` |
| REQ-EDIT-018 | PROP-EDIT-015, PROP-EDIT-033 | 1 + Integration | `editorReducer.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-019 | PROP-EDIT-034 | Integration | `editor-session-state.dom.vitest.ts` |
| REQ-EDIT-020 | PROP-EDIT-035 | Integration | `editor-session-state.dom.vitest.ts` |
| REQ-EDIT-021 | PROP-EDIT-036 | Integration | `editor-session-state.dom.vitest.ts` |
| REQ-EDIT-022 | PROP-EDIT-037 | Integration | `editor-session-state.dom.vitest.ts` |
| REQ-EDIT-023 | PROP-EDIT-038 | Integration | `editor-session-state.dom.vitest.ts` |
| REQ-EDIT-024 | PROP-EDIT-039 (state ownership), PROP-EDIT-040 (snapshot mirroring, Tier 2 fast-check) | 0 + 2 | `tsc --strict`, grep audit, `editorReducer.property.test.ts` |
| REQ-EDIT-025 | PROP-EDIT-041 | Integration | `save-failure-banner.dom.vitest.ts` |
| REQ-EDIT-026 | PROP-EDIT-005 (pure), PROP-EDIT-042 (pure), PROP-EDIT-043 (integration) | 1 + 2 + Integration | `editorPredicates.test.ts`, `editorPredicates.property.test.ts`, `editor-validation.dom.vitest.ts` |
| REQ-EDIT-027 | PROP-EDIT-016 | Integration | `save-failure-banner.dom.vitest.ts` |
| REQ-EDIT-028 | PROP-EDIT-017 | Integration | `save-failure-banner.dom.vitest.ts` |
| REQ-EDIT-029 | PROP-EDIT-018 | Integration | `save-failure-banner.dom.vitest.ts` |
| REQ-EDIT-030 | PROP-EDIT-019 | Integration + style grep | `save-failure-banner.dom.vitest.ts`, manual DESIGN.md review |
| REQ-EDIT-031 | PROP-EDIT-020 | Integration | `editor-panel.dom.vitest.ts` |
| REQ-EDIT-032 | PROP-EDIT-006 (pure), PROP-EDIT-021 (integration) | 2 + Integration | `editorPredicates.property.test.ts`, `editor-panel.dom.vitest.ts` |
| REQ-EDIT-033 | PROP-EDIT-022 | Integration | `editor-panel.dom.vitest.ts` |
| REQ-EDIT-034 | PROP-EDIT-023 | Integration | `editor-panel.dom.vitest.ts` |
| REQ-EDIT-035 | PROP-EDIT-024a, PROP-EDIT-024b, PROP-EDIT-024c | Integration | `editor-panel.dom.vitest.ts` |
| REQ-EDIT-036 | PROP-EDIT-051 | Integration | `editor-panel.dom.vitest.ts` |
| REQ-EDIT-037 | PROP-EDIT-002 (required); PROP-EDIT-009 subsumed | 2 | `editorReducer.property.test.ts` |
| REQ-EDIT-038 | PROP-EDIT-043 | Integration | `editor-validation.dom.vitest.ts` |
| EC-EDIT-001 | PROP-EDIT-003, PROP-EDIT-033 | 2 + Integration | `debounceSchedule.property.test.ts`, `editor-panel.dom.vitest.ts` |
| EC-EDIT-002 | PROP-EDIT-013, PROP-EDIT-032 | 1 + Integration | `editorReducer.test.ts`, `editor-panel.dom.vitest.ts` |
| EC-EDIT-003 | PROP-EDIT-048 | Integration | `editor-session-state.dom.vitest.ts` |
| EC-EDIT-004 | PROP-EDIT-049 | Integration | `save-failure-banner.dom.vitest.ts` |
| EC-EDIT-005 | PROP-EDIT-050 | Integration | `editor-session-state.dom.vitest.ts` |
| EC-EDIT-006 | PROP-EDIT-015, PROP-EDIT-032 | 1 + Integration | `editorReducer.test.ts`, `editor-panel.dom.vitest.ts` |
| EC-EDIT-007 | PROP-EDIT-006, PROP-EDIT-021 | 2 + Integration | `editorPredicates.property.test.ts`, `editor-panel.dom.vitest.ts` |
| EC-EDIT-008 | PROP-EDIT-024b | Integration | `editor-panel.dom.vitest.ts` |
| EC-EDIT-009 | PROP-EDIT-033, PROP-EDIT-045 | Integration | `editor-panel.dom.vitest.ts` |
| EC-EDIT-010 | PROP-EDIT-022, PROP-EDIT-036 | Integration | `editor-panel.dom.vitest.ts`, `editor-session-state.dom.vitest.ts` |
| EC-EDIT-011 | PROP-EDIT-011, PROP-EDIT-028 | 2 + Integration | `editorPredicates.property.test.ts`, `block-element.dom.vitest.ts` |
| EC-EDIT-012 | PROP-EDIT-001 | 2 | `editorPredicates.property.test.ts` |
| EC-EDIT-013 | PROP-EDIT-010, PROP-EDIT-030 | 2 + Integration | `editorPredicates.property.test.ts`, `slash-menu.dom.vitest.ts` |
| EC-EDIT-014 | PROP-EDIT-050 | Integration | `editor-session-state.dom.vitest.ts` |

---

## 7. Verification Gates

### Phase 2 gate (Red phase entry criterion)

Before any implementation file is written:
- Every `PROP-EDIT-XXX` with `Required: true` has a corresponding failing test.
- The regression baseline (pre-existing tests in other features and the prior ui-editor pure-tier) must remain green.
- Red phase evidence records `new-feature-tests: FAIL` and `regression-baseline: PASS` plus raw failing test output.

Integration-tier tests (`Required: false`) are also written in the Red phase before any implementation; they are not proof obligations but follow Red-before-Green.

### Phase 3 gate (adversarial review criterion)

- ≥ 95% branch coverage on the three pure-core modules (vitest --coverage).
- 100% of `PROP-EDIT-XXX` with `Required: true` pass.
- All integration-tier tests pass.

### Phase 5 gate (formal hardening criterion)

- **Branch coverage gate**: ≥ 95% on `editorPredicates.ts`, `editorReducer.ts`, `debounceSchedule.ts` via `bun run test:dom -- --coverage --reporter=json`.
- **Security audit**: `grep -r "{@html\|innerHTML\|outerHTML\|insertAdjacentHTML" src/lib/editor/` — zero hits.
- **Purity audit**: canonical pattern in §2 against the three pure modules — zero hits. Pure-tier modules MUST NOT import `@tauri-apps/api`.
- **Type safety audit**: `tsc --noEmit --strict --noUncheckedIndexedAccess` exits 0.
- **Svelte 4 store audit**: `grep -r "from 'svelte/store'" src/lib/editor/` — zero hits (PROP-EDIT-047).
- **State mutation audit**: `grep -r "EditingSessionState\|EditorViewState" src/lib/editor/*.svelte` — no assignment patterns (PROP-EDIT-039).
- **EditorCommand variant audit**: `grep -r "kind: 'edit-note-body'\|EditNoteBody" src/lib/editor/` — zero hits (Sprint 7 removes the legacy command name).
- **Design-token manual checklist**: DESIGN.md conformance review of `src/lib/editor/*.svelte` — colours, font-weights, border-radii, 5-layer shadow string, heading sizes match DESIGN.md §3 / §10.

---

## 8. Threat Model & Security Properties

### Block content trust boundary

`Block.content` is raw user-supplied text. It is rendered inside contenteditable Block elements. Svelte text bindings (`{block.content}`, `bind:textContent`) escape HTML by default, which prevents reflected XSS in the Svelte template layer. The 9 `BlockType` literals map to known-safe elements (`<p>`, `<h1>` .. `<h3>`, `<li>`, `<pre>`, `<blockquote>`, `<hr>`); the mapping is hard-coded in the impure shell and never derived from user input.

**Prohibition**: The `{@html ...}` directive must never be used to display Block content. Phase 5 grep audit catches any violation.

### Slash menu and Markdown shortcut surfaces

The slash menu is a closed enumeration of `BlockType` literals. The Markdown shortcut classifier (`classifyMarkdownPrefix`) returns `null` for any unrecognised prefix (PROP-EDIT-010), preventing arbitrary user input from steering UI mode changes.

### Clipboard surface

`CopyNoteBody` is fulfilled server-side by Rust (`NoteOps.bodyForClipboard`). The TS adapter dispatches the IPC; it does not perform clipboard I/O. No XSS sink in the editor surface.

### Tauri IPC

`tauriEditorAdapter.ts` is the sole entry for outbound `invoke(...)` calls. `editorStateChannel.ts` is the sole entry for inbound `@tauri-apps/api/event listen(...)` calls. They do NOT overlap (RD-016). Pure-tier modules MUST NOT contain any `import` from `@tauri-apps/api`.

Concrete IPC wiring (snake_case command names) is deferred to the backend save-handler features. Candidate names (informational only):

| Domain command | Candidate Tauri `invoke` name |
|---|---|
| `FocusBlock` | `focus_block` |
| `EditBlockContent` | `edit_block_content` |
| `InsertBlock` | `insert_block` |
| `RemoveBlock` | `remove_block` |
| `MergeBlocks` | `merge_blocks` |
| `SplitBlock` | `split_block` |
| `ChangeBlockType` | `change_block_type` |
| `MoveBlock` | `move_block` |
| `TriggerIdleSave` | `trigger_idle_save` |
| `TriggerBlurSave` | `trigger_blur_save` |
| `CopyNoteBody` | `copy_note_body` |
| `RequestNewNote` | `request_new_note` |
| `RetrySave` | `retry_save` |
| `DiscardCurrentSession` | `discard_current_session` |
| `CancelSwitch` | `cancel_switch` |

All command payloads carry typed value-object fields per §11; brand types are sent as raw `string` / `number` values at the wire boundary.

---

## 10. EditorCommand Discriminated Union

This section defines the `EditorCommand` union contract between the pure reducer and the impure shell.

### Canonical union definition

```typescript
type EditorCommand =
  | { kind: 'focus-block';             payload: { noteId: string; blockId: string; issuedAt: string } }
  | { kind: 'edit-block-content';      payload: { noteId: string; blockId: string; content: string; issuedAt: string } }
  | { kind: 'insert-block-after';      payload: { noteId: string; prevBlockId: string; type: BlockType; content: string; issuedAt: string } }
  | { kind: 'insert-block-at-beginning'; payload: { noteId: string; type: BlockType; content: string; issuedAt: string } }
  | { kind: 'remove-block';            payload: { noteId: string; blockId: string; issuedAt: string } }
  | { kind: 'merge-blocks';            payload: { noteId: string; blockId: string; issuedAt: string } }
  | { kind: 'split-block';             payload: { noteId: string; blockId: string; offset: number; issuedAt: string } }
  | { kind: 'change-block-type';       payload: { noteId: string; blockId: string; newType: BlockType; issuedAt: string } }
  | { kind: 'move-block';              payload: { noteId: string; blockId: string; toIndex: number; issuedAt: string } }
  | { kind: 'cancel-idle-timer' }
  | { kind: 'trigger-idle-save';       payload: { source: 'capture-idle'; noteId: string; issuedAt: string } }
  | { kind: 'trigger-blur-save';       payload: { source: 'capture-blur'; noteId: string; issuedAt: string } }
  | { kind: 'retry-save';              payload: { noteId: string; issuedAt: string } }
  | { kind: 'discard-current-session'; payload: { noteId: string; issuedAt: string } }
  | { kind: 'cancel-switch';           payload: { noteId: string; issuedAt: string } }
  | { kind: 'copy-note-body';          payload: { noteId: string; issuedAt: string } }
  | { kind: 'request-new-note';        payload: { source: 'explicit-button' | 'ctrl-N'; issuedAt: string } }
```

**Source of names**: kind strings derive from `capture/commands.ts` (with `insert-block` decomposed into the two atBeginning variants for an unambiguous payload shape). `source` literal values match `shared/events.ts SaveNoteSource` (`'capture-idle'` / `'capture-blur'`) and `capture/commands.ts RequestNewNote.source` (`'explicit-button'` / `'ctrl-N'`).

> **InsertBlock decomposition note** (FIND-029): `CaptureCommand.InsertBlock` in `capture/commands.ts` is a single discriminated union with `kind: 'insert-block'` and an `atBeginning: false | true` discriminator. The `EditorCommand` union decomposes this into two distinct kinds — `'insert-block-after'` (atBeginning=false, requires `prevBlockId`) and `'insert-block-at-beginning'` (atBeginning=true, no `prevBlockId`) — for an unambiguous payload shape at the reducer level. At the Tauri IPC wire boundary, the impure shell adapter re-merges them: `'insert-block-after'` → `invoke('insert_block', { kind: 'insert-block', atBeginning: false, prevBlockId, ... })`, and `'insert-block-at-beginning'` → `invoke('insert_block', { kind: 'insert-block', atBeginning: true, ... })`. The Rust handler receives the canonical `CaptureCommand.InsertBlock` shape. The split-kind approach is UI-internal only and never crosses the language boundary.

> **Purity note**: Pure modules MUST NOT call `Date.now()` or `BlockId.generate()`. `issuedAt` and any new `BlockId` are supplied by the impure shell on the inbound `EditorAction` (via `clock.now()` / `BlockIdSmartCtor.generate()`).

### Adapter binding table

Every `EditorCommand` variant is handled by the impure shell's exhaustive switch as follows (FIND-031):

| EditorCommand kind | Shell handler | IPC? |
|---|---|---|
| `focus-block` | `adapter.dispatchFocusBlock(...)` | Yes — `invoke('focus_block', ...)` |
| `edit-block-content` | `adapter.dispatchEditBlockContent(...)` | Yes — `invoke('edit_block_content', ...)` |
| `insert-block-after` | `adapter.dispatchInsertBlockAfter(...)` | Yes — `invoke('insert_block', { atBeginning: false, ... })` |
| `insert-block-at-beginning` | `adapter.dispatchInsertBlockAtBeginning(...)` | Yes — `invoke('insert_block', { atBeginning: true, ... })` |
| `remove-block` | `adapter.dispatchRemoveBlock(...)` | Yes — `invoke('remove_block', ...)` |
| `merge-blocks` | `adapter.dispatchMergeBlocks(...)` | Yes — `invoke('merge_blocks', ...)` |
| `split-block` | `adapter.dispatchSplitBlock(...)` | Yes — `invoke('split_block', ...)` |
| `change-block-type` | `adapter.dispatchChangeBlockType(...)` | Yes — `invoke('change_block_type', ...)` |
| `move-block` | `adapter.dispatchMoveBlock(...)` | Yes — `invoke('move_block', ...)` |
| `cancel-idle-timer` | `timerModule.cancelIdleSave(currentHandle)` | **No** — local timer call only; never crosses the IPC boundary |
| `trigger-idle-save` | `adapter.dispatchTriggerIdleSave(...)` | Yes — `invoke('trigger_idle_save', ...)` |
| `trigger-blur-save` | `adapter.dispatchTriggerBlurSave(...)` | Yes — `invoke('trigger_blur_save', ...)` |
| `retry-save` | `adapter.dispatchRetrySave(...)` | Yes — `invoke('retry_save', ...)` |
| `discard-current-session` | `adapter.dispatchDiscardCurrentSession(...)` | Yes — `invoke('discard_current_session', ...)` |
| `cancel-switch` | `adapter.dispatchCancelSwitch(...)` | Yes — `invoke('cancel_switch', ...)` |
| `copy-note-body` | `adapter.dispatchCopyNoteBody(...)` | Yes — `invoke('copy_note_body', ...)` |
| `request-new-note` | `adapter.dispatchRequestNewNote(...)` | Yes — `invoke('request_new_note', ...)` |

`cancel-idle-timer` is the only non-IPC variant. Phase 2 tests for the impure shell must mock `timerModule` (not the IPC adapter) to assert this variant's side-effect.

### Wire-boundary source-field erasure note

The `EditorCommand` variants `'trigger-idle-save'` and `'trigger-blur-save'` carry a `source` field (`'capture-idle'` / `'capture-blur'`). The canonical `CaptureCommand.TriggerIdleSave` and `CaptureCommand.TriggerBlurSave` in `capture/commands.ts` do **NOT** carry a `source` field — the source is used by the Rust `BuildSaveNoteRequested` helper when constructing the `SaveNoteRequested` Public Domain Event (FIND-032).

The impure shell adapter therefore:
1. Sends `source` as part of the Tauri `invoke(...)` payload for `trigger_idle_save` / `trigger_blur_save`.
2. The Rust handler extracts it to populate `SaveNoteRequested.source`; the intermediate Rust `TriggerIdleSave` / `TriggerBlurSave` command objects do not store it.

This is intentional asymmetry. The `source` field exists on `EditorCommand` for two reasons: (a) PROP-EDIT-002 must be assertable from pure TypeScript tests without inspecting Rust state; (b) the Rust handler uses it at the wire boundary to construct the correct Public Event. The value is not "invented" by the UI — it is a pre-determined label for the trigger kind that the UI is the only party able to observe.

### Save-source subset alias

```typescript
type EditorCommandSaveSource = 'capture-idle' | 'capture-blur';
```

Used in PROP-EDIT-002 / 009 assertions over `'trigger-idle-save'` and `'trigger-blur-save'` payloads.

### Tier 0 structural-conformance assertions (impure shell)

Every variant's payload must be a strict superset of (or equal to) the corresponding `dispatchXxx` adapter signature's parameter set. Compile-time assertions in the impure shell:

```typescript
type _AssertEditBlockContentShape = (EditorCommand & { kind: 'edit-block-content' })['payload'] satisfies
  { noteId: string; blockId: string; content: string; issuedAt: string };

type _AssertSplitBlockShape = (EditorCommand & { kind: 'split-block' })['payload'] satisfies
  { noteId: string; blockId: string; offset: number; issuedAt: string };

type _AssertCopyNoteBodyShape = (EditorCommand & { kind: 'copy-note-body' })['payload'] satisfies
  { noteId: string; issuedAt: string };
```

If the union drifts from the adapter signature, the build fails.

### Tier 0 exhaustive-switch obligation (impure shell)

The impure shell handles every `EditorCommand` variant via an exhaustive switch on `kind`. Adding a new variant without updating the switch is a compile error (`never` branch).

### PROP cross-references

| PROP-ID | EditorCommand variants referenced |
|---|---|
| PROP-EDIT-002 | `'trigger-idle-save'`, `'trigger-blur-save'` (save-source literals) |
| PROP-EDIT-007 | all variants (totality: `commands: ReadonlyArray<EditorCommand>` never undefined) |
| PROP-EDIT-009 | `'trigger-idle-save'`, `'trigger-blur-save'` (source-absence; subsumed by PROP-EDIT-002) |
| PROP-EDIT-012 | `'cancel-idle-timer'` (clearTimeout delegation) |
| PROP-EDIT-013 | `'trigger-blur-save'` (no command emitted while saving / switching) |

---

## 9. Out-of-Scope for This Feature

The following concerns are explicitly out of scope for `ui-editor` verification:

- **Block invariants** (`removeBlock` last-block protection, `mergeBlockWithPrevious` first-block guard, `splitBlock` offset range, `BlockContent` constraints, `note.isEmpty()`) — verified in `capture-auto-save` / Rust domain unit tests.
- **`serializeBlocksToMarkdown` / `parseMarkdownToBlocks` correctness and roundtrip** — verified by `app-startup` (Hydration) and `capture-auto-save` features.
- **Note list pane** (`ui-feed-list-actions`).
- **Note metadata pane** (`ui-tag-chip`).
- **Settings dialog and vault configuration** (`configure-vault`, `ui-app-shell`).
- **Persistence layer correctness** (atomic write, YAML serialisation, file I/O) — `capture-auto-save` / `handle-save-failure`.
- **TagInventory and Feed update projections after save** — `curate-*` features.
- **Ctrl+N / Cmd+N platform disambiguation** — resolved (RD-004).
- **Rust-side `note.isEmpty()` ↔ `serializeBlocksToMarkdown` agreement** — Kani / cargo test obligation on backend features. The TypeScript spec pins UI behaviour to `EditorViewState.isNoteEmpty` from the DTO (RD-006).
- **Tauri command handler implementation** — owned by backend save-handler / capture-auto-save features.

---

## 10. Sprint 8 Addendum — IPC Wire Contract (Rust DTO migration)

Sprint 8 extends this verification architecture to cover the Rust-side `EditingSessionStateDto` enum and its emit sites. The verification target is **wire-shape compatibility** between Rust serde JSON output and the TypeScript discriminated-union narrowing in `promptnotes/src/lib/editor/types.ts`.

### 10.1 Sprint 8 purity boundary additions

| Module | Layer | Rationale |
|---|---|---|
| `promptnotes/src-tauri/src/editor.rs::EditingSessionStateDto` (Rust enum) | pure (Tier 0 / data) | Pure data definition with `#[derive(Serialize, Deserialize)]`. No I/O, no clock, no random. The 5 `enum` variants and their fields ARE the wire contract. |
| `promptnotes/src-tauri/src/editor.rs::PendingNextFocusDto` / `DtoBlock` / `SaveErrorDto` / `FsErrorDto` | pure (Tier 0 / data) | Same justification. |
| `promptnotes/src-tauri/src/editor.rs::make_*_payload` helpers (variant-aware) | pure (Tier 0 / constructor) | Pure JSON-value constructors over the enum. No `tauri::AppHandle` access, no clock, no random. They wrap an `EditingSessionStateDto` into `serde_json::json!({"state": <dto>})`. |
| `promptnotes/src-tauri/src/editor.rs::emit_state_changed*` family | impure shell | Holds the `AppHandle::emit(...)` side-effect. Forwards a payload constructed by the pure helper. |
| `promptnotes/src-tauri/src/editor.rs::save_note_and_emit` and the per-command handlers (`trigger_idle_save`, `trigger_blur_save`, `retry_save`, `discard_current_session`, `cancel_switch`, `request_new_note`) | impure shell | Perform the FS I/O (atomic write) and the IPC emit. The I/O remains the same; the emit body is rewritten to dispatch on variant. |
| `promptnotes/src-tauri/src/feed.rs::select_past_note` | impure shell | Same — performs vault scan I/O and emits both `feed_state_changed` and `editing_session_state_changed`. Sprint 8 only changes the SECOND emit (rewritten to use the new variant constructor). |

### 10.2 Sprint 8 proof obligations (PROP-IPC-001..023)

These obligations are added on top of the existing PROP-EDIT-001..016 set. Phase 5 (formal hardening) will execute these as `cargo test` cases and serde round-trip property tests. Tier assignments follow the Sprint 7 convention.

| PROP-ID | Tier | Obligation | Verification mechanism |
|---|---|---|---|
| **PROP-IPC-001** | 0 (compile-time) | The Rust enum `EditingSessionStateDto` has exactly 5 variants matching the TS union arms: `Idle`, `Editing`, `Saving`, `Switching`, `SaveFailed`. | A unit test pattern-matches on every variant in an exhaustive `match`; adding a new variant without updating the match is a compile error. |
| **PROP-IPC-002** | 1 (unit) | `serde_json::to_value(EditingSessionStateDto::Idle)` produces exactly `{"status":"idle"}` (no other keys). | Direct equality assertion. |
| **PROP-IPC-003** | 1 (unit) | Each non-`Idle` variant serializes with `status` set to the kebab-case discriminant (`editing`, `saving`, `switching`, `save-failed`). | Per-variant `to_string` containment assertion + JSON `status` key extraction. |
| **PROP-IPC-004** | 1 (unit) | The `Editing` variant serializes **exactly** the keys `status`, `currentNoteId`, `focusedBlockId`, `isDirty`, `isNoteEmpty`, `lastSaveResult` (and `blocks` iff `Some`). The set of present keys equals one of those two enumerations — no extra keys are tolerated. | Sorted-keys equality assertion against the allowed set; `serde_json::Value::as_object().keys().collect::<BTreeSet<_>>()` compared to a literal `BTreeSet`. |
| **PROP-IPC-005** | 1 (unit) | The `SaveFailed` variant serializes **exactly** the keys `status`, `currentNoteId`, `priorFocusedBlockId`, `pendingNextFocus`, `lastSaveError`, `isNoteEmpty` (and `blocks` iff `Some`). When `priorFocusedBlockId` is `None`, the JSON value is the literal `null` (key present). When `pendingNextFocus` is `None`, the JSON value is the literal `null` (key present, NOT skipped). | Per-variant fixture assertion in `tests/editor_handlers.rs`; sorted-keys equality + null-literal containment check. |
| **PROP-IPC-006** | 1 (unit) | The `Switching` variant serializes **exactly** the keys `status`, `currentNoteId`, `pendingNextFocus`, `isNoteEmpty` (and `blocks` iff `Some`). The `pendingNextFocus` field is an object with keys `noteId` and `blockId` (both required strings, never null). | Sorted-keys equality + nested object assertion. |
| **PROP-IPC-007** | 1 (unit) | `SaveErrorDto` with `reason: None` serializes WITHOUT the `reason` key (`skip_serializing_if = "Option::is_none"`). With `reason: Some(FsErrorDto { kind })` the JSON object contains `"reason":{"kind":"<value>"}`. | `assert!(!json.contains("reason"))` for None; positive containment for Some. |
| **PROP-IPC-008** | 1 (unit) | The `blocks` field on `Editing` / `Saving` / `Switching` / `SaveFailed`: when `Some([])` it serializes as `"blocks":[]`, when `None` the key is omitted, when `Some([nonEmpty])` it serializes as `"blocks":[<dto blocks>]` with each `DtoBlock` shaped per REQ-IPC-009. | Three complementary fixture cases per variant (None, Some([]), Some([Paragraph, Heading1, Code, Divider])). |
| **PROP-IPC-009** | 1 (unit) | The single helper `make_editing_state_changed_payload(state: &EditingSessionStateDto) -> serde_json::Value` wraps the variant exactly once in `{"state": <variant>}`. The returned `serde_json::Value` is `Object` with one key `state`. | `serde_json::Value::Object` + key-set assertion (`{"state"}`). |
| **PROP-IPC-010** | 2 (property / round-trip) | For every `EditingSessionStateDto` value `v` in the explicit Sprint-8 variant-cover set (§10.2.1, exactly 14 fixtures), `serde_json::from_str::<EditingSessionStateDto>(&serde_json::to_string(&v).unwrap()).unwrap() == v`. The cover set includes at least one fixture with `blocks=Some([nonEmpty])` carrying multiple `BlockTypeDto` variants to cover BlockType round-trip. | Explicit fixture-table iteration (NOT proptest) — Sprint 8 commits to a hand-enumerated table because (a) `proptest` is not yet a dev-dependency and adding it expands scope, and (b) the cover set is small enough to enumerate. The table lives in `tests/editor_handlers.rs::WIRE_FIXTURES` constant. |
| **PROP-IPC-011** | 1 (TS↔Rust generated fixtures) | The TS narrowing test in `promptnotes/src/lib/editor/__tests__/dom/editorStateChannelWireFixtures.dom.vitest.ts` reads JSON fixtures generated by the Rust test `print_wire_fixtures` (which serializes the §10.2.1 cover set to `promptnotes/src-tauri/tests/fixtures/wire-fixtures.json`). For each fixture the TS test (a) parses the JSON, (b) narrows on `state.status`, (c) asserts that `Object.keys(state)` equals the allowed key-set for that variant (per §10.2 PROP-IPC-004..006 — explicit `Set` equality, NOT subset, to detect extra fields), (d) calls an exhaustive `assertNever` in the default branch. The fixture file is a generated artefact, not hand-authored: a Rust drift in field names or addition of new keys breaks the TS test on the next CI run. | `cargo test print_wire_fixtures --manifest-path promptnotes/src-tauri/Cargo.toml` (writes the file) → `bun run vitest run editorStateChannelWireFixtures` (reads + narrows). The two commands are sequenced in the Phase 5 verifier script; CI runs them in order. |
| **PROP-IPC-012** | 1 (caller emit-site) | No production code path constructs a `serde_json::json!({"state": {"status": ..., "isDirty": ..., ...}})` literal directly — every emit goes through the singular helper `make_editing_state_changed_payload(state)`. Verified by structural assertion: every call to `app.emit("editing_session_state_changed", payload)` in `editor.rs` and `feed.rs` shall be preceded by `let payload = make_editing_state_changed_payload(&...)`. | grep/CI guard: `rg --type rust 'emit\(\s*"editing_session_state_changed"' promptnotes/src-tauri/src/` shall match only call-sites whose preceding 5 lines contain `make_editing_state_changed_payload`; counter-examples (any `serde_json::json!({"state": {"status"` literal in production paths) cause CI failure. The grep script lives at `promptnotes/src-tauri/tests/wire_audit.sh`. |
| **PROP-IPC-013** | 1 (per-handler integration) | Calling `discard_current_session(app, note_id, issued_at)` emits exactly one `editing_session_state_changed` event whose payload deserializes (via the captured `serde_json::Value`) to `EditingSessionStateDto::Idle`. | Tauri `mocks::mock_app()` test in `tests/editor_handlers.rs`; the mock captures emitted events and the test asserts shape equality. |
| **PROP-IPC-014** | 1 (per-handler integration) | Calling `cancel_switch(app, note_id, issued_at)` emits exactly one `editing_session_state_changed` event whose payload deserializes to `EditingSessionStateDto::Editing { current_note_id == note_id, focused_block_id: None, is_dirty: true, is_note_empty: false, last_save_result: None, blocks: None }`. | Same mock-app harness; per-field equality assertion. |
| **PROP-IPC-015** | 1 (per-handler integration) | Calling `request_new_note(app, source, issued_at)` (with vault configured) emits the `editing_session_state_changed` event for the new note path with the `Editing` variant: `is_dirty: false`, `focused_block_id: None`, `last_save_result: None`, `is_note_empty: true`, `blocks: None`. | Same harness; vault path is mocked via `settings_load_impl` test override. |
| **PROP-IPC-016** | 1 (per-handler integration) | Calling `trigger_idle_save` (and analogously `trigger_blur_save`, `retry_save`) when `fs_write_file_atomic` returns `Ok(())` emits `Editing { last_save_result: Some("success"), is_dirty: false, focused_block_id: None, is_note_empty: <body.is_empty()>, blocks: None }`. When it returns `Err(io_err)` the emit is `SaveFailed { last_save_error: SaveErrorDto { kind: "fs", reason: Some(<FsErrorDto>) }, prior_focused_block_id: None, pending_next_focus: None, is_note_empty: <body.is_empty()>, blocks: None }`. | Same harness; an in-memory FS shim or a writable tempdir simulates Ok/Err paths. |
| **PROP-IPC-017** | 1 (per-handler integration) | Calling `select_past_note(app, note_id, vault_path, issued_at)` emits TWO events: first an `editing_session_state_changed` whose payload is `Editing { current_note_id == note_id, focused_block_id: None, is_dirty: false, is_note_empty: <body.is_empty()>, last_save_result: None, blocks: None }`, then a `feed_state_changed` whose payload is the existing snapshot. The order of emits matches REQ-FEED-024 / EC-FEED-017. | Same harness; emit-order assertion via captured-event list index. |
| **PROP-IPC-018** | 0 (compile-time) | The Rust `BlockTypeDto` enum has exactly 9 variants (`Paragraph`, `Heading1`, `Heading2`, `Heading3`, `Bullet`, `Numbered`, `Code`, `Quote`, `Divider`). Adding a 10th variant without updating PROP-IPC-019 breaks the round-trip cover set. | An exhaustive `match` over `BlockTypeDto` in tests; missing arms are compile errors. |
| **PROP-IPC-019** | 1 (round-trip) | `serde_json::from_str::<BlockTypeDto>("\"<value>\"")` succeeds iff `<value>` is one of the 9 kebab-case literals (`paragraph`, `heading-1`, `heading-2`, `heading-3`, `bullet`, `numbered`, `code`, `quote`, `divider`). Any other string returns `Err`. Round-trip identity holds for all 9 valid values. | Per-value table: 9 success cases + at least 3 failure cases (typo `"hedaing-1"`, capitalized `"Paragraph"`, empty string `""`). |
| **PROP-IPC-020** | 1 (grep audit) | The Rust source `promptnotes/src-tauri/src/editor.rs` and `promptnotes/src-tauri/src/feed.rs` shall NOT carry `#[serde(skip_serializing_if = "Option::is_none")]` on the focus-related fields `Editing::focused_block_id`, `SaveFailed::prior_focused_block_id`, or `SaveFailed::pending_next_focus`. The skip annotation is permitted ONLY adjacent to `blocks: Option<Vec<DtoBlock>>` and `SaveErrorDto::reason: Option<FsErrorDto>` (existing). | grep script in `tests/wire_audit.sh`: extract every `skip_serializing_if` match with surrounding context, assert each match is in the allow-list. |
| **PROP-IPC-021** | 1 (grep audit) | The Rust source under `promptnotes/src-tauri/src/` shall NOT contain the legacy 6-flat-key constructor pattern `make_editing_state_changed_payload(<6 positional args>)` after Sprint 8. Any remaining call site with 6+ positional `String`/`bool`/`Option<...>` args to `make_editing_state_changed_payload` is a CI failure. | grep+regex in `tests/wire_audit.sh`. |
| **PROP-IPC-022** | 1 (TS key-set) | The TS test `editorStateChannelWireFixtures.dom.vitest.ts` shall, for each variant, assert `new Set(Object.keys(state))` equals the variant's expected key-set (per the variant key-set tables of REQ-IPC-004..007). The "extra keys" check uses `Set` equality, NOT subset, to detect Rust drift adding unexpected keys. | vitest test code; expected sets are inlined as `const EXPECTED_KEYS = { editing: new Set([...]), ... }`. |
| **PROP-IPC-023** | 1 (cancel-switch transition robustness) | Following EC-IPC-012, the TS reducer applied to a `DomainSnapshotReceived` action whose snapshot is `Editing { focusedBlockId: null }` and whose preceding state is `switching` (NOT `save-failed`) does NOT throw or return undefined. The resulting `EditorViewState.focusedBlockId` is `null`. The Svelte EditorPanel's focus restoration is delegated outside the reducer (RD-022) and is not the reducer's responsibility. | Pure unit test for `editorReducer` in `promptnotes/src/lib/editor/__tests__/`. |

#### 10.2.1 Sprint 8 explicit variant-cover set (PROP-IPC-010 round-trip table)

PROP-IPC-010 round-trip is verified against the following 14 hand-enumerated fixtures. The `EditingSessionStateDto::Idle` variant has only one possible value (no fields), so it contributes one fixture. The remaining variants enumerate the cross-product of optional `blocks` (None / `Some([])` / `Some([nonEmpty])`) and per-variant nullable fields. The `nonEmpty` `blocks` fixture carries 4 distinct `BlockTypeDto` variants (`Paragraph`, `Heading1`, `Code`, `Divider`) so PROP-IPC-019 round-trip is exercised in passing.

| ID | Variant | `blocks` | Other field overrides | Notes |
|----|---------|----------|----------------------|-------|
| F01 | `Idle` | n/a | n/a | Single-instance variant. |
| F02 | `Editing` | `None` | `focused_block_id: None`, `is_dirty: false`, `is_note_empty: true`, `last_save_result: None` | Empty new note. |
| F03 | `Editing` | `Some([])` | `focused_block_id: Some("blk-1")`, `is_dirty: true`, `is_note_empty: false`, `last_save_result: Some("success")` | Mid-edit, just saved. |
| F04 | `Editing` | `Some([Paragraph, Heading1, Code, Divider])` | `focused_block_id: Some("blk-2")`, `is_dirty: false`, `is_note_empty: false`, `last_save_result: None` | Multi-block round-trip cover. |
| F05 | `Saving` | `None` | `is_note_empty: false` | Mid-save. |
| F06 | `Saving` | `Some([Paragraph])` | `is_note_empty: false` | Mid-save with blocks projection. |
| F07 | `Switching` | `None` | `pending_next_focus: { noteId: "n2", blockId: "blk-1" }`, `is_note_empty: false` | Switching to another note. |
| F08 | `Switching` | `Some([])` | same as F07 | Empty-blocks projection. |
| F09 | `SaveFailed` | `None` | `prior_focused_block_id: None`, `pending_next_focus: None`, `last_save_error: { kind: "fs", reason: Some({ kind: "permission" }) }`, `is_note_empty: false` | Both nullables `None`; reason `Some`. |
| F10 | `SaveFailed` | `None` | `prior_focused_block_id: Some("blk-1")`, `pending_next_focus: None`, `last_save_error: { kind: "fs", reason: Some({ kind: "disk-full" }) }`, `is_note_empty: false` | priorFocus `Some`. |
| F11 | `SaveFailed` | `None` | `prior_focused_block_id: Some("blk-1")`, `pending_next_focus: Some({ noteId: "n2", blockId: "blk-1" })`, `last_save_error: { kind: "fs", reason: Some({ kind: "lock" }) }`, `is_note_empty: false` | Both nullables `Some`. |
| F12 | `SaveFailed` | `None` | `prior_focused_block_id: None`, `pending_next_focus: None`, `last_save_error: { kind: "validation", reason: None }`, `is_note_empty: true` | Validation error: reason `None`, expects `reason` key absent. |
| F13 | `SaveFailed` | `Some([])` | `prior_focused_block_id: None`, `pending_next_focus: Some({ noteId: "n2", blockId: "blk-1" })`, `last_save_error: { kind: "fs", reason: Some({ kind: "unknown" }) }`, `is_note_empty: false` | Empty blocks + pendingNextFocus Some. |
| F14 | `SaveFailed` | `Some([Heading2, Bullet])` | `prior_focused_block_id: Some("blk-1")`, `pending_next_focus: None`, `last_save_error: { kind: "fs", reason: Some({ kind: "not-found" }) }`, `is_note_empty: false` | Non-empty blocks. |

This table is canonical: any added/removed variant or new optional field requires an explicit revision of the cover set.

### 10.3 Sprint 8 forbidden-API additions (Rust)

The Rust `editor.rs` and `feed.rs` files involved in Sprint 8 must NOT introduce any of the following while doing the migration:

```
unsafe\b|::transmute|panic!\(|unwrap\(\)|expect\(|todo!\(|unimplemented!\(
```

Existing `expect("…")` calls in test code are tolerated (they predate Sprint 8 and live under `#[cfg(test)]`); new production-side `unwrap` / `panic` introductions are forbidden. The atomicity-related `unwrap_or_else` on `Path::parent` (existing) is grandfathered.

### 10.4 Sprint 8 PROP cross-reference table

| PROP-ID | REQ-IPC mapping | EC-IPC mapping |
|---|---|---|
| PROP-IPC-001 | REQ-IPC-001 | — |
| PROP-IPC-002 | REQ-IPC-001, REQ-IPC-016 | EC-IPC-009 |
| PROP-IPC-003 | REQ-IPC-001, REQ-IPC-002, REQ-IPC-017 | — |
| PROP-IPC-004 | REQ-IPC-002, REQ-IPC-003, REQ-IPC-004 | EC-IPC-001, EC-IPC-007 |
| PROP-IPC-005 | REQ-IPC-002, REQ-IPC-003, REQ-IPC-007, REQ-IPC-010 | EC-IPC-006, EC-IPC-008 |
| PROP-IPC-006 | REQ-IPC-005, REQ-IPC-006, REQ-IPC-008 | — |
| PROP-IPC-007 | REQ-IPC-010 | EC-IPC-002, EC-IPC-003 |
| PROP-IPC-008 | REQ-IPC-011 | EC-IPC-004, EC-IPC-005 |
| PROP-IPC-009 | REQ-IPC-012 | — |
| PROP-IPC-010 | REQ-IPC-001..012, REQ-IPC-020 | EC-IPC-001..014 |
| PROP-IPC-011 | REQ-IPC-019, REQ-IPC-020 | EC-IPC-009, EC-IPC-006, EC-IPC-007, EC-IPC-008 |
| PROP-IPC-012 | REQ-IPC-013, REQ-IPC-014 | — |
| PROP-IPC-013 | REQ-IPC-013, REQ-IPC-016 | EC-IPC-009 |
| PROP-IPC-014 | REQ-IPC-013, REQ-IPC-015 | EC-IPC-012 |
| PROP-IPC-015 | REQ-IPC-013, REQ-IPC-018 | EC-IPC-014 |
| PROP-IPC-016 | REQ-IPC-013, REQ-IPC-017 | EC-IPC-001, EC-IPC-002, EC-IPC-003, EC-IPC-013 |
| PROP-IPC-017 | REQ-IPC-014 | EC-IPC-010, EC-IPC-011 |
| PROP-IPC-018 | REQ-IPC-009 | — |
| PROP-IPC-019 | REQ-IPC-009 | — |
| PROP-IPC-020 | REQ-IPC-007, REQ-IPC-010, REQ-IPC-011 | EC-IPC-006, EC-IPC-007, EC-IPC-008 |
| PROP-IPC-021 | REQ-IPC-013, REQ-IPC-014 | — |
| PROP-IPC-022 | REQ-IPC-019, REQ-IPC-020 | EC-IPC-006, EC-IPC-007, EC-IPC-008 |
| PROP-IPC-023 | REQ-IPC-015 | EC-IPC-012 |

### 10.5 Sprint 8 verification tooling

- **Tier 0**: `cargo build` exhaustiveness via `match` on the enum (`EditingSessionStateDto`, `BlockTypeDto`).
- **Tier 1 (Rust unit/integration)**: `cargo test --manifest-path promptnotes/src-tauri/Cargo.toml` (existing test directory). Every PROP-IPC-002..009, PROP-IPC-013..017, and PROP-IPC-019 corresponds to one or more `#[test]` functions in `tests/editor_handlers.rs` / `tests/feed_handlers.rs`.
- **Tier 2 (Rust round-trip)**: explicit fixture-table iteration over §10.2.1 cover set in `tests/editor_handlers.rs` (PROP-IPC-010). Sprint 8 commits to a hand-enumerated table — `proptest` is intentionally NOT introduced as a dev-dependency in this sprint.
- **Tier 1 (cross-language)**: A two-phase pipeline:
  1. `cargo test print_wire_fixtures --manifest-path promptnotes/src-tauri/Cargo.toml` — a Rust test that serializes the §10.2.1 cover set and writes `promptnotes/src-tauri/tests/fixtures/wire-fixtures.json`. The file is regenerated on every CI run; it is committed to git so local-vs-CI drift is visible.
  2. `bun run vitest run editorStateChannelWireFixtures` — a TS test that reads the JSON file, narrows on `state.status`, and asserts variant-key-set equality (PROP-IPC-022) and exhaustive `assertNever` coverage (PROP-IPC-011).
  Both commands are sequenced in the Phase 5 verifier script. CI fails if either fails.
- **Tier 1 (grep audits)**: `promptnotes/src-tauri/tests/wire_audit.sh` runs three grep checks corresponding to PROP-IPC-012, PROP-IPC-020, and PROP-IPC-021. The script returns non-zero on any violation. The grep patterns are documented inline; the script is invoked from the Phase 5 verifier.

The tooling stack does not require new dev-dependencies on the Rust side beyond what `cargo test` and `serde_json` already provide. On the TS side, no new dependencies beyond the existing `vitest` setup.

---
