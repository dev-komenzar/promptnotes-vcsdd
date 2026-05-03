# FIND-014: REQ-002 Loading initial state is never specified — boot-time render is ambiguous

- **id**: FIND-014
- **severity**: major
- **dimension**: spec_fidelity

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:97` (AC: "`AppShellState` は `'Loading' | 'Configured' | 'Unconfigured' | 'StartupError' | 'UnexpectedError'` の判別可能ユニオン")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:83` (REQ-001 AC: "Pipeline 呼び出し中は loading インジケータを表示する（100ms 超の場合。REQ-018 参照）")

## description
The discriminated union includes a `Loading` variant, but no REQ specifies:
- That `Loading` is the initial value of `appShellStore` at module-import time.
- What is rendered while `AppShellState === 'Loading'` (REQ-001 AC mentions "loading indicator" but only conditionally on >100 ms; no REQ defines the indicator's appearance, ARIA semantics, or color tokens).
- The transition rule out of `Loading` (presumably arrival of `invoke_app_startup` result, but never stated).
- Whether `Loading` can re-occur (e.g. after `invoke_configure_vault` while waiting for re-scan).

REQ-001 alludes to "loading indicator" but neither REQ-010 (header), REQ-011 (main), nor REQ-012 (empty feed) describes the Loading-state layout. Two engineers will implement two different loading visuals — one a spinner over a blank canvas, another a skeleton mirroring REQ-012, another an overlay over the previous Configured state on re-entry.

## suggestedRemediation
Add a new REQ (or extend REQ-001) covering:
- "WHILE `AppShellState === 'Loading'` THE SYSTEM SHALL render only the global header (REQ-010) and a centered loading affordance with `role='status'` and `aria-busy='true'`. The main feed area SHALL be empty. The vault setup modal SHALL NOT be rendered."
- An ACL specifying the initial value of `appShellStore` is `'Loading'` and that the only legal transitions out of it are the four `routeStartupResult` outcomes (Configured / Unconfigured / StartupError / UnexpectedError).
- Whether `Loading` can re-occur after a configure-vault retry; if yes, name the trigger.
