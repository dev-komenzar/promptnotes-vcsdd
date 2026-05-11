---
coherence:
  node_id: "verif:app-startup-runtime"
  type: verif
  name: "app-startup-runtime 検証アーキテクチャ"
  depends_on:
    - id: "req:app-startup-runtime"
      relation: verifies
---

# Verification Architecture: app-startup-runtime

**Feature**: `app-startup-runtime`
**Phase**: 1b
**Revision**: 1

---

## 1. Purity Boundary Map

### Pure Core（決定論的・副作用なし・形式検証対象）

| 関数 / モジュール | 言語 | 副作用なしの根拠 |
|-----------------|------|---------------|
| `next_available_note_id(preferred, existingIds)` | Rust | `HashSet<NoteId>` のみを参照。`fs::read_dir` 不使用。同一入力で同一出力（PROP-003 / PROP-022）。 |
| `format_base_note_id(ts: Timestamp)` | Rust | `chrono::DateTime<Utc>` 変換のみ。外部 I/O なし。 |
| `nextAvailableNoteId(preferred, existingIds)` | TypeScript | `ReadonlySet<NoteId>` 参照のみ。`Date.now()` 未使用。 |
| `formatBaseId(epochMillis)` | TypeScript | `new Date(epochMillis)` は UTC 変換のみで決定論的（`Date.now()` でない）。 |
| `compose_initial_editing_state(note_id, block_id)` | Rust | `EditingSessionStateDto::Editing` の組み立てのみ。ファイル I/O なし。 |
| `DtoBlock { id: "block-0", type: Paragraph, content: "" }` | Rust | 定数構築。 |
| TS `makeEditingState(noteId)` in `initialize-capture.ts` | TypeScript | `EditingState` オブジェクトの組み立てのみ。参照実装として使用。 |

### Effectful Shell（I/O・Tauri emit・DOM）

| 関数 / モジュール | 言語 | 副作用の内容 |
|-----------------|------|------------|
| `impl NoteIdAllocatorPort` for Vault | Rust | `fs::read_dir` によるファイルシステム読み取り（read-only）。 |
| `feed_initial_state` Tauri handler | Rust | `allocateNoteId` 呼び出し + `FeedDomainSnapshotDto` 構築。 |
| `select_past_note` Tauri handler | Rust | `fs::read_dir`、`editing_session_state_changed` emit、`feed_state_changed` emit。 |
| `+page.svelte` `$effect` (initial load) | TypeScript | Tauri `invoke("feed_initial_state")`、`editingSessionState` 更新、`feedViewState` 更新。 |
| `subscribeEditingSessionState` / Tauri `listen` | TypeScript | Tauri イベントバスの購読（INBOUND）。 |

---

## 2. Verification Tier Assignment

| Tier | 説明 | 対象 REQ |
|------|------|---------|
| Tier 0 | 型システム・コンパイル時保証 | REQ-ASR-005（`CauseDto::InitialLoad` バリアントは型で固定）、REQ-ASR-009（`DtoBlock` 型でブロック構造を強制） |
| Tier 1 | Property test / Fuzzing（TS: fast-check、Rust: proptest） | REQ-ASR-007（決定論性委譲）、REQ-ASR-008（衝突なし）— `next_available_note_id` の既存 property test が根拠 |
| Tier 2 | Integration test（Rust integration / Vitest + JSDOM） | REQ-ASR-001（`allocateNoteId` tempdir Vault）、REQ-ASR-002（`feed_initial_state` 戻り値形状）、REQ-ASR-003（dispatch 順序）、REQ-ASR-004（エラーパス）、REQ-ASR-006（空ノート破棄）、REQ-ASR-010（`feedViewState` hydration） |
| Tier 3 | 受け入れテスト（E2E / DOM）— 本フィーチャのスコープでは MVP 後に実施 | — |

### REQ 別 Tier 理由

| REQ-ID | Tier | 理由 |
|--------|------|------|
| REQ-ASR-001 | Tier 2 | ファイルシステム読み取りを伴うため tempdir を用いた integration test が必要。 |
| REQ-ASR-002 | Tier 2 | `feed_initial_state` の戻り値 JSON 形状を end-to-end で検証する必要がある（Rust `#[test]` + tempdir vault）。 |
| REQ-ASR-003 | Tier 2 | `+page.svelte` の `$effect` 内の dispatch 順序を Vitest + mock Tauri invoke で検証する。 |
| REQ-ASR-004 | Tier 2 | エラーパスの `$effect` 分岐は Vitest + mock で十分。 |
| REQ-ASR-005 | Tier 0 | `CauseDto::InitialLoad` は enum バリアントであり型で保証できる。追加 Tier 2 テストで JSON フィールドを確認。 |
| REQ-ASR-006 | Tier 2 | ファイルシステムへの非書き込みを tempdir で確認する（`assert!(!path.exists())`）。 |
| REQ-ASR-007 | Tier 1 | `next_available_note_id` 決定論性は PROP-022 で既証明。`allocateNoteId` は委譲のみ。 |
| REQ-ASR-008 | Tier 1 + Tier 2 | PROP-003 で pure 層を確認。Tier 2 で effectful 境界（tempdir）を確認。 |
| REQ-ASR-009 | Tier 0 + Tier 2 | `DtoBlock` 型で構造を保証（Tier 0）。JSON の `blocks` 配列を integration test で確認（Tier 2）。 |
| REQ-ASR-010 | Tier 2 | Vitest で `feedViewState` の各フィールドを mock invoke 後に assert する。 |

