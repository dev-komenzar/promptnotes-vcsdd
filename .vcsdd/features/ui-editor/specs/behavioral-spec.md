# Behavioral Specification: ui-editor

**Feature**: `ui-editor`
**Phase**: 1a
**Mode**: strict
**Language**: TypeScript (Svelte 5 + SvelteKit + Tauri 2 desktop)

**Source of truth**:
- `docs/domain/ui-fields.md` §1A, §画面 4, §UI 状態と型の対応, §検証エラー ↔ UI フィールド マッピング
- `docs/domain/workflows.md` §Workflow 2 (CaptureAutoSave), §Workflow 6 (CopyBody), §Workflow 8 (HandleSaveFailure)
- `docs/domain/aggregates.md` — `EditingSessionState`, `Body.isEmptyAfterTrim` (`note.isEmpty()`), `SaveError` error type structure
- `docs/domain/validation.md` — シナリオ 3, 9, 15
- `DESIGN.md` — §4 Inputs & Forms, §4 Buttons, §4 Cards & Containers, §4 Distinctive Components (Modal & Overlay), §3 Typography, §2 Color Palette, §8 Accessibility & States

**Scope**: UI/orchestration layer for the right-pane editor only. This feature wires domain workflow commands to the Svelte UI. It does NOT contain business validation rules; those live in domain value objects and aggregates. This feature consumes existing `EditNoteBody`, `TriggerIdleSave`, `TriggerBlurSave`, `CopyNoteBody`, `RequestNewNote`, `RetrySave`, `DiscardCurrentSession`, and `CancelSwitch` commands verbatim.

---

## 1. Feature Overview

The `ui-editor` feature renders and orchestrates the note editor panel — the primary capture surface of the application. It presents a multi-line Body textarea for the currently active note, tracks dirtiness, schedules debounced idle autosaves, fires blur saves on focus loss, displays saving state feedback, and handles save-failure recovery. Two supporting actions — copy body to clipboard and create a new note — are surfaced as buttons (with keyboard shortcuts).

The editor is an orchestration-only component. All business rules (empty-body detection, serialisation, file I/O, tag invariants) are delegated to domain workflows invoked via Tauri IPC. The editor's sole responsibilities are: (a) translating user input events into the correct domain commands with the correct `source` field, (b) reflecting `EditingSessionState` transitions in the UI without mutating state directly, and (c) surfacing domain error responses as user-recoverable affordances.

**In scope:**
- Body textarea with idle-debounce autosave (`IDLE_SAVE_DEBOUNCE_MS = 2000`)
- Blur autosave on focus loss
- `EditingSessionState` UI mapping for all 5 states: `idle`, `editing`, `saving`, `switching`, `save-failed`
- Save-failure banner with Retry / Discard / Cancel actions
- Copy Body button (`CopyNoteBody` command, Workflow 6)
- New Note button and Ctrl+N shortcut (`RequestNewNote` command)
- Inline validation-error hint area for Body field
- Source discrimination: every save command carries the correct `source` value

**Out of scope (belong to other features):**
- List pane / feed note rows and per-row actions
- Detail metadata column (tag chips, timestamps, createdAt/updatedAt display)
- Settings dialog / Vault configuration modal
- Cross-note search box and tag filter sidebar

---

## 2. Stakeholders & Personas

**Primary persona: Note-taker (the only user in MVP)**

The note-taker launches the app to capture prompt ideas or prose quickly, then copies the body into an AI tool. Key concerns:

- Zero friction between opening the app and typing: focus must land in the Body textarea automatically.
- Never lose a draft: autosave must be silent and reliable; failures must be recoverable without losing content.
- Instant copy: a single click copies the body without frontmatter contamination.
- Minimal chrome: the editor must not show distracting chrome when saving is proceeding normally; the save-failure banner appears only on error.

---

## 3. Functional Requirements (EARS)

### §3.1 Body Editing and Dirty Tracking

#### REQ-EDIT-001: Body Input Dispatches EditNoteBody Command

When the user changes the content of the Body textarea, the system shall dispatch an `EditNoteBody` command carrying the full current raw string as `body`. The `isDirty` property of the resulting `EditingSessionState` becomes `true` via the pure `editorReducer` processing a `NoteBodyEdited` event. The UI reads `isDirty` off `EditingSessionState`; there is NO separate optimistic UI flag. (ref: workflows.md §Workflow 2 step 1 `prepareSaveRequest`; ui-fields.md §1A-1 動的挙動; aggregates.md:258 `EditingSessionState.isDirty`; aggregates.md:273 `editing + NoteBodyEdited → isDirty=true`)

**Edge Cases**:
- Each individual keystroke dispatches `EditNoteBody`; there is no per-character debounce on command dispatch itself (debounce applies only to the save trigger).
- Dispatching `EditNoteBody` does NOT immediately trigger a save; it resets the idle debounce timer (REQ-EDIT-004).

**Acceptance Criteria**:
- Given the editor is in `editing` state and the user presses any key in the Body textarea, then `EditNoteBody` is dispatched with the updated body string.
- `isDirty` is `true` after the `NoteBodyEdited` event is processed by `editorReducer`, as read from `EditingSessionState`.
- The `EditNoteBody` command's `noteId` matches `EditingSessionState.currentNoteId`.

---

#### REQ-EDIT-002: isDirty Reset After Successful Save

When the domain signals a successful save (the editor receives confirmation that `NoteFileSaved` has been processed), `EditingSessionState.isDirty` becomes `false` via `editorReducer` processing the `saving + NoteFileSaved → isDirty=false` transition, and any pending idle debounce timer shall be cleared. The UI reads the updated `isDirty` value off `EditingSessionState`; it does NOT maintain a separate local dirty flag. (ref: aggregates.md:258 `EditingSessionState.isDirty`; aggregates.md:275 `saving + NoteFileSaved → isDirty=false`; aggregates.md:276 `saving + NoteSaveFailed → isDirty=true retained`)

**Acceptance Criteria**:
- `EditingSessionState.isDirty === false` after `NoteFileSaved` is processed by `editorReducer`.
- The idle debounce timer is cancelled after a successful save.
- `EditingSessionState.isDirty` remains `true` when `NoteSaveFailed` is processed (save failure does not clear dirty).

---

#### REQ-EDIT-003: Empty Body After Trim — Copy Button Disable

If `Body.isEmptyAfterTrim` is true for the current body content (i.e., `note.isEmpty()` returns `true`), then the system shall disable the Copy Body button with appropriate visual and ARIA treatment. If `Body.isEmptyAfterTrim` is false, the Copy Body button shall be enabled. (ref: aggregates.md `note.isEmpty(): boolean`; ui-fields.md §1A-1 空白のみは Empty Note として破棄)

