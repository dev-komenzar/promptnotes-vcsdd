# Block-based UI Spec Migration — in-place 編集への feature spec 移行

> **スコープ**: `block-migration-spec-impact.md` が扱った「型契約の block 化」の
> 後続タスク。型の基盤が整った後、**UI アーキテクチャ**を in-place 編集モデルへ
> 移行するための spec 改訂・新規 feature 作成・コード移行の引き継ぎノート。
>
> **前提条件**: `block-migration-spec-impact.md` の全 feature（特に
> `ui-feed-list-actions` Sprint 4 の Phase 6 収束判定）が complete になっていること。
>
> **このドキュメントが扱うこと**:
> - in-place 編集 UX モデルの確定（アーキテクチャ判断）
> - 影響を受ける feature spec の改訂内容と VCSDD ワークフロー
> - コード移行の方針（削除・移動・新設）
>
> **このドキュメントが扱わないこと**:
> - ブロック編集の詳細インタラクション（`/` メニュー動作、keyboard shortcut 等）
>   → `ui-block-editor` の behavioral spec (1a) で定義する
> - Rust バックエンドの変更 → UI spec 確定後に別タスクで扱う

---

## アーキテクチャ判断（確定事項）

### 採用モデル: EditorPane 廃止・フィード行 in-place 編集

| 項目 | 旧モデル（Sprint 1〜4 実装済） | 新モデル（本タスクの目標） |
|-----|-------------------------------|--------------------------|
| レイアウト | CSS Grid 2カラム（FeedList 320px ＋ EditorPane 1fr） | 単一カラム（FeedList のみ） |
| 編集サーフェス | `EditorPanel.svelte`（独立コンポーネント） | `FeedRow.svelte` 内に埋め込まれた block コンポーネント群 |
| ノード選択 | FeedRow クリック → `editing_session_state_changed` → EditorPane 更新 | FeedRow 内ブロッククリック → そのブロックに直接 Block Focus |
| モード切替ボタン | なし（Sprint 2 で採用済み） | なし（維持） |
| 別画面遷移 | なし（維持） | なし（維持） |

根拠: `docs/domain/bounded-contexts.md`
> 「ブロックベース UI ではフィード上の任意ノートが常に in-place で編集可能になるため、
> 『Note Selection』はクリックで対象ブロックにフォーカスが入る瞬間の操作に縮退する。
> 専用の『編集モード切替』ボタンや別画面遷移は存在しない。」

---

## コード移行方針

### 削除対象（EditorPane 固有）

| ファイル | 理由 |
|---------|------|
| `src/lib/editor/EditorPanel.svelte` | EditorPane そのもの。廃止 |
| `src/lib/editor/editorStateChannel.ts` | EditorPane 向け `editing_session_state_changed` 受信。廃止 |
| `src/lib/editor/tauriEditorAdapter.ts` | EditorPane 向け IPC アダプター。廃止 |
| `src/lib/editor/editorReducer.ts` | `EditorViewState` ベースの reducer。廃止 |
| `src/lib/editor/editorPredicates.ts` | `EditorViewState` ベースの predicates。廃止 |
| `src/lib/editor/__tests__/dom/editor-panel.dom.vitest.ts` 他 | 上記に対応するテスト群。廃止 |
| `src/routes/editor-preview/+page.svelte` | EditorPanel の開発用プレビューページ。廃止 |

### 新ディレクトリへ移動（ブロック編集プリミティブ）

移動先: `src/lib/block-editor/`

