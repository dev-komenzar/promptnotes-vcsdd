# Aggregates

## 設計原則の適用

DDD Distilled の 4 ルールを本プロジェクトに適用：

| ルール | 本プロジェクトでの方針 |
|--------|----------------------|
| Rule 1: 不変条件を境界内で保護 | Note の本文 + frontmatter 同時整合、Feed の表示条件整合性、Vault の設定整合性 |
| Rule 2: 小さく保つ | TagInventory は Read Model に分離、CaptureSession は Aggregate にせず UI 状態に |
| Rule 3: ID 参照 | Feed は Note を `NoteId` で参照、Vault も同様 |
| Rule 4: 結果整合性 | Note 編集 → TagInventory 再計算、Note 削除 → Feed 再描画は Domain Event 経由 |

## 集約一覧

### 1. Note Aggregate（Shared Kernel：Capture / Curate / Vault）

**Root Entity**: `Note`
**ID**: `NoteId` (Value Object)

#### NoteId の衝突回避設計

```
形式: YYYY-MM-DD-HHmmss-SSS[-N]
例:    2026-04-27-153045-218
       2026-04-27-153045-218-1   (衝突発生時)
```

タイムスタンpの＋ミリ秒で衝突を実用上回避。同一ミリ秒で複数生成された場合は `-1`, `-2`... のサフィックスを付与。

**衝突回避の責務**（Phase 7 / F9 で確定）：
- **`Vault.allocateNoteId(preferredTimestamp): NoteId`** が衝突回避を担う
- Capture は新規ノート作成時にまず Vault に ID 割り当てを依頼し、衝突なき NoteId を受け取って `Note.create(id, now)` を呼ぶ
- 理由：ファイル名と NoteId は 1:1 対応するため、ファイルシステム側の状態を知っている Vault が判定するのが自然
- これにより Capture 内のロジックは衝突を意識せず単純なまま保たれる

#### 構成要素

| 要素 | 型 | 役割 |
|------|---|------|
| `id` | `NoteId` | 不変の識別子 |
| `body` | `Body` (VO) | Markdown 本文 |
| `frontmatter` | `Frontmatter` (VO) | YAML メタデータ |

`Frontmatter` の内部構造（VO）:

| フィールド | 型 | 必須 | 説明 |
|----------|---|----|------|
| `tags` | `Tag[]` | ✓（空配列可） | 分類ラベル。重複不可・小文字正規化 |
| `createdAt` | `Timestamp` | ✓ | 不変。生成時刻 |
| `updatedAt` | `Timestamp` | ✓ | `createdAt` 以降 |

`Tag` は `string` の Smart Constructor で：空文字不可・空白文字不可・小文字正規化・先頭 `#` 除去。

#### ビジネス不変条件

1. **id は不変**：作成後に変更不可
2. **createdAt ≤ updatedAt**：時刻の整合
3. **tags の一意性**：同一 Note 内で同名タグは存在しない
4. **空 Note は永続化対象外**：`body` が空文字（または空白のみ）の Note はファイル化されない（Capture 側ルール）
5. **frontmatter と body は同時に存在**：片方だけが破壊された状態は不正

#### 公開操作（Command メソッド）

Note は Shared Kernel なので、操作は呼び出し元 Context により意味が変わる。

| 操作 | 振る舞い | 主な呼び出し Context | 発行 Event |
|------|---------|---------------------|-----------|
| `Note.create(now: Timestamp): Note` | 空ノートを生成。`createdAt = updatedAt = now` | Capture | `NewNoteAutoCreated` |
| `note.editBody(body: Body, now: Timestamp): Note` | 本文更新、`updatedAt = now` | **Capture**（編集セッション中。新規／過去いずれでも） | `NoteBodyEdited`（一過性）／永続化時 `NoteAutoSavedInSession` / `NoteAutoSavedAfterIdle` / `NoteAutoSavedOnBlur` |
| `note.editFrontmatter(patch: FrontmatterPatch, now: Timestamp): Note` | frontmatter 部分更新 | **Capture**（エディタ内 inline 編集）／**Curate**（タグチップ操作） | Capture: `NoteFrontmatterEditedInline` / Curate: `TagChipAddedOnFeed` / `TagChipRemovedOnFeed` |
| `note.addTag(tag: Tag, now: Timestamp): Note` | タグ追加（重複は無視 or エラー） | Curate（チップ）／Capture（YAML 編集） | 上記同様 |
| `note.removeTag(tag: Tag, now: Timestamp): Note` | タグ削除 | Curate（チップ）／Capture（YAML 編集） | 上記同様 |
| `note.isEmpty(): boolean` | 本文が空白のみか判定 | Capture（破棄判断用） | — |
| `note.bodyForClipboard(): string` | クリップボード用に body のみを返す（frontmatter 除外を不変条件として保証） | Capture | — |

