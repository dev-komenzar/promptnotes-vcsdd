# FIND-005: REQ-008 and REQ-018 have no PROP — strict mode requires every REQ to map to a proof obligation

- **id**: FIND-005
- **severity**: critical
- **dimension**: verification_readiness

## citation
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:148` (Trace table: REQ-008 → `—` for PROP)
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:153` (Trace table: REQ-018 → `—` for PROP)
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:200-206` (REQ-008 normative requirement for inline banner)
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:354-358` (REQ-018 normative 100ms timing requirement)

## description
The strict-mode 1c review checklist requires "every REQ has at least one PROP that verifies it (or an explicit reason it cannot be proof-bound)". The traceability table in `verification-architecture.md` lines 141–155 explicitly puts a `—` against REQ-008 (Unexpected error inline banner) and REQ-018 (modal-render-within-100ms). No replacement justification ("cannot be proof-bound because…") is given anywhere in the doc. REQ-018 in particular is a non-functional timing requirement with a hard 100ms bound, but the doc punts to a parenthetical "(timing assertion)" in the trace table — that is not a verification approach, and a 100ms wall-clock assertion in jsdom is flaky by construction.

## suggestedRemediation
- Introduce `PROP-009: scan-error and IPC-crash routing produces inline-banner state without opening modal`. Tier 1 unit test on `routeStartupResult` (or its scan-arm equivalent) plus a component test that asserts the banner element is present and the modal `dialog` is absent.
- Either (a) introduce `PROP-010: modal render latency ≤ 100ms` with a concrete verification approach (e.g. a synthetic benchmark in CI with explicit budget, or a Tier 3 perf-audit fixture), or (b) downgrade REQ-018 to a non-binding NFR with a written rationale in `verification-architecture.md` explaining why it is not proof-bound. Strict mode forbids leaving it unspecified.
