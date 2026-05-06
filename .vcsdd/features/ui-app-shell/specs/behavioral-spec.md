---
coherence:
  node_id: "req:ui-app-shell"
  type: req
  name: "ui-app-shell 行動仕様"
  depends_on:
    - id: "governance:implement-mapping"
      relation: derives_from
    - id: "design:ui-fields"
      relation: derives_from
    - id: "design:workflows"
      relation: derives_from
    - id: "governance:design-system"
      relation: depends_on
  modules:
    - "ui-app-shell"
    - "app-startup"
    - "configure-vault"
  source_files:
    - "promptnotes/src/lib/ui/app-shell"
    - "promptnotes/src/routes/+page.svelte"
    - "promptnotes/src/routes/+layout.ts"
---

# Behavioral Specification: ui-app-shell

**Feature**: `ui-app-shell`
**Phase**: 1a
**Revision**: 3 (iteration-3)
**Mode**: strict
**Source of truth**:
- `docs/domain/ui-fields.md` §重要設計前提, §画面 2 (Vault設定誘導モーダル), §UI 状態と型の対応
- `docs/domain/workflows.md` §Workflow 1 (AppStartup), §Workflow 9 (ConfigureVault)
- `DESIGN.md` (全体)
- `docs/domain/code/ts/src/shared/value-objects.ts` (`VaultPath`, `VaultPathError`, `VaultId`, `Timestamp`)
- `docs/domain/code/ts/src/shared/errors.ts` (`VaultConfigError`, `AppStartupError`)
- `docs/domain/code/rust/src/value_objects.rs` (`VaultPath::try_new`, `VaultPathError`)
- `.vcsdd/features/app-startup/specs/behavioral-spec.md` (参照のみ、パイプライン実装は非重複)
- `.vcsdd/features/configure-vault/specs/behavioral-spec.md` (参照のみ)

> **注意**: `docs/domain/code/ts/src/capture/states.ts` (`EditingSessionState`) は本 feature の対象外。
> `InitialUIState.editingSessionState` は editor feature へのパススルーであり、
> `ui-app-shell` はその内容を参照・レンダリングしない（NEG-REQ-001 参照）。(FIND-016 解消)

**Scope**: UI シェル層のみ。ドメインパイプライン (`app-startup`, `configure-vault`) の再実装は一切行わない。それらのパイプラインを Svelte UI および Tauri コマンドへ結線し、グローバルレイアウトフレームを描画することが本 feature の責務。

---

## 改訂履歴 / Revision History

| 反復 | 対象 finding | 解消箇所 | 概要 |
|------|-------------|----------|------|
| 2 | FIND-001 | §Tauri コマンドサーフェス, REQ-004, REQ-006, 設計前提 | Tauri command 名を `try_vault_path` に統一。Rust 側は `VaultPath::try_new` に統一。 |
| 2 | FIND-002 (CRITICAL) | REQ-002, §AppShellState, EC 行 | `Err({kind:'scan'})` → `UnexpectedError` 遷移を明示。AC に 5 経路すべて列挙。 |
| 2 | FIND-003 | REQ-003 EARS 節 | WHILE 節を `Unconfigured OR StartupError` に拡張し AC と一致させた。 |
| 2 | FIND-004 | EC-01 行 | 破損 JSON は `unconfigured` へ。`path-not-found` への誤分類を除去。 |
| 2 | FIND-009 | REQ-006 AC | `invoke_app_startup()` 再呼び出し方式 (Option A) に確定。曖昧な「or equivalent」を削除。 |
| 2 | FIND-010 | REQ-013 EARS | `DESIGN.md §6` を `DESIGN.md §2 (Shadows & Depth)` に修正。 |
| 2 | FIND-011 | NEG-REQ-005 | `VaultId`, `Timestamp` を禁止ブランド型リストに追加。 |
| 2 | FIND-013 | §エッジケースカタログ | EC-14〜EC-20 (symlink, OS_PATH_MAX, mid-NUL, picker-revoke, network-FS hang, Settings.save 失敗, HMR mid-flight) を追加。 |
| 2 | FIND-014 | REQ-020 (新規追加) | `Loading` 状態の初期値・描画内容・遷移規則を REQ-020 として明文化。 |
| 2 | FIND-016 | Source of truth ヘッダー | `EditingSessionState` を削除し注意書きを追記。 |
| 2 | FIND-017 | REQ-021 (新規追加) | `appShellStore` / `bootFlag` の書き込み権限・HMR リセットセマンティクスを REQ-021 として明文化。 |
| 2 | FIND-012 (minor) | REQ-019 | カラートークン許可リストを REQ-019 内に明記し DESIGN.md Token Reference セクションを参照源に。 |
| 3 | FIND-018 (CRITICAL) | REQ-006 エッジケース, EC-19 | `disk-full`/`lock`/`unknown` は `VaultConfigError` variants ではない。configure-vault REQ-005/REQ-007 がそれらを `path-not-found` に折り畳む。EC-19 を依存契約に整合した記述に置換。 |
| 3 | FIND-019 (MAJOR) + FIND-013 partial | REQ-022 (新規), REQ-008 EARS 更新 | IPC タイムアウトポリシーを REQ-022 として明文化。タイムアウト所有者・継続時間・Late-arrival 廃棄・PROP-014 を追加。 |
| 3 | FIND-020 (MAJOR) | EC-12 削除 | EC-12 は REQ-020/REQ-021/EC-20 と矛盾するため削除。アプリ再ロード挙動は REQ-020 + REQ-021 + EC-20 で完全定義済み。 |
| 3 | FIND-021 (MAJOR) + FIND-012 partial | REQ-011 AC, NFR-07 | スペーシング許可リストを `[2, 3, 4, 5, 5.6, 6, 6.4, 7, 8, 11, 12, 14, 16, 24, 32]` (DESIGN.md §5 line 184+185) に統一。PROP-006 と同一リストに揃え。 |
| 3 | FIND-022 (MINOR) | DESIGN.md §4 | §4 Distinctive Components に "Modal & Overlay" サブセクションを追加し `rgba(0,0,0,0.5)` の定義を提供。§10 の出典引用が正当化される。 |
| 3 | FIND-023 (MINOR) + FIND-007 partial | (verification-architecture.md PROP-013) | PROP-013 タイトルを "in-process 再マウント" に改名し PROP-012 へのクロスリファレンスを追加。(behavioral-spec 変更なし) |

