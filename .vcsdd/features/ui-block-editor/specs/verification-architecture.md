---
coherence:
  node_id: "design:ui-block-editor-verification"
  type: design
  name: "ui-block-editor 検証アーキテクチャ（純粋性境界・証明義務）"
  depends_on:
    - id: "req:ui-block-editor"
      relation: derives_from
    - id: "design:aggregates"
      relation: derives_from
    - id: "design:type-contracts"
      relation: derives_from
  modules:
    - "ui-block-editor"
  source_files:
    - "promptnotes/src/lib/block-editor/__tests__"
---

# Verification Architecture: ui-block-editor

**Feature**: `ui-block-editor`
**Phase**: 1b
**Revision**: 1
**Mode**: strict
**Language**: TypeScript (Svelte 5 + SvelteKit + Tauri 2 desktop)
**Created**: 2026-05-09

**Source of truth**:
- `specs/behavioral-spec.md`（REQ-BE-001..027 / EC-BE-001..013 / NFR-BE-001..005）
- `docs/domain/aggregates.md` §Block 操作 / §EditingSessionState
- `docs/domain/code/ts/src/shared/note.ts`（`Block`/`NoteOps`）
- `docs/domain/code/ts/src/shared/blocks.ts`（`serializeBlocksToMarkdown`/`parseMarkdownToBlocks`）
- `docs/domain/code/ts/src/shared/errors.ts`（`SaveError`/`FsError`/`SaveValidationError`）
- `docs/domain/code/ts/src/capture/commands.ts`（`CaptureCommand`）
- 旧 `ui-editor` の `verification-architecture.md` の pure-core / effectful-shell 分離パターン（**spec 内容は参照しない、構造のみ参考**）

---

## 1. Purpose & Scope

`ui-block-editor` は Svelte 5 コンポーネント群と純粋関数群で構成される block 編集プリミティブ層である。本フィーチャの検証戦略は次の 2 つの分離を厳守することにある:

1. **Pure Core**: 状態遷移を持たない、入力のみに依存する純粋関数（`blockPredicates.ts` / `debounceSchedule.ts`）
2. **Effectful Shell**: DOM・タイマー・IPC を扱う Svelte コンポーネント群と effectful adapter

純粋モジュールには Tier 2 fast-check プロパティテストを適用し、コンポーネント挙動は Tier 1〜2 の vitest + jsdom + raw Svelte 5 mount API で検証する。EditingSessionState の保存・配送ロジックは本 feature の責務外（FeedReducer / Tauri SessionStore に移管済）であり、ここでは検証しない。

### canonical purity-audit grep pattern

旧 ui-editor で確立した pattern を継承する:

```
Math\.random|crypto\.|performance\.|window\.|globalThis|self\.|document\.|navigator\.|requestAnimationFrame|requestIdleCallback|localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|setTimeout|setInterval|clearTimeout|clearInterval|Date\.now\b|\bDate\(|new Date\b|\$state\b|\$effect\b|\$derived\b|import\.meta|invoke\(|@tauri-apps/api
```

純粋モジュール（`blockPredicates.ts` / `debounceSchedule.ts`）はこの pattern に対してゼロヒットでなければならない。`tsc --strict --noUncheckedIndexedAccess` も pass すること。

---

## 2. Purity Boundary Map

### Pure Core Modules

| Module | 層 | 主な exports | Forbidden APIs |
|--------|---|-------------|----------------|
| `blockPredicates.ts` | pure | `bannerMessageFor(error: SaveError): string \| null`、`classifySource(triggerKind: 'idle'\|'blur'): 'capture-idle'\|'capture-blur'`、`splitOrInsert(offset: number, contentLength: number): 'split'\|'insert'`、`classifyMarkdownPrefix(content: string): { newType: BlockType; trimmedContent: string } \| null`、`classifyBackspaceAtZero(focusedIndex: number, blockCount: number): 'merge' \| 'remove-empty-noop' \| 'first-block-noop' \| 'normal-edit'` | canonical purity-audit pattern 全体 |
| `debounceSchedule.ts` | pure | 定数 `IDLE_SAVE_DEBOUNCE_MS = 2000`、`nextFireAt(lastEditTimestamp: number, debounceMs: number): number`、`computeNextFireAt({ lastEditAt, lastSaveAt, debounceMs, nowMs }): { shouldFire, fireAt }`、`shouldFireIdleSave(editTimestamps, lastSaveTimestamp, debounceMs, nowMs): boolean` | canonical purity-audit pattern 全体 |

### Effectful Shell Modules

