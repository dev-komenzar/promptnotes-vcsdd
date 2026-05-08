# Block-based 型契約移行 — feature spec 影響分析

> **スコープ**: `feature/inplace-edit-migration` ブランチで型契約 (`docs/domain/code/ts/src/`)
> をブロックベース WYSIWYG モデルへ移行した結果、各 VCSDD feature の **spec
> （`.vcsdd/features/<feature>/specs/`）** がどの程度影響を受けるかを
> 後続セッション向けにまとめた引き継ぎノート。
>
> **このドキュメントが扱うこと**:
> - 型契約変更が各 feature の spec / IPC contract / mirror state に与える影響度の分類
> - spec 改訂時に参照すべき型契約ファイルへのポインタ
> - 各 feature の spec 改訂で押さえるべきポイント（payload・mirror state・派生プロパティ）
>
> **このドキュメントが扱わないこと（別ドキュメントへ）**:
> - in-place 編集の UX インタラクションモデル（クリック→フォーカス、視覚状態遷移、
>   placeholder、cursor 管理など）→ `ui-editor` の behavioral spec で定義
> - Svelte 5 contenteditable の実装パターン → 後続の `ui-editor` Sprint 実装指示書
> - Markdown ↔ Block 変換のラウンドトリップ性質の証明 → `app-startup` / `capture-auto-save` spec

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

#### `ui-feed-list-actions` ⚠️ 当初「中程度」と評価したが、Sprint 3 の IPC 契約まで広く影響することが判明したため「強く影響」へ再分類

- **影響の広さ**：Sprint 1（pure core: reducer / predicates）、Sprint 2（Rust handlers + AppShell mount）、Sprint 3（`select_past_note` の IPC 拡張）の **3 sprint すべての成果物が再検証対象**。

- **何が変わるか**：

  1. **`Note.body` の派生プロパティ化** — `body` は `NoteOps.body(note)` 経由でしか取得できなくなる
     （`shared/note.ts` 冒頭コメント参照）。フィード行に渡す body 文字列は
     `serializeBlocksToMarkdown(note.blocks)` の結果か、ファイル境界の
     `NoteFileSnapshot.body`（Markdown 文字列）から取る。
     - `promptnotes/src/lib/feed/types.ts:72` `NoteRowMetadata.body: string` の **意味付け** が変わる
       （Aggregate 内の真の属性 → 派生 / ファイル境界の文字列）。型は不変だが spec の責務記述を更新。
     - `bodyPreviewLines(body, 2)` のセマンティクスを spec で明示する必要：
       - **Option A**: `body = serializeBlocksToMarkdown(blocks)` を改行 split（既存挙動の継承）
       - **Option B**: `note.blocks.slice(0, 2)` の content を結合（block-aware preview）
       - 推奨は Option A（既存テスト・既存 Sprint 1 純粋性証明を維持しつつ意味だけ更新）。
         ただし code block のみ複数行を保持する点に注意（一行に flatten する方針を spec に書く）。

  2. **mirror state の構造変更** — `feedReducer.ts:60` で `pendingNextNoteId` を mirror しているが、
     `EditingSessionState` 側が `pendingNextFocus: { noteId, blockId } | null` に変わるため、
     `FeedViewState` の mirror フィールドも同様に拡張が必要。
     - `FeedRow.svelte` の `showPendingSwitch` ロジック（`pendingNextNoteId === noteId` 判定）は
       `viewState.pendingNextFocus?.noteId === noteId` に変更。
     - REQ-FEED-009（pending switch 表示の defense-in-depth）の Acceptance Criteria を更新。

  3. **Sprint 3 IPC 契約の根本的な再設計（REQ-FEED-024 / EC-FEED-016 / EC-FEED-017）**：
     現行の `select_past_note → editing_session_state_changed` payload は
     `{ status: "editing", currentNoteId, body: <string>, ... }` の 6 フィールド構造で、
     **`body` を IPC 越しに直接搬送している**。block 化により以下が必要：
     - payload に `blocks: BlockDTO[]` を追加（または `body` を `blocks` に置換）
     - payload に `focusedBlockId: BlockId` を追加（行クリック時にどの block に
       フォーカスするか — 既定値は先頭 block。`PastNoteSelected.blockId` 仕様と整合）
     - EC-FEED-016（note_id が `note_metadata` に未存在のエッジケース）：
       現行は `body: ""` で emit する fallback だが、block 化後は
       「空 paragraph 1 件 + その block を `focusedBlockId`」で emit する spec に書き換え。
     - EC-FEED-017（`feed_state_changed` より先に emit する順序保証）は維持。
     - Rust handler `editor.rs::make_editing_state_changed_payload` も更新対象（src 側）。

  4. **`add-tag-via-chip` / `remove-tag-via-chip` の reducer action payload**
     （`types.ts:167-168`）が `body: string` を含む。タグ操作後の永続化（`tag-chip-update`
     feature が担当）が block 化対応した時点で、ここの payload も `blocks` を carry するか、
     `body` を派生 / 末端変換に閉じるかの設計判断が必要。
     **推奨**: payload は `blocks: BlockDTO[]` を持ち、`body` は派生として落とす（重複の単一情報源化）。

- **参照すべき型契約**：
  - `shared/note.ts` の `Note.blocks` / `NoteOps.body`（派生）
  - `shared/blocks.ts` の `serializeBlocksToMarkdown`
  - `shared/events.ts` の `PastNoteSelected`（`blockId` 追加済み）
  - `shared/snapshots.ts` の `NoteFileSnapshot.body`（ファイル境界では Markdown 文字列のまま）
  - `capture/states.ts` の `EditingState.focusedBlockId` / `PendingNextFocus`
  - `capture/stages.ts` の `BlockFocusRequest`
  - `.vcsdd/features/edit-past-note-start/specs/behavioral-spec.md`（同期対象）
  - `.vcsdd/features/handle-save-failure/specs/behavioral-spec.md`（pending mirror 整合）

- **推奨アクション**：
  1. spec の「Source of truth」セクションに block 関連の型契約ファイルを追加。
  2. REQ-FEED-001〜009 のうち body / pendingNext を扱う条項を block-aware に書き換え。
  3. **REQ-FEED-024 / EC-FEED-016 / EC-FEED-017 を block-based payload で書き直す**
     （Sprint 3 既存 spec の最重要セクション）。Rust 側 `editor.rs` への影響を Acceptance Criteria に明記。
  4. `bodyPreviewLines` の入力源を spec で明示（"derived from `serializeBlocksToMarkdown(blocks)`"）。
  5. `apply-filter-or-search` / `tag-chip-update` の payload 整合（body vs blocks）を併せて決定。
  6. Sprint 3 の cargo integration tests（`select_past_note` IPC 検証）を block payload 対応へ書き換える指針を Sprint 4 contract で明記。

- **影響を受ける既存 PR / ゲート**：
  - Sprint 1 spec gate（PASS 済）→ block-aware への spec patch が必要 → 1c-sprint-4 として再 review
  - Sprint 2 vertical slice（Rust handler 群）→ DTO 構造更新 → cargo integration test 再生成
  - Sprint 3 `select_past_note` IPC（PASS 済）→ payload 拡張のため REQ-FEED-024 改訂

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
