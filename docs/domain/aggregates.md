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

**衝突回避の責務**（Phase 7 / F9 で確定、Phase 1c F-001 で 2 層分離）：

NoteId 割り当ては **pure helper** と **effectful Vault method** の 2 層で構成する：

| 層 | シグネチャ | 性質 | 検証方法 |
|----|-----------|------|---------|
| Pure helper | `nextAvailableNoteId(preferred: Timestamp, existingIds: ReadonlySet<NoteId>): NoteId` | 純粋関数。同一入力 → 同一出力。副作用なし | fast-check（property: 戻り値 ∉ `existingIds`、suffix 付与の決定性） |
| Effectful Vault method | `vault.allocateNoteId(now: Timestamp): NoteId` | Vault Aggregate の内部 NoteId 集合を読み取り、`nextAvailableNoteId` に委譲 | example-based test（モック state） |

- Capture は新規ノート作成時に **Vault method** を呼び、衝突なき NoteId を受け取って `Note.create(id, now)` を呼ぶ
- 理由：ファイル名と NoteId は 1:1 対応するため、ファイルシステム側の状態を知っている Vault が判定するのが自然
- 純粋性境界：衝突回避ロジックそのものは pure helper に閉じ込め、Vault state 読み取りは Aggregate method の責務として明確に分離する。これにより property test は pure helper のみを対象にできる

#### 構成要素

| 要素 | 型 | 役割 |
|------|---|------|
| `id` | `NoteId` | 不変の識別子 |
| `blocks` | `Block[]` (順序つき) | 本文を構成するブロックの並び。各ブロックは独立した編集単位 |
| `frontmatter` | `Frontmatter` (VO) | YAML メタデータ |

`body: Body` は `blocks` から派生する読み取り専用プロパティ（`note.body = serializeBlocksToMarkdown(blocks)`）として提供する。Vault への保存・クリップボードコピー・検索の入力として利用する。

#### Block（Note 内の Sub-entity）

discovery.md のブロックベース WYSIWYG エディタ方針に基づき、Note の本文は単一文字列ではなく**順序つきの Block 列**として表現する。Block は Note Aggregate の境界内に閉じる **Sub-entity** であり、独立した Aggregate ではない（理由：ライフサイクルは常に親 Note と一蓮托生で、永続化単位も親 Note 単位）。

| 要素 | 型 | 役割 |
|------|---|------|
| `id` | `BlockId` (VO) | Note 内ローカルな安定 ID（並べ替え・差分計算用） |
| `type` | `BlockType` | ブロック種別（後述） |
| `content` | `BlockContent` (VO) | ブロック内のインラインテキスト（インライン Markdown 含む） |

`BlockId` は Note 内で一意。形式は実装詳細（UUID v4 または `block-<n>`）。永続化時は Markdown 文字列に直列化されるため、ファイル上には現れない（再読み込み時に再採番）。

`BlockType` の MVP セット：

| 種別 | Markdown 表現 | 説明 |
|------|--------------|------|
| `paragraph` | `テキスト` | 通常の段落 |
| `heading-1` | `# テキスト` | レベル 1 見出し |
| `heading-2` | `## テキスト` | レベル 2 見出し |
| `heading-3` | `### テキスト` | レベル 3 見出し |
| `bullet` | `- テキスト` | 箇条書き（フラット、ネスト未対応） |
| `numbered` | `1. テキスト` | 番号付きリスト |
| `code` | ` ```lang\n...\n``` ` | コードブロック（言語識別子オプション） |
| `quote` | `> テキスト` | 引用 |
| `divider` | `---` | 区切り線（content は空） |

将来拡張：チェックリスト・テーブル・埋め込み・ネスト構造（Logseq 風）。MVP 範囲外。

`BlockContent` は Smart Constructor で：制御文字拒否・改行除去（複数行はブロック分割で表現）。`code` ブロックは例外として複数行を許容する（VO 内部で別バリアント）。

##### Block の不変条件

1. **id は Note 内で一意**：同一 BlockId が同一 Note に複数存在しない
2. **type と content の整合**：`divider` は常に空 content。`code` は複数行可。それ以外は単一行
3. **空 paragraph は許容**：編集中の中間状態として、空の段落ブロックは存在しうる（ただし全ブロックが空の場合は Empty Note として破棄対象）

