# Workflows — ワークフロー設計

生成日: 2026-04-27
前提フェーズ: storming ✓ / contexts ✓ / mapping ✓ / aggregates ✓ / events ✓ / validate ✓ / glossary ✓

DMMF（Scott Wlaschin）の「ワークフローをパイプラインとして設計する」原則に従う：

- 入力データに段階的変換を通すたびに信頼水準が上がる
- ステージ間の中間型を別々に分け、コンパイラが「どの段階で何が保証されているか」を強制
- 副作用（I/O）はパイプラインの境界に寄せ、中間は純粋関数
- エラーは `Result<Ok, Err>` で表現、例外は使わない

## 実装対象ワークフロー一覧（優先度順）

| # | 名前 | Bounded Context | 優先度 | 性質 | 詳細設計 |
|---|------|----------------|------|------|----------|
| 1 | **AppStartup** | Vault → Curate → Capture | 高 | 同期、起動時 1 回 | ✅ |
| 2 | **CaptureAutoSave** | Capture → Vault | 高 | 同期、頻発 | ✅ |
| 3 | **EditPastNoteStart** | Curate → Capture | 高 | 同期、編集セッション切替 | ✅ |
| 4 | **TagChipUpdate** | Curate → Vault | 中 | 同期、軽量更新 | ✅ |
| 5 | **DeleteNote** | Curate → Vault | 中 | 同期、確認モーダル経由 | ✅ |
| 6 | **CopyBody** | Capture | 高 | 同期、Pure 寄り | 概要のみ |
| 7 | **ApplyFilterOrSearch** | Curate | 中 | 同期、Pure | 概要のみ |
| 8 | **HandleSaveFailure** | Capture | 中 | 同期、UI 介入 | 概要のみ |
| 9 | **ConfigureVault** | Vault | 高 | 同期、初回のみ | 概要のみ |
| 10 | **BlockEdit** | Capture | 高 | 同期、Pure（メモリ更新のみ） | 概要のみ |

未実装決定：なし（全 MVP）

---

## Workflow 1: AppStartup（Vault → Curate → Capture）

### 概要

- **発動契機**: アプリプロセス起動
- **最終出力**: `Result<InitialUIState, AppStartupError>`
- **性質**: 同期、起動時 1 回。失敗時は設定誘導 UI を表示

### ステージ（中間型の系列）

```
RawAppLaunch → ConfiguredVault → ScannedVault → HydratedFeed → InitialUIState
```

| ステージ | この型が保証すること |
|---------|------------------|
| `RawAppLaunch` | プロセスは起動した。何も保証されない |
| `ConfiguredVault` | `VaultPath` が読み取り可能なディレクトリとして実在 |
| `ScannedVault` | `NoteFileSnapshot[]` と `corruptedFiles[]` が揃った（raw な YAML パース後） |
| `HydratedFeed` | 全 snapshot が `Note` Aggregate に変換済み（壊れファイルは除外）、Feed と TagInventory が構築済み |
| `InitialUIState` | 上記 + 最上部の新規ノートが `Note.create` で生成され、編集セッションが `editing` 状態 |

### ステップ

#### Step 1: `loadVaultConfig`

| 項目 | 内容 |
|------|------|
| 入力 | `RawAppLaunch` |
| 出力 | `Result<ConfiguredVault, VaultConfigError>` |
| 責務 | 永続化された VaultPath 設定を読み、ディレクトリ実在を検証 |
| 依存 | `Settings.load(): Result<VaultPath \| null>`、`FileSystem.statDir(path): Result<bool>` |
| 副作用 | read-only |
| エラー | `Unconfigured`（path 未設定）、`PathNotFound`、`PermissionDenied` |
| 発行 Event | `VaultDirectoryNotConfigured`（`Unconfigured` 時のみ） |

> **`VaultDirectoryConfigured` は AppStartup では発火しない**：このイベントは `ConfigureVault`（Workflow 9）が、ユーザーの path 設定操作に対して発火する責務。AppStartup の正常系（既存設定が有効）では発火しない。因果整合性（domain-events.md §因果整合性）では `VaultDirectoryConfigured` **または既存設定** が `VaultScanned` の前提として認められている。

#### Step 2: `scanVault`

| 項目 | 内容 |
|------|------|
| 入力 | `ConfiguredVault` |
| 出力 | `Result<ScannedVault, ScanError>` |
| 責務 | vault 直下の `*.md` 走査、各ファイル読み込み + YAML パース |
| 依存 | `FileSystem.listMarkdown(path): Result<string[]>`、`FileSystem.readFile(path): Result<string>`、`FrontmatterParser.parse(raw): Result<{body, fm}>` |
| 副作用 | read-only（fs read） |
| エラー | ディレクトリ全体の listing 失敗のみ `ScanError`（ワークフロー全体失敗）。**ファイル単位の失敗は `corruptedFiles[]` に蓄積し、ワークフロー全体は失敗にしない。** 各 `CorruptedFile` は `ScanFileFailure` で出所を区別する：`{kind:'read', fsError}`（`readFile` 失敗）または `{kind:'hydrate', reason: HydrationFailureReason}`（`parser.parse` 失敗、または snapshot → Note の変換失敗）。 |
| 発行 Event | なし（次ステップの後で `VaultScanned` を発行） |

