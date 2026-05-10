# Security Hardening Report

## Feature: ui-feed-list-actions | Sprint: 6 | Date: 2026-05-10

---

## Tooling

| Tool | Status | Notes |
|------|--------|-------|
| `grep` (source-grep security scan) | Available | Used for all static analysis |
| Semgrep | Not installed | `semgrep --version` not found; manual grep audit performed |
| Wycheproof | Not applicable | No cryptographic operations in Sprint 6 scope |
| `git diff` (Rust baseline check) | Available | PROP-FEED-S5-013: zero Rust emit-line changes confirmed |
| `wire_audit.sh` (IPC integrity) | Available | PROP-IPC-020 and PROP-IPC-021 PASS; PROP-IPC-012 pre-existing false-positive unchanged |
| bun:test v1.3.11 | Available | Full suite 1909 tests |
| vitest v4.1.5 | Available | DOM suite 240 tests |

Raw execution evidence under `security-results/`:
- `bun-test-raw.txt` — full bun:test output (1909 tests, exit 0)
- `vitest-test-raw.txt` — full vitest DOM output (240 tests, exit 0)
- `grep-audit-raw.txt` — PROP-FEED-S6-003 CSS hiding grep (0 hits, exit 1)
- `rust-diff-vs-baseline.txt` — git diff src-tauri/ vs sprint-4-baseline (empty, exit 0)
- `wire-audit-raw.txt` — wire_audit.sh full output (PROP-IPC-020 PASS, PROP-IPC-021 PASS)
- `purity-audit-raw.txt` — canonical purity-audit grep on feedRowPredicates.ts (0 hits, exit 1)

---

## Sprint 6 Security Findings

### 1. Rust side — zero changes (UI-only sprint)

Sprint 6 scope is explicitly UI-only. `FeedRow.svelte` is the sole production file changed. No Rust files were modified.

**Evidence**: `git diff vcsdd/ui-feed-list-actions/sprint-4-baseline..HEAD -- promptnotes/src-tauri/src/editor.rs promptnotes/src-tauri/src/feed.rs | grep -E '^[+-].*emit\(.(editing_session_state_changed|feed_state_changed).'` exits 1 (no matches). File `security-results/rust-diff-vs-baseline.txt` contains only `RUST_DIFF_EXIT:0`.

**Verdict**: PASS — no Rust attack surface expansion.

### 2. CSS hiding prohibition (PROP-FEED-S6-003)

The `{#if !effectiveMount}` DOM unmount mechanism is the exclusive method for hiding preview content. No CSS `display:none`, `visibility:hidden`, or `opacity:0` hiding is used.

**Command**: `grep -nE '(display:[[:space:]]*none[[:space:]]*[;}]|visibility:[[:space:]]*hidden[[:space:]]*[;}]|opacity:[[:space:]]*0[[:space:]]*[;}])' promptnotes/src/lib/feed/FeedRow.svelte`

**Result**: exit 1 (no matches). See `security-results/grep-audit-raw.txt`.

**Note**: The regex uses POSIX `[[:space:]]` (not GNU `\s`) for BSD grep portability. The `[;}]` terminator ensures `opacity: 0.04` (used in box-shadow rgba values) does not false-match.

**Verdict**: PASS — CSS hiding prohibition confirmed.

### 3. IPC boundary audit — INBOUND/OUTBOUND discipline

Per the purity boundary map (verification-architecture.md §2 and §14), no new IPC boundary violations were introduced in Sprint 6. The Sprint 6 change (`FeedRow.svelte`) does not import from `@tauri-apps/api` directly.

Checked from Sprint 5 (Sprint 6 made no changes to these files):
- `editingSessionChannel.ts` INBOUND only: `grep -nE '\binvoke\(' editingSessionChannel.ts` — comment line only, 0 non-comment hits. PROP-FEED-S5-021 PASS.
- `tauriFeedAdapter.ts` OUTBOUND only: `grep -nE '\blisten\(' tauriFeedAdapter.ts` — exit 1 (0 hits). PROP-FEED-032 PASS.

**Verdict**: PASS — IPC discipline maintained from Sprint 5; Sprint 6 added no new IPC calls.

### 4. XSS audit — no `{@html}` in FeedRow.svelte

**Command**: `grep -nE '(\{@html|innerHTML|outerHTML|insertAdjacentHTML)' promptnotes/src/lib/feed/FeedRow.svelte`

**Result**: exit 1 (no matches). FeedRow.svelte renders block content through BlockElement components which sanitise via `sanitiseContent` (ui-block-editor Phase 5 security report).

**Verdict**: PASS — no XSS vectors in Sprint 6 additions.

### 5. purity-audit grep on feedRowPredicates.ts

Sprint 6 adds no new pure helper modules. `feedRowPredicates.ts` is unchanged.

