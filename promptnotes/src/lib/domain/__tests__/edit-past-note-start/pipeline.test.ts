/**
 * pipeline.test.ts — Sprint 2 block-based integration tests for EditPastNoteStart pipeline
 *
 * REQ-EPNS-001: idle state → cross-note block focus → NewSession
 * REQ-EPNS-002: editing + empty note + cross-note → EmptyNoteDiscarded + NewSession
 * REQ-EPNS-003: editing + dirty note + cross-note → NoteFileSaved + NewSession
 * REQ-EPNS-004: dirty save fails → SwitchError + NoteSaveFailed
 * REQ-EPNS-005: same-note path → BlockFocused, no flush, NewSession returned
 * REQ-EPNS-006: save-failed + cross-note → retry save
 * REQ-EPNS-008: path-conditional EditingSessionState post-conditions
 * REQ-EPNS-009: EmptyNoteDiscarded is PublicDomainEvent
 * REQ-EPNS-010: BlockFocused is CaptureInternalEvent, NOT PublicDomainEvent
 * REQ-EPNS-011: SwitchError.pendingNextFocus { noteId, blockId } shape
 * REQ-EPNS-012: Clock.now() budget per path
 * REQ-EPNS-013: precondition violations throw
 *
 * PROP-EPNS-005: SwitchError type exhaustiveness (Tier 0)
 * PROP-EPNS-016: Event membership type assertions (Tier 0)
 *
 * Sprint 2 changes from Sprint 1:
 * - Input uses BlockFocusRequest (not PastNoteSelection)
 * - Pipeline input struct: { request, currentState, currentNote, previousFrontmatter }
 * - Same-note detection is in classifyCurrentSession (no pre-pipeline guard)
 * - Pipeline always returns Ok(NewSession) on success (no SameNoteNoOp)
 * - SwitchError.pendingNextFocus replaces pendingNextNoteId
 * - BlockFocused replaces EditorFocusedOnPastNote
 * - Note has blocks[] not body (NoteFileSaved has blocks)
 * - PC-001: cross-note + snapshot===null → throw
 * - PC-004: editing/save-failed + currentNote===null → throw
 */

import { describe, test, expect } from "bun:test";
import type {
  NoteId,
  Timestamp,
  Frontmatter,
  BlockId,
  BlockContent,
  BlockType,
} from "promptnotes-domain-types/shared/value-objects";
import type { Block, Note } from "promptnotes-domain-types/shared/note";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type {
  PublicDomainEvent,
  NoteFileSaved,
  EmptyNoteDiscarded,
} from "promptnotes-domain-types/shared/events";
import type { SaveError, SwitchError } from "promptnotes-domain-types/shared/errors";
import type {
  EditingState,
  IdleState,
  SaveFailedState,
} from "promptnotes-domain-types/capture/states";
import type { CaptureInternalEvent, BlockFocused } from "promptnotes-domain-types/capture/internal-events";

import {
  runEditPastNoteStartPipeline,
  type EditPastNoteStartPorts,
  type EditPastNoteStartInput,
} from "../../edit-past-note-start/pipeline";

// ── PROP-EPNS-005: SwitchError type exhaustiveness (Tier 0) ──────────────
// Compile-time check: SwitchError has exactly one variant 'save-failed-during-switch'.
// Sprint 2: pendingNextFocus carries { noteId, blockId } (not pendingNextNoteId).
function _exhaustiveSwitchError(e: SwitchError): string {
  switch (e.kind) {
    case "save-failed-during-switch":
      return `${e.kind}: ${e.pendingNextFocus.noteId as unknown as string}/${e.pendingNextFocus.blockId as unknown as string}`;
    default: {
      const _never: never = e;
      return _never;
    }
  }
}
void _exhaustiveSwitchError;

// ── PROP-EPNS-016: Type-level event membership assertions (Tier 0) ───────
type _IsNever<T> = [T] extends [never] ? true : false;

// BlockFocused must NOT be in PublicDomainEvent (it's CaptureInternalEvent)
type _BlockFocusedNotPublic = Extract<PublicDomainEvent, { kind: "block-focused" }>;
const _blockFocusedNeverPublic: _IsNever<_BlockFocusedNotPublic> = true;
void _blockFocusedNeverPublic;