#### Step 3: `hydrateFeed`

| 項目 | 内容 |
|------|------|
| 入力 | `ScannedVault` |
| 出力 | `HydratedFeed = { feed: Feed, tagInventory: TagInventory, corruptedFiles: CorruptedFile[] }` |
| 責務 | snapshot を Note Aggregate に変換（**Markdown body → Block[] パースを含む**）、Feed と TagInventory を構築 |
| 依存 | `parseMarkdownToBlocks(body): Result<Block[], BlockParseError>`（純粋） |
| 副作用 | none（pure） |
| エラー | なし（壊れファイルは corruptedFiles に逃がし、Feed には含めない）。Block パース失敗（既知の構造に解析できない極端なケース）は HydrationFailureReason `'block-parse'` として corruptedFiles 行きにする |
| 発行 Event | `VaultScanned(snapshots, corruptedFiles)`、`NotesHydrated`、`FeedRestored`、`TagInventoryBuilt` |

#### Step 4: `initializeCaptureSession`

| 項目 | 内容 |
|------|------|
| 入力 | `HydratedFeed` |
| 出力 | `InitialUIState` |
| 責務 | 新規ノートを `Note.create`（`blocks = [empty paragraph]`）し、Vault に `allocateNoteId` してもらい、EditingSessionState を `editing(noteId, focusedBlockId=先頭ブロック)` に |
| 依存 | `Clock.now(): Timestamp`、`Vault.allocateNoteId(now): NoteId` |
| 副作用 | none（NoteId 割り当ては Vault 内 in-memory 計算） |
| エラー | なし |
| 発行 Event | `NewNoteAutoCreated`、`BlockFocused(noteId, firstBlockId)` |

### 依存（ポート）

| 名前 | 型 | 実装元 | 同期/非同期 | 使用ステップ |
|------|----|-------|-----------|-----------|
| `Settings.load` | `() → Result<VaultPath \| null>` | OS 設定ストア（Electron なら `app.getPath('userData')` 配下） | sync | loadVaultConfig |
| `FileSystem.statDir` | `string → Result<bool>` | OS fs | sync (or async) | loadVaultConfig |
| `FileSystem.listMarkdown` | `VaultPath → Result<string[]>` | OS fs | sync | scanVault |
| `FileSystem.readFile` | `string → Result<string>` | OS fs | sync | scanVault |
| `FrontmatterParser.parse` | `string → Result<{body, fm}, HydrationFailureReason>` | OSS（gray-matter 等） | sync (pure) | scanVault |
| `parseMarkdownToBlocks` | `string → Result<Block[], BlockParseError>` | 自前（純粋関数。MVP は最小ブロック種に対応） | sync (pure) | hydrateFeed |
| `Clock.now` | `() → Timestamp` | OS time | sync (purity-violating) | initializeCaptureSession |
| `Vault.allocateNoteId` | `Timestamp → NoteId` | Vault Aggregate method（effectful: 内部 NoteId 集合を読む） | sync | initializeCaptureSession |
| `nextAvailableNoteId` | `(Timestamp, ReadonlySet<NoteId>) → NoteId` | Pure helper（副作用なし、property test 対象） | pure | initializeCaptureSession（`Vault.allocateNoteId` 内部から呼ばれる） |

### エラーカタログ

```ts
type AppStartupError =
  | { kind: 'config'; reason: VaultConfigError }
  | { kind: 'scan'; reason: ScanError }

type VaultConfigError =
  | { kind: 'unconfigured' }
  | { kind: 'path-not-found'; path: string }
  | { kind: 'permission-denied'; path: string }

type ScanError =
  | { kind: 'list-failed'; detail: string }

// 個別ファイルの失敗は ScanError ではなく corruptedFiles[] に蓄積される
type ScanFileFailure =
  | { kind: 'read'; fsError: FsError }                  // readFile 失敗（permission/lock/not-found 等）
  | { kind: 'hydrate'; reason: HydrationFailureReason } // parser.parse / snapshot→Note 変換失敗
```

UI マッピング：

| エラー | UI 反応 |
|--------|--------|
| `Unconfigured` | 設定誘導モーダル：「保存先フォルダを選択してください」 |
| `PathNotFound` | 「設定したフォルダが見つかりません。再設定するか、フォルダを復元してください」 |
| `PermissionDenied` | 「フォルダへのアクセス権限がありません」 |
| corruptedFiles ≥ 1 | フィード上部に黄色バナー：「N 件の破損ファイルがあります」+ 詳細リンク |

