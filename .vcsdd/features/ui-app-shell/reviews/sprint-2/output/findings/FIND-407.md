---
id: FIND-407
severity: low
dimension: implementation_correctness
category: implementation_bug
relatedReqs: [REQ-005, REQ-007]
relatedCrits: [CRIT-006]
routeToPhase: 2b
---

# FIND-407 — Modal error fallbacks regress to misleading default messages on errorMessage absence

## Citation
- `promptnotes/src/lib/ui/app-shell/VaultSetupModal.svelte:130-133`:
  ```svelte
  {#if modalState.hasError && modalState.errorKind === "vault-path-error"}
    <p style="...">
      {modalState.errorMessage ?? mapVaultPathError({ kind: "empty" })}
    </p>
  {/if}
  ```
- `promptnotes/src/lib/ui/app-shell/VaultSetupModal.svelte:136-140`:
  ```svelte
  {#if modalState.hasError && modalState.errorKind === "vault-config-error"}
    <p style="...">
      {modalState.errorMessage ?? mapVaultConfigError({ kind: "path-not-found", path: "" })}
    </p>
  {/if}
  ```

## Description
FIND-210 (Sprint-1) was fixed by populating `errorMessage` from `mapVaultPathError(...)` / `mapVaultConfigError(...)` inside `vaultModalLogic.ts` (lines 95, 117). Those calls are now always made when an error is reported, so `errorMessage` is always a string in practice.

The Svelte template uses `?? mapVaultPathError({ kind: "empty" })` and `?? mapVaultConfigError({ kind: "path-not-found", path: "" })` as fallbacks. If the logic regression ever omits `errorMessage` (e.g., a future change adds a new error kind without `errorMessage`), the fallback will display the EMPTY message for any vault-path-error and the PATH-NOT-FOUND message for any vault-config-error — exactly the FIND-210 bug all over again, just one regression away.

This is a low-severity defensive-design concern: the fallback choice silently regresses to the original bug instead of failing loudly. A more robust fallback would be a generic "不明なエラー" or even render `<!-- bug: errorMessage missing -->` for visibility.

## Suggested remediation
- Replace the `?? mapVault...Error({...})` fallbacks with either:
  - A generic safe string: `{modalState.errorMessage ?? "エラーが発生しました"}`
  - Or remove the fallback and rely on the type system: change `errorMessage?: string` to `errorMessage: string` and require the producer to always set it.
- Add a regression test that asserts `modalState.errorMessage` is non-undefined whenever `modalState.hasError === true`.