##### Block 操作（Note Aggregate のメソッドとして公開）

| 操作 | 振る舞い |
|------|---------|
| `note.editBlockContent(blockId, content, now)` | 指定ブロックの content を更新。`updatedAt = now` |
| `note.insertBlockAfter(prevBlockId, type, content, now)` | 指定ブロックの直後に新規ブロック挿入（Enter キー相当） |
| `note.insertBlockAtBeginning(type, content, now)` | 先頭に挿入 |
| `note.removeBlock(blockId, now)` | ブロック削除。最後の 1 ブロックは削除不可（空 paragraph に置換） |
| `note.mergeBlockWithPrevious(blockId, now)` | 行頭 Backspace 相当：前ブロックと content を結合し、自身を削除 |
| `note.splitBlock(blockId, offset, now)` | テキスト中央 Enter 相当：offset で content を 2 分し、後半を新規 paragraph として直後に挿入 |
| `note.changeBlockType(blockId, newType, now)` | 種別変換（`# ` 入力で heading-1 へ等）。content は保持 |
| `note.moveBlock(blockId, toIndex, now)` | 並べ替え（drag & drop） |

すべての操作は不変 Note インスタンスを返す（既存の `editBody` と同じスタイル）。

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
4. **空 Note は永続化対象外**：全ブロックが空（または `divider` のみ）の Note はファイル化されない（Capture 側ルール）。判定は `note.isEmpty()` が担う
5. **frontmatter と blocks は同時に存在**：片方だけが破壊された状態は不正
6. **blocks は最低 1 ブロックを保持**：新規 Note 生成直後は空 `paragraph` 1 ブロックがプレースホルダとして存在する（Empty Note 判定とは独立）
7. **Block の id は Note 内で一意**（Block 不変条件 1）

#### 公開操作（Command メソッド）

Note は Shared Kernel なので、操作は呼び出し元 Context により意味が変わる。

| 操作 | 振る舞い | 主な呼び出し Context | 発行 Event |
|------|---------|---------------------|-----------|
| `Note.create(now: Timestamp): Note` | 空ノートを生成。`createdAt = updatedAt = now`、`blocks = [empty paragraph]` | Capture | `NewNoteAutoCreated` |
| `note.editBlockContent(blockId, content, now): Note` | 指定ブロックの content を更新、`updatedAt = now` | **Capture**（編集セッション中、ブロック単位の入力） | `BlockContentEdited`（一過性）／永続化時 `NoteAutoSaved*` |
| `note.insertBlockAfter(prevId, type, content, now): Note` | ブロック挿入（Enter 相当） | Capture | `BlockInserted` |
| `note.removeBlock(blockId, now): Note` | ブロック削除（最後の 1 ブロックは空 paragraph に置換） | Capture | `BlockRemoved` |
| `note.mergeBlockWithPrevious(blockId, now): Note` | 前ブロックと結合（行頭 Backspace 相当） | Capture | `BlocksMerged` |
| `note.splitBlock(blockId, offset, now): Note` | ブロック分割（中央 Enter 相当） | Capture | `BlockSplit` |
| `note.changeBlockType(blockId, newType, now): Note` | 種別変換（`# ` 入力等） | Capture | `BlockTypeChanged` |
| `note.moveBlock(blockId, toIndex, now): Note` | 並べ替え | Capture | `BlockMoved` |
| `note.editFrontmatter(patch: FrontmatterPatch, now: Timestamp): Note` | frontmatter 部分更新 | **Capture**（エディタ内 inline 編集）／**Curate**（タグチップ操作） | Capture: `NoteFrontmatterEditedInline` / Curate: `TagChipAddedOnFeed` / `TagChipRemovedOnFeed` |
| `note.addTag(tag: Tag, now: Timestamp): Note` | タグ追加（重複は無視 or エラー） | Curate（チップ）／Capture（YAML 編集） | 上記同様 |
| `note.removeTag(tag: Tag, now: Timestamp): Note` | タグ削除 | Curate（チップ）／Capture（YAML 編集） | 上記同様 |
| `note.isEmpty(): boolean` | 全ブロックが空（または divider のみ）か判定 | Capture（破棄判断用） | — |
| `note.body: Body` | `blocks` を Markdown 直列化した派生プロパティ。検索・コピー・保存の入力 | Capture / Curate / Vault | — |
| `note.bodyForClipboard(): string` | クリップボード用に `note.body` を返す（frontmatter 除外を不変条件として保証） | Capture | — |

