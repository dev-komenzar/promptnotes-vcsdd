# Security Hardening Report

## Feature: handle-save-failure | Sprint: 2 | Date: 2026-05-08

## Scope

Sprint-2 block migration: `pendingNextNoteId` renamed to `pendingNextFocus: { noteId, blockId }`.
`handle-save-failure` remains a pure state-transition workflow with no network I/O, no
file system access, no database access, and no subprocess execution. The security surface
consists of:

1. Input validation (precondition guard on `state.status`)
2. Cancel-switch secondary guard (`pendingNextFocus !== null`)
3. Event payload construction (no error propagation, no PII leakage, no pending focus constituent fields)
4. Type soundness (no `eval`, no dynamic code execution)

Sprint-2 specific concern: the new `PendingNextFocus.blockId` field must not appear in
emitted event payloads (PROP-HSF-008 extended scope).

---

## Tooling

| Tool | Status | Version | Notes |
|------|--------|---------|-------|
| semgrep | NOT INSTALLED | — | Not available in nix flake; pattern-based SAST skipped |
| bunx tsc --noEmit | AVAILABLE | TypeScript ~5.6.2 | Type-safety checks; PROP-HSF-005 and PROP-HSF-016 |
| Wycheproof | NOT APPLICABLE | — | No cryptographic operations in this feature |
| bun test (security assertions) | AVAILABLE | bun 1.3.11 | Event payload inspection, boundary guard tests |

Raw output: `security-results/tsc-noEmit-raw.txt`

---

## Findings

### 1. Input Validation — Precondition Guard

**Finding**: CLEAN

The `runHandleSaveFailurePipeline` function performs a runtime invariant check at entry:

```typescript
if ((state as { status: string }).status !== "save-failed") {
  return Promise.reject(makeInvariantViolatedError("state.status must be save-failed"));
}
```

PROP-HSF-019 (200 runs) confirms the guard fires before any side effect. Sprint-2
migration did not alter this guard.

### 2. Cancel-Switch Guard — Sprint-2 Field Rename

**Finding**: CLEAN

The cancel-switch secondary guard was updated from `state.pendingNextNoteId === null`
to `state.pendingNextFocus === null`:

```typescript
if (state.pendingNextFocus === null) {
  return Promise.reject(
    makeInvariantViolatedError("cancel-switch requires pendingNextFocus"),
  );
}
```

PROP-HSF-012 (example-based) and PROP-HSF-020 (200-run property) confirm the guard
fires before `Clock.now()` is called. No state transition or event emission occurs on
the invalid path. The field rename does not introduce a new bypass path.

### 3. Event Payload — No pendingNextFocus Leak (Sprint-2 Extended Scope)

**Finding**: CLEAN

Per REQ-HSF-008 and the sprint-2 extension of PROP-HSF-008: neither `pendingNextFocus`
nor its constituent `blockId` field may appear in emitted event payloads.

The two emitted events are:
- `RetrySaveRequested { kind, noteId, occurredOn }` — no `pendingNextFocus`, no `blockId`
- `EditingSessionDiscarded { kind, noteId, occurredOn }` — no `pendingNextFocus`, no `blockId`

These structures are constructed inline in `pipeline.ts` with no spread of `state` or
`pendingNextFocus`. Emit spy tests (PROP-HSF-008/009/010 in `pipeline.test.ts`) confirm
no extraneous fields in sprint-2 test runs.

`blockId` from `pendingNextFocus` is correctly threaded only into the resulting
`EditingState.focusedBlockId` (via `discard.ts`), not into event payloads.

### 4. No Error Propagation

**Finding**: CLEAN

`SaveFailedStage.error` remains excluded from all emitted event payloads (REQ-HSF-012).
The parameter is prefixed `_stage` in `pipeline.ts` to signal this is intentional. No
sprint-2 change affects this. PROP-HSF-008 payload inspection confirms.

### 5. No eval / No Dynamic Code Execution

**Finding**: CLEAN

Static review of all five source files (`pipeline.ts`, `retry.ts`, `discard.ts`,
`cancel-switch.ts`, `transitions.ts`) confirms no `eval()`, `new Function()`, dynamic
`import()`, template-literal-based command construction, or child process spawning.
Sprint-2 changes (blockId field threading in `discard.ts`, guard string update in
`pipeline.ts`) introduce no new dynamic code paths.

### 6. Type Safety — PROP-HSF-005 and PROP-HSF-016 (Tier 0)

**Finding**: CLEAN

`bunx tsc --noEmit` produces zero errors in any `handle-save-failure` file.

- PROP-HSF-005: Both `@ts-expect-error` annotations (`unknown-variant`, `defer-save`)
  suppress real TS errors, confirming `UserDecision` union is closed.
- PROP-HSF-016: `@ts-expect-error` on `PublicDomainEvent → emit` suppresses a real error,
  confirming `HandleSaveFailurePorts.emit` is typed to reject `PublicDomainEvent`.

Pre-existing tsc errors are all in unrelated modules (`app-startup`, `edit-past-note-start`,
`tag-chip-update`, `apply-filter-or-search`, `feed`). Exit code 2 reflects those;
`handle-save-failure` scope is CLEAN.

### 7. BlockId Threading — New Security-Relevant Path (Sprint-2)

**Finding**: CLEAN

The new `PendingNextFocus.blockId` value travels from `SaveFailedState.pendingNextFocus.blockId`
into `EditingState.focusedBlockId` via `discard.ts`. This is an in-memory value
propagation within the pure core: no serialization, no I/O, no external output.
The value is a branded `BlockId` type — it cannot be a raw string at the TypeScript
boundary without explicit coercion.

PROP-HSF-022 (1000-run fast-check property + 2 example tests + 2 pipeline tests)
confirms the blockId is correctly threaded and does not appear in emitted events.
No injection surface: the blockId arrives pre-typed from the application layer.

---

## Summary

No security findings for the `handle-save-failure` feature in sprint-2.

The block migration (pendingNextNoteId → pendingNextFocus) introduces one new value
path: `blockId` threading from pending focus into `EditingState.focusedBlockId`. This
path is pure in-memory, type-safe, and verified not to appear in event payloads. All
previously verified security properties remain intact.

Wycheproof is not applicable (no crypto). Semgrep was not available; the feature's
minimal surface area (5 TypeScript files, ~220 LOC total) combined with type-level and
property-based tests provides adequate security assurance for lean mode.

**Security gate: PASS**
