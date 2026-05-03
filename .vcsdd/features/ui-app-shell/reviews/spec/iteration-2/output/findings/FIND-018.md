# FIND-018: REQ-006 / EC-19 reference VaultConfigError variants that the configure-vault dependency contract does not expose

- **id**: FIND-018
- **severity**: critical
- **dimension**: spec_fidelity

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:240` (REQ-006 edge case: "`invoke_configure_vault` が `disk-full` / `lock` / `unknown` を返す: REQ-008 に従いインラインバナー表示し、モーダルは閉じる")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:595` (EC-19: "`invoke_configure_vault` が `disk-full` / `lock` / `unknown` を返す (`Settings.save` 失敗) | モーダルを閉じ、`AppShellState → UnexpectedError`、インラインバナーを表示する（REQ-008 参照）")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:96` (Pipeline diagram: `Err(VaultConfigError)` is the only error surface for `invoke_configure_vault`)

## referenceCitation
- `.vcsdd/features/configure-vault/specs/behavioral-spec.md:104-114` (REQ-005: "`statDir` returns `Err(FsError)` where `FsError.kind` is `'disk-full'`, `'lock'`, or `'unknown'` THEN the system SHALL return `Err({ kind: 'path-not-found', path })`")
- `.vcsdd/features/configure-vault/specs/behavioral-spec.md:133-144` (REQ-007: "`Settings.save(path)` returns `Err(FsError)` where `FsError.kind` is `'disk-full'`, `'lock'`, or `'unknown'` THEN the system SHALL return `Err({ kind: 'path-not-found', path })`")
- `.vcsdd/features/configure-vault/specs/behavioral-spec.md:286-291` (Error catalog: `VaultConfigError = { kind: 'path-not-found' } | { kind: 'permission-denied' }` — only two variants surface from configureVault, the `unconfigured` variant being reserved for AppStartup)
- `docs/domain/code/ts/src/shared/errors.ts` `VaultConfigError` has exactly three variants: `unconfigured`, `path-not-found`, `permission-denied`. `disk-full`, `lock`, `unknown` are `FsError` kinds that are explicitly collapsed in the configure-vault pipeline before the `VaultConfigError` is returned.

## description
REQ-006 line 240 and EC-19 line 595 both prescribe behavior for the case "`invoke_configure_vault` が `disk-full` / `lock` / `unknown` を返す". This case cannot occur. The configure-vault feature's contract — its sole consumer-facing return surface — is `Result<VaultDirectoryConfigured, VaultConfigError>`. `VaultConfigError` does not contain `disk-full`, `lock`, or `unknown` variants; configure-vault's REQ-005 and REQ-007 explicitly collapse those underlying `FsError` kinds into `{ kind: 'path-not-found', path }` before the result crosses the Tauri boundary.

Two consequences for ui-app-shell:

1. **Phantom branches**: The TypeScript discriminator implementing REQ-006/EC-19 cannot match against `'disk-full'`/`'lock'`/`'unknown'` on a `VaultConfigError` value because the type system forbids those variants. An exhaustive switch over `VaultConfigError` would never reach this code path, so the prescribed behavior is unreachable.

2. **Wrong routing for the genuine case**: The genuine "Settings.save fails for non-permission reason" scenario — the situation EC-19 evidently intends to cover — surfaces from configure-vault as `Err({ kind: 'path-not-found', path })`. ui-app-shell REQ-007 line 251 maps `path-not-found` to `AppShellState = 'StartupError'` (modal stays open with error message). EC-19 prescribes the OPPOSITE: close the modal and route to `'UnexpectedError'` (REQ-008 inline banner). The two routing rules cannot both fire on the same input.

The post-configure error handling for the Settings.save-fails scenario is therefore unspecified in any consistent way: the dependency contract says "user gets path-not-found and stays in modal", REQ-006 line 238-239 says "REQ-007 に従いモーダル内エラー表示" for path-not-found from configure-vault (consistent with the dependency), and EC-19 says "UnexpectedError + close modal" (inconsistent). Two engineers would now produce contradictory implementations.

This is the same class of issue iteration-1 FIND-004 flagged for AppStartup's `unconfigured` collapsed JSON path. The Builder fixed FIND-004 but introduced an analogous post-configure violation while resolving FIND-013.

## suggestedRemediation
Pick one of the following and update REQ-006, EC-19, and any cross-references consistently:

(A) **Trust the dependency contract**: Delete the "disk-full / lock / unknown" branch from REQ-006 line 240 and from EC-19 line 595. Replace with: "configure-vault's only surfaceable error variants are `path-not-found` and `permission-denied` (per `.vcsdd/features/configure-vault/specs/behavioral-spec.md` Error Catalog); a Settings.save failure for non-permission reasons surfaces as `path-not-found` and is handled by REQ-007 (modal stays open with path-not-found message)." Re-derive EC-19 as "Settings.save が `disk-full`/`lock`/`unknown` で失敗 → configure-vault が `path-not-found` を返す → REQ-007 ルート".

(B) **Amend the dependency contract** (if UnexpectedError is genuinely the desired UX for Settings.save catastrophic failure): file a cross-feature change request against configure-vault to introduce a new `VaultConfigError` variant like `{ kind: 'settings-write-failed' }` that is distinct from `path-not-found`, then map ONLY that new variant to UnexpectedError. configure-vault REQ-007 already flags this as an open question ("Phase 1c review should confirm this mapping or request a new error variant").

Either way, remove the literal `disk-full` / `lock` / `unknown` strings from REQ-006/EC-19 — they are FsError kinds, not VaultConfigError kinds, and must not appear at this layer.

## introducedIn
iteration-2-revision (the explicit `disk-full`/`lock`/`unknown` strings appear only in iteration-2 EC-19 and the iteration-2 expanded REQ-006 edge cases; iteration-1 did not enumerate them at this granularity)
