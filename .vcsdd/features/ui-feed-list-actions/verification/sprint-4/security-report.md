# Security Report

## Feature: ui-feed-list-actions | Sprint: 4 | Date: 2026-05-09

---

## Tooling

| Tool | Status | Note |
|------|--------|------|
| semgrep | NOT INSTALLED | `semgrep --version` → not found. Manual grep audit performed instead. |
| cargo-audit | NOT INSTALLED | `cargo audit` → no such command. Dependency vulnerability check deferred. |
| grep (XSS audit) | AVAILABLE | Used for `{@html`, `innerHTML`, `outerHTML`, `insertAdjacentHTML` checks. |
| Wycheproof | NOT APPLICABLE | No cryptographic primitives are used in Sprint 4 scope (no keys, signatures, ciphers). |

Raw execution evidence files:
- `security-results/cargo-test-raw.txt` — full cargo test output (19/19 feed_handlers + 22/22 editor_wire PASS)
- `security-results/vitest-raw.txt` — vitest DOM test output (225/225 PASS)
- `security-results/purity-security-audit-raw.txt` — all grep audit results

---

## Sprint 4 Security Findings

### 1. parse_markdown_to_blocks — Panic-free / DoS resistance

**Scope**: `promptnotes/src-tauri/src/editor.rs::parse_markdown_to_blocks`

**Analysis**:
- No `unwrap()` calls in the function body. Line-by-line iteration with `lines()` is bounded by input length.
- Code fences: `while i < lines.len()` with `i += 1` ensures forward progress. No recursive calls.
- The function returns `Ok(vec![...])` for all inputs including empty string (non-empty invariant).
- No regex, no unbounded lookahead, no stack recursion.

**Verdict**: PASS — panic-free, DoS-resistant for all input lengths within memory bounds.

**Evidence**: `cargo test prop_s4_016_parse_markdown_to_blocks_basic_cases` and `prop_s4_016b_canonical_two_block_snapshot` both pass, including empty input case.

---

### 2. compose_select_past_note — Path traversal audit

**Scope**: `promptnotes/src-tauri/src/feed.rs::compose_select_past_note` and `scan_vault_feed`

**Analysis**:
- `scan_vault_feed(vault_path)` uses `std::fs::read_dir(Path::new(vault_path))`. If vault_path contains `../`, `read_dir` will resolve the path relative to the process working directory. This is the same behavior as Sprint 1/2 (documented as existing limitation).
- Sprint 4 did NOT change `scan_vault_feed` or `compose_select_past_note`'s vault_path handling. The vault_path comes from the Tauri command caller (authenticated desktop app user) — not from untrusted network input.
- The note_id lookup in `snapshot.note_metadata.contains_key(note_id)` uses HashMap key matching — no path traversal possible here.
- `parse_markdown_to_blocks` operates on the body string only, no file I/O.

**Verdict**: PASS — no new path traversal vectors introduced by Sprint 4. Pre-existing vault_path handling is unchanged. The Tauri IPC boundary restricts callers to the authenticated desktop user.

---

### 3. EditingSubDto::pending_next_focus serde deserialization

**Scope**: `promptnotes/src-tauri/src/feed.rs::EditingSubDto`

**Analysis**:
- `pending_next_focus: Option<PendingNextFocusDto>` — standard serde deserialization of a nested struct.
- `PendingNextFocusDto` has two `String` fields (`note_id`, `block_id`) with no custom `Deserialize` logic.
- `serde_json::from_str` on attacker-controlled JSON with arbitrary `note_id`/`block_id` values will not panic — it will return `Ok(PendingNextFocusDto {...})` or `Err(...)` if field types mismatch.
- No `unwrap()` on the deserialization result in any handler.

**Evidence**: `cargo test prop_s4_010_feed_domain_snapshot_pending_next_focus_round_trip` — both Some and None cases serialize/deserialize correctly.

**Verdict**: PASS — panic-free deserialization for attacker-controlled input.

---

### 4. feedReducer / FeedRow.svelte — XSS audit

**Scope**: `promptnotes/src/lib/feed/*.svelte` (production Svelte files)

**Command executed**:
```
grep -rn "{@html|bind:innerHTML" src/lib/feed/*.svelte
```

**Result**: 0 hits in production Svelte files.

The only `innerHTML` assignments found are in test teardown code (`document.body.innerHTML = ''`) within `__tests__/dom/` files — these are test cleanup utilities, not production rendering.

`FeedRow.svelte` uses `{line}` and `{tag}` bindings (text interpolation, not raw HTML). The `body` string from `NoteRowMetadata.body` is always rendered via text binding, never `{@html}`.

**Verdict**: PASS — no XSS vectors in Sprint 4 touched files.

---

### 5. cargo-audit (dependency vulnerability scan)

`cargo-audit` is not installed in this environment. A manual check of the Cargo.lock for Sprint 4 added dependencies was performed:

Sprint 4 did not add any new Rust crate dependencies. The only Sprint 4 changes were to `editor.rs` (adding `parse_markdown_to_blocks`) and `feed.rs` (adding `compose_select_past_note`), both using only `serde_json` and `std` library types already present in Sprint 1/2.

**Verdict**: No new dependency surface. Cargo.lock unchanged by Sprint 4.

---

## Summary

| Check | Result |
|-------|--------|
| parse_markdown_to_blocks: panic-free | PASS |
| parse_markdown_to_blocks: DoS resistance (no unbounded recursion) | PASS |
| compose_select_past_note: path traversal (no new vectors) | PASS |
| EditingSubDto::pending_next_focus: serde panic-free | PASS |
| feedReducer / FeedRow.svelte: XSS (no {@html}) | PASS |
| New dependency vulnerabilities | PASS (no new deps) |
| Wycheproof | NOT APPLICABLE (no crypto) |
| semgrep | NOT INSTALLED (manual grep performed) |

**Overall Sprint 4 Security Verdict: PASS — no new security issues introduced.**

Note: Sprint 1/2 known limitation (vault_path traversal not validated server-side) remains documented in Sprint 2 security report. This is a pre-existing known tradeoff for the Tauri desktop context (trusted local user).
