/**
 * factory-build-validated-save-request.test.ts
 *
 * Tests for the `buildValidatedSaveRequest` factory function.
 *
 * REQ-018: Factory pattern convention for ValidatedSaveRequest construction.
 * The factory derives body = serializeBlocksToMarkdown(blocks) atomically.
 * Direct object-literal construction is forbidden by code review convention
 * but cannot be enforced at the type level (TypeScript structural typing).
 *
 * RED phase: tests fail because buildValidatedSaveRequest does not exist yet.
 */

import { describe, test, expect } from "bun:test";
import type { Block } from "promptnotes-domain-types/shared/note";
import type { BlockId, BlockType, BlockContent, NoteId, Frontmatter, Timestamp, Tag } from "promptnotes-domain-types/shared/value-objects";
import type { ValidatedSaveRequest } from "promptnotes-domain-types/capture/stages";

// The factory does not exist yet — this import will fail (RED phase).
import { buildValidatedSaveRequest } from "$lib/domain/capture-auto-save/build-validated-save-request";

// serializeBlocksToMarkdown — used to verify the derived body invariant.
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";

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

function makeDividerBlock(id = "block-div"): Block {
  return {
    id: makeBlockId(id),
    type: "divider" as BlockType,
    content: makeBlockContent(""),
  } as unknown as Block;
}

// ── REQ-018: buildValidatedSaveRequest existence and exports ──────────────

describe("REQ-018: buildValidatedSaveRequest factory exists and is exported", () => {
  test("buildValidatedSaveRequest is exported from the capture module", () => {
    expect(typeof buildValidatedSaveRequest).toBe("function");
  });

  test("buildValidatedSaveRequest returns an object with kind 'ValidatedSaveRequest'", () => {
    const blocks: ReadonlyArray<Block> = [makeParagraphBlock("hello")];
    const noteId = makeNoteId("test-note-00001");
    const frontmatter = makeFrontmatter();
    const requestedAt = makeTimestamp(5000);

    const request = buildValidatedSaveRequest(
      noteId,
      blocks,
      frontmatter,
      null,
      "idle",
      requestedAt,
    );

    expect(request.kind).toBe("ValidatedSaveRequest");
  });
});

// ── REQ-018: body === serializeBlocksToMarkdown(blocks) ───────────────────

describe("REQ-018: body derived atomically via serializeBlocksToMarkdown(blocks)", () => {
  test("body equals serializeBlocksToMarkdown(blocks) for a paragraph block", () => {
    const blocks: ReadonlyArray<Block> = [makeParagraphBlock("hello world")];
    const request = buildValidatedSaveRequest(
      makeNoteId("test-note-00001"),
      blocks,
      makeFrontmatter(),
      null,
      "idle",
      makeTimestamp(5000),
    );

    const expected = serializeBlocksToMarkdown(blocks);
    expect(request.body as unknown as string).toBe(expected);
  });

  test("body equals serializeBlocksToMarkdown(blocks) for multiple blocks", () => {
    const blocks: ReadonlyArray<Block> = [
      makeParagraphBlock("first", "block-001"),
      makeParagraphBlock("second", "block-002"),
      makeDividerBlock("block-003"),
      makeParagraphBlock("third", "block-004"),
    ];
    const request = buildValidatedSaveRequest(
      makeNoteId("test-note-00001"),
      blocks,
      makeFrontmatter(),
      null,
      "blur",
      makeTimestamp(9999),
    );

    const expected = serializeBlocksToMarkdown(blocks);
    expect(request.body as unknown as string).toBe(expected);
  });

  test("body equals serializeBlocksToMarkdown(blocks) for empty paragraph (blur save)", () => {
    const blocks: ReadonlyArray<Block> = [makeParagraphBlock("")];
    const request = buildValidatedSaveRequest(
      makeNoteId("test-note-00001"),
      blocks,
      makeFrontmatter(),
      null,
      "blur",
      makeTimestamp(1234),
    );

    const expected = serializeBlocksToMarkdown(blocks);
    expect(request.body as unknown as string).toBe(expected);
  });

  test("body equals serializeBlocksToMarkdown(blocks) for divider-only note (blur save)", () => {
    const blocks: ReadonlyArray<Block> = [makeDividerBlock()];
    const request = buildValidatedSaveRequest(
      makeNoteId("test-note-00001"),
      blocks,
      makeFrontmatter(),
      null,
      "blur",
      makeTimestamp(1234),
    );

    const expected = serializeBlocksToMarkdown(blocks);
    expect(request.body as unknown as string).toBe(expected);
  });
});

