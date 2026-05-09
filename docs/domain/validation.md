# Validation — ユースケース・シナリオ検証

ドメインモデルが実際のユーザー操作と整合しているかを複数のシナリオで検証。各シナリオは Given/When/Then と「モデルマッピング表」で構成。発見した問題は末尾「フィードバックサマリ」に集約。

> **ブロックベース UI 化の影響**：discovery.md / aggregates.md でブロック WYSIWYG エディタを採用したため、各シナリオの「本文入力」は **ブロック単位の編集（`EditBlockContent`、`InsertBlockAfter` 等）の累積** として読み替える。`EnterBodyText` は旧表現で、ブロック編集の連続入力に相当する。Note 単位の保存パイプライン（idle/blur save）と Feed への反映は変わらない。

---

## シナリオ一覧

| # | 名前 | アクター | BC | 優先度 |
|---|------|---------|----|------|
| 1 | 初回起動：vault 未設定 | User | Vault, Capture, Curate | 高 |
| 2 | 通常起動：フィード復元と新規ノート自動生成 | User | Vault, Capture, Curate | 高 |
| 3 | プロンプト下書きを書いてコピー | User | Capture | 高（コア） |
| 4 | 過去ノートを開いて本文を編集 | User | Curate, Capture | 高（コア） |
| 5 | タグでフィルタして探す | User | Curate | 高（コア） |
| 6 | 検索で探してハイライト確認 | User | Curate | 高（コア） |
| 7 | フィード上のタグチップでタグ追加 | User | Curate | 中 |
| 8 | 不要なノートを削除 | User | Curate, Vault | 中 |
| 9 | 編集中ノートを残して別の過去ノート選択（境界ケース） | User | Capture, Curate | 高（要確認） |
| 10 | ブロック分割・種類変換で見出し付きメモを書く（WYSIWYG コア） | User | Capture | 高（要確認） |

---

## シナリオ 1: 初回起動：vault 未設定

**アクター**: User（初めてアプリを起動）
**優先度**: 高（オンボーディング）

### 自然言語

ユーザーがアプリを初めて起動する。vault の保存先が未設定のため、設定誘導 UI が表示される。User がフォルダを選び、設定を完了すると、空のフィードと新規ノートが現れる。

### Given/When/Then

```
Given vault path が未設定の状態
When User がアプリを起動する
Then VaultDirectoryNotConfigured イベントが発行される
And 設定誘導 UI（フォルダ選択ダイアログ）が表示される
And フィードと編集領域は使用不可状態

When User がフォルダを選択する
Then VaultDirectoryConfigured(vaultId, path) イベントが発行される
And ScanVault が実行され VaultScanned(snapshots=[]) が返る
And 空のフィードが表示される
And NewNoteAutoCreated と EditorFocusedOnNewNote が続く
And カーソルが新規ノートの本文位置にある
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| 起動 | `LaunchApp` | Application | `AppLaunched`（internal） | — |
| 設定検出 | `DetectVaultUnconfigured` | Vault | `VaultDirectoryNotConfigured` | — |
| フォルダ選択 | `ConfigureVaultDirectory(path)` | Vault | `VaultDirectoryConfigured` | — |
| スキャン | `ScanVault` | Vault | `VaultScanned(snapshots=[])` | — |
| フィード初期化 | `RestoreFeed`, `BuildTagInventory` | Feed, TagInventory | `FeedRestored`, `TagInventoryBuilt` | — |
| 新規ノート | `AutoCreateNewNote(now)` | Note | `NewNoteAutoCreated` | — |
| フォーカス | `FocusEditor` | Note | `EditorFocusedOnNewNote` | — |

✅ モデルで完全に表現可能。

---

## シナリオ 2: 通常起動：フィード復元と新規ノート自動生成

**アクター**: User（vault 設定済み、過去ノート 47 件あり）
**優先度**: 高

### Given/When/Then

```
Given vault path が設定済み
And vault に Markdown ファイルが 47 件存在する
And タグ "#draft" が 5 件のノートで使用されている

When User がアプリを起動する
Then VaultScanned(snapshots=[47 件]) が発行される
And FeedRestored で 47 件が時系列降順に並ぶ
And TagInventoryBuilt で entries=[{name:"draft", usageCount:5}, ...] が構築される
And 最上部に NewNoteAutoCreated でタイムスタンプ命名の空ノートが追加される
And EditorFocusedOnNewNote でカーソルがその空ノートの本文に置かれる
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| 起動 | `LaunchApp` | — | `AppLaunched` | — |
| スキャン | `ScanVault` | Vault | `VaultScanned(snapshots[47])` | — |
| Feed 構築 | `RestoreFeed(snapshots)` | Feed | `FeedRestored` | — |
| Tag 構築 | `BuildTagInventory(snapshots)` | TagInventory | `TagInventoryBuilt` | — |
| 新規 | `AutoCreateNewNote` | Note | `NewNoteAutoCreated` | — |
| フォーカス | `FocusEditor` | Note (Capture session) | `EditorFocusedOnNewNote` | — |

✅ OK。

---

## シナリオ 3: プロンプト下書きを書いてコピー（コア体験）

**アクター**: User
**優先度**: 高（最も頻繁・最も価値が高い操作）

