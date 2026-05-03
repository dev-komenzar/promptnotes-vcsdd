---
id: FIND-212
severity: major
dimension: verification_readiness
category: test_quality
relatedReqs: [REQ-022]
relatedProps: [PROP-014]
relatedCrits: [CRIT-012]
routeToPhase: 2a
---

# FIND-212 — PROP-014 late-arrival test does not assert the store is not overwritten

## Citation
- `promptnotes/src/lib/ui/app-shell/__tests__/ipc-timeout.test.ts:118-146` — the late-arrival test
- `verification-architecture.md` PROP-014 (lines 518-532) — required: `expect(screen.getByTestId('startup-error-banner')).toBeInTheDocument()` AFTER late `resolve!({ok: true, ...})`; i.e., the *DOM* must remain UnexpectedError

## Description
The test calls `bootOrchestrator(...)` to get `resultState`, then asserts `resultState === "UnexpectedError"`, late-arrives a successful resolve, and re-asserts the same local variable. But `resultState` is a frozen string captured before the late arrival; of course it does not change.

The test does NOT assert that the `appShellStore` value is still `"UnexpectedError"` after the late resolve. It does not subscribe to the store. It does not mount the AppShell DOM. The test does not in any meaningful way prove "Late-arrival discard" — it only proves that JavaScript local variables are not retroactively re-assigned, which is trivially true.

A truly adversarial late-arrival test must:
1. Subscribe to `appShellStore` and capture all values.
2. After the timeout fires and the store is `"UnexpectedError"`, late-arrive a `Configured` payload.
3. Assert that the store value remains `"UnexpectedError"` — i.e., a `setAppShellState("Configured")` did NOT subsequently fire.

In the current implementation, `bootOrchestrator` awaits the `withIpcTimeout` result inside a `try`. If the inner Promise.race rejects (timeout), the `await` throws and execution jumps to `catch` — so the late `resolve` never reaches the `setAppShellState(routed.state)` line. This is correct *by accident* of how `bootOrchestrator` is structured (the orchestrator returns once, the late arrival cannot re-enter), but the property is not directly tested.

## Suggested remediation
- Replace the late-arrival test with one that subscribes to `appShellStore`, drives the orchestrator to UnexpectedError, late-resolves the IPC, awaits a microtask, and asserts the captured store sequence ends in `UnexpectedError` (not `Configured`).
- Optionally add a defensive guard inside `bootOrchestrator` — e.g., `if (currentStoreValue === "UnexpectedError") return;` — and a test that exercises it.