> **互換性ノート**：旧 API `note.editBody(body: Body, now)` は MVP 移行期に「`body` 文字列を Markdown→Block[] 変換して全ブロックを置換する操作」として残す可能性があるが、ブロックエディタが完成すれば削除候補。新規実装はブロック単位の操作（`editBlockContent` 等）のみを使う。

#### 他 Aggregate との参照

- **Feed** からは `NoteId` のみで参照される（直接参照禁止）
- **Vault** は `NoteId` をファイル名に対応させる
- **TagInventory** は Note の `frontmatter.tags` をスナップショットで参照

#### 整合性

- **即時整合**：blocks と frontmatter（同一 Note 内）。ブロック操作は常に Note Aggregate のメソッド経由で行われ、Aggregate 境界内で完結する
- **結果整合**：Feed の表示順序、TagInventory のタグ集計、Vault のファイル状態（Domain Event 経由）

##### Note ↔ Markdown の双方向変換

`blocks: Block[]` と Markdown 文字列の変換は **純粋関数** として ACL 層に置かれる：

| 関数 | シグネチャ | 性質 |
|------|-----------|------|
| `serializeBlocksToMarkdown` | `Block[] → string` | 純粋。Block 列を Markdown に直列化 |
| `parseMarkdownToBlocks` | `string → Result<Block[], ParseError>` | 純粋。Markdown を Block 列に解析（既知の構造のみ。未知ブロックは `paragraph` 化で逃がす） |

ラウンドトリップ性質：
- `parseMarkdownToBlocks(serializeBlocksToMarkdown(b)) == b`（Block ID は新規採番されるため、ID を除いた構造一致）
- `serializeBlocksToMarkdown(parseMarkdownToBlocks(m)) ≈ m`（外見上の差異は許容。例：行末スペース・複数空行の正規化）

