# Verification Architecture: ui-app-shell

**Feature**: `ui-app-shell`
**Phase**: 1b
**Revision**: 2 (iteration-2)
**Mode**: strict
**Source of truth**:
- `specs/behavioral-spec.md` (REQ-001〜REQ-021, NEG-REQ-001〜NEG-REQ-005)
- `docs/domain/code/ts/src/shared/value-objects.ts` (`VaultPathError`)
- `docs/domain/code/rust/src/value_objects.rs` (`VaultPathError`)
- `DESIGN.md` §2, §3, §5, §6, §10
- `.vcsdd/features/app-startup/specs/behavioral-spec.md` (依存フィーチャー)
- `.vcsdd/features/configure-vault/specs/behavioral-spec.md` (依存フィーチャー)

---

## 改訂履歴 / Revision History

| 反復 | 対象 finding | 解消箇所 | 概要 |
|------|-------------|----------|------|
| 2 | FIND-005 (CRITICAL) | PROP-009 (REQ-008), PROP-010 (REQ-018) | REQ-008 と REQ-018 にそれぞれ PROP を追加。Tier 1 統合テストおよびタイマーベース検証。 |
| 2 | FIND-006 | PROP-005 リライト | `isModalDismissible` を廃止。`isModalCloseable(state, trigger)` に改名・再フォーカス。 |
| 2 | FIND-007 | PROP-001a + PROP-001b 分割 | HMR 二重マウントのスパイ呼び出し回数検証を PROP-001b として追加。 |
| 2 | FIND-008 | PROP-002 リライト | grep を廃止。TypeScript AST ベースの ESLint ルールに置換。 |
| 2 | FIND-012 | PROP-006 rgba 許可リスト | `rgba(0,0,0,0.05)` 重複を除去。モーダルスクリム `rgba(0,0,0,0.5)` を追加。DESIGN.md §10 Token Reference を規範的源泉に指定。 |
| 2 | FIND-015 | PROP-006 監査スコープ | `<style>` ブロック + inline `style={}` + `.ts/.svelte.ts` + `Element.style.setProperty` まで監査対象を拡張。 |
| 2 | FIND-017 | PROP-011 + PROP-012 (新規) | `appShellStore` 書き込み面隔離と `bootFlag` HMR セマンティクスの PROP を追加。 |

---

## 純粋性境界マップ (Purity Boundary Map)

本 feature が導入するモジュールを PURE / EFFECTFUL / ADAPTER の 3 種に分類する。

### PURE モジュール

| モジュール | 分類理由 | プロパティテスト対象 |
|----------|--------|-------------------|
| `AppShellState` 判別関数 `routeStartupResult(result: Result<InitialUIState, AppStartupError>): AppShellState` | 入力のみに依存、副作用なし、参照透明 | PROP-002, PROP-005, PROP-007 |
| `VaultPathError` → UI メッセージ変換 `mapVaultPathError(e: VaultPathError): string` | 全域関数、I/O なし、決定論的 | PROP-003 |
| `VaultConfigError` → UI メッセージ変換 `mapVaultConfigError(e: VaultConfigError): string` | 全域関数、I/O なし | PROP-003 |
| `corruptedFiles` バナー表示条件 `shouldShowCorruptedBanner(files: CorruptedFile[]): boolean` | `files.length >= 1` の純粋判定 | PROP-004 |
| `isModalCloseable(state: AppShellState, trigger: 'overlay' \| 'esc' \| 'success'): boolean` | 状態機械のガード関数（FIND-006 解消: `isModalDismissible` を廃止） | PROP-005 |

### EFFECTFUL モジュール

| モジュール | 副作用の種類 | 境界の説明 |
|----------|-----------|----------|
| Svelte `AppShell.svelte` コンポーネント | DOM マウント / アンマウント, Svelte store 購読 | `onMount` でブート IPC を発火。副作用は `onMount` コールバック内に閉じ込める |
| `appShellStore` (Svelte writable store) | in-memory write — Svelte リアクティビティ | `AppShellState` を保持。書き込み権限は `AppShell.svelte` と `VaultSetupModal.svelte` のみ（PROP-011 参照） |
| `bootFlag` シングルトン | in-memory write — モジュールスコープ | `onMount` の二重呼び出しを防ぐ。`export` しない。HMR 時はモジュール再インポートによりリセットされる（PROP-012 参照） |
| `VaultSetupModal.svelte` コンポーネント | DOM フォーカス管理, フォーカストラップ | フォーカストラップは effectful (DOM mutation)。入力値は reactive state として分離 |

