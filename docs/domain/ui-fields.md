---
coherence:
  node_id: "design:ui-fields"
  type: design
  name: "UI Fields — 画面項目仕様（DDD Phase 11 成果物）"
  depends_on:
    - id: "design:workflows"
      relation: derives_from
    - id: "design:aggregates"
      relation: derives_from
    - id: "governance:glossary"
      relation: specifies
    - id: "design:type-contracts"
      relation: derives_from
  depended_by:
    - id: "req:ui-app-shell"
    - id: "req:ui-editor"
    - id: "req:ui-feed-list-actions"
    - id: "req:ui-tag-chip"
    - id: "req:ui-filter-search"
  conventions:
    - targets:
        - "req:ui-app-shell"
        - "req:ui-editor"
        - "req:ui-feed-list-actions"
        - "req:ui-tag-chip"
        - "req:ui-filter-search"
      reason: "UI フィールド定義・検証エラーマッピング・EditingSessionState 表示対応の変更は全 UI feature spec の再レビューを要する"
  source_files:
    - "docs/domain/code/ts/src"
    - "docs/domain/code/rust/src/value_objects.rs"
---

# UI Fields — 入力画面項目仕様

Phase 11 で Phase 10 の型から自動抽出。UI 実装者向け。
入力境界は `Unvalidated*` ステージ／Command 入力型から、検証規則は対応する `Validated*` または Smart Constructor から引当。
glossary.md を表示ラベル・ヘルプテキストの出典とする。

生成日: 2026-04-28
ベース: `docs/domain/code/ts/src/**` (TypeScript) + `docs/domain/code/rust/src/value_objects.rs` (Smart Constructor は Rust 側真実)

---

## 重要設計前提

### ブロックベース WYSIWYG エディタ

discovery.md / aggregates.md の方針に基づき、本文は単一 Markdown 文字列ではなく **`Block[]`（順序つきブロック列）** として扱う。各ブロックは HTML `contenteditable="true"` を持ち、ユーザーは見た目に**Markdown シンタックスがレンダリングされた状態**で直接編集する（Logseq / Notion 風）。

- 入力フォーム遷移なし：クリック＝即編集可能
- 種別ごとの装飾（見出し・コード・引用等）は入力時にその場で反映
- 各ブロックには Inline Editor Library（CodeMirror 6 / ProseMirror / Slate のいずれか）の組み込みインスタンスを配置
- フィード上の**過去ノートのブロックも同じく直接編集可能**（読み取り専用プレビューではない）

### Smart Constructor は Rust 側

`NoteId` / `BlockId` / `BlockContent` / `Tag` / `Body` / `Frontmatter` / `VaultPath` / `Timestamp` は **TypeScript 側で構築不能**（Brand 型 + unique symbol）。
UI は raw 文字列 / 数値を受け付け、**Tauri command 経由で Rust 側 `try_new_*` を呼ぶ**。

| UI 入力 | UI 側型 | 検証コマンド (Rust) | Brand 化先 |
|---------|--------|------------------|----------|
| ブロック content | `string` | `try_new_block_content` (制御文字拒否、改行制御は type 依存) | `BlockContent` |
| ブロック種別 | `'paragraph' \| 'heading-1' \| ...`（リテラル） | `try_new_block_type` | `BlockType` |
| ノート本文（派生） | `string` | `try_new_body`（`serializeBlocksToMarkdown` の出力） | `Body` |
| タグ 1 件 | `string` | `try_new_tag` (空文字 / 空白のみ拒否、正規化) | `Tag` |
| Vault パス | `string` | `try_new_vault_path` (空 / 非絶対パス拒否) | `VaultPath` |
| Frontmatter | `{ tags, createdAt, updatedAt }` | `try_new_frontmatter` (updatedAt ≥ createdAt、tag 重複禁止) | `Frontmatter` |
| NoteId | （UI から入力しない） | `Vault.allocate_note_id` で生成 | `NoteId` |
| BlockId | （UI から入力しない） | Note 内で採番（再ハイドレート時にも再採番） | `BlockId` |

### UI が直接扱う Unvalidated* / Command 入力

