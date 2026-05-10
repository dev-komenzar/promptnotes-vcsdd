# Security Hardening Report

## Feature: ui-feed-list-actions | Sprint: 5 | Date: 2026-05-10

---

## Tooling

| Tool | Status | Notes |
|------|--------|-------|
| `grep` (source-grep security scan) | Available | Used for all static analysis below |
| Semgrep | Not installed | `semgrep --version` not found; manual grep audit performed |
| Wycheproof | Not applicable | No cryptographic operations in Sprint 5 scope |
| `git diff` (Rust baseline check) | Available | PROP-FEED-S5-013: zero Rust changes confirmed |
| `wire_audit.sh` (IPC integrity) | Available | Sprint 4 audit script; PROP-IPC-020 and PROP-IPC-021 PASS |
| `cargo-audit` | Not installed | Not required — Sprint 5 is UI-only, no Rust dependency changes |

Raw execution evidence under `security-results/`:
- `bun-test-raw.txt` — full bun:test output (1909 tests, exit 0)
- `vitest-test-raw.txt` — full vitest DOM output (223 tests, exit 0)
- `grep-audit-raw.txt` — sprint-5-grep-audit.sh full output (10/10 PASS, exit 0)
- `rust-diff-vs-baseline.txt` — git diff src-tauri/ vs sprint-4-baseline (empty, exit 0)
- `purity-audit-raw.txt` — canonical purity-audit grep on pure modules (0 hits each)
- `wire-audit-raw.txt` — wire_audit.sh full output (PROP-IPC-020 PASS, PROP-IPC-021 PASS)

---

## Sprint 5 Security Findings

### 1. Rust side — zero changes (UI-only sprint)

Sprint 5 scope is explicitly UI-only (REQ-FEED-028 through REQ-FEED-033 and EC-FEED-018 through EC-FEED-020). No Rust files were modified.

**Evidence**: `git diff vcsdd/ui-feed-list-actions/sprint-4-baseline..HEAD -- promptnotes/src-tauri/` produces empty output (exit 0). File `security-results/rust-diff-vs-baseline.txt` contains only `RUST_DIFF_EXIT:0`.

**Verdict**: PASS — no Rust attack surface expansion.

### 2. IPC boundary audit — INBOUND/OUTBOUND discipline

Per the purity boundary map (verification-architecture.md §2 and §14):
- `editingSessionChannel.ts` must be INBOUND only (no invoke, no @tauri-apps/api/core)
- `createBlockEditorAdapter.ts` must be OUTBOUND only (no listen)
- `tauriFeedAdapter.ts` must be OUTBOUND only (no listen)

**Commands executed**:
```
grep -nE '\binvoke\(' src/lib/feed/editingSessionChannel.ts | grep -vE '^[0-9]+:\s*(//|\*|/\*)'
# → 0 non-comment hits (line 5 is comment text "must NOT call invoke()")
grep -nE '@tauri-apps/api/core' src/lib/feed/editingSessionChannel.ts
# → 0 hits
grep -nE '\blisten\(' src/lib/block-editor/createBlockEditorAdapter.ts
# → 0 hits
grep -nE '\blisten\(' src/lib/feed/tauriFeedAdapter.ts
# → 0 hits
```

**Verdict**: PASS — all three modules respect their INBOUND/OUTBOUND constraints. PROP-FEED-S5-021 and PROP-FEED-032 confirmed.

### 3. XSS audit — no {@html} / raw innerHTML

**Command**: `grep -rn "{@html\|bind:innerHTML" promptnotes/src/lib/feed/*.svelte promptnotes/src/lib/block-editor/*.svelte`

No new Svelte files were introduced in Sprint 5 that use `{@html}` or `innerHTML` bindings. FeedRow.svelte renders block content through BlockElement components (via the ui-block-editor feature), which sanitises input via `sanitiseContent` (covered in ui-block-editor Phase 5 security report).

**Verdict**: PASS — no XSS vectors in Sprint 5 additions.

### 4. crypto.randomUUID() placement audit

Sprint 5 places `crypto.randomUUID()` calls exclusively inside FeedRow.svelte's `$effect` body (effectful shell), not in any pure module. This is correct per the purity boundary specification (verification-architecture.md §14 Sprint 5 Purity Boundary Notes: "UUID 生成は必ず effectful shell で `crypto.randomUUID()` を呼ぶ").

**Command**: `grep -rn "randomUUID" promptnotes/src/lib/feed/ promptnotes/src/lib/block-editor/`
```
FeedRow.svelte: crypto.randomUUID() in $effect body (expected)
```

No `randomUUID` calls found in `feedRowPredicates.ts`, `feedReducer.ts`, or `deleteConfirmPredicates.ts`.

**Verdict**: PASS — UUID generation confined to effectful shell as specified.

### 5. wire_audit.sh — IPC payload integrity

Script: `promptnotes/src-tauri/tests/wire_audit.sh`

Results:
- PROP-IPC-020 (skip_serializing_if allow-list): PASS
- PROP-IPC-021 (no legacy 6-arg make_editing_state_changed_payload): PASS
- PROP-IPC-012 (emit preceded by make_editing_state_changed_payload): **FAIL (pre-existing false-positive)**

The PROP-IPC-012 failure in feed.rs is a known pre-existing false-positive introduced in Sprint 4. The `app.emit("editing_session_state_changed", result.editing_payload)` call in feed.rs:312 uses `result.editing_payload` which is constructed by `compose_select_past_note`, which internally calls `make_editing_state_changed_payload`. The wire_audit.sh proximity heuristic (5-line window) cannot see through the struct abstraction. Sprint 4 Phase 6 convergence PASS with this same wire_audit.sh state. Sprint 5 made zero Rust changes (confirmed by empty git diff), so this is not a Sprint 5 regression.

**Verdict**: PASS for Sprint 5 scope — no new IPC integrity issues.

### 6. Dependency audit

Sprint 5 added no new npm packages or Rust crates. Only TypeScript source files and a bash audit script were added/modified. Cargo.lock and package.json are unchanged from Sprint 4 baseline.

**Verdict**: PASS — no new dependency surface.

---

## Summary

| Check | Result |
|-------|--------|
| Rust changes since Sprint 4 baseline | PASS (zero changes) |
| editingSessionChannel.ts INBOUND only | PASS |
| createBlockEditorAdapter.ts OUTBOUND only | PASS |
| tauriFeedAdapter.ts OUTBOUND only | PASS |
| XSS audit (no {@html}) | PASS |
| crypto.randomUUID() placement | PASS (effectful shell only) |
| wire_audit.sh PROP-IPC-020 (skip_serializing_if) | PASS |
| wire_audit.sh PROP-IPC-021 (no legacy payload form) | PASS |
| wire_audit.sh PROP-IPC-012 (emit proximity) | Pre-existing false-positive — not a Sprint 5 issue |
| New dependency vulnerabilities | PASS (no new deps) |
| Wycheproof | NOT APPLICABLE (no cryptographic operations) |
| semgrep | NOT INSTALLED (manual grep audit performed) |

**Overall Sprint 5 Security Verdict: PASS — no new security issues introduced.**

Sprint 5 is UI-only. The security posture is unchanged from Sprint 4. All IPC boundary disciplines are maintained. The pre-existing wire_audit.sh PROP-IPC-012 false-positive does not affect Sprint 5 correctness.