### 自然言語

User が思いついたプロンプトを書き出して、ワンクリックでクリップボードにコピーし、AI ツール（Claude Code 等）に貼り付ける。

### Given/When/Then

```
Given アプリが起動済みで、最上部の新規ノートにフォーカスがある
And 本文は空

When User がキー入力する（"Refactor the auth middleware to..."）
Then 各キー入力で NoteBodyEdited（internal）が発生する
And 編集状態は isDirty=true

When 入力が 2 秒停止する
Then NoteAutoSavedAfterIdle がトリガされる
And SaveNoteRequested(noteId, body, frontmatter, source='capture-idle') が発行される
And Vault が writeFile を実行
And NoteFileSaved(noteId, body, frontmatter, previousFrontmatter=null) が発行される
And isDirty=false に戻る
And Curate の Feed.noteRefs に新規 noteId が追加される

When User がコピーボタンをクリックする
Then NoteBodyCopiedToClipboard が発行される
And クリップボードに body のみがコピーされる（frontmatter は除外）
And UI に「コピー済み」インジケータが短時間表示される
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| 入力 | `EnterBodyText` | Note | `NoteBodyEdited`（internal） | — |
| idle 検出 | `AutoSaveOnIdle` | Note (Capture) | `NoteAutoSavedAfterIdle`（internal） + `SaveNoteRequested` | — |
| 永続化 | `SaveNote` | Vault | `NoteFileSaved` | — |
| Feed 反映 | （Curate 内）`Feed.addNoteRef` | Feed | — | ✅ 結果整合 |
| TagInv 反映 | `TagInventory.applyNoteCreated` | TagInventory | `TagInventoryUpdated` | tags が空配列の場合は更新不要 |
| コピー | `CopyNoteBody` | Note (Capture) | `NoteBodyCopiedToClipboard` | — |

✅ 表現可能。

**発見**: コピー時に `note.body` のみを返す getter が必要。Note Aggregate は body をそのまま返せるので問題なし。ただし「**frontmatter を確実に除外する**」不変条件は Note Aggregate に明示するべき → aggregates.md の Note 操作に `note.bodyForClipboard()` のような明示メソッドを置くと安全。

---

## シナリオ 4: 過去ノートを開いて本文を編集（コア体験、境界をまたぐ）

**アクター**: User
**優先度**: 高

### 自然言語

User が 3 日前に書いた下書きを開き、内容を推敲する。idle save で自動保存される。

### Given/When/Then

```
Given Feed に過去ノート 47 件が表示されている
And ユーザーは現在新規ノートを編集中（本文 "WIP"、isDirty=true）

When User が 3 日前のノート（noteId=N123）をクリックする
Then 現在の編集セッションが先に強制 blur save される（境界ケース：シナリオ 9 で詳述）
And PastNoteSelected(noteId=N123, snapshot) が発行される
And Capture が EditorFocusedOnPastNote(N123) に遷移
And エディタに過去ノートの body と frontmatter が表示される

When User が本文末尾に追記する
Then NoteBodyEdited（internal）が発生
And isDirty=true

When idle 2 秒経過
Then SaveNoteRequested(noteId=N123, source='capture-idle') が発行
And NoteFileSaved が返る
And Curate 側で Feed が updatedAt 更新を検知し、N123 を最上部に再配置
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| 過去ノート選択 | `SelectPastNote(N123)` | Feed → Note | `PastNoteSelected` | — |
| セッション切替 | （Capture）`StartEditingSession(snapshot)` | Note (Capture) | `EditorFocusedOnPastNote` | ⚠️ Phase 6 で `EditorFocusedOnPastNote` は internal として記述済み。OK |
| 入力 | `EnterBodyText` | Note | `NoteBodyEdited` | — |
| idle save | `AutoSaveOnIdle` | Note | `SaveNoteRequested` | — |
| 永続化 | `SaveNote` | Vault | `NoteFileSaved` (previousFM=旧 frontmatter) | ✅ Capture が旧 frontmatter を payload に含める |
| Feed 再配置 | `Feed.refreshSort` | Feed | — | 結果整合 |

✅ 表現可能。

**発見**:
- `EditorFocusedOnPastNote` は Phase 6 で記述済みだが、Phase 2 の event-storming.md に明示なし → 追記推奨（minor）。**ブロックベース UI 化以降は `BlockFocused(noteId, blockId)` に統合され、event-storming.md / glossary.md / domain-events.md に反映済み**
- Feed の updatedAt 順再配置：Feed Aggregate に `refreshSort()` 操作の明示が必要 → aggregates.md に追記推奨

---

## シナリオ 5: タグでフィルタして探す

**アクター**: User
**優先度**: 高

### Given/When/Then

