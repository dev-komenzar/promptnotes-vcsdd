---
coherence:
  node_id: "req:ui-feed-list-actions"
  type: req
  name: "ui-feed-list-actions 行動仕様"
  depends_on:
    - id: "governance:implement-mapping"
      relation: derives_from
    - id: "design:ui-fields"
      relation: derives_from
    - id: "design:workflows"
      relation: derives_from
    - id: "design:aggregates"
      relation: derives_from
    - id: "governance:design-system"
      relation: depends_on
    - id: "design:type-contracts"
      relation: derives_from
  modules:
    - "ui-feed-list-actions"
    - "edit-past-note-start"
    - "delete-note"
  source_files:
    - "promptnotes/src/routes/+page.svelte"
    - "promptnotes/src/lib/feed/FeedList.svelte"
    - "promptnotes/src/lib/feed/FeedRow.svelte"
    - "promptnotes/src/lib/feed/DeleteConfirmModal.svelte"
    - "promptnotes/src/lib/feed/DeletionFailureBanner.svelte"
    - "promptnotes/src/lib/feed/feedReducer.ts"
    - "promptnotes/src/lib/feed/feedRowPredicates.ts"
    - "promptnotes/src/lib/feed/deleteConfirmPredicates.ts"
    - "promptnotes/src/lib/feed/feedStateChannel.ts"
    - "promptnotes/src/lib/feed/tauriFeedAdapter.ts"
    - "promptnotes/src/lib/feed/types.ts"
    - "promptnotes/src/lib/feed/clockHelpers.ts"
    - "promptnotes/src/lib/feed/editingSessionChannel.ts"
    - "promptnotes/src/lib/block-editor/BlockElement.svelte"
    - "promptnotes/src/lib/block-editor/SlashMenu.svelte"
    - "promptnotes/src/lib/block-editor/BlockDragHandle.svelte"
    - "promptnotes/src/lib/block-editor/SaveFailureBanner.svelte"
    - "promptnotes/src/lib/block-editor/types.ts"
    - "promptnotes/src/lib/block-editor/blockPredicates.ts"
    - "promptnotes/src-tauri/src/feed.rs"
    - "promptnotes/src-tauri/src/editor.rs"
    - "docs/domain/code/ts/src/capture/states.ts"
    - "docs/domain/code/ts/src/shared/note.ts"
    - "docs/domain/code/ts/src/shared/blocks.ts"
---

# Behavioral Specification: ui-feed-list-actions

**Feature**: `ui-feed-list-actions`
**Phase**: 1a
**Revision**: 6
**Mode**: strict
**Language**: TypeScript (Svelte 5 + SvelteKit + Tauri 2 desktop)
**Source of truth**:
- `docs/domain/ui-fields.md` §1B (フィード一覧), §画面 3 (削除確認モーダル), §画面 4 (保存失敗バナー)
- `docs/domain/workflows.md` Workflow 3 (EditPastNoteStart), Workflow 5 (DeleteNote)
- `docs/domain/aggregates.md` §Feed 集約, §EditingSessionState の遷移表
- `DESIGN.md` Cards / Modal & Overlay / Buttons / Accessibility セクション
- `.vcsdd/features/edit-past-note-start/specs/behavioral-spec.md`
- `.vcsdd/features/delete-note/specs/behavioral-spec.md`
- `docs/domain/code/ts/src/shared/note.ts` — `Block` / `Note` / `NoteOps` (block 操作、`body` 派生プロパティ) **(Sprint 4 追加)**
- `docs/domain/code/ts/src/shared/blocks.ts` — `serializeBlocksToMarkdown` / `parseMarkdownToBlocks` / `BlockParseError` **(Sprint 4 追加)**
- `docs/domain/code/ts/src/capture/states.ts` — `EditingState.focusedBlockId` / `PendingNextFocus` (`{ noteId, blockId }`) / `SwitchingState.pendingNextFocus` **(Sprint 4 追加)**
- `.vcsdd/features/ui-editor/specs/behavioral-spec.md` §3 (REQ-IPC-001..020 で確立した 5-arm `EditingSessionStateDto` 正規形) **(Sprint 4 追加)**

**Scope**:
フィード一覧 (画面 1B) における行レンダリング、行クリックによる過去ノート選択 (`SelectPastNote` → `flushCurrentSession → startNewSession` 連鎖)、および削除フロー (削除ボタン無効化 → 確認モーダル → `fs.trashFile` → 失敗バナー) の UI 実装を対象とする。タグチップ操作 (`AddTagViaChip` / `RemoveTagViaChip`) は `apply-filter-or-search` / `tag-chip-update` フィーチャの管轄であり、本スコープ外とする。フィード一覧のフィルタ・検索・ソート UI も `apply-filter-or-search` フィーチャの管轄であり本スコープ外とする。

---

## Purity Boundary Analysis

### Pure Core (deterministic, side-effect-free, formally verifiable)

| Module | 主な exports | 根拠 |
|--------|-------------|------|
| `feedRowPredicates.ts` | `isEditingNote(rowNoteId, editingNoteId)`, `isDeleteButtonDisabled(rowNoteId, editingSessionStatus, editingNoteId)`, `bodyPreviewLines(body, maxLines)`, `timestampLabel(epochMs, locale)` | 純粋関数。入力のみに依存。`timestampLabel` は `Intl.DateTimeFormat` に locale を明示注入し `new Date(...)` / `Date.now()` を使用しない (purity-audit grep ゼロヒット保証)。 |
| `feedReducer.ts` | `feedReducer(state: FeedViewState, action: FeedAction): { state: FeedViewState; commands: ReadonlyArray<FeedCommand> }` | mirror reducer。`EditingSessionState` を反映する `FeedViewState` を返す。副作用なし。 |
| `deleteConfirmPredicates.ts` | `deletionErrorMessage(error: NoteDeletionFailureReason): string \| null`, `canOpenDeleteModal(rowNoteId, editingNoteId)` | 純粋関数。switch 網羅 (`'permission' \| 'lock' \| 'unknown'` の 3 variant のみ)。 |

### Effectful Shell (I/O, Tauri invoke, DOM)

| Module | 理由 |
|--------|------|
| `FeedList.svelte` | Svelte 5 component: `$state`, `$derived`, `$effect`, DOM event handlers |
| `FeedRow.svelte` | 行クリック・削除ボタン click handler。`SelectPastNote` / `RequestNoteDeletion` コマンド発火。`timestampLabel` 呼び出しは FeedRow.svelte 側で locale を渡して実行する。 |
| `DeleteConfirmModal.svelte` | モーダル DOM。`ConfirmNoteDeletion` / `CancelNoteDeletion` 発火。Esc キー購読。 |
| `DeletionFailureBanner.svelte` | 削除失敗バナー DOM。再試行ボタン。 |
| `tauriFeedAdapter.ts` | Tauri `invoke(...)` ラッパー。OUTBOUND only。 |
| `feedStateChannel.ts` | Tauri `listen(...)` ラッパー。INBOUND only。 |

---

## Requirements

### REQ-FEED-001: フィード行レンダリング — createdAt / updatedAt 表示

**EARS**: WHEN フィード一覧がレンダリングされる THEN 各行は `Note.frontmatter.createdAt` と `Note.frontmatter.updatedAt` を人間可読のタイムスタンプ (`Caption` スタイル: 14px weight-500, Warm Gray 500 `#615d59`) で表示しなければならない。

**Edge Cases**:
- `createdAt === updatedAt` (保存直後): 「作成: YYYY-MM-DD HH:mm」のみ表示（updatedAt は省略可）。
- 未来タイムスタンプ (システムクロック異常): 表示はそのまま行い、バリデーションエラーを出さない。
- `Timestamp` は epoch ms として UI 受け取り → `FeedRow.svelte` が `timestampLabel(epochMs, 'ja-JP')` を呼んで変換する。

**Acceptance Criteria**:
- `createdAt` の表示が、epoch ms 入力に対して `timestampLabel(createdAt, 'ja-JP')` の出力と一致する。
- `timestampLabel` は `Date.now()` / `Math.random()` を呼ばず、同一入力 `(epochMs, locale)` で同一出力を返す (idempotent)。
- 表示テキストに `data-testid="row-created-at"` 要素が存在する。

---

### REQ-FEED-002: フィード行レンダリング — body プレビュー

**EARS**: WHEN フィード行がレンダリングされる THEN `Note.body` の先頭 2 行 (改行区切り) を折りたたみテキストとして表示しなければならない。

> **Sprint 4 amendment — body 入力源の明示**:
> `bodyPreviewLines` に渡す body 文字列の入力源は以下のいずれか:
> - `NoteRowMetadata.body` フィールドに格納された Markdown 文字列。
>   この文字列はファイル境界 (`NoteFileSnapshot.body`) から取得されるか、
>   Rust 側で `serializeBlocksToMarkdown(note.blocks)` を経由して生成される。
>   TS 側は `NoteRowMetadata.body: string` 型のまま変更しない（意味付けのみ更新）。
> - **実装方針 (Option A)**: `body = serializeBlocksToMarkdown(blocks)` を改行 split する
>   既存挙動を継承する。code block を含む note では複数行を保持したまま先頭 2 行を取得する。
>   code block の内部改行は Markdown 表現で保持されるため、code block が先頭にある場合は
>   code block 本文の 1 行目・2 行目が preview に表示される（code fence は含まない）。
>   この挙動は spec 上許容（block-aware preview は将来の Option B に委譲）。
> - 型シグネチャ・Acceptance Criteria は Sprint 1 から変更しない。

**Edge Cases**:
- 空 body (`""`): プレビューは空文字列表示 (行は存在する)。
- 1 行のみ: 2 行目なし、プレビューは 1 行。
- 3 行以上: 3 行目以降はカット。末尾に「…」を付与しない (仕様上 truncate せず行数制限のみ)。
- 非常に長い 1 行: CSS `overflow: hidden; text-overflow: ellipsis` で視覚的切り捨て (DESIGN.md 準拠の CSS 処理)。
- code block のみで構成される note (Sprint 4): `serializeBlocksToMarkdown` が生成する Markdown の先頭 2 行をプレビューとして表示する。

**Acceptance Criteria**:
- `bodyPreviewLines(body, 2)` が改行で分割した先頭 2 要素を返す (pure 関数)。
- DOM に `data-testid="row-body-preview"` 要素が存在し、テキストが `bodyPreviewLines` 出力と一致する。

---

### REQ-FEED-003: フィード行レンダリング — タグ表示

**EARS**: WHEN フィード行がレンダリングされる THEN `Note.frontmatter.tags` の各タグを Pill Badge スタイル (DESIGN.md §4 Pill Badge Button: `#f2f9ff` 背景, `#097fe8` テキスト, 9999px radius, 4px 8px padding, 12px weight-600) で表示しなければならない。

**Edge Cases**:
- タグなし (`tags: []`): タグ領域は空 (行は表示される)。
- タグ 1 件のみ: 1 個の Pill Badge を表示。
- タグ 10 件以上: すべて表示 (折り返しあり)。
- タグ文字列が長い: 各 Pill は `max-width: 160px` + `overflow: hidden; text-overflow: ellipsis` (DESIGN.md §10 Pill Max-Width Token 参照)。

**Acceptance Criteria**:
- タグ数分の `data-testid="tag-chip"` 要素が存在する。
- 各 Pill の `background-color` ソースが DESIGN.md §10 Token の `#f2f9ff` であること (grep で確認)。
- 各 Pill の `max-width` が `160px` であること (grep で確認)。

---

### REQ-FEED-004: フィード行レンダリング — DESIGN.md Cards 準拠

**EARS**: WHEN フィード行がレンダリングされる THEN 行コンテナは DESIGN.md §4 Cards スタイル (white `#ffffff` 背景, `1px solid rgba(0,0,0,0.1)` whisper border, 12px radius, 4-layer card shadow) に従わなければならない。

**Edge Cases**:
- ホバー時: shadow intensification (CSS による強調)。
- フォーカス時: `2px solid #097fe8` focus ring (DESIGN.md §8 Focus System)。

**Acceptance Criteria**:
- `FeedRow.svelte` ソース内に `rgba(0,0,0,0.1)` を含む border 記述が存在する (grep)。
- `FeedRow.svelte` ソース内に card shadow 4-layer 記述が存在する (grep)。
- border-radius `12px` が存在する (grep)。

---

### REQ-FEED-005: 行クリックによる過去ノート選択

**EARS**: WHEN ユーザーがフィード行をクリックする AND `editingStatus ∉ {'saving', 'switching'}` AND `loadingStatus === 'ready'` THEN システムは `SelectPastNote { noteId, issuedAt: Clock.now() }` コマンドを発行し、`flushCurrentSession → startNewSession` 連鎖を起動しなければならない。

> **Cross-reference**: 否定前提条件 (`editingStatus ∈ {'saving', 'switching'}` または `loadingStatus !== 'ready'`) の正規表現は REQ-FEED-006 を参照。

**Edge Cases**:
- 現在 `editingStatus === 'idle'` の場合: 即座に `startNewSession`。
- 現在 `editingStatus === 'editing'` かつ dirty の場合: `flushCurrentSession` (blur save) → 成功後に `startNewSession`。
- 現在 `editingStatus === 'editing'` かつ body が空の場合: `EmptyNoteDiscarded` 発行 → 即座に `startNewSession`。
- 同一行の再クリック: `pendingNextNoteId` への上書きは domain 側で処理。UI は発行する (同一 noteId の重複発行は `EditPastNoteStart` pre-pipeline guard で no-op 扱い)。

**Acceptance Criteria**:
- 行クリック時に mock adapter の `dispatchSelectPastNote` が 1 回呼ばれる。
- `editingStatus ∈ {'saving', 'switching'}` 時に行クリックしても `dispatchSelectPastNote` が呼ばれない。
- `loadingStatus === 'loading'` 時に行クリックしても `dispatchSelectPastNote` が呼ばれない。
- 行要素に `<button>` タグが使用されており、`tabindex` が non-negative である。

---

### REQ-FEED-006: 連打防止 — 行クリック中の再クリック抑止

**EARS**: WHEN `editingStatus ∈ {'saving', 'switching'}` である OR `loadingStatus !== 'ready'` である THEN 各フィード行のクリックイベントハンドラは発火しても `SelectPastNote` を発行してはならない。

**Edge Cases**:
- `editingStatus` が `'saving'` → `'editing'` に遷移した後: クリックは再び有効になる。
- 複数行が同時に `disabled` 表示になる: すべての行が `aria-disabled="true"` を保持する。

**Acceptance Criteria**:
- `editingStatus ∈ {'saving', 'switching'}` のとき、行クリックハンドラが `dispatchSelectPastNote` を呼ばない (integration test)。
- 行要素が `aria-disabled="true"` を保持する (integration test)。

---

### REQ-FEED-007: 空フィード — 0 件表示

**EARS**: WHEN `Feed.computeVisible` が空配列を返す THEN システムはフィード一覧の代わりに「ノートがありません」という空状態メッセージを表示しなければならない。

**Edge Cases**:
- アプリ起動直後 (vault 内ノートが 0 件): 空状態を表示。
- フィルタ適用後に 0 件になった場合: 「フィルタに一致するノートが見つかりません」という別メッセージを表示 (フィルタが非空 `FilterCriteria` の場合)。
- ノートが削除されて 0 件になった場合: 空状態に切り替わる。

**Acceptance Criteria**:
- `visibleNoteIds.length === 0` かつフィルタ非適用時に `data-testid="feed-empty-state"` 要素が DOM に存在する。
- `visibleNoteIds.length === 0` かつフィルタ適用時に `data-testid="feed-filtered-empty-state"` 要素が DOM に存在する。

---

### REQ-FEED-008: ローディング状態 — フィード読込中

**EARS**: WHEN フィード一覧が初期ロード中である (`FeedViewState.loadingStatus === 'loading'`) THEN システムはスケルトン UI またはスピナーを表示し、行クリック操作を無効化しなければならない。

**Edge Cases**:
- ロード完了後 (`loadingStatus === 'ready'`): スピナーが消え、ノート行が表示される。
- ロードに長時間かかる場合 (UI): スケルトン表示が維持される (タイムアウトなし)。

**Acceptance Criteria**:
- `FeedViewState.loadingStatus === 'loading'` 時に `data-testid="feed-loading"` が存在する。
- ロード中はすべての行が `aria-disabled="true"` またはクリックハンドラが無効。