### 副作用の配置

```
loadVaultConfig    [read I/O: settings, fs.stat]
     ↓
scanVault          [read I/O: fs.listdir, fs.readFile]
     ↓
hydrateFeed        [pure]
     ↓
initializeCapture  [Clock + in-memory NoteId 計算]
```

### 関係するワークフロー

- 下流：すべての他ワークフローは AppStartup 完了後にしか動かない
- 上流：なし

### 未解決の問い

- vault に大量ファイル（数千件）があるときの起動時間 — Phase 7 の保留項目
- Settings 永続化の実装手段（Electron の electron-store / OS のレジストリ等）

---

## Workflow 2: CaptureAutoSave（Capture → Vault）

最も頻発する Core ワークフロー。idle save と blur save の両方が同じパイプラインを通す。

### 概要

- **発動契機**: `NoteAutoSavedAfterIdle`（debounce ~2s）または `NoteAutoSavedOnBlur`（フォーカスアウト＝全ブロックブラー）
- **最終出力**: `Result<SavedNoteAck, SaveError>`
- **性質**: 同期、頻発（数秒に 1 回）。**ブロック単位の編集を蓄積し、Note 単位で Markdown 直列化して保存する**

### ステージ

```
DirtyEditingSession → ValidatedSaveRequest → SerializedMarkdown → PersistedNote → IndexedNote
```

| ステージ | 保証 |
|---------|-----|
| `DirtyEditingSession` | `isDirty=true` で、`currentNoteId` と現在の `Block[]` / frontmatter スナップショットを保持 |
| `ValidatedSaveRequest` | blocks・frontmatter が整合（updatedAt ≥ createdAt、tag 重複なし、blocks の不変条件、`isEmpty()` でない or 空ノート許容モード） |
| `SerializedMarkdown` | YAML frontmatter + `serializeBlocksToMarkdown(blocks)` の連結文字列（Obsidian 互換フォーマット） |
| `PersistedNote` | ファイルが書き込まれた、または失敗が判明 |
| `IndexedNote` | Curate の Feed と TagInventory が更新済み |

### ステップ

#### Step 1: `prepareSaveRequest`

| 項目 | 内容 |
|------|------|
| 入力 | `DirtyEditingSession` |
| 出力 | `Result<ValidatedSaveRequest, SaveValidationError>` |
| 責務 | EditingSessionState から現在の Note Aggregate を取り出し、不変条件（Note + Block 不変条件）を最終確認 |
| 依存 | `Clock.now(): Timestamp`（updatedAt 更新用） |
| 副作用 | pure（時刻取得のみ） |
| エラー | `EmptyBodyOnIdleSave`（`note.isEmpty()=true` で idle save の場合は EmptyNoteDiscarded ルートへ）、`InvariantViolated` |
| 発行 Event | （Empty 時のみ）`EmptyNoteDiscarded` |

#### Step 2: `serializeNote`

| 項目 | 内容 |
|------|------|
| 入力 | `ValidatedSaveRequest` |
| 出力 | `SerializedMarkdown` |
| 責務 | `serializeBlocksToMarkdown(blocks)` で本文 Markdown 文字列を生成し、frontmatter を YAML 化、`---\n{yaml}\n---\n{body}` 形式に直列化 |
| 依存 | `FrontmatterSerializer.toYaml(fm): string`、`serializeBlocksToMarkdown(blocks): string` |
| 副作用 | none（pure） |
| エラー | なし（VO の不変条件で valid は保証済み） |
| 発行 Event | なし |

#### Step 3: `writeMarkdown`

| 項目 | 内容 |
|------|------|
| 入力 | `SerializedMarkdown` + `NoteId` |
| 出力 | `Result<PersistedNote, SaveError>` |
| 責務 | 物理ファイル書き込み。原子的書き込み（一時ファイル → rename）が望ましい |
| 依存 | `FileSystem.writeFileAtomic(path, content): Result<void>` |
| 副作用 | **write I/O**（境界） |
| エラー | `Permission`、`DiskFull`、`Lock`、`Unknown` |
| 発行 Event | 成功：`NoteFileSaved(noteId, body, frontmatter, previousFrontmatter)`、失敗：`NoteSaveFailed(noteId, reason)` |

#### Step 4: `updateProjections`

| 項目 | 内容 |
|------|------|
| 入力 | `PersistedNote` |
| 出力 | `IndexedNote` |
| 責務 | Curate 内で Feed.refreshSort と TagInventory.applyDelta を実行 |
| 依存 | なし（メモリ上の Curate 状態を変更） |
| 副作用 | in-memory write（Curate Read Model 更新） |
| エラー | なし |
| 発行 Event | `TagInventoryUpdated`（タグ差分があった場合のみ） |

