---
coherence:
  node_id: "va:note-body-editor"
  type: verification-architecture
  name: "note-body-editor 検証アーキテクチャ"
  depends_on:
    - id: "req:note-body-editor"
      relation: verifies
  source_files:
    - "promptnotes/src-tauri/src/editor.rs"
    - "promptnotes/src-tauri/tests/editor_handlers.rs"
    - "promptnotes/src-tauri/tests/editor_wire_sprint8.rs"
    - "promptnotes/src/lib/feed/FeedRow.svelte"
  beads:
    - "PN-bx4"
    - "PN-5rt"
---

# Verification Architecture: note-body-editor

**Feature**: `note-body-editor`
**Phase**: 1b
**Mode**: lean
**Language**: Rust (src-tauri) + TypeScript/Svelte 5 (src/lib/feed)

---

## 1. Purity Boundary Map

### Pure Core (deterministic, side-effect-free, directly testable)

| ID | Function / Concern | Input | Output | Property |
|----|--------------------|-------|--------|----------|
| PURE-001 | Control character validation | `&str` | `Result<(), ValidationError>` | `validate_no_control_chars(s) == Ok(())` iff `s` contains no chars in U+0000–U+001F (except U+0009) nor U+007F |
| PURE-002 | Body change detection | `(original: &str, current: &str)` | `bool` | `has_body_changed(a, b) == (a != b)` |
| PURE-003 | Whitespace-only detection | `&str` | `bool` | `is_whitespace_only(s) == s.chars().all(|c| c.is_whitespace())` |
| PURE-004 | In-memory state transition | `(InMemoryNoteBody, &str)` | `InMemoryNoteBody` | Maps `(stored_body, new_body)` → updated struct with `is_dirty = true` on change |
| PURE-005 | isDirty transition predicate | `(InMemoryNoteBody, SaveResult)` | `bool` | True on `SaveOk(body)` when `body == current_body`, false otherwise; `is_dirty` unchanged on save failure |

These functions have no I/O, no shared mutable state, no randomness, no timers. They can be tested with `#[test]` unit tests and `proptest` property tests without any mocking.

### Effectful Shell (side effects, I/O, DOM, IPC)

| ID | Function / Concern | Side Effect | Test Approach |
|----|--------------------|-------------|---------------|
| SHELL-001 | CodeMirror mount/unmount | DOM manipulation (create/destroy `.cm-editor`) | DOM test harness (`vitest` + `@testing-library/svelte`) |
| SHELL-002 | `invoke('editor_update_note_body', ...)` | IPC cross-process call | Tauri integration test / mock `invoke` |
| SHELL-003 | `invoke('trigger_idle_save', ...)` | IPC → file write | Tauri integration test (existing pattern) |
| SHELL-004 | `invoke('trigger_blur_save', ...)` | IPC → file write | Tauri integration test (existing pattern) |
| SHELL-005 | Debounce timer (100ms IPC, 2000ms save) | Platform timer (`setTimeout`/`clearTimeout`) | Timer mock (`vi.useFakeTimers`) |
| SHELL-006 | Rust `Mutex<HashMap<NoteId, InMemoryNoteBody>>` | Mutable shared state (locking) | Concurrent access tests (`#[test]` + `std::thread::spawn`) |
| SHELL-007 | `editing_session_state_changed` event emit | Tauri event emission | Event listener spy in integration test |
| SHELL-008 | FeedRow click/blur/Escape handlers | DOM event → state mutation | DOM test harness |
| SHELL-009 | `save_note_and_emit` | `fs_write_file_atomic` + event emit | Integration test (existing `editor_handlers.rs` pattern) |

---

## 2. Proof Obligations

### PROP-001: `validate_no_control_chars` — correctness and totality

| Field | Value |
|-------|-------|
| **Description** | The control character validation function correctly rejects code points U+0000–U+001F (excluding U+0009) and U+007F, and accepts all other valid Unicode. |
| **Tier** | 1 |
| **Required** | true |
| **Covers** | REQ-003 |
| **Tool** | `proptest` (Rust) |
| **Strategy** | Generate random `String` values from a Unicode character universe; assert the function returns `Ok(())` for any string without disallowed code points, and `Err` for any string containing at least one disallowed code point. Additionally, verify that U+0009 (tab), U+000A (LF), U+000D (CR) are always accepted. |

