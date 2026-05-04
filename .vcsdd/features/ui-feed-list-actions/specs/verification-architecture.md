# Verification Architecture: ui-feed-list-actions

**Feature**: `ui-feed-list-actions`
**Phase**: 1b
**Revision**: 3
**Mode**: strict
**Language**: TypeScript (Svelte 5 + SvelteKit + Tauri 2 desktop)
**Source of truth**:
- `specs/behavioral-spec.md` (REQ-FEED-001..018, EC-FEED-001..015)
- `docs/domain/aggregates.md` — `EditingSessionState`, `Feed.computeVisible`, `pendingNextNoteId`
- `docs/domain/workflows.md` — Workflow 3 (EditPastNoteStart), Workflow 5 (DeleteNote)
- `docs/domain/ui-fields.md` — §1B, §画面 3, §画面 4
- `DESIGN.md` §4 Cards / Modals / Buttons / §8 Accessibility
- `.vcsdd/features/ui-editor/specs/verification-architecture.md` — pure core pattern 踏襲

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
- **PROP-FEED-007a** (`feedReducer.ts`): Snapshot mirroring (editing fields) — `FeedAction.kind === 'DomainSnapshotReceived'` のとき、`feedReducer(s, { kind: 'DomainSnapshotReceived', snapshot: S }).state.{editingStatus, editingNoteId, pendingNextNoteId}` が `S.editing.{status, currentNoteId, pendingNextNoteId}` と等しい (`FeedDomainSnapshot.editing` ネスト対応)。
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
| PROP-FEED-007a | REQ-FEED-009, REQ-FEED-013 | `DomainSnapshotReceived` mirroring — editingStatus / editingNoteId / pendingNextNoteId が `S.editing.*` から完全に mirror される | 2 | fast-check | true | pure |
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
| PROP-FEED-023 | REQ-FEED-009, EC-FEED-013 | `pendingNextNoteId !== null` かつ `editingStatus ∈ {'switching', 'save-failed'}` の行に `data-testid="pending-switch-indicator"` 存在 | Integration | vitest + jsdom + Svelte 5 mount | false | shell — `feed-row.dom.vitest.ts` |
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
- `deleteConfirmPredicates.property.test.ts` — PROP-FEED-008, PROP-FEED-009, PROP-FEED-010

Run command: `bun run test` inside `promptnotes/`

### Component / integration tests (DOM tier)

Path: `promptnotes/src/lib/feed/__tests__/*.dom.vitest.ts`

Pattern: vitest + jsdom + `mount`/`unmount`/`flushSync` from `svelte` + `vi.fn()` mock adapter (NO `@testing-library/svelte`)

Files:
- `feed-row.dom.vitest.ts` — PROP-FEED-013, PROP-FEED-014, PROP-FEED-015, PROP-FEED-023
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
  readonly pendingNextNoteId: string | null;
  readonly visibleNoteIds: readonly string[];
  readonly loadingStatus: 'loading' | 'ready';
  readonly activeDeleteModalNoteId: string | null;
  readonly lastDeletionError: { reason: NoteDeletionFailureReason; detail?: string } | null;
  /** Per-noteId row metadata mirrored from FeedDomainSnapshot.noteMetadata (FIND-004). */
  readonly noteMetadata: Readonly<Record<string, NoteRowMetadata>>;
};
```

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
    readonly pendingNextNoteId: string | null;
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

**フィールドの出典**:
- `editing.status` / `editing.currentNoteId` / `editing.pendingNextNoteId` — `docs/domain/aggregates.md` §CaptureSession `EditingSessionState` フィールド (`status`, `currentNoteId`, `pendingNextNoteId`)
- `feed.visibleNoteIds` — `Feed.computeVisible` の結果 (`docs/domain/aggregates.md` §Feed)
- `feed.filterApplied` — `filterCriteria` が非空かどうか (REQ-FEED-007 空状態メッセージの分岐に使用)
- `delete.activeDeleteModalNoteId` / `delete.lastDeletionError` — `FeedViewState` の mirror 先フィールド (§9 FeedViewState)
- `cause` — アップストリームの公開ドメインイベント種別を識別する discriminator。`feedReducer` が `'refresh-feed'` / `lastDeletionError = null` の排出判断に使用する (PROP-FEED-035, PROP-FEED-007d)

**PROP-FEED-007a/b/d との対応**:
- PROP-FEED-007a: `feedReducer(s, { kind: 'DomainSnapshotReceived', snapshot: S }).state.{editingStatus, editingNoteId, pendingNextNoteId}` = `S.editing.{status, currentNoteId, pendingNextNoteId}`
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
