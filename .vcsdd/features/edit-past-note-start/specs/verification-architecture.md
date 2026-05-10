---
coherence:
  node_id: "design:edit-past-note-start-verification"
  type: design
  name: "edit-past-note-start 検証アーキテクチャ（純粋性境界・証明義務）"
  depends_on:
    - id: "req:edit-past-note-start"
      relation: derives_from
    - id: "design:aggregates"
      relation: derives_from
    - id: "design:type-contracts"
      relation: derives_from
  modules:
    - "edit-past-note-start"
  source_files:
    - "promptnotes/src/lib/domain/__tests__/edit-past-note-start"
---

# Verification Architecture: EditPastNoteStart

**Feature**: `edit-past-note-start`
**Phase**: 1b
**Revision**: 7 (Sprint 2 — Phase 3 feedback bundled patch addressing FIND-EPNS-S2-P3-002/003 spec parts)
**Mode**: lean
**Source of truth**: `docs/domain/workflows.md` Workflow 3 (block-based revision), `docs/domain/code/ts/src/capture/stages.ts`, `docs/domain/code/ts/src/capture/workflows.ts`, `docs/domain/code/ts/src/capture/internal-events.ts`, `docs/domain/code/ts/src/capture/states.ts`, `docs/domain/code/ts/src/shared/events.ts`, `docs/domain/code/ts/src/shared/errors.ts`, `docs/domain/code/ts/src/shared/note.ts`, `docs/domain/code/ts/src/shared/blocks.ts`

---

## Revision 7 Changes (from Revision 6 — addressing FIND-EPNS-S2-P3-002 and FIND-EPNS-S2-P3-003 spec parts)

