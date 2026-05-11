---
coherence:
  node_id: "design:ui-feed-list-actions-verification"
  type: design
  name: "ui-feed-list-actions 検証アーキテクチャ（純粋性境界・証明義務）"
  depends_on:
    - id: "req:ui-feed-list-actions"
      relation: derives_from
  modules:
    - "ui-feed-list-actions"
  source_files:
    - "promptnotes/src/lib/feed/__tests__"
---

# Verification Architecture: ui-feed-list-actions

**Feature**: `ui-feed-list-actions`
**Phase**: 1b
**Revision**: 6
**Mode**: strict
**Language**: TypeScript (Svelte 5 + SvelteKit + Tauri 2 desktop)
**Source of truth**:
- `specs/behavioral-spec.md` (REQ-FEED-001..027, EC-FEED-001..017)
- `docs/domain/aggregates.md` — `EditingSessionState`, `Feed.computeVisible`, `pendingNextFocus`
- `docs/domain/workflows.md` — Workflow 3 (EditPastNoteStart), Workflow 5 (DeleteNote)
- `docs/domain/ui-fields.md` — §1B, §画面 3, §画面 4
- `DESIGN.md` §4 Cards / Modals / Buttons / §8 Accessibility
- `.vcsdd/features/ui-editor/specs/verification-architecture.md` — pure core pattern 踏襲
- `docs/domain/code/ts/src/capture/states.ts` — `PendingNextFocus` 型契約 **(Sprint 4 追加)**
- `docs/domain/code/ts/src/shared/note.ts` — `Block` / `NoteOps.body` 派生 **(Sprint 4 追加)**
- `promptnotes/src-tauri/src/editor.rs` — `EditingSessionStateDto` 5-arm / `DtoBlock` / `PendingNextFocusDto` **(Sprint 4 追加)**

---

## 1. Purpose & Scope

`ui-feed-list-actions` は Svelte 5 コンポーネント群と純粋関数群で構成されるオーケストレーション UI 層である。ユーザーイベント (行クリック、削除ボタン、モーダルボタン、Esc キー) を `SelectPastNote`、`RequestNoteDeletion`、`ConfirmNoteDeletion`、`CancelNoteDeletion` コマンドへ変換し、受信したドメインスナップショット (`EditingSessionState`、`FeedState`) を `FeedViewState` として反映する。

検証戦略は pure core (状態述語・reducer・エラーメッセージ導出) と effectful shell (Svelte コンポーネント、Tauri IPC アダプター、DOM イベントリスナー) を分離し、純粋モジュールには Tier 2 fast-check プロパティテストを適用する。DOM/IPC 挙動は `ui-editor` フィーチャで確立したパターン (vitest + jsdom + raw Svelte 5 mount API) を踏襲する。

**canonical purity-audit grep pattern** (`ui-editor` verification-architecture.md §2 から継承):

```
Math\.random|crypto\.|performance\.|window\.|globalThis|self\.|document\.|navigator\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\.now\b|\bDate\(|new Date\b|\$state\b|\$effect\b|\$derived\b|import\.meta|invoke\(|@tauri-apps/api
```

> **Note on `timestampLabel` purity**: `new Date(...)` は上記 grep の `new Date\b` にヒットする。`timestampLabel(epochMs: number, locale: string): string` は `Intl.DateTimeFormat(locale)` を直接使い `epochMs` を ms 数値として処理することで `new Date(...)` を使用しない pure 実装とする。これにより purity-audit grep ゼロヒットを保証する (PROP-FEED-031)。実装は `Intl.DateTimeFormat(locale, options).format(epochMs)` パターンを使用する (`Intl.DateTimeFormat#format` は number (Unix ms) を受け入れる)。

純粋モジュールはこの pattern に対してゼロヒットでなければならない。`tsc --strict --noUncheckedIndexedAccess` もパスすること。

---

## 2. Purity Boundary Map

### Pure Core Modules

| Module | 層 | 主な exports | Forbidden APIs (none may appear) |
|--------|---|-------------|----------------------------------|
| `feedRowPredicates.ts` | pure | `isEditingNote(rowNoteId: string, editingNoteId: string \| null): boolean` — `rowNoteId === editingNoteId && editingNoteId !== null`。`isDeleteButtonDisabled(rowNoteId: string, status: FeedViewState['editingStatus'], editingNoteId: string \| null): boolean` — `status ∈ {'editing','saving','switching','save-failed'}` かつ `rowNoteId === editingNoteId` のとき `true`。`bodyPreviewLines(body: string, maxLines: number): readonly string[]` — 改行分割し先頭 `maxLines` 要素を返す。`timestampLabel(epochMs: number, locale: string): string` — `Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(epochMs)` を使用; `new Date(...)` / `Date.now()` を呼ばない。 | canonical purity-audit pattern 全体 |
| `feedReducer.ts` | pure | `feedReducer(state: FeedViewState, action: FeedAction): { state: FeedViewState; commands: ReadonlyArray<FeedCommand> }`. 全 (editingStatus, action.kind) ペアで定義された total function。`FeedViewState` は `EditingSessionState` の UI-side mirror。`commands` は `ReadonlyArray`。`FeedCommand` は discriminated union (§9 参照)。`FeedAction` は discriminated union (§9b 参照)。 | canonical purity-audit pattern 全体 |
| `deleteConfirmPredicates.ts` | pure | `deletionErrorMessage(reason: NoteDeletionFailureReason, detail?: string): string` — `'permission'` / `'lock'` / `'unknown'` に対して文字列を返す。`reason === 'unknown'` かつ `detail !== undefined` のとき `「削除に失敗しました（{detail}）」` を返す (REQ-FEED-014 / REQ-DLN-013 / REQ-DLN-004 対応)。`NoteDeletionFailureReason` は `'permission' \| 'lock' \| 'unknown'` の 3 variant のみ (`'not-found'` は REQ-DLN-005 により UI に到達しない)。total function: never throws。`canOpenDeleteModal(rowNoteId: string, editingNoteId: string \| null): boolean` — `rowNoteId !== editingNoteId \|\| editingNoteId === null`。 | canonical purity-audit pattern 全体 |

### Effectful Shell Modules

| Module | 層 | 理由 |
|--------|---|------|
| `FeedList.svelte` | impure | Svelte 5 component: `$state`, `$derived`, `$effect`, DOM rendering. フィード行リストをレンダリング。 |
| `FeedRow.svelte` | impure | Svelte 5 component: 行クリック・削除ボタンの click/keydown handler。`SelectPastNote` / `RequestNoteDeletion` を adapter 経由で発行。`timestampLabel(epochMs, 'ja-JP')` を呼び出す (locale を注入する側)。 |
| `DeleteConfirmModal.svelte` | impure | Svelte 5 component: モーダル DOM。Esc / backdrop click listener。`ConfirmNoteDeletion` / `CancelNoteDeletion` 発行。 |
| `DeletionFailureBanner.svelte` | impure | Svelte 5 component: `role="alert"` バナー。再試行ボタン。条件付きレンダリング。 |
| `tauriFeedAdapter.ts` | impure | **OUTBOUND only.** `dispatchSelectPastNote`, `dispatchRequestNoteDeletion`, `dispatchConfirmNoteDeletion`, `dispatchCancelNoteDeletion` の Tauri `invoke(...)` ラッパー。`@tauri-apps/api/event listen(...)` は呼ばない。 |
| `feedStateChannel.ts` | impure | **INBOUND only.** `@tauri-apps/api/event listen(...)` ラッパー。`EditingSessionState` / `FeedState` スナップショットの購読。`invoke(...)` は呼ばない。pure tier がこのチャネルを観測することはない。 |
| `clockHelpers.ts` | impure | `Clock.now(): string` を提供するクロックシェル。`Date.now()` / `new Date()` を使用して `issuedAt` タイムスタンプ文字列を生成する。canonical purity-audit grep の対象外。`FeedRow.svelte` / `DeleteConfirmModal.svelte` が `issuedAt` フィールドを必要とする際に呼び出す。|

---

## 3. Verification Tier Assignments

### Tier 0 — Type-level / static guarantees (TypeScript compile-time)

- **`FeedViewState.editingStatus` の exhaustive switch**: `feedReducer.ts` および `FeedRow.svelte` 内の `editingStatus` による switch に `never` チェック default branch を必須とする。新しい status 値追加時にコンパイルエラー。
- **`FeedCommand` discriminated union の exhaustive switch**: shell が `FeedCommand` を処理する switch は `never` branch を必須とする (§9 参照)。
- **`FeedAction` discriminated union の exhaustive switch**: `feedReducer` 内の `action.kind` switch は `never` branch を必須とする (§9b 参照)。新しい action 追加時にコンパイルエラー。
- **`NoteDeletionFailureReason` の exhaustive switch**: `deletionErrorMessage` の switch は `'permission' | 'lock' | 'unknown'` の 3 variant を全て網羅し、未処理 variant でコンパイルエラー。(`'not-found'` は REQ-DLN-005 により UI に到達しないため型から除外。`disk-full` は REQ-DLN-013 により Curate orchestrator が `'unknown'` に正規化するため UI には到達しない。)
- **`FeedViewState` は `EditingSessionState` と別型**: コンポーネントが `EditingSessionState` を直接構築してはならない。`feedReducer` の戻り値は `FeedViewState` 型として宣言。
- **`tauriFeedAdapter.ts` が `listen` を呼ばない / `feedStateChannel.ts` が `invoke` を呼ばない**: 構造的にファイル内 grep で CI 確認 (PROP-FEED-032)。

