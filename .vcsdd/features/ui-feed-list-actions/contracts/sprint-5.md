---
sprintNumber: 5
feature: ui-feed-list-actions
status: approved
negotiationRound: 2
scope: Sprint 5 — `feed_initial_state` auto-create. Rust ハンドラに新規空ノート採番ロジックを統合し、初回マウント時点で 1 件の空ノートが editing 状態として可視化される。TS `initialize-capture.ts:46-126` の auto-create + NoteId 採番ロジックを Rust に移植。bd タスク PN-2r3 / PN-5im / PN-knv を一括カバー。
bdTasks:
  - PN-2r3: 4c. feed_initial_state: 新規ノート auto-create
  - PN-5im: 4d. 影響を受ける spec の patch (ui-feed-list-actions 他)
  - PN-knv: 6a. ctrl+N で新規ノート作成 (初回マウント部分のみ Sprint 5; キーバインドは Sprint 6 へ deferral)
artifactsTouched:
  - .vcsdd/features/ui-feed-list-actions/specs/behavioral-spec.md (+152 行: Sprint 5 Extensions / Resolutions)
  - .vcsdd/features/ui-feed-list-actions/specs/verification-architecture.md (+85 行: Sprint 5 Verification Extensions)
  - promptnotes/src-tauri/src/feed.rs (+367 / -? 行: next_available_note_id, format_base_id, compose_initial_snapshot_with_autocreate, feed_initial_state 改修; +12 行: dot-file / symlink フィルタ追加 contract review iter-1 fix)
  - promptnotes/src-tauri/tests/feed_handlers.rs (+574 行: 8 Sprint 5 tests; +120 行: dot-file / symlink / subdir 3 tests contract review iter-1 fix)
  - promptnotes/src/lib/feed/__tests__/feedReducer.sprint5.test.ts (新規 4 tests + pendingNextFocus / editingNoteId===visibleNoteIds[0] assertions contract review iter-1 fix)
  - promptnotes/src-tauri/Cargo.toml (dev-deps: tempfile = "3", regex = "1"; proptest 既存)
styleOnlyRefactorFootprint:
  - promptnotes/src-tauri/src/editor.rs: cargo fmt + clippy lint 対応 (挙動変更なし)
  - promptnotes/src-tauri/src/editor_wire_sprint8.rs: cargo fmt + clippy lint 対応 (挙動変更なし)
  - promptnotes/src-tauri/src/lib.rs: cargo fmt + clippy lint 対応 (挙動変更なし)
  - promptnotes/src-tauri/src/note_body_editor_handlers.rs: cargo fmt + clippy lint 対応 (挙動変更なし)
  - promptnotes/src-tauri/tests/: cargo fmt 対応 (挙動変更なし)