| Change | Detail |
|--------|--------|
| PROP-EPNS-018 scope clarification | PROP-EPNS-018 and PROP-EPNS-017 post-condition assertions are deferred to integration tests of the upstream `EditingSessionTransitions` reducer. The workflow unit tests assert only that `NewSession` is returned correctly and that `BlockFocused` is emitted; they do NOT assert `EditingSessionState` mutations (which are the reducer's responsibility). This is a documentation-only change — no proof obligations removed. |
| `hydrateSnapshot` purged | PROP-EPNS-027 description updated: stale port name `hydrateSnapshot` replaced with `parseMarkdownToBlocks` (matching implementation). |

## Revision 6 Changes (from Revision 5 — addressing FIND-EPNS-S2-R5-001)

FIND-EPNS-S2-R5-001 resolved by collapsing PC-001/PC-004 violations to `throw` (matches classifyCurrentSession convention from promptnotes/src/lib/domain/edit-past-note-start/classify-current-session.ts). `ContractViolationError` removed; `Result<NewSession, SwitchError>` return type preserved.

| Change | Detail |
|--------|--------|
| PROP-EPNS-027 rewritten | Now verifies that each precondition violation (PC-001 cross-note + null snapshot; PC-002 parse failure; PC-004 state/currentNote inconsistency) causes the workflow to `throw Error` (or the Promise to reject with `Error`), with no port invoked and no state mutation. `Err(ContractViolationError)` assertion removed. |
| Coverage matrix row REQ-EPNS-013 | Unchanged IDs; clarified that PROP-EPNS-027 now tests throw behavior, not Err return. |

---

## Revision 5 Changes (from Revision 4 — per findings FIND-EPNS-S2-001..008)

| Finding | Severity | Resolution |
|---------|----------|------------|
| FIND-EPNS-S2-001 | major | Port contract for `NoteOps.isEmpty` now references `shared/note.ts:174` directly. Removed "spec interpretation for this workflow" language. Added explicit note that `CaptureAutoSave`'s broader predicate is workflow-local and distinct. |
| FIND-EPNS-S2-002 | CRITICAL | `ClassifyCurrentSession` signature widened to `(state, request, currentNote)`. Purity boundary map updated. PROP-EPNS-001 re-anchored to the widened signature — purity claim is now structurally verifiable (all inputs explicit). |
| FIND-EPNS-S2-003 | CRITICAL | PROP-EPNS-010 and PROP-EPNS-018 updated to assert path-conditional `isDirty` preservation. Same-note acceptance criteria in PROPs now explicitly verify `isDirty` is NOT cleared. |
| FIND-EPNS-S2-004 | major | Port contract updated to reflect `EditPastNoteStartInput` struct. `BlurSave` `previousFrontmatter` is now sourced from explicit input field (not "side-channel"). Added `previousFrontmatter` traceability note. |
| FIND-EPNS-S2-005 | major | Added PROP-EPNS-026 (Tier 1, required:false): enumerative `SaveError → NoteSaveFailureReason` mapping. Coverage matrix updated. |
| FIND-EPNS-S2-006 | minor | Added PROP-EPNS-027 (Tier 2): precondition violation contract (cross-note + snapshot=null; state/currentNote inconsistency). References REQ-EPNS-013. |
| FIND-EPNS-S2-007 | minor | Added PROP-EPNS-028 (Tier 2): idempotent re-focus invariant. |
| FIND-EPNS-S2-008 | minor | PROP-EPNS-024 description updated to cite REQ-EPNS-004 acceptance criteria for dirty-fail clock call site derivation. |

---

## Revision 4 Changes (from Revision 3 — for historical reference)

| Area | Revision 3 | Revision 4 |
|------|-----------|-----------|
| Purity boundary map | Pre-guard (effectful shell); `classifyCurrentSession(state, note)` | No pre-guard; `classifyCurrentSession(state, request, currentNote)` — pure core with same-note detection inlined |
| Port contracts | `BlurSave(noteId, note, previousFrontmatter)`, `HydrateSnapshot(snapshot)` | `BlurSave` unchanged (previousFrontmatter still required); `HydrateSnapshot` replaced by `ParseMarkdownToBlocks(markdown)` — pure Shared Kernel function |
| `ClassifyCurrentSession` signature | `(EditingSessionState, Note \| null) → CurrentSessionDecision` | `(EditingSessionState, BlockFocusRequest, Note \| null) → CurrentSessionDecision` (Revision 5 delta) |
| `CurrentSessionDecision` union | 3 variants | 4 variants (adds `same-note`) |
| `SwitchError` shape | `pendingNextNoteId: NoteId` | `pendingNextFocus: { noteId, blockId }` |
| Proof obligations | 19 (PROP-EPNS-001..019) | Sprint 2 set: PROP-EPNS-001..025 (Rev 4), PROP-EPNS-001..028 (Rev 5) |

---

## Purity Boundary Map

| Step | Function | Classification | Rationale |
|------|----------|---------------|-----------|
| Step 1 | `classifyCurrentSession` | **Pure core** | Accepts `(EditingSessionState, BlockFocusRequest, Note \| null)`; returns `CurrentSessionDecision`; no ports, no side effects, deterministic. All inputs are explicit parameters — no external buffer access. Includes same-note detection by comparing `request.noteId` to `state.currentNoteId`. Property-test and formal verification target. |
| Step 2a | `flushCurrentSession` (same-note path) | **Pure shell (no-op)** | Returns `FlushedCurrentSession { result: 'same-note-skipped' }` with zero I/O when decision is `same-note`. |
| Step 2b | `flushCurrentSession` (no-current path) | **Pure shell (no-op)** | Returns `FlushedCurrentSession { result: 'no-op' }` with zero I/O. |
| Step 2c | `flushCurrentSession` (empty path) | **Effectful shell** | Calls `Clock.now()` for `EmptyNoteDiscarded.occurredOn`; calls `emit(EmptyNoteDiscarded)`. |
| Step 2d | `flushCurrentSession` (dirty path) | **Effectful shell** | Invokes `CaptureAutoSave` blur save (I/O); on success emits `NoteFileSaved`; on failure calls `Clock.now()` once and emits `NoteSaveFailed`. |
| Step 3a | `parseMarkdownToBlocks` (hydration) | **Pure core** | Shared Kernel pure function (`blocks.ts`); `string → Result<Block[], BlockParseError>`; deterministic; no ports. Called inside `startNewSession` for cross-note paths only. |
| Step 3b | `startNewSession` | **Effectful shell** | Calls `Clock.now()` exactly once; calls `emit(BlockFocused)`; may call `parseMarkdownToBlocks` (pure, but side-effect context). |

**Formally verifiable pure core**: `classifyCurrentSession`, `parseMarkdownToBlocks`.

**Effectful shell**: `flushCurrentSession` (empty/dirty paths), `startNewSession`, `emit` port.

**Architectural note — no pre-pipeline guard**: Revision 3 had an effectful pre-pipeline guard that short-circuited for same-note re-selection. Revision 4/5 eliminates this guard entirely. All same-note detection lives inside the pure `classifyCurrentSession`. This makes the full classification decision tree amenable to property-based testing without any effectful setup.

**Purity claim soundness (Revision 5)**: `classifyCurrentSession` is pure because ALL inputs — including `currentNote` — are now explicit parameters. The Revision 4 claim was unsound because `currentNote` was described as coming "from the editing buffer" (an external mutable source not in the parameter list). Revision 5 resolves this by widening the signature to include `currentNote: Note | null`. PROP-EPNS-001 is now structurally verifiable: fast-check can generate arbitrary `(state, request, currentNote)` tuples without needing to mock an external buffer.

---

## Port Contracts

```typescript
// ── EditPastNoteStartInput ─────────────────────────────────────────────
/** Explicit input struct for the EditPastNoteStart workflow (Revision 5).
 *  Replaces the implicit (current: EditingSessionState, request: BlockFocusRequest)
 *  pair with a named struct that makes currentNote and previousFrontmatter explicit. */
type EditPastNoteStartInput = {
  readonly request: BlockFocusRequest;
  readonly currentState: EditingSessionState;
  /** The Note currently in the in-memory editing buffer.
   *  null when currentState.status === 'idle'. Non-null for 'editing' and 'save-failed'.
   *  Passed directly to classifyCurrentSession as the third argument. */
  readonly currentNote: Note | null;
  /** The frontmatter recorded at session-start (before any in-session edits).
   *  Forwarded to BlurSave on the dirty cross-note path for TagInventory delta.
   *  null for idle state or when no prior save exists. */
  readonly previousFrontmatter: Frontmatter | null;
};

// ── Clock ──────────────────────────────────────────────────────────────
/** Returns the current wall-clock time. Called ≤2 times per workflow invocation.
 *  Path-specific budgets (anchored to REQ-EPNS-012 and REQ-EPNS-004):
 *    same-note: 1 (startNewSession only)
 *    no-current: 1 (startNewSession only)
 *    empty: 2 (flushCurrentSession for EmptyNoteDiscarded + startNewSession)
 *    dirty-success: 1 (startNewSession; CaptureAutoSave handles its own)
 *    dirty-fail: 1 (flushCurrentSession for NoteSaveFailed.occurredOn per REQ-EPNS-004;
 *                   startNewSession not reached)
 *  classifyCurrentSession: 0 (pure; no clock calls ever) */
type ClockNow = () => Timestamp;

// ── CaptureAutoSave (blur-save port) ──────────────────────────────────
/** Trigger a blur save for the current note. Invoked only when session is dirty (cross-note).
 *  Returns Ok(NoteFileSaved) on success or Err(SaveError) on failure.
 *  On success, NoteFileSaved carries blocks: ReadonlyArray<Block> and
 *  body: Body (= serializeBlocksToMarkdown(blocks)) per domain-events.md.
 *  previousFrontmatter is sourced from EditPastNoteStartInput.previousFrontmatter
 *  (passed for TagInventory delta; NOT a side-channel — it is an explicit input field).
 *  NOT called on same-note path.
 *  NOTE: BlurSave does NOT emit NoteSaveFailed. It returns Err(SaveError) to
 *  flushCurrentSession, which constructs NoteSaveFailed with a Clock.now() call. */
type BlurSave = (
  noteId: NoteId,
  note: Note,
  previousFrontmatter: Frontmatter | null,
) => Promise<Result<NoteFileSaved, SaveError>>;

// ── emit ───────────────────────────────────────────────────────────────
/** Publish an event to the event bus.
 *  Accepts both PublicDomainEvent and CaptureInternalEvent. */
type Emit = (event: PublicDomainEvent | CaptureInternalEvent) => void;

// ── NoteOps.isEmpty (canonical Shared Kernel function) ────────────────
/** Canonical predicate from shared/note.ts:174.
 *  Definition: blocks.length === 1 AND blocks[0].type === 'paragraph'
 *              AND isEmptyOrWhitespaceContent(blocks[0].content).
 *  Applied only to EditingState (not SaveFailedState) for cross-note classification.
 *  Source: NoteOps namespace in shared/note.ts — this is the single source of truth.
 *  NOTE: CaptureAutoSave uses its own workflow-local predicate (isEmptyOrWhitespaceContent)
 *  that is broader (multi-empty-paragraph, divider-only, etc.). That predicate is NOT
 *  NoteOps.isEmpty and does not affect this workflow's classification. */
type IsEmpty = (note: Note) => boolean;

// ── ParseMarkdownToBlocks (Shared Kernel pure fn) ─────────────────────
/** Parse Markdown body string → Block[]. Pure function (blocks.ts).
 *  Called inside startNewSession for cross-note hydration.
 *  Returns Result<Block[], BlockParseError>.
 *  Failure on pre-validated snapshots is a programming error (PC-002).
 *  On failure, implementation MUST throw — silently returning an empty Note is PROHIBITED.
 *  NOT called on the same-note path. */
type ParseMarkdownToBlocks = (
  markdown: string,
) => Result<ReadonlyArray<Block>, BlockParseError>;

// ── classifyCurrentSession (pure) ────────────────────────────────────
/** Pure function: (EditingSessionState, BlockFocusRequest, Note | null) → CurrentSessionDecision.
 *  Revision 5 signature (Type Contract Delta 1 from behavioral-spec.md).
 *  No ports. Referentially transparent. All inputs are explicit parameters.
 *  SavingState and SwitchingState are not valid inputs; callers must guard (PC-003).
 *  currentNote is null iff current state is IdleState.
 *  Source: workflows.ts ClassifyCurrentSession (pending contract update). */
type ClassifyCurrentSession = (
  current: EditingSessionState,
  request: BlockFocusRequest,
  currentNote: Note | null,
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
| PROP-EPNS-001 | `classifyCurrentSession` is pure: same `(EditingSessionState, BlockFocusRequest, Note \| null)` input always produces identical `CurrentSessionDecision` output | REQ-EPNS-007, REQ-EPNS-012 | 1 | **true** | fast-check (property: ∀ state & request & currentNote, fn(state, request, currentNote) deepEquals fn(state, request, currentNote)) |
| PROP-EPNS-002 | `classifyCurrentSession(IdleState, request, null)` always returns `{ kind: 'no-current' }` regardless of `request.noteId` | REQ-EPNS-001, REQ-EPNS-007 | 1 | **true** | fast-check (property: ∀ idle state & any request, result.kind === 'no-current') |
| PROP-EPNS-003 | `classifyCurrentSession(EditingState, request, currentNote)` with `request.noteId !== state.currentNoteId`: `NoteOps.isEmpty(currentNote)` ↔ `'empty'`; `!NoteOps.isEmpty(currentNote)` ↔ `'dirty'` | REQ-EPNS-002, REQ-EPNS-003, REQ-EPNS-007 | 1 | **true** | fast-check (property: isEmpty ↔ 'empty'; !isEmpty ↔ 'dirty' for cross-noteId requests; NoteOps.isEmpty used per shared/note.ts:174) |
| PROP-EPNS-004 | `classifyCurrentSession(EditingState \| SaveFailedState, request, currentNote)` with `request.noteId === state.currentNoteId` always returns `{ kind: 'same-note', noteId: state.currentNoteId, note: currentNote }` | REQ-EPNS-005, REQ-EPNS-007 | 1 | **true** | fast-check (property: ∀ EditingState or SaveFailedState, request.noteId === state.currentNoteId → result.kind === 'same-note') |
| PROP-EPNS-005 | `SwitchError` type exhaustiveness: sole variant is `'save-failed-during-switch'`; `pendingNextFocus: { noteId, blockId }` shape is correct; switch over it covers all variants with a `never` branch | REQ-EPNS-011 | 0 | **true** | TypeScript type exhaustiveness (never branch in switch; structural type check on pendingNextFocus) |
| PROP-EPNS-006 | Happy path (no-current / idle): `BlockFocused` is emitted with `noteId === request.noteId` and `blockId === request.blockId`; no `EmptyNoteDiscarded`; no save I/O | REQ-EPNS-001, REQ-EPNS-009, REQ-EPNS-010 | 2 | false | Example-based test with emit spy and BlurSave stub (not called); verify emit spy captured BlockFocused with correct fields |
| PROP-EPNS-007 | Happy path (empty session, cross-note): `EmptyNoteDiscarded` emitted before `BlockFocused`; no save I/O; `FlushedCurrentSession.result === 'discarded'` | REQ-EPNS-002, REQ-EPNS-009, REQ-EPNS-010 | 2 | false | Example-based test with ordered emit spy |
| PROP-EPNS-008 | Happy path (dirty session, save succeeds, cross-note): `NoteFileSaved` emitted before `BlockFocused`; `FlushedCurrentSession.result === 'saved'`; `NewSession.noteId === request.noteId` | REQ-EPNS-003, REQ-EPNS-010 | 2 | false | Example-based test with BlurSave stub returning Ok(NoteFileSaved); verify previousFrontmatter forwarded from input |
| PROP-EPNS-009 | Error path (dirty, save fails, cross-note): `SwitchError` returned; `NoteSaveFailed` emitted; `BlockFocused` NOT emitted; `EditingSessionState.status === 'save-failed'`; `pendingNextFocus === { noteId: request.noteId, blockId: request.blockId }` | REQ-EPNS-004, REQ-EPNS-013 | 2 | false | Example-based test with BlurSave stub returning Err(SaveError) |
| PROP-EPNS-010 | Same-note path (EditingState): no flush I/O; no save; `EmptyNoteDiscarded` NOT emitted; `FlushedCurrentSession.result === 'same-note-skipped'`; `BlockFocused` emitted with `blockId === request.blockId`; `EditingSessionState.isDirty` is UNCHANGED (same value before and after); `EditingSessionState.status === 'editing'` | REQ-EPNS-005, REQ-EPNS-008 | 2 | false | Example-based test: request.noteId === state.currentNoteId; set isDirty=true before call; verify BlurSave not called; verify isDirty still true after; verify emit captures BlockFocused |
| PROP-EPNS-011 | Save-failed → cross-note request → save succeeds: `NewSession.noteId === request.noteId`; old `pendingNextFocus` discarded | REQ-EPNS-006 | 2 | false | Example-based test: SaveFailedState with prior pendingNextFocus, new cross-note request, save succeeds |
| PROP-EPNS-012 | Save-failed → cross-note request → save fails again: `SwitchError.pendingNextFocus === { noteId: request.noteId, blockId: request.blockId }` (overwriting prior pending) | REQ-EPNS-006 | 2 | false | Example-based test: SaveFailedState, cross-note request, save fails → SwitchError shape verified |
| PROP-EPNS-013 | `classifyCurrentSession(SaveFailedState, request, currentNote)` with `request.noteId !== state.currentNoteId` always returns `{ kind: 'dirty', noteId: state.currentNoteId, note: currentNote }` regardless of prior `pendingNextFocus` value or `NoteOps.isEmpty(currentNote)` | REQ-EPNS-006, REQ-EPNS-007 | 1 | false | fast-check (property: ∀ SaveFailedState & cross-noteId request & any currentNote, result.kind === 'dirty' ∧ result.noteId === state.currentNoteId) |
| PROP-EPNS-014 | Event ordering on empty path: `EmptyNoteDiscarded` strictly before `BlockFocused` | REQ-EPNS-002, REQ-EPNS-009 | 2 | false | Example-based test with ordered emit spy |
| PROP-EPNS-015 | Event ordering on dirty-success path: `NoteFileSaved` strictly before `BlockFocused` | REQ-EPNS-003, REQ-EPNS-010 | 2 | false | Example-based test with ordered emit spy |
| PROP-EPNS-016 | `EmptyNoteDiscarded` is a member of `PublicDomainEvent`; `BlockFocused` is a member of `CaptureInternalEvent` and is NOT a member of `PublicDomainEvent` | REQ-EPNS-009, REQ-EPNS-010 | 0 | false | TypeScript type assertion: Extract + _IsNever checks on the union types |
| PROP-EPNS-017 | Full workflow integration — all cross-note happy paths (no-current, empty, dirty-success) produce `EditingSessionState.status === 'editing'` with `currentNoteId === request.noteId`, `focusedBlockId === request.blockId`, and `isDirty === false` | REQ-EPNS-001 through REQ-EPNS-003, REQ-EPNS-008 | 3 | false | Integration test with port fakes |
| PROP-EPNS-018 | Same-note path in `SaveFailedState`: `BlockFocused` emitted; no save I/O; `SaveFailedState.status` remains `'save-failed'` (not cleared to `'editing'`); `lastSaveError` unchanged; `pendingNextFocus` unchanged | REQ-EPNS-005, REQ-EPNS-008 | 2 | false | Example-based test: SaveFailedState + request.noteId === currentNoteId → verify state.status still 'save-failed' after flush; verify BlockFocused emitted; verify lastSaveError field identity |
| PROP-EPNS-019 | `Clock.now()` is NEVER called inside `classifyCurrentSession` across all input variants | REQ-EPNS-007, REQ-EPNS-012 | 1 | false | fast-check / spy wrapper: instrument `Clock.now`; call classify with arbitrary (state, request, currentNote); assert spy call count === 0 |
| PROP-EPNS-020 | `BlockFocused` emitted on EVERY successful path carries `noteId === request.noteId` AND `blockId === request.blockId` | REQ-EPNS-010 | 1 | false | fast-check: generate arbitrary successful-path inputs; spy on emit; assert emitted BlockFocused fields match request on every path |
| PROP-EPNS-021 | `NewSession.focusedBlockId === request.blockId` on every successful path (no-current, empty, dirty-success, same-note) | REQ-EPNS-008 | 1 | false | fast-check: generate requests with arbitrary blockId; verify NewSession.focusedBlockId matches |
| PROP-EPNS-022 | `same-note` classification ⇒ `flushCurrentSession` returns `same-note-skipped` AND BlurSave port is NOT invoked | REQ-EPNS-005, REQ-EPNS-012 | 2 | false | Example-based test: same-noteId request; spy on BlurSave; verify not called; verify result.result === 'same-note-skipped' |
| PROP-EPNS-023 | Save-failure path: `SwitchError.pendingNextFocus` equals `{ noteId: request.noteId, blockId: request.blockId }` exactly; `SaveFailedState.pendingNextFocus` set to same value | REQ-EPNS-004, REQ-EPNS-011 | 2 | false | Example-based test: dirty path, BlurSave returns Err; verify SwitchError.pendingNextFocus shape; verify state.pendingNextFocus same |
| PROP-EPNS-024 | `Clock.now()` call counts per path match the budget table (REQ-EPNS-012): same-note=1, no-current=1, empty=2, dirty-success=1, dirty-fail=1. Dirty-fail count of 1 is anchored to REQ-EPNS-004: `flushCurrentSession` calls `Clock.now()` once after BlurSave returns `Err` to stamp `NoteSaveFailed.occurredOn`; `startNewSession` is not reached on dirty-fail. | REQ-EPNS-008, REQ-EPNS-012, REQ-EPNS-004 | 1 | false | fast-check / spy wrapper: run each path with instrumented Clock.now; assert call count per path |
| PROP-EPNS-025 | Architectural invariant: `startNewSession` for cross-note paths invokes `parseMarkdownToBlocks(snapshot.body)` to produce `Note.blocks`; same-note path does NOT call `parseMarkdownToBlocks` | REQ-EPNS-008 | 2 | false | Example-based test: spy on parseMarkdownToBlocks; cross-note path → spy called once; same-note path → spy not called. (Architectural verification; runtime observable via spy.) |
| PROP-EPNS-026 | Enumerative `SaveError → NoteSaveFailureReason` mapping: for every `SaveError` discriminant, the emitted `NoteSaveFailed.reason` matches the table in REQ-EPNS-004. Covers: `{kind:'fs', reason:{kind:'permission'}} → "permission"`, `{kind:'fs', reason:{kind:'disk-full'}} → "disk-full"`, `{kind:'fs', reason:{kind:'lock'}} → "lock"`, `{kind:'fs', reason:{kind:'not-found'}} → "unknown"`, `{kind:'fs', reason:{kind:'unknown'}} → "unknown"`, `{kind:'validation', ...} → "unknown"`. | REQ-EPNS-004 | 1 | false | fast-check oneof over all SaveError variants (or table-driven test enumerating all 6 cases); for each variant: run flushCurrentSession with BlurSave returning that Err; assert NoteSaveFailed.reason equals mapped value |
| PROP-EPNS-027 | Precondition violation — throw behavior: for each of the 5 enumerated precondition violations, calling the workflow throws `Error` (or the Promise rejects with `Error`) AND no port is invoked (verified by spy on `clockNow`, `blurSave`, `parseMarkdownToBlocks`, `emit`) AND no state-machine field is mutated. Sub-cases: (a) PC-001: cross-note + `request.snapshot === null` — workflow throws with message prefix `"EditPastNoteStart: cross-note request requires non-null snapshot"`; (b) PC-002: `parseMarkdownToBlocks` returns `Err` — workflow throws (programming error; specific message is implementation-defined); (c) PC-004 (editing + null currentNote): `currentState.status === 'editing'` and `currentNote === null` — workflow throws with message prefix `"EditPastNoteStart: currentNote must not be null when state.status is 'editing' or 'save-failed'"`; (d) PC-004 (save-failed + null currentNote): `currentState.status === 'save-failed'` and `currentNote === null` — same throw as (c); (e) PC-004 (idle + non-null currentNote): `currentState.status === 'idle'` and `currentNote !== null` — workflow throws (programming error; state/note inconsistency). On sub-case (b): `clockNow` MUST NOT be called (the clock call in `startNewSession` must be after `parseMarkdownToBlocks`). Each sub-case is a separate example-based test. | REQ-EPNS-013 | 2 | false | Example-based test for each violation sub-case (a)–(e): call workflow with violating input; assert `expect(() => workflow(...)).toThrow()` (or `await expect(promise).rejects.toThrow()`); spy on all ports (clockNow, blurSave, parseMarkdownToBlocks, emit) and assert spy.callCount === 0; snapshot state before call and assert no field changed after throw. For sub-case (b), explicitly assert `clockCalled === false`. |
| PROP-EPNS-028 | Idempotent re-focus: WHEN `classifyCurrentSession+flushCurrentSession+startNewSession` is invoked twice with identical `(EditingState, request)` where `request.noteId === state.currentNoteId && request.blockId === state.focusedBlockId`, THEN: (a) both invocations return Ok(NewSession); (b) cumulative `BlockFocused` emit count is exactly 2; (c) the two `NewSession` objects returned are structurally equal (the workflow produces identical output for identical input — idempotent fixed point on workflow output; NOTE: `EditingSessionState` mutation idempotency is deferred to the upstream reducer — see REQ-EPNS-008 scope note); (d) `isDirty` is preserved across both calls (verified indirectly: no blurSave is called, meaning the pipeline does not clear isDirty) | REQ-EPNS-005, REQ-EPNS-008 | 2 | false | Example-based test: EditingState with isDirty=true, same request twice; spy on emit; count BlockFocused; assert r1 toEqual r2 (both Ok(NewSession) with same structure); assert blurSave not called across both invocations |

---

## Verification Tiers

- **Tier 0**: TypeScript type-level proof. No runtime test needed; the type system enforces it at compile time.
- **Tier 1**: Property-based test with fast-check. Generated random inputs; checks structural invariants.
- **Tier 2**: Example-based unit test. Concrete inputs and expected outputs; verifies specific behaviors.
- **Tier 3**: Integration test. Exercises the full pipeline with port fakes/stubs; tests cross-step coordination.

In lean mode, `required: true` is reserved for the highest-risk invariants:

- **PROP-EPNS-001** (`classifyCurrentSession` purity over explicit `(state, request, currentNote)`) — the entire pure/effectful boundary depends on this being side-effect-free. Revision 5: purity claim is now structurally verifiable because all inputs including `currentNote` are explicit parameters (no external buffer access).
- **PROP-EPNS-002** (idle → no-current) — entry condition for the skip-flush fast path; misclassification causes spurious save I/O.
- **PROP-EPNS-003** (empty/dirty classification for cross-noteId using canonical `NoteOps.isEmpty`) — determines whether blur save is triggered; wrong classification causes data loss (dirty treated as empty) or spurious I/O (empty saved).
- **PROP-EPNS-004** (same-noteId → same-note for EditingState/SaveFailedState) — data-safety claim: same-note movement must NEVER trigger save I/O. If this misclassifies, an auto-save fires on every cursor move between blocks, causing severe performance and data-coherence issues.
- **PROP-EPNS-005** (`SwitchError` exhaustiveness with `pendingNextFocus` shape) — ensures no unhandled error variant and that `pendingNextFocus.blockId` is always present; downstream `HandleSaveFailure` depends on `blockId` for resuming focus.

---

## Coverage Matrix

| Requirement | PROP IDs |
|-------------|---------|
| REQ-EPNS-001 | PROP-EPNS-002, PROP-EPNS-006, PROP-EPNS-017 |
| REQ-EPNS-002 | PROP-EPNS-003, PROP-EPNS-007, PROP-EPNS-014, PROP-EPNS-017 |
| REQ-EPNS-003 | PROP-EPNS-003, PROP-EPNS-008, PROP-EPNS-015, PROP-EPNS-017 |
| REQ-EPNS-004 | PROP-EPNS-009, PROP-EPNS-023, PROP-EPNS-024, PROP-EPNS-026 |
| REQ-EPNS-005 | PROP-EPNS-004, PROP-EPNS-010, PROP-EPNS-018, PROP-EPNS-022, PROP-EPNS-028 |
| REQ-EPNS-006 | PROP-EPNS-011, PROP-EPNS-012, PROP-EPNS-013 |
| REQ-EPNS-007 | PROP-EPNS-001, PROP-EPNS-002, PROP-EPNS-003, PROP-EPNS-004, PROP-EPNS-013, PROP-EPNS-019 |
| REQ-EPNS-008 | PROP-EPNS-010, PROP-EPNS-017, PROP-EPNS-018, PROP-EPNS-021, PROP-EPNS-024, PROP-EPNS-025, PROP-EPNS-028 |
| REQ-EPNS-009 | PROP-EPNS-006, PROP-EPNS-007, PROP-EPNS-016 |
| REQ-EPNS-010 | PROP-EPNS-006, PROP-EPNS-007, PROP-EPNS-008, PROP-EPNS-015, PROP-EPNS-016, PROP-EPNS-020 |
| REQ-EPNS-011 | PROP-EPNS-005, PROP-EPNS-023 |
| REQ-EPNS-012 | PROP-EPNS-001, PROP-EPNS-019, PROP-EPNS-022, PROP-EPNS-024 |
| REQ-EPNS-013 | PROP-EPNS-009, PROP-EPNS-027 |

Every requirement has at least one proof obligation. Five `required: true` obligations (PROP-EPNS-001 through PROP-EPNS-005) cover the highest-risk invariants and span Tiers 0–1. Total proof obligations: 28 (PROP-EPNS-001 through PROP-EPNS-028).
