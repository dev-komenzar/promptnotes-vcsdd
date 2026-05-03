# Verification Report — ui-app-shell

**Feature**: ui-app-shell
**Phase**: 5 (Formal Hardening)
**Mode**: strict
**Language**: TypeScript
**Sprint**: 4 (iter-4 PASS — entered Phase 5)
**Date**: 2026-05-03

---

## Proof Obligations

| ID | Tier | Required | Status | Test Path | Notes |
|----|------|----------|--------|-----------|-------|
| PROP-001 | 1 | true | proved | promptnotes/src/lib/ui/app-shell/__tests__/app-shell-state.test.ts | bun test 220 pass |
| PROP-002 | 0 | true | proved | promptnotes/src/lib/ui/app-shell/__tests__/negative-scope.test.ts | AST-style source audit passes |
| PROP-003 | 0 | true | proved | promptnotes/src/lib/ui/app-shell/__tests__/map-vault-path-error.test.ts | Exhaustive switch compile-time + runtime |
| PROP-004 | 2 | true | proved | promptnotes/src/lib/ui/app-shell/__tests__/prop/corrupted-banner.prop.test.ts | fast-check property test |
| PROP-005 | 2 | true | proved | promptnotes/src/lib/ui/app-shell/__tests__/prop/modal-closeable.prop.test.ts | fast-check property test |
| PROP-006 | 3 | true | proved | promptnotes/src/lib/ui/app-shell/__tests__/design-tokens.audit.test.ts | Style audit scan passes |
| PROP-007 | 1 | true | proved | promptnotes/src/lib/ui/app-shell/__tests__/route-startup-result.test.ts | All 5 routing paths verified |
| PROP-008 | 1 | true | proved | promptnotes/src/lib/ui/app-shell/__tests__/vault-modal.test.ts | configure-vault call-count assertions |
| PROP-009 | 1 | true | proved | promptnotes/src/lib/ui/app-shell/__tests__/app-shell-state.test.ts | scan error + IPC crash → UnexpectedError |
| PROP-010 | 1 | true | proved | promptnotes/src/lib/ui/app-shell/__tests__/app-shell-state.test.ts | Timing via runAllTimersAsync |
| PROP-011 | 0 | true | proved | promptnotes/src/lib/ui/app-shell/__tests__/effectful-isolation.test.ts | Static source-file audit |
| PROP-012 | 1 | true | proved | promptnotes/src/lib/ui/app-shell/__tests__/app-shell-state.test.ts | bootFlag reset verified |
| PROP-013 | 1 | true | proved | promptnotes/src/lib/ui/app-shell/__tests__/app-shell-state.test.ts | in-process re-mount suppression |
| PROP-014 | 1 | true | proved | promptnotes/src/lib/ui/app-shell/__tests__/ipc-timeout.test.ts | fake timers 30000ms → UnexpectedError |

---

## Test Execution Evidence

### Command
```
cd promptnotes && bun test src/lib/ui/app-shell/__tests__/
```

### Result
```
bun test v1.3.11 (af24e281)
 220 pass
 0 fail
 274 expect() calls
Ran 220 tests across 14 files. [1.99s]
```

---

## Per-PROP Results

### PROP-001: AppStartup invoked exactly once on single mount
- **Tool**: bun:test (Tier 1 integration test)
- **Test file**: `app-shell-state.test.ts`
- **Test**: "PROP-001: invokeAppStartup spy called exactly 1 time on bootAttempted=false"
- **Result**: VERIFIED — spy callCount === 1 on fresh boot; callCount === 0 when isBootAttempted=true
- **Status**: proved

### PROP-002: Brand types not constructed on TypeScript side
- **Tool**: bun:test (Tier 0 static source audit)
- **Test file**: `negative-scope.test.ts`
- **Tests**: PROP-002 / NEG-REQ-005 audit (source file scan for brand construction patterns outside designated boundary file)
- **Result**: VERIFIED — `@vcsdd-allow-brand-construction` exemption on `tauriAdapter.ts` correctly scoped; no unauthorised brand construction found
- **Status**: proved

### PROP-003: VaultPathError variant exhaustiveness
- **Tool**: bun:test (Tier 0 + runtime, TypeScript compiler)
- **Test files**: `map-vault-path-error.test.ts`, `vault-setup-modal.unit.test.ts`
- **Result**: VERIFIED — exhaustive switch with `never` fallthrough; both variants mapped to Japanese messages; compile-time protection active
- **Status**: proved

### PROP-004: shouldShowCorruptedBanner property
- **Tool**: fast-check v4 (Tier 2 property test)
- **Test file**: `prop/corrupted-banner.prop.test.ts`
- **Result**: VERIFIED — `shouldShowCorruptedBanner(arr) === (arr.length >= 1)` holds for 100+ runs with arbitrary arrays
- **Status**: proved

### PROP-005: isModalCloseable blocks overlay/esc
- **Tool**: fast-check v4 (Tier 2 property test)
- **Test file**: `prop/modal-closeable.prop.test.ts`
- **Result**: VERIFIED — overlay/esc → false for Unconfigured and StartupError states; success trigger → true
- **Status**: proved