完全な byte 一致は保証しない理由：Obsidian 等の外部編集との共存のため、フォーマットの細かい差異を保ったままにすることは諦める。代わりに「**意味上同値**」を不変条件とする。

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
| `vault.allocateNoteId(now: Timestamp): NoteId` | 内部 NoteId 集合を読み取り、pure helper `nextAvailableNoteId(now, existingIds)` に委譲。衝突時は `-N` サフィックス | — |
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
  focusedBlockId: BlockId | null         // 現在キャレットを保持しているブロック（at most one）
  isDirty: boolean
  lastInputAt: Timestamp | null
  idleTimerHandle: TimerHandle | null
  status: 'idle' | 'editing' | 'saving' | 'switching' | 'save-failed'
  pendingNextFocus: { noteId: NoteId; blockId: BlockId } | null  // 別ノート選択中 (saving 完了待ち)
  lastSaveResult: 'success' | 'failed' | null   // 直近保存結果（F14）
  lastSaveError: SaveErrorReason | null         // 失敗時の理由
}
```

> ブロックベース UI 化で `focusedBlockId` を追加した。同一 Note 内のブロック間カーソル移動はセッションを終了させない（`status` は `editing` のまま `focusedBlockId` のみ更新）。別ノートのブロックへフォーカスが移った瞬間に `switching` 遷移を経由する。

#### EditingSessionState の遷移（境界ケース対応）

| 現在 | イベント | 遷移先 | 動作 |
|------|---------|-------|------|
| `idle` | `BlockFocused(noteId, blockId)`（新規 or 過去いずれでも） | `editing` | `currentNoteId=noteId`, `focusedBlockId=blockId` |
| `editing` | `BlockFocused(sameNoteId, otherBlockId)` | `editing` | `focusedBlockId` のみ更新。**セッション継続**（idle timer も継続） |
| `editing` | `BlockContentEdited` / `BlockInserted` / `BlockRemoved` / `BlocksMerged` / `BlockSplit` / `BlockTypeChanged` / `BlockMoved` | `editing` | `isDirty=true`, idle timer 起動／再スタート |
| `editing` | `AutoSaveOnIdle` / `AutoSaveOnBlur` | `saving` | `SaveNoteRequested` 発行、応答待機 |
| `saving` | `NoteFileSaved` | `editing` （or `idle` if blur 完結） | `isDirty=false` |
| `saving` | `NoteSaveFailed` | `editing` | `isDirty=true` 保持、UI 警告 |
| `editing` | `BlockFocused(otherNoteId, blockId)`（別ノートのブロック） | `switching` | blur save を強制発火 → `pendingNextFocus={otherNoteId, blockId}` |
| `switching` | `NoteFileSaved` | `editing(otherNoteId, blockId)` | 新セッション開始 |
| `switching` | `NoteSaveFailed` | `save-failed` | 切替を中止し、`lastSaveResult='failed'`、UI が選択肢モーダル表示（破棄/再試行/キャンセル） |
| `editing` | `BlockFocused(otherNoteId, blockId)` かつ `note.isEmpty()` | `editing(otherNoteId, blockId)` | `EmptyNoteDiscarded`、即座に切替 |
| `editing` | `EditorBlurredAllBlocks`（全ブロックからフォーカス外） | `saving` → `idle` | blur save 完結後 idle |
| `save-failed` | `RetrySave` | `saving` | 再度 `SaveNoteRequested` |
| `save-failed` | `DiscardCurrentSession` | `editing(pendingNextFocus)` or `idle` | 編集内容破棄、必要なら次セッション開始 |
| `save-failed` | `CancelSwitch` | `editing(currentNoteId, focusedBlockId)` | 切替キャンセル、現編集を継続 |

これにより：

- **同一ノート内のブロック間カーソル移動はセッションを切らない**（`switching` を経由しない）
- **別ノートのブロックへ移った瞬間のみ** save flush が走る
- 「保存中に別ノートのブロックへフォーカス」の境界ケースが正しく扱える

### NoteSnapshot（DTO/VO）

Vault が `scan()` で返す型。永続化された Note の読み取り表現。Curate 側で `Note` Aggregate に変換される（ACL 責務）。

---

## Anemic Domain Model チェック

各 Aggregate がビジネス判断を持っているか確認:

| Aggregate | ビジネス判断 |
|-----------|------------|
| Note | 空判定（全ブロック空か）、ブロック構造管理（split/merge/最後の 1 ブロック保持等）、updatedAt 整合、tag 重複防止、frontmatter スキーマ検証 |
| Feed | フィルタ + 検索 + ソートの合成ロジック、可視ノート計算 |
| TagInventory | 未使用タグの自動除外、増分計算 |
| Vault | path 検証、並行スキャン抑制、書き込み失敗のエラー型決定、Markdown↔Block 変換の起動 |

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
- **空 Note 判定の細部**：全ブロックが空 paragraph、または divider のみで構成される Note は「空」と扱う（推奨）。`code` ブロックの空内容は空扱いとするか保持するか
- **タグ正規化の厳密さ**：日本語タグの全角半角・絵文字は許可？
- **Feed の「未保存変更を持つ Note」表示**：Capture 編集中の Note は Feed 上でどう見えるか？（推奨：その場で in-place 編集中、未保存マーク付き。最上部固定はせず通常の時系列位置に出す）
- **Vault scan の並行性**：MVP は単一スキャンで十分。将来 fs watch 導入時に再考
- **NoteFileSnapshot と Note Aggregate のマッピング失敗**（不正な YAML、必須フィールド欠落、ブロック化不能な構造）：エラー Note としてフィードに出すか、無視するか
- **編集中のノートを削除する操作の境界**（Phase 7 で発見）：編集中なら削除無効化、または「blur save → セッション終了 → 削除」の順を強制する設計のいずれを採るか
- **検索結果のハイライトは UI/Read Model 責務**であり Feed Aggregate には含まない（Phase 7 で確認）
- **BlockId の永続化戦略**：MVP は再読み込み時に再採番（永続化しない）。将来コラボ編集や undo を入れる際は安定 ID をファイルにコメントとして埋め込む選択肢
- **Block ネスト構造**：MVP はフラット。Logseq 風のアウトライン階層を導入するかは将来課題
- **インラインフォーマット**（太字・コード・リンク）の表現：BlockContent 内の Markdown 文字列として保持するか、構造化トークン列にするか
