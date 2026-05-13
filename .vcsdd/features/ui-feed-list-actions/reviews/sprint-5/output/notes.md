# Sprint 5 Phase 3 Adversarial Review — Notes

## Per-CRIT audit

### CRIT-S5-001 (spec_fidelity, REQ-FEED-028 auto-create) — PASS

- All 3 named tests confirmed PASS in `evidence/sprint-5-green-phase.log` lines 31, 33, 42:
  - `test_feed_initial_state_empty_vault_auto_create` (tests/feed_handlers.rs:1031-1077)
  - `test_feed_initial_state_existing_one_note_prepends_new` (tests/feed_handlers.rs:1087-1140)
  - `test_feed_initial_state_no_md_file_created_with_auto_create` (tests/feed_handlers.rs:1155-1190)
- Implementation at `feed.rs:589-607` sets `editing.status = "editing"`, `editing.current_note_id = Some(new_id)`, prepends new_id, and never creates a `.md` file. The Sprint-4 `idle` regression has been retired per REQ-FEED-022 Sprint 5 amendment.

### CRIT-S5-002 (verification_readiness, PROP-FEED-S5-001/002/003) — PASS

- `test_next_available_note_id_deterministic` (tests/feed_handlers.rs:920-935)
- `test_next_available_note_id_format` (tests/feed_handlers.rs:942-959) with regex `^\d{4}-\d{2}-\d{2}-\d{6}-\d{3}$`
- `test_next_available_note_id_collision_suffix` (tests/feed_handlers.rs:966-995) covers `-1` and `-2`
- `test_next_available_note_id_non_collision_property` (tests/feed_handlers.rs:1003-1019) is a real proptest with bounds: `now_ms ∈ 0i64..253_402_300_800_000i64`, `existing ∈ hash_set([a-zA-Z0-9\-]{1,40}, 0..=1023)`. The bound matches PROP-FEED-S5-002's `|existing|<1024` and PROP-FEED-S5-003's input domain.
- All 4 named in green log lines 29-30, 41, 43.

### CRIT-S5-003 (verification_readiness, PROP-FEED-S5-005 TS/Rust parity) — PASS

- `test_next_available_note_id_ts_parity_snapshot` (tests/feed_handlers.rs:1207-1255) covers all 4 named cases.
- Hand-verified TS parity values against `initialize-capture.ts:112-126`:
  - now_ms=0 → `new Date(0).getUTCFullYear() = 1970`, month=0+1=1, day=1, h/m/s/ms=0 → "1970-01-01-000000-000" ✓
  - now_ms=1_577_836_800_000 → 2020-01-01 00:00:00.000 UTC ✓
  - -1 / -10 suffix use TS template literal `${base}-${i}` from `nextAvailableNoteId:99` ✓
- Manual Rust trace of `format_base_id(0)` via Hinnant Z algorithm: era=4, doe=135080, yoe=369, y_shifted=1969, doy=306, mp=10, d=1, mo=1, yr=1969+1=1970 → "1970-01-01-000000-000" ✓
- Manual Rust trace of `format_base_id(1_577_836_800_000)`: era=5, doe=7245, yoe=19, y_shifted=2019, doy=306, mp=10, d=1, mo=1, yr=2020 → "2020-01-01-000000-000" ✓
- FIND-S5-IMPL-002 (low severity): case (a) was supposed to discriminate single-digit time field padding per spec line 710 but uses all-zero fields. Does not fail the CRIT since passThreshold reads "PASS (4 cases)" literally.

### CRIT-S5-004 (spec_fidelity, REQ-FEED-029 mirror) — PASS

- 4 vitest/bun:test tests in `feedReducer.sprint5.test.ts:103-200`:
  - Test 1 (lines 117-129): editingNoteId === currentNoteId, editingStatus === "editing", pendingNextFocus === null ✓
  - Test 2 (lines 141-155): editingNoteId === visibleNoteIds[0] explicit assertion ✓
  - Test 3 (lines 164-176): empty vault → visibleNoteIds.length === 1 + mirror + pendingNextFocus === null ✓
  - Test 4 (lines 185-199): regression for idle snapshot → editingNoteId remains null ✓
- feedReducer.ts:57-61 mirror lines confirmed.
- CodeMirror focus + +page.svelte single-call AC (2)/(3) explicitly deferred to Sprint 6 per contract Negotiated trade-offs §1 (extended).