| Module | 層 | 理由 |
|--------|---|------|
| `BlockElement.svelte` | impure | Svelte 5 component (`$state`/`$effect`/`$props`/`$derived`)、DOM event handlers (`oninput`/`onkeydown`/`onfocusin`/`onclick`)、`document.activeElement` 参照、`window.getSelection()` 使用、`adapter.dispatchXxx(...)` IPC 発火 |
| `SlashMenu.svelte` | impure | Svelte 5 component、`<svelte:window onkeydown>` 購読、`onSelect`/`onClose` callback 発火 |
| `BlockDragHandle.svelte` | impure | Svelte 5 component、HTML5 Drag-and-Drop API、`event.dataTransfer` 操作、`onMoveBlock` callback 発火 |
| `SaveFailureBanner.svelte` | impure | Svelte 5 component（ただし内部ロジックは `bannerMessageFor` の純粋関数結果のみ）、callback 発火 |
| `debounceTimer.ts` | impure | `setTimeout`/`clearTimeout` ラッパー |
| `timerModule.ts` | impure | `scheduleIdleSave`/`cancelIdleSave` のタイマー実装 |
| `keyboardListener.ts` | impure（保留） | `addEventListener('keydown', ...)` を要求するが Sprint 7 時点で未使用 |
| `clipboardAdapter.ts` | impure（保留） | `navigator.clipboard.writeText(...)` を要求するが Sprint 7 時点で未使用 |
| `types.ts` | type-only | 実行時コードを含まない |

---

## 3. Verification Tier Assignments

### Tier 0 — Type-level / static guarantees (TypeScript compile-time)

- **`SaveError` discriminated union の exhaustive switch**: `bannerMessageFor` の switch は全 variant（`fs.permission/disk-full/lock/not-found/unknown`、`validation.empty-body-on-idle/invariant-violated`）を網羅し、未処理 variant でコンパイルエラーになる（`const _exhaustive: never` パターン）
- **`BlockType` discriminated literal の網羅**: `SlashMenu.svelte` の `ALL_TYPES` 配列、`BlockElement.svelte` の `getBlockTag` switch は MVP 9 種をすべて含む
- **`'idle' | 'blur'` の exhaustive switch**: `classifySource` の switch は 2 値を網羅し default で `never` チェック
- **`BlockEditorAdapter` interface の構造アサーション**: `_AssertEditBlockContentShape` 等の型レベルアサーション（NFR-BE-005）で payload shape を compile time に検証
- **`types.ts` に旧型が存在しない**: `EditorIpcAdapter` / `EditorViewState` / `EditorAction` / `EditorCommand` / `EditingSessionStateDto` / `EditingSessionStatus` / `subscribeToState` の identifier が non-comment 領域に grep zero-hit（PROP-BE-040 で CI 検証）

### Tier 1 — Pure unit tests (vitest, deterministic)

- **`blockPredicates.test.ts`**: `bannerMessageFor` の全 7 入力・`classifySource` の全 2 入力・`splitOrInsert` の境界値（`offset === contentLength` / `offset > contentLength` / `offset < contentLength` / `0,0`）・`classifyMarkdownPrefix` の各 prefix 1 件以上 + `null` ケース・`classifyBackspaceAtZero` の全 4 戻り値分岐を example-based テスト
- **`debounceSchedule.test.ts`**: `IDLE_SAVE_DEBOUNCE_MS === 2000` 定数アサーション、`nextFireAt` 加算性、`computeNextFireAt` の 3 分岐 + 境界値、`shouldFireIdleSave` の sequence 評価

### Tier 2 — Property tests (fast-check, pure modules only)

fast-check を使用し、全入力ドメインに対して不変条件を検証する。各 PROP には対応する behavioral REQ ID を併記。

#### blockPredicates.ts