---

## 設計前提の確認

### Tauri コマンドサーフェス（単一カノニカルテーブル）(FIND-001 解消)

| TypeScript 側 Tauri コマンド名 | Rust 側の実装 | 説明 |
|-------------------------------|--------------|------|
| `invoke_app_startup` | AppStartup パイプライン全体 | 起動時 & configure-vault 完了後に再呼び出し |
| `try_vault_path` | `VaultPath::try_new(raw_path)` | Rust 側の associated method が検証を担う |
| `invoke_configure_vault` | configure-vault パイプライン | `VaultPath` 検証済み後に呼ぶ |

> **命名規約**: TypeScript 側は snake_case の Tauri コマンド名 (`try_vault_path`) を使用する。
> `docs/domain/ui-fields.md` に登場する `try_new_vault_path` は同文書内のドキュメンテーション上の略称であり、Tauri コマンド名ではない。
> Rust 側の associated method 名は `VaultPath::try_new`。この 2 つ以外の名称を実装で使用してはならない。

### Smart Constructor は Rust 側が真実

`docs/domain/ui-fields.md §重要設計前提` および `docs/domain/code/rust/src/value_objects.rs` より:

- `VaultPath` は TypeScript 側で構築不能（`Brand<string, "VaultPath">` + unique symbol）
- UI は raw `string` を受け付け、Tauri command `try_vault_path` 経由で Rust `VaultPath::try_new` を呼ぶ
- `VaultPathError` の variants は `value_objects.rs` が真実: `Empty` / `NotAbsolute` の 2 種のみ
- `DoesNotExist` / `NotADirectory` / `PermissionDenied` は `FileSystem.statDir` レイヤーの `VaultConfigError` として現れる

### 依存フィーチャーの参照関係

| 依存フィーチャー | 参照する成果物 | 本フィーチャーの役割 |
|----------------|--------------|-------------------|
| `app-startup` | `promptnotes/src/lib/domain/app-startup/` パイプライン | 起動時に invoke するだけ |
| `configure-vault` | `promptnotes/src/lib/domain/configure-vault/` パイプライン | Vault 設定モーダルから invoke するだけ |

---

## パイプライン概要

```
アプリ起動
  └─→ Tauri command: invoke_app_startup()
        └─→ app-startup pipeline → Result<InitialUIState, AppStartupError>
              ├─ Ok(InitialUIState)   → Configured: メインフィードを表示
              |     └─ corruptedFiles ≥ 1 → 黄色バナー表示
              └─ Err(AppStartupError)
                    ├─ kind:'config', reason:'unconfigured'      → AppShellState:Unconfigured → Vault設定モーダル (空状態)
                    ├─ kind:'config', reason:'path-not-found'    → AppShellState:StartupError → Vault設定モーダル (エラー付き)
                    ├─ kind:'config', reason:'permission-denied' → AppShellState:StartupError → Vault設定モーダル (エラー付き)
                    └─ kind:'scan', reason:'list-failed'         → AppShellState:UnexpectedError → インラインバナー

Vault設定モーダル (フォルダ選択)
  └─→ Tauri command: try_vault_path(rawPath: string)
        └─→ Rust VaultPath::try_new(raw_path) → Result<VaultPath, VaultPathError>
              ├─ Err(VaultPathError)    → モーダル内エラー表示
              └─ Ok(VaultPath)
                    └─→ Tauri command: invoke_configure_vault(path)
                          └─→ configure-vault pipeline → Result<VaultDirectoryConfigured, VaultConfigError>
                                ├─ Err(VaultConfigError)     → モーダル内エラー表示
                                └─ Ok(VaultDirectoryConfigured)
                                      └─→ invoke_app_startup() を再呼び出し (全ステップ実行)
```

---

## AppShellState の定義 (FIND-002 解消)

`AppShellState` は以下 5 値の判別可能ユニオン:

```typescript
type AppShellState =
  | 'Loading'          // 初期値。invoke_app_startup 応答待ち中
  | 'Configured'       // Ok(InitialUIState) を受信
  | 'Unconfigured'     // Err({kind:'config', reason:{kind:'unconfigured'}}) を受信
  | 'StartupError'     // Err({kind:'config', reason:{kind:'path-not-found'|'permission-denied'}}) を受信
  | 'UnexpectedError'  // Err({kind:'scan'}) または Tauri IPC クラッシュを受信
```

`AppStartupError` の全 variant と `AppShellState` の対応:

| AppStartupError | AppShellState | UI |
|----------------|---------------|-----|
| `Ok(InitialUIState)` | `Configured` | メインフィード |
| `Err({kind:'config', reason:{kind:'unconfigured'}})` | `Unconfigured` | Vault設定モーダル（空） |
| `Err({kind:'config', reason:{kind:'path-not-found'}})` | `StartupError` | Vault設定モーダル（エラー付き） |
| `Err({kind:'config', reason:{kind:'permission-denied'}})` | `StartupError` | Vault設定モーダル（エラー付き） |
| `Err({kind:'scan', reason:{kind:'list-failed'}})` | `UnexpectedError` | インラインバナー |
| Tauri IPC クラッシュ (invoke reject) | `UnexpectedError` | インラインバナー |

---

## Requirements

### REQ-001: 起動時 AppStartup パイプライン呼び出し

**EARS**: WHEN the Svelte application mounts (`onMount`) AND `bootAttempted === false` THEN the system SHALL set `bootAttempted = true`, transition `AppShellState` to `'Loading'`, and invoke the AppStartup pipeline exactly once by calling the Tauri command `invoke_app_startup`, obtain a `Result<InitialUIState, AppStartupError>`, and dispatch the result to the UI state discriminator (REQ-002).

**エッジケース**:
- コンポーネントが二重マウントされた場合（HMR など）: `bootAttempted` フラグで 2 回目の invoke を抑制する（REQ-020 および REQ-021 参照）
- Tauri IPC が失敗した場合（invoke 自体が reject）: `AppShellState` を `UnexpectedError` に遷移し REQ-008 に従いインラインバナーを表示する

