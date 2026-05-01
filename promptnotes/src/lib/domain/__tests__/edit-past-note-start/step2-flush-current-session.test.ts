/**
 * step2-flush-current-session.test.ts — Unit tests for flushCurrentSession
 *
 * REQ-EPNS-001: no-current → no-op
 * REQ-EPNS-002: empty → discard + EmptyNoteDiscarded
 * REQ-EPNS-003: dirty, save succeeds → saved + NoteFileSaved
 * REQ-EPNS-004: dirty, save fails → SwitchError + NoteSaveFailed
 * REQ-EPNS-006: save-failed state → retry save
 * REQ-EPNS-009: EmptyNoteDiscarded is PublicDomainEvent
 * REQ-EPNS-012: Clock budget per path
 */

import { describe, test, expect } from "bun:test";
import type {
  NoteId,
  Timestamp,
  Body,
  Frontmatter,
} from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type {
  NoteFileSaved,
  NoteSaveFailed,
  EmptyNoteDiscarded,
} from "promptnotes-domain-types/shared/events";
import type { CurrentSessionDecision } from "promptnotes-domain-types/capture/stages";

import {
  flushCurrentSession,
  type FlushCurrentSessionPorts,
} from "../../edit-past-note-start/flush-current-session";

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
function makeNote(opts?: { id?: NoteId; body?: Body }): Note {
  return {
    id: opts?.id ?? makeNoteId("2026-04-30-120000-000"),
    body: opts?.body ?? makeBody("content"),
    frontmatter: makeFrontmatter(),
  };
}
function makeEventSpy() {
  const events: Array<{ kind: string; [k: string]: unknown }> = [];
  return { events, emit: (e: { kind: string; [k: string]: unknown }) => events.push(e) };
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

// ── Tests ────────────────────────────────────────────────────────────────

describe("flushCurrentSession", () => {
  // REQ-EPNS-001: no-current → no-op
  test("no-current decision → FlushedCurrentSession { result: 'no-op' }", () => {
    const spy = makeEventSpy();
    const decision: CurrentSessionDecision = { kind: "no-current" };
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => makeTimestamp(Date.now()),
      blurSave: () => { throw new Error("should not be called"); },
      emit: spy.emit,
    };
    const result = flushCurrentSession(decision, null, ports, null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.result).toBe("no-op");
    }
    expect(spy.events).toHaveLength(0);
  });

  // REQ-EPNS-002: empty → discard + EmptyNoteDiscarded emitted
  test("empty decision → FlushedCurrentSession { result: 'discarded' } + EmptyNoteDiscarded", () => {
    const spy = makeEventSpy();
    const noteId = makeNoteId("2026-04-30-120000-001");
    const decision: CurrentSessionDecision = { kind: "empty", noteId };
    const ts = makeTimestamp(5000);
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => ts,
      blurSave: () => { throw new Error("should not be called"); },
      emit: spy.emit,
    };
    const result = flushCurrentSession(decision, null, ports, null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.result).toBe("discarded");
    }
    expect(spy.events).toHaveLength(1);
    expect(spy.events[0]!.kind).toBe("empty-note-discarded");
    expect((spy.events[0] as EmptyNoteDiscarded).noteId).toBe(noteId);
    expect((spy.events[0] as EmptyNoteDiscarded).occurredOn).toBe(ts);
  });

  // REQ-EPNS-003: dirty, save succeeds → saved
  test("dirty decision + save succeeds → FlushedCurrentSession { result: 'saved' }", () => {
    const spy = makeEventSpy();
    const noteId = makeNoteId("2026-04-30-120000-002");
    const note = makeNote({ id: noteId });
    const decision: CurrentSessionDecision = {
      kind: "dirty",
      noteId,
      note,
    };
    const savedEvent = makeNoteFileSaved(noteId);
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => makeTimestamp(Date.now()),
      blurSave: () => ({ ok: true as const, value: savedEvent }),
      emit: spy.emit,
    };
    const result = flushCurrentSession(decision, null, ports, null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.result).toBe("saved");
    }
    // NoteFileSaved should be emitted
    const savedEvents = spy.events.filter((e) => e.kind === "note-file-saved");
    expect(savedEvents).toHaveLength(1);
  });

  // REQ-EPNS-004: dirty, save fails → Err(SwitchError)
  test("dirty decision + save fails → SwitchError with correct shape", () => {
    const spy = makeEventSpy();
    const noteId = makeNoteId("2026-04-30-120000-003");
    const selectedNoteId = makeNoteId("2026-04-30-130000-000");
    const note = makeNote({ id: noteId });
    const decision: CurrentSessionDecision = {
      kind: "dirty",
      noteId,
      note,
    };
    const saveError: SaveError = {
      kind: "fs",
      reason: { kind: "permission", path: "/vault/test.md" },
    };
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => makeTimestamp(Date.now()),
      blurSave: () => ({ ok: false as const, error: saveError }),
      emit: spy.emit,
    };
    const result = flushCurrentSession(decision, selectedNoteId, ports, null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("save-failed-during-switch");
      expect(result.error.underlying).toEqual(saveError);
      expect(result.error.pendingNextNoteId).toBe(selectedNoteId);
    }
    // NoteSaveFailed should be emitted
    const failEvents = spy.events.filter(
      (e) => e.kind === "note-save-failed"
    );
    expect(failEvents).toHaveLength(1);
    expect((failEvents[0] as NoteSaveFailed).noteId).toBe(noteId);
  });

  // REQ-EPNS-012: no Clock.now() call on no-current path
  test("no-current path: Clock.now() not called", () => {
    let clockCalls = 0;
    const decision: CurrentSessionDecision = { kind: "no-current" };
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => { clockCalls++; return makeTimestamp(1000); },
      blurSave: () => { throw new Error("should not be called"); },
      emit: () => {},
    };
    flushCurrentSession(decision, null, ports, null);
    expect(clockCalls).toBe(0);
  });

  // REQ-EPNS-012: Clock.now() called once on empty path for EmptyNoteDiscarded.occurredOn
  test("empty path: Clock.now() called exactly once", () => {
    let clockCalls = 0;
    const noteId = makeNoteId("2026-04-30-120000-004");
    const decision: CurrentSessionDecision = { kind: "empty", noteId };
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => { clockCalls++; return makeTimestamp(1000); },
      blurSave: () => { throw new Error("should not be called"); },
      emit: () => {},
    };
    flushCurrentSession(decision, null, ports, null);
    expect(clockCalls).toBe(1);
  });

  // REQ-EPNS-012: Clock.now() NOT called on dirty-success path
  test("dirty-success path: Clock.now() not called by flushCurrentSession", () => {
    let clockCalls = 0;
    const noteId = makeNoteId("2026-04-30-120000-005");
    const note = makeNote({ id: noteId });
    const decision: CurrentSessionDecision = { kind: "dirty", noteId, note };
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => { clockCalls++; return makeTimestamp(1000); },
      blurSave: () => ({ ok: true as const, value: makeNoteFileSaved(noteId) }),
      emit: () => {},
    };
    flushCurrentSession(decision, null, ports, null);
    expect(clockCalls).toBe(0);
  });

  // FIND-001: dirty-fail path: Clock.now() called once for NoteSaveFailed.occurredOn
  test("dirty-fail path: Clock.now() called once for NoteSaveFailed.occurredOn", () => {
    let clockCalls = 0;
    const ts = makeTimestamp(99000);
    const noteId = makeNoteId("2026-04-30-120000-006");
    const note = makeNote({ id: noteId });
    const decision: CurrentSessionDecision = { kind: "dirty", noteId, note };
    const selectedId = makeNoteId("2026-04-30-130000-000");
    const saveError: SaveError = { kind: "fs", reason: { kind: "lock" } };
    const spy = makeEventSpy();
    const ports: FlushCurrentSessionPorts = {
      clockNow: () => { clockCalls++; return ts; },
      blurSave: () => ({ ok: false as const, error: saveError }),
      emit: spy.emit,
    };
    flushCurrentSession(decision, selectedId, ports, null);
    expect(clockCalls).toBe(1);
    // Verify NoteSaveFailed.occurredOn uses the Clock port value
    const failEvent = spy.events.find((e) => e.kind === "note-save-failed");
    expect(failEvent).toBeDefined();
    expect((failEvent as any).occurredOn).toBe(ts);
  });

  // FIND-005: SaveError → NoteSaveFailureReason mapping — all 6 variants
  describe("SaveError → NoteSaveFailureReason mapping", () => {
    const mappingCases: Array<[string, SaveError, string]> = [
      ["fs/permission → 'permission'", { kind: "fs", reason: { kind: "permission" } }, "permission"],
      ["fs/disk-full → 'disk-full'", { kind: "fs", reason: { kind: "disk-full" } }, "disk-full"],
      ["fs/lock → 'lock'", { kind: "fs", reason: { kind: "lock" } }, "lock"],
      ["fs/not-found → 'unknown'", { kind: "fs", reason: { kind: "not-found", path: "/x" } }, "unknown"],
      ["fs/unknown → 'unknown'", { kind: "fs", reason: { kind: "unknown", detail: "err" } }, "unknown"],
      ["validation → 'unknown'", { kind: "validation", reason: { kind: "empty-body-on-idle" } }, "unknown"],
    ];

    for (const [label, saveError, expectedReason] of mappingCases) {
      test(label, () => {
        const noteId = makeNoteId("2026-04-30-120000-007");
        const note = makeNote({ id: noteId });
        const decision: CurrentSessionDecision = { kind: "dirty", noteId, note };
        const spy = makeEventSpy();
        const ports: FlushCurrentSessionPorts = {
          clockNow: () => makeTimestamp(1000),
          blurSave: () => ({ ok: false as const, error: saveError }),
          emit: spy.emit,
        };
        flushCurrentSession(decision, makeNoteId("target"), ports, null);
        const failEvent = spy.events.find((e) => e.kind === "note-save-failed");
        expect(failEvent).toBeDefined();
        expect((failEvent as any).reason).toBe(expectedReason);
      });
    }
  });
});
