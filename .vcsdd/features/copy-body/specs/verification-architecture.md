# Verification Architecture: CopyBody

**Feature**: `copy-body`
**Phase**: 1b
**Revision**: 2
**Sprint 3 revision** — block-based migration (sprint 2 baseline preserved unchanged where possible).
**Mode**: lean
**Source**:
- `docs/domain/workflows.md` Workflow 6
- `docs/domain/code/ts/src/capture/workflows.ts` (`CopyBody` type)
- `docs/domain/code/ts/src/capture/stages.ts` (`ClipboardText`)
- `docs/domain/code/ts/src/capture/ports.ts` (`CaptureDeps`, `ClipboardWrite`)
- `docs/domain/code/ts/src/capture/internal-events.ts` (`NoteBodyCopiedToClipboard`)
- `docs/domain/code/ts/src/shared/note.ts` (`NoteOps.bodyForClipboard` — JSDoc: "内部で `serializeBlocksToMarkdown(note.blocks)` を呼ぶ")
- `docs/domain/code/ts/src/shared/blocks.ts` (`SerializeBlocksToMarkdown` interface, `BlockParseError`)
- `docs/domain/code/ts/src/shared/errors.ts` (`SaveError`, `FsError`)
- behavioral-spec.md REQ-001 .. REQ-014

---

## Purity Boundary Map

| Sub-step | Function | Classification | Rationale |
|----------|----------|----------------|-----------|
| 0 | `getCurrentNote` (infra) | **Effectful** | Reads from in-memory Capture session — `EditingState → Note` |
| 1 | `bodyForClipboard(note)` | **Pure core** | Total `Note → string` derived via `serializeBlocksToMarkdown(note.blocks)`. Purity inherits from the serializer (capture-auto-save sprint provides the canonical reference impl). |
| 2 | `clipboardWrite(text)` | **Effectful shell** | Single I/O boundary — OS clipboard write |
| 3 (success only) | `clockNow()` | **Effectful (purity-violating)** | OS time read, gated to success path |
| 4 (success only) | `emitInternal(NoteBodyCopiedToClipboard)` | **Effectful shell** | Internal event bus publish |

**Formally verifiable core**: `bodyForClipboard`. Property-testable claims include determinism, serializer delegation equality, and frontmatter exclusion.

**Effectful shell**: `clipboardWrite` (always exactly once), `clockNow` and `emitInternal` (success path only).

**Pipeline shape**:

```
EditingState ─[getCurrentNote]→ Note ─[bodyForClipboard]→ string ─[clipboardWrite]→ Result<void, FsError>
                                                                                    │
                                                       success ┌────────────────────┘
                                                               ▼
                                          [clockNow] → Timestamp ─[emitInternal]→ ()
                                                               ▼
                                                    Ok(ClipboardText)
                                                       failure │
                                                               ▼
                                                    Err(SaveError.fs)
```

---

## Port Contracts

Port signatures match `docs/domain/code/ts/src/capture/ports.ts`. CopyBody uses a subset of `CaptureDeps`.

### Used by CopyBody

```typescript
// ── Clock ──────────────────────────────────────────────────────────────
/** Return the current wall-clock time. Purity-violating.
 *  Called at most once per CopyBody invocation, only on the success path.
 *  Source: ports.ts ClockNow. */
type ClockNow = () => Timestamp;

// ── Clipboard ──────────────────────────────────────────────────────────
/** Write text to the OS clipboard. Single write-I/O boundary for CopyBody.
 *  Source: ports.ts ClipboardWrite. */
type ClipboardWrite = (text: string) => Result<void, FsError>;
```

### NOT used by CopyBody

- `AllocateNoteId` — only AppStartup / NewNote workflows use this.
- `EventBusPublish` (the public-domain bus) — CopyBody emits an **internal** event, not a `PublicDomainEvent`.
- All `FileSystem.*` ports — CopyBody is a pure-leaning workflow with no FS interaction.

### Internal callbacks (NOT ports — supplied via `CopyBodyInfra`)

