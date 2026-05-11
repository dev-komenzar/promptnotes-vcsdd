---
coherence:
  node_id: "req:app-startup-runtime"
  type: req
  name: "app-startup-runtime 行動仕様"
  depends_on:
    - id: "design:workflows"
      relation: derives_from
    - id: "design:aggregates"
      relation: derives_from
    - id: "design:bounded-contexts"
      relation: derives_from
    - id: "req:ui-feed-list-actions"
      relation: patches
    - id: "req:ui-block-editor"
      relation: coherent_with
    - id: "req:app-startup"
      relation: extends
  modules:
    - "app-startup-runtime"
    - "vault-note-id-allocator"
  source_files:
    - "promptnotes/src-tauri/src/feed.rs"
    - "promptnotes/src-tauri/src/editor.rs"
    - "promptnotes/src-tauri/src/domain/vault/note_id.rs"
    - "promptnotes/src/routes/+page.svelte"
    - "promptnotes/src/lib/domain/app-startup/initialize-capture.ts"
    - "docs/domain/code/rust/src/vault/ports.rs"
    - "docs/domain/code/ts/src/capture/states.ts"
---

# Behavioral Specification: app-startup-runtime

**Feature**: `app-startup-runtime`
**Phase**: 1a
**Revision**: 1
**Mode**: strict
**Language**: Rust (Tauri 2) + TypeScript (Svelte 5 + SvelteKit)
**Source of truth**:
- `docs/domain/workflows.md` Workflow 1 Step 4 `initializeCaptureSession`
- `docs/domain/workflows.md` Workflow 3 `classifyCurrentSession` `'empty'` arm
- `docs/domain/aggregates.md` §Note Aggregate — Block Sub-entity invariants
- `docs/domain/bounded-contexts.md` — in-place edit model
- `docs/domain/code/rust/src/vault/ports.rs` — `next_available_note_id` pure helper + `NoteIdAllocatorPort` trait
- `docs/domain/code/ts/src/capture/states.ts` — `EditingState` shape
- `promptnotes/src/lib/domain/app-startup/initialize-capture.ts` — pure TS reference implementation
- `docs/tasks/block-based-ui-spec-migration.md` lines 274–335 — Step 5 scope definition

**Scope**:
`feed_initial_state` Tauri コマンドの戻り値を Workflow 1 Step 4 `initializeCaptureSession` に準拠させる。具体的には (1) Rust 側で `Vault.allocateNoteId(now)` を実装し、(2) `feed_initial_state` の戻り値に割り当て済み NoteId と空 paragraph を持つ新規ノートを含め、(3) `+page.svelte` がその結果から `editing_session_state_changed` を `feed_state_changed` より先に dispatch する配線を確立する。デバウンス自動保存・IPC コマンド追加・Vault 集約リファクタは本スコープ外とする。

---

## Purpose

アプリ起動時にユーザーが「すぐ書ける」状態を確立する。`feed_initial_state` は現在 `editing: idle` を返すだけで、空の編集可能ノートが最上部に現れない。本フィーチャは Workflow 1 Step 4 を Rust IPC 境界に正しく配線し、起動直後のフィード先頭に空の新規ノートを自動生成する。

---

## Glossary

| 用語 | 定義 |
|------|------|
| `NoteId` | `YYYY-MM-DD-HHmmss-SSS` フォーマットの文字列（衝突時に `-N` サフィックスを付与）。Vault 内の `.md` ファイルのベース名と一致する。 |
| `next_available_note_id(now, existingIds)` | 純粋関数。同一入力で同一 NoteId を返す。結果は `existingIds` に含まれない。 |
| `Vault.allocateNoteId(now)` | effectful メソッド。Vault ディレクトリの `*.md` ファイル一覧を読み取り、`next_available_note_id` に委譲して新規 NoteId を返す。 |
| `FeedDomainSnapshotDto` | `feed_initial_state` の戻り値 Rust DTO。`editing`・`feed`・`delete`・`noteMetadata`・`cause` フィールドを持つ。 |
| `EditingSessionStateDto::Editing` | 5-arm tagged enum の `editing` バリアント。`currentNoteId`・`focusedBlockId`・`isDirty`・`isNoteEmpty`・`lastSaveResult`・`blocks?` を持つ。 |
| `block-0` | 自動生成ノートの先頭ブロック ID。フォーマット: `"block-0"` (決定論的)。 |
| 空未保存ノート | `isDirty=false` かつ `isNoteEmpty=true`（単一の空 paragraph のみ）で、対応する `.md` ファイルが Vault に存在しないノート。 |
| `select_past_note` | 過去ノートを選択する Tauri コマンド。Workflow 3 を起動する。 |

