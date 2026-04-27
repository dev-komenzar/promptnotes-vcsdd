# Ubiquitous Language（ユビキタス言語辞書）

これまでのフェーズで蓄積した用語を Bounded Context ごとに整理した「言語の正本」。コード（型名・関数名・モジュール名）はこの辞書に従う。日本語/英語の両方を併記し、英語は実装でそのままシンボル化する想定。

## 0. 共有概念（Shared Kernel：Capture / Curate / Vault 共通）

| 日本語 | 英語 | 定義 |
|--------|------|------|
| ノート | **Note** | プロンプト下書き 1 件。`id` + `body` + `frontmatter` の三つ組で構成される不変の集合体（Aggregate Root） |
| ノート ID | **NoteId** | ノートの不変識別子。形式 `YYYY-MM-DD-HHmmss-SSS[-N]`。同一ミリ秒衝突時のみ `-N` サフィックスが付く |
| 本文 | **Body** | frontmatter を除いた Markdown 文字列。コピー対象・検索対象・編集対象 |
| メタデータ | **Frontmatter** | ノートの YAML 形式メタデータ。固定スキーマ（後述） |
| タグ | **Tag** | 分類ラベル。`Tag` Value Object として Smart Constructor で正規化（小文字化・先頭 `#` 除去・空文字拒否） |
| 時刻 | **Timestamp** | ISO 8601 形式の時刻。ミリ秒精度 |
| 結果型 | **Result&lt;Ok, Err&gt;** | 成功/失敗を表す代数的データ型。例外を使わずエラーを表現 |

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
| 編集セッション | **Editing Session** | エディタにフォーカスが入った瞬間から、フォーカスが外れる／別ノートに切り替わるまでの 1 ノートの編集ライフサイクル。新規・過去いずれの Note にも適用 |
| 編集セッション状態 | **EditingSessionState** | 編集セッションの内部状態。`{ currentNoteId, isDirty, lastInputAt, idleTimerHandle, status, pendingNextNoteId, lastSaveResult, lastSaveError }` を含む Value Object |
| セッション状態 | **session status** | `idle` / `editing` / `saving` / `switching` / `save-failed` の状態機械（aggregates.md 参照） |
| 未保存マーク | **isDirty** | 直近の永続化以降に編集が加えられたことを示すフラグ |
| エディタフォーカス | **Editor Focus** | カーソルが本文編集領域にある状態 |
| アイドル保存 | **Idle Save** | 入力停止が一定時間（debounce、MVP は ~2 秒）続いたときに発火する自動保存 |
| ブラー保存 | **Blur Save** | フォーカスアウト時に発火する自動保存 |
| インライン Frontmatter 編集 | **Inline Frontmatter Editing** | エディタ内の YAML 領域を直接編集する操作 |
| 空ノート | **Empty Note** | 一度も意味のある入力がされていない新規ノート（trim 後の body が空文字）。Vault に届く前に破棄対象 |
| 破棄 | **Discard** | 未保存編集を捨てる操作。新規ノートの空状態破棄、保存失敗からの破棄選択など |
| 新規ノートショートカット | **New Note Shortcut** | `Ctrl+N` または「+ 新規」ボタン |
| コピー | **Copy** | 編集中ノートの body のみをクリップボードへ（frontmatter は除外）。`note.bodyForClipboard()` で表現 |
| アイドルタイマー | **Idle Timer** | キー入力停止を検出するための setTimeout ハンドル |
| 再試行 | **Retry Save** | 保存失敗後に同じ内容で再度 `SaveNoteRequested` を発行する操作 |

### Capture が発する／受ける Domain Event

