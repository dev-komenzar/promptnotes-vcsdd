# Ubiquitous Language（ユビキタス言語辞書）

これまでのフェーズで蓄積した用語を Bounded Context ごとに整理した「言語の正本」。コード（型名・関数名・モジュール名）はこの辞書に従う。日本語/英語の両方を併記し、英語は実装でそのままシンボル化する想定。

## 0. 共有概念（Shared Kernel：Capture / Curate / Vault 共通）

| 日本語 | 英語 | 定義 |
|--------|------|------|
| ノート | **Note** | プロンプト下書き 1 件。`id` + `blocks` + `frontmatter` の三つ組で構成される不変の集合体（Aggregate Root） |
| ノート ID | **NoteId** | ノートの不変識別子。形式 `YYYY-MM-DD-HHmmss-SSS[-N]`。同一ミリ秒衝突時のみ `-N` サフィックスが付く |
| ブロック | **Block** | Note 内の編集単位（段落・見出し・箇条書き・コードブロック等）。Note Aggregate 内の Sub-entity。`id` + `type` + `content` の三つ組 |
| ブロック ID | **BlockId** | Note 内ローカルな安定 ID（並べ替え・差分計算用）。形式は実装詳細（UUID v4 or `block-<n>`）。**ファイルには永続化されず、再読み込み時に再採番** |
| ブロック種別 | **BlockType** | `paragraph` / `heading-1` / `heading-2` / `heading-3` / `bullet` / `numbered` / `code` / `quote` / `divider`（MVP セット） |
| ブロック内容 | **BlockContent** | ブロック内のインラインテキスト。インライン Markdown（`**bold**`, `` `code` ``, `[link](url)`）を含む。`code` ブロックは複数行可、その他は単一行 |
| 本文 | **Body** | `blocks` 全体を Markdown 直列化した派生プロパティ（`note.body = serializeBlocksToMarkdown(blocks)`）。コピー対象・検索対象・Vault への保存単位 |
| メタデータ | **Frontmatter** | ノートの YAML 形式メタデータ。固定スキーマ（後述） |
| タグ | **Tag** | 分類ラベル。`Tag` Value Object として Smart Constructor で正規化（小文字化・先頭 `#` 除去・空文字拒否） |
| 時刻 | **Timestamp** | ISO 8601 形式の時刻。ミリ秒精度 |
| 結果型 | **Result&lt;Ok, Err&gt;** | 成功/失敗を表す代数的データ型。例外を使わずエラーを表現 |
| ブロック直列化 | **serializeBlocksToMarkdown** | 純粋関数 `Block[] → string`。Block 列を Markdown 文字列に直列化 |
| ブロック解析 | **parseMarkdownToBlocks** | 純粋関数 `string → Result<Block[], ParseError>`。Markdown を Block 列に解析（未知構造は paragraph で逃がす） |

### MVP 固定 Frontmatter スキーマ（discover フェーズで確定 → Phase 8 で詳細化）

```yaml
---
tags:        # Tag[]、空配列可、重複不可、正規化後に格納
  - draft
  - claude-code
createdAt: 2026-04-27T15:30:45.218Z   # 不変
updatedAt: 2026-04-27T16:12:03.001Z   # createdAt 以後
---
```

**MVP では追加フィールド（source / model / status）は持たない**。ユーザー定義テンプレートも MVP 範囲外。

---

## 1. Capture Context（Core Domain）

「**編集セッション**のライフサイクル全般」を司る。新規・過去問わず、エディタにフォーカスが入っている間の責務すべて。