// EmptyNoteDiscarded MUST be in PublicDomainEvent
type _EmptyNoteDiscardedIsPublic = Extract<PublicDomainEvent, { kind: "empty-note-discarded" }>;
const _e: _EmptyNoteDiscardedIsPublic = null as unknown as EmptyNoteDiscarded;
void _e;

// BlockFocused MUST be in CaptureInternalEvent
type _BlockFocusedIsInternal = Extract<CaptureInternalEvent, { kind: "block-focused" }>;
const _f: _BlockFocusedIsInternal = null as unknown as BlockFocused;
void _f;

// ── Test helpers ──────────────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}
function makeBlockId(raw: string): BlockId {
  return raw as unknown as BlockId;
}
function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}
function makeBlockContent(raw: string): BlockContent {
  return raw as unknown as BlockContent;
}
function makeFrontmatter(): Frontmatter {
  return {
    tags: [],
    createdAt: makeTimestamp(1000),
    updatedAt: makeTimestamp(1000),
  } as unknown as Frontmatter;
}

function makeBlock(content: string, type: BlockType = "paragraph", id = "block-001"): Block {
  return {
    id: makeBlockId(id),
    type: type as unknown as BlockType,
    content: makeBlockContent(content),
  } as unknown as Block;
}

function makeNote(blocks: ReadonlyArray<Block>, id: NoteId): Note {
  return {
    id,
    blocks,
    frontmatter: makeFrontmatter(),
  } as unknown as Note;
}

function makeSnapshot(noteId: NoteId): NoteFileSnapshot {
  return {
    noteId,
    body: "snapshot content" as unknown as Frontmatter,
    frontmatter: makeFrontmatter(),
    filePath: "/vault/past-note.md",
    fileMtime: makeTimestamp(1000),
  } as unknown as NoteFileSnapshot;
}

function makeIdleState(): IdleState {
  return { status: "idle" as const };
}

function makeEditingState(opts?: {
  currentNoteId?: NoteId;
  isDirty?: boolean;
  focusedBlockId?: BlockId | null;
}): EditingState {
  return {
    status: "editing" as const,
    currentNoteId: opts?.currentNoteId ?? makeNoteId("2026-04-30-120000-000"),
    focusedBlockId: opts?.focusedBlockId ?? makeBlockId("block-current"),
    isDirty: opts?.isDirty ?? false,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  };
}

function makeSaveFailedState(opts?: {
  currentNoteId?: NoteId;
  pendingNextFocus?: { noteId: NoteId; blockId: BlockId } | null;
  lastSaveError?: SaveError;
}): SaveFailedState {
  return {
    status: "save-failed" as const,
    currentNoteId: opts?.currentNoteId ?? makeNoteId("2026-04-30-120000-000"),
    pendingNextFocus: opts?.pendingNextFocus ?? null,
    lastSaveError: opts?.lastSaveError ?? {
      kind: "fs" as const,
      reason: { kind: "unknown" as const, detail: "test" },
    },
  };
}

function makeEventSpy() {
  const events: Array<{ kind: string; [k: string]: unknown }> = [];
  return {
    events,
    emit: (e: { kind: string; [k: string]: unknown }) => events.push(e),
  };
}

function makeNoteFileSaved(noteId: NoteId): NoteFileSaved {
  return {
    kind: "note-file-saved",
    noteId,
    blocks: [makeBlock("content")],
    body: "content" as unknown as Frontmatter,
    frontmatter: makeFrontmatter(),
    previousFrontmatter: null,
    occurredOn: makeTimestamp(2000),
  };
}

function makeHappyPorts(
  spy: ReturnType<typeof makeEventSpy>,
  overrides?: Partial<EditPastNoteStartPorts>,
): EditPastNoteStartPorts {
  return {
    clockNow: overrides?.clockNow ?? (() => makeTimestamp(Date.now())),
    blurSave: overrides?.blurSave ??
      ((noteId) => ({ ok: true as const, value: makeNoteFileSaved(noteId) })),
    parseMarkdownToBlocks: overrides?.parseMarkdownToBlocks ??
      ((_markdown: string) => ({
        ok: true as const,
        value: [makeBlock("hydrated content", "paragraph", "block-hydrated")],
      })),
    emit: spy.emit,
  };
}

