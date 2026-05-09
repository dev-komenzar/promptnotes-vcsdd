# IPC Payload Rust 側 Block 化 — 先行作業セッション指示

> **背景**: `feature/inplace-edit-migration` ブランチで TypeScript 側の
> `EditingSessionStateDto` (`promptnotes/src/lib/editor/types.ts`) は既に
> 5-arm discriminated union (`focusedBlockId` / `pendingNextFocus` /
> `priorFocusedBlockId` / `blocks?` を持つ block-aware な形) に migrate 済み
> ですが、**Rust 側の `EditingSessionStateDto`
> (`promptnotes/src-tauri/src/editor.rs`) は依然として旧 6 フラットフィールド
> 形式 (`status, isDirty, currentNoteId, pendingNextNoteId, lastError, body`)**
> のままで、ワイヤ互換性が崩れています。
>
> このドキュメントは **Rust 側を TS 側 DTO に追従** させる
> （Option B：Rust 全面 5-arm 化）作業の指示書です。
>
> **本作業を先に完了させてから `ui-feed-list-actions` Sprint 4 に着手します。**
> したがって `ui-feed-list-actions` Sprint 4 では Option A
> （`make_editing_state_changed_payload` の optional 引数による局所拡張）は
> **採用しません**。Sprint 4 は本作業 (Option B) によって 5-arm 化済みの
> `EditingSessionStateDto` を前提に、`select_past_note` の payload を
> `Editing` arm の正規形 (`focusedBlockId` / `blocks` 込み) で書き直す
> 方針となります。

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
- `ui-feed-list-actions` Sprint 4 の spec 改訂・実装
  （**本作業 (Option B) 完了後に別セッションで着手**。
  本作業では `select_past_note` の呼び出し側まで update が及ぶが、
  feed 側の REQ-FEED-002 / REQ-FEED-009 / REQ-FEED-024 の spec patch は
  Sprint 4 セッションが担当する）
- `ui-editor` の TS 側挙動 spec の改訂（既に block-aware）

---

## 作業前提

1. `feature/inplace-edit-migration` ブランチで作業
   （`ui-feed-list-actions` Sprint 4 着手 **前** の commit を base にする）
2. 関連 feature: 新規 VCSDD feature `ipc-editor-payload-block-migration`
   を init するか、既存 `ui-editor` の Sprint X として再オープンするか
   オーケストレータと相談
3. Mode: **strict** 推奨（Rust ↔ TS の payload 互換性は強い contract が必要）
4. Language profile: **rust** （cargo / serde 中心）+ TS 側 verify
5. **本作業中は `ui-feed-list-actions` のアクティブ化を解除**しておく
   （Sprint 4 セッション側の state.json は既に Sprint 4 / phase 1a を
   開いている場合があるため、Option B 着手前に
   `.vcsdd/active-feature.txt` を切り替え、index.json も整合させること）

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
- `promptnotes/src-tauri/src/feed.rs::select_past_note`
  （Sprint 3 で実装された現行の `make_editing_state_changed_payload`
  呼び出し箇所。Option B では合わせて新 API へ書き換える）
- `docs/tasks/block-migration-spec-impact.md` — Sprint 4 で予定されている
  feed 側 spec patch の参考として確認

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
  (Sprint 3 時点の既存呼び出し。新 API のシグネチャに追従)
- `promptnotes/src-tauri/tests/editor_handlers.rs` (存在する場合)
- `promptnotes/src-tauri/tests/feed_handlers.rs` の
  `test_select_past_note_*`（旧 6 フィールド payload を assert している
  3 テストは新 5-arm 形式に書き換える。`ui-feed-list-actions` Sprint 4 の
  spec 改訂と整合させる必要があるため、当該テストの assert 内容は
  最低限「`status` field の存在」「`currentNoteId` 一致」「`focusedBlockId` の
  default 動作（first block id か null）」程度に留め、
  block-aware な詳細 assert は Sprint 4 側で再強化する）

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

- **2026-05-09**: 初版作成。当初は `ui-feed-list-actions` Sprint 4 で
  Option A を採用し、Rust 全面 migrate (Option B) を後続セッションへ
  切り出す方針だった。
- **2026-05-09 (改訂)**: 方針変更。**Option B を先に完了** させてから
  `ui-feed-list-actions` Sprint 4 に着手することに決定。
  Sprint 4 では Option A は採用せず、5-arm 化済み DTO を前提に
  `select_past_note` payload を Editing arm 正規形で書き直す。