| 日本語 | 英語 | 定義 |
|--------|------|------|
| 編集セッション | **Editing Session** | Note 内のいずれかのブロックに Block Focus が入った瞬間から、そのフォーカスが全ブロックから外れる／別ノートのブロックに切り替わるまでの 1 ノート分の編集ライフサイクル。新規・過去いずれの Note にも適用 |
| 編集セッション状態 | **EditingSessionState** | 編集セッションの内部状態。`{ currentNoteId, focusedBlockId, isDirty, lastInputAt, idleTimerHandle, status, pendingNextFocus, lastSaveResult, lastSaveError }` を含む Value Object |
| セッション状態 | **session status** | `idle` / `editing` / `saving` / `switching` / `save-failed` の状態機械（aggregates.md 参照） |
| 未保存マーク | **isDirty** | 直近の永続化以降に編集が加えられたことを示すフラグ |
| ブロックフォーカス | **Block Focus** | あるノートのある Block の `contenteditable` に DOM 上のキャレットがある状態。同時に複数ブロックがフォーカスを保持することはない（at most one） |
| エディタフォーカス | **Editor Focus**（旧称） | Block Focus への上位概念。**Capture Context では Block Focus と読み替える** |
| WYSIWYG レンダリング | **WYSIWYG Rendering** | Markdown シンタックス（見出し記号、リスト記号、コードフェンス等）を**入力時にその場で見た目に反映**する描画方式 |
| 組み込みエディタ | **Inline Editor Library** | 各ブロックに埋め込む組み込みエディタ（CodeMirror 6 / ProseMirror / Slate 等）。ブロックエディタ責務の薄いラッパとして使う |
| ブロック分割 | **Block Split** | テキスト中の Enter キーでブロックを 2 つに分ける操作（`note.splitBlock` で表現） |
| ブロック結合 | **Block Merge** | 行頭 Backspace で前ブロックと結合する操作（`note.mergeBlockWithPrevious` で表現） |
| ブロック種変換 | **Block Type Conversion** | `# ` 入力で見出しに、`/` メニュー等で種別を切り替える操作（`note.changeBlockType` で表現） |
| ブロック並べ替え | **Block Move / Reorder** | ドラッグ&ドロップ等でブロック順序を変更する操作（`note.moveBlock` で表現） |
| アイドル保存 | **Idle Save** | 入力停止が一定時間（debounce、MVP は ~2 秒）続いたときに発火する自動保存（Note 単位） |
| ブラー保存 | **Blur Save** | そのノートのいずれのブロックからもフォーカスが外れた契機の自動保存（Note 単位） |
| インライン Frontmatter 編集 | **Inline Frontmatter Editing** | エディタ内の YAML 領域を直接編集する操作 |
| 空ノート | **Empty Note** | 全ブロックが空（または `divider` のみ）の新規ノート。Vault に届く前に破棄対象 |
| 破棄 | **Discard** | 未保存編集を捨てる操作。新規ノートの空状態破棄、保存失敗からの破棄選択など |
| 新規ノートショートカット | **New Note Shortcut** | `Ctrl+N` または「+ 新規」ボタン |
| コピー | **Copy** | 編集中ノートの body のみをクリップボードへ（frontmatter は除外）。`note.bodyForClipboard()` で表現 |
| アイドルタイマー | **Idle Timer** | キー入力停止を検出するための setTimeout ハンドル |
| 再試行 | **Retry Save** | 保存失敗後に同じ内容で再度 `SaveNoteRequested` を発行する操作 |

### Capture が発する／受ける Domain Event

