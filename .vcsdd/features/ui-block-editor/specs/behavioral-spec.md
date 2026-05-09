---
coherence:
  node_id: "req:ui-block-editor"
  type: req
  name: "ui-block-editor 行動仕様"
  depends_on:
    - id: "design:bounded-contexts"
      relation: derives_from
    - id: "design:aggregates"
      relation: derives_from
    - id: "design:type-contracts"
      relation: derives_from
    - id: "governance:design-system"
      relation: depends_on
    - id: "task:block-based-ui-spec-migration"
      relation: derives_from
  modules:
    - "ui-block-editor"
  source_files:
    - "promptnotes/src/lib/block-editor/BlockElement.svelte"
    - "promptnotes/src/lib/block-editor/SlashMenu.svelte"
    - "promptnotes/src/lib/block-editor/BlockDragHandle.svelte"
    - "promptnotes/src/lib/block-editor/SaveFailureBanner.svelte"
    - "promptnotes/src/lib/block-editor/blockPredicates.ts"
    - "promptnotes/src/lib/block-editor/debounceSchedule.ts"
    - "promptnotes/src/lib/block-editor/debounceTimer.ts"
    - "promptnotes/src/lib/block-editor/timerModule.ts"
    - "promptnotes/src/lib/block-editor/keyboardListener.ts"
    - "promptnotes/src/lib/block-editor/clipboardAdapter.ts"
    - "promptnotes/src/lib/block-editor/types.ts"
    - "docs/domain/code/ts/src/shared/note.ts"
    - "docs/domain/code/ts/src/shared/blocks.ts"
    - "docs/domain/code/ts/src/shared/value-objects.ts"
    - "docs/domain/code/ts/src/shared/errors.ts"
    - "docs/domain/code/ts/src/capture/commands.ts"
    - "docs/domain/code/ts/src/capture/internal-events.ts"
    - "docs/domain/code/ts/src/capture/states.ts"
---

# Behavioral Specification: ui-block-editor

**Feature**: `ui-block-editor`
**Phase**: 1a
**Revision**: 1
**Mode**: strict
**Language**: TypeScript (Svelte 5 + SvelteKit + Tauri 2 desktop)
**Created**: 2026-05-09

## Source of Truth

- `docs/domain/bounded-contexts.md` §Capture Context（Block Focus / Block Type / Inline Editor Library / Block Split / Block Type Conversion / Idle Save / Blur Save の定義）
- `docs/domain/aggregates.md` §1 Note Aggregate / §Block Sub-entity / §Block 操作 / §EditingSessionState 遷移表
- `docs/domain/code/ts/src/shared/note.ts` — `Block` / `Note` / `NoteOps` インターフェース
- `docs/domain/code/ts/src/shared/blocks.ts` — `serializeBlocksToMarkdown` / `parseMarkdownToBlocks` / `BlockParseError`
- `docs/domain/code/ts/src/shared/value-objects.ts` — `BlockType` / `BlockId` / `BlockContent`
- `docs/domain/code/ts/src/shared/errors.ts` — `SaveError` / `FsError` / `SaveValidationError`
- `docs/domain/code/ts/src/capture/commands.ts` — `CaptureCommand` の Block 系 8 種
- `docs/domain/code/ts/src/capture/internal-events.ts` — `BlockFocused` / `BlockBlurred` / `EditorBlurredAllBlocks` / `BlockContentEdited` ほか
- `docs/domain/code/ts/src/capture/states.ts` — `EditingState.focusedBlockId` / `PendingNextFocus`
- `docs/tasks/block-based-ui-spec-migration.md` — 本 feature の発生根拠と移行方針
- `DESIGN.md` Editor Surface / Block Type Styles / Card / Banner セクション

> **既存資産の参照ポリシー**: 旧 `ui-editor` feature の spec・tests は EditorPane モデルに汚染されているため**参照しない**（migration 文書の指示）。本 spec は Source of Truth と新規取得した実装サーフェス（`src/lib/block-editor/`）からゼロベースで導出する。

---

## Scope

**対象**:
`src/lib/block-editor/` 配下の **block 編集プリミティブコンポーネント群**および
それを支える純粋関数・タイマーモジュールの振る舞いを定義する。

具体的には:

| プリミティブ | 種別 | 役割 |
|------------|------|------|
| `BlockElement.svelte` | Svelte component (effectful shell) | 単一 Block の contenteditable レンダリングと block-level コマンド発火 |
| `SlashMenu.svelte` | Svelte component (effectful shell) | `/` 入力時のブロック種選択メニュー |
| `BlockDragHandle.svelte` | Svelte component (effectful shell) | drag-and-drop 並べ替えのトリガ |
| `SaveFailureBanner.svelte` | Svelte component (effectful shell) | `save-failed` 状態のインライン警告表示 |
| `blockPredicates.ts` | pure module | block-level の判別関数群 |
| `debounceSchedule.ts` | pure module | idle-save の debounce タイミング計算 |
| `debounceTimer.ts` | effectful shell | `setTimeout`/`clearTimeout` ラッパー |
| `timerModule.ts` | effectful shell | `scheduleIdleSave`/`cancelIdleSave` の上位 API |
| `keyboardListener.ts` | effectful shell | pane-scoped キーボードショートカット購読（保留資産） |
| `clipboardAdapter.ts` | effectful shell | `navigator.clipboard.writeText` ラッパー（保留資産） |
| `types.ts` | type-only module | 型定義（`BlockType` / `BlockEditorAdapter` / `SaveError` 等） |

**スコープ外**:
- **FeedRow へのブロック組み込み**: `ui-feed-list-actions` Sprint 5 の責務。本 feature は単体プリミティブの振る舞いのみを定義する
- **EditingSessionState の集中管理**: 上位レイヤ（FeedReducer / Tauri 側 SessionStore）が担当。本 feature は session state を直接変更しない
- **Tauri IPC の実装**: `BlockEditorAdapter` インターフェースの実装は外部から注入される
- **Note Aggregate の不変条件保証**: ドメイン層（Rust 側 capture モジュール）が担う。UI 側は不変条件違反を発生させないよう注意するが検証は backend 側
- **Markdown ↔ Block の変換**: ACL 層（`docs/domain/code/ts/src/shared/blocks.ts`）の責務

**重要な前提**:
- `BlockElement` は **単一 Block のレンダラ**であり、Note 全体の `blocks: Block[]` は外部から props で注入される
- `BlockElement` の `adapter: BlockEditorAdapter` 経由で発火されるコマンドは `Promise<void>` を返す。失敗ハンドリングは上位レイヤの責務（本コンポーネントは `.catch(() => {})` で握り潰す）
- `SaveFailureBanner` は **stateless** であり、`error: SaveError` props のみで表示判断する。`save-failed` 状態の検出と props 注入は上位レイヤの責務

