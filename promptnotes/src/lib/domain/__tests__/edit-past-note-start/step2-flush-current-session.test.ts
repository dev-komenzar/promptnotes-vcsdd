/**
 * step2-flush-current-session.test.ts — Sprint 2 block-based tests for flushCurrentSession
 *
 * REQ-EPNS-001: no-current → no-op, no I/O
 * REQ-EPNS-002: empty → discard + EmptyNoteDiscarded
 * REQ-EPNS-003: dirty, save succeeds → saved + NoteFileSaved
 * REQ-EPNS-004: dirty, save fails → SwitchError + NoteSaveFailed
 * REQ-EPNS-005: same-note → same-note-skipped, no I/O
 * REQ-EPNS-006: save-failed state → retry save (cross-note path)
 * REQ-EPNS-009: EmptyNoteDiscarded is PublicDomainEvent
 * REQ-EPNS-011: SwitchError.pendingNextFocus shape (noteId + blockId)
 * REQ-EPNS-012: Clock budget per path
 *
 * Sprint 2 changes:
 * - FlushedCurrentSession.result adds 'same-note-skipped' variant
 * - SwitchError.pendingNextFocus: { noteId, blockId } (replaces pendingNextNoteId)
 * - Note.blocks-based (no body field on Note)
 * - flushCurrentSession accepts BlockFocusRequest (for pendingNextFocus)
 *
 * FIND-EPNS-S2-P3-005: blurSave is async — all blurSave stubs return Promise.resolve(...)
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
  NoteFileSaved,
  NoteSaveFailed,
  EmptyNoteDiscarded,
} from "promptnotes-domain-types/shared/events";
import type {
  CurrentSessionDecision,
  BlockFocusRequest,
} from "promptnotes-domain-types/capture/stages";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";

import {
  flushCurrentSession,
  type FlushCurrentSessionPorts,
} from "../../edit-past-note-start/flush-current-session";

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

function makeNote(blocks: ReadonlyArray<Block>, id?: NoteId): Note {
  return {
    id: id ?? makeNoteId("2026-04-30-120000-000"),
    blocks,
    frontmatter: makeFrontmatter(),
  } as unknown as Note;
}

function makeEventSpy() {
  const events: Array<{ kind: string; [k: string]: unknown }> = [];
  return { events, emit: (e: { kind: string; [k: string]: unknown }) => events.push(e) };
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

function makeSnapshot(noteId: NoteId): NoteFileSnapshot {
  return {
    noteId,
    body: "content" as unknown as Frontmatter,
    frontmatter: makeFrontmatter(),
    filePath: "/vault/test.md",
    fileMtime: makeTimestamp(1000),
  } as unknown as NoteFileSnapshot;
}

function makeRequest(noteId: NoteId, blockId: BlockId = makeBlockId("block-tgt")): BlockFocusRequest {
  return {
    kind: "BlockFocusRequest",
    noteId,
    blockId,
    snapshot: makeSnapshot(noteId),
  };
}

// ── REQ-EPNS-001: no-current → no-op ─────────────────────────────────────

describe("flushCurrentSession — no-current (REQ-EPNS-001)", () => {
  test("no-current decision → FlushedCurrentSession { result: 'no-op' }", async () => {
    const spy = makeEventSpy();
    const decision: CurrentSessionDecision = { kind: "no-current" };
    const request = makeRequest(makeNoteId("2026-04-30-150000-000"));
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => makeTimestamp(Date.now()),
      blurSave: () => { throw new Error("should not be called"); },
      emit: spy.emit,
    };

    const result = await flushCurrentSession(decision, request, ports, null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.result).toBe("no-op");
    }
    expect(spy.events).toHaveLength(0);
  });

  // REQ-EPNS-012: no Clock.now() call on no-current path
  test("no-current path: Clock.now() not called", async () => {
    let clockCalls = 0;
    const decision: CurrentSessionDecision = { kind: "no-current" };
    const request = makeRequest(makeNoteId("2026-04-30-150000-001"));
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => { clockCalls++; return makeTimestamp(1000); },
      blurSave: () => { throw new Error("should not be called"); },
      emit: () => {},
    };

    await flushCurrentSession(decision, request, ports, null);
    expect(clockCalls).toBe(0);
  });
});

// ── REQ-EPNS-002: empty → discard + EmptyNoteDiscarded ───────────────────

describe("flushCurrentSession — empty (REQ-EPNS-002)", () => {
  test("empty decision → FlushedCurrentSession { result: 'discarded' } + EmptyNoteDiscarded", async () => {
    const spy = makeEventSpy();
    const noteId = makeNoteId("2026-04-30-120000-001");
    const decision: CurrentSessionDecision = { kind: "empty", noteId };
    const ts = makeTimestamp(5000);
    const request = makeRequest(makeNoteId("2026-04-30-150000-000"));
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => ts,
      blurSave: () => { throw new Error("should not be called"); },
      emit: spy.emit,
    };

    const result = await flushCurrentSession(decision, request, ports, null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.result).toBe("discarded");
    }
    expect(spy.events).toHaveLength(1);
    const evt = spy.events[0] as EmptyNoteDiscarded;
    expect(evt.kind).toBe("empty-note-discarded");
    expect(evt.noteId).toBe(noteId);
    expect(evt.occurredOn).toBe(ts);
  });

  // REQ-EPNS-012: Clock.now() called exactly once on empty path
  test("empty path: Clock.now() called exactly once for EmptyNoteDiscarded.occurredOn", async () => {
    let clockCalls = 0;
    const noteId = makeNoteId("2026-04-30-120000-002");
    const decision: CurrentSessionDecision = { kind: "empty", noteId };
    const request = makeRequest(makeNoteId("2026-04-30-150000-000"));
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => { clockCalls++; return makeTimestamp(1000); },
      blurSave: () => { throw new Error("should not be called"); },
      emit: () => {},
    };

    await flushCurrentSession(decision, request, ports, null);
    expect(clockCalls).toBe(1);
  });
});

// ── REQ-EPNS-003: dirty, save succeeds ───────────────────────────────────

describe("flushCurrentSession — dirty, save succeeds (REQ-EPNS-003)", () => {
  test("dirty + save succeeds → FlushedCurrentSession { result: 'saved' } + NoteFileSaved emitted", async () => {
    const spy = makeEventSpy();
    const noteId = makeNoteId("2026-04-30-120000-003");
    const note = makeNote([makeBlock("content")], noteId);
    const decision: CurrentSessionDecision = { kind: "dirty", noteId, note };
    const savedEvent = makeNoteFileSaved(noteId);
    const request = makeRequest(makeNoteId("2026-04-30-150000-000"));
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => makeTimestamp(Date.now()),
      blurSave: () => Promise.resolve({ ok: true as const, value: savedEvent }),
      emit: spy.emit,
    };

    const result = await flushCurrentSession(decision, request, ports, null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.result).toBe("saved");
    }
    const savedEvents = spy.events.filter((e) => e.kind === "note-file-saved");
    expect(savedEvents).toHaveLength(1);
  });

  // REQ-EPNS-012: Clock.now() NOT called on dirty-success path
  test("dirty-success path: Clock.now() not called by flushCurrentSession", async () => {
    let clockCalls = 0;
    const noteId = makeNoteId("2026-04-30-120000-004");
    const note = makeNote([makeBlock("content")], noteId);
    const decision: CurrentSessionDecision = { kind: "dirty", noteId, note };
    const request = makeRequest(makeNoteId("2026-04-30-150000-000"));
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => { clockCalls++; return makeTimestamp(1000); },
      blurSave: () => Promise.resolve({ ok: true as const, value: makeNoteFileSaved(noteId) }),
      emit: () => {},
    };

    await flushCurrentSession(decision, request, ports, null);
    expect(clockCalls).toBe(0);
  });
});

// ── REQ-EPNS-004: dirty, save fails → SwitchError ────────────────────────

describe("flushCurrentSession — dirty, save fails (REQ-EPNS-004)", () => {
  test("dirty + save fails → Err(SwitchError) with pendingNextFocus { noteId, blockId }", async () => {
    const spy = makeEventSpy();
    const currentNoteId = makeNoteId("2026-04-30-120000-005");
    const targetNoteId = makeNoteId("2026-04-30-150000-005");
    const targetBlockId = makeBlockId("block-tgt-001");
    const note = makeNote([makeBlock("content")], currentNoteId);
    const decision: CurrentSessionDecision = {
      kind: "dirty",
      noteId: currentNoteId,
      note,
    };
    const saveError: SaveError = {
      kind: "fs",
      reason: { kind: "permission", path: "/vault/test.md" },
    };
    const request = makeRequest(targetNoteId, targetBlockId);
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => makeTimestamp(Date.now()),
      blurSave: () => Promise.resolve({ ok: false as const, error: saveError }),
      emit: spy.emit,
    };

    const result = await flushCurrentSession(decision, request, ports, null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("save-failed-during-switch");
      expect(result.error.underlying).toEqual(saveError);
      // Sprint 2: pendingNextFocus replaces pendingNextNoteId
      expect(result.error.pendingNextFocus).toEqual({ noteId: targetNoteId, blockId: targetBlockId });
    }
  });

  test("dirty-fail: NoteSaveFailed emitted with correct noteId and reason", async () => {
    const spy = makeEventSpy();
    const currentNoteId = makeNoteId("2026-04-30-120000-006");
    const note = makeNote([makeBlock("content")], currentNoteId);
    const decision: CurrentSessionDecision = { kind: "dirty", noteId: currentNoteId, note };
    const saveError: SaveError = { kind: "fs", reason: { kind: "permission" } };
    const request = makeRequest(makeNoteId("2026-04-30-150000-006"));
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => makeTimestamp(9999),
      blurSave: () => Promise.resolve({ ok: false as const, error: saveError }),
      emit: spy.emit,
    };

    await flushCurrentSession(decision, request, ports, null);

    const failEvents = spy.events.filter((e) => e.kind === "note-save-failed");
    expect(failEvents).toHaveLength(1);
    const evt = failEvents[0] as NoteSaveFailed;
    expect(evt.noteId).toBe(currentNoteId);
    expect(evt.reason).toBe("permission");
  });

  // REQ-EPNS-004: BlockFocused NOT emitted on failure path
  test("dirty-fail: BlockFocused NOT emitted", async () => {
    const spy = makeEventSpy();
    const noteId = makeNoteId("2026-04-30-120000-007");
    const note = makeNote([makeBlock("content")], noteId);
    const decision: CurrentSessionDecision = { kind: "dirty", noteId, note };
    const saveError: SaveError = { kind: "fs", reason: { kind: "lock" } };
    const request = makeRequest(makeNoteId("2026-04-30-150000-007"));
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => makeTimestamp(1000),
      blurSave: () => Promise.resolve({ ok: false as const, error: saveError }),
      emit: spy.emit,
    };

    await flushCurrentSession(decision, request, ports, null);
    const blockFocusedEvents = spy.events.filter((e) => e.kind === "block-focused");
    expect(blockFocusedEvents).toHaveLength(0);
  });

  // REQ-EPNS-012: dirty-fail path: Clock.now() called once for NoteSaveFailed.occurredOn
  test("dirty-fail path: Clock.now() called once (for NoteSaveFailed.occurredOn)", async () => {
    let clockCalls = 0;
    const ts = makeTimestamp(99000);
    const noteId = makeNoteId("2026-04-30-120000-008");
    const note = makeNote([makeBlock("content")], noteId);
    const decision: CurrentSessionDecision = { kind: "dirty", noteId, note };
    const saveError: SaveError = { kind: "fs", reason: { kind: "lock" } };
    const request = makeRequest(makeNoteId("2026-04-30-150000-008"));
    const spy = makeEventSpy();
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => { clockCalls++; return ts; },
      blurSave: () => Promise.resolve({ ok: false as const, error: saveError }),
      emit: spy.emit,
    };

    await flushCurrentSession(decision, request, ports, null);
    expect(clockCalls).toBe(1);

    // Verify NoteSaveFailed.occurredOn uses the Clock port value
    const failEvent = spy.events.find((e) => e.kind === "note-save-failed");
    expect(failEvent).toBeDefined();
    expect((failEvent as NoteSaveFailed).occurredOn).toBe(ts);
  });
});

// ── REQ-EPNS-005: same-note → same-note-skipped ───────────────────────────

describe("flushCurrentSession — same-note (REQ-EPNS-005)", () => {
  test("same-note decision → FlushedCurrentSession { result: 'same-note-skipped' }, no I/O", async () => {
    const spy = makeEventSpy();
    const noteId = makeNoteId("2026-04-30-120000-009");
    const note = makeNote([makeBlock("content")], noteId);
    const decision: CurrentSessionDecision = { kind: "same-note", noteId, note };
    const request: BlockFocusRequest = {
      kind: "BlockFocusRequest",
      noteId,
      blockId: makeBlockId("block-002"),
      snapshot: null,
    };
    let blurSaveCalled = false;
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => makeTimestamp(Date.now()),
      blurSave: () => { blurSaveCalled = true; throw new Error("should not be called"); },
      emit: spy.emit,
    };

    const result = await flushCurrentSession(decision, request, ports, null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.result).toBe("same-note-skipped");
    }
    expect(blurSaveCalled).toBe(false);
    // No events on same-note flush
    expect(spy.events).toHaveLength(0);
  });

  // PROP-EPNS-022: same-note → BlurSave NOT invoked
  test("same-note path: blurSave port NOT called", async () => {
    let blurSaveCalled = false;
    const noteId = makeNoteId("2026-04-30-120000-010");
    const note = makeNote([makeBlock("content")], noteId);
    const decision: CurrentSessionDecision = { kind: "same-note", noteId, note };
    const request: BlockFocusRequest = {
      kind: "BlockFocusRequest",
      noteId,
      blockId: makeBlockId("block-003"),
      snapshot: null,
    };
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => makeTimestamp(Date.now()),
      blurSave: () => { blurSaveCalled = true; return Promise.resolve({ ok: true as const, value: makeNoteFileSaved(noteId) }); },
      emit: () => {},
    };

    await flushCurrentSession(decision, request, ports, null);
    expect(blurSaveCalled).toBe(false);
  });

  // REQ-EPNS-012: same-note: Clock.now() NOT called in flushCurrentSession
  test("same-note path: Clock.now() not called in flushCurrentSession", async () => {
    let clockCalls = 0;
    const noteId = makeNoteId("2026-04-30-120000-011");
    const note = makeNote([makeBlock("")], noteId);
    const decision: CurrentSessionDecision = { kind: "same-note", noteId, note };
    const request: BlockFocusRequest = {
      kind: "BlockFocusRequest",
      noteId,
      blockId: makeBlockId("block-004"),
      snapshot: null,
    };
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => { clockCalls++; return makeTimestamp(1000); },
      blurSave: () => { throw new Error("should not be called"); },
      emit: () => {},
    };

    await flushCurrentSession(decision, request, ports, null);
    expect(clockCalls).toBe(0);
  });
});

// ── SaveError → NoteSaveFailureReason mapping (PROP-EPNS-026) ────────────

describe("flushCurrentSession — SaveError mapping (PROP-EPNS-026, REQ-EPNS-004)", () => {
  const mappingCases: Array<[string, SaveError, string]> = [
    ["fs/permission → 'permission'", { kind: "fs", reason: { kind: "permission" } }, "permission"],
    ["fs/disk-full → 'disk-full'", { kind: "fs", reason: { kind: "disk-full" } }, "disk-full"],
    ["fs/lock → 'lock'", { kind: "fs", reason: { kind: "lock" } }, "lock"],
    ["fs/not-found → 'unknown'", { kind: "fs", reason: { kind: "not-found", path: "/x" } }, "unknown"],
    ["fs/unknown → 'unknown'", { kind: "fs", reason: { kind: "unknown", detail: "err" } }, "unknown"],
    ["validation → 'unknown'", { kind: "validation", reason: { kind: "empty-body-on-idle" } }, "unknown"],
  ];

  for (const [label, saveError, expectedReason] of mappingCases) {
    test(label, async () => {
      const noteId = makeNoteId("2026-04-30-120000-012");
      const note = makeNote([makeBlock("content")], noteId);
      const decision: CurrentSessionDecision = { kind: "dirty", noteId, note };
      const spy = makeEventSpy();
      const request = makeRequest(makeNoteId("target-0000"));
      const ports: FlushCurrentSessionPorts = {
        clockNow: () => makeTimestamp(1000),
        blurSave: () => Promise.resolve({ ok: false as const, error: saveError }),
        emit: spy.emit,
      };

      await flushCurrentSession(decision, request, ports, null);
      const failEvent = spy.events.find((e) => e.kind === "note-save-failed");
      expect(failEvent).toBeDefined();
      expect((failEvent as NoteSaveFailed).reason).toBe(expectedReason);
    });
  }
});

// ── REQ-EPNS-011: SwitchError.pendingNextFocus shape ─────────────────────

describe("flushCurrentSession — SwitchError.pendingNextFocus (REQ-EPNS-011)", () => {
  test("pendingNextFocus carries both noteId and blockId from request", async () => {
    const currentNoteId = makeNoteId("2026-04-30-120000-013");
    const targetNoteId = makeNoteId("2026-04-30-150000-013");
    const targetBlockId = makeBlockId("block-specific-0042");
    const note = makeNote([makeBlock("content")], currentNoteId);
    const decision: CurrentSessionDecision = { kind: "dirty", noteId: currentNoteId, note };
    const request = makeRequest(targetNoteId, targetBlockId);
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => makeTimestamp(1000),
      blurSave: () => Promise.resolve({ ok: false as const, error: { kind: "fs", reason: { kind: "lock" } } }),
      emit: () => {},
    };

    const result = await flushCurrentSession(decision, request, ports, null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.pendingNextFocus.noteId).toBe(targetNoteId);
      expect(result.error.pendingNextFocus.blockId).toBe(targetBlockId);
    }
  });
});

// ── previousFrontmatter forwarded to blurSave ────────────────────────────

describe("flushCurrentSession — previousFrontmatter (REQ-EPNS-003)", () => {
  test("dirty path: previousFrontmatter is forwarded to blurSave", async () => {
    const noteId = makeNoteId("2026-04-30-120000-014");
    const note = makeNote([makeBlock("content")], noteId);
    const decision: CurrentSessionDecision = { kind: "dirty", noteId, note };
    const prevFm = makeFrontmatter();
    const request = makeRequest(makeNoteId("2026-04-30-150000-014"));
    let capturedPrevFm: Frontmatter | null = null;
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => makeTimestamp(1000),
      blurSave: (_noteId, _note, previousFrontmatter) => {
        capturedPrevFm = previousFrontmatter;
        return Promise.resolve({ ok: true as const, value: makeNoteFileSaved(noteId) });
      },
      emit: () => {},
    };

    await flushCurrentSession(decision, request, ports, prevFm);
    expect(capturedPrevFm).toBe(prevFm);
  });
});
