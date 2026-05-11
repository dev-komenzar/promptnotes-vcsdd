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
    - "promptnotes/src-tauri/src/feed.rs"
    - "promptnotes/src-tauri/src/editor.rs"
    - "docs/domain/code/ts/src/capture/states.ts"
    - "docs/domain/code/ts/src/shared/note.ts"
    - "docs/domain/code/ts/src/shared/blocks.ts"
  conventions:
    - targets:
        - "file:promptnotes/src/lib/feed/FeedList.svelte"
        - "file:promptnotes/src/lib/feed/FeedRow.svelte"
        - "file:promptnotes/src/lib/feed/DeleteConfirmModal.svelte"
        - "file:promptnotes/src/lib/feed/DeletionFailureBanner.svelte"
        - "file:promptnotes/src/lib/feed/feedReducer.ts"
        - "file:promptnotes/src/lib/feed/feedRowPredicates.ts"
        - "file:promptnotes/src/lib/feed/deleteConfirmPredicates.ts"
        - "file:promptnotes/src/lib/feed/feedStateChannel.ts"
        - "file:promptnotes/src/lib/feed/tauriFeedAdapter.ts"
        - "file:promptnotes/src/lib/feed/types.ts"
        - "file:promptnotes/src/lib/feed/clockHelpers.ts"
        - "file:promptnotes/src-tauri/src/feed.rs"
        - "file:promptnotes/src-tauri/src/editor.rs"
        - "file:docs/domain/code/ts/src/capture/states.ts"
        - "file:docs/domain/code/ts/src/shared/note.ts"
        - "file:docs/domain/code/ts/src/shared/blocks.ts"
        - "module:ui-feed-list-actions"
        - "module:edit-past-note-start"
        - "module:delete-note"
      reason: "Behavioral spec must be reviewed when declared source files or modules change (GAP-4 PN-6xl)"
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
- EC-FEED-016 (Sprint 4 amendment): `note_id` not found in `note_metadata` (e.g., file deleted between scan and emit): `compose_state_for_select_past_note(note_id, None)` is called; returns `EditingSessionStateDto::Editing` with `blocks: None` (field omitted by `skip_serializing_if = "Option::is_none"`), `focused_block_id: None` (serialized as `null`), `is_note_empty: true`. EditorPane receives `focusedBlockId: null` and generates a default empty paragraph block on its own initiative.
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