---

## Purity Boundary Analysis

### Pure Core (deterministic, side-effect-free, formally verifiable)

| Module | 主な exports | 根拠 |
|--------|-------------|------|
| `blockPredicates.ts` | `bannerMessageFor(error: SaveError): string \| null`, `classifySource(triggerKind: 'idle' \| 'blur'): EditorCommandSaveSource`, `splitOrInsert(offset, contentLength): 'split' \| 'insert'`, `classifyMarkdownPrefix(content): { newType, trimmedContent } \| null`, `classifyBackspaceAtZero(focusedIndex, blockCount)` | 純粋関数。引数のみに依存。`Date.now()` / `Math.random()` 等を呼ばない |
| `debounceSchedule.ts` | `IDLE_SAVE_DEBOUNCE_MS` (定数 = 2000), `nextFireAt(lastEditTimestamp, debounceMs)`, `computeNextFireAt({ lastEditAt, lastSaveAt, debounceMs, nowMs })`, `shouldFireIdleSave(editTimestamps, lastSaveTimestamp, debounceMs, nowMs)` | 純粋関数。タイマー API を呼ばない（タイミング計算のみ） |

### Effectful Shell (I/O, Tauri invoke, DOM, Timers)

| Module | 理由 |
|--------|------|
| `BlockElement.svelte` | `$state` / `$effect` / `$props` / `$derived` 利用。`document.activeElement` 参照、`window.getSelection()` 呼び出し、DOM event handlers (`oninput`/`onkeydown`/`onfocusin`/`onclick`)、`adapter.dispatchXxx(...)` 経由の IPC 発火 |
| `SlashMenu.svelte` | `$state` / `$effect` / `$derived`、`svelte:window` での `keydown` 購読、`onSelect`/`onClose` callback 発火 |
| `BlockDragHandle.svelte` | `$state` / `$props`、HTML5 Drag and Drop API (`ondragstart` / `ondragend` / `event.dataTransfer`)、`onMoveBlock` callback 発火 |
| `SaveFailureBanner.svelte` | `$derived` で `bannerMessageFor` の結果を購読、`onRetry`/`onDiscard`/`onCancel` callback 発火 |
| `debounceTimer.ts` | `setTimeout` / `clearTimeout` ラッパー |
| `timerModule.ts` | `scheduleIdleSave` / `cancelIdleSave` のタイマー実装 |
| `keyboardListener.ts` | `panelRoot.addEventListener('keydown', ...)` |
| `clipboardAdapter.ts` | `navigator.clipboard.writeText(...)` |

### 禁止 API（Pure Core において）

`blockPredicates.ts` および `debounceSchedule.ts` は、以下の API を**直接または間接的にも**呼び出してはならない。CI grep で検出可能とする。

`Math.random`, `crypto`, `performance`, `window`, `globalThis`, `self`, `document`,
`navigator`, `requestAnimationFrame`, `requestIdleCallback`, `localStorage`,
`sessionStorage`, `indexedDB`, `fetch`, `XMLHttpRequest`, `setTimeout`, `setInterval`,
`clearTimeout`, `clearInterval`, `Date.now`, `new Date(`, `Date(`,
`$state`, `$effect`, `$derived`, `import.meta`, `invoke(`, `@tauri-apps/api`

---

## Requirements

### Section A: BlockElement — contenteditable レンダリング

#### REQ-BE-001: 単一 Block のレンダリング — type 別 DOM タグ

**EARS**: WHEN `BlockElement` コンポーネントが props として `block: { id, type, content }` と `isEditable: boolean` を受け取る THEN コンポーネントは type に応じた HTML タグを描画しなければならない。

**マッピング**:

| BlockType | DOM タグ | contenteditable |
|-----------|---------|----------------|
| `paragraph` | `<div class="block-paragraph">` | `isEditable && true` |
| `heading-1` | `<div class="block-heading-1">` | `isEditable && true` |
| `heading-2` | `<div class="block-heading-2">` | `isEditable && true` |
| `heading-3` | `<div class="block-heading-3">` | `isEditable && true` |
| `bullet` | `<div class="block-bullet">` | `isEditable && true` |
| `numbered` | `<div class="block-numbered">` | `isEditable && true` |
| `code` | `<div class="block-code">` | `isEditable && true` |
| `quote` | `<div class="block-quote">` | `isEditable && true` |
| `divider` | `<hr class="block-divider">` | 常に `false`（divider はキャレット非対応） |

> **根拠**: `aggregates.md §Block 不変条件 2` — `divider` は常に空 content・編集不可。`code` は複数行を許容するが UI 上は他と同じく `contenteditable="true"` の単一要素として描画する（複数行は `\n` を含む textContent で表現）。

**Edge Cases**:
- `block.type === 'divider'` かつ `block.content !== ''`: 異常状態（不変条件違反）。UI は content を無視して `<hr>` を描画する（fail-safe）
- `block.type === 'code'` で `block.content` が複数行: `<div>` 内に改行を含むテキストが入る。CSS `white-space: pre-wrap` により改行が保持される
- `isEditable === false`: すべての type で `contenteditable="false"` となり、`tabindex="-1"`

**Acceptance Criteria**:
- DOM に `data-testid="block-element"` 属性を持つルート要素が 1 つ存在する
- ルート要素は `data-block-id={block.id}` 属性を持つ
- ルート要素は `data-block-index={blockIndex}` 属性を持つ
- ルート要素は `data-block-empty={block.content === '' ? 'true' : 'false'}` 属性を持つ
- `block.type === 'divider'` のとき、ルート要素は `<hr>` タグである

---

#### REQ-BE-002: contenteditable のフォーカス受け渡し（外部制御）

**EARS**: WHEN `BlockElement` の prop `isFocused: boolean` が `false` から `true` へ変化する AND DOM ルート要素が `document.activeElement` でない THEN コンポーネントは DOM ルート要素に対して `.focus()` を呼ばなければならない。

> **根拠**: `aggregates.md §EditingSessionState L356` — `focusedBlockId` の遷移は domain 側で起こり、UI はその変更を購読してフォーカス位置を DOM に反映する責務を持つ。この方向（domain → UI）の同期は Sprint で言う「下流方向」。

