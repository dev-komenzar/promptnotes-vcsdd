# Purity Boundary Audit

## Feature: ui-editor | Sprint: 8 | Date: 2026-05-09

---

## Declared Boundaries

### TypeScript pure core (from `specs/verification-architecture.md §2`)

Pure modules (zero I/O, zero side effects, no forbidden APIs):
- `editorPredicates.ts` — canCopy, bannerMessageFor, classifySource, splitOrInsert, classifyMarkdownPrefix, classifyBackspaceAtZero
- `editorReducer.ts` — editorReducer(state, action): { state, commands }
- `debounceSchedule.ts` — computeNextFireAt, shouldFireIdleSave, nextFireAt

### Rust pure core (added in `specs/verification-architecture.md §10.1` Sprint 8)

Pure (Tier 0 data / constructors):
- `editor.rs::EditingSessionStateDto` — Rust enum with `#[derive(Serialize, Deserialize)]`. No I/O, no clock, no random.
- `editor.rs::PendingNextFocusDto`, `DtoBlock`, `SaveErrorDto`, `FsErrorDto` — same.
- `editor.rs::compose_state_idle()` — pure constructor
- `editor.rs::compose_state_for_save_ok(note_id, body)` — pure constructor
- `editor.rs::compose_state_for_save_err(note_id, body, fs_err)` — pure constructor
- `editor.rs::compose_state_for_cancel_switch(note_id)` — pure constructor
- `editor.rs::compose_state_for_request_new_note(note_id)` — pure constructor
- `editor.rs::compose_state_for_select_past_note(note_id, body)` — pure constructor
- `editor.rs::make_editing_state_changed_payload(state: &EditingSessionStateDto)` — pure JSON-value constructor

Impure shell (retain `AppHandle` access, I/O, clock):
- `editor.rs::save_note_and_emit`, `trigger_idle_save`, `trigger_blur_save`, `retry_save`, `discard_current_session`, `cancel_switch`, `request_new_note` — perform FS I/O and emit via AppHandle
- `feed.rs::select_past_note` — performs vault scan I/O and emits both `editing_session_state_changed` and `feed_state_changed`

---

## Observed Boundaries

### TypeScript pure modules (Sprint 7 result, unchanged by Sprint 8)

Sprint 8 is OUT-OF-SCOPE for TS pure-core modification. Confirmed by:
- `bun run vitest run`: 220/220 PASS — no pure-tier regressions
- Sprint 8 diff scope: only `editor.rs`, `feed.rs`, `tests/editor_wire_sprint8.rs`, `tests/editor_handlers.rs`, `tests/feed_handlers.rs`, `tests/wire_audit.sh`, `tests/fixtures/wire-fixtures.json`, and the new TS fixture test
- No changes to `editorReducer.ts`, `editorPredicates.ts`, `debounceSchedule.ts`, `types.ts` core logic

Sprint 7 purity audit result (carried forward): no forbidden-API hits in the three pure modules. No drift detected.

### Rust compose functions — purity verification

Observed function signatures and bodies (lines 249-335 of editor.rs):

| Function | Signature | I/O? | AppHandle? | clock? | random? |
|----------|-----------|------|------------|--------|---------|
| `compose_state_idle` | `() -> EditingSessionStateDto` | No | No | No | No |
| `compose_state_for_save_ok` | `(&str, &str) -> EditingSessionStateDto` | No | No | No | No |
| `compose_state_for_save_err` | `(&str, &str, FsErrorDto) -> EditingSessionStateDto` | No | No | No | No |
| `compose_state_for_cancel_switch` | `(&str) -> EditingSessionStateDto` | No | No | No | No |
| `compose_state_for_request_new_note` | `(&str) -> EditingSessionStateDto` | No | No | No | No |
| `compose_state_for_select_past_note` | `(&str, &str) -> EditingSessionStateDto` | No | No | No | No |
| `make_editing_state_changed_payload` | `(&EditingSessionStateDto) -> serde_json::Value` | No | No | No | No |

Evidence: the production code section of `editor.rs` (lines 1-511) contains `AppHandle` and `SystemTime` usages only in handler functions (`save_note_and_emit` at line 337+, `request_new_note` at lines 460+). None of the compose functions (249-319) or the payload helper (321-335) touch these.

grep confirmation: `grep -n 'app\.emit\|AppHandle\|Instant\|SystemTime\|rand' editor.rs` returns hits only at lines 337+ (handler functions), not in the compose function range 249-319.

### Handler shell functions — impurity boundary

The handler shells (`save_note_and_emit`, `discard_current_session`, `cancel_switch`, `request_new_note` in editor.rs; `select_past_note` in feed.rs) correctly confine all I/O and AppHandle side-effects. Data construction is delegated to the pure compose helpers.

Pattern per Sprint 8 contract:
```rust
let state = compose_state_for_save_ok(&note_id, &body);
let payload = make_editing_state_changed_payload(&state);
app.emit("editing_session_state_changed", payload)?;
```

This pattern is verified by PROP-IPC-012 (wire_audit.sh): all 5 emit sites in `editor.rs` (lines 346, 421, 436, 489) and `feed.rs` (line 262) are preceded by `make_editing_state_changed_payload`. No direct JSON literal construction bypasses the pure helper.

---

## Summary

| Domain | Declared Purity | Observed Drift | Action Required |
|--------|----------------|----------------|-----------------|
| TS pure-core (editorReducer/Predicates/debounceSchedule) | Pure | No drift | None |
| Rust enum DTOs (EditingSessionStateDto, DtoBlock, etc.) | Pure (data) | No drift — no I/O, no clock, no random | None |
| Rust compose_state_* functions (6 functions) | Pure | No drift — parameters-only, return value only | None |
| Rust make_editing_state_changed_payload | Pure | No drift | None |
| Rust handler shells (save_note_and_emit, etc.) | Impure (I/O at boundary) | Correct — I/O confined to handler layer, data construction via pure helpers | None |
| feed.rs::select_past_note | Impure (I/O at boundary) | Correct — editing state emit rewritten to pure compose pattern | None |

No purity boundary drift detected. No hidden side effects found. No verifier-hostile coupling (compose functions have no AppHandle parameters; they are directly unit-testable without Tauri mocks).

**Sprint 8 purity audit: PASS — no drift from declared boundaries.**