**Acceptance Criteria**:
- `onMount` コールバック内で `invoke('invoke_app_startup')` がちょうど 1 回呼ばれる（初回マウント時）
- `bootAttempted === true` の場合、再度 invoke しない（HMR 二重マウント対応）
- `AppShellState` は invoke 呼び出し前に `'Loading'` に遷移する
- invoke の戻り値は discriminated union として消費される（直接 UI レンダリングに使わない）

---

### REQ-002: AppStartup 結果の UI 状態へのルーティング

**EARS**: WHEN the AppStartup pipeline result arrives THEN the system SHALL discriminate the result and route as follows:
- `Ok(InitialUIState)` → `AppShellState` を `'Configured'` に遷移し、メインフィードスケルトンを表示する
- `Err({ kind:'config', reason:{ kind:'unconfigured' } })` → `AppShellState` を `'Unconfigured'` に遷移し、Vault 設定誘導モーダルを表示する（REQ-003）
- `Err({ kind:'config', reason:{ kind:'path-not-found', path } })` → `AppShellState` を `'StartupError'` に遷移し、Vault 設定誘導モーダルを `path-not-found` エラー付きで表示する（REQ-007）
- `Err({ kind:'config', reason:{ kind:'permission-denied', path } })` → `AppShellState` を `'StartupError'` に遷移し、Vault 設定誘導モーダルを `permission-denied` エラー付きで表示する（REQ-007）
- `Err({ kind:'scan', reason:{ kind:'list-failed' } })` → `AppShellState` を `'UnexpectedError'` に遷移し、インラインバナーを表示する（REQ-008）

**Acceptance Criteria**:
- `AppShellState` は `'Loading' | 'Configured' | 'Unconfigured' | 'StartupError' | 'UnexpectedError'` の判別可能ユニオン（§AppShellState 定義参照）
- `Ok` パスは必ず `'Configured'` に遷移する
- `unconfigured` エラーは必ず `'Unconfigured'` に遷移する
- `path-not-found` / `permission-denied` エラーは必ず `'StartupError'` に遷移する
- `scan` エラーは必ず `'UnexpectedError'` に遷移し、モーダルを開かない
- Tauri IPC クラッシュは必ず `'UnexpectedError'` に遷移する
- `'Configured'` への遷移時は Vault 設定モーダルを表示しない（逆も然り）
- `'StartupError'` 遷移時はエラー variant (`path-not-found` / `permission-denied`) とパス文字列をモーダルに引き渡す

---

### REQ-003: Unconfigured / StartupError 状態 — Vault 設定誘導モーダルの表示 (FIND-003 解消)

**EARS**: WHILE (`AppShellState === 'Unconfigured'` OR `AppShellState === 'StartupError'`) THE SYSTEM SHALL render the vault setup modal (`VaultSetupModal`) that overlays the entire application frame, blocking interaction with the rest of the UI.

**エッジケース**:
- overlay クリック: `'Unconfigured'` / `'StartupError'` 状態中はモーダルを閉じない（close-on-overlay-click 無効）
- Esc キー: `'Unconfigured'` / `'StartupError'` 状態中は無効（フォーカストラップ維持）
- バックグラウンドのフィードコンテンツ: DOM に存在するが `aria-hidden="true"` + `inert` 属性で隠蔽

**Acceptance Criteria**:
- `AppShellState` が `'Unconfigured'` でも `'StartupError'` でもないとき、`VaultSetupModal` は DOM にレンダリングされない
- `AppShellState === 'Unconfigured'` または `AppShellState === 'StartupError'` のとき、`VaultSetupModal` の dialog 要素が `open` かつ最前面に表示される
- overlay クリックイベントのハンドラが `event.stopPropagation()` を呼び、モーダルを閉じない
- モーダル内に「保存先フォルダを選択してください」テキストが表示される（`Unconfigured` 状態時）
- `VaultSetupModal` に `data-testid="vault-setup-modal"` 属性を持つ

---

### REQ-004: Vault 設定モーダル — パス入力と Tauri コマンド呼び出し (FIND-001 解消)

**EARS**: WHEN the user selects or types a path in the vault setup modal AND confirms submission THEN the system SHALL invoke the Tauri command `try_vault_path(rawPath: string)` which calls Rust `VaultPath::try_new` and SHALL NOT construct `VaultPath` in TypeScript.

> **Tauri コマンド名の確定**: TypeScript 側は `invoke('try_vault_path', { rawPath })` を呼ぶ。
> Rust 側の Tauri ハンドラは `#[tauri::command] fn try_vault_path(raw_path: String)` であり、内部で `VaultPath::try_new(&raw_path)` を呼ぶ。

**エッジケース**:
- 空文字列 / ホワイトスペースのみ: Rust `VaultPath::try_new` が `VaultPathError::Empty` を返す → REQ-005
- 相対パス: Rust `VaultPath::try_new` が `VaultPathError::NotAbsolute` を返す → REQ-005
- NUL バイトを含むパス: Rust 側で OS stat エラーとして処理される。UI はエラー表示するが種別判定は不要
- OS フォルダピッカーのキャンセル: picker が `null` / `undefined` を返す場合、invoke を呼ばずモーダルを現状維持する
- ユーザーが 2 回続けて Save ボタンを押す（ダブルクリック): `isSaving` フラグで 2 回目の invoke を抑制する

**Acceptance Criteria**:
- フォームの submit ハンドラが `invoke('try_vault_path', { rawPath })` を呼ぶ
- TypeScript 側に `VaultPath` を構築するコードが存在しない（PROP-002 参照）
- OS ピッカーキャンセル時は invoke を呼ばない
- `isSaving === true` の間は二重送信を防ぐ

---

### REQ-005: Vault 設定モーダル — `VaultPathError` 変換後のエラー表示

**EARS**: WHEN the Tauri command `try_vault_path` returns a `VaultPathError` variant THEN the system SHALL display the corresponding UI message within the modal, inline to the path input field.

**`VaultPathError` 変換テーブル** (`value_objects.rs` `VaultPathError` enum 真実 — variants は `Empty` / `NotAbsolute` の 2 種のみ):

| `VaultPathError` variant | UI メッセージ |
|--------------------------|------------|
| `Empty` | 「フォルダを選択してください」（`ui-fields.md §検証エラー ↔ UI フィールド マッピング` `VaultPathError.empty` 行） |
| `NotAbsolute` | 「絶対パスを指定してください」（`ui-fields.md` `VaultPathError.not-absolute` 行） |

