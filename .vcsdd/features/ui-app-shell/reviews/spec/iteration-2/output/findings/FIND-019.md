# FIND-019: EC-18 introduces a 30-second IPC timeout policy with no governing REQ — the timeout owner, user-visible state, and late-arrival semantics are unspecified

- **id**: FIND-019
- **severity**: major
- **dimension**: spec_fidelity

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:594` (EC-18: "ネットワーク FS が応答なし / タイムアウト (30 秒超) ... モーダルは表示せず `AppShellState` は `'Loading'` のまま。30 秒超過は `UnexpectedError` に遷移しインラインバナーを表示する（タイムアウト値は Tauri 側の設定に従う）")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:132-145` (REQ-001 — defines the invoke_app_startup invocation; no timeout clause)
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:271-280` (REQ-008 UnexpectedError EARS — only triggers on `kind:'scan'` or "Tauri IPC itself throws an unexpected error", not on timeout)
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:476-498` (REQ-020 Loading — does not bound the time spent in Loading)

## referenceCitation
- `.vcsdd/features/ui-app-shell/reviews/spec/iteration-1/output/findings/FIND-013.md:17` (iteration-1 explicit remediation request: "decide on a UI policy (e.g. 'after 5 s, show "still working..." affordance; after 30 s, surface an error banner') and tie it to a new REQ")

## description
The iteration-1 FIND-013 remediation requested a "tie it to a new REQ" for the network-FS hang scenario. The Builder added EC-18 with a 30-second policy but did NOT introduce a corresponding REQ. This leaves the policy unenforceable and underspecified:

1. **Timeout owner is undefined.** EC-18 says "タイムアウト値は Tauri 側の設定に従う". This pushes responsibility to "Tauri" without specifying:
   - Whether the timeout lives in `invoke_app_startup` (Rust side) or in the JavaScript adapter (`tauriAdapter.invokeAppStartup`).
   - Whether the timeout cancels the underlying I/O or merely surfaces an error to the UI while the I/O continues in the background.
   - The exact magnitude. "30 秒超" is an inequality bound but the policy then says "Tauri 側の設定" — the spec gives two timeout sources.
   - Whether the same timeout applies to `try_vault_path` and `invoke_configure_vault`, or only `invoke_app_startup`.

2. **No state transition rule.** EC-18 describes the transition to `UnexpectedError` but no REQ defines the trigger. REQ-008's EARS at line 272 lists exactly two triggers ("scan error" and "Tauri IPC itself throws an unexpected error"); a 30-second timeout is neither of those if the Promise simply remains pending. If the implementer chooses to convert pending → rejected via a synthetic `setTimeout`, that synthetic rejection then fires REQ-008's "IPC throws" branch — but that mechanism is invented at implementation time, not specified.

3. **PROP coverage is absent.** verification-architecture.md PROP-009 covers REQ-008's two listed triggers (scan error, IPC reject) but does NOT include a 30-second timeout property. The trace table at line 523 maps REQ-008 → PROP-009, but PROP-009's `it()` cases (lines 389-407) do not exercise the timeout path. So the new behavior in EC-18 has no proof obligation.

4. **Late-arrival semantics are undefined.** What happens if the IPC eventually resolves at t=35s after the timeout has already triggered the UnexpectedError state? Does the resolution overwrite UnexpectedError and route to (e.g.) Configured? Does it get dropped? EC-20 covers "HMR mid-flight" but not "post-timeout resolution".

5. **User-visible affordance during 0-30s is unspecified.** REQ-020 describes the Loading-state render contract but does not bound the time. EC-18 implies a continuous Loading state for up to 30s, which is bad UX (no progress affordance, no cancel, no informational nudge). The iteration-1 FIND-013 remediation explicitly suggested a "still working..." affordance at an intermediate threshold; the Builder skipped this entirely.

## suggestedRemediation
Add a new REQ (suggested REQ-022) with:

- EARS: WHEN `invoke_app_startup` (or `try_vault_path` / `invoke_configure_vault`) has been pending for longer than the configured boundary (suggest: hard-code 30000ms in the spec, or define `PIPELINE_IPC_TIMEOUT_MS = 30000` as a named constant) THEN the system SHALL transition `AppShellState` to `'UnexpectedError'` and SHALL render the inline banner per REQ-008.
- Acceptance Criterion: the timeout MUST be implemented client-side (in `tauriAdapter`, not in Rust) using `Promise.race` with a `setTimeout`-rejected sentinel, so that the timeout is observable by the UI even if the underlying IPC is non-cancellable.
- Acceptance Criterion: late-arrival resolutions (post-timeout success or post-timeout error) SHALL be discarded; the `'UnexpectedError'` state SHALL persist until the user takes a recovery action (e.g., reload).
- Update REQ-008's EARS to include "OR a pipeline IPC has remained pending beyond the configured timeout" as a third trigger.
- Add PROP-013 (Tier 1): integration test using `vi.useFakeTimers()` that submits a never-resolving spy and asserts the inline banner appears at exactly `T = 30000ms`.

Alternatively, if the Builder intends the timeout to live entirely on the Rust side (with the JS adapter merely awaiting the eventual rejection), the spec must say so explicitly and define how Tauri surfaces the timeout: a specific error variant on `AppStartupError`, or an IPC-level rejection, with PROP-013 still asserting the resulting UI state.

## introducedIn
iteration-2-revision (EC-18 and the 30-second policy did not exist in iteration-1; the Builder added the EC but skipped the corresponding REQ that iteration-1 FIND-013 explicitly requested)
