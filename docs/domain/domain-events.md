# Domain Events

## イベント分類

| 分類 | 説明 | 流通範囲 |
|------|------|---------|
| **Public Domain Event** | Bounded Context 間でイベントバスを通って流れる | Cross-Context |
| **Internal Application Event** | Context 内で UI 状態や Aggregate を更新する | In-Context |
| **Domain Event Carrying Command** | 「依頼」を Event 形式で伝える（保存依頼、削除依頼） | Cross-Context |

本プロジェクトでは **Public** に絞って Domain Event 設計を行う。Internal は UI 層やアプリケーションサービス層で扱い、過剰なメッセージングは避ける。

すべての Event は基底プロパティとして `occurredOn: Timestamp` を持つ。

---

## Public Domain Events 一覧

### Vault Context が発行

#### `VaultDirectoryConfigured`
- **発生元 Aggregate**: Vault
- **トリガー Command**: `ConfigureVaultDirectory`
- **プロパティ**:
  - `vaultId: VaultId`
  - `path: VaultPath`
  - `occurredOn: Timestamp`
- **Consumer**: Capture, Curate
- **Enrichment / Query-Back**: Enrichment（path を載せる）。Consumer は次の起動時の挙動を変える

#### `VaultDirectoryNotConfigured`
- **発生元**: Vault（起動時の自己診断）
- **トリガー**: 起動時に path 未設定
- **プロパティ**:
  - `occurredOn: Timestamp`
- **Consumer**: Capture, Curate（UI が設定誘導画面を出す）
- **Enrichment**: 不要（状態のみ）

#### `VaultScanned`
- **発生元 Aggregate**: Vault
- **トリガー Command**: `ScanVault`（起動時の同期呼び出し）
- **プロパティ**:
  - `vaultId: VaultId`
  - `snapshots: NoteFileSnapshot[]` — 各 snapshot は `{ noteId, body, frontmatter, filePath, fileMtime }`
  - `corruptedFiles: CorruptedFile[]` — 壊れファイル一覧（F10 解決：起動時集約）。`CorruptedFile = { filePath: string, failure: ScanFileFailure, detail?: string }` で、`ScanFileFailure = {kind:'read', fsError: FsError} \| {kind:'hydrate', reason: HydrationFailureReason}` により read 失敗（OS）と hydrate 失敗（フォーマット）を区別
  - `occurredOn: Timestamp`
- **Consumer**: Curate（Feed 構築・TagInventory 構築・壊れファイル警告 UI）
- **Enrichment**: Enrichment（snapshot 全体 + 失敗ファイル一覧を載せる）。Curate は Vault に再問い合わせせずに Feed を組み立てられる

#### `NoteFileSaved`
- **発生元 Aggregate**: Vault
- **トリガー Command**: `SaveNote`（`SaveNoteRequested` の処理結果）
- **プロパティ**:
  - `noteId: NoteId`
  - `blocks: Block[]` — 保存された Note の最新ブロック列（ブロックベース UI 化により追加）
  - `body: Body` — `serializeBlocksToMarkdown(blocks)` の派生。後方互換と検索インデックス用
  - `frontmatter: Frontmatter`
  - `previousFrontmatter: Frontmatter | null` — Curate の TagInventory 増分更新用
  - `occurredOn: Timestamp`
- **Consumer**: Capture（編集状態の `isDirty=false` 化）、Curate（Feed の noteRefs 更新、TagInventory 更新、ブロック列の表示更新）
- **Enrichment**: Enrichment + 旧 frontmatter も含める（タグ差分計算のため）。Query-Back を避ける
- **備考**: Note 全体のスナップショット（blocks 含む）を載せ、ブロック単位の差分は載せない

#### `NoteSaveFailed`
- **発生元**: Vault
- **トリガー**: ファイル書き込みエラー
- **プロパティ**:
  - `noteId: NoteId`
  - `reason: 'permission' | 'disk-full' | 'lock' | 'unknown'`
  - `detail?: string`
  - `occurredOn: Timestamp`