**Acceptance Criteria**:
- `VaultPathError.kind === 'empty'` が入力フィールド近傍に「フォルダを選択してください」と表示される
- `VaultPathError.kind === 'not-absolute'` が入力フィールド近傍に「絶対パスを指定してください」と表示される
- エラーメッセージは `role="alert"` を持つ要素に表示される
- エラーメッセージは入力フィールドと関連付けられる（`aria-describedby`）
- `VaultPathError` の全 variant が処理される — TypeScript の exhaustive switch でコンパイル時保証（PROP-003 参照）

---

### REQ-006: Vault 設定モーダル — 成功時の設定永続化と AppStartup 再実行 (FIND-009 解消)

**EARS**: WHEN `try_vault_path` returns `Ok(VaultPath)` THEN the system SHALL invoke the Tauri command `invoke_configure_vault(path: VaultPath)` which calls the `configure-vault` pipeline, and WHEN `invoke_configure_vault` succeeds THEN the system SHALL immediately re-invoke `invoke_app_startup()` (full pipeline including Step 1), and SHALL NOT persist settings before successful `try_vault_path` validation.

> **設計選択 (FIND-009 Option A)**: configure-vault 完了後は `invoke_app_startup()` を再呼び出しする。
> これにより Step 1 がディスクから最新の Settings を読み直し、保存と IPC の race が自然に解消される。
> `invoke_app_startup_scan` のような partial re-entry コマンドは存在せず、本 feature は追加しない。

**エッジケース**:
- `invoke_configure_vault` が `path-not-found` エラーを返す: REQ-007 に従いモーダル内エラー表示（Settings.save の `disk-full`/`lock`/`unknown` 失敗もここに含まれる — configure-vault REQ-007 がそれらを `path-not-found` に折り畳む。出典: `.vcsdd/features/configure-vault/specs/behavioral-spec.md` Error Catalog lines 310-315）
- `invoke_configure_vault` が `permission-denied` エラーを返す: REQ-007 に従いモーダル内エラー表示
- `invoke_app_startup()` 再実行中: `AppShellState` を `'Loading'` に戻す（REQ-020 参照）

> **依存契約に関する注記 (FIND-018 解消)**: `invoke_configure_vault` が TypeScript 層へ返す型は `Result<VaultDirectoryConfigured, VaultConfigError>` であり、`VaultConfigError` の variants は `path-not-found` と `permission-denied` の 2 種のみ（`unconfigured` は AppStartup 専用）。`disk-full`/`lock`/`unknown` は `FsError` の variants であり、configure-vault パイプラインが内部で `path-not-found` に折り畳んで返す。これらを `VaultConfigError` として参照することは型システムで不可能であり、本 feature では `path-not-found` ルートとしてのみ処理する。出典: `.vcsdd/features/configure-vault/specs/behavioral-spec.md` REQ-005 (lines 104-114), REQ-007 (lines 133-144), Error Catalog (lines 286-315)。

**Acceptance Criteria**:
- `invoke_configure_vault` は `try_vault_path` 成功後にのみ呼ばれる
- `invoke_configure_vault` 成功後、`invoke_app_startup()` を再呼び出しする
- 設定の永続化 (`Settings.save`) は Tauri command 内部で行われ、TypeScript 側で直接呼ばない
- 成功時にモーダルを閉じ、`AppShellState` を `'Loading'` → `'Configured'` に遷移する

---

### REQ-007: Startup エラー状態 — `PathNotFound` / `PermissionDenied` のモーダルルーティング

**EARS**: WHEN `AppStartupError.reason.kind === 'path-not-found'` OR `AppStartupError.reason.kind === 'permission-denied'` THEN the system SHALL open the `VaultSetupModal` with the corresponding error message pre-populated, blocking UI until vault is re-configured.

**エラーメッセージ対応** (`ui-fields.md §画面 2` エラーカタログ):

| `AppStartupError.reason.kind` | UI メッセージ |
|------------------------------|------------|
| `path-not-found` | 「設定したフォルダが見つかりません。再設定するか、フォルダを復元してください」 |
| `permission-denied` | 「フォルダへのアクセス権限がありません」 |

**Acceptance Criteria**:
- `path-not-found` エラー時にモーダルが開き、上記メッセージが表示される
- `permission-denied` エラー時にモーダルが開き、上記メッセージが表示される
- モーダルは REQ-003 と同じ「閉じられない」制約を持つ
- エラーメッセージは `data-testid="startup-error-message"` を持つ要素に表示される

---

### REQ-008: Unexpected エラー状態 — インラインバナー表示

**EARS**: WHEN `AppStartupError.kind === 'scan'` OR the Tauri IPC itself throws an unexpected error OR a pipeline IPC has remained pending beyond the configured timeout (see REQ-022) THEN the system SHALL set `AppShellState` to `'UnexpectedError'`, render a non-modal inline error banner at the top of the application frame WITHOUT opening the vault setup modal.

**Acceptance Criteria**:
- `'UnexpectedError'` 遷移時にモーダルを開かずバナーを表示する
- バナーは `role="alert"` を持つ
- バナーはフォーカスを奪わない（`autofocus` なし）
- バナーは `data-testid="startup-error-banner"` を持つ
- `AppShellState === 'UnexpectedError'` のとき `VaultSetupModal` は DOM にレンダリングされない

---

### REQ-009: 破損ファイル警告バナー

**EARS**: WHEN `InitialUIState.corruptedFiles.length >= 1` THEN the system SHALL render a yellow warning banner within the main feed area displaying the count of corrupted files. WHEN `InitialUIState.corruptedFiles.length === 0` THEN the system SHALL NOT render the banner.

**エッジケース**:
- `corruptedFiles` が `undefined` / `null` の場合: 空配列として扱い、バナーを表示しない
- `corruptedFiles.length === 1`: 「1 件の破損ファイルがあります」（単数）
- `corruptedFiles.length >= 2`: 「N 件の破損ファイルがあります」（複数形は日本語のため変わらず）

**Acceptance Criteria**:
- `corruptedFiles.length === 0` のときバナーが DOM に存在しない
- `corruptedFiles.length === 1` のときバナーが表示される
- `corruptedFiles.length > 1` のときバナーが表示される（件数を含む）
- バナーの背景色は DESIGN.md の Orange (`#dd5b00`) / warn セマンティクストークンを使用する
- バナーはフォーカスを奪わない（REQ-018）
- バナーは `data-testid="corrupted-files-banner"` を持つ