```
Given Feed に過去ノート 47 件が表示されている
And TagInventory に "draft"(5), "review"(3), "claude-code"(12) が存在

When User がフィルタ UI で "claude-code" タグを選択する
Then FeedFilterByTagApplied(tag="claude-code") が発行
And Feed.filterCriteria.tags = ["claude-code"]
And Feed.computeVisible() が呼ばれ、12 件のみ表示

When User が追加で "review" タグも選択する
Then 同タグ間 OR、異種条件間 AND の規約により
  → "claude-code" タグを持つ AND ("review" もしくは他の選択タグ) を持つノート
  → ただし複数タグを選んだ場合 OR（直感に合う）
And 12 + 3 - 重複 = N 件表示

When User がフィルタを解除する
Then FeedFilterCleared が発行
And 47 件すべて表示
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| タグ選択 | `ApplyFeedFilterByTag(tag)` | Feed | `FeedFilterByTagApplied` | — |
| 可視計算 | `Feed.computeVisible(snapshots)` | Feed | — | Pure function |
| 解除 | `ClearFeedFilter` | Feed | `FeedFilterCleared` | — |

✅ 表現可能。

**発見**: 「同タグ間 OR、異種条件間 AND」のルール、aggregates.md の Feed 不変条件に記述済み。ただしユーザーがタグを 2 つ選んだとき、どちらの解釈が直感的かは UX テストで要検証。MVP では OR が妥当。

---

## シナリオ 6: 検索で探してハイライト確認

**アクター**: User
**優先度**: 高

### Given/When/Then

```
Given Feed に過去ノート 47 件が表示されている
And いずれにも "middleware" という単語が含まれるノートが 4 件ある

When User が検索ボックスに "middleware" と入力する
Then 各キー入力で FeedSearchQueryEntered（internal）が発生
And debounce 200ms 後に FeedSearchApplied(query="middleware") が発行
And Feed.searchQuery が更新され、computeVisible() で 4 件のみ表示
And FeedSearchHighlightApplied で各表示ノート内の "middleware" がハイライトされる

When User が "xyzqwerty"（存在しない語）に変える
Then FeedSearchYieldedNoResults が発行
And 0 件状態の特別 UI（「該当なし」メッセージ）が表示される

When User が Esc キーを押す
Then FeedSearchCleared が発行
And 全 47 件表示に戻る
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| 入力 | `EnterSearchQuery` | Feed (Curate UI) | `FeedSearchQueryEntered`（internal） | — |
| 適用 | `ApplyFeedSearch(query)` | Feed | `FeedSearchApplied` | — |
| 0 件 | `ReportNoSearchResults` | Feed | `FeedSearchYieldedNoResults` | — |
| ハイライト | `HighlightSearchHits` | UI（Feed Aggregate ではない） | `FeedSearchHighlightApplied` | ⚠️ ハイライトは表示層責務、Feed Aggregate 不変条件には含まない |
| 解除 | `ClearFeedSearch` | Feed | `FeedSearchCleared` | — |

✅ 表現可能。

**発見**: ハイライトは UI/Read Model の関心事で Aggregate には含めない。aggregates.md にその旨を明記すべきだが、現状でも `Feed.computeVisible()` の責務にハイライト範囲を含めていないので問題なし。

---

## シナリオ 7: フィード上のタグチップでタグ追加

**アクター**: User
**優先度**: 中

### Given/When/Then

```
Given Feed 上にノート N123 が表示されている
And N123 の frontmatter.tags = ["draft"]
And TagInventory に "review" タグが既に存在（usageCount=3）

When User が N123 の行末「+」アイコンをクリックし、"review" を選ぶ
Then TagChipAddedOnFeed(noteId=N123, tag="review") が発行
And Note.addTag("review") が呼ばれ、frontmatter.tags = ["draft", "review"], updatedAt 更新
And SaveNoteRequested(noteId=N123, frontmatter={...}, previousFrontmatter={tags:["draft"]}, source='curate-tag-chip') が発行
And Vault が writeFile
And NoteFileSaved 受信
And TagInventory.applyNoteFrontmatterEdited で "review" の usageCount が 3 → 4 に
And Feed が再ソート（updatedAt 変更で N123 が最上部へ）
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| チップ操作 | `AddTagViaChip(noteId, tag)` | Note | `TagChipAddedOnFeed` | — |
| Note 更新 | `note.addTag(tag, now)` | Note | （domain method） | — |
| 保存依頼 | （Curate）`RequestSave` | Note | `SaveNoteRequested(source='curate-tag-chip')` | — |
| 永続化 | `SaveNote` | Vault | `NoteFileSaved` | — |
| TagInv 更新 | `TagInventory.applyNoteFrontmatterEdited` | TagInventory | `TagInventoryUpdated` | — |
| Feed 再配置 | `Feed.refreshSort` | Feed | — | 結果整合 |

✅ 表現可能。

**発見**: Tag のオートコンプリート（既存タグから選ぶ vs 新規入力）が UX 上重要だが、これは UI 層責務。Curate アプリ層が TagInventory を読んで補完候補を出す。

---

## シナリオ 8: 不要なノートを削除

**アクター**: User
**優先度**: 中

### Given/When/Then

```
Given Feed 上にノート N456 が表示されている
And N456 の frontmatter.tags = ["draft", "scratch"]
And "scratch" は N456 のみが使用しているタグ

When User が N456 の削除ボタン（または選択して Del キー）を押す
Then NoteDeletionRequested(noteId=N456) が発行
And 確認モーダルが表示される

