# Event Storming

## 前提：UX 構造

- **ページ遷移なし**：フィード画面が常時表示され、その上で「作成・編集・閲覧・整理」が完結する。
- **ブロックベース WYSIWYG エディタ**（discovery.md 参照）：本文は `Block[]` で構成され、各ブロックは `contenteditable` を持つ。フィード上のあらゆるノートのあらゆるブロックが、その場でクリック → 編集できる（入力フォーム遷移なし）。
- **起動時の状態**：vault の既存ノートが時系列でフィード表示され、最上部に新規ノートが自動生成・**先頭ブロックにフォーカス**されている。
- **空ノートは破棄**：全ブロックが空（または divider のみ）の新規ノートはファイル化しない。
- **Obsidian 連携（MVP）**：外部による変更は「次回起動時の vault 再走査」でのみ反映される（fs watch しない）。ファイルは平坦な Markdown として保存され、Block 構造はメモリ上の派生表現。

## Domain Events（時系列）

### 起動シーケンス（並行発生）

| # | Event | 説明 |
|---|-------|------|
| 1 | `AppLaunched` | アプリが起動した |
| 2 | `VaultScanned` | vault フォルダの既存 Markdown ファイルが走査された |
| 2a | `NotesHydrated` | 各 NoteFileSnapshot の Markdown が Block[] にパースされ、Note Aggregate に変換された |
| 3 | `FeedRestored` | 既存ノートが時系列で並んだフィードが復元された |
| 3a | `TagInventoryBuilt` | 全ノートの frontmatter からタグが収集され、フィルタ用一覧が構築された |
| 4 | `NewNoteAutoCreated` | フィード最上部に新規ノート（タイムスタンプ命名）が生成された。`blocks = [empty paragraph]` |
| 5 | `BlockFocused` | 新規ノートの先頭ブロックにキャレットが置かれた（旧 `EditorFocusedOnNewNote`） |

### Capture（書く・流す）

| # | Event | 説明 |
|---|-------|------|
| 6a | `BlockContentEdited` | あるブロックの content が変更された（キー入力単位、一過性） |
| 6b | `BlockInserted` | 新規ブロックが挿入された（Enter キー or `/` メニュー or Markdown 入力） |
| 6c | `BlockRemoved` | ブロックが削除された |
| 6d | `BlocksMerged` | 行頭 Backspace で前ブロックと結合された |
| 6e | `BlockSplit` | テキスト中央 Enter でブロックが分割された |
| 6f | `BlockTypeChanged` | ブロック種別が変換された（`# ` → heading-1 等） |
| 6g | `BlockMoved` | ブロックが並べ替えられた |
| 7 | `NoteAutoSavedAfterIdle` | 入力停止が一定時間続き、自動保存された（Note 単位） |
| 8a | `BlockBlurred` | 個別ブロックからフォーカスが外れた |
| 8 | `EditorBlurredAllBlocks` | そのノートの全ブロックからフォーカスが外れた（旧 `EditorBlurred`） |
| 9 | `NoteAutoSavedOnBlur` | フォーカスアウト契機で自動保存された |
| 10 | `NoteBodyCopiedToClipboard` | ワンクリックコピーが実行された（frontmatter は除外、blocks → Markdown 直列化） |
| 11 | `NewNoteRequested` | Ctrl+N または「新規」ボタンで次のノート作成を要求した |
| 12 | `EmptyNoteDiscarded` | 全ブロックが空のままフォーカスを失った／離脱した新規ノートが破棄された |

### 編集セッション継続イベント（Capture：過去ノート選択時の再開）

> Phase 3 の境界改訂により、**過去ノートに対する本文・frontmatter 編集は Capture Context のイベント**として扱う。ブロックベース UI 化（discovery.md）以降は、過去ノートのブロックを直接クリックするだけで編集セッションが始まるため、専用の「選択モード」は不要となる。

| # | Event | 説明 | Context |
|---|-------|------|---------|
| 13 | `BlockFocused(noteId, blockId)` | フィード内の既存ノートのブロックにフォーカスが入り、編集セッションが開始された | **Curate（クリック） → Capture（セッション開始）** |
| 14 | `BlockContentEdited` | 編集中ノート（新規/過去問わず）のブロック content が変更された | Capture |
| 15 | `NoteFrontmatterEditedInline` | 編集中ノートの frontmatter（YAML 領域）がエディタ内で直接編集された | Capture |
| 16 | `NoteAutoSavedInSession` | 編集セッション中の自動保存（idle/blur）が完了した（過去ノートも対象） | Capture |

