/**
 * step3-start-new-session.test.ts — Unit tests for startNewSession
 *
 * REQ-EPNS-008: Hydrate snapshot, create NewSession, transition EditingSessionState
 * REQ-EPNS-010: EditorFocusedOnPastNote emitted
 * REQ-EPNS-012: Clock.now() called exactly once
 */

import { describe, test, expect } from "bun:test";
import type {
  NoteId,
  Timestamp,
  Body,
  Frontmatter,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { EditorFocusedOnPastNote } from "promptnotes-domain-types/capture/internal-events";
import type { PastNoteSelection } from "promptnotes-domain-types/capture/stages";

import {
  startNewSession,
  type StartNewSessionPorts,
} from "../../edit-past-note-start/start-new-session";

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
function makeFrontmatter(): Frontmatter {
  return {
    tags: [],
    createdAt: makeTimestamp(1000),
    updatedAt: makeTimestamp(1000),
  } as unknown as Frontmatter;
}
function makeSnapshot(opts?: {
  noteId?: NoteId;
  body?: Body;
}): NoteFileSnapshot {
  return {
    noteId: opts?.noteId ?? makeNoteId("2026-04-30-120000-000"),
    body: opts?.body ?? makeBody("past note content"),
    frontmatter: makeFrontmatter(),
    filePath: "/vault/past-note.md",
    fileMtime: makeTimestamp(1000),
  };
}
function makeSelection(opts?: {
  noteId?: NoteId;
  snapshot?: NoteFileSnapshot;
}): PastNoteSelection {
  const noteId = opts?.noteId ?? makeNoteId("2026-04-30-120000-000");
  return {
    kind: "PastNoteSelection",
    noteId,
    snapshot: opts?.snapshot ?? makeSnapshot({ noteId }),
  };
}
function makeEventSpy() {
  const events: Array<{ kind: string; [k: string]: unknown }> = [];
  return {
    events,
    emit: (e: { kind: string; [k: string]: unknown }) => events.push(e),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("startNewSession", () => {
  // REQ-EPNS-008: Creates NewSession with correct fields
  test("returns NewSession with noteId from selection", () => {
    const noteId = makeNoteId("2026-04-30-150000-000");
    const selection = makeSelection({ noteId });
    const now = makeTimestamp(9000);
    const spy = makeEventSpy();
    const ports: StartNewSessionPorts = {
      clockNow: () => now,
      hydrateSnapshot: (s: NoteFileSnapshot) => ({
        id: s.noteId,
        body: s.body,
        frontmatter: s.frontmatter,
      }),
      emit: spy.emit,
    };

    const result = startNewSession(selection, ports);

    expect(result.kind).toBe("NewSession");
    expect(result.noteId).toBe(noteId);
    expect(result.startedAt).toBe(now);
    expect(result.note.id).toBe(noteId);
  });

  // REQ-EPNS-008: Note hydrated from snapshot
  test("note is hydrated from snapshot body and frontmatter", () => {
    const noteId = makeNoteId("2026-04-30-160000-000");
    const body = makeBody("specific content");
    const snapshot = makeSnapshot({ noteId, body });
    const selection = makeSelection({ noteId, snapshot });
    const spy = makeEventSpy();
    const ports: StartNewSessionPorts = {
      clockNow: () => makeTimestamp(9000),
      hydrateSnapshot: (s: NoteFileSnapshot) => ({
        id: s.noteId,
        body: s.body,
        frontmatter: s.frontmatter,
      }),
      emit: spy.emit,
    };

    const result = startNewSession(selection, ports);
    expect(result.note.body).toBe(body);
  });

  // REQ-EPNS-010: EditorFocusedOnPastNote emitted
  test("emits EditorFocusedOnPastNote with noteId and occurredOn", () => {
    const noteId = makeNoteId("2026-04-30-170000-000");
    const selection = makeSelection({ noteId });
    const now = makeTimestamp(10000);
    const spy = makeEventSpy();
    const ports: StartNewSessionPorts = {
      clockNow: () => now,
      hydrateSnapshot: (s: NoteFileSnapshot) => ({
        id: s.noteId,
        body: s.body,
        frontmatter: s.frontmatter,
      }),
      emit: spy.emit,
    };

    startNewSession(selection, ports);

    expect(spy.events).toHaveLength(1);
    const event = spy.events[0] as EditorFocusedOnPastNote;
    expect(event.kind).toBe("editor-focused-on-past-note");
    expect(event.noteId).toBe(noteId);
    expect(event.occurredOn).toBe(now);
  });

  // REQ-EPNS-012: Clock.now() called exactly once
  test("Clock.now() called exactly once", () => {
    let clockCalls = 0;
    const noteId = makeNoteId("2026-04-30-180000-000");
    const selection = makeSelection({ noteId });
    const spy = makeEventSpy();
    const ports: StartNewSessionPorts = {
      clockNow: () => {
        clockCalls++;
        return makeTimestamp(11000);
      },
      hydrateSnapshot: (s: NoteFileSnapshot) => ({
        id: s.noteId,
        body: s.body,
        frontmatter: s.frontmatter,
      }),
      emit: spy.emit,
    };

    startNewSession(selection, ports);
    expect(clockCalls).toBe(1);
  });
});
