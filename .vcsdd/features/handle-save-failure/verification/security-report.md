# Security Hardening Report

## Feature: handle-save-failure | Sprint: 1 | Date: 2026-05-01

## Scope

`handle-save-failure` is a pure state-transition workflow with no network I/O, no file
system access, no database access, and no subprocess execution. The security surface is
limited to:

1. Input validation (precondition guard on `state.status`)
2. Event payload construction (no error propagation, no PII leakage)
3. Type soundness (no `eval`, no dynamic code execution)

---

## Tooling

| Tool | Status | Version | Notes |
|------|--------|---------|-------|
| semgrep | NOT INSTALLED | — | Not available in nix flake; pattern-based SAST skipped |
| bunx tsc --noEmit | AVAILABLE | TypeScript ~5.6.2 | Used for type-safety checks |
| Wycheproof | NOT APPLICABLE | — | No cryptographic operations in this feature |
| bun test (security assertions) | AVAILABLE | bun 1.3.11 | Event payload inspection tests |

Raw output: `security-results/tsc-noEmit-raw.txt`

Semgrep install command (if needed in future): `pip install semgrep` or via nix.

---

## Findings

### 1. Input Validation

**Finding**: CLEAN

The `runHandleSaveFailurePipeline` function performs a runtime invariant check at the
entry point before any computation:

```typescript
if ((state as { status: string }).status !== "save-failed") {
  return Promise.reject(makeInvariantViolatedError("state.status must be save-failed"));
}
```

This guard fires on all non-`save-failed` inputs, including deliberately-cast values.
Property test `PROP-HSF-019` (200 runs across all 4 non-`save-failed` status values)
confirms the guard is always triggered before any side effect occurs.

**No bypass path identified.**

### 2. Cancel-Switch Guard (secondary invariant)

**Finding**: CLEAN

The cancel-switch branch has a secondary guard:

```typescript
if (state.pendingNextNoteId === null) {
  return Promise.reject(makeInvariantViolatedError("cancel-switch requires pendingNextNoteId"));
}
```

This guard fires before `Clock.now()` is called. Property test `PROP-HSF-020` (200 runs)
confirms 0 Clock.now() calls on the invalid path. No state transition or event emission
occurs on the invalid path.

**No bypass path identified.**

### 3. Event Payload — No Error Propagation

**Finding**: CLEAN

Per REQ-HSF-012, `SaveFailedStage.error` must not appear in emitted event payloads.
Example-based tests (`PROP-HSF-008`, `PROP-HSF-009`, `PROP-HSF-010`) use emit spies
to confirm `"error" in event === false` for both `RetrySaveRequested` and
`EditingSessionDiscarded`. This prevents internal error details (file paths, error codes)
from leaking through the event bus to downstream consumers.

**No error field leakage detected.**

### 4. No eval / No Dynamic Code Execution

**Finding**: CLEAN

Static review of `pipeline.ts`, `retry.ts`, `discard.ts`, `cancel-switch.ts`, and
`transitions.ts` confirms:
- No `eval()` calls
- No `new Function()` usage
- No dynamic `import()` beyond static module loading
- No template-literal-based command construction
- No child process spawning

All five files are pure TypeScript modules with no runtime code generation.

### 5. No Injection Surface

**Finding**: CLEAN

The workflow accepts typed domain objects (`SaveFailedStage`, `SaveFailedState`,
`UserDecision`). These are not serialized from raw strings at the workflow boundary;
they arrive pre-typed from the application layer. No SQL, shell command, or template
interpolation occurs.

### 6. Type Safety (tsc --noEmit)

**Finding**: CLEAN (for handle-save-failure scope)

`bunx tsc --noEmit` produces zero errors in any `handle-save-failure` file.
The two errors reported by tsc are in `edit-past-note-start` (pre-existing, out of scope
for this feature). Full raw output is at `security-results/tsc-noEmit-raw.txt`.

The `HandleSaveFailurePorts.emit` type accepts only `CaptureInternalEvent`, not
`PublicDomainEvent`. This is enforced at the type level (PROP-HSF-016) with a
`@ts-expect-error` negative test in `tests/types/handle-save-failure.type-test.ts`.

---

## Summary

No security findings for the `handle-save-failure` feature.

The feature's attack surface is minimal: it is a pure in-process state machine with
typed ports (Clock and emit). Input validation is present and verified. Event payloads
carry no sensitive data and no error propagation. No dynamic code execution, injection
surface, or cryptographic operations exist.

Wycheproof is not applicable (no crypto). Semgrep was not available; given the minimal
surface area (5 pure TypeScript files, ~200 LOC total), manual review combined with
the existing type-level and property-based tests provides adequate security assurance
for lean mode.

**Security gate: PASS**
