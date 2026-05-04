---
findingId: FIND-002
severity: critical
dimension: structural_integrity
category: purity_boundary
targets:
  - promptnotes/src/lib/editor/EditorPane.svelte:62-83
  - promptnotes/src/lib/editor/EditorPane.svelte:174
  - promptnotes/src/lib/editor/EditorPane.svelte:180
routeToPhase: "2b"
---

# FIND-002: Injected DebounceTimer port is bypassed; component runs its own setTimeout loop

## Spec / contract requirement
- behavioral-spec.md §12 / RD-012: "On each `EditNoteBody` action received by the impure shell ... the shell calls `timerModule.cancelIdleSave(currentHandle)` ... computes ... `computeNextFireAt` ... calls `timerModule.scheduleIdleSave(fireAt - clock.now(), ...)`."
- sprint-2.md CRIT-002 / CRIT-011 / §2 `debounceTimer.ts`: "scheduleIdleSave(at, callback) computes delay = at - clock.now() and calls setTimeout(callback, delay) ... Reads computeNextFireAt from Sprint 1 to determine at."
- verification-architecture.md §2 effectful shell row for `timerModule.ts`: "Injected as a dependency so tests can substitute a fake."

The contract-level intent is unambiguous: the editor must schedule idle saves through the injected `DebounceTimer.scheduleIdleSave` so that the timer module is the single setTimeout owner and DOM tests can substitute a fake.

## Observed behaviour
`EditorPane.svelte` declares its own raw timer:

```ts
let idleSaveHandle: ReturnType<typeof setTimeout> | null = null;

function scheduleIdleSave(): void {
  if (idleSaveHandle !== null) {
    clearTimeout(idleSaveHandle);
    idleSaveHandle = null;
  }
  idleSaveHandle = setTimeout(() => {
    ...
    adapter.dispatchTriggerIdleSave('capture-idle');
  }, IDLE_SAVE_DEBOUNCE_MS);
}
```

The injected `timer: DebounceTimer` prop is never used to schedule:
- `handleInput` (line 174) calls the local `scheduleIdleSave()` — not `timer.scheduleIdleSave(...)`.
- `handleBlur` (line 180) calls `timer.cancel()`, but since nothing was ever scheduled via `timer.scheduleIdleSave`, this cancels a no-op.

## Why this matters
- The impure-shell purity boundary is violated structurally: the component-tier file owns raw `setTimeout`/`clearTimeout` instead of delegating. Phase 5's contract (sprint-2.md CRIT-014) audits the *pure* core for `setTimeout`, but the structural integrity check for the shell is that the timer module is the sole setTimeout owner per RD-012; that contract is broken.
- `computeNextFireAt` from Sprint 1 (the locked RD-019 signature) is never called from EditorPane. The component instead uses a fixed 2000ms delay regardless of `lastEditAt`/`lastSaveAt`/`nowMs`. PROP-EDIT-003 is not exercised by the runtime path.
- DOM tests that mock `timer.scheduleIdleSave` would not see any calls (there are none); the `EditorPane.idle-save.dom.vitest.ts` tests work only because vitest's fake timers patch the global `setTimeout` that the component bypasses through.

## Required remediation
- Replace the in-component `idleSaveHandle` / `scheduleIdleSave` / `cancelIdleSave` block with calls to the injected `timer.scheduleIdleSave(at, () => dispatch({ kind: 'IdleTimerFired', payload: { ... } }))`.
- Compute `at` via `computeNextFireAt({ lastEditAt: clock.now(), lastSaveAt, debounceMs: IDLE_SAVE_DEBOUNCE_MS, nowMs: clock.now() }).fireAt`.
- Add a DOM test that asserts `timer.scheduleIdleSave` is called on each `oninput` and `timer.cancel` is called on `onblur`.
