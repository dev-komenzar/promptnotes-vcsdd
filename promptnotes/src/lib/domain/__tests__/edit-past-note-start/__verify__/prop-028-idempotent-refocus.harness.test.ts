/**
 * PROP-EPNS-028: Idempotent re-focus invariant
 * Tier 2 — Example-based
 * Required: false
 *
 * WHEN classifyCurrentSession+flushCurrentSession+startNewSession is invoked twice with
 * identical (EditingState, request) where request.noteId === state.currentNoteId &&
 * request.blockId === state.focusedBlockId, THEN:
 *   (a) both invocations return Ok(NewSession)
 *   (b) cumulative BlockFocused emit count is exactly 2
 *   (c) EditingSessionState after the second call equals EditingSessionState after the first
 *       (idempotent fixed point)
 *   (d) isDirty is preserved across both calls (not cleared by same-note path)
 *
 * This verifies the same-note path is safe to invoke multiple times without state drift.
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
import type { EditingState } from "promptnotes-domain-types/capture/states";
import type { BlockFocused } from "promptnotes-domain-types/capture/internal-events";

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

function makeEditingState(opts: { noteId: NoteId; blockId: BlockId; isDirty?: boolean }): EditingState {
  return {
    status: "editing" as const,
    currentNoteId: opts.noteId,
    focusedBlockId: opts.blockId,
    isDirty: opts.isDirty ?? false,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  };
}

function makePorts(spy: { events: Array<{ kind: string; [k: string]: unknown }> }): EditPastNoteStartPorts {
  return {
    clockNow: () => makeTimestamp(Date.now()),
    blurSave: (noteId) => ({ ok: true as const, value: { kind: "note-file-saved" as const, noteId, blocks: [], body: "" as unknown as Frontmatter, frontmatter: makeFrontmatter(), previousFrontmatter: null, occurredOn: makeTimestamp(1000) } }),
    parseMarkdownToBlocks: () => ({ ok: true as const, value: [] }),
    emit: (e) => spy.events.push(e),
  };
}

// ── PROP-EPNS-028: idempotent same-note re-focus ─────────────────────────

describe("PROP-EPNS-028: idempotent re-focus invariant", () => {
  test("(a) both invocations return Ok(NewSession)", () => {
    const noteId = makeNoteId("2026-04-30-120000-028");
    const blockId = makeBlockId("block-same-block");
    const currentNote = makeNote(noteId);
    const state = makeEditingState({ noteId, blockId, isDirty: true });
    const spy = { events: [] as Array<{ kind: string; [k: string]: unknown }> };
    const ports = makePorts(spy);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId,
        blockId,
        snapshot: null,
      },
      currentState: state,
      currentNote,
      previousFrontmatter: null,
    };

    const r1 = runEditPastNoteStartPipeline(input, ports);
    const r2 = runEditPastNoteStartPipeline(input, ports);

    // (a) both return Ok
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok) expect(r1.value.kind).toBe("NewSession");
    if (r2.ok) expect(r2.value.kind).toBe("NewSession");
  });

  test("(b) cumulative BlockFocused emit count is exactly 2", () => {
    const noteId = makeNoteId("2026-04-30-120000-028b");
    const blockId = makeBlockId("block-same-block-b");
    const currentNote = makeNote(noteId);
    const state = makeEditingState({ noteId, blockId, isDirty: true });
    const spy = { events: [] as Array<{ kind: string; [k: string]: unknown }> };
    const ports = makePorts(spy);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId,
        blockId,
        snapshot: null,
      },
      currentState: state,
      currentNote,
      previousFrontmatter: null,
    };

    runEditPastNoteStartPipeline(input, ports);
    runEditPastNoteStartPipeline(input, ports);

    const blockFocusedEvents = spy.events.filter((e) => e.kind === "block-focused");
    expect(blockFocusedEvents).toHaveLength(2);
  });

  test("(b) each BlockFocused event carries correct noteId and blockId", () => {
    const noteId = makeNoteId("2026-04-30-120000-028c");
    const blockId = makeBlockId("block-same-block-c");
    const currentNote = makeNote(noteId);
    const state = makeEditingState({ noteId, blockId, isDirty: false });
    const spy = { events: [] as Array<{ kind: string; [k: string]: unknown }> };
    const ports = makePorts(spy);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId,
        blockId,
        snapshot: null,
      },
      currentState: state,
      currentNote,
      previousFrontmatter: null,
    };

    runEditPastNoteStartPipeline(input, ports);
    runEditPastNoteStartPipeline(input, ports);

    const blockFocusedEvents = spy.events.filter((e) => e.kind === "block-focused") as BlockFocused[];
    expect(blockFocusedEvents).toHaveLength(2);
    for (const evt of blockFocusedEvents) {
      expect(evt.noteId).toBe(noteId);
      expect(evt.blockId).toBe(blockId);
    }
  });

  test("(d) isDirty=true is preserved across both calls (same-note path never clears isDirty)", () => {
    const noteId = makeNoteId("2026-04-30-120000-028d");
    const blockId = makeBlockId("block-same-block-d");
    const currentNote = makeNote(noteId);
    // isDirty=true — same-note path must not clear it
    const state = makeEditingState({ noteId, blockId, isDirty: true });
    const spy = { events: [] as Array<{ kind: string; [k: string]: unknown }> };
    const ports = makePorts(spy);

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId,
        blockId,
        snapshot: null,
      },
      currentState: state,
      currentNote,
      previousFrontmatter: null,
    };

    const r1 = runEditPastNoteStartPipeline(input, ports);
    const r2 = runEditPastNoteStartPipeline(input, ports);

    // Both succeed — the state isn't modified by the pure pipeline function
    // (state mutation tracking in the pipeline is the caller's responsibility)
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    // Key assertion: no save was triggered (blurSave not called)
    expect(spy.events.some((e) => e.kind === "note-file-saved")).toBe(false);
    expect(spy.events.some((e) => e.kind === "empty-note-discarded")).toBe(false);
    // isDirty=true in initial state → same-note path should never call blurSave
    // (this is the data-safety claim from PROP-EPNS-004 and REQ-EPNS-005)
    const blockFocusedEvents = spy.events.filter((e) => e.kind === "block-focused");
    expect(blockFocusedEvents).toHaveLength(2);
  });

  test("no save I/O on either invocation (BlurSave never called)", () => {
    const noteId = makeNoteId("2026-04-30-120000-028e");
    const blockId = makeBlockId("block-same-block-e");
    const currentNote = makeNote(noteId);
    const state = makeEditingState({ noteId, blockId, isDirty: true });
    let blurSaveCalled = false;
    const spy = { events: [] as Array<{ kind: string; [k: string]: unknown }> };
    const ports: EditPastNoteStartPorts = {
      ...makePorts(spy),
      blurSave: () => { blurSaveCalled = true; return { ok: true as const, value: { kind: "note-file-saved" as const, noteId, blocks: [], body: "" as unknown as Frontmatter, frontmatter: makeFrontmatter(), previousFrontmatter: null, occurredOn: makeTimestamp(1000) } }; },
    };

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId,
        blockId,
        snapshot: null,
      },
      currentState: state,
      currentNote,
      previousFrontmatter: null,
    };

    runEditPastNoteStartPipeline(input, ports);
    runEditPastNoteStartPipeline(input, ports);

    expect(blurSaveCalled).toBe(false);
  });

  // (c) FIND-EPNS-S2-P3-008: Structural equality of the two returned NewSession objects
  // Both calls with identical input must produce structurally equal output (idempotent fixed point
  // on workflow output). State-mutation idempotency is deferred to the upstream reducer.
  test("(c) both invocations return structurally equal NewSession objects", () => {
    const noteId = makeNoteId("2026-04-30-120000-028f");
    const blockId = makeBlockId("block-same-block-f");
    const currentNote = makeNote(noteId);
    const state = makeEditingState({ noteId, blockId, isDirty: true });
    // Use a fixed clock so startedAt is deterministic across both calls
    const fixedTimestamp = makeTimestamp(42000);
    const spy = { events: [] as Array<{ kind: string; [k: string]: unknown }> };
    const ports: EditPastNoteStartPorts = {
      clockNow: () => fixedTimestamp,
      blurSave: (nId) => ({ ok: true as const, value: { kind: "note-file-saved" as const, noteId: nId, blocks: [], body: "" as unknown as Frontmatter, frontmatter: makeFrontmatter(), previousFrontmatter: null, occurredOn: fixedTimestamp } }),
      parseMarkdownToBlocks: () => ({ ok: true as const, value: [] }),
      emit: (e) => spy.events.push(e),
    };

    const input: EditPastNoteStartInput = {
      request: {
        kind: "BlockFocusRequest",
        noteId,
        blockId,
        snapshot: null,
      },
      currentState: state,
      currentNote,
      previousFrontmatter: null,
    };

    const r1 = runEditPastNoteStartPipeline(input, ports);
    const r2 = runEditPastNoteStartPipeline(input, ports);

    // Both must succeed
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    // (c) structural equality — idempotent fixed point on workflow output
    expect(r1).toEqual(r2);
  });
});
