---
id: FIND-409
severity: medium
dimension: verification_readiness
category: test_quality
relatedReqs: [REQ-001]
relatedCrits: [CRIT-001]
routeToPhase: 2a
---

# FIND-409 — REQ-001 "Loading set BEFORE invoke" test is observational, not order-asserting

## Citation
- `promptnotes/src/lib/ui/app-shell/__tests__/app-shell-state.test.ts:222-249`:
  ```typescript
  test("bootOrchestrator sets store to Loading during pending invoke", async () => {
    const statesObserved: AppShellState[] = [];
    let resolvePromise!: (v: any) => void;

    const slowAdapter: TauriAdapter = {
      invokeAppStartup: () => new Promise((resolve) => { resolvePromise = resolve; }),
      ...
    };

    const bootPromise = bootOrchestrator({ adapter: slowAdapter, isBootAttempted: false });

    const unsubscribe = appShellStore.subscribe((v) => statesObserved.push(v));
    expect(statesObserved[statesObserved.length - 1]).toBe("Loading");

    resolvePromise({ ok: true, value: mockInitialUIState as any });
    await bootPromise;

    unsubscribe();
    expect(statesObserved[statesObserved.length - 1]).toBe("Configured");
  });
  ```

## Description
The test claims to verify REQ-001 AC: "AppShellState は invoke 呼び出し前に 'Loading' に遷移する" (the state transitions to Loading BEFORE the invoke call).

What the test actually verifies:
1. `bootOrchestrator(...)` is called (line 233).
2. `appShellStore.subscribe(...)` is called AFTER bootOrchestrator (line 236).
3. Svelte's writable.subscribe() immediately emits the current value.
4. The captured value is `Loading` (line 239).

This is an observational test. It cannot distinguish between:
- (correct) `bootOrchestrator` set Loading SYNCHRONOUSLY before the first `await` → store is Loading when the test subscribes.
- (incorrect, hypothetical) `bootOrchestrator` immediately calls `invokeAppStartup()` (which never resolves), then later sets Loading → store is also Loading by the time the test subscribes.

In the second hypothetical, REQ-001 would be violated but the test would still pass.

To verify the order, the test should:
1. Subscribe to the store FIRST.
2. Capture the full sequence of emissions.
3. THEN call `bootOrchestrator(...)`.
4. Assert the sequence is `['Loading' (initial), 'Loading' (set by orchestrator)*, 'Configured' (after resolve)]` (the asterisk marks an optional duplicate emission depending on whether Svelte de-duplicates).
5. Critically, the test should also spy on `invokeAppStartup` and assert that it was NOT called before the second `Loading` emission. This is the only way to verify the BEFORE relationship.

## Suggested remediation
- Subscribe to the store before calling `bootOrchestrator`.
- Add a spy that records the timestamp of `invokeAppStartup` invocation; assert the corresponding "Loading" emission timestamp is earlier.
- Or: refactor `bootOrchestrator` to take a `beforeInvoke?: () => void` hook that the test can use to insert assertion code synchronously between `setAppShellState("Loading")` and `adapter.invokeAppStartup()`.