---

### REQ-010: グローバルレイアウトフレーム — ヘッダー

**EARS**: WHEN `AppShellState === 'Configured'` THEN the system SHALL render a header bar that uses:
- 背景色: Pure White (`#ffffff`)
- ボーダー下辺: Whisper Border (`1px solid rgba(0,0,0,0.1)`)
- アプリタイトルのフォント: NotionInter 15px weight 600 (Nav/Button スタイル, `DESIGN.md §3 Nav / Button`)
- テキスト色: Near-Black (`rgba(0,0,0,0.95)`)

**Acceptance Criteria**:
- `<header>` 要素が `#ffffff` 背景を持つ
- `<header>` 要素が `1px solid rgba(0,0,0,0.1)` 下辺ボーダーを持つ
- アプリ名テキストが `font-size: 15px`, `font-weight: 600` で表示される
- ヘッダー内にハードコードされた Hex カラーは DESIGN.md に定義されたもののみ使用する

---

### REQ-011: グローバルレイアウトフレーム — メインエリア

**EARS**: WHEN `AppShellState === 'Configured'` THEN the system SHALL render a main content area with:
- 背景色: Warm White (`#f6f5f4`) または Pure White (`#ffffff`) — DESIGN.md 交互セクション方式に従う
- メインエリアは `<main>` 要素で構成する
- 基本スペーシングは DESIGN.md の 8px ベースユニットスケールに従う

**Acceptance Criteria**:
- `<main>` 要素が存在する
- `<main>` 内のスペーシング値は DESIGN.md §5 スペーシングスケール（`2, 3, 4, 5, 5.6, 6, 6.4, 7, 8, 11, 12, 14, 16, 24, 32` px）の値のみを使用する（出典: DESIGN.md §5 line 184 13 値 + line 185 fractional 追加 5.6px/6.4px。48/64/80/120 は §5 の列挙スケールには含まれず、使用禁止）
- スケール外のスペーシングハードコード値を含まない

---

### REQ-012: グローバルレイアウトフレーム — 空フィードスケルトン

**EARS**: WHEN `AppShellState === 'Configured'` AND the feed has zero notes THEN the system SHALL render an empty feed skeleton placeholder using:
- スケルトンのアニメーション背景: Warm White (`#f6f5f4`) から White (`#ffffff`) へのパルス
- ボーダー: Whisper Border
- カード形状: Standard card radius 12px

**Acceptance Criteria**:
- 空フィード時にスケルトンプレースホルダーが表示される
- スケルトンの背景色は `#f6f5f4` / `#ffffff` を使用する
- スケルトンカードの `border-radius` は 12px
- スケルトンは `aria-hidden="true"` でスクリーンリーダーに隠蔽される

---

### REQ-013: グローバルレイアウトフレーム — カードシャドウ (FIND-010 解消)

**EARS**: WHEN any card surface is rendered THEN the system SHALL apply the DESIGN.md Card Shadow (Soft Card Level 2) using the exact 4-layer stack defined in `DESIGN.md §2 (Shadows & Depth)`.

**Card Shadow 定義** (`DESIGN.md §2 Shadows & Depth`):
```
rgba(0,0,0,0.04) 0px 4px 18px,
rgba(0,0,0,0.027) 0px 2.025px 7.84688px,
rgba(0,0,0,0.02) 0px 0.8px 2.925px,
rgba(0,0,0,0.01) 0px 0.175px 1.04062px
```

**Acceptance Criteria**:
- カード要素の `box-shadow` が上記 4 層スタックと一致する
- 個別レイヤーの opacity が 0.04 を超えない

---

### REQ-014: 破損ファイルバナー — スタイル規約

**EARS**: WHEN the corrupted files banner is rendered THEN the system SHALL style it using the warn color token (`#dd5b00` Orange from `DESIGN.md §2 Semantic Accent Colors`) with:
- バナー形状: Standard card radius 8px
- テキスト: Body サイズ 16px weight 500 (Body Medium, `DESIGN.md §3`)
- ボーダー: Whisper Border

**Acceptance Criteria**:
- バナー背景色または左アクセントに `#dd5b00` が使用される
- バナーのテキストは 16px weight 500
- バナーのボーダーは `1px solid rgba(0,0,0,0.1)`

---

### REQ-015: タイポグラフィ規約 — 4 ウェイトシステム

**EARS**: WHEN any text element is rendered THEN the system SHALL use only the 4-weight typography system defined in `DESIGN.md §3`: 400 (body/reading), 500 (UI/interactive), 600 (emphasis/navigation), 700 (headings/display). No other font-weight values SHALL be used.

**Acceptance Criteria**:
- 全コンポーネントにおいて `font-weight` の値が `400 | 500 | 600 | 700` のみ使用される
- `font-size` と `font-weight` の組み合わせが DESIGN.md タイポグラフィ階層に従う

---

### REQ-016: モーダル — アクセシビリティ（フォーカストラップ・Esc 無効化）(FIND-006 解消)

**EARS**: WHILE `VaultSetupModal` is open THE SYSTEM SHALL trap keyboard focus within the modal AND disable Esc key dismissal AND disable overlay-click dismissal.

> **注意**: REQ-016 の EARS は `AppShellState !== 'Configured'` を条件としない。
> モーダルは `Unconfigured` / `StartupError` 状態のみ表示されるため（REQ-003 AC1 参照）、
> このガードは冗長であり削除した。

**エッジケース**:
- Tab キー: モーダル内の最後の focusable 要素から最初の focusable 要素へループする
- Shift+Tab: 逆方向ループ
- モーダルが閉じた後: フォーカスをトリガー要素（または `<body>`）に戻す

**Acceptance Criteria**:
- モーダルが開いている間、Tab キーがモーダル外の要素にフォーカスを移動しない
- Esc キーがモーダルを閉じない
- overlay クリックがモーダルを閉じない
- モーダルに `role="dialog"` および `aria-modal="true"` が設定される
- フォーカストラップは `FocusTrap` ユーティリティまたは同等の実装で管理される

---

### REQ-017: モーダル — Deep Shadow 適用