### PROP-002: In-memory body store — sequential correctness

| Field | Value |
|-------|-------|
| **Description** | After `editor_update_note_body(noteId, body)` completes, the in-memory map contains `(noteId, body)` with `is_dirty = true`. Subsequent reads for the same noteId return the latest body. |
| **Tier** | 1 |
| **Required** | true |
| **Covers** | REQ-002 |
| **Tool** | `#[test]` unit test |
| **Strategy** | Lock the `NoteBodyStore`, insert a known body, read it back — assert body equality and `is_dirty == true`. Test update sequence: insert A, insert B, read back — assert B is stored. |

### PROP-003: In-memory body store — concurrent access safety

| Field | Value |
|-------|-------|
| **Description** | Concurrent calls to `editor_update_note_body` with the same noteId are serialized by the Mutex; no data races, no corrupted state. The final stored body is the last write. |
| **Tier** | 1 |
| **Required** | false (lean mode: NFR-002 covered by Mutex type-safety at Tier 0) |
| **Covers** | REQ-002 edge case "Concurrent Rust access", NFR-002 |
| **Tool** | `#[test]` + `std::thread::spawn` |
| **Strategy** | Spawn N threads, each writing a distinct body for the same noteId; after all join, assert the final body is one of the N bodies (last-write-wins) and no mutex is poisoned. |

### PROP-004: `isDirty` state machine — transition correctness

| Field | Value |
|-------|-------|
| **Description** | The `isDirty` flag transitions according to the spec: (1) first body update after save sets `isDirty = true`, (2) successful save sets `isDirty = false`, (3) failed save leaves `isDirty` unchanged, (4) no event is emitted on redundant transitions. |
| **Tier** | 1 |
| **Required** | true |
| **Covers** | REQ-004 |
| **Tool** | `#[test]` unit test (state machine test) |
| **Strategy** | Exercise the state machine through all valid transition sequences: `(isDirty=false) + update(newBody) → isDirty=true`, `(isDirty=true) + saveOk → isDirty=false`, `(isDirty=true) + saveFail → isDirty=true`. Property: `isDirty` is monotonic in the absence of save (never goes from true to false without a save). |

### PROP-005: Body round-trip through IPC — byte preservation

| Field | Value |
|-------|-------|
| **Description** | A body string sent via `editor_update_note_body(noteId, body)` is stored and retrievable byte-for-byte identical, including Unicode (emoji, CJK, RTL), whitespace, and large bodies (≥ 1MB). |
| **Tier** | 1 |
| **Required** | true |
| **Covers** | REQ-002 edge cases (Unicode, very long body) |
| **Tool** | `#[test]` unit test |
| **Strategy** | Insert a body containing emoji, CJK, RTL characters, and a 1MB repeated pattern; read back from the store; assert `==` equality. |

### PROP-006: Save integration — `isDirty` reset on successful save

| Field | Value |
|-------|-------|
| **Description** | After `save_note_and_emit` returns `Ok`, the in-memory map entry for the noteId has `is_dirty = false` and `last_saved_body` equals the saved body. |
| **Tier** | 1 |
| **Required** | true |
| **Covers** | REQ-004, REQ-007 |
| **Tool** | Integration test (`editor_handlers.rs` pattern) |
| **Strategy** | Populate the store with a dirty entry, call `save_note_and_emit`, assert the file is written and the store's `is_dirty` is now `false`. |

### PROP-007: Save integration — `isDirty` preserved on failed save

| Field | Value |
|-------|-------|
| **Description** | When `fs_write_file_atomic` fails (e.g., permission denied), `save_note_and_emit` emits a `save-failed` state via `editing_session_state_changed`, and the in-memory map's `is_dirty` remains `true`. |
| **Tier** | 1 |
| **Required** | true |
| **Covers** | REQ-004, REQ-007 |
| **Tool** | Integration test |
| **Strategy** | Populate store with dirty entry; attempt save to a read-only path; assert `is_dirty` is still `true` after the failed save. |

### PROP-008: Empty body handling — empty and whitespace-only

