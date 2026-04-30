/**
 * step3-write-markdown.test.ts — Step 3: write + event emission tests
 *
 * Tests the dispatch logic inlined in pipeline.ts (formerly dispatch-save-request.ts).
 * Uses the pipeline's captureAutoSave to exercise Step 3 behavior.
 *
 * REQ-007: writeMarkdown performs atomic file write
 * REQ-008: SaveNoteRequested emitted at state transition
 * REQ-009: NoteFileSaved emitted on successful write
 * REQ-010: NoteSaveFailed emitted on write failure
 *
 * PROP-007: Trigger → source mapping exhaustive
 * PROP-008: FsError → NoteSaveFailureReason mapping
 * PROP-009: NoteFileSaved exactly once on success
 * PROP-010: NoteSaveFailed exactly once on failure
 * PROP-011: SaveNoteRequested before NoteFileSaved (event ordering)
 */

import { describe, test, expect } from "bun:test";
import type { Result } from "promptnotes-domain-types/util/result";
import type { NoteId, Body, Frontmatter, Timestamp, Tag, VaultPath } from "promptnotes-domain-types/shared/value-objects";
import type { FsError, SaveError } from "promptnotes-domain-types/shared/errors";
import type { PublicDomainEvent } from "promptnotes-domain-types/shared/events";
import type { EditingState, SavingState, SaveFailedState } from "promptnotes-domain-types/capture/states";
import type { Note } from "promptnotes-domain-types/shared/note";

import { captureAutoSave, type CaptureAutoSavePorts } from "$lib/domain/capture-auto-save/pipeline";

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

function makeNote(overrides: Partial<{ id: NoteId; body: Body; frontmatter: Frontmatter }> = {}): Note {
  return {
    id: overrides.id ?? makeNoteId("2026-04-30-120000-000"),
    body: overrides.body ?? makeBody("Hello world"),
    frontmatter: overrides.frontmatter ?? makeFrontmatter(),
  };
}

function makeEditingState(): EditingState {
  return {
    status: "editing",
    currentNoteId: makeNoteId("2026-04-30-120000-000"),
    isDirty: true,
    lastInputAt: null,
    idleTimerHandle: null,
    lastSaveResult: null,
  } as EditingState;
}

type EmittedEvent = { kind: string; [key: string]: unknown };

function makePorts(
  writeResult: Result<void, FsError>,
  emitted: EmittedEvent[] = [],
  overrides: Partial<{ note: Note; prevFm: Frontmatter | null }> = {},
): CaptureAutoSavePorts {
  return {
    clockNow: () => makeTimestamp(3000),
    allocateNoteId: () => makeNoteId("allocated"),
    clipboardWrite: () => ({ ok: true, value: undefined } as Result<void, FsError>),
    publish: (e: PublicDomainEvent) => emitted.push(e as unknown as EmittedEvent),
    noteIsEmpty: () => false,
    writeFileAtomic: () => writeResult,
    vaultPath: "/vault" as unknown as VaultPath,
    getCurrentNote: () => overrides.note ?? makeNote(),
    getPreviousFrontmatter: () => overrides.prevFm ?? null,
    refreshSort: () => {},
    applyTagDelta: () => false,
    emitInternal: () => {},
    beginAutoSave: (state: EditingState, now: Timestamp) => ({
      status: "saving", currentNoteId: state.currentNoteId, savingStartedAt: now,
    } as SavingState),
    onSaveSucceeded: (state: SavingState, now: Timestamp) => ({
      status: "editing", currentNoteId: state.currentNoteId, isDirty: false,
      lastInputAt: null, idleTimerHandle: null, lastSaveResult: "success",
    } as EditingState),
    onSaveFailed: (state: SavingState, error: SaveError) => ({
      status: "save-failed", currentNoteId: state.currentNoteId,
      pendingNextNoteId: null, lastSaveError: error,
    } as SaveFailedState),
  } as CaptureAutoSavePorts;
}

// ── REQ-008: SaveNoteRequested emitted at state transition ──────────────

describe("REQ-008: SaveNoteRequested emitted", () => {
  test("SaveNoteRequested emitted with source mapping (idle → capture-idle)", async () => {
    const emitted: EmittedEvent[] = [];
    const ports = makePorts({ ok: true, value: undefined }, emitted);
    await captureAutoSave(ports)(makeEditingState(), "idle");

    const sr = emitted.find((e) => e.kind === "save-note-requested") as any;
    expect(sr).toBeDefined();
    expect(sr.source).toBe("capture-idle");
  });

  test("SaveNoteRequested emitted with source mapping (blur → capture-blur)", async () => {
    const emitted: EmittedEvent[] = [];
    const ports = makePorts({ ok: true, value: undefined }, emitted);
    await captureAutoSave(ports)(makeEditingState(), "blur");

    const sr = emitted.find((e) => e.kind === "save-note-requested") as any;
    expect(sr).toBeDefined();
    expect(sr.source).toBe("capture-blur");
  });

  test("SaveNoteRequested carries correct payload", async () => {
    const emitted: EmittedEvent[] = [];
    const prevFm = makeFrontmatter({ tags: [makeTag("old")] });
    const note = makeNote({ id: makeNoteId("test-note"), body: makeBody("test body") });
    const ports = makePorts({ ok: true, value: undefined }, emitted, { note, prevFm });
    const state = { ...makeEditingState(), currentNoteId: note.id } as EditingState;
    await captureAutoSave(ports)(state, "idle");

    const sr = emitted.find((e) => e.kind === "save-note-requested") as any;
    expect(sr.noteId).toEqual(note.id);
    expect(sr.previousFrontmatter).toEqual(prevFm);
  });
});