### 依存（ポート）

| 名前 | 型 | 実装元 | 同期性 | 使用ステップ |
|------|----|-------|-------|-----------|
| `Clock.now` | `() → Timestamp` | OS time | sync | prepareSaveRequest |
| `FrontmatterSerializer.toYaml` | `Frontmatter → string` | OSS or 自前 | pure | serializeNote |
| `serializeBlocksToMarkdown` | `Block[] → string` | 自前（純粋関数） | pure | serializeNote |
| `FileSystem.writeFileAtomic` | `(string, string) → Result<void, FsError>` | OS fs | sync (or async) | writeMarkdown |

### エラーカタログ

```ts
type SaveError =
  | { kind: 'validation'; reason: SaveValidationError }
  | { kind: 'fs'; reason: FsError }

type SaveValidationError =
  | { kind: 'empty-body-on-idle' }   // Empty Note を save しようとした
  | { kind: 'invariant-violated'; detail: string }

type FsError =
  | { kind: 'permission' }
  | { kind: 'disk-full' }
  | { kind: 'lock' }
  | { kind: 'unknown'; detail: string }
```

UI マッピング：

| エラー | UI 反応 |
|--------|--------|
| `empty-body-on-idle` | サイレント（破棄パスへ） |
| `invariant-violated` | 内部バグ：エラーログ + サイレント |
| `permission` / `disk-full` / `lock` | 保存失敗バナー：再試行ボタン付き、`EditingSessionState.status='save-failed'` |

### 発行イベント

| Event | タイミング | Consumer |
|-------|---------|---------|
| `EmptyNoteDiscarded` | prepareSaveRequest が空判定 | Curate（暫定行を消す）、Capture（編集状態リセット） |
| `NoteFileSaved` | writeMarkdown 成功 | Capture（isDirty=false）、Curate（Feed/TagInventory 更新） |
| `NoteSaveFailed` | writeMarkdown 失敗 | Capture（status='save-failed'、UI 警告） |
| `TagInventoryUpdated` | updateProjections でタグ差分検出 | Curate UI（フィルタ UI 更新） |

### 副作用の配置

```
prepareSaveRequest [Clock のみ]
       ↓
serializeNote      [pure]
       ↓
writeMarkdown      [write I/O — 境界]
       ↓
updateProjections  [in-memory write — Curate]
```

### 未解決の問い

- 同一 Note への idle save と blur save が連続発火した場合の重複保存抑制（推奨：Capture が直前 save から N ms 以内ならスキップ）
- writeFileAtomic の実装方針（Node.js の `fs.rename` ベース）

---

## Workflow 3: EditPastNoteStart（Curate → Capture）

過去ノートのブロックがクリック／フォーカスされて編集セッションを開始する。境界ケースを正しく扱う重要ワークフロー。

> ブロックベース UI（discovery.md）採用後は、過去ノートも常に in-place で編集可能なため「専用の選択モード」は存在しない。発動契機はクリック／キーボードでの **Block Focus 取得** そのもの。

### 概要

- **発動契機**: `BlockFocused(noteId, blockId)` が Curate から発行（過去ノートのブロックへフォーカスが入った瞬間）
- **最終出力**: `Result<NewSession, SwitchError>`
- **性質**: 同期。現セッション（別ノートの場合）の flush を含むため、CaptureAutoSave のサブパイプラインを呼ぶ

### ステージ

```
BlockFocusRequest → CurrentSessionDecision → FlushedCurrentSession → NewSession
```

| ステージ | 保証 |
|---------|-----|
| `BlockFocusRequest` | フォーカス対象の `{noteId, blockId}` と現 Note snapshot が手元にある |
| `CurrentSessionDecision` | 現在の編集セッションが `no-current` / `same-note` / `empty` / `dirty` のいずれかに分類済み |
| `FlushedCurrentSession` | 同一 Note への移動なら no-op、別 Note なら CaptureAutoSave を完了し、または Empty なら破棄、その結果 `idle` 状態 |
| `NewSession` | 選択された Note が `editing(noteId, blockId)` 状態の新（または継続）セッション |

### ステップ

#### Step 1: `classifyCurrentSession`

| 項目 | 内容 |
|------|------|
| 入力 | `BlockFocusRequest{noteId, blockId}` + 現在の `EditingSessionState` |
| 出力 | `CurrentSessionDecision = 'no-current' \| 'same-note' \| 'empty' \| 'dirty'` |
| 責務 | 現セッションが flush 必要かを判定。`same-note` は同一 Note 内のブロック間移動で、flush 不要 |
| 依存 | なし |
| 副作用 | none（pure） |
| エラー | なし |
| 発行 Event | なし |

#### Step 2: `flushCurrentSession`

