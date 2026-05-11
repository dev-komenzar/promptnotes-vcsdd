---
coherence:
  node_id: "req:note-body-editor"
  type: req
  name: "note-body-editor 行動仕様 (inline feed-row CodeMirror editor)"
  depends_on:
    - id: "req:ui-feed-list-actions"
      relation: extends
    - id: "req:ui-editor"
      relation: coexists_with
    - id: "req:capture-auto-save"
      relation: integrates_with
    - id: "req:handle-save-failure"
      relation: shares_save_pipeline
  modules:
    - "note-body-editor"
    - "feed-row-inline-edit"
  source_files:
    - "promptnotes/src/lib/feed/FeedRow.svelte"
    - "promptnotes/src-tauri/src/editor.rs"
  beads:
    - "PN-3kb"  # parent epic
    - "PN-bx4"  # editor_update_note_body Rust command
    - "PN-5rt"  # CodeMirror mount/unmount in FeedRow
---

# Behavioral Specification: note-body-editor

**Feature**: `note-body-editor`
**Phase**: 1a
**Mode**: lean
**Language**: Rust (src-tauri) + TypeScript/Svelte 5 (src/lib/feed)

**Source of truth**:
- `promptnotes/src-tauri/src/editor.rs:577-585` — existing `edit_note_body` (no-op, to be replaced)
- `promptnotes/src-tauri/src/editor.rs:594-605` — `trigger_idle_save` (existing save pipeline)
- `promptnotes/src-tauri/src/editor.rs:607-618` — `trigger_blur_save` (existing save pipeline)
- `promptnotes/src-tauri/src/editor.rs:558-570` — `save_note_and_emit` (shared save helper)
- `promptnotes/src-tauri/src/lib.rs:293` — command registration for `edit_note_body`
- `promptnotes/src/lib/feed/FeedRow.svelte` — existing read-only feed row (to be extended with edit mode)
- `promptnotes/src/lib/feed/types.ts` — `NoteRowMetadata`, `FeedViewState`, `FeedCommand`, `FeedDomainSnapshot`
- `promptnotes/src/lib/editor/debounceSchedule.ts` — `IDLE_SAVE_DEBOUNCE_MS = 2000`
- `promptnotes/src/lib/editor/editorReducer.ts` — `isDirty` tracking pattern
- `@codemirror/lang-markdown`, `@codemirror/state`, `@codemirror/view` — installed but not yet used

**Scope**: A lightweight inline body editor within FeedRow.svelte. When the user clicks a feed row's body preview, the read-only preview is replaced by a CodeMirror editor instance pre-populated with the note's current body text. Typing dispatches updates to a Rust-side in-memory buffer via `editor_update_note_body`. The Rust command sets `isDirty = true` and holds the latest body. File persistence is delegated to the existing CaptureAutoSave pipeline (debounce 2s idle, immediate on blur). On exit (blur/Escape), CodeMirror unmounts and the read-only preview returns.

---

## 1. Feature Overview

The `note-body-editor` feature adds inline body editing to the feed row. This is distinct from the full `EditorPanel` (right-pane, block-based editor with per-block contenteditable elements, `/` menus, drag-and-drop, block-type conversion). The feed-row editor is lightweight: it mounts a CodeMirror instance for plain-text Markdown editing of the note's body, dispatches text changes to Rust for dirty-tracking, and delegates all file I/O to the existing CaptureAutoSave pipeline.

### In scope:
- REQ-001: Click feed row body preview → enter edit mode → CodeMirror mounts with current body text
- REQ-002: `editor_update_note_body(noteId, body)` Tauri command → stores body in-memory + sets isDirty flag
- REQ-003: Control character validation on body input (reject, not strip)
- REQ-004: isDirty tracking — true on first body change, false after successful save
- REQ-005: Exit edit mode (blur, Escape, click-away) → CodeMirror unmounts, read-only preview returns
- REQ-006: Concurrent edit detection (if another session edits the same note)
- REQ-007: Save integration — debounce 2s idle trigger, immediate blur trigger, using stored in-memory body
- REQ-008: Empty body handling (empty string, whitespace-only)