| 移動元 | 移動後 |
|--------|--------|
| `src/lib/editor/BlockElement.svelte` | `src/lib/block-editor/BlockElement.svelte` |
| `src/lib/editor/BlockDragHandle.svelte` | `src/lib/block-editor/BlockDragHandle.svelte` |
| `src/lib/editor/SlashMenu.svelte` | `src/lib/block-editor/SlashMenu.svelte` |
| `src/lib/editor/SaveFailureBanner.svelte` | `src/lib/block-editor/SaveFailureBanner.svelte` |
| `src/lib/editor/clipboardAdapter.ts` | `src/lib/block-editor/clipboardAdapter.ts` |
| `src/lib/editor/debounceSchedule.ts` | `src/lib/block-editor/debounceSchedule.ts` |
| `src/lib/editor/debounceTimer.ts` | `src/lib/block-editor/debounceTimer.ts` |
| `src/lib/editor/timerModule.ts` | `src/lib/block-editor/timerModule.ts` |
| `src/lib/editor/keyboardListener.ts` | `src/lib/block-editor/keyboardListener.ts` |
| `src/lib/editor/types.ts`（一部） | `src/lib/block-editor/types.ts`（EditorPane 固有型を除く） |

### `+page.svelte` の変更

- `EditorPanel` の import・マウント・adapter 初期化を削除
- `editorStateChannel` / `tauriEditorAdapter` の import を削除
- `.layout` CSS Grid を単一カラム（FeedList のみ）に変更
- `editor-main` div を削除

### 旧 `ui-editor` feature の処理

`.vcsdd/features/ui-editor/state.json` に以下を追記して凍結:

```json
{
  "deprecatedAt": "<タスク開始日>",
  "deprecationReason": "Superseded by ui-block-editor. EditorPane architecture abolished in block-based-ui-spec-migration.",
  "supersededBy": "ui-block-editor"
}
```

新 feature は `.vcsdd/features/ui-block-editor/` として新規作成する。

---

## feature 別作業内容

### 作業順序

```
Step 1: ui-block-editor (新規)        ← ブロック編集プリミティブの spec を先に固める
Step 2: ui-feed-list-actions Sprint 5  ← FeedRow へのブロック組み込み
Step 3: ui-app-shell spec patch        ← レイアウト定義の更新（軽量）
```

---

### Step 1: `ui-block-editor`（新規 feature）

**VCSDD ワークフロー**: 完全 VCSDD pipeline（1a → 1c → 2a → 2c → 3 → 5 → 6）

**何を spec で定義するか**:
- `FeedRow` 内に埋め込まれる block コンポーネント群（`BlockElement`, `SlashMenu`, `BlockDragHandle`）の振る舞い
- Block Focus の取得・解放・移動（同一 Note 内ブロック間、Enter/Tab/矢印キー）
- contenteditable の入力ハンドリング（文字入力、Backspace、Enter による block 分割）
- `/` メニューの起動条件とブロック種変換
- `SaveFailureBanner` のインライン表示条件（`save-failed` 状態時）
- debounce による自動保存トリガーとの接点（`clipboardAdapter`, `debounceSchedule`）

**参照すべきドメイン文書**:
- `docs/domain/bounded-contexts.md` §Capture Context（Block Focus の定義）
- `docs/domain/aggregates.md` §Note Aggregate（Block Sub-entity の不変条件）
- `docs/domain/code/ts/src/shared/note.ts`（`Block`, `NoteOps`）
- `docs/domain/code/ts/src/capture/commands.ts`（Block 操作コマンド 8 種）
- `docs/domain/code/ts/src/capture/internal-events.ts`（Block 系 Internal Events）

**既存コードとの関係**:
- `src/lib/block-editor/` に移動済みのプリミティブを仕様の実装対象とする
- `ui-editor` Sprint 1〜5 の spec・tests は **参照しない**（旧 EditorPane モデルに汚染されている）

---

### Step 2: `ui-feed-list-actions` Sprint 5

**VCSDD ワークフロー**: 完全 VCSDD pipeline（Sprint 5 として既存 feature に追加）

**何が変わるか**:

1. **REQ-FEED-023 の全面書き換え**（Sprint 2 で定義した2カラムレイアウトを廃止）
   - `+page.svelte` は `FeedList` のみをマウント（EditorPane 削除）
   - `FeedRow.svelte` に `BlockElement` 群を埋め込む
   - `grid-template-columns: 320px 1fr` → `FeedList` が全幅を占めるレイアウトへ

