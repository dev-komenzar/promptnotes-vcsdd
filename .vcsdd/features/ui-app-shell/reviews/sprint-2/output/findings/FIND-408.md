---
id: FIND-408
severity: medium
dimension: structural_integrity
category: purity_boundary
relatedReqs: [REQ-021]
relatedCrits: [CRIT-011, CRIT-013]
routeToPhase: 2c
duplicateOf: FIND-205
---

# FIND-408 — `appShellStore.set` / `.update` remain public; PROP-011 audit is detection-only, not prevention

## Citation
- `promptnotes/src/lib/ui/app-shell/appShellStore.ts:41-45`:
  ```typescript
  export const appShellStore = {
    subscribe: _store.subscribe,
    set: _store.set,
    update: _store.update,
  };
  ```
- `promptnotes/src/lib/ui/app-shell/appShellStore.ts:54-56`:
  ```typescript
  export function setAppShellState(state: AppShellState): void {
    _store.set(state);
  }
  ```
- Sprint-1 `FIND-205.md` lines 28-29 — recommended: "make the public store interface read-only by exporting `subscribe` only and exposing `set` through a token/capability passed at component init time."

## Description
The Sprint-1 FIND-205 finding pointed at two layered defects:
1. The audit pattern was too narrow (literal `appShellStore.set(`).
2. The store object exposed `set`/`update` directly, so any module can call them; the audit is the only safety net.

Sprint-2 fixed (1) by broadening the audit to also catch `setAppShellState(`. It did NOT fix (2). Confirmation:
- `appShellStore.set(...)` is still a public method.
- `appShellStore.update(...)` is still a public method.
- A new file `someNewWriter.ts` calling `appShellStore.set("Configured")` would fail the audit (good), but only if the audit is run AND only if the literal pattern matches. Variants like `const writer = appShellStore.set; writer("Configured")` or `appShellStore["set"]("Configured")` would slip past the substring matcher (`content.includes("appShellStore.set(")`).

The structural fix recommended by FIND-205 (capability-based access — return a `subscribe`-only object and pass the setter only to authorized constructors) was bypassed in favor of the easier audit-broadening. The audit closes the obvious literal hole but leaves the surface exposed.

This is downgraded to MEDIUM (not MAJOR) because the contract CRIT-011 explicitly accepted the audit-broadening approach and the audit does pass. The structural concern persists for future sprints.

## Suggested remediation
- Refactor `appShellStore.ts` to export only `{ subscribe }` from the public API. Move `set`/`update` access behind a capability function (e.g., `withStoreSetter(callback)`) that the audit easily verifies is only called from the two .svelte files (FIND-404 alignment).
- Or: merge with FIND-404 remediation. Update REQ-021 spec to permit `.ts` writers AND make the audit a CI lint that runs unconditionally (not just a test that may be skipped).
- Add an audit case for indirect access patterns: `appShellStore["set"]`, `Object.assign(appShellStore, ...)`, etc.
