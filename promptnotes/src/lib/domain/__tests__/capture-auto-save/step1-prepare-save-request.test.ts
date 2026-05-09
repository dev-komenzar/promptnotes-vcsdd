/**
 * step1-prepare-save-request.test.ts — Step 1: prepareSaveRequest tests
 *
 * REQ-002: Validates and produces ValidatedSaveRequest (including blocks + derived body)
 * REQ-003: Empty body on idle → EmptyNoteDiscarded (success channel)
 * REQ-004: Empty body on blur → proceeds to save
 * REQ-005: InvariantViolated error
 *
 * PROP-003: Empty idle → EmptyNoteDiscarded, NOT SaveError
 * PROP-004: Empty blur → ValidatedSaveRequest (does NOT discard)
 * PROP-021: updatedAt === requestedAt (timestamp propagation)
 * PROP-022: InvariantViolated runtime path
 * PROP-023: EmptyNoteDiscarded path does NOT transition state to saving
 *
 * Sprint 2 additions (block-based migration):
 * - REQ-002: request.blocks === input.note.blocks (same reference)
 * - REQ-002: request.body === serializeBlocksToMarkdown(request.blocks)
 */

import { describe, test, expect } from "bun:test";
import type { Result } from "promptnotes-domain-types/util/result";
import type { NoteId, Timestamp, Body, Frontmatter, Tag, BlockId, BlockType, BlockContent } from "promptnotes-domain-types/shared/value-objects";
import type { SaveError } from "promptnotes-domain-types/shared/errors";
import type { EmptyNoteDiscarded } from "promptnotes-domain-types/shared/events";
import type { Block, Note } from "promptnotes-domain-types/shared/note";
import type { DirtyEditingSession, ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";

// The implementation does NOT exist yet. This import will fail (Red phase).
import {
  prepareSaveRequest,
  type PrepareSaveRequestDeps,
} from "$lib/domain/capture-auto-save/prepare-save-request";

// serializeBlocksToMarkdown — for asserting derived body invariant (REQ-002/REQ-018)
// RED: fails if this module does not exist yet
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";

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

function makeBlockId(raw: string): BlockId {
  return raw as unknown as BlockId;
}

function makeBlockContent(raw: string): BlockContent {
  return raw as unknown as BlockContent;
}

function makeParagraphBlock(content: string, id = "block-001"): Block {
  return {
    id: makeBlockId(id),
    type: "paragraph" as BlockType,
    content: makeBlockContent(content),
  } as unknown as Block;
}

function makeFrontmatter(overrides: Partial<{
  tags: Tag[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}> = {}): Frontmatter {
  return {
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? makeTimestamp(1000),
    updatedAt: overrides.updatedAt ?? makeTimestamp(1000),
  } as unknown as Frontmatter;
}

/** Sprint 2: makeNote now accepts blocks (required by REQ-002 block-based migration). */
function makeNote(overrides: Partial<{
  id: NoteId;
  blocks: ReadonlyArray<Block>;
  body: Body;
  frontmatter: Frontmatter;
}> = {}): Note {
  const blocks = overrides.blocks ?? [makeParagraphBlock("some content")];
  return {
    id: overrides.id ?? makeNoteId("2026-04-30-120000-000"),
    blocks,
    body: overrides.body ?? makeBody("some content"),
    frontmatter: overrides.frontmatter ?? makeFrontmatter(),
  } as unknown as Note;
}

function makeDirtyEditingSession(overrides: Partial<DirtyEditingSession> = {}): DirtyEditingSession {
  const note = (overrides as any).note ?? makeNote();
  return {
    kind: "DirtyEditingSession",
    noteId: (overrides as any).noteId ?? note.id,
    note,
    previousFrontmatter: (overrides as any).previousFrontmatter ?? null,
    trigger: (overrides as any).trigger ?? "idle",
  } as DirtyEditingSession;
}

function makeDeps(overrides: Partial<PrepareSaveRequestDeps> = {}): PrepareSaveRequestDeps {
  return {
    clockNow: overrides.clockNow ?? (() => makeTimestamp(2000)),
    noteIsEmpty: overrides.noteIsEmpty ?? (() => false),
    publish: overrides.publish ?? (() => {}),
  };
}

// ── REQ-002: Happy path — produces ValidatedSaveRequest ─────────────────

describe("REQ-002: prepareSaveRequest produces ValidatedSaveRequest", () => {
  test("idle trigger with non-empty body → ValidatedSaveRequest", () => {
    const now = makeTimestamp(5000);
    const deps = makeDeps({ clockNow: () => now });
    const session = makeDirtyEditingSession({ trigger: "idle" } as any);

    const result = prepareSaveRequest(deps)(session);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe("validated");
  });

  test("ValidatedSaveRequest.requestedAt equals Clock.now()", () => {
    const now = makeTimestamp(5000);
    const deps = makeDeps({ clockNow: () => now });
    const session = makeDirtyEditingSession({ trigger: "blur" } as any);

    const result = prepareSaveRequest(deps)(session);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.value.kind !== "validated") return;
    expect(result.value.request.requestedAt).toEqual(now);
  });

  // PROP-021: updatedAt === requestedAt
  test("PROP-021: ValidatedSaveRequest.frontmatter.updatedAt === requestedAt", () => {
    const now = makeTimestamp(9999);
    const deps = makeDeps({ clockNow: () => now });
    const session = makeDirtyEditingSession({ trigger: "idle" } as any);

    const result = prepareSaveRequest(deps)(session);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.value.kind !== "validated") return;
    expect(result.value.request.frontmatter.updatedAt).toEqual(now);
  });

  test("ValidatedSaveRequest.trigger preserves original", () => {
    const deps = makeDeps();
    const session = makeDirtyEditingSession({ trigger: "blur" } as any);

    const result = prepareSaveRequest(deps)(session);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.value.kind !== "validated") return;
    expect(result.value.request.trigger).toBe("blur");
  });

  test("ValidatedSaveRequest.previousFrontmatter is carried through", () => {
    const prevFm = makeFrontmatter({ tags: [makeTag("old")] });
    const deps = makeDeps();
    const session = makeDirtyEditingSession({
      previousFrontmatter: prevFm,
      trigger: "idle",
    } as any);

    const result = prepareSaveRequest(deps)(session);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.value.kind !== "validated") return;
    expect(result.value.request.previousFrontmatter).toEqual(prevFm);
  });
});