### Tier 1 — Pure unit tests (vitest, deterministic)

- `feedRowPredicates.test.ts`: `isEditingNote`、`isDeleteButtonDisabled`、`bodyPreviewLines`、`timestampLabel` の全ブランチを example-based テスト。
- `feedReducer.test.ts`: 全 (editingStatus, action.kind) ペアの状態遷移テーブルを example-based テスト。
- `deleteConfirmPredicates.test.ts`: `deletionErrorMessage` の全 3 variant と `canOpenDeleteModal` の example-based テスト。

### Tier 2 — Property tests (fast-check, pure modules only)

fast-check を使用し、全入力ドメインに対して不変条件を検証する。

- **PROP-FEED-001** (`feedRowPredicates.ts`): `isEditingNote` null 安全性 — `isEditingNote(x, null) === false ∀x: string`。`editingNoteId === null` のとき、任意の `rowNoteId` に対して `false` を返す (安全性保証)。
- **PROP-FEED-002** (`feedRowPredicates.ts`): `isDeleteButtonDisabled` 安全性 — `editingNoteId === null` のとき `isDeleteButtonDisabled(any, any_status, null) === false`。status が `'idle'` のとき `isDeleteButtonDisabled(any, 'idle', any) === false`。
- **PROP-FEED-003** (`feedRowPredicates.ts`): `bodyPreviewLines` 長さ保証 — `bodyPreviewLines(body, n).length ≤ n` がすべての `body: string, n: number (n >= 0)` で成立。
- **PROP-FEED-004** (`feedRowPredicates.ts`): `bodyPreviewLines` 内容一致 — `bodyPreviewLines(body, n)` の各要素が `body.split('\n').slice(0, n)` の対応要素と等しい。`tags` 配列についても iteration 順序・長さが保存される (PROP-FEED-034 参照)。
- **PROP-FEED-005** (`feedReducer.ts`): Reducer totality — `feedReducer(state, action)` はすべての `(FeedViewState, FeedAction)` ペアで定義され、throws せず、`state.editingStatus` が 5 値 enum の範囲内で、`commands` が `ReadonlyArray` (undefined でない)。
- **PROP-FEED-006** (`feedReducer.ts`): Reducer purity — 同一 `(state, action)` 引数で 2 回呼んだ結果が deep-equal。参照透明性。
- **PROP-FEED-007a** (`feedReducer.ts`): Snapshot mirroring (editing fields) — `FeedAction.kind === 'DomainSnapshotReceived'` のとき、`feedReducer(s, { kind: 'DomainSnapshotReceived', snapshot: S }).state.{editingStatus, editingNoteId, pendingNextFocus}` が `S.editing.{status, currentNoteId, pendingNextFocus}` と等しい (`FeedDomainSnapshot.editing` ネスト対応)。**Sprint 4 amendment**: `pendingNextNoteId` を `pendingNextFocus: { noteId, blockId } | null` に置換。PROP-FEED-S4-006 に詳細命題あり (§13)。
- **PROP-FEED-007b** (`feedReducer.ts`): Snapshot mirroring (visible notes) — `FeedAction.kind === 'DomainSnapshotReceived'` のとき、`feedReducer(s, action).state.visibleNoteIds` が `S.feed.visibleNoteIds` と等しい (`FeedDomainSnapshot.feed` ネスト対応)。
- **PROP-FEED-007c** (`feedReducer.ts`): Snapshot mirroring (loading status) — `FeedAction.kind === 'LoadingStateChanged'` のとき、`feedReducer(s, { kind: 'LoadingStateChanged', status }).state.loadingStatus` が `status` と等しい。
- **PROP-FEED-007d** (`feedReducer.ts`): Snapshot mirroring (delete modal + error) — `FeedAction.kind === 'DomainSnapshotReceived'` のとき、`feedReducer(s, action).state.activeDeleteModalNoteId` が `S.activeDeleteModalNoteId` と等しい。`∀s, S. action = { kind: 'DomainSnapshotReceived', snapshot: S }` かつ `S.cause.kind === 'NoteFileDeleted'` のとき `feedReducer(s, action).state.lastDeletionError === null` (削除成功で error reset)。
- **PROP-FEED-008** (`deleteConfirmPredicates.ts`): `deletionErrorMessage` totality — すべての `NoteDeletionFailureReason` 値 (`'permission' | 'lock' | 'unknown'`) と任意の `detail?: string` の組み合わせで throws せず、非空文字列を返す。
- **PROP-FEED-009** (`deleteConfirmPredicates.ts`): `deletionErrorMessage` 非空 — `reason ∈ {'permission', 'lock', 'unknown'}` のとき非空文字列を返す。
- **PROP-FEED-010** (`deleteConfirmPredicates.ts`): `canOpenDeleteModal` 対称性 — `canOpenDeleteModal(a, a) === false` がすべての `a: string` で成立 (自己削除不可)。

### Tier 3 — Branch coverage gate (@vitest/coverage-v8)

Stryker は未インストール。`ui-editor` フィーチャのパターンを踏襲し、fast-check (Tier 2) + branch coverage ≥ 95% で同等のリgor を達成する。

**対象 (pure modules only)**:
```
promptnotes/src/lib/feed/feedRowPredicates.ts
promptnotes/src/lib/feed/feedReducer.ts
promptnotes/src/lib/feed/deleteConfirmPredicates.ts
```

**除外**: `**/__tests__/**, **/*.svelte`

Run command: `bun run test:dom -- --coverage` inside `promptnotes/`

Target: **≥ 95% branch coverage** per file.

### Integration tier — vitest + jsdom + raw Svelte 5 mount API

`ui-editor` フィーチャで確立したパターン (`mount`/`unmount`/`flushSync` from `svelte`, `vi.fn()` mock adapter, NO `@testing-library/svelte`) を踏襲する。

Files (実装後の正規パス、Phase 2c リファクタ反映済み):
- `promptnotes/src/lib/feed/__tests__/dom/FeedRow.dom.vitest.ts` — 行クリック、削除ボタン disabled、aria-disabled、`<button>` 要素 a11y (REQ-FEED-015 partial)
- `promptnotes/src/lib/feed/__tests__/dom/FeedList.dom.vitest.ts` — 空状態、ローディング、再描画、フィルタ更新 (PROP-FEED-025 を行表示変化として実装)
- `promptnotes/src/lib/feed/__tests__/dom/DeleteConfirmModal.dom.vitest.ts` — モーダル文言、ボタン、Esc/backdrop、role=dialog + aria-labelledby (PROP-FEED-029 を modal a11y として実装)
- `promptnotes/src/lib/feed/__tests__/dom/DeletionFailureBanner.dom.vitest.ts` — バナー表示 (role=alert)、再試行
- `promptnotes/src/lib/feed/__tests__/refreshFeedEmission.test.ts` (bun:test, Phase 2c で feedReducer.property.test.ts から抽出) — PROP-FEED-035 biconditional

NOTE: 当初想定された `feed-accessibility.dom.vitest.ts` は廃止し、以下に分散実装:
- PROP-FEED-025 (行表示変化、filter update): `FeedList.dom.vitest.ts`
- PROP-FEED-029 (modal role + aria): `DeleteConfirmModal.dom.vitest.ts`
- REQ-FEED-015 a11y (`<button>` 要素): `FeedRow.dom.vitest.ts`
- REQ-FEED-015 keyboard (Enter キー dispatch) は **未実装** — Phase 3 adversary が impl 不足を判断する場合は修正対象。現状は `<button>` ネイティブ動作 (Enter/Space で `click` 発火) に依存。

---

## 4. Proof Obligations