When User が「削除」を確定する
Then NoteDeletionConfirmed が発行
And DeleteNoteRequested(noteId=N456) が発行
And Vault が OS ゴミ箱送り
And NoteFileDeleted(noteId=N456, frontmatter={tags:["draft","scratch"]}) が返る
And Feed.removeNoteRef(N456)
And TagInventory.applyNoteDeleted:
  - "draft" は usageCount-1（残存）
  - "scratch" は usageCount=0 → エントリから削除（不変条件「usageCount > 0」）
And TagInventoryUpdated 発行
And UI のフィルタ UI から "scratch" が消える
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| 削除要求 | `RequestNoteDeletion` | Feed (Curate) | `NoteDeletionRequested` | — |
| モーダル確定 | `ConfirmNoteDeletion` | Feed (Curate) | `NoteDeletionConfirmed` | — |
| 削除依頼 | `DeleteNote` | Vault | `DeleteNoteRequested` → `NoteFileDeleted` | — |
| Feed 更新 | `Feed.removeNoteRef` | Feed | — | — |
| TagInv 更新 | `TagInventory.applyNoteDeleted` | TagInventory | `TagInventoryUpdated` | "scratch" 自動消去動作確認 |

✅ 表現可能。

**発見**: 「現在編集中のノートを削除する」操作の境界が未定義。
- 推奨：編集中（Capture セッション中）のノートは削除ボタンを無効化、または削除前に blur save→セッション終了→削除の流れにする
- → 未解決の問いに追加

---

## シナリオ 9: 編集中ノートを残して別の過去ノート選択（境界ケース）

**アクター**: User
**優先度**: 高（**設計の検証焦点**）

### Given/When/Then

