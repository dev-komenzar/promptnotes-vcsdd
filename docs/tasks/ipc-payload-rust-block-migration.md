# IPC Payload Rust 側 Block 化 — 別セッション向け作業指示

> **背景**: `feature/inplace-edit-migration` ブランチで TypeScript 側の
> `EditingSessionStateDto` (`promptnotes/src/lib/editor/types.ts`) は既に
> 5-arm discriminated union (`focusedBlockId` / `pendingNextFocus` /
> `priorFocusedBlockId` / `blocks?` を持つ block-aware な形) に migrate 済み
> ですが、**Rust 側の `EditingSessionStateDto`
> (`promptnotes/src-tauri/src/editor.rs`) は依然として旧 6 フラットフィールド
> 形式 (`status, isDirty, currentNoteId, pendingNextNoteId, lastError, body`)**
> のままで、ワイヤ互換性が崩れています。
>
> このドキュメントは **Rust 側を TS 側 DTO に追従** させる作業を別の
> セッションへ引き継ぐための指示書です。
>
> 並行して進む `ui-feed-list-actions` Sprint 4 (本ブランチで自走中) は
> **Option A** を採用しており、`select_past_note` のためだけに
> `make_editing_state_changed_payload` を optional 引数で拡張する方針です。
> 本作業 (Option B) は **Sprint 4 完了後に着手** することを想定しています。

---

## スコープ

### IN

- `promptnotes/src-tauri/src/editor.rs` の `EditingSessionStateDto` を
  TS 側 (`promptnotes/src/lib/editor/types.ts:126-163`) と同型の
  **5-arm tagged union** に書き換える
- `make_editing_state_changed_payload` を arm 別の生成関数に分割する
  （または arm を引数で受け取り適切な variant を構築する）
- 既存呼び出し側 (`editor.rs` 内の各ハンドラ + `feed.rs::select_past_note`)
  をすべて新 API に追従させる
- Rust 側 unit / integration test を新 payload 形式に追従させる
- TS 側 `editorReducer.ts` / `editorStateChannel.ts` が **新形式の
  payload を正しく受信できる** ことを DOM テストで確認する

### OUT

- TS 側 `EditingSessionStateDto` の更なる修正（既に block-aware なため）
- Capture ドメインモデル (`docs/domain/code/ts/src/capture/states.ts`) の修正
- `ui-feed-list-actions` Sprint 4 で導入される `select_past_note` の
  block-aware 拡張（先行で **Option A** として merge 済みのはず）
- `ui-editor` の TS 側挙動 spec の改訂（既に block-aware）

---

## 作業前提

1. `feature/inplace-edit-migration` ブランチから派生
   （Sprint 4 完了コミットを base にする）
2. 関連 feature: 新規 VCSDD feature `ipc-editor-payload-block-migration`
   を init するか、既存 `ui-editor` の Sprint X として再オープンするか
   オーケストレータと相談
3. Mode: **strict** 推奨（Rust ↔ TS の payload 互換性は強い contract が必要）
4. Language profile: **rust** （cargo / serde 中心）+ TS 側 verify

---

## 必読ドキュメント

- `docs/domain/code/ts/src/capture/states.ts` — `EditingState` /
  `SwitchingState` / `SaveFailedState` / `PendingNextFocus` の型契約
- `docs/domain/code/ts/src/shared/note.ts` — `Block` / `BlockId` /
  `NoteOps` 周辺
- `docs/domain/aggregates.md` §1 Note Aggregate / §EditingSessionState 遷移
- `docs/domain/glossary.md` §0 Shared Kernel
- `promptnotes/src/lib/editor/types.ts:100-203` — TS 側 DTO + ViewState
- `promptnotes/src/lib/editor/editorStateChannel.ts:28-42` —
  `event.payload.state` 経路
- `promptnotes/src-tauri/src/editor.rs` 全体（特に L32-220）
- `promptnotes/src-tauri/src/feed.rs::select_past_note` (Sprint 4 完了後)
- `docs/tasks/block-migration-spec-impact.md` — Sprint 4 完了範囲の確認用

---

## 想定 Rust DTO 構造（参考案）

`#[serde(tag = "status")]` で外部 tagged union、`rename_all = "camelCase"`
を全 variant に適用。