**Edge Cases**:
- `isFocused === true` 初期マウント時: ルート要素は `document.body` などへ未配置の場合がある。`$effect` 内で `blockEl != null` を確認した上で `focus()` する
- `isEditable === false` で `isFocused === true`: divider 等にフォーカスを渡す要求は domain 側で発生しない前提だが、UI は no-op として扱う（`tabindex=-1` のため `.focus()` は失敗するが例外は投げない）
- 連続的な `isFocused` true → false → true: 都度 `.focus()` を呼ぶ。冪等

**Acceptance Criteria**:
- `isFocused: true` で mount すると `document.activeElement` がブロック DOM 要素になる（vitest + jsdom 検証）
- `isFocused: false` で mount すると `document.activeElement` は `body` のまま

---

#### REQ-BE-003: Block 内テキスト入力 → `EditBlockContent` 発火

**EARS**: WHEN `BlockElement` の contenteditable 領域に `input` イベントが発生する THEN コンポーネントは `adapter.dispatchEditBlockContent({ noteId, blockId: block.id, content: <現在の textContent>, issuedAt: issuedAt() })` を呼ばなければならない。

> **根拠**: `capture/commands.ts EditBlockContent` / `capture/internal-events.ts BlockContentEdited`

**Edge Cases**:
- 連続入力（IME 確定中など）: 各 `input` イベント毎に発火する。debounce は呼び出し側（FeedRow / 上位 timerModule）の責務
- 空入力（全文字削除して content=''）: 仕様上正規。`dispatchEditBlockContent` は content='' を運ぶ
- `oninput` が IME composition 中に発火: jsdom では `compositionstart`/`compositionend` を扱わないため、本 spec は composition との連携を要求しない（実機テストで観察する課題として記録）
- adapter の Promise が reject: コンポーネントは `.catch(() => {})` で握り潰す（上位レイヤがエラーバナー等を出す）

**Acceptance Criteria**:
- contenteditable 要素に対する `input` 発火 → mock adapter の `dispatchEditBlockContent` が呼ばれる
- 渡される `content` 引数が `blockEl.textContent` と一致する
- `noteId` / `blockId` の値が props と一致する
- `issuedAt` は呼び出し側 `() => string` の返却値そのもの

---

#### REQ-BE-004: テキスト入力に伴う `onBlockEdit` 通知

**EARS**: WHEN `BlockElement` で `input` イベントが発生する AND props に `onBlockEdit?: () => void` が渡されている THEN コンポーネントは `dispatchEditBlockContent` 完了の前後に関わらず `onBlockEdit()` を 1 回呼ばなければならない。

**Edge Cases**:
- `onBlockEdit` が undefined: 何もしない（呼ばない）
- 連続入力: 毎回呼ばれる。コールバック側で debounce する

**Acceptance Criteria**:
- input → `onBlockEdit` mock が 1 回呼ばれる
- 複数回入力すると同回数呼ばれる

> **設計意図**: `onBlockEdit` は呼び出し側（FeedRow / SaveOrchestrator）が「idle timer をリスケジュールする」ために使用する。BlockElement 自身はタイマーを保持しない。

---

#### REQ-BE-005: Markdown プレフィックス入力 → `ChangeBlockType` 発火

**EARS**: WHEN `BlockElement` の `oninput` で得られた現在 content が `classifyMarkdownPrefix(content)` で non-null を返す THEN コンポーネントは `adapter.dispatchChangeBlockType({ noteId, blockId, newType: <classified.newType>, issuedAt })` を呼ばなければならない。

> **根拠**: `aggregates.md §1 changeBlockType`、`bounded-contexts.md §Block Type Conversion` — `# ` 入力で heading-1 等のショートカット。

**サポートする prefix**:

| 入力 | 変換先 |
|------|--------|
| `# ` （末尾スペース必須） | `heading-1` |
| `## ` | `heading-2` |
| `### ` | `heading-3` |
| `- ` | `bullet` |
| `* ` | `bullet` |
| `1. ` | `numbered` |
| ` ``` ` | `code` |
| `> ` | `quote` |
| `---`（完全一致） | `divider` |

**Edge Cases**:
- `content === '---'`: `divider` に変換（完全一致のみ）
- `content === '----'`: 変換しない（divider の prefix では`---` の完全一致のみ）
- `content === '#'`（末尾スペースなし）: 変換しない
- 既に target type と同じ場合（例: 既に heading-1 の content が `# `）: 仕様上は idempotent。adapter 側で no-op となる
- Compound prefix（例: `# - hello`）: `### ` から優先順で照合し、`# ` がマッチするため `heading-1` へ変換

**Acceptance Criteria**:
- input event で `classifyMarkdownPrefix` が non-null を返すと mock の `dispatchChangeBlockType` が `newType: classified.newType` で呼ばれる
- input event で `classifyMarkdownPrefix(content) === null` のときは `dispatchChangeBlockType` が呼ばれない
- `EditBlockContent` も同 input で呼ばれる（順序: `dispatchEditBlockContent` → `dispatchChangeBlockType`）

---

#### REQ-BE-006: Enter キーによる `InsertBlock` または `SplitBlock`

**EARS**: WHEN `BlockElement` で `keydown` イベントが `key === 'Enter'` で発生する THEN コンポーネントは `event.preventDefault()` を呼んだ上で、`splitOrInsert(offset, contentLength)` の結果に応じて以下を発火しなければならない:
- 結果が `'insert'`: `adapter.dispatchInsertBlockAfter({ noteId, prevBlockId: block.id, type: 'paragraph', content: '', issuedAt })`
- 結果が `'split'`: `adapter.dispatchSplitBlock({ noteId, blockId: block.id, offset, issuedAt })`

ここで `offset` はキャレットの絶対オフセット、`contentLength` は `block.content` の長さである。

> **根拠**: `aggregates.md §1 splitBlock / insertBlockAfter`、`bounded-contexts.md §Block Split` — Enter at end は新規 paragraph 挿入、mid-block の Enter は分割。

**Edge Cases**:
- 末尾（`offset === contentLength`）: `'insert'` ルートで paragraph 挿入。新規 block の type は常に `paragraph`
- 先頭（`offset === 0`）かつ content が空: `splitOrInsert(0, 0) === 'insert'`、空 paragraph が後続に挿入される
- IME composition 中の Enter: jsdom では `isComposing` を扱えない。実機では IME 確定の Enter は composition 確定として扱われ、本ハンドラには到達しない（実装依存）
- divider ブロック: `contenteditable=false` のため Enter キーが原則発火しない。ただし発火した場合は no-op として扱う（divider 自身は分割不能）

**Acceptance Criteria**:
- 末尾 Enter → mock の `dispatchInsertBlockAfter` が `prevBlockId === block.id, type === 'paragraph', content === ''` で呼ばれる
- 中央 Enter → mock の `dispatchSplitBlock` が `blockId === block.id, offset === <キャレット位置>` で呼ばれる
- いずれの場合も `event.preventDefault()` により native の改行挿入が抑止される

