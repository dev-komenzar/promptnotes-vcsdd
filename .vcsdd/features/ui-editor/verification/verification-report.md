# Verification Report

## Feature: ui-editor | Sprint: 8 | Date: 2026-05-09

---

## Sprint 8 Scope

Sprint 8 migrates the Rust IPC `EditingSessionStateDto` from a 6-flat-field struct to a 5-arm tagged union (`Idle | Editing | Saving | Switching | SaveFailed`). The proof obligations for this sprint are PROP-IPC-001..023 defined in `specs/verification-architecture.md §10.2`. The verification language profile is Rust (cargo test) for tiers 0/1/2, with a cross-language TS narrowing test for PROP-IPC-011/022.

---

## Proof Obligations: PROP-IPC-001..023

| ID | Tier | Required | Status | Mechanism | Artifact |
|----|------|----------|--------|-----------|----------|
| PROP-IPC-001 | 0 (compile) | true | proved | `cargo test --tests` — `prop_ipc_001_enum_has_five_variants`: exhaustive match compile-guards all 5 variants | `tests/editor_wire_sprint8.rs:89-150` |
| PROP-IPC-002 | 1 (unit) | true | proved | `prop_ipc_002_idle_serializes_status_only`: `serde_json::to_value(Idle) == {"status":"idle"}` | `tests/editor_wire_sprint8.rs:152-170` |
| PROP-IPC-003 | 1 (unit) | true | proved | `prop_ipc_003_status_kebab_case`: per-variant kebab-case discriminant containment assertion | `tests/editor_wire_sprint8.rs:171-241` |
| PROP-IPC-004 | 1 (unit) | true | proved | `prop_ipc_004_editing_key_set_equality`: sorted BTreeSet equality for Editing key set (with/without blocks) | `tests/editor_wire_sprint8.rs:242-306` |
| PROP-IPC-005 | 1 (unit) | true | proved | `prop_ipc_005_save_failed_key_set_equality` + `prop_ipc_005_save_failed_null_literals_present`: null-literal containment for priorFocusedBlockId/pendingNextFocus | `tests/editor_wire_sprint8.rs:364-463` |
| PROP-IPC-006 | 1 (unit) | true | proved | `prop_ipc_006_saving_key_set_equality` + `prop_ipc_006_switching_key_set_equality`: key set equality for Saving and Switching variants | `tests/editor_wire_sprint8.rs:307-538` |
| PROP-IPC-007 | 1 (unit) | true | proved | `prop_ipc_007_save_error_skip_reason_when_none`: reason key absent for None; present for Some | `tests/editor_wire_sprint8.rs:539-578` |
| PROP-IPC-008 | 1 (unit) | true | proved | `prop_ipc_008_blocks_optionality`: None=absent, Some([])=`"blocks":[]`, Some([non-empty])=array | `tests/editor_wire_sprint8.rs:577-651` |
| PROP-IPC-009 | 1 (unit) | true | proved | `prop_ipc_009_helper_wraps_in_state`: `make_editing_state_changed_payload` returns Object with single key "state" | `tests/editor_wire_sprint8.rs:652-681` |
| PROP-IPC-010 | 2 (round-trip) | true | proved | `prop_ipc_010_round_trip_cover_set`: serde round-trip over all 14 hand-enumerated fixtures (F01-F14) | `tests/editor_wire_sprint8.rs:682-843` |
| PROP-IPC-011 | cross-lang (TS) | true | proved | `editorStateChannelWireFixtures.dom.vitest.ts`: 4/4 tests PASS — reads wire-fixtures.json, narrows on status, asserts Set-equality of keys per variant | `src/lib/editor/__tests__/dom/editorStateChannelWireFixtures.dom.vitest.ts` |
| PROP-IPC-012 | 1 (grep audit) | true | proved | `wire_audit.sh` PROP-IPC-012: all 5 emit sites (editor.rs:346, 421, 436, 489; feed.rs:262) preceded by `make_editing_state_changed_payload` — PASS | `tests/wire_audit.sh` |
| PROP-IPC-013 | 1 (per-handler) | true | proved | `prop_ipc_013_compose_idle`: compose_state_idle() returns Idle variant | `tests/editor_wire_sprint8.rs:943-959` |
| PROP-IPC-014 | 1 (per-handler) | true | proved | `prop_ipc_014_compose_cancel_switch`: cancel_switch Editing fields (is_dirty:true, focused_block_id:None) | `tests/editor_wire_sprint8.rs:960-994` |
| PROP-IPC-015 | 1 (per-handler) | true | proved | `prop_ipc_015_compose_request_new_note`: request_new_note Editing (is_note_empty:true, is_dirty:false) | `tests/editor_wire_sprint8.rs:995-1028` |
| PROP-IPC-016 | 1 (per-handler) | true | proved | `prop_ipc_016_compose_save_ok_and_err`: save_ok Editing (is_dirty:false, last_save_result:"success"); save_err SaveFailed fields | `tests/editor_wire_sprint8.rs:1029-1091` |
| PROP-IPC-017 | 1 (per-handler) | true | proved | `prop_ipc_017_compose_select_past_note`: select_past_note Editing (is_dirty:false, body.is_empty() → is_note_empty) | `tests/editor_wire_sprint8.rs:1092-1163` |
| PROP-IPC-018 | 0 (compile) | true | proved | `prop_ipc_018_block_type_dto_nine_variants`: exhaustive match over all 9 BlockTypeDto variants | `tests/editor_wire_sprint8.rs:845-888` |
| PROP-IPC-019 | 1 (round-trip) | true | proved | `prop_ipc_019_block_type_dto_round_trip_valid` (9 valid kebab-case strings) + `prop_ipc_019_block_type_dto_invalid_strings` (typo/cap/empty → Err) | `tests/editor_wire_sprint8.rs:889-941` |
| PROP-IPC-020 | 1 (grep audit) | true | proved | `wire_audit.sh` PROP-IPC-020: all 6 skip_serializing_if annotations are on the allow-list (blocks fields + SaveErrorDto::reason + feed.rs::detail grandfathered) — PASS | `tests/wire_audit.sh` |
| PROP-IPC-021 | 1 (grep audit) | true | proved | `wire_audit.sh` PROP-IPC-021: no legacy 6-arg `make_editing_state_changed_payload` found (single-line + multi-line awk scan) — PASS | `tests/wire_audit.sh` |
| PROP-IPC-022 | cross-lang (TS) | true | proved | `editorStateChannelWireFixtures.dom.vitest.ts`: Set-equality (not subset) on Object.keys per variant — extra Rust keys would break TS test on next CI run | `src/lib/editor/__tests__/dom/editorStateChannelWireFixtures.dom.vitest.ts` |
| PROP-IPC-023 | 1 (unit) | false | skipped | `test.todo` placeholder in `editorReducer.test.ts:374` — deferred per spec (Phase 2b when Rust cancel_switch fully emits Editing variant). The comment block at lines 355-373 contains the mechanically-replaceable assertion. | `src/lib/editor/__tests__/editorReducer.test.ts:374` |