### Curate（集合操作・メタデータ操作 — 編集セッション外）

| # | Event | 説明 |
|---|-------|------|
| 17 | `FeedFilterByTagApplied` | タグでフィードがフィルタされた |
| 18 | `FeedFilterByFrontmatterApplied` | 任意の frontmatter フィールドでフィルタされた |
| 19 | `FeedFilterCleared` | フィルタが解除された |
| 20 | `FeedSortedByTimestamp` | タイムスタンプ順でソートされた（既定） |
| 20a | `TagChipAddedOnFeed` | フィード上のタグチップ操作で新たなタグが付与された（エディタを開かずに） |
| 20b | `TagChipRemovedOnFeed` | フィード上のタグチップ操作でタグが除去された |
| 21 | `NoteDeletionRequested` | ユーザーが既存ノートの削除を要求した（ボタン or ショートカット） |
| 22 | `NoteDeletionConfirmed` | 確認ダイアログ等で削除が確定された |
| 23 | `NoteDeletionCanceled` | 削除が取り消された |
| 24 | `NoteDeleted` | ノートが永続化層から削除され、フィードから外れた |
| 25 | `FeedSearchQueryEntered` | 検索ボックスにテキストが入力された（インクリメンタル想定） |
| 26 | `FeedSearchApplied` | 検索が実行され、フィードがクエリにマッチするノートに絞られた |
| 27 | `FeedSearchYieldedNoResults` | 検索結果が 0 件だった（UX 上の特別状態） |
| 28 | `FeedSearchCleared` | 検索が解除され、全件表示に戻った |
| 29 | `FeedSearchHighlightApplied` | 検索結果のヒット箇所がハイライトされた |
| 29a | `TagInventoryUpdated` | ノートのタグ追加・削除に応じてインベントリが更新された（新規タグ出現・最後の使用ノートが消えた等） |

### 周辺・例外

| # | Event | 説明 |
|---|-------|------|
| 30 | `VaultDirectoryNotConfigured` | 保存先未設定で起動された（初回起動など） |
| 31 | `VaultDirectoryConfigured` | ユーザーが vault ディレクトリを設定した |
| 32 | `AutoSaveFailed` | ファイル書き込みに失敗した（権限/容量/競合） |
| 33 | `NoteDeletionFailed` | ファイル削除に失敗した（権限/外部ロック等） |

## Command / Event マトリクス

Actor は **User**（人間）か **System**（タイマー・トリガ等の自動処理）。

