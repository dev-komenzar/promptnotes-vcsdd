/**
 * PROP-EPNS-027: Precondition violation — throw behavior
 * Tier 2 — Example-based
 * Required: false
 *
 * For each of the enumerated precondition violations, calling the workflow
 * throws Error (or the Promise rejects with Error) AND no port is invoked
 * (verified by spy on clockNow, blurSave, parseMarkdownToBlocks, emit) AND
 * no state-machine field is mutated.
 *
 * Sub-cases:
 *   (a) PC-001: cross-note + request.snapshot === null
 *       → throws "EditPastNoteStart: cross-note request requires non-null snapshot"
 *   (b) PC-002: parseMarkdownToBlocks returns Err → throws
 *   (c) PC-004 (editing + null currentNote)
 *       → throws "EditPastNoteStart: currentNote must not be null when state.status is 'editing' or 'save-failed'"
 *   (d) PC-004 (save-failed + null currentNote) → same throw as (c)
 *
 * Revision 6 change: all violations throw (not return Err) — matches codebase convention.
 * Result type Result<NewSession, SwitchError> is unaffected.
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
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type {
  EditingState,
  SaveFailedState,
  IdleState,
} from "promptnotes-domain-types/capture/states";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";

import {
  runEditPastNoteStartPipeline,
  type EditPastNoteStartPorts,
  type EditPastNoteStartInput,
} from "../../../edit-past-note-start/pipeline";

// ── Helpers ───────────────────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId { return raw as unknown as NoteId; }
function makeBlockId(raw: string): BlockId { return raw as unknown as BlockId; }
function makeTimestamp(ms: number): Timestamp { return { epochMillis: ms } as unknown as Timestamp; }
function makeBlockContent(raw: string): BlockContent { return raw as unknown as BlockContent; }
function makeFrontmatter(): Frontmatter {
  return { tags: [], createdAt: makeTimestamp(1000), updatedAt: makeTimestamp(1000) } as unknown as Frontmatter;
}
function makeBlock(content: string, type: BlockType = "paragraph", id = "block-001"): Block {
  return { id: makeBlockId(id), type: type as unknown as BlockType, content: makeBlockContent(content) } as unknown as Block;
}
function makeNote(noteId: NoteId): Note {
  return { id: noteId, blocks: [makeBlock("content")], frontmatter: makeFrontmatter() } as unknown as Note;
}
function makeSnapshot(noteId: NoteId): NoteFileSnapshot {
  return {
    noteId,
    body: "content" as unknown as Frontmatter,
    frontmatter: makeFrontmatter(),
    filePath: "/vault/test.md",
    fileMtime: makeTimestamp(1000),
  } as unknown as NoteFileSnapshot;
}

/** Ports that record all invocations — used to assert no port was called */
function makeSpyPorts(targetNoteId: NoteId): {
  ports: EditPastNoteStartPorts;
  blurSaveCalled: () => boolean;
  clockCalled: () => boolean;
  emitCalled: () => boolean;
  parseCalled: () => boolean;
} {
  let blurSaveCalled = false;
  let clockCalled = false;
  let emitCalled = false;
  let parseCalled = false;
  const ports: EditPastNoteStartPorts = {
    clockNow: () => { clockCalled = true; return makeTimestamp(1000); },
    blurSave: () => { blurSaveCalled = true; return Promise.resolve({ ok: true as const, value: { kind: "note-file-saved", noteId: targetNoteId, blocks: [], body: "" as unknown as Frontmatter, frontmatter: makeFrontmatter(), previousFrontmatter: null, occurredOn: makeTimestamp(1000) } }); },
    parseMarkdownToBlocks: () => { parseCalled = true; return { ok: true as const, value: [] }; },
    emit: () => { emitCalled = true; },
  };
  return {
    ports,
    blurSaveCalled: () => blurSaveCalled,
    clockCalled: () => clockCalled,
    emitCalled: () => emitCalled,
    parseCalled: () => parseCalled,
  };
}

function makeIdleState(): IdleState { return { status: "idle" as const }; }
function makeEditingState(currentNoteId: NoteId): EditingState {
  return {
    status: "editing" as const,
    currentNoteId,
    focusedBlockId: makeBlockId("block-current"),
    isDirty: false,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  };
}
function makeSaveFailedState(currentNoteId: NoteId): SaveFailedState {
  return {
    status: "save-failed" as const,
    currentNoteId,
    pendingNextFocus: null,
    lastSaveError: { kind: "fs" as const, reason: { kind: "unknown" as const, detail: "test" } } as SaveError,
  };
}

// ── (a) PC-001: cross-note + snapshot=null ────────────────────────────────