---

#### REQ-BE-007: 空 Block の Backspace/Delete → `RemoveBlock`

**EARS**: WHEN `BlockElement` で `keydown` イベントが `key === 'Backspace'` または `key === 'Delete'` で発生する AND `block.content === ''` AND `totalBlocks > 1` THEN コンポーネントは `event.preventDefault()` を呼んだ上で `adapter.dispatchRemoveBlock({ noteId, blockId: block.id, issuedAt })` を発火しなければならない。

> **根拠**: `aggregates.md §1 removeBlock` — 「ブロック削除。最後の 1 ブロックは削除不可（空 paragraph に置換）」。UI は単純に `dispatchRemoveBlock` を発火し、最後の 1 ブロック保護はドメイン層で実現される（`note.removeBlock` が空 paragraph 置換を返す）。

**Edge Cases**:
- `totalBlocks === 1`: UI 上は `dispatchRemoveBlock` を呼ばない。ドメイン側にも到達させない（不要な round-trip 抑止）
- `block.content !== ''`: 通常の Backspace/Delete として扱う（preventDefault せず、ブラウザ default に委ねる）
- divider: `contenteditable=false` のためキー入力は原則発生しないが、発生した場合は no-op

**Acceptance Criteria**:
- 空 Block で Backspace 押下 → `dispatchRemoveBlock` が呼ばれる
- 空 Block で Delete 押下 → `dispatchRemoveBlock` が呼ばれる
- 唯一の Block（`totalBlocks === 1`）で Backspace 押下 → `dispatchRemoveBlock` は呼ばれない

---

#### REQ-BE-008: 行頭 Backspace → `MergeBlocks` または no-op

**EARS**: WHEN `BlockElement` で `keydown` イベントが `key === 'Backspace'` で発生する AND `block.content !== ''` AND キャレット offset が 0 THEN コンポーネントは `classifyBackspaceAtZero(blockIndex, totalBlocks)` の結果に応じて:
- `'merge'`: `event.preventDefault()` の上で `adapter.dispatchMergeBlocks({ noteId, blockId: block.id, issuedAt })` を発火
- `'first-block-noop'`: 何もしない（`event.preventDefault()` も呼ばず、ブラウザ default の挙動を許容）

> **根拠**: `aggregates.md §1 mergeBlockWithPrevious` — 「行頭 Backspace 相当：前ブロックと content を結合し、自身を削除」。

**Edge Cases**:
- `blockIndex === 0`: 先頭 Block では merge 対象がないため no-op
- `blockIndex > 0`: merge を発火
- `block.content === ''`: REQ-BE-007 の方が優先（empty かつ先頭 Backspace は `RemoveBlock` でハンドリング）
- offset が 0 でない: 通常の Backspace（content 内 1 文字削除はブラウザ default）

**Acceptance Criteria**:
- 第 2 ブロック以降で行頭 Backspace → `dispatchMergeBlocks` が呼ばれる
- 第 1 ブロックで行頭 Backspace → `dispatchMergeBlocks` は呼ばれない、`event.preventDefault()` も呼ばれない

---

#### REQ-BE-009: `/` キーによる SlashMenu 起動

**EARS**: WHEN `BlockElement` で `keydown` イベントが `key === '/'` で発生する THEN コンポーネントは内部 state `slashMenuOpen` を `true` に設定し、`SlashMenu` コンポーネントを描画しなければならない。さらに以降の `input` イベントで現在 content の先頭文字が `/` でない場合は `slashMenuOpen` を `false` にしなければならない。

> **根拠**: `bounded-contexts.md §Block Type Conversion` — `/ メニュー等でブロック種を切り替える操作`、`aggregates.md §1 changeBlockType`。

**Edge Cases**:
- 既に `/` で始まっている content の中に `/` を更に追加: メニューは開いたまま、`slashQuery` が `content.slice(1)` で更新される
- メニューが開いている状態で content が `/` で始まらなくなる（例: ユーザーが先頭 `/` を削除）: `slashMenuOpen = false`、`slashQuery = ''`
- divider Block: `contenteditable=false` のため `/` 入力は発生しない

**Acceptance Criteria**:
- `/` 押下 → DOM に `[data-testid="slash-menu"]` 要素が出現する
- content から `/` を削除 → `[data-testid="slash-menu"]` 要素が消える

---

#### REQ-BE-010: SlashMenu 選択 → `ChangeBlockType`

**EARS**: WHEN ユーザーが SlashMenu のエントリを選択する（クリック or Enter キー） THEN BlockElement は内部 state `slashMenuOpen = false`, `slashQuery = ''` に戻し、`adapter.dispatchChangeBlockType({ noteId, blockId, newType, issuedAt })` を発火しなければならない。

**Edge Cases**:
- 選択された `newType` が現 type と同一: adapter 側で no-op となる（UI は発火する）
- Esc キーで close: `slashMenuOpen = false`、`dispatchChangeBlockType` は呼ばれない

**Acceptance Criteria**:
- SlashMenu 内のボタンクリック → `dispatchChangeBlockType` が `newType` 引数付きで呼ばれる
- クリック後 SlashMenu が DOM から消える

---

### Section B: SlashMenu

#### REQ-BE-011: SlashMenu のエントリ列挙

**EARS**: WHEN `SlashMenu` がマウントされる THEN `BlockType` の MVP 9 種すべて（`paragraph`/`heading-1..3`/`bullet`/`numbered`/`code`/`quote`/`divider`）を `[role="option"]` ボタンとして描画しなければならない。

> **根拠**: `aggregates.md §Block Type Sub-entity` の MVP セット表。

**Edge Cases**:
- `query: string` props が空文字: 9 件全表示
- query が type 名/label に部分一致: 該当のみ表示（大文字小文字を区別しない）
- query 一致なし: `<div class="slash-menu-empty">結果なし</div>` を表示

**Acceptance Criteria**:
- `query=''` で mount すると `[data-testid="slash-menu"] [role="option"]` が 9 件存在する
- `query='heading'` で mount すると 3 件（heading-1..3）になる
- `query='nomatch'` で mount すると `[role="option"]` が 0 件、`.slash-menu-empty` テキストが存在する

---

#### REQ-BE-012: SlashMenu のキーボード操作

**EARS**: WHEN `SlashMenu` がマウントされている THEN コンポーネントは `window` の `keydown` を購読し、ArrowUp/ArrowDown でハイライトを移動し、Enter で選択、Esc で `onClose()` を発火しなければならない。

