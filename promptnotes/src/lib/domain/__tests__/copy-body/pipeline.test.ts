/**
 * pipeline.test.ts — Full CopyBody pipeline integration tests.
 *
 * Sprint 3 migration: Note shape is now `{ id, blocks, frontmatter }`.
 * bodyForClipboard in CopyBodyPorts now delegates to serializeBlocksToMarkdown(note.blocks).
 *
 * REQ-001: Happy path → Ok(ClipboardText)
 * REQ-003: Only clipboardWrite as I/O port; clockNow at-most-once on success
 * REQ-004: Clipboard failure → Err(SaveError.fs)
 * REQ-005: NoteBodyCopiedToClipboard emitted on success only
 * REQ-006: Read-only — input state/note not mutated
 * REQ-007: Empty block arrangements still copy through
 * REQ-009: clockNow as the source of NoteBodyCopiedToClipboard.occurredOn
 * REQ-010: SaveError exhaustiveness — only fs variant produced
 * REQ-011: I/O budget table
 * REQ-012: noteId precondition (caller invariant)
 */

import { describe, test, expect } from "bun:test";
import type { Result } from "promptnotes-domain-types/util/result";
import type {
  BlockContent,
  BlockId,
  BlockType,
  Frontmatter,
  NoteId,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { FsError, SaveError } from "promptnotes-domain-types/shared/errors";
import type { ClipboardText } from "promptnotes-domain-types/capture/stages";
import type { EditingState } from "promptnotes-domain-types/capture/states";
import type { Block, Note } from "promptnotes-domain-types/shared/note";

import {
  copyBody,
  type CopyBodyPorts,
} from "$lib/domain/copy-body/pipeline";
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";

// ── Helpers ────────────────────────────────────────────────────────────────

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);
const id = (s: string): NoteId => s as unknown as NoteId;
const blockContent = (s: string): BlockContent => s as unknown as BlockContent;

let _blockCounter = 0;
function freshBlockId(): BlockId {
  return `blk-${++_blockCounter}` as unknown as BlockId;
}

function makeBlock(type: BlockType, content: string): Block {
  return {
    id: freshBlockId(),
    type,
    content: blockContent(content),
  } as unknown as Block;
}

function makeFrontmatter(): Frontmatter {
  return {
    tags: [],
    createdAt: ts(1000),
    updatedAt: ts(2000),
  } as unknown as Frontmatter;
}

function makeNote(blocks?: ReadonlyArray<Block>, overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? id("2026-04-30-120000-000"),
    blocks: blocks ?? [makeBlock("paragraph", "hello")],
    frontmatter: overrides.frontmatter ?? makeFrontmatter(),
  } as unknown as Note;
}

function makeEditingState(currentNoteId: NoteId): EditingState {
  return {
    status: "editing",
    currentNoteId,
    isDirty: false,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  } as EditingState;
}

type EmittedInternal = { kind: string; noteId: NoteId; occurredOn: Timestamp };

type PortLog = {
  clipboardCalls: string[];
  clockCalls: number;
  internalEvents: EmittedInternal[];
};

/**
 * The bodyForClipboard port delegates to the canonical serializer (REQ-013/014).
 * In Phase 2a, we pass this delegate explicitly as the `bodyForClipboard` port
 * so tests assert against the serializer's output rather than the old note.body.
 */
function bodyForClipboardDelegate(note: Note): string {
  return serializeBlocksToMarkdown(note.blocks);
}

function makeHappyPorts(log: PortLog, note: Note): CopyBodyPorts {
  return {
    clockNow: () => {
      log.clockCalls += 1;
      return ts(9999);
    },
    clipboardWrite: (text: string): Result<void, FsError> => {
      log.clipboardCalls.push(text);
      return { ok: true, value: undefined };
    },
    getCurrentNote: () => note,
    bodyForClipboard: bodyForClipboardDelegate,
    emitInternal: (e) => log.internalEvents.push(e),
  };
}

function makeFailingPorts(log: PortLog, note: Note, fsError: FsError): CopyBodyPorts {
  return {
    clockNow: () => {
      log.clockCalls += 1;
      return ts(9999);
    },
    clipboardWrite: (text: string): Result<void, FsError> => {
      log.clipboardCalls.push(text);
      return { ok: false, error: fsError };
    },
    getCurrentNote: () => note,
    bodyForClipboard: bodyForClipboardDelegate,
    emitInternal: (e) => log.internalEvents.push(e),
  };
}

