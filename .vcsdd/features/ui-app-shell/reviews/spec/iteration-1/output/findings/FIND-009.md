# FIND-009: REQ-006 introduces an unspecified Tauri command name (`invoke_app_startup_scan` "or equivalent"), producing two-engineer ambiguity

- **id**: FIND-009
- **severity**: major
- **dimension**: spec_fidelity

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:173` (REQ-006 AC: "`invoke_configure_vault` 成功後、`invoke_app_startup_scan` (または scanVault を直接呼ぶ相当の Tauri command) を invoke する")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:64` (Pipeline diagram: "`invoke_app_startup()` から Step 2 (scanVault) 続行")

## referenceCitation
- `.vcsdd/features/app-startup/specs/behavioral-spec.md:1-300` — defines the AppStartup pipeline and its single entry-point (no `scan-only` re-entry surface is specified). The dependency feature does not expose a separate `scan` Tauri command.

## description
REQ-006 mandates that after a successful `invoke_configure_vault`, the system re-invokes the AppStartup pipeline starting at Step 2 (`scanVault`). The AC names this Tauri command as "`invoke_app_startup_scan` (or scanVault-equivalent)". This is a vague phrase ("appropriately", "as needed", "or equivalent" — the anti-leniency rules explicitly flag this kind of language as a major finding). Two engineers will now reasonably implement:
- (A) A new dedicated `#[tauri::command] fn invoke_app_startup_scan(path)` that calls only Step 2–4.
- (B) A re-call of the existing `invoke_app_startup()` and rely on Step 1 finding the freshly-saved `Settings`.

Choices (A) and (B) have different failure modes (A bypasses Step 1's `statDir` re-validation; B re-loads settings from disk and may race with Tauri's settings-flush). The dependency feature `app-startup` does not declare a `scan-only` Tauri command. Strict mode requires the spec to choose one.

## suggestedRemediation
Pick one of:
- (A) "After `invoke_configure_vault` succeeds, the system SHALL invoke `invoke_app_startup()` again. The renewed pipeline run executes Step 1 against the just-saved Settings; the AC is the Step-1 happy path." Update REQ-006 ACs to that effect.
- (B) "Define a new Tauri command `invoke_app_startup_scan(path: VaultPath)` that bypasses Step 1, takes a verified `VaultPath` directly, and runs Steps 2–4." Then add a note that the `app-startup` dependency feature must be amended to expose this surface, and call out the cross-feature dependency.

Either way, remove the "or equivalent" wording. Document the chosen surface in a Tauri-command table.