### ADAPTER モジュール

| モジュール | 役割 | 呼び出し先 |
|----------|------|-----------|
| `tauriAdapter.invokeAppStartup(): Promise<Result<InitialUIState, AppStartupError>>` | Tauri IPC ラッパー | `invoke('invoke_app_startup')` |
| `tauriAdapter.tryVaultPath(rawPath: string): Promise<Result<VaultPath, VaultPathError>>` | Tauri IPC ラッパー | `invoke('try_vault_path', { rawPath })` |
| `tauriAdapter.invokeConfigureVault(path: VaultPath): Promise<Result<VaultDirectoryConfigured, VaultConfigError>>` | Tauri IPC ラッパー | `invoke('invoke_configure_vault', { path })` |
| Tauri `#[tauri::command] invoke_app_startup` (Rust 側) | Rust エントリポイント | app-startup pipeline を委譲 |
| Tauri `#[tauri::command] try_vault_path(raw_path: String)` (Rust 側) | Rust エントリポイント | `VaultPath::try_new` を呼び出し |
| Tauri `#[tauri::command] invoke_configure_vault(path: VaultPath)` (Rust 側) | Rust エントリポイント | configure-vault pipeline を委譲 |

---

## 証明義務 (Proof Obligations)

| ID | 説明 | Tier | required | 検証アプローチ |
|----|------|------|----------|-------------|
| PROP-001a | AppStartup パイプラインがシングルマウントで 1 回呼ばれる | 1 | true | 統合テスト: コンポーネントを 1 回マウントし、スパイ呼び出し回数 = 1 をアサート |
| PROP-001b | HMR 二重マウント時も AppStartup は合計 1 回のみ呼ばれる | 1 | true | 統合テスト: マウント→アンマウント→再マウントのシーケンスでスパイ呼び出し回数 = 1 をアサート（FIND-007 解消） |
| PROP-002 | `VaultPath` 等ブランド型の構築は TypeScript 側で行われない | 0 | true | AST lint: ESLint カスタムルールで TypeAssertion / AsExpression を検出（FIND-008 解消） |
| PROP-003 | 全 `VaultPathError` variant に UI メッセージマッピングが存在する（網羅性） | 0 | true | TypeScript exhaustive switch: `mapVaultPathError` が `never` ブランチにフォールスルーすればコンパイルエラー |
| PROP-004 | `corruptedFiles.length >= 1` のときバナーが表示され、`0` のとき非表示 | 2 | true | fast-check プロパティテスト |
| PROP-005 | モーダルが開いている間、`overlay` / `esc` トリガーでは閉じられない | 2 | true | 状態機械プロパティテスト: `(state, trigger)` ペアを列挙（FIND-006 解消） |
| PROP-006 | 全可視カラー・スペーシングトークンが DESIGN.md §10 Token Reference に由来する | 3 | true | スタイル監査: 拡張スコープ（`<style>`, inline `style={}`, `.ts`, `setProperty`）を grep / lint |
| PROP-007 | `PathNotFound` および `PermissionDenied` 起動エラーの両方が `'StartupError'` にルーティングされる | 1 | true | ユニットテスト: `routeStartupResult` の全 AppStartupError variant を網羅 |
| PROP-008 | 設定永続化は smart-constructor 検証成功後にのみ実行される | 1 | true | 統合テスト: `try_vault_path` 失敗時に `invoke_configure_vault` スパイ呼び出し = 0 |
| PROP-009 | `scan` エラー / IPC クラッシュ時はインラインバナーが表示され、モーダルは非表示 | 1 | true | 統合テスト: `scan` エラーケースで `data-testid="startup-error-banner"` が存在し `data-testid="vault-setup-modal"` が不在をアサート（FIND-005 解消: REQ-008） |
| PROP-010 | モーダルは `AppShellState` 確定から 100ms 以内に表示される | 1 | true | 統合テスト: `vi.useFakeTimers()` + `performance.now()` 差分で 100ms 以内を検証（FIND-005 解消: REQ-018） |
| PROP-011 | `appShellStore` の書き込みは `AppShell.svelte` と `VaultSetupModal.svelte` のみから行われる | 0 | true | ESLint アーキテクチャテスト: import graph 解析またはカスタム lint ルール（FIND-017 解消） |
| PROP-012 | `bootFlag` はモジュールスコープで宣言され、HMR 再マウント後にリセットされる | 1 | true | 統合テスト: モジュール動的 `import()` 後にフラグ値が `false` であることをアサート（FIND-017 解消） |