| Actor | Command | Aggregate | → Event | 備考 |
|-------|---------|-----------|---------|------|
| User | `LaunchApp` | Application | `AppLaunched` | エントリ |
| System | `ScanVault` | Vault | `VaultScanned` | 起動時のみ |
| System | `HydrateNotes` | Note (ACL) | `NotesHydrated` | Markdown → Block[] 変換、Frontmatter VO 化 |
| System | `RestoreFeed` | Feed | `FeedRestored` | スキャン結果からフィード組み立て |
| System | `BuildTagInventory` | TagInventory | `TagInventoryBuilt` | 起動時に全ノートからタグ集約 |
| System | `UpdateTagInventory` | TagInventory | `TagInventoryUpdated` | frontmatter 変更／ノート削除時に増減反映 |
| System | `AutoCreateNewNote` | Note | `NewNoteAutoCreated` | 起動時 + ユーザー要求時。`blocks = [empty paragraph]` |
| System | `FocusBlock(noteId, blockId)` | Note | `BlockFocused` | 自動（新規ノート先頭ブロック） |
| User | `EditBlockContent(noteId, blockId, content)` | Note | `BlockContentEdited` | キー入力 |
| User | `InsertBlockAfter(noteId, prevId, type)` | Note | `BlockInserted` | Enter キー / `/` メニュー / Markdown シンタックス |
| User | `RemoveBlock(noteId, blockId)` | Note | `BlockRemoved` | 削除キー |
| User | `MergeBlockWithPrevious(noteId, blockId)` | Note | `BlocksMerged` | 行頭 Backspace |
| User | `SplitBlock(noteId, blockId, offset)` | Note | `BlockSplit` | テキスト中央 Enter |
| User | `ChangeBlockType(noteId, blockId, newType)` | Note | `BlockTypeChanged` | `# ` 入力 / `/` メニュー |
| User | `MoveBlock(noteId, blockId, toIndex)` | Note | `BlockMoved` | drag & drop |
| System | `AutoSaveOnIdle` | Note | `NoteAutoSavedAfterIdle` | デバウンス |
| User | `BlurBlock(blockId)` | Note | `BlockBlurred` | 個別ブロックフォーカスアウト |
| System | `DetectAllBlocksBlurred` | Note | `EditorBlurredAllBlocks` | Note の全ブロックがフォーカス外 |
| System | `AutoSaveOnBlur` | Note | `NoteAutoSavedOnBlur` | blur 契機 |
| User | `CopyNoteBody` | Note | `NoteBodyCopiedToClipboard` | ワンクリック（blocks → Markdown 直列化） |
| User | `RequestNewNote` | Note | `NewNoteRequested` | Ctrl+N or ボタン |
| System | `DiscardIfEmpty` | Note | `EmptyNoteDiscarded` | 空ノートクリーンアップ（全ブロック空判定） |
| User | `FocusBlock(pastNoteId, blockId)` | Note (Curate→Capture) | `BlockFocused` | フィード上で過去ノートのブロックをクリック → 編集セッション開始 |
| User | `EditFrontmatterInline` | Note | `NoteFrontmatterEditedInline` | エディタ内で frontmatter（YAML）を直接編集 |
| System | `AutoSaveInSession` | Note | `NoteAutoSavedInSession` | 過去ノート編集時の idle/blur 自動保存（13 以降） |
| User | `AddTagViaChip` | Note | `TagChipAddedOnFeed` | フィード上のタグチップ操作で付与（エディタ非経由） |
| User | `RemoveTagViaChip` | Note | `TagChipRemovedOnFeed` | フィード上のタグチップ操作で除去 |
| User | `ApplyFeedFilterByTag` | Feed | `FeedFilterByTagApplied` | フィルタ |
| User | `ApplyFeedFilterByFrontmatter` | Feed | `FeedFilterByFrontmatterApplied` | フィルタ |
| User | `ClearFeedFilter` | Feed | `FeedFilterCleared` | フィルタ解除 |
| User | `RequestNoteDeletion` | Note | `NoteDeletionRequested` | 削除ボタン / ショートカット |
| User | `ConfirmNoteDeletion` | Note | `NoteDeletionConfirmed` | 確認ダイアログで OK |
| User | `CancelNoteDeletion` | Note | `NoteDeletionCanceled` | 確認ダイアログでキャンセル |
| System | `DeleteNote` | Note | `NoteDeleted` | 確認後にファイルを物理削除 |
| User | `EnterSearchQuery` | Feed | `FeedSearchQueryEntered` | 検索ボックスへの入力 |
| System | `ApplyFeedSearch` | Feed | `FeedSearchApplied` | クエリに基づき絞り込み実行 |
| System | `ReportNoSearchResults` | Feed | `FeedSearchYieldedNoResults` | 0 件状態の通知 |
| User | `ClearFeedSearch` | Feed | `FeedSearchCleared` | 検索解除（× 押下 / Esc） |
| System | `HighlightSearchHits` | Feed | `FeedSearchHighlightApplied` | 表示中ノート内のヒット箇所をハイライト |
| User | `ConfigureVaultDirectory` | Vault | `VaultDirectoryConfigured` | 設定 |
| System | `DetectVaultUnconfigured` | Vault | `VaultDirectoryNotConfigured` | 起動時チェック |
| System | `ReportSaveFailure` | Note | `AutoSaveFailed` | 失敗ハンドリング |
| System | `ReportDeletionFailure` | Note | `NoteDeletionFailed` | 削除失敗ハンドリング |

## Aggregates 仮特定

| Aggregate | 役割 | 主属性（仮） |
|-----------|------|------------|
| **Note** | 単一のプロンプト下書き。`blocks: Block[]` + frontmatter | id（タイムスタンプ）、blocks（順序つき）、frontmatter、createdAt、updatedAt、isDraft |
| **Block**（Note 内 Sub-entity） | 編集単位。段落・見出し・箇条書き・コードブロック等 | id（BlockId）、type（BlockType）、content（BlockContent） |
| **Feed** | Note のコレクションと表示状態 | notes[], filterCriteria, searchQuery, sortOrder |
| **TagInventory** | vault 全体に存在するタグの一覧（フィルタ UI 用の索引） | tags[]: { name, usageCount }, lastUpdatedAt |
| **Vault** | 保存先ディレクトリ設定と走査状態 | path, isConfigured, lastScannedAt |

## Bounded Context 候補

イベント群を「同一の関心事」でグループ化した結果。