### PROP-006: Design tokens from DESIGN.md allowlist only
- **Tool**: bun:test (Tier 3 static audit / source-file scan)
- **Test file**: `design-tokens.audit.test.ts`
- **Result**: VERIFIED — hex colors, rgba values, spacing px values, font weights all within DESIGN.md §10 Token Reference allowlists; all source files pass the scan
- **Status**: proved

### PROP-007: PathNotFound / PermissionDenied route correctly
- **Tool**: bun:test (Tier 1 unit tests)
- **Test file**: `route-startup-result.test.ts`
- **Result**: VERIFIED — all 5 AppStartupError paths (Ok→Configured, unconfigured→Unconfigured, path-not-found→StartupError, permission-denied→StartupError, scan/list-failed→UnexpectedError) produce correct AppShellState
- **Status**: proved

### PROP-008: Configuration persisted only after smart-constructor success
- **Tool**: bun:test (Tier 1 integration test)
- **Test file**: `vault-modal.test.ts`
- **Result**: VERIFIED — tryVaultPath failure → invokeConfigureVault call count = 0; tryVaultPath success → invokeConfigureVault call count = 1
- **Status**: proved

### PROP-009: scan error / IPC crash → banner, no modal
- **Tool**: bun:test (Tier 1 integration test)
- **Test file**: `app-shell-state.test.ts`
- **Result**: VERIFIED — scan error routes to UnexpectedError (no modal in that state); IPC crash routes to UnexpectedError; startup-error-routing.test.ts additionally verifies via static source scan that UnexpectedError renders banner not modal
- **Status**: proved

### PROP-010: Modal appears within 100ms of state determination
- **Tool**: bun:test with fake timers (Tier 1)
- **Test file**: `app-shell-state.test.ts`
- **Result**: VERIFIED — after bootOrchestrator resolves with Unconfigured/StartupError, the state is set synchronously (no deferred timer); runAllTimersAsync confirms modal is present within the same tick
- **Status**: proved

### PROP-011: appShellStore write isolation
- **Tool**: bun:test (Tier 0 static file audit)
- **Test file**: `effectful-isolation.test.ts`
- **Result**: VERIFIED — ALLOWED_WRITERS = {AppShell.svelte, VaultSetupModal.svelte, appShellStore.ts, vaultModalLogic.ts}; source scan finds no setAppShellState() calls outside that set; appShellStore.set/update removed from public interface (FIND-408)
- **Status**: proved

### PROP-012: bootFlag module-scoped, resets on HMR
- **Tool**: bun:test (Tier 1)
- **Test file**: `app-shell-state.test.ts`
- **Result**: VERIFIED — `bootFlag` not exported as writable symbol; `getBootAttempted()` returns false after `__resetBootFlagForTesting__()`; effectful-isolation.test.ts confirms source matches `/let\s+bootAttempted/` without export keyword
- **Status**: proved

### PROP-013: in-process re-mount suppressed by bootFlag
- **Tool**: bun:test (Tier 1)
- **Test file**: `app-shell-state.test.ts`
- **Result**: VERIFIED — mount→unmount→re-mount (same module instance, isBootAttempted=true on second call) produces invokeAppStartup call count = 1
- **Status**: proved

### PROP-014: IPC timeout after PIPELINE_IPC_TIMEOUT_MS → UnexpectedError
- **Tool**: bun:test with fake timers (Tier 1)
- **Test file**: `ipc-timeout.test.ts`
- **Result**: VERIFIED — never-resolving spy + `vi.advanceTimersByTimeAsync(30000)` → routeResult.state === "UnexpectedError"; late IPC resolution after timeout does not overwrite the error state
- **Status**: proved

---

## Summary

- Required obligations: **14**
- Proved: **14** (PROP-001, PROP-002, PROP-003, PROP-004, PROP-005, PROP-006, PROP-007, PROP-008, PROP-009, PROP-010, PROP-011, PROP-012, PROP-013, PROP-014)
- Failed: **0**
- Skipped: **0**

All 14 required proof obligations proved. Phase 6 convergence prerequisite satisfied.

### Tier Distribution

| Tier | Count | PROPs |
|------|-------|-------|
| 0 (type/lint) | 3 | PROP-002, PROP-003, PROP-011 |
| 1 (unit/integration) | 9 | PROP-001, PROP-007, PROP-008, PROP-009, PROP-010, PROP-012, PROP-013, PROP-014 |
| 2 (property/fast-check) | 2 | PROP-004, PROP-005 |
| 3 (audit-style) | 1 | PROP-006 |

### Notes on Tier 0 PROPs (PROP-002, PROP-003, PROP-011)

These PROPs are proved via static source-file audits implemented as bun:test cases in the `__tests__/` directory. The audits scan source files at test runtime using the Node.js `fs` module, replicating what a dedicated ESLint rule or AST lint would do. This approach was accepted by the adversary at iter-4 (Phase 3 PASS) as equivalent to the ESLint CI rule described in verification-architecture.md.

### Notes on PROP-010 (100ms modal timing)

Wall-clock measurement is CI-environment-dependent and unreliable. The test verifies that state transitions occur synchronously within the same event-loop tick after `bootOrchestrator` returns, using `runAllTimersAsync()`. This satisfies the spirit of REQ-018 (no deliberate delay inserted between state determination and modal render). The adversary accepted this approach at iter-4.
