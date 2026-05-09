# Verification Report

## Feature: copy-body | Sprint: 3 | Date: 2026-05-07

## Tool Versions

| Tool | Version |
|------|---------|
| bun | 1.3.11 |
| TypeScript (tsc) | 5.6.3 (via svelte-check) |
| fast-check | bundled via bun test harnesses |

## Proof Obligations

| ID | Tier | Required | Status | Tool | Artifact |
|----|------|----------|--------|------|---------|
| PROP-001 | 1 | true | proved | fast-check (bun test) | prop-001-body-for-clipboard-purity.harness.test.ts |
| PROP-002 | 1 | true | proved | fast-check (bun test) | prop-002-body-equals-note-body.harness.test.ts |
| PROP-003 | 1 | true | proved | fast-check + Proxy (bun test) | prop-003-frontmatter-exclusion.harness.test.ts |
| PROP-004 | 1 | true | proved | spy-based (bun test) | prop-004-success-io-budget.harness.test.ts |
| PROP-005 | 1 | true | proved | spy-based (bun test) | prop-005-failure-io-budget.harness.test.ts |
| PROP-006 | 0 | true | proved | tsc + runtime (bun test) | prop-006-save-error-exhaustive.harness.test.ts |
| PROP-007 | 1 | true | proved | Object.freeze + spy (bun test) | prop-007-read-only-inputs.harness.test.ts |
| PROP-008 | 1 | true | proved | fast-check blocks fixtures (bun test) | prop-008-empty-body-copy.harness.test.ts |
| PROP-009 | 1 | true | proved | fast-check (bun test) | prop-009-pass-through.harness.test.ts |
| PROP-010 | 1 | true | proved | parameterized (bun test) | prop-010-fserror-pass-through.harness.test.ts |
| PROP-011 | 1 | true | proved | DI port spy + fast-check >=500 runs (bun test) | prop-011-serializer-delegation.harness.test.ts |
| PROP-012 | 0 | true | proved | tsc --noEmit (svelte-check) | prop-012-pipeline-shape.types.test.ts |

## Results

### PROP-001: bodyForClipboard purity (determinism, no side effects)
- **Tool**: fast-check via bun test
- **Command**: `bun test src/lib/domain/__tests__/copy-body/__verify__/`
- **Result**: VERIFIED
- **Evidence**: 29 pass / 4 skip / 0 fail across 12 harness files (461 expect() calls)

### PROP-002: bodyForClipboard(note) === serializeBlocksToMarkdown(note.blocks)
- **Tool**: fast-check, blocks-shaped arbitrary (sprint 3 migration)
- **Result**: VERIFIED
- **Notes**: Arbitrary now constructs Note with `blocks: Block[]` shape; string equality assertion confirmed

### PROP-003: Frontmatter exclusion + Proxy access guard
- **Tool**: fast-check + Proxy-based access detection
- **Result**: VERIFIED
- **Notes**: (a) sentinel tag in frontmatter.tags absent from output; (b) Proxy on note.frontmatter throws on any property access — bodyForClipboard completed without triggering the Proxy, proving it only reads note.blocks

### PROP-004: I/O budget on success (1 clipboardWrite, 1 clockNow, 1 emitInternal)
- **Tool**: spy-based instrumentation
- **Result**: VERIFIED

### PROP-005: I/O budget on failure (1 clipboardWrite, 0 clockNow, 0 emitInternal)
- **Tool**: spy-based instrumentation, clipboardWrite stubbed to return Err
- **Result**: VERIFIED

### PROP-006: SaveError exhaustiveness (only kind:"fs" producible)
- **Tool**: Tier 0 tsc exhaustiveness + runtime enumeration
- **Result**: VERIFIED

### PROP-007: Read-only invariant (no input mutation)
- **Tool**: Object.freeze on all inputs
- **Result**: VERIFIED

### PROP-008: Empty and minimal block arrangements produce Ok(ClipboardText)
- **Tool**: fast-check with blocks-shaped minimal fixtures (sprint 3 generators)
- **Result**: VERIFIED
- **Notes**: Generators construct `{ id: BlockId, type: "paragraph"|"divider", content: "" }` shapes

### PROP-009: Pass-through fidelity (result.value.text === bodyForClipboard(note))
- **Tool**: fast-check over arbitrary (EditingState, Note) constrained to note.id === state.currentNoteId
- **Result**: VERIFIED

### PROP-010: FsError pass-through (all 5 kind variants)
- **Tool**: Parameterized test
- **Result**: VERIFIED

### PROP-011: Serializer delegation (DI port spy + output equality >=500 runs)
- **Tool**: fast-check (>=500 runs) + DI port spy
- **Result**: VERIFIED
- **Notes**: (A) spy confirms bodyForClipboard port called exactly once per copyBody invocation with the note returned by getCurrentNote(); (B) output equality confirmed over high replay count

### PROP-012: Pipeline shape (type-level, Tier 0)
- **Tool**: tsc via `bun run check` (svelte-check / TypeScript 5.6.3)
- **Command**: `bun run check 2>&1 | grep -i "copy-body"`
- **Result**: VERIFIED — zero errors in any copy-body file. All typecheck errors in the codebase belong to other features (app-startup, edit-past-note-start, handle-save-failure, feed); copy-body is clean.
- **Notes**: PROP-012 is `it.skip` at runtime by design (Tier 0 = compile-time only). The type-level assertions in `prop-012-pipeline-shape.types.test.ts` are verified by tsc with no errors in copy-body files.

## Full Suite Run

```
bun test src/lib/domain/__tests__/copy-body/__verify__/
  29 pass / 4 skip / 0 fail — 461 expect() calls — 12 files

bun test src/lib/domain/__tests__/copy-body/
  66 pass / 4 skip / 0 fail — 535 expect() calls — 14 files
```

No regression against sprint 2 baseline. The 4 skipped tests are the runtime stubs for PROP-012 (Tier 0 by design).

## Summary

**12/12 proof obligations satisfied** — all required PROPs proved under sprint 3 block-based arbitraries.

- Required obligations: 12
- Proved: 12
- Failed: 0
- Skipped: 0 (PROP-012 runtime it.skip is expected; type-level verification passed)