// ── REQ-003: Empty body on idle → EmptyNoteDiscarded ────────────────────

describe("REQ-003: Empty body on idle save triggers EmptyNoteDiscarded", () => {
  // PROP-003
  test("PROP-003: empty body + idle → EmptyNoteDiscarded (success channel, not error)", () => {
    const deps = makeDeps({ noteIsEmpty: () => true });
    const session = makeDirtyEditingSession({ trigger: "idle" } as any);

    const result = prepareSaveRequest(deps)(session);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe("empty-discarded");
  });

  test("EmptyNoteDiscarded event is emitted with correct noteId", () => {
    const emitted: any[] = [];
    const deps = makeDeps({
      noteIsEmpty: () => true,
      publish: (e) => emitted.push(e),
    });
    const noteId = makeNoteId("2026-04-30-120000-000");
    const session = makeDirtyEditingSession({
      noteId,
      trigger: "idle",
    } as any);

    prepareSaveRequest(deps)(session);

    expect(emitted.length).toBe(1);
    expect(emitted[0].kind).toBe("empty-note-discarded");
    expect(emitted[0].noteId).toEqual(noteId);
  });

  test("No SaveNoteRequested emitted on empty-idle path", () => {
    const emitted: any[] = [];
    const deps = makeDeps({
      noteIsEmpty: () => true,
      publish: (e) => emitted.push(e),
    });
    const session = makeDirtyEditingSession({ trigger: "idle" } as any);

    prepareSaveRequest(deps)(session);

    const saveRequested = emitted.filter((e) => e.kind === "save-note-requested");
    expect(saveRequested.length).toBe(0);
  });
});

// ── REQ-004: Empty body on blur → proceeds to save ──────────────────────

describe("REQ-004: Empty body on blur save proceeds", () => {
  // PROP-004
  test("PROP-004: empty body + blur → ValidatedSaveRequest (does NOT discard)", () => {
    const deps = makeDeps({ noteIsEmpty: () => true });
    const session = makeDirtyEditingSession({ trigger: "blur" } as any);

    const result = prepareSaveRequest(deps)(session);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.kind).toBe("validated");
  });

  test("EmptyNoteDiscarded is NOT emitted on blur", () => {
    const emitted: any[] = [];
    const deps = makeDeps({
      noteIsEmpty: () => true,
      publish: (e) => emitted.push(e),
    });
    const session = makeDirtyEditingSession({ trigger: "blur" } as any);

    prepareSaveRequest(deps)(session);

    const discarded = emitted.filter((e) => e.kind === "empty-note-discarded");
    expect(discarded.length).toBe(0);
  });
});

// ── REQ-005: InvariantViolated error ────────────────────────────────────

describe("REQ-005: InvariantViolated error", () => {
  // PROP-022: runtime verification of InvariantViolated path
  test("PROP-022: clock returning timestamp before createdAt → invariant-violated", () => {
    // Clock returns a time BEFORE createdAt — this would make updatedAt < createdAt
    const pastTimestamp = makeTimestamp(500);
    const createdAt = makeTimestamp(1000);
    const deps = makeDeps({ clockNow: () => pastTimestamp });
    const note = makeNote({ frontmatter: makeFrontmatter({ createdAt }) });
    const session = makeDirtyEditingSession({ note, trigger: "idle" } as any);

    const result = prepareSaveRequest(deps)(session);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("validation");
    if (result.error.kind !== "validation") return;
    expect(result.error.reason.kind).toBe("invariant-violated");
  });

  test("InvariantViolated → no domain events emitted", () => {
    const emitted: any[] = [];
    const pastTimestamp = makeTimestamp(500);
    const createdAt = makeTimestamp(1000);
    const deps = makeDeps({
      clockNow: () => pastTimestamp,
      publish: (e) => emitted.push(e),
    });
    const note = makeNote({ frontmatter: makeFrontmatter({ createdAt }) });
    const session = makeDirtyEditingSession({ note, trigger: "idle" } as any);

    prepareSaveRequest(deps)(session);

    expect(emitted.length).toBe(0);
  });
});

