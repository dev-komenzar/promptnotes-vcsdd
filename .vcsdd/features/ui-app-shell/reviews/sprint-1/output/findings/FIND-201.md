---
id: FIND-201
severity: critical
dimension: spec_fidelity
category: requirement_mismatch
relatedReqs: [REQ-001, REQ-021]
relatedProps: [PROP-001, PROP-012, PROP-013]
relatedCrits: [CRIT-001, CRIT-013]
routeToPhase: 2b
---

# FIND-201 — `bootAttempted` flag is never set to `true`; double-invoke suppression is broken in production

## Citation
- `promptnotes/src/lib/ui/app-shell/bootOrchestrator.ts:35` — `let bootAttempted = false;` (declared, never reassigned)
- `promptnotes/src/lib/ui/app-shell/bootOrchestrator.ts:43-45` — `getBootAttempted` always returns the immutable `false`
- `promptnotes/src/lib/ui/app-shell/AppShell.svelte:23-26` — `onMount` reads `getBootAttempted()` (always `false`), invokes `bootOrchestrator` with `isBootAttempted: false` every time
- `promptnotes/src/lib/ui/app-shell/bootOrchestrator.ts:73-79` — only the `if (isBootAttempted)` branch suppresses; nothing on the success/failure paths flips the flag

## Description
REQ-001 explicitly says: "the system SHALL set `bootAttempted = true`, transition `AppShellState` to `'Loading'`, and invoke the AppStartup pipeline exactly once". The implementation never assigns `bootAttempted = true` anywhere in the module. The flag begins life at `false` and remains `false` forever within a single module instance.

Consequences:
1. `getBootAttempted()` is a constant function that always returns `false`. The PROP-012 test "getBootAttempted() returns false on initial module load" passes vacuously — it would pass even if the flag never existed.
2. `AppShell.svelte` calls `getBootAttempted()` and passes the result as `isBootAttempted`. Because the result is always `false`, the `if (isBootAttempted)` early-return branch in `bootOrchestrator` (lines 73-79) is **unreachable in production**.
3. PROP-001 / PROP-013 (single-mount, in-process re-mount) are violated in production: an `onMount` re-run (HMR fast refresh, Svelte component re-instantiation, etc.) will re-invoke `invoke_app_startup` because nothing remembers that the boot already happened.
4. The PROP-013 test only passes because the test manually fabricates `isBootAttempted: true`; no test asserts that an `AppShell.svelte` mount actually toggles the flag.

The accompanying comment block (`bootOrchestrator.ts:32-35`, `:62-66`) claims "AppShell.svelte manages its own local bootAttempted tracking" but `AppShell.svelte` does no such tracking — it just calls `getBootAttempted()` and forwards.

## Suggested remediation
- Either set `bootAttempted = true` inside `bootOrchestrator` after the IPC fires, or expose a setter and have `AppShell.svelte` flip a real local variable that is then forwarded.
- Add a real integration test that mounts/remounts `AppShell.svelte` (requires `@testing-library/svelte`) and asserts `invokeAppStartup` is called exactly once across the lifecycle.
