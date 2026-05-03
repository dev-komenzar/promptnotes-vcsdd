# FIND-002: REQ-002 does not specify an AppShellState for `scan` errors

- **id**: FIND-002
- **severity**: critical
- **dimension**: spec_fidelity

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:89-101` (REQ-002 EARS + ACs)
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:94` ("`Err({ kind:'scan', reason:{ kind:'list-failed' } })` → インラインバナーを表示する（REQ-008）")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:97` ("`AppShellState` は `'Loading' | 'Configured' | 'Unconfigured' | 'StartupError' | 'UnexpectedError'` の判別可能ユニオン")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:200-206` (REQ-008)
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:435` (EC-13: IPC crash → `AppShellState → UnexpectedError`)

## referenceCitation
- `.vcsdd/features/app-startup/specs/behavioral-spec.md:124` — `AppStartupError = { kind: 'config'; reason: VaultConfigError } | { kind: 'scan'; reason: ScanError }`. The `scan` arm is a real, non-optional error path defined by the dependency feature.

## description
REQ-002 enumerates the routing for `scan` errors as "render inline banner" but never specifies which `AppShellState` value the system transitions to. The discriminated union in line 97 lists `'UnexpectedError'`, and REQ-008 talks about "Unexpected error" / "inline banner", but REQ-002 line 94 maps `scan` errors to "REQ-008" without saying whether `AppShellState` becomes `UnexpectedError`, stays `Loading`, becomes a never-defined `ScanError`, or remains in some prior state. EC-13 only covers IPC failure → `UnexpectedError`, NOT pipeline-returned `scan` errors. As a result the AppShellState union is non-exhaustive against `AppStartupError` (a strict-mode review-checklist explicit failure mode: "Is the AppShellState discriminated union exhaustive against the AppStartupError types?"). Two engineers will pick different states (one will create `'ScanError'`, another will reuse `'UnexpectedError'`, another will keep `'Configured'`-with-banner), producing incompatible state machines across PROP-005 (`isModalDismissible`) and PROP-007 (`routeStartupResult`).

## suggestedRemediation
Add a row to REQ-002 explicitly mapping `Err({ kind:'scan', reason:{ kind:'list-failed' } })` to a named `AppShellState` (recommend either reusing `UnexpectedError` or introducing `ScanError`), then update the union in the AC at line 97, the EC table, PROP-005's enumeration in `verification-architecture.md:254`, and the routing table in PROP-007's tests so all five concrete `AppStartupError` shapes (unconfigured, path-not-found, permission-denied, list-failed, plus IPC-crash) have a fully-specified target state.