// ── PROP-023: EmptyNoteDiscarded path does NOT transition to saving ──────

describe("PROP-023: EmptyNoteDiscarded state non-transition", () => {
  test("Empty-idle path: state does not transition to saving", () => {
    // This test verifies that prepareSaveRequest does NOT call beginAutoSave
    // or otherwise modify the editing session state to 'saving'.
    // The exact assertion depends on whether prepareSaveRequest manages state,
    // but at minimum, the result should not indicate a saving transition.
    const deps = makeDeps({ noteIsEmpty: () => true });
    const session = makeDirtyEditingSession({ trigger: "idle" } as any);

    const result = prepareSaveRequest(deps)(session);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The result is empty-discarded, not validated — no state transition to saving
    expect(result.value.kind).toBe("empty-discarded");
    // No saving state should be produced
    expect(result.value.kind).not.toBe("validated");
  });
});

// ── Sprint 2 (REQ-002 block-based migration): blocks + body coherence ─────
//
// These tests are NEW in sprint 2 and will FAIL (RED) because the current
// implementation does not set request.blocks (it uses `as unknown` laundering).

describe("REQ-002 Sprint 2: ValidatedSaveRequest carries blocks and derived body (block-based migration)", () => {
  test("request.blocks === input.note.blocks (same reference, REQ-002 acceptance)", () => {
    const blocks: ReadonlyArray<Block> = [makeParagraphBlock("hello", "block-001")];
    const note = makeNote({ blocks });
    const now = makeTimestamp(5000);
    const deps = makeDeps({ clockNow: () => now });
    const session = makeDirtyEditingSession({ note, trigger: "idle" } as any);

    const result = prepareSaveRequest(deps)(session);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.value.kind !== "validated") return;

    // REQ-002: ValidatedSaveRequest.blocks must be the same reference as note.blocks
    expect(result.value.request.blocks).toBe(blocks);
  });

  test("request.body === serializeBlocksToMarkdown(request.blocks) — derived-body invariant (REQ-002/REQ-018)", () => {
    const blocks: ReadonlyArray<Block> = [
      makeParagraphBlock("first block", "block-001"),
      makeParagraphBlock("second block", "block-002"),
    ];
    const note = makeNote({ blocks });
    const now = makeTimestamp(5000);
    const deps = makeDeps({ clockNow: () => now });
    const session = makeDirtyEditingSession({ note, trigger: "idle" } as any);

    const result = prepareSaveRequest(deps)(session);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.value.kind !== "validated") return;

    const request = result.value.request;
    const expectedBody = serializeBlocksToMarkdown(request.blocks);
    // REQ-018: body === serializeBlocksToMarkdown(blocks) at every carrier site
    expect(request.body as unknown as string).toBe(expectedBody);
  });

  test("request.blocks matches note.blocks for blur trigger", () => {
    const blocks: ReadonlyArray<Block> = [makeParagraphBlock("blur content", "block-001")];
    const note = makeNote({ blocks });
    const deps = makeDeps();
    const session = makeDirtyEditingSession({ note, trigger: "blur" } as any);

    const result = prepareSaveRequest(deps)(session);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.value.kind !== "validated") return;

    expect(result.value.request.blocks).toBe(blocks);
  });

  test("request.body === serializeBlocksToMarkdown(blocks) for blur trigger (derived-body invariant)", () => {
    const blocks: ReadonlyArray<Block> = [makeParagraphBlock("blur body content")];
    const note = makeNote({ blocks });
    const deps = makeDeps();
    const session = makeDirtyEditingSession({ note, trigger: "blur" } as any);

    const result = prepareSaveRequest(deps)(session);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.value.kind !== "validated") return;

    const request = result.value.request;
    expect(request.body as unknown as string).toBe(serializeBlocksToMarkdown(request.blocks));
  });

  test("empty blocks (blur save) — request.blocks still same reference, body is empty/whitespace", () => {
    // Empty paragraph, blur trigger — must proceed (REQ-004)
    const blocks: ReadonlyArray<Block> = [makeParagraphBlock("")];
    const note = makeNote({ blocks });
    const deps = makeDeps({ noteIsEmpty: () => true });
    const session = makeDirtyEditingSession({ note, trigger: "blur" } as any);

    const result = prepareSaveRequest(deps)(session);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    if (result.value.kind !== "validated") return;

    const request = result.value.request;
    expect(request.blocks).toBe(blocks);
    expect(request.body as unknown as string).toBe(serializeBlocksToMarkdown(request.blocks));
  });
});