- **PROP-BE-001** (`bannerMessageFor` totality / REQ-BE-017): すべての `SaveError` 値で関数は throw せず `string | null` を返す。`fs.*` の 5 variant は non-null、`validation.*` の 2 variant は null
- **PROP-BE-002** (`bannerMessageFor` purity / REQ-BE-017): 同一入力で 2 回呼んだ結果が `===`（プリミティブ文字列なので参照同値）
- **PROP-BE-003** (`splitOrInsert` 単純判別 / REQ-BE-018): すべての `(offset: int, len: int with len >= 0)` で `splitOrInsert(offset, len) === 'insert' ⇔ offset === len`
- **PROP-BE-004** (`splitOrInsert` purity / REQ-BE-018): 同一入力で 2 回呼んだ結果が `===`
- **PROP-BE-005** (`classifyMarkdownPrefix` 優先順位 / REQ-BE-019): `'### x'` を渡したとき `newType === 'heading-3'`（`'## '` や `'# '` より長い prefix が優先）
- **PROP-BE-006** (`classifyMarkdownPrefix` divider 完全一致 / REQ-BE-019): `content === '---' ⇒ newType === 'divider'`、`content === '----' || content === '---a' ⇒ result === null`
- **PROP-BE-007** (`classifyMarkdownPrefix` non-prefix 安全性 / REQ-BE-019): すべての先頭が prefix 一覧に含まれない文字列に対して `null` を返す（generative test：ランダム文字列が `'### '` 等で始まらない場合）
- **PROP-BE-008** (`classifyMarkdownPrefix` purity / REQ-BE-019): 同一入力で 2 回呼んだ結果が deep-equal
- **PROP-BE-009** (`classifyBackspaceAtZero` totality / REQ-BE-020): すべての `(focusedIndex: int, blockCount: int)` で 4 値（`'merge' | 'first-block-noop' | 'remove-empty-noop' | 'normal-edit'`）のいずれかを返す
- **PROP-BE-010** (`classifyBackspaceAtZero` 分岐 / REQ-BE-020): `focusedIndex === 0 ⇒ 'first-block-noop'`、`0 < focusedIndex < blockCount ⇒ 'merge'`、それ以外 ⇒ `'normal-edit'`
- **PROP-BE-011** (`classifySource` bijective / REQ-BE-021): `'idle' ↔ 'capture-idle'` / `'blur' ↔ 'capture-blur'` の 1:1 マッピング

#### debounceSchedule.ts

- **PROP-BE-012** (`IDLE_SAVE_DEBOUNCE_MS` constant / REQ-BE-022): `IDLE_SAVE_DEBOUNCE_MS === 2000` がランタイムで成立
- **PROP-BE-013** (`nextFireAt` 加算性 / REQ-BE-023): すべての `(t: int, d: int with d >= 0)` で `nextFireAt(t, d) === t + d`
- **PROP-BE-014** (`computeNextFireAt` saved suppression / REQ-BE-024): `lastSaveAt !== 0 && lastSaveAt >= lastEditAt` のとき `shouldFire === false && fireAt === null`（保存済みケース）
- **PROP-BE-015** (`computeNextFireAt` debounce boundary / REQ-BE-024): `lastSaveAt === 0 || lastSaveAt < lastEditAt` のとき:
  - `nowMs >= lastEditAt + debounceMs ⇒ shouldFire === true && fireAt === lastEditAt + debounceMs`
  - `nowMs < lastEditAt + debounceMs ⇒ shouldFire === false && fireAt === lastEditAt + debounceMs`
- **PROP-BE-016** (`computeNextFireAt` purity / REQ-BE-024): 同一入力で 2 回呼んだ結果が deep-equal
- **PROP-BE-017** (`shouldFireIdleSave` empty short-circuit / REQ-BE-025): `editTimestamps.length === 0 ⇒ false`
- **PROP-BE-018** (`shouldFireIdleSave` saved suppression / REQ-BE-025): `editTimestamps.length > 0 && lastSaveTimestamp !== 0 && lastSaveTimestamp >= max(editTimestamps) ⇒ false`
- **PROP-BE-019** (`shouldFireIdleSave` debounce boundary / REQ-BE-025): `editTimestamps.length > 0 && (lastSaveTimestamp === 0 || lastSaveTimestamp < max(editTimestamps)) && max(editTimestamps) + debounceMs <= nowMs ⇒ true`
- **PROP-BE-020** (`shouldFireIdleSave` order independence / REQ-BE-025): 入力 `editTimestamps` を任意順に並び替えても結果は変わらない（`Math.max` の commutativity）

### Tier 3 — Branch coverage gate (@vitest/coverage-v8)

Stryker は未導入。fast-check (Tier 2) + branch coverage ≥ 95% で同等の rigor を担保する。

**対象 (pure modules only)**:
- `blockPredicates.ts`: branch coverage ≥ 95%
- `debounceSchedule.ts`: branch coverage ≥ 95%

Effectful shell（Svelte components）はカバレッジゲート対象外（jsdom 限界による）。代わりに DOM tier の網羅でカバーする。

### Tier 4 — DOM integration tests (vitest + jsdom + raw Svelte 5 mount API)

DOM tier では Svelte 5 mount API で各プリミティブをマウントし、UI 振る舞いを検証する。`@testing-library/svelte` は使わない。

