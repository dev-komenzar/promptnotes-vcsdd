/**
 * step1-classify-current-session.test.ts — Sprint 2 block-based tests for classifyCurrentSession
 *
 * REQ-EPNS-007: Pure classification of EditingSessionState
 * REQ-EPNS-001: IdleState → no-current
 * REQ-EPNS-002: EditingState + empty note + cross-note → empty
 * REQ-EPNS-003: EditingState + dirty note + cross-note → dirty
 * REQ-EPNS-005: same-noteId → same-note (EditingState and SaveFailedState)
 * REQ-EPNS-006: SaveFailedState + cross-note → dirty (regardless of isEmpty)
 * REQ-EPNS-013: precondition violations throw
 *
 * PROP-EPNS-001: Purity (referential transparency)
 * PROP-EPNS-002: IdleState → no-current
 * PROP-EPNS-003: EditingState → empty | dirty based on NoteOps.isEmpty (block-based)
 * PROP-EPNS-004: EditingState|SaveFailedState + same-noteId → same-note
 *
 * Sprint 2 (block-based): classifyCurrentSession now accepts 3 params:
 *   (EditingSessionState, BlockFocusRequest, Note | null) → CurrentSessionDecision
 *   Note.body is GONE; isEmpty is block-based: single empty paragraph.
 *   same-note detection is owned by classifyCurrentSession (no pre-pipeline guard).
 *   CurrentSessionDecision adds 4th variant: { kind: 'same-note', noteId, note }
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
import type {
  EditingState,
  IdleState,
  SaveFailedState,
} from "promptnotes-domain-types/capture/states";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type {
  BlockFocusRequest,
  CurrentSessionDecision,
} from "promptnotes-domain-types/capture/stages";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";

import { classifyCurrentSession } from "../../edit-past-note-start/classify-current-session";

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

/** Build a block. type defaults to 'paragraph'. */
function makeBlock(content: string, type: BlockType = "paragraph", id = "block-001"): Block {
  return {
    id: makeBlockId(id),
    type: type as unknown as BlockType,
    content: makeBlockContent(content),
  } as unknown as Block;
}

/** Build a Note with given blocks. */
function makeNote(blocks: ReadonlyArray<Block>, id?: NoteId): Note {
  return {
    id: id ?? makeNoteId("2026-04-30-120000-000"),
    blocks,
    frontmatter: makeFrontmatter(),
  } as unknown as Note;
}

/** Note with single empty paragraph — NoteOps.isEmpty === true */
function makeEmptyNote(id?: NoteId): Note {
  return makeNote([makeBlock("")], id);
}

/** Note with single whitespace-only paragraph — NoteOps.isEmpty === true */
function makeWhitespaceNote(id?: NoteId): Note {
  return makeNote([makeBlock("   ")], id);
}

/** Note with non-empty content — NoteOps.isEmpty === false */
function makeDirtyNote(id?: NoteId): Note {
  return makeNote([makeBlock("some content")], id);
}

/** Note with multiple blocks — NoteOps.isEmpty === false */
function makeMultiBlockNote(id?: NoteId): Note {
  return makeNote([makeBlock(""), makeBlock("")], id);
}

function makeSnapshot(noteId: NoteId): NoteFileSnapshot {
  return {
    noteId,
    body: "past note content" as unknown as Frontmatter,
    frontmatter: makeFrontmatter(),
    filePath: "/vault/test.md",
    fileMtime: makeTimestamp(1000),
  } as unknown as NoteFileSnapshot;
}

function makeRequest(noteId: NoteId, blockId?: BlockId, snapshot?: NoteFileSnapshot | null): BlockFocusRequest {
  return {
    kind: "BlockFocusRequest",
    noteId,
    blockId: blockId ?? makeBlockId("block-001"),
    snapshot: snapshot !== undefined ? snapshot : makeSnapshot(noteId),
  };
}

