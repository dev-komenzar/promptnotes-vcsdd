/**
 * step4-initialize-capture.test.ts — Step 4: initializeCaptureSession tests
 *
 * REQ-010: initializeCaptureSession creates new note and editing session
 * REQ-011: NoteId uniqueness invariant (via nextAvailableNoteId pure helper)
 * REQ-012: Events emitted on success — NewNoteAutoCreated + EditorFocusedOnNewNote
 * REQ-014: Post-condition — InitialUIState shape
 *
 * PROP-003: nextAvailableNoteId returns NoteId not in existingIds (required: true)
 * PROP-013: InitialUIState has feed, tagInventory, editingSessionState, corruptedFiles
 * PROP-022: nextAvailableNoteId is deterministic
 *
 * Sprint 2 changes:
 *   FIND-001: assertions updated to editingSessionState.status/currentNoteId
 *   FIND-002: noteCreate port added; asserts Note.create(id, now) called with empty Body
 */

import { describe, test, expect } from "bun:test";
import * as fc from "fast-check";
import type { NoteId, Timestamp, VaultPath, Tag, Body } from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";
import type { CorruptedFile, NoteFileSnapshot } from "promptnotes-domain-types/shared/snapshots";
import type { HydratedFeed, InitialUIState } from "$lib/domain/app-startup/stages";
import type { Feed } from "promptnotes-domain-types/curate/aggregates";
import type { TagInventory } from "promptnotes-domain-types/curate/read-models";
import type { EditingState } from "promptnotes-domain-types/capture/states";

// The implementation does NOT exist yet. This import will fail in Red phase.
import {
  initializeCaptureSession,
  nextAvailableNoteId,
  type InitializeCaptureSessionPorts,
} from "$lib/domain/app-startup/initialize-capture";

// ── Test helpers ──────────────────────────────────────────────────────────

function makeTimestamp(epochMillis: number): Timestamp {
  return { epochMillis } as unknown as Timestamp;
}

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeTag(raw: string): Tag {
  return raw as unknown as Tag;
}

function makeBody(raw: string): Body {
  return raw as unknown as Body;
}

function makeEmptyFeed(): Feed {
  return {
    noteRefs: [],
    filterCriteria: { tags: [], frontmatterFields: new Map() },
    searchQuery: null,
    sortOrder: { field: "timestamp", direction: "desc" },
  };
}

function makeEmptyTagInventory(): TagInventory {
  return {
    entries: [],
    lastBuiltAt: makeTimestamp(1000),
  };
}

function makeHydratedFeed(
  corruptedFiles: CorruptedFile[] = [],
  feedOverride?: Partial<Feed>
): HydratedFeed {
  return {
    kind: "HydratedFeed",
    feed: { ...makeEmptyFeed(), ...feedOverride },
    tagInventory: makeEmptyTagInventory(),
    corruptedFiles,
  } as unknown as HydratedFeed;
}

function makeCorruptedFile(filePath: string): CorruptedFile {
  return {
    filePath,
    failure: { kind: "read", fsError: { kind: "permission" } },
  };
}

/** Build a synthetic Note that satisfies REQ-010 AC: empty Body, createdAt === updatedAt === now. */
function makeNoteFromCreate(id: NoteId, now: Timestamp): Note {
  return {
    id,
    body: "" as unknown as Body,
    frontmatter: {
      tags: [],
      createdAt: now,
      updatedAt: now,
    } as unknown as import("promptnotes-domain-types/shared/value-objects").Frontmatter,
  };
}

type EmittedEvents = Array<{ kind: string }>;

function makeEventSpy(): { events: EmittedEvents; emit: (e: { kind: string }) => void } {
  const events: EmittedEvents = [];
  return { events, emit: (e) => events.push(e) };
}

// ── REQ-010 / PROP-013: InitializeCaptureSession happy path ──────────────

