---
coherence:
  node_id: "req:ui-tag-chip-bugfix-tag-save"
  type: req
  name: "ui-tag-chip Sprint 2 bugfix — タグチップ入力が保存されない"
  depends_on:
    - id: "req:ui-tag-chip"
      relation: refines
    - id: "design:ui-tag-chip-verification"
      relation: depends_on
    - id: "req:tag-chip-update"
      relation: depends_on
  modules:
    - "ui-tag-chip"
  source_files:
    - "promptnotes/src/lib/feed/tauriFeedAdapter.ts"
    - "promptnotes/src/lib/domain/tag-chip-update/apply-tag-operation.ts"
---

# Bug Spec — タグチップ入力が保存されない

Feature: `ui-tag-chip`
Sprint: 2 (bugfix)
Date: 2026-05-05

## 現象
フィード行の「+」ボタンからタグを入力し Enter または blur で確定しても、タグがノートに保存されない。

## 原因
`tauriFeedAdapter.ts` の `dispatchAddTagViaChip` / `dispatchRemoveTagViaChip` が `invoke('edit_note_body', { noteId, body: '', issuedAt })` を呼んでいるが、Rust 側 `edit_note_body` は **全パラメータを破棄する no-op** である（`editor.rs:226-235`）。

タグ操作には以下のフローが必要：
1. ノートの現在の frontmatter を読み取る
2. タグを追加/削除し新しい frontmatter を生成
3. frontmatter + body を YAML markdown にシリアライズ
4. `fs_write_file_atomic` でファイル書き込み

現在は step 1-3 が欠落し、step 4 も正しく呼ばれていない。

## 修正方針

### Rust 側
- `fs_write_file_atomic` (editor.rs:89-134) を `#[tauri::command]` として公開する
- lib.rs に登録

### TypeScript 側
- `TauriFeedAdapter.dispatchAddTagViaChip` / `dispatchRemoveTagViaChip` のシグネチャを拡張:
  `(noteId, tag, body, existingTags, createdAt, updatedAt, issuedAt) => Promise<void>`
- 実装:
  1. 新しいタグリストを計算（addなら追加、removeなら削除）
  2. フロントマターを YAML にシリアライズ
  3. `---\n{yaml}\n---\n{body}` 形式の markdown を生成
  4. 新しい Rust command `write_file_atomic` を `invoke` で呼ぶ
- `FeedList.svelte` の `dispatchCommand` で `noteMetadata` から必要な情報を渡す

### FeedCommand ペイロード拡張
- `add-tag-via-chip` / `remove-tag-via-chip` の payload に `body`, `tags`, `createdAt`, `updatedAt` を追加

## 検証
- vitest DOM テストで adapter の `dispatchAddTagViaChip` が正しい引数で呼ばれることを確認
- vitest で serializer が正しい markdown を生成することを確認