describe("PROP-EPNS-027 (a): PC-001 — cross-note + snapshot=null → throw", () => {
  test("throws with message prefix 'EditPastNoteStart: cross-note request requires non-null snapshot'", async () => {
    const currentNoteId = makeNoteId("2026-04-30-120000-027");
    const targetId = makeNoteId("2026-04-30-150000-027");  // different from current
    const spy = makeSpyPorts(targetId);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: null,  // cross-note but null snapshot → PC-001 violation
      },
      currentState: makeIdleState(),
      currentNote: null,
      previousFrontmatter: null,
    };

    await expect(runEditPastNoteStartPipeline(input, spy.ports)).rejects.toThrow(
      "cross-note request requires non-null snapshot"
    );
  });

  test("PC-001 throw: no port is invoked (no emit, no blurSave, no clock, no parse)", async () => {
    const targetId = makeNoteId("2026-04-30-150000-028");
    const spy = makeSpyPorts(targetId);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: null,
      },
      currentState: makeIdleState(),
      currentNote: null,
      previousFrontmatter: null,
    };

    try { await runEditPastNoteStartPipeline(input, spy.ports); } catch (_) { /* expected */ }

    expect(spy.blurSaveCalled()).toBe(false);
    expect(spy.clockCalled()).toBe(false);
    expect(spy.emitCalled()).toBe(false);
    expect(spy.parseCalled()).toBe(false);
  });

  test("PC-001 throw on EditingState + cross-note + snapshot=null", async () => {
    const currentNoteId = makeNoteId("2026-04-30-120000-029");
    const targetId = makeNoteId("2026-04-30-150000-029");
    const spy = makeSpyPorts(targetId);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: null,
      },
      currentState: makeEditingState(currentNoteId),
      currentNote: makeNote(currentNoteId),
      previousFrontmatter: null,
    };

    await expect(runEditPastNoteStartPipeline(input, spy.ports)).rejects.toThrow(
      "cross-note request requires non-null snapshot"
    );
  });
});

// ── (b) PC-002: parseMarkdownToBlocks returns Err → throw ─────────────────

describe("PROP-EPNS-027 (b): PC-002 — parseMarkdownToBlocks failure → throw", () => {
  test("throws when parseMarkdownToBlocks returns Err (programming error, not recoverable)", async () => {
    const targetId = makeNoteId("2026-04-30-150000-030");
    const events: Array<{ kind: string }> = [];
    const ports: EditPastNoteStartPorts = {
      clockNow: () => makeTimestamp(1000),
      blurSave: () => Promise.resolve({ ok: true as const, value: { kind: "note-file-saved", noteId: targetId, blocks: [], body: "" as unknown as Frontmatter, frontmatter: makeFrontmatter(), previousFrontmatter: null, occurredOn: makeTimestamp(1000) } }),
      parseMarkdownToBlocks: () => ({
        ok: false as const,
        error: { kind: "malformed-structure", line: 1, detail: "test parse failure" },
      }),
      emit: (e) => { events.push(e as { kind: string }); },
    };

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeIdleState(),
      currentNote: null,
      previousFrontmatter: null,
    };

    // PC-002 violation: silent fallback to empty Note is PROHIBITED — must throw
    await expect(runEditPastNoteStartPipeline(input, ports)).rejects.toThrow();
    // No events should be emitted before the throw
    expect(events).toHaveLength(0);
  });
});

// ── (c) PC-004: editing + currentNote=null → throw ────────────────────────

describe("PROP-EPNS-027 (c): PC-004 — editing + currentNote=null → throw", () => {
  test("throws with message 'currentNote must not be null when state.status is editing or save-failed'", async () => {
    const currentNoteId = makeNoteId("2026-04-30-120000-031");
    const targetId = makeNoteId("2026-04-30-150000-031");
    const spy = makeSpyPorts(targetId);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeEditingState(currentNoteId),
      currentNote: null,  // PC-004 violation
      previousFrontmatter: null,
    };

    await expect(runEditPastNoteStartPipeline(input, spy.ports)).rejects.toThrow(
      "currentNote must not be null"
    );
  });

  test("PC-004 (editing) throw: no port is invoked", async () => {
    const currentNoteId = makeNoteId("2026-04-30-120000-032");
    const targetId = makeNoteId("2026-04-30-150000-032");
    const spy = makeSpyPorts(targetId);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeEditingState(currentNoteId),
      currentNote: null,
      previousFrontmatter: null,
    };

    try { await runEditPastNoteStartPipeline(input, spy.ports); } catch (_) { /* expected */ }

    expect(spy.blurSaveCalled()).toBe(false);
    expect(spy.clockCalled()).toBe(false);
    expect(spy.emitCalled()).toBe(false);
    expect(spy.parseCalled()).toBe(false);
  });
});