| 項目 | 内容 |
|------|------|
| 入力 | `CurrentSessionDecision` |
| 出力 | `Result<FlushedCurrentSession, SaveError>` |
| 責務 | 分類に従って空ノート破棄 or blur save 強制発火（`CaptureAutoSave` を呼び出す） |
| 依存 | `CaptureAutoSave` ワークフロー |
| 副作用 | write I/O（save する場合） |
| エラー | `SaveError`（CaptureAutoSave から伝播） |
| 発行 Event | `EmptyNoteDiscarded` または `NoteFileSaved` / `NoteSaveFailed` |

⚠️ **失敗時の遷移**: SaveError が起きたら EditingSessionState を `save-failed` に遷移し、新セッション開始は **行わない**（UI が破棄/再試行/キャンセル選択肢を提示）。

#### Step 3: `startNewSession`

| 項目 | 内容 |
|------|------|
| 入力 | `FlushedCurrentSession` + `BlockFocusRequest{noteId, blockId}` + 対象 Note snapshot |
| 出力 | `NewSession` |
| 責務 | （別ノートの場合）snapshot を Note Aggregate にハイドレートし、EditingSessionState を `editing(noteId, focusedBlockId=blockId)` に。同一ノート内移動なら `focusedBlockId` のみ更新 |
| 依存 | なし |
| 副作用 | in-memory write（EditingSessionState 更新） |
| エラー | なし（snapshot は既に Curate 側でハイドレート済みのものが渡される前提） |
| 発行 Event | `BlockFocused(noteId, blockId)` |

### エラーカタログ

```ts
type SwitchError =
  | { kind: 'save-failed-during-switch'; underlying: SaveError; pendingNextNoteId: NoteId }
```

### 副作用の配置

```
classifyCurrentSession [pure]
        ↓
flushCurrentSession    [write I/O if dirty - 境界]
        ↓
startNewSession        [in-memory write]
```

### 未解決の問い

- 「保存中に別のノードに切り替え要求が来た」場合（`status='saving'` 中の `PastNoteSelected`）の挙動 — 推奨：`pendingNextNoteId` をキューに入れて、現 save 完了後に処理。複数キューイングは MVP で考慮しない（最後のリクエストのみ採用）

---

## Workflow 4: TagChipUpdate（Curate → Vault）

エディタを開かずにタグを追加/削除する軽量更新パイプライン。

### 概要

- **発動契機**: `TagChipAddedOnFeed(noteId, tag)` または `TagChipRemovedOnFeed(noteId, tag)`
- **最終出力**: `Result<IndexedNote, SaveError>`
- **性質**: 同期、軽量（debounce 不要、即時保存）

### ステージ

```
TagChipCommand → MutatedNote → ValidatedSaveRequest → PersistedNote → IndexedNote
```

| ステージ | 保証 |
|---------|-----|
| `TagChipCommand` | 操作種別（add/remove）と対象 noteId、対象 tag が確定 |
| `MutatedNote` | Note Aggregate のタグ操作が適用済み（`note.addTag` / `note.removeTag`）、不変条件を満たす |
| `ValidatedSaveRequest` | `previousFrontmatter` 含む完全な保存リクエスト |
| `PersistedNote` / `IndexedNote` | （CaptureAutoSave と同じ後段） |

### ステップ

#### Step 1: `loadCurrentNote`

| 項目 | 内容 |
|------|------|
| 入力 | `TagChipCommand` |
| 出力 | `Note`（Curate が保持する最新 snapshot から復元） |
| 責務 | フィード上の Note 表現を取得 |
| 依存 | `Curate.getNoteSnapshot(noteId): Note` |
| 副作用 | in-memory read |
| エラー | なし（フィードに無い ID は呼び出し側のバグ） |

#### Step 2: `applyTagOperation`

| 項目 | 内容 |
|------|------|
| 入力 | `Note` + `TagChipCommand` |
| 出力 | `MutatedNote = { note: Note, previousFrontmatter: Frontmatter }` |
| 責務 | Note Aggregate の `addTag` / `removeTag` を呼ぶ |
| 依存 | `Clock.now()` |
| 副作用 | none（不変オブジェクト返却） |
| エラー | なし（重複 add は idempotent、不在 remove も idempotent） |

#### Step 3〜5: CaptureAutoSave の後段を再利用

`serializeNote` → `writeMarkdown` → `updateProjections` を共通呼び出し。

`SaveNoteRequested.source = 'curate-tag-chip'` で発行。

### 副作用の配置

```
loadCurrentNote     [in-memory read]
       ↓
applyTagOperation   [pure]
       ↓
serializeNote       [pure]            ← 共通
       ↓
writeMarkdown       [write I/O]       ← 共通
       ↓
updateProjections   [in-memory write] ← 共通
```

### 未解決の問い