**Command**: `grep -rnE 'Date\.now|crypto\.randomUUID|Math\.random' promptnotes/src/lib/feed/feedRowPredicates.ts`

**Result**: exit 1 (no matches). See `security-results/purity-audit-raw.txt`.

The `effectiveMount` $derived expression (`shouldMountBlocks && blockEditorAdapter !== null`) is a pure boolean derivation of two Svelte `$state`/`$derived` inputs — no `Date.now()`, `crypto.randomUUID()`, `Math.random()`, or DOM APIs involved.

**Verdict**: PASS — purity boundaries intact.

### 6. wire_audit.sh — IPC payload integrity

Script: `promptnotes/src-tauri/tests/wire_audit.sh`

Results:
- PROP-IPC-020 (skip_serializing_if allow-list): PASS
- PROP-IPC-021 (no legacy 6-arg make_editing_state_changed_payload): PASS
- PROP-IPC-012 (emit preceded by make_editing_state_changed_payload): **FAIL (pre-existing false-positive, unchanged from Sprint 4)**

The PROP-IPC-012 failure is identical to that documented in Sprint 5. The `feed.rs:312` emit uses `result.editing_payload` from `compose_select_past_note`, which calls `make_editing_state_changed_payload` internally. The wire_audit.sh 5-line proximity heuristic cannot see through the struct abstraction. Sprint 6 made zero Rust changes — this is not a Sprint 6 regression. See `security-results/wire-audit-raw.txt`.

**Verdict**: PASS for Sprint 6 scope — no new IPC integrity issues.

### 7. CRIT-304 file-allowlist audit

Sprint 6 production change is exactly one source file: `promptnotes/src/lib/feed/FeedRow.svelte`. The test files added are within the CRIT-304 allowlist:
- `promptnotes/src/lib/feed/__tests__/dom/feed-row-preview-exclusivity.dom.vitest.ts`
- `promptnotes/src/lib/feed/__tests__/dom/feed-row-preview-exclusivity.property.test.ts`
- `promptnotes/src/lib/feed/__tests__/dom/feed-row-click-routing.dom.vitest.ts`
- `promptnotes/src/lib/feed/__tests__/dom/feed-row-best-effort-dispatch.dom.vitest.ts` (Sprint 5 supersession update)
- `promptnotes/src/routes/__tests__/main-route-wiring.dom.vitest.ts` (mount gate regex update)
- `promptnotes/vitest.config.ts` (test infrastructure config)
- `promptnotes/bunfig.toml` (test infrastructure config)

The broader `git diff main..HEAD --name-only` includes files from other VCSDD features (`ui-block-editor`, `ui-app-shell`, `ui-editor`) that were merged from main into the `feature/block-based-ui-migration` branch via a pre-existing merge commit (b6348ab). These are not Sprint 6 `ui-feed-list-actions` changes — they are from separate VCSDD features on the same long-running branch. Sprint 6 commits (6fc075c..dde2226) contain only the allowlisted files.

**Verdict**: PASS — 1-file production constraint satisfied for Sprint 6.

### 8. Dependency audit

Sprint 6 added no new npm packages or Rust crates. `package.json` and `Cargo.lock` are unchanged.

**Verdict**: PASS — no new dependency surface.

---

## Summary

| Check | Result |
|-------|--------|
| Rust changes since Sprint 4 baseline | PASS (zero changes) |
| CSS hiding prohibition (PROP-FEED-S6-003) | PASS (0 grep hits, exit 1) |
| editingSessionChannel.ts INBOUND only | PASS (from Sprint 5, unchanged) |
| tauriFeedAdapter.ts OUTBOUND only | PASS (from Sprint 5, unchanged) |
| XSS audit (no `{@html}` in FeedRow.svelte) | PASS |
| purity-audit grep on feedRowPredicates.ts | PASS (0 hits, exit 1) |
| effectiveMount $derived purity | PASS (pure boolean of $state/$derived inputs) |
| wire_audit.sh PROP-IPC-020 | PASS |
| wire_audit.sh PROP-IPC-021 | PASS |
| wire_audit.sh PROP-IPC-012 | Pre-existing false-positive — not a Sprint 6 issue |
| CRIT-304 1-file production constraint | PASS |
| New dependency vulnerabilities | PASS (no new deps) |
| Wycheproof | NOT APPLICABLE (no cryptographic operations) |
| Semgrep | NOT INSTALLED (manual grep audit performed) |
| bun test suite (1909 tests) | PASS |
| vitest DOM suite (240 tests) | PASS |

**Overall Sprint 6 Security Verdict: PASS — no new security issues introduced.**

Sprint 6 is UI-only (single Svelte component). The security posture is unchanged from Sprint 5. The `effectiveMount` $derived addition introduces no new I/O, cryptographic, or XSS surfaces. All IPC boundary disciplines are maintained. The CSS hiding prohibition (PROP-FEED-S6-003) is verified by grep.