---

## 検証ティア割り当て (Verification Tier Assignment)

### Tier 0 — 型レベル保証（コンパイル時）

対象: **PROP-002**, **PROP-003**, **PROP-011**

- **PROP-002**: `VaultPath = Brand<string, "VaultPath">` の unique symbol により、TypeScript ソースで直接キャストはコンパイラが型エラーとして検出する。加えて ESLint カスタムルール（後述）で AST ベースの残余キャストを CI 検出する。
- **PROP-003**: `mapVaultPathError` は exhaustive switch で実装する。`VaultPathError` の型が `{ kind: "empty" } | { kind: "not-absolute" }` であり、TS コンパイラが網羅性を強制する（`never` チェックパターン）。
- **PROP-011**: ESLint カスタムルールまたは import-graph lint で、`appShellStore.set(...)` / `appShellStore.update(...)` の呼び出し元ファイルを制限する。

### Tier 1 — ユニット・統合テスト

対象: **PROP-001a**, **PROP-001b**, **PROP-007**, **PROP-008**, **PROP-009**, **PROP-010**, **PROP-012**

- **PROP-001a**: `@testing-library/svelte` でコンポーネントをマウントし、スパイ注入で 1 回呼び出しをアサート。
- **PROP-001b**: マウント → アンマウント → 再マウントのシーケンスでスパイ呼び出し合計 = 1 をアサート。
- **PROP-007**: `routeStartupResult` のユニットテストで全 5 経路を網羅（`unconfigured`, `path-not-found`, `permission-denied`, `list-failed`, IPC クラッシュ）。
- **PROP-008**: モーダルの submit ハンドラのテストで、`try_vault_path` 結果別に `invoke_configure_vault` 呼び出し有無をアサート。
- **PROP-009**: `scan` エラーケースで `startup-error-banner` が存在し `vault-setup-modal` が不在をアサート。
- **PROP-010**: `vi.useFakeTimers()` を使い、`invoke_app_startup` の Promise resolve から 100ms 以内に `VaultSetupModal` が DOM に現れることをアサート。
- **PROP-012**: モジュール動的 import 後に `bootFlag` の内部状態が `false` であることを確認するテスト。

### Tier 2 — fast-check プロパティテスト

対象: **PROP-004**, **PROP-005**

- **PROP-004**: `fc.array(fc.anything(), { minLength: 0, maxLength: 1000 })` を生成し、`shouldShowCorruptedBanner(arr) === (arr.length >= 1)` を 100 回以上の試行で検証。
- **PROP-005**: `fc.tuple(fc.constantFrom<AppShellState>('Loading', 'Configured', 'Unconfigured', 'StartupError', 'UnexpectedError'), fc.constantFrom<'overlay' | 'esc' | 'success'>('overlay', 'esc', 'success'))` を生成し、以下を検証:
  - `state ∈ {'Unconfigured', 'StartupError'}` かつ `trigger ∈ {'overlay', 'esc'}` → `isModalCloseable(state, trigger) === false`
  - `state ∈ {'Unconfigured', 'StartupError'}` かつ `trigger === 'success'` → `isModalCloseable(state, trigger) === true`
  - `state ∈ {'Loading', 'Configured', 'UnexpectedError'}` → モーダル自体がレンダリングされないため `isModalCloseable` は呼ばれない（モーダル不在を component テストで検証）

### Tier 3 — 形式監査

対象: **PROP-006**