| Field | Value |
|-------|-------|
| **Description** | Empty string `""` and whitespace-only strings are valid body values: they are accepted by `editor_update_note_body`, stored correctly, saved to file, and do not cause `isDirty` transitions when the original was also empty. |
| **Tier** | 1 |
| **Required** | true |
| **Covers** | REQ-008 |
| **Tool** | `#[test]` unit test |
| **Strategy** | Insert empty `""` body; assert stored. Insert whitespace-only `"  \n\t  "`; assert stored byte-for-byte. Assert that updating an empty store entry with `""` does not set `isDirty = true` (no change). Assert that updating a non-empty store entry with `""` does set `isDirty = true`. |

### PROP-009: Frontend control-character pre-filter — blocks IPC

| Field | Value |
|-------|-------|
| **Description** | The frontend (TypeScript) `validate_no_control_chars` function rejects strings containing U+0000–U+001F (excl. U+0009) and U+007F, preventing `invoke('editor_update_note_body', ...)` from being called. |
| **Tier** | 1 |
| **Required** | true |
| **Covers** | REQ-003 |
| **Tool** | `vitest` + `fast-check` property test |
| **Strategy** | Property: For any string `s`, if `validate_no_control_chars(s)` returns `Ok`, then `s` contains no disallowed code points. Conversely, if `s` contains any disallowed code point, the function returns `Err`. Test with `fast-check`'s `fc.string()` arbitrary. |

### PROP-010: `editing_session_state_changed` event — emission on isDirty transition

| Field | Value |
|-------|-------|
| **Description** | The `editing_session_state_changed` event is emitted exactly once when `isDirty` transitions from `false` to `true` (first keystroke after save), and exactly once when transitioning from `true` to `false` (successful save). No event is emitted on redundant updates (keystroke when already dirty). |
| **Tier** | 1 |
| **Required** | false (lean mode: correctness is observable via isDirty flag; event emission is a read-path optimization) |
| **Covers** | REQ-002 item 4, REQ-004 item 5 |
| **Tool** | Integration test (Tauri `AppHandle` + event listener) |
| **Strategy** | Register a Tauri event listener on `editing_session_state_changed`. Perform sequence: insert first body → assert 1 event with `isDirty: true`. Insert second body → assert no additional event. Save → assert 1 event with `isDirty: false`. |

### PROP-011: CodeMirror lifecycle — mount/unmount idempotency

| Field | Value |
|-------|-------|
| **Description** | Mounting CodeMirror when already mounted for the same noteId is a no-op. Unmounting when not mounted does not throw. |
| **Tier** | 1 |
| **Required** | false (lean mode: frontend DOM behavior; manual testing sufficient) |
| **Covers** | REQ-001 edge case "Double-click / rapid re-click", REQ-005 edge case "Rapid Escape double-press" |
| **Tool** | DOM test harness (`vitest` + `@testing-library/svelte`) |
| **Strategy** | Mount CodeMirror for note-1. Attempt to mount again for note-1 → assert only one `.cm-editor` in DOM. Unmount twice → assert no errors. |

### PROP-012: Concurrent edit guard — single feed-row edit mode

| Field | Value |
|-------|-------|
| **Description** | At most one feed row is in inline edit mode at any time. Clicking a second row triggers blur-save + unmount of the first row before the second row's editor mounts. |
| **Tier** | 1 |
| **Required** | false (lean mode: enforced by single `editingNoteId` in `FeedViewState`; reducer-level property tested in ui-feed-list-actions) |
| **Covers** | REQ-006 |
| **Tool** | DOM test harness / reducer unit test |
| **Strategy** | Dispatch click on row A → assert `editingNoteId == A`. Dispatch click on row B → assert `editingNoteId == B` and row A editor is unmounted. Assert at no point are two editors simultaneously in DOM. |

### PROP-013: `editor_update_note_body` Tauri command — wire format correctness

| Field | Value |
|-------|-------|
| **Description** | The `editor_update_note_body` Tauri command accepts `(note_id: String, body: String)` arguments and returns `Result<(), String>`. The TypeScript-side `invoke` call passes correct argument names and types. |
| **Tier** | 0 |
| **Required** | true |
| **Covers** | REQ-002 |
| **Tool** | Compile-time (Rust type system + Tauri command registration + TS type-checking) |
| **Strategy** | The Tauri `#[command]` macro generates correct IPC deserialization. Verify with: `cargo check` passes, the command is registered in `lib.rs` `invoke_handler`, and the TS-side `invoke` call compiles (TS strict mode). |