| Event | Public/Internal | 説明 |
|-------|-----------------|------|
| `NewNoteAutoCreated` | Internal | 起動時 or `Ctrl+N` で新規ノートが Note Aggregate として生成された（先頭ブロックは空 paragraph） |
| `BlockFocused` | Internal | 特定 Block にキャレットが入った（noteId, blockId 付き）。`EditorFocusedOnNewNote` / `EditorFocusedOnPastNote` を統合したイベント |
| `BlockBlurred` | Internal | 個別 Block からフォーカスが外れた（次に `BlockFocused` が来なければ最終的に `EditorBlurredAllBlocks` に進む） |
| `EditorBlurredAllBlocks` | Internal | 同一 Note の全ブロックからフォーカスが外れた（blur save トリガ） |
| `BlockContentEdited` | Internal | キー入力単位のブロック内容変更（一過性） |
| `BlockInserted` | Internal | 新規ブロック挿入（Enter キー、`/` メニュー等） |
| `BlockRemoved` | Internal | ブロック削除 |
| `BlocksMerged` | Internal | 前ブロックとの結合（行頭 Backspace） |
| `BlockSplit` | Internal | ブロック分割（テキスト中央 Enter） |
| `BlockTypeChanged` | Internal | ブロック種別変換（`# ` → heading-1 等） |
| `BlockMoved` | Internal | ブロック並べ替え |
| `NoteFrontmatterEditedInline` | Internal | エディタ内の YAML 領域が変更された |
| `NewNoteRequested` | Internal | 新規作成要求が出された |
| `EmptyNoteDiscarded` | Cross-Context | 空のまま遷移した新規ノートが破棄された（Vault には届かない） |
| `NoteAutoSavedAfterIdle` | Internal | idle save 発火（`SaveNoteRequested` のトリガ） |
| `NoteAutoSavedOnBlur` | Internal | blur save 発火 |
| `NoteBodyCopiedToClipboard` | Internal | コピー実行 |
| `EditingSessionDiscarded` | Internal | 保存失敗後の破棄選択 |
| `RetrySaveRequested` | Internal | 再試行選択 |
| `SaveNoteRequested` | **Public** | Vault への保存依頼（Domain Event Carrying Command） |

> ブロックレベルのイベント（`BlockContentEdited` 等）は **すべて Internal**：Capture アプリケーション層が EditingSessionState の更新と idle timer 管理に使うのみで、Cross-Context へは出さない。Cross-Context へ向かうのは `SaveNoteRequested` で、payload は **Note 全体の最新スナップショット**（blocks 含む）であり、個別ブロックの差分は載せない。

---

## 2. Curate Context（Core Domain）

「**編集セッション外**の集合操作・メタデータ操作」を司る。フィード表示・選択・フィルタ・検索・タグチップ操作・削除。

| 日本語 | 英語 | 定義 |
|--------|------|------|
| フィード | **Feed** | 時系列に並ぶノート一覧。フィルタ・検索・ソートの対象集合（Aggregate） |
| 過去ノート | **Past Note** | 既に Vault に保存済みのノート（Feed 上の表示対象） |
| ノート選択 | **Note Selection** | フィード上のノートをクリック等で編集対象に切り替える操作。次の Editing Session の起点 |
| タグインベントリ | **TagInventory** | vault 全体に存在するタグの集計索引（フィルタ UI 用 Read Model） |
| タグエントリ | **TagEntry** | TagInventory 内の 1 要素 `{ name: Tag, usageCount: number }` |
| タグチップ | **Tag Chip** | フィード上の各ノートに表示されるタグの UI コンポーネント |
| タグチップ操作 | **Tag Chip Operation** | チップへの直接操作（`+` で追加、`×` で削除）。エディタを開かずに行う軽量メタデータ更新 |
| フィルタ | **Filter** | frontmatter フィールド値による絞り込み（タグ等） |
| フィルタ条件 | **FilterCriteria** | `{ tags: Tag[], frontmatterFields: Map<string, string> }` の Value Object |
| 検索 | **Search** | フリーテキストによる絞り込み（本文 + frontmatter） |
| 検索クエリ | **SearchQuery** | `{ text: string, scope: 'body+frontmatter' }` の Value Object |
| 検索ヒットなし | **No Search Results** | `FeedSearchYieldedNoResults` イベントが示す UX 上の特別状態 |
| ハイライト | **Highlight** | 検索ヒット箇所の視覚強調。**UI 層責務であり Feed Aggregate には含めない** |
| ソート | **Sort** | タイムスタンプ昇順／降順。既定は降順（最新が上） |
| ソート順 | **SortOrder** | `{ field: 'timestamp', direction: 'desc' \| 'asc' }` の Value Object |
| 削除 | **Trash / Delete** | ノートを vault から除去する操作。**MVP 確定：OS のゴミ箱送り** |
| 削除確認 | **Deletion Confirmation** | 削除前のモーダル確認 UX |
| 可視ノート計算 | **computeVisible** | フィルタ＋検索＋ソートを適用して可視 NoteId 列を返す Pure Function（`Feed.computeVisible(snapshots)`） |
| ノート参照 | **NoteRef** | Feed 内で Note Aggregate を ID のみで参照するためのキー（`NoteId`） |