```typescript
type CopyBodyInfra = {
  /** Read the currently editing Note from Capture in-memory state. */
  readonly getCurrentNote: () => Note;

  /** Pure projection: Note → clipboard-ready body string.
   *  Internal implementation of NoteOps.bodyForClipboard. */
  readonly bodyForClipboard: (note: Note) => string;

  /** Internal Capture event bus emitter for NoteBodyCopiedToClipboard.
   *  Mirrors the TagInventoryUpdated pattern in capture-auto-save/pipeline.ts. */
  readonly emitInternal: (event: NoteBodyCopiedToClipboard) => void;
};
```

### Why an internal-event channel?

`NoteBodyCopiedToClipboard` is declared in `capture/internal-events.ts` and listed as `Internal` in `glossary.md` §4 / `domain-events.md` line 170. It is **not** a member of the `PublicDomainEvent` union (`shared/events.ts` line 139–151). `CaptureDeps.publish` is typed `(event: PublicDomainEvent) => void`, so it cannot accept this event without breaking the type. The architecture mirrors the precedent set in `capture-auto-save/pipeline.ts` (commit Sprint 4 / FIND-004), where `TagInventoryUpdated` is also an internal Capture event delivered via a separate `emitInternal` callback.

---

## Proof Obligations

| ID | Tier | Required | Statement | Verification | REQ |
|----|-----:|:--------:|-----------|--------------|-----|
| **PROP-001** | 1 | yes | `bodyForClipboard` is pure (deterministic, no observable side effects) | Property test (`fast-check`): repeated calls on the same `Note` return identical strings | REQ-002 |
| **PROP-002** | 1 | yes | `bodyForClipboard(note) === serializeBlocksToMarkdown(note.blocks)` for all valid Notes | Property test over block-shaped `arbitrary<Note>` (sprint 3 migrated arbitrary): compute `bodyForClipboard(note)` and `serializeBlocksToMarkdown(note.blocks)` independently, assert string equality. Cites `docs/domain/code/ts/src/shared/note.ts` JSDoc and `docs/domain/code/ts/src/shared/blocks.ts` `SerializeBlocksToMarkdown`. | REQ-002, REQ-013 |
| **PROP-003** | 1 | yes | Frontmatter exclusion — sentinel tag in `frontmatter.tags` does not appear in the returned string; additionally, `bodyForClipboard` does not access `note.frontmatter` at all (by construction, since it reads only `note.blocks`) | (a) Existing sentinel-tag test: build block-shaped `note` whose `frontmatter.tags = ["__SENTINEL_XYZ_42__"]` and `blocks` not containing the sentinel; assert sentinel absent from `bodyForClipboard(note)`. (b) Sprint-3 strengthening: pass a `Frontmatter` Proxy that throws on any property access as `note.frontmatter`; assert `bodyForClipboard` completes without the Proxy throwing — proving the function does not touch frontmatter. | REQ-002 |
| **PROP-004** | 1 | yes | I/O budget on success — exactly 1 `clipboardWrite`, exactly 1 `clockNow`, exactly 1 `emitInternal`, 0 other ports | Spy-based test: instrument `CaptureDeps` + infra, run `copyBody` on success, assert call counts | REQ-003, REQ-005, REQ-009, REQ-011 |
| **PROP-005** | 1 | yes | I/O budget on failure — exactly 1 `clipboardWrite`, 0 `clockNow`, 0 `emitInternal` | Spy-based test: stub `clipboardWrite` to return `Err(FsError)`, assert counts | REQ-004, REQ-009, REQ-011 |
| **PROP-006** | 0 | yes | `SaveError` exhaustiveness — only `kind: "fs"` is producible; the `validation` branch is unreachable | TypeScript exhaustiveness compile-check: `switch(err.kind) { case "fs": ...; case "validation": throw ... }` builds without error; runtime test enumerates `FsError` variants | REQ-010 |
| **PROP-007** | 1 | yes | Read-only invariant — input `EditingState`, `Note`, `Frontmatter` references are not mutated | Spy / structural-equality test: deep-freeze inputs (`Object.freeze`), run `copyBody`, assert no mutation throws | REQ-006 |
| **PROP-008** | 1 | yes | Empty and minimal block arrangements are copied through — `blocks === [{ id: <BlockId>, type: "paragraph", content: "" }]` and other minimal arrangements still produce `Ok(ClipboardText)` and emit the event (`<BlockId>` is any valid `BlockId`; generators construct fresh IDs per Block invariant 1) | Property test with minimal-block fixtures: `arbitrary<minimalBlocksNote>` using generators for `[{ id: <BlockId>, type: "paragraph", content: "" }]`, `[{ id: <BlockId>, type: "divider", content: "" }]`, whitespace-paragraph, etc. (existing harness file reused; *generators* change to construct `blocks`-shaped notes with full `{ id, type, content }` shapes). Assert `result.ok === true` and event published. | REQ-007 |
| **PROP-009** | 1 | yes | Pass-through fidelity — `result.value.text === bodyForClipboard(note)` and `result.value.noteId === state.currentNoteId` | Property test over arbitrary `(EditingState, Note)` pairs **constrained to `note.id === state.currentNoteId`** (REQ-012 caller precondition) | REQ-001, REQ-012 |
| **PROP-010** | 1 | yes | FsError pass-through — for each of 5 `FsError.kind` variants, `result.error.reason` equals the original error verbatim | Parameterized test enumerating all 5 variants | REQ-004, REQ-010 |
| **PROP-011** | 1 | yes | Serializer delegation — `bodyForClipboard(note)` produces output observationally equivalent to `serializeBlocksToMarkdown(note.blocks)` and the pipeline's `bodyForClipboard` port is invoked exactly once per `copyBody` call (lean-mode pragmatic equivalent of "exactly one call to the serializer with `note.blocks`") | Pair of sub-claims: (A) **DI port spy** — pipeline test passes a spied `bodyForClipboard` port via `CopyBodyInfra`; assert call count === 1 and called with the note returned by `getCurrentNote()`. (B) **Output equality at high replay count** — fast-check property over `arbitrary<Note>` (≥500 runs) asserts `bodyForClipboard(note) === serializeBlocksToMarkdown(note.blocks)`. Module-level mocking of the static `serializeBlocksToMarkdown` import is acceptable but not required in lean mode; the (A)+(B) pair pins the contract since the impl is a single-expression delegation. Artifact: `promptnotes/src/lib/domain/__tests__/copy-body/__verify__/prop-011-serializer-delegation.harness.test.ts`. | REQ-013, REQ-014 |
| **PROP-012** | 0 | yes | Pipeline shape — `makeCopyBodyPipeline` returns a function whose runtime/type signature matches the canonical `CopyBody` type modulo the narrowed `CopyBodyDeps`; the flat-ports `copyBody` is exported with the documented `CopyBodyPorts` shape; `EditingState` narrowing rejects non-editing states at the call site. | TypeScript exhaustiveness via `tsc --noEmit` plus a type-level test file (`pipeline-shape.types.test.ts` using `tsd` or inline `expectType` assertions) — no runtime assertion required. Artifact: `promptnotes/src/lib/domain/__tests__/copy-body/__verify__/prop-012-pipeline-shape.types.test.ts`. | REQ-008 |

