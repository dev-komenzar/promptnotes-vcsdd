/**
 * step3-start-new-session.test.ts — Sprint 2 block-based tests for startNewSession
 *
 * REQ-EPNS-008: startNewSession with focusedBlockId, cross-note vs same-note hydration
 * REQ-EPNS-010: BlockFocused emitted (replaces EditorFocusedOnPastNote)
 * REQ-EPNS-012: Clock.now() called exactly once
 *
 * Sprint 2 changes:
 * - startNewSession accepts BlockFocusRequest (not PastNoteSelection)
 * - NewSession.focusedBlockId: BlockId (new field)
 * - Cross-note path: hydrate snapshot via parseMarkdownToBlocks
 * - Same-note path: reuse existing currentNote from decision payload (no hydration)
 * - BlockFocused event: { kind: 'block-focused', noteId, blockId, occurredOn }
 *   replaces EditorFocusedOnPastNote: { kind: 'editor-focused-on-past-note', noteId }
 * - No 'body' property on Note; blocks is the primary data
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
  BlockFocusRequest,
  CurrentSessionDecision,
} from "promptnotes-domain-types/capture/stages";
import type { BlockFocused } from "promptnotes-domain-types/capture/internal-events";

import {
  startNewSession,
  type StartNewSessionPorts,
} from "../../edit-past-note-start/start-new-session";

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

function makeSnapshot(noteId: NoteId, bodyText = "past note content"): NoteFileSnapshot {
  return {
    noteId,
    body: bodyText as unknown as Frontmatter,
    frontmatter: makeFrontmatter(),
    filePath: "/vault/past-note.md",
    fileMtime: makeTimestamp(1000),
  } as unknown as NoteFileSnapshot;
}

function makeRequest(noteId: NoteId, blockId: BlockId, snapshot: NoteFileSnapshot | null): BlockFocusRequest {
  return {
    kind: "BlockFocusRequest",
    noteId,
    blockId,
    snapshot,
  };
}

function makeEventSpy() {
  const events: Array<{ kind: string; [k: string]: unknown }> = [];
  return {
    events,
    emit: (e: { kind: string; [k: string]: unknown }) => events.push(e),
  };
}

/** Stub parseMarkdownToBlocks for cross-note hydration */
function makeParseMarkdownToBlocks(blocks: ReadonlyArray<Block>) {
  return (_markdown: string) => ({ ok: true as const, value: blocks });
}

// ── REQ-EPNS-008: Cross-note path — snapshot hydration ───────────────────

describe("startNewSession — cross-note path (REQ-EPNS-008)", () => {
  test("cross-note: NewSession.noteId === request.noteId", () => {
    const targetId = makeNoteId("2026-04-30-150000-000");
    const blockId = makeBlockId("block-past-001");
    const snapshot = makeSnapshot(targetId, "past content");
    const request = makeRequest(targetId, blockId, snapshot);
    // decision was 'no-current' or 'dirty' or 'empty' (cross-note)
    const flushedDecision: CurrentSessionDecision = { kind: "no-current" };
    const now = makeTimestamp(9000);
    const spy = makeEventSpy();
    const hydrated = [makeBlock("past content", "paragraph", "block-0")];
    const ports: StartNewSessionPorts = {
      clockNow: () => now,
      parseMarkdownToBlocks: makeParseMarkdownToBlocks(hydrated),
      emit: spy.emit,
    };

    const result = startNewSession(request, flushedDecision, ports);

    expect(result.kind).toBe("NewSession");
    expect(result.noteId).toBe(targetId);
    expect(result.startedAt).toBe(now);
  });

  test("cross-note: NewSession.focusedBlockId === request.blockId", () => {
    const targetId = makeNoteId("2026-04-30-150000-001");
    const blockId = makeBlockId("block-past-002");
    const snapshot = makeSnapshot(targetId);
    const request = makeRequest(targetId, blockId, snapshot);
    const flushedDecision: CurrentSessionDecision = { kind: "no-current" };
    const hydrated = [makeBlock("content", "paragraph", "block-0")];
    const spy = makeEventSpy();
    const ports: StartNewSessionPorts = {
      clockNow: () => makeTimestamp(9000),
      parseMarkdownToBlocks: makeParseMarkdownToBlocks(hydrated),
      emit: spy.emit,
    };

    const result = startNewSession(request, flushedDecision, ports);
    expect(result.focusedBlockId).toBe(blockId);
  });

  test("cross-note: note is hydrated from snapshot via parseMarkdownToBlocks", () => {
    const targetId = makeNoteId("2026-04-30-150000-002");
    const blockId = makeBlockId("block-past-003");
    const snapshot = makeSnapshot(targetId, "specific body content");
    const request = makeRequest(targetId, blockId, snapshot);
    const flushedDecision: CurrentSessionDecision = { kind: "empty", noteId: makeNoteId("2026-04-30-120000-000") };
    const hydratedBlocks = [makeBlock("specific body content", "paragraph", "block-hydrated")];
    const spy = makeEventSpy();
    let parsedMarkdown: string | null = null;
    const ports: StartNewSessionPorts = {
      clockNow: () => makeTimestamp(9000),
      parseMarkdownToBlocks: (markdown: string) => {
        parsedMarkdown = markdown;
        return { ok: true as const, value: hydratedBlocks };
      },
      emit: spy.emit,
    };

    const result = startNewSession(request, flushedDecision, ports);

    // parseMarkdownToBlocks was called with snapshot.body
    expect(parsedMarkdown).toBe("specific body content");
    // note.blocks comes from the hydration result
    expect(result.note.blocks).toEqual(hydratedBlocks);
    expect(result.note.id).toBe(targetId);
  });
});