describe("REQ-010 / PROP-013 / REQ-014: initializeCaptureSession creates editing session", () => {
  test("FIND-001 / PROP-013: InitialUIState has feed, tagInventory, editingSessionState, corruptedFiles (not initialNoteId)", async () => {
    // REQ-014 AC: InitialUIState shape.
    // REQ-010 AC: editingSessionState.status === 'editing'.
    // FIND-001: field is editingSessionState, NOT initialNoteId.
    const now = makeTimestamp(1714298400000);
    const newNoteId = makeNoteId("2026-04-28-120000-000");
    const spy = makeEventSpy();

    const ports: InitializeCaptureSessionPorts = {
      clockNow: () => now,
      allocateNoteId: (_ts: Timestamp) => newNoteId,
      noteCreate: (id: NoteId, ts: Timestamp): Note => makeNoteFromCreate(id, ts),
      emit: spy.emit,
    };

    const hydratedFeed = makeHydratedFeed();
    const result = await initializeCaptureSession(hydratedFeed, ports);

    expect(result.kind).toBe("InitialUIState");
    // REQ-014 AC checks
    expect("feed" in result).toBe(true);
    expect("tagInventory" in result).toBe(true);
    expect("corruptedFiles" in result).toBe(true);
    // FIND-001: editingSessionState must be present
    expect("editingSessionState" in result).toBe(true);
    // FIND-001: initialNoteId must NOT be present
    expect("initialNoteId" in result).toBe(false);
  });

  test("FIND-001 / REQ-010: editingSessionState.status === 'editing'", async () => {
    // REQ-010 AC: EditingSessionState.status === 'editing'.
    // FIND-001: accessed via editingSessionState.status, NOT result.initialNoteId.
    const now = makeTimestamp(1714298400000);
    const newNoteId = makeNoteId("2026-04-28-120000-000");
    const spy = makeEventSpy();

    const ports: InitializeCaptureSessionPorts = {
      clockNow: () => now,
      allocateNoteId: (_ts: Timestamp) => newNoteId,
      noteCreate: (id: NoteId, ts: Timestamp): Note => makeNoteFromCreate(id, ts),
      emit: spy.emit,
    };

    const result = await initializeCaptureSession(makeHydratedFeed(), ports);

    // FIND-001: editingSessionState carries the editing state
    expect(result.editingSessionState.status).toBe("editing");
  });

  test("FIND-001 / REQ-010: editingSessionState.currentNoteId equals NoteId returned by allocateNoteId", async () => {
    // REQ-010 AC: EditingSessionState.currentNoteId equals Vault.allocateNoteId result.
    // FIND-001: accessed via editingSessionState.currentNoteId.
    const now = makeTimestamp(1714298400000);
    const allocatedId = makeNoteId("2026-04-28-120000-007");
    const spy = makeEventSpy();

    const ports: InitializeCaptureSessionPorts = {
      clockNow: () => now,
      allocateNoteId: (_ts: Timestamp) => allocatedId,
      noteCreate: (id: NoteId, ts: Timestamp): Note => makeNoteFromCreate(id, ts),
      emit: spy.emit,
    };

    const result = await initializeCaptureSession(makeHydratedFeed(), ports);

    // FIND-001: currentNoteId (not initialNoteId) carries the allocated id
    expect(result.editingSessionState.status).toBe("editing");
    if (result.editingSessionState.status === "editing") {
      expect(result.editingSessionState.currentNoteId).toBe(allocatedId);
    }
  });

  test("REQ-010: Clock.now() is called to obtain Timestamp", async () => {
    // REQ-010 AC: system calls Clock.now() to obtain Timestamp.
    let clockCallCount = 0;
    const now = makeTimestamp(1714298400000);
    const spy = makeEventSpy();

    const ports: InitializeCaptureSessionPorts = {
      clockNow: () => {
        clockCallCount++;
        return now;
      },
      allocateNoteId: (_ts: Timestamp) => makeNoteId("2026-04-28-120000-000"),
      noteCreate: (id: NoteId, ts: Timestamp): Note => makeNoteFromCreate(id, ts),
      emit: spy.emit,
    };

    await initializeCaptureSession(makeHydratedFeed(), ports);

    expect(clockCallCount).toBeGreaterThanOrEqual(1);
  });

  test("REQ-014: corruptedFiles passed through to InitialUIState", async () => {
    // REQ-014 AC: InitialUIState.corruptedFiles carries the list.
    const corrupted = makeCorruptedFile("/vault/bad.md");
    const now = makeTimestamp(1000);
    const spy = makeEventSpy();

    const ports: InitializeCaptureSessionPorts = {
      clockNow: () => now,
      allocateNoteId: (_ts: Timestamp) => makeNoteId("id-new"),
      noteCreate: (id: NoteId, ts: Timestamp): Note => makeNoteFromCreate(id, ts),
      emit: spy.emit,
    };

    const hydratedFeed = makeHydratedFeed([corrupted]);
    const result = await initializeCaptureSession(hydratedFeed, ports);

    expect(result.corruptedFiles).toHaveLength(1);
    expect(result.corruptedFiles[0]).toEqual(corrupted);
  });
});

