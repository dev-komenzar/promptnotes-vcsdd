# 新セッション用プロンプト：型契約のブロックベース化

> このファイルは新規セッションで貼り付けて使うプロンプト一式。コピペ後そのまま実行可能。

---

## ゴール

`docs/domain/code/ts/src/` 配下の型契約（canonical machine-readable spec）を、前コミット 9ffd312 で導入された **ブロックベース WYSIWYG エディタ・ドメインモデル** に整合させる。本セッションでは **型契約のみ** を更新し、`.vcsdd/features/*` の各 feature spec と `promptnotes/` 実装の更新は行わない（後続セッションで feature ごとに実施）。

## 前提状態

- ブランチ：`feature/inplace-edit-migration`（mainから分岐済み）
- 直近コミット `9ffd312 docs: ブロックベース WYSIWYG エディタを採用するためドメインモデルを更新` で **散文ドキュメントは移行済み**：
  - `docs/domain/aggregates.md` — Note は `blocks: Block[]`、`body: Body` は派生プロパティ
  - `docs/domain/glossary.md` — Block / BlockId / BlockType / BlockContent / serializeBlocksToMarkdown / parseMarkdownToBlocks 追加
  - `docs/domain/domain-events.md` `event-storming.md` — `BlockFocused` `BlockBlurred` `BlockContentEdited` `BlockInserted` `BlockRemoved` `BlocksMerged` `BlockSplit` `BlockTypeChanged` `BlockMoved` を追加（`EditorFocusedOnNewNote/PastNote` を `BlockFocused` に統合）
  - `docs/domain/{bounded-contexts,context-map,workflows,ui-fields,validation,discovery}.md` 整合済み
- **型契約 (`docs/domain/code/ts/src/`) は未更新** — 多くの VCSDD feature spec がこれを Source of truth として参照しているため、ここを先に整える必要がある。

## ドメインモデル要点（必読・参照順）

1. `docs/domain/aggregates.md` §1 Note Aggregate — Note の構成、Block sub-entity 不変条件、ブロック操作 API、`serializeBlocksToMarkdown` / `parseMarkdownToBlocks` の純粋関数ペア
2. `docs/domain/glossary.md` §0〜§4 — Block 系語彙、Internal/Public イベント区分、Shared Kernel 範囲（Block も Shared Kernel に含む）
3. `docs/domain/domain-events.md` — Block 系 Internal イベント、`SaveNoteRequested` payload は Note 全体スナップショット（blocks 含む、差分は載せない）
4. `docs/domain/workflows.md` — Workflow 2 (CaptureAutoSave) / Workflow 3 (EditPastNoteStart) の Block Focus 単位への再定義
5. `docs/domain/ui-fields.md` — WYSIWYG / contenteditable・ツールバーなし・インライン編集

## 更新対象ファイル

### Shared Kernel（最優先・他が依存）

| ファイル | 変更内容 |
|---|---|
| `docs/domain/code/ts/src/shared/value-objects.ts` | `BlockId`, `BlockType`, `BlockContent` の VO と Smart Constructor、`BlockIdError` / `BlockContentError` を追加。`Body` は維持（派生プロパティとして） |
| `docs/domain/code/ts/src/shared/note.ts` | `Note.body: Body` → `Note.blocks: Block[]`、`Note.body` を getter/派生型として表現。`Block` 型をエクスポート。`NoteOps` から `editBody` を削除し、ブロック操作群（`editBlockContent`, `insertBlockAfter`, `insertBlockAtBeginning`, `removeBlock`, `mergeBlockWithPrevious`, `splitBlock`, `changeBlockType`, `moveBlock`）を追加。`isEmpty` / `bodyForClipboard` の意味を blocks 派生に書き換え。`serializeBlocksToMarkdown` / `parseMarkdownToBlocks` を別ファイル（後述）または本ファイル末尾でエクスポート。**互換性ノート**：`editBody(note, body, now)` は移行期暫定で残す可能性は aggregates.md §1 に記載 — TODO コメントで明示し、実装時に削除候補とする |
| `docs/domain/code/ts/src/shared/snapshots.ts` | `NoteFileSnapshot.body: Body` をどう扱うか決定。**推奨**：Vault からの読み出しはファイル上の Markdown 文字列なので `body: Body` は現状維持（Hydration 時に `parseMarkdownToBlocks` で blocks に変換）。コメントで「ファイル境界では Markdown 文字列、Aggregate 境界内では blocks」と明記 |
| `docs/domain/code/ts/src/shared/events.ts` | Public/Internal イベントの整理。`SaveNoteRequested` payload に blocks スナップショット（または derived body）を含めるか確認（domain-events.md §SaveNoteRequested に従う）。`EditorFocusedOnNewNote/PastNote` 系の旧 internal を削除（または capture/internal-events.ts に移管）し、必要なら `BlockFocused` の Public 露出を否定（Internal のまま） |
| **新規** `docs/domain/code/ts/src/shared/blocks.ts`（任意） | `serializeBlocksToMarkdown(blocks: Block[]): string` / `parseMarkdownToBlocks(markdown: string): Result<Block[], ParseError>` の純粋関数シグネチャ。`ParseError` 型もここに |