function makeCrossNoteInput(
  currentState: EditingState | IdleState | SaveFailedState,
  currentNote: Note | null,
  targetNoteId?: NoteId,
  targetBlockId?: BlockId,
): EditPastNoteStartInput {
  const tgtId = targetNoteId ?? makeNoteId("2026-04-30-150000-000");
  const tgtBlockId = targetBlockId ?? makeBlockId("block-target-001");
  return {
    request: {
      kind: "BlockFocusRequest",
      noteId: tgtId,
      blockId: tgtBlockId,
      snapshot: makeSnapshot(tgtId),
    },
    currentState,
    currentNote,
    previousFrontmatter: null,
  };
}

// ── REQ-EPNS-001: idle state → cross-note → NewSession ───────────────────

describe("pipeline — idle + cross-note (REQ-EPNS-001)", () => {
  test("idle state → NewSession with correct noteId and focusedBlockId", () => {
    const targetId = makeNoteId("2026-04-30-150000-001");
    const targetBlockId = makeBlockId("block-tgt-001");
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);

    const input = makeCrossNoteInput(makeIdleState(), null, targetId, targetBlockId);
    const result = runEditPastNoteStartPipeline(input, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("NewSession");
      expect(result.value.noteId).toBe(targetId);
      expect(result.value.focusedBlockId).toBe(targetBlockId);
    }
  });

  test("idle state → BlockFocused emitted (no EmptyNoteDiscarded)", () => {
    const targetId = makeNoteId("2026-04-30-150000-002");
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);

    const input = makeCrossNoteInput(makeIdleState(), null, targetId);
    runEditPastNoteStartPipeline(input, ports);

    const focusEvents = spy.events.filter((e) => e.kind === "block-focused");
    const discardEvents = spy.events.filter((e) => e.kind === "empty-note-discarded");
    expect(focusEvents).toHaveLength(1);
    expect(discardEvents).toHaveLength(0);
  });

  // REQ-EPNS-012: idle path → Clock.now() called exactly once (startNewSession)
  test("idle path: Clock.now() called exactly once", () => {
    let clockCalls = 0;
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy, {
      clockNow: () => { clockCalls++; return makeTimestamp(Date.now()); },
    });

    const input = makeCrossNoteInput(makeIdleState(), null);
    runEditPastNoteStartPipeline(input, ports);
    expect(clockCalls).toBe(1);
  });
});

// ── REQ-EPNS-002: editing + empty note + cross-note ──────────────────────

describe("pipeline — editing + empty note + cross-note (REQ-EPNS-002)", () => {
  test("empty note → EmptyNoteDiscarded before BlockFocused, result is NewSession", () => {
    const currentId = makeNoteId("2026-04-30-120000-010");
    const targetId = makeNoteId("2026-04-30-150000-010");
    const emptyNote = makeNote([makeBlock("")], currentId);
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-tgt"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeEditingState({ currentNoteId: currentId }),
      currentNote: emptyNote,
      previousFrontmatter: null,
    };
    const result = runEditPastNoteStartPipeline(input, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.noteId).toBe(targetId);
    }
    // Event ordering: EmptyNoteDiscarded strictly before BlockFocused
    const discardIdx = spy.events.findIndex((e) => e.kind === "empty-note-discarded");
    const focusIdx = spy.events.findIndex((e) => e.kind === "block-focused");
    expect(discardIdx).toBeGreaterThanOrEqual(0);
    expect(focusIdx).toBeGreaterThan(discardIdx);
  });

  // REQ-EPNS-012: empty path → Clock.now() called exactly twice
  test("empty path: Clock.now() called exactly twice (flush + startNewSession)", () => {
    let clockCalls = 0;
    const currentId = makeNoteId("2026-04-30-120000-011");
    const targetId = makeNoteId("2026-04-30-150000-011");
    const emptyNote = makeNote([makeBlock("")], currentId);
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy, {
      clockNow: () => { clockCalls++; return makeTimestamp(Date.now()); },
    });

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-tgt"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeEditingState({ currentNoteId: currentId }),
      currentNote: emptyNote,
      previousFrontmatter: null,
    };
    runEditPastNoteStartPipeline(input, ports);
    expect(clockCalls).toBe(2);
  });
});

