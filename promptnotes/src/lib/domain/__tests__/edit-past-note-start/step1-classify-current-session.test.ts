/**
 * step1-classify-current-session.test.ts — Unit tests for classifyCurrentSession
 *
 * REQ-EPNS-007: Pure classification of EditingSessionState
 * PROP-EPNS-001: Purity (referential transparency)
 * PROP-EPNS-002: IdleState → no-current
 * PROP-EPNS-003: EditingState empty↔'empty', !empty↔'dirty'
 * PROP-EPNS-004: SaveFailedState → dirty
 */

import { describe, test, expect } from "bun:test";
import type {
  NoteId,
  Timestamp,
  Body,
  Frontmatter,
  Tag,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type {
  EditingState,
  IdleState,
  SaveFailedState,
} from "promptnotes-domain-types/capture/states";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type { CurrentSessionDecision } from "promptnotes-domain-types/capture/stages";

import { classifyCurrentSession } from "../../edit-past-note-start/classify-current-session";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}
function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}
function makeBody(raw: string): Body {
  return raw as unknown as Body;
}
function makeTag(raw: string): Tag {
  return raw as unknown as Tag;
}
function makeFrontmatter(opts?: {
  tags?: Tag[];
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}): Frontmatter {
  return {
    tags: opts?.tags ?? [],
    createdAt: opts?.createdAt ?? makeTimestamp(1000),
    updatedAt: opts?.updatedAt ?? makeTimestamp(1000),
  } as unknown as Frontmatter;
}
function makeNote(opts?: {
  id?: NoteId;
  body?: Body;
  frontmatter?: Frontmatter;
}): Note {
  return {
    id: opts?.id ?? makeNoteId("2026-04-30-120000-000"),
    body: opts?.body ?? makeBody("hello world"),
    frontmatter: opts?.frontmatter ?? makeFrontmatter(),
  };
}
function makeIdleState(): IdleState {
  return { status: "idle" as const };
}
function makeEditingState(opts?: {
  currentNoteId?: NoteId;
  isDirty?: boolean;
}): EditingState {
  return {
    status: "editing" as const,
    currentNoteId: opts?.currentNoteId ?? makeNoteId("2026-04-30-120000-000"),
    isDirty: opts?.isDirty ?? false,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  };
}
function makeSaveFailedState(opts?: {
  currentNoteId?: NoteId;
  pendingNextNoteId?: NoteId | null;
  lastSaveError?: SaveError;
}): SaveFailedState {
  return {
    status: "save-failed" as const,
    currentNoteId:
      opts?.currentNoteId ?? makeNoteId("2026-04-30-120000-000"),
    pendingNextNoteId: opts?.pendingNextNoteId ?? null,
    lastSaveError: opts?.lastSaveError ?? {
      kind: "fs" as const,
      reason: { kind: "unknown" as const, detail: "test" },
    },
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("classifyCurrentSession", () => {
  // REQ-EPNS-001, PROP-EPNS-002
  test("IdleState → { kind: 'no-current' }", () => {
    const result = classifyCurrentSession(makeIdleState(), null);
    expect(result).toEqual({ kind: "no-current" });
  });

  // REQ-EPNS-002, PROP-EPNS-003
  test("EditingState + empty body → { kind: 'empty', noteId }", () => {
    const noteId = makeNoteId("2026-04-30-120000-000");
    const emptyNote = makeNote({ id: noteId, body: makeBody("") });
    const state = makeEditingState({ currentNoteId: noteId });
    const result = classifyCurrentSession(state, emptyNote);
    expect(result).toEqual({ kind: "empty", noteId });
  });

  // REQ-EPNS-002 edge case: whitespace-only is empty
  test("EditingState + whitespace-only body → { kind: 'empty', noteId }", () => {
    const noteId = makeNoteId("2026-04-30-120000-001");
    const wsNote = makeNote({ id: noteId, body: makeBody("   \n\t  ") });
    const state = makeEditingState({ currentNoteId: noteId });
    const result = classifyCurrentSession(state, wsNote);
    expect(result).toEqual({ kind: "empty", noteId });
  });

  // REQ-EPNS-003, PROP-EPNS-003
  test("EditingState + non-empty body → { kind: 'dirty', noteId, note }", () => {
    const noteId = makeNoteId("2026-04-30-120000-002");
    const dirtyNote = makeNote({ id: noteId, body: makeBody("content") });
    const state = makeEditingState({ currentNoteId: noteId });
    const result = classifyCurrentSession(state, dirtyNote);
    expect(result).toEqual({ kind: "dirty", noteId, note: dirtyNote });
  });

  // REQ-EPNS-006, PROP-EPNS-004
  test("SaveFailedState → { kind: 'dirty', noteId, note }", () => {
    const noteId = makeNoteId("2026-04-30-120000-003");
    const note = makeNote({ id: noteId, body: makeBody("unsaved content") });
    const state = makeSaveFailedState({ currentNoteId: noteId });
    const result = classifyCurrentSession(state, note);
    expect(result).toEqual({ kind: "dirty", noteId, note });
  });

  // REQ-EPNS-006: SaveFailedState with pendingNextNoteId should still return dirty
  test("SaveFailedState with pendingNextNoteId → { kind: 'dirty' } (pendingNextNoteId ignored)", () => {
    const noteId = makeNoteId("2026-04-30-120000-004");
    const pendingId = makeNoteId("2026-04-30-120000-005");
    const note = makeNote({ id: noteId, body: makeBody("content") });
    const state = makeSaveFailedState({
      currentNoteId: noteId,
      pendingNextNoteId: pendingId,
    });
    const result = classifyCurrentSession(state, note);
    expect(result.kind).toBe("dirty");
    if (result.kind === "dirty") {
      expect(result.noteId).toBe(noteId);
      expect(result.note).toBe(note);
    }
  });

  // REQ-EPNS-007: pure function — no ports needed
  test("function signature accepts only (state, note) — no Clock, no emit", () => {
    expect(classifyCurrentSession.length).toBe(2);
  });

  // FIND-005: saving/switching states throw
  test("SavingState → throws", () => {
    const state = {
      status: "saving" as const,
      currentNoteId: makeNoteId("2026-04-30-120000-010"),
      savingStartedAt: makeTimestamp(1000),
    };
    expect(() => classifyCurrentSession(state, null)).toThrow("saving");
  });

  test("SwitchingState → throws", () => {
    const state = {
      status: "switching" as const,
      currentNoteId: makeNoteId("2026-04-30-120000-011"),
      pendingNextNoteId: makeNoteId("2026-04-30-120000-012"),
      savingStartedAt: makeTimestamp(1000),
    };
    expect(() => classifyCurrentSession(state, null)).toThrow("switching");
  });

  // FIND-004: EditingState with null note → throws
  test("EditingState + null currentNote → throws", () => {
    const state = makeEditingState();
    expect(() => classifyCurrentSession(state, null)).toThrow("must not be null");
  });

  // FIND-004: SaveFailedState with null note → throws
  test("SaveFailedState + null currentNote → throws", () => {
    const state = makeSaveFailedState();
    expect(() => classifyCurrentSession(state, null)).toThrow("must not be null");
  });
});