---

## Purity Boundary Analysis

### Pure Core（決定論的・副作用なし・形式検証対象）

| モジュール / 関数 | 根拠 |
|-----------------|------|
| `next_available_note_id(preferred, existingIds)` | 同一入力で同一出力。ファイルシステム不使用。`docs/domain/code/rust/src/vault/ports.rs` に実装済み。 |
| `format_base_note_id(ts: Timestamp)` | chrono 依存のみ。副作用なし。 |
| `compose_initial_editing_state(note_id, block_id)` | `EditingSessionStateDto::Editing` を組み立てる純粋ヘルパー。 |
| `EditingSessionStateDto` コンストラクタ群 | 型の組み立てのみ。 |
| `DtoBlock { id: "block-0", type: Paragraph, content: "" }` | 初期空ブロックの定数構築。 |

### Effectful Shell（I/O・Tauri emit・DOM）

| モジュール / 関数 | 理由 |
|-----------------|------|
| `Vault.allocateNoteId(now)` → `impl NoteIdAllocatorPort` | `fs::read_dir` でファイルシステム読み取りを行う。 |
| `feed_initial_state` Rust handler | `allocateNoteId` 呼び出し + `FeedDomainSnapshotDto` 組み立て。 |
| `select_past_note` Rust handler | `fs::read_dir` + `editing_session_state_changed` emit。 |
| `+page.svelte` `$effect` (initial load) | Tauri `invoke` → `editing_session_state_changed` dispatch + `feedViewState` 更新。 |
| `subscribeEditingSessionState` | Tauri `listen` ラッパー。 |

---

## Functional Requirements

### REQ-ASR-001: `Vault.allocateNoteId` — effectful 境界

**EARS**: WHEN `Vault.allocateNoteId(now)` が呼び出される THEN システムは設定済み Vault ディレクトリ内のすべての `*.md` ファイルのベース名（拡張子を除く）を既存 ID 集合として読み取り、`next_available_note_id(now, existingIds)` を呼び出してその結果の NoteId を返さなければならない。

**制約**:
- ファイルシステムアクセスは read-only（`fs::read_dir` のみ）。書き込みは行わない。
- `next_available_note_id` はアルゴリズム本体を保持する純粋関数であり、effectful ロジックを `allocateNoteId` 側に混入しない。
- `NoteIdAllocatorPort` トレイトを実装する形で Vault 側に配置する（`docs/domain/code/rust/src/vault/ports.rs` 参照）。

**Edge Cases**:
- Vault ディレクトリが空（`*.md` ファイルなし）: `existingIds = {}` で `next_available_note_id` を呼び出す。
- `fs::read_dir` 失敗: エラーを `feed_initial_state` 呼び出し元に伝播し、`allocateNoteId` 自体はパニックしない。

**Acceptance Criteria**:
- `allocateNoteId(now)` が返す NoteId は、呼び出し時点の Vault に存在する `.md` ファイルのベース名に一致しない。
- Vault に `2026-05-10-120000-000.md` が存在する場合、結果は `"2026-05-10-120000-000"` でない（衝突回避パスが通る）。
- `allocateNoteId` が `fs::read_dir` に触れる唯一の関数であること（grep で確認可能な境界）。

---

### REQ-ASR-002: `feed_initial_state` — 新規ノートのシード

**EARS**: WHEN `feed_initial_state` が成功する THEN 返却する `FeedDomainSnapshotDto` の `editing` フィールドは `EditingSessionStateDto::Editing` バリアントでなければならず、以下の値を持たなければならない。

```
editing.status          = "editing"
editing.currentNoteId   = <Vault.allocateNoteId(now) が返した NoteId>
editing.focusedBlockId  = "block-0"
editing.isDirty         = false
editing.isNoteEmpty     = true
editing.lastSaveResult  = null
editing.blocks          = [{ id: "block-0", type: "paragraph", content: "" }]
```

加えて、`FeedDomainSnapshotDto` は以下を含まなければならない:

- `noteMetadata[<newId>]`: `{ body: "", createdAt: now, updatedAt: now, tags: [] }`
- `feed.visibleNoteIds[0] === <newId>`（新規ノートを先頭に prepend）
- `cause.kind = "InitialLoad"`（`CauseDto::InitialLoad` バリアント）