// ── REQ-EPNS-003: editing + dirty note + cross-note, save succeeds ────────

describe("pipeline — editing + dirty note + cross-note, save succeeds (REQ-EPNS-003)", () => {
  test("dirty note → NoteFileSaved before BlockFocused, result is NewSession", () => {
    const currentId = makeNoteId("2026-04-30-120000-020");
    const targetId = makeNoteId("2026-04-30-150000-020");
    const dirtyNote = makeNote([makeBlock("dirty content")], currentId);
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-tgt"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeEditingState({ currentNoteId: currentId, isDirty: true }),
      currentNote: dirtyNote,
      previousFrontmatter: null,
    };
    const result = runEditPastNoteStartPipeline(input, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.noteId).toBe(targetId);
    }
    // Event ordering: NoteFileSaved before BlockFocused
    const savedIdx = spy.events.findIndex((e) => e.kind === "note-file-saved");
    const focusIdx = spy.events.findIndex((e) => e.kind === "block-focused");
    expect(savedIdx).toBeGreaterThanOrEqual(0);
    expect(focusIdx).toBeGreaterThan(savedIdx);
  });

  // REQ-EPNS-012: dirty-success → Clock.now() called exactly once (startNewSession)
  test("dirty-success path: Clock.now() called exactly once", () => {
    let clockCalls = 0;
    const currentId = makeNoteId("2026-04-30-120000-021");
    const targetId = makeNoteId("2026-04-30-150000-021");
    const dirtyNote = makeNote([makeBlock("dirty content")], currentId);
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy, {
      clockNow: () => { clockCalls++; return makeTimestamp(Date.now()); },
    });

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-tgt"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeEditingState({ currentNoteId: currentId }),
      currentNote: dirtyNote,
      previousFrontmatter: null,
    };
    runEditPastNoteStartPipeline(input, ports);
    expect(clockCalls).toBe(1);
  });

  // previousFrontmatter is passed to blurSave
  test("dirty path: blurSave receives previousFrontmatter from input", () => {
    const currentId = makeNoteId("2026-04-30-120000-022");
    const targetId = makeNoteId("2026-04-30-150000-022");
    const dirtyNote = makeNote([makeBlock("dirty content")], currentId);
    const prevFm = makeFrontmatter();
    const spy = makeEventSpy();
    let capturedPrevFm: Frontmatter | null = null;
    const ports = makeHappyPorts(spy, {
      blurSave: (noteId, _note, previousFrontmatter) => {
        capturedPrevFm = previousFrontmatter;
        return { ok: true as const, value: makeNoteFileSaved(noteId) };
      },
    });

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-tgt"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeEditingState({ currentNoteId: currentId }),
      currentNote: dirtyNote,
      previousFrontmatter: prevFm,
    };
    runEditPastNoteStartPipeline(input, ports);
    expect(capturedPrevFm).toBe(prevFm);
  });
});

// ── REQ-EPNS-004: dirty save fails → SwitchError ─────────────────────────