### Out of scope (covered by existing features):
- Block-based editing (`ui-editor` / `EditorPanel.svelte`)
- File write and atomicity (`capture-auto-save` — `save_note_and_emit`, `fs_write_file_atomic`)
- Save-failure recovery UX (banner, retry/discard — `handle-save-failure`)
- Tag editing, deletion, filtering (`ui-tag-chip`, `ui-feed-list-actions`)
- Note selection/switching (`edit-past-note-start`)
- Debounce timing logic (`debounceSchedule.ts` — reused verbatim)
- Frontmatter management (unchanged)

### Key design constraints:
- FeedRow edit mode and the full EditorPanel MUST NOT be active for the same note simultaneously
- CodeMirror is used for **plain text editing** — no block tree, no per-block focus, no `/` menu
- The Rust command `editor_update_note_body` only holds in-memory state (body + isDirty); it does NOT write files
- File persistence is triggered by the existing debounce/blur mechanics calling `trigger_idle_save` / `trigger_blur_save`
- The existing `edit_note_body` at `editor.rs:577-585` is currently a no-op; this feature gives it real behavior

---

## 2. Stakeholders & Personas

**Primary persona: Note-taker (MVP user)**

The note-taker navigates the feed list and wants to make a quick text correction to a note's body without opening the full block-based editor panel in the right pane. Key concerns:

- **Quick edits**: click the body text, type the correction, click away — done
- **Consistency**: the plain-text edit must produce the same markdown that the block editor would serialize
- **No data loss**: autosave must cover the inline edit session; losing focus must trigger an immediate blur save
- **Distinct from the full editor**: the user should understand this is a quick-edit surface, not a full block composition tool
- **Confidence**: the dirty indicator (isDirty) should reflect whether unsaved changes exist

---

## 3. Purity Boundary Analysis

### Pure Core (deterministic, no side effects, directly testable)
| Function / Concern | Description |
|---|---|
| Control character validation | `validate_no_control_chars(body: string) → Ok(body) \| Error` — pure string predicate |
| Body change detection | `has_body_changed(original: string, current: string) → boolean` — pure equality check |
| Whitespace-only detection | `is_whitespace_only(body: string) → boolean` — pure predicate |
| In-memory state transition | `apply_body_update(state: InMemoryNoteState, noteId: string, newBody: string) → InMemoryNoteState` — pure reducer |

### Effectful Shell (side effects, I/O, DOM, IPC)
| Function / Concern | Description |
|---|---|
| CodeMirror lifecycle | `mount(container, initialValue, onChange)` / `unmount()` — DOM manipulation |
| FeedRow click handler | `handleRowClick()` → toggles edit mode — DOM event |
| Blur / Escape handler | exits edit mode — DOM event |
| Tauri IPC invoke | `invoke('editor_update_note_body', { noteId, body })` — cross-process call |
| Debounce timer | `setTimeout(idleSaveDebounce)` / `clearTimeout(idleSaveDebounce)` — platform timer |
| In-memory state storage | Rust-side `Mutex<HashMap<NoteId, InMemoryNoteBody>>` — mutable shared state |

---

## 4. Functional Requirements (EARS)

### REQ-001: FeedRow Click Enters Body Edit Mode

**WHEN** the user clicks on the body preview area of a FeedRow (the `row-body-preview` element) AND the row is not disabled (`rowDisabled === false`) AND the full EditorPanel is not editing this same note

**THE SYSTEM SHALL**:
1. Set `editingNoteId` to the clicked `noteId` (via the existing `FeedViewState.editingNoteId`)
2. Hide the read-only `row-body-preview` div
3. Mount a CodeMirror `EditorView` instance in its place, pre-populated with `noteMetadata[noteId].body`
4. Focus the CodeMirror instance (cursor at end of text)
5. Emit no save commands (edit mode entry is UI-only; no data changes yet)

**Edge Cases**:
- **Double-click / rapid re-click**: If already in edit mode for this noteId, no-op (do not remount CodeMirror)
- **Click during save-in-progress (`status === 'saving'`)**: Block the click — `rowDisabled` must be true when `editingStatus === 'saving'` for this noteId
- **Click during switch-in-progress (`status === 'switching'`)**: Block the click — `rowDisabled` must be true
- **Click when full EditorPanel is editing the same note**: Must be prevented by the concurrent-edit guard (REQ-006); the feed-row click is a no-op in this case
- **Click row with empty body**: CodeMirror mounts with empty string `""`; editor shows empty document
- **Click row with whitespace-only body**: CodeMirror mounts with whitespace content; treated same as non-empty
- **CodeMirror JS not yet loaded**: If CodeMirror modules fail to import (dynamic import error), fall back: do not enter edit mode, log error to console, no crash

