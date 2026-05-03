---
id: FIND-401
severity: critical
dimension: spec_fidelity
category: requirement_mismatch
relatedReqs: [REQ-001, REQ-002]
relatedCrits: [CRIT-003, CRIT-014]
routeToPhase: 2b
duplicateOf: FIND-203
---

# FIND-401 — `invoke_app_startup` Tauri command is a hardcoded stub returning Unconfigured

## Citation
- `promptnotes/src-tauri/src/lib.rs:144-149`:
  ```rust
  #[tauri::command]
  fn invoke_app_startup() -> Result<InitialUIState, AppStartupErrorDto> {
      Err(AppStartupErrorDto::Config {
          reason: VaultConfigErrorDto::Unconfigured,
      })
  }
  ```
- `promptnotes/src-tauri/src/lib.rs:18` — `pub mod domain;` is declared but the command body never calls into it.
- Sprint-1 `FIND-203.md` lines 25-28 — required remediation: "Wire them to the existing `app-startup`, `configure-vault`, and `VaultPath::try_new` implementations in `promptnotes/src-tauri/src/domain/`."

## Description
FIND-203 (Sprint-1, CRITICAL) demanded that `invoke_app_startup` be implemented AND wired to the domain pipeline. The Sprint-2 fix only delivered registration: the command compiles, appears in `tauri::generate_handler!`, and returns a typed shape — but its body is a constant. There is no call into `domain::app_startup::*`, no `Settings.load`, no scan, no production-equivalent path.

Behavioral consequences:
1. **Vault configuration never persists across launches** in the Tauri runtime. Even if `invoke_configure_vault` succeeded, the subsequent `invoke_app_startup()` re-invocation (REQ-006, FIND-009 Option A) returns Unconfigured and the modal re-opens.
2. REQ-002 EARS routing claims `Ok(InitialUIState) → 'Configured'`, but no code path in production can produce `Ok` — the IPC return type is structurally `Err` only.
3. The TypeScript test suite passes because every test injects a mock adapter; no test exercises the real Rust binding. The same condition that produced FIND-203 in Sprint-1 (mock-only verification) is unchanged.

Contract `CRIT-003` passThreshold says "all 7 commands registered in tauri::generate_handler!". Registration is satisfied; functional integration is not. The contract pass threshold is too narrow — registration is necessary but insufficient for FIND-203 closure.

## Suggested remediation
- Implement `invoke_app_startup` to call into `domain::app_startup` (the existing pipeline noted in `behavioral-spec.md` "依存フィーチャーの参照関係"). At minimum: `Settings::load() -> Option<VaultPath> -> scan_vault(path) -> InitialUIState`.
- Add an integration test that boots a Tauri context and asserts `invoke('invoke_app_startup')` resolves to `Ok(...)` when a valid vault is preconfigured.
- Update CRIT-003 in any future contract to require functional delegation, not just symbol registration.