**EARS**: WHEN `VaultSetupModal` is rendered THEN the system SHALL apply the DESIGN.md Deep Shadow (Deep Card Level 3) using the exact 5-layer stack.

**Deep Shadow 定義** (`DESIGN.md §2 Shadows & Depth`):
```
rgba(0,0,0,0.01) 0px 1px 3px,
rgba(0,0,0,0.02) 0px 3px 7px,
rgba(0,0,0,0.02) 0px 7px 15px,
rgba(0,0,0,0.04) 0px 14px 28px,
rgba(0,0,0,0.05) 0px 23px 52px
```

**Acceptance Criteria**:
- モーダルコンテナの `box-shadow` が上記 5 層スタックと一致する
- モーダルの `border-radius` は 16px（Large, `DESIGN.md §5 Border Radius Scale`）

---

### REQ-018: 非機能要件 — モーダル表示遅延

**EARS**: WHEN the application determines `AppShellState` requires the vault setup modal (`'Unconfigured'` or `'StartupError'`) THEN the system SHALL render the modal within 100ms of that determination.

**Acceptance Criteria**:
- モーダル表示のタイミングは AppStartup pipeline result 到達から 100ms 以内
- 中間の空白フラッシュ（白い画面のみが表示される状態）が 100ms を超えない

> **検証方式**: PROP-009 (Tier 1 統合テスト: `performance.now()` 差分 + jsdom 合成タイマー) による。
> wall-clock ベースではなく jsdom の `vi.useFakeTimers()` でタイマーを制御し、100ms 以内の Svelte リアクティビティ応答を確認する。

---

### REQ-019: 非機能要件 — カラートークン規約 (FIND-012 解消)

**EARS**: WHEN any Svelte component is written THEN the system SHALL use only color values defined in `DESIGN.md §10 Token Reference`. No hex literal SHALL appear in component source files unless it is the exact value defined in that section.

**許可カラーリスト** (DESIGN.md §10 Token Reference — 規範的源泉):

Hex 許可リスト:
```
#ffffff, #000000f2, #0075de, #213183, #005bab, #f6f5f4, #31302e,
#615d59, #a39e98, #2a9d99, #1aae39, #dd5b00, #ff64c8, #391c57,
#523410, #097fe8, #62aef0, #f2f9ff, #dddddd
```

rgba 許可リスト (DESIGN.md §10 に列挙した全値):
```
rgba(0,0,0,0.95)   — Near-black text
rgba(0,0,0,0.9)    — Input text
rgba(0,0,0,0.1)    — Whisper Border
rgba(0,0,0,0.05)   — Secondary button bg
rgba(0,0,0,0.5)    — Modal overlay scrim
rgba(0,0,0,0.04)   — Card Shadow layer 1
rgba(0,0,0,0.027)  — Card Shadow layer 2
rgba(0,0,0,0.02)   — Card Shadow layer 3 / Deep Shadow layer 2&3
rgba(0,0,0,0.01)   — Card Shadow layer 4 / Deep Shadow layer 1
```

**Acceptance Criteria**:
- コンポーネントファイル内の全 hex カラーリテラルが上記 Hex 許可リストの値のいずれかと一致する
- `rgba(0,0,0,X)` の X 値が上記 rgba 許可リストの値に限定される
- 許可リスト外の値が含まれる場合、CI lint で FAIL する（PROP-006 参照）

---

### REQ-020: Loading 状態の定義と描画 (FIND-014 対応 — 新規追加)

**EARS**: WHILE `AppShellState === 'Loading'` THE SYSTEM SHALL render only the global header shell (without full nav content) and a centered loading affordance. The vault setup modal SHALL NOT be rendered. The main feed area SHALL be empty.

**初期値**: `appShellStore` の初期値は `'Loading'` とする。アプリケーションモジュールがインポートされた時点で `'Loading'` が設定され、`invoke_app_startup` の結果到達まで維持される。

**`Loading` からの遷移**:
- 唯一の合法的遷移先: `routeStartupResult` の 4 出力（`'Configured'`, `'Unconfigured'`, `'StartupError'`, `'UnexpectedError'`）
- `configure-vault` 成功後の AppStartup 再実行時も `'Loading'` に再遷移する（REQ-006 参照）
- `'Loading'` から `'Loading'` への遷移は無効（`bootAttempted` フラグにより抑制）

**描画仕様**:
- ローディングアフォーダンス: `role="status"`, `aria-busy="true"`, `aria-label="読み込み中"` を持つ要素
- 色: Pure White (`#ffffff`) 背景
- スピナーまたはスケルトン: `aria-hidden="true"` のアニメーション要素
- モーダルはレンダリングしない

**Acceptance Criteria**:
- `AppShellState === 'Loading'` のとき `VaultSetupModal` が DOM に存在しない
- `AppShellState === 'Loading'` のとき `role="status"` かつ `aria-busy="true"` の要素が表示される
- `appShellStore` の初期値が `'Loading'` である
- `'Loading'` から遷移できる状態は `'Configured'`, `'Unconfigured'`, `'StartupError'`, `'UnexpectedError'` の 4 つのみ

---

### REQ-021: EFFECTFUL シングルトンの書き込み権限とHMRリセット (FIND-017 対応 — 新規追加)

**EARS**: WHEN `appShellStore` is written THEN the write SHALL originate exclusively from: (a) `AppShell.svelte` の `routeStartupResult` 呼び出し後のディスパッチ、または (b) `VaultSetupModal.svelte` の configure-vault 成功ハンドラ。No other module SHALL call `appShellStore.set(...)` or `appShellStore.update(...)`.

**`bootFlag` セマンティクス**:
- `bootFlag` はモジュールスコープの変数として宣言される（`export` しない）
- Vite HMR がモジュールを再インポートした場合、`bootFlag` はリセットされる（新しいモジュールインスタンス = 新しい `bootFlag`）
- HMR リセット後の最初のマウントは "fresh boot" として扱われ、`invoke_app_startup` を再実行する
- HMR リセット前に `invoke_app_startup` が in-flight だった場合: Promise の resolve は HMR 後のコンポーネントインスタンスに届かないため無視される

**Acceptance Criteria**:
- `appShellStore.set(...)` の呼び出しが `AppShell.svelte` と `VaultSetupModal.svelte` 以外のファイルに存在しない（PROP-011 ESLint ルール参照）
- `bootFlag` が `export` されていない（外部モジュールから参照不能）
- HMR 後の再マウント時に `bootFlag` が `false` に戻り、`invoke_app_startup` が再実行される（PROP-010 参照）