---

### REQ-FEED-009: `pendingNextNoteId` queue 復元 — 切替待機ビジュアル

**EARS**: WHEN `FeedViewState.pendingNextNoteId !== null` である (すなわち `editingStatus ∈ {'switching', 'save-failed'}` であり `pendingNextNoteId` が非 null の場合) THEN システムは `pendingNextNoteId` に対応するフィード行に「切替待機中」を示すビジュアルキューを表示しなければならない。

> **Rationale**: `pendingNextNoteId` は `EditingSessionState` 遷移において `switching` 状態の開始時点から `NoteFileSaved` 到着まで、および `save-failed` 状態でも保持される (`docs/domain/aggregates.md:277-279`, `docs/domain/ui-fields.md:250`)。よって `save-failed` のみならず `switching` 中も切替予告を表示する。

> **Sprint 4 amendment — mirror フィールド拡張**:
> `capture/states.ts` の型契約変更により、`SwitchingState.pendingNextFocus` および
> `SaveFailedState.pendingNextFocus` が `{ noteId: NoteId; blockId: BlockId } | null`
> 型の `PendingNextFocus` に変わった (旧: `pendingNextNoteId: string | null`)。
> これに伴い以下を改訂する:
>
> - `FeedViewState.pendingNextNoteId: string | null` は
>   `FeedViewState.pendingNextFocus: { noteId: string; blockId: string } | null` に拡張する。
>   (詳細は REQ-FEED-026 参照。`FeedViewState` 型の改訂は Sprint 4 実装で行う)
> - `FeedRow.svelte` の `showPendingSwitch` 表示判定式は
>   `viewState.pendingNextNoteId === noteId` から
>   `viewState.pendingNextFocus?.noteId === noteId` に変更する。
> - `FeedDomainSnapshot.editing.pendingNextNoteId: string | null` は
>   `FeedDomainSnapshot.editing.pendingNextFocus: { noteId: string; blockId: string } | null`
>   に変更する (詳細は REQ-FEED-027 参照)。
> - `data-testid="pending-switch-indicator"` の表示条件（`editingStatus ∈ {'switching', 'save-failed'}` かつ pending noteId が行の noteId に一致）は不変。
>
> ~~旧 Acceptance Criteria (Sprint 1〜3):~~
> <!-- OLD: FeedViewState.pendingNextNoteId !== null のとき対象行に pending-switch-indicator が存在 -->
> <!-- OLD: feedReducer は EditingSessionState.pendingNextNoteId を FeedViewState.pendingNextNoteId に正確に mirror -->
> <!-- OLD: editingStatus === 'switching' かつ pendingNextNoteId !== null のとき pending-switch-indicator が表示 -->

**Edge Cases**:
- `editingStatus === 'switching'` かつ `pendingNextFocus !== null`: 切替予告ビジュアル表示。
- `editingStatus === 'save-failed'` かつ `pendingNextFocus !== null`: 切替予告ビジュアル表示。
- ユーザーが「再試行」を選択: 保存成功後に `pendingNextFocus.noteId` の行に自動遷移 (domain が `pendingNextFocus.blockId` にフォーカス)。
- ユーザーが「破棄」を選択: `pendingNextFocus.noteId` の行に遷移 (`DiscardCurrentSession` 後に domain が `pendingNextFocus.blockId` に `startNewSession`)。
- ユーザーが「キャンセル」を選択: `pendingNextFocus` は保持されるが現セッションに留まる。
- `pendingNextFocus` が null の場合: ビジュアルキューなし。

**Acceptance Criteria** (Sprint 4 amendment):
- `FeedViewState.pendingNextFocus !== null` のとき、`pendingNextFocus.noteId` に対応する行に `data-testid="pending-switch-indicator"` が存在する。
- `feedReducer` は `FeedDomainSnapshot.editing.pendingNextFocus` を `FeedViewState.pendingNextFocus` に正確に mirror する (pure test)。`noteId` / `blockId` 両フィールドが mirror されること。
- `editingStatus === 'switching'` かつ `pendingNextFocus?.noteId === noteId` のとき `pending-switch-indicator` が表示される (integration test)。
- `editingStatus ∉ {'switching', 'save-failed'}` のとき、`pendingNextFocus` が非 null であっても `pending-switch-indicator` は表示されない (defense-in-depth)。

---

### REQ-FEED-010: 削除ボタン — 編集中ノートの無効化 (型レベル + UI 層二重防御)

**EARS**: WHEN `EditingSessionState.currentNoteId === row.noteId` である THEN 当該行の削除ボタンは `disabled` 属性を持ち、`aria-disabled="true"` を保持し、クリックしても `RequestNoteDeletion` を発行してはならない。

**Edge Cases**:
- `editingStatus === 'idle'` (currentNoteId なし): すべての行の削除ボタンが有効。
- `editingStatus === 'save-failed'` かつ `currentNoteId === row.noteId`: 削除ボタンは無効 (編集中扱い)。
- `editingStatus === 'editing'` → ユーザーが別ノートに切り替え → `editingStatus === 'idle'`: 前の `currentNoteId` 行の削除ボタンが有効に戻る。
- ツールチップ: 無効化された削除ボタンには `title` または `aria-label` として「編集を終了してから削除してください」を設定する (`ui-fields.md` §検証エラー UI フィールドマッピング)。

**Acceptance Criteria**:
- `isDeleteButtonDisabled(rowNoteId, 'editing', editingNoteId)` は `rowNoteId === editingNoteId` のとき `true` を返す (pure 関数 unit test)。
- `isDeleteButtonDisabled(rowNoteId, 'idle', null)` は常に `false` を返す (pure 関数 unit test)。
- 無効化された削除ボタンが `disabled` 属性と `aria-disabled="true"` を保持する (integration test)。
- 無効化された削除ボタンをクリックしても `dispatchRequestNoteDeletion` が呼ばれない (integration test)。

---

### REQ-FEED-011: 削除ボタン — 有効時のクリックで確認モーダルを開く

**EARS**: WHEN ユーザーが有効な削除ボタン (編集中でない行) をクリックする THEN システムは `RequestNoteDeletion { noteId, issuedAt }` コマンドを発行し、削除確認モーダルを開かなければならない。

**Edge Cases**:
- モーダルが既に開いている場合: 2 番目のクリックは無視する (UI 重複防止)。
- ユーザーが「キャンセル」を押す: `CancelNoteDeletion { noteId }` を発行し、モーダルを閉じる。フィードは変化なし。

**Acceptance Criteria**:
- 有効削除ボタンクリック時に `dispatchRequestNoteDeletion` が 1 回呼ばれる (integration test)。
- モーダルが DOM に `data-testid="delete-confirm-modal"` として出現する (integration test)。
- キャンセル時に `dispatchCancelNoteDeletion` が 1 回呼ばれ、モーダルが消える (integration test)。

---

### REQ-FEED-012: 削除確認モーダル — 文言と DESIGN.md Modals 準拠

**EARS**: WHEN 削除確認モーダルが表示される THEN モーダルは「このノートを **OS のゴミ箱** に送ります。後で復元できます。」というメッセージと「削除（OS ゴミ箱に送る）」赤ボタン・「キャンセル」ボタンを表示しなければならない。

**DESIGN.md 準拠要件**:
- モーダルオーバーレイ: `rgba(0,0,0,0.5)` scrim
- モーダルコンテナ: Deep Shadow (5-layer, max opacity 0.05), `border-radius: 16px`
- 「削除（OS ゴミ箱に送る）」ボタン: 赤 (`#dd5b00` = Orange/Warn) 背景、white テキスト、4px radius、8px 16px padding
  - 注: DESIGN.md §10 Token に赤のプライマリ CTA は未定義のため、`Orange (Warn) #dd5b00` を危険アクションの代替として使用する
- 「キャンセル」ボタン: Secondary スタイル (`rgba(0,0,0,0.05)` 背景, near-black テキスト)
- Esc キーでモーダルを閉じる (`CancelNoteDeletion` 発行)
- Backdrop クリックでモーダルを閉じる (非 blocking)

**Edge Cases**:
- モーダル表示中に Esc キー: `CancelNoteDeletion` 発行 + モーダル閉じる。
- モーダル表示中に backdrop クリック: `CancelNoteDeletion` 発行 + モーダル閉じる。
- 「削除」ボタンクリック: `ConfirmNoteDeletion { noteId }` 発行 + モーダル閉じる + 削除実行。

**Acceptance Criteria**:
- モーダル本文に「OS のゴミ箱」文字列が含まれる (DOM assertion)。
- 削除ボタンが `data-testid="confirm-delete-button"` を持つ。
- 削除ボタンの背景色ソースが `#dd5b00` である (grep)。
- Esc キーで `dispatchCancelNoteDeletion` が呼ばれる (integration test)。
- Backdrop クリックで `dispatchCancelNoteDeletion` が呼ばれる (integration test)。
- 確認ボタンクリックで `dispatchConfirmNoteDeletion` が呼ばれる (integration test)。
- `DeleteConfirmModal.svelte` ソース内に 5-layer Deep Shadow が存在する (grep)。
- `border-radius: 16px` が存在する (grep)。

---

### REQ-FEED-013: 削除実行後のフィード再描画

**EARS**: WHEN `NoteFileDeleted` ドメインイベントが到着する THEN フィード一覧から削除されたノートの行が消えなければならない。

**Edge Cases**:
- 削除後に 0 件になる場合: REQ-FEED-007 の空状態表示に遷移。
- 削除後にフィルタが適用されている場合: フィルタ適用後の 0 件メッセージを表示。
- 削除した行が画面外にある場合: スクロール位置は保持する。

**Acceptance Criteria**:
- ドメインスナップショット更新後に削除行が DOM から消えている (integration test)。
- 削除後 `visibleNoteIds` から当該 noteId が除外されている (feedReducer pure test)。

---

### REQ-FEED-014: `fs.trashFile` 失敗時の削除失敗バナー

**EARS**: WHEN `NoteDeletionFailed` ドメインイベントが到着する THEN システムはフィード上部またはグローバル位置に削除失敗バナーを表示し、「再試行」ボタンを提供しなければならない。

> **Upstream invariant** (REQ-DLN-005 cross-reference): `delete-note` フィーチャの `NoteDeletionFailed` は `fs.not-found` 発生時には**発行されない** — `NoteFileDeleted` が代わりに発行される。よって UI 側 `NoteDeletionFailureReason` は `'not-found'` を含まない (`'permission' | 'lock' | 'unknown'` の 3 variant のみ)。

**バナー文言 (reason 別)**:
| reason | `detail` | メッセージ |
|--------|----------|-----------|
| `'permission'` | (なし) | 「削除に失敗しました（権限不足）」 |
| `'lock'` | (なし) | 「削除に失敗しました（ファイルがロック中）」 |
| `'unknown'` | `undefined` | 「削除に失敗しました」 |
| `'unknown'` | `'disk-full'` または任意の文字列 | 「削除に失敗しました（{detail}）」 |

> **Detail 取り扱い方針** (FIND-SPEC-2-05 対応): `NoteDeletionFailed.detail` が `undefined` でない場合、バナーには `detail` 文字列をカッコ内に付加して表示する。`detail = 'disk-full'` は REQ-DLN-013 が設定する診断文字列 (ディスク容量不足の正規化 unknown)、`FsError.unknown.detail` は REQ-DLN-004 が伝播させる。UI はこれらを suppressive せず表示することで、ユーザーに診断情報を提供する。
>
> **Cross-references**: `delete-note` REQ-DLN-013 (`disk-full → reason: 'unknown', detail: 'disk-full'`) および REQ-DLN-004 (`FsError.unknown.detail` の伝播)。

**DESIGN.md 準拠要件**:
- バナーコンテナ: Deep Shadow 5-layer, `#dd5b00` 左アクセントボーダー (Orange/Warn)
- 「再試行」ボタン: Primary Blue `#0075de`, 8px 16px padding, 4px radius, 15px weight-600
- `role="alert"` で支援技術に通知

**Edge Cases**:
- 再試行ボタンクリック: `dispatchConfirmNoteDeletion` を再発行する (noteId は失敗時に保持)。
- 再試行成功: バナーが消え、フィードからノートが消える。
- 複数の削除失敗: 最後の失敗のみバナーに表示する (スタック不使用)。
- バナー表示中に別ノートを削除しようとする: 新規削除ボタンは有効のまま (バナーはブロッキングでない)。

**Acceptance Criteria**:
- `NoteDeletionFailed` スナップショット受信後に `data-testid="deletion-failure-banner"` が DOM に存在する (integration test)。
- バナーに `role="alert"` が存在する (integration test)。
- `deletionErrorMessage('permission')` が所定文字列を返す (pure test)。
- `deletionErrorMessage('unknown', 'disk-full')` が `「削除に失敗しました（disk-full）」` を返す (pure test — FIND-SPEC-2-05)。
- `deletionErrorMessage('unknown', undefined)` が `「削除に失敗しました」` を返す (pure test)。
- 再試行ボタンクリックで `dispatchConfirmNoteDeletion` が呼ばれる (integration test)。

---

### REQ-FEED-015: a11y — フィード行のキーボード操作

**EARS**: WHEN フィード行が `<button>` タグでレンダリングされる THEN キーボード Enter / Space キーで行クリックと同じ動作をしなければならない。

> **Note**: アクセシビリティ上の理由から、フィード行は `role="button"` 付き `<div>` ではなく `<button>` 要素を必須とする。`<button>` は Enter / Space キーのネイティブ処理を提供し、手動の `keydown` ハンドラによる Space キー処理漏れを防止する。

**Edge Cases**:
- `editingStatus ∈ {'saving', 'switching'}` 時: Enter / Space も無効。
- Tab キーでフォーカス可能: `<button>` の自然なフォーカス。

**Acceptance Criteria**:
- 行要素に Enter キーイベントで `dispatchSelectPastNote` が呼ばれる (integration test)。
- フォーカス時に `2px solid #097fe8` focus ring が適用される (DESIGN.md §8 Focus System, grep で確認)。

---

### REQ-FEED-016: a11y — 削除ボタンのフォーカスリング

**EARS**: WHEN 削除ボタンがフォーカスされる THEN DESIGN.md §8 Focus System に従い `2px solid` focus outline が表示されなければならない。

**Acceptance Criteria**:
- `FeedRow.svelte` ソース内に削除ボタンの `outline: 2px solid` または `:focus-visible` スタイルが存在する (grep)。

---

### REQ-FEED-017: フィード再描画 — 保存後

**EARS**: WHEN `NoteFileSaved` ドメインイベントが到着する THEN フィード一覧は保存されたノートの `updatedAt` を更新し、ソート順を再計算しなければならない。

**Edge Cases**:
- 保存後にソート順が変わる (最新更新が先頭に来る場合): 行が再配置される。
- フィルタ適用中: フィルタを維持したまま再描画。

**Acceptance Criteria**:
- `NoteFileSaved` スナップショット受信後に対象行の `updatedAt` 表示が更新される (integration test)。
- `feedReducer` が `FeedAction.kind === 'DomainSnapshotReceived'` (NoteFileSaved トリガー) を受け取ったとき `commands` に `{ kind: 'refresh-feed' }` コマンドを含む (pure test)。

---

### REQ-FEED-018: フィード再描画 — フィルタ更新後

**EARS**: WHEN `FeedFilterByTagApplied` または `FeedFilterCleared` ドメインイベントが到着する THEN フィード一覧は可視ノート ID リストを再計算し再描画しなければならない。

**Edge Cases**:
- フィルタ適用後に 0 件: REQ-FEED-007 参照。
- フィルタ解除後: フィルタ前の全件表示に戻る。

**Acceptance Criteria**:
- フィルタ更新スナップショット受信後に行数が変化する (integration test)。

---

## Edge Case Catalog

