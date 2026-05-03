---
id: FIND-214
severity: minor
dimension: spec_fidelity
category: requirement_mismatch
relatedReqs: [REQ-006]
relatedCrits: [CRIT-006]
routeToPhase: 2b
---

# FIND-214 — `invoke_configure_vault` payload key disagrees with spec

## Citation
- `promptnotes/src/lib/ui/app-shell/tauriAdapter.ts:91-93` — `deps.invoke("invoke_configure_vault", { vaultPath })`
- `behavioral-spec.md` REQ-006 line 237 — "the system SHALL invoke the Tauri command `invoke_configure_vault(path: VaultPath)`"
- `behavioral-spec.md` line 102 — pipeline diagram: `Tauri command: invoke_configure_vault(path)`

## Description
The spec consistently names the parameter `path`. The TypeScript adapter packages it as `{ vaultPath }`. Tauri's invoke argument-naming is significant — when the Rust-side `#[tauri::command] fn invoke_configure_vault(path: VaultPath)` is implemented, it will look for a `path` key in the payload (Tauri lowercases args, but the conventional key is the parameter name).

Because no Rust command currently exists for this (see FIND-203), this mismatch is masked. Once the Rust side is implemented, the adapter will fail to bind to the parameter unless the Rust signature is changed to `vault_path: VaultPath` (which would in turn diverge from the spec).

The naming inconsistency rule is explicit in the adversary brief: "Naming inconsistency between spec and implementation ... is a MAJOR finding". In this case the parameter naming differs from the spec, but the impact is bounded by the absent Rust binding (the issue would only manifest after FIND-203 is fixed). Recording as MINOR because no test fails today; will become a binding bug once FIND-203 is addressed.

## Suggested remediation
- Change the adapter to `deps.invoke("invoke_configure_vault", { path: vaultPath })` (or whatever key matches the eventual Rust `#[tauri::command]` parameter name).
- Or, when implementing the Rust command, alias the parameter (`#[tauri::command] fn invoke_configure_vault(vault_path: VaultPath)`) and update the spec accordingly.