function freshLog(): PortLog {
  return { clipboardCalls: [], clockCalls: 0, internalEvents: [] };
}

// ── REQ-001: Happy Path ─────────────────────────────────────────────────────

describe("REQ-001: copyBody happy path returns Ok(ClipboardText)", () => {
  test("returns Ok with kind 'ClipboardText', text from serializeBlocksToMarkdown, noteId from state", () => {
    const log = freshLog();
    const blocks: ReadonlyArray<Block> = [makeBlock("paragraph", "Hello clip")];
    const note = makeNote(blocks, { id: id("2026-04-30-120000-000") });
    const state = makeEditingState(note.id);
    const result = copyBody(makeHappyPorts(log, note))(state);

    expect(result.ok).toBe(true);
    if (!result.ok) return; // narrow
    const v: ClipboardText = result.value;
    expect(v.kind).toBe("ClipboardText");
    expect(v.text).toBe(serializeBlocksToMarkdown(blocks));
    expect(v.text).toBe("Hello clip");
    expect(v.noteId).toBe(note.id);
  });

  test("multi-block note: text is blocks joined with newline", () => {
    const log = freshLog();
    const blocks: ReadonlyArray<Block> = [
      makeBlock("heading-1", "Title"),
      makeBlock("paragraph", "body text"),
      makeBlock("bullet", "item"),
    ];
    const note = makeNote(blocks);
    const state = makeEditingState(note.id);
    const result = copyBody(makeHappyPorts(log, note))(state);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe("# Title\nbody text\n- item");
  });
});

// ── REQ-003 / REQ-005 / REQ-009 / REQ-011: success-path I/O budget ──────────

describe("REQ-003 / REQ-005 / REQ-009 / REQ-011: success-path I/O budget", () => {
  test("clipboardWrite is invoked exactly once with the serialized blocks string", () => {
    const log = freshLog();
    const blocks: ReadonlyArray<Block> = [makeBlock("paragraph", "xyz")];
    const note = makeNote(blocks);
    const state = makeEditingState(note.id);
    copyBody(makeHappyPorts(log, note))(state);
    expect(log.clipboardCalls.length).toBe(1);
    expect(log.clipboardCalls[0]).toBe("xyz");
    expect(log.clipboardCalls[0]).toBe(serializeBlocksToMarkdown(blocks));
  });

  test("clockNow is invoked exactly once on the success path", () => {
    const log = freshLog();
    const note = makeNote();
    const state = makeEditingState(note.id);
    copyBody(makeHappyPorts(log, note))(state);
    expect(log.clockCalls).toBe(1);
  });

  test("emitInternal is invoked exactly once with NoteBodyCopiedToClipboard payload", () => {
    const log = freshLog();
    const note = makeNote(undefined, { id: id("2026-04-30-120000-000") });
    const state = makeEditingState(note.id);
    copyBody(makeHappyPorts(log, note))(state);
    expect(log.internalEvents.length).toBe(1);
    const e = log.internalEvents[0];
    expect(e.kind).toBe("note-body-copied-to-clipboard");
    expect(e.noteId).toBe(note.id);
    expect(e.occurredOn).toEqual(ts(9999));
  });

  test("CaptureDeps.publish is statically unreachable from CopyBody (type-level)", () => {
    // CopyBody's deps slice (CopyBodyDeps) excludes `publish` and `allocateNoteId`.
    // The factory cannot reference `deps.publish` — it would not type-check.
    // This anchor test documents the type-level guarantee; no runtime assertion needed.
    expect(true).toBe(true);
  });
});

// ── REQ-004 / REQ-010: Failure path returns SaveError.fs ────────────────────

describe("REQ-004 / REQ-010: clipboard failure → Err(SaveError.fs)", () => {
  const variants: FsError[] = [
    { kind: "permission", path: "/tmp/x" },
    { kind: "disk-full" },
    { kind: "lock", path: "/tmp/y" },
    { kind: "not-found", path: "/tmp/z" },
    { kind: "unknown", detail: "boom" },
  ];

  for (const v of variants) {
    test(`FsError variant '${v.kind}' is wrapped in SaveError.fs verbatim`, () => {
      const log = freshLog();
      const note = makeNote();
      const state = makeEditingState(note.id);
      const result = copyBody(makeFailingPorts(log, note, v))(state);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      const err: SaveError = result.error;
      expect(err.kind).toBe("fs");
      if (err.kind !== "fs") return;
      expect(err.reason).toEqual(v);
    });
  }

  test("validation kind is never produced by copyBody", () => {
    const log = freshLog();
    const note = makeNote();
    const state = makeEditingState(note.id);
    const result = copyBody(
      makeFailingPorts(log, note, { kind: "unknown", detail: "x" }),
    )(state);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).not.toBe("validation");
  });
});

