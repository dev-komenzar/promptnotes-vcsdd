# Verification Architecture: EditPastNoteStart

**Feature**: `edit-past-note-start`
**Phase**: 1b
**Revision**: 4 (Sprint 2 — Block-Based Migration)
**Mode**: lean
**Source of truth**: `docs/domain/workflows.md` Workflow 3 (block-based revision), `docs/domain/code/ts/src/capture/stages.ts`, `docs/domain/code/ts/src/capture/workflows.ts`, `docs/domain/code/ts/src/capture/internal-events.ts`, `docs/domain/code/ts/src/capture/states.ts`, `docs/domain/code/ts/src/shared/events.ts`, `docs/domain/code/ts/src/shared/errors.ts`, `docs/domain/code/ts/src/shared/note.ts`, `docs/domain/code/ts/src/shared/blocks.ts`

---

## Revision 4 Changes (from Revision 3)

| Area | Revision 3 | Revision 4 |
|------|-----------|-----------|
| Purity boundary map | Pre-guard (effectful shell); `classifyCurrentSession(state, note)` | No pre-guard; `classifyCurrentSession(state, request: BlockFocusRequest)` — pure core with same-note detection inlined |
| Port contracts | `BlurSave(noteId, note, previousFrontmatter)`, `HydrateSnapshot(snapshot)` | `BlurSave` unchanged (previousFrontmatter still required); `HydrateSnapshot` replaced by `ParseMarkdownToBlocks(markdown)` — pure Shared Kernel function |
| `ClassifyCurrentSession` signature | `(EditingSessionState, Note \| null) → CurrentSessionDecision` | `(EditingSessionState, BlockFocusRequest) → CurrentSessionDecision` |
| `CurrentSessionDecision` union | 3 variants | 4 variants (adds `same-note`) |
| `SwitchError` shape | `pendingNextNoteId: NoteId` | `pendingNextFocus: { noteId, blockId }` |
| Proof obligations | 19 (PROP-EPNS-001..019) | Rewritten Sprint 2 set (PROP-EPNS-001..025) |
| PROP-EPNS-005 | `SwitchError` exhaustiveness with `pendingNextNoteId` | `SwitchError` exhaustiveness with `pendingNextFocus: { noteId, blockId }` |
| PROP-EPNS-013 | Clock budget (guard-inclusive) | Clock budget (no guard; classify is zero-clock; same totals) |
| New PROPs | — | PROP-EPNS-020 (BlockFocused carries noteId+blockId), PROP-EPNS-021 (NewSession.focusedBlockId = request.blockId), PROP-EPNS-022 (same-note → flush no-op), PROP-EPNS-023 (save-fail → pendingNextFocus shape), PROP-EPNS-024 (Clock counts), PROP-EPNS-025 (hydration via parseMarkdownToBlocks, architectural note) |

---

## Purity Boundary Map

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Step 1 | `classifyCurrentSession` | **Pure core** | Accepts `(EditingSessionState, BlockFocusRequest)`; returns `CurrentSessionDecision`; no ports, no side effects, deterministic. Includes same-note detection by comparing `request.noteId` to `state.currentNoteId`. Property-test and formal verification target. |
| Step 2a | `flushCurrentSession` (same-note path) | **Pure shell (no-op)** | Returns `FlushedCurrentSession { result: 'same-note-skipped' }` with zero I/O when decision is `same-note`. |
| Step 2b | `flushCurrentSession` (no-current path) | **Pure shell (no-op)** | Returns `FlushedCurrentSession { result: 'no-op' }` with zero I/O. |
| Step 2c | `flushCurrentSession` (empty path) | **Effectful shell** | Calls `Clock.now()` for `EmptyNoteDiscarded.occurredOn`; calls `emit(EmptyNoteDiscarded)`. |
| Step 2d | `flushCurrentSession` (dirty path) | **Effectful shell** | Invokes `CaptureAutoSave` blur save (I/O); emits `NoteFileSaved` or `NoteSaveFailed` on result. |
| Step 3a | `parseMarkdownToBlocks` (hydration) | **Pure core** | Shared Kernel pure function (`blocks.ts`); `string → Result<Block[], BlockParseError>`; deterministic; no ports. Called inside `startNewSession` for cross-note paths only. |
| Step 3b | `startNewSession` | **Effectful shell** | Calls `Clock.now()` exactly once; calls `emit(BlockFocused)`; may call `parseMarkdownToBlocks` (pure, but side-effect context). |