**Edge Cases**:
- ArrowDown が末尾エントリで発火: 末尾に固定（循環しない）
- ArrowUp が先頭で発火: 先頭に固定
- query が変化してフィルタリング後の選択範囲外になる: `selectedIndex = 0` にリセット
- ArrowDown/ArrowUp/Enter/Esc は `event.preventDefault()` を呼ぶ（IME 等への伝播を抑止）

**Acceptance Criteria**:
- ArrowDown 押下 → 2 番目のエントリに `aria-selected="true"`
- Enter 押下 → 選択中の type で `onSelect(type)` が呼ばれる
- Esc 押下 → `onClose()` が呼ばれる

---

### Section C: BlockDragHandle

#### REQ-BE-013: ドラッグ開始通知

**EARS**: WHEN ユーザーが `BlockDragHandle` 上で drag 操作を開始する（`ondragstart`） THEN コンポーネントは内部 state `isDragging = true` に設定し、`event.dataTransfer.effectAllowed = 'move'` および `event.dataTransfer.setData('text/plain', block.id)` を呼び、`onDragStart?.(block.id)` を発火しなければならない。

> **根拠**: `aggregates.md §1 moveBlock` — drag-and-drop による並べ替え。

**Edge Cases**:
- `event.dataTransfer === null`（jsdom 互換）: setData/effectAllowed 設定はスキップ。`isDragging` と `onDragStart` は実行
- `onDragStart` が undefined: 呼ばない

**Acceptance Criteria**:
- `dragstart` 発火 → `onDragStart` mock が `block.id` 引数付きで 1 回呼ばれる
- `[data-testid="block-drag-handle"]` 要素に `class="dragging"` が付与される

---

#### REQ-BE-014: ドラッグ終了の状態リセット

**EARS**: WHEN `BlockDragHandle` で `ondragend` イベントが発生する THEN コンポーネントは `isDragging = false` に設定しなければならない。

**Acceptance Criteria**:
- `dragend` 発火 → `class="dragging"` が解除される

> **設計ノート**: `BlockDragHandle` 自身は drop 先の検出や `onMoveBlock` 発火を行わない。drop 受け側（FeedRow / 親ブロックリスト）が `ondragover` / `ondrop` を実装し、必要なら `onMoveBlock({ noteId, blockId, toIndex, issuedAt })` を呼ぶ。本 spec はその drop 側の責務までは範囲外（ui-feed-list-actions Sprint 5）。

---

### Section D: SaveFailureBanner

#### REQ-BE-015: SaveFailureBanner の表示条件

**EARS**: WHEN `SaveFailureBanner` が props として `error: SaveError` を受け取る THEN コンポーネントは `bannerMessageFor(error)` の戻り値が non-null のときに `[role="alert"]` 要素として `[data-testid="save-failure-banner"]` を描画し、null のときは何も描画しないこと。

> **根拠**: `aggregates.md §EditingSessionState L362-366` — save-failed 状態では UI が選択肢モーダル/バナーを表示。`bounded-contexts.md` の Save 関連項目。

**Edge Cases**:
- `error.kind === 'fs'`（5 variant）: いずれも non-null メッセージ
- `error.kind === 'validation'`: `null` を返すため何も描画しない（`empty-body-on-idle` などは silent）

**Acceptance Criteria**:
- `error: { kind: 'fs', reason: { kind: 'permission' } }` → DOM に `[data-testid="save-failure-banner"]` が存在し、`'保存に失敗しました（権限不足）'` を含む
- `error: { kind: 'validation', reason: { kind: 'empty-body-on-idle' } }` → DOM に `[data-testid="save-failure-banner"]` が存在しない

---

#### REQ-BE-016: SaveFailureBanner のアクションボタン

**EARS**: WHEN `SaveFailureBanner` が描画される THEN 以下 3 つのボタンを `[data-testid="retry-save-button"]`/`[data-testid="discard-session-button"]`/`[data-testid="cancel-switch-button"]` として表示し、それぞれクリックで `onRetry`/`onDiscard`/`onCancel` callback を発火しなければならない。

> **根拠**: `aggregates.md §EditingSessionState` — save-failed 状態の遷移は RetrySave / DiscardCurrentSession / CancelSwitch の 3 通り。

**Acceptance Criteria**:
- 再試行ボタンクリック → `onRetry` mock が呼ばれる
- 変更を破棄ボタンクリック → `onDiscard` mock が呼ばれる
- 閉じるボタンクリック → `onCancel` mock が呼ばれる

---

### Section E: blockPredicates（pure helpers）

#### REQ-BE-017: `bannerMessageFor` の網羅性

**EARS**: GIVEN `bannerMessageFor: (error: SaveError) => string | null` THE 関数は `SaveError` の全 variant に対して全域である。`fs.{permission, disk-full, lock, not-found, unknown}` の 5 件に対しては日本語の人間可読文字列を返し、`validation.*` に対しては `null` を返すこと。

> **根拠**: 本 feature の Pure Core 不変条件。`shared/errors.ts` の `SaveError` 定義に対して網羅。

**期待出力**:

| 入力 | 出力 |
|------|------|
| `{ kind: 'fs', reason: { kind: 'permission' } }` | `'保存に失敗しました（権限不足）'` |
| `{ kind: 'fs', reason: { kind: 'disk-full' } }` | `'保存に失敗しました（ディスク容量不足）'` |
| `{ kind: 'fs', reason: { kind: 'lock' } }` | `'保存に失敗しました（ファイルがロックされています）'` |
| `{ kind: 'fs', reason: { kind: 'not-found' } }` | `'保存に失敗しました（保存先が見つかりません）'` |
| `{ kind: 'fs', reason: { kind: 'unknown' } }` | `'保存に失敗しました'` |
| `{ kind: 'validation', reason: { kind: 'empty-body-on-idle' } }` | `null` |
| `{ kind: 'validation', reason: { kind: 'invariant-violated' } }` | `null` |

**Acceptance Criteria**:
- すべての 7 入力に対して上記マップ通りの戻り値である
- TypeScript の exhaustive switch（`const _: never = ...`）が compile time に保証される

---

#### REQ-BE-018: `splitOrInsert` の単純性

**EARS**: GIVEN `splitOrInsert: (offset: number, contentLength: number) => 'split' | 'insert'` THE 関数は `offset === contentLength` のときに限り `'insert'` を返し、それ以外（含む `offset === 0`、`offset > contentLength`）は `'split'` を返すこと。

> **根拠**: `aggregates.md §1 splitBlock` — 末尾 Enter は新規挿入、それ以外は分割。

