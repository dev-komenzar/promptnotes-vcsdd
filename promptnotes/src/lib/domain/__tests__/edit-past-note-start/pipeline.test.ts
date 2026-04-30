/**
 * pipeline.test.ts — Full EditPastNoteStart pipeline integration tests
 *
 * REQ-EPNS-001: Happy path — no-current session
 * REQ-EPNS-002: Happy path — empty session
 * REQ-EPNS-003: Happy path — dirty session, save succeeds
 * REQ-EPNS-004: Error path — dirty session, save fails
 * REQ-EPNS-005: Edge case — same note re-selected
 * REQ-EPNS-006: Edge case — save-failed state, new note
 * REQ-EPNS-009: EmptyNoteDiscarded is PublicDomainEvent
 * REQ-EPNS-010: EditorFocusedOnPastNote is CaptureInternalEvent, NOT PublicDomainEvent
 * REQ-EPNS-011: SwitchError type exhaustiveness
 * REQ-EPNS-012: Clock.now() budget per path
 *
 * PROP-EPNS-005: SwitchError type exhaustiveness (Tier 0)
 * PROP-EPNS-006..018: Integration-level proof obligations
 * PROP-EPNS-015: Type-level event membership assertions
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
import type {
  PublicDomainEvent,
  NoteFileSaved,
  EmptyNoteDiscarded,
} from "promptnotes-domain-types/shared/events";
import type { SaveError, SwitchError } from "promptnotes-domain-types/shared/errors";
import type {
  EditingState,
  IdleState,
  SaveFailedState,
} from "promptnotes-domain-types/capture/states";
import type {
  CaptureInternalEvent,
  EditorFocusedOnPastNote,
} from "promptnotes-domain-types/capture/internal-events";

import {
  runEditPastNoteStartPipeline,
  type EditPastNoteStartPorts,
  type SameNoteNoOp,
} from "../../edit-past-note-start/pipeline";

// ── PROP-EPNS-005: SwitchError type exhaustiveness (Tier 0) ──────────────
// Compile-time check: SwitchError has exactly one variant 'save-failed-during-switch'.
function _exhaustiveSwitchError(e: SwitchError): string {
  switch (e.kind) {
    case "save-failed-during-switch":
      return e.kind;
    default: {
      const _never: never = e;
      return _never;
    }
  }
}
void _exhaustiveSwitchError;

// ── PROP-EPNS-015: Type-level event membership assertions (Tier 0) ──────
type _IsNever<T> = [T] extends [never] ? true : false;

// EditorFocusedOnPastNote must NOT be in PublicDomainEvent
type _EditorFocusedNotPublic = Extract<
  PublicDomainEvent,
  { kind: "editor-focused-on-past-note" }
>;
const _editorFocusedNeverPublic: _IsNever<_EditorFocusedNotPublic> = true;
void _editorFocusedNeverPublic;

// EmptyNoteDiscarded MUST be in PublicDomainEvent
type _EmptyNoteDiscardedIsPublic = Extract<
  PublicDomainEvent,
  { kind: "empty-note-discarded" }
>;
const _e: _EmptyNoteDiscardedIsPublic = null as unknown as EmptyNoteDiscarded;
void _e;

// EditorFocusedOnPastNote MUST be in CaptureInternalEvent
type _EditorFocusedIsInternal = Extract<
  CaptureInternalEvent,
  { kind: "editor-focused-on-past-note" }
>;
const _f: _EditorFocusedIsInternal =
  null as unknown as EditorFocusedOnPastNote;
void _f;

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
function makeNote(opts?: {
  id?: NoteId;
  body?: Body;
  frontmatter?: Frontmatter;
}): Note {
  return {
    id: opts?.id ?? makeNoteId("2026-04-30-120000-000"),
    body: opts?.body ?? makeBody("content"),
    frontmatter: opts?.frontmatter ?? makeFrontmatter(),
  };
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
function makeEventSpy() {
  const events: Array<{ kind: string; [k: string]: unknown }> = [];
  return {
    events,
    emit: (e: { kind: string; [k: string]: unknown }) => events.push(e),
  };
}
function makeNoteFileSaved(noteId: NoteId): NoteFileSaved {
  return {
    kind: "note-file-saved",
    noteId,
    body: makeBody("content"),
    frontmatter: makeFrontmatter(),
    previousFrontmatter: null,
    occurredOn: makeTimestamp(2000),
  };
}
function makeHappyPorts(
  spy: ReturnType<typeof makeEventSpy>,
  overrides?: Partial<EditPastNoteStartPorts>
): EditPastNoteStartPorts {
  return {
    clockNow: overrides?.clockNow ?? (() => makeTimestamp(Date.now())),
    blurSave: overrides?.blurSave ??
      ((noteId) => ({ ok: true as const, value: makeNoteFileSaved(noteId) })),
    hydrateSnapshot: overrides?.hydrateSnapshot ??
      ((s: NoteFileSnapshot) => ({
        id: s.noteId,
        body: s.body,
        frontmatter: s.frontmatter,
      })),
    emit: spy.emit,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("EditPastNoteStart pipeline", () => {
  // PROP-EPNS-006: Happy path — no-current
  test("idle state → selects past note → NewSession with editing state", () => {
    const selectedId = makeNoteId("2026-04-30-150000-000");
    const snapshot = makeSnapshot({ noteId: selectedId });
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);

    const result = runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId: selectedId, snapshot },
        currentState: makeIdleState(),
        currentNote: null,
        previousFrontmatter: null,
      },
      ports
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.noteId).toBe(selectedId);
    }
    // EditorFocusedOnPastNote emitted, no EmptyNoteDiscarded
    const focusEvents = spy.events.filter(
      (e) => e.kind === "editor-focused-on-past-note"
    );
    const discardEvents = spy.events.filter(
      (e) => e.kind === "empty-note-discarded"
    );
    expect(focusEvents).toHaveLength(1);
    expect(discardEvents).toHaveLength(0);
  });

  // PROP-EPNS-007: Happy path — empty session
  test("editing empty note → discard + EmptyNoteDiscarded before EditorFocusedOnPastNote", () => {
    const currentId = makeNoteId("2026-04-30-120000-000");
    const selectedId = makeNoteId("2026-04-30-150000-000");
    const snapshot = makeSnapshot({ noteId: selectedId });
    const emptyNote = makeNote({ id: currentId, body: makeBody("") });
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);

    const result = runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId: selectedId, snapshot },
        currentState: makeEditingState({ currentNoteId: currentId }),
        currentNote: emptyNote,
        previousFrontmatter: null,
      },
      ports
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.noteId).toBe(selectedId);
    }
    // PROP-EPNS-016: EmptyNoteDiscarded before EditorFocusedOnPastNote
    const discardIdx = spy.events.findIndex(
      (e) => e.kind === "empty-note-discarded"
    );
    const focusIdx = spy.events.findIndex(
      (e) => e.kind === "editor-focused-on-past-note"
    );
    expect(discardIdx).toBeGreaterThanOrEqual(0);
    expect(focusIdx).toBeGreaterThan(discardIdx);
  });

  // PROP-EPNS-008: Happy path — dirty session, save succeeds
  test("editing dirty note → save + NoteFileSaved before EditorFocusedOnPastNote", () => {
    const currentId = makeNoteId("2026-04-30-120000-000");
    const selectedId = makeNoteId("2026-04-30-150000-000");
    const snapshot = makeSnapshot({ noteId: selectedId });
    const dirtyNote = makeNote({ id: currentId, body: makeBody("dirty content") });
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);

    const result = runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId: selectedId, snapshot },
        currentState: makeEditingState({ currentNoteId: currentId, isDirty: true }),
        currentNote: dirtyNote,
        previousFrontmatter: null,
      },
      ports
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.noteId).toBe(selectedId);
    }
    // PROP-EPNS-017: NoteFileSaved before EditorFocusedOnPastNote
    const savedIdx = spy.events.findIndex(
      (e) => e.kind === "note-file-saved"
    );
    const focusIdx = spy.events.findIndex(
      (e) => e.kind === "editor-focused-on-past-note"
    );
    expect(savedIdx).toBeGreaterThanOrEqual(0);
    expect(focusIdx).toBeGreaterThan(savedIdx);
  });

  // PROP-EPNS-009: Error path — dirty session, save fails
  test("dirty save fails → SwitchError + NoteSaveFailed emitted + no EditorFocusedOnPastNote", () => {
    const currentId = makeNoteId("2026-04-30-120000-000");
    const selectedId = makeNoteId("2026-04-30-150000-000");
    const snapshot = makeSnapshot({ noteId: selectedId });
    const dirtyNote = makeNote({ id: currentId, body: makeBody("content") });
    const spy = makeEventSpy();
    const saveError: SaveError = {
      kind: "fs",
      reason: { kind: "permission", path: "/vault/test.md" },
    };
    const ports = makeHappyPorts(spy, {
      blurSave: () => ({ ok: false as const, error: saveError }),
    });

    const result = runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId: selectedId, snapshot },
        currentState: makeEditingState({ currentNoteId: currentId }),
        currentNote: dirtyNote,
        previousFrontmatter: null,
      },
      ports
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("save-failed-during-switch");
      expect(result.error.pendingNextNoteId).toBe(selectedId);
    }
    // NoteSaveFailed emitted, EditorFocusedOnPastNote NOT emitted
    expect(
      spy.events.some((e) => e.kind === "note-save-failed")
    ).toBe(true);
    expect(
      spy.events.some((e) => e.kind === "editor-focused-on-past-note")
    ).toBe(false);
  });

  // PROP-EPNS-010: Same-note re-selection — no-op (FIND-003: returns SameNoteNoOp)
  test("same note re-selected → SameNoteNoOp, no flush, no save, EditorFocusedOnPastNote emitted", () => {
    const noteId = makeNoteId("2026-04-30-120000-000");
    const snapshot = makeSnapshot({ noteId });
    const note = makeNote({ id: noteId });
    const spy = makeEventSpy();
    let blurSaveCalled = false;
    const ports = makeHappyPorts(spy, {
      blurSave: () => { blurSaveCalled = true; return { ok: true as const, value: makeNoteFileSaved(noteId) }; },
    });

    const result = runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId, snapshot },
        currentState: makeEditingState({ currentNoteId: noteId, isDirty: true }),
        currentNote: note,
        previousFrontmatter: null,
      },
      ports
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      // FIND-003: Must be SameNoteNoOp, not NewSession
      expect(result.value.kind).toBe("SameNoteNoOp");
      expect(result.value.noteId).toBe(noteId);
    }
    expect(blurSaveCalled).toBe(false);
    expect(spy.events.some((e) => e.kind === "empty-note-discarded")).toBe(false);
    expect(spy.events.some((e) => e.kind === "note-file-saved")).toBe(false);
    expect(spy.events.some((e) => e.kind === "editor-focused-on-past-note")).toBe(true);
  });

  // FIND-004: Same-note re-selection on SaveFailedState
  test("save-failed state + same note → SameNoteNoOp, error state preserved", () => {
    const noteId = makeNoteId("2026-04-30-120000-000");
    const snapshot = makeSnapshot({ noteId });
    const note = makeNote({ id: noteId });
    const spy = makeEventSpy();
    let blurSaveCalled = false;
    const ports = makeHappyPorts(spy, {
      blurSave: () => { blurSaveCalled = true; return { ok: true as const, value: makeNoteFileSaved(noteId) }; },
    });

    const result = runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId, snapshot },
        currentState: makeSaveFailedState({ currentNoteId: noteId }),
        currentNote: note,
        previousFrontmatter: null,
      },
      ports
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.kind).toBe("SameNoteNoOp");
    }
    expect(blurSaveCalled).toBe(false);
    expect(spy.events.some((e) => e.kind === "editor-focused-on-past-note")).toBe(true);
  });

  // PROP-EPNS-011: Save-failed state → re-select new note, save succeeds
  test("save-failed state + new note selected + save succeeds → NewSession", () => {
    const currentId = makeNoteId("2026-04-30-120000-000");
    const oldPendingId = makeNoteId("2026-04-30-130000-000");
    const newSelectedId = makeNoteId("2026-04-30-140000-000");
    const snapshot = makeSnapshot({ noteId: newSelectedId });
    const note = makeNote({ id: currentId, body: makeBody("content") });
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy);

    const result = runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId: newSelectedId, snapshot },
        currentState: makeSaveFailedState({
          currentNoteId: currentId,
          pendingNextNoteId: oldPendingId,
        }),
        currentNote: note,
        previousFrontmatter: null,
      },
      ports
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.noteId).toBe(newSelectedId);
    }
  });

  // PROP-EPNS-012: Save-failed state → re-select, save fails again
  test("save-failed state + new note + save fails → SwitchError.pendingNextNoteId is new note", () => {
    const currentId = makeNoteId("2026-04-30-120000-000");
    const oldPendingId = makeNoteId("2026-04-30-130000-000");
    const newSelectedId = makeNoteId("2026-04-30-140000-000");
    const snapshot = makeSnapshot({ noteId: newSelectedId });
    const note = makeNote({ id: currentId, body: makeBody("content") });
    const spy = makeEventSpy();
    const saveError: SaveError = {
      kind: "fs",
      reason: { kind: "disk-full" },
    };
    const ports = makeHappyPorts(spy, {
      blurSave: () => ({ ok: false as const, error: saveError }),
    });

    const result = runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId: newSelectedId, snapshot },
        currentState: makeSaveFailedState({
          currentNoteId: currentId,
          pendingNextNoteId: oldPendingId,
        }),
        currentNote: note,
        previousFrontmatter: null,
      },
      ports
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // pendingNextNoteId should be the NEW selected note, not the old one
      expect(result.error.pendingNextNoteId).toBe(newSelectedId);
    }
  });

  // PROP-EPNS-013/014: Clock.now() budget per path
  test("idle path: Clock.now() called exactly once (in startNewSession)", () => {
    let clockCalls = 0;
    const selectedId = makeNoteId("2026-04-30-150000-000");
    const snapshot = makeSnapshot({ noteId: selectedId });
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy, {
      clockNow: () => { clockCalls++; return makeTimestamp(Date.now()); },
    });

    runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId: selectedId, snapshot },
        currentState: makeIdleState(),
        currentNote: null,
        previousFrontmatter: null,
      },
      ports
    );

    expect(clockCalls).toBe(1);
  });

  test("empty path: Clock.now() called exactly twice (flush + startNewSession)", () => {
    let clockCalls = 0;
    const currentId = makeNoteId("2026-04-30-120000-000");
    const selectedId = makeNoteId("2026-04-30-150000-000");
    const snapshot = makeSnapshot({ noteId: selectedId });
    const emptyNote = makeNote({ id: currentId, body: makeBody("") });
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy, {
      clockNow: () => { clockCalls++; return makeTimestamp(Date.now()); },
    });

    runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId: selectedId, snapshot },
        currentState: makeEditingState({ currentNoteId: currentId }),
        currentNote: emptyNote,
        previousFrontmatter: null,
      },
      ports
    );

    expect(clockCalls).toBe(2);
  });

  // PROP-EPNS-014: Error path — Clock.now() called once (FIND-001: for NoteSaveFailed.occurredOn)
  test("dirty save fails: Clock.now() called once for NoteSaveFailed timestamp", () => {
    let clockCalls = 0;
    const currentId = makeNoteId("2026-04-30-120000-000");
    const selectedId = makeNoteId("2026-04-30-150000-000");
    const snapshot = makeSnapshot({ noteId: selectedId });
    const dirtyNote = makeNote({ id: currentId });
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy, {
      clockNow: () => { clockCalls++; return makeTimestamp(Date.now()); },
      blurSave: () => ({
        ok: false as const,
        error: { kind: "fs" as const, reason: { kind: "lock" as const, path: "/x" } },
      }),
    });

    runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId: selectedId, snapshot },
        currentState: makeEditingState({ currentNoteId: currentId }),
        currentNote: dirtyNote,
        previousFrontmatter: null,
      },
      ports
    );

    // FIND-001: Clock.now() is now called once for NoteSaveFailed.occurredOn
    expect(clockCalls).toBe(1);
  });

  // FIND-005: Same-note path: Clock.now() called exactly once
  test("same-note path: Clock.now() called exactly once", () => {
    let clockCalls = 0;
    const noteId = makeNoteId("2026-04-30-120000-000");
    const snapshot = makeSnapshot({ noteId });
    const note = makeNote({ id: noteId });
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy, {
      clockNow: () => { clockCalls++; return makeTimestamp(Date.now()); },
    });

    runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId, snapshot },
        currentState: makeEditingState({ currentNoteId: noteId }),
        currentNote: note,
        previousFrontmatter: null,
      },
      ports
    );

    expect(clockCalls).toBe(1);
  });

  // FIND-006: Dirty-success path: Clock.now() called exactly once (in startNewSession)
  test("dirty-success path: Clock.now() called exactly once", () => {
    let clockCalls = 0;
    const currentId = makeNoteId("2026-04-30-120000-000");
    const selectedId = makeNoteId("2026-04-30-150000-000");
    const snapshot = makeSnapshot({ noteId: selectedId });
    const dirtyNote = makeNote({ id: currentId, body: makeBody("dirty") });
    const spy = makeEventSpy();
    const ports = makeHappyPorts(spy, {
      clockNow: () => { clockCalls++; return makeTimestamp(Date.now()); },
    });

    runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId: selectedId, snapshot },
        currentState: makeEditingState({ currentNoteId: currentId }),
        currentNote: dirtyNote,
        previousFrontmatter: null,
      },
      ports
    );

    expect(clockCalls).toBe(1);
  });

  // FIND-004: previousFrontmatter is passed to blurSave
  test("dirty-success: blurSave receives previousFrontmatter from pipeline input", () => {
    const currentId = makeNoteId("2026-04-30-120000-000");
    const selectedId = makeNoteId("2026-04-30-150000-000");
    const snapshot = makeSnapshot({ noteId: selectedId });
    const dirtyNote = makeNote({ id: currentId, body: makeBody("dirty") });
    const prevFm = makeFrontmatter();
    const spy = makeEventSpy();
    let capturedPrevFm: any = "NOT_CALLED";
    const ports = makeHappyPorts(spy, {
      blurSave: (noteId, note, prevFrontmatter) => {
        capturedPrevFm = prevFrontmatter;
        return { ok: true as const, value: makeNoteFileSaved(noteId) };
      },
    });

    runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId: selectedId, snapshot },
        currentState: makeEditingState({ currentNoteId: currentId }),
        currentNote: dirtyNote,
        previousFrontmatter: prevFm,
      },
      ports
    );

    expect(capturedPrevFm).toBe(prevFm);
  });

  // PROP-EPNS-019: Same-note path — EditorFocusedOnPastNote.occurredOn from Clock.now()
  test("same note: EditorFocusedOnPastNote.occurredOn equals Clock.now() value", () => {
    const noteId = makeNoteId("2026-04-30-120000-000");
    const snapshot = makeSnapshot({ noteId });
    const note = makeNote({ id: noteId });
    const spy = makeEventSpy();
    const now = makeTimestamp(42000);
    const ports = makeHappyPorts(spy, {
      clockNow: () => now,
    });

    runEditPastNoteStartPipeline(
      {
        selection: { kind: "PastNoteSelection", noteId, snapshot },
        currentState: makeEditingState({ currentNoteId: noteId }),
        currentNote: note,
        previousFrontmatter: null,
      },
      ports
    );

    const focusEvent = spy.events.find(
      (e) => e.kind === "editor-focused-on-past-note"
    ) as EditorFocusedOnPastNote;
    expect(focusEvent).toBeDefined();
    expect(focusEvent.occurredOn).toBe(now);
  });
});