| PROP-ID | REQ-ID | 命題 | Tier | Tool | Required | Pure/Shell |
|---------|--------|------|------|------|----------|-----------|
| PROP-FEED-001 | REQ-FEED-005, REQ-FEED-010 | `isEditingNote(x, null) === false ∀x: string` (null 安全性保証) | 2 | fast-check | true | pure |
| PROP-FEED-002 | REQ-FEED-010 | `isDeleteButtonDisabled(any, any, null) === false`; `isDeleteButtonDisabled(any, 'idle', any) === false` | 2 | fast-check | true | pure |
| PROP-FEED-003 | REQ-FEED-002 | `bodyPreviewLines` 長さ上限 `≤ maxLines` | 2 | fast-check | true | pure |
| PROP-FEED-004 | REQ-FEED-002 | `bodyPreviewLines` 内容 = `body.split('\n').slice(0, n)` と一致 | 2 | fast-check | true | pure |
| PROP-FEED-005 | REQ-FEED-005, REQ-FEED-006, REQ-FEED-009 | `feedReducer` totality — throws せず、editingStatus が 5 値 enum 内、`commands` が `ReadonlyArray` | 2 | fast-check | true | pure |
| PROP-FEED-006 | REQ-FEED-005, REQ-FEED-013 | `feedReducer` purity — 同一入力で deep-equal 出力 | 2 | fast-check | true | pure |
| PROP-FEED-007a | REQ-FEED-009, REQ-FEED-013 | `DomainSnapshotReceived` mirroring — editingStatus / editingNoteId / **pendingNextFocus** が `S.editing.*` から完全に mirror される | 2 | fast-check | true | pure | **Sprint 4 amendment**: `pendingNextNoteId` → `pendingNextFocus`。詳細は §13 PROP-FEED-S4-006 および deprecation note 参照。|
| PROP-FEED-007b | REQ-FEED-007, REQ-FEED-013 | `DomainSnapshotReceived` mirroring — visibleNoteIds が `S.feed.visibleNoteIds` から完全に mirror される | 2 | fast-check | true | pure |
| PROP-FEED-007c | REQ-FEED-008 | `LoadingStateChanged` action で loadingStatus が mirror される | 2 | fast-check | true | pure |
| PROP-FEED-007d | REQ-FEED-011, REQ-FEED-014 | `DomainSnapshotReceived` mirroring — activeDeleteModalNoteId が `S.delete.activeDeleteModalNoteId` から mirror される; `S.cause.kind === 'NoteFileDeleted'` のとき `lastDeletionError === null` にリセットされる | 2 | fast-check | true | pure |
| PROP-FEED-008 | REQ-FEED-014 | `deletionErrorMessage` totality — `'permission' \| 'lock' \| 'unknown'` でthrows せず、非空文字列を返す | 2 | fast-check | true | pure |
| PROP-FEED-009 | REQ-FEED-014 | `deletionErrorMessage` 非空保証 (`permission`/`lock`/`unknown`) および detail 付加 — `reason === 'unknown'` かつ `detail !== undefined` のとき返却文字列に `detail` が含まれる | 2 | fast-check | true | pure |
| PROP-FEED-010 | REQ-FEED-010 | `canOpenDeleteModal(a, a) === false` (自己削除禁止) | 2 | fast-check | true | pure |
| PROP-FEED-011 | REQ-FEED-010 | `isDeleteButtonDisabled` 型レベル exhaustive switch + `FeedViewState` は `EditingSessionState` と別型 | 0 | tsc --strict | true | pure/boundary |
| PROP-FEED-012 | REQ-FEED-014 | `NoteDeletionFailureReason` の exhaustive switch が `'permission' \| 'lock' \| 'unknown'` を完全に網羅し、未処理 variant 追加でコンパイルエラーとなる (`disk-full` は Curate が `'unknown'` に正規化; `'not-found'` は REQ-DLN-005 により UI 到達不能) | 0 | tsc --strict | true | pure |
| PROP-FEED-013 | REQ-FEED-005, REQ-FEED-006 | 行クリック時に `dispatchSelectPastNote` が 1 回呼ばれる。`editingStatus ∈ {'saving','switching'}` 時は 0 回。`loadingStatus !== 'ready'` 時は 0 回。 | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `feed-row.dom.vitest.ts` |
| PROP-FEED-014 | REQ-FEED-010 | 無効化された削除ボタンが `disabled` + `aria-disabled="true"` を保持し、クリックで発行しない | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `feed-row.dom.vitest.ts` |
| PROP-FEED-015 | REQ-FEED-011 | 有効な削除ボタンクリックで `dispatchRequestNoteDeletion` が 1 回、モーダルが DOM に出現 | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `feed-row.dom.vitest.ts` |
| PROP-FEED-016 | REQ-FEED-012 | モーダル文言に「OS のゴミ箱」含む、削除ボタン `data-testid="confirm-delete-button"` 存在 | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `delete-confirm-modal.dom.vitest.ts` |
| PROP-FEED-017 | REQ-FEED-012 | Esc キーで `dispatchCancelNoteDeletion` 1 回、モーダル消える | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `delete-confirm-modal.dom.vitest.ts` |
| PROP-FEED-018 | REQ-FEED-012 | Backdrop クリックで `dispatchCancelNoteDeletion` 1 回 | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `delete-confirm-modal.dom.vitest.ts` |
| PROP-FEED-019 | REQ-FEED-014 | `DeletionFailureBanner` DOM 出現 (`data-testid="deletion-failure-banner"` + `role="alert"`)、再試行ボタンで `dispatchConfirmNoteDeletion` 1 回 | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `deletion-failure-banner.dom.vitest.ts` |
| PROP-FEED-020 | REQ-FEED-007, EC-FEED-001 | `visibleNoteIds.length === 0` かつ filter 非適用で `data-testid="feed-empty-state"` 存在 | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `feed-list-state.dom.vitest.ts` |
| PROP-FEED-021 | REQ-FEED-007, EC-FEED-003 | `visibleNoteIds.length === 0` かつ filter 適用で `data-testid="feed-filtered-empty-state"` 存在 | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `feed-list-state.dom.vitest.ts` |
| PROP-FEED-022 | REQ-FEED-008 | `FeedViewState.loadingStatus === 'loading'` 時に `data-testid="feed-loading"` 存在、行クリック無効 | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `feed-list-state.dom.vitest.ts` |
| PROP-FEED-023 | REQ-FEED-009, EC-FEED-013 | `pendingNextFocus !== null` かつ `editingStatus ∈ {'switching', 'save-failed'}` の行に `data-testid="pending-switch-indicator"` 存在 (Sprint 4 amendment: `pendingNextNoteId` → `pendingNextFocus`) | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `feed-row.dom.vitest.ts` |
| PROP-FEED-024 | REQ-FEED-013 | `NoteFileDeleted` スナップショット受信後に対象行が DOM から消える | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `feed-list-state.dom.vitest.ts` |
| PROP-FEED-025 | REQ-FEED-015 | 行に Enter キーイベントで `dispatchSelectPastNote` 1 回、`tabindex` non-negative | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `feed-accessibility.dom.vitest.ts` |
| PROP-FEED-026 | REQ-FEED-016 | 削除ボタン `:focus-visible` outline `2px solid #097fe8` がソースに存在 | grep of Svelte source | grep | false | shell — `FeedRow.svelte` grep |
| PROP-FEED-027 | REQ-FEED-003, REQ-FEED-004 | DESIGN.md §4 Cards スタイルが `FeedRow.svelte` ソースに存在 (whisper border `rgba(0,0,0,0.1)`, 4-layer shadow, `12px` radius, tag chip `#f2f9ff`, pill `max-width: 160px`) | grep of Svelte source | grep | false | shell — manual + grep |
| PROP-FEED-028 | REQ-FEED-012 | `DeleteConfirmModal.svelte` ソースに 5-layer Deep Shadow + `border-radius: 16px` + `#dd5b00` 削除ボタン背景が存在 | grep of Svelte source | grep | false | shell — manual + grep |
| PROP-FEED-029 | NFR-FEED-001, NFR-FEED-002 | すべての interactive 要素 (行、削除ボタン、モーダルボタン) が non-negative `tabindex`、適切な ARIA 属性を保持 | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `feed-accessibility.dom.vitest.ts` |
| PROP-FEED-030 | NFR-FEED-004 | `grep -r "from 'svelte/store'" src/lib/feed/` がゼロヒット | 0 | grep audit | true | pure/boundary |
| PROP-FEED-031 | NFR-FEED-005 | canonical purity-audit grep が `feedRowPredicates.ts`, `feedReducer.ts`, `deleteConfirmPredicates.ts` に対してゼロヒット | 0 | grep audit | true | pure |
| PROP-FEED-032 | (Tier 0) | IPC boundary audit: `grep "listen" src/lib/feed/tauriFeedAdapter.ts` ゼロヒット; `grep "invoke" src/lib/feed/feedStateChannel.ts` ゼロヒット | 0 | grep audit | true | boundary |
| PROP-FEED-033 | REQ-FEED-001 | `timestampLabel` determinism — `timestampLabel(epochMs, locale)` は同一引数 `(epochMs, locale)` で常に同一文字列を返す (idempotency) | 2 | fast-check | true | pure |
| PROP-FEED-034 | REQ-FEED-003 | tag iteration preservation — `feedRowPredicates` または `FeedRow.svelte` が受け取った `tags: readonly string[]` を順序・長さ保存で出力する | 2 | fast-check | true | pure |
| PROP-FEED-035 | REQ-FEED-017, REQ-FEED-018 | `'refresh-feed'` emission biconditional — `'refresh-feed' ∈ feedReducer(s, action).commands` ⇔ `action.kind ∈ {'FilterApplied','FilterCleared'}` OR (`action.kind === 'DomainSnapshotReceived'` AND `action.snapshot.cause.kind ∈ {'NoteFileSaved','NoteFileDeleted'}`)。REQ-FEED-017 (NoteFileSaved) と REQ-FEED-018 (フィルタ更新) の両方をカバーする。 | 2 | fast-check | true | pure |

---