**Acceptance Criteria**:
- `splitOrInsert(0, 0) === 'insert'`
- `splitOrInsert(5, 5) === 'insert'`
- `splitOrInsert(0, 5) === 'split'`
- `splitOrInsert(3, 5) === 'split'`
- `splitOrInsert(10, 5) === 'split'`（仕様外オフセットは split として扱う、idempotent）

---

#### REQ-BE-019: `classifyMarkdownPrefix` の優先順位

**EARS**: GIVEN `classifyMarkdownPrefix: (content: string) => { newType, trimmedContent } | null` THE 関数は以下の優先順位で照合し、最初にマッチした prefix の `newType` と `trimmedContent` を返す。マッチしない場合は `null` を返す:

1. `content === '---'` → `divider`（完全一致のみ。`'----'` 等は null）
2. `### ` → `heading-3`
3. `## ` → `heading-2`
4. `# ` → `heading-1`
5. `- ` → `bullet`
6. `* ` → `bullet`
7. `1. ` → `numbered`
8. ` ``` ` → `code`
9. `> ` → `quote`

`trimmedContent` は prefix を除いた残りの文字列（`divider` の場合は `''`）。

> **根拠**: `bounded-contexts.md §Block Type Conversion`、UX 観察上の利便性。

**Acceptance Criteria**:
- `classifyMarkdownPrefix('# hello').newType === 'heading-1'`、`trimmedContent === 'hello'`
- `classifyMarkdownPrefix('### hi') === { newType: 'heading-3', trimmedContent: 'hi' }`（最長 prefix 優先）
- `classifyMarkdownPrefix('---') === { newType: 'divider', trimmedContent: '' }`
- `classifyMarkdownPrefix('----') === null`
- `classifyMarkdownPrefix('#') === null`（末尾スペースなし）
- `classifyMarkdownPrefix('hello') === null`

---

#### REQ-BE-020: `classifyBackspaceAtZero` の判別

**EARS**: GIVEN `classifyBackspaceAtZero: (focusedIndex: number, blockCount: number) => 'merge' | 'remove-empty-noop' | 'first-block-noop' | 'normal-edit'` THE 関数は以下を返す:

- `focusedIndex === 0` → `'first-block-noop'`
- `0 < focusedIndex < blockCount` → `'merge'`
- それ以外（`focusedIndex >= blockCount`、`focusedIndex < 0` 等）→ `'normal-edit'`（fallback）

> **根拠**: `aggregates.md §1 mergeBlockWithPrevious` の判別ロジックを純粋関数化。

**Acceptance Criteria**:
- `classifyBackspaceAtZero(0, 5) === 'first-block-noop'`
- `classifyBackspaceAtZero(1, 5) === 'merge'`
- `classifyBackspaceAtZero(4, 5) === 'merge'`
- `classifyBackspaceAtZero(5, 5) === 'normal-edit'`
- `classifyBackspaceAtZero(-1, 5) === 'normal-edit'`

---

#### REQ-BE-021: `classifySource` の単純マッピング

**EARS**: GIVEN `classifySource: (triggerKind: 'idle' | 'blur') => 'capture-idle' | 'capture-blur'` THE 関数は `'idle' → 'capture-idle'`、`'blur' → 'capture-blur'` の 1:1 マッピングを行う。

> **根拠**: `shared/events.ts SaveNoteSource` 値の domain mapping。

**Acceptance Criteria**:
- `classifySource('idle') === 'capture-idle'`
- `classifySource('blur') === 'capture-blur'`
- TypeScript の exhaustive switch が compile time に保証される

---

### Section F: debounceSchedule（pure scheduling）

#### REQ-BE-022: `IDLE_SAVE_DEBOUNCE_MS` の固定値

**EARS**: THE 定数 `IDLE_SAVE_DEBOUNCE_MS` は `2000`（ミリ秒）でなければならない。

> **根拠**: discovery / 旧 ui-editor で確定した debounce 窓幅。MVP では 2 秒固定とする。

**Acceptance Criteria**:
- `IDLE_SAVE_DEBOUNCE_MS === 2000`
- 他のモジュールで `2000` リテラルを直接使わず、必ずこの定数を import する

---

#### REQ-BE-023: `nextFireAt` の純粋計算

**EARS**: GIVEN `nextFireAt(lastEditTimestamp: number, debounceMs: number): number` THE 関数は `lastEditTimestamp + debounceMs` を返す。副作用なし、入力に対して同一出力。

**Acceptance Criteria**:
- `nextFireAt(1000, 2000) === 3000`
- `nextFireAt(0, 2000) === 2000`
- `nextFireAt(1000, 0) === 1000`

---

#### REQ-BE-024: `computeNextFireAt` の判別

**EARS**: GIVEN `computeNextFireAt({ lastEditAt, lastSaveAt, debounceMs, nowMs }): { shouldFire: boolean; fireAt: number | null }` THE 関数は以下を満たす:

1. `lastSaveAt !== 0 && lastSaveAt >= lastEditAt` のとき: `{ shouldFire: false, fireAt: null }`（保存済み）
2. それ以外で `nowMs >= lastEditAt + debounceMs` のとき: `{ shouldFire: true, fireAt: lastEditAt + debounceMs }`
3. それ以外: `{ shouldFire: false, fireAt: lastEditAt + debounceMs }`（まだ debounce 中）

> **根拠**: `bounded-contexts.md §Idle Save` — 入力停止が一定時間続いたときの自動保存。`lastSaveAt === 0` は「未保存」のセンチネル。

**Edge Cases**:
- `lastSaveAt === 0`（never saved）: 条件 1 は適用されない（`!== 0` ガード）
- `lastEditAt === lastSaveAt > 0`（同時保存）: 条件 1 適用、`shouldFire: false`
- `nowMs === lastEditAt + debounceMs`（境界）: 条件 2 適用、`shouldFire: true`

**Acceptance Criteria**:
- `computeNextFireAt({ lastEditAt: 1000, lastSaveAt: 0, debounceMs: 2000, nowMs: 3000 }) === { shouldFire: true, fireAt: 3000 }`
- `computeNextFireAt({ lastEditAt: 1000, lastSaveAt: 1500, debounceMs: 2000, nowMs: 5000 }) === { shouldFire: false, fireAt: null }`
- `computeNextFireAt({ lastEditAt: 1000, lastSaveAt: 0, debounceMs: 2000, nowMs: 2999 }) === { shouldFire: false, fireAt: 3000 }`

---

#### REQ-BE-025: `shouldFireIdleSave` の sequence 評価

**EARS**: GIVEN `shouldFireIdleSave(editTimestamps: readonly number[], lastSaveTimestamp: number, debounceMs: number, nowMs: number): boolean` THE 関数は以下を満たす:

- `editTimestamps.length === 0` のとき: `false`
- それ以外で `lastSaveTimestamp !== 0 && lastSaveTimestamp >= max(editTimestamps)` のとき: `false`
- それ以外で `max(editTimestamps) + debounceMs <= nowMs` のとき: `true`
- それ以外: `false`

> **根拠**: `computeNextFireAt` の sequence 版。fast-check の property test のために用意。

**Acceptance Criteria**:
- `shouldFireIdleSave([], 0, 2000, 5000) === false`
- `shouldFireIdleSave([1000], 0, 2000, 3000) === true`（境界）
- `shouldFireIdleSave([1000, 1500], 1600, 2000, 5000) === false`（save が 1500 以降）
- `shouldFireIdleSave([1000, 1500], 1400, 2000, 5000) === true`（save が 1400 < 1500）

---

### Section G: Adapter / Integration

#### REQ-BE-026: `BlockEditorAdapter` の export 形状

**EARS**: THE module `types.ts` は `BlockEditorAdapter` interface を export しなければならない。インターフェースは 16 個の `dispatchXxx` メソッドを持ち、それぞれは payload オブジェクトを受け取り `Promise<void>` を返す。

**16 メソッド一覧**:

`dispatchFocusBlock`, `dispatchEditBlockContent`, `dispatchInsertBlockAfter`, `dispatchInsertBlockAtBeginning`, `dispatchRemoveBlock`, `dispatchMergeBlocks`, `dispatchSplitBlock`, `dispatchChangeBlockType`, `dispatchMoveBlock`, `dispatchTriggerIdleSave`, `dispatchTriggerBlurSave`, `dispatchRetrySave`, `dispatchDiscardCurrentSession`, `dispatchCancelSwitch`, `dispatchCopyNoteBody`, `dispatchRequestNewNote`

> **根拠**: `capture/commands.ts CaptureCommand` の Block 系 8 種 + Save/Session 系 8 種 = 16。旧 `EditorIpcAdapter` の `subscribeToState` は廃止（FeedRow 側 `feedStateChannel` に集約）。

**Acceptance Criteria**:
- `BlockEditorAdapter` 型に対する型レベルアサーションテストが pass する
- 各メソッドのシグネチャは `(payload: { ... }) => Promise<void>`

---

#### REQ-BE-027: 不存在の subscribeToState

**EARS**: THE module `types.ts` は `subscribeToState`、`EditorIpcAdapter`、`EditorViewState`、`EditorAction`、`EditorCommand`、`EditingSessionStateDto`、`EditingSessionStatus` のいずれの export も持ってはならない。

> **根拠**: 旧 EditorPane モデルの型は本 feature では使用しない。`block-based-ui-spec-migration.md` の指示。

**Acceptance Criteria**:
- `types.ts` の grep で上記識別子が hit しない（コメント・migration note 内の説明的言及は除く）
- 上記識別子を import している non-comment コードが存在しない（`grep -rn "EditorIpcAdapter\|EditorViewState\|EditorAction\b\|EditorCommand\b\|EditingSessionStateDto\|EditingSessionStatus"` がコメント以外で 0 件）

---

## Edge Case Catalog

### EC-BE-001: 連続入力中のフォーカス保持

**Scenario**: ユーザーが BlockElement に 100 文字入力する間、各 input イベントは props を更新する。`isFocused` が `true` のまま維持される限り、`$effect` は `.focus()` を呼ばない（既に activeElement のため）。

**Expected**: 不要な focus 呼び出しが起きない（accessibility / IME 観点）。

**REQ link**: REQ-BE-002, REQ-BE-003

---

### EC-BE-002: SlashMenu open 時の Backspace で `/` を消す

**Scenario**: ユーザーが `/heading` まで入力し、Backspace で `/headin` まで戻る。`/` がまだ先頭にあるため SlashMenu は開いたまま、`slashQuery = 'headin'` に更新される。

**Expected**: SlashMenu 表示維持、フィルタ反映。

**REQ link**: REQ-BE-009, REQ-BE-011

---

### EC-BE-003: 全 `/` を削除した場合

**Scenario**: 同上で `/` まで戻り、さらに Backspace を押す。content が `''` または `/` で始まらない文字列になる。

**Expected**: SlashMenu が閉じる（`slashMenuOpen = false`）。

**REQ link**: REQ-BE-009

---

### EC-BE-004: divider への入力イベント

**Scenario**: divider Block に対して何らかの理由で focus / input が到達した場合（例: ARIA キーバインディング不全）。

**Expected**: divider の DOM は `<hr>` で `contenteditable="false"`、`tabindex="-1"`。input event は発火しない設計だが、発火した場合でも `block.content === ''` のため `dispatchEditBlockContent` が空 content で発火するに留まる（domain 層は invariant 違反として扱う）。

**REQ link**: REQ-BE-001, REQ-BE-003

---

### EC-BE-005: code Block の複数行 Enter

**Scenario**: code Block 内で Enter を押す。code は複数行を許容する型。

**Expected**: 既存実装は `BlockElement` レベルで Enter を `dispatchInsertBlockAfter` / `dispatchSplitBlock` にルーティングする。code 内の改行を保持したい場合は将来 issue として扱う（MVP は paragraph 同様に分割/挿入される）。本 spec では code Block の Enter も REQ-BE-006 のルートに従う。

**REQ link**: REQ-BE-006

> **MVP 制約として明記**: `code` Block の改行は spec 上「block 分割」として扱われる。Markdown round-trip では fence で囲まれた `code` Block が複数の paragraph に分かれる可能性があるが、これは ACL 層 (`parseMarkdownToBlocks`) が再構築する。完全な行内改行サポートは将来仕様。

---

### EC-BE-006: Drag start without dataTransfer (jsdom)

**Scenario**: jsdom が `dragstart` を生成する際 `event.dataTransfer === null` のケース。

**Expected**: `event.dataTransfer` の操作はガードして skip。`isDragging` 反転と `onDragStart` callback は実行する。

**REQ link**: REQ-BE-013

---

### EC-BE-007: SaveError fs.unknown のメッセージ

**Scenario**: 未分類のファイルシステムエラーが届く（`{ kind: 'fs', reason: { kind: 'unknown' } }`）。

**Expected**: `bannerMessageFor` は `'保存に失敗しました'` を返す（理由詳細なし）。

**REQ link**: REQ-BE-015, REQ-BE-017

---

### EC-BE-008: validation エラーの silent 扱い

**Scenario**: `{ kind: 'validation', reason: { kind: 'empty-body-on-idle' } }` が届く。

**Expected**: `bannerMessageFor` は `null` を返し、`SaveFailureBanner` は何も描画しない。validation エラーは UX 上ユーザに見せない（idle save が不要なら静かに skip するべき性質）。

**REQ link**: REQ-BE-015, REQ-BE-017

---

### EC-BE-009: debounce 境界での `nowMs === fireTime`

**Scenario**: `nowMs` がちょうど `lastEditAt + debounceMs` と等しい瞬間。

**Expected**: `computeNextFireAt` は `shouldFire: true` を返す（`>=` 比較のため）。

**REQ link**: REQ-BE-024

---

### EC-BE-010: `lastSaveAt === 0` センチネル扱い

**Scenario**: 初回起動直後で一度も save が成功していない状態。

**Expected**: `lastSaveAt === 0 && lastEditAt > 0` のとき、`computeNextFireAt` の条件 1 は `lastSaveAt !== 0` の AND ガードにより skip される。条件 2 / 3 で評価され、`shouldFire` の判定は now と debounce のみに依存する。

**REQ link**: REQ-BE-024

---

### EC-BE-011: empty content + Backspace + 唯一の Block

**Scenario**: ノートに 1 ブロックしかなく（`totalBlocks === 1`）、その content が空。Backspace 押下。

**Expected**: REQ-BE-007 のガード条件 `totalBlocks > 1` により `dispatchRemoveBlock` は呼ばれない。ブラウザ default 挙動（preventDefault しない）に委ねる。domain は `note.removeBlock` を呼ばないため不変条件 6（最低 1 ブロック保持）は保たれる。

**REQ link**: REQ-BE-007

---

### EC-BE-012: heading-1 の content に Markdown prefix を再入力

**Scenario**: 既に heading-1 の Block に `# ` をさらに入力する（content が `# # hello` 等になる）。