// ── FIND-002 / REQ-010: noteCreate port and Note.create contract ──────────

describe("FIND-002 / REQ-010: noteCreate port — Note.create(id, now) with empty Body", () => {
  test("FIND-002: noteCreate spy called exactly once with (allocatedId, now)", async () => {
    // REQ-010 AC: Note.create(id, now) called with the allocated NoteId and timestamp.
    // FIND-002: ports must include noteCreate; implementation must call it once.
    const now = makeTimestamp(1714298400000);
    const allocatedId = makeNoteId("2026-04-28-120000-000");
    const spy = makeEventSpy();

    let noteCreateCallCount = 0;
    let noteCreateCalledWithId: NoteId | undefined;
    let noteCreateCalledWithTs: Timestamp | undefined;

    const ports: InitializeCaptureSessionPorts = {
      clockNow: () => now,
      allocateNoteId: (_ts: Timestamp) => allocatedId,
      noteCreate: (id: NoteId, ts: Timestamp): Note => {
        noteCreateCallCount++;
        noteCreateCalledWithId = id;
        noteCreateCalledWithTs = ts;
        return makeNoteFromCreate(id, ts);
      },
      emit: spy.emit,
    };

    await initializeCaptureSession(makeHydratedFeed(), ports);

    // FIND-002 AC: noteCreate must be called exactly once.
    expect(noteCreateCallCount).toBe(1);
    // FIND-002 AC: called with the allocatedId.
    expect(noteCreateCalledWithId).toBe(allocatedId);
    // FIND-002 AC: called with the Clock.now() timestamp.
    expect(noteCreateCalledWithTs).toEqual(now);
  });

  test("FIND-002 / REQ-010 AC: returned Note has empty body (body === '')", async () => {
    // REQ-010 AC: new Note.body is empty string.
    // FIND-002: noteCreate port spy constructs the Note; we assert the shape.
    const now = makeTimestamp(1714298400000);
    const allocatedId = makeNoteId("2026-04-28-120000-000");
    const spy = makeEventSpy();

    let capturedNote: Note | undefined;

    const ports: InitializeCaptureSessionPorts = {
      clockNow: () => now,
      allocateNoteId: (_ts: Timestamp) => allocatedId,
      noteCreate: (id: NoteId, ts: Timestamp): Note => {
        const note = makeNoteFromCreate(id, ts);
        capturedNote = note;
        return note;
      },
      emit: spy.emit,
    };

    await initializeCaptureSession(makeHydratedFeed(), ports);

    // REQ-010 AC: body must be empty string (cast to Body VO).
    expect(capturedNote).toBeDefined();
    if (capturedNote) {
      expect(capturedNote.body as unknown as string).toBe("");
    }
  });

  test("FIND-002 / REQ-010 AC: returned Note has createdAt === updatedAt === now", async () => {
    // REQ-010 AC: Note.frontmatter.createdAt === Note.frontmatter.updatedAt === now.
    const now = makeTimestamp(1714298400000);
    const allocatedId = makeNoteId("2026-04-28-120000-000");
    const spy = makeEventSpy();

    let capturedNote: Note | undefined;

    const ports: InitializeCaptureSessionPorts = {
      clockNow: () => now,
      allocateNoteId: (_ts: Timestamp) => allocatedId,
      noteCreate: (id: NoteId, ts: Timestamp): Note => {
        const note = makeNoteFromCreate(id, ts);
        capturedNote = note;
        return note;
      },
      emit: spy.emit,
    };

    await initializeCaptureSession(makeHydratedFeed(), ports);

    expect(capturedNote).toBeDefined();
    if (capturedNote) {
      // REQ-010 AC: createdAt and updatedAt both equal now.
      const fm = capturedNote.frontmatter as unknown as {
        createdAt: Timestamp;
        updatedAt: Timestamp;
      };
      expect(fm.createdAt).toEqual(now);
      expect(fm.updatedAt).toEqual(now);
    }
  });

  test("FIND-002: InitializeCaptureSessionPorts must include noteCreate port", () => {
    // FIND-002: The ports type must include noteCreate.
    // This test verifies the port contract at the type level.
    // If noteCreate is missing from InitializeCaptureSessionPorts, this object literal
    // will have a type error in Phase 2b implementation.
    // For the Red phase, we create a ports object and check it has the property.
    const spy = makeEventSpy();
    const ports: InitializeCaptureSessionPorts = {
      clockNow: () => makeTimestamp(1000),
      allocateNoteId: () => makeNoteId("id"),
      noteCreate: (id: NoteId, ts: Timestamp): Note => makeNoteFromCreate(id, ts),
      emit: spy.emit,
    };
    // If the type doesn't include noteCreate, TypeScript will error at the object literal above.
    // At runtime, verify the key is present.
    expect("noteCreate" in ports).toBe(true);
  });
});