```rust
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum EditingSessionStateDto {
    Idle,

    Editing {
        current_note_id: String,
        focused_block_id: Option<String>,
        is_dirty: bool,
        is_note_empty: bool,
        last_save_result: Option<String>, // "success" | None
        #[serde(skip_serializing_if = "Option::is_none")]
        blocks: Option<Vec<DtoBlock>>,
    },

    Saving {
        current_note_id: String,
        is_note_empty: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        blocks: Option<Vec<DtoBlock>>,
    },

    Switching {
        current_note_id: String,
        pending_next_focus: PendingNextFocusDto,
        is_note_empty: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        blocks: Option<Vec<DtoBlock>>,
    },

    SaveFailed {
        current_note_id: String,
        prior_focused_block_id: Option<String>,
        pending_next_focus: Option<PendingNextFocusDto>,
        last_save_error: SaveErrorDto,
        is_note_empty: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        blocks: Option<Vec<DtoBlock>>,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingNextFocusDto {
    pub note_id: String,
    pub block_id: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DtoBlock {
    pub id: String,
    #[serde(rename = "type")]
    pub block_type: String,
    pub content: String,
}
```

> ⚠ 上記は参考案です。実装時には TS 側 DTO の **field 名・nullable 条件・
> rename 規則** と完全一致するか **JSON ラウンドトリップテスト**
> (`serde_json::to_string` → TS 型ガードで parse) を追加して検証してください。

---

## VCSDD ワークフロー想定

1. **Phase 1a/1b** (`vcsdd-builder`):
   - 新 feature の behavioral-spec.md / verification-architecture.md
   - REQ-IPC-001..N を策定 (variant 別の wire shape, fallback 規則)
   - 純粋性境界: Rust DTO 構築は I/O を伴わないため tier 0 / pure
2. **Phase 1c** (`vcsdd-adversary`):
   - TS 側 DTO と完全互換であることを EARS レベルで保証する
   - emit 順序 (REQ-FEED-024 EC-FEED-017) との整合確認
3. **Phase 2a Red** (`vcsdd-builder`):
   - Rust unit test: 各 variant の serde 出力を JSON 文字列でアサート
   - TS 側 DOM test: editorStateChannel が新 payload を吸収できる
4. **Phase 2b/2c Green/Refactor** (`vcsdd-builder`):
   - `EditingSessionStateDto` を enum 化
   - `make_editing_state_changed_payload` を variant 別ヘルパに分割
   - 全呼び出し箇所を更新
5. **Phase 3** (`vcsdd-adversary`):
   - 不整合・dead code・spec drift をレビュー
6. **Phase 5** (`vcsdd-verifier`):
   - serde ラウンドトリップ proof / IPC boundary audit
7. **Phase 6**:
   - 4D 収束、convergence verdict、commit + push

各フェーズで `/vcsdd-commit` によりタグ付きコミットを作成すること。

---

## 影響範囲リスト

ワイヤ互換性を崩さずに段階的に移行するのは困難なため、**big bang 切替**
が現実的です。以下のファイルを同一 PR で更新する想定:

### Rust

- `promptnotes/src-tauri/src/editor.rs` (DTO + ヘルパ + 全ハンドラ)
- `promptnotes/src-tauri/src/feed.rs::select_past_note`
  (Sprint 4 で導入された呼び出し)
- `promptnotes/src-tauri/tests/editor_handlers.rs` (存在する場合)
- `promptnotes/src-tauri/tests/feed_handlers.rs` の
  `test_select_past_note_*`

### TypeScript (検証用)

- `promptnotes/src/lib/editor/editorStateChannel.ts` —
  payload 形が一致するか型ガードで再確認
- `promptnotes/src/lib/editor/__tests__/dom/*.dom.vitest.ts` —
  emit 後の状態遷移が想定通りか
- `promptnotes/src/lib/feed/__tests__/dom/main-route.dom.vitest.ts` —
  `select_past_note` 経由の payload で EditorPane が正しく rehydrate
  されるか

---

## 完了基準 (DOD)

- `cargo test` 全 PASS（既存 + 追加の serde ラウンドトリップ test）
- `bun test` および `vitest` 全 PASS
- `bun run tauri dev` 起動 → 過去ノート選択でエディタ側に正しい
  block 列が反映されることを目視確認
- VCSDD: Phase 6 PASS、`/vcsdd-commit` で全フェーズ commit、push 成功
- `git status` で `up to date with origin` を確認

---

## 関連リンク

- `docs/tasks/block-migration-spec-impact.md` — 移行全体の影響度評価
- `docs/tasks/ui-editor-sprint-2-handoff.md` — TS 側 editor 移行の前史
- `docs/tasks/sprint-ui-feed-list-actions-s3.md` — 直前 Sprint 3 の
  経緯（`select_past_note` IPC 拡張の起点）

---

## 履歴

- **2026-05-09**: 初版作成。`ui-feed-list-actions` Sprint 4 セッション
  で Option A を採用し、Rust 側全面 migrate を本ドキュメントに切り出し。
