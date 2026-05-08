# 型契約のブロックベース化に伴う feature spec 影響表

> 本ファイルは `feature/inplace-edit-migration` ブランチで型契約 (`docs/domain/code/ts/src/`)
> をブロックベース WYSIWYG モデルへ移行した結果、各 VCSDD feature の spec が
> どの程度影響を受けるかをまとめた **後続セッション向けの引き継ぎノート** である。

## 背景

- 直前のコミット `9ffd312`：散文ドキュメント (`docs/domain/*.md`) のブロックベース化
- 本セッションのコミット群（`feature/inplace-edit-migration` 上）：
  - `update(domain): block ベース型契約への shared kernel 移行`
  - `update(domain): capture context をブロックベース API に整合`
  - `docs(domain): curate context の派生 body 注記を追加`
  - `test(domain): シミュレーションをブロックベース型契約に追従`

主な型契約変更：

| 領域 | 変更内容 |
|------|---------|
| Shared Kernel | `BlockId`/`BlockType`/`BlockContent` 追加、`Note.blocks: Block[]`、`NoteOps.editBody` 削除→ブロック操作 8 メソッドへ、`shared/blocks.ts` 新規（`serializeBlocksToMarkdown`/`parseMarkdownToBlocks`） |
| Public Events | `SaveNoteRequested` / `NoteFileSaved` payload に `blocks` 追加（`body` は派生として維持）、`PastNoteSelected` に `blockId` 追加 |
| Snapshots / Errors | `NoteFileSnapshot.body` は維持（ファイル境界）、`HydrationFailureReason` に `block-parse` 追加、`SwitchError.pendingNextNoteId` → `pendingNextFocus: { noteId, blockId }` |
| Capture | Internal Event を Block 系 9 種に再編成（旧 `EditorFocused*` / `NoteBodyEdited` を統合）、Command を Block 操作 8 種＋`FocusBlock` に分解、`EditingState.focusedBlockId` 追加、`SwitchingState.pendingNextFocus`、`PastNoteSelection` → `BlockFocusRequest` |
| Curate | コメントのみ（SearchScope 派生 body 注記、HydrateNote の `parseMarkdownToBlocks` 注記） |

---

## feature 別影響度

### 強く影響（spec の Behavioral Spec / Test Cases / Stage 図に Block 概念を組み込む必要あり）

#### `ui-editor`
- **何が変わるか**：エディタ全体がブロックベース contenteditable 群へ。Block Focus 単位でフォーカス管理、`/` メニュー、ブロック種変換、Enter/Backspace 挙動。
- **参照すべき型契約**：`shared/note.ts` の `Block` / `NoteOps`、`capture/commands.ts` の Block 操作系コマンド、`capture/internal-events.ts` の Block 系 Internal Events。
- **推奨アクション**：spec を全面改訂。既存 `editBody` 想定の Behavioral Spec / contract / test cases を Block 操作別に分解。

#### `capture-auto-save`
- **何が変わるか**：`ValidatedSaveRequest` が `blocks` + `body`（派生）両持ち。`note.isEmpty()` の判定が「全ブロック空 paragraph」に変わる。
- **参照すべき型契約**：`capture/stages.ts` の `ValidatedSaveRequest`、`shared/events.ts` の `SaveNoteRequested`、`shared/errors.ts` の `SaveValidationError`（"empty-body-on-idle" の意味更新）。
- **推奨アクション**：spec の payload 記述を blocks/body 両持ちに更新。serializeBlocksToMarkdown を呼ぶ責務を明示。

#### `edit-past-note-start`
- **何が変わるか**：入力が `PastNoteSelected` ではなく `BlockFocusRequest{noteId, blockId, snapshot?}`。同一 Note 内ブロック移動 (`same-note`) と別 Note 移動の分岐を明示する必要あり。
- **参照すべき型契約**：`capture/stages.ts` の `BlockFocusRequest` / `CurrentSessionDecision`（`same-note` バリアント追加）/ `NewSession`（`focusedBlockId` 追加）、`capture/workflows.ts` の `EditPastNoteStart`。
- **推奨アクション**：Behavioral Spec を Block Focus 単位に書き換え。`same-note` 経路（flush skip）の test cases を追加。