**Expected**: `classifyMarkdownPrefix('# # hello')` は `{ newType: 'heading-1', trimmedContent: '# hello' }` を返す。`dispatchChangeBlockType('heading-1')` は idempotent（同 type への変換）として adapter / domain 側で no-op となる。UX 上は content から先頭 `# ` を削るかは domain の責務（trimmedContent を活用）。本 spec では UI が `dispatchChangeBlockType` を発火することのみ要求し、trim 処理は要求しない。

**REQ link**: REQ-BE-005, REQ-BE-019

---

### EC-BE-013: keyboardListener.ts と clipboardAdapter.ts の保留資産

**Scenario**: `keyboardListener.ts` (Ctrl+N) と `clipboardAdapter.ts` は Sprint 7 時点で未使用。

**Expected**: 本 spec はこれらを「将来採用候補の保留資産」として扱う。CI build では import されないことを確認するが、機能要求を出さない（コードは現状のまま保持）。

**REQ link**: なし（informative）

---

## Non-Functional Requirements

### NFR-BE-001: Pure Core の禁止 API ゼロ

`blockPredicates.ts` および `debounceSchedule.ts` は禁止 API を含まないこと（grep で確認）。

### NFR-BE-002: Svelte 5 runes のみ使用

すべての Svelte コンポーネントは Svelte 5 の runes API（`$state`, `$derived`, `$effect`, `$props`）のみ使用し、旧 store API（`writable` 等）を使わない。