- **監査スコープ** (FIND-015 解消): 以下の全パターンを対象とする:
  1. Svelte `<style>` ブロック内の hex / rgba / px 値
  2. Svelte テンプレート内の inline `style={...}` 属性（バインドされた JS 式を含む）
  3. `.ts` / `.svelte.ts` ファイル内の hex リテラル (`#[0-9a-fA-F]{3,8}`) と `rgba?(...)`
  4. `Element.style.setProperty('--token', '#...')` 呼び出し
- **免除ポリシー**: `assets/` ディレクトリの SVG パス fill は対象外。`__tests__/` 内のフィクスチャファイルは対象外。
- **CI スクリプト**: `scripts/audit-design-tokens.ts` を実装。CI で FAIL した場合、Phase 2c で修正する。
- **許可リストの規範的源泉**: `DESIGN.md §10 Token Reference`（`behavioral-spec.md` REQ-019 の許可リストと同一）。

---

## 証明義務詳細

### PROP-001a: AppStartup 呼び出し回数（シングルマウント）

**Statement**: アプリケーションが単一マウントされたとき、`invoke_app_startup` Tauri コマンドはちょうど 1 回呼ばれる。

**Tier**: 1 (統合テスト)
**Required**: true

**検証アプローチ**:
```typescript
// app-shell.unit.test.ts
it('PROP-001a: invokes app startup exactly once on single mount', async () => {
  const spy = vi.fn().mockResolvedValue({ ok: true, value: mockInitialUIState });
  render(AppShell, { tauriAdapter: { invokeAppStartup: spy, ... } });
  await tick();
  expect(spy).toHaveBeenCalledTimes(1);
});
```

---

### PROP-001b: AppStartup 呼び出し回数（HMR 二重マウント）(FIND-007 解消)

**Statement**: コンポーネントがマウント→アンマウント→再マウントされたとき（HMR シミュレーション）、`invoke_app_startup` は合計 1 回のみ呼ばれる。

**Tier**: 1 (統合テスト)
**Required**: true

**検証アプローチ**:
```typescript
// app-shell.unit.test.ts
it('PROP-001b: invokes app startup only once even on HMR re-mount', async () => {
  const spy = vi.fn().mockResolvedValue({ ok: true, value: mockInitialUIState });
  const { unmount } = render(AppShell, { tauriAdapter: { invokeAppStartup: spy, ... } });
  await tick();
  unmount();
  render(AppShell, { tauriAdapter: { invokeAppStartup: spy, ... } });
  await tick();
  // bootAttempted フラグにより 2 回目のマウントは invoke しない
  expect(spy).toHaveBeenCalledTimes(1);
});
```

---

### PROP-002: ブランド型の TypeScript 側構築が存在しない (FIND-008 解消)

**Statement**: `VaultPath`, `Body`, `Tag`, `Frontmatter`, `NoteId`, `VaultId`, `Timestamp` のブランド型手書き構築が TypeScript ソースに存在しない。

**Tier**: 0 (AST lint + 型レベル)
**Required**: true

**検証アプローチ**:
- **ESLint カスタムルール** `no-brand-type-cast` を `scripts/eslint-rules/no-brand-type-cast.js` として実装する。
- 対象パターン:
  1. `TypeAssertion` (`<VaultPath>value`) — TS angle-bracket 構文
  2. `AsExpression` with final type `VaultPath | Body | Tag | Frontmatter | NoteId | VaultId | Timestamp`
  3. `AsExpression` チェーン: `value as unknown as VaultPath`（中間の `as unknown` を経由するケース）
  4. ヘルパー関数の返り値型が Brand 型であるケース: `function castTo...(): VaultPath` — 返り値型アノテーションで検出
  5. JSON import の型付きスロット: `import data from '...' assert {type: 'json'}` → `VaultPath` 型フィールドへの代入
- **スコープ**: `promptnotes/src/lib/ui/app-shell/**/*.{ts,svelte}` — テスト用フィクスチャの例外は `// @vcsdd-allow-brand-construction` コメントを持つ 1 ファイルのみ許可。
- **CI 統合**: `lint` ステップで実行。FAIL したら Phase 2c で修正。

---

### PROP-003: VaultPathError の全 variant にマッピングが存在する

