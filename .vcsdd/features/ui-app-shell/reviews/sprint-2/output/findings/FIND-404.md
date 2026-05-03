---
id: FIND-404
severity: medium
dimension: spec_fidelity
category: requirement_mismatch
relatedReqs: [REQ-021]
relatedCrits: [CRIT-011]
routeToPhase: 1c
duplicateOf: FIND-205
---

# FIND-404 — REQ-021 spec says ".svelte files only" but implementation writes from .ts files; spec was not updated

## Citation
- `behavioral-spec.md` REQ-021 EARS lines 510-516 — "the write SHALL originate exclusively from: (a) `AppShell.svelte` の `routeStartupResult` 呼び出し後のディスパッチ、または (b) `VaultSetupModal.svelte` の configure-vault 成功ハンドラ"
- `promptnotes/src/lib/ui/app-shell/__tests__/effectful-isolation.test.ts:50-61` — `ALLOWED_WRITERS` set includes `appShellStore.ts`, `bootOrchestrator.ts`, `vaultModalLogic.ts` (3 .ts files added to the originally-permitted 2 .svelte files)
- `promptnotes/src/lib/ui/app-shell/AppShell.svelte` (full file) — does NOT call `appShellStore.set(`, `appShellStore.update(`, or `setAppShellState(` anywhere
- `promptnotes/src/lib/ui/app-shell/VaultSetupModal.svelte` (full file) — does NOT call any of those either
- `promptnotes/src/lib/ui/app-shell/bootOrchestrator.ts:108, 114, 118` — calls `setAppShellState(...)`
- `promptnotes/src/lib/ui/app-shell/vaultModalLogic.ts:78, 91, 113, 126, 129` — calls `setAppShellState(...)`

## Description
Sprint-1 FIND-205 offered a binary choice: tighten the audit OR remove the indirection AND make the .svelte files the actual writers. The Sprint-2 contract opted for the audit broadening. But the test broadening expanded the ALLOWED_WRITERS set to FIVE files — three of which are .ts modules. REQ-021 explicitly forbids non-.svelte writers; the test now permits them; the spec was never updated.

Confirmation: I read `AppShell.svelte` and `VaultSetupModal.svelte` in full. **Neither file contains a single call to `appShellStore.set(`, `appShellStore.update(`, or `setAppShellState(`.** The two .svelte files that REQ-021 names as the only legitimate writers do not write at all — all writes happen in `bootOrchestrator.ts` (called from `AppShell.svelte`'s `onMount`) and `vaultModalLogic.ts` (called from `VaultSetupModal.svelte`'s submit handler). The audit catches the indirection (good), but the spec text is no longer descriptive of the implementation.

The contract's CRIT-011 acknowledged this expansion ("ALLOWED_WRITERS set explicitly enumerates appShellStore.ts, bootOrchestrator.ts, vaultModalLogic.ts as permitted callers"), but `behavioral-spec.md` REQ-021 was not amended. A future reader of the spec will believe the writes happen in .svelte files and be surprised.

## Suggested remediation
- Update REQ-021 EARS to read: "the write SHALL originate exclusively from: (a) `bootOrchestrator.ts` (driven by `AppShell.svelte` onMount), or (b) `vaultModalLogic.ts` (driven by `VaultSetupModal.svelte` submit). All other modules SHALL NOT call `appShellStore.set(...)`, `appShellStore.update(...)`, or `setAppShellState(...)`."
- Or: refactor so that the .svelte components are the actual writers (e.g., expose a callback parameter from `bootOrchestrator` that the component invokes with the routed state).
- Either way, align spec, test, and implementation in a single commit.