### PROP-014: New `editor_update_note_body` command is distinct from existing `edit_note_body` no-op

| Field | Value |
|-------|-------|
| **Description** | The existing `edit_note_body` at `editor.rs:577-585` is a thin ack no-op for the block-based editor. The new `editor_update_note_body` command has a different name, different argument signature (no `issued_at` or `dirty` params), and different behavior (stores body + sets isDirty). |
| **Tier** | 0 |
| **Required** | true |
| **Covers** | REQ-002 |
| **Tool** | Compile-time (Rust type system — different function signatures ensure no accidental reuse) |
| **Strategy** | Verify: (1) `editor_update_note_body` is a distinct `#[tauri::command]` function, (2) the existing `edit_note_body` is unchanged (or removed if superseded), (3) both can coexist in the Tauri command table without signature collision. |

### PROP-015: Purity of `validate_no_control_chars` — no false positives on valid Unicode

| Field | Value |
|-------|-------|
| **Description** | The `validate_no_control_chars` function never rejects a string composed entirely of valid printable Unicode, whitespace, newlines, and tabs. |
| **Tier** | 1 |
| **Required** | true |
| **Covers** | REQ-003 |
| **Tool** | `proptest` |
| **Strategy** | Generate strings from the allowed character set (all Unicode minus the disallowed set). Assert `Ok(())` for all. This is the complement of PROP-001. |

---

## 3. Verification Strategy

### Tier 0 — Compile-Time Guarantees

| What | Tool | Why |
|------|------|-----|
| Tauri command signature correctness | `cargo check`, TypeScript strict mode | Prevents IPC type mismatch at build time |
| `Mutex`-guarded shared state | Rust borrow checker | Prevents data races at compile time |
| DTO serialization (`#[serde(rename_all = "camelCase")]`) | `serde` derive macros | Ensures JSON shape matches TS expectations |
| `InMemoryNoteBody` struct invariants | Rust type system | `String` ensures UTF-8; `bool` ensures `is_dirty` is always valid |

### Tier 1 — Property-Based Testing / Fuzzing

| Tool | Scope | What It Tests |
|------|-------|---------------|
| `proptest` (Rust) | Pure core functions (PURE-001 through PURE-005) | Randomized input generation over valid/invalid Unicode space |
| `fast-check` (TypeScript) | Frontend pure functions (`validate_no_control_chars`) | Randomized string generation covering Unicode edge cases |
| `#[test]` unit tests + `std::thread::spawn` | Concurrent access to `NoteBodyStore` | Thread safety of Mutex-based map |
| `vitest` + `vi.useFakeTimers()` | Debounce logic (SHELL-005) | Timer-based save trigger scheduling |
| `vitest` + `@testing-library/svelte` | DOM lifecycle (SHELL-001, SHELL-008) | Mount/unmount, edit mode transitions |

### Tier 2 — Lightweight Formal Methods

| Tool | Scope | What It Proves |
|------|-------|----------------|
| `kani` (Rust) | `validate_no_control_chars` (if warranted) | Absence of panics for all possible `&str` inputs |
| `kani` | In-memory state transition (PURE-004) | `is_dirty` monotonicity under all input sequences |

**Lean mode note**: Tier 2 obligations are optional. If Phase 5 (formal hardening) is invoked, the `kani` harnesses in `verification/proof-harnesses/` will be created then. For lean mode, Tier 1 is the primary verification tier.

### Tier 3 — Strong Formal Proof

Not required in lean mode. Would only be considered if this feature handled security-critical boundaries (e.g., cryptographic operations, authentication). The control character validation is the closest to a security boundary, but it is adequately covered by Tier 1 property testing.

---

## 4. Test File Layout

