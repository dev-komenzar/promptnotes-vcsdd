---
id: FIND-203
severity: critical
dimension: spec_fidelity
category: requirement_mismatch
relatedReqs: [REQ-001, REQ-004, REQ-006]
relatedCrits: [CRIT-001, CRIT-005, CRIT-006]
routeToPhase: 2b
---

# FIND-203 — Tauri commands `invoke_app_startup`, `try_vault_path`, `invoke_configure_vault` are not registered with the Tauri runtime

## Citation
- `promptnotes/src-tauri/src/lib.rs:11-17` — `tauri::Builder::default().invoke_handler(tauri::generate_handler![greet])` — only `greet` is registered
- `promptnotes/src-tauri/src/main.rs:1-7` — entry point delegates to `lib.rs` only
- `promptnotes/src/lib/ui/app-shell/tauriAdapter.ts:80-94` — TypeScript side calls `invoke('invoke_app_startup')`, `invoke('try_vault_path', ...)`, `invoke('invoke_configure_vault', ...)`

## Description
REQ-001 / REQ-004 / REQ-006 require three Tauri commands. The TypeScript adapter calls them via `@tauri-apps/api/core::invoke`. However the Rust side does not register any of them. At runtime, `invoke('invoke_app_startup')` will reject with a Tauri "command not found" error and `bootOrchestrator` will fall through to its `catch` branch and immediately set `AppShellState = UnexpectedError` — which means the UI will permanently display the inline banner regardless of vault state.

The unit tests pass because the adapter is replaced with mocks in every test (`vi.fn().mockResolvedValue(...)` or hand-rolled adapter literals). No test exercises the real `createTauriAdapter` against a real Tauri backend, and there is no Tauri command source file (`#[tauri::command] fn invoke_app_startup`, etc.) anywhere in `src-tauri/src/`.

This is the kind of integration gap that an adversarial reviewer must catch: the test suite says PASS, but the application is non-functional in the only environment that matters.

## Suggested remediation
- Add `#[tauri::command]` Rust functions for `invoke_app_startup`, `try_vault_path`, `invoke_configure_vault` and register them with `tauri::generate_handler![..]`.
- Wire them to the existing `app-startup`, `configure-vault`, and `VaultPath::try_new` implementations in `promptnotes/src-tauri/src/domain/`.
- Add a smoke test (or at minimum an integration verification log) that boots the Tauri shell and confirms each command resolves.

Note: contract CRIT-001 / CRIT-005 / CRIT-006 implicitly assume the IPC commands exist. None of their passThresholds explicitly verify Rust command registration; this gap was missed by the contract.
