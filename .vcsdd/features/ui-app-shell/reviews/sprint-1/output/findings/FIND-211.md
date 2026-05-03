---
id: FIND-211
severity: major
dimension: structural_integrity
category: purity_boundary
relatedReqs: [REQ-020, REQ-021]
relatedCrits: [CRIT-013]
routeToPhase: 2c
---

# FIND-211 — `appShellStore` resets to `'Loading'` on every subscribe/unsubscribe cycle

## Citation
- `promptnotes/src/lib/ui/app-shell/appShellStore.ts:28-35` — Svelte writable's start/stop callbacks force `set("Loading")` on first subscribe AND on last unsubscribe
- Comment lines 25-27 — "This provides test isolation when multiple test files share the same module instance (bun module cache)"

## Description
`writable<AppShellState>("Loading", (set) => { set("Loading"); return () => { set("Loading"); }; })` means: every time the subscriber count goes from 0 → 1, the store is forced to `"Loading"`, and every time it goes from 1 → 0 it is also forced to `"Loading"`. This is purely a test-hack workaround for cross-test pollution, but it leaks into production semantics:

1. In a real Svelte app, when `AppShell.svelte` mounts and is the first subscriber, the store is reset to `"Loading"` even if a previous module-level write had set it to `"Configured"` (e.g. through HMR carryover).
2. If transient unsubscribe events occur (component teardown), the store snaps back to `"Loading"` regardless of the actual application state.
3. REQ-020 requires `'Loading' → 'Loading'` transitions to be **suppressed** by `bootAttempted`. The start/stop callbacks bypass that contract entirely — they unconditionally set `Loading` without consulting any flag.
4. REQ-021's "writes must originate from the 2 svelte components" is violated: writes also originate from inside `appShellStore.ts` itself (the start/stop callbacks).

Production code should not be shaped by test isolation needs. The right fix is per-test module isolation (`vi.resetModules()`), not a global reset on subscribe.

## Suggested remediation
- Remove the start/stop reset callback from the writable. Use `writable<AppShellState>("Loading")` only.
- Achieve test isolation via `vi.resetModules()` (or `bun:test` equivalent) and/or by instantiating fresh adapter+store per test.
- Document in REQ-020 whether HMR-mid-state should reset to `Loading` and reflect that decision in the implementation, instead of having the side effect emerge from a Svelte writable's start function.