/** BlockFocusRequest with snapshot=null (same-note path) */
function makeSameNoteRequest(noteId: NoteId, blockId?: BlockId): BlockFocusRequest {
  return {
    kind: "BlockFocusRequest",
    noteId,
    blockId: blockId ?? makeBlockId("block-002"),
    snapshot: null,
  };
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
    focusedBlockId: opts?.focusedBlockId ?? makeBlockId("block-001"),
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

// ── REQ-EPNS-001 / PROP-EPNS-002: IdleState ──────────────────────────────

describe("classifyCurrentSession — IdleState (REQ-EPNS-001, PROP-EPNS-002)", () => {
  test("IdleState + cross-note request → { kind: 'no-current' }", () => {
    const state = makeIdleState();
    const request = makeRequest(makeNoteId("2026-04-30-150000-000"));
    const result = classifyCurrentSession(state, request, null);
    expect(result).toEqual({ kind: "no-current" });
  });

  test("IdleState + any noteId → always no-current (no currentNoteId to compare)", () => {
    const state = makeIdleState();
    // Even if request.noteId matches the "default" note — still no-current for idle
    const request = makeRequest(makeNoteId("2026-04-30-120000-000"));
    const result = classifyCurrentSession(state, request, null);
    expect(result.kind).toBe("no-current");
  });

  test("IdleState always returns no-current regardless of request.noteId variant", () => {
    const state = makeIdleState();
    const noteIds = [
      makeNoteId("2026-04-30-000000-001"),
      makeNoteId("2026-04-30-000000-002"),
      makeNoteId("2099-12-31-235959-999"),
    ];
    for (const noteId of noteIds) {
      const result = classifyCurrentSession(state, makeRequest(noteId), null);
      expect(result.kind).toBe("no-current");
    }
  });
});

// ── REQ-EPNS-002 / PROP-EPNS-003: EditingState + empty note + cross-note ─

describe("classifyCurrentSession — EditingState + empty note (REQ-EPNS-002)", () => {
  test("EditingState + single empty paragraph note + cross-note → { kind: 'empty', noteId }", () => {
    const currentId = makeNoteId("2026-04-30-120000-000");
    const targetId = makeNoteId("2026-04-30-150000-000");
    const state = makeEditingState({ currentNoteId: currentId });
    const request = makeRequest(targetId, makeBlockId("block-001"), makeSnapshot(targetId));
    const emptyNote = makeEmptyNote(currentId);

    const result = classifyCurrentSession(state, request, emptyNote);
    expect(result).toEqual({ kind: "empty", noteId: currentId });
  });

  test("EditingState + whitespace-only paragraph + cross-note → empty", () => {
    const currentId = makeNoteId("2026-04-30-120000-001");
    const targetId = makeNoteId("2026-04-30-150000-001");
    const state = makeEditingState({ currentNoteId: currentId });
    const request = makeRequest(targetId, makeBlockId("block-001"), makeSnapshot(targetId));
    const wsNote = makeWhitespaceNote(currentId);

    const result = classifyCurrentSession(state, request, wsNote);
    expect(result.kind).toBe("empty");
    if (result.kind === "empty") {
      expect(result.noteId).toBe(currentId);
    }
  });

  // Edge: multi-block (even if all empty) → dirty, not empty (per REQ-EPNS-002 spec)
  test("EditingState + multiple empty paragraphs + cross-note → dirty (not empty)", () => {
    const currentId = makeNoteId("2026-04-30-120000-002");
    const targetId = makeNoteId("2026-04-30-150000-002");
    const state = makeEditingState({ currentNoteId: currentId });
    const request = makeRequest(targetId, makeBlockId("block-001"), makeSnapshot(targetId));
    const multiNote = makeMultiBlockNote(currentId);

    // NoteOps.isEmpty: blocks.length === 1 AND blocks[0] is empty paragraph
    // Two empty paragraphs → NOT empty → dirty
    const result = classifyCurrentSession(state, request, multiNote);
    expect(result.kind).toBe("dirty");
  });

  // Edge: single heading block (even empty) → dirty, not empty
  test("EditingState + single empty heading-1 block + cross-note → dirty", () => {
    const currentId = makeNoteId("2026-04-30-120000-003");
    const targetId = makeNoteId("2026-04-30-150000-003");
    const state = makeEditingState({ currentNoteId: currentId });
    const request = makeRequest(targetId, makeBlockId("block-001"), makeSnapshot(targetId));
    const headingNote = makeNote([makeBlock("", "heading-1" as unknown as BlockType)], currentId);

    const result = classifyCurrentSession(state, request, headingNote);
    expect(result.kind).toBe("dirty");
  });
});

// ── REQ-EPNS-003 / PROP-EPNS-003: EditingState + dirty note + cross-note ─

describe("classifyCurrentSession — EditingState + non-empty note (REQ-EPNS-003)", () => {
  test("EditingState + non-empty note + cross-note → { kind: 'dirty', noteId, note }", () => {
    const currentId = makeNoteId("2026-04-30-120000-004");
    const targetId = makeNoteId("2026-04-30-150000-004");
    const state = makeEditingState({ currentNoteId: currentId });
    const request = makeRequest(targetId, makeBlockId("block-001"), makeSnapshot(targetId));
    const dirtyNote = makeDirtyNote(currentId);

    const result = classifyCurrentSession(state, request, dirtyNote);
    expect(result).toEqual({ kind: "dirty", noteId: currentId, note: dirtyNote });
  });

  test("EditingState + isDirty=false but non-empty note → classified as dirty (isEmpty check, not isDirty flag)", () => {
    const currentId = makeNoteId("2026-04-30-120000-005");
    const targetId = makeNoteId("2026-04-30-150000-005");
    const state = makeEditingState({ currentNoteId: currentId, isDirty: false });
    const request = makeRequest(targetId, makeBlockId("block-001"), makeSnapshot(targetId));
    const note = makeDirtyNote(currentId);

    const result = classifyCurrentSession(state, request, note);
    // isDirty flag is irrelevant; classification is purely by isEmpty
    expect(result.kind).toBe("dirty");
  });
});

// ── REQ-EPNS-005 / PROP-EPNS-004: same-note detection ────────────────────

describe("classifyCurrentSession — same-note path (REQ-EPNS-005, PROP-EPNS-004)", () => {
  test("EditingState + same-noteId → { kind: 'same-note', noteId, note }", () => {
    const noteId = makeNoteId("2026-04-30-120000-006");
    const state = makeEditingState({ currentNoteId: noteId });
    const request = makeSameNoteRequest(noteId, makeBlockId("block-002"));
    const note = makeDirtyNote(noteId);

    const result = classifyCurrentSession(state, request, note);
    expect(result).toEqual({ kind: "same-note", noteId, note });
  });

  test("SaveFailedState + same-noteId → { kind: 'same-note', noteId, note }", () => {
    const noteId = makeNoteId("2026-04-30-120000-007");
    const state = makeSaveFailedState({ currentNoteId: noteId });
    const request = makeSameNoteRequest(noteId);
    const note = makeDirtyNote(noteId);

    const result = classifyCurrentSession(state, request, note);
    expect(result).toEqual({ kind: "same-note", noteId, note });
  });

  // Idempotent re-focus: same block → still same-note
  test("EditingState + same-noteId + same-blockId → same-note (idempotent)", () => {
    const noteId = makeNoteId("2026-04-30-120000-008");
    const blockId = makeBlockId("block-001");
    const state = makeEditingState({ currentNoteId: noteId, focusedBlockId: blockId });
    const request = makeSameNoteRequest(noteId, blockId);
    const note = makeDirtyNote(noteId);

    const result = classifyCurrentSession(state, request, note);
    expect(result.kind).toBe("same-note");
  });

  // same-note with empty note: classified as same-note (not empty), because it's same-note
  test("EditingState + same-noteId + empty note → same-note (isEmpty not checked for same-noteId)", () => {
    const noteId = makeNoteId("2026-04-30-120000-009");
    const state = makeEditingState({ currentNoteId: noteId });
    const request = makeSameNoteRequest(noteId);
    const emptyNote = makeEmptyNote(noteId);

    const result = classifyCurrentSession(state, request, emptyNote);
    // same-note takes priority over isEmpty check
    expect(result.kind).toBe("same-note");
  });
});

// ── REQ-EPNS-006: SaveFailedState + cross-note → dirty ───────────────────

describe("classifyCurrentSession — SaveFailedState + cross-note (REQ-EPNS-006)", () => {
  test("SaveFailedState + cross-note + non-empty note → dirty", () => {
    const currentId = makeNoteId("2026-04-30-120000-010");
    const targetId = makeNoteId("2026-04-30-150000-010");
    const state = makeSaveFailedState({ currentNoteId: currentId });
    const request = makeRequest(targetId, makeBlockId("block-001"), makeSnapshot(targetId));
    const note = makeDirtyNote(currentId);

    const result = classifyCurrentSession(state, request, note);
    expect(result.kind).toBe("dirty");
    if (result.kind === "dirty") {
      expect(result.noteId).toBe(currentId);
      expect(result.note).toBe(note);
    }
  });

  // SaveFailedState + cross-note + EMPTY note → still dirty (NOT empty)
  test("SaveFailedState + cross-note + empty note → dirty (never empty for save-failed)", () => {
    const currentId = makeNoteId("2026-04-30-120000-011");
    const targetId = makeNoteId("2026-04-30-150000-011");
    const state = makeSaveFailedState({ currentNoteId: currentId });
    const request = makeRequest(targetId, makeBlockId("block-001"), makeSnapshot(targetId));
    const emptyNote = makeEmptyNote(currentId);

    // Per REQ-EPNS-007 classification table:
    // SaveFailedState + cross-note → always 'dirty' regardless of isEmpty
    const result = classifyCurrentSession(state, request, emptyNote);
    expect(result.kind).toBe("dirty");
  });

  test("SaveFailedState with prior pendingNextFocus + new cross-note request → dirty", () => {
    const currentId = makeNoteId("2026-04-30-120000-012");
    const oldPendingId = makeNoteId("2026-04-30-130000-000");
    const newTargetId = makeNoteId("2026-04-30-150000-012");
    const state = makeSaveFailedState({
      currentNoteId: currentId,
      pendingNextFocus: { noteId: oldPendingId, blockId: makeBlockId("block-x") },
    });
    const request = makeRequest(newTargetId, makeBlockId("block-001"), makeSnapshot(newTargetId));
    const note = makeDirtyNote(currentId);

    const result = classifyCurrentSession(state, request, note);
    expect(result.kind).toBe("dirty");
    if (result.kind === "dirty") {
      expect(result.noteId).toBe(currentId);
    }
  });
});

// ── REQ-EPNS-007: function signature / purity ─────────────────────────────

describe("classifyCurrentSession — purity (REQ-EPNS-007)", () => {
  test("function accepts 3 params (state, request, currentNote)", () => {
    // Sprint 2 delta: 3 params (ClassifyCurrentSession widened signature)
    expect(classifyCurrentSession.length).toBe(3);
  });

  test("referential transparency: same inputs → same outputs", () => {
    const noteId = makeNoteId("2026-04-30-120000-013");
    const state = makeEditingState({ currentNoteId: noteId });
    const request = makeRequest(makeNoteId("2026-04-30-150000-013"), makeBlockId("block-001"), makeSnapshot(makeNoteId("2026-04-30-150000-013")));
    const note = makeDirtyNote(noteId);

    const r1 = classifyCurrentSession(state, request, note);
    const r2 = classifyCurrentSession(state, request, note);
    expect(r1).toEqual(r2);
  });
});

// ── REQ-EPNS-013: precondition violations ────────────────────────────────

describe("classifyCurrentSession — precondition violations (REQ-EPNS-013)", () => {
  test("SavingState → throws", () => {
    const state = {
      status: "saving" as const,
      currentNoteId: makeNoteId("2026-04-30-120000-010"),
      savingStartedAt: makeTimestamp(1000),
    };
    const request = makeRequest(makeNoteId("2026-04-30-150000-000"));
    expect(() => classifyCurrentSession(state, request, null)).toThrow("saving");
  });

  test("SwitchingState → throws", () => {
    const state = {
      status: "switching" as const,
      currentNoteId: makeNoteId("2026-04-30-120000-011"),
      pendingNextFocus: { noteId: makeNoteId("2026-04-30-120000-012"), blockId: makeBlockId("block-001") },
      savingStartedAt: makeTimestamp(1000),
    };
    const request = makeRequest(makeNoteId("2026-04-30-150000-000"));
    expect(() => classifyCurrentSession(state, request, null)).toThrow("switching");
  });

  test("EditingState + null currentNote → throws (PC-004)", () => {
    const state = makeEditingState();
    const request = makeRequest(makeNoteId("2026-04-30-150000-000"));
    expect(() => classifyCurrentSession(state, request, null)).toThrow("must not be null");
  });

  test("SaveFailedState + null currentNote → throws (PC-004)", () => {
    const state = makeSaveFailedState();
    const request = makeRequest(makeNoteId("2026-04-30-150000-000"));
    expect(() => classifyCurrentSession(state, request, null)).toThrow("must not be null");
  });
});