#### 他 Aggregate との参照

- **Feed** からは `NoteId` のみで参照される（直接参照禁止）
- **Vault** は `NoteId` をファイル名に対応させる
- **TagInventory** は Note の `frontmatter.tags` をスナップショットで参照

#### 整合性

- **即時整合**：body と frontmatter（同一 Note 内）
- **結果整合**：Feed の表示順序、TagInventory のタグ集計、Vault のファイル状態（Domain Event 経由）

---

### 2. Feed Aggregate（Curate Context）

**Root Entity**: `Feed`
**ID**: 不要（Curate Context 内シングルトン。論理的には `FeedId = "default"` として扱う）

#### 構成要素

| 要素 | 型 | 役割 |
|------|---|------|
| `noteRefs` | `NoteId[]` | 表示候補のノート ID 集合（vault 内の全ノート） |
| `filterCriteria` | `FilterCriteria` (VO) | タグ・frontmatter フィールドの絞り込み条件 |
| `searchQuery` | `SearchQuery` (VO) | フリーテキスト検索条件 |
| `sortOrder` | `SortOrder` (VO) | 既定はタイムスタンプ降順 |

`FilterCriteria` の構造:
```
{
  tags: Tag[]                    // 全件 OR / 同タグ間 OR / 異タグ間 AND（後述）
  frontmatterFields: Map<string, string>  // field → value
}
```

`SearchQuery` の構造:
```
{
  text: string
  scope: 'body+frontmatter' | 'body' | 'frontmatter'  // MVP は 'body+frontmatter'
}
```

`SortOrder`:
```
{ field: 'timestamp'; direction: 'desc' | 'asc' }
```

#### ビジネス不変条件

1. **noteRefs は重複しない**：同一 NoteId は 1 度だけ
2. **絞り込み合成は AND**：`filterCriteria` と `searchQuery` の両方を満たす集合のみ表示
3. **同タグ複数選択は OR**：タグ `A` と `B` を選んだ場合 `A OR B`（直感に合う）。**異種条件間（タグ vs frontmatter フィールド vs search）は AND**
4. **既定ソートはタイムスタンプ降順**：最新が上

#### 公開操作

| 操作 | 振る舞い | 発行 Event |
|------|---------|----------|
| `feed.applyTagFilter(tag: Tag): Feed` | タグ絞り込み追加 | `FeedFilterByTagApplied` |
| `feed.removeTagFilter(tag: Tag): Feed` | タグ絞り込み解除 | `FeedFilterByTagApplied`（更新） |
| `feed.applyFrontmatterFilter(field, value): Feed` | フィールド絞り込み | `FeedFilterByFrontmatterApplied` |
| `feed.clearFilter(): Feed` | フィルタ全解除 | `FeedFilterCleared` |
| `feed.applySearch(query: SearchQuery): Feed` | 検索適用 | `FeedSearchApplied` / `FeedSearchYieldedNoResults` |
| `feed.clearSearch(): Feed` | 検索解除 | `FeedSearchCleared` |
| `feed.sortBy(order: SortOrder): Feed` | ソート変更 | `FeedSortedByTimestamp` |
| `feed.addNoteRef(id: NoteId): Feed` | 新規 Note 出現を反映 | — |
| `feed.removeNoteRef(id: NoteId): Feed` | 削除済み Note を除外 | — |
| `feed.refreshSort(snapshots: NoteSnapshot[]): Feed` | updatedAt 変更を受けて noteRefs をソートし直す（保存後の最上部移動など） | — |
| `feed.computeVisible(snapshots: NoteSnapshot[]): NoteId[]` | フィルタ＋検索＋ソートを適用した可視 ID 列を返す（Pure Function） | — |

#### 他 Aggregate との参照

- **Note** を `NoteId` でのみ参照
- **TagInventory** はフィルタ UI のために参照されるが、Feed 自体は依存しない（UI 層が両方を結合）

#### 整合性

- **即時**：Feed 内のフィルタ・検索・ソート状態
- **結果整合**：
  - `NoteAutoSaved*` / `NoteFrontmatterEdited` / `NoteDeleted` を購読して `noteRefs` を更新
  - `computeVisible` は Pure Function で都度計算（小規模なら問題なし、大規模になればインデックス導入）

---

### 3. TagInventory（Read Model：Curate Context）

**性質**: Note 群からの**投影**。Aggregate ではなく **Read Model** として扱う（Phase 3 の判断）。永続化しない（メモリ上で再構築）。