**Formally verifiable pure core**: `classifyCurrentSession`, `parseMarkdownToBlocks`.

**Effectful shell**: `flushCurrentSession` (empty/dirty paths), `startNewSession`, `emit` port.

**Architectural note — no pre-pipeline guard**: Revision 3 had an effectful pre-pipeline guard that short-circuited for same-note re-selection. Revision 4 eliminates this guard entirely. All same-note detection lives inside the pure `classifyCurrentSession`. This makes the full classification decision tree amenable to property-based testing without any effectful setup.

---

## Port Contracts

```typescript
// ── Clock ──────────────────────────────────────────────────────────────
/** Returns the current wall-clock time. Called ≤2 times per workflow invocation.
 *  Path-specific budgets:
 *    same-note: 1 (startNewSession only)
 *    no-current: 1 (startNewSession only)
 *    empty: 2 (flushCurrentSession for EmptyNoteDiscarded + startNewSession)
 *    dirty-success: 1 (startNewSession; CaptureAutoSave handles its own)
 *    dirty-fail: 1 (NoteSaveFailed.occurredOn in flushCurrentSession; startNewSession not reached)
 *  classifyCurrentSession: 0 (pure; no clock calls ever) */
type ClockNow = () => Timestamp;

// ── CaptureAutoSave (blur-save port) ──────────────────────────────────
/** Trigger a blur save for the current note. Invoked only when session is dirty (cross-note).
 *  Returns Ok(NoteFileSaved) on success or Err(SaveError) on failure.
 *  On success, NoteFileSaved carries blocks: ReadonlyArray<Block> and
 *  body: Body (= serializeBlocksToMarkdown(blocks)) per domain-events.md.
 *  previousFrontmatter is passed for TagInventory delta (from editing buffer).
 *  NOT called on same-note path. */
type BlurSave = (
  noteId: NoteId,
  note: Note,
  previousFrontmatter: Frontmatter | null,
) => Promise<Result<NoteFileSaved, SaveError>>;

// ── emit ───────────────────────────────────────────────────────────────
/** Publish an event to the event bus.
 *  Accepts both PublicDomainEvent and CaptureInternalEvent. */
type Emit = (event: PublicDomainEvent | CaptureInternalEvent) => void;

// ── NoteOps.isEmpty (for EditPastNoteStart scope) ─────────────────────
/** Pure predicate (narrow definition for EditPastNoteStart):
 *  Returns true iff blocks.length === 1 AND blocks[0].type === 'paragraph'
 *  AND isEmptyOrWhitespaceContent(blocks[0].content).
 *  Applied only to EditingState (not SaveFailedState) for cross-note classification.
 *  Source: note.ts NoteOps.isEmpty (spec interpretation for this workflow). */
type IsEmpty = (note: Note) => boolean;

// ── ParseMarkdownToBlocks (Shared Kernel pure fn) ─────────────────────
/** Parse Markdown body string → Block[]. Pure function (blocks.ts).
 *  Called inside startNewSession for cross-note hydration.
 *  Returns Result<Block[], BlockParseError>.
 *  Failure on pre-validated snapshots is treated as a contract violation.
 *  NOT called on the same-note path. */
type ParseMarkdownToBlocks = (
  markdown: string,
) => Result<ReadonlyArray<Block>, BlockParseError>;

// ── classifyCurrentSession (pure) ────────────────────────────────────
/** Pure function: (EditingSessionState, BlockFocusRequest) → CurrentSessionDecision.
 *  No ports. Referentially transparent. Includes same-note detection.
 *  SavingState and SwitchingState are not valid inputs; callers must guard.
 *  Source: workflows.ts ClassifyCurrentSession. */
type ClassifyCurrentSession = (
  current: EditingSessionState,
  request: BlockFocusRequest,
) => CurrentSessionDecision;
// where:
// type CurrentSessionDecision =
//   | { kind: 'no-current' }
//   | { kind: 'empty'; noteId: NoteId }
//   | { kind: 'dirty'; noteId: NoteId; note: Note }
//   | { kind: 'same-note'; noteId: NoteId; note: Note };
```