// ── REQ-012: Events emitted on success ────────────────────────────────────

describe("REQ-012: NewNoteAutoCreated and EditorFocusedOnNewNote emitted", () => {
  test("NewNoteAutoCreated emitted with new NoteId", async () => {
    // REQ-012 AC: NewNoteAutoCreated emitted with the new NoteId.
    const now = makeTimestamp(1714298400000);
    const newNoteId = makeNoteId("2026-04-28-120000-000");
    const spy = makeEventSpy();

    const ports: InitializeCaptureSessionPorts = {
      clockNow: () => now,
      allocateNoteId: (_ts: Timestamp) => newNoteId,
      noteCreate: (id: NoteId, ts: Timestamp): Note => makeNoteFromCreate(id, ts),
      emit: spy.emit,
    };

    await initializeCaptureSession(makeHydratedFeed(), ports);

    const createdEvents = spy.events.filter(
      (e) => e.kind === "new-note-auto-created"
    );
    expect(createdEvents).toHaveLength(1);

    const evt = createdEvents[0] as { kind: string; noteId: NoteId };
    expect(evt.noteId).toBe(newNoteId);
  });

  test("EditorFocusedOnNewNote emitted after NewNoteAutoCreated", async () => {
    // REQ-012 AC: EditorFocusedOnNewNote emitted after NewNoteAutoCreated.
    const now = makeTimestamp(1714298400000);
    const newNoteId = makeNoteId("2026-04-28-120000-000");
    const spy = makeEventSpy();

    const ports: InitializeCaptureSessionPorts = {
      clockNow: () => now,
      allocateNoteId: (_ts: Timestamp) => newNoteId,
      noteCreate: (id: NoteId, ts: Timestamp): Note => makeNoteFromCreate(id, ts),
      emit: spy.emit,
    };

    await initializeCaptureSession(makeHydratedFeed(), ports);

    const createdIdx = spy.events.findIndex((e) => e.kind === "new-note-auto-created");
    const focusedIdx = spy.events.findIndex((e) => e.kind === "editor-focused-on-new-note");

    expect(createdIdx).toBeGreaterThanOrEqual(0);
    expect(focusedIdx).toBeGreaterThanOrEqual(0);
    // REQ-012 AC: EditorFocusedOnNewNote emitted AFTER NewNoteAutoCreated.
    expect(focusedIdx).toBeGreaterThan(createdIdx);
  });

  test("both events are Capture-internal (not in PublicDomainEvent sense)", async () => {
    // REQ-012 AC: Both are internal (Capture-scoped) events per domain-events.md.
    const now = makeTimestamp(1714298400000);
    const spy = makeEventSpy();

    const ports: InitializeCaptureSessionPorts = {
      clockNow: () => now,
      allocateNoteId: (_ts: Timestamp) => makeNoteId("id-new"),
      noteCreate: (id: NoteId, ts: Timestamp): Note => makeNoteFromCreate(id, ts),
      emit: spy.emit,
    };

    await initializeCaptureSession(makeHydratedFeed(), ports);

    const eventKinds = spy.events.map((e) => e.kind);
    expect(eventKinds).toContain("new-note-auto-created");
    expect(eventKinds).toContain("editor-focused-on-new-note");

    // These must NOT be public vault-scanned events
    expect(eventKinds).not.toContain("vault-scanned");
    expect(eventKinds).not.toContain("vault-directory-configured");
  });
});

// ── REQ-011 / PROP-003 / PROP-022: nextAvailableNoteId pure helper ────────