**Acceptance Criteria**:
- Clicking the body preview of a feed row opens an inline CodeMirror editor with the note's body text
- The editor is focused and ready for input (no additional click needed)
- The read-only preview is fully hidden during edit mode (no double-render)
- Clicking the same row again while editing does not remount the editor
- The `data-testid="row-body-preview"` element is replaced by a `data-testid="inline-codemirror-editor"` container

---

### REQ-002: editor_update_note_body Stores In-Memory Body and Sets isDirty

**WHEN** the user types into the CodeMirror editor (any content change, including deletion and paste)

**THE SYSTEM SHALL**:
1. **(Frontend)**: On each `CodeMirror.updateListener` / `EditorView.updateListener` change event, debounce IPC calls by at most 100ms (frontend-local "rapid-fire" debounce separate from the 2s save debounce) to avoid flooding the Tauri IPC bridge
2. **(Frontend)**: Invoke the Tauri command `editor_update_note_body(noteId, body)` where `body` is the current `editor.state.sliceDoc()` (full document text)
3. **(Rust)**: Store `(noteId, body, is_dirty: true)` in an in-memory map (e.g., `Mutex<HashMap<String, InMemoryNoteBody>>`)
4. **(Rust)**: If this is the first update for this noteId (isDirty transitions false→true), emit an `editing_session_state_changed` event with status `editing` and `isDirty: true` to notify the TypeScript side
5. **(Rust)**: Return `Ok(())` on success; return `Err(String)` only on internal mutex poison (unrecoverable)

**Edge Cases**:
- **Empty body update**: Body `""` is stored; `isDirty` remains/changes to `true` if different from saved state. Empty is a valid body value.
- **Rapid consecutive edits** (user types fast): Frontend debounce ensures at most one IPC call per 100ms; the last value within each window wins
- **Body unchanged from initial** (user types then undoes to original): isDirty may remain true if the original body was never saved; see REQ-004 for precise isDirty semantics
- **Very long body** (e.g., 100KB+): Must be handled without truncation. The in-memory map stores the full body string. Test with 1MB body.
- **Unicode characters (emoji, CJK, RTL)**: Must be preserved byte-for-byte. Rust `String` is UTF-8.
- **Control characters in body** (U+0000–U+001F except tab U+0009, U+007F): Must be rejected before reaching the Rust command (see REQ-003). Tab (U+0009) and newline (U+000A, U+000D) are permitted.
- **Concurrent Rust access** (two rapid IPC calls for same noteId): Mutex ensures sequential access; last write wins.

**Acceptance Criteria**:
- Typing in CodeMirror causes `editor_update_note_body` to be invoked (observable via Rust-side log or test spy)
- After a successful call, the Rust in-memory map contains the latest body for that noteId
- The `isDirty` flag in the in-memory map is `true` after any content change
- IPC calls for the same noteId are serialized by the Rust mutex (no data races)
- A 1MB body string round-trips correctly through the IPC call (value equality preserved)

---

### REQ-003: Control Character Rejection on Body Input

**WHEN** the user's input attempts to introduce control characters (Unicode code points U+0000–U+001F excluding tab U+0009, plus U+007F DELETE) into the body