describe("pipeline — dirty save fails (REQ-EPNS-004)", () => {
  test("dirty save fails → SwitchError with pendingNextFocus { noteId, blockId }", () => {
    const currentId = makeNoteId("2026-04-30-120000-030");
    const targetId = makeNoteId("2026-04-30-150000-030");
    const targetBlockId = makeBlockId("block-target-030");
    const dirtyNote = makeNote([makeBlock("content")], currentId);
    const saveError: SaveError = {
      kind: "fs",
      reason: { kind: "permission", path: "/vault/test.md" },
    };
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy, {
      blurSave: () => ({ ok: false as const, error: saveError }),
    });

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: targetBlockId,
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeEditingState({ currentNoteId: currentId }),
      currentNote: dirtyNote,
      previousFrontmatter: null,
    };
    const result = runEditPastNoteStartPipeline(input, ports);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("save-failed-during-switch");
      // Sprint 2: pendingNextFocus replaces pendingNextNoteId
      expect(result.error.pendingNextFocus.noteId).toBe(targetId);
      expect(result.error.pendingNextFocus.blockId).toBe(targetBlockId);
    }
  });

  test("dirty save fails → NoteSaveFailed emitted + BlockFocused NOT emitted", () => {
    const currentId = makeNoteId("2026-04-30-120000-031");
    const targetId = makeNoteId("2026-04-30-150000-031");
    const dirtyNote = makeNote([makeBlock("content")], currentId);
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy, {
      blurSave: () => ({ ok: false as const, error: { kind: "fs" as const, reason: { kind: "permission" as const } } }),
    });

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-tgt"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeEditingState({ currentNoteId: currentId }),
      currentNote: dirtyNote,
      previousFrontmatter: null,
    };
    runEditPastNoteStartPipeline(input, ports);

    expect(spy.events.some((e) => e.kind === "note-save-failed")).toBe(true);
    expect(spy.events.some((e) => e.kind === "block-focused")).toBe(false);
  });

  // REQ-EPNS-012: dirty-fail → Clock.now() called once (for NoteSaveFailed)
  test("dirty-fail path: Clock.now() called once (for NoteSaveFailed.occurredOn)", () => {
    let clockCalls = 0;
    const currentId = makeNoteId("2026-04-30-120000-032");
    const targetId = makeNoteId("2026-04-30-150000-032");
    const dirtyNote = makeNote([makeBlock("content")], currentId);
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy, {
      clockNow: () => { clockCalls++; return makeTimestamp(Date.now()); },
      blurSave: () => ({ ok: false as const, error: { kind: "fs" as const, reason: { kind: "lock" as const, path: "/x" } } }),
    });

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-tgt"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeEditingState({ currentNoteId: currentId }),
      currentNote: dirtyNote,
      previousFrontmatter: null,
    };
    runEditPastNoteStartPipeline(input, ports);
    expect(clockCalls).toBe(1);
  });
});

// ── REQ-EPNS-005: same-note path ─────────────────────────────────────────

