# Purity Boundary Audit

## Feature: ui-feed-list-actions | Sprint: 1 | Date: 2026-05-04

## Declared Boundaries

From `specs/verification-architecture.md` §2:

### Pure Core Modules

| Module | Forbidden APIs |
|--------|---------------|
| `feedRowPredicates.ts` | canonical purity-audit pattern (full) |
| `feedReducer.ts` | canonical purity-audit pattern (full) |
| `deleteConfirmPredicates.ts` | canonical purity-audit pattern (full) |

Canonical purity-audit grep pattern (from verification-architecture.md §1):
```
Math\.random|crypto\.|performance\.|window\.|globalThis|self\.|document\.|navigator\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\.now\b|\bDate\(|new Date\b|\$state\b|\$effect\b|\$derived\b|import\.meta|invoke\(|@tauri-apps/api
```

Special note on `timestampLabel`: The spec (§1 Note) explicitly requires `timestampLabel(epochMs, locale)` to use `Intl.DateTimeFormat(locale).format(epochMs)` — passing epochMs as a number — and to not call `new Date(...)`. This is the purity guarantee for PROP-FEED-031.

### Effectful Shell Modules

`FeedList.svelte`, `FeedRow.svelte`, `DeleteConfirmModal.svelte`, `DeletionFailureBanner.svelte`, `tauriFeedAdapter.ts`, `feedStateChannel.ts`, `clockHelpers.ts` — explicitly impure.

### IPC Boundary Rules

- `tauriFeedAdapter.ts`: OUTBOUND only — `invoke(...)` permitted, `listen(...)` forbidden
- `feedStateChannel.ts`: INBOUND only — `listen(...)` permitted, `invoke(...)` forbidden

## Observed Boundaries

### Purity Audit Grep Results

Command:
```
cd promptnotes
grep -nE 'Math\.random|crypto\.|performance\.|window\.|globalThis|self\.|document\.|navigator\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\.now\b|\bDate\(|new Date\b|\$state\b|\$effect\b|\$derived\b|import\.meta|invoke\(|@tauri-apps/api' \
  src/lib/feed/feedRowPredicates.ts src/lib/feed/feedReducer.ts src/lib/feed/deleteConfirmPredicates.ts
```

Result: **zero hits** — all three pure modules are clean.

### timestampLabel Implementation Check

`feedRowPredicates.ts:70-72`:
```typescript
export function timestampLabel(epochMs: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(epochMs);
}
```

Uses `Intl.DateTimeFormat(...).format(epochMs)` where `epochMs` is passed as a number. Does NOT call `new Date(...)`, `Date.now()`, or any clock access. Purity guarantee upheld. Note: `new Intl.DateTimeFormat(...)` is an `Intl` constructor, NOT `new Date(...)` — the grep pattern `new Date\b` does not match this. PROP-FEED-031 and PROP-FEED-033 confirmed.

### IPC Boundary Audit Results

```
grep -n 'listen' promptnotes/src/lib/feed/tauriFeedAdapter.ts   → zero hits
grep -n 'invoke' promptnotes/src/lib/feed/feedStateChannel.ts   → zero hits
```

Both boundaries respected.

### Svelte Store Audit

```
grep -r "from 'svelte/store'" src/lib/feed/   → zero hits
```

No Svelte store usage in the feed layer. Svelte 5 runes only in impure shell components.

### Import Graph Verification

Pure modules import only from:
- `./types.js` (pure type definitions)
- Each other (e.g., `feedReducer.ts` imports `isFeedRowClickBlocked` from `feedRowPredicates.ts`)

No imports from `@tauri-apps/api`, `svelte`, `$app`, or any external I/O library.

## Summary

No drift detected between declared and observed boundaries.

- Purity audit grep: 0 hits on all 3 pure modules (PROP-FEED-031 PASS)
- timestampLabel: uses `Intl.DateTimeFormat#format(number)` — no clock access (PROP-FEED-033 PASS)
- IPC boundary: tauriFeedAdapter OUTBOUND-only, feedStateChannel INBOUND-only (PROP-FEED-032 PASS)
- Svelte store: zero usage in feed layer (PROP-FEED-030 PASS)
- Import graph: pure modules import only types and each other

No follow-up required before Phase 6.

---

## Sprint 5 Purity Boundary Audit — 2026-05-13

### Declared Boundaries (Sprint 5)

From `specs/verification-architecture.md` Sprint 5 additions (REQ-FEED-028):

#### Pure Core (Sprint 5)

