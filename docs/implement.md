---
coherence:
  node_id: "governance:implement-mapping"
  type: governance
  name: "Implement — DDD → VCSDD feature マッピング規約"
  depends_on:
    - id: "design:workflows"
      relation: derives_from
    - id: "design:ui-fields"
      relation: derives_from
    - id: "design:aggregates"
      relation: derives_from
    - id: "governance:design-system"
      relation: depends_on
  depended_by:
    - id: "req:app-startup"
    - id: "req:capture-auto-save"
    - id: "req:edit-past-note-start"
    - id: "req:tag-chip-update"
    - id: "req:delete-note"
    - id: "req:copy-body"
    - id: "req:apply-filter-or-search"
    - id: "req:handle-save-failure"
    - id: "req:configure-vault"
    - id: "req:ui-app-shell"
    - id: "req:ui-editor"
    - id: "req:ui-feed-list-actions"
    - id: "req:ui-tag-chip"
    - id: "req:ui-filter-search"
  conventions:
    - targets:
        - "req:ui-app-shell"
        - "req:ui-editor"
        - "req:ui-feed-list-actions"
        - "req:ui-tag-chip"
        - "req:ui-filter-search"
      reason: "feature 分割の見直し・mode 変更・Tauri command 所属変更があれば、すべての UI feature spec を再レビューする"
    - targets:
        - "req:app-startup"
        - "req:capture-auto-save"
        - "req:edit-past-note-start"
        - "req:tag-chip-update"
        - "req:delete-note"
        - "req:copy-body"
        - "req:apply-filter-or-search"
        - "req:handle-save-failure"
        - "req:configure-vault"
      reason: "ワークフロー feature の境界変更時はすべてのドメイン feature spec を再レビューする"
  source_files:
    - "docs/domain/workflows.md"
    - "docs/domain/ui-fields.md"
---

# Implement — DDD ドキュメントと VCSDD パイプラインの接続

このドキュメントは、`docs/domain/` 配下の DDD 設計成果物を、VCSDD パイプライン（`.vcsdd/features/<name>/`）でどのように feature として切り出して実装するかを定義する。

- **目的**：DDD で得たモデルを「ひとつの feature = ひとつの実装スコープ」に分解する規則を固定し、誰が見ても同じ粒度で着手できるようにする
- **接続原則**：DDD ドキュメントの「自然な単位」（ワークフロー、画面セクション）を **1 feature** にマップし、`/vcsdd-init <name>` で VCSDD パイプラインに乗せる
- **収束しやすい粒度**：1 feature が 1〜3 ワークフロー、または 1〜2 画面に収まること。これより大きくすると Phase 3（敵対的レビュー）の failure surface が広がり、Phase 6（収束判定）が成立しなくなる

---

## ドメイン層：Phase 9 `workflows.md` → 1 ワークフロー = 1 feature

`docs/domain/workflows.md` に列挙されたワークフローを、それぞれ独立した feature として切り出した。各 feature の責務は **そのワークフローのパイプライン（中間型 + 純粋関数 + ポート型）の TypeScript 実装**で、UI 配線・Tauri アダプタ・I/O 実装は含まない。

### マッピング表

| workflows.md | feature 名 | mode | 実装場所 |
|-------------|-----------|------|---------|
| Workflow 1: AppStartup | `app-startup` | lean | `promptnotes/src/lib/domain/app-startup/` |
| Workflow 2: CaptureAutoSave | `capture-auto-save` | lean | `promptnotes/src/lib/domain/capture-auto-save/` |
| Workflow 3: EditPastNoteStart | `edit-past-note-start` | lean | `promptnotes/src/lib/domain/edit-past-note-start/` |
| Workflow 4: TagChipUpdate | `tag-chip-update` | lean | `promptnotes/src/lib/domain/tag-chip-update/` |
| Workflow 5: DeleteNote | `delete-note` | lean | `promptnotes/src/lib/domain/delete-note/` |
| Workflow 6: CopyBody | `copy-body` | lean | `promptnotes/src/lib/domain/copy-body/` |
| Workflow 7: ApplyFilterOrSearch | `apply-filter-or-search` | lean | `promptnotes/src/lib/domain/apply-filter-or-search/` |
| Workflow 8: HandleSaveFailure | `handle-save-failure` | lean | `promptnotes/src/lib/domain/handle-save-failure/` |
| Workflow 9: ConfigureVault | `configure-vault` | strict | `promptnotes/src/lib/domain/configure-vault/` |

### この分割の根拠