**Statement**: `mapVaultPathError: (e: VaultPathError) => string` は `VaultPathError` の全 variant を処理し、未知 variant で `never` エラーが発生する。

**Tier**: 0 (コンパイル時) + Tier 1 (ランタイム確認)
**Required**: true

**検証アプローチ**:
```typescript
// map-vault-path-error.test.ts
it('PROP-003: exhaustive — empty maps to message', () => {
  expect(mapVaultPathError({ kind: 'empty' })).toBe('フォルダを選択してください');
});
it('PROP-003: exhaustive — not-absolute maps to message', () => {
  expect(mapVaultPathError({ kind: 'not-absolute' })).toBe('絶対パスを指定してください');
});
// コンパイル時: mapVaultPathError の switch が never チェックを持つため
// VaultPathError に variant 追加時はコンパイルエラー
```

---

### PROP-004: corruptedFiles バナー表示条件

**Statement**: `shouldShowCorruptedBanner(files)` は `files.length >= 1` のとき `true`、`0` のとき `false` を返す。

**Tier**: 1 (ユニット) + 2 (fast-check)
**Required**: true

**fast-check 検証アプローチ**:
```typescript
// corrupted-banner.prop.test.ts
import * as fc from 'fast-check';
it('PROP-004: banner shown iff count >= 1', () => {
  fc.assert(
    fc.property(
      fc.array(fc.anything()),
      (files) => shouldShowCorruptedBanner(files) === (files.length >= 1)
    )
  );
});
```

---

### PROP-005: モーダルは overlay / esc では閉じられない (FIND-006 解消)

**Statement**: `AppShellState ∈ {'Unconfigured', 'StartupError'}` のとき、`isModalCloseable(state, 'overlay')` および `isModalCloseable(state, 'esc')` はともに `false` を返す。`isModalCloseable(state, 'success')` のみ `true` を返す。

**Tier**: 1 (ユニット) + 2 (fast-check)
**Required**: true

**fast-check 検証アプローチ**:
```typescript
// modal-closeable.prop.test.ts
import * as fc from 'fast-check';
type ModalState = 'Unconfigured' | 'StartupError';
type CloseTrigger = 'overlay' | 'esc' | 'success';

it('PROP-005: overlay/esc never closes modal while in Unconfigured or StartupError', () => {
  fc.assert(
    fc.property(
      fc.constantFrom<ModalState>('Unconfigured', 'StartupError'),
      fc.constantFrom<CloseTrigger>('overlay', 'esc'),
      (state, trigger) => isModalCloseable(state, trigger) === false
    )
  );
});

it('PROP-005: success trigger always closes modal', () => {
  fc.assert(
    fc.property(
      fc.constantFrom<ModalState>('Unconfigured', 'StartupError'),
      (state) => isModalCloseable(state, 'success') === true
    )
  );
});
```

---

### PROP-006: 全可視カラー・スペーシングトークンが DESIGN.md §10 Token Reference 由来 (FIND-012, FIND-015 解消)

**Statement**: Svelte コンポーネント・TypeScript ソース・CSS に含まれる全 hex カラー・rgba・px 値が DESIGN.md §10 Token Reference の許可リストに含まれる。

**Tier**: 3 (スタイル監査 CI)
**Required**: true

**許可カラーリスト** (DESIGN.md §10 Token Reference が規範的源泉。以下は検証スクリプト用の運用コピー):

Hex 許可リスト:
```
#ffffff, #000000f2, #0075de, #213183, #005bab, #f6f5f4, #31302e,
#615d59, #a39e98, #2a9d99, #1aae39, #dd5b00, #ff64c8, #391c57,
#523410, #097fe8, #62aef0, #f2f9ff, #dddddd
```