- **Consumer**: Capture（編集状態を保持しつつ UI 警告）、Curate（タグチップ操作の場合は表示を巻き戻し）
- **Enrichment**: 必要最小限（reason / detail）

#### `NoteFileDeleted`
- **発生元 Aggregate**: Vault
- **トリガー Command**: `DeleteNote`（`DeleteNoteRequested` の処理結果）
- **プロパティ**:
  - `noteId: NoteId`
  - `frontmatter: Frontmatter` — TagInventory 減算のためタグを保持
  - `occurredOn: Timestamp`
- **Consumer**: Curate（Feed から除外、TagInventory 更新）
- **Enrichment**: タグ情報を含める（Query-Back を避ける）

#### `NoteDeletionFailed`
- **発生元**: Vault
- **プロパティ**:
  - `noteId: NoteId`
  - `reason: 'permission' | 'lock' | 'not-found' | 'unknown'`
  - `detail?: string`
  - `occurredOn: Timestamp`
- **Consumer**: Curate（UI 警告）

#### `NoteHydrationFailed`（追加：Phase 7 / F10）
- **発生元 Aggregate**: Vault（scan 結果の ACL 変換段階）
- **トリガー**: NoteFileSnapshot から Note Aggregate への変換失敗（YAML パースエラー、必須フィールド欠落、Tag VO の Smart Constructor 拒否、Markdown → Block[] パース失敗など）
- **プロパティ**:
  - `filePath: string`
  - `reason: 'yaml-parse' | 'missing-field' | 'invalid-value' | 'block-parse' | 'unknown'`
  - `detail?: string` — エラーメッセージ
  - `occurredOn: Timestamp`
- **Consumer**: Curate（壊れファイル数の集計、UI 警告バナー）
- **Enrichment**: 必要最小限。filePath は復旧操作（Obsidian で開く等）への導線
- **MVP 方針**: 壊れファイルは Feed から除外、警告のみ表示

---

### Capture Context が発行

#### `SaveNoteRequested`（Domain Event Carrying Command）
- **発生元 Aggregate**: Note（編集セッション）
- **トリガー Command**: `AutoSaveOnIdle` / `AutoSaveOnBlur` / Curate からの `RequestSaveAfterTagChipChange`
- **プロパティ**:
  - `noteId: NoteId`
  - `blocks: Block[]` — 保存対象のブロック列（ブロックベース UI 化により追加）
  - `body: Body` — `serializeBlocksToMarkdown(blocks)` の派生。Vault は `body` を直接ファイルに書く
  - `frontmatter: Frontmatter`
  - `source: 'capture-idle' | 'capture-blur' | 'curate-tag-chip' | 'curate-frontmatter-edit-outside-editor'`
  - `occurredOn: Timestamp`
- **Consumer**: Vault（処理して `NoteFileSaved` または `NoteSaveFailed` を返す）
- **Enrichment**: 全データ。Vault が Capture/Curate のドメインに直接問い合わせるのを避ける（ACL 維持）
- **備考**: 本イベントは Capture と Curate の両方が発行できる。`source` フィールドで発生元を識別。**ブロック単位の差分は持たず、Note 全体のフルリプレース** を Vault に依頼する

#### `EmptyNoteDiscarded`
- **発生元 Aggregate**: Note（Capture アプリ層）
- **トリガー**: 新規ノート空のままフォーカス遷移
- **プロパティ**:
  - `noteId: NoteId`
  - `occurredOn: Timestamp`
- **Consumer**: Curate（Feed の暫定行から除外。空ノートはそもそも Vault に届いていないので Vault には伝播しない）
- **備考**: 厳密には Cross-Context だが Capture → Curate のみで Vault は関与しない

---

### Curate Context が発行

#### `PastNoteSelected`（Block Focus 取得の上位）
- **発生元 Aggregate**: Feed
- **トリガー Command**: 過去ノートのブロックがクリック／キーボードフォーカスされた瞬間（旧 `SelectPastNote` Command を block-level に refine）
- **プロパティ**:
  - `noteId: NoteId`
  - `blockId: BlockId` — フォーカス対象ブロック（ブロックベース UI 化により追加）
  - `snapshot: NoteSnapshot` — 編集セッション開始のために blocks+frontmatter を Capture に渡す
  - `occurredOn: Timestamp`