## 5. Tooling Map

### Pure unit tests

Path: `promptnotes/src/lib/feed/__tests__/*.test.ts`

- `feedRowPredicates.test.ts` — Tier 1, PROP-FEED-001 (example), PROP-FEED-002 (example), PROP-FEED-003 (boundary), PROP-FEED-004 (boundary), PROP-FEED-033 (example)
- `feedReducer.test.ts` — Tier 1, PROP-FEED-005 (cross-product example), PROP-FEED-006 (example), PROP-FEED-007a/b/c/d (example), PROP-FEED-035 (example)
- `deleteConfirmPredicates.test.ts` — Tier 1, PROP-FEED-008 (all 3 variants), PROP-FEED-009 (example), PROP-FEED-010 (example)

Run command: `bun run test` inside `promptnotes/`

### Property tests (fast-check)

Path: `promptnotes/src/lib/feed/__tests__/*.property.test.ts`

- `feedRowPredicates.property.test.ts` — PROP-FEED-001, PROP-FEED-002, PROP-FEED-003, PROP-FEED-004, PROP-FEED-033, PROP-FEED-034
- `feedReducer.property.test.ts` — PROP-FEED-005, PROP-FEED-006, PROP-FEED-007a, PROP-FEED-007b, PROP-FEED-007c, PROP-FEED-007d, PROP-FEED-035
  **Sprint 4 amendment (FIND-S4-SPEC-iter2-003 解消)**: PROP-FEED-S4-006 (`pendingNextFocus` mirroring fast-check) をこのファイルに追加する。PROP-FEED-007a の arbitrary を `pendingNextFocus: { noteId, blockId } | null` に更新する (PROP-FEED-007a → PROP-FEED-S4-006 置換の一環)。
- `deleteConfirmPredicates.property.test.ts` — PROP-FEED-008, PROP-FEED-009, PROP-FEED-010

Run command: `bun run test` inside `promptnotes/`

### Component / integration tests (DOM tier)

Path: `promptnotes/src/lib/feed/__tests__/*.dom.vitest.ts`

Pattern: vitest + jsdom + `mount`/`unmount`/`flushSync` from `svelte` + `vi.fn()` mock adapter (NO `@testing-library/svelte`)

Files:
- `feed-row.dom.vitest.ts` — PROP-FEED-013, PROP-FEED-014, PROP-FEED-015, PROP-FEED-023
  **Sprint 4 amendment (FIND-S4-SPEC-iter2-003 解消)**: PROP-FEED-S4-015 (`pendingNextFocus?.noteId` 判定の DOM integration test) をこのファイルに追加する。
- `feed-list-state.dom.vitest.ts` — PROP-FEED-020, PROP-FEED-021, PROP-FEED-022, PROP-FEED-024
- `delete-confirm-modal.dom.vitest.ts` — PROP-FEED-016, PROP-FEED-017, PROP-FEED-018
- `deletion-failure-banner.dom.vitest.ts` — PROP-FEED-019
- `feed-accessibility.dom.vitest.ts` — PROP-FEED-025, PROP-FEED-029

### Branch coverage

Package: `@vitest/coverage-v8` (existing in `promptnotes/package.json`)

Run command: `bun run test:dom -- --coverage` inside `promptnotes/`

Scope (pure modules only):
```
src/lib/feed/feedRowPredicates.ts
src/lib/feed/feedReducer.ts
src/lib/feed/deleteConfirmPredicates.ts
```

Target: **≥ 95% branch coverage** per file.

### Static / lint checks

- `tsc --noEmit --strict --noUncheckedIndexedAccess` — Tier 0 exhaustive switch, PROP-FEED-011, PROP-FEED-012
- Purity audit grep (Phase 5): canonical pattern から `src/lib/feed/feedRowPredicates.ts`, `feedReducer.ts`, `deleteConfirmPredicates.ts` に対してゼロヒット (PROP-FEED-031)
- Svelte store audit: `grep -r "from 'svelte/store'" src/lib/feed/` — ゼロヒット (PROP-FEED-030)
- IPC boundary audit: `grep "listen" src/lib/feed/tauriFeedAdapter.ts` ゼロヒット; `grep "invoke" src/lib/feed/feedStateChannel.ts` ゼロヒット (PROP-FEED-032)
- Design token audit: DESIGN.md conformance checklist (grep PROP-FEED-027, PROP-FEED-028)

### Sprint 4 Tooling Map Additions (FIND-S4-SPEC-iter2-003 解消)

Sprint 4 PROP の正規テストファイル配置 (Phase 2a 実装者向け一覧):

| PROP-ID | テストファイル (正規パス) | 追加種別 |
|---------|----------------------|---------|
| PROP-FEED-S4-001 | `promptnotes/src-tauri/tests/feed_handlers.rs` | Rust unit test 追加 |
| PROP-FEED-S4-002 | `promptnotes/src-tauri/tests/feed_handlers.rs` | Rust unit test 追加 |
| PROP-FEED-S4-003 | `promptnotes/src-tauri/tests/feed_handlers.rs` | Rust serde test 追加 |
| PROP-FEED-S4-004 | CI scripts / `Makefile` grep audit target | grep audit |
| PROP-FEED-S4-005 | tsc CI (`tsc --noEmit --strict`) | Tier 0 / tsc |
| PROP-FEED-S4-006 | `promptnotes/src/lib/feed/__tests__/feedReducer.property.test.ts` | fast-check test 追加 (PROP-FEED-007a 更新) |
| PROP-FEED-S4-007 | CI scripts / grep audit | grep audit |
| PROP-FEED-S4-008 | CI scripts / grep audit (`FeedRow.svelte`) | grep audit |
| PROP-FEED-S4-009 | CI scripts / grep audit | grep audit |
| PROP-FEED-S4-010 | `promptnotes/src-tauri/tests/feed_handlers.rs` | Rust serde round-trip test 追加 |
| PROP-FEED-S4-011 | tsc CI + grep audit | Tier 0 / tsc + grep |
| PROP-FEED-S4-012 | `promptnotes/src-tauri/tests/feed_handlers.rs` | Rust unit test 追加 |
| PROP-FEED-S4-013 | `promptnotes/src-tauri/tests/feed_handlers.rs` | Rust unit test 追加 |
| PROP-FEED-S4-014 | `promptnotes/src-tauri/tests/feed_handlers.rs` | Rust unit test 追加 |
| PROP-FEED-S4-015 | `promptnotes/src/lib/feed/__tests__/dom/FeedRow.dom.vitest.ts` | DOM integration test 追加 |
| PROP-FEED-S4-016 | Rust: `promptnotes/src-tauri/tests/feed_handlers.rs` (または新規 `promptnotes/src-tauri/tests/parse_markdown_to_blocks_parity.rs`); TS: `promptnotes/src/lib/feed/__tests__/parserParity.test.ts` (新規) | Rust snapshot test + vitest snapshot test |

---

## 6. Coverage Matrix