// ── REQ-009: NoteFileSaved emitted on success ───────────────────────────

describe("REQ-009: NoteFileSaved emitted on successful write", () => {
  test("PROP-009: NoteFileSaved emitted exactly once on success", async () => {
    const emitted: EmittedEvent[] = [];
    const ports = makePorts({ ok: true, value: undefined }, emitted);
    await captureAutoSave(ports)(makeEditingState(), "idle");

    const saved = emitted.filter((e) => e.kind === "note-file-saved");
    expect(saved.length).toBe(1);
  });

  test("NoteSaveFailed is NOT emitted on success", async () => {
    const emitted: EmittedEvent[] = [];
    const ports = makePorts({ ok: true, value: undefined }, emitted);
    await captureAutoSave(ports)(makeEditingState(), "idle");

    const failed = emitted.filter((e) => e.kind === "note-save-failed");
    expect(failed.length).toBe(0);
  });
});

// ── REQ-010: NoteSaveFailed emitted on write failure ────────────────────

describe("REQ-010: NoteSaveFailed emitted on write failure", () => {
  test("PROP-010: NoteSaveFailed emitted exactly once on failure", async () => {
    const emitted: EmittedEvent[] = [];
    const ports = makePorts({ ok: false, error: { kind: "permission" } }, emitted);
    await captureAutoSave(ports)(makeEditingState(), "idle");

    const failed = emitted.filter((e) => e.kind === "note-save-failed");
    expect(failed.length).toBe(1);
  });

  test("NoteFileSaved is NOT emitted on failure", async () => {
    const emitted: EmittedEvent[] = [];
    const ports = makePorts({ ok: false, error: { kind: "disk-full" } }, emitted);
    await captureAutoSave(ports)(makeEditingState(), "idle");

    const saved = emitted.filter((e) => e.kind === "note-file-saved");
    expect(saved.length).toBe(0);
  });

  // PROP-008: FsError → NoteSaveFailureReason mapping
  const fsErrorMappings: Array<[FsError, string]> = [
    [{ kind: "permission" }, "permission"],
    [{ kind: "disk-full" }, "disk-full"],
    [{ kind: "lock" }, "lock"],
    [{ kind: "not-found" }, "unknown"],
    [{ kind: "unknown", detail: "test" }, "unknown"],
  ];

  for (const [fsError, expectedReason] of fsErrorMappings) {
    test(`PROP-008: FsError ${fsError.kind} → NoteSaveFailureReason "${expectedReason}"`, async () => {
      const emitted: EmittedEvent[] = [];
      const ports = makePorts({ ok: false, error: fsError }, emitted);
      await captureAutoSave(ports)(makeEditingState(), "idle");

      const failed = emitted.find((e) => e.kind === "note-save-failed") as any;
      expect(failed.reason).toBe(expectedReason);
    });
  }
});

// ── PROP-011: Event ordering ────────────────────────────────────────────

describe("PROP-011: SaveNoteRequested before NoteFileSaved", () => {
  test("SaveNoteRequested is emitted before NoteFileSaved on success", async () => {
    const emitted: EmittedEvent[] = [];
    const ports = makePorts({ ok: true, value: undefined }, emitted);
    await captureAutoSave(ports)(makeEditingState(), "idle");

    const srIdx = emitted.findIndex((e) => e.kind === "save-note-requested");
    const nsIdx = emitted.findIndex((e) => e.kind === "note-file-saved");
    expect(srIdx).toBeGreaterThanOrEqual(0);
    expect(nsIdx).toBeGreaterThanOrEqual(0);
    expect(srIdx).toBeLessThan(nsIdx);
  });

  test("SaveNoteRequested is emitted before NoteSaveFailed on failure", async () => {
    const emitted: EmittedEvent[] = [];
    const ports = makePorts({ ok: false, error: { kind: "permission" } }, emitted);
    await captureAutoSave(ports)(makeEditingState(), "idle");

    const srIdx = emitted.findIndex((e) => e.kind === "save-note-requested");
    const nfIdx = emitted.findIndex((e) => e.kind === "note-save-failed");
    expect(srIdx).toBeGreaterThanOrEqual(0);
    expect(nfIdx).toBeGreaterThanOrEqual(0);
    expect(srIdx).toBeLessThan(nfIdx);
  });
});

// ── PROP-007: Trigger → source mapping exhaustive ───────────────────────

describe("PROP-007: Trigger-to-source mapping exhaustive", () => {
  test("idle → capture-idle", async () => {
    const emitted: EmittedEvent[] = [];
    const ports = makePorts({ ok: true, value: undefined }, emitted);
    await captureAutoSave(ports)(makeEditingState(), "idle");
    const sr = emitted.find((e) => e.kind === "save-note-requested") as any;
    expect(sr.source).toBe("capture-idle");
  });

  test("blur → capture-blur", async () => {
    const emitted: EmittedEvent[] = [];
    const ports = makePorts({ ok: true, value: undefined }, emitted);
    await captureAutoSave(ports)(makeEditingState(), "blur");
    const sr = emitted.find((e) => e.kind === "save-note-requested") as any;
    expect(sr.source).toBe("capture-blur");
  });
});