- **Consumer**: Capture（編集セッション開始 → `BlockFocused` 内部イベントへ）
- **Enrichment**: snapshot を含める（Capture が Curate に問い合わせるのを避ける）
- **重要**: これが Curate → Capture の境界をまたぐ唯一の同期的トリガ。ブロックベース UI 化以降は **クリックがそのまま `PastNoteSelected` を発行**するため「選択ボタン」のような中間 UI は存在しない

#### `DeleteNoteRequested`（Domain Event Carrying Command）
- **発生元 Aggregate**: Feed（Curate アプリ層）
- **トリガー Command**: `ConfirmNoteDeletion`
- **プロパティ**:
  - `noteId: NoteId`
  - `occurredOn: Timestamp`
- **Consumer**: Vault（処理して `NoteFileDeleted` または `NoteDeletionFailed` を返す）

---

## Internal Application Events（参考、メッセージング不要）

これらは **同 Context 内でアプリケーションサービス／UI 層が消費**するため、明示的なイベントバスを通さなくてよい。Phase 2 で挙げたが Public Domain Event ではない:

### Capture 内
- `AppLaunched`
- `NewNoteAutoCreated`
- `BlockFocused` — 新規・過去いずれの Note かを問わず、ブロックにキャレットが入った瞬間（旧 `EditorFocusedOnNewNote` / `EditorFocusedOnPastNote` を統合）
- `BlockBlurred` — 個別ブロックからフォーカスが外れた
- `EditorBlurredAllBlocks` — そのノートの全ブロックからフォーカスが外れた（旧 `EditorBlurred`）
- `BlockContentEdited` / `BlockInserted` / `BlockRemoved` / `BlocksMerged` / `BlockSplit` / `BlockTypeChanged` / `BlockMoved` — ブロック構造・内容の変更（一過性）
- `NoteFrontmatterEditedInline`
- `NewNoteRequested`
- `NoteAutoSavedAfterIdle`
- `NoteAutoSavedOnBlur`
- `NoteBodyCopiedToClipboard`
- `EditingSessionDiscarded` — 保存失敗後にユーザーが「破棄」を選択した場合（F15 解決）
- `RetrySaveRequested` — 保存失敗後にユーザーが「再試行」を選択した場合（F15 解決）

> 上記の `NoteAutoSavedAfterIdle` / `NoteAutoSavedOnBlur` は **`SaveNoteRequested` を発行するトリガ**。それ自体は Capture 内 UI 表示用（保存中インジケータ等）。実際の永続化完了は `NoteFileSaved` で確認する。
>
> ブロックレベルの編集イベント（`BlockContentEdited` 等）はすべて **Internal**。Cross-Context へは `SaveNoteRequested` の Note 全体スナップショットとしてのみ流れる（差分は載せない）。

### Curate 内
- `FeedRestored`
- `TagInventoryBuilt`
- `TagInventoryUpdated`
- `PastNoteFocused`
- `FeedFilterByTagApplied` / `FeedFilterByFrontmatterApplied` / `FeedFilterCleared`
- `FeedSortedByTimestamp`
- `FeedSearchQueryEntered` / `FeedSearchApplied` / `FeedSearchYieldedNoResults` / `FeedSearchCleared` / `FeedSearchHighlightApplied`
- `NoteDeletionRequested` / `NoteDeletionConfirmed` / `NoteDeletionCanceled`
- `TagChipAddedOnFeed` / `TagChipRemovedOnFeed` — **これは `SaveNoteRequested` を発行するトリガ**

---

## Event Flow（典型シナリオ）

### シナリオ 1: 起動 → 新規ノート → 入力 → 自動保存