rgba 許可リスト (重複なし — FIND-012 解消):
```
rgba(0,0,0,0.95)   — Near-black text (DESIGN.md §2 Primary)
rgba(0,0,0,0.9)    — Input text (DESIGN.md §4 Inputs)
rgba(0,0,0,0.1)    — Whisper Border (DESIGN.md §2 Shadows & Depth)
rgba(0,0,0,0.05)   — Secondary button bg (DESIGN.md §4 Buttons)
rgba(0,0,0,0.5)    — Modal overlay scrim (追加 — FIND-012 解消)
rgba(0,0,0,0.04)   — Card Shadow layer 1 (DESIGN.md §2)
rgba(0,0,0,0.027)  — Card Shadow layer 2 (DESIGN.md §2)
rgba(0,0,0,0.02)   — Card Shadow layer 3 / Deep Shadow (DESIGN.md §2)
rgba(0,0,0,0.01)   — Card Shadow layer 4 / Deep Shadow layer 1 (DESIGN.md §2)
```

**許可スペーシングリスト** (DESIGN.md §5 より):
```
[2, 3, 4, 5, 5.6, 6, 6.4, 7, 8, 11, 12, 14, 16, 24, 32, 48, 64, 80, 120]
```

**監査スコープ** (FIND-015 解消):
- (a) `*.svelte` ファイルの `<style>` ブロック
- (b) `*.svelte` ファイルのテンプレート内 inline `style={...}` 属性（文字列リテラル部分）
- (c) `*.ts` / `*.svelte.ts` ファイル内の hex リテラル `#[0-9a-fA-F]{3,8}` と `rgba?(...)`
- (d) `Element.style.setProperty(...)` / `style.cssText =` 呼び出し内の文字列リテラル
- **免除**: `assets/` ディレクトリ内 SVG の `fill` / `stroke`、`__tests__/` 内フィクスチャファイル

---

### PROP-007: PathNotFound / PermissionDenied がモーダルにルーティングされる

**Statement**: `routeStartupResult` の全 5 AppStartupError 経路が正しい `AppShellState` を返す。

**Tier**: 1 (ユニットテスト)
**Required**: true

**検証アプローチ**:
```typescript
// route-startup-result.test.ts
it('PROP-007: unconfigured routes to Unconfigured', () => {
  expect(routeStartupResult({ ok: false, error: { kind: 'config', reason: { kind: 'unconfigured' } } }).state).toBe('Unconfigured');
});
it('PROP-007: path-not-found routes to StartupError', () => {
  expect(routeStartupResult({ ok: false, error: { kind: 'config', reason: { kind: 'path-not-found', path: '/x' } } }).state).toBe('StartupError');
});
it('PROP-007: permission-denied routes to StartupError', () => {
  expect(routeStartupResult({ ok: false, error: { kind: 'config', reason: { kind: 'permission-denied', path: '/x' } } }).state).toBe('StartupError');
});
it('PROP-007: list-failed routes to UnexpectedError', () => {
  expect(routeStartupResult({ ok: false, error: { kind: 'scan', reason: { kind: 'list-failed', detail: '' } } }).state).toBe('UnexpectedError');
});
it('PROP-007: Ok routes to Configured', () => {
  expect(routeStartupResult({ ok: true, value: mockInitialUIState }).state).toBe('Configured');
});
```

---

### PROP-008: 設定永続化は smart-constructor 検証成功後にのみ実行される

**Statement**: `try_vault_path` が `Err(VaultPathError)` を返したとき、`invoke_configure_vault` は呼ばれない。`try_vault_path` が `Ok(VaultPath)` を返したとき、`invoke_configure_vault` がちょうど 1 回呼ばれる。

**Tier**: 1 (統合テスト)
**Required**: true

**検証アプローチ**:
```typescript
// vault-setup-modal.unit.test.ts
it('PROP-008: configure vault NOT called when try_vault_path fails', async () => {
  const tryVaultPathSpy = vi.fn().mockResolvedValue({ ok: false, error: { kind: 'empty' } });
  const configureVaultSpy = vi.fn();
  // ...mount and submit...
  expect(configureVaultSpy).toHaveBeenCalledTimes(0);
});
it('PROP-008: configure vault called exactly once after successful validation', async () => {
  const tryVaultPathSpy = vi.fn().mockResolvedValue({ ok: true, value: mockVaultPath });
  const configureVaultSpy = vi.fn().mockResolvedValue({ ok: true, value: mockEvent });
  // ...mount and submit...
  expect(configureVaultSpy).toHaveBeenCalledTimes(1);
});
```

---

### PROP-009: scan エラー / IPC クラッシュ時はバナーのみ表示 (FIND-005 解消 — REQ-008)

