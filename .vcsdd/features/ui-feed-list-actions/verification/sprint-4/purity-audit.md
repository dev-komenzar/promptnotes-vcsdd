# Purity Audit

## Feature: ui-feed-list-actions | Sprint: 4 | Date: 2026-05-09

---

## Declared Boundaries

Per `specs/verification-architecture.md` §1/§2 (Revision 6):

### Pure Core Modules (Sprint 4 scope unchanged)

| Module | Layer | Forbidden APIs |
|--------|-------|---------------|
| `feedRowPredicates.ts` | pure | canonical purity-audit pattern (full) |
| `feedReducer.ts` | pure | canonical purity-audit pattern (full) |
| `deleteConfirmPredicates.ts` | pure | canonical purity-audit pattern (full) |

### Rust Pure Functions (Sprint 4 additions)

| Function | Classification | Reason |
|----------|---------------|--------|
| `editor::compose_state_for_select_past_note` | pure | No I/O, no AppHandle. Takes `(note_id: &str, blocks: Option<Vec<DtoBlock>>)`. Returns `EditingSessionStateDto`. |
| `editor::parse_markdown_to_blocks` | pure | No I/O. Takes `body: &str`. Returns `Result<Vec<DtoBlock>, BlockParseError>`. Pure string processing. |
| `editor::make_editing_state_changed_payload` | pure | No I/O. Takes `&EditingSessionStateDto`. Returns `serde_json::Value`. |
| `feed::compose_select_past_note` | **impure exception** (documented) | Calls `scan_vault_feed` which performs `std::fs::read_dir` + `std::fs::read_to_string`. Returns `SelectPastNoteResult`. |

### Sprint 4 Purity Boundary Notes (§13)

The canonical purity-audit grep pattern (§1) is unchanged by Sprint 4. The `feedReducer.ts` `pendingNextFocus` field change is a type-level mirror only — no runtime side effects introduced.

---

## Observed Boundaries

### TS Pure Module Purity Audit

**Command executed**:
```
grep -En "Math\.random|crypto\.|performance\.|window\.|globalThis|self\.|document\.|navigator\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\.now\b|\bDate\(|new Date\b|\$state\b|\$effect\b|\$derived\b|import\.meta|invoke\(|@tauri-apps/api" \
  src/lib/feed/feedReducer.ts \
  src/lib/feed/feedRowPredicates.ts \
  src/lib/feed/deleteConfirmPredicates.ts
```

**Result**: **0 hits** on all three pure modules.

No forbidden APIs detected in any pure module. The `pendingNextFocus` field added by Sprint 4 in `feedReducer.ts` is a plain object mirror (`snapshot.editing.pendingNextFocus`) with no side effects.

---

### PROP-FEED-030: Svelte Store Audit

**Command**: `grep -rn "from 'svelte/store'" src/lib/feed/`
**Result**: 0 hits in production feed source (hits only in test file comment `purityAudit.test.ts`).
**Status**: PASS

---

### PROP-FEED-032: IPC Boundary Audit

**Command 1**: `grep -n "listen" src/lib/feed/tauriFeedAdapter.ts`
**Result**: 0 hits — `tauriFeedAdapter.ts` contains only `invoke(...)` calls (OUTBOUND only).

**Command 2**: `grep -n "invoke" src/lib/feed/feedStateChannel.ts`
**Result**: 0 hits — `feedStateChannel.ts` contains only `listen(...)` calls (INBOUND only).

**Status**: PASS — IPC direction boundary is enforced.

---

### PROP-FEED-S4-007: Deprecated pendingNextNoteId Absent in TS Active Code

**Command**: `grep -rn "pendingNextNoteId" src/lib/feed/ src/routes/ | grep -v "__tests__"`
**Result**: 0 hits in non-test files.

Occurrences of `pendingNextNoteId` in `__tests__` are:
- `feedReducer.test.ts` line 657/659: RED phase comment (historical)
- `feedReducer.test.ts` line 725/731/733: Test `PROP-FEED-S4-006d` that **asserts the field is NOT present** (`expect(Object.prototype.hasOwnProperty.call(result.state, 'pendingNextNoteId')).toBe(false)`) — this test passes.
- `FeedRow.dom.vitest.ts` line 11/729: RED phase comments in test file preamble.

**Status**: PASS — no active production code references the deprecated field name.

---

### PROP-FEED-S4-009: Deprecated pending_next_note_id Absent in Rust Source

**Command**: `grep -rn "pending_next_note_id" src-tauri/src/`
**Result**: 0 hits (command exits with code 1).

`EditingSubDto` in `feed.rs` correctly declares `pending_next_focus: Option<crate::editor::PendingNextFocusDto>`.

**Status**: PASS

---

### Rust Pure Function Analysis (Sprint 4 additions)

#### `editor::compose_state_for_select_past_note`
- Signature: `(note_id: &str, blocks: Option<Vec<DtoBlock>>) -> EditingSessionStateDto`
- No `std::fs`, no `AppHandle`, no network calls
- Pattern matches on `&blocks` — pure value computation
- Status: **PURE** (verified by code inspection + cargo test)

#### `editor::parse_markdown_to_blocks`
- Signature: `(body: &str) -> Result<Vec<DtoBlock>, BlockParseError>`
- No `std::fs`, no `AppHandle`, no network calls
- Uses only `str::lines()`, `str::strip_prefix()`, `Vec` operations
- No `unsafe`, no `unwrap()`
- Status: **PURE**

#### `feed::compose_select_past_note`
- Signature: `(note_id: &str, vault_path: &str) -> SelectPastNoteResult`
- Calls `make_editing_state_changed_snapshot(note_id, vault_path)` which internally calls `scan_vault_feed(vault_path)`
- `scan_vault_feed` uses `std::fs::read_dir` + `std::fs::read_to_string` — **file system I/O**
- Status: **IMPURE (documented exception)**
- Classification: This is the same `scan_vault_feed` pattern established in Sprint 1/2 and documented as an existing behavior. Sprint 4 only extracted `compose_select_past_note` as a separate testable unit; no new I/O was introduced. The exception is documented in `verification-architecture.md` §13: "compose_select_past_note calls make_editing_state_changed_snapshot which scans vault (existing Sprint 1/2 behavior)."

---

## Summary

| Module | Audit | Result |
|--------|-------|--------|
| feedReducer.ts | canonical grep | PASS (0 hits) |
| feedRowPredicates.ts | canonical grep | PASS (0 hits) |
| deleteConfirmPredicates.ts | canonical grep | PASS (0 hits) |
| PROP-FEED-030: no svelte/store | grep | PASS |
| PROP-FEED-032: IPC boundary | grep | PASS |
| PROP-FEED-S4-007: pendingNextNoteId absent (TS active) | grep | PASS |
| PROP-FEED-S4-009: pending_next_note_id absent (Rust) | grep | PASS |
| editor::compose_state_for_select_past_note | code inspection | PURE |
| editor::parse_markdown_to_blocks | code inspection | PURE |
| feed::compose_select_past_note | code inspection | IMPURE (documented exception) |

**No drift detected** for pure module boundaries. Sprint 4 changes comply with the declared purity boundary map.

### Required Follow-up Before Phase 6

None. All purity boundaries are consistent with the declared spec. The `compose_select_past_note` impurity is a documented exception established in Sprint 1/2.