### Curate が発する Domain Event

| Event | Public/Internal | 説明 |
|-------|-----------------|------|
| `FeedRestored` | Internal | 起動時に Feed が構築された |
| `TagInventoryBuilt` | Internal | 起動時に TagInventory が構築された |
| `TagInventoryUpdated` | Internal | Note 編集／削除でタグ集計が更新された |
| `PastNoteFocused` | Internal | 選択操作の側面（次に `PastNoteSelected` を発行） |
| `FeedFilterByTagApplied` / `FeedFilterByFrontmatterApplied` / `FeedFilterCleared` | Internal | フィルタ操作 |
| `FeedSortedByTimestamp` | Internal | ソート操作 |
| `FeedSearchQueryEntered` / `FeedSearchApplied` / `FeedSearchYieldedNoResults` / `FeedSearchCleared` / `FeedSearchHighlightApplied` | Internal | 検索操作 |
| `TagChipAddedOnFeed` / `TagChipRemovedOnFeed` | Internal（→ `SaveNoteRequested` に派生） | タグチップ操作 |
| `NoteDeletionRequested` / `NoteDeletionConfirmed` / `NoteDeletionCanceled` | Internal | 削除モーダルフロー |
| `PastNoteSelected` | **Public** | Capture へ編集セッション開始を要求 |
| `DeleteNoteRequested` | **Public** | Vault へ削除依頼（Carrying Command） |

---

## 3. Vault Context（Supporting Subdomain）

Markdown ファイルの永続化と Obsidian 互換性を担保する。

| 日本語 | 英語 | 定義 |
|--------|------|------|
| Vault | **Vault** | Markdown ファイル群を格納するディレクトリ全体（Aggregate） |
| Vault パス | **VaultPath** | Vault のファイルシステムパス（Value Object） |
| Vault 状態 | **VaultStatus** | `'unconfigured' \| 'ready' \| 'scanning'` |
| Markdown ファイル | **Markdown File** | ノートの物理表現（`.md` 拡張子）。冒頭に YAML frontmatter。**ブロック構造は持たない平坦な Markdown 文字列として保存される**（Obsidian 互換） |
| YAML Frontmatter | **YAML Frontmatter** | `---` で囲まれたファイル冒頭の YAML ブロック |
| タイムスタンプファイル名 | **Timestamp Filename** | `YYYY-MM-DD-HHmmss-SSS[-N].md` 形式のファイル名。Obsidian でもソート可能 |
| Vault スキャン | **Vault Scan** | Vault 内 Markdown を走査して NoteFileSnapshot 一覧を返す操作 |
| ノートファイルスナップショット | **NoteFileSnapshot** | `{ noteId, body, frontmatter, filePath, fileMtime }`。Vault が返す読み取り表現（DTO）。`body` はファイル上の生 Markdown 文字列（ブロック化前） |
| ハイドレーション | **Hydration** | NoteFileSnapshot を Note Aggregate に変換する ACL 処理。**Markdown → Block[] 変換を含む** |
| ハイドレーション失敗 | **Hydration Failure** | YAML 不正・必須欠落・VO 拒否・ブロック化不能な構造などで snapshot から Note Aggregate に変換できなかった状態（**read 失敗は含まない**） |
| ハイドレーション失敗理由 | **HydrationFailureReason** | `'yaml-parse' \| 'missing-field' \| 'invalid-value' \| 'block-parse' \| 'unknown'` |
| Markdown↔Block 変換 | **Markdown ↔ Block Conversion** | `parseMarkdownToBlocks` / `serializeBlocksToMarkdown` の純粋関数ペア（Shared Kernel）。Vault の Hydration / 保存時に使用 |
| ラウンドトリップ性質 | **Round-trip Stability** | `parse(serialize(b)) ≈ b` および `serialize(parse(m)) ≈ m`（意味上の同値、外見上の差異は許容）。完全な byte 一致は保証しない |
| 壊れファイル | **CorruptedFile** | `VaultScanned.corruptedFiles[]` の要素。`{ filePath, failure: ScanFileFailure, detail? }` |
| スキャンファイル失敗 | **ScanFileFailure** | scanVault でのファイル単位失敗の判別ユニオン。`{kind:'read', fsError}` または `{kind:'hydrate', reason: HydrationFailureReason}`。read 失敗（OS）と hydrate 失敗（フォーマット）を型で区別 |
| 読み取り時正規化 | **Read-time Normalization** | タグ等の正規化は ACL 変換時のみ行い、ファイル自体は書き換えない方針 |
| OS ゴミ箱 | **OS Trash** | 削除時の送り先（Electron なら `shell.trashItem()` 等）。MVP 確定 |
| 並行スキャン抑制 | **Concurrent Scan Lock** | `status='scanning'` の間は新たな scan を受け付けない不変条件 |
| ID 割り当て | **allocateNoteId** | Vault Aggregate の effectful method。`vault.allocateNoteId(now: Timestamp): NoteId`。内部 NoteId 集合を読み、pure helper に委譲 |
| 次利用可能 NoteId | **nextAvailableNoteId** | Pure helper `nextAvailableNoteId(preferred: Timestamp, existingIds: ReadonlySet<NoteId>): NoteId`。衝突時 `-N` サフィックス。副作用なし、property test 対象 |
| ファイルシステム競合 | **Filesystem Conflict** | Obsidian 等の外部ツールによる同時編集の可能性（MVP は rescan-only で対処） |
| 腐敗防止層 | **ACL (Anticorruption Layer)** | Vault と Capture/Curate のドメインモデルを分離する変換層 |