```
Given User が新規ノートを編集中（noteId=N999, body="WIP", isDirty=true）
And idle save がまだ発火していない（入力直後）

When User が過去ノート N100 をクリックする
Then 編集中ノート N999 に対して暗黙的に AutoSaveOnBlur がトリガされる
And SaveNoteRequested(N999, source='capture-blur') が同期的に発行される
And NoteFileSaved(N999) を待ってから次のセッションを開始する
And PastNoteSelected(N100) が発行
And Capture が EditorFocusedOnPastNote(N100) に遷移

ELSE: もし N999 が空（Empty Note）だったら
Then EmptyNoteDiscarded(N999) が発行（Vault には届かない）
And SaveNoteRequested は発行しない
And 直ちに PastNoteSelected(N100) へ
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| 別ノート選択 | `SelectPastNote(N100)` | Feed | `PastNoteSelected`（pending） | — |
| 編集中チェック | `note.isEmpty()` | Note (Capture) | — | — |
| 空でない場合: blur save | `AutoSaveOnBlur` | Note | `SaveNoteRequested(source='capture-blur')` | ⚠️ **同期完了を待つ仕組み**が必要 |
| 完了通知 | — | Vault | `NoteFileSaved` | — |
| 空の場合: 破棄 | `DiscardIfEmpty` | Note | `EmptyNoteDiscarded` | — |
| 新セッション開始 | `StartEditingSession(N100)` | Note | `EditorFocusedOnPastNote` | — |

⚠️ **発見されたギャップ**:

1. **同期保存の待機**：Phase 6 の未解決の問いで「先に現セッションの blur save を強制実行 → 完了待ち」と記述したが、Domain Event は非同期前提。**`SaveNoteRequested` の Promise/Future を返す API が必要** か、**Capture が `NoteFileSaved` を受信するまで `PastNoteSelected` を保留する状態機械** が必要。
   - → aggregates.md に Capture の `EditingSessionState` の遷移として追記推奨
   - → state: `editing → saving (waiting NoteFileSaved) → done → next-session-starting`
2. **保存失敗時の動作**：`NoteSaveFailed` が返ったとき、次のセッションは開始すべきか？
   - 推奨：開始しない。エラーバナーを出して User に判断を委ねる（リトライ / 破棄 / キャンセル）

---

## UI ウォークスルー

### 画面 1: メインフィード画面（唯一の画面）

**表示データ**:
| フィールド | 取得元 |
|----------|-------|
| 上部 検索ボックス | UI 状態 |
| 左サイドバー タグフィルタ UI | TagInventory |
| 右側 ソート切替 | Feed.sortOrder |
| 中央 フィード（縦スクロール） | Feed.computeVisible(snapshots) |
| 各ノート行：タイムスタンプ・本文プレビュー・タグチップ・コピー・削除 | Note(snapshot) |
| 最上部行：編集中ノート（新規 or 過去） | Capture.currentNote |
| 編集中ノートはエディタ展開、それ以外は折りたたみ表示 | Capture.editingState |

**操作**:
| 操作 | Command | Aggregate / Context |
|------|---------|---------------------|
| エディタにテキスト入力 | `EnterBodyText` | Note (Capture) |
| 「+ 新規」ボタン / Ctrl+N | `RequestNewNote` | Note (Capture) |
| コピーボタン | `CopyNoteBody` | Note (Capture) |
| 過去ノート行クリック | `SelectPastNote` | Feed (Curate) → Capture |
| タグチップ「+」 | `AddTagViaChip` | Note (Curate-driven) |
| タグチップ「×」 | `RemoveTagViaChip` | Note (Curate-driven) |
| 削除ボタン | `RequestNoteDeletion` | Feed (Curate) |
| タグフィルタ UI | `ApplyFeedFilterByTag` | Feed (Curate) |
| 検索ボックス | `EnterSearchQuery` → `ApplyFeedSearch` | Feed (Curate) |

**遷移**: なし（単一画面）。設定誘導 UI はモーダル／オーバーレイで表示。削除確認もモーダル。

✅ 単一画面で完結する設計が成立。

### 画面 2: 設定誘導モーダル（vault 未設定時）

**表示**: 「保存先フォルダを選択してください」+ ファイル選択ボタン
**操作**: フォルダ選択 → `ConfigureVaultDirectory(path)`
**遷移**: 完了でモーダル閉じ → メインフィード画面へ

### 画面 3: 削除確認モーダル

**表示**: 「このノートを削除しますか？(OS ゴミ箱に送られます)」+ 削除/キャンセル
**操作**:
- 削除 → `ConfirmNoteDeletion`
- キャンセル → `CancelNoteDeletion`

### 画面 4: 保存失敗バナー（非モーダル）

**表示**: 「保存に失敗しました（権限/容量不足/...）」+ 再試行/閉じる
**操作**: 再試行 → 最後の `SaveNoteRequested` を再発行

---

## フィードバックサマリ

| # | 問題 | 影響フェーズ | 対応 |
|---|------|----------|------|
| F1 | `note.bodyForClipboard()` のような明示メソッドで frontmatter 除外を保証 | Phase 5 (aggregates) | 推奨追記 |
| F2 | `Feed.refreshSort()` 操作が aggregates.md に明示されていない | Phase 5 | 推奨追記 |
| F3 | `EditorFocusedOnPastNote` は Phase 6 で記述済みだが Phase 2 で未列挙 | Phase 2 | minor、追記推奨 |
| F4 | ハイライトは UI 責務であり Feed Aggregate に含めない旨を明示 | Phase 5 | minor、注記推奨 |
| F5 | 「編集中のノートを削除する」操作の境界 | Phase 5 / Phase 7 | 未解決の問いに追加：編集中なら削除無効化 or blur save 強制 → セッション終了 → 削除 |
| F6 | **`SaveNoteRequested` 完了待ちの状態機械**：Capture の `EditingSessionState` に saving → next-session 遷移を明示 | Phase 5 | **重要追記**（境界ケースの正しさを担保） |
| F7 | 保存失敗時の次セッション開始可否 | Phase 6 (events) / Phase 7 | 推奨：開始せずユーザー判断 |
| F8 | タグ複数選択時の AND/OR を UX テストで再検証 | Phase 7 | MVP は OR、将来検証 |
| F9 | NoteId 衝突回避責務（Vault.allocateNoteId or ランダムサフィックス） | Phase 5 | **追記必要** |
| F10 | `NoteHydrationFailed` イベント（壊れた frontmatter） | Phase 6 | **追記必要** |
| F11 | ACL の Result 型（hydrate 失敗ハンドリング） | Phase 5 / Phase 4 | **追記必要** |
| F12 | タグ正規化はファイル無触で読み取り時のみ実施 | Phase 3 (contexts) | 注記推奨 |
| F13 | 編集中ノート削除は UI 層で無効化（ドメイン変更不要） | Phase 7 | 解決済み |
| F14 | `EditingSessionState.lastSaveResult` フィールド追加 | Phase 5 | **追記必要** |
| F15 | 保存失敗→別ノート選択時の選択肢 UI（破棄/再試行/キャンセル） | Phase 7 | UI 仕様確定 |

## 後回しで良い未検証項目（MVP 範囲外、明示的に保留）

下記は MVP では検証不要。実装後または運用中に再検討する。

| 項目 | 理由 | 再検討タイミング |
|------|------|---------------|
| 大量ノート（1000+ 件）でのフィルタ・検索性能 | MVP の想定規模は数百件まで。Pure function での `computeVisible` で十分 | 利用規模が増えたら |
| システムスリープ → 復帰時の自動保存タイマーの挙動 | OS 依存・実装段階で検証 | 実装フェーズで動作確認 |
| アプリ複数起動（同一 vault に同時アクセス） | MVP は単一インスタンス前提 | 必要が生じたら |
| 検索方式の高度化（正規表現・あいまい検索） | MVP は部分一致・大文字小文字無視のみ | ユーザー要望次第 |
| frontmatter のユーザー定義テンプレート | discover フェーズで MVP 対象外と確定 | MVP 後の機能追加時 |

---

## 異常系・境界ケースの追加検証（シナリオ 10–15）

happy path の 1–9 だけでは設計の穴は見えない。実運用で発生しうる異常系・境界ケースを 6 つ追加検証。

---

## シナリオ 10: 同一ミリ秒内に複数の新規ノート作成（ID 衝突）

**アクター**: User（高速タイピングで `Ctrl+N` を連打）
**優先度**: 中（実運用で発生しうる）

### Given/When/Then

```
Given アプリが起動済みで、現在時刻 t = 2026-04-27-153045-218
When User が同一ミリ秒内に Ctrl+N を 3 回連打する
Then 3 つの NoteId が生成される必要がある
And NoteId 形式は YYYY-MM-DD-HHmmss-SSS、衝突時は -1, -2 サフィックス
  → "2026-04-27-153045-218"（1回目）
  → "2026-04-27-153045-218-1"（2回目、衝突検知してサフィックス付与）
  → "2026-04-27-153045-218-2"（3回目）