| ID | PROP-FEED-XXX | Tier | Test path |
|----|--------------|------|-----------|
| REQ-FEED-001 | PROP-FEED-033 (pure: timestampLabel determinism), PROP-FEED-027 (grep: style tokens) | 2 + grep | `feedRowPredicates.property.test.ts`, DESIGN.md grep |
| REQ-FEED-002 | PROP-FEED-003, PROP-FEED-004 | 2 | `feedRowPredicates.property.test.ts` |
| REQ-FEED-003 | PROP-FEED-027 (grep: #f2f9ff, max-width: 160px), PROP-FEED-034 (pure: tag order/length) | grep + 2 | `FeedRow.svelte` grep, `feedRowPredicates.property.test.ts` |
| REQ-FEED-004 | PROP-FEED-027 | grep | `FeedRow.svelte` grep |
| REQ-FEED-005 | PROP-FEED-005, PROP-FEED-013 | 2 + Integration | `feedReducer.property.test.ts`, `feed-row.dom.vitest.ts` |
| REQ-FEED-006 | PROP-FEED-005, PROP-FEED-013 | 2 + Integration | `feedReducer.property.test.ts`, `feed-row.dom.vitest.ts` |
| REQ-FEED-007 | PROP-FEED-020, PROP-FEED-021 | Integration | `feed-list-state.dom.vitest.ts` |
| REQ-FEED-008 | PROP-FEED-007c, PROP-FEED-022 | 2 + Integration | `feedReducer.property.test.ts`, `feed-list-state.dom.vitest.ts` |
| REQ-FEED-009 | PROP-FEED-007a, PROP-FEED-023 | 2 + Integration | `feedReducer.property.test.ts`, `feed-row.dom.vitest.ts` |
| REQ-FEED-010 | PROP-FEED-002, PROP-FEED-010, PROP-FEED-011, PROP-FEED-014 | 0 + 2 + Integration | tsc, `feedRowPredicates.property.test.ts`, `feed-row.dom.vitest.ts` |
| REQ-FEED-011 | PROP-FEED-007d, PROP-FEED-015 | 2 + Integration | `feedReducer.property.test.ts`, `feed-row.dom.vitest.ts` |
| REQ-FEED-012 | PROP-FEED-016, PROP-FEED-017, PROP-FEED-018, PROP-FEED-028 | Integration + grep | `delete-confirm-modal.dom.vitest.ts`, grep |
| REQ-FEED-013 | PROP-FEED-006, PROP-FEED-007a, PROP-FEED-007b, PROP-FEED-024 | 2 + Integration | `feedReducer.property.test.ts`, `feed-list-state.dom.vitest.ts` |
| REQ-FEED-014 | PROP-FEED-008, PROP-FEED-009, PROP-FEED-012, PROP-FEED-019 | 0 + 2 + Integration | tsc, `deleteConfirmPredicates.property.test.ts`, `deletion-failure-banner.dom.vitest.ts` |
| REQ-FEED-015 | PROP-FEED-025 | Integration | `feed-accessibility.dom.vitest.ts` |
| REQ-FEED-016 | PROP-FEED-026 | grep | `FeedRow.svelte` grep |
| REQ-FEED-017 | PROP-FEED-006, PROP-FEED-007a, PROP-FEED-007b, PROP-FEED-035, PROP-FEED-024 | 2 + Integration | `feedReducer.property.test.ts`, `feed-list-state.dom.vitest.ts` |
| REQ-FEED-018 | PROP-FEED-005, PROP-FEED-035, PROP-FEED-024 | 2 + Integration | `feedReducer.property.test.ts`, `feed-list-state.dom.vitest.ts` |
| EC-FEED-001 | PROP-FEED-020 | Integration | `feed-list-state.dom.vitest.ts` |
| EC-FEED-002 | PROP-FEED-013 | Integration | `feed-row.dom.vitest.ts` |
| EC-FEED-003 | PROP-FEED-021 | Integration | `feed-list-state.dom.vitest.ts` |
| EC-FEED-004 | PROP-FEED-013 | Integration | `feed-row.dom.vitest.ts` |
| EC-FEED-005 | PROP-FEED-013 | Integration | `feed-row.dom.vitest.ts` |
| EC-FEED-006 | PROP-FEED-002, PROP-FEED-014 | 2 + Integration | `feedRowPredicates.property.test.ts`, `feed-row.dom.vitest.ts` |
| EC-FEED-007 | PROP-FEED-008, PROP-FEED-019 | 2 + Integration | `deleteConfirmPredicates.property.test.ts`, `deletion-failure-banner.dom.vitest.ts` |
| EC-FEED-008 | PROP-FEED-008, PROP-FEED-019 | 2 + Integration | `deleteConfirmPredicates.property.test.ts`, `deletion-failure-banner.dom.vitest.ts` |
| EC-FEED-009 | PROP-FEED-008, PROP-FEED-019 | 2 + Integration | `deleteConfirmPredicates.property.test.ts`, `deletion-failure-banner.dom.vitest.ts` |
| EC-FEED-011 | PROP-FEED-017 | Integration | `delete-confirm-modal.dom.vitest.ts` |
| EC-FEED-012 | PROP-FEED-018 | Integration | `delete-confirm-modal.dom.vitest.ts` |
| EC-FEED-013 | PROP-FEED-007a, PROP-FEED-023 | 2 + Integration | `feedReducer.property.test.ts`, `feed-row.dom.vitest.ts` |
| EC-FEED-014 | PROP-FEED-020, PROP-FEED-024 | Integration | `feed-list-state.dom.vitest.ts` |
| EC-FEED-015 | PROP-FEED-022 | Integration | `feed-list-state.dom.vitest.ts` |

> **Sprint 4 Coverage Matrix Additions (FIND-S4-SPEC-iter2-003 解消)**:
> 以下の行は §6 主テーブルへの Sprint 4 追記として §13 の独立 table に加えて本テーブルにも記載する。

| REQ-FEED-024 (S4) | PROP-FEED-S4-012, PROP-FEED-S4-013, PROP-FEED-S4-014 | 1 | `promptnotes/src-tauri/tests/feed_handlers.rs` (AppHandle-free unit test) |
| REQ-FEED-025 | PROP-FEED-S4-001, PROP-FEED-S4-002, PROP-FEED-S4-003, PROP-FEED-S4-004, PROP-FEED-S4-016 | 0 + 1 | `feed_handlers.rs` (Rust unit + serde), grep audit, `parserParity.test.ts` (vitest snapshot) |
| REQ-FEED-026 | PROP-FEED-S4-005, PROP-FEED-S4-006, PROP-FEED-S4-007, PROP-FEED-S4-008, PROP-FEED-S4-015 | 0 + 2 + Integration | tsc, grep audit, `feedReducer.property.test.ts` (fast-check), `FeedRow.dom.vitest.ts` (jsdom) |
| REQ-FEED-027 | PROP-FEED-S4-009, PROP-FEED-S4-010, PROP-FEED-S4-011 | 0 + 1 | grep audit, `feed_handlers.rs` (Rust serde), tsc |

---

## 7. Verification Gates

### Phase 2 gate (Red phase entry criterion)

- `Required: true` の全 `PROP-FEED-XXX` に対応する failing test が存在すること。
- regression baseline (ui-app-shell, ui-editor 等の既存テスト) が green であること。
- Red phase evidence:
  ```text
  new-feature-tests: FAIL
  regression-baseline: PASS
  ```

integration-tier tests (`Required: false`) も Red phase で先に書き、Green phase で通す。

### Phase 3 gate (adversarial review criterion)

- pure modules の branch coverage ≥ 95%。
- `Required: true` の全 PROP-FEED-XXX が PASS。
- 全 integration-tier tests が PASS。

### Phase 5 gate (formal hardening criterion)

- **Branch coverage gate**: ≥ 95% on `feedRowPredicates.ts`, `feedReducer.ts`, `deleteConfirmPredicates.ts`。
- **Purity audit**: canonical grep pattern が pure modules でゼロヒット (PROP-FEED-031)。
- **Type safety audit**: `tsc --noEmit --strict --noUncheckedIndexedAccess` が exit 0。
- **Svelte store audit**: `grep -r "from 'svelte/store'" src/lib/feed/` ゼロヒット (PROP-FEED-030)。
- **IPC boundary audit**: `tauriFeedAdapter.ts` に `listen` ゼロ; `feedStateChannel.ts` に `invoke` ゼロ (PROP-FEED-032)。
- **Design-token manual checklist**: DESIGN.md conformance review — `FeedRow.svelte`, `DeleteConfirmModal.svelte`, `DeletionFailureBanner.svelte` のすべての色・px 値が DESIGN.md §10 Token Reference allow-list に含まれること。
- **XSS audit**: `{@html`, `innerHTML`, `outerHTML`, `insertAdjacentHTML` が `src/lib/feed/**` でゼロヒット。

---

## 8. Threat Model & Security Properties

### Body content trust boundary

`Note.body` はユーザー入力 raw テキスト。フィード行でのプレビュー表示は Svelte のデフォルト text binding (`{bodyPreview}`) を使用し、`{@html}` を絶対に使用しない。Phase 5 XSS audit grep で確認。

### NoteId trust boundary

`SelectPastNote.noteId` は `Feed.computeVisible` が返す NoteId のみを使用する。UI がユーザー入力から直接 noteId を構築してはならない。`dispatchSelectPastNote` に渡す noteId は常に `visibleNoteIds` のメンバーである。

### Tauri IPC

`tauriFeedAdapter.ts` が OUTBOUND のみ (`invoke` のみ)、`feedStateChannel.ts` が INBOUND のみ (`listen` のみ) という分離を Phase 5 grep audit で強制する (PROP-FEED-032)。pure-tier modules は `@tauri-apps/api` を import しない。

---

## 9. FeedCommand / FeedViewState / FeedAction Discriminated Unions

pure `feedReducer` と impure shell の契約を定義する。

### FeedCommand

```typescript
type FeedCommand =
  | { kind: 'select-past-note';        payload: { noteId: string; issuedAt: string } }
  | { kind: 'request-note-deletion';   payload: { noteId: string; issuedAt: string } }
  | { kind: 'confirm-note-deletion';   payload: { noteId: string; issuedAt: string } }
  | { kind: 'cancel-note-deletion';    payload: { noteId: string; issuedAt: string } }
  | { kind: 'refresh-feed' }
  | { kind: 'open-delete-modal';       payload: { noteId: string } }
  | { kind: 'close-delete-modal' }
```

### FeedViewState

`FeedViewState` は `EditingSessionState` の UI-side mirror である:

```typescript
type FeedViewState = {
  readonly editingStatus: 'idle' | 'editing' | 'saving' | 'switching' | 'save-failed';
  readonly editingNoteId: string | null;
  readonly pendingNextNoteId: string | null;  // Sprint 1〜3 オリジナル (下記 amendment 参照)
  readonly visibleNoteIds: readonly string[];
  readonly loadingStatus: 'loading' | 'ready';
  readonly activeDeleteModalNoteId: string | null;
  readonly lastDeletionError: { reason: NoteDeletionFailureReason; detail?: string } | null;
  /** Per-noteId row metadata mirrored from FeedDomainSnapshot.noteMetadata (FIND-004). */
  readonly noteMetadata: Readonly<Record<string, NoteRowMetadata>>;
};
```

> **Sprint 4 amendment**: `pendingNextNoteId: string | null` は Sprint 4 で `pendingNextFocus: { noteId: string; blockId: string } | null` に置換される。
> Sprint 4 実装では上記型定義の `pendingNextNoteId` 行を削除し、`pendingNextFocus` 行を追加する。
> 詳細は §13 PROP-FEED-S4-006 / behavioral-spec.md Sprint 4 Extensions REQ-FEED-026 参照。

### FeedDomainSnapshot (§9b)

`DomainSnapshotReceived` アクションのペイロード型。`EditingSessionState` (Capture Context) と `Feed` projection (Curate Context) の両方のフィールドを合成し、`cause` discriminator でアップストリームイベントの種別を識別する。Phase 2 実装者はこの型をそのまま `feedReducer.ts` に書ける完成度とする。fast-check は `FeedDomainSnapshot` の arbitrary を構成してプロパティテストを駆動する。

```typescript
/** Per-note metadata required to render a FeedRow. (FIND-004 extension) */
type NoteRowMetadata = {
  readonly body: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly tags: readonly string[];
};

type FeedDomainSnapshot = {
  readonly editing: {
    readonly status: 'idle' | 'editing' | 'saving' | 'switching' | 'save-failed';
    readonly currentNoteId: string | null;
    readonly pendingNextNoteId: string | null;  // Sprint 1〜3 オリジナル (下記 amendment 参照)
  };
  readonly feed: {
    readonly visibleNoteIds: readonly string[];
    readonly filterApplied: boolean;
  };
  readonly delete: {
    readonly activeDeleteModalNoteId: string | null;
    readonly lastDeletionError: { reason: 'permission' | 'lock' | 'unknown'; detail?: string } | null;
  };
  /**
   * Per-noteId row metadata for rendering (FIND-004 fix).
   * Key is noteId. FeedList reads this to pass real body/createdAt/updatedAt/tags to FeedRow.
   * Eliminates placeholder zeros and empty strings that caused REQ-FEED-001/002/003/017 violations.
   */
  readonly noteMetadata: Readonly<Record<string, NoteRowMetadata>>;
  readonly cause:
    | { readonly kind: 'NoteFileSaved';      readonly savedNoteId: string }
    | { readonly kind: 'NoteFileDeleted';    readonly deletedNoteId: string }
    | { readonly kind: 'NoteDeletionFailed'; readonly failedNoteId: string }
    | { readonly kind: 'EditingStateChanged' }
    | { readonly kind: 'InitialLoad' };
};
```

> **Sprint 4 amendment**: `FeedDomainSnapshot.editing.pendingNextNoteId: string | null` は Sprint 4 で
> `pendingNextFocus: { noteId: string; blockId: string } | null` に置換される。
> Sprint 4 実装では `editing` の型から `pendingNextNoteId` 行を削除し `pendingNextFocus` 行を追加する。
> 詳細は §13 PROP-FEED-S4-006 / behavioral-spec.md Sprint 4 Extensions REQ-FEED-026/027 参照。

**フィールドの出典**:
- `editing.status` / `editing.currentNoteId` / `editing.pendingNextNoteId` — `docs/domain/aggregates.md` §CaptureSession `EditingSessionState` フィールド (`status`, `currentNoteId`, `pendingNextNoteId`)。**Sprint 4 amendment**: `pendingNextNoteId` → `pendingNextFocus: { noteId, blockId } | null`
- `feed.visibleNoteIds` — `Feed.computeVisible` の結果 (`docs/domain/aggregates.md` §Feed)
- `feed.filterApplied` — `filterCriteria` が非空かどうか (REQ-FEED-007 空状態メッセージの分岐に使用)
- `delete.activeDeleteModalNoteId` / `delete.lastDeletionError` — `FeedViewState` の mirror 先フィールド (§9 FeedViewState)
- `cause` — アップストリームの公開ドメインイベント種別を識別する discriminator。`feedReducer` が `'refresh-feed'` / `lastDeletionError = null` の排出判断に使用する (PROP-FEED-035, PROP-FEED-007d)

**PROP-FEED-007a/b/d との対応**:
- PROP-FEED-007a: `feedReducer(s, { kind: 'DomainSnapshotReceived', snapshot: S }).state.{editingStatus, editingNoteId, pendingNextFocus}` = `S.editing.{status, currentNoteId, pendingNextFocus}` **Sprint 4 amendment**: `pendingNextNoteId` を `pendingNextFocus` に読み替える。PROP-FEED-007a は Sprint 4 で PROP-FEED-S4-006 (§13) に置換される。
- PROP-FEED-007b: `feedReducer(s, action).state.visibleNoteIds` = `S.feed.visibleNoteIds`
- PROP-FEED-007d: `S.cause.kind === 'NoteFileDeleted'` のとき `feedReducer(s, action).state.lastDeletionError === null`

---

### FeedAction Discriminated Union (§9b)

`feedReducer` が受け取るアクション型。公開ドメインイベントとユーザーインタラクションを reducer に橋渡しする。`ui-editor` の `EditorAction` パターンを踏襲する。

```typescript
type FeedAction =
  | { kind: 'DomainSnapshotReceived';   snapshot: FeedDomainSnapshot }
  | { kind: 'FeedRowClicked';           noteId: string }
  | { kind: 'DeleteButtonClicked';      noteId: string }
  | { kind: 'DeleteConfirmed';          noteId: string }
  | { kind: 'DeleteCancelled' }
  | { kind: 'DeletionRetryClicked';     noteId: string }
  | { kind: 'DeletionBannerDismissed' }
  | { kind: 'LoadingStateChanged';      status: FeedViewState['loadingStatus'] }
  | { kind: 'FilterApplied';            visibleNoteIds: readonly string[] }
  | { kind: 'FilterCleared';            visibleNoteIds: readonly string[] }
```

**Action → REQ mapping**:

| FeedAction.kind | 対応 REQ | 生成される FeedCommand / state 変化 |
|----------------|---------|----------------------------------|
| `DomainSnapshotReceived` | REQ-FEED-005, 007, 008, 009, 013, 014, 017 | state 全フィールドを snapshot に mirror; `cause.kind === 'NoteFileDeleted'` のとき `lastDeletionError = null` + `{ kind: 'refresh-feed' }` emit; `cause.kind === 'NoteFileSaved'` のとき `{ kind: 'refresh-feed' }` emit |
| `FeedRowClicked` | REQ-FEED-005, REQ-FEED-006 | `editingStatus ∉ {'saving','switching'}` かつ `loadingStatus === 'ready'` のとき `{ kind: 'select-past-note' }` emit |
| `DeleteButtonClicked` | REQ-FEED-011 | `{ kind: 'request-note-deletion' }` + `{ kind: 'open-delete-modal' }` emit |
| `DeleteConfirmed` | REQ-FEED-012 | `{ kind: 'confirm-note-deletion' }` + `{ kind: 'close-delete-modal' }` emit |
| `DeleteCancelled` | REQ-FEED-012 | `{ kind: 'cancel-note-deletion' }` + `{ kind: 'close-delete-modal' }` emit |
| `DeletionRetryClicked` | REQ-FEED-014 | `{ kind: 'confirm-note-deletion' }` emit (noteId は `lastDeletionError` 発生時の noteId を使用) |
| `DeletionBannerDismissed` | REQ-FEED-014 | `state.lastDeletionError = null` |
| `LoadingStateChanged` | REQ-FEED-008 | `state.loadingStatus` を更新 |
| `FilterApplied` | REQ-FEED-018 | `state.visibleNoteIds` を更新 + `{ kind: 'refresh-feed' }` emit |
| `FilterCleared` | REQ-FEED-018 | `state.visibleNoteIds` を更新 + `{ kind: 'refresh-feed' }` emit |

**`'refresh-feed'` 排出条件** (PROP-FEED-035 で検証):

`'refresh-feed' ∈ commands` ⇔ 以下のいずれか:
- `action.kind ∈ {'FilterApplied', 'FilterCleared'}` (REQ-FEED-018 カバー)
- `action.kind === 'DomainSnapshotReceived'` AND `action.snapshot.cause.kind ∈ {'NoteFileSaved', 'NoteFileDeleted'}` (REQ-FEED-017 / REQ-FEED-013 カバー)

上記以外の `FeedAction.kind` では `'refresh-feed'` は**排出されない**。双条件 (biconditional) のため、右辺の条件を満たさない action では常に `'refresh-feed'` は含まれない。

### Tier 0 exhaustive-switch obligation (impure shell)

shell は `FeedCommand` を処理する switch に `never` default branch を持つこと。新しい variant 追加でコンパイルエラー。`feedReducer` は `FeedAction.kind` の switch に `never` default branch を持つこと。

---

## 10. Out-of-Scope

- タグチップ操作 (`AddTagViaChip` / `RemoveTagViaChip`): `tag-chip-update` フィーチャ管轄。
- フィルタ・検索・ソート UI: `apply-filter-or-search` フィーチャ管轄。
- エディタ UI (`EditorPanel.svelte`): `ui-editor` フィーチャ管轄。
- `CaptureAutoSave` 保存失敗バナー (`SaveFailureBanner.svelte`): `ui-editor` フィーチャ管轄。
- Vault 設定モーダル: `ui-app-shell` / `configure-vault` フィーチャ管轄。
- `fs.trashFile` の Rust 実装正当性: `delete-note` フィーチャの Kani 証明義務。
- `EditPastNoteStart` パイプライン内部 (`flushCurrentSession`, `startNewSession`): `edit-past-note-start` フィーチャ管轄。UI は `SelectPastNote` コマンドを発行するのみ。

---

## 11. Sprint 2 Verification Extensions

> **Sprint**: 2
> **Scope**: Rust backend handlers (`feed.rs`) + `feed_state_changed` event emitter + `+page.svelte` AppShell mount.

### Sprint 2 Purity Boundary Additions

| Module | Layer | Classification |
|--------|-------|---------------|
| `src-tauri/src/feed.rs` | Rust impure | I/O (`std::fs::remove_file`), Tauri `AppHandle.emit`, file system scan |
| `+page.svelte` (main route) | impure | Svelte 5 component, `$effect`, Tauri `invoke` for initial state |

### Sprint 2 Proof Obligations

| PROP-ID | REQ-ID | Description | Tier | Tool | Required |
|---------|--------|-------------|------|------|----------|
| PROP-FEED-S2-001 | REQ-FEED-019 | `fs_trash_file` with non-existent path returns `Ok(())` (not-found = already deleted) | Rust unit | cargo test | true |
| PROP-FEED-S2-002 | REQ-FEED-019 | `TrashErrorDto` serializes with correct `kind` discriminator (`permission`, `unknown`) | Rust unit | cargo test | true |
| PROP-FEED-S2-003 | REQ-FEED-020 | `select_past_note` handler emits `feed_state_changed` event | Rust integration | cargo test | true |
| PROP-FEED-S2-004 | REQ-FEED-020 | `confirm_note_deletion` calls trash impl then emits `feed_state_changed` | Rust integration | cargo test | true |
| PROP-FEED-S2-005 | REQ-FEED-023 | `+page.svelte` in Configured state mounts both `FeedList` (in `.feed-sidebar`) and `EditorPane` (in `.editor-main`) | vitest + jsdom | vitest | true |
| PROP-FEED-S2-006 | REQ-FEED-023 | Layout container uses `display: grid` and `grid-template-columns: 320px 1fr` | grep of +page.svelte | grep | true |
| PROP-FEED-S2-007 | REQ-FEED-023 | Sidebar border uses DESIGN.md whisper border `#e9e9e7` | grep of +page.svelte | grep | true |

### Sprint 2 Rust Testing Tier

- **Tier**: Rust unit tests (`cargo test`) in `promptnotes/src-tauri/tests/feed_handlers.rs` (integration test file).
- **Pattern**: Direct function-level tests for pure-ish functions (`fs_trash_file_impl`, `TrashErrorDto` serde), plus handler-level tests where feasible without a live Tauri AppHandle.
- **Limitation**: `AppHandle`-requiring handlers (`select_past_note`, `confirm_note_deletion`) are verified by compilation correctness and by checking the emit call structure in code review. Full integration (with mock AppHandle) is deferred to Phase 5 if needed.

### Sprint 2 TS DOM Integration Test

File: `promptnotes/src/routes/__tests__/main-route.dom.vitest.ts`

Tests (PROP-FEED-S2-005):
- Mount `+page.svelte` equivalent layout structure in jsdom with mocked adapters.
- Assert `.feed-sidebar` and `.editor-main` elements are present in DOM.
- Assert grid layout styles are applied to the container.

> **Note**: Full `+page.svelte` mount requires SvelteKit route context. The test mounts the layout structure directly (same pattern as existing DOM tests in `src/lib/feed/__tests__/dom/`). The test imports the layout components directly rather than routing through SvelteKit.

---

## 12. Sprint 3 Verification Extensions

> **Sprint**: 3
> **Scope**: Fix `select_past_note` — add `editing_session_state_changed` emit so that clicking a past note row updates EditorPane with the note body.

### Sprint 3 Proof Obligations

| PROP-ID | REQ-ID | Description | Tier | Tool | Required |
|---------|--------|-------------|------|------|----------|
| PROP-FEED-S2-008 | REQ-FEED-024 | `select_past_note` emits both `feed_state_changed` AND `editing_session_state_changed` with correct payload: `{ state: { status: "editing", isDirty: false, currentNoteId: note_id, pendingNextNoteId: null, lastError: null, body } }`. Rust integration test. | Rust integration | cargo test | true |

### Sprint 3 Rust Test Additions

File: `promptnotes/src-tauri/tests/feed_handlers.rs`

Three new tests:
1. `test_select_past_note_emits_editing_session_state_changed` — verifies both events are emitted AND `editing_session_state_changed` fires before `feed_state_changed`
2. `test_select_past_note_editing_payload_contains_body` — verifies all 6 payload fields, body matches file content
3. `test_select_past_note_nonexistent_body_is_empty` — verifies empty body for non-existent note_id

### Sprint 3 Implementation Change

File: `promptnotes/src-tauri/src/feed.rs`

`select_past_note` function: after constructing snapshot, extract `body` from `note_metadata`, construct `editing_session_state_changed` payload via `editor::make_editing_state_changed_payload`, and emit it before the existing `feed_state_changed` emit.

> **Known limitation** (FIND-S3-005): If `editing_session_state_changed` emit succeeds but `feed_state_changed` emit fails, the function returns `Err` but the first event has already been published. This is an existing pattern in the codebase (all multi-emit handlers share this limitation) and is not addressed in Sprint 3. A future generalized solution (e.g., transactional emit or compensation logic) would apply to all handlers.

---

## 13. Sprint 4 Verification Extensions

> **Sprint**: 4
> **Scope**: Block-aware 拡張 — `compose_state_for_select_past_note` の block-aware シグネチャ変更、TS Feed mirror の `pendingNextFocus` 拡張、Rust `EditingSubDto` の `pending_next_focus` フィールド追加。既存 §1〜§12 は不変。

### Sprint 4 Purity Boundary Notes

§1 の canonical purity-audit grep pattern は変更なし。既存パターンが新 mirror state (`pendingNextFocus`) でも有効:
- `feedReducer.ts` は `pendingNextFocus` を純粋 mirror で設定するだけなので purity-audit ゼロヒットを維持。
- `FeedViewState` の型変更は型レベルのみであり、実行時副作用を導入しない。
- §2 Purity Boundary Map のモジュール分類は変更なし。

### Sprint 4 Proof Obligations

| PROP-ID | REQ-ID | Description | Tier | Tool | Required |
|---------|--------|-------------|------|------|----------|
| PROP-FEED-S4-001 | REQ-FEED-025 | `compose_state_for_select_past_note(note_id, Some(blocks))` が `EditingSessionStateDto::Editing { blocks: Some(blocks), focused_block_id: Some(blocks[0].id), ... }` を返す。`compose_state_for_select_past_note(note_id, None)` が `blocks: None, focused_block_id: None` を返す。Rust unit test (FIND-S4-SPEC-001 解消: Option シグネチャ)。 | 1 | cargo test | true |
| PROP-FEED-S4-002 | REQ-FEED-025 | `compose_state_for_select_past_note(note_id, Some(vec![]))` で `is_note_empty: true`、`focused_block_id: None`。`compose_state_for_select_past_note(note_id, None)` で `is_note_empty: true`、`focused_block_id: None`。単一空 paragraph `Some([{id,Paragraph,""}])` では `is_note_empty: true`、`focused_block_id: Some(id)`。複数 block では `is_note_empty: false`。Rust unit test (3 ケース固定表対応)。 | 1 | cargo test | true |
| PROP-FEED-S4-003 | REQ-FEED-025 | `make_editing_state_changed_payload` に `compose_state_for_select_past_note` 出力を渡したとき、生成 JSON に `blocks` 配列フィールドが存在し、`body` フィールドが存在しない。Rust serde round-trip test。 | 1 | cargo test | true |
| PROP-FEED-S4-004 | REQ-FEED-025 | 旧シグネチャ `fn compose_state_for_select_past_note(...body: &str...)` の廃止確認 (FIND-S4-SPEC-007 解消)。実行コマンド: `rg -n 'fn compose_state_for_select_past_note\([^)]*body: ?&str' promptnotes/src-tauri/src/` — 0 ヒットを assertion とする。 | 0 | grep audit (rg) | true |
| PROP-FEED-S4-005 | REQ-FEED-026 | `FeedViewState.pendingNextFocus` フィールドが存在し `pendingNextNoteId` フィールドが存在しない (tsc --strict exit 0)。 | 0 | tsc --strict | true |
| PROP-FEED-S4-006 | REQ-FEED-026 | `feedReducer(s, { kind: 'DomainSnapshotReceived', snapshot: S }).state.pendingNextFocus` が `S.editing.pendingNextFocus` と deep-equal。fast-check arbitrary で `pendingNextFocus: null | { noteId, blockId }` の両ケースを検証。 | 2 | fast-check | true |
| PROP-FEED-S4-007 | REQ-FEED-026 | TS 側コード全体で旧フィールド名が完全削除されていることを確認 (FIND-S4-SPEC-009 解消)。実行コマンド: `grep -r "pendingNextNoteId" promptnotes/src/` — 0 ヒットを assertion とする (対象: `src/lib/feed/`, `src/routes/`, `src/lib/` 上位を含む TS 全体)。 | 0 | grep audit | true |
| PROP-FEED-S4-008 | REQ-FEED-026 | `FeedRow.svelte` の `showPendingSwitch` 式に `pendingNextFocus?.noteId === noteId` が使われている (grep)。 | 0 | grep audit | true |
| PROP-FEED-S4-009 | REQ-FEED-027 | Rust 側コード全体で旧フィールド名が完全削除されていることを確認 (FIND-S4-SPEC-009 解消)。実行コマンド: `grep -r "pending_next_note_id" promptnotes/src-tauri/src/` — 0 ヒットを assertion とする (対象: `feed.rs`, `editor.rs` などを含む `src-tauri/src/` 全体)。`EditingSubDto` に `pending_next_focus: Option<PendingNextFocusDto>` が存在する (grep)。 | 0 | grep audit | true |
| PROP-FEED-S4-010 | REQ-FEED-027 | `FeedDomainSnapshotDto` を JSON serialize したとき `editing.pendingNextFocus` が `null` または `{ noteId, blockId }` として出力される。Rust serde round-trip test。 | 1 | cargo test | true |
| PROP-FEED-S4-011 | REQ-FEED-027 | TS 側 `FeedDomainSnapshot.editing.pendingNextNoteId` が存在しない (FIND-S4-SPEC-009 解消)。実行コマンド (1): `grep -r "pendingNextNoteId" promptnotes/src/` — 0 ヒット。実行コマンド (2): `tsc --noEmit --strict --noUncheckedIndexedAccess` — exit 0。両条件が成立することを assertion とする。 | 0 | tsc --noEmit --strict --noUncheckedIndexedAccess + grep | true |
| PROP-FEED-S4-012 | REQ-FEED-024 | `compose_state_for_select_past_note(note_id, Some(blocks)) → make_editing_state_changed_payload(...)` の chain を `serde_json::to_string` して JSON parse した結果に `body` キーが absent であること (FIND-S4-SPEC-011 解消: AppHandle 不要な Rust unit test)。 | 1 | cargo test (unit) | true |
| PROP-FEED-S4-013 | REQ-FEED-024 | `compose_state_for_select_past_note(note_id, Some(blocks)) → make_editing_state_changed_payload(...)` の chain を JSON serialize した結果に `focusedBlockId` フィールドが存在し、`blocks[0].id` と等しいこと (FIND-S4-SPEC-011 解消: AppHandle 不要な Rust unit test)。 | 1 | cargo test (unit) | true |
| PROP-FEED-S4-014 | REQ-FEED-024, EC-FEED-016 | `compose_state_for_select_past_note(note_id, None) → make_editing_state_changed_payload(...)` の chain を JSON serialize した結果で `focusedBlockId: null`、`blocks` キー absent、`isNoteEmpty: true` であること (FIND-S4-SPEC-011 解消: AppHandle 不要な Rust unit test; ケース 1 対応)。 | 1 | cargo test (unit) | true |
| PROP-FEED-S4-015 | REQ-FEED-026 | DOM integration: `pendingNextFocus?.noteId === noteId` かつ `editingStatus ∈ {'switching', 'save-failed'}` のとき `data-testid="pending-switch-indicator"` が存在する。`pendingNextFocus?.noteId !== noteId` のとき不在。 | Integration | vitest + jsdom + Svelte 5 mount | false |
| PROP-FEED-S4-016 | REQ-FEED-025 | Rust `parse_markdown_to_blocks` と TS `parseMarkdownToBlocks` の output 一致 (FIND-S4-SPEC-008 / FIND-S4-SPEC-002 / FIND-S4-SPEC-iter2-002 解消)。Sprint 4 スコープ: 基本ケースのスナップショット比較 — `parse_markdown_to_blocks("# heading\n\nparagraph")` の Rust 出力 (JSON) と TS 出力を手動スナップショットで比較し、block `type`/`content`/`id` 構造が一致することを cargo test + vitest の両方で assert する。fast-check による全 markdown 任意入力 property test は Sprint 5 へ deferral。**Sprint 4 ゲートでは基本ケーススナップショット 1 ペアの PASS をもって Phase 5 gate を満たすとする。** | 1 | cargo test + vitest (snapshot) | true |

> **Sprint 4 deprecation note (FIND-S4-SPEC-010 解消)**:
> PROP-FEED-007a は Sprint 4 で **PROP-FEED-S4-006 に置換**される。
> `pendingNextNoteId` の文字列はすべて `pendingNextFocus: { noteId: string; blockId: string } | null` に読み替える。
> §3 / §4 / §9 / §9b に残る `pendingNextNoteId` の記述は Sprint 1〜3 オリジナルとして保持しつつ、
> 各所に "Sprint 4 amendment" 注を追記済み (§3 PROP-FEED-007a 説明、§4 PROP table、§9 FeedViewState 型、§9b FeedDomainSnapshot 型・フィールド出典・PROP-FEED-007a/b/d 対応表)。
> Phase 2a 実装者は PROP-FEED-S4-006 (§13) を正規命題として実装する。PROP-FEED-007a は Sprint 5 以降に削除予定。

### Sprint 4 Rust Test Strategy

**File**: `promptnotes/src-tauri/tests/feed_handlers.rs`

New tests to add (Sprint 4):
1. `test_compose_state_for_select_past_note_with_some_blocks` — PROP-FEED-S4-001 ケース 2: `Some(vec![block])` で `blocks: Some(...)`, `focused_block_id: Some(block.id)`, `is_note_empty: false`。
2. `test_compose_state_for_select_past_note_with_none` — PROP-FEED-S4-001 ケース 1: `None` で `blocks: None`, `focused_block_id: None`, `is_note_empty: true`。
3. `test_compose_state_for_select_past_note_with_empty_vec` — PROP-FEED-S4-002 ケース 3: `Some(vec![])` で `is_note_empty: true`, `focused_block_id: None`。
4. `test_payload_json_blocks_present_no_body` — PROP-FEED-S4-012/013: JSON に `blocks` あり `body` なし、`focusedBlockId` 値正しい (unit test via `serde_json::to_string`)。
5. `test_payload_json_none_blocks_absent` — PROP-FEED-S4-014: `None` 入力で `blocks` キー absent、`focusedBlockId: null` (unit test)。
6. `test_editing_sub_dto_pending_next_focus_serialization` — PROP-FEED-S4-010: `EditingSubDto` serializes `pendingNextFocus: null` and `{ noteId, blockId }` correctly.
7. `test_parse_markdown_to_blocks_snapshot` — PROP-FEED-S4-016 (Sprint 4 snapshot): 基本 markdown の block 構造確認。

Sprint 3 tests `test_select_past_note_editing_payload_contains_body` must be **replaced** (body field removed). New test verifies `blocks` array presence and `focusedBlockId` presence instead (AppHandle 不要な unit test として実装).

### Sprint 4 TS Test Strategy

**Files affected**:
- `feedReducer.property.test.ts` — update PROP-FEED-007a arbitrary to use `pendingNextFocus: { noteId, blockId } | null`.
- `feedReducer.test.ts` — update example-based tests for `DomainSnapshotReceived` that use `pendingNextNoteId` → `pendingNextFocus`.
- `feed-row.dom.vitest.ts` — update PROP-FEED-023 integration test to use `pendingNextFocus: { noteId, blockId }` in mock state.
- All `FeedViewState` and `FeedDomainSnapshot` constructors in test files to remove `pendingNextNoteId` and add `pendingNextFocus`.

### Sprint 4 Coverage Matrix Additions

| ID | PROP-FEED-S4-XXX | Tier | Test path |
|----|-----------------|------|-----------|
| REQ-FEED-025 | PROP-FEED-S4-001, PROP-FEED-S4-002, PROP-FEED-S4-003, PROP-FEED-S4-004, PROP-FEED-S4-016 | 0 + 1 | cargo test, grep, vitest snapshot |
| REQ-FEED-026 | PROP-FEED-S4-005, PROP-FEED-S4-006, PROP-FEED-S4-007, PROP-FEED-S4-008, PROP-FEED-S4-015 | 0 + 2 + Integration | tsc, grep, fast-check, vitest+jsdom |
| REQ-FEED-027 | PROP-FEED-S4-009, PROP-FEED-S4-010, PROP-FEED-S4-011 | 0 + 1 | grep, cargo test, tsc |
| REQ-FEED-024 (S4) | PROP-FEED-S4-012, PROP-FEED-S4-013, PROP-FEED-S4-014 | 1 | cargo test (unit, AppHandle-free) |