| EC-ID | 条件 | 期待動作 |
|-------|------|----------|
| EC-FEED-001 | フィードが 0 件 | 空状態メッセージ表示 (REQ-FEED-007) |
| EC-FEED-002 | フィードが 1 件のみ | 行が正常に表示・クリック可能 |
| EC-FEED-003 | フィルタ適用後に 0 件 | フィルタ固有の空状態メッセージ表示 |
| EC-FEED-004 | `editingStatus === 'saving'` 中の行クリック | クリック抑止 (REQ-FEED-006) |
| EC-FEED-005 | `editingStatus === 'switching'` 中の行クリック | クリック抑止 (REQ-FEED-006) |
| EC-FEED-006 | 編集中ノートの削除ボタン | disabled + aria-disabled="true" + tooltip (REQ-FEED-010) |
| EC-FEED-007 | `fs.trashFile` 失敗 (permission) | 削除失敗バナー + 再試行 (REQ-FEED-014) |
| EC-FEED-008 | `fs.trashFile` 失敗 (lock) | 削除失敗バナー + 再試行 |
| EC-FEED-009 | `fs.trashFile` 失敗 (unknown) | 削除失敗バナー + 再試行 |
| EC-FEED-011 | Esc キーでモーダルを閉じる | `CancelNoteDeletion` 発行、モーダル閉じる |
| EC-FEED-012 | Backdrop クリックでモーダルを閉じる | `CancelNoteDeletion` 発行、モーダル閉じる |
| EC-FEED-013 | `pendingNextFocus` 非 null + `editingStatus ∈ {'switching', 'save-failed'}` | pending 行に視覚的キュー表示 | **Sprint 4 amendment**: `pendingNextNoteId` → `pendingNextFocus` (REQ-FEED-009 / REQ-FEED-026 参照)|
| EC-FEED-014 | 削除後に残り 0 件になる | 空状態表示 |
| EC-FEED-015 | ローディング中の行クリック | クリック抑止 (REQ-FEED-008) |
| EC-FEED-016 | `select_past_note` で `note_id` が `note_metadata` に存在しない | **Sprint 4 amendment**: `compose_state_for_select_past_note` は `blocks: None`・`focused_block_id: None` で emit。EditorPane 側がデフォルトの空 paragraph を生成する責任を持つ。~~旧: `body: ""` で emit~~ (REQ-FEED-024) |
| EC-FEED-017 | `editing_session_state_changed` emit 順序 | `feed_state_changed` より先に emit (変更なし、Sprint 8 実装で維持) (REQ-FEED-024) |

> **Note on EC-FEED-010 removal**: `fs.trashFile` が `not-found` を返す場合、`delete-note` フィーチャ (REQ-DLN-005) により `NoteDeletionFailed` は発行されず `NoteFileDeleted` が発行される。UI 側では `'not-found'` reason は到達不能 (dead code) であるため、EC-FEED-010 を削除した。

---

## Non-functional Requirements

### NFR-FEED-001: a11y (キーボード)

すべての行要素 (`FeedRow`) と削除ボタン・モーダルボタンは non-negative `tabindex` を持ち、Tab キーで到達可能でなければならない。フィード行は `<button>` 要素を使用すること (`role="button"` 付き非インタラクティブ要素は不可)。

### NFR-FEED-002: a11y (ARIA)

- 削除ボタンに `aria-label="削除"` または等価なラベル。
- 無効化された要素に `aria-disabled="true"`。
- 削除失敗バナーに `role="alert"`。
- 削除確認モーダルに `role="dialog"` と `aria-labelledby`。

### NFR-FEED-003: DESIGN.md トークン準拠

すべての Svelte コンポーネントソース内の色・rgba・px 値は DESIGN.md §10 Token Reference の allow-list に含まれる値でなければならない。`scripts/audit-design-tokens.ts` (PROP-006) のチェックをパスすること。

### NFR-FEED-004: Svelte 5 state

フィーチャ内部状態は `$state(...)` を使用し、`svelte/store` (`writable` 等) を使用しない。

### NFR-FEED-005: 純粋性境界

pure core モジュール (`feedRowPredicates.ts`, `feedReducer.ts`, `deleteConfirmPredicates.ts`) は canonical purity-audit grep pattern (verification-architecture.md §1 参照) に対して 0 ヒットでなければならない。`@tauri-apps/api` を import してはならない。`timestampLabel` は `Intl.DateTimeFormat` ベースの実装とし、`new Date(...)` / `Date.now()` を使用しないことで purity-audit grep ゼロヒットを保証する。

---

## Traceability

| REQ-ID | 参照ドキュメント |
|--------|----------------|
| REQ-FEED-001–004 | `ui-fields.md` §1B 各行の表示項目, `DESIGN.md` §4 Cards |
| REQ-FEED-005–006 | `workflows.md` Workflow 3, `aggregates.md` §EditingSessionState 遷移, `ui-fields.md` §1B |
| REQ-FEED-007–008 | `aggregates.md` §Feed.computeVisible, `ui-fields.md` §1B |
| REQ-FEED-009 | `aggregates.md` §EditingSessionState.pendingNextNoteId`, `workflows.md` Workflow 3, `aggregates.md:277-279`, `ui-fields.md:250` |
| REQ-FEED-010 | `ui-fields.md` §1B 編集中ノート削除禁止, `delete-note` spec REQ-DLN-002 |
| REQ-FEED-011–012 | `ui-fields.md` §画面 3 削除確認モーダル, `DESIGN.md` §4 Modals, `workflows.md` Workflow 5 |
| REQ-FEED-013 | `workflows.md` Workflow 5 REQ-DLN-001, `aggregates.md` §Feed |
| REQ-FEED-014 | `ui-fields.md` §画面 4 保存失敗バナー類似, `delete-note` spec REQ-DLN-004/REQ-DLN-005, `DESIGN.md` §4 |
| REQ-FEED-015–016 | `DESIGN.md` §8 Accessibility & States |
| REQ-FEED-017–018 | `aggregates.md` §Feed.refreshSort, `workflows.md` Workflow 5 Step 4 |
| REQ-FEED-019–022 | `implement.md` L82-86 (feature 3 scope), `implement.md` L248-252 (Phase 2b wiring layer) |
| REQ-FEED-023 | `implement.md` L47 (vertical slice principle), `DESIGN.md` sidebar/main layout |
| REQ-FEED-024 | `implement.md` L84 (ui-feed-list-actions responsibility), `editor.rs` make_editing_state_changed_payload, `docs/tasks/sprint-ui-feed-list-actions-s3.md` |

---

## Sprint 2 Extensions

> **Sprint**: 2
> **Rationale**: Sprint 1 delivered the pure TypeScript core and Svelte components. Sprint 2 completes the vertical slice per `implement.md` L47 by adding the Rust backend handlers, the `feed_state_changed` event emitter, and mounting `FeedList` inside `AppShell` at the main route.

---

### REQ-FEED-019: `fs_trash_file` Tauri command

**EARS**: WHEN `fs_trash_file` is invoked with a `path` argument THEN the system SHALL attempt to move the file at that path to the OS trash and return `Result<(), TrashErrorDto>`.

**Error variants** (`TrashErrorDto` — tagged union with `kind` field):
- `{ kind: "permission" }`: `std::io::ErrorKind::PermissionDenied` maps to this variant.
- `{ kind: "lock" }`: Currently mapped as `unknown` (OS-level lock detection is platform-specific); reserved for future platform detection.
- `{ kind: "unknown", detail: string | null }`: All other errors, including disk-full; `detail` carries the OS error string.

**Special case**: `std::io::ErrorKind::NotFound` is treated as success (`Ok(())`) — per `delete-note` REQ-DLN-005: a missing file is considered already deleted.

**Acceptance Criteria**:
- `fs_trash_file` with a valid existing file path returns `Ok(())`.
- `fs_trash_file` with a non-existent path returns `Ok(())` (not-found → already deleted).
- `fs_trash_file` on a path with insufficient permissions returns `Err({ kind: "permission" })`.
- Error variant `kind` field is serialized as kebab-case strings matching `NoteDeletionFailureReason`.

---

### REQ-FEED-020: Rust handlers — `select_past_note`, `request_note_deletion`, `confirm_note_deletion`, `cancel_note_deletion`

**EARS**: WHEN any of these `#[tauri::command]` handlers is invoked THEN the system SHALL perform the specified side-effect and return `Result<(), String>`.

**Handler specifications**:

| Handler | Parameters | Side-effect | Returns |
|---------|-----------|-------------|---------|
| `select_past_note` | `app: AppHandle, note_id: String, vault_path: String, issued_at: String` | Calls `scan_vault_feed(&vault_path)` (FIND-S2-05) and emits `feed_state_changed` with `EditingStateChanged` cause + populated `visibleNoteIds`/`noteMetadata` | `Ok(())` or `Err(String)` |
| `request_note_deletion` | `note_id: String, issued_at: String` | None (modal state is client-side only) | `Ok(())` |
| `confirm_note_deletion` | `app: AppHandle, note_id: String, file_path: String, vault_path: String, issued_at: String` | Calls `fs_trash_file_impl(&file_path)` (FIND-S2-01: file_path is the OS-level path; note_id is the logical id used in the snapshot), then calls `scan_vault_feed(&vault_path)` (FIND-S2-06) and emits `feed_state_changed` with `NoteFileDeleted` cause on success or `NoteDeletionFailed` cause on failure, both with re-scanned visibleNoteIds | `Ok(())` or `Err(String)` |
| `cancel_note_deletion` | `note_id: String, issued_at: String` | None | `Ok(())` |

**Emit invariant**: `feed_state_changed` MUST be emitted after every state-mutating operation (`select_past_note`, `confirm_note_deletion`). The payload MUST conform to `FeedDomainSnapshot` structure (camelCase via serde).

**Acceptance Criteria**:
- `select_past_note` invocation emits exactly one `feed_state_changed` event.
- `confirm_note_deletion` invocation calls `fs_trash_file_impl` and then emits `feed_state_changed` with `NoteFileDeleted` cause on success.
- `confirm_note_deletion` invocation emits `feed_state_changed` with `NoteDeletionFailed` cause when `fs_trash_file_impl` returns an error.
- `request_note_deletion` and `cancel_note_deletion` return `Ok(())` without emitting events.

---

### REQ-FEED-021: `feed_state_changed` Tauri event emit rules

**EARS**: WHEN any state-mutating Rust handler completes THEN the system SHALL emit the `feed_state_changed` event on the `AppHandle` with a `FeedDomainSnapshot`-shaped payload.

**Emit rules**:
- Event name: `"feed_state_changed"` (snake_case, matches `feedStateChannel.ts` listener).
- Payload shape: must be serializable to the `FeedDomainSnapshot` TypeScript type (all fields present, camelCase via `#[serde(rename_all = "camelCase")]`).
- The `cause` field identifies the upstream event kind (`NoteFileSaved`, `NoteFileDeleted`, `NoteDeletionFailed`, `EditingStateChanged`, `InitialLoad`).
- The `feed.visibleNoteIds`, `editing.*`, and `delete.*` fields carry the current application state at emit time.

**Acceptance Criteria**:
- The Rust DTO struct compiles with `#[derive(Serialize)]` and `#[serde(rename_all = "camelCase")]`.
- A round-trip JSON serialize → TypeScript parse of a minimal `FeedDomainSnapshot` payload succeeds without type errors.

---

### REQ-FEED-022: `feed_initial_state` Tauri command

**EARS**: WHEN `feed_initial_state` is invoked with `vault_path: String` THEN the system SHALL scan the vault directory for `.md` files, parse their frontmatter (if present), and return a `FeedDomainSnapshotDto` representing the initial state.

**Behavior**:
- Lists all `.md` files in `vault_path` (non-recursive, same as `fs_list_markdown`).
- For each file, reads the content and extracts `createdAt`, `updatedAt`, `tags` from YAML frontmatter if present; falls back to file modification time / empty values if absent.
- Returns a snapshot with `cause.kind = "InitialLoad"`, `editing.status = "idle"`, `feed.filterApplied = false`.
- Errors from unreadable files are skipped (best-effort: partial list is returned).

**Acceptance Criteria**:
- `feed_initial_state` with a valid vault path containing `.md` files returns `Ok(FeedDomainSnapshotDto)` with `noteMetadata` populated.
- `feed_initial_state` with an empty vault directory returns `Ok(FeedDomainSnapshotDto)` with `feed.visibleNoteIds = []`.
- `feed_initial_state` with a non-existent vault path returns `Err(String)`.

**Known tradeoffs (Phase 6 acknowledged)**:
- **FIND-S2-10** (low): `scan_vault_feed` returns entries in non-deterministic filesystem order. This may cause UI row reordering between re-scans. Acceptable for MVP; can be addressed by sorting by `updatedAt` desc before emit (deferred to a future sprint or user-visible bug report).
- **FIND-S2-11** (low): `scan_vault_feed` is invoked synchronously on every `select_past_note` and `confirm_note_deletion`. For vault sizes ≤ a few hundred markdown files this is acceptable. Latency NFR is not specified at the MVP level. If vault size grows, options include (a) caching with invalidation, (b) Mutex-guarded Rust-side state, (c) incremental fs watcher events. Deferred.

---

### REQ-FEED-023: `+page.svelte` — FeedList mounted in AppShell main route

**EARS**: WHEN the application is in `Configured` state THEN the main route SHALL render `FeedList` in the left sidebar alongside `EditorPane` in the central content area, both mounted inside `AppShell`.

**Layout specification**:
- Layout: CSS Grid with `grid-template-columns: 320px 1fr`.
- Sidebar: `border-right: 1px solid #e9e9e7` (DESIGN.md whisper border), `background: #f7f7f5` (DESIGN.md warm neutral surface).
- Main content area: `EditorPane` fills the remaining column.
- Total height: `100vh`.
- `FeedList` receives: `viewState` (initial state from `feed_initial_state`), `adapter` (from `createTauriFeedAdapter()`), `stateChannel` (from `createFeedStateChannel()`).

**Acceptance Criteria**:
- `+page.svelte` imports and mounts both `FeedList` and `EditorPane`.
- `FeedList` is wrapped in an `<aside>` with class `feed-sidebar`.
- `EditorPane` is wrapped in a `<div>` with class `editor-main` (FIND-S2-02: AppShell already provides the single `<main>` ancestor; nesting `<main>` inside `<main>` violates HTML5).
- The layout container uses `display: grid` with `grid-template-columns: 320px 1fr`.
- Sidebar border color matches DESIGN.md whisper border `#e9e9e7`.
- Configured state renders the two-column layout (DOM integration test).

---

## Sprint 3 Extensions

> **Sprint**: 3
> **Rationale**: `select_past_note` emits only `feed_state_changed` but not `editing_session_state_changed`. EditorPane subscribes to `editing_session_state_changed`, so clicking a past note row does not update the editor with the note's body. Sprint 3 adds the missing emit and verifies it with Rust integration tests.

---

### REQ-FEED-024: `select_past_note` — `editing_session_state_changed` emit

**EARS**: WHEN `select_past_note` is invoked THEN the system SHALL ALSO emit `editing_session_state_changed` with payload `{ state: <Editing arm of EditingSessionStateDto> }`.

> **Sprint 3 original payload shape (now superseded by Sprint 4)**:
> ~~旧 6-field flat payload: `{ status: "editing", isDirty: false, currentNoteId: note_id, pendingNextNoteId: null, lastError: null, body: <note body from file> }`~~
>
> **Sprint 4 amendment — 5-arm DTO への移行と block-aware 拡張**:
>
> `editing_session_state_changed` の `event.payload.state` は
> `EditingSessionStateDto` の `Editing` arm 正規形（REQ-IPC-004 確立済み）に従う:
>
> ```ts
> {
>   status: 'editing',
>   currentNoteId: string,          // note_id (行クリックされたノート)
>   focusedBlockId: string | null,  // 行クリック時は note の先頭 block id (note が空なら null)
>   isDirty: false,
>   isNoteEmpty: boolean,           // blocks が空 paragraph 1 件のみ ⇔ true
>   lastSaveResult: null,
>   blocks?: ReadonlyArray<DtoBlock>  // Sprint 4: Some(Vec<DtoBlock>) に拡張
> }
> ```
>
> 主要変更点:
> - `body` フィールドは**廃止**。block 化により `blocks` フィールドで代替。
> - `pendingNextNoteId` フィールドは**廃止**（5-arm DTO の `Editing` arm には存在しない）。
> - `lastError` フィールドは `lastSaveResult: null` に変更（`Editing` arm の正規フィールド名に準拠）。
> - `focusedBlockId` を追加: 行クリック時は note の先頭 block id を渡す。
>   note が空（blocks が空 paragraph 1 件）の場合は先頭 block id を渡す（空 paragraph の id）。
>   `note_metadata` に note が存在しない場合は `null`。
> - `blocks` フィールドを追加 (Sprint 4): `compose_state_for_select_past_note` を block-aware に拡張し、
>   `blocks: Some(Vec<DtoBlock>)` を渡す。Sprint 3 以前は `blocks: None`（省略）。
>
> **Payload shape cross-reference**:
> `{ state: ... }` ラッパーは `editor::make_editing_state_changed_payload(state: &EditingSessionStateDto)`
> (`editor.rs:328-330`) が生成し、`editorStateChannel.ts` が `event.payload.state` として受信する。
> EditorPane はこのペイロードで既存 5-arm rehydration ロジックを使って正しく状態復元できる。
>
> **Rust implementation scope (Sprint 4)**:
> `compose_state_for_select_past_note` のシグネチャを block-aware に変更する:
> `compose_state_for_select_past_note(note_id: &str, body: &str)` →
> `compose_state_for_select_past_note(note_id: &str, blocks: Vec<DtoBlock>, focused_block_id: Option<String>)`
> (詳細は REQ-FEED-025 参照)。