```
promptnotes/
├── src-tauri/
│   ├── src/
│   │   └── editor.rs                          # PURE-001..005 + SHELL-006 + SHELL-009
│   │       └── #[cfg(test)] mod tests          # PROP-001, PROP-002, PROP-004, PROP-005, PROP-008
│   ├── tests/
│   │   ├── editor_handlers.rs                  # Existing — may need new tests
│   │   ├── editor_wire_sprint8.rs              # Existing — may need new tests
│   │   └── note_body_editor_handlers.rs        # NEW: PROP-003, PROP-006, PROP-007, PROP-010 (integration)
│   └── verification/
│       └── proof-harnesses/
│           └── note_body_editor_kani.rs        # NEW: PROP-001-kani (Tier 2, optional)
│
└── src/lib/
    ├── feed/
    │   ├── __tests__/
    │   │   ├── feedRowEditMode.dom.vitest.ts   # NEW: PROP-011, PROP-012 (DOM)
    │   │   └── feedRowEditMode.prop.test.ts    # NEW: PROP-009 (fast-check property)
    │   └── FeedRow.svelte                      # SHELL-001, SHELL-008
    └── editor/
        └── __tests__/
            └── ...                              # Existing — unchanged
```

---

## 5. Regression Baseline

The following existing tests must continue to pass after this feature is implemented:

| Test Suite | File | Why |
|------------|------|-----|
| `editor_wire_sprint8` | `promptnotes/src-tauri/tests/editor_wire_sprint8.rs` | IPC wire contract for `EditingSessionStateDto` |
| `editor_handlers` | `promptnotes/src-tauri/tests/editor_handlers.rs` | `save_note_and_emit`, `fs_write_file_atomic`, DTO serialization |
| `feed_handlers` | `promptnotes/src-tauri/tests/feed_handlers.rs` | `fs_trash_file_impl`, feed module compilation |
| `editorReducer.test.ts` | `promptnotes/src/lib/editor/__tests__/` | Existing editor reducer logic |
| `editorPredicates.test.ts` | `promptnotes/src/lib/editor/__tests__/` | Existing pure predicate logic |
| Editor DOM tests | `promptnotes/src/lib/editor/__tests__/dom/` | Existing EditorPanel DOM tests |

**Regression risk**: The new `editor_update_note_body` command must NOT break the existing `edit_note_body` no-op (which is used by the block-based editor). If `edit_note_body` is removed, all call sites must be updated. The `save_note_and_emit` helper must be extended (or wrapped) to update the in-memory `NoteBodyStore` on successful save — this must not change its behavior for existing callers.

---

## 6. Verification Prioritization (Lean Mode)

In lean mode, required proofs focus on the highest-risk areas:

| Priority | PROP-IDs | Rationale |
|----------|----------|-----------|
| **P0 (must verify)** | PROP-001, PROP-002, PROP-004, PROP-005, PROP-006, PROP-007, PROP-008, PROP-009, PROP-013, PROP-014, PROP-015 | Core correctness: validation, state machine, IPC contract, empty body |
| **P1 (should verify)** | PROP-003, PROP-010 | Concurrency safety, event emission (observable behavior) |
| **P2 (nice to verify)** | PROP-011, PROP-012 | DOM lifecycle (manual QA acceptable in lean mode) |

---

## 7. Notes on Existing Code Integration

1. **`edit_note_body` (lines 577–585)**: This existing no-op command has signature `(note_id, new_body, issued_at, dirty) → Result<(), String>`. The new `editor_update_note_body` has signature `(note_id, body) → Result<(), String>`. Both are distinct Tauri commands registered in `lib.rs:293`. The existing `edit_note_body` may be left as-is (existing block-editor contract) or deprecated — this decision affects PROP-014 verification.

2. **`save_note_and_emit` (lines 558–570)**: Currently calls `fs_write_file_atomic` and emits `editing_session_state_changed`. To implement REQ-004/REQ-007, `save_note_and_emit` must be extended to also update the `NoteBodyStore` (clear `is_dirty`, set `last_saved_body`) on success. This extension must not affect existing callers (`trigger_idle_save`, `trigger_blur_save`, `retry_save`).

3. **`lib.rs` Tauri command registration**: The new `editor_update_note_body` must be added to the `invoke_handler` alongside existing commands. The existing `edit_note_body` registration should be audited for conflicts.

4. **Frontend `debounceSchedule.ts`**: The existing `IDLE_SAVE_DEBOUNCE_MS = 2000` constant and debounce pattern are reused. The new 100ms IPC debounce (frontend-local, separate from save debounce) is a new concern added in FeedRow.svelte.