describe("REQ-011 / PROP-003 / PROP-022: nextAvailableNoteId pure helper", () => {
  test("PROP-003: nextAvailableNoteId result not in existingIds (required)", () => {
    // PROP-003: ∀ ts, ∀ existingIds, nextAvailableNoteId(ts, existingIds) ∉ existingIds
    const preferred = makeTimestamp(1714298400000);
    // Simulate: preferred maps to "2026-04-28-120000-000"
    const baseId = "2026-04-28-120000-000";
    const existingIds = new Set([makeNoteId(baseId)]);

    const result = nextAvailableNoteId(preferred, existingIds);

    expect(existingIds.has(result)).toBe(false);
  });

  test("PROP-003 property: ∀ ts, ∀ existingIds, result ∉ existingIds", () => {
    // Tier 1 fast-check property for uniqueness guarantee.
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 9999999 }),
        fc.array(
          fc.string({ minLength: 20, maxLength: 30 }).map((s) => makeNoteId(s)),
          { minLength: 0, maxLength: 10 }
        ),
        (epochMs, existingArray) => {
          const preferred = makeTimestamp(epochMs);
          const existingIds = new Set(existingArray);

          const result = nextAvailableNoteId(preferred, existingIds);

          return !existingIds.has(result);
        }
      )
    );
  });

  test("PROP-022: nextAvailableNoteId is deterministic — same args → same result", () => {
    // PROP-022: ∀ ts, ∀ existingIds, fn(ts, existingIds) === fn(ts, existingIds)
    const preferred = makeTimestamp(1714298400000);
    const existingIds = new Set([makeNoteId("2026-04-28-120000-000")]);

    const r1 = nextAvailableNoteId(preferred, existingIds);
    const r2 = nextAvailableNoteId(preferred, existingIds);

    expect(r1).toBe(r2);
  });

  test("PROP-022 property: same (preferred, existingIds) always produces same NoteId", () => {
    // Tier 1 fast-check property for determinism.
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 9999999 }),
        fc.array(
          fc.string({ minLength: 20, maxLength: 30 }).map((s) => makeNoteId(s)),
          { minLength: 0, maxLength: 5 }
        ),
        (epochMs, existingArray) => {
          const preferred = makeTimestamp(epochMs);
          const existingIds = new Set(existingArray);

          const r1 = nextAvailableNoteId(preferred, existingIds);
          const r2 = nextAvailableNoteId(preferred, existingIds);

          return (r1 as unknown as string) === (r2 as unknown as string);
        }
      )
    );
  });

  test("REQ-011: no collision suffix for empty existingIds", () => {
    // REQ-011 AC: Format — if no collision, base timestamp format used.
    const preferred = makeTimestamp(1714298400000);
    const result = nextAvailableNoteId(preferred, new Set());

    // Result must be the bare base format `YYYY-MM-DD-HHmmss-SSS`
    // (no `-N` collision suffix appended). Anchored regex distinguishes
    // the trailing `-SSS` millis segment from an actual collision suffix.
    const resultStr = result as unknown as string;
    expect(resultStr).toMatch(/^\d{4}-\d{2}-\d{2}-\d{6}-\d{3}$/);
  });

  test("REQ-011: suffix appended on collision — base occupied → -1 tried", () => {
    // REQ-011 AC: if base collides, append -1. If -1 collides, append -2, etc.
    const preferred = makeTimestamp(1714298400000);
    const baseId = makeNoteId("2026-04-28-120000-000"); // must match preferred's timestamp format
    const existingWithBase = new Set([baseId]);

    const result = nextAvailableNoteId(preferred, existingWithBase);

    // result must differ from base
    expect(result).not.toBe(baseId);
    // result must not be in the existing set
    expect(existingWithBase.has(result)).toBe(false);
  });

  test("REQ-011: -2 suffix when both base and -1 are occupied", () => {
    // REQ-011 AC: -2 is tried after -1 collides.
    const preferred = makeTimestamp(1714298400000);
    const baseId = "2026-04-28-120000-000";
    const existingIds = new Set([
      makeNoteId(baseId),
      makeNoteId(`${baseId}-1`),
    ]);

    const result = nextAvailableNoteId(preferred, existingIds);

    expect(existingIds.has(result)).toBe(false);
  });

  test("REQ-011: allocateNoteId is in-memory — no file I/O required", () => {
    // REQ-011 AC: Vault.allocateNoteId is an in-memory calculation.
    // nextAvailableNoteId (pure helper) has no ports — verified by its function signature.
    expect(nextAvailableNoteId.length).toBe(2);
  });
});