---

## Retained Sprint 7 Obligations (unchanged, carried forward)

All Sprint 7 PROP-EDIT-001..015 and PROP-EDIT-040/042 remain proved. Sprint 8 does not modify the TS pure-core modules (editorReducer.ts, editorPredicates.ts, debounceSchedule.ts). The vitest suite ran 220/220 tests PASS confirming no regression.

---

## Test Execution Evidence

### Rust: `cargo test --tests`

```
running 43 tests  [unit]    → 43 passed
running 18 tests  [editor_handlers]  → 18 passed
running 22 tests  [editor_wire_sprint8] → 22 passed
running  8 tests  [feed_handlers]   → 8 passed

Total: 91/91 PASS
```

Command: `cd promptnotes/src-tauri && cargo test --tests`

### Wire audit: `bash tests/wire_audit.sh`

```
PASS: PROP-IPC-012: All emit sites use make_editing_state_changed_payload
PASS: PROP-IPC-020: All skip_serializing_if annotations are on the allow-list
PASS: PROP-IPC-021: No legacy 6-arg make_editing_state_changed_payload found
Summary: PASS: 3 / FAIL: 0
```

### TS fixture narrowing: `bun run vitest run editorStateChannelWireFixtures`

```
Test Files: 1 passed (1)
Tests: 4 passed (4)
```

### Full vitest suite: `bun run vitest run`

```
Test Files: 19 passed (19)
Tests: 220 passed (220)
```

### Wire fixture count: `jq 'length' tests/fixtures/wire-fixtures.json`

```
14
```

Exactly 14 fixtures (F01-F14 per §10.2.1 cover set). At least one fixture (F04) carries `blocks: Some([Paragraph, Heading1, Code, Divider])` exercising PROP-IPC-019 round-trip in passing.

---

## Spot-check of 3 Fixtures

**F01 — Idle**: `{"status":"idle"}` — no extra keys. PASS.

**F04 — Editing with 4-block array** (index 3 in wire-fixtures.json):
```json
{
  "status": "editing",
  "currentNoteId": "n1",
  "focusedBlockId": "blk-2",
  "isDirty": false,
  "isNoteEmpty": false,
  "lastSaveResult": null,
  "blocks": [
    {"content":"para","id":"b1","type":"paragraph"},
    {"content":"title","id":"b2","type":"heading-1"},
    {"content":"fn f() {}","id":"b3","type":"code"},
    {"content":"","id":"b4","type":"divider"}
  ]
}
```
null-literal `lastSaveResult:null` present (not omitted). 4 distinct BlockTypeDto variants present.

**F12 — SaveFailed with validation error** (index 11):
```json
{
  "status": "save-failed",
  "currentNoteId": "n1",
  "isNoteEmpty": true,
  "lastSaveError": {"kind":"validation"},
  "pendingNextFocus": null,
  "priorFocusedBlockId": null
}
```
`reason` key absent (skip_serializing_if applied). `priorFocusedBlockId:null` and `pendingNextFocus:null` are literal nulls (keys present). PASS.

---

## Summary

- Sprint 8 required obligations: 22 (PROP-IPC-001..022)
- Proved: 22
- Failed: 0
- Skipped (non-required): 1 (PROP-IPC-023 — `test.todo` placeholder, `required: false`)
- REQ-IPC coverage map: 20/20 entries (`grep '^///\\s+REQ-IPC' | wc -l` = 20)
- EC-IPC coverage map: 14/14 entries
- Wire fixtures: 14/14 exact

**Phase 5 gate verdict for Sprint 8: PASS**