criteria:
  - id: CRIT-S5-001
    dimension: spec_fidelity
    description: REQ-FEED-028 — `feed_initial_state` が新規空ノートを auto-create する。空 vault で `visible_note_ids.len() == 1` / 既存 1 件 vault で `visible_note_ids.len() == 2` (新規 ID prepend) / `editing.status == "editing"` / `editing.current_note_id == Some(visible[0])` / `note_metadata.contains_key(new_id)`。Sprint 4 までの `editing.status == "idle"` 動作は REQ-FEED-022 amendment で strike-through。
    weight: 0.20
    passThreshold: cargo test test_feed_initial_state_empty_vault_auto_create AND test_feed_initial_state_existing_one_note_prepends_new AND test_feed_initial_state_no_md_file_created_with_auto_create PASS
  - id: CRIT-S5-002
    dimension: verification_readiness
    description: PROP-FEED-S5-001/002/003 — `next_available_note_id` 決定性 / 非衝突 / ID フォーマット適合 (`^\d{4}-\d{2}-\d{2}-\d{6}-\d{3}(-\d+)?$`)。`now_ms ∈ [0, 253_402_300_800_000)`, `existing.len() < 1_024` bound。
    weight: 0.20
    passThreshold: cargo test test_next_available_note_id_deterministic AND test_next_available_note_id_format AND test_next_available_note_id_collision_suffix AND test_next_available_note_id_non_collision_property (proptest) PASS
  - id: CRIT-S5-003
    dimension: verification_readiness
    description: PROP-FEED-S5-005 — TS `nextAvailableNoteId` / `formatBaseId` (`initialize-capture.ts:86-126`) と Rust `next_available_note_id` / `format_base_id` の出力 parity。4 名前付き edge case (base / 1-collision / 10-collision / Unix epoch) snapshot 一致。
    weight: 0.15
    passThreshold: cargo test test_next_available_note_id_ts_parity_snapshot PASS (4 cases)
  - id: CRIT-S5-004
    dimension: spec_fidelity
    description: REQ-FEED-029 — 初回マウント編集モード即時開始。`feedReducer.DomainSnapshotReceived` が `editing.currentNoteId` を `editingNoteId` にミラーし、`state.editingNoteId === state.visibleNoteIds[0]` が成立する。REQ-FEED-029 AC (2) CodeMirror focus 検証と AC (3) `+page.svelte` 単一呼出し保証は note-body-editor フィーチャーの責務として Sprint 6 へ deferral (Negotiated trade-offs §1 拡張)。PN-knv のうち ctrl+N キーバインド実装は Sprint 6 deferral。
    weight: 0.15
    passThreshold: vitest feedReducer.sprint5.test.ts — 4 tests PASS: (1) editingNoteId === snapshot.editing.currentNoteId かつ editingStatus === "editing" かつ pendingNextFocus === null がアサートされている / (2) editingNoteId === visibleNoteIds[0] がアサートされている / (3) 空 vault で visibleNoteIds.length === 1 かつ editingNoteId === visibleNoteIds[0] かつ pendingNextFocus === null がアサートされている / (4) idle snapshot では editingNoteId === null のままであることを回帰確認。focus 検証と +page.svelte 単一呼出し保証は Sprint 6 の note-body-editor フィーチャーで gate。
  - id: CRIT-S5-005
    dimension: implementation_correctness
    description: Vault Scan Semantics 適合 — 拡張子 case-insensitive `.md`, 非再帰, dot-file 除外, symlink 非 follow, lowercase stem collision namespace。`scan_vault_feed` が spec Resolution (FIND-S5-SPEC-002 / FIND-S5-SPEC-011) と一致。FIND-S5-CONTRACT-003/004 fix: dot-file / symlink フィルタを feed.rs:404-418 に追加済み。
    weight: 0.10
    passThreshold: cargo test test_feed_initial_state_excludes_dot_md_files AND test_feed_initial_state_excludes_symlink_md_files AND test_feed_initial_state_ignores_subdirectory_md_files PASS。加えて `grep -nE "starts_with\('\.'\)" feed.rs` が 1 件 hit (dot-file filter)、`grep -nE "file_type.*is_file" feed.rs` が 1 件 hit (symlink filter)。case-insensitive: `grep -nE "eq_ignore_ascii_case.*md" feed.rs` が 1 件 hit。
  - id: CRIT-S5-006
    dimension: structural_integrity
    description: Refactor / Quality gate — clippy / fmt clean、新規 production dependency ゼロ、`feed_initial_state` body が `compose_initial_snapshot_with_autocreate` 純関数に分離されている、既存 GREEN テスト regression なし。
    weight: 0.10
    passThreshold: cargo clippy --tests -- -D warnings exits 0; cargo fmt --check exits 0; cargo test (full suite) = 160 PASS (157 baseline + 3 vault-scan-semantics tests); bun test = 1813 PASS。Cargo.toml に production dependency 追加なし (dev-deps のみ)。
  - id: CRIT-S5-007
    dimension: edge_case_coverage
    description: EC-FEED-016 Sprint 5 amendment 適合 — auto-create された新規 NoteId は note_metadata に必ず存在する。`compose_initial_snapshot_with_autocreate` が pure 関数として `(visible_note_ids, note_metadata, editing)` を一度に composed snapshot で返す (副作用なし、I/O なし)。Sprint 4 amendment (`select_past_note` race condition) との非対称性が spec の Sprint 5 amendment に明示されている通り、orphan editingNoteId は `feed_initial_state` 経路では発生せず、`select_past_note` 経路は Sprint 4 挙動を維持。
    weight: 0.10
    passThreshold: cargo test test_feed_initial_state_empty_vault_auto_create AND test_feed_initial_state_no_md_file_created_with_auto_create PASS。これらのテストは (a) note_metadata.contains_key(new_id) / (b) editing.current_note_id == Some(new_id) / (c) visible_note_ids[0] == new_id が同時に成立することを assert する。加えて `grep -nE "fn compose_initial_snapshot_with_autocreate" feed.rs` が 1 件 hit し、関数シグネチャに I/O 引数がないこと (pure 関数) を確認。