// ── REQ-EPNS-008: Same-note path — no hydration ──────────────────────────

describe("startNewSession — same-note path (REQ-EPNS-008)", () => {
  test("same-note: NewSession.note is same object as currentNote (no hydration)", () => {
    const noteId = makeNoteId("2026-04-30-120000-010");
    const blockId = makeBlockId("block-new-focus");
    const currentNote = makeNote([makeBlock("current content")], noteId);
    const request = makeRequest(noteId, blockId, null);
    const flushedDecision: CurrentSessionDecision = { kind: "same-note", noteId, note: currentNote };
    const spy = makeEventSpy();
    let parseCalled = false;
    const ports: StartNewSessionPorts = {
      clockNow: () => makeTimestamp(8000),
      parseMarkdownToBlocks: (_markdown: string) => {
        parseCalled = true;
        return { ok: true as const, value: [] };
      },
      emit: spy.emit,
    };

    const result = startNewSession(request, flushedDecision, ports);

    // note is the same object from the same-note decision payload
    expect(result.note).toBe(currentNote);
    // parseMarkdownToBlocks NOT called on same-note path (PROP-EPNS-025)
    expect(parseCalled).toBe(false);
  });

  test("same-note: focusedBlockId set to request.blockId", () => {
    const noteId = makeNoteId("2026-04-30-120000-011");
    const newBlockId = makeBlockId("block-moved-to");
    const currentNote = makeNote([makeBlock("")], noteId);
    const request = makeRequest(noteId, newBlockId, null);
    const flushedDecision: CurrentSessionDecision = { kind: "same-note", noteId, note: currentNote };
    const spy = makeEventSpy();
    const ports: StartNewSessionPorts = {
      clockNow: () => makeTimestamp(8000),
      parseMarkdownToBlocks: () => { throw new Error("should not be called"); },
      emit: spy.emit,
    };

    const result = startNewSession(request, flushedDecision, ports);
    expect(result.focusedBlockId).toBe(newBlockId);
    expect(result.noteId).toBe(noteId);
  });

  test("same-note: NewSession is returned (Ok result)", () => {
    const noteId = makeNoteId("2026-04-30-120000-012");
    const blockId = makeBlockId("block-same");
    const currentNote = makeNote([makeBlock("")], noteId);
    const request = makeRequest(noteId, blockId, null);
    const flushedDecision: CurrentSessionDecision = { kind: "same-note", noteId, note: currentNote };
    const spy = makeEventSpy();
    const ports: StartNewSessionPorts = {
      clockNow: () => makeTimestamp(8000),
      parseMarkdownToBlocks: () => { throw new Error("should not be called"); },
      emit: spy.emit,
    };

    const result = startNewSession(request, flushedDecision, ports);
    expect(result.kind).toBe("NewSession");
  });
});

// ── REQ-EPNS-010: BlockFocused emitted ───────────────────────────────────