**Acceptance Criteria**:
- When the textarea contains only whitespace characters (spaces, tabs, newlines), the Copy button is rendered with `disabled` attribute and `aria-disabled="true"`.
- When the textarea contains at least one non-whitespace character, the Copy button is enabled.
- The disabled visual uses Warm Gray 300 (`#a39e98`) text color per DESIGN.md §8 Disabled state.

---

### §3.2 Idle Autosave

#### REQ-EDIT-004: Idle Debounce Timer

**Spec contract constant**: `IDLE_SAVE_DEBOUNCE_MS = 2000`

When an `EditNoteBody` command is dispatched while `EditingSessionState.isDirty === true`, the system shall (re)start a debounce timer of exactly `IDLE_SAVE_DEBOUNCE_MS` milliseconds. If no further `EditNoteBody` dispatch occurs before the timer fires, the system shall fire `TriggerIdleSave { source: 'capture-idle' }` (Workflow 2). Each new `EditNoteBody` dispatch resets the timer. (ref: ui-fields.md §1A-1 動的挙動 「入力停止 ~2s で `TriggerIdleSave` 自動発火」; workflows.md §Workflow 2 概要; domain-events.md:115 `source: 'capture-idle' | 'capture-blur' | 'curate-tag-chip' | 'curate-frontmatter-edit-outside-editor'`)

**Acceptance Criteria**:
- Given the user stops typing for exactly `IDLE_SAVE_DEBOUNCE_MS` ms, `TriggerIdleSave` is fired once with `source: 'capture-idle'`.
- Given the user types again within `IDLE_SAVE_DEBOUNCE_MS` ms, the timer resets and no intermediate `TriggerIdleSave` is fired.
- `IDLE_SAVE_DEBOUNCE_MS` is defined as a named exported constant (not an inline magic number) so tests can control it via `vi.useFakeTimers()`.
- The timer is not started when `EditingSessionState.isDirty === false`.

---

#### REQ-EDIT-005: Idle Timer Cancelled on Successful Save

When a save completes successfully (per REQ-EDIT-002), the system shall cancel any running idle debounce timer so that `TriggerIdleSave` does not fire redundantly after the save. (ref: workflows.md §Workflow 2 未解決の問い 「重複保存抑制」)

**Acceptance Criteria**:
- If the idle timer fires and a save is dispatched, the timer is cleared before the next edit cycle.
- A second `TriggerIdleSave` is not dispatched for a body that was already saved.

---

### §3.3 Blur Autosave

#### REQ-EDIT-006: Blur Fires TriggerBlurSave When Dirty

When the Body textarea loses focus (blur event) while `EditingSessionState.isDirty === true`, the system shall immediately dispatch `TriggerBlurSave { source: 'capture-blur' }` (Workflow 2) and cancel any pending idle debounce timer. (ref: ui-fields.md §1A-1 動的挙動 「フォーカスアウトで `TriggerBlurSave` 自動発火」; aggregates.md `EditingSessionState` transition: `editing → saving` on `AutoSaveOnBlur`; domain-events.md:115 `source: 'capture-blur'`)

**Acceptance Criteria**:
- Given `EditingSessionState.isDirty === true` and the textarea loses focus, `TriggerBlurSave` is dispatched exactly once with `source: 'capture-blur'`.
- The pending idle debounce timer is cancelled before `TriggerBlurSave` is dispatched.
- If `EditingSessionState.isDirty === false` at the time of blur, `TriggerBlurSave` is NOT dispatched.

---

#### REQ-EDIT-007: Blur Does Not Duplicate Fire With Idle

When `TriggerBlurSave { source: 'capture-blur' }` is dispatched due to a blur event, the system shall ensure that the idle debounce timer is cancelled so that `TriggerIdleSave { source: 'capture-idle' }` does NOT also fire for the same dirty interval. Blur and idle MUST NOT both fire for the same dirty editing session. (ref: ui-fields.md §1A-1 同動的挙動; validation.md シナリオ 9; domain-events.md:115)

**Acceptance Criteria**:
- Given a blur occurs while an idle timer is pending, only `TriggerBlurSave { source: 'capture-blur' }` fires; `TriggerIdleSave` does not fire subsequently for that same edit.
- Given a blur occurs and the save completes, a subsequent restart of editing from `EditingSessionState.isDirty === false` begins a fresh debounce cycle.

---

#### REQ-EDIT-008: Blur Does Not Fire When State Is Already Saving

If the blur event arrives while `EditingSessionState.status === 'saving'`, the system shall NOT dispatch a second `TriggerBlurSave` because a save is already in flight. (ref: aggregates.md state transition table — `saving` has no outgoing `AutoSaveOnBlur` transition)

**Acceptance Criteria**:
- Given the state is `saving` and a blur event arrives, no additional `TriggerBlurSave` is dispatched.
- The in-flight save proceeds uninterrupted.

---

### §3.4 EditingSessionState UI Mapping

#### REQ-EDIT-009: Idle State — Editor Collapsed

While `EditingSessionState.status === 'idle'`, the system shall render the editor area in a collapsed/read-only placeholder state: the Body textarea is not shown in editable form, the Copy button is disabled, and no save indicator is shown. The placeholder text communicates that no note is selected. (ref: ui-fields.md §UI 状態と型の対応 `idle` 行: 「編集中ノートなし」「折りたたみ表示のみ」「コピーボタン無効」)

**Acceptance Criteria**:
- When `status === 'idle'`, the Body textarea is not interactive (either absent or `readonly`).
- The Copy button is rendered with `disabled` and `aria-disabled="true"`.
- A placeholder message is visible (e.g., "ノートを選択してください" or similar).
- The New Note button remains enabled in `idle` state (creating a note is always valid).

---

#### REQ-EDIT-010: Editing State — Active Input

While `EditingSessionState.status === 'editing'`, the system shall render the Body textarea as interactive and editable. When `EditingSessionState.isDirty === true`, a dirty indicator (e.g., a subtle badge or dot) is displayed near the textarea to signal unsaved changes. No save-failure banner is shown. `isDirty` is read directly from `EditingSessionState`; the UI maintains no separate local copy. (ref: ui-fields.md §UI 状態と型の対応 `editing` 行: 「入力可、`isDirty` バッジ」「コピーボタン有効」; DESIGN.md §4 Inputs & Forms; aggregates.md:258 `EditingSessionState.isDirty`)

**Acceptance Criteria**:
- The textarea accepts user input.
- When `EditingSessionState.isDirty === true`, a visual dirty indicator is present in the DOM.
- The Copy button is enabled when `Body.isEmptyAfterTrim === false`.
- No spinner and no error banner is shown.

---

#### REQ-EDIT-011: Saving State — In-Flight Indicator

While `EditingSessionState.status === 'saving'`, the system shall render a save-in-progress indicator (spinner or animated label) near the textarea, keep the textarea editable (the user may continue typing during save), and show the Copy button as enabled when body is non-empty. The system shall NOT disable the textarea during `saving`. (ref: ui-fields.md §UI 状態と型の対応 `saving` 行: 「入力可、保存中インジケータ」「コピーボタン有効」「削除ボタン無効」)

