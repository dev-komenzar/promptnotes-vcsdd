---
id: FIND-208
severity: major
dimension: implementation_correctness
category: spec_gap
relatedReqs: [REQ-022]
relatedCrits: [CRIT-012]
routeToPhase: 2c
---

# FIND-208 — Pipeline IPC timeout is applied twice (double-wrapping)

## Citation
- `promptnotes/src/lib/ui/app-shell/tauriAdapter.ts:80-94` — `createTauriAdapter` wraps every `invoke(...)` with `withIpcTimeout(...)` (default `PIPELINE_IPC_TIMEOUT_MS = 30000`)
- `promptnotes/src/lib/ui/app-shell/bootOrchestrator.ts:85-86` — calls `adapter.invokeAppStartup()` (which is already timeout-wrapped), then **wraps the result again** with `withIpcTimeout(ipcPromise, timeoutMs)`

## Description
`createTauriAdapter` returns adapter methods whose call signature is `() => Promise<...>` and each one is internally `withIpcTimeout(deps.invoke(...))`. So when `bootOrchestrator` invokes `adapter.invokeAppStartup()`, what comes back is already a Promise that will reject with "IPC timeout after 30000ms" if the underlying call hangs.

`bootOrchestrator` then wraps this *again* with `withIpcTimeout(ipcPromise, timeoutMs)`, scheduling a second `setTimeout` that races with the inner one. The inner `setTimeout` is leaked — it remains pending in the JS event loop until 30000ms elapses, even when the outer race has already produced a result.

Behavior implications:
1. In production with default `timeoutMs` (30000), two timers fire at the same wall-clock moment; whichever resolves the inner `Promise.race` first wins, and the other one fires uselessly.
2. In tests where `timeoutMs: 10` is passed, the outer timer wins quickly, but the inner 30000ms timer is leaked and sits in the test's timer queue. (Because the tests use the mock adapter directly, this does not actually leak — but a hypothetical real-adapter test would.)
3. PROP-014 "Late-arrival discard" is conceptually weakened: which timer's rejection drives the `bootOrchestrator` catch is non-deterministic across call sites.

The `tauriAdapter`-level `withIpcTimeout` is sufficient on its own (REQ-022 says timeout lives in `tauriAdapter`). The `bootOrchestrator`-level wrap is redundant and architecturally wrong.

## Suggested remediation
- Remove `withIpcTimeout(ipcPromise, timeoutMs)` from `bootOrchestrator.ts:86`; let the adapter own the timeout (per the REQ-022 design note).
- If `bootOrchestrator` needs a configurable timeout (for tests), inject a custom adapter with a custom `timeoutMs`, rather than double-wrapping.
- Add `clearTimeout` cleanup inside `withIpcTimeout` so the sentinel timer is canceled on success — avoids leaked timers regardless of how many layers wrap the promise.