```
[ User ]                    [ Capture ]            [ Vault ]               [ Curate ]
   │                            │                      │                       │
   ├─ launch app ──────────────→│                      │                       │
   │                            │                      │                       │
   │                       (App initialization)        │                       │
   │                            │                      │                       │
   │                            │  ScanVault() ───────→│                       │
   │                            │                      │                       │
   │                            │←── VaultScanned ────┤────────────────────→│
   │                            │   (snapshots[])     │                       │
   │                            │                      │                  FeedRestored
   │                            │                      │                  TagInventoryBuilt
   │                            │                      │                       │
   │                       NewNoteAutoCreated          │                       │
   │                       EditorFocusedOnNewNote      │                       │
   │                            │                      │                       │
   ├─ types text ──────────────→│                      │                       │
   │                       NoteBodyEdited (internal)   │                       │
   │                            │                      │                       │
   │                       (idle 2s)                   │                       │
   │                       NoteAutoSavedAfterIdle      │                       │
   │                            │                      │                       │
   │                            ├── SaveNoteRequested ─→│                      │
   │                            │   (source=capture-   │                      │
   │                            │     idle)            │ writeFile()           │
   │                            │                      │                       │
   │                            │←── NoteFileSaved ───┤────────────────────→ │
   │                            │   (body, frontmatter,│                      │
   │                            │    previousFM=null)  │              Feed.addNoteRef
   │                       isDirty=false               │              TagInventory.applyNoteCreated
```

### シナリオ 2: 過去ノート選択 → 本文編集 → 保存

```
[ User ]              [ Curate ]              [ Capture ]            [ Vault ]
   │                      │                       │                     │
   ├─ click past note ───→│                       │                     │
   │                  PastNoteFocused (internal)  │                     │
   │                      │                       │                     │
   │                      ├── PastNoteSelected ──→│                     │
   │                      │   (snapshot)          │                     │
   │                      │              EditorFocusedOnPastNote        │
   │                      │                       │                     │
   ├─ edits body ─────────────────────────────────→                    │
   │                      │              NoteBodyEdited (internal)      │
   │                      │                       │                     │
   │                      │                  (idle 2s)                  │
   │                      │              NoteAutoSavedAfterIdle         │
   │                      │                       ├── SaveNoteRequested→│
   │                      │                       │                     │
   │                  ←── NoteFileSaved ──────────────────── ┤←        │
   │             (Curate updates noteRef ordering             writeFile
   │              & TagInventory if frontmatter changed)
```

### シナリオ 3: フィード上のタグチップ操作（編集セッション外）

```
[ User ]              [ Curate ]                                [ Vault ]
   │                      │                                          │
   ├─ click "+" on tag ──→│                                          │
   │                  TagChipAddedOnFeed (internal)                  │
   │                      │                                          │
   │                      ├── SaveNoteRequested ─────────────────→ │
   │                      │   (source=curate-tag-chip)               │
   │                      │                                     writeFile
   │                  ←── NoteFileSaved ────────────────────────────┤
   │             TagInventory.applyNoteFrontmatterEdited
   │             Feed re-sorts (updatedAt 変更)
```

### シナリオ 4: 削除

```
[ User ]              [ Curate ]                                [ Vault ]
   │                      │                                          │
   ├─ click delete ──────→│                                          │
   │                  NoteDeletionRequested                          │
   │                  NoteDeletionConfirmed (after dialog)           │
   │                      │                                          │
   │                      ├── DeleteNoteRequested ──────────────→ │
   │                      │                                  trash file
   │                  ←── NoteFileDeleted ──────────────────────────┤
   │             Feed.removeNoteRef
   │             TagInventory.applyNoteDeleted
```

### シナリオ 5: 保存失敗

```
[ Capture ]            [ Vault ]
     │                     │
     ├── SaveNoteRequested→│
     │                     │ writeFile() — ENOSPC
     │                     │
     │← NoteSaveFailed ───┤
     │   (reason=disk-full)│
isDirty=true 維持
UI に警告バナー表示
（リトライは Capture 側でユーザー操作 or 次回 idle で再発火）
```

---

## 因果整合性（Causal Consistency）