- タグ追加 UI で「既存タグから選ぶ」のオートコンプリート → TagInventory を読んで候補を出す。Workflow 自体は変わらない

---

## Workflow 5: DeleteNote（Curate → Vault）

### 概要

- **発動契機**: `NoteDeletionConfirmed`（モーダル確定）
- **最終出力**: `Result<UpdatedFeed, DeletionError>`
- **性質**: 同期、ユーザー確認後に実行

### ステージ

```
DeletionConfirmed → AuthorizedDeletion → TrashedFile → UpdatedProjection
```

| ステージ | 保証 |
|---------|-----|
| `DeletionConfirmed` | ユーザーが確認モーダルで OK を押した |
| `AuthorizedDeletion` | 編集中ではない（編集中なら UI 層で削除ボタン無効化されているはず）、対象 NoteId が Feed 内に存在 |
| `TrashedFile` | OS ゴミ箱送り完了、または失敗が判明 |
| `UpdatedProjection` | Feed と TagInventory が更新済み |

### ステップ

#### Step 1: `authorizeDeletion`

| 項目 | 内容 |
|------|------|
| 入力 | `DeletionConfirmed { noteId }` |
| 出力 | `Result<AuthorizedDeletion, AuthorizationError>` |
| 責務 | 対象が編集中でないこと、Feed 内に存在することを確認 |
| 依存 | `EditingSessionState.currentNoteId`、`Feed.hasNote(noteId)` |
| 副作用 | in-memory read |
| エラー | `EditingInProgress`（防御的、UI 層で防いでいる前提）、`NoteNotInFeed` |

#### Step 2: `trashFile`

| 項目 | 内容 |
|------|------|
| 入力 | `AuthorizedDeletion` |
| 出力 | `Result<TrashedFile, FsError>` |
| 責務 | OS ゴミ箱に送る |
| 依存 | `FileSystem.trashFile(path): Result<void>` |
| 副作用 | **write I/O（trash）** |
| エラー | `Permission`、`Lock`、`NotFound`、`Unknown` |
| 発行 Event | 成功：`NoteFileDeleted(noteId, frontmatter)`、失敗：`NoteDeletionFailed` |

#### Step 3: `updateProjectionsAfterDelete`

| 項目 | 内容 |
|------|------|
| 入力 | `TrashedFile` |
| 出力 | `UpdatedProjection` |
| 責務 | Feed.removeNoteRef、TagInventory.applyNoteDeleted |
| 依存 | なし |
| 副作用 | in-memory write |
| エラー | なし |
| 発行 Event | `TagInventoryUpdated`（タグ usageCount が変動した場合） |

### エラーカタログ

```ts
type DeletionError =
  | { kind: 'authorization'; reason: AuthorizationError }
  | { kind: 'fs'; reason: FsError }

type AuthorizationError =
  | { kind: 'editing-in-progress'; noteId: NoteId }
  | { kind: 'not-in-feed'; noteId: NoteId }
```

UI マッピング：

| エラー | UI 反応 |
|--------|--------|
| `editing-in-progress` | 防御的、内部ログ + 「編集を終了してから削除してください」 |
| `not-in-feed` | 内部バグ警告 |
| `fs.permission` / `lock` | 「削除に失敗しました（権限）」バナー、再試行ボタン |
| `fs.not-found` | 既に削除済み扱いで Feed から外す（warning ログ） |

### 副作用の配置

```
authorizeDeletion           [in-memory read]
       ↓
trashFile                   [write I/O — 境界]
       ↓
updateProjectionsAfterDelete [in-memory write]
```

---

## 概要のみのワークフロー

### Workflow 6: CopyBody（Capture）

- 発動：`CopyNoteBody` Command
- ステージ：`Note → ClipboardText`
- ステップ：`note.bodyForClipboard()` → `Clipboard.write(text)`
- 依存：`Clipboard.write(string): Result<void>`
- 副作用：write I/O（OS clipboard）
- 発行 Event：`NoteBodyCopiedToClipboard`
- エラー：clipboard 書き込み失敗（極稀）

### Workflow 7: ApplyFilterOrSearch（Curate）

- 発動：フィルタ／検索 UI 操作
- ステージ：`UnvalidatedFilterInput → AppliedFilter → VisibleNoteIds`
- ステップ：`Feed.applyTagFilter()` 等 → `Feed.computeVisible(snapshots)`
- 依存：なし（純粋）
- 副作用：none
- エラー：なし（UI 入力は VO 化で正規化）

### Workflow 8: HandleSaveFailure（Capture）

- 発動：`status='save-failed'` 状態でユーザーが選択肢を選ぶ
- ステージ：`SaveFailedState → UserDecision → ResolvedState`
- 分岐：
  - `RetrySave` → CaptureAutoSave を再実行
  - `DiscardCurrentSession` → 編集破棄、`pendingNextNoteId` があれば次セッション開始
  - `CancelSwitch` → `editing(currentNoteId)` に戻る
