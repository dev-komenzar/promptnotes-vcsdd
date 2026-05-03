---
sprintNumber: 2
feature: ui-app-shell
scope: "Sprint-2 rework: addresses all 14 findings from sprint-1 adversarial review (3 critical / 8 major / 3 minor). Covers boot-flag race condition fix, AppShellRouteResult corruptedFilesCount extension, Tauri command registration, focus trap, aria inert/hidden, error message population, IPC parameter rename, PROP-011 audit tightening, withIpcTimeout double-wrap elimination, store start/stop callback removal. No spec changes."
negotiationRound: 0
status: approved
criteria:
  - id: CRIT-001
    dimension: spec_fidelity
    description: REQ-001 — bootAttempted flag is set to true BEFORE the async IPC pipeline (FIND-201 fix). Concurrent re-entrant mount (Svelte strict-mode double-mount) receives suppressed result immediately without waiting for IPC.
    weight: 0.07
    passThreshold: loading-state.test.ts double-boot suppressed test passes; bootAttempted flag is set synchronously before first await; PROP-001 spy count === 1 on single mount.
  - id: CRIT-002
    dimension: spec_fidelity
    description: REQ-002 + REQ-009 — AppShellRouteResult carries corruptedFilesCount:number (FIND-202 fix). AppShell.svelte renders the corrupted-files banner with data-testid="corrupted-files-banner" when showCorruptedBanner===true.
    weight: 0.08
    passThreshold: startup-error-routing.test.ts showCorruptedBanner===true for length>=1, false for length===0 assertions pass 100%; CORRUPTED_BANNER_TESTID exported from componentTestIds.ts; AppShell.svelte renders banner in Configured state with corruptedFiles.length>0.
  - id: CRIT-003
    dimension: spec_fidelity
    description: REQ-003 + REQ-007 — Tauri commands fully registered (FIND-203 fix): try_vault_path, invoke_configure_vault, invoke_app_startup, settings_save, fs_stat_dir, fs_list_markdown, fs_read_file. All declared as private fn (no pub fn — avoids __cmd__ macro symbol duplication). FIND-214: invoke_configure_vault receives { path } not { vaultPath }.
    weight: 0.07
    passThreshold: cargo check passes with 0 errors on lib.rs; all 7 commands registered in tauri::generate_handler!; tauriAdapter.ts passes { path: vaultPath } parameter.
  - id: CRIT-004
    dimension: spec_fidelity
    description: REQ-016 + FIND-204 — VaultSetupModal implements focus trap: getFocusableElements() selects interactive non-disabled elements; Tab wraps from last→first; Shift+Tab wraps from first→last; Esc is prevented and not propagated.
    weight: 0.05
    passThreshold: VaultSetupModal.svelte contains getFocusableElements implementation; Tab/Shift+Tab keyboard handlers present; Esc preventDefault + stopPropagation present; vault-modal.test.ts focus trap assertions pass 100%.
  - id: CRIT-005
    dimension: edge_case_coverage
    description: REQ-004 + REQ-005 — FIND-207: VaultPathError variants are only empty and not-absolute (from Rust VaultPath::try_new). EC-04/EC-05: empty string and non-absolute path produce vault-path-error. EC-06: NUL-byte absolute path passes try_vault_path and produces vault-config-error from configure_vault (path-not-found). EC-17: permission-denied from configure_vault produces vault-config-error. No type confusion between VaultConfigError and VaultPathError shapes.
    weight: 0.06
    passThreshold: vault-modal.test.ts EC-04/EC-05/EC-06/EC-08/EC-17 assertions pass with correct error shapes and errorKind values; no as-any casts creating cross-type confusion.
  - id: CRIT-006
    dimension: edge_case_coverage
    description: REQ-005 + REQ-006 + FIND-210 — vaultModalLogic uses mapVaultPathError/mapVaultConfigError to populate errorMessage in modal state. onStateChange receives errorMessage field populated from the error mappers.
    weight: 0.06
    passThreshold: vaultModalLogic.ts imports and calls mapVaultPathError(vaultPathResult.error) and mapVaultConfigError(configureResult.error) when producing error modal states; vault-modal.test.ts errorMessage assertions pass 100%.
  - id: CRIT-007
    dimension: edge_case_coverage
    description: FIND-209 — AppShell.svelte main content (header/main) carries aria-hidden="true" and inert attribute when AppShellState is Unconfigured or StartupError, preventing AT users from navigating behind the modal.
    weight: 0.05
    passThreshold: AppShell.svelte source contains aria-hidden="true" and {#if state === "Unconfigured" || state === "StartupError"} inert guard on header/main elements; negative-scope.test.ts or startup-error-routing.test.ts verifies attribute presence.
  - id: CRIT-008
    dimension: implementation_correctness
    description: FIND-206 — PROP-010 timing tests use real wall-clock measurement: ipcResolvedAt timestamp captured inside the mock invokeAppStartup, storeSetAt captured after bootOrchestrator returns. Elapsed < 100ms is the invariant (not a fake-timer stub).
    weight: 0.05
    passThreshold: app-shell-state.test.ts PROP-010 three timing tests pass 100%; elapsed = storeSetAt - ipcResolvedAt < 100ms for both Unconfigured and StartupError paths; third test reads store value synchronously after boot and asserts Unconfigured.
  - id: CRIT-009
    dimension: implementation_correctness
    description: FIND-212 — ipc-timeout.test.ts late-arrival test subscribes to appShellStore, captures state sequence, verifies no "Configured" appears after last "UnexpectedError" when IPC resolves late. EC-18 test uses routeResult.state (not raw routeResult).
    weight: 0.05
    passThreshold: ipc-timeout.test.ts PROP-014 late-arrival test passes 100%; capturedStates.slice(lastIndexOf("UnexpectedError")+1).includes("Configured") === false assertion present and passing.
  - id: CRIT-010
    dimension: implementation_correctness
    description: FIND-213 — PROP-006 spacing audit regex covers all CSS property longhand forms: padding(-top/-right/-bottom/-left/-inline/-block), margin(-*), border-radius, gap, column-gap, row-gap, inset, font-size, line-height, top/left/right/bottom, width/height, min/max-width/height. Audit scans ALL px values per declaration (not first-match only). Self-test canary suite proves the audit catches violations it should catch.
    weight: 0.06
    passThreshold: design-tokens.audit.test.ts PROP-006 self-test suite (3 canary tests) passes 100%; broadened spacingPattern regex present; allPxValues scan covers all values per property.
  - id: CRIT-011
    dimension: structural_integrity
    description: FIND-205 + FIND-211 — PROP-011 audit tightened: effectful-isolation.test.ts now detects setAppShellState( calls (the indirection bypass) in addition to appShellStore.set( / .update(. ALLOWED_WRITERS set explicitly enumerates appShellStore.ts, bootOrchestrator.ts, vaultModalLogic.ts as permitted callers; any new caller is a violation.
    weight: 0.07
    passThreshold: effectful-isolation.test.ts PROP-011 audit test passes 100%; findAppShellStoreWrites scans for hasDirectWrite OR hasIndirectWrite; violations array === [].
  - id: CRIT-012
    dimension: structural_integrity
    description: FIND-208 — withIpcTimeout double-wrap eliminated. createTauriAdapter.invokeAppStartup no longer wraps with withIpcTimeout (bootOrchestrator owns the single timeout for invokeAppStartup). tryVaultPath and invokeConfigureVault still wrap. withIpcTimeout now calls clearTimeout in .finally() to prevent leaked sentinel timers.
    weight: 0.07
    passThreshold: tauriAdapter.ts createTauriAdapter.invokeAppStartup has no withIpcTimeout call; withIpcTimeout has .finally(() => clearTimeout(timerId)); ipc-timeout.test.ts EC-18 and PROP-014 tests pass 100%.
  - id: CRIT-013
    dimension: structural_integrity
    description: FIND-211 — appShellStore uses writable("Loading") with NO start/stop callbacks (removed). __resetForTesting__() export added to appShellStore for test isolation. __resetBootFlagForTesting__() export added to bootOrchestrator for boot flag reset in tests. Affected tests updated to call reset hooks where shared module state would corrupt assertions.
    weight: 0.07
    passThreshold: appShellStore.ts contains writable<AppShellState>("Loading") with no start function argument; __resetForTesting__ export present; bootOrchestrator.ts __resetBootFlagForTesting__ export present; PROP-010 third test (store value after boot === Unconfigured) passes 100%; PROP-012 getBootAttempted()===false test passes 100%.
  - id: CRIT-014
    dimension: verification_readiness
    description: All 14 sprint-1 findings (FIND-201 through FIND-214) have corresponding implementation or test changes. Every finding's routeToPhase is addressed: phase-2a findings (FIND-206/207/212/213) have updated test files; phase-2b findings (FIND-201/202/203/204/209/210/214) have updated source files; phase-2c findings (FIND-205/208/211) have structural refactors.
    weight: 0.07
    passThreshold: Evidence logs sprint-2-red-phase.log, sprint-2-green-phase.log, sprint-2-refactor.log all present with target-feature-tests:PASS markers; all 14 FIND-XXX IDs appear in at least one of the three evidence logs; 211 app-shell tests green.
  - id: CRIT-015
    dimension: verification_readiness
    description: REQ-019 + PROP-006 — all existing token coverage from sprint-1 CRIT-015 is maintained. 211 app-shell tests pass (up from 203 in sprint-1 due to new test coverage for 14 findings). Regression baseline for non-app-shell tests unchanged.
    weight: 0.07
    passThreshold: design-tokens.audit.test.ts passes 100% with the broadened regex; full suite 1225 pass (8 pre-existing fc.stringOf failures in domain harnesses unrelated to ui-app-shell); all PROP-001 through PROP-014 exercised in their test files.
  - id: CRIT-016
    dimension: spec_fidelity
    description: All 14 findings are closed. No new findings introduced by sprint-2 changes. The structural refactors (FIND-205/208/211) do not introduce regressions in the tests that were green in sprint-1.
    weight: 0.07
    passThreshold: Sprint-2 adversarial review returns 0 findings; test count is 211 pass 0 fail for ui-app-shell; non-app-shell test count is unchanged from baseline.
---

# Sprint 2 Contract — ui-app-shell

This contract captures 16 acceptance criteria (CRIT-001..CRIT-016) for the sprint-2 rework addressing all 14 findings from the sprint-1 adversarial review.

Sprint-1 adversarial review (2026-05-03, iter-1) returned FAIL with 14 findings (3 critical / 8 major / 3 minor). This sprint addresses them in the order 2a → 2b → 2c without modifying specs (behavioral-spec.md and verification-architecture.md are unchanged).

Green phase completed: 211 tests pass across 14 files (260 expect() calls). Phase 2c refactors maintained 211 green tests.

---

## CRIT-001

**Underlying REQ**: REQ-001, FIND-201.

**Fix**: `bootAttempted = true` set synchronously before the first `await` in bootOrchestrator. Concurrent re-entrant call with `isBootAttempted: true` returns current store value without invoking IPC.

**Test files**: `loading-state.test.ts`, `app-shell-state.test.ts`.

---

## CRIT-002

**Underlying REQ**: REQ-002, REQ-009, FIND-202.

**Fix**: `AppShellRouteResult` type gains `corruptedFilesCount: number`; `routeStartupResult` computes it from `Array.isArray(corruptedFiles) ? corruptedFiles.length : 0`; `AppShell.svelte` renders corrupted-files banner from the route result.

**Test files**: `startup-error-routing.test.ts`.

---

## CRIT-003

**Underlying REQ**: REQ-003, REQ-007, FIND-203, FIND-214.

**Fix**: `lib.rs` fully implements all 7 Tauri commands as private `fn`. `tauriAdapter.ts` passes `{ path: vaultPath }` to `invoke_configure_vault`.

**Source files**: `promptnotes/src-tauri/src/lib.rs`, `promptnotes/src/lib/ui/app-shell/tauriAdapter.ts`.

---

## CRIT-004

**Underlying REQ**: REQ-016, FIND-204.

**Fix**: `VaultSetupModal.svelte` gains `bind:this={modalEl}`, `getFocusableElements()` helper, Tab/Shift+Tab keyboard wrap logic, and Esc preventDefault + stopPropagation.

**Test files**: `vault-modal.test.ts`.

---

## CRIT-005

**Underlying REQ**: REQ-004, REQ-005, FIND-207.

**Fix**: `vault-modal.test.ts` EC-04/EC-05/EC-06/EC-08/EC-17 tests use correct VaultPathError and VaultConfigError shapes without cross-type `as any` casts.

**Test files**: `vault-modal.test.ts`.

---

## CRIT-006

**Underlying REQ**: REQ-005, REQ-006, FIND-210.

**Fix**: `vaultModalLogic.ts` imports `mapVaultPathError` and `mapVaultConfigError` and populates `errorMessage` in the `onStateChange` callback for both error paths.

**Source files**: `promptnotes/src/lib/ui/app-shell/vaultModalLogic.ts`.

---

## CRIT-007

**Underlying REQ**: REQ-016 (a11y), FIND-209.

**Fix**: `AppShell.svelte` adds `aria-hidden="true"` and `inert` to header/main elements when state is Unconfigured or StartupError.

**Source files**: `promptnotes/src/lib/ui/app-shell/AppShell.svelte`.

---

## CRIT-008

**Underlying REQ**: REQ-018, PROP-010, FIND-206.

**Fix**: PROP-010 timing tests capture wall-clock timestamps (`ipcResolvedAt` inside mock, `storeSetAt` after boot) and assert elapsed < 100ms. Third test subscribes after boot and reads Unconfigured directly.

**Test files**: `app-shell-state.test.ts`.

---

## CRIT-009

**Underlying REQ**: REQ-022, PROP-014, FIND-212.

**Fix**: `ipc-timeout.test.ts` late-arrival test captures store state sequence and asserts no "Configured" after "UnexpectedError". EC-18 uses `routeResult.state`.

**Test files**: `ipc-timeout.test.ts`.

---

## CRIT-010

**Underlying REQ**: REQ-019, PROP-006, FIND-213.

**Fix**: `design-tokens.audit.test.ts` broadens `spacingPattern` regex to all CSS longhand forms; scans ALL px values per declaration; adds 3-test canary self-test suite.

**Test files**: `design-tokens.audit.test.ts`.

---

## CRIT-011

**Underlying REQ**: REQ-021, PROP-011, FIND-205.

**Fix**: PROP-011 audit detects both `appShellStore.set(` and `setAppShellState(` calls; ALLOWED_WRITERS explicitly permits the 5 known callers; any new caller triggers a violation.

**Test files**: `effectful-isolation.test.ts`.

---

## CRIT-012

**Underlying REQ**: REQ-022, PROP-014, FIND-208.

**Fix**: `createTauriAdapter.invokeAppStartup` no longer wraps with `withIpcTimeout`; `bootOrchestrator` is the single wrap point. `withIpcTimeout` adds `clearTimeout` in `.finally()`.

**Source files**: `promptnotes/src/lib/ui/app-shell/tauriAdapter.ts`, `promptnotes/src/lib/ui/app-shell/bootOrchestrator.ts`.

---

## CRIT-013

**Underlying REQ**: REQ-020, REQ-021, FIND-211.

**Fix**: `appShellStore` uses `writable("Loading")` with no start/stop callbacks; `__resetForTesting__()` export added; `__resetBootFlagForTesting__()` added to bootOrchestrator; 3 test files updated to call reset hooks before state-sensitive assertions.

**Source files**: `promptnotes/src/lib/ui/app-shell/appShellStore.ts`, `promptnotes/src/lib/ui/app-shell/bootOrchestrator.ts`.

---

## CRIT-014

**Dimension**: verification_readiness. All 14 finding closures are documented in evidence logs.

**Evidence files**: `.vcsdd/features/ui-app-shell/evidence/sprint-2-red-phase.log`, `sprint-2-green-phase.log`, `sprint-2-refactor.log`.

---

## CRIT-015

**Dimension**: verification_readiness. Token coverage maintained. 211 app-shell tests green.

**Test files**: All 14 files in `src/lib/ui/app-shell/__tests__/`.

---

## CRIT-016

**Dimension**: spec_fidelity. Zero new findings introduced. 211 pass, 0 fail for ui-app-shell.

**Evidence**: `sprint-2-green-phase.log` full suite summary.
