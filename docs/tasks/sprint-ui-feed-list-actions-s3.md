# Sprint 3: ui-feed-list-actions — 過去ノート選択のエディタ反映修正

## 問題

`select_past_note` (feed.rs) が `feed_state_changed` のみ emit し、EditorPane が購読する `editing_session_state_changed` を emit していない。そのためフィード行クリックで過去ノートを選択してもエディタに反映されない。

## 責務

`implement.md` L84 により **ui-feed-list-actions** の責務:
> 行クリック → SelectPastNote → flushCurrentSession → startNewSession 連鎖

## 原因

| # | ファイル:行 | 問題 |
|---|-----------|------|
| 1 | `promptnotes/src-tauri/src/feed.rs:243-253` | `select_past_note` が `editing_session_state_changed` を emit していない |
| 2 | `.vcsdd/features/ui-feed-list-actions/specs/behavioral-spec.md` REQ-FEED-020 | spec が `feed_state_changed` の emit のみを要求している |

## 修正内容

### Phase 1a: spec patch

`behavioral-spec.md` に REQ-FEED-024 を追加:

> **REQ-FEED-024: `select_past_note` — `editing_session_state_changed` emit**
>
> **EARS**: WHEN `select_past_note` is invoked THEN the system SHALL ALSO emit `editing_session_state_changed` with `{ status: "editing", isDirty: false, currentNoteId: note_id, pendingNextNoteId: null, lastError: null, body: <note body from file> }`.
>
> **Body extraction**: extract `body` from `note_metadata.get(note_id).body` (already populated by `scan_vault_feed`). If note_id is not found in note_metadata, emit with `body: ""`.
>
> **Acceptance Criteria**:
> - `select_past_note` emits exactly 2 events: `feed_state_changed` + `editing_session_state_changed`.
> - `editing_session_state_changed` payload contains the note body from the file system.
> - Note not found in vault → emit with empty body.

### Phase 1b: verification architecture patch

`verification-architecture.md` に PROP-FEED-S2-008 を追加:

> **PROP-FEED-S2-008** (tier 1, required): `select_past_note` emits both `feed_state_changed` AND `editing_session_state_changed` with correct body content. Rust integration test.

### Phase 2a: Red (tests)

`promptnotes/src-tauri/tests/feed_handlers.rs` に以下を追加:

1. `test_select_past_note_emits_editing_session_state_changed` — 両イベントが emit されることを確認
2. `test_select_past_note_editing_payload_contains_body` — body がファイル内容と一致することを確認
3. `test_select_past_note_nonexistent_body_is_empty` — 存在しない note_id で body が空文字であることを確認

### Phase 2b: Green (実装)

`promptnotes/src-tauri/src/feed.rs` — `select_past_note` 関数:

```rust
#[tauri::command]
pub fn select_past_note(
    app: AppHandle,
    note_id: String,
    vault_path: String,
    issued_at: String,
) -> Result<(), String> {
    let _ = issued_at;
    let snapshot = make_editing_state_changed_snapshot(&note_id, &vault_path);

    // Extract body from scanned metadata for the editor
    let body = snapshot.note_metadata
        .get(&note_id)
        .map(|m| m.body.as_str())
        .unwrap_or("");

    // Emit editing_session_state_changed for EditorPane
    let editor_payload = crate::editor::make_editing_state_changed_payload(
        "editing", false, Some(note_id.clone()), None, None, body,
    );
    app.emit("editing_session_state_changed", editor_payload)
        .map_err(|e| e.to_string())?;

    // Emit feed_state_changed (existing)
    app.emit("feed_state_changed", snapshot)
        .map_err(|e| e.to_string())
}
```

### Phase 2c: Refactor

- `make_editing_state_changed_payload` は既に `pub fn` のため再利用可能
- payload 構築の重複がないことを確認

## 依存

| 依存元 | 状態 |
|--------|------|
| `editor::make_editing_state_changed_payload` (editor.rs:161) | 既に pub fn、変更不要 |
| `scan_vault_feed` (feed.rs:323) | note_metadata に body を含む、変更不要 |

## やらないこと

- `edit-past-note-start/pipeline.ts` の完全配線 (classify → flush → startNewSession)
- dirty 編集セッションの自動 flush
- 保存失敗時の pendingNextNoteId 復元 — 別 Sprint で対応

## ファイル一覧

| ファイル | 変更種別 |
|---------|---------|
| `.vcsdd/features/ui-feed-list-actions/specs/behavioral-spec.md` | 追記 (REQ-FEED-024) |
| `.vcsdd/features/ui-feed-list-actions/specs/verification-architecture.md` | 追記 (PROP-FEED-S2-008) |
| `.vcsdd/features/ui-feed-list-actions/state.json` | phase → 1a, sprintCount → 3 |
| `promptnotes/src-tauri/src/feed.rs` | 修正 (select_past_note) |
| `promptnotes/src-tauri/tests/feed_handlers.rs` | 追記 (テスト 3 件) |

## 完了定義

`bun run tauri dev` でフィード行クリック → エディタにノート本文が表示されること。
