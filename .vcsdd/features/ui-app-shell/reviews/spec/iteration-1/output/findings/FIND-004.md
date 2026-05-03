# FIND-004: EC-01 contradicts the app-startup dependency contract for corrupted Settings JSON

- **id**: FIND-004
- **severity**: major
- **dimension**: spec_fidelity

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:423` (EC-01 row, "Settings ファイルが破損 JSON | `AppStartupError { kind:'config', reason:{ kind:'path-not-found' } }` が返る (JSON parse 失敗は Tauri 側で `null` 扱い → `unconfigured` 経由)")

## referenceCitation
- `.vcsdd/features/app-startup/specs/behavioral-spec.md:149-155` — REQ-006 explicitly states: "Null return from `Settings.load()` is the sole trigger for `{ kind: 'unconfigured' }`. PathNotFound is never produced from a null path; it requires a non-null path where statDir returns Ok(false) or Err(not-found)."

## description
EC-01's left column declares the resulting error is `path-not-found`, but the same row's parenthetical clarifies that JSON parse failure is treated as `null` and routed through `unconfigured`. These two halves of the same row contradict each other. Worse, the headline value (`path-not-found`) directly violates the dependency feature's REQ-006 invariant. An engineer implementing just from this table would emit the wrong AppShellState (`StartupError` instead of `Unconfigured`).

## suggestedRemediation
Rewrite EC-01 expected behavior column to: `AppStartupError { kind:'config', reason:{ kind:'unconfigured' } }` and update the AppShellState target column to `Unconfigured`. Remove the inline parenthetical that conflicts with the headline. Add a separate edge case row only if there is an alternative behavior on the Tauri-side (e.g. a JSON parse error that is NOT collapsed to null) — and then specify exactly which `VaultConfigError` variant is produced.