// ── REQ-002: All ValidatedSaveRequest fields are set correctly ─────────────

describe("REQ-002: buildValidatedSaveRequest sets all ValidatedSaveRequest fields", () => {
  test("blocks is the same reference passed in (REQ-002 acceptance)", () => {
    const blocks: ReadonlyArray<Block> = [makeParagraphBlock("abc")];
    const request = buildValidatedSaveRequest(
      makeNoteId("test-note-00001"),
      blocks,
      makeFrontmatter(),
      null,
      "idle",
      makeTimestamp(5000),
    );

    expect(request.blocks).toBe(blocks);
  });

  test("requestedAt matches the provided timestamp", () => {
    const requestedAt = makeTimestamp(7777);
    const request = buildValidatedSaveRequest(
      makeNoteId("test-note-00001"),
      [makeParagraphBlock("abc")],
      makeFrontmatter(),
      null,
      "idle",
      requestedAt,
    );

    expect(request.requestedAt).toEqual(requestedAt);
  });

  test("trigger is preserved", () => {
    for (const trigger of ["idle", "blur"] as const) {
      const request = buildValidatedSaveRequest(
        makeNoteId("test-note-00001"),
        [makeParagraphBlock("abc")],
        makeFrontmatter(),
        null,
        trigger,
        makeTimestamp(5000),
      );
      expect(request.trigger).toBe(trigger);
    }
  });

  test("previousFrontmatter is carried through (null case)", () => {
    const request = buildValidatedSaveRequest(
      makeNoteId("test-note-00001"),
      [makeParagraphBlock("abc")],
      makeFrontmatter(),
      null,
      "idle",
      makeTimestamp(5000),
    );

    expect(request.previousFrontmatter).toBeNull();
  });

  test("previousFrontmatter is carried through (non-null case)", () => {
    const prevFm = makeFrontmatter({ tags: [makeTag("old-tag")] });
    const request = buildValidatedSaveRequest(
      makeNoteId("test-note-00001"),
      [makeParagraphBlock("abc")],
      makeFrontmatter(),
      prevFm,
      "idle",
      makeTimestamp(5000),
    );

    expect(request.previousFrontmatter).toEqual(prevFm);
  });

  test("noteId is preserved", () => {
    const noteId = makeNoteId("my-test-note-123");
    const request = buildValidatedSaveRequest(
      noteId,
      [makeParagraphBlock("abc")],
      makeFrontmatter(),
      null,
      "idle",
      makeTimestamp(5000),
    );

    expect(request.noteId).toEqual(noteId);
  });

  test("frontmatter is preserved", () => {
    const fm = makeFrontmatter({ tags: [makeTag("my-tag")] });
    const request = buildValidatedSaveRequest(
      makeNoteId("test-note-00001"),
      [makeParagraphBlock("abc")],
      fm,
      null,
      "idle",
      makeTimestamp(5000),
    );

    expect(request.frontmatter).toEqual(fm);
  });
});

// ── REQ-018: Factory convention documentation ─────────────────────────────

describe("REQ-018: Direct object-literal construction convention", () => {
  /**
   * Per REQ-018 / FIND-013 resolution:
   * Direct object-literal construction (e.g., { kind: "ValidatedSaveRequest", blocks, body: "wrong" })
   * is documented as forbidden by lint/code-review convention.
   * It is NOT strictly typed against (TypeScript structural typing cannot prevent it).
   *
   * This test documents that the factory is the ONLY approved construction site
   * and that bypassing it is a code-review violation — not a type error.
   */
  test("factory convention: buildValidatedSaveRequest is the only approved construction site (REQ-018/FIND-013)", () => {
    // TypeScript allows direct literal construction — this is a known limitation.
    // The constraint is enforced by code review, not the type system.
    // This test documents the convention and confirms the factory's role.
    const blocks: ReadonlyArray<Block> = [makeParagraphBlock("content")];
    const factoryResult = buildValidatedSaveRequest(
      makeNoteId("test-note-00001"),
      blocks,
      makeFrontmatter(),
      null,
      "idle",
      makeTimestamp(5000),
    );

    // The factory atomically sets body = serializeBlocksToMarkdown(blocks)
    // A direct literal construction could bypass this — that's the lint violation.
    expect(factoryResult.body as unknown as string).toBe(
      serializeBlocksToMarkdown(blocks),
    );

    // Document: direct literal is NOT a type error but IS a convention violation.
    // The factory MUST be used to guarantee REQ-018 coherence.
    const conventionNote = "All ValidatedSaveRequest construction MUST use buildValidatedSaveRequest";
    expect(typeof conventionNote).toBe("string");
  });
});
