/**
 * pipeline.test.ts — Full CaptureAutoSave pipeline integration tests
 *
 * REQ-001: Happy path → NoteFileSaved
 * REQ-013: SaveError type exhaustiveness
 * REQ-014: Trigger source mapping exhaustive
 * REQ-015: EditingSessionState transitions
 * REQ-016: I/O boundary confinement
 * REQ-017: Pipeline function signature
 *
 * PROP-005: SaveError exhaustiveness (type-level)
 * PROP-014: Clock.now called exactly once
 * PROP-015: writeFileAtomic called exactly once
 * PROP-017: Full pipeline integration happy path
 * PROP-018: Full pipeline integration write failure
 * PROP-019: State transition editing → saving → editing on success
 * PROP-020: State transition editing → saving → save-failed on failure
 */

import { describe, test, expect } from "bun:test";
import type { Result } from "promptnotes-domain-types/util/result";
import type { NoteId, Body, Frontmatter, Timestamp, Tag, VaultPath } from "promptnotes-domain-types/shared/value-objects";
import type { FsError, SaveError } from "promptnotes-domain-types/shared/errors";
import type { NoteFileSaved, EmptyNoteDiscarded, PublicDomainEvent } from "promptnotes-domain-types/shared/events";
import type { EditingState, SavingState, SaveFailedState } from "promptnotes-domain-types/capture/states";
import type { Block, Note } from "promptnotes-domain-types/shared/note";
import type { BlockId, BlockType, BlockContent } from "promptnotes-domain-types/shared/value-objects";

import {
  captureAutoSave,
  type CaptureAutoSavePorts,
} from "$lib/domain/capture-auto-save/pipeline";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeBody(raw: string): Body {
  return raw as unknown as Body;
}

function makeTag(raw: string): Tag {
  return raw as unknown as Tag;
}