**Acceptance Criteria** (Sprint 4 amendment):
- `select_past_note` emits exactly 2 events: `editing_session_state_changed` (first) + `feed_state_changed` (second).
- `editing_session_state_changed` payload (`event.payload.state`) conforms to the `Editing` arm of `EditingSessionStateDto`: fields `status: "editing"`, `isDirty: false`, `currentNoteId: note_id`, `focusedBlockId: <first_block_id or null>`, `isNoteEmpty: <bool>`, `lastSaveResult: null`, `blocks: [...]`.
- `body` field is absent from the payload (Sprint 4: removed).
- `pendingNextNoteId` field is absent from the payload (not a field of the `Editing` arm).
- `focusedBlockId` is the id of the first block in the note when `note_metadata` contains the note; `null` when not found.
- `blocks` field carries the full `DtoBlock[]` array from `compose_state_for_select_past_note`.
- Note not found in vault → emit with `focusedBlockId: null`, `blocks` field absent (omitted by `skip_serializing_if`), `isNoteEmpty: true`.
- EditorPane can rehydrate correctly from the emitted payload using the existing 5-arm dispatch (cross-reference: `ui-editor` REQ-EDIT-019..023).

**Edge Cases**:
- EC-FEED-016 (Sprint 4 amendment — **superseded by Sprint 5 amendment, see "Sprint 5 Edge Case Catalog 追補" below**): `note_id` not found in `note_metadata` (e.g., file deleted between scan and emit): `compose_state_for_select_past_note(note_id, None)` is called; returns `EditingSessionStateDto::Editing` with `blocks: None` (field omitted by `skip_serializing_if = "Option::is_none"`), `focused_block_id: None` (serialized as `null`), `is_note_empty: true`. ~~EditorPane receives `focusedBlockId: null` and generates a default empty paragraph block on its own initiative.~~ **Sprint 5 supersedes this clause: EditorPane is abolished; FeedRow now generates the fallback (display-only synthetic block) per REQ-FEED-031.**
- EC-FEED-017 (unchanged): `editing_session_state_changed` is always emitted before `feed_state_changed` to ensure EditorPane receives state before the feed list re-renders. This ordering is maintained in Sprint 8 Rust implementation.

---

## Sprint 4 Extensions

> **Sprint**: 4
> **Rationale**: Block-based 型契約移行 (`feature/inplace-edit-migration`) により、Rust 側 `EditingSessionStateDto` が 5-arm tagged union に migrate され (`editor.rs:102-150`)、`PendingNextFocus` が `{ noteId, blockId }` 構造に変わった。Sprint 4 はこの移行を `ui-feed-list-actions` の IPC 契約・mirror state・Rust helper に波及させる。Sprint 1〜3 の全成果物を block-aware に拡張する。

---

### REQ-FEED-025: `compose_state_for_select_past_note` — block-aware シグネチャ拡張

**EARS**: WHEN `select_past_note` Rust handler が呼び出される THEN `compose_state_for_select_past_note` は `blocks: Option<Vec<DtoBlock>>` を受け取り、内部で `focused_block_id` を導出し、`EditingSessionStateDto::Editing` を返さなければならない。

> **現行シグネチャ (Sprint 3 まで)**:
> `pub fn compose_state_for_select_past_note(note_id: &str, body: &str) -> EditingSessionStateDto`
> `body` から `is_note_empty` を導出し、`focused_block_id: None`、`blocks: None` を固定で返す。
>
> **Sprint 4 新シグネチャ (FIND-S4-SPEC-001 解消)**:
> `pub fn compose_state_for_select_past_note(note_id: &str, blocks: Option<Vec<DtoBlock>>) -> EditingSessionStateDto`
>
> 内部導出ロジック:
> - `focused_block_id`: `blocks.as_ref().and_then(|b| b.first().map(|b| b.id.clone()))`
>   (呼び出し元は note の有無だけ知っていればよい; `focused_block_id` は関数が計算する)
> - `is_note_empty`: `blocks.as_ref().map_or(true, |b| b.is_empty() || (b.len() == 1 && b[0].content.is_empty() && b[0].block_type == BlockTypeDto::Paragraph))`
> - `blocks` フィールド: `Option<Vec<DtoBlock>>` をそのまま `Editing` arm の `blocks` フィールドに格納 (`None` のとき `skip_serializing_if = "Option::is_none"` により JSON から省略)
>
> **Rust 側 `parse_markdown_to_blocks` 契約 (FIND-S4-SPEC-002 解消 / FIND-S4-SPEC-iter2-001 解消)**:
> シグネチャ: `pub fn parse_markdown_to_blocks(body: &str) -> Result<Vec<DtoBlock>, BlockParseError>`
> - TS 規範 (`docs/domain/code/ts/src/shared/blocks.ts::parseMarkdownToBlocks`) と同一 output を保証する。
> - **Non-empty 不変条件**: `Ok` を返すとき **必ず 1 件以上** の `DtoBlock` を含む `Vec<DtoBlock>` を返す。
>   空文字列 body を含むいかなる入力に対しても `Ok(vec![])` (空 Vec) を返すことは**契約違反**とする。
>   空文字列 body の場合は `vec![DtoBlock { id: <uuid>, block_type: BlockTypeDto::Paragraph, content: "".to_string() }]`
>   (空 paragraph 1 件) を返す。これは TS 側 `parseMarkdownToBlocks` の「最低 1 ブロック保持」不変条件
>   (`docs/domain/aggregates.md §1` Note 不変条件) と一致する。
> - **帰結**: この不変条件により `Ok(vec![])` (ケース 3) はランタイムで到達不能となる。
>   3 ケース固定表のケース (3) は「契約上到達不能 (forbidden by `parse_markdown_to_blocks` contract)」として
>   仕様上禁止される。wire shape は ケース (1) absent または ケース (2) non-empty の 2 通りに収束する。
> - `BlockParseError` 発生時の挙動: `compose_state_for_select_past_note(note_id, None)` に fallback する。
>   note 未存在ケースと同一ペイロードで emit し、EditorPane 側が空 paragraph fallback を担当する。
>
> **呼び出し元の責務** (`feed.rs::select_past_note`):
> ```
> match parse_markdown_to_blocks(&body) {
>     Ok(blocks) => compose_state_for_select_past_note(note_id, Some(blocks)),
>     Err(_)     => compose_state_for_select_past_note(note_id, None),   // fallback
> }
> ```
> note が `note_metadata` に存在しない場合: `compose_state_for_select_past_note(note_id, None)`

**3 ケース固定表 (FIND-S4-SPEC-006 解消 / FIND-S4-SPEC-iter2-001 解消)**:

| ケース | 呼び出し形式 | blocks (JSON) | focusedBlockId | isNoteEmpty | 到達可能性 |
|--------|------------|---------------|----------------|-------------|-----------|
| (1) note_id が note_metadata 未存在 / parse error | `compose_state_for_select_past_note(note_id, None)` | フィールド absent (`None`) | `null` | `true` | 到達可能 |
| (2) note 存在、blocks 非空 (`len >= 1`) | `compose_state_for_select_past_note(note_id, Some(blocks))` | `[...]` (full array, len >= 1) | `blocks[0].id` | `false` または `true` (空 paragraph 1 件なら `true`) | 到達可能 |
| (3) note 存在、blocks 空 vec (`Some(vec![])`) | `compose_state_for_select_past_note(note_id, Some(vec![]))` | `[]` | `null` | `true` | **契約上到達不能 (forbidden by `parse_markdown_to_blocks` contract)** |

> **ケース (3) 禁止の根拠 (FIND-S4-SPEC-iter2-001 解消)**:
> `parse_markdown_to_blocks` の non-empty 不変条件 (上記参照) により、呼び出し元が
> `compose_state_for_select_past_note(note_id, Some(vec![]))` を渡すことは実装上起こらない。
> よって wire 上に `blocks: []` という形式は登場しない。wire shape は以下の 2 通りに収束する:
> - ケース (1): `blocks` フィールド自体が JSON に不在 (`None` → `skip_serializing_if = "Option::is_none"` 適用)。
> - ケース (2): `blocks` フィールドが `[...]` (len >= 1 の配列) として存在する。
> TS 側受信ロジック (5-arm rehydration) は `blocks` フィールド absent (`undefined`) と
> `blocks: [...]` (非空配列) の 2 通りを処理すればよく、`blocks: []` (空配列) の処理は不要。
> ケース (3) に対応する TS 側 AC (空配列の semantic-equivalent 処理) は不要とする。

**Rust/TS parity (FIND-S4-SPEC-002, FIND-S4-SPEC-008 解消)**:
- Sprint 4 では基本ケースのスナップショット比較のみ実施する:
  `parse_markdown_to_blocks("# heading\n\nparagraph")` の Rust 出力を JSON 化し、TS 側 `parseMarkdownToBlocks` 出力と手動比較する (PROP-FEED-S4-016 参照)。
- fast-check による全 markdown 任意入力での parity 検証は Sprint 5 へ deferral する。

**Edge Cases**:
- `blocks` が `None` (ケース 1): `is_note_empty: true`、`focused_block_id: None`。note が vault に存在しないか parse error 発生時。
- `blocks` が `Some(vec![])` (ケース 3): **契約上到達不能**。`parse_markdown_to_blocks` non-empty 不変条件により、空 Vec が `Ok` で返ることはない。実装は `Some(vec![])` を受け取った場合の処理を追加する必要はないが、防御的に実装する場合はケース (1) と同一扱い (`is_note_empty: true`、`focused_block_id: None`) とする。
- `blocks` が単一空 paragraph (`Some([{ id, Paragraph, "" }])`) (ケース 2 特殊形): `is_note_empty: true`、`focused_block_id: Some(blocks[0].id)`。空文字列 body に対して `parse_markdown_to_blocks` が返す正規形。
- `blocks` が単一非空 paragraph または複数 block (ケース 2): `is_note_empty: false`、`focused_block_id: Some(blocks[0].id)` (先頭 block)。
- `BlockParseError` 発生時: ケース (1) と同一 fallback。

**Acceptance Criteria**:
- `compose_state_for_select_past_note(note_id, Some(blocks))` が `EditingSessionStateDto::Editing` を返し、`blocks: Some(blocks)` フィールドが設定されている (Rust unit test, ケース 2)。
- `compose_state_for_select_past_note(note_id, None)` が `blocks: None`、`focused_block_id: None`、`is_note_empty: true` を返す (Rust unit test, ケース 1)。
- `compose_state_for_select_past_note(note_id, Some(vec![]))` が `blocks: Some(vec![])`、`focused_block_id: None`、`is_note_empty: true` を返す (Rust unit test, ケース 3 — 契約上到達不能だが防御的テストとして維持)。
- `focused_block_id` が `blocks.as_ref().and_then(|b| b.first().map(|b| b.id.clone()))` の結果と等しい (Rust unit test)。
- `make_editing_state_changed_payload` に `Some(blocks)` を渡したとき、JSON に `blocks` 配列が含まれる (Rust serde test)。
- `make_editing_state_changed_payload` に `None` を渡したとき、JSON に `blocks` フィールドが存在しない (Rust serde test)。
- 旧シグネチャ `(note_id, body: &str)` を参照するコードが存在しない (FIND-S4-SPEC-007 解消 grep audit):
  ```
  rg -n 'fn compose_state_for_select_past_note\([^)]*body: ?&str' promptnotes/src-tauri/src/
  ```
  0 ヒットを assertion とする。

---

### REQ-FEED-026: TS Feed mirror types — block-aware migration

**EARS**: WHEN `DomainSnapshotReceived` action が `feedReducer` に到達する THEN `feedReducer` は `FeedDomainSnapshot.editing.pendingNextFocus: { noteId: string; blockId: string } | null` を `FeedViewState.pendingNextFocus: { noteId: string; blockId: string } | null` に正確に mirror しなければならない。

> **変更対象型** (`promptnotes/src/lib/feed/types.ts`):
>
> `FeedViewState` の `pendingNextNoteId: string | null` を以下に置換:
> ```ts
> readonly pendingNextFocus: { noteId: string; blockId: string } | null;
> ```
>
> `FeedDomainSnapshot.editing` の `pendingNextNoteId: string | null` を以下に置換:
> ```ts
> readonly pendingNextFocus: { noteId: string; blockId: string } | null;
> ```
>
> これにより `capture/states.ts` の `PendingNextFocus` 型契約と整合する。
>
> **影響範囲**:
> - `feedReducer.ts`: `DomainSnapshotReceived` case の mirror 行
>   `pendingNextNoteId: snapshot.editing.pendingNextNoteId` →
>   `pendingNextFocus: snapshot.editing.pendingNextFocus`
> - `FeedRow.svelte`: `showPendingSwitch` の判定式
>   `viewState.pendingNextNoteId === noteId` →
>   `viewState.pendingNextFocus?.noteId === noteId`
> - `tauriFeedAdapter.ts` / Rust `FeedDomainSnapshotDto`: Rust 側の `editing.pending_next_note_id` →
>   `editing.pending_next_focus: Option<PendingNextFocusDto>` (REQ-FEED-027 参照)
> - 既存の property test `PROP-FEED-007a` の arbitrary と assertion を `pendingNextFocus` に更新。

**Edge Cases**:
- `pendingNextFocus === null`: `FeedRow` の `showPendingSwitch` が `false`。
- `pendingNextFocus?.noteId !== noteId`: 当該行は `showPendingSwitch === false`。
- `pendingNextFocus?.noteId === noteId`: 当該行は `showPendingSwitch === true`（`editingStatus` guard も充足する場合）。
- `feedReducer` は `pendingNextFocus.blockId` を `FeedViewState` に保持するが、`FeedRow` は `noteId` のみを行表示判定に使う（`blockId` は EditorPane が消費する）。

**Acceptance Criteria**:
- `FeedViewState.pendingNextNoteId` フィールドが存在しない (tsc --strict でコンパイルエラーが出ないこと、grep で `pendingNextNoteId` がゼロヒット)。
- `FeedViewState.pendingNextFocus: { noteId: string; blockId: string } | null` フィールドが存在する (tsc 検証)。
- `feedReducer(s, { kind: 'DomainSnapshotReceived', snapshot: S }).state.pendingNextFocus` が `S.editing.pendingNextFocus` と deep-equal である (pure unit test)。
- `FeedRow.svelte` の `showPendingSwitch` が `viewState.pendingNextFocus?.noteId === noteId` の判定式を使用する (grep)。
- `FeedDomainSnapshot.editing.pendingNextNoteId` フィールドが存在しない (tsc 検証)。
- PROP-FEED-007a の property test が `pendingNextFocus` で正しく検証される (fast-check)。

---

### REQ-FEED-027: feed.rs::EditingSubDto — `pending_next_focus` への変更

**EARS**: WHEN `feed_state_changed` Tauri event が emit される THEN ペイロードの `editing` フィールドは `pending_next_focus: Option<PendingNextFocusDto>` を持たなければならない。`pending_next_note_id: Option<String>` フィールドは廃止する。

