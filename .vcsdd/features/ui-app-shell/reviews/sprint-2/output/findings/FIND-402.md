---
id: FIND-402
severity: critical
dimension: spec_fidelity
category: requirement_mismatch
relatedReqs: [REQ-006]
relatedCrits: [CRIT-003]
routeToPhase: 2b
---

# FIND-402 — `invoke_configure_vault` does not persist settings; the configure pipeline is a no-op writer

## Citation
- `promptnotes/src-tauri/src/lib.rs:118-138`:
  ```rust
  #[tauri::command]
  fn invoke_configure_vault(path: String) -> Result<serde_json::Value, VaultConfigErrorDto> {
      let dir = Path::new(&path);
      match dir.metadata() {
          Ok(meta) => {
              if !meta.is_dir() {
                  return Err(VaultConfigErrorDto::PathNotFound { path });
              }
          }
          Err(e) => { /* maps OS errors to VaultConfigError variants */ }
      }
      Ok(serde_json::json!({}))
  }
  ```
- `behavioral-spec.md` REQ-006 AC line 253: "設定の永続化 (`Settings.save`) は Tauri command 内部で行われ、TypeScript 側で直接呼ばない"
- `behavioral-spec.md` line 102 (pipeline diagram): `→ Ok(VaultDirectoryConfigured) → invoke_app_startup() を再呼び出し (全ステップ実行)`

## Description
REQ-006 mandates that `invoke_configure_vault` persist the vault configuration on success — that is the entire point of the command. The current implementation only checks `dir.metadata().is_dir()` and returns `Ok(json!({}))` without touching the settings store or calling `settings_save`. The separately-registered `settings_save` command exists at `lib.rs:154-161` but is never invoked from `invoke_configure_vault`, and the TypeScript side has no code path that calls `settings_save` directly either.

Combined with FIND-401 (invoke_app_startup is a stub), the production flow is:
1. User opens app → `invoke_app_startup()` → stubbed `Err(Unconfigured)` → modal opens.
2. User selects vault → `try_vault_path` → `Ok` → `invoke_configure_vault(path)` → returns `Ok(json!({}))` but persists nothing.
3. UI calls `invoke_app_startup()` again → stubbed `Err(Unconfigured)` → modal re-opens.

The user is trapped in an infinite modal loop. Every test passes because no test exercises the real Rust handler chain — they all inject TypeScript mock adapters.

## Suggested remediation
- Implement `invoke_configure_vault` to call `Settings::save(&path)` (or equivalent) before returning `Ok`.
- Add a Rust unit test: configure → re-load settings → assert path round-trips.
- Add a Tauri-context integration test that confirms post-configure `invoke_app_startup` returns `Ok(InitialUIState)`.