---

## 3. Proof Obligations

### PROP-ASR-001: `next_available_note_id` — 衝突なし不変条件

- **説明**: ∀ (now, existingIds). `next_available_note_id(now, existingIds) ∉ existingIds`
- **Tier**: 1
- **Tool**: proptest (Rust) + fast-check (TypeScript)
- **Required**: true
- **参照 REQ**: REQ-ASR-007, REQ-ASR-008
- **ステータス**: **既証明** — `app-startup` フィーチャ PROP-003 および `promptnotes/src-tauri/src/domain/vault/note_id.rs` の proptest で検証済み。本フィーチャは新たな proof を書かず、既存 proof を引用する。

---

### PROP-ASR-002: `Vault.allocateNoteId` — effectful 境界での衝突なし

- **説明**: ∀ Vault（`*.md` ファイル `n` 件を含む tempdir）で `allocateNoteId(now)` が返す NoteId のベース名がいずれの既存ファイルとも一致しない
- **Tier**: 2
- **Tool**: Rust `#[test]` + `tempfile::TempDir`
- **Required**: true
- **参照 REQ**: REQ-ASR-001, REQ-ASR-008
- **テスト**: `promptnotes/src-tauri/tests/app_startup_runtime.rs` 内 `allocate_note_id_no_collision_tempdir`

---

### PROP-ASR-003: `feed_initial_state` 後条件 — `Editing` バリアント + 新規ノートシード

- **説明**: `feed_initial_state(vaultPath)` が成功するとき、戻り値 `FeedDomainSnapshotDto` において `editing.status === "editing"`、`feed.visibleNoteIds[0] === editing.currentNoteId`、`noteMetadata[editing.currentNoteId]` が存在し `body === ""`
- **Tier**: 2
- **Tool**: Rust `#[test]` + `tempfile::TempDir` + `serde_json` でデシリアライズして assert
- **Required**: true
- **参照 REQ**: REQ-ASR-002, REQ-ASR-009, REQ-ASR-010
- **テスト**: `promptnotes/src-tauri/tests/app_startup_runtime.rs` 内 `feed_initial_state_returns_editing_snapshot`

---

### PROP-ASR-004: emit 順序 — 起動時の `editing_session_state_changed` before `feed_state_changed`

- **説明**: `+page.svelte` が `feed_initial_state` 結果を受領した後、`editingSessionState` が更新されるのは `feedViewState` が更新されるより先（EC-FEED-017 起動時適用）
- **Tier**: 2
- **Tool**: Vitest + mock `@tauri-apps/api/core` (`invoke`), mock `subscribeEditingSessionState`
- **Required**: true
- **参照 REQ**: REQ-ASR-003
- **テスト**: `promptnotes/src/lib/domain/app-startup/__tests__/page-initial-load.test.ts` 内 `dispatchesEditingStateBeforeFeedViewState`

---

### PROP-ASR-005: 空ノート破棄不変条件 — `select_past_note` 後にファイルなし

- **説明**: 編集中ノートが未保存（Vault にファイル不在）かつ `isNoteEmpty=true` の状態で `select_past_note(M)` を呼び出すと、Vault に `<N>.md` が存在しない
- **Tier**: 2
- **Tool**: Rust `#[test]` + `tempfile::TempDir`（`<N>.md` 非存在を `assert!(!path.exists())` で確認）
- **Required**: true
- **参照 REQ**: REQ-ASR-006
- **テスト**: `promptnotes/src-tauri/tests/app_startup_runtime.rs` 内 `select_past_note_discards_empty_unsaved_note`

---

### PROP-ASR-006: 空 paragraph ブロック不変条件

- **説明**: 自動生成ノートは `blocks.length === 1`、`blocks[0].type === "paragraph"`、`blocks[0].content === ""`
- **Tier**: 0 + Tier 2
- **Tool**: Tier 0: Rust 型システム（`DtoBlock` struct）。Tier 2: `feed_initial_state` integration test で JSON を assert
- **Required**: true
- **参照 REQ**: REQ-ASR-009
- **テスト**: PROP-ASR-003 テストと同ファイル内で assert（`editing.blocks[0]` フィールドを確認）