| UI 部品 | 入り口の型 | 対応ワークフロー |
|--------|----------|---------------|
| ブロックエディタ（contenteditable） | `EditBlockContent` / `InsertBlockAfter` / `RemoveBlock` / `MergeBlockWithPrevious` / `SplitBlock` / `ChangeBlockType` / `MoveBlock` | Workflow 10（BlockEdit）→ Workflow 2 |
| Frontmatter インライン編集 | `InsertTagInline` / `RemoveTagInline`（既存）| Workflow 2 |
| タグチップ | `AddTagViaChip` / `RemoveTagViaChip` Command | Workflow 4 |
| フィルタ・検索 UI | `UnvalidatedFilterInput` | Workflow 7 |
| 削除モーダル | `RequestNoteDeletion` → `ConfirmNoteDeletion` | Workflow 5 |
| Vault 設定モーダル | （raw `string` → `try_new_vault_path`） | Workflow 9 |

---

## 画面 1: メインフィード（単一画面 — discover フェーズで `single-page-feed` 確定）

### 1A. ブロックエディタ領域（フィード内に分散：新規ノート + 過去ノート）

> 旧バージョンでは「最上部にエディタ、下にフィード」の二段構成だったが、ブロックベース WYSIWYG（discovery.md）の採用後はフィード内の各ノートそのものがブロックエディタとして描画される。最上部の新規ノートと過去ノートは**同じ部品**で、機能差は「Empty Note 判定対象か否か」のみ。

対応 Command: `EditBlockContent`, `InsertBlockAfter`, `RemoveBlock`, `MergeBlockWithPrevious`, `SplitBlock`, `ChangeBlockType`, `MoveBlock`, `InsertTagInline`, `RemoveTagInline`, `TriggerIdleSave`, `TriggerBlurSave`, `CopyNoteBody`
対応ワークフロー: `Workflow 10 (BlockEdit)`, `Workflow 2 (CaptureAutoSave)`, `Workflow 3 (EditPastNoteStart)`, `Workflow 6 (CopyBody)`

#### セクション 1A-1: ブロック列（Note 本文）

各ノートは順序つき `Block[]` として描画される。ブロック種ごとに HTML / 装飾が異なる：

| BlockType | HTML 構造（概念） | レンダリング |
|-----------|-----------------|------------|
| `paragraph` | `<div class="block paragraph" contenteditable="true">` | プレーンテキスト |
| `heading-1`〜`-3` | `<h1\|h2\|h3 contenteditable="true">` | 見出しサイズ・太字（`# ` プレフィックスは非表示） |
| `bullet` | `<li class="block bullet" contenteditable="true">` | 行頭にビュレット表示（`- ` は非表示） |
| `numbered` | `<li class="block numbered" contenteditable="true">` | 行頭に番号表示 |
| `code` | `<pre><code contenteditable="true">` | 等幅フォント・背景色・任意で構文ハイライト |
| `quote` | `<blockquote contenteditable="true">` | 左罫線・字下げ |
| `divider` | `<hr>`（contenteditable=false） | 横線。content 編集不可 |

各ブロックには Inline Editor Library（CodeMirror 6 / ProseMirror / Slate）の組み込みインスタンスを配置する。MVP では単一ライブラリで全種を扱う。

| フィールド | UI 側型 | 必須 | 検証 | UI 部品 | glossary 出典 |
|-----------|--------|----|-----|--------|-------------|
| block.content | `string` (raw → `BlockContent`) | △ (空文字許容、divider 以外) | 制御文字拒否、改行制御は type 依存（code は複数行可） | contenteditable 要素 | §0 ブロック内容 |
| block.type | `BlockType`（リテラル） | ✓ | `try_new_block_type` | （key shortcut / `/` メニュー / Markdown 入力で切替） | §0 ブロック種別 |

**動的挙動（キー入力）**:

| 入力 | 発火 Command | 結果 |
|------|------------|------|
| 通常文字 | `EditBlockContent` | content 更新 |
| Enter（行末） | `InsertBlockAfter(type='paragraph')` | 新規空段落を直後に追加、フォーカス移動 |
| Enter（テキスト中央） | `SplitBlock(offset)` | 現ブロックを 2 分割、後半を新ブロックに |
| Backspace（行頭） | `MergeBlockWithPrevious` | 前ブロックと結合 or 前ブロックが空なら前を削除 |
| `# ` または `## ` または `### `（行頭） | `ChangeBlockType('heading-N')` | 段落を見出しに変換 |
| `- ` または `* `（行頭） | `ChangeBlockType('bullet')` | 段落を箇条書きに変換 |
| `1. `（行頭） | `ChangeBlockType('numbered')` | 段落を番号付きに変換 |
| `> `（行頭） | `ChangeBlockType('quote')` | 段落を引用に変換 |
| ` ``` `（単独行） | `ChangeBlockType('code')` | 段落をコードブロックに変換 |
| `---`（単独行） | `ChangeBlockType('divider')` | 区切り線に変換 |
| `/` | `/` メニュー表示 | 任意の type 選択 → `ChangeBlockType` |

**動的挙動（保存）**:
- 入力ごとに Capture 側 `EditBlockContent` Command 発火 (`isDirty=true`)
- 入力停止 ~2s で `TriggerIdleSave` 自動発火（debounce、定数 `IDLE_SAVE_DEBOUNCE_MS` は実装定数）
- そのノート内の**全ブロックからフォーカスが外れた**契機で `TriggerBlurSave` 自動発火
- IME composition 中（変換中）は `EditBlockContent` を遅延（compositionend まで）

**Empty Note 判定**:
- 新規ノートで `note.isEmpty()=true`（全ブロックが空 paragraph、または divider のみ）の状態で blur 完結すると `EmptyNoteDiscarded`
- 過去ノートでは適用されない（既に保存済み Note は空にしてもファイルは残る）

#### セクション 1A-2: Frontmatter（インライン YAML）

`MVP では追加フィールドなし` (glossary §0)。固定 3 フィールド：

| フィールド | UI 側型 | 必須 | 検証 | UI 部品 |
|-----------|--------|----|-----|--------|
| tags | `string[]` (raw → `Tag[]`) | - (空配列許容) | 各要素 `try_new_tag` で正規化、重複禁止 | タグ入力（チップ式、TagInventory からサジェスト） |
| createdAt | `Timestamp` (epoch ms) | ✓ (Note 生成時に Clock.now で確定) | 不変 | 表示のみ（編集不可） |
| updatedAt | `Timestamp` (epoch ms) | ✓ (Save 時に Clock.now で更新) | `updatedAt >= createdAt` | 表示のみ（自動更新） |

**動的挙動**:
- Frontmatter は実装上 YAML テキストとして見せ、Capture 内部で `editFrontmatter(patch)` に変換可能
- `FrontmatterPatch = replace-tags | add-tag | remove-tag` の 3 種で表現

#### セクション 1A-3: アクションボタン

| 操作 | UI 部品 | 対応 Command | エラー UI |
|------|--------|------------|----------|
| 「📋 コピー」 | ボタン | `CopyNoteBody` | clipboard 失敗バナー（極稀） |
| 「+ 新規」 | ボタン (Ctrl+N も同じ) | `RequestNewNote { source }` | — |

`source` は `'explicit-button' | 'ctrl-N'` 判別（`.ddd-session.json` decisions に従う）。

---

### 1B. フィード一覧（中央、各ノートはブロックエディタとして描画）

対応データソース: `Feed.computeVisible(snapshots)` 戻り値の各 `Note` snapshot
対応 Command: `BlockFocused` (= 旧 `SelectPastNote`), `AddTagViaChip`, `RemoveTagViaChip`, `RequestNoteDeletion` ＋ 1A セクションの全ブロック編集 Command

#### 各ノートの表示項目（ブロックエディタとして展開）

| フィールド | データ源 | 表示 |
|-----------|---------|------|
| createdAt / updatedAt | `Note.frontmatter` | タイムスタンプ（メタヘッダ） |
| blocks | `Note.blocks` | **全ブロックを WYSIWYG で展開**。折りたたみは長文時のみ（任意） |
| tags | `Note.frontmatter.tags` | タグチップ列（メタフッタ） |

> 旧バージョンでは「body 先頭 N 行プレビュー」を表示し、クリックして編集モードへ遷移していた。ブロックベース UI 化以降は**最初から全ブロックを展開し、各ブロックが contenteditable**。プレビュー／編集の二段階は廃止。

#### 各ノートのインライン操作

| 操作 | UI 部品 | 対応 Command | 入力 | 検証 |
|------|--------|------------|----|------|
| ブロッククリック／キー入力 | 任意ブロック | `BlockFocused { noteId, blockId }` → 1A の各ブロック編集 Command | NoteId, BlockId | — (内部で確定) |
| タグチップ追加 | 末尾「+」アイコン → サジェスト/入力 | `AddTagViaChip { noteId, tag }` | `string` raw → `try_new_tag` | Tag Smart Constructor |
| タグチップ削除 | チップ右肩「×」 | `RemoveTagViaChip { noteId, tag }` | Tag (チップ自身が保持) | — |
| 削除 | 「🗑」ボタン | `RequestNoteDeletion { noteId }` | — | — |

**依存関係**:
- 編集中ノート (`EditingSessionState.currentNoteId`) と同じ行は削除ボタンを **無効化** (validation F5/F13: UI 層責務)
- タグチップ追加 UI は `TagInventory.entries` を参照してサジェスト（オートコンプリート、validation シナリオ 7）
- 1 ノート内で**同時に Block Focus を保持できるブロックは最大 1 個**（DOM の自然な制約）

---

### 1C. 左サイドバー: タグフィルタ UI

対応 Command: `ApplyTagFilter`, `RemoveTagFilter`, `ClearFilter`
対応ワークフロー: `Workflow 7 (ApplyFilterOrSearch)` 入力 `UnvalidatedFilterInput.tagsRaw`
対応 Read Model: `TagInventory`

| フィールド | UI 側型 | 必須 | UI 部品 |
|-----------|--------|----|--------|
| 選択中タグ | `Tag[]` (チップ表示) | - | チップ列（×で個別解除） |
| 候補タグ一覧 | `TagEntry[]` から導出 (`name` + `usageCount`) | - | リスト（usageCount 降順、`#tag (count)` 表示） |
| 「すべて解除」 | — | - | リンクボタン → `ClearFilter` |