And ファイル名も同じ規則で生成される

ELSE: 衝突検知の責務はどこか？
- Note Aggregate の create() で UUID 風サフィックスを毎回付与（衝突確率を実質ゼロに）
- または Vault.saveNote で既存ファイル名と照合して -1 を付与
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| 連打 | `RequestNewNote × 3` | Note (Capture) | `NewNoteRequested × 3` | — |
| ID 生成 | `Note.create(now)` | Note | — | ⚠️ **同一 now で衝突する** |
| 永続化 | `SaveNote` | Vault | `NoteFileSaved` × 3 | ⚠️ **ファイル名衝突を Vault が検知すべき** |

⚠️ **発見されたギャップ**:
1. Note Aggregate の `create(now)` は now のみを受け取る前提だが、衝突回避ロジックを誰が持つかが未定義
2. **解決案**: Note ID 生成を `Vault.allocateNoteId(preferredTimestamp): NoteId` に委ね、Vault が「衝突なき NoteId」を返す責務を持つ。Capture は受け取った NoteId で `Note.create(id, now)` を呼ぶ
3. または、Note の id を `${timestamp}-${nanoid(4)}` のようにランダム要素を加えて生成元で衝突回避

→ aggregates.md の Note ID 設計に反映必要

---

## シナリオ 11: 壊れた frontmatter のファイルが vault にある

**アクター**: User（Obsidian や手動編集でファイルが壊れた状態）
**優先度**: 高（実運用で必ず起きる）

### Given/When/Then

```
Given vault に "2026-01-15-100000-001.md" が存在
And ファイル冒頭が次のように壊れている:
  ---
  tags: [draft, "review  ← クォート閉じ忘れ
  createdAt: not-a-date
  ---
  本文 OK

When User がアプリを起動する
Then VaultScanned で 1 件含まれて返る
And Curate 側 ACL が NoteFileSnapshot → Note Aggregate に変換しようとする
And 変換失敗（YAML parse error または createdAt VO の Smart Constructor 拒否）

選択肢 A: 該当ファイルを Feed から除外し、UI に「破損ファイル N 件あり」警告を出す
選択肢 B: 該当ファイルを「破損 Note」として表示（編集を許可、保存時に正規化）
選択肢 C: アプリ起動失敗

推奨: A（除外＋警告）。理由：MVP では編集して再保存するロジックが複雑になりすぎる。
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| スキャン | `ScanVault` | Vault | `VaultScanned(snapshots)` | snapshot に raw 文字列を含む |
| ACL 変換 | （Curate）`hydrateSnapshot(snapshot): Result<Note, ParseError>` | — | — | ⚠️ **新規イベントが必要** |
| 失敗通知 | — | — | `NoteHydrationFailed(filePath, reason)` | ❌ Phase 6 に未定義 |

⚠️ **発見されたギャップ**:
1. **`NoteHydrationFailed` イベントが未定義**（domain-events.md に追加必要）
2. Curate 側の ACL は Result 型を返すべき
3. Feed Aggregate に「破損ファイル数」のメトリクスを持つか、別の Read Model にするか

→ domain-events.md に `NoteHydrationFailed` 追加、aggregates.md の ACL 責務に明記

---

## シナリオ 12: タグの大文字/小文字混在（Obsidian で手動編集後）

**アクター**: User（Obsidian で frontmatter を手動編集して "Draft" タグを使った）
**優先度**: 中

### Given/When/Then

```
Given vault に N100 (tags=["draft"])、N200 (tags=["Draft"]) が存在（Obsidian で手動編集された）
When User がアプリを起動する
Then VaultScanned で両方読み込まれる
And ACL の hydrate 時に Tag VO の Smart Constructor が "Draft" → "draft" に正規化する
And Note アグリゲートの frontmatter.tags は両方 ["draft"] になる
And TagInventory.entries = [{name: "draft", usageCount: 2}]
And フィルタ UI には "draft" のみ表示される

ただし、ファイル自体（Markdown）は元の "Draft" のままで保存されている。
これでよいか？

選択肢 A: 起動時に検出した場合、内部表現のみ正規化、ファイルは触らない（読み取り時のみ正規化）
選択肢 B: 起動時に検出して、自動でファイルも書き換える（disruptive）
選択肢 C: UI で警告を出して User に書き換えを提案

推奨: A（読み取り時正規化、ファイル無触）。理由：Obsidian と vault を共有する際、
こちらが勝手に書き換えると Obsidian 側の意図と衝突する可能性。
ただし、こちら側でタグ編集を行ったら "draft" として書き戻されるので、自然に統一される。
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| ACL 正規化 | `Tag.create("Draft")` | Tag VO | — | ✅ Smart Constructor で吸収 |
| TagInventory 構築 | `TagInventory.buildFromNotes` | TagInventory | `TagInventoryBuilt` | ✅ 重複なくカウントされる |

✅ **正規化は ACL レベルで吸収される**（既存設計で OK）。ただし「ファイルは触らない」ルールを Vault Context のドキュメントに明記推奨。

---

## シナリオ 13: Obsidian 側でファイル削除した状態で起動

**アクター**: User
**優先度**: 中（MVP の rescan-only 戦略の検証）