---

### PROP-ASR-007: `feedViewState` hydration 整合性

- **説明**: `feed_initial_state` 解決後、`feedViewState.editingStatus === "editing"` かつ `feedViewState.editingNoteId === editing.currentNoteId` かつ `feedViewState.visibleNoteIds[0] === editing.currentNoteId`
- **Tier**: 2
- **Tool**: Vitest + mock Tauri invoke
- **Required**: true
- **参照 REQ**: REQ-ASR-010
- **テスト**: `promptnotes/src/lib/domain/app-startup/__tests__/page-initial-load.test.ts` 内 `feedViewStateHydratesEditingSnapshot`

---

### PROP-ASR-008: エラーパスで `editingSessionState` 不変

- **説明**: `feed_initial_state` が `Err` を返した場合、`editingSessionState` が `null` のまま変化しない
- **Tier**: 2
- **Tool**: Vitest + mock Tauri invoke (throws error)
- **Required**: true
- **参照 REQ**: REQ-ASR-004
- **テスト**: `promptnotes/src/lib/domain/app-startup/__tests__/page-initial-load.test.ts` 内 `doesNotDispatchEditingStateOnError`

---

## 4. Test Architecture Sketch

### 新規作成テストファイル

```
promptnotes/src-tauri/tests/app_startup_runtime.rs
  ├── allocate_note_id_no_collision_tempdir          (PROP-ASR-002)
  ├── feed_initial_state_returns_editing_snapshot    (PROP-ASR-003, PROP-ASR-006)
  ├── feed_initial_state_empty_vault                 (EC-ASR-003)
  ├── feed_initial_state_collision_suffix            (EC-ASR-002)
  └── select_past_note_discards_empty_unsaved_note   (PROP-ASR-005)

promptnotes/src/lib/domain/app-startup/__tests__/page-initial-load.test.ts
  ├── dispatchesEditingStateBeforeFeedViewState      (PROP-ASR-004)
  ├── feedViewStateHydratesEditingSnapshot           (PROP-ASR-007)
  └── doesNotDispatchEditingStateOnError             (PROP-ASR-008)
```

### 既存テストファイル（修正対象）

```
promptnotes/src-tauri/src/domain/vault/note_id.rs
  └── 既存 proptest (PROP-003 / PROP-022) — 変更不要（引用のみ）

.vcsdd/features/ui-feed-list-actions/specs/behavioral-spec.md
  └── REQ-FEED-022 の AC を §Cross-Feature Patches に従い修正（Phase 4 フィードバックルーティング）
```

### モック方針

- Rust integration test: `tempfile::TempDir` を使用し、実際の `fs::read_dir` を走らせる（モック不使用）。
- Vitest: `vi.mock("@tauri-apps/api/core", ...)` で `invoke` をスタブ化し、`feed_initial_state` の返り値を注入する。`subscribeEditingSessionState` は `vi.fn()` でイベント駆動をシミュレートする。

---

## 5. Risk Register

| Risk-ID | リスク | 影響度 | 軽減策 |
|---------|--------|--------|--------|
| RISK-ASR-001 | クロックスキュー — システムクロックが過去に戻り `now` が既存ファイルのベース名と衝突する | 中 | `next_available_note_id` の衝突サフィックスロジック（`-N`）が既に対処。EC-ASR-002 integration test で確認。 |
| RISK-ASR-002 | 並列呼び出し — JS イベントループ内で `feed_initial_state` が多重呼び出しされ、同一 NoteId が割り当てられる | 低 | フロントエンドは単一スレッドのイベントループで直列化される（EC-ASR-001 で明記）。Rust 側はリクエストごとに `fs::read_dir` を実行するため、永続化済みファイルがある限り衝突しない。MVP では追加同期機構は不要。 |
| RISK-ASR-003 | 部分的 Vault 読み取り失敗 — `fs::read_dir` が中断しファイル一覧が不完全になる | 中 | `allocateNoteId` はイテレーション中にエラーが発生した場合はエラーを `feed_initial_state` に伝播し、不完全な ID 集合で強行しない（フェールセーフ）。 |
| RISK-ASR-004 | `+page.svelte` の dispatch 順序逆転 — `feedViewState` が先に更新されると `FeedRow` が `editing` ステータスのない state でレンダリングされる | 高 | REQ-ASR-003 と PROP-ASR-004 で明示的に順序を規定し、Vitest テスト（mock の呼び出し順で assert）で保護する。 |
| RISK-ASR-005 | `REQ-FEED-022` 既存テストの破壊 — `editing.status === "idle"` を前提とする既存テストが失敗する | 中 | Phase 4 フィードバックルーティングで `ui-feed-list-actions` Phase 2a テストを更新する（§Cross-Feature Patches に記載）。Red phase のレグレッションとして扱わず、Phase 4 で正式にルーティングする。 |