| Event | Public/Internal | 説明 |
|-------|-----------------|------|
| `NewNoteAutoCreated` | Internal | 起動時 or `Ctrl+N` で新規ノートが Note Aggregate として生成された |
| `EditorFocusedOnNewNote` | Internal | カーソルが新規ノート本文に置かれた |
| `EditorFocusedOnPastNote` | Internal | `PastNoteSelected` 受信後の状態遷移 |
| `NoteBodyEdited` | Internal | キー入力単位の本文変更（一過性） |
| `NoteFrontmatterEditedInline` | Internal | エディタ内の YAML 領域が変更された |
| `EditorBlurred` | Internal | フォーカスが外れた |
| `NewNoteRequested` | Internal | 新規作成要求が出された |
| `EmptyNoteDiscarded` | Cross-Context | 空のまま遷移した新規ノートが破棄された（Vault には届かない） |
| `NoteAutoSavedAfterIdle` | Internal | idle save 発火（`SaveNoteRequested` のトリガ） |
| `NoteAutoSavedOnBlur` | Internal | blur save 発火 |
| `NoteBodyCopiedToClipboard` | Internal | コピー実行 |
| `EditingSessionDiscarded` | Internal | 保存失敗後の破棄選択 |
| `RetrySaveRequested` | Internal | 再試行選択 |
| `SaveNoteRequested` | **Public** | Vault への保存依頼（Domain Event Carrying Command） |

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
| Markdown ファイル | **Markdown File** | ノートの物理表現（`.md` 拡張子）。冒頭に YAML frontmatter |
| YAML Frontmatter | **YAML Frontmatter** | `---` で囲まれたファイル冒頭の YAML ブロック |
| タイムスタンプファイル名 | **Timestamp Filename** | `YYYY-MM-DD-HHmmss-SSS[-N].md` 形式のファイル名。Obsidian でもソート可能 |
| Vault スキャン | **Vault Scan** | Vault 内 Markdown を走査して NoteFileSnapshot 一覧を返す操作 |
| ノートファイルスナップショット | **NoteFileSnapshot** | `{ noteId, body, frontmatter, filePath, fileMtime }`。Vault が返す読み取り表現（DTO） |
| ハイドレーション | **Hydration** | NoteFileSnapshot を Note Aggregate に変換する ACL 処理 |
| ハイドレーション失敗 | **Hydration Failure** | YAML 不正・必須欠落・VO 拒否などで変換できなかった状態 |
| ハイドレーション失敗理由 | **HydrationFailureReason** | `'yaml-parse' \| 'missing-field' \| 'invalid-value' \| 'unknown'` |
| 読み取り時正規化 | **Read-time Normalization** | タグ等の正規化は ACL 変換時のみ行い、ファイル自体は書き換えない方針 |
| OS ゴミ箱 | **OS Trash** | 削除時の送り先（Electron なら `shell.trashItem()` 等）。MVP 確定 |
| 並行スキャン抑制 | **Concurrent Scan Lock** | `status='scanning'` の間は新たな scan を受け付けない不変条件 |
| ID 割り当て | **allocateNoteId** | 既存ファイル名と衝突しない NoteId を返す Vault の責務 |
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
| **Note** | 編集セッション中のノート | フィード表示・選択・削除対象 | Markdown ファイル（物理） |
| **Body** | 入力中の文字列・コピー対象 | 検索対象テキスト | YAML frontmatter を除く本文 |
| **Frontmatter** | エディタ内 YAML（直接編集可） | タグチップ・フィルタ条件 | YAML ヘッダ |
| **Save** | Idle/Blur 自動保存（編集セッション内） | タグチップ操作後の即時保存依頼 | ファイル書き込み |
| **Delete** | （登場しない） | 削除モーダル経由 | OS ゴミ箱送り |
| **Tag** | エディタ内 YAML としてのみ | タグチップ・フィルタ条件・TagInventory | frontmatter 内 YAML 配列 |
| **Edit** | 編集セッション内の入力行為 | （登場しない／"Tag Chip Operation" が近似） | （登場しない） |
| **Session** | Editing Session | （登場しない） | Vault Scan の処理状態 |

**Capture と Curate を分ける本質**：「**エディタにフォーカスが入っている間**」が境界。フォーカス内 = Capture、フォーカス外 = Curate。

---

## 5. 命名規約まとめ

実装時にこの辞書から型・関数を導く際の規約：

| 種別 | 命名 | 例 |
|------|------|-----|
| Aggregate / Entity | PascalCase | `Note`, `Feed`, `Vault` |
| Value Object | PascalCase | `NoteId`, `Body`, `Tag`, `FilterCriteria` |
| Read Model | PascalCase | `TagInventory`, `TagEntry` |
| Domain Event | PascalCase 過去分詞 | `NoteFileSaved`, `VaultScanned`, `EmptyNoteDiscarded` |
| Command（メソッド） | camelCase 命令形 | `editBody`, `applyTagFilter`, `allocateNoteId` |
| Pure Function | camelCase | `computeVisible`, `bodyForClipboard` |
| 状態（enum） | kebab-case 文字列リテラル | `'editing'`, `'saving'`, `'save-failed'` |

**例外の少なさを保つルール**：例外は「真にプログラマがハンドルできない」場合のみ。ドメインの失敗は `Result<Ok, Err>` で返す（DMMF 原則）。

---

## 6. 用語のスコープ最終チェック

「この用語は本当にこの Context のものか？」のチェック結果：

| 用語 | 検討 | 結論 |
|------|------|------|
| `Note` | 3 Context にまたがる | **Shared Kernel**（既決） |
| `Tag` | Curate / Vault に登場、Capture では YAML 内のみ | **Shared Kernel**（VO の Smart Constructor は共通） |
| `EditingSessionState` | Capture 専用 | Capture |
| `TagInventory` | Curate 専用 | Curate（Read Model） |
| `Feed` | Curate 専用 | Curate |
| `Vault` | Vault 専用 | Vault |
| `NoteFileSnapshot` | Vault → Curate に流れる DTO | Vault が定義、Curate ACL が変換 |
| `SaveNoteRequested` | Capture / Curate どちらも発行 | Public Domain Event（共通の payload 型） |
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