### Given/When/Then

```
Given 前回起動時に vault に N300 が存在
And アプリ終了後、User が Obsidian で N300 を削除
When User が再起動する
Then VaultScanned で N300 を含まないリストが返る
And FeedRestored で N300 が含まれない Feed が構築される
And TagInventoryBuilt で N300 のタグも反映されない（自動）
And UI 上 N300 はそもそも表示されない

User の認知:
- N300 が消えたことに気付かない可能性がある
- ただし、それは User が自分で削除したので問題なし
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| スキャン | `ScanVault` | Vault | `VaultScanned` | ✅ rescan で正しく反映 |

✅ MVP の「rescan-on-relaunch」戦略で問題なく動作。

---

## シナリオ 14: 編集中のノートを削除しようとする（F5 解決検証）

**アクター**: User
**優先度**: 高（F5 の解決確認）

### Given/When/Then（推奨案：削除ボタン無効化）

```
Given User が新規ノート N999 を編集中（isDirty=true、editingState='editing'）
And N999 はまだ Vault に保存されていない（空または途中）

When User が他の過去ノート N100 の削除ボタンをクリックする
Then 通常通り NoteDeletionRequested(N100) → 削除確認モーダル → 削除実行

When User が編集中の N999 自身の削除ボタン（フィード行に表示されているとして）をクリックする
Then UI 仕様: 編集中の Note の削除ボタンは無効化される
And クリックは何も起こさない、または「先に編集を終了してください」のヒント表示

ELSE 案: editingState='editing' のとき N999 自身の削除を試みたら
- まず blur save を強制発火（→ saving 状態へ）
- 完了したら削除確認モーダルを表示
- 確定したら DeleteNoteRequested(N999) を発行

推奨: **削除ボタン無効化**（シンプル、誤操作防止）
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| ボタン無効化判定 | UI 層: `editingState.currentNoteId === N999 ? disabled : enabled` | — | — | ✅ UI 責務 |

✅ UI 層責務として解決。ドメインモデルへの追加は不要。

→ validation.md と bounded-contexts.md に「編集中のノートの削除は UI 層で無効化する」旨を記載。

---

## シナリオ 15: 保存失敗 → そのまま別ノート選択（F7 解決検証）

**アクター**: User
**優先度**: 高（F7 の解決確認）

### Given/When/Then

```
Given User が新規ノート N999 を編集中（body="Important content"、isDirty=true）
And ディスク容量不足

When idle 2 秒経過
Then SaveNoteRequested(N999, source='capture-idle')
And Vault が ENOSPC で失敗
And NoteSaveFailed(noteId=N999, reason='disk-full') が返る
And EditingSessionState.status = 'editing'（saving から戻る）
And isDirty=true 維持
And UI に保存失敗バナー表示

When User が過去ノート N100 をクリックする（保存失敗状態のまま）
Then 通常なら blur save が発火するが、また失敗する可能性が高い

選択肢 A: 強制再試行（→ また失敗 → 切替ブロック）
選択肢 B: 切替を拒否し、UI に「先に保存問題を解決してください」を表示
選択肢 C: User に明示的選択肢を出す（「破棄して切り替える」「再試行」「キャンセル」）

推奨: **C（明示的選択）**。理由：データ損失リスクのある操作なので、自動判断は危険。
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| 切替試行 | `SelectPastNote(N100)` | Feed | `PastNoteSelected`（pending） | — |
| 失敗状態検出 | UI/Capture: `editingState.lastSaveResult === 'failed'` | — | — | ⚠️ EditingSessionState に `lastSaveResult` フィールド追加が必要 |
| 選択肢表示 | UI モーダル: 破棄/再試行/キャンセル | — | — | UI 責務 |
| 破棄選択 | `DiscardCurrentSession(N999)` | Note (Capture) | `EditingSessionDiscarded` | ❌ 新規イベント必要 |
| 再試行選択 | `RetrySave(N999)` | Note (Capture) | `SaveNoteRequested(retry)` | — |

⚠️ **発見されたギャップ**:
1. `EditingSessionState` に `lastSaveResult: 'success' | 'failed' | null` フィールド追加が必要
2. `EditingSessionDiscarded` イベントを domain-events.md に追加（オプション、または internal で十分）
3. `RetrySave` Command を Capture に追加

→ aggregates.md の `EditingSessionState` 拡張、domain-events.md に追記

---

## 検証で確定した重要ルール

1. **編集セッションは sequential**：1 度に 1 つのみ。別ノート選択時は前セッションを必ず終端化
2. **保存依頼は同期的に完了待ちできる**：`SaveNoteRequested` の応答（`NoteFileSaved` / `NoteSaveFailed`）を Capture の状態機械が待つ
3. **空ノートは Vault に届かない**：`EmptyNoteDiscarded` で Capture 内完結、`SaveNoteRequested` は発行しない
4. **タグ正規化は Smart Constructor で保証**：Tag VO 生成時点で小文字化・先頭 `#` 除去・空文字拒否
5. **削除は OS ゴミ箱送り**：MVP 採用方針で確定（モーダル確認 + ゴミ箱送り）
6. **単一画面 UI**：すべての操作がフィード画面で完結。モーダルは設定誘導と削除確認のみ
7. **ブロックベース WYSIWYG**：本文は `Block[]`（順序つきブロック列）として保持され、フィード上の任意ノートのブロックがクリックで in-place 編集可能。ファイル保存時は `serializeBlocksToMarkdown(blocks)` で平坦な Markdown に直列化（Obsidian 互換）

