---
id: FIND-210
severity: major
dimension: implementation_correctness
category: spec_gap
relatedReqs: [REQ-005, REQ-007]
relatedCrits: [CRIT-005, CRIT-006]
routeToPhase: 2b
---

# FIND-210 — Modal does not surface the actual error variant; renders only generic strings

## Citation
- `promptnotes/src/lib/ui/app-shell/VaultSetupModal.svelte:84-94` — `vault-path-error` branch hardcodes "フォルダを選択してください" (the *empty* message) regardless of which `VaultPathError` variant occurred
- `promptnotes/src/lib/ui/app-shell/VaultSetupModal.svelte:90-94` — `vault-config-error` branch falls back to the path-not-found message text via `?? ` default; `permission-denied` will only show if `errorMessage` is supplied — but `vaultModalLogic.ts` never populates `errorMessage` (`VaultModalState` field is never set)
- `promptnotes/src/lib/ui/app-shell/vaultModalLogic.ts:84-93, 107-114` — sets only `errorKind`; never calls `mapVaultPathError` / `mapVaultConfigError` to compute `errorMessage`
- `promptnotes/src/lib/ui/app-shell/errorMessages.ts:20-31, 38-51` — `mapVaultPathError` / `mapVaultConfigError` are exported but never imported by `vaultModalLogic.ts`

## Description
REQ-005 AC: "`VaultPathError.kind === 'empty'` が入力フィールド近傍に「フォルダを選択してください」と表示される"; "`VaultPathError.kind === 'not-absolute'` が入力フィールド近傍に「絶対パスを指定してください」と表示される". Two different messages.

The current modal implementation, when `errorKind === "vault-path-error"`, always renders the literal string "フォルダを選択してください" — i.e., it shows the *empty* error message for both `empty` and `not-absolute` variants. A user who enters a relative path (`./vault`) gets told to select a folder, not that they need an absolute path. REQ-005's two-variant disambiguation is collapsed.

Similarly for `vault-config-error`: REQ-007 wants `path-not-found` and `permission-denied` to map to different messages. `mapVaultConfigError` exists for exactly this reason, but `vaultModalLogic.ts` never calls it; it just sets `errorKind` and leaves `errorMessage: undefined`. The Svelte fallback (`errorMessage ?? "...path-not-found message..."`) means `permission-denied` users always see the path-not-found message.

PROP-003 unit tests pass because they call `mapVaultPathError` / `mapVaultConfigError` in isolation; the integration that ties those messages to the rendered modal is missing.

## Suggested remediation
- In `vaultModalLogic.ts`, after the failure branches at lines 87-93 and 107-114, populate `errorMessage = mapVaultPathError(vaultPathResult.error)` and `errorMessage = mapVaultConfigError(configureResult.error)` respectively.
- Have the Svelte template render `{modalState.errorMessage}` directly instead of hardcoding the empty-variant string.
- Add a DOM-level test (after installing `@testing-library/svelte`) that submits a `not-absolute` path and asserts the displayed text is "絶対パスを指定してください" (not "フォルダを選択してください").