describe("startNewSession — BlockFocused event (REQ-EPNS-010)", () => {
  test("cross-note: emits BlockFocused with noteId, blockId, occurredOn", () => {
    const targetId = makeNoteId("2026-04-30-150000-020");
    const blockId = makeBlockId("block-focused-target");
    const snapshot = makeSnapshot(targetId);
    const request = makeRequest(targetId, blockId, snapshot);
    const flushedDecision: CurrentSessionDecision = { kind: "no-current" };
    const now = makeTimestamp(10000);
    const spy = makeEventSpy();
    const ports: StartNewSessionPorts = {
      clockNow: () => now,
      parseMarkdownToBlocks: makeParseMarkdownToBlocks([makeBlock("content")]),
      emit: spy.emit,
    };

    startNewSession(request, flushedDecision, ports);

    expect(spy.events).toHaveLength(1);
    const event = spy.events[0] as BlockFocused;
    // Sprint 2: BlockFocused replaces EditorFocusedOnPastNote
    expect(event.kind).toBe("block-focused");
    expect(event.noteId).toBe(targetId);
    expect(event.blockId).toBe(blockId);
    expect(event.occurredOn).toBe(now);
  });

  test("same-note: emits BlockFocused with noteId and new blockId", () => {
    const noteId = makeNoteId("2026-04-30-120000-021");
    const newBlockId = makeBlockId("block-intra-note");
    const currentNote = makeNote([makeBlock("content")], noteId);
    const request = makeRequest(noteId, newBlockId, null);
    const flushedDecision: CurrentSessionDecision = { kind: "same-note", noteId, note: currentNote };
    const now = makeTimestamp(11000);
    const spy = makeEventSpy();
    const ports: StartNewSessionPorts = {
      clockNow: () => now,
      parseMarkdownToBlocks: () => { throw new Error("should not be called"); },
      emit: spy.emit,
    };

    startNewSession(request, flushedDecision, ports);

    expect(spy.events).toHaveLength(1);
    const event = spy.events[0] as BlockFocused;
    expect(event.kind).toBe("block-focused");
    expect(event.noteId).toBe(noteId);
    expect(event.blockId).toBe(newBlockId);
    expect(event.occurredOn).toBe(now);
  });

  // REQ-EPNS-010: BlockFocused is emitted exactly once
  test("BlockFocused emitted exactly once per invocation", () => {
    const targetId = makeNoteId("2026-04-30-150000-022");
    const blockId = makeBlockId("block-exactly-once");
    const snapshot = makeSnapshot(targetId);
    const request = makeRequest(targetId, blockId, snapshot);
    const flushedDecision: CurrentSessionDecision = { kind: "no-current" };
    const spy = makeEventSpy();
    const ports: StartNewSessionPorts = {
      clockNow: () => makeTimestamp(10000),
      parseMarkdownToBlocks: makeParseMarkdownToBlocks([makeBlock("content")]),
      emit: spy.emit,
    };

    startNewSession(request, flushedDecision, ports);

    const blockFocusedEvents = spy.events.filter((e) => e.kind === "block-focused");
    expect(blockFocusedEvents).toHaveLength(1);
  });

  // BlockFocused.occurredOn === NewSession.startedAt
  test("BlockFocused.occurredOn equals NewSession.startedAt (same Clock.now() call)", () => {
    const targetId = makeNoteId("2026-04-30-150000-023");
    const blockId = makeBlockId("block-ts-check");
    const snapshot = makeSnapshot(targetId);
    const request = makeRequest(targetId, blockId, snapshot);
    const flushedDecision: CurrentSessionDecision = { kind: "no-current" };
    const now = makeTimestamp(42000);
    const spy = makeEventSpy();
    const ports: StartNewSessionPorts = {
      clockNow: () => now,
      parseMarkdownToBlocks: makeParseMarkdownToBlocks([makeBlock("content")]),
      emit: spy.emit,
    };

    const result = startNewSession(request, flushedDecision, ports);
    const event = spy.events[0] as BlockFocused;
    expect(event.occurredOn).toBe(result.startedAt);
  });

  // Verify it does NOT emit editor-focused-on-past-note (old Sprint 1 event)
  test("does NOT emit editor-focused-on-past-note (old event is gone)", () => {
    const targetId = makeNoteId("2026-04-30-150000-024");
    const blockId = makeBlockId("block-no-old-event");
    const snapshot = makeSnapshot(targetId);
    const request = makeRequest(targetId, blockId, snapshot);
    const flushedDecision: CurrentSessionDecision = { kind: "no-current" };
    const spy = makeEventSpy();
    const ports: StartNewSessionPorts = {
      clockNow: () => makeTimestamp(10000),
      parseMarkdownToBlocks: makeParseMarkdownToBlocks([makeBlock("content")]),
      emit: spy.emit,
    };

    startNewSession(request, flushedDecision, ports);
    const oldEvents = spy.events.filter((e) => e.kind === "editor-focused-on-past-note");
    expect(oldEvents).toHaveLength(0);
  });
});

// ── REQ-EPNS-012: Clock.now() called exactly once ────────────────────────

describe("startNewSession — Clock budget (REQ-EPNS-012)", () => {
  test("cross-note: Clock.now() called exactly once", () => {
    let clockCalls = 0;
    const targetId = makeNoteId("2026-04-30-150000-030");
    const snapshot = makeSnapshot(targetId);
    const request = makeRequest(targetId, makeBlockId("block-001"), snapshot);
    const flushedDecision: CurrentSessionDecision = { kind: "no-current" };
    const spy = makeEventSpy();
    const ports: StartNewSessionPorts = {
      clockNow: () => { clockCalls++; return makeTimestamp(11000); },
      parseMarkdownToBlocks: makeParseMarkdownToBlocks([makeBlock("content")]),
      emit: spy.emit,
    };

    startNewSession(request, flushedDecision, ports);
    expect(clockCalls).toBe(1);
  });

  test("same-note: Clock.now() called exactly once", () => {
    let clockCalls = 0;
    const noteId = makeNoteId("2026-04-30-120000-031");
    const currentNote = makeNote([makeBlock("")], noteId);
    const request = makeRequest(noteId, makeBlockId("block-002"), null);
    const flushedDecision: CurrentSessionDecision = { kind: "same-note", noteId, note: currentNote };
    const spy = makeEventSpy();
    const ports: StartNewSessionPorts = {
      clockNow: () => { clockCalls++; return makeTimestamp(11000); },
      parseMarkdownToBlocks: () => { throw new Error("should not be called"); },
      emit: spy.emit,
    };

    startNewSession(request, flushedDecision, ports);
    expect(clockCalls).toBe(1);
  });
});
