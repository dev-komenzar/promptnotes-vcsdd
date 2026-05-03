---
id: FIND-410
severity: medium
dimension: verification_readiness
category: test_coverage
relatedReqs: [REQ-018]
relatedCrits: [CRIT-008]
routeToPhase: 2a
---

# FIND-410 — PROP-010 / REQ-018 still verified at logic-layer; DOM-mount assertion missing

## Citation
- `promptnotes/src/lib/ui/app-shell/__tests__/app-shell-state.test.ts:257-336` — three PROP-010 tests; all measure `storeSetAt - ipcResolvedAt` on the appShellStore value, not on a mounted DOM.
- `verification-architecture.md` PROP-010 detail lines 426-441:
  ```typescript
  it('PROP-010: modal appears within 100ms of Unconfigured determination', async () => {
    ...
    expect(screen.getByTestId('vault-setup-modal')).toBeInTheDocument();
    ...
  });
  ```
  — the spec mandates `screen.getByTestId('vault-setup-modal')`, i.e., a real DOM mount.
- `behavioral-spec.md` REQ-018 line 437: "the system SHALL render the modal within 100ms of that determination" (rendering, not just store-set).

## Description
REQ-018 / NFR-01 measures **modal rendering** delay — the wall-clock time between the determination (`AppShellState` resolves to `Unconfigured` / `StartupError`) and the modal element appearing in the DOM. The current tests measure store-set time only.

Why this matters:
1. The Svelte reactive system could introduce a microtask delay between `setAppShellState("Unconfigured")` and the `<VaultSetupModal />` block being rendered. In practice this is usually 0–1ms, but the contract asserts ≤ 100ms — the test should verify the contract, not assume the implementation detail.
2. Sprint-1 FIND-206 explicitly noted: "Install `@testing-library/svelte` (and a Vitest/bun-test fake timer shim if needed). Add a real Tier-1 integration test that mounts `<AppShell />`, advances timers by 100ms after the IPC resolves with `unconfigured`, and asserts `getByTestId('vault-setup-modal')` is in the document." Neither step has been done in Sprint-2.
3. The same observational gap applies to REQ-003, REQ-008, REQ-010, REQ-011, REQ-012 — all rendering requirements verified only via constants/route-result assertions, never via DOM mount.

CRIT-008 passThreshold accepts wall-clock timing on the logic layer ("elapsed = storeSetAt - ipcResolvedAt < 100ms"), but this is a strictly weaker contract than REQ-018. The contract under-specifies the verification.

## Suggested remediation
- Install `@testing-library/svelte` (it works with bun:test via the Svelte testing-library bridge).
- Add an integration test that:
  1. Renders `<AppShell />`.
  2. Mocks the Tauri adapter to return `Err({kind:'config', reason:{kind:'unconfigured'}})`.
  3. Awaits the boot.
  4. Captures `performance.now()` immediately after the boot promise resolves.
  5. Polls `screen.getByTestId('vault-setup-modal')` and captures another `performance.now()`.
  6. Asserts the delta < 100ms.
- Apply the same DOM-mounted strategy to PROP-009 (banner DOM), REQ-003 (modal DOM), REQ-016 (focus inside modal).