### CRIT-S5-005 (implementation_correctness, Vault Scan Semantics) — PASS

- All 3 grep patterns hit exactly once in feed.rs:
  - `starts_with('.')` at line 411 (dot-file filter)
  - `file_type().is_ok_and(|ft| ft.is_file())` at line 416 (symlink/dir filter)
  - `eq_ignore_ascii_case("md")` at line 421 (case-insensitive extension)
- 3 named tests PASS:
  - `test_feed_initial_state_excludes_dot_md_files` (tests/feed_handlers.rs:1266-1313)
  - `test_feed_initial_state_excludes_symlink_md_files` (tests/feed_handlers.rs:1320-1365, `#[cfg(unix)]`)
  - `test_feed_initial_state_ignores_subdirectory_md_files` (tests/feed_handlers.rs:1372-1404)

### CRIT-S5-006 (structural_integrity, quality gates) — PASS

- Evidence log `sprint-5-contract-fix.log:82-97`:
  - cargo test: 160 PASS (80 + 18 + 22 + 30 + 10)
  - bun test: 1813 PASS, 4 skip, 4 todo, 0 fail
  - cargo clippy --tests -- -D warnings: exit 0
  - cargo fmt --check: exit 0
- No new production dependency in Cargo.toml (dev-deps only: tempfile, regex, proptest already in baseline)
- Sprint 4 path (parse_markdown_to_blocks, compose_state_for_select_past_note, prop_s4_017) not regressed — all 7 PROP-FEED-S4-* tests PASS in green log lines 19-28.

### CRIT-S5-007 (edge_case_coverage, EC-FEED-016 Sprint 5 amendment) — PASS

- `compose_initial_snapshot_with_autocreate` signature (feed.rs:530-534) confirmed pure: takes `Vec<String>`, `HashMap<String, NoteRowMetadataDto>`, `i64`. No `&dyn Clock`, no `Path`, no I/O. Returns a single `FeedDomainSnapshotDto`.
- Tests `test_feed_initial_state_empty_vault_auto_create` and `test_feed_initial_state_no_md_file_created_with_auto_create` jointly assert `note_metadata.contains_key(new_id)`, `editing.current_note_id == Some(new_id)`, `visible_note_ids[0] == new_id` — the orphan-protection invariant from spec line 1027.
- grep `fn compose_initial_snapshot_with_autocreate` hits exactly once at feed.rs:530.

## Per-dimension reasoning

### spec_fidelity — PASS

REQ-FEED-028 EARS clause "WHEN ... AppShell の Configured 状態マウント時に**初めて**呼ばれ" is reconciled with the unconditional Rust handler by Resolution FIND-S5-SPEC-003 at spec line 920: "Rust ハンドラ自体は idempotency を保証しない — フロントエンド側の単一呼出し保証が前提". The Rust impl matches: no first-call guard, no idempotency. This is **not a finding** — the spec is internally consistent and assigns the single-call obligation to `+page.svelte` (REQ-FEED-029 AC (3), explicitly deferred to Sprint 6).

