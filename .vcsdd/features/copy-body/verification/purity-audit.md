# Purity Boundary Audit: copy-body

**Feature**: copy-body
**Phase**: 5
**Date**: 2026-05-01

## Declared Boundaries

Source: `specs/verification-architecture.md` §Purity Boundary Map.

| Sub-step | Function | Declared classification |
|----------|----------|------------------------:|
| 0 | `getCurrentNote` (infra) | Effectful |
| 1 | `bodyForClipboard(note)` | **Pure core** |
| 2 | `clipboardWrite(text)` | Effectful shell |
| 3 | `clockNow()` (success only) | Effectful (purity-violating) |
| 4 | `emitInternal(event)` (success only) | Effectful shell |

## Observed Boundaries

Direct inspection of `promptnotes/src/lib/domain/copy-body/`:

`body-for-clipboard.ts` — pure:

- Single line: `return note.body as unknown as string;`
- Zero ports, zero I/O, zero clock reads.
- PROP-001 (1000 fast-check runs) verifies referential transparency.
- PROP-002 verifies output equals `note.body` byte-for-byte.
- PROP-003 verifies sentinel-tag in frontmatter does not appear in output.

`pipeline.ts` — single effectful shell. The factory accepts a narrow
`CopyBodyDeps = Pick<CaptureDeps, "clockNow" | "clipboardWrite">` — the type
system **statically** prevents the pipeline from reaching `publish` or
`allocateNoteId` (Phase 3 FIND-003 fix).

I/O budget per invocation:

| Path | clipboardWrite | clockNow | emitInternal | publish | allocateNoteId | fs |
|------|---------------:|---------:|-------------:|--------:|---------------:|---:|
| Success | 1 | 1 | 1 | 0 (static) | 0 (static) | 0 |
| Clipboard failure | 1 | 0 | 0 | 0 (static) | 0 (static) | 0 |

`0 (static)` means enforced by the type system — the pipeline cannot reference
the omitted port at all. PROP-004 / PROP-005 verify the runtime-side counts.

## Summary

Observed boundaries match declared boundaries with no deviations. The pure core
(`bodyForClipboard`) is single-line and trivially verifiable; the effectful
shell (`pipeline.ts`) confines I/O to two explicit ports (`clockNow`,
`clipboardWrite`) and one infra callback (`emitInternal`). Phase 1b purity
design is fully realised.
