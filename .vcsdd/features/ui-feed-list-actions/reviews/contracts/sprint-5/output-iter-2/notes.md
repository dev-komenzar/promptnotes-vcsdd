# Sprint 5 Contract Review iter-2 — Per-Criterion Audit

Reviewer: VCSDD Adversary (fresh context, no Builder history)
Contract digest echoed: `d24322f0a07c7046a0ce03d54b5645bfdab3cbf4257b5f2962a8122447ced771`
Iteration: 3 (negotiationRound 2 + 1)
Prior verdict (iter-1): FAIL, 0 critical / 3 high / 3 medium / 0 low

## Per-iter-1-finding audit

### FIND-S5-CONTRACT-001 — REQ-FEED-029 AC (2)/(3) passThreshold gap → **resolved**
- Resolution mechanism: deferral to Sprint 6 (not added to Sprint 5 passThreshold).
- Verification: Negotiated trade-offs §1 (sprint-5.md:70) now explicitly states focus 検証 (AC 2) and `+page.svelte` 単一呼出し保証 (AC 3) are note-body-editor / Sprint 6 deferred. CRIT-S5-004 description (sprint-5.md:42) repeats this deferral. The deferral is legitimate under VCSDD strict mode because the two ACs depend on UI-layer artifacts (FeedRow.svelte mount, document.activeElement) that belong to note-body-editor feature.

### FIND-S5-CONTRACT-002 — passThreshold claims vs. real expect() mismatch → **resolved**
- Resolution mechanism: (i) passThreshold rewritten verbatim against actual assertions; (ii) `expect(result.state.pendingNextFocus).toBeNull()` added to Tests 1 and 3 in feedReducer.sprint5.test.ts; (iii) `editingNoteId === visibleNoteIds[0]` added explicitly to Test 2.
- Verification: I read feedReducer.sprint5.test.ts:117-199. All 4 enumerated passThreshold items in CRIT-S5-004 are now backed by `expect()` calls:
  - Test 1 (`editingNoteId is set to auto-created note id...`): expects `editingNoteId === NEW_NOTE_ID`, `editingStatus === 'editing'`, `pendingNextFocus.toBeNull()` — matches passThreshold item (1).
  - Test 2 (`editingNoteId equals visibleNoteIds[0]...`): expects `editingNoteId === NEW_NOTE_ID`, `visibleNoteIds[0] === NEW_NOTE_ID`, `editingNoteId === visibleNoteIds[0]` — matches passThreshold item (2).
  - Test 3 (`empty vault snapshot...`): expects `visibleNoteIds.toHaveLength(1)`, `editingNoteId === visibleNoteIds[0]`, `pendingNextFocus.toBeNull()` — matches passThreshold item (3).
  - Test 4 (`regression: idle snapshot...`): expects `editingNoteId.toBeNull()`, `editingStatus === 'idle'` — matches passThreshold item (4).

### FIND-S5-CONTRACT-003 — Vault Scan Semantics edge case coverage → **resolved**
- Resolution mechanism: 3 new integration tests added to feed_handlers.rs (lines 1257-1404):
  - `test_feed_initial_state_excludes_dot_md_files`
  - `test_feed_initial_state_excludes_symlink_md_files` (`#[cfg(unix)]`)
  - `test_feed_initial_state_ignores_subdirectory_md_files`
- CRIT-S5-005 passThreshold (sprint-5.md:49) names all three explicitly by function name (binary-evaluable).
- One residual gap: case-insensitive `.md` (`.MD`/`.Md` files) is not exercised by a dedicated test — it is only verified by source-grep on `eq_ignore_ascii_case`. This is acceptable because the grep is binary-evaluable; the spec resolution (FIND-S5-SPEC-011) covers this in the impl. Not a finding.

### FIND-S5-CONTRACT-004 — scan_vault_feed dot-file/symlink bug → **resolved**
- Resolution mechanism: feed.rs:404-418 now filters in this order:
  1. dot-file check: `file_name.to_str().is_some_and(|n| n.starts_with('.'))` → continue
  2. non-regular-file check: `!entry.file_type().is_ok_and(|ft| ft.is_file())` → continue
  3. extension check: `eq_ignore_ascii_case("md")`
- The 3 grep assertions in CRIT-S5-005 passThreshold each match exactly once:
  - `starts_with\('\.'\)` → 1 hit at line 411
  - `file_type.*is_file` → 1 hit at line 416 (`entry.file_type().is_ok_and(|ft| ft.is_file())`)
  - `eq_ignore_ascii_case.*md` → 1 hit at line 421
- The implementation order also correctly skips directories like `mydir.md/` because `file_type().is_file()` is false for directories.

