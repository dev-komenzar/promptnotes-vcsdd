# FIND-003: REQ-003 EARS WHILE-clause and ACs disagree on when the modal renders

- **id**: FIND-003
- **severity**: major
- **dimension**: spec_fidelity

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:106` (REQ-003 EARS: "WHILE `AppShellState === 'Unconfigured'`")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:114` (REQ-003 AC: "`AppShellState !== 'Unconfigured' && AppShellState !== 'StartupError'` のとき `VaultSetupModal` は DOM にレンダリングされない")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:181` (REQ-007 EARS routes `path-not-found` / `permission-denied` to `VaultSetupModal` while state is `StartupError`)

## description
REQ-003's EARS sentence trigger is `WHILE AppShellState === 'Unconfigured'`, but the immediately-following Acceptance Criterion declares the modal is rendered for **both** `Unconfigured` AND `StartupError`. REQ-007 separately mandates that `path-not-found` / `permission-denied` open the same `VaultSetupModal` while the state is `StartupError`. There are now two normative statements for "when does the modal render" — REQ-003's EARS, and REQ-003's AC1 — that contradict each other. An implementer following only the EARS would not render the modal during `StartupError`, breaking REQ-007. An implementer following only the AC1 would render it in two states, but the EARS would not have authorized the second case.

## suggestedRemediation
Rewrite REQ-003's EARS to read `WHILE (AppShellState === 'Unconfigured' OR AppShellState === 'StartupError') THE SYSTEM SHALL render the vault setup modal...`, OR merge REQ-003 and REQ-007 into a single "modal rendering" requirement whose EARS clause covers both states. Then remove the contradictory AC1 from REQ-003.
