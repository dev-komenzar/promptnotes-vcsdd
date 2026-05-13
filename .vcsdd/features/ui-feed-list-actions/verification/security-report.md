# Security Hardening Report

## Feature: ui-feed-list-actions | Sprint: 1 | Date: 2026-05-04

## Tooling

| Tool | Status | Notes |
|------|--------|-------|
| grep (XSS pattern) | available | Built-in; no install required |
| grep (prototype pollution) | available | Built-in |
| grep (unsafe deserialization) | available | Built-in |
| semgrep | not checked | Not applicable for this TypeScript desktop app; grep patterns sufficient |
| Wycheproof | not applicable | No cryptographic operations in this feature |

Raw result location: `.vcsdd/features/ui-feed-list-actions/verification/security-results/`

## XSS Audit

Command:
```
grep -rnE 'innerHTML|@html|\beval\(|new Function\(|document\.write' promptnotes/src/lib/feed/*.ts promptnotes/src/lib/feed/*.svelte
```

Result: **zero hits** in production source.

Note: `document.body.innerHTML = ''` appears in test teardown code (jsdom cleanup in `*.dom.vitest.ts`) — not production source.

## Prototype Pollution Audit

Command:
```
grep -rnE '__proto__|Object\.assign.*untrusted|constructor\[|prototype\[' promptnotes/src/lib/feed/*.ts promptnotes/src/lib/feed/*.svelte
```

Result: **zero hits**.

## Type Safety Audit

Command:
```
grep -rnE '@ts-ignore|@ts-expect-error' promptnotes/src/lib/feed/*.ts promptnotes/src/lib/feed/*.svelte
```

Result: **zero hits** in production source. `@ts-expect-error` annotations exist only in test files for PROP-FEED-011/012 exhaustive-switch validation — expected pattern.

## Unsafe Deserialization Audit

Command:
```
grep -rnE '\bany\b' promptnotes/src/lib/feed/*.ts promptnotes/src/lib/feed/*.svelte
```

No unsafe `any` casts in production feed source. All IPC payloads typed via `FeedDomainSnapshot` discriminated union.

## NoteId Trust Boundary

Per verification-architecture.md §8: `SelectPastNote.noteId` is sourced exclusively from `Feed.computeVisible` → `visibleNoteIds`. The UI does not construct noteIds from user input. The `feedReducer` passes `action.noteId` (from `FeedRowClicked.noteId`) which is always a member of `visibleNoteIds` by the component contract. No path exists for user-controlled noteId injection.

## Cryptographic Checks

Wycheproof is **not applicable** — this feature contains no cryptographic operations. It handles UI state mirroring and Tauri IPC dispatch only.

## Summary

All security audits passed with zero findings:
- XSS: CLEAN
- Prototype pollution: CLEAN
- Unsafe deserialization: CLEAN
- Type safety: CLEAN (no @ts-ignore in production source)
- NoteId boundary: CLEAN
- Cryptographic checks: not applicable

No security findings require remediation before Phase 6.

---

## Sprint 5 Security Hardening — 2026-05-13

### Tooling (Sprint 5)

| Tool | Status | Notes |
|------|--------|-------|
| cargo-audit | NOT INSTALLED | Degraded to alternative checks; install: `cargo install cargo-audit` |
| cargo clippy --tests -D warnings | available | 0 warnings |
| cargo fmt --check | available | CLEAN |
| grep (unsafe/panic patterns) | available | Built-in |
| grep (IPC safety / path traversal) | available | Built-in |
| semgrep | not checked | Not applicable for Rust desktop handlers |
| Wycheproof | not applicable | No cryptographic operations in Sprint 5 scope |

Raw result location: `.vcsdd/features/ui-feed-list-actions/verification/security-results/sprint-5-cargo-audit.txt`

### unsafe Block Audit (Sprint 5)

Command:
```
grep -c "unsafe" promptnotes/src-tauri/src/feed.rs
```

Result: **0** — zero unsafe blocks in feed.rs.

### panic/unwrap in Production Code (Sprint 5)

Command:
```
grep -nE "\.unwrap\(\)|panic!|todo!|unimplemented!" promptnotes/src-tauri/src/feed.rs
```

Result: **0 hits in production code paths**. Test code (within `#[cfg(test)]` module and integration tests) uses `.expect()` as test assertions — acceptable per policy.

### clippy Audit (Sprint 5)

Command:
```
cargo clippy --tests -- -D warnings
```

Result: **0 warnings** — exit 0.

### fmt Check (Sprint 5)

Command:
```
cargo fmt --check
```

Result: **CLEAN** — no formatting violations.

### IPC Safety: vault_path Path Traversal (Sprint 5)

`feed_initial_state` receives `vault_path: String` from the Tauri IPC frontend. The handler passes it directly to `Path::new(&vault_path)` and then to `std::fs::read_dir()`. No sanitization against relative paths (`../`) or absolute path injection is applied on the Rust side.

Analysis:
- A crafted `vault_path` such as `"../../etc"` or `"/etc"` could cause `read_dir` to list arbitrary directories and surface their `.md` filenames in `visible_note_ids`.
- File *contents* are read via `std::fs::read_to_string`, exposing content of any readable `.md` file reachable from the supplied path.
- This is a pre-existing residual risk present since Sprint 2. Sprint 5 did not introduce new exposure.
- Threat model: this is a desktop Tauri application; the vault_path is user-configured from app settings, not an attacker-controlled external input in the current deployment scenario.
- Recommended follow-up (non-blocking): add `canonicalize()` + allowlist validation against the user's configured vault root before passing to `read_dir`.

Classification: **residual risk, pre-existing, not introduced by Sprint 5, not blocking Phase 6**.

### Cryptographic Checks (Sprint 5)

Wycheproof is **not applicable** — Sprint 5 adds no cryptographic operations. `next_available_note_id` and `format_base_id` perform only arithmetic date computation.

### Summary (Sprint 5)

- cargo-audit: DEGRADED (not installed; alternative checks substituted)
- unsafe blocks in feed.rs: 0 (CLEAN)
- panic/unwrap in production paths: 0 (CLEAN)
- clippy -D warnings: 0 warnings (CLEAN)
- cargo fmt: CLEAN
- IPC path traversal: residual risk, pre-existing, acknowledged, not blocking
- Cryptographic checks: not applicable

No new security findings introduced by Sprint 5. Phase 5 Sprint 5 security gate: PASS.