---

## Proof Obligations

| ID | Description | Covers REQ | Tier | Required | Tool |
|----|-------------|-----------|------|----------|------|
| PROP-EPNS-001 | `classifyCurrentSession` is pure: same `(EditingSessionState, BlockFocusRequest)` input always produces identical `CurrentSessionDecision` output | REQ-EPNS-007, REQ-EPNS-012 | 1 | **true** | fast-check (property: ∀ state & request, fn(state, request) deepEquals fn(state, request)) |
| PROP-EPNS-002 | `classifyCurrentSession(IdleState, request)` always returns `{ kind: 'no-current' }` regardless of `request.noteId` | REQ-EPNS-001, REQ-EPNS-007 | 1 | **true** | fast-check (property: ∀ idle state & any request, result.kind === 'no-current') |
| PROP-EPNS-003 | `classifyCurrentSession(EditingState, request)` with `request.noteId !== state.currentNoteId`: isEmpty(note) ↔ `'empty'`; !isEmpty(note) ↔ `'dirty'` | REQ-EPNS-002, REQ-EPNS-003, REQ-EPNS-007 | 1 | **true** | fast-check (property: isEmpty ↔ 'empty'; !isEmpty ↔ 'dirty' for cross-noteId requests) |
| PROP-EPNS-004 | `classifyCurrentSession(EditingState \| SaveFailedState, request)` with `request.noteId === state.currentNoteId` always returns `{ kind: 'same-note', noteId: state.currentNoteId, note }` | REQ-EPNS-005, REQ-EPNS-007 | 1 | **true** | fast-check (property: ∀ EditingState or SaveFailedState, request.noteId === state.currentNoteId → result.kind === 'same-note') |
| PROP-EPNS-005 | `SwitchError` type exhaustiveness: sole variant is `'save-failed-during-switch'`; `pendingNextFocus: { noteId, blockId }` shape is correct; switch over it covers all variants with a `never` branch | REQ-EPNS-011 | 0 | **true** | TypeScript type exhaustiveness (never branch in switch; structural type check on pendingNextFocus) |
| PROP-EPNS-006 | Happy path (no-current / idle): `BlockFocused` is emitted with `noteId === request.noteId` and `blockId === request.blockId`; no `EmptyNoteDiscarded`; no save I/O | REQ-EPNS-001, REQ-EPNS-009, REQ-EPNS-010 | 2 | false | Example-based test with emit spy and BlurSave stub (not called); verify emit spy captured BlockFocused with correct fields |
| PROP-EPNS-007 | Happy path (empty session, cross-note): `EmptyNoteDiscarded` emitted before `BlockFocused`; no save I/O; `FlushedCurrentSession.result === 'discarded'` | REQ-EPNS-002, REQ-EPNS-009, REQ-EPNS-010 | 2 | false | Example-based test with ordered emit spy |
| PROP-EPNS-008 | Happy path (dirty session, save succeeds, cross-note): `NoteFileSaved` emitted before `BlockFocused`; `FlushedCurrentSession.result === 'saved'`; `NewSession.noteId === request.noteId` | REQ-EPNS-003, REQ-EPNS-010 | 2 | false | Example-based test with BlurSave stub returning Ok(NoteFileSaved) |
| PROP-EPNS-009 | Error path (dirty, save fails, cross-note): `SwitchError` returned; `NoteSaveFailed` emitted; `BlockFocused` NOT emitted; `EditingSessionState.status === 'save-failed'`; `pendingNextFocus === { noteId: request.noteId, blockId: request.blockId }` | REQ-EPNS-004 | 2 | false | Example-based test with BlurSave stub returning Err(SaveError) |
| PROP-EPNS-010 | Same-note path (EditingState): no flush I/O, no save, `EmptyNoteDiscarded` NOT emitted, `FlushedCurrentSession.result === 'same-note-skipped'`, `BlockFocused` emitted with `blockId === request.blockId` | REQ-EPNS-005 | 2 | false | Example-based test: request.noteId === state.currentNoteId; verify BlurSave not called; verify emit captures BlockFocused |
| PROP-EPNS-011 | Save-failed → cross-note request → save succeeds: `NewSession.noteId === request.noteId`; old `pendingNextFocus` discarded | REQ-EPNS-006 | 2 | false | Example-based test: SaveFailedState with prior pendingNextFocus, new cross-note request, save succeeds |
| PROP-EPNS-012 | Save-failed → cross-note request → save fails again: `SwitchError.pendingNextFocus === { noteId: request.noteId, blockId: request.blockId }` (overwriting prior pending) | REQ-EPNS-006 | 2 | false | Example-based test: SaveFailedState, cross-note request, save fails → SwitchError shape verified |
| PROP-EPNS-013 | `classifyCurrentSession(SaveFailedState, request)` with `request.noteId !== state.currentNoteId` always returns `{ kind: 'dirty', noteId: state.currentNoteId }` regardless of prior `pendingNextFocus` value | REQ-EPNS-006, REQ-EPNS-007 | 1 | false | fast-check (property: ∀ SaveFailedState & cross-noteId request, result.kind === 'dirty' ∧ result.noteId === state.currentNoteId) |
| PROP-EPNS-014 | Event ordering on empty path: `EmptyNoteDiscarded` strictly before `BlockFocused` | REQ-EPNS-002, REQ-EPNS-009 | 2 | false | Example-based test with ordered emit spy |
| PROP-EPNS-015 | Event ordering on dirty-success path: `NoteFileSaved` strictly before `BlockFocused` | REQ-EPNS-003, REQ-EPNS-010 | 2 | false | Example-based test with ordered emit spy |
| PROP-EPNS-016 | `EmptyNoteDiscarded` is a member of `PublicDomainEvent`; `BlockFocused` is a member of `CaptureInternalEvent` and is NOT a member of `PublicDomainEvent` | REQ-EPNS-009, REQ-EPNS-010 | 0 | false | TypeScript type assertion: Extract + _IsNever checks on the union types |
| PROP-EPNS-017 | Full workflow integration — all cross-note happy paths (no-current, empty, dirty-success) produce `EditingSessionState.status === 'editing'` with `currentNoteId === request.noteId` and `focusedBlockId === request.blockId` | REQ-EPNS-001 through REQ-EPNS-003, REQ-EPNS-008 | 3 | false | Integration test with port fakes |
| PROP-EPNS-018 | Same-note path in `SaveFailedState`: `BlockFocused` emitted, no save I/O, `SaveFailedState` status preserved (not cleared to `editing`) | REQ-EPNS-005 | 2 | false | Example-based test: SaveFailedState + request.noteId === currentNoteId → verify state.status still 'save-failed' after flush; verify BlockFocused emitted |
| PROP-EPNS-019 | `Clock.now()` is NEVER called inside `classifyCurrentSession` across all input variants | REQ-EPNS-007, REQ-EPNS-012 | 1 | false | fast-check / spy wrapper: instrument `Clock.now`; call classify with arbitrary inputs; assert spy call count === 0 |
| PROP-EPNS-020 | `BlockFocused` emitted on EVERY successful path carries `noteId === request.noteId` AND `blockId === request.blockId` | REQ-EPNS-010 | 1 | false | fast-check: generate arbitrary successful-path inputs; spy on emit; assert emitted BlockFocused fields match request on every path |
| PROP-EPNS-021 | `NewSession.focusedBlockId === request.blockId` on every successful path (no-current, empty, dirty-success, same-note) | REQ-EPNS-008 | 1 | false | fast-check: generate requests with arbitrary blockId; verify NewSession.focusedBlockId matches |
| PROP-EPNS-022 | `same-note` classification ⇒ `flushCurrentSession` returns `same-note-skipped` AND BlurSave port is NOT invoked | REQ-EPNS-005, REQ-EPNS-012 | 2 | false | Example-based test: same-noteId request; spy on BlurSave; verify not called; verify result.result === 'same-note-skipped' |
| PROP-EPNS-023 | Save-failure path: `SwitchError.pendingNextFocus` equals `{ noteId: request.noteId, blockId: request.blockId }` exactly; `SaveFailedState.pendingNextFocus` set to same value | REQ-EPNS-004, REQ-EPNS-011 | 2 | false | Example-based test: dirty path, BlurSave returns Err; verify SwitchError.pendingNextFocus shape; verify state.pendingNextFocus same |
| PROP-EPNS-024 | `Clock.now()` call counts per path match the budget table: same-note=1, no-current=1, empty=2, dirty-success=1, dirty-fail=1 | REQ-EPNS-008, REQ-EPNS-012 | 1 | false | fast-check / spy wrapper: run each path with instrumented Clock.now; assert call count per path |
| PROP-EPNS-025 | Architectural invariant: `startNewSession` for cross-note paths invokes `parseMarkdownToBlocks(snapshot.body)` to produce `Note.blocks`; same-note path does NOT call `parseMarkdownToBlocks` | REQ-EPNS-008 | 2 | false | Example-based test: spy on parseMarkdownToBlocks; cross-note path → spy called once; same-note path → spy not called. (Architectural verification; runtime observable via spy.) |

