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

# ── 2026-05-10 追加: 動作検証で発覚した残課題 (in-place UX が未完成) ──
Step 4: ui-feed-list-actions Sprint 6  ← preview ↔ editor 排他化 + クリック導線是正
Step 5: app-startup-runtime (新規)     ← Rust 側 AppStartup Step 4 (新規ノート auto-create)
Step 6: block-persistence (新規)       ← Group B 9 ハンドラの Rust 実装 (永続化)
```

> **2026-05-10 追記の経緯**: `feature/block-based-ui-migration` ブランチで Step 1〜3 が
> Phase 6 PASS したのち、ユーザー動作検証で「Notion / Logseq 風 in-place 編集に
> なっていない」ことが判明（preview と editor が縦に重なる、起動時に空ノートが
> 上部に出ない、入力文字が永続化されない）。Step 1〜3 のスコープを意図的に
> 「UI mount のみ」に狭めた結果として spec から脱落した責務を、Step 4〜6 として
> 補完する。詳細根拠は `discovery.md §エディタ実装方針` と `workflows.md` Workflow 1
> Step 4 / Workflow 3、および `ui-feed-list-actions` REQ-FEED-030 の 2x2 truth table
> （cell 1 で preview を「非表示」と規定）を参照。

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

### Step 4: `ui-feed-list-actions` Sprint 6 — preview ↔ editor 排他化 + クリック導線是正

**VCSDD ワークフロー**: 完全 VCSDD pipeline（既存 feature に Sprint 6 追加）

**背景 (発覚した不整合)**:

`FeedRow.svelte` の現行実装 (`promptnotes/src/lib/feed/FeedRow.svelte:322-471`) は
`.row-button`（timestamp + body-preview + tags + tag-add）を **常に描画** し、
`.block-editor-surface` をその下に **追加** マウントする。これにより `editingNoteId
=== self.noteId` のとき preview と editor が縦に重なって表示される。

しかし `behavioral-spec.md:1031-1036` の REQ-FEED-030 truth table cell 1 は preview を
**「非表示」** と規定している:

```
| editingStatus ∈ {editing, ...} | editingNoteId === self.noteId | blocks.length | 非表示 |
```

Sprint 5 Phase 3 の AC が「`block-element` が `blocks.length` 個 DOM に存在する」だけを
検証し、「preview が消えている」を検証しなかったため見逃された。

加えて、`block-based-ui-spec-migration.md:30` の確定アーキテクチャ
> 「FeedRow 内ブロッククリック → そのブロックに直接 Block Focus」

に対し、現行実装は `<button class="row-button">` 全体に `onclick={handleRowClick}` を
持ち、`select-past-note` コマンドを介して間接的に編集に入る **二段階クリック** に
なっている。これは discovery.md §エディタ実装方針の
> 「Note Selection で編集対象を切替えてから入力という二段階操作は不要」

に反する。

**何を spec で定義するか**:

1. **REQ-FEED-030 cell 1 の AC 強化**: `editingNoteId === self.noteId` のとき
   `data-testid="row-body-preview"` および `.row-button` 由来の preview 要素は
   DOM から **unmount される** (display:none ではなく `{#if}` で実 unmount) ことを
   AC に追加。
2. **クリック導線の再設計**:
   - 行外（行のタイムスタンプ部・余白）のクリックは引き続き `select-past-note`
     を発火し、Rust 側で `editing_session_state_changed` を emit する
   - **行内 BlockElement のクリックは Rust ラウンドトリップを待たず**、
     `BlockElement` 自身が `dispatchSelectPastNote` + `dispatchFocusBlock` を
     一連の動作として発火する設計を `ui-block-editor` 側 REQ と協調定義
   - `editing_session_state_changed` 受信前のクリックも UI が即時反応すべき
3. **新規ノート行（最上部, Step 5 と協調）**: `editingNoteId === <新規ノートの id>`
   のとき、preview は最初から存在せず BlockElement のみが描画される
4. **Phase 5 ハードニング**: DOM property test として「preview と
   block-editor-surface が同時に DOM に存在する瞬間がない」ことをタイムライン的に
   property 化する（`fast-check` で random click sequence を生成）

**影響を受ける REQ**:

| REQ | Sprint 6 での扱い |
|-----|-----------------|
| REQ-FEED-030 cell 1 AC | `block-element` 個数 + **preview 非マウント** を両方 AC 化 |
| REQ-FEED-030 cell 3,4 | 変更なし（preview 表示維持） |
| REQ-FEED-031 fallback | `dispatchInsertBlockAtBeginning` が成功するようになる前提（Step 6 完了後）。Sprint 6 段階では best-effort のままで良い |
| 新 REQ-FEED-033 (案) | 行外クリック vs ブロッククリックの責任分担を明文化 |

**Phase 3 / 5 で必須の検証**:

- ✅ truth table 全 4 セルで preview / editor の表示状態を DOM assert
- ✅ クリック → 編集開始までのレイテンシ（preview と editor が並んで見える瞬間が
  存在しないこと）を property test で検証
- ✅ 既存 ui-tag-chip の RowClickHandler との衝突がないこと（タグチップクリックは
  `e.stopPropagation()` 済みの確認）

---

### Step 5: `app-startup-runtime`（新規 feature）— Rust 側 AppStartup Step 4 実装

**VCSDD ワークフロー**: 完全 VCSDD pipeline（1a → 1c → 2a → 2c → 3 → 5 → 6）

**背景 (発覚した不整合)**:

`workflows.md:94-104` Workflow 1 Step 4 `initializeCaptureSession` は
> 「新規ノートを `Note.create`（`blocks = [empty paragraph]`）し、Vault に
> `allocateNoteId` してもらい、EditingSessionState を `editing(noteId,
> focusedBlockId=先頭ブロック)` に」
> 発行 Event: `NewNoteAutoCreated`、`BlockFocused(noteId, firstBlockId)`

と規定し、TS ドメイン側には `promptnotes/src/lib/domain/app-startup/initialize-capture.ts`
として実装が存在する。しかし Rust の `feed_initial_state`
(`src-tauri/src/feed.rs:431-449`) は `editing: idle_editing()` を返すだけで、
TS ドメインのパイプラインがアプリケーション起動経路に **配線されていない**。
結果としてアプリ起動時に最上部の空ノートが現れず、ユーザーは「すぐ書ける」状態に
ならない。

**何を spec で定義するか**:

1. **Rust `feed_initial_state` 拡張**: 戻り値に AppStartup Step 4 の出力
   `InitialUIState` 相当を含める
   - 新規ノート ID（`Vault.allocateNoteId(now)` の結果）
   - 初期 `EditingSessionStateDto` を `editing(noteId, focusedBlockId=<先頭 BlockId>)`
   - 新規ノートを `visibleNoteIds` の先頭に prepend
   - 新規ノート用の `noteMetadata` エントリ（empty paragraph 1 件）
2. **`Vault.allocateNoteId` の Rust 実装**: 既存 NoteId 集合と衝突しない新 ID を
   timestamp ベースで採番
3. **emit 順序**: `feed_initial_state` 戻り値受領後、フロント側で `InitialUIState`
   から派生して `editing_session_state_changed` (新規 note + focusedBlockId) と
   `feed_state_changed` を順次 emit
4. **未保存新規ノートの破棄**: discovery.md / workflows.md Workflow 3 の
   「empty 状態で別 note 選択 → discard」ロジック (Workflow 3 §classifyCurrentSession
   の `'empty'` arm) が Rust 側に存在することを再確認・spec 化

**TS ドメインとの関係**:

- `promptnotes/src/lib/domain/app-startup/initialize-capture.ts` は **pure ドメインロジック**
  として保持し、Rust 実装の参照ベースとして使う（型契約 `docs/domain/code/ts/` から
  生成された純粋関数）
- Rust 側はこの TS の振る舞いを移植する形で proof harness を構築（同じ property を
  両者で検証）

**影響を受けるファイル / feature**:

| 場所 | 変更内容 |
|------|---------|
| `src-tauri/src/feed.rs` `feed_initial_state` | 戻り値 DTO に `editing.editing(noteId, focusedBlockId)` + 新規ノートメタデータを含める |
| `src-tauri/src/domain/` | `Vault.allocateNoteId` の Rust 実装、property test |
| `+page.svelte` | `feed_initial_state` 戻り値から `editingSessionState` を初期化 |
| `ui-feed-list-actions` | REQ-FEED-022 の AC を「初期状態は `editing` 状態を含む」へ更新する spec patch |

**Phase 5 ハードニング**:

- ✅ `nextAvailableNoteId(now, existingIds)` の property test (TS / Rust 両方)
  - 衝突しない、決定論的、timestamp 単調性
- ✅ `feed_initial_state` の起動 → emit 順序 (Workflow 1 の `VaultDirectoryConfigured →
  VaultScanned → NotesHydrated → FeedRestored → TagInventoryBuilt → NewNoteAutoCreated →
  EditorFocusedOnNewNote`) を integration test で検証

---

### Step 6: `block-persistence`（新規 feature）— Group B 9 ハンドラの Rust 実装

**VCSDD ワークフロー**: 完全 VCSDD pipeline（1a → 1c → 2a → 2c → 3 → 5 → 6）

**背景 (発覚した不整合)**:

`ui-feed-list-actions` `behavioral-spec.md:1062-1067` および REQ-FEED-031
ノート部 (line 1132) は Sprint 5 の制約として
> 「ユーザーが入力した文字は client-side の BlockElement state にしか保持されない
> (Rust に永続化されない)」

を **既知制約として固定** し、Group B の 9 ハンドラは Sprint 5 スコープ外と明示した。
しかしこれが残置されたままでは「書いたものが消えない安心感」（discovery.md Core
Domain）が成立しない。Step 4 で UX を整えても、入力が保存されなければユーザー
価値が完成しない。

**実装対象 (Group B 9 ハンドラ — REQ-FEED-030 Adapter command-mapping table の B 行)**:

| Tauri command name | 役割 | 関連 Workflow |
|-------------------|------|--------------|
| `editor_focus_block` | block focus 切替 | Workflow 3 EditPastNoteStart |
| `editor_edit_block_content` | block 内テキスト更新 | Workflow 2 CaptureAutoSave (debounce 起点) |
| `editor_insert_block_after` | block の Enter 挿入 | Workflow 10 BlockEdit |
| `editor_insert_block_at_beginning` | 先頭への block 挿入 | Workflow 10 BlockEdit / Step 5 fallback |
| `editor_remove_block` | empty block の Backspace 削除 | Workflow 10 BlockEdit |
| `editor_merge_blocks` | offset 0 Backspace の前 block マージ | Workflow 10 BlockEdit |
| `editor_split_block` | mid-block Enter の分割 | Workflow 10 BlockEdit |
| `editor_change_block_type` | `# ` 等の Markdown shortcut / `/` メニュー | Workflow 10 BlockEdit |
| `editor_move_block` | drag handle 経由の並び替え | Workflow 10 BlockEdit |

**何を spec で定義するか**:

1. **集約不変条件の保持**: `aggregates.md` §Note Aggregate の Block 不変条件
   （非空・順序保証・id 一意性）が各操作で維持されることを **property test** で検証
2. **永続化境界**: Block 操作は in-memory mutation（pure）とし、ファイル書込みは
   `CaptureAutoSave` (Workflow 2) のトリガで debounce 付きで発火。debounce タイマは
   既存 `debounceSchedule` / `debounceTimer` (block-editor primitive) と協調
3. **入力検証**: `BlockContent` VO の Smart Constructor（control char 排除 etc.）
   は TS 側 `BlockElement` `sanitiseContent` (line 122-143) と同等のロジックを
   Rust に実装
4. **emit する Internal Event**: `domain-events.md` の Block 系 Internal Events
   （`BlockEdited`, `BlockFocused`, `BlockInserted`, `BlockRemoved`, `BlocksMerged`,
   `BlockSplit`, `BlockTypeChanged`, `BlockMoved`）を発火し、`editing_session_state_changed`
   経由で UI に反映
5. **エラー処理**: 不正な offset / 存在しない blockId などの violation を
   `Result<_, BlockOpError>` で返却し、UI 側はエラーを吸収（reject ではなく定義済み
   error variant にマップ）

**TS ドメインとの関係**:

- `docs/domain/code/ts/src/capture/commands.ts` の Block 操作コマンド 8 種、
  `docs/domain/code/ts/src/capture/internal-events.ts` の Internal Events を
  Rust 移植の参照ベースとする
- 同じ property（不変条件）を TS / Rust 両方で property test し、ドメイン同値性を
  保証

**影響を受ける既存仕様**:

| 既存項目 | 変更内容 |
|---------|---------|
| `ui-feed-list-actions` REQ-FEED-030 Sprint 5 Rust handler scope split | Group B 9 method を Group A へ移行する spec patch |
| `ui-feed-list-actions` REQ-FEED-031 注記 | 「ユーザー入力は永続化されない」既知制約を解消する旨を追記 |
| `ui-block-editor` REQ-BE-026 | 16 method すべての Rust round-trip が成立することを AC に格上げ |

**Phase 5 ハードニング**:

- ✅ `Note` Aggregate の不変条件 property test (Rust / TS)
  - 全 9 操作後も block 数 ≥ 1, id 一意, 順序保持
- ✅ `CaptureAutoSave` debounce との統合 (Workflow 2 との接続テスト)
- ✅ `BlockContent` VO の input sanitisation property test (TS と Rust で同一出力)

**前提条件**:

- Step 4 (Sprint 6) 完了後、または並行可能（spec が独立しているため）
- Step 5 (app-startup-runtime) 完了後、または並行可能
- Step 6 が完了してはじめて、本 feature ブランチがプロダクション品質に達する

---

## feature 別ワークフロー早見表

| feature | 影響度 | ワークフロー |
|---------|-------|------------|
| `ui-block-editor` | **新規** | 完全 VCSDD pipeline（1a から白紙で作成） |
| `ui-feed-list-actions` | **大（Sprint 5）** | 完全 VCSDD pipeline（既存 feature に Sprint 5 追加） |
| `ui-app-shell` | **小（patch）** | 1 commit のドキュメントパッチのみ。Sprint 不要 |
| `ui-editor` | **廃止** | state.json に deprecated 注記を追加して凍結 |
| `ui-feed-list-actions` Sprint 6 | **大（追加 Sprint）** | 完全 VCSDD pipeline（preview ↔ editor 排他化 + クリック導線是正） |
| `app-startup-runtime` | **新規** | 完全 VCSDD pipeline（Rust 側 AppStartup Step 4 実装） |
| `block-persistence` | **新規** | 完全 VCSDD pipeline（Group B 9 ハンドラの Rust 実装） |

---

## 前提条件チェックリスト（タスク開始前に確認）

### Step 1〜3 着手時の前提条件 (済)

- [x] `ui-feed-list-actions` Sprint 4 が Phase 6 収束判定 PASS → `complete` になっている
- [x] `docs/domain/code/ts/src/` の block 型契約（`shared/note.ts`, `capture/commands.ts` 等）が最新
- [x] `src/lib/editor/` に残っている EditorPane 固有コードのリストを確認済み（本ドキュメントの「削除対象」テーブルと突合）

### Step 4〜6 着手時の前提条件 (2026-05-10 追加)

- [ ] Step 1〜3 全 feature が Phase 6 収束判定 PASS → `complete` になっている
- [ ] 動作検証で発覚した不整合（preview と editor の重複表示・新規ノート未生成・入力非永続化）を spec/contract に明文化済み（本ドキュメント Step 4〜6 セクション）
- [ ] `docs/domain/discovery.md §エディタ実装方針` および `workflows.md` Workflow 1 Step 4 / Workflow 3 と矛盾しないことを再確認
- [ ] Step 4 / 5 / 6 の依存関係を VCSDD bead として登録（`block-persistence` は `ui-feed-list-actions` Sprint 6 の preview 排他化が前提でなくとも spec は書けるが、UX 検証段階では Sprint 6 完了を待つほうが安全）

---

## 関連ドキュメント

- `docs/tasks/block-migration-spec-impact.md` — 型契約移行の完走状況（前提タスク）
- `docs/domain/bounded-contexts.md` — in-place 編集モデルの権威ある定義
- `docs/domain/aggregates.md` §Note Aggregate — Block Sub-entity の不変条件
- `.vcsdd/features/ui-editor/specs/behavioral-spec.md` — 旧 EditorPane spec（参照は避けること）
- `.vcsdd/features/ui-feed-list-actions/specs/behavioral-spec.md` — Sprint 1〜4 の現行 spec