**Acceptance Criteria**:
- A save indicator element is present in the DOM with `aria-label` containing save-in-progress language (e.g., "保存中").
- The textarea is not `disabled` and not `readonly`.
- The `isDirty` badge (reflecting `EditingSessionState.isDirty`) may or may not be shown; the saving indicator takes precedence.

---

#### REQ-EDIT-012: Switching State — Input Locked

While `EditingSessionState.status === 'switching'`, the system shall render the textarea as non-interactive (disabled or read-only) with a visual cue indicating a note switch is pending. The Copy button and delete button shall be disabled. The user cannot make new edits until the switch completes. (ref: ui-fields.md §UI 状態と型の対応 `switching` 行: 「入力不可（save 完了待ち）」「コピーボタン無効」「削除ボタン無効」)

**Acceptance Criteria**:
- The textarea is `disabled` or has `aria-disabled="true"` and does not accept keyboard input.
- The Copy button is disabled.
- A visual cue (e.g., overlay or spinner) communicates the pending switch.

---

#### REQ-EDIT-013: Save-Failed State — Banner and Degraded Editor

While `EditingSessionState.status === 'save-failed'`, the system shall render the save-failure banner (§3.5), keep the textarea editable, and disable the Copy button and the delete affordance. Input in the textarea during this state accumulates as pending dirty content. (ref: ui-fields.md §UI 状態と型の対応 `save-failed` 行: 「失敗バナー」「入力可、再試行/破棄ボタン強調」「コピーボタン無効」「削除ボタン無効」)

**Acceptance Criteria**:
- The save-failure banner is visible (REQ-EDIT-014 through REQ-EDIT-018).
- The textarea accepts new input.
- The Copy button is disabled (`aria-disabled="true"`).

---

#### REQ-EDIT-014: State Transitions Are Domain-Driven

The system shall NOT mutate `EditingSessionState` directly from UI event handlers. All state transitions must be driven by domain events: `EditingSessionState` is received as a reactive prop or store read from the domain layer, and the UI reflects the latest value. (ref: ui-fields.md Phase 11 差し戻し: 「すべて Command 経由」; aggregates.md CaptureSession 設計原則)

**Acceptance Criteria**:
- No Svelte component in `ui-editor` constructs or mutates an `EditingSessionState` object.
- All state changes flow from the domain layer via a readable Svelte store or prop.
- The UI re-renders reactively when the store value changes.

---

### §3.5 Save-Failure Banner

#### REQ-EDIT-015: Save-Failure Banner Rendered for save-failed State

When `EditingSessionState.status === 'save-failed'`, the system shall render a non-modal inline banner within the editor area displaying a user-facing error message derived from `SaveError.kind`. (ref: ui-fields.md §画面 4; workflows.md §Workflow 8 HandleSaveFailure; validation.md シナリオ 15)

**Acceptance Criteria**:
- The banner is present in the DOM when and only when `status === 'save-failed'`.
- The banner does not use a blocking modal overlay; it is inline within the editor panel.
- The banner has `role="alert"` so screen readers announce it immediately.
- The banner has `data-testid="save-failure-banner"`.

---

#### REQ-EDIT-016: Save-Failure Banner Message Derived From SaveError.kind

When the save-failure banner is rendered, the system shall display a message corresponding to the `SaveError` `kind` nested structure as follows. The mapping is drawn verbatim from `ui-fields.md §画面 4` and `workflows.md §Workflow 2 エラーカタログ`:

| `SaveError` structure | User-facing message |
|---|---|
| `{ kind: 'fs', reason: { kind: 'permission' } }` | 「保存に失敗しました（権限不足）」 |
| `{ kind: 'fs', reason: { kind: 'disk-full' } }` | 「保存に失敗しました（ディスク容量不足）」 |
| `{ kind: 'fs', reason: { kind: 'lock' } }` | 「保存に失敗しました（ファイルがロックされています）」 |
| `{ kind: 'fs', reason: { kind: 'unknown' } }` | 「保存に失敗しました」（詳細はログ） |
| `{ kind: 'validation', reason: { kind: 'invariant-violated' } }` | 内部バグ: エラーログのみ、バナーは表示しない（サイレント） |
| `{ kind: 'validation', reason: { kind: 'empty-body-on-idle' } }` | サイレント（破棄パスへ、バナーを表示しない） |

(ref: ui-fields.md §画面 4 メッセージ分岐テーブル; workflows.md §Workflow 2 エラーカタログ `SaveError` 型定義)

**Acceptance Criteria**:
- Each `fs` error kind maps to the exact user-facing message string listed above.
- `validation.invariant-violated` does NOT render the banner; it logs to console.error and leaves the UI unchanged.
- `validation.empty-body-on-idle` does NOT render the banner; it is treated as a silent discard.
- The message element has `data-testid="save-failure-message"`.
- The TypeScript switch over `SaveError.kind` is exhaustive (compile-time guarantee; no default fallthrough without narrowing).

---

#### REQ-EDIT-017: Save-Failure Banner — Retry Button

When the save-failure banner is visible, the system shall render a 再試行 (Retry) button. When the user activates this button, the system shall dispatch the `RetrySave` command (Workflow 8), transitioning the domain state from `save-failed` to `saving`. (ref: ui-fields.md §画面 4 `RetrySave → editing から再 saving`; workflows.md §Workflow 8 分岐: `RetrySave → CaptureAutoSave を再実行`)

**Acceptance Criteria**:
- The Retry button is present and labeled "再試行" when `status === 'save-failed'`.
- Activating the button dispatches `RetrySave` exactly once.
- The button has `data-testid="retry-save-button"`.
- The button is keyboard-reachable (Tab order) and activatable via Enter/Space.
- After dispatch, the banner hides (driven by domain state transition to `saving`).

---

#### REQ-EDIT-018: Save-Failure Banner — Discard Button

When the save-failure banner is visible, the system shall render a 破棄 (Discard) button. When the user activates this button, the system shall dispatch the `DiscardCurrentSession` command (Workflow 8). If `EditingSessionState.pendingNextNoteId` is non-null, the domain will start the next note session; otherwise it returns to `idle`. (ref: ui-fields.md §画面 4 `DiscardCurrentSession → pendingNextNoteId あれば次セッション、無ければ idle`; workflows.md §Workflow 8 分岐: `DiscardCurrentSession → 編集破棄`)

**Acceptance Criteria**:
- The Discard button is present and labeled "変更を破棄" when `status === 'save-failed'`.
- Activating the button dispatches `DiscardCurrentSession` exactly once.
- The button has `data-testid="discard-session-button"`.
- The button is keyboard-reachable and activatable via Enter/Space.

---

#### REQ-EDIT-019: Save-Failure Banner — Cancel Button