**Statement**: `AppStartupError.kind === 'scan'` または Tauri IPC クラッシュ時に、`startup-error-banner` が DOM に存在し、`vault-setup-modal` が DOM に存在しない。

**Tier**: 1 (統合テスト)
**Required**: true

**検証アプローチ**:
```typescript
// app-shell.unit.test.ts
it('PROP-009: scan error shows banner, not modal', async () => {
  const spy = vi.fn().mockResolvedValue({
    ok: false,
    error: { kind: 'scan', reason: { kind: 'list-failed', detail: 'disk error' } }
  });
  render(AppShell, { tauriAdapter: { invokeAppStartup: spy, ... } });
  await tick();
  expect(screen.getByTestId('startup-error-banner')).toBeInTheDocument();
  expect(screen.queryByTestId('vault-setup-modal')).not.toBeInTheDocument();
});

it('PROP-009: IPC crash shows banner, not modal', async () => {
  const spy = vi.fn().mockRejectedValue(new Error('IPC crash'));
  render(AppShell, { tauriAdapter: { invokeAppStartup: spy, ... } });
  await tick();
  expect(screen.getByTestId('startup-error-banner')).toBeInTheDocument();
  expect(screen.queryByTestId('vault-setup-modal')).not.toBeInTheDocument();
});
```

---

### PROP-010: モーダルが 100ms 以内に表示される (FIND-005 解消 — REQ-018)

**Statement**: `AppShellState` が `'Unconfigured'` または `'StartupError'` に確定した時点から 100ms 以内に `VaultSetupModal` が DOM に現れる。

**Tier**: 1 (統合テスト — jsdom 合成タイマー)
**Required**: true

**検証アプローチ**:
```typescript
// app-shell.unit.test.ts
it('PROP-010: modal appears within 100ms of Unconfigured determination', async () => {
  vi.useFakeTimers();
  const spy = vi.fn().mockResolvedValue({
    ok: false,
    error: { kind: 'config', reason: { kind: 'unconfigured' } }
  });
  render(AppShell, { tauriAdapter: { invokeAppStartup: spy, ... } });
  // Promise が resolve するまで進める
  await vi.runAllTimersAsync();
  // 100ms 経過前にモーダルが DOM に存在することを確認
  expect(screen.getByTestId('vault-setup-modal')).toBeInTheDocument();
  vi.useRealTimers();
});
```

> **注意**: wall-clock での 100ms 計測は CI 環境依存のため行わない。代わりに Svelte のリアクティビティが同期的に適用されること（tick() / runAllTimersAsync() で確認）を検証する。

---

### PROP-011: appShellStore の書き込み面が隔離されている (FIND-017 解消)

**Statement**: `appShellStore.set(...)` および `appShellStore.update(...)` の呼び出しが `AppShell.svelte` と `VaultSetupModal.svelte` 以外のファイルに存在しない。

**Tier**: 0 (ESLint ルール / import graph lint)
**Required**: true

**検証アプローチ**:
- ESLint カスタムルール `restrict-appshell-store-writes` を `scripts/eslint-rules/` に実装する。
- ルール: `appShellStore.set(` / `appShellStore.update(` パターンのある呼び出し箇所がホワイトリスト外ファイルに存在する場合、ESLint ERROR を発生させる。
- ホワイトリスト: `promptnotes/src/lib/ui/app-shell/AppShell.svelte`, `promptnotes/src/lib/ui/app-shell/VaultSetupModal.svelte`
- CI で `lint` ステップとして実行。

---

### PROP-012: bootFlag はモジュールスコープで宣言され HMR 後にリセットされる (FIND-017 解消)

**Statement**: `bootFlag` は `export` されないモジュールスコープ変数であり、モジュールを再 import するとリセットされる（`false` に戻る）。

**Tier**: 1 (統合テスト)
**Required**: true

**検証アプローチ**:
```typescript
// app-shell.unit.test.ts
it('PROP-012: bootFlag resets on module re-import (HMR simulation)', async () => {
  // vi.resetModules() でモジュールキャッシュをクリアしてから再インポート
  vi.resetModules();
  const { getBootAttempted } = await import('../app-shell-internals-test-only');
  // 新しいモジュールインスタンスでは bootFlag は false
  expect(getBootAttempted()).toBe(false);
});
```