**Acceptance Criteria**:
- `feed_initial_state` のレスポンス JSON において `editing.status === "editing"` である。
- `editing.currentNoteId` が `noteMetadata` のキーとして存在する。
- `feed.visibleNoteIds` の先頭要素が `editing.currentNoteId` と一致する。
- `noteMetadata[newId].body === ""`。
- `noteMetadata[newId].tags` が空配列。
- `editing.blocks` が長さ 1 の配列で `blocks[0].id === "block-0"`、`blocks[0].type === "paragraph"`、`blocks[0].content === ""`。
- `cause.kind === "InitialLoad"`。

---

### REQ-ASR-003: フロントエンド — 起動時 `editing_session_state_changed` dispatch

**EARS**: WHEN `+page.svelte` が `feed_initial_state` の結果を受領し `editing.status === "editing"` である THEN フロントエンドは `editing_session_state_changed` イベントを dispatch しなければならない。このイベントは `feed_state_changed` の初期化処理（`feedViewState` への代入）より**先**に実行されなければならない。

dispatch するペイロードは `EditingSessionStateDto::Editing` 正規形に従い、以下の値を含む:

```ts
{
  status: "editing",
  currentNoteId: <newId>,
  focusedBlockId: "block-0",
  isDirty: false,
  isNoteEmpty: true,
  lastSaveResult: null,
  blocks: [{ id: "block-0", type: "paragraph", content: "" }]
}
```

**Acceptance Criteria**:
- `feed_initial_state` 受領後、`editingSessionState` ($state) が `null` でなくなる前に `feedViewState` が更新されない（dispatch 順序の保証）。
- `editingSessionState.status === "editing"` かつ `editingSessionState.currentNoteId === feedViewState.editingNoteId`。
- `feedViewState.editingStatus === "editing"` かつ `feedViewState.editingNoteId === editing.currentNoteId`。
- `feedViewState.visibleNoteIds[0] === editing.currentNoteId`。

> **EC-FEED-017 順序との整合**: Sprint 6 で確立した `editing_session_state_changed` → `feed_state_changed` の順序は起動時にも適用される。本フィーチャはその順序を `+page.svelte` の `$effect` 内でローカルに維持する。

---

### REQ-ASR-004: エラーパス — 新規ノート未割り当て

**EARS**: WHEN `feed_initial_state` がエラーを返す（Vault 未設定・ディレクトリ読み取り不可）THEN 新規ノートは割り当てられず、`editing_session_state_changed` は dispatch されず、UI は設定誘導フロー（未設定モーダル）を表示しなければならない。

**Acceptance Criteria**:
- `feed_initial_state` が `Err(String)` を返した場合、`+page.svelte` は `feedViewState.loadingStatus = "ready"` に設定するのみで `editingSessionState` を変更しない。
- `settings_load` が `null` を返した（Vault 未設定）場合も同様に `editingSessionState` は更新されない。
- エラーパスで `editing_session_state_changed` が発火しない（Vitest で確認）。

---

### REQ-ASR-005: `cause` フィールド — `InitialLoad`

**EARS**: WHEN `feed_initial_state` が成功する THEN 戻り値の `FeedDomainSnapshotDto.cause` は `CauseDto::InitialLoad` バリアントでなければならない（`EditingStateChanged` ではない）。

**Acceptance Criteria**:
- `cause.kind === "InitialLoad"` が JSON レスポンスに存在する。
- `cause.kind === "EditingStateChanged"` は存在しない（既存の `idle_editing()` 呼び出しを削除して正しいバリアントを使用する）。

---

### REQ-ASR-006: 空未保存ノートの暗黙破棄 — `select_past_note`

**EARS**: WHEN `select_past_note` が呼び出され WHEN 現在の `editingNoteId` が Vault に対応する `.md` ファイルを持たない（未保存）かつ `isNoteEmpty=true`（空 paragraph 1 件のみ）である THEN Rust ハンドラは破棄ノートのファイルを書き込まず、破棄ノートは `visibleNoteIds` から除外された状態で `editing_session_state_changed` および `feed_state_changed` を emit しなければならない。

> Workflow 3 Step 1 `classifyCurrentSession` の `'empty'` arm に対応する。

**Acceptance Criteria**:
- `select_past_note` 呼び出し後、Vault ディレクトリに破棄対象 NoteId の `.md` ファイルが存在しない。
- `select_past_note` が emit する `feed_state_changed` の `visibleNoteIds` に破棄対象 NoteId が含まれない。
- `editing_session_state_changed` が `select_past_note` 完了後に emit される（Rust integration test で順序確認）。

---

### REQ-ASR-007: `allocateNoteId` — 決定論性の委譲