**検証**:
- UI からは `TagInventory.entries` のみが選択可能（既存タグのみ）→ Tag Smart Constructor を経ずに型安全
- 複数選択時は **同タグ間 OR**（aggregates.md §2 / `FilterCriteria.tags` の意味論）
- 異種条件（タグ + frontmatter フィールド）併用時は **AND** （ただし MVP は frontmatter フィルタ UI を提供しないため発火しない）

---

### 1D. 上部: 検索ボックス

対応 Command: `ApplySearch`, `ClearSearch`
対応ワークフロー: `Workflow 7 (ApplyFilterOrSearch)` 入力 `UnvalidatedFilterInput.searchTextRaw`

| フィールド | UI 側型 | 必須 | 検証 | UI 部品 |
|-----------|--------|----|-----|--------|
| 検索クエリ | `string` | - (空文字許容、空はクリア扱い) | なし（部分一致、大文字小文字無視 ＝ MVP 仕様） | テキスト入力 |
| スコープ | `'body+frontmatter'` 固定 (MVP) | ✓ | — | （UI 露出なし、内部固定） |

**動的挙動**:
- 入力ごとに `FeedSearchQueryEntered` (internal)
- debounce 200ms 後に `FeedSearchApplied` を発火 → `Feed.searchQuery` 更新
- Esc で `ClearSearch`
- 0 件結果は `VisibleNoteIds.hasZeroResults=true`、特別 UI（「該当なし」メッセージ）を表示

**未確定**: 検索方式（部分一致 / 正規表現 / あいまい）は openQuestions のまま。MVP は部分一致前提で `searchTextRaw: string` を `SearchQuery.text: string` に直流し。

---

### 1E. 右側: ソート切替

対応 Command: `SortBy`

| フィールド | UI 側型 | 必須 | UI 部品 |
|-----------|--------|----|--------|
| field | `'timestamp'` 固定 | ✓ | （MVP 内部固定） |
| direction | `'desc' \| 'asc'` | ✓ | トグル（▼/▲） |

既定: `direction='desc'` (最新が上、glossary §2)。

---

## 画面 2: Vault 設定誘導モーダル

対応シナリオ: validation.md「シナリオ 1」
対応ワークフロー: `Workflow 9 (ConfigureVault)` 入力 `UserSelectedPath`

| フィールド | UI 側型 | 必須 | 検証 | UI 部品 |
|-----------|--------|----|-----|--------|
| vault path | `string` (raw → `VaultPath`) | ✓ | `try_new_vault_path`: 空文字拒否、非絶対パス拒否、加えて `FileSystem.statDir(path)` で実在確認 | OS フォルダ選択ダイアログ |

**エラー UI 反応** (workflows.md AppStartup エラーカタログ):

| エラー | メッセージ |
|-------|----------|
| `unconfigured` | 「保存先フォルダを選択してください」（誘導） |
| `path-not-found` | 「設定したフォルダが見つかりません。再設定するか、フォルダを復元してください」 |
| `permission-denied` | 「フォルダへのアクセス権限がありません」 |