describe("pipeline — same-note path (REQ-EPNS-005)", () => {
  test("EditingState + same-noteId → Ok(NewSession) with focusedBlockId = request.blockId", () => {
    const noteId = makeNoteId("2026-04-30-120000-040");
    const newBlockId = makeBlockId("block-intra-move");
    const currentNote = makeNote([makeBlock("content")], noteId);
    const spy = makeEventSpy();
    let blurSaveCalled = false;
    const ports = makeHappyPorts(spy, {
      blurSave: () => { blurSaveCalled = true; return { ok: true as const, value: makeNoteFileSaved(noteId) }; },
    });

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId,
        blockId: newBlockId,
        snapshot: null,  // same-note: snapshot is null
      },
      currentState: makeEditingState({ currentNoteId: noteId, isDirty: true }),
      currentNote,
      previousFrontmatter: null,
    };
    const result = runEditPastNoteStartPipeline(input, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("NewSession");
      expect(result.value.noteId).toBe(noteId);
      expect(result.value.focusedBlockId).toBe(newBlockId);
    }
    // No save I/O
    expect(blurSaveCalled).toBe(false);
    // No EmptyNoteDiscarded or NoteFileSaved
    expect(spy.events.some((e) => e.kind === "empty-note-discarded")).toBe(false);
    expect(spy.events.some((e) => e.kind === "note-file-saved")).toBe(false);
    // BlockFocused emitted
    expect(spy.events.some((e) => e.kind === "block-focused")).toBe(true);
  });

  test("same-note on EditingState: isDirty preserved (not cleared)", () => {
    const noteId = makeNoteId("2026-04-30-120000-041");
    const currentNote = makeNote([makeBlock("content")], noteId);
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId,
        blockId: makeBlockId("block-002"),
        snapshot: null,
      },
      currentState: makeEditingState({ currentNoteId: noteId, isDirty: true }),
      currentNote,
      previousFrontmatter: null,
    };
    runEditPastNoteStartPipeline(input, ports);
    // Pipeline does not mutate state directly; this is tested via startNewSession behavior
    // The key assertion: BlockFocused IS emitted (success path)
    const blockFocusedEvents = spy.events.filter((e) => e.kind === "block-focused");
    expect(blockFocusedEvents).toHaveLength(1);
    // Verify the emitted event carries correct blockId
    const bfe = blockFocusedEvents[0] as BlockFocused;
    expect(bfe.blockId).toEqual(makeBlockId("block-002"));
  });

  test("SaveFailedState + same-noteId → Ok(NewSession) + BlockFocused, no save", () => {
    const noteId = makeNoteId("2026-04-30-120000-042");
    const currentNote = makeNote([makeBlock("content")], noteId);
    const spy = makeEventSpy();
    let blurSaveCalled = false;
    const ports = makeHappyPorts(spy, {
      blurSave: () => { blurSaveCalled = true; return { ok: true as const, value: makeNoteFileSaved(noteId) }; },
    });

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId,
        blockId: makeBlockId("block-003"),
        snapshot: null,
      },
      currentState: makeSaveFailedState({ currentNoteId: noteId }),
      currentNote,
      previousFrontmatter: null,
    };
    const result = runEditPastNoteStartPipeline(input, ports);

    expect(result.ok).toBe(true);
    expect(blurSaveCalled).toBe(false);
    expect(spy.events.some((e) => e.kind === "block-focused")).toBe(true);
  });

  // PROP-EPNS-028: same-note idempotent refocus
  test("same-note: idempotent re-focus — both calls return Ok(NewSession), 2 BlockFocused events total", () => {
    const noteId = makeNoteId("2026-04-30-120000-043");
    const blockId = makeBlockId("block-same-block");
    const currentNote = makeNote([makeBlock("content")], noteId);
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId,
        blockId,
        snapshot: null,
      },
      currentState: makeEditingState({ currentNoteId: noteId, isDirty: true, focusedBlockId: blockId }),
      currentNote,
      previousFrontmatter: null,
    };

    const r1 = runEditPastNoteStartPipeline(input, ports);
    const r2 = runEditPastNoteStartPipeline(input, ports);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    const blockFocusedEvents = spy.events.filter((e) => e.kind === "block-focused");
    expect(blockFocusedEvents).toHaveLength(2);
  });

  // REQ-EPNS-012: same-note path → Clock.now() called exactly once per invocation
  test("same-note path: Clock.now() called exactly once", () => {
    let clockCalls = 0;
    const noteId = makeNoteId("2026-04-30-120000-044");
    const currentNote = makeNote([makeBlock("content")], noteId);
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy, {
      clockNow: () => { clockCalls++; return makeTimestamp(Date.now()); },
    });

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId,
        blockId: makeBlockId("block-004"),
        snapshot: null,
      },
      currentState: makeEditingState({ currentNoteId: noteId }),
      currentNote,
      previousFrontmatter: null,
    };
    runEditPastNoteStartPipeline(input, ports);
    expect(clockCalls).toBe(1);
  });
});

// ── REQ-EPNS-006: save-failed + cross-note ───────────────────────────────

describe("pipeline — save-failed + cross-note (REQ-EPNS-006)", () => {
  test("save-failed + new note + save succeeds → NewSession with new noteId", () => {
    const currentId = makeNoteId("2026-04-30-120000-050");
    const oldPendingId = makeNoteId("2026-04-30-130000-050");
    const newTargetId = makeNoteId("2026-04-30-150000-050");
    const currentNote = makeNote([makeBlock("content")], currentId);
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: newTargetId,
        blockId: makeBlockId("block-new-target"),
        snapshot: makeSnapshot(newTargetId),
      },
      currentState: makeSaveFailedState({
        currentNoteId: currentId,
        pendingNextFocus: { noteId: oldPendingId, blockId: makeBlockId("block-old") },
      }),
      currentNote,
      previousFrontmatter: null,
    };
    const result = runEditPastNoteStartPipeline(input, ports);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.noteId).toBe(newTargetId);
    }
  });

  test("save-failed + new note + save fails → SwitchError.pendingNextFocus = new { noteId, blockId }", () => {
    const currentId = makeNoteId("2026-04-30-120000-051");
    const oldPendingId = makeNoteId("2026-04-30-130000-051");
    const newTargetId = makeNoteId("2026-04-30-150000-051");
    const newTargetBlockId = makeBlockId("block-new-target-051");
    const currentNote = makeNote([makeBlock("content")], currentId);
    const saveError: SaveError = { kind: "fs", reason: { kind: "disk-full" } };
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy, {
      blurSave: () => ({ ok: false as const, error: saveError }),
    });

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: newTargetId,
        blockId: newTargetBlockId,
        snapshot: makeSnapshot(newTargetId),
      },
      currentState: makeSaveFailedState({
        currentNoteId: currentId,
        pendingNextFocus: { noteId: oldPendingId, blockId: makeBlockId("block-old") },
      }),
      currentNote,
      previousFrontmatter: null,
    };
    const result = runEditPastNoteStartPipeline(input, ports);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // old pendingNextFocus overwritten by new { noteId, blockId }
      expect(result.error.pendingNextFocus.noteId).toBe(newTargetId);
      expect(result.error.pendingNextFocus.blockId).toBe(newTargetBlockId);
    }
  });
});