### Vault が発する Domain Event

| Event | Public/Internal | 説明 |
|-------|-----------------|------|
| `VaultDirectoryConfigured` | **Public** | path 設定完了 |
| `VaultDirectoryNotConfigured` | **Public** | 起動時に path 未設定検出 |
| `VaultScanned` | **Public** | スキャン結果 + corruptedFiles を返す |
| `NoteFileSaved` | **Public** | 保存完了通知 |
| `NoteSaveFailed` | **Public** | 保存失敗 |
| `NoteFileDeleted` | **Public** | 削除完了通知 |
| `NoteDeletionFailed` | **Public** | 削除失敗 |
| `NoteHydrationFailed` | **Public** | 個別ファイルの変換失敗（運用中） |

---

## 4. コンテキスト横断の用語注意点

同じ用語が文脈で焦点を変える。意味の食い違いではなく「同じ実体の異なる側面」。

| 用語 | Capture での焦点 | Curate での焦点 | Vault での焦点 |
|------|----------------|----------------|---------------|
| **Note** | 編集セッション中のノート（`Block[]` の集合体） | フィード表示・選択・削除対象 | Markdown ファイル（物理、平坦） |
| **Block** | 編集単位（contenteditable 要素として描画） | 表示単位（フォーカス未取得時） | （登場しない、Markdown 文字列の構造化派生） |
| **Body** | 入力中ノートの `serializeBlocksToMarkdown(blocks)` 派生・コピー対象 | 検索対象テキスト | YAML frontmatter を除く本文（Markdown） |
| **Frontmatter** | エディタ内 YAML（直接編集可） | タグチップ・フィルタ条件 | YAML ヘッダ |
| **Save** | Idle/Blur 自動保存（編集セッション内） | タグチップ操作後の即時保存依頼 | ファイル書き込み（Block[] → Markdown 直列化を含む） |
| **Delete** | （登場しない） | 削除モーダル経由 | OS ゴミ箱送り |
| **Tag** | エディタ内 YAML としてのみ | タグチップ・フィルタ条件・TagInventory | frontmatter 内 YAML 配列 |
| **Edit** | 編集セッション内の入力行為（ブロック単位） | （登場しない／"Tag Chip Operation" が近似） | （登場しない） |
| **Focus** | Block Focus（at most one block per Note） | （ノートカードのホバー等は UI 表現） | （登場しない） |
| **Session** | Editing Session（Note 単位） | （登場しない） | Vault Scan の処理状態 |