---

# Sprint 5 Contract — ui-feed-list-actions

## Context

Sprint 4 で確立された `Note.body = string` 単一型 (Block 廃止移行後) を前提に、TS ドメイン `initialize-capture.ts:46-126` の `initializeCaptureSession` + `nextAvailableNoteId` ロジックを Rust 側 `feed_initial_state` に統合する。これにより、AppShell マウント時点で frontend が auto-create に関わる責務を持たず、Rust が一手に NoteId 採番 / 空ノート生成 / editing 状態 emit を担う。

## Negotiated trade-offs

1. **ctrl+N キーバインド実装は Sprint 5 スコープ外、かつ CodeMirror focus 検証と `+page.svelte` 単一呼出し保証も Sprint 6 deferral** — PN-knv のうち「初回マウント時に新規空ノートが editing で開く」部分のみ Sprint 5 が満たす。実 ctrl+N キーバインド (再呼出し相当)、CodeMirror focus 検証 (REQ-FEED-029 AC (2))、`+page.svelte` の `feed_initial_state` 単一呼出し保証 (REQ-FEED-029 AC (3)) はいずれも note-body-editor フィーチャーおよび Sprint 6 候補として deferred。CRIT-S5-004 は `feedReducer` の `editingNoteId` / `pendingNextFocus` ミラーと `editingNoteId === visibleNoteIds[0]` を gate し、Svelte DOM レベルの検証は note-body-editor の責務とする。
2. **NoteId 採番は Rust 単独** — TS 側 `initialize-capture.ts` の `nextAvailableNoteId` 実装は当面残置するが、本番経路としては Rust 側を canonical とし、TS は test parity reference として保持。Sprint 6 以降で TS 側削除を検討。
3. **新規ノートの `.md` ファイル化はしない** — auto-create はメモリ上 DTO のみ。実際の `.md` 永続化は capture-auto-save フィーチャーの初回 save に委譲。`feed_initial_state` 呼出し前後で vault のファイル数は不変であることを invariant 化。
4. **PROP-FEED-S5-005 (TS/Rust parity) を required: true に強化** — adversary iter-1 FIND-S5-SPEC-007 を受け、Sprint 4 PROP-FEED-S4-016 と同等水準に格上げ。4 名前付き edge case の snapshot test を必須化。
5. **style-only refactor footprint の明確化**: Phase 2c の `cargo clippy --tests -- -D warnings` + `cargo fmt --check` 厳格化ゲートは crate 全体に作用するため、Sprint 5 の REQ-FEED-028/029 実装スコープと無関係な `editor.rs` / `editor_wire_sprint8.rs` / `lib.rs` / `note_body_editor_handlers.rs` 等の **既存** clippy / fmt 違反を style-only で修正した。これらの修正は挙動変更ゼロ (テスト件数・PASS 件数とも Sprint 5 前後で baseline = 157 cargo + 1813 bun を維持)。機能スコープ (`artifactsTouched`) と style-only 負債解消スコープ (`styleOnlyRefactorFootprint`) は contract 内で明確に分離している。FIND-S5-CONTRACT-006 対応: Sprint 5 以外のフィーチャー lint 負債は別 bd タスク (tech-debt: clippy strict mode migration) として tracking する。

## Approval

Sprint 1c gate PASS (adversary iter-2 + human 承認) at 2026-05-13T05:10:00.000Z。bd タスク PN-2r3 / PN-5im / PN-knv は in_progress (claimed by takuya)。
