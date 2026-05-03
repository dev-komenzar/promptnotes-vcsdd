# FIND-020: EC-12 contradicts REQ-020 (initial Loading state) and REQ-021 (HMR resets bootFlag)

- **id**: FIND-020
- **severity**: major
- **dimension**: spec_fidelity

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:588` (EC-12: "アプリ再ロード中にモーダルが開いている | モーダルが再マウント後も `Unconfigured` / `StartupError` 状態を維持する")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:480` (REQ-020 初期値: "`appShellStore` の初期値は `'Loading'` とする。アプリケーションモジュールがインポートされた時点で `'Loading'` が設定され、`invoke_app_startup` の結果到達まで維持される。")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:506-510` (REQ-021 `bootFlag` semantics: "Vite HMR がモジュールを再インポートした場合、`bootFlag` はリセットされる ... HMR リセット後の最初のマウントは 'fresh boot' として扱われ、`invoke_app_startup` を再実行する")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:596` (EC-20: "HMR により `bootFlag` がリセットされる ... 次回マウント時に `invoke_app_startup` が再実行される")

## description
EC-12 dates from iteration-1 and was preserved unchanged into iteration-2. With the new REQ-020 and REQ-021 added in iteration-2, EC-12's assertion that the modal "re-mount 後も `Unconfigured` / `StartupError` 状態を維持する" now conflicts with two normative requirements:

1. **REQ-020 conflict**: REQ-020 line 480 mandates that `appShellStore`'s initial value is `'Loading'` *at module-import time*. After "アプリ再ロード" (which in a Vite HMR / Tauri-reload context means module re-import), the freshly imported `appShellStore` is `'Loading'` — not `'Unconfigured'` and not `'StartupError'`. The state cannot be "maintained" because the store is a new instance with no memory of the prior state.

2. **REQ-021 conflict**: REQ-021 line 506-510 mandates that HMR re-import resets `bootFlag` to false, and "HMR リセット後の最初のマウントは 'fresh boot' として扱われ、`invoke_app_startup` を再実行する". A fresh boot necessarily begins in `'Loading'` and then transitions to whichever state `routeStartupResult` produces — it does not begin in the prior state.

3. **EC-20 conflict** (intra-EC): EC-20 line 596 explicitly says HMR triggers a re-execution of `invoke_app_startup`. EC-12 says the prior state is preserved. These two ECs cannot both be true.

The most plausible reconciliation is that EC-12 was written under iteration-1's looser semantics and intended a different scenario (perhaps "Tauri webview reload preserves app state" — which is also false in practice), but it was not updated when REQ-020 / REQ-021 were added. As written, an implementer would have to choose: persist `AppShellState` to `localStorage`/`sessionStorage` to satisfy EC-12 (and then violate REQ-020), or follow REQ-020/REQ-021 (and violate EC-12). Strict mode forbids leaving such a contradiction unresolved.

## suggestedRemediation
Pick one and update consistently:

(A) **Drop EC-12** entirely. The "app re-load" scenario is now governed by REQ-020 (initial state = Loading) + REQ-021 (HMR resets bootFlag) + EC-20 (HMR mid-flight). EC-12 adds nothing and contradicts.

(B) **Reframe EC-12** to describe what actually happens: "アプリ再ロード（Tauri webview reload または Vite HMR） | `appShellStore` は `'Loading'` に再初期化され、`bootFlag` は false に戻り、`invoke_app_startup` が再実行される。Settings.load が引き続き `null` を返すなら次の routeStartupResult はやはり `'Unconfigured'` を返し、結果として同じモーダルが再描画されるが、これは『状態維持』ではなく『同じ入力からの再導出』である。"

(C) If EC-12 is intended to specify a NEW persistence behavior (e.g., persist `AppShellState` across reloads via `localStorage`), then introduce a REQ for that persistence, define the storage key, and reconcile with REQ-020. This is a substantial design change and should be scoped explicitly.

## introducedIn
iteration-2-revision (the contradiction did not exist in iteration-1 because REQ-020 and REQ-021 did not exist; the Builder added the new REQs without sweeping EC-12 for compatibility)