### Tier definitions

- **Tier 0** — Type-level / compile-time only (TypeScript exhaustiveness, never branch). No runtime test required.
- **Tier 1** — Property-based or spy-based runtime tests with `fast-check` (≥100 runs default, ≥1000 for purity claims).
- **Tier 2** — Mutation testing or fuzz-with-coverage (not required at lean mode).
- **Tier 3** — Formal proof (not required at lean mode).

Lean mode chooses Tier 0/1 only. All twelve props are required because the pipeline is small enough that complete coverage is cheap. (Sprint 3 adds PROP-011 and PROP-012; PROP count increased from 10 to 12.)

---

## Test Harness Layout

Tests live under `promptnotes/src/lib/domain/__tests__/copy-body/`:

```
copy-body/
  pipeline.test.ts                    # REQ-001, REQ-006, REQ-007, REQ-009, REQ-010, REQ-011 (integration)
  body-for-clipboard.test.ts          # REQ-002, REQ-013 (unit)
  __verify__/
    prop-001-body-for-clipboard-purity.harness.test.ts
    prop-002-body-equals-note-body.harness.test.ts          # sprint 3: arbitrary uses blocks-shaped Note
    prop-003-frontmatter-exclusion.harness.test.ts          # sprint 3: + Proxy-based access check
    prop-004-success-io-budget.harness.test.ts
    prop-005-failure-io-budget.harness.test.ts
    prop-006-save-error-exhaustive.harness.test.ts
    prop-007-read-only-inputs.harness.test.ts
    prop-008-empty-body-copy.harness.test.ts                # sprint 3: generators use blocks fixtures
    prop-009-pass-through.harness.test.ts
    prop-010-fserror-pass-through.harness.test.ts
    prop-011-serializer-delegation.harness.test.ts          # NEW — sprint 3
    prop-012-pipeline-shape.types.test.ts                   # NEW — sprint 3 (type-level only, Tier 0)
```

