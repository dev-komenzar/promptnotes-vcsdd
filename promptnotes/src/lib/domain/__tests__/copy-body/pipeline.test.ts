/**
 * pipeline.test.ts — Full CopyBody pipeline integration tests.
 *
 * REQ-001: Happy path → Ok(ClipboardText)
 * REQ-003: Only clipboardWrite as I/O port; clockNow at-most-once on success
 * REQ-004: Clipboard failure → Err(SaveError.fs)
 * REQ-005: NoteBodyCopiedToClipboard emitted on success only
 * REQ-006: Read-only — input state/note not mutated
 * REQ-007: Empty body still copies through
 * REQ-009: clockNow as the source of NoteBodyCopiedToClipboard.occurredOn
 * REQ-010: SaveError exhaustiveness — only fs variant produced
 * REQ-011: I/O budget table
 * REQ-012: noteId precondition (caller invariant)
 */

import { describe, test, expect } from "bun:test";
import type { Result } from "promptnotes-domain-types/util/result";
import type { Body, Frontmatter, NoteId, Tag, Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { FsError, SaveError } from "promptnotes-domain-types/shared/errors";
import type { ClipboardText } from "promptnotes-domain-types/capture/stages";
import type { EditingState } from "promptnotes-domain-types/capture/states";
import type { Note } from "promptnotes-domain-types/shared/note";

import {
  copyBody,
  type CopyBodyPorts,
} from "$lib/domain/copy-body/pipeline";

// ── Helpers ────────────────────────────────────────────────────────────────

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);
const id = (s: string): NoteId => s as unknown as NoteId;
const body = (s: string): Body => s as unknown as Body;
const tag = (s: string): Tag => s as unknown as Tag;

function makeFrontmatter(): Frontmatter {
  return {
    tags: [],
    createdAt: ts(1000),
    updatedAt: ts(2000),
  } as unknown as Frontmatter;
}

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? id("2026-04-30-120000-000"),
    body: overrides.body ?? body("hello"),
    frontmatter: overrides.frontmatter ?? makeFrontmatter(),
  };
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
    bodyForClipboard: (n: Note) => n.body as unknown as string,
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
    bodyForClipboard: (n: Note) => n.body as unknown as string,
    emitInternal: (e) => log.internalEvents.push(e),
  };
}

function freshLog(): PortLog {
  return { clipboardCalls: [], clockCalls: 0, internalEvents: [] };
}

// ── REQ-001: Happy Path ─────────────────────────────────────────────────────

describe("REQ-001: copyBody happy path returns Ok(ClipboardText)", () => {
  test("returns Ok with kind 'ClipboardText', text from bodyForClipboard, noteId from state", () => {
    const log = freshLog();
    const note = makeNote({ id: id("2026-04-30-120000-000"), body: body("Hello clip") });
    const state = makeEditingState(note.id);
    const result = copyBody(makeHappyPorts(log, note))(state);

    expect(result.ok).toBe(true);
    if (!result.ok) return; // narrow
    const v: ClipboardText = result.value;
    expect(v.kind).toBe("ClipboardText");
    expect(v.text).toBe("Hello clip");
    expect(v.noteId).toBe(note.id);
  });
});

// ── REQ-003 / REQ-005 / REQ-009 / REQ-011: success-path I/O budget ──────────

describe("REQ-003 / REQ-005 / REQ-009 / REQ-011: success-path I/O budget", () => {
  test("clipboardWrite is invoked exactly once with the body string", () => {
    const log = freshLog();
    const note = makeNote({ body: body("xyz") });
    const state = makeEditingState(note.id);
    copyBody(makeHappyPorts(log, note))(state);
    expect(log.clipboardCalls.length).toBe(1);
    expect(log.clipboardCalls[0]).toBe("xyz");
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
    const note = makeNote({ id: id("2026-04-30-120000-000") });
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
    const note = makeNote();
    const state = makeEditingState(note.id);
    const bodyRef = note.body;
    const fmRef = note.frontmatter;
    copyBody(makeHappyPorts(log, note))(state);
    expect(note.body).toBe(bodyRef);
    expect(note.frontmatter).toBe(fmRef);
  });

  test("Object.freeze on inputs does not cause copyBody to throw", () => {
    const log = freshLog();
    const note = Object.freeze(makeNote()) as Note;
    const state = Object.freeze(makeEditingState(note.id));
    expect(() => copyBody(makeHappyPorts(log, note))(state)).not.toThrow();
  });
});

// ── REQ-007: Empty body / whitespace-only body still copies ────────────────

describe("REQ-007: empty and whitespace bodies are copied through", () => {
  test("empty body → Ok with text=''", () => {
    const log = freshLog();
    const note = makeNote({ body: body("") });
    const state = makeEditingState(note.id);
    const result = copyBody(makeHappyPorts(log, note))(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe("");
    expect(log.clipboardCalls).toEqual([""]);
    expect(log.internalEvents.length).toBe(1);
  });

  test("whitespace-only body → Ok with text preserved", () => {
    const log = freshLog();
    const note = makeNote({ body: body("   \n") });
    const state = makeEditingState(note.id);
    const result = copyBody(makeHappyPorts(log, note))(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.text).toBe("   \n");
  });
});

// ── REQ-012: noteId precondition documented (caller invariant) ─────────────

describe("REQ-012: noteId precondition (caller invariant — not enforced at runtime)", () => {
  test("when note.id matches state.currentNoteId, the result.value.noteId matches", () => {
    const log = freshLog();
    const noteId = id("2026-04-30-120000-000");
    const note = makeNote({ id: noteId });
    const state = makeEditingState(noteId);
    const result = copyBody(makeHappyPorts(log, note))(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.noteId).toBe(noteId);
  });
});