// ── REQ-005 / REQ-009 / REQ-011: failure-path I/O budget ────────────────────

describe("REQ-005 / REQ-009 / REQ-011: failure-path I/O budget", () => {
  test("on clipboard failure: clipboardWrite=1, clockNow=0, emitInternal=0", () => {
    const log = freshLog();
    const note = makeNote();
    const state = makeEditingState(note.id);
    copyBody(makeFailingPorts(log, note, { kind: "permission" }))(state);
    expect(log.clipboardCalls.length).toBe(1);
    expect(log.clockCalls).toBe(0);
    expect(log.internalEvents.length).toBe(0);
  });
});

// ── REQ-006: Read-only — input state and note not mutated ──────────────────

describe("REQ-006: copyBody does not mutate inputs", () => {
  test("EditingState fields are unchanged after a successful call", () => {
    const log = freshLog();
    const note = makeNote();
    const state = makeEditingState(note.id);
    const before = { ...state };
    copyBody(makeHappyPorts(log, note))(state);
    expect(state).toEqual(before);
  });

  test("Note reference identity preserved (no rewrap)", () => {
    const log = freshLog();
    const blocks: ReadonlyArray<Block> = [makeBlock("paragraph", "stable")];
    const note = makeNote(blocks);
    const state = makeEditingState(note.id);
    const blocksRef = note.blocks;
    const fmRef = note.frontmatter;
    copyBody(makeHappyPorts(log, note))(state);
    expect(note.blocks).toBe(blocksRef);
    expect(note.frontmatter).toBe(fmRef);
  });

  test("Object.freeze on inputs does not cause copyBody to throw", () => {
    const log = freshLog();
    const note = Object.freeze(makeNote()) as Note;
    const state = Object.freeze(makeEditingState(note.id));
    expect(() => copyBody(makeHappyPorts(log, note))(state)).not.toThrow();
  });
});

// ── REQ-007: Empty / minimal block arrangements still copy ─────────────────

describe("REQ-007: empty and minimal block arrangements are copied through", () => {
  test("single empty paragraph block → Ok with text=''", () => {
    const log = freshLog();
    const note = makeNote([makeBlock("paragraph", "")]);
    const state = makeEditingState(note.id);
    const result = copyBody(makeHappyPorts(log, note))(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe("");
    expect(log.clipboardCalls).toEqual([""]);
    expect(log.internalEvents.length).toBe(1);
  });

  test("single divider block → Ok with text='---'", () => {
    const log = freshLog();
    const note = makeNote([makeBlock("divider", "")]);
    const state = makeEditingState(note.id);
    const result = copyBody(makeHappyPorts(log, note))(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe("---");
    expect(log.clipboardCalls).toEqual(["---"]);
  });

  test("whitespace-only paragraph content is preserved verbatim", () => {
    const log = freshLog();
    // Note: whitespace-only content "   " in a paragraph is preserved as-is
    const note = makeNote([makeBlock("paragraph", "   ")]);
    const state = makeEditingState(note.id);
    const result = copyBody(makeHappyPorts(log, note))(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe("   ");
  });

  test("no EmptyNoteDiscarded event — CopyBody always copies regardless of emptiness", () => {
    // EmptyNoteDiscarded is a CaptureAutoSave-only event; CopyBody never emits it.
    const log = freshLog();
    const note = makeNote([makeBlock("paragraph", "")]);
    const state = makeEditingState(note.id);
    copyBody(makeHappyPorts(log, note))(state);
    // The only event emitted is NoteBodyCopiedToClipboard (kind verified above).
    // No other events are observable via this interface.
    expect(log.internalEvents.every((e) => e.kind === "note-body-copied-to-clipboard")).toBe(true);
  });
});

// ── REQ-012: noteId precondition documented (caller invariant) ─────────────

describe("REQ-012: noteId precondition (caller invariant — not enforced at runtime)", () => {
  test("when note.id matches state.currentNoteId, the result.value.noteId matches", () => {
    const log = freshLog();
    const noteId = id("2026-04-30-120000-000");
    const note = makeNote(undefined, { id: noteId });
    const state = makeEditingState(noteId);
    const result = copyBody(makeHappyPorts(log, note))(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.noteId).toBe(noteId);
  });
});