When the save-failure banner is visible, the system shall render a キャンセル (Cancel) button. When the user activates this button, the system shall dispatch the `CancelSwitch` command (Workflow 8), which returns the domain state to `editing(currentNoteId)` — the user continues editing the current note. (ref: ui-fields.md §画面 4 `CancelSwitch → 元の editing(currentNoteId)`; workflows.md §Workflow 8 分岐: `CancelSwitch → 元のセッション維持`)

**Acceptance Criteria**:
- The Cancel button is present and labeled "閉じる（このまま編集を続ける）" when `status === 'save-failed'`.
- Activating the button dispatches `CancelSwitch` exactly once.
- The button has `data-testid="cancel-switch-button"`.
- The button is keyboard-reachable and activatable via Enter/Space.
- After dispatch, the banner hides (driven by domain state transition to `editing`).

---

#### REQ-EDIT-020: Save-Failure Banner Visual Style

When the save-failure banner is rendered, the system shall style it as a Deep Card (Level 3) overlay using the 5-layer Deep Shadow, with a left accent border in Orange (`#dd5b00`) to indicate warning severity. All three action buttons (Retry, Discard, Cancel) must be rendered with DESIGN.md-compliant button styles and adequate touch/click targets. (ref: DESIGN.md §4 Cards & Containers; DESIGN.md §2 Shadows & Depth Deep Shadow; DESIGN.md §4 Buttons)

**Acceptance Criteria**:
- The banner container uses the 5-layer Deep Shadow: `rgba(0,0,0,0.01) 0px 1px 3px, rgba(0,0,0,0.02) 0px 3px 7px, rgba(0,0,0,0.02) 0px 7px 15px, rgba(0,0,0,0.04) 0px 14px 28px, rgba(0,0,0,0.05) 0px 23px 52px`.
- The banner has a left accent using `#dd5b00`.
- The banner `border-radius` is 8px (Standard per DESIGN.md §5).
- Retry button uses Primary Blue style (`#0075de` background, white text, 4px radius, 8px 16px padding).
- Discard and Cancel buttons use Secondary style (`rgba(0,0,0,0.05)` background, near-black text, 4px radius).
- All button text uses Nav/Button typography: 15px weight 600.

---

### §3.6 Copy Body

#### REQ-EDIT-021: Copy Button Dispatches CopyNoteBody

When the user activates the Copy Body button and `Body.isEmptyAfterTrim === false`, the system shall dispatch the `CopyNoteBody` command (Workflow 6: `note.bodyForClipboard() → Clipboard.write`). The command carries the `noteId` of the currently active note. (ref: workflows.md §Workflow 6 CopyBody; ui-fields.md §1A-3 アクションボタン `CopyNoteBody`; aggregates.md `note.bodyForClipboard()`)

**Acceptance Criteria**:
- Activating the Copy button dispatches `CopyNoteBody` with the current `noteId`.
- `CopyNoteBody` is NOT dispatched when `Body.isEmptyAfterTrim === true`.
- The button has `data-testid="copy-body-button"`.
- The button is keyboard-reachable via Tab and activatable via Enter/Space.

---

#### REQ-EDIT-022: Copy Button Disabled State — Visual and ARIA

If `Body.isEmptyAfterTrim === true` OR `EditingSessionState.status` is one of `idle`, `switching`, `save-failed`, the Copy button shall be rendered in the disabled state: `disabled` HTML attribute, `aria-disabled="true"`, text color Warm Gray 300 (`#a39e98`), and no hover interaction. (ref: ui-fields.md §UI 状態と型の対応; DESIGN.md §8 Disabled state: `#a39e98` text, reduced opacity)

**Acceptance Criteria**:
- The `disabled` attribute is present on the Copy button in `idle`, `switching`, and `save-failed` states.
- The `disabled` attribute is present when the body is empty after trim regardless of status.
- The Copy button text/icon uses `#a39e98` color when disabled.
- No `click` handler fires while the button is disabled.

---

### §3.7 New Note (+新規ノート)

#### REQ-EDIT-023: New Note Button Dispatches RequestNewNote

When the user activates the "+ 新規" button, the system shall dispatch `RequestNewNote { source: 'explicit-button', issuedAt: Timestamp }`. (ref: ui-fields.md:78 `source は 'explicit-button' | 'ctrl-N' 判別`; ui-fields.md:295 ベース型サマリ `RequestNewNote`)

**Acceptance Criteria**:
- Activating the "+ 新規" button dispatches `RequestNewNote` with `source: 'explicit-button'`.
- The button has `data-testid="new-note-button"`.
- The button is keyboard-reachable and activatable via Enter/Space.

---

#### REQ-EDIT-024: Ctrl+N / Cmd+N Keyboard Shortcut Dispatches RequestNewNote

When the user presses Ctrl+N (Linux/Windows) or Cmd+N (macOS) while the editor panel has focus or is within the application window, the system shall dispatch `RequestNewNote { source: 'ctrl-N', issuedAt: Timestamp }`. (ref: ui-fields.md:78 `source は 'explicit-button' | 'ctrl-N' 判別`; ui-fields.md:295 ベース型サマリ)

**Platform detection**: The keyboard listener checks `event.ctrlKey || event.metaKey` combined with `event.key === 'n'` (case-insensitive). This detects `Ctrl+N` on Linux/Windows and `Cmd+N` on macOS with a single condition. The domain `source` value is always `'ctrl-N'` regardless of platform — the enum label is a semantic name, not a literal key description. This is the resolved design (see §9 RD-004).

**Acceptance Criteria**:
- Pressing `Ctrl+N` (Linux/Windows) dispatches `RequestNewNote` with `source: 'ctrl-N'`.
- Pressing `Cmd+N` (macOS, `event.metaKey === true`) dispatches `RequestNewNote` with `source: 'ctrl-N'` — same domain source value.
- The listener pattern is: `(event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n'`.
- The shortcut fires regardless of which element within the editor panel has focus (textarea, buttons, or banner).
- `event.preventDefault()` is called to prevent the browser/OS default action for this key combination.
- The `N` character itself is not inserted into the textarea when this combination is active.

---

#### REQ-EDIT-025: New Note When Current Note Is Dirty — Blur-Save First

When `RequestNewNote` is dispatched while `EditingSessionState.isDirty === true`, the system shall trigger blur-save semantics first (`TriggerBlurSave { source: 'capture-blur' }`), wait for the domain to process the save (transition from `saving` back), and only then allow the domain's `RequestNewNote` pipeline to create the new note. If the save fails (state becomes `save-failed`), the new-note creation is deferred until the user resolves the failure via Retry, Discard, or Cancel. (ref: ui-fields.md §1A-3 「blur-save semantics first, then create」; validation.md シナリオ 9 「現在の編集セッションが先に強制 blur save される」; aggregates.md `EditingSessionState` transition: `editing → switching`; domain-events.md:115)

