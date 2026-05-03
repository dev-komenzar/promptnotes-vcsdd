---
id: FIND-206
severity: major
dimension: verification_readiness
category: test_quality
relatedReqs: [REQ-018]
relatedProps: [PROP-010]
relatedCrits: [CRIT-012]
routeToPhase: 2a
---

# FIND-206 — PROP-010 (modal within 100ms) is replaced with a vacuous logic-layer stub

## Citation
- `promptnotes/src/lib/ui/app-shell/__tests__/app-shell-state.test.ts:240-257` — the `describe("PROP-010 (logic layer): ...")` block, comment: "Full test requires @testing-library/svelte for DOM assertion. This stub verifies the store transitions synchronously after the Promise resolves."
- `verification-architecture.md` PROP-010 (lines 418-444) — required behavior: "100ms 経過前にモーダルが DOM に存在することを確認" via `screen.getByTestId('vault-setup-modal')`

## Description
PROP-010 is supposed to verify that the modal element appears in the DOM within 100ms of the AppShellState transitioning to `Unconfigured` / `StartupError`. The actual test merely awaits `bootOrchestrator(...)` and asserts the *return value* is the string `"Unconfigured"`. It:

1. Does not mount any DOM.
2. Does not use `vi.useFakeTimers()` (Vitest fake timers; bun:test has separate APIs anyway).
3. Does not use `@testing-library/svelte` (the file admits the dependency is not installed).
4. Does not assert any timing constraint at all.

Therefore CRIT-012 passThreshold ("PROP-010 proved (app-shell-state.test.ts vi.useFakeTimers modal-within-100ms assertion passes)") is **not satisfied** by the existing tests. The 100ms NFR is unverified.

The same family of issues applies to:
- REQ-003 modal "renders, blocks interaction" (only logic boolean, no DOM)
- REQ-008 banner "role=alert, no autofocus" (testid constants verified, DOM not)
- REQ-010 / REQ-011 / REQ-012 layout frame (only token constants verified, no DOM)
- REQ-016 modal a11y attributes (no DOM mount; tests only check that strings are exported)

## Suggested remediation
- Install `@testing-library/svelte` (and a Vitest/bun-test fake timer shim if needed).
- Add a real Tier-1 integration test that mounts `<AppShell />`, advances timers by 100ms after the IPC resolves with `unconfigured`, and asserts `getByTestId('vault-setup-modal')` is in the document.
- Apply the same DOM-mounting strategy to REQ-003, REQ-008, REQ-010, REQ-011, REQ-012, REQ-016 acceptance tests.
