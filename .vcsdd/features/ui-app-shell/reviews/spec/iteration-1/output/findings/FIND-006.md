# FIND-006: PROP-005 / `isModalDismissible` semantics are backwards — modal is not even rendered when `Configured`

- **id**: FIND-006
- **severity**: major
- **dimension**: verification_readiness

## citation
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:61` (PROP-005: "モーダルは `Configured` 以外の状態では閉じられない")
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:241-260` (PROP-005 detailed statement and fast-check property)
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:114` (AC: "modal is rendered iff state is Unconfigured or StartupError")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:318` (REQ-016 EARS: "WHILE VaultSetupModal is open AND AppShellState !== 'Configured'")

## description
PROP-005 states that `isModalDismissible(state)` returns `true` iff `state === 'Configured'`. But the spec's REQ-003 AC1 establishes that the modal is **only rendered** when state is `Unconfigured` or `StartupError`; it is **never rendered** when state is `Configured`. So "dismissible when Configured" is vacuously true (you cannot dismiss something that does not exist), and the actual behavioral requirement that the spec wants to enforce — "while the modal is open, Esc and overlay-click MUST NOT close it" — is not what `isModalDismissible` measures. The property as written would compile-pass against an implementation where the modal close-button silently no-ops in every state, including `Configured`, and the test would still see `isModalDismissible('Configured') === true` because no actual close is attempted in that case. Additionally REQ-016's EARS uses the redundant guard `AppShellState !== 'Configured'`, which the AC for REQ-003 already implies. The pure helper does not actually verify the spec's intent (block close on overlay/Esc while in Unconfigured/StartupError).

## suggestedRemediation
Rename and refocus the helper to `isModalCloseable(state, trigger: 'overlay'|'esc'|'success')` (or similar) and assert: for `state ∈ {'Unconfigured', 'StartupError'}` the only close trigger that returns `true` is `'success'`; `'overlay'` and `'esc'` always return `false`. Update PROP-005's fast-check property to enumerate `(state, trigger)` pairs. Remove the redundant `AppShellState !== 'Configured'` guard from REQ-016's EARS clause.