> **変更対象** (`promptnotes/src-tauri/src/feed.rs`の`EditingSubDto` または相当する Rust struct):
>
> ```rust
> // 旧 (Sprint 3 まで)
> pub struct EditingSubDto {
>     pub status: String,
>     pub current_note_id: Option<String>,
>     pub pending_next_note_id: Option<String>,  // ← 廃止
> }
>
> // 新 (Sprint 4)
> pub struct EditingSubDto {
>     pub status: String,
>     pub current_note_id: Option<String>,
>     pub pending_next_focus: Option<PendingNextFocusDto>,  // ← 追加
> }
> ```
>
> `PendingNextFocusDto` は `editor.rs` の既存定義 (`pub struct PendingNextFocusDto { pub note_id: String, pub block_id: String }`) を再利用する。
>
> **Rust → TS serde マッピング**:
> `#[serde(rename_all = "camelCase")]` により TS 側で `pendingNextFocus: { noteId: string; blockId: string } | null` として到達する。
>
> **現行 Rust 実装の `pending_next_note_id` 取得元**:
> `select_past_note` の context では `pendingNextFocus` は常に `null`（新規選択のため pending はない）。
> `SwitchingState` や `SaveFailedState` から emit される `feed_state_changed` では
> `pending_next_focus` に `PendingNextFocusDto` を設定する（Rust domain state から取得）。

**Edge Cases**:
- `pending_next_focus: None`: JSON に `pendingNextFocus: null` として出力（`skip_serializing_if = "Option::is_none"` は使わない — TS 側が `null` チェックに依存するため）。
- `pending_next_focus: Some(...)`: JSON に `pendingNextFocus: { noteId: "...", blockId: "..." }` として出力。
- `feedReducer` が `pendingNextFocus.blockId` を受け取るが `FeedRow` は `noteId` のみ判定に使う。

**Acceptance Criteria**:
- `EditingSubDto` に `pending_next_note_id` フィールドが存在しない (grep: `grep "pending_next_note_id" src-tauri/src/feed.rs` がゼロヒット)。
- `EditingSubDto` に `pending_next_focus: Option<PendingNextFocusDto>` フィールドが存在する (grep)。
- `FeedDomainSnapshotDto` の JSON シリアライズで `editing.pendingNextFocus` が `null` または `{ noteId, blockId }` として出力される (Rust serde round-trip test)。
- TS 側 `FeedDomainSnapshot.editing.pendingNextFocus` が JSON parse で `{ noteId: string; blockId: string } | null` として型付けられる (tsc 検証)。
- `pending_next_focus: null` のとき `feedReducer` が `pendingNextFocus: null` を `FeedViewState` に設定する (pure unit test)。
- `pending_next_focus: { noteId: "n1", blockId: "b1" }` のとき `feedReducer` が `pendingNextFocus: { noteId: "n1", blockId: "b1" }` を設定する (pure unit test)。

---

### Out-of-scope deferrals (Sprint 4) (FIND-S4-SPEC-005 解消)

Sprint 4 のスコープを `select_past_note` IPC + mirror state migration (`pendingNextFocus` / `compose_state_for_select_past_note` block-aware 拡張) に絞るため、以下を明示的に Sprint 5 以降へ deferral する。

**deferral-1: `add-tag-via-chip` / `remove-tag-via-chip` の payload block 化**

現状 `types.ts` の `add-tag-via-chip` / `remove-tag-via-chip` payload は `body: string` を含む。
この `body` は Rust 側で `serializeBlocksToMarkdown(blocks)` から導出される派生値として扱い、
Sprint 4 では `body: string` のまま維持する。block payload (`blocks: ReadonlyArray<DtoBlock>`) への変換は
Sprint 5 (`tag-chip-update` block migration) で実施し、その際に本 spec を改訂する。

**deferral-2: `apply-filter-or-search` の検索対象 body**

`apply-filter-or-search` の検索対象も現状 `NoteRowMetadata.body` (派生 Markdown 文字列) のまま維持する。
完全な block payload 化 (blocks フィールドで検索) は Sprint 5 の `tag-chip-update` / `apply-filter-or-search` block migration 時に決定する。

---

## Sprint 5 Extensions

> **Sprint**: 5
> **Rationale**: `block-based-ui-spec-migration.md` の確定アーキテクチャに従い、EditorPane を完全廃止して **in-place 編集モデル** へ移行する。`+page.svelte` は単一カラム (FeedList のみ) になり、編集サーフェスは `FeedRow` 内に組み込まれた BlockElement 群に集約される。`editing_session_state_changed` の購読も EditorPanel から FeedList / FeedRow 階層へ再配線する。
>
> **Source of truth**:
> - `docs/domain/bounded-contexts.md` §Capture Context（in-place 編集モデルの定義）
> - `docs/tasks/block-based-ui-spec-migration.md` §アーキテクチャ判断
> - `.vcsdd/features/ui-block-editor/specs/behavioral-spec.md` REQ-BE-001..027（埋め込まれる block primitive の契約）
>
> **既存 REQ への作用** (本 Sprint 5 で supersede / amend される対象):
> | 旧 REQ | 状態 | 上位 REQ |
> |-------|------|---------|
> | REQ-FEED-023 (Sprint 2) | **superseded by REQ-FEED-028** | REQ-FEED-028 |
> | REQ-FEED-024 (Sprint 3) | **amended by REQ-FEED-029** (emit unchanged, subscriber rerouted) | REQ-FEED-029 |
> | EC-FEED-016 (Sprint 4 amendment) | **superseded by EC-FEED-016 Sprint 5 amendment** (FeedRow が空 paragraph fallback を担当) | REQ-FEED-031 |
> | EC-FEED-017 | **保持** (順序保証は維持) | REQ-FEED-032 |

---

### REQ-FEED-028: `+page.svelte` — 単一カラムレイアウト (REQ-FEED-023 全面 supersede)

**EARS**: WHEN the application is in `Configured` state THEN the main route SHALL render `FeedList` as the **sole** content surface inside `AppShell`. The `EditorPane` (旧 ui-editor) MUST NOT be mounted, imported, or referenced.

**Layout specification** (REQ-FEED-023 supersession):
- レイアウト: 単一カラム — `<main class="feed-main">` が `<FeedList>` のみを子に持つ。
- `display: grid` および `grid-template-columns: 320px 1fr` は使用しない（CSS 上から削除）。
- `.feed-sidebar` / `.editor-main` クラスは使用しない（DOM 上から削除）。
- 高さ: `100vh` (`html, body { height: 100% }` + `.feed-main { height: 100vh; overflow-y: auto }`).
- 背景: `#ffffff` (DESIGN.md §10 background) — `:global(html, body)` で指定。
- `FeedList` props: `viewState`, `adapter`, `stateChannel`, `vaultPath` （Sprint 4 と同じ）。
  - Sprint 5 で `FeedList` には新たに `editingSessionState`（`editing_session_state_changed` 購読結果）を渡す **OR** `FeedList` 内部で購読する責務を持たせる（実装選択肢: REQ-FEED-029 を参照）。

**Exclusions** (重要 — 既存の正面解除を spec で固定する):
- `EditorPanel` の import が `+page.svelte` に存在しない (grep で `EditorPanel` ゼロヒット)。
- `editorStateChannel` の import が `+page.svelte` に存在しない (grep で `editorStateChannel` ゼロヒット)。
- `tauriEditorAdapter` の import が `+page.svelte` に存在しない (grep で `tauriEditorAdapter` ゼロヒット)。
- `editor-main` クラス、`feed-sidebar` クラス、`grid-template-columns` の使用が `+page.svelte` に存在しない (grep でゼロヒット)。

**Acceptance Criteria** (REQ-FEED-023 旧 AC は破棄、Sprint 5 で再定義):
- `+page.svelte` は `FeedList` のみを `AppShell` 配下に mount する (DOM integration test)。
- レンダリング後の `<main class="feed-main">` は子要素として `<FeedList>` のみを持つ (DOM test)。
- `+page.svelte` ソースに `EditorPanel` / `editorStateChannel` / `tauriEditorAdapter` / `editor-main` / `feed-sidebar` / `grid-template-columns` のいずれも grep で 0 ヒット (静的検査)。
- `feed-main` 要素の高さが `100vh`、背景が `#ffffff`、横スクロールが発生しない (DOM + CSS test)。
- 既存 EditorPane 関連の DOM regression test (`promptnotes/src/routes/__tests__/main-route.dom.vitest.ts` の `EditorPanel`/`editorStateChannel`/`tauriEditorAdapter` non-presence check) が pass する。

**Edge Cases**:
- `feedViewState.loadingStatus === 'loading'`: `FeedList` は内部で skeleton/spinner を表示（REQ-FEED-008 既存）。EditorPane が無いため editing 領域の placeholder は不要。
- `editingNoteId === null`: どの `FeedRow` も in-place block surface を表示しない（REQ-FEED-030 参照）。
- `editingNoteId` がフィードに存在しない (race condition): `FeedList` は `editingSessionState` を保持しつつ該当行が無い旨を黙過する（IPC レイヤがやがて `feed_state_changed` で再同期）。

---

### REQ-FEED-029: `editing_session_state_changed` の購読再配線 (REQ-FEED-024 amendment)

**EARS**: WHEN Rust が `editing_session_state_changed` を emit する THEN `+page.svelte` または `FeedList.svelte` は **唯一の集中購読** (`listen('editing_session_state_changed', ...)`) で当該イベントを受信し、結果を `editingSessionState: EditingSessionStateDto` として `$state` に保持しなければならない。`EditorPanel` / `editorStateChannel.ts` を経由した配送経路は使用してはならない。各 `FeedRow` 自身が `listen()` を呼ぶ実装は **禁止** (FIND-S5-SPEC-007 解消: 単一購読義務化)。

> **Sprint 4 の REQ-FEED-024 は emit 側の契約**（Rust handler が `editing_session_state_changed` を `feed_state_changed` の前に emit する）であり、これは **Sprint 5 でも変更しない**。Sprint 5 は **subscribe 側の経路** のみを変更する。

**集中購読の根拠**:
- 単一 `listen()` 購読により、subscriber lifecycle が `+page.svelte` (または `FeedList`) の mount/unmount に閉じる（GC に優しい）。
- 行ごと購読は同時 N 行表示で listener が N 個になり、また個別行の購読タイミング差異により REQ-FEED-032 の同期更新義務 (`feedReducer.DomainSnapshotReceived` 処理時点で最新の `editingSessionState` がローカルに到達済み) を全行で保証することが困難。よって **禁止**。

**5-arm `EditingSessionStateDto` wire shape table** (FIND-S5-SPEC-001 解消):

`event.payload.state` は以下 5 arm のいずれか（`status` フィールドが discriminator）。Source of truth: `docs/domain/code/ts/src/capture/states.ts` (`EditingState` / `IdleState` / `SwitchingState` / `SaveFailedState`) と Rust 側 `promptnotes/src-tauri/src/editor.rs` の `EditingSessionStateDto` 定義。

| arm | `status` 値 | 必須フィールド | optional / 該当 arm のみ |
|-----|-----------|--------------|------------------------|
| (1) Idle | `'idle'` | なし (status のみ) | — |
| (2) Editing | `'editing'` | `currentNoteId: string`、`focusedBlockId: string \| null`、`isDirty: false`、`isNoteEmpty: boolean`、`lastSaveResult: null` | `blocks?: ReadonlyArray<DtoBlock>` (Sprint 4 で追加。`Some(Vec<DtoBlock>)` のときのみ JSON 出力。`None` のときは `skip_serializing_if` でフィールド absent) |
| (3) Saving | `'saving'` | `currentNoteId: string`、`focusedBlockId: string \| null`、`isNoteEmpty: boolean`、`isDirty: true` | — |
| (4) Switching | `'switching'` | `currentNoteId: string`、`focusedBlockId: string \| null`、`pendingNextFocus: { noteId: string; blockId: string }`、`isNoteEmpty: boolean` | — |
| (5) SaveFailed | `'save-failed'` | `currentNoteId: string`、`priorFocusedBlockId: string \| null`、`isNoteEmpty: boolean`、`lastSaveResult: { kind: 'failure'; reason: string; detail?: string }` | `pendingNextFocus?: { noteId: string; blockId: string } \| null` |

> **TS rehydration 規約**: subscriber は `payload.state.status` で `switch` 分岐し、上表に従って各 arm の必須フィールドを取り出す。未知の `status` 値（将来の Rust 拡張）は `console.warn(...)` を残しつつ subscriber 側で no-op (UI を壊さない)。本 spec で 5-arm を spec-fiat として固定するため `ui-editor` 旧 spec を参照する必要はない（migration doc の参照禁止に整合）。

**ペイロード契約**:
- `event.payload.state` の形状は **上表の 5 arm に厳密に従う**。
- ラッパー `{ state: ... }` は Rust `editor::make_editing_state_changed_payload` が生成（Sprint 4 変更なし）。
- 5-arm rehydration ロジックは `editingSessionChannel.ts` (新規 module) 内に閉じる。本 module の export `subscribeEditingSessionState(handler: (state: EditingSessionStateDto) => void): () => void` は raw payload を 5-arm 型として handler に渡す。pure rehydration helper を共有する場合は `feedRowPredicates.ts` 配下ではなく `src/lib/feed/editingSessionPredicates.ts` (新規想定) に切り出す。

**Subscriber 契約 (Pure / Effectful 区分)**:
- 新規 effectful module `src/lib/feed/editingSessionChannel.ts` を配置する。**INBOUND only**（dispatch しない、PROP-FEED-S5-021 で boundary audit）。
- `subscribeEditingSessionState(handler: (state: EditingSessionStateDto) => void): () => void` を export する（`unsubscribe` を返す）。
- `editorStateChannel.ts` の再活用は禁止（旧 ui-editor feature の名前空間に依存させない）。

**Acceptance Criteria**:
- `src/lib/feed/editingSessionChannel.ts` が存在し、唯一の `listen('editing_session_state_changed', ...)` 呼び出しを含む (grep)。
- `+page.svelte` または `FeedList.svelte` が `subscribeEditingSessionState(...)` を 1 回 mount し、unmount 時に unsubscribe する (DOM lifecycle test)。
- `src/lib/feed/FeedRow.svelte` 内に `listen('editing_session_state_changed', ...)` 呼び出しが存在しない (grep ゼロヒット — 集中購読義務 FIND-S5-SPEC-007 解消)。
- 購読モジュールの import 元が **`src/lib/editor/` を含まない** (`editorStateChannel`/`tauriEditorAdapter` の参照ゼロ — Sprint 5 では `src/lib/editor/` 自体が物理削除済み、回帰防止 grep)。
- イベント emit 順序 (`editing_session_state_changed` → `feed_state_changed`) が UI 受信側で守られる結果として、`feedReducer` が `DomainSnapshotReceived` を処理する時点で常に最新の `editingSessionState` がローカルに到達済みである (integration test, mock emitter; PROP-FEED-S5-005 / REQ-FEED-032)。
- 旧 `editorStateChannel` の subscriber registration が `src/lib/feed/` または `src/routes/` に存在しない (grep ゼロヒット)。
- 受信ハンドラは 5-arm wire shape table の `status` discriminator で switch 分岐し、5 arm すべてを網羅する (Tier 0 tsc exhaustive check + integration tests for arms (1), (2), (4), (5))。

**Edge Cases**:
- `editing_session_state_changed` が emit されたが対応する note が `feed_state_changed` 到着前に削除された: subscriber は受信した state をいったん保持し、続く `feed_state_changed` 受信で `editingNoteId` が `null` または別 note に切り替わったら local state を破棄する。
- TS 側で 5-arm payload の `status` が wire shape table の値以外 (将来の Rust 拡張): subscriber は `console.warn(...)` を残しつつ payload を無視する (UI を壊さない)。
- 集中購読 mount 前に Rust が emit したケース (EC-FEED-020): Tauri の listen 登録が `await` 解決前であれば payload は loss する。許容 (Tauri の標準仕様)、次の emit で復旧する。

---

### REQ-FEED-030: `FeedRow` — in-place 編集サーフェスの埋め込み

**EARS**: WHEN `viewState.editingStatus ∈ {'editing', 'saving', 'switching', 'save-failed'}` AND `viewState.editingNoteId === self.noteId` THEN `FeedRow` は対応する `EditingSessionStateDto` (REQ-FEED-029 で集中購読・状態保持) の `blocks` を順序通りにレンダリングし、各 block を `BlockElement` (ui-block-editor REQ-BE-001) として表示しなければならない。

**State source-of-truth** (FIND-S5-SPEC-002 解消):

Sprint 5 で UI には 2 つの state slice が共存する。両者の責務分担を以下に固定する:

| state slice | 由来 | mount 判定 (mount/unmount) | データソース (mount 時の表示内容) |
|------------|------|--------------------------|------------------------------|
| `viewState: FeedViewState` | `feedReducer` mirror of `feed_state_changed` (REQ-FEED-026/027) | **authoritative** for whether `BlockElement` should mount in this row | n/a (mount gate のみ) |
| `editingSessionState: EditingSessionStateDto` | `subscribeEditingSessionState` (REQ-FEED-029 集中購読) | n/a | **authoritative** for `blocks` / `focusedBlockId` / `lastSaveResult` data displayed once mount is authorized |

**矛盾時の解決規約** (`viewState.editingNoteId !== editingSessionState.currentNoteId` または `editingSessionState` 未到達):

| 条件 | 挙動 |
|------|------|
| `viewState.editingNoteId === self.noteId` AND `editingSessionState` が **未到達** (`null`) | REQ-FEED-031 の fallback (空 paragraph) を適用 |
| `viewState.editingNoteId === self.noteId` AND `editingSessionState.currentNoteId === self.noteId` | `editingSessionState.blocks` をそのまま表示 |
| `viewState.editingNoteId === self.noteId` AND `editingSessionState.currentNoteId !== self.noteId` (transient mismatch) | **「最後に self.noteId と一致した `editingSessionState`」のキャッシュ** を表示し続ける。キャッシュが無い場合は REQ-FEED-031 の fallback を適用 |
| `viewState.editingNoteId !== self.noteId` | `BlockElement` を mount しない (preview 表示維持) |

> **設計意図**: `feed_state_changed` は emit 順序の不変条件 (REQ-FEED-032) により常に対応する `editing_session_state_changed` の後に到達する。よって正常系では `viewState.editingNoteId === editingSessionState.currentNoteId` が成立する。transient mismatch は (a) 古い `editingSessionState` を保持中に `feed_state_changed` だけが先に Rust から再 emit された (e.g., FilterApplied)、または (b) 集中購読 mount 直後でまだ payload を受け取っていないケース。いずれもキャッシュ or fallback で「読めない瞬間」を作らない方針。

**Mount/unmount 2x2 truth table** (FIND-S5-SPEC-003 解消, AC 用 — `editingStatus` × `editingNoteId === self.noteId` の 2 軸 4 セル):

| `editingStatus` | `editingNoteId === self.noteId` | `BlockElement` 表示数 | preview 表示 |
|-----------------|------------------------------|---------------------|------------|
| `∈ {editing, saving, switching, save-failed}` | `true` | `blocks.length` (>= 1; fallback 適用時 = 1) | 非表示 |
| `'idle'` | `true` | 0 | 表示 |
| `∈ {editing, saving, switching, save-failed}` | `false` | 0 | 表示 |
| `'idle'` | `false` | 0 | 表示 |

> **注 (FIND-S5-SPEC-iter2-007 解消)**: `editingStatus === 'idle'` のとき `viewState.editingNoteId === null` が `feedReducer` の mirror 規約 (REQ-FEED-009, idle 状態は `currentNoteId: null`) により常に成立する。よって表 row 2 (`editingStatus === 'idle' AND editingNoteId === self.noteId`) は **architecturally 到達不能**である。AC ではこの行を **defensive test** として 0 個 assert を要求するが、テストは「synthetic な viewState を直接注入」して FeedRow が crash しないことを検証する目的に限定する (PROP-FEED-S5-006 cell 2 注記参照)。`feedReducer` がこの不変条件を保つことは既存 PROP-FEED-007a (Sprint 4: PROP-FEED-S4-006) で別途保証済みであり、本 PROP では mirror 不変条件を再検証しない。

**埋め込み詳細**:
- `BlockElement` の props は ui-block-editor REQ-BE-001..010 の契約に従う:
  - `block: DtoBlock` (id, type, content)
  - `isFocused: boolean` — `block.id === focusedBlockId` のとき `true`
  - `slashMenuOpen` 関連 props は `BlockElement` 内部または FeedRow が共有 state で管理（ui-block-editor REQ-BE-009..012 参照）
  - `BlockEditorAdapter` の 16 dispatch メソッド (ui-block-editor REQ-BE-026) を props で注入
- `BlockDragHandle` (REQ-BE-013/014) と `SlashMenu` (REQ-BE-011/012) は ui-block-editor の振る舞いをそのまま継承。
- `SaveFailureBanner` (REQ-BE-015/016) は `editingStatus === 'save-failed'` かつ `editingNoteId === self.noteId` のとき行内に表示する（行外オーバーレイは不要）。

**非編集行**:
- `viewState.editingNoteId !== self.noteId` の `FeedRow` は **既存の preview 表示** (`row-body-preview` / タグチップ / pending-switch indicator など) を維持する。`BlockElement` を mount してはならない。

**Adapter 注入経路**:
- `BlockEditorAdapter` の生成は `+page.svelte` または `FeedList` で 1 回行い、`FeedRow` に props として渡す。factory: `createBlockEditorAdapter(): BlockEditorAdapter` を `src/lib/block-editor/createBlockEditorAdapter.ts` で公開する。
- factory は ui-block-editor REQ-BE-026 の 16 dispatch メソッドそれぞれを `@tauri-apps/api/core::invoke('<command_name>', payload)` でラップする。command name 一覧は §Adapter command-mapping (本 REQ-FEED-030 末尾の table) に固定する。
- 各 dispatch は最終的に effectful shell の責務（PROP-FEED-032 / PROP-FEED-S5-021 同様、purity boundary 維持）。
- すべての dispatch payload には `issuedAt: string` (ISO 8601, `nowIso()` から取得) を含める (FIND-S5-SPEC-iter2-001 解消)。Rust handler は当該フィールドを受け取り (ignore 可) ordering trace に使う。tauriFeedAdapter の既存 `issuedAt` 規約と整合。

**Sprint 5 Rust handler scope split** (FIND-S5-SPEC-iter2-003 解消):

ui-block-editor REQ-BE-026 の 16 メソッドのうち、Rust 側 `#[tauri::command]` handler が **既に存在する** ものと **存在しない** ものに分かれる。Sprint 5 では `createBlockEditorAdapter` factory は **16 メソッドすべてを invoke wrap**するが、handler 不在のメソッド呼び出しは Tauri runtime が `command not found` エラーを返す (Promise reject)。FeedRow / BlockElement 側は **すべての dispatch を try/catch で best-effort 扱い**し、reject を無視して UI を継続表示する。

| group | dispatch メソッド | Tauri handler 状態 | Sprint 5 動作 |
|-------|------------------|------------------|------------|
| **A: 既存実装あり** (7 method) | `dispatchTriggerIdleSave`, `dispatchTriggerBlurSave`, `dispatchRetrySave`, `dispatchDiscardCurrentSession`, `dispatchCancelSwitch`, `dispatchCopyNoteBody`, `dispatchRequestNewNote` | ✅ `editor.rs` に既存 (Sprint 2 実装) | invoke 成功、Rust handler が動作 |
| **B: Sprint 5 では未実装** (9 method) | `dispatchFocusBlock`, `dispatchEditBlockContent`, `dispatchInsertBlockAfter`, `dispatchInsertBlockAtBeginning`, `dispatchRemoveBlock`, `dispatchMergeBlocks`, `dispatchSplitBlock`, `dispatchChangeBlockType`, `dispatchMoveBlock` | ❌ Rust handler 不在 (Sprint 5 スコープ外) | invoke 試行 → reject (`command not found`)、UI は try/catch で best-effort 継続 |

> **Group B handler は別 feature の Sprint で実装される予定**。Sprint 5 のゴールは「UI 側で BlockElement を mount できること」であり、block-structure mutation の Rust 側 round-trip は **Sprint 5 では検証しない**。これは migration doc Step 2 のスコープ "FeedRow へのブロック組み込み" に整合 (Rust 変更は別タスク)。
>
> Sprint 5 で **Group B 用 Rust handler を実装する別作業を開始するときに**、本 spec の Sprint 5 Rust handler scope split table を更新し、各 method を Group A に移行する。

**Adapter command-mapping** (FIND-S5-SPEC-013 解消 — factory 出力の正規 mapping; payload に `issuedAt` を含む):

> **注 (Phase 2a 整合)**: 各 dispatch の payload field 名は **`src/lib/block-editor/types.ts` の `BlockEditorAdapter` interface (既存)** と完全一致させる。本 table は `BlockEditorAdapter` の payload type を Tauri invoke の引数として **そのまま渡す** mapping を規定する (Phase 2b で `factoryOutput satisfies BlockEditorAdapter` 検証)。

| dispatch メソッド | Tauri command name | payload (BlockEditorAdapter type に準拠) | group |
|------------------|-------------------|--------------------------------------|-------|
| `dispatchFocusBlock` | `editor_focus_block` | `{ noteId: string; blockId: string; issuedAt: string }` | B |
| `dispatchEditBlockContent` | `editor_edit_block_content` | `{ noteId: string; blockId: string; content: string; issuedAt: string }` | B |
| `dispatchInsertBlockAfter` | `editor_insert_block_after` | `{ noteId: string; prevBlockId: string; type: BlockType; content: string; issuedAt: string }` | B |
| `dispatchInsertBlockAtBeginning` | `editor_insert_block_at_beginning` | `{ noteId: string; type: BlockType; content: string; issuedAt: string }` | B |
| `dispatchRemoveBlock` | `editor_remove_block` | `{ noteId: string; blockId: string; issuedAt: string }` | B |
| `dispatchMergeBlocks` | `editor_merge_blocks` | `{ noteId: string; blockId: string; issuedAt: string }` | B |
| `dispatchSplitBlock` | `editor_split_block` | `{ noteId: string; blockId: string; offset: number; issuedAt: string }` | B |
| `dispatchChangeBlockType` | `editor_change_block_type` | `{ noteId: string; blockId: string; newType: BlockType; issuedAt: string }` | B |
| `dispatchMoveBlock` | `editor_move_block` | `{ noteId: string; blockId: string; toIndex: number; issuedAt: string }` | B |
| `dispatchTriggerIdleSave` | `trigger_idle_save` | `{ source: 'capture-idle'; noteId: string; issuedAt: string }` | A (既存) |
| `dispatchTriggerBlurSave` | `trigger_blur_save` | `{ source: 'capture-blur'; noteId: string; issuedAt: string }` | A (既存) |
| `dispatchRetrySave` | `retry_save` | `{ noteId: string; issuedAt: string }` | A (既存) |
| `dispatchDiscardCurrentSession` | `discard_current_session` | `{ noteId: string; issuedAt: string }` | A (既存) |
| `dispatchCancelSwitch` | `cancel_switch` | `{ noteId: string; issuedAt: string }` | A (既存) |
| `dispatchCopyNoteBody` | `copy_note_body` | `{ noteId: string; issuedAt: string }` | A (既存) |
| `dispatchRequestNewNote` | `request_new_note` | `{ source: NewNoteSource; issuedAt: string }` | A (既存) |

> **注**: Group A の command name は **既存 Rust 実装に合わせて prefix なし** (例: `trigger_idle_save`)、Group B の command name は **`editor_` prefix 付き** (例: `editor_focus_block`)。後者は将来 Rust 実装される予定の命名予約。両 group とも `payload.issuedAt` を含む。
>
> Rust 側 handler の挙動契約は本 REQ-FEED-030 のスコープ外。Sprint 5 では factory が「上記 command name へ正しく invoke する」こと、および Group B の reject が UI を壊さないこと (try/catch 経由の best-effort) のみを規定する。

**Acceptance Criteria** (2x2 truth table 全セル):
- (cell 1) `editingStatus ∈ {editing, saving, switching, save-failed}` AND `editingNoteId === self.noteId`: `FeedRow` の DOM ツリーに `data-testid="block-element"` が `blocks.length` 個存在 (DOM integration test, fallback 適用時は 1 個)。
- (cell 2) `editingStatus === 'idle'` AND `editingNoteId === self.noteId`: `block-element` 0 個 (防御的 DOM test)。
- (cell 3) `editingStatus ∈ {editing, saving, switching, save-failed}` AND `editingNoteId !== self.noteId`: `block-element` 0 個 (DOM test)。
- (cell 4) `editingStatus === 'idle'` AND `editingNoteId !== self.noteId`: `block-element` 0 個 (DOM test)。
- `editingStatus === 'save-failed'` かつ `editingNoteId === self.noteId` のとき、当該行内に `data-testid="save-failure-banner"` が存在する。他行には存在しない。
- `BlockEditorAdapter` 経由の dispatch が、ユーザー操作（block content への文字入力 / Enter / `/` メニュー選択など）に対して **ui-block-editor の REQ-BE-003..010 の AC を満たす形** で発火する（FeedRow 経由でも primitive の振る舞いが維持される）。
- 埋め込み state は `FeedViewState` に含めない（block 編集 state は `editingSessionState` 経由で行に伝播し、`feedReducer` の責務外）。
- `createBlockEditorAdapter()` の return value が `BlockEditorAdapter` 型に **型レベルで assignable** である (Tier 0 tsc test, PROP-FEED-S5-016)。
- `createBlockEditorAdapter.ts` ソース内の `invoke('command_name', ...)` 呼び出しが **正確に 16 個** あり、command name set が上記 mapping と一致する (Tier 0 grep audit, PROP-FEED-S5-017)。

**Edge Cases**:
- `editingSessionState.status === 'switching'` または `'save-failed'`: `FeedRow` は最後の有効な `blocks` を表示し続ける（既存 ui-block-editor の振る舞い）。`focusedBlockId` は `priorFocusedBlockId` を採用（`save-failed` arm のフィールド）。
- `editingNoteId` が **フィードの可視 note ID リストに存在しない** (filter 適用で隠れた): 対応する `FeedRow` 自体が DOM に存在しないため、`BlockElement` も描画されない。`feed_state_changed` が当該 note を再可視化したタイミングで blocks が表示される (EC-FEED-018)。
- `blocks` フィールドが `undefined` または empty: REQ-FEED-031 (EC-FEED-016 Sprint 5 amendment) の fallback を適用する。
- `viewState.editingNoteId === self.noteId` AND `editingSessionState` 未到達 (subscriber が emit を受信前): REQ-FEED-031 の fallback を適用 (state source-of-truth table の row 1)。

---

### REQ-FEED-031: `FeedRow` 側 empty paragraph fallback (EC-FEED-016 Sprint 5 amendment)

**EARS**: WHEN `viewState.editingNoteId === self.noteId` AND 受信した `editingSessionState.blocks` が `undefined`、`null`、または空配列である AND **fallback restart 条件 (下記) を満たす** THEN `FeedRow` は (1) クライアント側で UUID v4 を発番した空 paragraph block を 1 件 client-side render state として構築し、(2) **`blocks` として採用して `BlockElement` を mount** し、(3) **best-effort で** `BlockEditorAdapter::dispatchInsertBlockAtBeginning({ noteId, type: 'paragraph', content: '', issuedAt })` → `dispatchFocusBlock({ noteId, blockId: <生成した UUID>, issuedAt })` の順に await dispatch を試行し、(4) どちらの dispatch が reject しても fallback BlockElement の表示は維持しなければならない。

> **Sprint 5 spec/code 整合 (FIND-S5-PHASE3-004 解消)**:
> `dispatchInsertBlockAtBeginning` の payload は `BlockEditorAdapter` 型 (`src/lib/block-editor/types.ts`) に厳密準拠し `{ noteId, type, content, issuedAt }` のみ含む。クライアント生成 UUID は **`dispatchInsertBlockAtBeginning` payload に含めず**、続く `dispatchFocusBlock` の `blockId` フィールドにのみ載せる。これは Sprint 5 既知制約 — Group B Rust handler が未実装なため両 dispatch とも実際は reject され、block id の Rust 同期は別 Sprint まで延期される。Sprint 5 段階の wire 整合性は本 EARS の (1)〜(4) 順序のみで保証する。

> **Sprint 4 までの責務**: EditorPane 側が空 paragraph fallback を担当（EC-FEED-016 旧定義）。
> **Sprint 5 の責務**: EditorPane 廃止により `FeedRow` 側に責務が移管される。