| 前提イベント | 派生イベント | 制約 |
|------------|------------|------|
| `VaultDirectoryConfigured` または既存設定 | `VaultScanned` | 設定なしで scan は不可 |
| `VaultScanned` | `FeedRestored`, `TagInventoryBuilt` | scan 結果なしに Feed 構築不能 |
| `SaveNoteRequested` | `NoteFileSaved` または `NoteSaveFailed` | 必ずどちらか 1 つが返る |
| `DeleteNoteRequested` | `NoteFileDeleted` または `NoteDeletionFailed` | 必ずどちらか 1 つが返る |
| `NoteFileSaved` (frontmatter 変更あり) | `TagInventoryUpdated` | Curate 内の結果整合 |
| `PastNoteSelected` | `EditorFocusedOnPastNote` (Capture 内) | 編集セッション開始の起点 |

すべて **occurredOn** で時間順序を保証。単一プロセス・単一スレッド前提なので順序は自明だが、将来の非同期化に備えて明示。

---

## Enrichment vs Query-Back の方針

| Event | 採用 | 理由 |
|-------|------|------|
| `VaultScanned` | **Enrichment**（snapshots 全体） | 起動時に Curate が Vault に再問い合わせる必要をなくす |
| `NoteFileSaved` | **Enrichment**（body, frontmatter, previousFrontmatter） | TagInventory 差分計算を Curate 内で完結 |
| `NoteFileDeleted` | **Enrichment**（frontmatter） | TagInventory 減算用 |
| `SaveNoteRequested` | **Enrichment**（body, frontmatter） | Vault が ACL を保ったまま処理可能 |
| `PastNoteSelected` | **Enrichment**（snapshot） | Capture が Curate に問い合わせるのを避ける |
| その他失敗系 | **最小限** | reason のみ |

単一プロセスのため Enrichment コストは低く、Consumer の自律性を優先。

---

## Event Sourcing 検討

| 質問 | 回答 |
|------|------|
| 完全な変更履歴の追跡が必要か？ | **不要**。Markdown ファイル自体が永続化の真実、Git/Obsidian/エディタ履歴で十分 |
| 監査・コンプライアンス要件は？ | **なし**（個人利用ツール） |
| 過去状態の復元は？ | OS のゴミ箱送り・Markdown ファイル自体の存在で代替 |
| 採用？ | **不採用**（MVP も将来も） |

将来「ノートの編集履歴を時系列で見る」機能を導入する場合のみ、Note Aggregate に対して限定的な Event Sourcing を再検討する。

---

## 未解決の問い

- **`SaveNoteRequested` の重複制御**：idle トリガと blur トリガが連続発火した場合、Vault 側で de-duplicate するか、Capture 側で抑制するか？
  - 推奨：Capture 側で「直前に save したばかりなら抑制」する短時間の lockout
- **`PastNoteSelected` 時の編集中ノートの扱い**：未保存の編集セッションが残っている状態で別の過去ノートを選択したら？
  - 推奨：先に現セッションの blur save を強制実行（同期的に `SaveNoteRequested` を発行 → 完了待ち → 次のセッション開始）
- **`NoteFileSaved` の `previousFrontmatter` 取得方法**：Vault は永続化前の値を持っていない可能性。実装上は Capture/Curate が `SaveNoteRequested` の payload に `previousFrontmatter` を含めるか、Vault が書き込み前にファイルを読む
  - 推奨：`SaveNoteRequested` の payload に `previousFrontmatter` を含める（Capture/Curate 側で旧状態を保持しているケースが多い）
- **イベントのバージョニング**：将来 payload 構造が変わったときの互換性。MVP では考慮不要
- **Event の永続化**：MVP では in-memory のみで十分。将来クラッシュ復旧やデバッグ用に append-only ログを取る選択肢
- **`occurredOn` の精度**：ミリ秒で十分か？ 同一ミリ秒の順序が必要なら Sequence 番号併用
- **NoteHydrationFailed の集約方法**：`VaultScanned` の payload に `corruptedFiles: { filePath, reason }[]` を含めて 1 イベントで返すか、ファイルごとに `NoteHydrationFailed` を発行するか
  - 推奨：起動時の hydrate 失敗は前者（`VaultScanned.corruptedFiles[]` に集約）。運用中の単発失敗は後者