---

### REQ-022: IPC タイムアウトポリシー — クライアントサイドパイプラインタイムアウト (FIND-019 解消 — 新規追加)

**EARS**: WHEN any pipeline IPC (`invoke_app_startup`, `try_vault_path`, or `invoke_configure_vault`) has been pending for longer than `PIPELINE_IPC_TIMEOUT_MS` (= 30000ms, a named constant defined in `tauriAdapter.ts`) THEN the system SHALL transition `AppShellState` to `'UnexpectedError'` and SHALL render the inline error banner per REQ-008. Late-arriving resolutions (success or error arriving after the timeout) SHALL be discarded; the `'UnexpectedError'` state SHALL persist until the user takes a recovery action (e.g., page reload).

> **タイムアウト実装方式**: タイムアウトは **クライアントサイド**（`tauriAdapter` 内）に実装する。`Promise.race([ipcPromise, timeoutSentinel])` パターンを使い、`setTimeout` で `PIPELINE_IPC_TIMEOUT_MS` 後に reject する sentinel Promise と race させる。Rust 側の IPC 自体はキャンセルされないが、TypeScript 層はタイムアウト経過後の resolve/reject を無視する（late-arrival 廃棄）。

**`PIPELINE_IPC_TIMEOUT_MS`定数**:
- 値: `30000`（ミリ秒）
- 定義場所: `promptnotes/src/lib/ui/app-shell/tauriAdapter.ts`（エクスポートする定数 — テストで `vi.useFakeTimers()` により制御可能）
- 全 3 パイプライン IPC に同一タイムアウト値を適用する

**タイムアウト中の UI 挙動**:
- `0ms` ～ `PIPELINE_IPC_TIMEOUT_MS` の間: `AppShellState === 'Loading'`（REQ-020 の Loading 描画を継続）
- `PIPELINE_IPC_TIMEOUT_MS` 経過後: `AppShellState → 'UnexpectedError'`、インラインバナー表示（REQ-008）
- Late-arrival: タイムアウト後に IPC が resolve/reject しても `AppShellState` を上書きしない

**Acceptance Criteria**:
- `PIPELINE_IPC_TIMEOUT_MS === 30000` が `tauriAdapter.ts` に export される定数として定義される
- `invoke_app_startup` が 30000ms 以内に resolve しない場合、`AppShellState` が `'UnexpectedError'` に遷移する
- タイムアウトは `tauriAdapter` 内の `Promise.race` として実装される（Rust 側の変更不要）
- タイムアウト後に遅延 resolve が来ても `AppShellState` は `'UnexpectedError'` のまま維持される
- `vi.useFakeTimers()` を使い `T = 30000ms` を人工的に経過させることでタイムアウト挙動が検証可能（PROP-014 参照）

---

## NEG-REQ: 対象外の明示的排除

### NEG-REQ-001: エディタ UI の排除

**EARS**: WHILE `ui-app-shell` feature is being implemented, THE SYSTEM SHALL NOT implement the note editor textarea, inline YAML frontmatter editor, copy button (`CopyNoteBody`), or new note button (`RequestNewNote`).

**Acceptance Criteria**:
- エディタ textarea を含む Svelte コンポーネントが本 feature のファイルに存在しない
- `EditNoteBody` / `CopyNoteBody` / `RequestNewNote` コマンドを dispatch するコードが存在しない

---

### NEG-REQ-002: フィード行 UI の排除

**EARS**: WHILE `ui-app-shell` feature is being implemented, THE SYSTEM SHALL NOT implement feed note rows, note body preview, per-row action buttons (delete, tag chip add/remove).

**Acceptance Criteria**:
- `Feed.computeVisible()` の結果を反復してノート行を描画するコードが存在しない
- `RequestNoteDeletion` / `AddTagViaChip` / `RemoveTagViaChip` を dispatch するコードが存在しない

---

### NEG-REQ-003: 検索ボックスの排除

**EARS**: WHILE `ui-app-shell` feature is being implemented, THE SYSTEM SHALL NOT implement the search input box or `ApplySearch` command dispatch.

**Acceptance Criteria**:
- `UnvalidatedFilterInput.searchTextRaw` を構築して検索するコードが存在しない

---

### NEG-REQ-004: タグチップフィルタ UI の排除

**EARS**: WHILE `ui-app-shell` feature is being implemented, THE SYSTEM SHALL NOT implement the left sidebar tag filter chips or `ApplyTagFilter` command dispatch.

---

### NEG-REQ-005: TypeScript 側 Value Object 構築の排除 (FIND-011 解消)

**EARS**: WHILE `ui-app-shell` feature is being implemented, THE SYSTEM SHALL NOT construct any branded value object (`VaultPath`, `Body`, `Tag`, `Frontmatter`, `NoteId`, `VaultId`, `Timestamp`) in TypeScript source files.

**禁止ブランド型の完全リスト** (`docs/domain/code/ts/src/shared/value-objects.ts` より):
- `VaultPath` — Tauri `try_vault_path` 経由でのみ取得可能
- `Body`, `Tag`, `Frontmatter`, `NoteId` — Rust パイプライン経由でのみ取得可能
- `VaultId` — `VaultId.singleton()` の TypeScript 再実装は禁止
- `Timestamp` — `{ epochMillis: Date.now() } as Timestamp` 等の手書き構築は禁止

**Acceptance Criteria**:
- TypeScript ソースに `as VaultPath`, `as Body`, `as Tag`, `as Frontmatter`, `as NoteId`, `as VaultId`, `as Timestamp` のキャストが存在しない
- `as unknown as <BrandType>`, `<BrandType>someValue` (angle-bracket), ヘルパー経由のキャスト (`function castTo...`) も禁止
- Brand 型の手書き構築がいかなる形でも存在しない（PROP-002 参照）
- テスト用フィクスチャでの例外: `__tests__/` ディレクトリ内の専用ヘルパーファイル 1 件のみを許可リストに追加可能（当該ファイルは `// @vcsdd-allow-brand-construction` コメントを持つ）

---

## エッジケースカタログ (FIND-013 解消)