- **`block-element.dom.vitest.ts`**: REQ-BE-001 (タグ別レンダリング) / REQ-BE-002 (focus 受け渡し) / REQ-BE-003 (input → EditBlockContent) / REQ-BE-005 (markdown prefix → ChangeBlockType) / REQ-BE-006 (Enter → InsertBlock or SplitBlock) / REQ-BE-007 (空 + Backspace → RemoveBlock) / REQ-BE-008 (行頭 Backspace → MergeBlocks) / REQ-BE-009..010 (`/` メニュー)
- **`slash-menu.dom.vitest.ts`**: REQ-BE-011 (9 種列挙 + filter) / REQ-BE-012 (キーボード操作)
- **`block-drag-handle.dom.vitest.ts`**: REQ-BE-013 (dragstart + dataTransfer) / REQ-BE-014 (dragend で state リセット)
- **`save-failure-banner.dom.vitest.ts`**: REQ-BE-015 (表示条件) / REQ-BE-016 (3 アクションボタン)

これらは mock の `BlockEditorAdapter` を注入する。adapter のメソッドは `vi.fn().mockResolvedValue(undefined)` で stub する。

### Tier 5 — Source-grep checks (CI)

- **PROP-BE-040** (旧 EditorPane 型残留チェック): `grep -rn "EditorIpcAdapter\|EditorViewState\|EditorAction\b\|EditorCommand\b\|EditingSessionStateDto\|EditingSessionStatus" src/lib/block-editor/` がコメント以外でゼロヒット
- **PROP-BE-041** (Pure module の禁止 API ゼロ): canonical purity-audit grep pattern で `blockPredicates.ts` / `debounceSchedule.ts` がゼロヒット
- **PROP-BE-042** (旧 editor/ ディレクトリの不存在): `test ! -d src/lib/editor` が CI で成立

---

## 4. Proof Obligation Catalog

| ID | 述語 | Tier | REQ link |
|----|------|------|---------|
| PROP-BE-001 | `bannerMessageFor` totality | 2 | REQ-BE-017 |
| PROP-BE-002 | `bannerMessageFor` purity | 2 | REQ-BE-017 |
| PROP-BE-003 | `splitOrInsert` 単純判別 | 2 | REQ-BE-018 |
| PROP-BE-004 | `splitOrInsert` purity | 2 | REQ-BE-018 |
| PROP-BE-005 | `classifyMarkdownPrefix` 優先順位 | 2 | REQ-BE-019 |
| PROP-BE-006 | `classifyMarkdownPrefix` divider 完全一致 | 2 | REQ-BE-019 |
| PROP-BE-007 | `classifyMarkdownPrefix` non-prefix 安全性 | 2 | REQ-BE-019 |
| PROP-BE-008 | `classifyMarkdownPrefix` purity | 2 | REQ-BE-019 |
| PROP-BE-009 | `classifyBackspaceAtZero` totality | 2 | REQ-BE-020 |
| PROP-BE-010 | `classifyBackspaceAtZero` 分岐 | 2 | REQ-BE-020 |
| PROP-BE-011 | `classifySource` bijective | 2 | REQ-BE-021 |
| PROP-BE-012 | `IDLE_SAVE_DEBOUNCE_MS` constant | 2 | REQ-BE-022 |
| PROP-BE-013 | `nextFireAt` 加算性 | 2 | REQ-BE-023 |
| PROP-BE-014 | `computeNextFireAt` saved suppression | 2 | REQ-BE-024 |
| PROP-BE-015 | `computeNextFireAt` debounce boundary | 2 | REQ-BE-024 |
| PROP-BE-016 | `computeNextFireAt` purity | 2 | REQ-BE-024 |
| PROP-BE-017 | `shouldFireIdleSave` empty short-circuit | 2 | REQ-BE-025 |
| PROP-BE-018 | `shouldFireIdleSave` saved suppression | 2 | REQ-BE-025 |
| PROP-BE-019 | `shouldFireIdleSave` debounce boundary | 2 | REQ-BE-025 |
| PROP-BE-020 | `shouldFireIdleSave` order independence | 2 | REQ-BE-025 |
| PROP-BE-021 | BlockElement レンダリング型適合 | 4 | REQ-BE-001 |
| PROP-BE-022 | BlockElement focus 受け渡し | 4 | REQ-BE-002 |
| PROP-BE-023 | BlockElement input → dispatchEditBlockContent | 4 | REQ-BE-003 |
| PROP-BE-024 | BlockElement input → onBlockEdit 通知 | 4 | REQ-BE-004 |
| PROP-BE-025 | BlockElement markdown prefix → dispatchChangeBlockType | 4 | REQ-BE-005 |
| PROP-BE-026 | BlockElement Enter → dispatchInsertBlockAfter or dispatchSplitBlock | 4 | REQ-BE-006 |
| PROP-BE-027 | BlockElement empty Backspace/Delete → dispatchRemoveBlock | 4 | REQ-BE-007 |
| PROP-BE-028 | BlockElement 行頭 Backspace → dispatchMergeBlocks | 4 | REQ-BE-008 |
| PROP-BE-029 | BlockElement `/` で SlashMenu open | 4 | REQ-BE-009 |
| PROP-BE-030 | SlashMenu 選択 → dispatchChangeBlockType | 4 | REQ-BE-010 |
| PROP-BE-031 | SlashMenu 9 種列挙 + filter | 4 | REQ-BE-011 |
| PROP-BE-032 | SlashMenu キーボード操作 | 4 | REQ-BE-012 |
| PROP-BE-033 | BlockDragHandle dragstart | 4 | REQ-BE-013 |
| PROP-BE-034 | BlockDragHandle dragend で state リセット | 4 | REQ-BE-014 |
| PROP-BE-035 | SaveFailureBanner 表示条件 | 4 | REQ-BE-015 |
| PROP-BE-036 | SaveFailureBanner 3 アクションボタン | 4 | REQ-BE-016 |
| PROP-BE-037 | BlockEditorAdapter shape (Tier 0) | 0 | REQ-BE-026 |
| PROP-BE-040 | 旧 EditorPane 型残留チェック | 5 | REQ-BE-027 |
| PROP-BE-041 | Pure module 禁止 API ゼロ | 5 | NFR-BE-001 |
| PROP-BE-042 | 旧 editor/ ディレクトリ不存在 | 5 | — |