- **ワークフローはすでに「ステージ末尾の信頼水準が違う独立パイプライン」**：DMMF 設計上、各ワークフローは入力・中間型・出力・エラーカタログが閉じている。これをまたぐ feature を作ると検証範囲が混線する
- **ポート型を共有しても feature は分離可能**：`FileSystem.writeFileAtomic` は CaptureAutoSave / TagChipUpdate / ConfigureVault で共通だが、各 feature は **そのポート型に依存する純粋実装** だけを持ち、実装は UI 層の feature に持ち込む
- **lean mode を基本**：ドメインパイプラインは型と純粋関数で完結し、副作用がない。strict mode の人手レビューゲートを毎回挟むコストは見合わない。例外は `configure-vault` で、ファイルパス検証はセキュリティ境界（パストラバーサル等）に近いため strict を採用

### 状態

- 9 ワークフローすべてが feature 化済み（`/vcsdd-status` で各 feature の `currentPhase: "complete"` を確認可能）

---

## UI 層：Phase 11 `ui-fields.md` → 5 features に分割

`docs/domain/ui-fields.md` の画面・セクション構造を、**vertical slice（ユーザーに見える振る舞いが完結する縦割り）** で 5 features に分割する。各 feature は対応するドメインワークフローの feature を依存として持つ。

### 分割の規則

1. **vertical slice であること** — 1 feature 完了で `bun run tauri dev` 上で何らかのユーザー操作が動く状態になる
2. **同じ画面セクション + 同じ Tauri command 群 + 関連ワークフロー** を束ねる
3. **状態機械を 1 箇所にまとめる** — `EditingSessionState` の状態テーブルは複数 feature に分割しない
4. **層別分割をしない** — "Tauri bindings only" feature や "Svelte stores only" feature は作らない

### 5 features の定義

#### feature 1: `ui-app-shell`

| 項目 | 内容 |
|------|------|
| 対応ドキュメント | `ui-fields.md` 画面 2（Vault 設定誘導モーダル）+ 全体レイアウト枠 + 空フィード骨格 |
| 紐づくワークフロー feature | `app-startup`, `configure-vault` |
| 新規 Tauri command | `settings.load`, `settings.save`, `fs.statDir`, `fs.listMarkdown`, `fs.readFile` |
| 新規 Smart Constructor バインディング | `try_new_vault_path` |
| 含むこと | アプリ起動シーケンス、`Unconfigured` → モーダル誘導、`PathNotFound` / `PermissionDenied` UI、設定完了後の scanVault 連鎖、DESIGN.md トークン適用 |
| 含まないこと | エディタ、フィード行、検索、削除 |

#### feature 2: `ui-editor`

| 項目 | 内容 |
|------|------|
| 対応ドキュメント | `ui-fields.md` §1A（エディタ領域）+ §画面 4（保存失敗バナー）+ §UI 状態と型の対応 |
| 紐づくワークフロー feature | `capture-auto-save`, `copy-body`, `handle-save-failure` |
| 新規 Tauri command | `fs.writeFileAtomic`, `clipboard.write` |
| 新規 Smart Constructor バインディング | `try_new_body`, `try_new_tag`, `try_new_frontmatter` |
| 含むこと | Body テキストエリア、Frontmatter 表示、idle save (debounce 2s) / blur save、コピーボタン、+ 新規ボタン (Ctrl+N)、`EditingSessionState` 状態遷移 UI、保存失敗バナー（再試行 / 破棄 / キャンセル） |
| 含まないこと | フィード行クリックでの編集切替（feature 3 で扱う）、行内タグチップ |

#### feature 3: `ui-feed-list-actions`

| 項目 | 内容 |
|------|------|
| 対応ドキュメント | `ui-fields.md` §1B（フィード一覧）の行表示・行クリック・削除ボタン + §画面 3（削除確認モーダル） |
| 紐づくワークフロー feature | `edit-past-note-start`, `delete-note` |
| 新規 Tauri command | `fs.trashFile` |
| 新規 Smart Constructor バインディング | （なし） |
| 含むこと | フィード行レンダリング、行クリック → `SelectPastNote`、編集中ノートの削除ボタン無効化、削除確認モーダル、`pendingNextNoteId` 経由の switching → save-failed リカバリ経路 |
| 含まないこと | タグチップの追加・削除（feature 4）、検索・フィルタ（feature 5） |
| 前提 | feature 2 が `EditingSessionState` 状態テーブルと保存失敗 UI を提供済みであること |

#### feature 4: `ui-tag-chip`

| 項目 | 内容 |
|------|------|
| 対応ドキュメント | `ui-fields.md` §1B 行内タグチップ + §1C 左サイドバータグフィルタ |
| 紐づくワークフロー feature | `tag-chip-update`, `apply-filter-or-search`（タグフィルタ部分のみ） |
| 新規 Tauri command | （なし、feature 2 の `fs.writeFileAtomic` を再利用） |
| 新規 Smart Constructor バインディング | （feature 2 の `try_new_tag` を再利用） |
| 含むこと | フィード行のタグチップ表示、末尾「+」追加 UI、「×」削除、TagInventory ベースのオートコンプリート、左サイドバーのタグ一覧（usageCount 降順）、`ApplyTagFilter` / `RemoveTagFilter` / `ClearFilter`、未使用タグ自動削除 |
| 含まないこと | フリーテキスト検索（feature 5） |