### FIND-S5-CONTRACT-005 — CRIT-S5-007 'atomicity' overpromise → **resolved**
- Resolution mechanism: description (sprint-5.md:57) now says "pure 関数として ... composed snapshot で返す (副作用なし、I/O なし)" instead of "atomic insertion". passThreshold lists 3 concrete assertions (a)(b)(c) + a grep on `fn compose_initial_snapshot_with_autocreate`.
- Verification: feed.rs:530-578 defines `compose_initial_snapshot_with_autocreate` with signature `(Vec<String>, HashMap<String, NoteRowMetadataDto>, i64) -> FeedDomainSnapshotDto` — no I/O, no SystemTime, no fs. Grep returns 1 hit.
- Minor cosmetic note (NOT raised as a finding): the passThreshold says "これらのテスト ... (a)(b)(c) ... 同時に成立することを assert する". Strictly speaking, `test_feed_initial_state_empty_vault_auto_create` asserts all three (a)(b)(c); but `test_feed_initial_state_no_md_file_created_with_auto_create` asserts (a) and (b) but does NOT explicitly assert (c) `visible_note_ids[0] == new_id`. The gate of `test_1 AND test_2 PASS` still effectively covers (a)(b)(c) because test_1 covers all three. This is a marginal wording inaccuracy that does not break gate-evaluability. I did not raise it as a finding.

### FIND-S5-CONTRACT-006 — Negotiated trade-offs §5 scope creep → **resolved (with new low-severity finding)**
- Resolution mechanism: (i) `artifactsTouched` (Sprint 5 functional) and `styleOnlyRefactorFootprint` (clippy/fmt-only debt) are now structurally separated in YAML frontmatter (sprint-5.md:11-23); (ii) Negotiated trade-offs §5 (sprint-5.md:74) declares behavior-change-zero and proposes a separate bd task (`tech-debt: clippy strict mode migration`) for unrelated lint debt; (iii) CRIT-S5-001..007 passThresholds do not reference styleOnlyRefactorFootprint, so the gate is bounded to Sprint 5 scope.
- Verification of "behavior change zero": I sampled editor.rs:1-140 — no Sprint 5 functional logic, only DTO/type definitions. Test count baseline 157 cargo + 1813 bun was preserved per green-phase.log:5,8 (and bun count stayed at 1813 after iter-2 fix per contract-fix.log:90).
- **New finding (FIND-S5-CONTRACT-iter2-001, low)**: styleOnlyRefactorFootprint lists two paths under `src/` (`src/editor_wire_sprint8.rs` and `src/note_body_editor_handlers.rs`) but the actual files live under `tests/`. This is a documentation accuracy issue in the section that was created specifically to resolve FIND-S5-CONTRACT-006. It does not break any gate. See FIND-S5-CONTRACT-iter2-001.json for full detail.

## Cross-cut re-review

### passThreshold binary-evaluability (per CRIT)
- CRIT-S5-001: 3 cargo test names — binary ✓
- CRIT-S5-002: 4 cargo test names (incl. proptest) — binary ✓
- CRIT-S5-003: 1 cargo test name (4 cases) — binary ✓
- CRIT-S5-004: 4 vitest tests with enumerated `expect()` semantics — binary ✓
- CRIT-S5-005: 3 cargo test names + 3 grep patterns — binary ✓
- CRIT-S5-006: 4 commands with numeric thresholds (clippy 0 / fmt 0 / cargo 160 / bun 1813) — binary ✓
- CRIT-S5-007: 2 cargo test names + 3 enumerated assertions + 1 grep — binary ✓

### feedReducer.sprint5.test.ts assertion cross-check
Confirmed by direct read of `promptnotes/src/lib/feed/__tests__/feedReducer.sprint5.test.ts:117-199`. All passThreshold-claimed `expect()` lines exist. The `pendingNextFocus` assertions (added in iter-2) are at lines 128 and 175.

### feed.rs:404-418 implementation cross-check
Confirmed by direct read of `promptnotes/src-tauri/src/feed.rs:404-422`. Dot-file and symlink filters are present and ordered correctly (dot-file → file_type → extension).

### styleOnlyRefactorFootprint defensibility
Sampled `promptnotes/src-tauri/src/editor.rs:1-140` — no Sprint 5 functional change visible; only DTO definitions and existing serde annotations. The "behavior change zero" claim is plausible at the source level. The test count baseline (157 cargo + 1813 bun before; 160 cargo + 1813 bun after iter-2's 3-test addition) is consistent with the contract-fix.log claims. However, the two wrong paths (`src/editor_wire_sprint8.rs` / `src/note_body_editor_handlers.rs`) mean a path-by-path manual diff verification cannot be completed mechanically. See FIND-S5-CONTRACT-iter2-001.

### bdTasks scope
PN-knv (6a. ctrl+N で新規ノート作成) is explicitly scoped to "初回マウント部分のみ Sprint 5; キーバインドは Sprint 6 へ deferral" in the bdTasks line (sprint-5.md:10) AND in Negotiated trade-offs §1. This is consistent and accurately scoped. PN-2r3 and PN-5im are described accurately.

## Overall judgment

All 6 iter-1 findings are genuinely resolved (5 with full closure, 1 with a small residual documentation issue raised as FIND-S5-CONTRACT-iter2-001 at low severity). The contract is now well-structured, gating criteria are binary-evaluable, and implementation/tests align with passThreshold claims.

Severity counts: 0 critical / 0 high / 0 medium / 1 low.
Overall verdict: **PASS**.

The contract is ready for `status: approved` flip and Sprint 5 to proceed to Phase 3 adversarial review.
