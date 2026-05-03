---
id: FIND-205
severity: major
dimension: structural_integrity
category: purity_boundary
relatedReqs: [REQ-021]
relatedProps: [PROP-011]
relatedCrits: [CRIT-013]
routeToPhase: 2c
---

# FIND-205 — `appShellStore` write-authority audit is bypassed by an indirection helper

## Citation
- `promptnotes/src/lib/ui/app-shell/appShellStore.ts:55-57` — `setAppShellState` is exported and writes `_store.set(state)`
- `promptnotes/src/lib/ui/app-shell/bootOrchestrator.ts:82, 88, 92` — calls `setAppShellState(...)` (not `appShellStore.set(...)`)
- `promptnotes/src/lib/ui/app-shell/vaultModalLogic.ts:14, 120` — calls `setAppShellState(...)`
- `promptnotes/src/lib/ui/app-shell/__tests__/effectful-isolation.test.ts:67` — audit pattern is `content.includes("appShellStore.set(") || content.includes("appShellStore.update(")` — does not match `setAppShellState(`

## Description
REQ-021 EARS: "the write SHALL originate exclusively from: (a) `AppShell.svelte`'s `routeStartupResult` dispatch, OR (b) `VaultSetupModal.svelte`'s configure-vault success handler. No other module SHALL call `appShellStore.set(...)` or `appShellStore.update(...)`."

The implementation evades the letter of the audit pattern by introducing the helper `setAppShellState` (`appShellStore.ts:55`) which calls `_store.set` internally. Both `bootOrchestrator.ts` and `vaultModalLogic.ts` call `setAppShellState`, NOT `appShellStore.set`. The PROP-011 audit (`effectful-isolation.test.ts:67`) only greps for the literal token `appShellStore.set(` / `appShellStore.update(`, so the audit reports zero violations — but the spirit of REQ-021 is violated: the actual writes originate from two `.ts` modules, not the two `.svelte` components.

This is a textbook "test passes because the test is too narrow." The exposed `appShellStore.set` / `.update` methods on the public object (lines 42-46) are still callable from anywhere — the audit catches only the obvious literal pattern.

## Suggested remediation
- Either tighten the audit to also flag `setAppShellState(` calls outside the two allowed `.svelte` files, or remove the indirection and have the two components call the store directly through small handler functions they own.
- Better: make the public store interface read-only by exporting `subscribe` only and exposing `set` through a token/capability passed at component init time.
- Update PROP-011 (verification-architecture.md) to specify the audit must catch the `setAppShellState` indirection, then re-implement.