> **FIND-S5-SPEC-006 / FIND-S5-SPEC-iter2-003 解消** (cross-feature contract scope):
> 旧版では client-generated UUID で直接 `dispatchFocusBlock` を呼んでいたが、これは Rust 側 capture state が知らない block id への focus 要求となり aggregates.md §Note 不変条件を侵犯する。Sprint 5 修正版では **`dispatchInsertBlockAtBeginning` を先に試行**して Rust に block を pre-register することを試みるが、**Sprint 5 では Group B の Rust handler が未実装**のため両 dispatch とも reject されることを許容する (REQ-FEED-030 Sprint 5 Rust handler scope split table 参照)。
>
> 重要設計判断: **fallback BlockElement の表示は dispatch 成否に依存しない**。display は client-only state、dispatch は将来 Rust handler 実装時に意味を持つ best-effort 通知。Sprint 5 ユーザー視点では「クリックで note 選択 → 空行が表示される → 文字が入力できる (BlockElement contenteditable は client-side で動作)」が成立すればよく、Rust 側保存は別 sprint の責務。
>
> Sprint 5 では `dispatchEditBlockContent` (Group B) も reject されるため、ユーザーが入力した文字は **client-side の BlockElement state にしか保持されない** (Rust に永続化されない)。これは Sprint 5 の既知制約として spec に固定する。本 REQ-FEED-031 のゴールは「BlockElement のレンダリング経路を確立すること」であり、「block 編集の永続化」は別 sprint の責務。

**fallback 生成手順**:
1. `id`: UUID v4 (`crypto.randomUUID()`)。Effectful shell 内（`FeedRow.svelte` の `$effect` 内）でのみ生成する。pure helper には UUID 生成を含めない。
2. `block_type`: `BlockTypeDto::Paragraph` (`'paragraph'`)。
3. `content`: 空文字列 `""`。
4. `focusedBlockId`: 上記で生成した `id` を採用。
5. dispatch 順序: **`dispatchInsertBlockAtBeginning` (try/await/catch) → `dispatchFocusBlock` (try/await/catch)**。両 dispatch とも `try { await dispatch(...) } catch (e) { console.warn(...) }` で wrap する (best-effort)。

**Fallback state ownership** (FIND-S5-SPEC-004 / FIND-S5-SPEC-iter2-005 解消):

`FeedRow.svelte` 内で以下の per-row state を保持する:

```ts
// FeedRow.svelte 内 $state
let fallbackAppliedFor = $state<{ noteId: string; blockId: string } | null>(null);
```

- **fallback 起動条件 (restart 条件)**:
  以下のいずれかを満たすとき fallback を起動する:
  - (i) `fallbackAppliedFor === null` (まだ一度も適用していない)
  - (ii) `fallbackAppliedFor.noteId !== viewState.editingNoteId` (note 切り替えで cache 無効)
  - (iii) **直前のレンダリング cycle で `editingSessionState.blocks` が non-empty だった** (= Rust 側で block 状態が evolve した) かつ **現サイクルで再び absent/empty に戻った** (FIND-S5-SPEC-iter2-005 解消, undefined→non-empty→undefined sequence)
- **起動後**: `fallbackAppliedFor = { noteId: viewState.editingNoteId, blockId: <generated UUID> }` をセット。
- **同一 `editingNoteId` への 2 回目以降の `editing_session_state_changed` 受信** (`blocks` 依然 absent、かつ条件 (iii) 不成立、かつ条件 (ii) 不成立): 起動条件不成立 → no-op。前回の `fallbackAppliedFor.blockId` を再利用して `BlockElement` を mount し続ける (新 UUID 生成しない)。
- **`viewState.editingNoteId` 変化時**: `fallbackAppliedFor = null` にリセット。
- **`editingSessionState.blocks` が non-empty で到達**: fallback ロジックは適用されず、サーバ提供の `blocks` がそのまま表示される。**`fallbackAppliedFor` を `null` にリセット** (FIND-S5-SPEC-iter2-005 解消: 次に再び absent が来たら restart 条件 (iii) で新 UUID を発番できるよう invalidate)。
- **再 mount (FeedRow が unmount→remount)**: `fallbackAppliedFor` も destroy → 次回 mount で `null` から開始。

**Pure / Effectful 区分**:
- fallback 適用判定 (`blocks` が undefined/null/empty かどうか) は pure helper として `feedRowPredicates.ts` に追加する: `needsEmptyParagraphFallback(blocks: ReadonlyArray<DtoBlock> | null | undefined): boolean`。
- restart 条件 (iii) の "前サイクル non-empty → 現サイクル absent" の判定は per-row `lastBlocksWasNonEmpty: boolean` $state を使う effectful 判定 (履歴依存のため pure helper の対象外)。
- UUID 生成は **必ず effectful shell** で行う（pure core への持ち込み禁止）。
- `fallbackAppliedFor` / `lastBlocksWasNonEmpty` 状態管理および 2 つの dispatch は `FeedRow.svelte` の `$effect` 内に閉じる。