**Capture と Curate を分ける本質**：「**いずれかのブロックにキャレットが入っている間**」が境界。Block Focus 取得中 = Capture、未取得 = Curate。

---

## 5. 命名規約まとめ

実装時にこの辞書から型・関数を導く際の規約：

| 種別 | 命名 | 例 |
|------|------|-----|
| Aggregate / Entity | PascalCase | `Note`, `Block`, `Feed`, `Vault` |
| Value Object | PascalCase | `NoteId`, `BlockId`, `BlockContent`, `Body`, `Tag`, `FilterCriteria` |
| Enum / Tagged Union | PascalCase / kebab-case 値 | `BlockType` = `'paragraph' \| 'heading-1' \| ...` |
| Read Model | PascalCase | `TagInventory`, `TagEntry` |
| Domain Event | PascalCase 過去分詞 | `NoteFileSaved`, `VaultScanned`, `EmptyNoteDiscarded`, `BlockSplit`, `BlockTypeChanged` |
| Command（メソッド） | camelCase 命令形 | `editBlockContent`, `splitBlock`, `applyTagFilter`, `allocateNoteId` |
| Pure Function | camelCase | `computeVisible`, `bodyForClipboard`, `serializeBlocksToMarkdown`, `parseMarkdownToBlocks` |
| 状態（enum） | kebab-case 文字列リテラル | `'editing'`, `'saving'`, `'save-failed'` |

**例外の少なさを保つルール**：例外は「真にプログラマがハンドルできない」場合のみ。ドメインの失敗は `Result<Ok, Err>` で返す（DMMF 原則）。

---

## 6. 用語のスコープ最終チェック

「この用語は本当にこの Context のものか？」のチェック結果：

| 用語 | 検討 | 結論 |
|------|------|------|
| `Note` | 3 Context にまたがる | **Shared Kernel**（既決） |
| `Block` / `BlockId` / `BlockType` / `BlockContent` | Note の構成要素として 3 Context に共有される | **Shared Kernel**（Note と一蓮托生） |
| `Tag` | Curate / Vault に登場、Capture では YAML 内のみ | **Shared Kernel**（VO の Smart Constructor は共通） |
| `serializeBlocksToMarkdown` / `parseMarkdownToBlocks` | Vault Hydration / Save、Capture コピー、Curate 検索で使用 | **Shared Kernel**（純粋関数） |
| `EditingSessionState` | Capture 専用 | Capture |
| `Block Focus` / `WYSIWYG Rendering` / `Inline Editor Library` | UI 駆動だが概念的に Capture 内 | Capture |
| `TagInventory` | Curate 専用 | Curate（Read Model） |
| `Feed` | Curate 専用 | Curate |
| `Vault` | Vault 専用 | Vault |
| `NoteFileSnapshot` | Vault → Curate に流れる DTO | Vault が定義、Curate ACL が変換 |
| `SaveNoteRequested` | Capture / Curate どちらも発行 | Public Domain Event（共通の payload 型、Note 全体スナップショット） |
| `PastNoteSelected` | Curate → Capture | Public Domain Event |
| `Result<Ok, Err>` | 全 Context | Shared Kernel（DMMF 風） |

---

## 7. コードとの整合性チェックリスト（実装フェーズで使用）

実装後、以下を逐一確認：

- [ ] 型名はこの辞書の英語表記と一致
- [ ] Domain Event 名はこの辞書の英語表記と一致
- [ ] Command メソッド名は辞書の英語表記と一致
- [ ] 1 つの概念に複数の名前（`Note` と `Memo`、`Save` と `Persist`）が混在していない
- [ ] 辞書にない用語がコード上に出現していない（出現時は辞書に追加 or リネーム）
- [ ] エラーメッセージ・ログ文言に辞書外の用語が混入していない
- [ ] UI 表示文言（日本語）が辞書の日本語と整合（用語ブレ防止）
