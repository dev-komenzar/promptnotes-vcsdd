/**
 * step3-write-markdown.test.ts — Step 3: writeMarkdown tests
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
import type { NoteId, Body, Frontmatter, Timestamp, Tag } from "promptnotes-domain-types/shared/value-objects";
import type { FsError, SaveError } from "promptnotes-domain-types/shared/errors";
import type {
  NoteFileSaved,
  NoteSaveFailed,
  SaveNoteRequested,
  PublicDomainEvent,
} from "promptnotes-domain-types/shared/events";
import type { ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";

// Red phase: these imports will fail
import {
  dispatchSaveRequest,
  type DispatchSaveRequestDeps,
} from "$lib/domain/capture-auto-save/dispatch-save-request";

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

function makeValidatedSaveRequest(overrides: Partial<{
  noteId: NoteId;
  body: Body;
  frontmatter: Frontmatter;
  previousFrontmatter: Frontmatter | null;
  trigger: "idle" | "blur";
}> = {}): ValidatedSaveRequest {
  return {
    kind: "ValidatedSaveRequest",
    noteId: overrides.noteId ?? makeNoteId("2026-04-30-120000-000"),
    body: overrides.body ?? makeBody("Hello world"),
    frontmatter: overrides.frontmatter ?? makeFrontmatter(),
    previousFrontmatter: overrides.previousFrontmatter ?? null,
    trigger: overrides.trigger ?? "idle",
    requestedAt: makeTimestamp(2000),
  } as ValidatedSaveRequest;
}

type EmittedEvent = { kind: string; [key: string]: unknown };

function makeSuccessfulWriteDeps(
  emitted: EmittedEvent[] = []
): DispatchSaveRequestDeps {
  return {
    writeFileAtomic: (_path: string, _content: string) => ({ ok: true, value: undefined } as Result<void, FsError>),
    clockNow: () => makeTimestamp(3000),
    publish: (e: PublicDomainEvent) => emitted.push(e as unknown as EmittedEvent),
    serializeNote: (req: ValidatedSaveRequest) => `---\nyaml\n---\n${req.body}`,
    vaultPath: "/vault" as any,
  };
}

function makeFailingWriteDeps(
  fsError: FsError,
  emitted: EmittedEvent[] = []
): DispatchSaveRequestDeps {
  return {
    writeFileAtomic: (_path: string, _content: string) => ({ ok: false, error: fsError } as Result<void, FsError>),
    clockNow: () => makeTimestamp(3000),
    publish: (e: PublicDomainEvent) => emitted.push(e as unknown as EmittedEvent),
    serializeNote: (req: ValidatedSaveRequest) => `---\nyaml\n---\n${req.body}`,
    vaultPath: "/vault" as any,
  };
}

// ── REQ-007: writeMarkdown performs atomic file write ────────────────────

describe("REQ-007: writeMarkdown atomic file write", () => {
  test("success → returns Ok with NoteFileSaved", async () => {
    const deps = makeSuccessfulWriteDeps();
    const request = makeValidatedSaveRequest();

    const result = await dispatchSaveRequest(deps)(request);

    expect(result.ok).toBe(true);
  });

  test("failure → returns Err with SaveError { kind: 'fs' }", async () => {
    const deps = makeFailingWriteDeps({ kind: "permission", path: "/vault/test.md" });
    const request = makeValidatedSaveRequest();

    const result = await dispatchSaveRequest(deps)(request);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("fs");
  });
});

// ── REQ-008: SaveNoteRequested emitted at state transition ──────────────

describe("REQ-008: SaveNoteRequested emitted", () => {
  test("SaveNoteRequested emitted with correct source mapping (idle → capture-idle)", async () => {
    const emitted: EmittedEvent[] = [];
    const deps = makeSuccessfulWriteDeps(emitted);
    const request = makeValidatedSaveRequest({ trigger: "idle" });

    await dispatchSaveRequest(deps)(request);

    const saveRequested = emitted.find((e) => e.kind === "save-note-requested") as any;
    expect(saveRequested).toBeDefined();
    expect(saveRequested.source).toBe("capture-idle");
  });

  test("SaveNoteRequested emitted with source mapping (blur → capture-blur)", async () => {
    const emitted: EmittedEvent[] = [];
    const deps = makeSuccessfulWriteDeps(emitted);
    const request = makeValidatedSaveRequest({ trigger: "blur" });

    await dispatchSaveRequest(deps)(request);

    const saveRequested = emitted.find((e) => e.kind === "save-note-requested") as any;
    expect(saveRequested).toBeDefined();
    expect(saveRequested.source).toBe("capture-blur");
  });

  test("SaveNoteRequested carries correct noteId, body, frontmatter, previousFrontmatter", async () => {
    const emitted: EmittedEvent[] = [];
    const deps = makeSuccessfulWriteDeps(emitted);
    const prevFm = makeFrontmatter({ tags: [makeTag("old")] });
    const request = makeValidatedSaveRequest({
      noteId: makeNoteId("test-note"),
      body: makeBody("test body"),
      previousFrontmatter: prevFm,
    });

    await dispatchSaveRequest(deps)(request);

    const saveRequested = emitted.find((e) => e.kind === "save-note-requested") as any;
    expect(saveRequested.noteId).toEqual(request.noteId);
    expect(saveRequested.body).toEqual(request.body);
    expect(saveRequested.frontmatter).toEqual(request.frontmatter);
    expect(saveRequested.previousFrontmatter).toEqual(prevFm);
  });
});

// ── REQ-009: NoteFileSaved emitted on success ───────────────────────────

describe("REQ-009: NoteFileSaved emitted on successful write", () => {
  // PROP-009
  test("PROP-009: NoteFileSaved emitted exactly once on success", async () => {
    const emitted: EmittedEvent[] = [];
    const deps = makeSuccessfulWriteDeps(emitted);
    const request = makeValidatedSaveRequest();

    await dispatchSaveRequest(deps)(request);

    const saved = emitted.filter((e) => e.kind === "note-file-saved");
    expect(saved.length).toBe(1);
  });

  test("NoteFileSaved carries correct payload", async () => {
    const emitted: EmittedEvent[] = [];
    const deps = makeSuccessfulWriteDeps(emitted);
    const request = makeValidatedSaveRequest({
      noteId: makeNoteId("test-note"),
      body: makeBody("body"),
    });

    await dispatchSaveRequest(deps)(request);

    const saved = emitted.find((e) => e.kind === "note-file-saved") as any;
    expect(saved.noteId).toEqual(request.noteId);
    expect(saved.body).toEqual(request.body);
    expect(saved.frontmatter).toEqual(request.frontmatter);
  });

  test("NoteSaveFailed is NOT emitted on success", async () => {
    const emitted: EmittedEvent[] = [];
    const deps = makeSuccessfulWriteDeps(emitted);
    const request = makeValidatedSaveRequest();

    await dispatchSaveRequest(deps)(request);

    const failed = emitted.filter((e) => e.kind === "note-save-failed");
    expect(failed.length).toBe(0);
  });
});

// ── REQ-010: NoteSaveFailed emitted on write failure ────────────────────

describe("REQ-010: NoteSaveFailed emitted on write failure", () => {
  // PROP-010
  test("PROP-010: NoteSaveFailed emitted exactly once on failure", async () => {
    const emitted: EmittedEvent[] = [];
    const deps = makeFailingWriteDeps({ kind: "permission" }, emitted);
    const request = makeValidatedSaveRequest();

    await dispatchSaveRequest(deps)(request);

    const failed = emitted.filter((e) => e.kind === "note-save-failed");
    expect(failed.length).toBe(1);
  });

  test("NoteFileSaved is NOT emitted on failure", async () => {
    const emitted: EmittedEvent[] = [];
    const deps = makeFailingWriteDeps({ kind: "disk-full" }, emitted);
    const request = makeValidatedSaveRequest();

    await dispatchSaveRequest(deps)(request);

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
      const deps = makeFailingWriteDeps(fsError, emitted);
      const request = makeValidatedSaveRequest();

      await dispatchSaveRequest(deps)(request);

      const failed = emitted.find((e) => e.kind === "note-save-failed") as any;
      expect(failed.reason).toBe(expectedReason);
    });
  }
});

// ── PROP-011: Event ordering ────────────────────────────────────────────

describe("PROP-011: SaveNoteRequested before NoteFileSaved", () => {
  test("SaveNoteRequested is emitted before NoteFileSaved on success", async () => {
    const emitted: EmittedEvent[] = [];
    const deps = makeSuccessfulWriteDeps(emitted);
    const request = makeValidatedSaveRequest();

    await dispatchSaveRequest(deps)(request);

    const saveRequestedIdx = emitted.findIndex((e) => e.kind === "save-note-requested");
    const noteSavedIdx = emitted.findIndex((e) => e.kind === "note-file-saved");
    expect(saveRequestedIdx).toBeGreaterThanOrEqual(0);
    expect(noteSavedIdx).toBeGreaterThanOrEqual(0);
    expect(saveRequestedIdx).toBeLessThan(noteSavedIdx);
  });

  test("SaveNoteRequested is emitted before NoteSaveFailed on failure", async () => {
    const emitted: EmittedEvent[] = [];
    const deps = makeFailingWriteDeps({ kind: "permission" }, emitted);
    const request = makeValidatedSaveRequest();

    await dispatchSaveRequest(deps)(request);

    const saveRequestedIdx = emitted.findIndex((e) => e.kind === "save-note-requested");
    const noteFailedIdx = emitted.findIndex((e) => e.kind === "note-save-failed");
    expect(saveRequestedIdx).toBeGreaterThanOrEqual(0);
    expect(noteFailedIdx).toBeGreaterThanOrEqual(0);
    expect(saveRequestedIdx).toBeLessThan(noteFailedIdx);
  });
});

// ── PROP-007: Trigger → source mapping exhaustive ───────────────────────

describe("PROP-007: Trigger-to-source mapping exhaustive", () => {
  test("idle → capture-idle", async () => {
    const emitted: EmittedEvent[] = [];
    const deps = makeSuccessfulWriteDeps(emitted);
    await dispatchSaveRequest(deps)(makeValidatedSaveRequest({ trigger: "idle" }));
    const sr = emitted.find((e) => e.kind === "save-note-requested") as any;
    expect(sr.source).toBe("capture-idle");
  });

  test("blur → capture-blur", async () => {
    const emitted: EmittedEvent[] = [];
    const deps = makeSuccessfulWriteDeps(emitted);
    await dispatchSaveRequest(deps)(makeValidatedSaveRequest({ trigger: "blur" }));
    const sr = emitted.find((e) => e.kind === "save-note-requested") as any;
    expect(sr.source).toBe("capture-blur");
  });
});