**Acceptance Criteria**:
- When "+ 新規" or Ctrl+N/Cmd+N fires while `EditingSessionState.isDirty === true`, `TriggerBlurSave` is dispatched with `source: 'capture-blur'` before any new-note intent is processed.
- `RequestNewNote` is NOT dispatched until the domain transitions away from `saving`.
- If `status` becomes `save-failed` before the new note is created, the new-note action is suspended and the save-failure banner is displayed.

---

### §3.8 Source Discrimination

#### REQ-EDIT-026: Every Save Command Carries Explicit Source

The system shall set the `source` field on every save-triggering command explicitly in the UI layer. The UI MUST NOT allow the domain layer to infer the source. The permitted `source` values for the `ui-editor` feature are drawn verbatim from the domain event enum (ref: domain-events.md:115):

- `'capture-idle'` — idle debounce timer fired after the user stopped typing
- `'capture-blur'` — textarea blur event (including programmatic blur-save triggered for note-switch or new-note scenarios)

The values `'curate-tag-chip'` and `'curate-frontmatter-edit-outside-editor'` exist in the same domain enum but are **out of scope** for this feature (they are issued by Curate, not Capture). The values `'switch'` and `'manual'` do NOT exist in the domain enum and must NOT be used. Note-switch is handled by the domain's `EditPastNoteStart` workflow, not by a distinct save source; manual save is not in scope. (ref: domain-events.md:115; validation.md:121,176,382,399,710; aggregates.md §EditingSessionState)

**Note on IPC layer**: The `ui-editor` component depends on an injected `EditorIpcAdapter` interface; it does not hard-code Tauri command strings. See §8 and verification-architecture.md §2 for details.

**Acceptance Criteria**:
- `TriggerIdleSave` always carries `source: 'capture-idle'`.
- `TriggerBlurSave` always carries `source: 'capture-blur'` — including when called programmatically for a note switch or new-note scenario.
- No save command is dispatched without an explicit `source` field.
- The `source` value is always one of `'capture-idle' | 'capture-blur'`; any other string is a compile-time type error.

---

### §3.9 Input Field Validation Surface

#### REQ-EDIT-027: Body Field Validation Error Display

When the domain returns a validation error related to the Body field (e.g., from the `try_new_body` Rust command or from a `SaveValidationError`), the system shall display the corresponding inline error or hint text below the textarea without blocking the user from continuing to type. The textarea remains editable. (ref: ui-fields.md §検証エラー ↔ UI フィールド マッピング; ui-fields.md §重要設計前提 「Smart Constructor は Rust 側」)

**Note**: The Body value object has no constraints beyond its empty-trim check per `aggregates.md` (`try_new_body` has no validation beyond that). The primary validation surface for the editor is the `SaveValidationError` returned by `prepareSaveRequest`. The UI displays errors without blocking input; the domain decides save eligibility.

**Acceptance Criteria**:
- When a `SaveValidationError.kind === 'invariant-violated'` arrives, an error hint is logged but no inline UI message is shown to the user (per REQ-EDIT-016 silent rule).
- When a `SaveValidationError.kind === 'empty-body-on-idle'` arrives, no inline error message is shown; the save silently discards (per REQ-EDIT-016).
- The error hint area is associated with the textarea via `aria-describedby`.
- The textarea is never `disabled` as a result of a validation error alone.

---

## 4. Non-Functional Requirements

#### NFR-EDIT-001: Accessibility — Keyboard Reachability of All Actions

All interactive elements in the editor panel — Body textarea, Copy button, New Note button, and all three save-failure banner buttons (Retry, Discard, Cancel) — shall be reachable via Tab key navigation and activatable via Enter or Space. The focus order shall be logical: textarea → Copy button → New Note button → (when banner visible) Retry → Discard → Cancel. (ref: DESIGN.md §8 Accessibility & States; DESIGN.md §8 Focus System)

**Acceptance Criteria**:
- `tabIndex` is not negative on any of these elements when enabled.
- The focus ring uses `2px solid #097fe8` (Focus Blue per DESIGN.md §8).
- All buttons have descriptive `aria-label` values when their visible label is insufficient for screen readers.

---

#### NFR-EDIT-002: Accessibility — ARIA Roles and Live Regions

The save indicator shown during `saving` state shall have `role="status"` and `aria-live="polite"`. The save-failure banner shall have `role="alert"` and `aria-live="assertive"` so screen readers announce it immediately. The dirty indicator shall be `aria-hidden="true"` if it is purely decorative, or have a descriptive `aria-label` if it conveys meaningful state. (ref: DESIGN.md §8 Accessibility & States)

**Acceptance Criteria**:
- The saving indicator element has `role="status"`.
- The save-failure banner root element has `role="alert"`.
- No interactive element in the editor uses `tabIndex="-1"` while enabled.

---

#### NFR-EDIT-003: Performance — Idle Debounce Timer Overhead

The idle debounce timer implementation shall use a single `setTimeout` reference per edit cycle, not accumulating timers. On each `EditNoteBody` dispatch, the previous timer is cleared before setting the new one. At typical Body lengths for prompt notes (up to approximately 5,000 characters per DESIGN.md reading body density), there shall be no perceptible input lag (the `EditNoteBody` dispatch must complete synchronously within the event handler; the timer is fire-and-forget). (ref: ui-fields.md §未解決項目 `IDLE_SAVE_DEBOUNCE_MS=2000`)

**Acceptance Criteria**:
- The timer handle is stored in a single `$state` or `let` variable and cleared with `clearTimeout` on each new edit.
- Timer count does not grow unboundedly during a typing session.

---

#### NFR-EDIT-004: Performance — No Input Lag at Typical Body Length

The input event handler for the Body textarea shall complete synchronously without blocking the event loop. Debounce scheduling, command dispatch, and state updates must not introduce perceptible lag. (ref: validation.md 「後回しで良い未検証項目」 — MVP 想定規模は数百件まで; Body length up to ~5,000 chars)

**Acceptance Criteria**:
- The `input` event handler completes without calling any async operation synchronously.
- No `await` inside the `oninput` handler itself (async work is deferred via timer or command dispatch).

---

#### NFR-EDIT-005: DESIGN.md Visual Conformance — Warm Neutrals and Whisper Borders

All color values used in `ui-editor` Svelte components shall be drawn exclusively from DESIGN.md §10 Token Reference. The Body textarea shall use DESIGN.md §4 Inputs & Forms styling: background `#ffffff`, text `rgba(0,0,0,0.9)`, border `1px solid #dddddd` (Input Border token), radius 4px, placeholder text `#a39e98` (Warm Gray 300). (ref: DESIGN.md §4 Inputs & Forms; DESIGN.md §10 Token Reference)

**Acceptance Criteria**:
- No hex or rgba value in component source files is outside the DESIGN.md §10 Token Reference allow-list.
- The textarea border is `1px solid #dddddd` in default state, transitioning to focus ring `2px solid #097fe8` on focus.
- Placeholder text color is `#a39e98`.