2. **`editing_session_state_changed` IPC の再配線**
   - 旧: `editorStateChannel` → `EditorPanel` へ配送
   - 新: `feedStateChannel` 経由で `FeedRow` の block 状態を更新（または各 `FeedRow` が直接購読）
   - EC-FEED-017（`editing_session_state_changed` が `feed_state_changed` より先に来る順序保証）は維持

3. **EC-FEED-016 の再定義**
   - 旧: 「EditorPane 側がデフォルトの空 paragraph を生成する責任を持つ」
   - 新: `FeedRow` 側が空 paragraph を生成する責任を持つ（EditorPane が存在しないため）

4. **`FeedViewState` の見直し**
   - `pendingNextFocus` は FeedRow の visual cue 表示に引き続き使用（変更なし）
   - `editingNoteId` / `editingStatus` は FeedRow のフォーカス状態管理に使用（意味の再定義）

**参照すべき型契約**:
- `docs/domain/code/ts/src/capture/states.ts`（`EditingState.focusedBlockId`）
- `docs/domain/code/ts/src/capture/stages.ts`（`BlockFocusRequest`）
- `ui-block-editor` behavioral spec（Step 1 で作成したもの）

**影響を受ける既存 REQ**:

| REQ | 変更内容 |
|-----|---------|
| REQ-FEED-023 | 全面書き換え（2カラム → 単一カラム、EditorPane 削除） |
| REQ-FEED-024 | `editing_session_state_changed` の配信先を FeedRow に変更 |
| EC-FEED-016 | 空 paragraph fallback の責任が FeedRow に移管 |
| EC-FEED-017 | イベント順序保証は維持 |

---

### Step 3: `ui-app-shell` spec patch

**VCSDD ワークフロー**: spec patch のみ（新 Sprint 不要。1 commit のドキュメントパッチで完了）

**何が変わるか**:

1. **NEG-REQ-001 の文言更新**
   - 旧: 「note editor textarea, inline YAML frontmatter editor を実装しない」
   - 新: 「AppShell 自体はブロック編集コンポーネントを直接知らない（ブロック編集は FeedRow スコープ）」
   - 本質的な除外の意図（AppShell はレイアウトシェルのみ）は変わらないが、旧文言が EditorPane 前提の表現になっているため更新する

2. **レイアウト記述の更新**
   - `InitialUIState.editingSessionState` のパススルー説明から EditorPane への言及を除去

`.vcsdd/features/ui-app-shell/` 配下の `state.json` には Sprint を追加せず、
`coherence.json`（または state.json）に `block-ui-migration-acknowledged: true` を追記する。

---

## feature 別ワークフロー早見表

| feature | 影響度 | ワークフロー |
|---------|-------|------------|
| `ui-block-editor` | **新規** | 完全 VCSDD pipeline（1a から白紙で作成） |
| `ui-feed-list-actions` | **大（Sprint 5）** | 完全 VCSDD pipeline（既存 feature に Sprint 5 追加） |
| `ui-app-shell` | **小（patch）** | 1 commit のドキュメントパッチのみ。Sprint 不要 |
| `ui-editor` | **廃止** | state.json に deprecated 注記を追加して凍結 |

---

## 前提条件チェックリスト（タスク開始前に確認）

- [ ] `ui-feed-list-actions` Sprint 4 が Phase 6 収束判定 PASS → `complete` になっている
- [ ] `docs/domain/code/ts/src/` の block 型契約（`shared/note.ts`, `capture/commands.ts` 等）が最新
- [ ] `src/lib/editor/` に残っている EditorPane 固有コードのリストを確認済み（本ドキュメントの「削除対象」テーブルと突合）

---

## 関連ドキュメント

- `docs/tasks/block-migration-spec-impact.md` — 型契約移行の完走状況（前提タスク）
- `docs/domain/bounded-contexts.md` — in-place 編集モデルの権威ある定義
- `docs/domain/aggregates.md` §Note Aggregate — Block Sub-entity の不変条件
- `.vcsdd/features/ui-editor/specs/behavioral-spec.md` — 旧 EditorPane spec（参照は避けること）
- `.vcsdd/features/ui-feed-list-actions/specs/behavioral-spec.md` — Sprint 1〜4 の現行 spec