**EARS**: WHEN `allocateNoteId(now)` が同一の `now` と同一の Vault 状態（同一の `existingIds` 集合）で呼び出される THEN 同一の NoteId を返さなければならない。

**根拠**: 決定論的アルゴリズムは `next_available_note_id` が保有する。`allocateNoteId` の effectful 部分は `existingIds` の読み取りのみ。

**Acceptance Criteria**:
- 同一 Vault・同一 `now` での連続 2 回の `allocateNoteId` 呼び出しが同一 NoteId を返す（ファイルが追加されない限り）。
- `next_available_note_id` の property test (PROP-003 / PROP-022 — `app-startup` フィーチャで既証明) を参照する。

---

### REQ-ASR-008: NoteId 衝突なし

**EARS**: WHEN `allocateNoteId(now)` が呼び出される THEN 返却する NoteId は呼び出し時点で Vault に存在するいかなる `*.md` ファイルのベース名とも一致しないことを保証しなければならない。

**Acceptance Criteria**:
- tempdir Vault に `<base>.md` が存在する状態で `allocateNoteId(now)` が `<base>` と異なる NoteId を返す（integration test）。
- `-1`, `-2` と衝突が連続する場合も正しい候補まで走査する（`next_available_note_id` 内のループ — 既存テストで対象済み）。

---

### REQ-ASR-009: 自動生成ノートの初期ブロック構造

**EARS**: WHEN `feed_initial_state` が新規ノートを自動生成する THEN そのノートは正確に 1 件の paragraph ブロックを持ち、そのブロックの `content` は `""` かつ `id` は `"block-0"` でなければならない。

**根拠**: `docs/domain/aggregates.md` §Note Aggregate ブロック不変条件（非空・順序付き・ID 一意）に準拠。

**Acceptance Criteria**:
- `editing.blocks.length === 1`。
- `editing.blocks[0].type === "paragraph"`。
- `editing.blocks[0].content === ""`。
- `editing.blocks[0].id === "block-0"`。
- `editing.focusedBlockId === "block-0"`。

---

### REQ-ASR-010: フロントエンド — `feedViewState` の整合的な hydration

**EARS**: WHEN `+page.svelte` が `feed_initial_state` の `editing.status === "editing"` 結果を受領する THEN `feedViewState` は以下の整合状態に更新されなければならない。

```ts
feedViewState.editingStatus   === "editing"
feedViewState.editingNoteId   === editing.currentNoteId
feedViewState.visibleNoteIds[0] === editing.currentNoteId
feedViewState.noteMetadata[editing.currentNoteId] 存在し body === ""
```

**Acceptance Criteria**:
- `feedViewState.editingStatus === "editing"` かつ `feedViewState.editingNoteId !== null`（Vitest）。
- `feedViewState.visibleNoteIds[0] === feedViewState.editingNoteId`（Vitest）。
- `feedViewState.loadingStatus === "ready"`（Vitest）。
- `feedViewState.noteMetadata` に `editingNoteId` のエントリが存在し `tags: []` かつ `body: ""`（Vitest）。

---

## Edge Case Catalog

| EC-ID | 条件 | 期待動作 |
|-------|------|----------|
| EC-ASR-001 | 同一ミリ秒内の連続 `feed_initial_state` 呼び出し | 2 回目は 1 回目の結果として Vault に書かれたファイルを `existingIds` に含めるため衝突しない。ただし 1 回目の結果が Workflow 2 によりディスクに書かれる前の純インメモリ競合（単一スレッド JS イベントループでは直列化されるため MVP 外）はスコープ外とする。 |
| EC-ASR-002 | Vault に `<now-base>.md` が存在する（ベース衝突） | `next_available_note_id` の `-N` サフィックス経路が選択される。`allocateNoteId` はその結果を返す。 |
| EC-ASR-003 | Vault ディレクトリが空（`*.md` なし） | `existingIds = {}` → `allocateNoteId` は衝突なし → 新規ノートが唯一の `visibleNoteIds` エントリになる。 |
| EC-ASR-004 | 起動直後に `select_past_note` を呼び出す（別ノートクリック） | REQ-ASR-006 に従い、空未保存の自動生成ノートはサイレント破棄される。 |
| EC-ASR-005 | 自動生成ノートにユーザーが入力を開始する | `isNoteEmpty` が `false` に遷移した時点から「空未保存」の分類を外れる。次のデバウンスで `capture-auto-save` フィーチャが保存する（本フィーチャのスコープ外）。 |

---

## Negative Requirements