---

#### NFR-EDIT-006: DESIGN.md Visual Conformance — 4-Weight Typography System

All text in `ui-editor` shall use only font-weight values `400 | 500 | 600 | 700` as defined in DESIGN.md §3. Button text shall use 15px weight 600 (Nav/Button style). Error message text shall use 14px weight 500 (Caption style). Dirty indicator badge text shall use 12px weight 600 (Badge style). (ref: DESIGN.md §3 Typography hierarchy table)

**Acceptance Criteria**:
- No `font-weight` value other than `400`, `500`, `600`, or `700` appears in component styles.
- Button text is `font-size: 15px; font-weight: 600`.

---

#### NFR-EDIT-007: DESIGN.md Visual Conformance — Layered Shadow on Banner

The save-failure banner shall use the 5-layer Deep Shadow per DESIGN.md §2 (Deep Card Level 3). No single shadow layer shall have opacity exceeding 0.05. (ref: DESIGN.md §6 Depth & Elevation; REQ-EDIT-020)

**Acceptance Criteria**:
- The banner `box-shadow` property exactly matches the 5-layer Deep Shadow string.
- Individual shadow layer opacities do not exceed 0.05.

---

#### NFR-EDIT-008: Svelte 5 Runes — State Ownership Boundary

All reactive state internal to `ui-editor` (debounce timer handle, local UI-only transient variables) shall be declared using Svelte 5 rune syntax (`$state`, `$derived`, `$effect`). `isDirty` is NOT a local Svelte state variable — it is a property of `EditingSessionState` owned by the domain layer, read via a read-only store or prop. No `writable` stores from Svelte 4 shall be introduced for local editor state. The `EditingSessionState` from the domain layer arrives as a prop or via a Svelte store that is read-only from the editor's perspective. (ref: CLAUDE.md §UI 実装ガイド — Svelte 5 runes-only; aggregates.md:258 `EditingSessionState.isDirty`)

**Acceptance Criteria**:
- Local editor state (e.g., `timerHandle`) uses `$state(...)` syntax.
- `isDirty` is NOT declared as a local `$state` variable; it is derived from `EditingSessionState`.
- No `import { writable } from 'svelte/store'` for editor-internal state.
- `EditingSessionState` is not mutated inside any `ui-editor` component.

---

## 5. Edge Case Catalogue

#### EC-EDIT-001: Rapid Typing — Debounce Burst Over 10 Seconds

Given the user types continuously for more than 10 seconds with no pause longer than `IDLE_SAVE_DEBOUNCE_MS`, the debounce timer is continuously reset and only one `TriggerIdleSave` fires after the user stops typing.

Expected behaviour: The timer is reset on each `EditNoteBody` dispatch. At t=10s+2s after the last keystroke, exactly one `TriggerIdleSave` fires. No intermediate saves occur during the typing burst.

---

#### EC-EDIT-002: Blur During In-Flight Save (Saving State)

Given `status === 'saving'` (a save is already in flight) and the user moves focus away from the textarea, the blur event arrives while the domain is processing a write.

Expected behaviour: Per REQ-EDIT-008, `TriggerBlurSave` is NOT dispatched because the state is `saving`. The in-flight save proceeds. When the save completes, the domain transitions to `editing` (or `save-failed` on failure). No double-save occurs.

---

#### EC-EDIT-003: Save Fails, User Continues Typing While Banner Is Shown

Given `status === 'save-failed'` and the save-failure banner is displayed, the user continues typing in the textarea.

Expected behaviour: Per REQ-EDIT-013, the textarea remains editable. Each keystroke dispatches `EditNoteBody`, accumulating further dirty content. The `isDirty` flag remains `true`. The idle debounce timer continues to run. If `TriggerIdleSave` fires while the state is still `save-failed`, the domain must handle the retry gate — the UI dispatches the command and reflects whatever state the domain returns. The banner remains until the user explicitly selects Retry, Discard, or Cancel.

---

#### EC-EDIT-004: Discard While Save Is Mid-Flight

Given `status === 'saving'` (write in progress) and the user somehow triggers `DiscardCurrentSession` (this scenario arises if a rapid state transition occurs from `save-failed` into `saving` via Retry, then back to `save-failed` again, and the user presses Discard).

Expected behaviour: The `DiscardCurrentSession` command is dispatched to the domain. The domain is responsible for handling the race condition between the in-flight write and the discard command. The UI does not attempt to cancel the Tauri IPC call; it dispatches the command and reflects whatever state the domain returns. If the domain ignores the discard while saving, the UI stays in `saving` until a result arrives.

---

#### EC-EDIT-005: Switching to Another Note While Dirty (Switching State Path)

Given `status === 'editing'` and `isDirty === true`, and the user selects another note from the feed (this command is owned by the feed feature, not the editor), the domain transitions to `status === 'switching'` with `pendingNextNoteId` set.

Expected behaviour: The editor reflects the `switching` state per REQ-EDIT-012 (textarea locked, Copy disabled). The idle debounce timer is cancelled. The editor does not itself dispatch `TriggerBlurSave` for this transition — that is handled by the domain's `EditPastNoteStart` workflow (`flushCurrentSession` step). When the domain completes the switch, `EditingSessionState` transitions to `editing` with the new note's content, and the editor re-enables input. If the switch fails, `status` becomes `save-failed` and the banner appears.

---

#### EC-EDIT-006: Empty Body Becomes Non-Empty After Trim (Copy Enable Transition)

Given the user has cleared the textarea to whitespace only (`Body.isEmptyAfterTrim === true`) — Copy button is disabled — and then types a non-whitespace character, `Body.isEmptyAfterTrim` becomes `false`.

Expected behaviour: The Copy button transitions from disabled to enabled reactively, within the same render frame as the `EditNoteBody` dispatch. The transition is driven by `$derived` computation on the current body string.

Conversely, given a non-empty body that is reduced to whitespace only, the Copy button transitions from enabled to disabled reactively.

---

#### EC-EDIT-007: Ctrl+N Pressed While Focus Is in Body Textarea

Given `status === 'editing'` and the textarea has focus, and the user presses Ctrl+N (Linux/Windows) or Cmd+N (macOS).

Expected behaviour: The keyboard shortcut handler detects `(event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n'`, calls `event.preventDefault()` to prevent any system behaviour, and dispatches `RequestNewNote { source: 'ctrl-N' }`. The `N` key character is NOT inserted into the textarea. Per REQ-EDIT-025, if `EditingSessionState.isDirty === true`, `TriggerBlurSave { source: 'capture-blur' }` fires first before new-note processing continues.

---

#### EC-EDIT-008: Ctrl+N Pressed While Save-Failed Banner Is Visible

Given `status === 'save-failed'` and the save-failure banner is displayed, and the user presses Ctrl+N.