### Capture Context

| ファイル | 変更内容 |
|---|---|
| `capture/internal-events.ts` | Block 系 Internal イベント（`BlockFocused`, `BlockBlurred`, `BlockContentEdited`, `BlockInserted`, `BlockRemoved`, `BlocksMerged`, `BlockSplit`, `BlockTypeChanged`, `BlockMoved`）を追加。各 payload に `noteId`, `blockId`, 必要に応じ `before/after content` を含める。旧 `EditorFocusedOnNewNote/PastNote` を削除し `BlockFocused` に統合（glossary.md §1 通り） |
| `capture/commands.ts` | `EditNoteBody` 系ではなくブロック操作コマンド：`EditBlockContent`, `InsertBlock`, `RemoveBlock`, `MergeBlocks`, `SplitBlock`, `ChangeBlockType`, `MoveBlock`, `FocusBlock`. `CopyNoteBody` は維持 |
| `capture/states.ts` | `EditingState` に `focusedBlockId: BlockId \| null` を追加（Block Focus 境界を実装するため）。`EditingSessionState` の `editing` バリアントも同様 |
| `capture/stages.ts` | `DirtyEditingSession` / `ValidatedSaveRequest` / `SerializedMarkdown` の中間型は **blocks 経由で組み立てる** ことを明示。`serializeNote(note)` の入力が blocks ベース Note になる |
| `capture/workflows.ts` | `CaptureAutoSave` / `CopyBody` / `EditPastNoteStart` 各型シグネチャを Block Focus / blocks に整合。具体ロジックは型シグネチャと docstring レベルのみ更新（実装は Phase 11+） |
| `capture/ports.ts` | 変更必要があるか確認（`ClipboardWrite` 等は文字列で OK のはず） |

### Curate Context

| ファイル | 変更内容 |
|---|---|
| `curate/aggregates.ts` | `Feed` / `FilterCriteria` / `SearchQuery` の `body+frontmatter` 検索範囲が **派生 Body**（`serializeBlocksToMarkdown(blocks)`）であることをコメントで明記。型自体は変更不要見込み |
| `curate/internal-events.ts` `commands.ts` `ports.ts` `read-models.ts` `stages.ts` `workflows.ts` | 影響箇所を grep で洗い出し、`body` 直接参照があれば派生プロパティ経由に書き換え。`TagChipUpdate` / `DeleteNote` 等 Note 全体を扱うパスは Block 化の影響を受けない見込み |

### Errors

| ファイル | 変更内容 |
|---|---|
| `shared/errors.ts` | `ParseError`（Markdown→Blocks 解析失敗）を追加。Hydration では `parseMarkdownToBlocks` の失敗を `corruptedFiles` に分類するか、未知ブロックは `paragraph` で逃がす（aggregates.md §1.5 invariant）方針に従い `ParseError` の用途を限定 |

### Simulations（シナリオテスト）

| ファイル | 変更内容 |
|---|---|
| `simulations/_mock.ts` | `mockNote(...)` ヘルパが blocks 入力を取れるように。旧 `body` 引数は互換のため受け付け、内部で `parseMarkdownToBlocks` するか同等の方便を用意 |
| `simulations/01_app_startup.spec.ts` | Hydration の挙動：snapshot.body → blocks 変換が走ることを assert するシナリオを追加（または既存をリネーム） |
| `simulations/03_capture_auto_save.spec.ts` | Save パスが `serializeBlocksToMarkdown(blocks)` を経由することを assert |
| `simulations/04_edit_past_note_start.spec.ts` | Block Focus 単位の switch シナリオへ更新（同一 Note 内 Block 移動 vs 別 Note 移動の区別） |
| `simulations/05_apply_filter_search.spec.ts` | 検索対象が派生 Body であることを示す test を追加 |
| `simulations/_assert.ts` | 必要なら blocks 等価性ヘルパを追加 |
| **新規** `simulations/10_blocks_roundtrip.spec.ts`（任意） | `parseMarkdownToBlocks ∘ serializeBlocksToMarkdown` のラウンドトリップ性質を simulation 化 |