### 1. Capture Context
- **関心事**: 編集セッションのライフサイクル全般（新規ノート生成・ブロック編集・ブロック構造管理・自動保存・コピー・空ノート破棄、および過去ノートに対する編集セッション）
- **イベント**: 4, 5, 6a-6g, 7, 8a, 8, 9, 10, 11, 12, 13（編集セッション開始側面）, 14, 15, 16
- **中心 Aggregate**: Note（編集中のもの。Block[] を内包）

### 2. Curate Context
- **関心事**: 編集セッション**外**の集合操作・メタデータ操作（フィード表示・フィルタ・検索・選択・タグチップ操作・削除）
- **イベント**: 3, 3a, 13（選択側面）, 17, 18, 19, 20, 20a, 20b, 21, 22, 23, 24, 25, 26, 27, 28, 29, 29a
- **中心 Aggregate**: Feed、Note（フィード表示対象として）、TagInventory

### 3. Vault Context（Supporting）
- **関心事**: 永続化・ディレクトリ設定・スキャン
- **イベント**: 1, 2, 21, 22, 23
- **中心 Aggregate**: Vault、Note（ファイル表現）

## 発見された問題点（赤付箋）

- 🔴 **Capture と Curate が同一画面で同時に存在する** → Bounded Context として分けるべきか、それとも 1 つの Note Context の中の異なる「ユースケース」として扱うべきか、`contexts` フェーズで決定が必要。
- 🔴 **Note Aggregate は Capture / Curate / Vault の 3 文脈に登場する** → Shared Kernel か、それぞれの文脈で別表現を持つかの判断が要る。
- 🔴 **自動保存トリガが 2 系統（idle, blur）** → 同時発火の重複保存／競合を防ぐ仕組みが必要。
- 🔴 **Note の ID＝タイムスタンプ** → 同一秒に複数作成された場合の衝突リスク。
- 🔴 **空ノート判定の基準が未定** → 空白文字のみのノートは「空」と見なすか？
- 🔴 **`NewNoteRequested` 時に編集中ノートが空だった場合の振る舞い** → 破棄＋新規生成？それとも既存（空）にフォーカスし続ける？
- 🔴 **削除の確認 UX** → 確認ダイアログ／取り消し可能な「ゴミ箱」モデル／即削除＋Undo どれを採用するか。Obsidian と vault を共有するため、ゴミ箱を使うなら OS のゴミ箱に送るのが自然。
- 🔴 **検索とフィルタの関係** → 同じ Feed Aggregate への絞り込み操作だが、UI 上は別系統（フリーテキスト vs frontmatter フィールド）。同時適用時の AND/OR 関係の定義が必要。
- 🔴 **検索対象スコープ** → 本文のみ／本文+frontmatter／タグのみ／タイムスタンプ含む、どこまでを「検索」が見るか。MVP では「本文＋frontmatter 全フィールド」が無難だが要確認。
- 🔴 **TagInventory の Aggregate vs Read Model** → Feed フィルタ UI のためだけに存在するため、純粋な Aggregate ではなく Read Model（Note 群から導出される投影）として扱うほうが綺麗かもしれない。Phase 5 で判断。
- 🔴 **TagInventory の更新トリガ** → frontmatter 編集（追加/削除）・ノート削除・ノート新規作成（タグ付き）の 3 経路がある。整合性をどう保つか（イベント駆動 vs 都度再集計）。

## 未解決の問い（次フェーズに持ち越し）

- frontmatter の固定スキーマ内容（タグ・作成日時・更新日時・モデル名・ステータス…？）
- 自動保存のデバウンス時間（具体的な秒数）
- 空ノート判定基準（空白のみ・改行のみは空か）
- ノート ID 衝突回避（タイムスタンプにミリ秒・サフィックス・UUID のいずれか）
- フィルタとソートの組み合わせ（複数フィルタは AND/OR？）
- Capture と Curate を 1 Context に統合するか分けるか（→ Phase 3 で判断）
- 削除の確認方式（モーダル確認 / OS ゴミ箱送り / Undo 付き即削除）
- 削除のショートカットキー（Del / Cmd+Backspace 等）
- 検索対象スコープ（本文のみ / 本文+frontmatter / タグのみ）
- 検索方式（部分一致 / 大文字小文字区別 / 正規表現 / あいまい検索）
- 検索のインクリメンタル動作（debounce 秒数）
- 検索とフィルタの組み合わせ（AND / OR / 排他）
- 検索の起動 UX（ボタン or Cmd+F ショートカット）
- TagInventory は独立 Aggregate か Read Model か（Phase 5 で決定）
- TagInventory にタグ使用回数を含めるか（フィルタ UI 表示用）
- 未使用となったタグの扱い（最後の使用ノート削除時に Inventory から消すか保持するか）