**遷移**: フォルダ選択完了 → `VaultDirectoryConfigured` → `Workflow 1` の Step 2 (scanVault) へ続く。

---

## 画面 3: 削除確認モーダル

対応シナリオ: validation.md「シナリオ 8」
対応ワークフロー: `Workflow 5 (DeleteNote)` 入力 `DeletionConfirmed`

| フィールド | UI 側型 | 必須 | UI 部品 |
|-----------|--------|----|--------|
| 確定 | （ボタン） | ✓ | 「削除（OS ゴミ箱に送る）」赤ボタン → `ConfirmNoteDeletion { noteId }` |
| キャンセル | （ボタン） | ✓ | 「キャンセル」 → `CancelNoteDeletion { noteId }` |

メッセージ本文（glossary §3 OS Trash）:
「このノートを **OS のゴミ箱** に送ります。後で復元できます。」

**動的挙動**:
- 編集中ノート (`EditingSessionState.currentNoteId === target`) の場合、そもそもこのモーダルは **開かれない** (UI 層で削除ボタン無効化)
- 万一発火しても `AuthorizeDeletion` が `editing-in-progress` で reject

---

## 画面 4: 保存失敗バナー（非モーダル）

対応シナリオ: validation.md「シナリオ 9」失敗パス
対応ワークフロー: `Workflow 8 (HandleSaveFailure)` 入力 `UserDecision`

| 操作 | UI 側型 | UI 部品 | 対応 Command |
|------|--------|--------|------------|
| 再試行 | — | 「再試行」ボタン | `RetrySave` → `editing` から再 `saving` |
| 破棄 | — | 「変更を破棄」ボタン | `DiscardCurrentSession` → `pendingNextNoteId` あれば次セッション、無ければ idle |
| キャンセル | — | 「閉じる（このまま編集を続ける）」 | `CancelSwitch` → 元の `editing(currentNoteId)` |

メッセージは `SaveError.kind` で分岐:

| エラー | メッセージ |
|-------|----------|
| `fs.permission` | 「保存に失敗しました（権限不足）」 |
| `fs.disk-full` | 「保存に失敗しました（ディスク容量不足）」 |
| `fs.lock` | 「保存に失敗しました（ファイルがロックされています）」 |
| `fs.unknown` | 「保存に失敗しました」（詳細はログ） |
| `validation.invariant-violated` | 内部バグ：エラーログ + サイレント |
| `validation.empty-body-on-idle` | サイレント（破棄パスへ） |

---

## 検証エラー ↔ UI フィールド マッピング

| エラー | 表示先 | メッセージ |
|-------|-------|----------|
| `TagError.empty` / `TagError.only-whitespace` | タグ入力近傍 | 「タグは空にできません」 |
| `FrontmatterError.updated-before-created` | エディタ内 YAML 領域 | 「updatedAt は createdAt 以降である必要があります」（通常は内部で発生しないはず） |
| `FrontmatterError.duplicate-tag` | タグ入力近傍 | 「タグ '{tag}' は既に追加されています」 |
| `VaultPathError.empty` | Vault 設定モーダル | 「フォルダを選択してください」 |
| `VaultPathError.not-absolute` | Vault 設定モーダル | 「絶対パスを指定してください」 |
| `NoteIdError.invalid-format` | （UI で発火しない） | 内部バグログ |
| `AuthorizationError.editing-in-progress` | 削除ボタン Tooltip | 「編集を終了してから削除してください」 |
| `AuthorizationError.not-in-feed` | （内部バグ） | エラーログ |

---

## UI 状態と型の対応（コンパイル時禁止される不正状態）

### `EditingSessionState`（Capture）

| 状態 | UI 表示 | 各ブロックの contenteditable | コピーボタン | 削除ボタン |
|------|--------|--------|------------|----------|
| `idle` | フィード上のすべてのブロックは contenteditable=true で待機（クリック即編集） | true（フォーカスはどこにも入っていない） | 無効 | （ノート選択時のみ表示） |
| `editing` | `focusedBlockId` のブロックがアクティブ、`isDirty` バッジ | true | 有効 | 無効（編集中ノート） |
| `saving` | スピナ表示、`focusedBlockId` 維持 | true（入力可、保存はバックグラウンド） | 有効 | 無効 |
| `switching` | 切替予告バナー | false（save 完了待ちで一時無効化） | 無効 | 無効 |
| `save-failed` | 失敗バナー | true（再試行可能） | 無効 | 無効 |