### Rust 側

Rust 型契約は `vault/` 配下のみで `body` への直接参照はファイル境界の `NoteFileSnapshot` 相当のみ。本セッションでは **Rust は触らない**（vault context は file/path 中心で blocks 化の影響範囲外、必要があれば後続で対応）。`docs/domain/code/rust/src/snapshots.rs` `value_objects.rs` などにある `Body` 参照はファイル境界での Markdown 文字列扱いなので維持で OK。

## ガードレール / 出さない手

- **VCSDD feature spec (`/.vcsdd/features/*`) は触らない** — feature ごとの spec 改訂は新セッションで `/vcsdd-spec` を使って実施
- **`promptnotes/` 配下の実装も触らない** — 型契約と実装の差分は別タスク
- **`docs/domain/*.md` の散文も触らない** — 9ffd312 で完了済み。差分が見つかった場合は型契約を docs に合わせる（docs を真とする）
- **互換性のための `editBody` を実装で残さない**：型契約上は削除する。aggregates.md §1 の互換性ノートはあくまで実装移行期の言及であり、canonical 型契約には新 API のみを置く
- **コミットは fine-grained に**：Shared Kernel → Capture → Curate → Errors → Simulations の順で論理単位ごとに commit。各コミットメッセージは CLAUDE.md の形式（問題/原因/修正、5行以内）に従う

## 進め方（推奨ワークフロー）

1. **Plan モードで開始**（CLAUDE.md ワークフロー設計 1）
2. **Serena MCP でシンボル探索**（CLAUDE.md ワークフロー設計 2、`mcp__serena__initial_instructions` を最初に呼ぶ）
3. 以下の順で TaskCreate にタスク登録し、1 タスクずつ in_progress → completed
   1. Shared Kernel: `value-objects.ts` に Block 系 VO 追加
   2. Shared Kernel: `note.ts` を blocks ベースへ移行
   3. Shared Kernel: 新規 `blocks.ts`（または note.ts 内）に純粋関数ペア追加
   4. Shared Kernel: `snapshots.ts` `events.ts` `errors.ts` の整合
   5. Capture: `internal-events.ts` に Block 系イベント追加・旧イベント削除
   6. Capture: `commands.ts` `states.ts` `stages.ts` `workflows.ts` `ports.ts` を整合
   7. Curate: `body` 参照箇所を派生プロパティ経由のコメント注記＋必要箇所の型修正
   8. Simulations: `_mock.ts` から順に書き換え／追加
4. 各論理単位ごとに `tsc --noEmit`（または該当の型検査）を流して整合確認
5. 影響を受ける VCSDD feature の引き継ぎノートを `docs/tasks/feature-impact.md` に書き出し（後続セッションでの spec 改訂作業の入り口）

## 完了基準

- [ ] `docs/domain/code/ts/src/` 内の **TypeScript 型コンパイルが通る**（既存 simulations 含む）
- [ ] `Note` は `blocks: Block[]` を持ち、`body` は派生プロパティ
- [ ] `Block` / `BlockId` / `BlockType` / `BlockContent` の VO がエクスポートされている
- [ ] `serializeBlocksToMarkdown` / `parseMarkdownToBlocks` のシグネチャが定義されている
- [ ] `BlockFocused` 等の Block 系 Internal イベントが capture/internal-events.ts に揃っている
- [ ] `editBody` が NoteOps から削除され、ブロック操作群に置換されている
- [ ] simulations の各テストが新しい型で書き換わっている（パス可否は実装フェーズで確認）
- [ ] 論理単位ごとの commit が積まれ、`feature/inplace-edit-migration` ブランチが push 済み

## 影響を受ける VCSDD features（参考・本セッションでは触らない）

後続セッションで `/vcsdd-spec` 改訂が必要な features：

**強く影響：** `ui-editor`, `capture-auto-save`, `edit-past-note-start`, `copy-body`, `app-startup`, `handle-save-failure`
**中程度：** `ui-feed-list-actions`, `apply-filter-or-search`
**影響なし見込み：** `delete-note`, `tag-chip-update`, `configure-vault`, `ui-app-shell`, `ui-filter-search`, `ui-tag-chip`

## 起動コマンド（コピペ用）

```
@.vcsdd/migration/type-contract-prompt.md の手順で型契約を更新してください。
まず Plan モードで進め方を整理してから着手すること。
```
