# Purity Audit

## Feature: copy-body | Sprint: 3 | Date: 2026-05-07

## Declared Boundaries

From `specs/verification-architecture.md` Purity Boundary Map:

| Sub-step | Function | Declared Classification |
|----------|----------|------------------------|
| 0 | `getCurrentNote` (infra) | Effectful — reads Capture in-memory state |
| 1 | `bodyForClipboard(note)` | Pure core — total `Note → string`, no side effects |
| 2 | `clipboardWrite(text)` | Effectful shell — single I/O boundary (OS clipboard) |
| 3 (success) | `clockNow()` | Effectful — OS time read, success path only |
| 4 (success) | `emitInternal(NoteBodyCopiedToClipboard)` | Effectful shell — internal event bus publish |

Formally verifiable core: `bodyForClipboard`. All effectful operations are injected as ports or infra callbacks, never called directly from the pure core.

## Observed Boundaries

### body-for-clipboard.ts

File: `promptnotes/src/lib/domain/copy-body/body-for-clipboard.ts`

- Classification: **Pure core** — confirmed.
- No I/O: no file system, no network, no clipboard access.
- No `Date.now()`, no `Math.random()`, no `async`/`await`.
- No `console.log` / `console.error`.
- Single expression body: `return serializeBlocksToMarkdown(note.blocks)`.
- Reads only `note.blocks`. Does not access `note.frontmatter`, `note.id`, or any other field.
- Import: one static import from `../capture-auto-save/serialize-blocks-to-markdown.js` — no dynamic imports.
- Drift from declared boundary: **none**.

### pipeline.ts

File: `promptnotes/src/lib/domain/copy-body/pipeline.ts`

- Classification: **Effectful shell** — confirmed.
- All three effectful operations (`clipboardWrite`, `clockNow`, `emitInternal`) are injected as arguments; none are called directly from any module-level scope.
- Success path: `clipboardWrite` called once, then `clockNow` called once, then `emitInternal` called once. Matches PROP-004 I/O budget exactly.
- Failure path: `clipboardWrite` called once, function returns early. `clockNow` and `emitInternal` are not called. Matches PROP-005 I/O budget exactly.
- No `console.log` / `console.error`.
- No `Date.now()` / `Math.random()` / direct clock access. `clockNow` is the injected port.
- `CopyBodyDeps` = `Pick<CaptureDeps, "clockNow" | "clipboardWrite">` — correctly narrows CaptureDeps to the two ports actually used, as declared in verification-architecture.md.
- `CopyBodyPorts` = `CopyBodyDeps & CopyBodyInfra` — flat-ports convenience type, structurally correct.
- `makeCopyBodyPipeline` returns `(deps: CopyBodyDeps) => (state: EditingState) => Result<ClipboardText, SaveError>` — shape matches canonical `CopyBody` type modulo the `CopyBodyDeps` narrowing (structurally assignable from full `CaptureDeps`).
- Drift from declared boundary: **none**.

## Summary

No drift detected. The core/shell boundary is respected exactly as declared:

- `bodyForClipboard` is a single-expression pure function — it cannot acquire any effectful capability without being visibly changed.
- `pipeline.ts` injects all effects as ports; the ordering (clipboardWrite first, then clockNow+emitInternal only on success) matches the declared pipeline shape diagram.
- PROP-003(b) Proxy test (passing) independently confirms that `bodyForClipboard` does not touch `note.frontmatter` at runtime, providing behavioral evidence beyond static inspection.

No follow-up required before Phase 6.