### NFR-BE-003: アクセシビリティ — ARIA

- BlockElement: `role="textbox"`、`aria-multiline="true"`
- SlashMenu: `role="listbox"`、`aria-label="ブロックタイプを選択"`、エントリは `role="option"` と `aria-selected`
- BlockDragHandle: `role="button"`、`tabindex="0"`、`aria-label="ブロックを移動"`
- SaveFailureBanner: `role="alert"`

### NFR-BE-004: DESIGN.md 準拠

- Block-type 別フォントサイズ・行高・色は DESIGN.md §Editor Surface セクションに従う（既に実装済の値を維持）
- SlashMenu: 2-layer shadow（DESIGN.md §Modal & Overlay 準拠）
- SaveFailureBanner: 5-layer Deep Shadow + `#dd5b00` 左ボーダー（同 DESIGN §Card / Banner）

### NFR-BE-005: Tier 0 構造的アサーション

`types.ts` には `_AssertXxxShape` 型レベルアサーションを定義し、`BlockEditorAdapter` のシグネチャ変化を compile time で検出する（旧 `_AssertEditBlockContentShape` 等の踏襲）。

---

## Glossary（本 spec 内ローカル）

| 用語 | 意味 |
|-----|------|
| Pure Core | 純粋関数モジュール群（`blockPredicates`、`debounceSchedule`） |
| Effectful Shell | DOM・タイマー・IPC を扱う Svelte コンポーネント群と adapter |
| BlockEditorAdapter | 上位レイヤ（FeedRow 等）から本 feature に注入される 16 dispatch メソッドを持つ interface |
| Block primitive | `BlockElement` / `SlashMenu` / `BlockDragHandle` / `SaveFailureBanner` |
| Idle Save | 入力停止後 `IDLE_SAVE_DEBOUNCE_MS` ミリ秒経過時の自動保存（debounce） |
| Markdown Prefix | `# `, `## `, `- ` 等のブロック種ショートカット入力 |

---

## 参考: Source-of-Truth Mapping（要件→domain ノード対応）

| REQ ID | Source-of-Truth |
|--------|----------------|
| REQ-BE-001 | aggregates.md §Block Type / §Block 不変条件 2 |
| REQ-BE-002 | aggregates.md §EditingSessionState L356 |
| REQ-BE-003 | capture/commands.ts EditBlockContent / capture/internal-events.ts BlockContentEdited |
| REQ-BE-005 | aggregates.md §1 changeBlockType / bounded-contexts.md §Block Type Conversion |
| REQ-BE-006 | aggregates.md §1 splitBlock / insertBlockAfter |
| REQ-BE-007 | aggregates.md §1 removeBlock / Block 不変条件 6 |
| REQ-BE-008 | aggregates.md §1 mergeBlockWithPrevious |
| REQ-BE-009..012 | bounded-contexts.md §Block Type Conversion / `/` メニュー UI 観察 |
| REQ-BE-013..014 | aggregates.md §1 moveBlock |
| REQ-BE-015..016 | aggregates.md §EditingSessionState save-failed / shared/errors.ts SaveError |
| REQ-BE-017..021 | shared/errors.ts SaveError / aggregates.md §1 各 Block 操作 |
| REQ-BE-022..025 | bounded-contexts.md §Idle Save |
| REQ-BE-026..027 | capture/commands.ts CaptureCommand / 旧 EditorIpcAdapter からの差分 |