**型上の保証** (`capture/states.ts`):
- `IdleState` は `currentNoteId` も `focusedBlockId` も持たない → idle 中のブロックフォーカス UI は型レベルで描画不能
- `EditingState` / `SavingState` は `currentNoteId` と `focusedBlockId` を必ず持つ
- `SwitchingState` は `pendingNextFocus: { noteId, blockId }` を必ず持つ → 「次フォーカス未指定で switching」状態は構築不能
- `SaveFailedState.pendingNextFocus` は `{noteId, blockId} | null` → 切替途中の失敗かどうかを UI が分岐できる

---

## 未解決項目（Phase 11 で発見・既存の openQuestions と整合）

| 項目 | 関連フィールド | 提案 / 差し戻し先 |
|------|-------------|----------------|
| 検索方式（部分一致 / 正規表現 / あいまい / 大文字小文字） | 1D 検索ボックス | aggregates.md / glossary.md。MVP は部分一致 + 大文字小文字無視で確定 |
| 検索インクリメンタル debounce | 1D 検索ボックス | 実装定数（`SEARCH_DEBOUNCE_MS=200` 想定） |
| 検索とフィルタの組み合わせ | 1C/1D 同時選択時 | `AppliedFilter` は両方持てる（criteria + query）→ 実装は AND（OR 併用は未対応） |
| フィルタ複数条件の AND/OR | 1C 拡張時 | `FilterCriteria` は同種 OR / 異種 AND が型のセマンティクス（aggregates.md §2 不変条件 3） |
| Auto-save debounce 値 | 1A エディタ | 実装定数 `IDLE_SAVE_DEBOUNCE_MS=2000` |
| 空ノート判定（全ブロック空判定の細部） | 1A ブロック列 | aggregates.md `note.isEmpty()` で確定（全ブロックが空 paragraph or divider のみ = 空 Note） |
| ノート ID 衝突回避方法 | 1A 新規ボタン | aggregates.md / Vault.allocateNoteId で確定（`-N` サフィックス） |
| 削除確認方式（モーダル / Undo / OS ゴミ箱） | 画面 3 | discover フェーズで「OS ゴミ箱送り + モーダル確認」確定 |
| 削除のショートカットキー | 各行 | UI 仕様未確定（Del キー想定だが未明記） |
| TagInventory にタグ使用回数を含めるか | 1C サイドバー | aggregates.md §3 で `TagEntry.usageCount` 確定 |
| 未使用タグの扱い（自動削除 / 保持） | 1C サイドバー | aggregates.md §3 不変条件 1（usageCount > 0）で自動削除確定 |
| frontmatter テンプレート（source / model / status） | 1A-2 | discover フェーズで MVP 範囲外と確定（ui-fields にも非掲載） |
| インライン YAML 編集 UX（自由テキスト / フォーム式） | 1A-2 | aggregates.md `editFrontmatter(patch)` の 3 patch をどの UI で出すかが未確定 |
| Inline Editor Library 選定 | 1A ブロック列 | discovery.md openQuestions：CodeMirror 6 / ProseMirror / Slate / 自前 contenteditable のいずれか |
| ブロックを **個別エディタインスタンス** にするか **Note 全体で 1 インスタンス** にするか | 1A ブロック列 | discovery.md openQuestions。前者は分離が綺麗、後者はカーソル移動・選択範囲が自然 |
| ブロックネスト（Logseq 風アウトライン）の MVP 採否 | 1A ブロック列 | discovery.md / aggregates.md 未解決の問い：MVP はフラット構造を推奨 |
| インラインフォーマット（太字・コード・リンク等）の表現 | 1A ブロック列 | aggregates.md：BlockContent 内の Markdown 文字列として保持 vs 構造化トークン列 |
| `/` メニューの項目セット | 1A ブロック列 | 未確定。MVP セット（paragraph/heading-1〜3/bullet/numbered/code/quote/divider）から選択するメニュー |
| IME composition 中の保存抑制 | 1A ブロック列 | 確定：compositionend まで `EditBlockContent` を遅延 |

---

## Phase 11 → 既存フェーズへの差し戻し