- 副作用：分岐先による
- 発行 Event：`RetrySaveRequested` または `EditingSessionDiscarded`

### Workflow 9: ConfigureVault（Vault）

- 発動：設定誘導モーダルでフォルダ選択
- ステージ：`UserSelectedPath → ValidatedPath → PersistedConfig`
- ステップ：`FileSystem.statDir` → `Settings.save(path)` → `Vault.configure(path)`
- 副作用：read I/O（stat）+ write I/O（settings）
- 発行 Event：`VaultDirectoryConfigured`
- 失敗後：AppStartup の Step 2 (scanVault) に続く

### Workflow 10: BlockEdit（Capture、メモリ内）

ブロック WYSIWYG エディタ上で発生するキー入力・編集操作を Note Aggregate のメソッド呼び出しに変換する**メモリ内のみ**のパイプライン。永続化は行わず、`isDirty` を立てて Workflow 2（CaptureAutoSave）の発火を待つ。

- 発動：エディタ DOM のキー入力・クリック・drag & drop 等
- ステージ：`UnvalidatedBlockCommand → ValidatedBlockCommand → MutatedNote → UpdatedSessionState`
- 主要 Command（discriminated union）：
  - `EditBlockContent { noteId, blockId, content }`（キー入力）
  - `InsertBlockAfter { noteId, prevBlockId, type, content }`（Enter / `/` メニュー）
  - `RemoveBlock { noteId, blockId }`
  - `MergeBlockWithPrevious { noteId, blockId }`（行頭 Backspace）
  - `SplitBlock { noteId, blockId, offset }`（テキスト中央 Enter）
  - `ChangeBlockType { noteId, blockId, newType }`（`# ` 入力等）
  - `MoveBlock { noteId, blockId, toIndex }`（drag & drop）
- ステップ：
  1. UI 入力を `Unvalidated*` Command へラップ（DOM Input イベント等から構築）
  2. Smart Constructor 経由で `BlockContent` / `BlockType` を Brand 化（Validated）
  3. Note Aggregate のメソッド呼び出し（`note.editBlockContent` 等）で新 Note インスタンス生成
  4. EditingSessionState を更新：`isDirty=true`、`focusedBlockId` をフォーカス遷移先へ、idle timer 起動／再スタート
- 依存：`Clock.now`（updatedAt）、Note Aggregate（メモリ）
- 副作用：none（永続化なし。すべて in-memory）
- エラー：`BlockContentError`（VO 拒否）、`BlockOperationError`（最後の 1 ブロック削除等）
- 発行 Event：`BlockContentEdited` / `BlockInserted` / `BlockRemoved` / `BlocksMerged` / `BlockSplit` / `BlockTypeChanged` / `BlockMoved`（すべて Internal）

**永続化との関係**：本ワークフローは Workflow 2 の前段として常時動いている。idle timer 満了で Workflow 2 が発火し、その時点の `Block[]` 全体が直列化されてファイルに書かれる。**ブロック単位の差分は永続化されず、Note 単位のフルリプレース**。

**境界ケース**：
- IME 入力中（composition イベント）は `BlockContentEdited` を発火しない（composition end まで遅延）
- 連続キー入力でも Note インスタンスは毎回新規生成（不変）。パフォーマンスが問題になればバッチング検討

---

## 依存（ポート）一覧（全ワークフロー共通）

| ポート | 型シグネチャ | 同期性 | 使うワークフロー |
|-------|-----------|-------|---------------|
| `Settings.load` | `() → Result<VaultPath \| null>` | sync | AppStartup |
| `Settings.save` | `VaultPath → Result<void>` | sync | ConfigureVault |
| `FileSystem.statDir` | `string → Result<bool>` | sync | AppStartup, ConfigureVault |
| `FileSystem.listMarkdown` | `VaultPath → Result<string[]>` | sync | AppStartup |
| `FileSystem.readFile` | `string → Result<string>` | sync | AppStartup |
| `FileSystem.writeFileAtomic` | `(string, string) → Result<void>` | sync | CaptureAutoSave, TagChipUpdate |
| `FileSystem.trashFile` | `string → Result<void>` | sync | DeleteNote |
| `FrontmatterParser.parse` | `string → Result<{body, fm}, HydrationFailureReason>` | pure | AppStartup |
| `FrontmatterSerializer.toYaml` | `Frontmatter → string` | pure | CaptureAutoSave, TagChipUpdate |
| `parseMarkdownToBlocks` | `string → Result<Block[], BlockParseError>` | pure | AppStartup（hydrate） |
| `serializeBlocksToMarkdown` | `Block[] → string` | pure | CaptureAutoSave, TagChipUpdate, CopyBody |
| `Clock.now` | `() → Timestamp` | sync | 多数 |
| `Vault.allocateNoteId` | `Timestamp → NoteId` | sync (effectful: Vault state read) | AppStartup, NewNote |
| `nextAvailableNoteId` | `(Timestamp, ReadonlySet<NoteId>) → NoteId` | pure | AppStartup, NewNote（`Vault.allocateNoteId` 内部） |
| `Clipboard.write` | `string → Result<void>` | sync | CopyBody |
| `EventBus.publish` | `Event → void` | sync | 全ワークフロー |