| # | エッジケース | 期待挙動 |
|---|------------|---------|
| EC-01 | Settings ファイルが破損 JSON | `AppStartupError { kind:'config', reason:{ kind:'unconfigured' } }` — JSON parse 失敗は Tauri 側で `null` 扱い → `Settings.load()` が `null` を返す → `unconfigured` (FIND-004 解消: `path-not-found` ではない) |
| EC-02 | Settings が存在しないパスを指す (PathNotFound) | `AppShellState → StartupError`, モーダルに path-not-found メッセージ |
| EC-03 | Settings が読み取り権限なしパスを指す (PermissionDenied) | `AppShellState → StartupError`, モーダルに permission-denied メッセージ |
| EC-04 | ユーザーが空文字を送信 | `VaultPathError.Empty` → 「フォルダを選択してください」インライン表示 |
| EC-05 | ユーザーがホワイトスペースのみを入力 | trim 後空として `VaultPathError.Empty` |
| EC-06 | ユーザーが NUL バイトを含むパスを入力 | Rust 側で OS stat エラー → `VaultConfigError.path-not-found` として処理。UI はエラー表示 |
| EC-07 | OS フォルダピッカーをキャンセル | invoke を呼ばず、モーダルを現状維持 |
| EC-08 | Save ボタンのダブルクリック | `isSaving` フラグで 2 回目以降の invoke を抑制 |
| EC-09 | `corruptedFiles.length === 0` | バナーを表示しない |
| EC-10 | `corruptedFiles.length === 1` | バナーを表示（「1 件の破損ファイルがあります」） |
| EC-11 | `corruptedFiles.length >> 1` | バナーを表示（件数を表示） |
| EC-12 | ~~アプリ再ロード中にモーダルが開いている~~ | (削除 — FIND-020 解消: REQ-020 はモジュールインポート時点で `appShellStore` を `'Loading'` に再初期化すると規定。REQ-021 は HMR がモジュール再インポート時に `bootFlag` をリセットすると規定。アプリ再ロード後は `'Loading'` に戻り `invoke_app_startup` が再実行される。再実行結果が同じ `unconfigured`/`path-not-found` を返せばモーダルが再描画されるが、それは「状態維持」ではなく「同じ入力からの再導出」である。EC-20 が HMR mid-flight を網羅している。) |
| EC-13 | `invoke_app_startup` IPC 自体がクラッシュ | `AppShellState → UnexpectedError`, インラインバナー表示 |
| EC-14 | Vault パスがシンボリックリンクを指す | Tauri `statDir` はシンボリックリンクを追跡する。最終ターゲットが有効なディレクトリであれば `Ok(true)`。循環シンボリックリンクは OS stat エラー → `path-not-found` 相当 |
| EC-15 | パス文字列が OS_PATH_MAX を超える | Rust `VaultPath::try_new` は形式チェックのみ（empty / not-absolute）。OS_PATH_MAX 超過は `statDir` で OS エラー → `path-not-found` に折り畳まれる |
| EC-16 | パス文字列に mid-string NUL バイトを含む (例: `/foo\0bar`) | Rust 側の FFI で NUL はパス終端として扱われ、実際は `/foo` として stat される。UI は `path-not-found` または `permission-denied` エラーを表示する。挙動は OS 依存だが UI の処理は同一 |
| EC-17 | OS フォルダピッカー後にユーザーがアクセス権限を取り消す（picker-then-revoke） | picker が返したパスへの `try_vault_path` 呼び出しが `permission-denied` を返す → REQ-007 と同様のモーダルエラー表示 |
| EC-18 | ネットワーク FS が応答なし / IPC タイムアウト | `invoke_app_startup` の Promise が `PIPELINE_IPC_TIMEOUT_MS`（= 30000ms）を超えて pending になる。`tauriAdapter` が `Promise.race` で sentinel rejection を投じ、`AppShellState` を `'UnexpectedError'` に遷移してインラインバナーを表示する（REQ-022 参照）。タイムアウト後に IPC が late resolve しても `'UnexpectedError'` 状態を上書きしない |
| EC-19 | Settings.save が `disk-full`/`lock`/`unknown` で失敗する (`invoke_configure_vault` 内部) | configure-vault の REQ-007 がそれらの `FsError` を `path-not-found` に折り畳んで `VaultConfigError` として返す。`invoke_configure_vault` が `Err({kind:'path-not-found'})` を返すため、REQ-006 → REQ-007 ルートでモーダル内エラー表示となる。`UnexpectedError` には遷移しない。出典: `.vcsdd/features/configure-vault/specs/behavioral-spec.md` REQ-007 (lines 133-144) および Error Catalog (lines 310-315)。 |
| EC-20 | HMR 中に `try_vault_path` IPC が in-flight | HMR により `bootFlag` がリセットされる。in-flight の Promise resolve はマウント後のインスタンスに届かないため無視する。次回マウント時に `invoke_app_startup` が再実行される（REQ-021 参照） |

---

## 非機能要件まとめ

| # | 要件 | 規約値 |
|---|------|-------|
| NFR-01 | モーダル表示遅延 | Unconfigured / StartupError 判定から ≤ 100ms |
| NFR-02 | バナーのフォーカス非奪取 | `autofocus` 属性なし |
| NFR-03 | キーボードアクセシビリティ | モーダルはフォーカストラップ + Esc 無効 |
| NFR-04 | テーマ | DESIGN.md ライトテーマのみ（ダーク対応は後続フィーチャー） |
| NFR-05 | カラートークン | DESIGN.md §10 Token Reference 定義値のみ（REQ-019） |
| NFR-06 | タイポグラフィ | 4 ウェイトシステムのみ（REQ-015） |
| NFR-07 | スペーシング | DESIGN.md §5 スペーシングスケール `[2, 3, 4, 5, 5.6, 6, 6.4, 7, 8, 11, 12, 14, 16, 24, 32]` px のみ（REQ-011） |
| NFR-08 | Loading 状態の初期値 | モジュールインポート時点で `'Loading'` |
| NFR-09 | EFFECTFUL 書き込み制限 | `appShellStore` の書き込みは 2 ファイルのみに限定（REQ-021） |
| NFR-10 | IPC タイムアウト | `PIPELINE_IPC_TIMEOUT_MS = 30000`ms、クライアントサイド `Promise.race`（REQ-022） |