**Acceptance Criteria**:
- `needsEmptyParagraphFallback(undefined) === true`、`needsEmptyParagraphFallback(null) === true`、`needsEmptyParagraphFallback([]) === true`、`needsEmptyParagraphFallback([{...}]) === false` (pure unit test, PROP-FEED-S5-009)。
- `editingSessionState.blocks === undefined` （ケース 1: REQ-FEED-025 で `blocks` フィールド absent）のとき、対応する `FeedRow` の DOM に `data-testid="block-element"` が 1 個存在し、その `data-block-type === 'paragraph'`、`textContent === ''` である (DOM integration test, PROP-FEED-S5-010)。
- `editingSessionState.blocks === []` （契約上到達不能だが防御的に）のとき、上記同様の挙動 (DOM integration test)。
- fallback で生成された block の `id` は UUID v4 形式 (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`) (DOM test)。
- fallback 適用時、mock adapter で **以下の dispatch 順序が試行される** (両 dispatch とも reject 想定; PROP-FEED-S5-011):
  1. `dispatchInsertBlockAtBeginning({ noteId, type: 'paragraph', content: '', issuedAt: <ISO> })` が **1 回 attempted** (mock の reject も成否を問わずカウント; 注: payload には `id` フィールドを含めない — `BlockEditorAdapter` 型に厳密準拠)
  2. `dispatchFocusBlock({ noteId, blockId: <client-generated UUID>, issuedAt: <ISO> })` が **1 回 attempted** (UUID は FeedRow が `crypto.randomUUID()` で生成し、本 dispatch の `blockId` フィールドにのみ載る)
  3. 試行順序: (1) call が時系列的に (2) call より早い (mock の `mock.invocationCallOrder` 比較)
  4. **両 dispatch reject のもとでも** fallback BlockElement (`data-testid="block-element"` 1 個) が DOM に表示され続ける (best-effort 表示確認)
- **Idempotency 強化テスト** (FIND-S5-SPEC-iter2-005 解消): 以下 4 シナリオ全 PASS (PROP-FEED-S5-011):
  - (a) 同一 `editingNoteId` で `blocks=undefined` を 2 回受信: dispatch attempts = 各 1 回ずつ、UUID 同一
  - (b) `editingNoteId` を `noteA → noteB → noteA` 切り替え後 `noteA` で `blocks=undefined`: 新 UUID で再起動 (UUID 不一致)
  - (c) `blocks=undefined → blocks=[{...}] → blocks=undefined` (同一 noteId): **2 回目の undefined で新 UUID** が発番される (FIND-S5-SPEC-iter2-005, restart 条件 (iii) を発火)
  - (d) `blocks=[{...}]` のみ受信: fallback dispatch attempts = 0 (BlockElement はサーバ提供 blocks で表示)

**Edge Cases**:
- ユーザーが空 paragraph に文字を入力: `BlockElement` の `EditBlockContent` dispatch が発火（ui-block-editor REQ-BE-003、Group B のため Sprint 5 では reject）。**Sprint 5 既知制約**: 文字は client-only の BlockElement state にとどまり Rust 永続化はされない。Sprint 6 以降で Rust handler が実装されると Rust が `blocks` 付き次の `editing_session_state_changed` を emit するようになり、サーバ提供 `blocks` で表示が同期される。
- ユーザーがすぐに別 note を選択: `editingNoteId` 変化により `fallbackAppliedFor` がリセットされ、race で発火中の dispatch Promise は待つだけ。新しい note 選択先で REQ-FEED-029 の `editing_session_state_changed` が arrive 後に必要なら新規 fallback が発火する。
- `dispatchInsertBlockAtBeginning` reject (Group B 未実装、または Rust 側エラー): try/catch で吸収、`fallbackAppliedFor` は **設定する** (block-element は表示されているため idempotent state は維持)、続く `dispatchFocusBlock` も attempt する。
- `dispatchFocusBlock` reject: 同様に try/catch で吸収。BlockElement の visual focus は client-side `isFocused` prop で制御されるため、Rust dispatch 失敗でも UI 上は focus 表示が成立する。

---

### REQ-FEED-032: イベント順序保証 (EC-FEED-017 維持)

**EARS**: WHEN Rust が `select_past_note` および将来の他 handler から state-mutating な emit を行う THEN `editing_session_state_changed` は `feed_state_changed` よりも **必ず先に** emit されなければならない (Sprint 4 までの REQ-FEED-024 / EC-FEED-017 の不変条件)。

> **Sprint 5 で変更しないこと**:
> - emit 順序 (`editing_session_state_changed` → `feed_state_changed`) — Rust 側 invariant
> - `make_editing_state_changed_payload` の生成ロジック (editor.rs)
> - `feed.rs::compose_state_for_select_past_note` の出力契約 (3 ケース固定表 / REQ-FEED-025)
> - `parse_markdown_to_blocks` の non-empty 不変条件 (REQ-FEED-025)
>
> **Sprint 5 で UI 側に課す追加義務**:
> - 購読側 (`+page.svelte` / `FeedList`) は `editing_session_state_changed` 受信ハンドラ内で同期的に `editingSessionState` 状態を更新する（イベントループの後続マイクロタスクに延期しない）。これにより `feed_state_changed` の `feedReducer.DomainSnapshotReceived` が回ってきた時点で `editingSessionState` が最新であることが保証される。

**Acceptance Criteria**:
- 既存 PROP-FEED-S4-008 (Sprint 4 で確立した emit 順序検証) は **そのまま継承**。Sprint 5 で新規テストは不要だが、`editor.rs` の emit 順序を変更しないことを Sprint 5 contract のレッドラインとして記録する (contracts/sprint-5.md)。
- `+page.svelte` または `FeedList` の `editing_session_state_changed` ハンドラ実装は同期的に `$state` を更新する (grep: ハンドラ内に `await` / `Promise.then` / `setTimeout` / `queueMicrotask` を含まない)。
- 受信タイミング regression test: mock emitter で `editing_session_state_changed → feed_state_changed` の順に emit したとき、`feedReducer.DomainSnapshotReceived` 処理時点で `editingSessionState` が新しい値を持つこと (DOM integration test)。

**Edge Cases**:
- Tauri 側で event delivery 順序が `feed_state_changed → editing_session_state_changed` に逆転するケース: Tauri 2 の同一 emitter 内同期 emit はキューイング順を保証するため、現実には起きないと仮定する。万一発生した場合は `feedReducer` の mirror が一瞬古い `editingSessionState` を参照することがあるが、次の `editing_session_state_changed` 受信で復旧する（自己治癒）。

---

### REQ-FEED-033: 旧 EditorPane 関連型/モジュール参照の禁止 (回帰防止)

**EARS**: THE `src/lib/feed/`、`src/routes/+page.svelte`、`src/lib/block-editor/` の production コード (テスト・コメント・migration note を除く) は、以下のいずれの識別子も import / 参照してはならない:

- `EditorPanel` （旧 ui-editor のコンポーネント）
- `editorStateChannel` （旧 ui-editor の inbound channel）
- `tauriEditorAdapter` （旧 ui-editor の outbound adapter）
- `editorReducer` / `editorPredicates` （旧 ui-editor の pure core）
- `EditorViewState` / `EditorAction` / `EditorCommand` / `EditorIpcAdapter` （旧 ui-editor の型）

> **Cross-feature delegation note** (FIND-S5-SPEC-008 解消):
> `src/lib/block-editor/` 配下の forbidden-identifier 監査は **2 つの REQ がオーバーラップ**するが、対象識別子は **完全に互いに素**:
> - **ui-block-editor REQ-BE-027** (authoritative for `src/lib/block-editor/`): `subscribeToState`、`EditorIpcAdapter`、`EditorViewState`、`EditorAction`、`EditorCommand`、`EditingSessionStateDto`、`EditingSessionStatus` — block-editor primitive 内に旧 ui-editor 型契約を持ち込まないことを保証
> - **REQ-FEED-033** (本 REQ, additionally covers `src/lib/block-editor/`): `EditorPanel`、`editorStateChannel`、`tauriEditorAdapter`、`editorReducer`、`editorPredicates` — EditorPane component + outbound/inbound adapter + reducer/predicates の参照を禁止
>
> 両セットの **重複は `EditorIpcAdapter` のみ**であり (REQ-BE-027 のリストに含まれ REQ-FEED-033 のリストには含まれない)、grep regex の和集合を実行することで監査が完結する。Sprint 5 では本 REQ-FEED-033 を pre-merge gate とし、REQ-BE-027 の監査は ui-block-editor 側の責任で並行実行する (両 REQ の監査結果は独立して PASS が必要)。

> **根拠**: `block-based-ui-spec-migration.md` の「削除対象」テーブル。`src/lib/editor/` 配下は物理削除済み。本 REQ は **回帰防止** の grep 検査として spec に固定する。

**Acceptance Criteria**:
- 以下の grep 出力がゼロ行 (production code only):
  ```
  grep -rnE "\b(EditorPanel|editorStateChannel|tauriEditorAdapter|editorReducer|editorPredicates|EditorViewState|EditorAction|EditorCommand|EditorIpcAdapter)\b" \
    promptnotes/src/lib/feed/ \
    promptnotes/src/routes/+page.svelte \
    promptnotes/src/lib/block-editor/ \
    --include='*.ts' --include='*.svelte' \
    | grep -vE '/__tests__/|\.test\.|\.vitest\.|^\s*(//|\*|/\*)'
  ```
- 既存テスト (`promptnotes/src/routes/__tests__/main-route.dom.vitest.ts`) の non-presence 検査が pass する。
- `src/lib/editor/` ディレクトリが存在しない (filesystem check)。

**Edge Cases**:
- コメント・migration 説明文・テストファイル内の説明的言及は許容する（grep の `-v` フィルタで除外）。
- ドキュメント (`docs/`, `CLAUDE.md`, `.vcsdd/features/`) は対象外。

---

## Sprint 5 Edge Case Catalog 追補

| EC-ID | 条件 | 期待動作 |
|-------|------|----------|
| EC-FEED-016 (Sprint 5) | `editing_session_state_changed` 受信時に `blocks` が absent / empty | FeedRow 側で UUID v4 発番の空 paragraph 1 件を fallback として採用し `dispatchFocusBlock` を発火 (REQ-FEED-031) |
| EC-FEED-018 | `editingNoteId` が `visibleNoteIds` から filter で除外された | 対応する FeedRow が unmount し block primitive も破棄。Rust 側 capture state は変更されないため、filter 解除で再 mount 時に直前の blocks が再描画される |
| EC-FEED-019 | 同一 note への二重クリック (race) | 1 回目の click が emit する `editing_session_state_changed` を待つ間に 2 回目 click 発火: `feedReducer` の REQ-FEED-006 ガード (`editingStatus ∈ {'saving','switching'}` のクリック抑止) で no-op (Sprint 1 既存の挙動を継承) |
| EC-FEED-020 | `editing_session_state_changed` ハンドラが mount 直後に到達 | `+page.svelte` の `$effect` 内で listener 登録が完了する前に Rust が emit したケース。Tauri の listen 登録が `await` 解決前であれば payload は loss する。許容 (Tauri の標準仕様)、次の emit で復旧する |

> **Note (EC-FEED-016 Sprint 5 amendment と Sprint 4 amendment の関係)**:
> Sprint 4 amendment では「EditorPane 側が空 paragraph fallback を担当」と記述していた。
> Sprint 5 amendment は EditorPane 廃止に伴い同責務を `FeedRow` に移管する。
> 旧定義は **superseded by REQ-FEED-031** とし、本表の EC-FEED-016 (Sprint 5) 行を最新定義として参照すること。

---

## Sprint 5 Traceability 追補

| REQ-ID | 参照ドキュメント |
|--------|----------------|
| REQ-FEED-028 | `docs/tasks/block-based-ui-spec-migration.md` §コード移行方針 / §アーキテクチャ判断, `docs/domain/bounded-contexts.md` §Capture Context |
| REQ-FEED-029 | `block-based-ui-spec-migration.md` Step 2 (2項目), `editor.rs::make_editing_state_changed_payload`, `ui-block-editor` REQ-BE-026 |
| REQ-FEED-030 | `ui-block-editor` REQ-BE-001/002/003/006/009/013/015/026, `block-based-ui-spec-migration.md` Step 2 (1項目) |
| REQ-FEED-031 | `block-based-ui-spec-migration.md` Step 2 (3項目), `docs/domain/aggregates.md` §Note 不変条件 (最低 1 ブロック保持), `ui-block-editor` REQ-BE-001 |
| REQ-FEED-032 | `block-based-ui-spec-migration.md` Step 2 (4項目), 既存 EC-FEED-017 / REQ-FEED-024 Sprint 4 amendment |
| REQ-FEED-033 | `block-based-ui-spec-migration.md` §削除対象, `ui-block-editor` REQ-BE-027 |

---

## Sprint 6 Extensions

> **背景**: Sprint 5 完了 (Phase 6 PASS at 2026-05-10T08:30:00Z) 後の動作検証で、
> in-place 編集が成立していない問題が発覚した。`FeedRow.svelte` は
> `editingNoteId === self.noteId` のときに `.row-button` (timestamp + body-preview +
> tags + tag-add) を **常時マウントしたまま** `.block-editor-surface` を**追加**で
> マウントするため、preview と editor が縦に重なって表示されていた。
> `behavioral-spec.md` REQ-FEED-030 cell 1 の truth table は preview を**「非表示」**と
> 規定していたが、Sprint 5 Phase 3 の AC は「`block-element` が DOM に存在する」のみを
> 検証し、「preview が消えている」を検証しなかったため見逃された。
>
> Sprint 6 ではこの不整合を解消するため:
> 1. REQ-FEED-030 cell 1 の AC を強化し preview の **DOM unmount** を要求する
>    (新 EARS REQ-FEED-030.1 として明示)
> 2. 行外クリック (preview / timestamp 領域) と行内 BlockElement クリックの責任分担を
>    新 REQ-FEED-034 として明文化する
>
> 根拠: `docs/tasks/block-based-ui-spec-migration.md` §Step 4 (lines 205-271),
> `docs/domain/discovery.md` §エディタ実装方針 (line 49), `docs/domain/workflows.md`
> Workflow 3 (lines 311-321), `behavioral-spec.md:1031-1036` REQ-FEED-030 truth table
> cell 1 (Sprint 5 で確立した「非表示」規定を AC レベルに昇格)。

---

### REQ-FEED-030.1: cell 1 — preview / row-button の DOM unmount (REQ-FEED-030 cell 1 AC 強化)

**EARS**: WHEN `viewState.editingStatus ∈ {'editing', 'saving', 'switching', 'save-failed'}` AND `viewState.editingNoteId === self.noteId` THEN `FeedRow` は `data-testid="row-body-preview"`、`data-testid="row-created-at"`、`data-testid="feed-row-button"` および `.row-button` 配下に置かれる **すべての preview 系要素 (`row-timestamp`, `row-body-preview`, `tag-list`, `tag-actions`, `pending-switch-indicator`)** を **DOM から完全に unmount** しなければならない (`{#if !shouldMountBlocks}` による条件付きレンダリング、`display:none` や `visibility:hidden` を用いた視覚的隠蔽は不可)。

> **設計意図 (FIND-S6-PREVIEW-EXCLUSIVITY)**:
> Notion / Logseq 風 in-place 編集は「フォーカスがあるブロック = 編集中、それ以外 = 表示中」(`docs/domain/discovery.md` §エディタ実装方針) という原則に立脚する。preview と editor が同時に DOM 上に並ぶと、ユーザーには「2 つの異なる表示」が同時に見えることになり、原則に反する。Sprint 5 では `block-editor-surface` が `.row-button` の**下**に置かれていたため preview と editor が縦に重なって表示されていたが、これは「DOM 上に preview が残っている」ことに起因する。よって Sprint 6 では preview を `{#if}` で**実 unmount** することにより、DOM レベルで `row-body-preview` (および兄弟 preview 要素) と `block-element` が**同時刻に共存しない**ことを保証する。

**Mount/unmount truth table** (REQ-FEED-030 §truth table の AC 強化版):

| `editingStatus` | `editingNoteId === self.noteId` | `BlockElement` 表示数 | `row-body-preview` DOM | `feed-row-button` DOM | `delete-button` DOM |
|-----------------|------------------------------|---------------------|----------------------|----------------------|---------------------|
| `∈ {editing, saving, switching, save-failed}` | `true` | `blocks.length` (>= 1; fallback 適用時 = 1) | **不在** (unmount) | **不在** (unmount) | 存在 (disabled, `isDeleteButtonDisabled` で disabled=true) |
| `'idle'` | `true` (architecturally unreachable) | 0 | 存在 | 存在 | 存在 (disabled) |
| `∈ {editing, saving, switching, save-failed}` | `false` | 0 | 存在 | 存在 | 存在 |
| `'idle'` | `false` | 0 | 存在 | 存在 | 存在 |

> **`delete-button` を維持する理由**: `.row-button` 内部の preview とは責務が異なる兄弟要素。`isDeleteButtonDisabled(noteId, editingStatus, editingNoteId)` (既存 pure helper) により編集中 note の delete ボタンは `disabled` 属性で抑制されるため、UI 上はクリック不能。レイアウト崩壊を避けるため DOM には残す (Sprint 1 から維持されている既存挙動)。

**Acceptance Criteria** (Sprint 6 PROP-FEED-S6-001..003):
- (PROP-FEED-S6-001) cell 1 (`editingStatus ∈ {editing, saving, switching, save-failed}` AND `editingNoteId === self.noteId`) のとき、`querySelector('[data-testid="row-body-preview"]')` が **`null`** を返す。同 cell で `querySelector('[data-testid="feed-row-button"]')` も `null` を返す。同 cell で `querySelector('[data-testid="block-element"]')` は **`null` でない**要素を返す。
- (PROP-FEED-S6-001) cell 3 (`editingStatus ∈ {editing,...}` AND `editingNoteId !== self.noteId`) では `querySelector('[data-testid="row-body-preview"]')` が `null` でない (他行は preview 維持)。
- (PROP-FEED-S6-001) cell 4 (`editingStatus === 'idle'` AND `editingNoteId !== self.noteId`) では preview / feed-row-button が DOM に存在する。
- (PROP-FEED-S6-002) **non-coexistence property**: 任意の `viewState` × `editingSessionState` の組合せに対し、同一 `FeedRow` の subtree 内で `[data-testid="row-body-preview"]` と `[data-testid="block-element"]` が **同時に存在することはない** (fast-check property test, 4 cell × random `blocks` count 0..5)。
- (PROP-FEED-S6-003) `display:none` / `visibility:hidden` / `opacity:0` 等の **視覚的隠蔽方式が CSS source に追加されていない** こと: `grep -nE '(display:\s*none|visibility:\s*hidden|opacity:\s*0)' promptnotes/src/lib/feed/FeedRow.svelte` の hit 数が **Sprint 5 baseline と同数以下** (回帰防止)。
- 既存 PROP-FEED-S5-006 (cell 1 の `block-element` count assertion) は維持される。

**Edge Cases**:
- `viewState.editingStatus === 'idle'` AND `viewState.editingNoteId === self.noteId`: architecturally unreachable (REQ-FEED-009 mirror 不変条件)。defensive test では preview を表示する (cell 2)。
- `pending-switch-indicator` (REQ-FEED-026 由来): cell 3 (`editingNoteId !== self.noteId` で `pendingNextFocus.noteId === self.noteId`) で表示される要素。cell 1 の対象行では preview と一緒に unmount される (preview unmount に伴う副次的影響、REQ-FEED-026 の AC は cell 3 でのみ assert)。
- タグ削除中 (`onTagRemove` 実行中) に row が cell 1 に遷移: 既存 onTagRemove handler は `e.stopPropagation()` 済みのため再エントランシーは発生しない。preview unmount により tag-chip も同時 unmount され、ユーザー視点では「即座に編集モードに入る」遷移として整合する。

**根拠**:
- `docs/tasks/block-based-ui-spec-migration.md:236-244` Step 4 第 1 項目 (preview 非マウントの AC 強化)
- `docs/domain/discovery.md:38-49` §エディタ実装方針 (in-place 編集原則)
- `behavioral-spec.md:1031-1036` REQ-FEED-030 truth table cell 1 (Sprint 5 で「非表示」と規定済み、本 REQ で AC 強化)

---

### REQ-FEED-034: 行外クリック vs 行内 BlockElement クリックの責任分担

**EARS**: THE FeedRow は **2 種類のクリック導線** を以下の責任分担で受け持たなければならない:

1. **行外 (`.delete-button` の外側で `feed-row-button` を含むエリア)** が cell 3/cell 4 (preview 表示状態) でクリックされたとき, FeedRow は `onRowClick(noteId)` callback を発火する。callback は `feed.dispatchSelectPastNote(noteId, vaultPath, issuedAt)` 経由で Rust 側 `select_past_note` handler を呼び出し、`editing_session_state_changed` (REQ-FEED-024) と `feed_state_changed` (REQ-FEED-021) を順に emit する。受信後 cell 1 へ遷移する。
2. **行内 BlockElement (`data-testid="block-element"`)** が cell 1 (block-editor-surface マウント中) でクリックされたとき, BlockElement は **ui-block-editor REQ-BE-002b** に従って `adapter.dispatchFocusBlock({ noteId, blockId, issuedAt })` を 1 回発火する。FeedRow 側は当該 click を `onRowClick` に **再ルーティングしない** (`block-editor-surface` は `.row-button` の sibling であり click event は冒泡しても `onRowClick` を起動しない)。

> **二段階クリック (`select-past-note` → `editing_session_state_changed` → 再 click → `dispatchFocusBlock`) の不要性**:
> 行外クリック (行 1) で cell 3 → cell 1 へ遷移したとき、(a) BlockElement は `editingSessionState.focusedBlockId` (REQ-FEED-029) を `isFocused` prop として受け取り、(b) ui-block-editor REQ-BE-002 に従ってマウント時に自動的に `block.focus()` を呼ぶ。よって Rust ラウンドトリップ完了後の自動フォーカスにより、ユーザーは cell 1 の BlockElement に対して**追加クリック不要で即座に文字入力**できる。これが `docs/domain/discovery.md:49` の「『Note Selection で編集対象を切替えてから入力』という二段階操作は不要」原則の UI レイヤ実装である。

> **Cross-feature contract** (FIND-S6-CLICK-DELEGATION):
> 本 REQ は **行外クリックの責任** (FeedRow scope) と **ブロッククリックの責任** (ui-block-editor REQ-BE-002b scope) の境界を明文化するに留まり、新規実装を導入しない。両 REQ は以下の関係を持つ:
> - REQ-FEED-034 (本 REQ): 行外クリック → `onRowClick` → `dispatchSelectPastNote`
> - ui-block-editor REQ-BE-002b: BlockElement の click/focusin → `dispatchFocusBlock`
>
> 両者は**疎結合**で、cell 3 → cell 1 遷移は Rust の `editing_session_state_changed` emit を介する。Sprint 6 では FeedRow 側で**追加の dispatch 連鎖を導入しない** (`dispatchSelectPastNote` + `dispatchFocusBlock` を行外 click で**まとめて**発火する案は、cell 1 で `block-element` が未だマウントされていない瞬間に `dispatchFocusBlock` の `blockId` が確定できないため不採用)。

**Acceptance Criteria**:
- (PROP-FEED-S6-004) cell 3 のとき `feed-row-button` クリックで `tauriFeedAdapter.dispatchSelectPastNote` が `noteId` 引数で 1 回呼ばれる (Sprint 1 PROP-FEED-001 既存契約を Sprint 6 でも維持; Sprint 6 では preview 表示状態でのクリック挙動として再 assert)。
- (PROP-FEED-S6-005) cell 1 (`shouldMountBlocks === true`) では `feed-row-button` 要素が DOM に存在しないため、`feed-row-button` 経由の `dispatchSelectPastNote` 発火は **不能** (REQ-FEED-030.1 unmount により担保)。よって REQ-FEED-006 の「`editingStatus ∈ {'saving','switching'}` クリック抑止ガード」は cell 1 では DOM 不在により**自明に成立**する (defensive test として残す)。
- (PROP-FEED-S6-006) cell 1 で `block-element` (BlockElement) クリックが `onRowClick` を **発火しない** (FeedRow の click event listener は `.row-button` 上にのみ登録され、`.block-editor-surface` には register されない)。
- (PROP-FEED-S6-006) cell 1 で `block-element` クリックが ui-block-editor REQ-BE-002b に従って `adapter.dispatchFocusBlock` を 1 回発火する (cross-feature integration test, mock adapter で観測)。
- 既存 PROP-FEED-S5-019 (REQ-FEED-006 click suppression for `switching`) は cell 3 → cell 1 遷移途中の race として維持。

**Edge Cases**:
- cell 4 → cell 1 遷移途中 (`feed-row-button` クリック直後、Rust ACK 前): `feed-row-button` は依然マウントされた状態で連続クリック可能。`feedReducer` REQ-FEED-006 ガードが `editingStatus === 'switching'` で no-op に抑止する (Sprint 1 既存挙動)。
- cell 1 で `block-editor-surface` の余白部分 (BlockElement の外側、surface 内) クリック: BlockElement の click handler は発火しないが、`.row-button` も unmount されているため `onRowClick` も発火しない。**no-op** が期待挙動。Sprint 6 の AC では surface 余白の click を assert しない (対象外、Sprint 7 以降の design issue)。
- delete-button クリック: cell 1 で `delete-button` は disabled になるため click event は発火しない (`<button disabled>`)。cell 3/4 では `onDeleteClick` が `onRowClick` とは独立に発火する (Sprint 1 既存挙動)。

**根拠**:
- `docs/tasks/block-based-ui-spec-migration.md:245-251` Step 4 第 2 項目 (クリック導線の再設計)
- `docs/domain/discovery.md:49` (二段階クリック不要原則)
- `docs/domain/workflows.md:311-321` Workflow 3 (Block Focus による発動契機)
- `.vcsdd/features/ui-block-editor/specs/behavioral-spec.md:217-235` REQ-BE-002b (BlockElement の click → dispatchFocusBlock)

---

## Sprint 6 Edge Case Catalog 追補

| EC-ID | 条件 | 期待動作 |
|-------|------|----------|
| EC-FEED-021 | cell 3 → cell 1 遷移時の preview unmount race | `editing_session_state_changed` 受信で `editingSessionState` 更新 → `feed_state_changed` 受信で `viewState.editingNoteId` 更新 → `shouldMountBlocks` が `true` に評価 → preview unmount + block-editor-surface mount。Svelte 5 の reactivity 一巡で同一 microtask 内に完了 (REQ-FEED-032 emit 順序保証済み)。中間状態で preview と block-element が同時 DOM 存在することはない (PROP-FEED-S6-002 で property 化) |
| EC-FEED-022 | cell 1 で `editingSessionState` を保ったまま `viewState.editingNoteId` のみ別 note に変化 (REQ-FEED-030 §State source-of-truth row 4) | `shouldMountBlocks` が `false` に評価され preview が再 mount される。fallback state は `viewState.editingNoteId` 変更で reset (Sprint 5 既存挙動) |
| EC-FEED-023 | random click sequence (fast-check) | preview と block-element の同時存在は生じない (PROP-FEED-S6-002) |

---

## Sprint 6 Traceability 追補

| REQ-ID | 参照ドキュメント |
|--------|----------------|
| REQ-FEED-030.1 | `docs/tasks/block-based-ui-spec-migration.md` §Step 4 (1項目), `docs/domain/discovery.md` §エディタ実装方針 (line 49), 旧 REQ-FEED-030 cell 1 truth table |
| REQ-FEED-034 | `docs/tasks/block-based-ui-spec-migration.md` §Step 4 (2項目), `docs/domain/workflows.md` Workflow 3, `ui-block-editor` REQ-BE-002b |