- **NEG-ASR-001**: 本フィーチャはデバウンス自動保存を実装しない。その責任は `capture-auto-save` および `block-persistence` フィーチャが担う。
- **NEG-ASR-002**: 本フィーチャは新規 IPC コマンドを追加しない。既存 `feed_initial_state` コマンドの戻り値形状を変更し、`NoteIdAllocatorPort` の effectful 実装を追加するにとどまる。
- **NEG-ASR-003**: Vault 集約のリファクタは行わない。Vault ディレクトリが既存 ID の情報源のままとする。

---

## Integration Notes

### `+page.svelte` 配線の変更点

現在の `+page.svelte` (`promptnotes/src/routes/+page.svelte:67-109`) の `$effect` は:

1. `feed_initial_state` を invoke する。
2. 結果を `feedViewState` に代入する（`editing.status = "idle"` 前提）。

本フィーチャ後:

1. `feed_initial_state` を invoke する。
2. `snapshot.editing.status === "editing"` を確認する。
3. **先に** `editing_session_state_changed` を dispatch する（`subscribeEditingSessionState` チャネル経由または直接 `editingSessionState = snapshot.editing` 代入）。
4. **その後** `feedViewState` を更新する。

これにより EC-FEED-017 の emit 順序不変条件（`editing_session_state_changed` before `feed_state_changed`）が起動時にも適用される。

---

## Cross-Feature Patches

### `ui-feed-list-actions` REQ-FEED-022 パッチ

**対象**: `.vcsdd/features/ui-feed-list-actions/specs/behavioral-spec.md` §REQ-FEED-022

**変更内容**: `app-startup-runtime` フィーチャ完了後、REQ-FEED-022 の `editing.status = "idle"` という記述は無効になる。以下の AC を追記・修正する。

**旧 AC（削除対象）**:
> `feed_initial_state` with a valid vault path returns `Ok(FeedDomainSnapshotDto)` with `cause.kind = "InitialLoad"`, `editing.status = "idle"`, `feed.filterApplied = false`.

**新 AC（代替テキスト）**:
> `feed_initial_state` with a valid vault path returns `Ok(FeedDomainSnapshotDto)` with `cause.kind = "InitialLoad"`, `editing.status = "editing"`, `editing.currentNoteId = <newly allocated NoteId>`, `editing.focusedBlockId = "block-0"`, `feed.visibleNoteIds[0] === editing.currentNoteId`, `feed.filterApplied = false`.

**追加 AC**:
> `editing.blocks = [{ id: "block-0", type: "paragraph", content: "" }]`.
> `noteMetadata[editing.currentNoteId]` が存在し `body === ""`, `tags === []`.

**承認**: 本パッチは `app-startup-runtime` フィーチャの Phase 2b 完了をもって正式に施行される。`ui-feed-list-actions` の既存テストのうち `editing.status === "idle"` を前提とするものは同時に修正が必要（Phase 4 フィードバックルーティング対象）。

---

## Traceability

| REQ-ID | 参照ドキュメント |
|--------|----------------|
| REQ-ASR-001 | `workflows.md` Workflow 1 Step 4 §依存（ポート）`Vault.allocateNoteId`、`docs/domain/code/rust/src/vault/ports.rs` `NoteIdAllocatorPort` |
| REQ-ASR-002 | `workflows.md` Workflow 1 Step 4 出力 `InitialUIState`、`docs/tasks/block-based-ui-spec-migration.md` L293–306 |
| REQ-ASR-003 | `docs/tasks/block-based-ui-spec-migration.md` L303–305、EC-FEED-017 (`ui-feed-list-actions` behavioral-spec §Edge Case Catalog) |
| REQ-ASR-004 | `workflows.md` Workflow 1 §エラーカタログ「失敗時は設定誘導 UI を表示」 |
| REQ-ASR-005 | `feed.rs:447` 現行 `CauseDto::InitialLoad`（既に正しいバリアントを使用しているが `idle_editing()` を置き換える文脈で明示） |
| REQ-ASR-006 | `workflows.md` Workflow 3 Step 1 `classifyCurrentSession` `'empty'` arm |
| REQ-ASR-007 | `docs/domain/code/rust/src/vault/ports.rs` PROP-022 決定論性 |
| REQ-ASR-008 | `docs/domain/code/rust/src/vault/ports.rs` PROP-003 衝突なし |
| REQ-ASR-009 | `docs/domain/aggregates.md` §Note Aggregate ブロック不変条件 |
| REQ-ASR-010 | `docs/tasks/block-based-ui-spec-migration.md` L299–300、`promptnotes/src/routes/+page.svelte:84-99` |