#### `copy-body`
- **何が変わるか**：`bodyForClipboard(note)` 内部で `serializeBlocksToMarkdown(note.blocks)` を呼ぶ。型シグネチャは変わらないが実装意図が変わる。
- **参照すべき型契約**：`shared/note.ts` の `NoteOps.bodyForClipboard`、`shared/blocks.ts` の `serializeBlocksToMarkdown`。
- **推奨アクション**：spec の "implementation notes" に派生関数を経由する旨を追記。test cases は変更不要見込み。

#### `app-startup`
- **何が変わるか**：Hydration 経路で `parseMarkdownToBlocks(snapshot.body)` を呼ぶ。失敗時は `HydrationFailureReason "block-parse"` で `corruptedFiles` 行きになる。
- **参照すべき型契約**：`shared/snapshots.ts` の `HydrationFailureReason`（"block-parse" 追加）、`curate/ports.ts` の `HydrateNote`、`shared/blocks.ts`。
- **推奨アクション**：Hydration の責務記述に Block 変換ステップを追記。エラーカタログに block-parse を追加。

#### `handle-save-failure`
- **何が変わるか**：`SaveFailedState.pendingNextNoteId` → `pendingNextFocus: { noteId, blockId } | null`。`SwitchError` も同様。Cancel/Discard 経路の遷移先が Block Focus 単位に。
- **参照すべき型契約**：`capture/states.ts` の `SaveFailedState` / `PendingNextFocus`、`shared/errors.ts` の `SwitchError`。
- **推奨アクション**：spec の状態遷移図と pending pointer 表現を Block Focus 単位に書き換え。

---

### 中程度の影響（一部の型・コメント修正で済む見込み）

#### `ui-feed-list-actions`
- **何が変わるか**：Feed 上のアクションは Note 全体を扱うため Block 化の直接影響は小さいが、過去ノート選択時に `blockId` を渡す経路（`PastNoteSelected.blockId`）が増える。
- **参照すべき型契約**：`shared/events.ts` の `PastNoteSelected`。
- **推奨アクション**：「過去ノート選択 → どのブロックにフォーカスを当てるか（既定値：先頭ブロック）」の意思決定を spec に追記。

#### `apply-filter-or-search`
- **何が変わるか**：検索対象 `body` が派生プロパティ (`serializeBlocksToMarkdown(blocks)`) になる旨が明示された。型シグネチャは不変。
- **参照すべき型契約**：`curate/aggregates.ts` の `SearchScope`。
- **推奨アクション**：spec の検索対象記述に「派生 body」と注記。test cases は変更不要見込み。

---

### 影響なし見込み（型契約変更を伴わない）

| feature | 理由 |
|---------|------|
| `delete-note` | NoteId 中心。Block の概念は登場しない |
| `tag-chip-update` | Frontmatter 経路、blocks には触らない |
| `configure-vault` | Vault 設定のみ |
| `ui-app-shell` | レイアウトのみ |
| `ui-filter-search` | Curate 側 UI、検索対象の意味付けは spec に反映済み |
| `ui-tag-chip` | UI コンポーネントのみ |

---

## 後続セッションへの推奨ワークフロー

1. 影響度 **「強く影響」** の feature を 1 つずつ `/vcsdd-spec` で開き、本ファイルの「参照すべき型契約」を読みながら spec を改訂
2. spec 改訂後は `/vcsdd-spec-review`（adversary レビュー）→ 必要なら `/vcsdd-feedback` で 1a/1b に戻す
3. **「中程度」** は spec の対応箇所のみコメント更新でよい
4. **「影響なし」** は本セッションで完了とみなす（sprint contract 上で declare）
5. 全 feature の spec が型契約と整合したら、`promptnotes/` 実装フェーズ（Phase 11+）へ進む

## 関連コミット

- `8f4bcf8 update(domain): block ベース型契約への shared kernel 移行`
- `64d39cd update(domain): capture context をブロックベース API に整合`
- `1eb66fa docs(domain): curate context の派生 body 注記を追加`
- `e03e850 test(domain): シミュレーションをブロックベース型契約に追従`

## 関連ドキュメント

- `docs/tasks/type-contract-prompt.md` — 本作業の起動プロンプト
- `docs/domain/aggregates.md` §1 Note Aggregate（Block Sub-entity の不変条件）
- `docs/domain/glossary.md` §0 Shared Kernel（Block 系語彙）
- `docs/domain/domain-events.md` `SaveNoteRequested` / `NoteFileSaved` の payload
- `docs/domain/workflows.md` Workflow 2 / 3 / 10（Block Focus と BlockEdit）