// ── (d) PC-004: save-failed + currentNote=null → throw ────────────────────

describe("PROP-EPNS-027 (d): PC-004 — save-failed + currentNote=null → throw", () => {
  test("throws with message 'currentNote must not be null when state.status is editing or save-failed'", async () => {
    const currentNoteId = makeNoteId("2026-04-30-120000-033");
    const targetId = makeNoteId("2026-04-30-150000-033");
    const spy = makeSpyPorts(targetId);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeSaveFailedState(currentNoteId),
      currentNote: null,  // PC-004 violation
      previousFrontmatter: null,
    };

    await expect(runEditPastNoteStartPipeline(input, spy.ports)).rejects.toThrow(
      "currentNote must not be null"
    );
  });

  test("PC-004 (save-failed) throw: no port is invoked", async () => {
    const currentNoteId = makeNoteId("2026-04-30-120000-034");
    const targetId = makeNoteId("2026-04-30-150000-034");
    const spy = makeSpyPorts(targetId);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeSaveFailedState(currentNoteId),
      currentNote: null,
      previousFrontmatter: null,
    };

    try { await runEditPastNoteStartPipeline(input, spy.ports); } catch (_) { /* expected */ }

    expect(spy.blurSaveCalled()).toBe(false);
    expect(spy.clockCalled()).toBe(false);
    expect(spy.emitCalled()).toBe(false);
    expect(spy.parseCalled()).toBe(false);
  });
});

// ── (e) PC-004: idle + currentNote !== null → throw (FIND-EPNS-S2-P3-001, R6-002) ──

describe("PROP-EPNS-027 (e): PC-004 — idle + currentNote !== null → throw", () => {
  test("throws when state is idle but currentNote is non-null (state/note inconsistency)", async () => {
    const targetId = makeNoteId("2026-04-30-150000-035");
    const note = makeNote(targetId);
    const spy = makeSpyPorts(targetId);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeIdleState(),
      currentNote: note,  // PC-004 violation: idle must have currentNote === null
      previousFrontmatter: null,
    };

    await expect(runEditPastNoteStartPipeline(input, spy.ports)).rejects.toThrow();
  });

  test("PC-004 (idle + non-null) throw: no port is invoked (no clockNow, blurSave, emit, parse)", async () => {
    const targetId = makeNoteId("2026-04-30-150000-036");
    const note = makeNote(targetId);
    const spy = makeSpyPorts(targetId);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeIdleState(),
      currentNote: note,  // PC-004 violation
      previousFrontmatter: null,
    };

    try { await runEditPastNoteStartPipeline(input, spy.ports); } catch (_) { /* expected */ }

    expect(spy.blurSaveCalled()).toBe(false);
    expect(spy.clockCalled()).toBe(false);
    expect(spy.emitCalled()).toBe(false);
    expect(spy.parseCalled()).toBe(false);
  });
});

// ── (b) extended: clockNow NOT called on PC-002 throw (FIND-EPNS-S2-P3-004) ──

describe("PROP-EPNS-027 (b) extended: PC-002 — clockNow must NOT be called before parse fails", () => {
  test("clockNow is called zero times when parseMarkdownToBlocks fails (clock must come after parse)", async () => {
    const targetId = makeNoteId("2026-04-30-150000-037");
    let clockCallCount = 0;
    const events: Array<{ kind: string }> = [];
    const ports: EditPastNoteStartPorts = {
      clockNow: () => { clockCallCount++; return makeTimestamp(1000); },
      blurSave: () => Promise.resolve({ ok: true as const, value: { kind: "note-file-saved", noteId: targetId, blocks: [], body: "" as unknown as Frontmatter, frontmatter: makeFrontmatter(), previousFrontmatter: null, occurredOn: makeTimestamp(1000) } }),
      parseMarkdownToBlocks: () => ({
        ok: false as const,
        error: { kind: "malformed-structure", line: 1, detail: "clock-order test failure" },
      }),
      emit: (e) => { events.push(e as { kind: string }); },
    };

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId: targetId,
        blockId: makeBlockId("block-001"),
        snapshot: makeSnapshot(targetId),
      },
      currentState: makeIdleState(),
      currentNote: null,
      previousFrontmatter: null,
    };

    // PC-002: parse failure must throw before clockNow is invoked
    await expect(runEditPastNoteStartPipeline(input, ports)).rejects.toThrow();
    // After impl reorder (FIND-004 fix): clockNow must be zero on parse failure
    expect(clockCallCount).toBe(0);
    expect(events).toHaveLength(0);
  });
});