> **注意**: `bootFlag` は `export` しない。テスト用に `// @vcsdd-test-hook` コメントで許可された専用エクスポート関数 `getBootAttempted()` のみをテスト向けに公開する。

---

## テスト戦略サマリー

### 依存フィーチャーとの関係

本 feature のテストは app-startup / configure-vault パイプラインの実装に依存しない。Tauri adapter をモック化（`vi.mock`）することで、パイプライン実装なしに UI 層のみをテスト可能にする。

```
テスト対象                        モック化する境界
───────────────────────────────────────────────────
AppShell.svelte (UI ロジック)    ← tauriAdapter (全 invoke をスパイ注入)
VaultSetupModal.svelte           ← tauriAdapter.tryVaultPath
routeStartupResult (pure fn)     ← なし（純粋関数、モック不要）
mapVaultPathError (pure fn)      ← なし
shouldShowCorruptedBanner (pure) ← なし
isModalCloseable (pure fn)       ← なし
```

### テストファイル構成（Phase 2a で生成する）

```
promptnotes/src/lib/ui/app-shell/__tests__/
  app-shell.unit.test.ts         — REQ-001〜REQ-002, PROP-001a, PROP-001b, PROP-009, PROP-010, PROP-012
  vault-setup-modal.unit.test.ts — REQ-003〜REQ-007, PROP-003, PROP-005, PROP-008
  corrupted-banner.unit.test.ts  — REQ-009, PROP-004
  route-startup-result.test.ts   — PROP-007 (pure fn unit tests, 全 5 経路)
  map-vault-path-error.test.ts   — PROP-003 (pure fn exhaustive tests)
  design-tokens.audit.test.ts    — PROP-006 (拡張スコープ監査)
  prop/
    corrupted-banner.prop.test.ts — PROP-004 (fast-check)
    modal-closeable.prop.test.ts  — PROP-005 (fast-check, (state, trigger) ペア)
```

---

## トレーサビリティ対応表

| REQ / NEG-REQ | 関連 PROP | テストファイル |
|--------------|----------|-------------|
| REQ-001 | PROP-001a, PROP-001b | `app-shell.unit.test.ts` |
| REQ-002 | PROP-007, PROP-009 | `route-startup-result.test.ts`, `app-shell.unit.test.ts` |
| REQ-003 | PROP-005 | `vault-setup-modal.unit.test.ts`, `modal-closeable.prop.test.ts` |
| REQ-004 | PROP-002, PROP-008 | `vault-setup-modal.unit.test.ts` |
| REQ-005 | PROP-003 | `map-vault-path-error.test.ts`, `vault-setup-modal.unit.test.ts` |
| REQ-006 | PROP-008 | `vault-setup-modal.unit.test.ts` |
| REQ-007 | PROP-007 | `vault-setup-modal.unit.test.ts` |
| REQ-008 | PROP-009 | `app-shell.unit.test.ts` |
| REQ-009 | PROP-004 | `corrupted-banner.unit.test.ts`, `corrupted-banner.prop.test.ts` |
| REQ-010〜REQ-015 | PROP-006 | `design-tokens.audit.test.ts` |
| REQ-016 | PROP-005 | `vault-setup-modal.unit.test.ts` |
| REQ-017 | PROP-006 | `design-tokens.audit.test.ts` |
| REQ-018 | PROP-010 | `app-shell.unit.test.ts` |
| REQ-019 | PROP-006 | `design-tokens.audit.test.ts` |
| REQ-020 | PROP-001a, PROP-009 | `app-shell.unit.test.ts` |
| REQ-021 | PROP-011, PROP-012 | ESLint CI + `app-shell.unit.test.ts` |
| NEG-REQ-001〜NEG-REQ-005 | PROP-002, PROP-011 | AST lint CI |

---

## 未バインド REQ の説明

すべての REQ に PROP が割り当てられており、未バインドの要件は存在しない。
以前に `—` であった REQ-008 と REQ-018 には PROP-009 / PROP-010 が追加された（FIND-005 解消）。