#### feature 5: `ui-filter-search`

| 項目 | 内容 |
|------|------|
| 対応ドキュメント | `ui-fields.md` §1D（検索ボックス）+ §1E（ソート切替） |
| 紐づくワークフロー feature | `apply-filter-or-search`（検索・ソート部分） |
| 新規 Tauri command | （なし） |
| 新規 Smart Constructor バインディング | （なし） |
| 含むこと | 検索テキスト入力、debounce 200ms、Esc クリア、0 件結果 UI、ソート方向トグル、フィルタ + 検索の AND 合成表示 |
| 含まないこと | 検索方式の高度化（正規表現等は openQuestion） |

### 依存順と着手順

```
ui-app-shell ──→ ui-editor ──→ ui-feed-list-actions ──→ ui-tag-chip ──→ ui-filter-search
```

- `ui-app-shell` を先に完了させないと、以降の feature は `bun run tauri dev` で動作確認できない
- `ui-tag-chip` と `ui-filter-search` は同じ `apply-filter-or-search` ドメイン feature を共有するが、UI セクションが独立しているので逐次着手で問題ない

### mode 選択

UI features はすべて **strict** を推奨する。

- 状態遷移（`idle` / `editing` / `saving` / `switching` / `save-failed`）と UI 表示の対応が `ui-fields.md` §UI 状態と型の対応で型レベル契約として固定されており、これを実装で破ると敵対的レビューで検出すべき
- 保存失敗バナー、削除確認モーダル、Vault 設定誘導モーダルなどはユーザー体験の境界で、人手レビューゲート（Phase 1c）の価値が高い
- ドメイン feature に比べ Tauri ↔ Svelte の配線箇所が多く、回帰しやすい

---

## `/vcsdd-init` 指示テンプレート

UI 5 features を切り出す際の `/vcsdd-init` 指示。各 feature の活性化前に、必要な前提 feature が `currentPhase: "complete"` に達していることを `/vcsdd-status` で確認する。

### feature 1: ui-app-shell

```
/vcsdd-init ui-app-shell --mode strict --language typescript
```

**Phase 1a で参照させる入力**：
- `docs/domain/ui-fields.md` §重要設計前提、§画面 2、§UI 状態と型の対応
- `docs/domain/workflows.md` §Workflow 1 (AppStartup)、§Workflow 9 (ConfigureVault)
- `DESIGN.md` 全体（カラーパレット、タイポグラフィ、レイアウト、影）
- `docs/domain/code/ts/src/`（Unvalidated 型）+ `docs/domain/code/rust/src/value_objects.rs`（Smart Constructor）

**Phase 1a 仕様で必ず含めるべき要件**：
- アプリ起動時の AppStartup パイプライン呼び出し配線
- `VaultPath` 未設定時の設定誘導モーダル表示
- 設定モーダルでの `try_new_vault_path` 呼び出しと `VaultPathError` UI 反映
- `corruptedFiles[]` ≥ 1 のとき黄色バナー表示
- DESIGN.md 準拠の全体レイアウト枠（ヘッダ、メイン領域、空フィード骨格）

### feature 2: ui-editor

```
/vcsdd-init ui-editor --mode strict --language typescript
```

**Phase 1a で参照させる入力**：
- `docs/domain/ui-fields.md` §1A、§画面 4、§UI 状態と型の対応、§検証エラー ↔ UI フィールド マッピング
- `docs/domain/workflows.md` §Workflow 2 (CaptureAutoSave)、§Workflow 6 (CopyBody)、§Workflow 8 (HandleSaveFailure)
- `docs/domain/aggregates.md`（`EditingSessionState`、`Body.isEmptyAfterTrim`）
- `DESIGN.md` Inputs / Buttons / Cards セクション

**Phase 1a 仕様で必ず含めるべき要件**：
- Body 入力ごとの `EditNoteBody` Command 発火（`isDirty=true`）
- `IDLE_SAVE_DEBOUNCE_MS=2000` で `TriggerIdleSave` 自動発火
- フォーカスアウトで `TriggerBlurSave` 自動発火
- `EditingSessionState` の 5 状態（idle/editing/saving/switching/save-failed）に対応する UI の出し分け
- 保存失敗バナーの 3 ボタン（再試行 / 破棄 / キャンセル）と `SaveError.kind` メッセージ分岐
- コピーボタン、+ 新規ボタン (Ctrl+N)、`source` 判別

### feature 3: ui-feed-list-actions

```
/vcsdd-init ui-feed-list-actions --mode strict --language typescript
```