function makeFrontmatter(overrides: Partial<{
  tags: Tag[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}> = {}): Frontmatter {
  return {
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? makeTimestamp(1000),
    updatedAt: overrides.updatedAt ?? makeTimestamp(2000),
  } as unknown as Frontmatter;
}

function makeParagraphBlock(content: string, id = "block-001"): Block {
  return {
    id: id as unknown as BlockId,
    type: "paragraph" as BlockType,
    content: content as unknown as BlockContent,
  } as unknown as Block;
}

function makeNote(overrides: Partial<{ id: NoteId; blocks: ReadonlyArray<Block>; body: Body; frontmatter: Frontmatter }> = {}): Note {
  const defaultBlocks: ReadonlyArray<Block> = [makeParagraphBlock("some content")];
  return {
    id: overrides.id ?? makeNoteId("2026-04-30-120000-000"),
    blocks: overrides.blocks ?? defaultBlocks,
    body: overrides.body ?? makeBody("some content"),
    frontmatter: overrides.frontmatter ?? makeFrontmatter(),
  } as unknown as Note;
}

function makeEditingState(overrides: Partial<EditingState> = {}): EditingState {
  return {
    status: "editing",
    currentNoteId: overrides.currentNoteId ?? makeNoteId("2026-04-30-120000-000"),
    isDirty: overrides.isDirty ?? true,
    lastInputAt: (overrides as any).lastInputAt ?? null,
    idleTimerHandle: (overrides as any).idleTimerHandle ?? null,
    lastSaveResult: (overrides as any).lastSaveResult ?? null,
  } as EditingState;
}

function makeSavingState(noteId: NoteId, now: Timestamp): SavingState {
  return {
    status: "saving",
    currentNoteId: noteId,
    savingStartedAt: now,
  } as SavingState;
}

type EmittedEvent = { kind: string; [key: string]: unknown };

type TransitionLog = {
  beginAutoSaveCalls: Array<{ state: EditingState; now: Timestamp }>;
  onSaveSucceededCalls: Array<{ state: SavingState; now: Timestamp }>;
  onSaveFailedCalls: Array<{ state: SavingState; error: SaveError }>;
};

function makeHappyPorts(
  emitted: EmittedEvent[] = [],
  transitionLog?: TransitionLog,
): CaptureAutoSavePorts {
  let clockCallCount = 0;
  let writeCallCount = 0;
  const log: TransitionLog = transitionLog ?? {
    beginAutoSaveCalls: [],
    onSaveSucceededCalls: [],
    onSaveFailedCalls: [],
  };

  return {
    // CaptureDeps core fields
    clockNow: () => {
      clockCallCount++;
      return makeTimestamp(5000);
    },
    allocateNoteId: (preferred: Timestamp) => makeNoteId("allocated-id"),
    clipboardWrite: (_text: string) => ({ ok: true, value: undefined } as Result<void, FsError>),
    publish: (e: PublicDomainEvent) => emitted.push(e as unknown as EmittedEvent),
    // Pipeline-specific ports
    noteIsEmpty: () => false,
    writeFileAtomic: (_path: string, _content: string) => {
      writeCallCount++;
      return { ok: true, value: undefined } as Result<void, FsError>;
    },
    vaultPath: "/vault" as unknown as VaultPath,
    getCurrentNote: () => makeNote(),
    getPreviousFrontmatter: () => null,
    refreshSort: () => {},
    applyTagDelta: () => false,
    emitInternal: () => {},
    beginAutoSave: (state: EditingState, now: Timestamp) => {
      log.beginAutoSaveCalls.push({ state, now });
      return makeSavingState(state.currentNoteId, now);
    },
    onSaveSucceeded: (state: SavingState, now: Timestamp) => {
      log.onSaveSucceededCalls.push({ state, now });
      return {
        status: "editing",
        currentNoteId: state.currentNoteId,
        isDirty: false,
        lastInputAt: null,
        idleTimerHandle: null,
        lastSaveResult: "success",
      } as EditingState;
    },
    onSaveFailed: (state: SavingState, error: SaveError) => {
      log.onSaveFailedCalls.push({ state, error });
      return {
        status: "save-failed",
        currentNoteId: state.currentNoteId,
        pendingNextFocus: null,
        lastSaveError: error,
      } as unknown as SaveFailedState;
    },
    get _clockCallCount() { return clockCallCount; },
    get _writeCallCount() { return writeCallCount; },
  } as CaptureAutoSavePorts & { _clockCallCount: number; _writeCallCount: number };
}

function makeFailingPorts(
  fsError: FsError,
  emitted: EmittedEvent[] = [],
  transitionLog?: TransitionLog,
): CaptureAutoSavePorts {
  const log: TransitionLog = transitionLog ?? {
    beginAutoSaveCalls: [],
    onSaveSucceededCalls: [],
    onSaveFailedCalls: [],
  };
  const base = makeHappyPorts(emitted, log);
  return {
    ...base,
    writeFileAtomic: (_path: string, _content: string) => ({
      ok: false,
      error: fsError,
    } as Result<void, FsError>),
    publish: (e: PublicDomainEvent) => emitted.push(e as unknown as EmittedEvent),
  };
}

// ── REQ-001 / PROP-017: Happy path → NoteFileSaved ──────────────────────

describe("REQ-001 / PROP-017: Happy path produces NoteFileSaved", () => {
  test("happy path returns Ok with NoteFileSaved", async () => {
    const state = makeEditingState();
    const result = await captureAutoSave(makeHappyPorts())(state, "idle");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe("note-file-saved");
  });

  test("NoteFileSaved event emitted on happy path", async () => {
    const emitted: EmittedEvent[] = [];
    const state = makeEditingState();
    await captureAutoSave(makeHappyPorts(emitted))(state, "idle");

    const saved = emitted.filter((e) => e.kind === "note-file-saved");
    expect(saved.length).toBe(1);
  });
});

// ── PROP-018: Write failure → SaveError + NoteSaveFailed ────────────────

describe("PROP-018: Write failure returns SaveError", () => {
  test("write failure returns Err with SaveError { kind: 'fs' }", async () => {
    const state = makeEditingState();
    const result = await captureAutoSave(
      makeFailingPorts({ kind: "permission" })
    )(state, "idle");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("fs");
  });

  test("NoteSaveFailed emitted on write failure", async () => {
    const emitted: EmittedEvent[] = [];
    const state = makeEditingState();
    await captureAutoSave(makeFailingPorts({ kind: "disk-full" }, emitted))(state, "idle");

    const failed = emitted.filter((e) => e.kind === "note-save-failed");
    expect(failed.length).toBe(1);
  });
});

// ── PROP-014: Clock.now called exactly once ─────────────────────────────

describe("PROP-014: Clock.now call budget", () => {
  test("Clock.now called exactly once in pipeline", async () => {
    const ports = makeHappyPorts();
    const state = makeEditingState();
    await captureAutoSave(ports)(state, "idle");

    expect((ports as any)._clockCallCount).toBe(1);
  });
});

// ── PROP-015: writeFileAtomic called exactly once ───────────────────────

describe("PROP-015: writeFileAtomic call count", () => {
  test("writeFileAtomic called exactly once on happy path", async () => {
    const ports = makeHappyPorts();
    const state = makeEditingState();
    await captureAutoSave(ports)(state, "idle");

    expect((ports as any)._writeCallCount).toBe(1);
  });
});

// ── PROP-005: SaveError type exhaustiveness (compile-time) ──────────────

describe("PROP-005: SaveError type exhaustiveness", () => {
  test("SaveError has exactly two variants: validation and fs", () => {
    function assertExhaustive(err: SaveError): string {
      switch (err.kind) {
        case "validation": return "validation";
        case "fs": return "fs";
        default: {
          const _never: never = err;
          return _never;
        }
      }
    }
    expect(assertExhaustive).toBeDefined();
  });
});

// ── REQ-017: Pipeline function signature ────────────────────────────────

describe("REQ-017: CaptureAutoSave function signature", () => {
  test("captureAutoSave is a curried function (ports) => (state, trigger) => Promise", () => {
    const ports = makeHappyPorts();
    const bound = captureAutoSave(ports);
    expect(typeof bound).toBe("function");
  });
});

// ── PROP-019: State transition editing → saving → editing on success ────

describe("PROP-019: State transitions on success", () => {
  test("beginAutoSave called with editing state", async () => {
    const log: TransitionLog = {
      beginAutoSaveCalls: [],
      onSaveSucceededCalls: [],
      onSaveFailedCalls: [],
    };
    const state = makeEditingState();
    await captureAutoSave(makeHappyPorts([], log))(state, "idle");

    expect(log.beginAutoSaveCalls.length).toBe(1);
    expect(log.beginAutoSaveCalls[0].state.status).toBe("editing");
  });

  test("onSaveSucceeded called after successful write", async () => {
    const log: TransitionLog = {
      beginAutoSaveCalls: [],
      onSaveSucceededCalls: [],
      onSaveFailedCalls: [],
    };
    const state = makeEditingState();
    await captureAutoSave(makeHappyPorts([], log))(state, "idle");

    expect(log.onSaveSucceededCalls.length).toBe(1);
    expect(log.onSaveSucceededCalls[0].state.status).toBe("saving");
  });

  test("onSaveFailed NOT called on success", async () => {
    const log: TransitionLog = {
      beginAutoSaveCalls: [],
      onSaveSucceededCalls: [],
      onSaveFailedCalls: [],
    };
    const state = makeEditingState();
    await captureAutoSave(makeHappyPorts([], log))(state, "idle");

    expect(log.onSaveFailedCalls.length).toBe(0);
  });
});

// ── PROP-020: State transition editing → saving → save-failed on failure ─

describe("PROP-020: State transitions on failure", () => {
  test("beginAutoSave called before write attempt", async () => {
    const log: TransitionLog = {
      beginAutoSaveCalls: [],
      onSaveSucceededCalls: [],
      onSaveFailedCalls: [],
    };
    const state = makeEditingState();
    await captureAutoSave(makeFailingPorts({ kind: "permission" }, [], log))(state, "idle");

    expect(log.beginAutoSaveCalls.length).toBe(1);
  });

  test("onSaveFailed called with saving state and error", async () => {
    const log: TransitionLog = {
      beginAutoSaveCalls: [],
      onSaveSucceededCalls: [],
      onSaveFailedCalls: [],
    };
    const state = makeEditingState();
    await captureAutoSave(makeFailingPorts({ kind: "disk-full" }, [], log))(state, "idle");

    expect(log.onSaveFailedCalls.length).toBe(1);
    expect(log.onSaveFailedCalls[0].state.status).toBe("saving");
    expect(log.onSaveFailedCalls[0].error.kind).toBe("fs");
  });

  test("onSaveSucceeded NOT called on failure", async () => {
    const log: TransitionLog = {
      beginAutoSaveCalls: [],
      onSaveSucceededCalls: [],
      onSaveFailedCalls: [],
    };
    const state = makeEditingState();
    await captureAutoSave(makeFailingPorts({ kind: "lock" }, [], log))(state, "idle");

    expect(log.onSaveSucceededCalls.length).toBe(0);
  });
});

// ── FIND-008: Pipeline EmptyNoteDiscarded path ──────────────────────────

describe("REQ-003: EmptyNoteDiscarded pipeline integration", () => {
  test("empty-idle returns Err with validation/empty-body-on-idle", async () => {
    const ports = makeHappyPorts();
    const emptyPorts = { ...ports, noteIsEmpty: () => true };
    const state = makeEditingState();

    const result = await captureAutoSave(emptyPorts)(state, "idle");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("validation");
    if (result.error.kind !== "validation") return;
    expect(result.error.reason.kind).toBe("empty-body-on-idle");
  });

  test("empty-idle emits EmptyNoteDiscarded event", async () => {
    const emitted: EmittedEvent[] = [];
    const ports = makeHappyPorts(emitted);
    const emptyPorts = { ...ports, noteIsEmpty: () => true, publish: ports.publish };
    const state = makeEditingState();

    await captureAutoSave(emptyPorts)(state, "idle");

    const discarded = emitted.filter((e) => e.kind === "empty-note-discarded");
    expect(discarded.length).toBe(1);
  });

  test("empty-idle does NOT emit SaveNoteRequested or NoteFileSaved", async () => {
    const emitted: EmittedEvent[] = [];
    const ports = makeHappyPorts(emitted);
    const emptyPorts = { ...ports, noteIsEmpty: () => true, publish: ports.publish };
    const state = makeEditingState();

    await captureAutoSave(emptyPorts)(state, "idle");

    expect(emitted.filter((e) => e.kind === "save-note-requested").length).toBe(0);
    expect(emitted.filter((e) => e.kind === "note-file-saved").length).toBe(0);
  });

  // FIND-004 / PROP-023: beginAutoSave NOT called on empty-idle path
  test("PROP-023: beginAutoSave NOT called on empty-idle path", async () => {
    const log: TransitionLog = {
      beginAutoSaveCalls: [],
      onSaveSucceededCalls: [],
      onSaveFailedCalls: [],
    };
    const ports = makeHappyPorts([], log);
    const emptyPorts = { ...ports, noteIsEmpty: () => true };
    const state = makeEditingState();

    await captureAutoSave(emptyPorts)(state, "idle");

    expect(log.beginAutoSaveCalls.length).toBe(0);
  });
});

// ── FIND-006: Clock.now budget on all paths ─────────────────────────────

describe("PROP-014: Clock.now budget (all paths)", () => {
  test("Clock.now called exactly once on empty-idle path", async () => {
    const ports = makeHappyPorts();
    const emptyPorts = { ...ports, noteIsEmpty: () => true, clockNow: ports.clockNow };
    const state = makeEditingState();

    await captureAutoSave(emptyPorts)(state, "idle");

    expect((ports as any)._clockCallCount).toBe(1);
  });

  test("Clock.now called exactly once on write failure path", async () => {
    let clockCallCount = 0;
    const emitted: EmittedEvent[] = [];
    const log: TransitionLog = {
      beginAutoSaveCalls: [],
      onSaveSucceededCalls: [],
      onSaveFailedCalls: [],
    };
    const base = makeHappyPorts(emitted, log);
    const ports: CaptureAutoSavePorts = {
      ...base,
      clockNow: () => {
        clockCallCount++;
        return makeTimestamp(5000);
      },
      writeFileAtomic: () => ({ ok: false, error: { kind: "permission" } } as Result<void, FsError>),
    };
    const state = makeEditingState();

    await captureAutoSave(ports)(state, "idle");

    expect(clockCallCount).toBe(1);
  });
});