#### 構成要素

| 要素 | 型 | 役割 |
|------|---|------|
| `entries` | `TagEntry[]` | `{ name: Tag, usageCount: number }` の配列 |
| `lastBuiltAt` | `Timestamp` | 最終再構築時刻 |

#### 不変条件

1. **usageCount > 0**：使用ノートゼロのタグは含まれない（自動消去）
2. **name で一意**：同一タグエントリは 1 つだけ
3. **大文字小文字は正規化済み**：Tag VO の Smart Constructor が保証

#### 操作

| 操作 | 振る舞い | 発行 Event |
|------|---------|----------|
| `TagInventory.buildFromNotes(notes: NoteSnapshot[]): TagInventory` | 起動時の全再集計 | `TagInventoryBuilt` |
| `inventory.applyNoteCreated(note): TagInventory` | 新規 Note 反映 | `TagInventoryUpdated` |
| `inventory.applyNoteFrontmatterEdited(before, after): TagInventory` | タグ増減反映 | `TagInventoryUpdated` |
| `inventory.applyNoteDeleted(note): TagInventory` | 削除によるタグ減算 | `TagInventoryUpdated` |

#### 整合性

- **結果整合**：Curate 内の Domain Event チェーンで Note 永続化後に更新
- **再計算戦略**：MVP では「全ノート再集計」で単純化。ノート数が増えたら増分更新に切り替え

---

### 4. Vault Aggregate（Vault Context）

**Root Entity**: `Vault`
**ID**: `VaultId`（MVP は singleton。将来複数 vault 対応のため明示的に持つ）

#### 構成要素

| 要素 | 型 | 役割 |
|------|---|------|
| `id` | `VaultId` | 識別子 |
| `path` | `VaultPath` (VO) | ファイルシステムパス |
| `status` | `VaultStatus` (VO) | `'unconfigured' \| 'ready' \| 'scanning'` |
| `lastScannedAt` | `Timestamp \| null` | 最終スキャン時刻 |

#### ビジネス不変条件

1. **path が未設定なら status = 'unconfigured'**：保存・削除・スキャン操作は失敗を返す
2. **同時スキャン禁止**：`status = 'scanning'` の間は新たな scan を受け付けない（並行スキャンによる重複エラー回避）
3. **path は実在ディレクトリでなければならない**：configure 時に検証

#### 公開操作

| 操作 | 振る舞い | 発行 Event |
|------|---------|----------|
| `vault.configure(path: VaultPath): Result<Vault>` | path 検証して設定 | `VaultDirectoryConfigured` |
| `vault.scan(): Result<NoteFileSnapshot[]>` | Markdown 走査して snapshot を返す | `VaultScanned` |
| `vault.allocateNoteId(preferredTimestamp): NoteId` | 既存ファイル名と衝突しない NoteId を返す（必要なら `-N` サフィックス付与） | — |
| `vault.saveNote(cmd: SaveNoteCommand): Result<void>` | frontmatter+body を Markdown 化して書き込み | `NoteFileSaved` (内部) / `AutoSaveFailed` |
| `vault.deleteNote(id: NoteId): Result<void>` | OS ゴミ箱へ送る（MVP 採用想定） | `NoteDeleted` / `NoteDeletionFailed` |

#### 他 Aggregate との参照

- **Note** を `NoteId` で参照（ファイル名にマッピング）

#### 整合性

- **即時**：Vault 自体の設定とスキャン状態
- **結果整合**：Capture/Curate の `Note` ドメインモデルとの同期は Domain Event + ACL 経由

---

## Aggregate にしないもの（明示）

### CaptureSession

「アプリ起動 → ノート編集 → `Ctrl+N`」の編集ライフサイクルは、Aggregate にしない。**Capture Context のアプリケーション層が保持する UI 状態**として扱う。

理由:
- 永続化しない（再起動時はリセット）
- ビジネス不変条件は Note Aggregate 側で表現可能
- Aggregate 化するとライフサイクル管理が冗長になる

代わりに Capture アプリケーション層に `EditingSessionState` のような Value Object を持たせる：
```
{
  currentNoteId: NoteId | null
  isDirty: boolean
  lastInputAt: Timestamp | null
  idleTimerHandle: TimerHandle | null
  status: 'idle' | 'editing' | 'saving' | 'switching' | 'save-failed'
  pendingNextNoteId: NoteId | null     // 別ノート選択中 (saving 完了待ち)
  lastSaveResult: 'success' | 'failed' | null   // 直近保存結果（F14）
  lastSaveError: SaveErrorReason | null         // 失敗時の理由
}
```