| Function | File | Forbidden I/O |
|----------|------|---------------|
| `format_base_id(now_ms: i64) -> String` | `src/feed.rs:456-492` | SystemTime, std::fs, rand, println, Instant |
| `next_available_note_id(now_ms: i64, existing: &HashSet<String>) -> String` | `src/feed.rs:504-517` | SystemTime, std::fs, rand, println, Instant |
| `compose_initial_snapshot_with_autocreate(existing_visible_ids, existing_metadata, now_ms: i64) -> FeedDomainSnapshotDto` | `src/feed.rs:530-578` | SystemTime, std::fs, rand, println, Instant |

#### Effectful Shell (Sprint 5)

| Function | File | I/O Operations |
|----------|------|----------------|
| `feed_initial_state(vault_path: String) -> Result<FeedDomainSnapshotDto, String>` | `src/feed.rs:590-607` | `std::fs::read_dir`, `scan_vault_feed` (fs), `SystemTime::now()` |
| `scan_vault_feed(vault_path: &str)` | `src/feed.rs:394-445` | `std::fs::read_dir`, `std::fs::read_to_string`, `entry.metadata()` |

### Observed Boundaries (Sprint 5)

#### format_base_id (lines 456-492)

Command:
```
awk 'NR>=456 && NR<=492' src/feed.rs | grep -v "^[[:space:]]*//" | grep -E "SystemTime|std::fs|rand::|println!|Instant::|print!|eprintln!"
```

Result: **0 hits** — pure arithmetic date computation only. No I/O, no randomness.

#### next_available_note_id (lines 504-517)

Command:
```
awk 'NR>=504 && NR<=517' src/feed.rs | grep -v "^[[:space:]]*//" | grep -E "SystemTime|std::fs|rand::|println!|Instant::|print!|eprintln!"
```

Result: **0 hits** — calls only `format_base_id(now_ms)` and `HashSet::contains`. No I/O. Note: one doc-comment line contains "no SystemTime calls" — that is a comment, not code; excluded by `grep -v "^[[:space:]]*//"`.

#### compose_initial_snapshot_with_autocreate (lines 530-578)

Command:
```
awk 'NR>=530 && NR<=578' src/feed.rs | grep -v "^[[:space:]]*//" | grep -E "SystemTime|std::fs|rand::|println!|Instant::|print!|eprintln!"
```

Result: **0 hits** — calls only `next_available_note_id(now_ms, &existing_ids)` and constructs DTOs. No I/O. The `now_ms: i64` parameter is injected by the caller (`feed_initial_state`), not read here.

Signature confirmed: `fn compose_initial_snapshot_with_autocreate(existing_visible_ids: Vec<String>, existing_metadata: HashMap<String, NoteRowMetadataDto>, now_ms: i64) -> FeedDomainSnapshotDto` — no `&dyn Clock`, no `AppHandle`, no I/O parameters.

#### feed_initial_state I/O call sites (effectful shell, lines 590-607)

Confirmed I/O:
1. `std::fs::read_dir(dir)` — validates vault directory exists (line 592)
2. `scan_vault_feed(&vault_path)` — reads directory entries and file contents (line 595)
3. `SystemTime::now().duration_since(UNIX_EPOCH)` — reads wall clock for `now_ms` (line 597)

These are the only three I/O points. All I/O is isolated in the effectful shell; the pure core receives only already-computed values.

### Summary (Sprint 5)

No drift detected between declared and observed boundaries.

- `format_base_id`: 0 I/O hits — CLEAN
- `next_available_note_id`: 0 I/O hits — CLEAN
- `compose_initial_snapshot_with_autocreate`: 0 I/O hits — CLEAN
- `feed_initial_state`: 3 I/O call sites confirmed in effectful shell — expected per spec

#### Residual Risks

1. **Determinism dependency chain**: `compose_initial_snapshot_with_autocreate` is pure only because it receives `now_ms` as an argument. Its output depends on `next_available_note_id` which in turn depends on `format_base_id`. PROP-FEED-S5-001/002/003 prove that this chain is deterministic for fixed `(now_ms, existing)`. If those proofs held, the full pure-core chain is correct.

2. **OS-level non-determinism in shell**: `SystemTime::now()` at `feed_initial_state` line 597 is inherently non-deterministic at the OS level. The spec (REQ-FEED-028) permits this: `feed_initial_state` is classified as effectful shell, not pure core. PROP-FEED-S5-004 tests only structural invariants (visible_note_ids.len, editing.status, no file creation) — not timestamp values. This is by design.

No follow-up required before Phase 6 (Sprint 5).