Expected behaviour: The new-note request is received. Since `EditingSessionState.isDirty === true` (unsaved content exists), `TriggerBlurSave` would normally fire — but the domain is already in `save-failed` state. The domain's `HandleSaveFailure` logic determines whether a save can be retried. The UI dispatches `RequestNewNote { source: 'ctrl-N' }` and defers to the domain's state machine response. If the domain requires the failure to be resolved first, it returns `save-failed` state again, and the banner remains. The UI does not independently block the Ctrl+N/Cmd+N dispatch.

---

#### EC-EDIT-009: Idle Timer Running, OS Sleeps and Resumes

Given an idle debounce timer is running (set with `setTimeout`), and the OS enters sleep/suspension and later resumes.

Expected behaviour: `setTimeout` callbacks on most platforms fire shortly after resume even if the nominal duration has long passed. The timer fires and `TriggerIdleSave` is dispatched as if the timeout elapsed normally. The body saved will be the last `EditNoteBody` content. This is acceptable behaviour; there is no requirement to detect or suppress timers that fire due to OS resume. This scenario is acknowledged as environment-dependent and is not formally verified beyond unit-level timer mock tests.

---

#### EC-EDIT-010: New Note Attempted While State Is saving (Ctrl+N or Button)

Given `status === 'saving'` and the user activates New Note.

Expected behaviour: Per REQ-EDIT-025 and the domain's `EditPastNoteStart` workflow, the new-note intent must wait for the in-flight save to complete. The domain will set `pendingNextNoteId` to a sentinel for "new note" (or handle the queue via `EditPastNoteStart`'s switching path). The UI dispatches `RequestNewNote` and reflects the resulting `switching` state until the domain resolves. The editor locks input per REQ-EDIT-012.

---

## 6. Glossary

| Term | Definition source |
|---|---|
| `EditNoteBody` | Command dispatched on each textarea input. Carries `noteId`, `body`, `issuedAt`. — ui-fields.md §1A-1; ui-fields.md ベース型サマリ |
| `TriggerIdleSave` | Command dispatched after `IDLE_SAVE_DEBOUNCE_MS` of no further edits. `source: 'capture-idle'`. — workflows.md §Workflow 2; domain-events.md:115 |
| `TriggerBlurSave` | Command dispatched when the Body textarea loses focus while dirty. `source: 'capture-blur'`. — workflows.md §Workflow 2; domain-events.md:115 |
| `CopyNoteBody` | Command for Workflow 6 (CopyBody). Writes `note.bodyForClipboard()` to the OS clipboard. — workflows.md §Workflow 6; ui-fields.md §1A-3 |
| `RequestNewNote` | Command to create a new empty note. `source: "explicit-button" | "ctrl-N"`. — ui-fields.md §1A-3; ベース型サマリ |
| `RetrySave` | Command for Workflow 8, re-initiating save from `save-failed` state. — workflows.md §Workflow 8; ui-fields.md §画面 4 |
| `DiscardCurrentSession` | Command for Workflow 8, discarding the current dirty session. — workflows.md §Workflow 8; ui-fields.md §画面 4 |
| `CancelSwitch` | Command for Workflow 8, cancelling a pending note switch and resuming current editing. — workflows.md §Workflow 8; ui-fields.md §画面 4 |
| `EditingSessionState` | Application-layer UI state held by Capture. 5 `status` values: `idle`, `editing`, `saving`, `switching`, `save-failed`. — aggregates.md §CaptureSession |
| `isDirty` | `boolean` property of `EditingSessionState` (aggregates.md:258). Mutates synchronously inside `editorReducer`: `editing + NoteBodyEdited → isDirty=true`; `saving + NoteFileSaved → isDirty=false`; `saving + NoteSaveFailed → isDirty=true` retained. The UI reads this field directly from `EditingSessionState`; there is NO separate optimistic UI dirty flag. — aggregates.md:258,273–276 |
| `Body.isEmptyAfterTrim` | Predicate: `true` when the body string is empty after trimming whitespace. Equivalent to `note.isEmpty()`. — aggregates.md `note.isEmpty(): boolean`; ui-fields.md §1A-1 |
| `SaveError` | Discriminated union: `{ kind: 'fs', reason: FsError } | { kind: 'validation', reason: SaveValidationError }`. — workflows.md §Workflow 2 エラーカタログ |
| `pendingNextNoteId` | `NoteId | null` on `SaveFailedState`. Non-null means the failure occurred during a note switch. — aggregates.md `EditingSessionState` |
| `IDLE_SAVE_DEBOUNCE_MS` | Spec-level constant: `2000`. The debounce delay in milliseconds before idle save fires. — ui-fields.md §未解決項目; ui-fields.md §1A-1 |
| Workflow 2 (CaptureAutoSave) | Domain pipeline: `DirtyEditingSession → ValidatedSaveRequest → SerializedMarkdown → PersistedNote → IndexedNote`. — workflows.md §Workflow 2 |
| Workflow 6 (CopyBody) | Domain pipeline: `Note → ClipboardText`. — workflows.md §Workflow 6 |
| Workflow 8 (HandleSaveFailure) | Domain pipeline: `SaveFailedState → UserDecision → ResolvedState`. — workflows.md §Workflow 8 |

---

## 7. Purity Boundary Candidates

The following behaviours are **pure** (deterministic, side-effect-free, formally verifiable) and seed Phase 1b proof obligations:

- **Dirty tracking predicate**: Given `previousBody: string` and `currentBody: string`, `isDirty = currentBody !== previousBody` (or equivalent domain check). Pure function, no side effects.
- **Source classification**: The mapping from UI event type (timer fire vs blur) to `source: 'capture-idle' | 'capture-blur'` is a pure switch with no I/O. Within `ui-editor` scope only these two values are produced; `'curate-*'` values are produced by the Curate bounded context. (ref: domain-events.md:115)
- **Copy-enable predicate**: `copyEnabled = !note.isEmpty() && status !== 'idle' && status !== 'switching' && status !== 'save-failed'`. Pure function of `(body: string, status: EditingSessionState['status'])`.
- **Banner message derivation**: The mapping from `SaveError` to a user-facing string (REQ-EDIT-016) is a pure function of `SaveError`. Property testable: every `SaveError` variant maps to a non-empty string or the silent sentinel.
- **Empty-after-trim predicate**: `body.trim().length === 0` — pure string function, Rust-side equivalence can be verified by Kani.
- **Debounce reset logic** (pure core): The decision "should the timer be cleared and restarted?" is `isDirty === true` — a pure boolean expression.

The following behaviours are **impure** (effectful, outside pure verification):