---

## Verification Tiers

- **Tier 0**: TypeScript type-level proof. No runtime test needed; the type system enforces it at compile time.
- **Tier 1**: Property-based test with fast-check. Generated random inputs; checks structural invariants.
- **Tier 2**: Example-based unit test. Concrete inputs and expected outputs; verifies specific behaviors.
- **Tier 3**: Integration test. Exercises the full pipeline with port fakes/stubs; tests cross-step coordination.

In lean mode, `required: true` is reserved for the highest-risk invariants:

- **PROP-EPNS-001** (`classifyCurrentSession` purity) — the entire pure/effectful boundary depends on this being side-effect-free. A mutable closure or hidden port call here would break the formally-verifiable core claim.
- **PROP-EPNS-002** (idle → no-current) — entry condition for the skip-flush fast path; misclassification causes spurious save I/O.
- **PROP-EPNS-003** (empty/dirty classification for cross-noteId) — determines whether blur save is triggered; wrong classification causes data loss (dirty treated as empty) or spurious I/O (empty saved).
- **PROP-EPNS-004** (same-noteId → same-note for EditingState/SaveFailedState) — data-safety claim: same-note movement must NEVER trigger save I/O. If this misclassifies, an auto-save fires on every cursor move between blocks, causing severe performance and data-coherence issues.
- **PROP-EPNS-005** (`SwitchError` exhaustiveness with `pendingNextFocus` shape) — ensures no unhandled error variant and that `pendingNextFocus.blockId` is always present; downstream `HandleSaveFailure` depends on `blockId` for resuming focus.