**前提**：`ui-app-shell` と `ui-editor` の完了（依存ドメイン feature `edit-past-note-start` / `delete-note` は完了済み）。

**Phase 1a で参照させる入力**：
- `docs/domain/ui-fields.md` §1B（タグチップ操作以外）、§画面 3
- `docs/domain/workflows.md` §Workflow 3 (EditPastNoteStart)、§Workflow 5 (DeleteNote)
- `docs/domain/aggregates.md`（`Feed`、`pendingNextNoteId` キューイング戦略）
- `DESIGN.md` Cards / Modals セクション

**Phase 1a 仕様で必ず含めるべき要件**：
- フィード行レンダリング（createdAt/updatedAt、body プレビュー、tags 表示）
- 行クリック → `SelectPastNote` → `flushCurrentSession` → `startNewSession` 連鎖
- 保存失敗時の `pendingNextNoteId` 保持と次セッション復元
- 編集中ノートの削除ボタン無効化（型レベル + UI 層の二重防御）
- 削除確認モーダルの「OS ゴミ箱に送る」メッセージと赤ボタン
- `fs.trashFile` 失敗時のバナー（再試行可）

### feature 4: ui-tag-chip

```
/vcsdd-init ui-tag-chip --mode strict --language typescript
```

**前提**：`ui-feed-list-actions` の完了。

**Phase 1a で参照させる入力**：
- `docs/domain/ui-fields.md` §1B タグチップ操作、§1C 左サイドバー
- `docs/domain/workflows.md` §Workflow 4 (TagChipUpdate)、§Workflow 7（タグフィルタ部分）
- `docs/domain/aggregates.md`（`TagInventory`、未使用タグ自動削除の不変条件）
- `docs/domain/glossary.md` §タグ

**Phase 1a 仕様で必ず含めるべき要件**：
- 行末尾「+」アイコンからのタグ追加 UI（TagInventory サジェスト付き）
- チップ右肩「×」での削除（idempotent）
- `try_new_tag` での正規化と `TagError` UI 反映
- 左サイドバーのタグ一覧（usageCount 降順、`#tag (count)` 表示）
- 複数選択時の同タグ間 OR セマンティクス
- 未使用タグの自動非表示（`usageCount > 0` の不変条件）

### feature 5: ui-filter-search

```
/vcsdd-init ui-filter-search --mode strict --language typescript
```

**前提**：`ui-tag-chip` の完了。

**Phase 1a で参照させる入力**：
- `docs/domain/ui-fields.md` §1D、§1E
- `docs/domain/workflows.md` §Workflow 7 (ApplyFilterOrSearch)
- `docs/domain/aggregates.md`（`FilterCriteria`、`SearchQuery`、`AppliedFilter`）

**Phase 1a 仕様で必ず含めるべき要件**：
- 検索ボックスの `SEARCH_DEBOUNCE_MS=200` debounce
- 部分一致 + 大文字小文字無視（MVP）
- Esc キーで `ClearSearch`
- 0 件結果時の「該当なし」UI
- ソート方向トグル（▼/▲）、既定 `desc`
- フィルタ + 検索の AND 合成（同種 OR / 異種 AND セマンティクス）

---

## 共通ルール

### 各 feature の Phase 1a で必ず引用するもの

1. **対応する `ui-fields.md` セクション** — 入力フィールド表、検証規則、動的挙動
2. **対応する `workflows.md` ワークフロー** — エラーカタログ、UI マッピング表
3. **`DESIGN.md`** — 該当するコンポーネントカテゴリ（Buttons / Cards / Inputs / Modals 等）
4. **既存ドメイン feature の `pipeline.ts`** — そのまま import するエントリポイント

### Phase 2b で実装すべき配線レイヤ

1. **Tauri Rust コマンド** (`promptnotes/src-tauri/src/`) — ポート型に対応する `#[tauri::command]` 関数
2. **Svelte ストア** (`promptnotes/src/lib/stores/`) — ドメインパイプラインの状態を保持する rune
3. **Svelte コンポーネント** (`promptnotes/src/lib/components/` または `routes/`) — DESIGN.md トークンを使用した UI

### Phase 3 で adversary が確認すべき観点

- ドメイン feature のパイプラインを **そのまま呼び出している**か（再実装していないか）
- Smart Constructor が **TypeScript 側で構築されていない**か（必ず Tauri command 経由か）
- `EditingSessionState` の状態遷移が型レベルの不変条件を破っていないか
- DESIGN.md と矛盾するハードコード値（色、サイズ、影）を入れていないか
- エラーパスの UI が `ui-fields.md` のマッピング表通りか

---

## 完了定義

UI 5 features すべてが Phase 6（収束判定）PASS した時点で、`docs/domain/ui-fields.md` の全画面が `bun run tauri dev` で動作する状態になる。これをもって MVP の DDD → 実装の接続が完了とする。