- **Timer scheduling** (`setTimeout` / `clearTimeout`): Effectful; requires fake timers in tests.
- **Clipboard write** (`Clipboard.write`): OS I/O; requires mock in tests.
- **Tauri IPC for save** (calls through the `EditorIpcAdapter` interface): Network-like I/O; requires mock adapter in tests. The `ui-editor` feature invokes these through an injected port — it does not hard-code `invoke(...)` strings directly. (ref: behavioral-spec.md §9 RD-003)
- **Focus DOM events** (`blur`, `focus` on textarea): DOM side effects; requires jsdom simulation in tests.
- **`$effect` rune** registering event listeners: Runs as a side effect during component lifecycle.

---

## 8. Open Questions

7. **`Body.isEmptyAfterTrim` in TypeScript**: The UI must compute `copyEnabled` using the empty-after-trim predicate locally (before the Rust round-trip) to give immediate visual feedback. This is a pure client-side string check (`body.trim().length === 0`), not a Tauri call. This is acceptable per the purity boundary analysis and is the confirmed intended approach. No ambiguity remains; this note is retained only for traceability.

_All other formerly open questions (OQ-1 through OQ-6, OQ-8) have been resolved. See §9._

---

## 9. Resolved Decisions

| ID | Question summary | Resolution | Source |
|---|---|---|---|
| RD-001 | Exact `source` enum values for save events | `'capture-idle'` (idle timer) and `'capture-blur'` (blur / programmatic blur-save) are the two values produced by `ui-editor`. `'curate-tag-chip'` and `'curate-frontmatter-edit-outside-editor'` are out of scope. `'switch'` and `'manual'` do NOT exist in the domain enum. | domain-events.md:115; validation.md:121,176,382,399,710 |
| RD-002 | `source` for `RequestNewNote` events | `source: 'explicit-button'` (button click) and `source: 'ctrl-N'` (keyboard shortcut, both platforms) are the only two values. | ui-fields.md:78,295 |
| RD-003 | Tauri IPC command name strings | The `ui-editor` feature does NOT hard-code Tauri `invoke()` command strings. It depends on an injected `EditorIpcAdapter` interface. Concrete Tauri handler wiring (snake_case command names following the existing `invoke_configure_vault` / `settings_save` / `fs_*` convention) is deferred to the backend save-handler VCSDD feature. Pure-tier modules MUST NOT import `@tauri-apps/api`. Integration tests exercise a mock adapter. | verification-architecture.md §2 effectful shell; §5 integration tests |
| RD-004 | Ctrl+N vs Cmd+N on macOS | The keyboard listener uses `(event.ctrlKey \|\| event.metaKey) && event.key.toLowerCase() === 'n'` to detect both `Ctrl+N` (Linux/Windows) and `Cmd+N` (macOS) in a single condition. The dispatched command always carries `source: 'ctrl-N'` — the enum label is a semantic name, not a literal key description. | REQ-EDIT-024; ui-fields.md:78 |
| RD-005 | `isDirty` ownership and synchrony | `isDirty: boolean` is a property of `EditingSessionState` (aggregates.md:258). It mutates synchronously inside the pure `editorReducer`: `editing + NoteBodyEdited → isDirty=true`; `saving + NoteFileSaved → isDirty=false`; `saving + NoteSaveFailed → isDirty=true` retained. The UI reads `isDirty` off `EditingSessionState` directly; there is NO separate optimistic UI flag. | aggregates.md:258,273–276 |

---

## Requirement and Edge Case Index

### Requirements (REQ-EDIT-XXX)

| ID | Summary |
|---|---|
| REQ-EDIT-001 | Body input dispatches EditNoteBody; sets isDirty=true |
| REQ-EDIT-002 | isDirty and idle timer reset after successful save |
| REQ-EDIT-003 | Copy button disabled when Body.isEmptyAfterTrim is true |
| REQ-EDIT-004 | Idle debounce timer fires TriggerIdleSave after IDLE_SAVE_DEBOUNCE_MS (2000ms) |
| REQ-EDIT-005 | Idle timer cancelled after successful save |
| REQ-EDIT-006 | Blur fires TriggerBlurSave when dirty, cancels idle timer |
| REQ-EDIT-007 | Blur and idle do not both fire for the same dirty interval |
| REQ-EDIT-008 | Blur does not dispatch TriggerBlurSave when state is already saving |
| REQ-EDIT-009 | Idle state: editor collapsed, textarea non-interactive, Copy disabled |
| REQ-EDIT-010 | Editing state: textarea interactive, dirty indicator shown when isDirty |
| REQ-EDIT-011 | Saving state: save indicator shown, textarea remains editable |
| REQ-EDIT-012 | Switching state: textarea locked, Copy and delete disabled |
| REQ-EDIT-013 | Save-failed state: banner shown, textarea editable, Copy disabled |
| REQ-EDIT-014 | EditingSessionState mutations come only from domain layer |
| REQ-EDIT-015 | Save-failure banner rendered only in save-failed state |
| REQ-EDIT-016 | Banner message derived from SaveError.kind per exact mapping table |
| REQ-EDIT-017 | Retry button dispatches RetrySave command |
| REQ-EDIT-018 | Discard button dispatches DiscardCurrentSession command |
| REQ-EDIT-019 | Cancel button dispatches CancelSwitch command |
| REQ-EDIT-020 | Banner styled with Deep Shadow and orange accent per DESIGN.md |
| REQ-EDIT-021 | Copy button dispatches CopyNoteBody when body is non-empty after trim |
| REQ-EDIT-022 | Copy button disabled state: correct attribute and aria treatment |
| REQ-EDIT-023 | "+ 新規" button dispatches RequestNewNote with source: 'explicit-button' |
| REQ-EDIT-024 | Ctrl+N / Cmd+N shortcut dispatches RequestNewNote with source: 'ctrl-N' |
| REQ-EDIT-025 | New Note when dirty: blur-save fires first, creation deferred until save resolves |
| REQ-EDIT-026 | Every save command carries explicit source set in UI layer |
| REQ-EDIT-027 | Body validation errors displayed inline without blocking input |

### Edge Cases (EC-EDIT-XXX)

| ID | Summary |
|---|---|
| EC-EDIT-001 | Rapid typing burst >10s: only one save fires after the user stops |
| EC-EDIT-002 | Blur arrives while state is saving: no duplicate TriggerBlurSave |
| EC-EDIT-003 | Save fails while user keeps typing: textarea stays editable, banner persists |
| EC-EDIT-004 | Discard dispatched while save is mid-flight: deferred to domain |
| EC-EDIT-005 | Note switch while dirty: switching state path, idle timer cancelled |
| EC-EDIT-006 | Empty body becomes non-empty (and vice versa): Copy button toggles reactively |
| EC-EDIT-007 | Ctrl+N pressed in textarea: event.preventDefault, blur-save first if dirty |
| EC-EDIT-008 | Ctrl+N pressed while save-failed banner visible: dispatched, deferred to domain |
| EC-EDIT-009 | Idle timer running when OS sleeps/resumes: timer fires on resume, save dispatched |
| EC-EDIT-010 | New Note attempted while state is saving: editor locks, domain queues intent |