合計: 41 propositions（Tier 0=1、Tier 2=20、Tier 4=16、Tier 5=3、Tier 1 は example-based で counts に含めない）

---

## 5. Verification Ladder Summary

| 層 | 目的 | ツール | 対象 |
|----|------|------|------|
| Tier 0 | 型レベル網羅性・shape 検証 | `tsc --strict` | `BlockEditorAdapter` / `SaveError` switch / `BlockType` 列挙 |
| Tier 1 | 例題ベース pure 関数テスト | `vitest run` (bun test 互換) | `blockPredicates.ts` / `debounceSchedule.ts` |
| Tier 2 | プロパティテスト | `fast-check` 経由 vitest | 上記 pure modules |
| Tier 3 | 分岐網羅率 | `@vitest/coverage-v8` | 上記 pure modules ≥ 95% |
| Tier 4 | DOM 統合テスト | vitest + jsdom + Svelte 5 mount API | 4 つの primitive svelte 群 |
| Tier 5 | ソース grep CI ゲート | `grep` + bash | プロジェクト全体構造 |

---

## 6. 検証外の責務（記録のみ）

以下は他フィーチャの責務であり、本 verification では触れない:

| 項目 | 責務先 |
|------|-------|
| FeedRow による block primitive の組み込み | `ui-feed-list-actions` Sprint 5 |
| Note Aggregate 不変条件保証（最低 1 ブロック等） | Rust 側 capture モジュール |
| `feedStateChannel` / `feedReducer` 経由の `EditingSessionState` 反映 | `ui-feed-list-actions` 既存 Sprint |
| Markdown ↔ Block round-trip | ACL 層 (`docs/domain/code/ts/src/shared/blocks.ts` の純粋関数 `serializeBlocksToMarkdown` / `parseMarkdownToBlocks`) |
| Tauri IPC backend | `ipc-payload-rust-block-migration` 等の別タスク |

---

## 7. 残課題・未解決の問い

- **IME composition との連携**: `oninput` が IME 確定中に発火する挙動は jsdom では検証不能。実機テストでの観察が必要（`ui-feed-list-actions` Sprint 5 の integration test に持ち越し）
- **drop 受け側ロジック**: `BlockDragHandle` は drag 開始のみハンドリングし、drop 受け側（ondragover/ondrop）は親コンポーネントの責務。本 spec では検証範囲外
- **clipboardAdapter / keyboardListener の運命**: 現状未使用。将来 Sprint 5 以降で必要になれば再採用、不要なら CI ゲートで未使用検出 → 削除するか判断する
- **code Block の改行扱い**: MVP では Enter で常に block 分割。code 内の純粋な改行サポートは将来仕様