---

## Coverage Matrix

| Requirement | PROP IDs |
|-------------|---------|
| REQ-EPNS-001 | PROP-EPNS-002, PROP-EPNS-006, PROP-EPNS-017 |
| REQ-EPNS-002 | PROP-EPNS-003, PROP-EPNS-007, PROP-EPNS-014, PROP-EPNS-017 |
| REQ-EPNS-003 | PROP-EPNS-003, PROP-EPNS-008, PROP-EPNS-015, PROP-EPNS-017 |
| REQ-EPNS-004 | PROP-EPNS-009, PROP-EPNS-023 |
| REQ-EPNS-005 | PROP-EPNS-004, PROP-EPNS-010, PROP-EPNS-018, PROP-EPNS-022 |
| REQ-EPNS-006 | PROP-EPNS-011, PROP-EPNS-012, PROP-EPNS-013 |
| REQ-EPNS-007 | PROP-EPNS-001, PROP-EPNS-002, PROP-EPNS-003, PROP-EPNS-004, PROP-EPNS-013, PROP-EPNS-019 |
| REQ-EPNS-008 | PROP-EPNS-017, PROP-EPNS-021, PROP-EPNS-024, PROP-EPNS-025 |
| REQ-EPNS-009 | PROP-EPNS-006, PROP-EPNS-007, PROP-EPNS-016 |
| REQ-EPNS-010 | PROP-EPNS-006, PROP-EPNS-007, PROP-EPNS-008, PROP-EPNS-015, PROP-EPNS-016, PROP-EPNS-020 |
| REQ-EPNS-011 | PROP-EPNS-005, PROP-EPNS-023 |
| REQ-EPNS-012 | PROP-EPNS-001, PROP-EPNS-019, PROP-EPNS-022, PROP-EPNS-024 |

Every requirement has at least one proof obligation. Five `required: true` obligations (PROP-EPNS-001 through PROP-EPNS-005) cover the highest-risk invariants and span Tiers 0–1. Total proof obligations: 25 (PROP-EPNS-001 through PROP-EPNS-025).
