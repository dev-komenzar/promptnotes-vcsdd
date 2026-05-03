# FIND-007: PROP-001 only verifies one half of REQ-001 (call count on success); the bootAttempted re-mount guard is unverified

- **id**: FIND-007
- **severity**: major
- **dimension**: verification_readiness

## citation
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:73` (REQ-001 EARS: "exactly once")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:76` (REQ-001 edge case: "コンポーネントが二重マウントされた場合（HMR など）: 起動フラグ（`bootAttempted` フラグ）で 2 回目の invoke を抑制する")
- `.vcsdd/features/ui-app-shell/specs/behavioral-spec.md:82` (REQ-001 AC: "`bootAttempted` フラグが立っている場合、再度 invoke しない")
- `.vcsdd/features/ui-app-shell/specs/verification-architecture.md:170-177` (PROP-001 detailed test: only mounts once and asserts `toHaveBeenCalledTimes(1)`)

## description
REQ-001 has two distinct behavioral commitments: (1) on a single mount, the pipeline is invoked exactly once; (2) on double-mount (HMR, StrictMode, Svelte HMR re-mount), the second invoke is suppressed. PROP-001's test code in `verification-architecture.md:171-177` only mounts once and asserts the count equals 1 — this passes trivially even if `bootAttempted` is never read. The re-mount suppression behavior is not covered by any PROP, leaving a verifiable AC unproved. Implementations that omit `bootAttempted` entirely would still pass PROP-001.

## suggestedRemediation
Split PROP-001 into two cases:
- PROP-001a: single mount → spy called once.
- PROP-001b: mount → unmount → mount → spy still called only once, OR concurrent double-mount → spy called only once (depending on which is the canonical Svelte test pattern in this project).
Update the trace table in `verification-architecture.md:141` to reference both. Add an explicit AC line in REQ-001 specifying which double-mount semantics are required (Svelte 5 doesn't have React-style StrictMode double invocation, so the relevant trigger is HMR re-mount; that should be named).