---

## シナリオ 10: ブロック分割・種類変換で見出し付きメモを書く（WYSIWYG コア）

**アクター**: User
**優先度**: 高（ブロックベース UI が機能しているかの最重要確認シナリオ）

### 自然言語

User が新規ノートに見出し → 段落 → 箇条書きを書く。`# `、Enter、`- ` といった Markdown シンタックスをタイプすると、その場で見た目が見出し／箇条書きに変換され、ファイル化された後も同じ構造で再ハイドレートされる。

### Given/When/Then

```
Given アプリが起動済み、新規ノート（blocks=[empty paragraph], focusedBlockId=B0）にフォーカス
And EditingSessionState.status = 'editing', isDirty = false

When User が "# Project plan" とタイプする
Then "# " を入力した瞬間に ChangeBlockType(B0, 'heading-1') が発火
And ブロック B0 の type が 'paragraph' → 'heading-1' に変換される
And Markdown シンタックス "# " はエディタ DOM 上では非表示になり、テキストは見出しサイズで描画される
And content は "Project plan" として続けて入力できる
And isDirty = true、idle timer 起動

When User が Enter を押す
Then InsertBlockAfter(prevBlockId=B0, type='paragraph', content='') が発火
And 新ブロック B1（空 paragraph）が直後に挿入される
And EditingSessionState.focusedBlockId が B1 へ移動

When User が "Refactor auth middleware" とタイプ
Then EditBlockContent(B1, 'Refactor auth middleware') の連続発火（キーごとに）

When User が Enter → "- Step 1" とタイプ
Then InsertBlockAfter で B2 を挿入
And 行頭 "- " 入力で ChangeBlockType(B2, 'bullet') 発火
And B2 は箇条書きブロックとして描画

When 入力停止 2 秒
Then NoteAutoSavedAfterIdle 発火
And SaveNoteRequested(noteId, blocks=[B0:heading-1, B1:paragraph, B2:bullet], body=serializeBlocksToMarkdown(...), frontmatter, source='capture-idle')
And Vault が writeFile（body は "# Project plan\n\nRefactor auth middleware\n\n- Step 1\n"）
And NoteFileSaved 返却、isDirty=false

When User がアプリを再起動
Then Vault scan → parseMarkdownToBlocks がファイルを Block[3] に再構成
And Feed 上で同じ見出し／段落／箇条書き構造で表示される（BlockId は新規採番）
```

### モデルマッピング

| Step | Command | Aggregate | Event | 問題 |
|------|---------|-----------|-------|------|
| `# ` 入力 | `ChangeBlockType(B0, heading-1)` | Note | `BlockTypeChanged` (internal) | — |
| 文字入力 | `EditBlockContent(B0, 'Project plan')` | Note | `BlockContentEdited` (internal) | — |
| Enter | `InsertBlockAfter(B0, paragraph, '')` | Note | `BlockInserted` (internal) | — |
| `- ` 入力 | `ChangeBlockType(B2, bullet)` | Note | `BlockTypeChanged` (internal) | — |
| idle save | `AutoSaveOnIdle` | Note | `NoteAutoSavedAfterIdle` + `SaveNoteRequested(blocks, body, ...)` | ✅ blocks 込みで Vault へ |
| 永続化 | `SaveNote` | Vault | `NoteFileSaved(blocks, body, ...)` | ✅ |
| 再起動時パース | `parseMarkdownToBlocks(body)` | (ACL pure fn) | `NotesHydrated` | ⚠️ Markdown ↔ Block ラウンドトリップ性質に依存 |

### 検証ポイント

- ✅ ブロック種変換は **キャレット位置の文脈**（行頭の `# ` 等）で発火する。誤発火（例：本文中で `# ` を含めたい場合）は escape `\# ` で抑制（実装時に決定）
- ✅ Enter キーは「行末」「中央」「ブロック頭」で挙動が分岐：
  - 行末 → `InsertBlockAfter`
  - 中央 → `SplitBlock(offset)`
  - 空ブロック頭で連続 Enter → 何もしない or 種変換解除（実装時に決定）
- ✅ ファイル → ブロックのラウンドトリップ：`parseMarkdownToBlocks(serializeBlocksToMarkdown(b)) ≈ b`（BlockId を除き、構造一致）
- ⚠️ **発見**：`parseMarkdownToBlocks` の対応外構造（HTML 直書き、未知のブロック）は `paragraph` として保持する fallback ルールを aggregates.md / glossary.md に明記する必要がある

### 発見と差し戻し

- aggregates.md に `parseMarkdownToBlocks` の fallback 規則（未知構造 → paragraph）を明記
- glossary.md / event-storming.md にブロック編集イベント（`BlockContentEdited` 等）と Command の対応を明記済み
- ui-fields.md の 1A セクションにキー入力 → Command マッピング表を追記済み
- IME composition 中の `EditBlockContent` 抑制を ui-fields.md に確定として記載済み
