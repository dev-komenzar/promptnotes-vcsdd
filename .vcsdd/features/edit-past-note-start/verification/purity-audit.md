# Purity Boundary Audit — edit-past-note-start

**Feature**: edit-past-note-start
**Phase**: 5 (Sprint 2)
**Date**: 2026-05-07
**Reference**: specs/verification-architecture.md (Revision 7)

---

## Declared Boundaries

Purity Boundary Map from `specs/verification-architecture.md` Revision 7:

| Step | Function | Classification | Declared Rationale |
|------|----------|---------------|--------------------|
| Step 1 | `classifyCurrentSession` | **Pure core** | `(EditingSessionState, BlockFocusRequest, Note \| null) → CurrentSessionDecision`; no ports, no side effects, deterministic. All inputs are explicit parameters. Includes same-note detection. |
| Step 2a | `flushCurrentSession` (same-note path) | Pure shell (no-op) | Returns `FlushedCurrentSession { result: 'same-note-skipped' }` with zero I/O. |
| Step 2b | `flushCurrentSession` (no-current path) | Pure shell (no-op) | Returns `FlushedCurrentSession { result: 'no-op' }` with zero I/O. |
| Step 2c | `flushCurrentSession` (empty path) | Effectful shell | Calls `Clock.now()` once; calls `emit(EmptyNoteDiscarded)`. |
| Step 2d | `flushCurrentSession` (dirty path) | Effectful shell | Invokes `blurSave` (async I/O); on success emits `NoteFileSaved`; on failure calls `Clock.now()` once and emits `NoteSaveFailed`. |
| Step 3a | `parseMarkdownToBlocks` | **Pure core** | Shared Kernel pure function (`blocks.ts`); `string → Result<Block[], BlockParseError>`; deterministic; no ports. Called inside `startNewSession` for cross-note paths only. |
| Step 3b | `startNewSession` | Effectful shell | Calls `Clock.now()` exactly once; calls `emit(BlockFocused)`; may call `parseMarkdownToBlocks` (pure). |
| — | `pipeline.ts` | Orchestrator | Precondition throws (synchronous, before any port). Delegates I/O to flushCurrentSession and startNewSession. No direct Clock/emit access. |
| — | `is-empty-note.ts` | **Pure core** | `(Note) → boolean`; no ports, no side effects. Canonical NoteOps.isEmpty. |

**Declared formally verifiable pure core**: `classifyCurrentSession`, `parseMarkdownToBlocks`, `isEmptyNote`.

**Declared effectful shell**: `flushCurrentSession` (empty/dirty paths), `startNewSession`.

**Architectural note (Revision 4/5 delta)**: No pre-pipeline effectful guard. Same-note detection lives entirely inside the pure `classifyCurrentSession`. The `isCrossNoteRequest` helper was removed (FIND-EPNS-S2-P3-007); the pipeline uses `decision.kind` after classification.

---

## Observed Boundaries

### `is-empty-note.ts` (IMPL-EPNS-IS-EMPTY-NOTE — BEAD-080)

Observed: Pure predicate. Takes `Note`, reads `note.blocks[0].content`. No ports, no external state, no emit. One `as unknown as string` cast for branded content type — read-only, no mutation.

Clock calls: 0. Emit calls: 0. BlurSave calls: 0. External I/O: 0.

Declared: Pure core. **No drift detected.**

### `classify-current-session.ts` (IMPL-EPNS-CLASSIFY — BEAD-066)

Observed: Pure function. Imports only `isEmptyNote` (itself pure). Switch over `state.status` with deterministic branches. Throws on invalid states (saving/switching) — synchronous, no side effect before throw.

Clock calls: 0. Emit calls: 0. BlurSave calls: 0. PROP-EPNS-001 (fast-check, 3 tests, 1101 expect() calls) verifies referential transparency across all (state, request, currentNote) combinations.

Declared: Pure core. **No drift detected.**

### `flush-current-session.ts` (IMPL-EPNS-FLUSH — BEAD-067)

Observed per path:

| Path | clockNow | blurSave | emit | Result |
|------|----------|----------|------|--------|
| no-current | 0 | 0 | 0 | `{ result: 'no-op' }` |
| same-note | 0 | 0 | 0 | `{ result: 'same-note-skipped' }` |
| empty | 1 (EmptyNoteDiscarded.occurredOn) | 0 | 1 (EmptyNoteDiscarded) | `{ result: 'discarded' }` |
| dirty-success | 0 | 1 (async, awaited) | 1 (NoteFileSaved from blurSave) | `{ result: 'saved' }` |
| dirty-fail | 1 (NoteSaveFailed.occurredOn, AFTER blurSave returns Err) | 1 (async, awaited) | 1 (NoteSaveFailed) | `Err(SwitchError)` |

Clock budget observed: empty=1, dirty-fail=1, all others=0. Matches declared budget table in `verification-architecture.md` Port Contracts section.

Sprint 2 change: `blurSave` is now `async` (FIND-EPNS-S2-P3-005); `flushCurrentSession` is async to match `BlurSave` port contract. This is consistent with declared effectful-shell classification.

Declared: Effectful shell. **No drift detected.**

### `start-new-session.ts` (IMPL-EPNS-START-NEW-SESSION — BEAD-068)

Observed: Always calls `clockNow()` exactly once, AFTER `resolveNote()`. `resolveNote()` calls `parseMarkdownToBlocks` on cross-note paths (pure, may throw on PC-002). On same-note path, `resolveNote()` returns `decision.note` directly — no `parseMarkdownToBlocks` call. `emit(BlockFocused)` called once per invocation, AFTER `clockNow()`.

Clock budget: 1 per invocation (all paths). Emit: 1 per invocation (BlockFocused). ParseMarkdown: 0 on same-note, 1 on cross-note.

Sprint 2 change: Clock call is AFTER `parseMarkdownToBlocks` (FIND-EPNS-S2-P3-004). On PC-002 parse failure, `clockNow` is NOT called — satisfies PROP-EPNS-027(b) requirement. This is verified by `prop-027-precondition-throws.harness.test.ts`.

Sprint 2 change: `emit(BlockFocused)` replaces `emit(EditorFocusedOnPastNote)` from Sprint 1. The purity boundary (effectful shell) is unchanged.

Declared: Effectful shell, `Clock.now()` exactly once, `emit(BlockFocused)` exactly once. **No drift detected.**

### `pipeline.ts` (IMPL-EPNS-PIPELINE — BEAD-069)

Observed: No direct port calls. All I/O is forwarded to `flushCurrentSession` and `startNewSession` via port structs. Precondition checks (PC-004 idle, PC-004 editing/save-failed, PC-001 cross-note) are synchronous throws BEFORE the first port delegation (line 132). `classifyCurrentSession` is called at line 119 — pure, no side effect.

Sprint 2 change: `isCrossNoteRequest` helper removed (FIND-EPNS-S2-P3-007). PC-001 uses `decision.kind !== 'same-note'` after classification. The orchestrator-only character of the pipeline is preserved.

Sprint 2 change: `async/await` wrapping added (FIND-EPNS-S2-P3-005) to propagate `blurSave` async result through `flushCurrentSession`.

Declared: Orchestrator (no direct I/O beyond port forwarding; precondition throws synchronous). **No drift detected.**

---

## Summary

**PASS — No drift detected across all 5 implementation files.**

All declared boundaries in `specs/verification-architecture.md` (Revision 7) match the observed implementation behavior:

- Pure core (`classifyCurrentSession`, `isEmptyNote`): 0 port calls confirmed, referential transparency verified by PROP-EPNS-001 fast-check run (38 harness tests total, 14460 expect() calls).
- Effectful shell (`flushCurrentSession`, `startNewSession`): Clock budgets match per-path declaration. No hidden side effects in pure paths.
- Orchestrator (`pipeline.ts`): No direct I/O. Precondition throws occur before all port calls.
- Sprint 2 purity claim soundness (Revision 5 note): `classifyCurrentSession` signature `(state, request, currentNote)` makes all inputs explicit — no hidden external buffer access. PROP-EPNS-001 is structurally verifiable via fast-check without port mocking.

No follow-up actions required before Phase 6 convergence.