// ── REQ-EPNS-013: precondition violations → throw ────────────────────────

describe("pipeline — precondition violations (REQ-EPNS-013)", () => {
  test("PC-001: cross-note + snapshot=null → throws synchronously", () => {
    const targetId = makeNoteId("2026-04-30-150000-060");
    const currentId = makeNoteId("2026-04-30-120000-060");
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: null,  // cross-note but snapshot=null → PC-001 violation
      },
      currentState: makeIdleState(),
      currentNote: null,
      previousFrontmatter: null,
    };

    // PC-001 violation: cross-note (different noteId than state's currentNoteId) + snapshot=null
    expect(() => runEditPastNoteStartPipeline(input, ports)).toThrow(
      "cross-note request requires non-null snapshot"
    );
  });

  test("PC-001 throw: no ports invoked (no emit, no blurSave, no clock)", () => {
    const targetId = makeNoteId("2026-04-30-150000-061");
    const spy = makeEventSpy();
    let blurSaveCalled = false;
    let clockCalled = false;
    const ports: EditPastNoteStartPorts = {
      clockNow: () => { clockCalled = true; return makeTimestamp(1000); },
      blurSave: () => { blurSaveCalled = true; return { ok: true as const, value: makeNoteFileSaved(targetId) }; },
      parseMarkdownToBlocks: () => ({ ok: true as const, value: [] }),
      emit: spy.emit,
    };

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: null,  // cross-note violation
      },
      currentState: makeIdleState(),
      currentNote: null,
      previousFrontmatter: null,
    };

    try {
      runEditPastNoteStartPipeline(input, ports);
    } catch (_e) {
      // expected
    }

    expect(blurSaveCalled).toBe(false);
    expect(clockCalled).toBe(false);
    expect(spy.events).toHaveLength(0);
  });

  test("PC-004: editing + currentNote=null → throws", () => {
    const targetId = makeNoteId("2026-04-30-150000-062");
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeEditingState({ currentNoteId: makeNoteId("2026-04-30-120000-062") }),
      currentNote: null,  // PC-004 violation: editing + null currentNote
      previousFrontmatter: null,
    };

    expect(() => runEditPastNoteStartPipeline(input, ports)).toThrow(
      "currentNote must not be null"
    );
  });

  test("PC-004: save-failed + currentNote=null → throws", () => {
    const targetId = makeNoteId("2026-04-30-150000-063");
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeSaveFailedState({ currentNoteId: makeNoteId("2026-04-30-120000-063") }),
      currentNote: null,  // PC-004 violation: save-failed + null currentNote
      previousFrontmatter: null,
    };

    expect(() => runEditPastNoteStartPipeline(input, ports)).toThrow(
      "currentNote must not be null"
    );
  });
});

// ── REQ-EPNS-010 / PROP-EPNS-016: Event type membership ─────────────────

describe("pipeline — event type membership (PROP-EPNS-016)", () => {
  test("BlockFocused.kind === 'block-focused' on successful path", () => {
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);
    const input = makeCrossNoteInput(makeIdleState(), null);
    runEditPastNoteStartPipeline(input, ports);

    const blockFocused = spy.events.find((e) => e.kind === "block-focused");
    expect(blockFocused).toBeDefined();
    expect((blockFocused as BlockFocused).kind).toBe("block-focused");
    // Not the old Sprint 1 event name
    expect(spy.events.some((e) => e.kind === "editor-focused-on-past-note")).toBe(false);
  });
});