| 発見パターン | 差し戻し先 | 内容 |
|----------|----------|------|
| `try_new_*` Tauri command の引数名・エラー型が UI バインディング上必須 | Phase 10 (types) — phase10.smartConstructorLocation の Tauri command シグネチャ確定が未完了 | 実装フェーズで `try_new_tag(raw: string) → Result<Tag, TagError>` 等を Tauri command として明示的に定義する必要 |
| 検索仕様 `SearchQuery.text: string` を `SearchQuery` の判別ユニオン化するかどうか | Phase 5 (aggregates) / Phase 8 (glossary) | MVP では string 一本で良いが、将来「正規表現サポート」を追加する場合は型分岐 |
| Frontmatter インライン編集の UI 仕様 | Phase 5 (aggregates) `editFrontmatter` の `FrontmatterPatch` 3 種をどう UI に対応づけるか未明示 | UI ガイドライン文書（このファイル）に追記したが、ユビキタス言語での命名が未確定 |
| Editor が編集中の Note を direct mutation するのか、`EditNoteBody` Command 経由のみか | Phase 9 (workflows) — Command 経由のみで OK だが UI 実装で逸脱しやすい | このファイルで「すべて Command 経由」と明示 |

---

## ベース型サマリ（UI バインディング担当者向けクイック参照）

```ts
// Capture 入力（ブロック編集系）
type RequestNewNote = { kind: "request-new-note"; source: "explicit-button" | "ctrl-N"; issuedAt: Timestamp };
type FocusBlock = { kind: "focus-block"; noteId: NoteId; blockId: BlockId; issuedAt: Timestamp };
type EditBlockContent = { kind: "edit-block-content"; noteId: NoteId; blockId: BlockId; content: BlockContent; issuedAt: Timestamp };
type InsertBlockAfter = { kind: "insert-block-after"; noteId: NoteId; prevBlockId: BlockId; type: BlockType; content: BlockContent; issuedAt: Timestamp };
type RemoveBlock = { kind: "remove-block"; noteId: NoteId; blockId: BlockId; issuedAt: Timestamp };
type MergeBlockWithPrevious = { kind: "merge-block-with-previous"; noteId: NoteId; blockId: BlockId; issuedAt: Timestamp };
type SplitBlock = { kind: "split-block"; noteId: NoteId; blockId: BlockId; offset: number; issuedAt: Timestamp };
type ChangeBlockType = { kind: "change-block-type"; noteId: NoteId; blockId: BlockId; newType: BlockType; issuedAt: Timestamp };
type MoveBlock = { kind: "move-block"; noteId: NoteId; blockId: BlockId; toIndex: number; issuedAt: Timestamp };

// Capture 入力（既存）
type InsertTagInline = { kind: "insert-tag-inline"; noteId: NoteId; tag: Tag; issuedAt: Timestamp };
type CopyNoteBody = { kind: "copy-note-body"; noteId: NoteId; issuedAt: Timestamp };
type RetrySave = { kind: "retry-save"; ... };
type DiscardCurrentSession = { ... };
type CancelSwitch = { ... };

// Curate 入力
type ApplyTagFilter = { kind: "apply-tag-filter"; tag: Tag; issuedAt: Timestamp };
type ApplySearch = { kind: "apply-search"; query: SearchQuery; issuedAt: Timestamp };
type SortBy = { kind: "sort-by"; order: SortOrder; issuedAt: Timestamp };
type AddTagViaChip = { kind: "add-tag-via-chip"; noteId: NoteId; tag: Tag; issuedAt: Timestamp };
type RequestNoteDeletion = { kind: "request-note-deletion"; noteId: NoteId; issuedAt: Timestamp };
type ConfirmNoteDeletion = { kind: "confirm-note-deletion"; noteId: NoteId; issuedAt: Timestamp };

// 旧 SelectPastNote は FocusBlock(noteId, blockId) に置き換え（block-level に refine）

// フィルタ・検索 ピュア入力
type UnvalidatedFilterInput = {
  kind: "UnvalidatedFilterInput";
  tagsRaw: readonly string[];
  fieldsRaw: ReadonlyMap<string, string>;
  searchTextRaw: string | null;
  sortOrder: SortOrder;
};

// Block 関連型
type BlockId = Brand<string, "BlockId">;
type BlockType = "paragraph" | "heading-1" | "heading-2" | "heading-3" | "bullet" | "numbered" | "code" | "quote" | "divider";
type BlockContent = Brand<string, "BlockContent">;
type Block = { id: BlockId; type: BlockType; content: BlockContent };
```