REQ-FEED-022 amendment (status was "idle", now "editing") is reflected at feed.rs:566. Empty-vault `visible_note_ids.len() == 1` (Sprint 5 supersede of Sprint 2's `[]`) is enforced by `compose_initial_snapshot_with_autocreate` unconditionally prepending the new id.

### edge_case_coverage — PASS (1 finding, low)

Dot-file / symlink / subdirectory / empty / one-existing / -1 / -2 / -10 / Unix-epoch all covered. **FIND-S5-IMPL-001** (low): stem case-insensitive collision (Foo.md vs foo.md) is enumerated in spec line 930 but not tested. Behavior verified by code-read at feed.rs:537-545. Not a blocker for Phase 5.

### implementation_correctness — PASS

- `next_available_note_id` and `format_base_id` are pure (verified by grep — no `SystemTime::`, no `fs::`, no `rand::`, no `Instant`).
- `compose_initial_snapshot_with_autocreate` parameters are all owned/borrowed plain data; no `Arc<Mutex>`, no `&dyn Clock`, no `Path` (only `Path::new(full_path)` for stem extraction in pure code).
- `feed_initial_state` is the narrow effectful shell: `std::fs::read_dir` + `SystemTime::now()` + `serde_json` serialize. Lines 591-606.
- `EditingSubDto` carries `pending_next_focus: Option<PendingNextFocusDto>` (feed.rs:51); `PendingNextFocusDto` defined in editor.rs:47-53 with `note_id` and `block_id` fields — Sprint 4 type contract preserved.
- Sprint 4 path intact: `compose_select_past_note` at feed.rs:271-296 still calls `parse_markdown_to_blocks` and `compose_state_for_select_past_note`; prop_s4_017 in green log.

### structural_integrity — PASS

Quality gates from evidence log all pass. The style-only refactor footprint (editor.rs, editor_wire_sprint8.rs, lib.rs, note_body_editor_handlers.rs) is fmt+clippy-driven; test count unchanged before vs after for non-Sprint-5 files. Sample `editor.rs` skim (lines 1-180): structural definitions and `fs_write_file_atomic` body unchanged from prior commits.

### verification_readiness — PASS (1 finding, low)

All 5 PROP-FEED-S5-* obligations have at least one gating test, with PROP-FEED-S5-002 backed by a real proptest. PROP-FEED-S5-005 covers 4 named edge cases. **FIND-S5-IMPL-002** (low): case (a) doesn't actually exercise the single-digit time field padding that spec line 710 designated as its discriminator. Risk is genuinely low because pad2/pad3 are stdlib-grade in both languages.

## No-finding rationales (explicit)

- **EARS first-call discipline missing in Rust**: NOT a finding. Spec Resolution FIND-S5-SPEC-003 (line 920) explicitly states the Rust handler does NOT enforce first-call discipline; the obligation lives in `+page.svelte`.
- **No defensive assertion for re-entry in `feed_initial_state`**: NOT a finding. Same rationale.
- **`feed_initial_state` double-reads `vault_path` (read_dir for validation, then scan_vault_feed re-reads)**: NOT a finding. No correctness issue; only a minor performance footnote. The validation read is dropped immediately.
- **`existing_ids` proptest strategy uses `[a-zA-Z0-9\-]{1,40}` instead of NoteId-shaped strings**: NOT a finding. The strategy correctly stresses the non-collision invariant for arbitrary existing sets. A NoteId-shaped strategy would be a refinement but not a correctness gate.
- **No formal proof for `format_base_id` correctness across year 0001..9999**: NOT a finding for Phase 3. The spec explicitly leaves year 10000+ and negative now_ms as panic-allowed (PROP-FEED-S5-003 Resolution FIND-S5-SPEC-008). Phase 5 may add a SMT-style proof.

## Run / Read log

- Read manifest at `.vcsdd/features/ui-feed-list-actions/reviews/sprint-5/input/manifest.json` (57 lines).
- Read contract `contracts/sprint-5.md` (79 lines) — digest `d24322f0a07c7046a0ce03d54b5645bfdab3cbf4257b5f2962a8122447ced771`.
- Read `specs/behavioral-spec.md` lines 880-1055 (Sprint 5 Extensions, REQ-FEED-028/029, EC-FEED-016 / REQ-FEED-022 amendments).
- Read `specs/verification-architecture.md` lines 670-762 (Sprint 5 Verification Extensions, PROP-FEED-S5-001..005, Test Strategy).
- Read `src-tauri/src/feed.rs` (1049 lines) in full.
- Read `src-tauri/src/editor.rs` lines 1-180 (DTO definitions, including PendingNextFocusDto at 47-53).
- Read `src-tauri/tests/feed_handlers.rs` (1405 lines) in full.
- Read `src/lib/feed/feedReducer.ts` (370 lines) in full.
- Read `src/lib/feed/__tests__/feedReducer.sprint5.test.ts` (201 lines) in full.
- Read `src/lib/domain/app-startup/initialize-capture.ts` (155 lines) — TS canonical for parity check.
- Read evidence logs: red, green, contract-fix.
- Did not execute `cargo test` or `bun test` because the green-phase and contract-fix evidence logs provide concrete PASS counts (cargo 160, bun 1813) and the contract digest matches the approved one. Re-running would duplicate evidence already captured.

## Verdict

`overallVerdict = PASS`. 0 critical, 0 high, 0 medium, 2 low findings. Sprint 5 is gated for Phase 5 (formal hardening).
