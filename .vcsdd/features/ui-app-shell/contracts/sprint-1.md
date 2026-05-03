---
sprintNumber: 1
feature: ui-app-shell
scope: UI shell layer wiring — AppStartup / configure-vault pipeline binding, AppShellState 5-variant state machine, global layout frame, VaultSetupModal, corrupted-files banner, Loading state, EFFECTFUL singleton isolation, IPC timeout policy; no domain pipeline reimplementation.
criteria:
  - id: CRIT-001
    dimension: spec_fidelity
    description: REQ-001 — on onMount with bootAttempted===false the system sets bootAttempted=true, transitions AppShellState to Loading, and invokes invoke_app_startup exactly once. Covers the single-mount contract and the IPC-reject fallback to UnexpectedError.
    weight: 0.07
    passThreshold: PROP-001 proved (app-shell-state.test.ts + loading-state.test.ts passes 100%); spy call count === 1 on single mount; AppShellState is Loading before spy resolves.
  - id: CRIT-002
    dimension: spec_fidelity
    description: REQ-002 — all 5 AppStartupError routing paths (Ok→Configured, unconfigured→Unconfigured, path-not-found→StartupError, permission-denied→StartupError, scan→UnexpectedError) and the IPC-crash path (→UnexpectedError) produce the correct AppShellState transitions with no cross-wiring.
    weight: 0.08
    passThreshold: PROP-007 proved (route-startup-result.test.ts 5-path coverage passes 100%); PROP-009 proved (startup-error-routing.test.ts banner/modal exclusivity passes 100%); all 6 routing paths asserted.
  - id: CRIT-003
    dimension: spec_fidelity
    description: REQ-003 + REQ-007 — VaultSetupModal renders and blocks interaction while AppShellState is Unconfigured or StartupError; it carries the correct pre-populated error message for path-not-found and permission-denied; overlay-click and Esc do not close it; data-testid attributes are present.
    weight: 0.07
    passThreshold: PROP-005 proved (modal-closeable.prop.test.ts fast-check passes 100 runs); vault-modal.test.ts REQ-003/REQ-007 assertions pass 100%; startup-error-routing.test.ts data-testid checks pass 100%.
  - id: CRIT-004
    dimension: spec_fidelity
    description: REQ-009 — corrupted-files warning banner is shown iff corruptedFiles.length >= 1; corruptedFiles.length === 0 or undefined/null shows no banner; count appears in banner text for length >= 1; data-testid="corrupted-files-banner" is present.
    weight: 0.05
    passThreshold: PROP-004 proved (corrupted-banner.prop.test.ts fast-check passes 100 runs); corrupted-banner.unit.test.ts REQ-009 AC assertions pass 100%.
  - id: CRIT-005
    dimension: edge_case_coverage
    description: REQ-004 + REQ-005 — picker-cancel suppresses invoke; double-submit isSaving flag blocks second invoke; VaultPathError.Empty maps to "フォルダを選択してください"; VaultPathError.NotAbsolute maps to "絶対パスを指定してください"; TypeScript side never constructs VaultPath (uses invoke('try_vault_path', { rawPath })).
    weight: 0.06
    passThreshold: PROP-003 proved (map-vault-path-error.test.ts exhaustive switch passes 100%); PROP-008 proved (vault-modal.test.ts configureVaultSpy===0 on failed try_vault_path passes 100%); EC-04, EC-05, EC-07, EC-08 assertions present.
  - id: CRIT-006
    dimension: edge_case_coverage
    description: REQ-006 — on invoke_configure_vault success invoke_app_startup is re-invoked (full pipeline); on invoke_configure_vault failure (path-not-found or permission-denied) modal stays open with error; Settings.save is never called from TypeScript; disk-full/lock/unknown FsErrors folded to path-not-found by configure-vault pipeline are processed by the same REQ-007 route (EC-19). No UnexpectedError transition occurs on configure-vault failure.
    weight: 0.07
    passThreshold: PROP-008 proved (vault-modal.test.ts configureVaultSpy===1 on successful try_vault_path; re-invocation spy call verified); EC-19 path asserted (Err({kind:'path-not-found'}) from configureVault shows modal error, not banner); no Settings.save call in TypeScript source.
  - id: CRIT-007
    dimension: edge_case_coverage
    description: REQ-008 + EC-01/EC-02/EC-03/EC-06/EC-13/EC-14/EC-15/EC-16/EC-17 — scan error and IPC crash both produce inline banner (not modal); broken-JSON Settings falls to unconfigured route (not path-not-found); symlink/OS_PATH_MAX/mid-NUL paths reach the VaultConfigError routing at the UI boundary; picker-then-revoke treated identically to permission-denied.
    weight: 0.07
    passThreshold: PROP-009 proved (startup-error-routing.test.ts data-testid="startup-error-banner" present and data-testid="vault-setup-modal" absent for scan and IPC-crash cases, passes 100%); EC-01 test asserts unconfigured route (not path-not-found); EC-13 IPC-crash assertion present.
  - id: CRIT-008
    dimension: implementation_correctness
    description: REQ-010 + REQ-011 + REQ-012 — global layout frame header (#ffffff bg, 1px solid rgba(0,0,0,0.1) border-bottom, 15px weight-600 title) and main area (<main> element, spacing values from [2,3,4,5,5.6,6,6.4,7,8,11,12,14,16,24,32]px only) and empty-feed skeleton (pulse #f6f5f4/#ffffff, border-radius 12px, aria-hidden) are all rendered when AppShellState===Configured.
    weight: 0.05
    passThreshold: PROP-006 (partial — header/main spacing tokens) proved via design-tokens.audit.test.ts and layout-frame.test.ts; REQ-010/REQ-011/REQ-012 assertions pass 100%; no spacing value outside permitted scale detected by audit.
  - id: CRIT-009
    dimension: implementation_correctness
    description: REQ-013 + REQ-017 — card surfaces apply the exact 4-layer Soft Card shadow (rgba(0,0,0,0.04/0.027/0.02/0.01)); VaultSetupModal applies the exact 5-layer Deep Card shadow; modal border-radius is 16px; no shadow layer opacity exceeds 0.04 on card surfaces.
    weight: 0.06
    passThreshold: PROP-006 proved (design-tokens.audit.test.ts shadow-value assertions pass 100%); layout-frame.test.ts box-shadow equality checks pass 100%; vault-modal.test.ts modal border-radius === 16px assertion passes.
  - id: CRIT-010
    dimension: implementation_correctness
    description: REQ-014 + REQ-015 — corrupted-files banner uses #dd5b00 accent, border-radius 8px, text 16px weight-500, Whisper Border; all text elements use only font-weight values from {400, 500, 600, 700}; no other weight values present in any component source.
    weight: 0.05
    passThreshold: PROP-006 proved (design-tokens.audit.test.ts typography weight assertions and #dd5b00 banner color check pass 100%); corrupted-banner.unit.test.ts REQ-014 AC assertions pass 100%.
  - id: CRIT-011
    dimension: implementation_correctness
    description: REQ-016 — while VaultSetupModal is open keyboard focus is trapped inside the dialog; Esc does not close it; overlay click does not close it; role="dialog" and aria-modal="true" are set; tabindex="-1" is present on the dialog container (WCAG).
    weight: 0.05
    passThreshold: PROP-005 fast-check (modal-closeable.prop.test.ts isModalCloseable(state,'overlay|esc')===false for {Unconfigured,StartupError} passes 100 runs); vault-modal.test.ts role/aria-modal/tabindex assertions pass 100%.
  - id: CRIT-012
    dimension: implementation_correctness
    description: REQ-018 + REQ-022 — modal appears within 100ms of Unconfigured/StartupError determination (vi.useFakeTimers); PIPELINE_IPC_TIMEOUT_MS===30000 is exported from tauriAdapter.ts; any pipeline IPC pending beyond 30000ms transitions to UnexpectedError; late-arriving IPC resolve after timeout does not overwrite UnexpectedError.
    weight: 0.06
    passThreshold: PROP-010 proved (app-shell-state.test.ts vi.useFakeTimers modal-within-100ms assertion passes); PROP-014 proved (ipc-timeout.test.ts vi.advanceTimersByTimeAsync(30000) banner assertion passes 100%; late-arrival test passes 100%).
  - id: CRIT-013
    dimension: structural_integrity
    description: REQ-020 + REQ-021 — appShellStore initial value is Loading (set at module import time before any invoke); the only legal transitions from Loading are to {Configured, Unconfigured, StartupError, UnexpectedError}; Loading→Loading is suppressed by bootFlag; appShellStore.set/update calls exist only in AppShell.svelte and VaultSetupModal.svelte; bootFlag is not exported; HMR module re-import resets bootFlag to false.
    weight: 0.08
    passThreshold: PROP-011 proved (effectful-isolation.test.ts + ESLint restrict-appshell-store-writes lint rule passes); PROP-012 proved (effectful-isolation.test.ts vi.resetModules() bootFlag===false assertion passes); loading-state.test.ts initial-Loading assertions pass 100%.
  - id: CRIT-014
    dimension: structural_integrity
    description: NEG-REQ-001/NEG-REQ-002/NEG-REQ-003/NEG-REQ-004/NEG-REQ-005 — no editor textarea, CopyNoteBody, RequestNewNote, feed-row rendering, ApplySearch, ApplyTagFilter, or branded value-object constructions (VaultPath/Body/Tag/Frontmatter/NoteId/VaultId/Timestamp) appear in feature source files. Test fixtures with @vcsdd-allow-brand-construction are the sole exception.
    weight: 0.08
    passThreshold: PROP-002 proved (ESLint no-brand-type-cast rule passes on all app-shell source files — negative-scope.test.ts AST-check assertions pass 100%); PROP-011 ESLint ArchTest passes; negative-scope.test.ts NEG-REQ-001..005 absence assertions pass 100%.
  - id: CRIT-015
    dimension: verification_readiness
    description: REQ-019 + all PROPs (PROP-001..014) — every hex literal and rgba value in Svelte components and TypeScript source files is in the DESIGN.md §10 Token Reference allowlist; every spacing px value is from [2,3,4,5,5.6,6,6.4,7,8,11,12,14,16,24,32]; all 14 PROPs are exercised by at least one test file with passing assertions; Tier-2 fast-check properties run ≥100 iterations each; Tier-3 audit script covers <style>, inline style={}, .ts files, and setProperty calls.
    weight: 0.10
    passThreshold: PROP-006 proved (design-tokens.audit.test.ts full-scope audit passes 100% — hex allowlist, rgba allowlist, spacing scale); PROP-004 + PROP-005 fast-check passes ≥100 runs each; all 203 ui-app-shell tests green (bun test 203 pass 0 fail per sprint-1-refactor.log); PROP-001+PROP-002+PROP-003+PROP-007+PROP-008+PROP-009+PROP-010+PROP-011+PROP-012+PROP-013+PROP-014 all exercised in their respective test files with 0 failures.
negotiationRound: 0
status: approved
---

# Sprint 1 Contract — ui-app-shell

This contract captures 15 acceptance criteria (CRIT-001..CRIT-015) derived from REQ-001..REQ-022, NEG-REQ-001..NEG-REQ-005, and PROP-001..PROP-014 as defined in `specs/behavioral-spec.md` Revision 3 and `specs/verification-architecture.md` Revision 3.

The spec passed Phase 1c adversarial review at iteration 3 (PASS, 2026-05-03, human override after FIND-024 inline-fix). Green phase completed with 203 tests passing across 14 files. Refactor phase (2c) maintained 203 green tests.

---

## CRIT-001

**Underlying REQ**: REQ-001 — startup orchestration, bootAttempted guard, Loading pre-transition.

**PROPs**: PROP-001 (single-mount invoke count === 1, Tier 1).

**Test files**: `app-shell-state.test.ts`, `loading-state.test.ts`.

**Out of scope**: HMR module-reload reset of bootFlag is covered separately by CRIT-013 / PROP-012.

---

## CRIT-002

**Underlying REQ**: REQ-002 — AppStartupError discriminated-union routing, all 5 paths + IPC-crash path.

**PROPs**: PROP-007 (all-5-path unit test, Tier 1), PROP-009 (scan/crash banner exclusivity, Tier 1).

**Test files**: `route-startup-result.test.ts`, `app-shell-state.test.ts`, `startup-error-routing.test.ts`.

**Out of scope**: Actual AppStartup pipeline implementation (app-startup feature boundary).

---

## CRIT-003

**Underlying REQ**: REQ-003 (modal render while Unconfigured/StartupError), REQ-007 (path-not-found / permission-denied pre-population).

**PROPs**: PROP-005 (overlay/esc never closes, Tier 2 fast-check), PROP-007 (routing, Tier 1).

**Test files**: `vault-modal.test.ts`, `startup-error-routing.test.ts`, `prop/modal-closeable.prop.test.ts`.

**Out of scope**: Configure-vault pipeline internals; note editor behind the modal.

---

## CRIT-004

**Underlying REQ**: REQ-009 — corrupted-files banner conditional rendering, count display, data-testid.

**PROPs**: PROP-004 (fast-check length >= 1 property, Tier 2).

**Test files**: `corrupted-banner.unit.test.ts`, `prop/corrupted-banner.prop.test.ts`.

**Out of scope**: REQ-014 (banner styling) is covered in CRIT-010.

---

## CRIT-005

**Underlying REQ**: REQ-004 (picker-cancel, double-submit guard, try_vault_path invocation), REQ-005 (VaultPathError variant message mapping, exhaustiveness).

**PROPs**: PROP-003 (exhaustive switch, Tier 0+1), PROP-008 (configureVault not called on failed tryVaultPath, Tier 1).

**Test files**: `map-vault-path-error.test.ts`, `vault-modal.test.ts`.

**Out of scope**: Rust VaultPath::try_new implementation; TypeScript VaultPath construction prohibition is covered by CRIT-014 / PROP-002.

---

## CRIT-006

**Underlying REQ**: REQ-006 — configure-vault success triggers invoke_app_startup re-invocation; configure-vault failure stays in modal (path-not-found, permission-denied, EC-19 folded FsError).

**PROPs**: PROP-008 (configureVault called exactly once after successful tryVaultPath, Tier 1).

**Test files**: `vault-modal.test.ts`.

**Out of scope**: Settings.save implementation is Rust-side; disk-full/lock/unknown FsError folding is configure-vault feature boundary (verified via contract reference only).

---

## CRIT-007

**Underlying REQ**: REQ-008 (inline banner, no modal, role="alert"), EC-01 (corrupted JSON→unconfigured), EC-02 (path-not-found), EC-03 (permission-denied), EC-06 (NUL byte→path-not-found), EC-13 (IPC crash), EC-14 (symlink), EC-15 (OS_PATH_MAX), EC-16 (mid-NUL), EC-17 (picker-then-revoke).

**PROPs**: PROP-009 (scan/crash banner+modal exclusivity, Tier 1).

**Test files**: `startup-error-routing.test.ts`, `app-shell-state.test.ts`.

**Out of scope**: EC-20 (HMR mid-flight) is covered by CRIT-013 / PROP-012. EC-18 (timeout) is covered by CRIT-012 / PROP-014.

---

## CRIT-008

**Underlying REQ**: REQ-010 (header bar colors, typography), REQ-011 (main area, spacing scale), REQ-012 (empty-feed skeleton, pulse animation, aria-hidden).

**PROPs**: PROP-006 (design token audit — header/main spacing/skeleton values, Tier 3).

**Test files**: `design-tokens.audit.test.ts`, `layout-frame.test.ts`.

**Out of scope**: Feed note rows (NEG-REQ-002). Sidebar chips (NEG-REQ-004).

---

## CRIT-009

**Underlying REQ**: REQ-013 (4-layer Soft Card shadow stack), REQ-017 (5-layer Deep Card shadow stack, modal border-radius 16px).

**PROPs**: PROP-006 (shadow token values within DESIGN.md §2 allowlist, Tier 3).

**Test files**: `design-tokens.audit.test.ts`, `layout-frame.test.ts`, `vault-modal.test.ts`.

**Out of scope**: Shadow theming for dark mode (NFR-04 deferred).

---

## CRIT-010

**Underlying REQ**: REQ-014 (banner #dd5b00 accent, radius 8px, 16px weight-500, Whisper Border), REQ-015 (4-weight typography system: {400, 500, 600, 700} only).

**PROPs**: PROP-006 (typography weight + #dd5b00 color audit, Tier 3).

**Test files**: `design-tokens.audit.test.ts`, `corrupted-banner.unit.test.ts`.

**Out of scope**: Dark-mode color variants.

---

## CRIT-011

**Underlying REQ**: REQ-016 — VaultSetupModal focus trap (Tab loop, Shift+Tab), Esc disabled, overlay-click disabled, role="dialog", aria-modal="true", tabindex="-1" on container.

**PROPs**: PROP-005 (isModalCloseable false for overlay/esc when {Unconfigured,StartupError}, Tier 2 fast-check).

**Test files**: `vault-modal.test.ts`, `prop/modal-closeable.prop.test.ts`.

**Out of scope**: Focus trap library internals; screen-reader AT behavior is covered by aria attribute presence checks only.

---

## CRIT-012

**Underlying REQ**: REQ-018 (modal appears ≤100ms after state determination), REQ-022 (PIPELINE_IPC_TIMEOUT_MS===30000 exported constant, Promise.race pattern, late-arrival discard, EC-18).

**PROPs**: PROP-010 (100ms guard via vi.useFakeTimers, Tier 1), PROP-014 (30000ms timeout → UnexpectedError + late-arrival invariant, Tier 1).

**Test files**: `app-shell-state.test.ts`, `ipc-timeout.test.ts`.

**Out of scope**: Rust-side IPC cancellation (TypeScript late-arrival discard is client-only); network FS hang root cause diagnosis.

---

## CRIT-013

**Underlying REQ**: REQ-020 (Loading initial value, Loading render spec, valid transitions from Loading), REQ-021 (appShellStore write-authority restriction, bootFlag module-scope non-export, HMR reset semantics, EC-20).

**PROPs**: PROP-011 (write-authority ESLint lint, Tier 0), PROP-012 (bootFlag HMR reset via vi.resetModules, Tier 1), PROP-001 (single-mount count contributes to Loading gate).

**Test files**: `loading-state.test.ts`, `effectful-isolation.test.ts`, `app-shell-state.test.ts`.

**Out of scope**: Vite HMR plugin internals; actual file-watch triggers.

---

## CRIT-014

**Underlying REQ**: NEG-REQ-001 (no editor textarea / CopyNoteBody / RequestNewNote), NEG-REQ-002 (no feed-row render / RequestNoteDeletion / AddTagViaChip / RemoveTagViaChip), NEG-REQ-003 (no search box / ApplySearch), NEG-REQ-004 (no sidebar tag chips / ApplyTagFilter), NEG-REQ-005 (no branded value-object construction in TypeScript — VaultPath/Body/Tag/Frontmatter/NoteId/VaultId/Timestamp).

**PROPs**: PROP-002 (AST ESLint no-brand-type-cast, Tier 0), PROP-011 (store-write restriction covers NEG-REQ-005 cross-check, Tier 0).

**Test files**: `negative-scope.test.ts` (absence assertions for all NEG-REQ-001..005 symbols and brand-cast patterns).

**Out of scope**: Editor feature, feed feature, search feature, tag-filter feature (all are separate VCSDD features with their own pipelines).

---

## CRIT-015

**Underlying REQ**: REQ-019 — every hex and rgba color literal in all Svelte/TypeScript source files is from the DESIGN.md §10 Token Reference allowlist; every px spacing value is from [2,3,4,5,5.6,6,6.4,7,8,11,12,14,16,24,32].

**All PROPs**: PROP-001, PROP-002, PROP-003, PROP-004, PROP-005, PROP-006, PROP-007, PROP-008, PROP-009, PROP-010, PROP-011, PROP-012, PROP-013, PROP-014 — all exercised with passing assertions in the 203-test green suite.

**Test files**: `design-tokens.audit.test.ts` (PROP-006 full-scope audit), `prop/corrupted-banner.prop.test.ts` (PROP-004), `prop/modal-closeable.prop.test.ts` (PROP-005), and all other files listed in verification-architecture.md Traceability table.

**Out of scope**: SVG fill/stroke values in `assets/` (exempt per PROP-006 audit policy). Test fixture files under `__tests__/` (exempt).