**THE SYSTEM SHALL**:
1. **(Frontend pre-filter)**: Before invoking `editor_update_note_body`, check the body string for control characters
2. If any disallowed control character is present, DO NOT invoke the Rust command
3. Show an inline validation hint: `制御文字は入力できません` (Japanese: "Control characters cannot be entered") near the CodeMirror editor
4. The validation hint auto-dismisses after the next valid keystroke (i.e., the next keystroke that doesn't contain control chars clears the error)
5. The existing CodeMirror content is NOT reverted — the user can manually delete the offending character(s)

**Edge Cases**:
- **Tab character (U+0009)**: Permitted (used for indentation in code blocks)
- **Newline (U+000A) and carriage return (U+000D)**: Permitted (normal line breaks)
- **Single control character in large body**: Only the offending character triggers rejection; the entire update is blocked for that keystroke
- **Paste of text containing control characters**: Rejected same as typed input
- **Body with mixed valid + control chars**: Reject the entire update; user must remove the control character before the update is sent
- **Programmatic insertion** (e.g., CodeMirror extension inserting control chars): Caught by same pre-filter

**Acceptance Criteria**:
- Pasting text containing a NULL byte (U+0000) does NOT invoke `editor_update_note_body`
- A validation hint with text `制御文字は入力できません` appears near the editor (data-testid: `inline-editor-validation-hint`)
- Typing normal text after a rejected input clears the validation hint
- Tab, newline, and carriage return characters pass validation and are sent to Rust
- The body in CodeMirror is preserved after rejection (user can edit out the bad character)

---

### REQ-004: isDirty Tracking — True on Change, False After Successful Save

**WHEN** the in-memory body for a noteId changes (via `editor_update_note_body`) OR a save completes for that noteId

**THE SYSTEM SHALL**:
1. **(On body update via REQ-002)**: Set `isDirty = true` for the noteId in the in-memory map
2. **(On successful save via REQ-007)**: After `save_note_and_emit` succeeds, update the in-memory map for that noteId: store the saved body as the "last-saved body" and set `isDirty = false`
3. **(On save failure)**: `isDirty` remains `true` (unchanged)
4. **(On edit mode exit without save)**: The blur handler triggers an immediate save (REQ-005.3 → REQ-007); `isDirty` transitions to `false` only if that save succeeds
5. **Emit state change event**: When `isDirty` transitions (true→false or false→true), emit `editing_session_state_changed` with the current `EditingSessionStateDto` reflecting the new `isDirty` value

**Edge Cases**:
- **isDirty false→true transition**: First keystroke after a save. Emit editing state with `isDirty: true`.
- **isDirty true→true (no transition)**: Subsequent keystrokes while already dirty. No event emitted (avoids spam).
- **isDirty true→false transition**: Successful save. Emit editing state with `isDirty: false`, `lastSaveResult: "success"`.
- **Save of unchanged body**: If body hasn't changed since last save, `isDirty` was already false; the save is still executed (no-op write) and `isDirty` stays false
- **Body reverted to last-saved value**: If user types then undoes back to the saved body, the body string now equals the last-saved body → isDirty may still show true until explicitly saved (conservative: isDirty only clears on explicit save, not on heuristic equality check)
- **Multiple notes dirty simultaneously**: The in-memory map tracks isDirty per-noteId independently

**Acceptance Criteria**:
- After invoking `editor_update_note_body` with a new body, `isDirty` is `true` in the in-memory map
- After a successful `trigger_idle_save` or `trigger_blur_save` that writes the note, `isDirty` is `false`
- After a failed save (e.g., disk full), `isDirty` remains `true`
- An `editing_session_state_changed` event is emitted when `isDirty` transitions (and NOT on every keystroke when already dirty)

---

### REQ-005: Exit Edit Mode — CodeMirror Unmounts, Preview Returns

**WHEN** the user triggers an exit from the inline edit mode for a given noteId, via any of these triggers:
1. **Blur**: The CodeMirror editor loses focus (user clicks elsewhere, tabs away)
2. **Escape key**: The user presses the Escape key while CodeMirror is focused
3. **Click-away**: The user clicks on a different feed row or any UI element outside the CodeMirror editor
4. **Note switch**: The system programmatically switches to a different note (e.g., selecting another note in the feed)

**THE SYSTEM SHALL**:
1. Trigger an immediate blur save (see REQ-007) for the current noteId before unmounting
2. Unmount (destroy) the CodeMirror `EditorView` instance — clean up DOM node, remove event listeners, free memory
3. Restore the read-only `row-body-preview` div, reflecting the latest body (from the in-memory state or local state)
4. Clear `editingNoteId` in `FeedViewState` (or set it to null if this was the only editing row)
5. If the exit was via Escape and the body has unsaved changes (`isDirty === true`), the blur save is still triggered (Escape does NOT discard changes)

**Edge Cases**:
- **Blur while save is in progress (`status === 'saving'`)**: Do not trigger a second save; wait for the current save to complete, then unmount
- **Blur to another feed row edit**: Current row unmounts (after blur save), new row mounts CodeMirror — transition handled as two separate events (blur old, click new)
- **Blur to browser chrome / desktop**: CodeMirror unmounts; blur save fires
- **Rapid Escape double-press**: Second Escape while unmounting → no-op (idempotent)
- **Escape with no changes (`isDirty === false`)**: Still triggers blur save (which may be a no-op write), then unmounts
- **Unmount during active composition (IME)**: The browser's compositionend event fires before blur; CodeMirror commits the composition; the last composed text IS captured in the blur save body
- **CodeMirror unmount error**: If `editor.destroy()` throws, catch the error, log it, and still restore the read-only preview (graceful degradation)

**Acceptance Criteria**:
- Clicking outside the CodeMirror editor causes it to disappear and the read-only preview to reappear
- The `trigger_blur_save` IPC call is made before unmounting (observable in network/Rust log)
- Pressing Escape while editing triggers blur save then unmounts
- The `data-testid="inline-codemirror-editor"` container is removed from DOM after exit
- The `data-testid="row-body-preview"` element is restored after exit
- `editingNoteId` in `FeedViewState` is cleared after exit

---

### REQ-006: Concurrent Edit Detection

**WHEN** the user attempts to enter inline edit mode for a noteId that is already in an editing session in the full EditorPanel (right-pane block editor), OR when the full EditorPanel attempts to open a note that is currently in inline edit mode in the feed row

**THE SYSTEM SHALL**:
1. **(FeedRow → EditorPanel conflict)**: The feed row receives `FeedViewState` via the existing `editingStatus` / `editingNoteId` mirror. When `editingNoteId === noteId` AND `editingStatus === 'editing'`, the row is considered `rowDisabled`. The click does NOT enter edit mode.
2. **(EditorPanel → FeedRow conflict)**: NOT in scope for this feature — the EditorPanel already has its own concurrent-edit guard via `EditingSessionState`. However, this feature must document the bidirectional invariant.
3. **(Two feed rows attempting edit simultaneously)**: Only one feed row can be in edit mode at a time. When a second row is clicked:
   a. The first row's blur handler fires (REQ-005 exit + REQ-007 blur save)
   b. The first row unmounts its CodeMirror
   c. The second row's edit mode activates
   This is enforced by the single `editingNoteId` field in `FeedViewState` — the reducer ensures at most one non-null value.

**Edge Cases**:
- **Same note opened in both surfaces within narrow timing window**: The Rust-side in-memory map detects conflict: if an `editor_update_note_body` arrives for a noteId that was already set via the full EditorPanel's block edits, the system may emit a warning but does NOT reject the update (last-write-wins for body, but the isDirty flag still accurately reflects unsaved state)
- **FeedRow edit mode while EditorPanel is saving the same note (`status === 'saving'`)**: `rowDisabled` must be true; feed row click blocked
- **FeedRow edit mode while EditorPanel is switching (`status === 'switching'`)**: `rowDisabled` must be true; feed row click blocked
- **Rust-side in-memory map overwrite**: If both inline edit and full editor update the same noteId body, the last IPC call wins for the in-memory body buffer. The save pipeline then writes whichever body is current at save time. This is acceptable because the full editor and inline editor are not expected to be used simultaneously for the same note.

**Acceptance Criteria**:
- When the full EditorPanel is editing note `X`, clicking feed row `X`'s body does NOT open the inline editor
- When feed row `X` is in inline edit mode and feed row `Y` is clicked, row `X` exits edit mode (after blur save) and row `Y` enters edit mode
- No two feed rows are ever simultaneously in inline edit mode
- `editingNoteId` is null when no row is in edit mode

---

### REQ-007: Save Integration with CaptureAutoSave Pipeline

**WHEN** the body for a note has been modified via the inline editor and either:
1. **Idle timeout**: At least `IDLE_SAVE_DEBOUNCE_MS` (2000ms) has elapsed since the last keystroke in CodeMirror, OR
2. **Blur**: The inline editor exits (see REQ-005) with unsaved changes (`isDirty === true`)

**THE SYSTEM SHALL**:
1. **(Frontend — Idle)**: Use the existing debounce pattern from `debounceSchedule.ts`. On each CodeMirror change, reset the idle timer. When the idle timer fires (2000ms after last change), invoke `trigger_idle_save(noteId, body, issuedAt, source='capture-idle')` where `body` is the current in-memory body from the Rust side (or the frontend-tracked latest body)
2. **(Frontend — Blur)**: On blur/exit (REQ-005), immediately invoke `trigger_blur_save(noteId, body, issuedAt, source='capture-blur')`
3. **(Rust)**: The existing `trigger_idle_save` / `trigger_blur_save` handlers call `save_note_and_emit`, which:
   a. Writes the body to the `.md` file atomically via `fs_write_file_atomic`
   b. Emits `editing_session_state_changed` with `status: 'editing'`, `isDirty: false`, `lastSaveResult: 'success'` on success
   c. Emits `editing_session_state_changed` with `status: 'save-failed'` on error
4. **(Rust)**: After a successful save, update the in-memory map: store the saved body as "last-saved body", set `isDirty = false`

**Edge Cases**:
- **Idle save fires but body is empty/whitespace-only**: The existing `save_note_and_emit` writes the body as-is; the `EmptyNoteDiscarded` event from the CaptureAutoSave pipeline (which prevents saving empty notes) applies only to the block-based editor workflow. For the inline editor, empty body saving is allowed (see REQ-008).
- **Blur save during idle save**: If blur occurs while idle timer is pending, cancel the idle timer, fire the blur save immediately
- **Save fails (disk full, permission denied)**: The existing `save_note_and_emit` returns a `save-failed` state; `isDirty` remains `true`; the inline editor remains in edit mode (CodeMirror stays mounted) since the user needs to resolve the failure
- **Save succeeds but note frontmatter is stale**: Frontmatter is NOT managed by the inline editor; the existing `save_note_and_emit` does not rewrite frontmatter — this is a known limitation carried from the existing save pipeline
- **Very large body save**: The atomic write via `fs_write_file_atomic` handles arbitrary sizes; the save pipeline has no explicit size limit

**Acceptance Criteria**:
- After 2 seconds of idle typing, `trigger_idle_save` is invoked with the latest body
- After blur/exit from edit mode, `trigger_blur_save` is invoked with the latest body
- If blur occurs within 2 seconds of typing, the idle timer is cancelled and only blur save fires
- A successful save transitions `isDirty` to `false`
- A failed save leaves `isDirty` as `true` and the editor stays mounted

---

### REQ-008: Empty Body Handling

**WHEN** the body in the inline editor is, or becomes, empty (zero-length string) or consists only of whitespace characters (spaces, tabs, newlines)

**THE SYSTEM SHALL**:
1. **(Empty body update)**: Allow `editor_update_note_body` with empty `""` body — store as a valid body value
2. **(Whitespace-only body)**: Allow whitespace-only body string — stored as-is, treated identically to any non-empty body
3. **(Save empty body)**: Allow saving empty body via `trigger_idle_save` / `trigger_blur_save` — the file is written with empty body (frontmatter only in the `.md` file)
4. **(isDirty for empty body)**: If the original body was non-empty and user deletes all content, set `isDirty = true`. If the original body was already empty, and body is still empty, `isDirty` remains false (no change detected)
5. **(Display)**: An empty-body note shows an empty CodeMirror document. After exit, the read-only preview shows empty or a placeholder (e.g., no visible text). The existing `bodyPreviewLines(body, 2)` already returns an empty array for empty bodies.

**Edge Cases**:
- **User deletes all text then blurs**: Blur save fires with empty body `""`. The file is written with empty body text. `isDirty` transitions to `false` after successful save.
- **CodeMirror with only whitespace**: Treated as non-empty for UI display purposes (CodeMirror shows whitespace); treated as body content for save (whitespace is preserved)
- **Empty body after file save**: The note with empty body is valid; the feed list shows it without a body preview
- **Consecutive empty updates**: Multiple `editor_update_note_body` calls with empty body are idempotent — first call sets `isDirty = true` (if transition from non-empty), subsequent calls keep `isDirty = true` without emitting redundant events

**Acceptance Criteria**:
- Deleting all text in CodeMirror and saving produces a `.md` file with no body content (only frontmatter)
- After deleting all content from a non-empty note, `isDirty` is `true`
- After saving the empty body, `isDirty` is `false`
- The read-only preview shows nothing (empty) when the body is empty

---

## 5. Non-Functional Requirements

### NFR-001: Performance
- CodeMirror mount time (from click to interactive editor): < 300ms on modern hardware
- Keystroke-to-IPC latency: Frontend debounce window ≤ 100ms; Rust mutex hold time < 1ms (insert into HashMap)
- Memory: In-memory map overhead < 10KB per concurrently-edited note; entries are removed on save completion (body stored in save result, not map)

### NFR-002: Concurrency
- Rust in-memory map uses `Mutex<HashMap<NoteId, InMemoryNoteBody>>` — only one writer at a time per map; lock contention minimized by short critical sections
- Concurrent edits to different noteIds are non-conflicting (different map keys)
- Concurrent edits to the same noteId from different surfaces (inline editor + full editor): last write wins for the body; both surfaces see a consistent isDirty

### NFR-003: Reliability
- If the Rust process crashes between body update and save, the in-memory body is lost — but the file on disk is unaffected (save is atomic per `fs_write_file_atomic`)
- If the frontend crashes during edit, the last successfully saved body persists on disk
- CodeMirror unmount failures (e.g., DOM detached) must not crash the application — errors are caught and logged

### NFR-004: Security
- No arbitrary code execution via body content — CodeMirror renders as plain text; no HTML injection
- Control character rejection at the frontend boundary prevents injection of terminal control sequences into the file system
- The `editor_update_note_body` command does not access the file system — defense-in-depth against path traversal via noteId

---

## 6. Data Model

### Rust-side In-Memory State

```rust
/// Per-note body buffer held in-memory by the Rust backend.
struct InMemoryNoteBody {
    /// The latest body text received via editor_update_note_body.
    body: String,
    /// True when body differs from the last-saved body.
    is_dirty: bool,
    /// The body text at the time of last successful save.
    /// Used for dirty-detection: is_dirty = (body != last_saved_body).
    last_saved_body: String,
}

/// Global in-memory state protected by a mutex.
type NoteBodyStore = Mutex<HashMap<String, InMemoryNoteBody>>;
```

### Frontend Edit Mode State

The frontend tracks edit mode via the existing `FeedViewState`:
- `editingNoteId: string | null` — the noteId currently in inline edit mode (null = no inline edit)
- `editingStatus` — mirrors the domain editing status (idle, editing, saving, switching, save-failed)

No new TypeScript state types are introduced — the existing `FeedViewState` fields are sufficient.

---

## 7. Interaction Flow Diagram

```
User clicks FeedRow body preview
        │
        ▼
[FeedRow.svelte] handleRowClick()
  ├─ Check rowDisabled → block if disabled
  ├─ Check concurrent edit guard (REQ-006)
  ├─ Set editingNoteId = this.noteId
  ├─ Hide row-body-preview
  ├─ Mount CodeMirror(initialValue=body, onChange)
  └─ Focus editor
        │
        ▼
User types in CodeMirror
        │
        ▼
[CodeMirror onChange / updateListener]
  ├─ Frontend control-char check (REQ-003)
  │   ├─ FAIL → show validation hint, block IPC
  │   └─ PASS →
  ├─ Debounce 100ms (rapid-fire gate)
  └─ invoke('editor_update_note_body', { noteId, body })  [REQ-002]
        │
        ▼
[Rust] editor_update_note_body()
  ├─ Lock mutex
  ├─ Store (noteId, body, is_dirty=true)
  ├─ If isDirty transition (false→true):
  │     emit editing_session_state_changed { status: editing, isDirty: true }
  └─ Unlock mutex, return Ok(())
        │
        ▼
[Frontend] Reset idle debounce timer (2000ms)
        │
        ├── Timer fires (2s no typing) ──────────────────┐
        │                                                 ▼
        │                               invoke('trigger_idle_save', ...)
        │                                                 │
        ├── User blurs / Escapes ─────────────────────────┤
        │                                                 ▼
        │                               invoke('trigger_blur_save', ...)
        │                                                 │
        ▼                                                 ▼
[Rust] save_note_and_emit()
  ├─ fs_write_file_atomic(noteId, body)
  ├─ On success: update in-memory (is_dirty=false, last_saved_body=body)
  │              emit editing_session_state_changed { status: editing, isDirty: false }
  └─ On failure: keep is_dirty=true
                 emit editing_session_state_changed { status: save-failed }

[Frontend] On blur/exit:
  ├─ Destroy CodeMirror EditorView
  ├─ Restore row-body-preview
  └─ Clear editingNoteId
```