Implementation lives under `promptnotes/src/lib/domain/copy-body/`:

```
copy-body/
  body-for-clipboard.ts   # pure helper (REQ-002, REQ-013); imports serializeBlocksToMarkdown
                          #   from ../capture-auto-save/serialize-blocks-to-markdown.js (sprint 3)
                          #   (cross-feature import — non-blocking finding; see Findings to Carry Forward)
  pipeline.ts             # makeCopyBodyPipeline + flat-ports copyBody (REQ-008)
```

---

## Type-Level Contracts

```typescript
// Canonical CopyBody (workflows.ts line 107–109)
export type CopyBody = (
  deps: CaptureDeps,
) => (state: EditingState) => Result<ClipboardText, SaveError>;

// Pipeline factory (this feature)
export function makeCopyBodyPipeline(
  infra: CopyBodyInfra,
): CopyBody;

// Flat-ports test convenience (mirrors capture-auto-save pattern)
export type CopyBodyPorts = Pick<CaptureDeps, "clockNow" | "clipboardWrite"> & CopyBodyInfra;

export function copyBody(
  ports: CopyBodyPorts,
): (state: EditingState) => Result<ClipboardText, SaveError>;
```

The `Pick<CaptureDeps, "clockNow" | "clipboardWrite">` makes explicit that CopyBody touches only those two `CaptureDeps` ports (REQ-003).

---

## Findings to Carry Forward

| Finding | Target Phase | Description |
|---------|--------------|-------------|
| `NoteBodyCopiedToClipboard` is internal-only | 1c review | Confirm the `emitInternal` separation is acceptable vs. extending `PublicDomainEvent`. Sprint precedent (`TagInventoryUpdated` in capture-auto-save) supports the chosen design. |
| `bodyForClipboard` should be exported as a Note-aggregate helper | post-MVP | The `NoteOps` interface declares it but no implementation file exists yet (no `note.ts` impl in `promptnotes/src/lib/domain/`). For MVP, implement locally under `copy-body/` and revisit in a future "Note aggregate consolidation" feature. |
| Sprint 3 / serializer source | post-sprint (non-blocking) | Cross-feature import from `capture-auto-save/serialize-blocks-to-markdown.ts` is the canonical source for the sprint 3 migration. Revisit in a "shared kernel utility" feature when more contexts need it (vault, curate, copy-body all require `serializeBlocksToMarkdown`). Tracked here as a non-blocking finding; no action required in sprint 3. |

---

## Acceptance Gate (Phase 1c, lean)

- All twelve PROPs above (PROP-001 through PROP-012) have a one-sentence verification plan stated in this document.
- Behavioral spec REQs are 1:1 covered by PROPs (no orphan REQs). REQ-008 is covered by PROP-012 (Tier 0, type-level). REQ-013 and REQ-014 added in sprint 3 are covered by PROP-002 and PROP-011 respectively.
- Adversary review (lean) checks for: missing edge cases, mismatched return types, inconsistent purity claims.
- No human approval required (lean mode default).