すべて単一プロセス、同期で実装可能（OS の async fs を使うとしても Promise でラップする程度）。

---

## エラーカタログ統合

各ワークフローのエラーを横断整理。共通エラー型を抽出。

```ts
// 共通基底
type FsError =
  | { kind: 'permission'; path?: string }
  | { kind: 'disk-full' }
  | { kind: 'lock'; path?: string }
  | { kind: 'not-found'; path?: string }
  | { kind: 'unknown'; detail: string }

type HydrationFailureReason =
  | 'yaml-parse'
  | 'missing-field'
  | 'invalid-value'
  | 'unknown'

// ワークフロー個別
type AppStartupError = ...
type SaveError = ...
type SwitchError = ...
type DeletionError = ...
```

**UI 表示の総合方針**：
- システムエラー（`unknown`、`fs.lock`）は技術的詳細をログに記録、UI は短く「保存に失敗しました」
- ドメインエラー（`unconfigured`、`empty-body-on-idle`）は具体的な誘導 UI（モーダル、サイレント破棄）
- 復旧可能エラー（`disk-full`、`permission`）は再試行 UI を提供

---

## ワークフロー間の関係図

```
[App Startup]
     │
     ├─ initial UI ready
     │
     ↓ (常時)
[Capture Auto Save]──────[Tag Chip Update]
     │   │                     │
     │   └→ NoteFileSaved ─→ Feed/TagInventory 更新
     │
[Edit Past Note Start]
     │
     ├─→ flush current ──→ (CaptureAutoSave 呼び出し)
     │                       │
     │              成功 → 新セッション開始
     │              失敗 → [Handle Save Failure]
     │                          │
     │                          ├─ RetrySave → CaptureAutoSave 再実行
     │                          ├─ Discard → 新セッション開始
     │                          └─ Cancel  → 元のセッション維持
     │
[Delete Note]
     │
     └→ NoteFileDeleted ─→ Feed/TagInventory 更新
```

---

## 共通パターンの識別

1. **ステージ末尾の `updateProjections`** が CaptureAutoSave / TagChipUpdate / DeleteNote で共通。Curate 側 Read Model 更新の責務として抽出可能。
2. **エラーパターン**：すべてのワークフローで `Result<Ok, Err>` の OR 型を使う。FsError は共通基底として再利用。
3. **副作用配置パターン**：すべてのワークフローが「上流: read I/O → 中間: pure → 下流: write I/O」のオニオン構造。
4. **EventBus への発行は最後**：write I/O の成否が判明してから対応 Event を発行。これにより「発行はしたが書き込まれていない」状態を避ける。

---

## フィードバック（他フェーズへの差し戻し提案）

| 発見 | 差し戻し先 | 内容 |
|------|----------|------|
| `Settings.load` / `Settings.save` ポート | aggregates.md | Vault Aggregate に Settings の読み書きが暗黙に依存 → 明示するか、Settings を別 VO として切り出す |
| `FileSystem.writeFileAtomic` の原子性要件 | bounded-contexts.md | Vault Context のユビキタス言語に「Atomic Write」を追加推奨 |
| `EditingSessionState` の `pendingNextNoteId` キューイング戦略 | aggregates.md | 複数の switch 要求が saving 中に来た場合の挙動（最後のみ採用 vs キュー） |
| 共通 `updateProjections` ステップ | aggregates.md / glossary.md | Curate Read Model 更新の責務として用語を新設するか検討（"Projection Update" 等） |
| ワークフロー横断の Event Bus 仕様 | context-map.md | in-process EventEmitter で良いか、既存 lib（mitt 等）を採用するか |

---

## 未解決の問い（ワークフロー固有）

- **保存中の別ノート切替リクエスト**：複数キューイング vs 最後のみ採用。MVP は最後のみで進める
- **Idle save の重複抑制ロックアウト時間**：MVP は ~500ms 程度を想定
- **大量ファイル（1000+）時の AppStartup 性能**：MVP は同期で十分、必要なら chunked async に
- **EventBus 実装ライブラリ**：mitt / RxJS / 自前 EventEmitter（最終決定は実装フェーズ）
- **`writeFileAtomic` 実装**：tmp file → rename パターンか、OS によっては fsync が必要か
- **TagInventory の差分計算 vs 全再計算**：MVP は全再計算で問題ないが、N=1000+ なら増分必須