#### EditingSessionState の遷移（境界ケース対応）

| 現在 | イベント | 遷移先 | 動作 |
|------|---------|-------|------|
| `idle` | `EditorFocusedOnNewNote` / `EditorFocusedOnPastNote` | `editing` | ノート編集開始 |
| `editing` | `NoteBodyEdited` | `editing` | `isDirty=true`, idle timer 起動 |
| `editing` | `AutoSaveOnIdle` / `AutoSaveOnBlur` | `saving` | `SaveNoteRequested` 発行、応答待機 |
| `saving` | `NoteFileSaved` | `editing` （or `idle` if blur 完結） | `isDirty=false` |
| `saving` | `NoteSaveFailed` | `editing` | `isDirty=true` 保持、UI 警告 |
| `editing` | `SelectPastNote(N)`（別ノート選択） | `switching` | blur save を強制発火 → `pendingNextNoteId=N` |
| `switching` | `NoteFileSaved` | `editing(N)` | 新セッション開始（`StartEditingSession(N)`） |
| `switching` | `NoteSaveFailed` | `save-failed` | 切替を中止し、`lastSaveResult='failed'`、UI が選択肢モーダル表示（破棄/再試行/キャンセル） |
| `editing` | `SelectPastNote(N)` かつ `note.isEmpty()` | `editing(N)` | `EmptyNoteDiscarded`、即座に切替 |
| `save-failed` | `RetrySave` | `saving` | 再度 `SaveNoteRequested` |
| `save-failed` | `DiscardCurrentSession` | `editing(pendingNextNoteId)` or `idle` | 編集内容破棄、必要なら次セッション開始 |
| `save-failed` | `CancelSwitch` | `editing(currentNoteId)` | 切替キャンセル、現編集を継続 |

これにより「保存中に別ノート切替」の境界ケースが正しく扱える。

### NoteSnapshot（DTO/VO）

Vault が `scan()` で返す型。永続化された Note の読み取り表現。Curate 側で `Note` Aggregate に変換される（ACL 責務）。

---

## Anemic Domain Model チェック

各 Aggregate がビジネス判断を持っているか確認:

| Aggregate | ビジネス判断 |
|-----------|------------|
| Note | 空判定（破棄対象か）、updatedAt 整合、tag 重複防止、frontmatter スキーマ検証 |
| Feed | フィルタ + 検索 + ソートの合成ロジック、可視ノート計算 |
| TagInventory | 未使用タグの自動除外、増分計算 |
| Vault | path 検証、並行スキャン抑制、書き込み失敗のエラー型決定 |

→ いずれもビジネス判断を内包しており、Anemic ではない。

## 整合性の時系列例

ノート編集→保存→Feed 再描画→TagInventory 更新の流れ：

```
1. User edits past note's frontmatter (add tag "draft")
2. Note.editFrontmatter() returns new Note instance ──→ event: PastNoteFrontmatterEdited
3. Vault.saveNote() writes file ─────────────────────→ event: NoteFileSaved (or AutoSaveFailed)
4. Curate listens NoteFileSaved:
   a. Feed updates noteRefs / re-sorts ─────────────→ event: (internal feed refresh)
   b. TagInventory.applyNoteFrontmatterEdited() ────→ event: TagInventoryUpdated
5. UI re-renders feed list with new tag chip
```

すべて結果整合性。1 トランザクション = 1 Aggregate（Rule 4）を遵守。

---

## 未解決の問い

- **frontmatter の MVP 固定スキーマ確定**：tags / createdAt / updatedAt は確定。「source app」「model name」「status」を加えるか？ → Phase 8 (glossary) で決定推奨
- **空 Note 判定の細部**：空白のみ・改行のみは「空」とみなすか？（推奨：trim 後 empty とみなす）
- **タグ正規化の厳密さ**：日本語タグの全角半角・絵文字は許可？
- **Feed の「未保存変更を持つ Note」表示**：Capture 編集中の Note は Feed 上でどう見えるか？（推奨：最上部の特別行として常に表示、未保存マーク付き）
- **Vault scan の並行性**：MVP は単一スキャンで十分。将来 fs watch 導入時に再考
- **NoteFileSnapshot と Note Aggregate のマッピング失敗**（不正な YAML、必須フィールド欠落）：エラー Note としてフィードに出すか、無視するか
- **編集中のノートを削除する操作の境界**（Phase 7 で発見）：編集中なら削除無効化、または「blur save → セッション終了 → 削除」の順を強制する設計のいずれを採るか
- **検索結果のハイライトは UI/Read Model 責務**であり Feed Aggregate には含まない（Phase 7 で確認）
