/**
 * body-for-clipboard.test.ts — unit tests for the pure bodyForClipboard helper.
 *
 * Sprint 3 migration: Note shape is now `{ id, blocks, frontmatter }`.
 * bodyForClipboard(note) must equal serializeBlocksToMarkdown(note.blocks).
 *
 * REQ-002: Returns body derived from blocks (frontmatter excluded).
 * REQ-013: bodyForClipboard === serializeBlocksToMarkdown(note.blocks).
 * Covers PROP-001 (purity), PROP-002 (serializer equality), PROP-003 (frontmatter exclusion)
 * at unit-test granularity (the property-based versions live in __verify__/).
 */

import { describe, test, expect } from "bun:test";
import { bodyForClipboard } from "$lib/domain/copy-body/body-for-clipboard";
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";
import type {
  BlockContent,
  BlockId,
  BlockType,
  Frontmatter,
  NoteId,
  Tag,
  Timestamp,
} from "promptnotes-domain-types/shared/value-objects";
import type { Block, Note } from "promptnotes-domain-types/shared/note";

// ── Primitive helpers ─────────────────────────────────────────────────────

const ts = (ms: number): Timestamp => ({ epochMillis: ms } as unknown as Timestamp);
const id = (s: string): NoteId => s as unknown as NoteId;
const tag = (s: string): Tag => s as unknown as Tag;
const blockId = (s: string): BlockId => s as unknown as BlockId;
const blockContent = (s: string): BlockContent => s as unknown as BlockContent;

let _blockCounter = 0;
function freshBlockId(): BlockId {
  return `blk-${++_blockCounter}` as unknown as BlockId;
}

function makeBlock(type: BlockType, content: string): Block {
  return {
    id: freshBlockId(),
    type,
    content: blockContent(content),
  } as unknown as Block;
}

function makeFrontmatter(tags: Tag[] = []): Frontmatter {
  return {
    tags,
    createdAt: ts(1000),
    updatedAt: ts(2000),
  } as unknown as Frontmatter;
}

function makeNote(blocks: ReadonlyArray<Block>, frontmatter?: Frontmatter): Note {
  return {
    id: id("2026-04-30-120000-000"),
    blocks,
    frontmatter: frontmatter ?? makeFrontmatter(),
  } as unknown as Note;
}

// ── REQ-002 / REQ-013: bodyForClipboard equals serializeBlocksToMarkdown ─

describe("bodyForClipboard (REQ-002, REQ-013)", () => {
  test("single paragraph block: returns the paragraph text (no prefix)", () => {
    const note = makeNote([makeBlock("paragraph", "Some content here.")]);
    expect(bodyForClipboard(note)).toBe("Some content here.");
    expect(bodyForClipboard(note)).toBe(serializeBlocksToMarkdown(note.blocks));
  });

  test("heading-1 block: returns '# content'", () => {
    const note = makeNote([makeBlock("heading-1", "Title")]);
    expect(bodyForClipboard(note)).toBe("# Title");
    expect(bodyForClipboard(note)).toBe(serializeBlocksToMarkdown(note.blocks));
  });

  test("heading-2 block: returns '## content'", () => {
    const note = makeNote([makeBlock("heading-2", "Sub")]);
    expect(bodyForClipboard(note)).toBe("## Sub");
  });

  test("heading-3 block: returns '### content'", () => {
    const note = makeNote([makeBlock("heading-3", "Sub-sub")]);
    expect(bodyForClipboard(note)).toBe("### Sub-sub");
  });

  test("bullet block: returns '- content'", () => {
    const note = makeNote([makeBlock("bullet", "item")]);
    expect(bodyForClipboard(note)).toBe("- item");
  });

  test("numbered block: returns '1. content'", () => {
    const note = makeNote([makeBlock("numbered", "first")]);
    expect(bodyForClipboard(note)).toBe("1. first");
  });

  test("quote block: returns '> content'", () => {
    const note = makeNote([makeBlock("quote", "wise words")]);
    expect(bodyForClipboard(note)).toBe("> wise words");
  });

  test("divider block: returns '---'", () => {
    const note = makeNote([makeBlock("divider", "")]);
    expect(bodyForClipboard(note)).toBe("---");
  });

  test("code block: returns fenced code", () => {
    const note = makeNote([makeBlock("code", "const x = 1;")]);
    expect(bodyForClipboard(note)).toBe("```\nconst x = 1;\n```");
  });

  test("multi-block note: blocks joined with '\\n', no trailing newline", () => {
    const note = makeNote([
      makeBlock("paragraph", "line1"),
      makeBlock("paragraph", "line2"),
      makeBlock("paragraph", "line3"),
    ]);
    expect(bodyForClipboard(note)).toBe("line1\nline2\nline3");
    expect(bodyForClipboard(note)).toBe(serializeBlocksToMarkdown(note.blocks));
  });

  test("mixed block types: matches serializeBlocksToMarkdown exactly", () => {
    const blocks: ReadonlyArray<Block> = [
      makeBlock("heading-1", "Hello"),
      makeBlock("paragraph", "Body text"),
      makeBlock("divider", ""),
      makeBlock("bullet", "item A"),
      makeBlock("bullet", "item B"),
    ];
    const note = makeNote(blocks);
    expect(bodyForClipboard(note)).toBe(serializeBlocksToMarkdown(blocks));
  });

  test("does not include frontmatter delimiters (REQ-002)", () => {
    const note = makeNote([makeBlock("paragraph", "plain")]);
    const result = bodyForClipboard(note);
    // The result must not start with ---\n (frontmatter fence)
    expect(result).not.toMatch(/^---\n/);
  });

  test("does not include frontmatter keys (tags / createdAt / updatedAt)", () => {
    const note = makeNote(
      [makeBlock("paragraph", "hello")],
      makeFrontmatter([tag("x"), tag("y")]),
    );
    const result = bodyForClipboard(note);
    expect(result).not.toContain("tags:");
    expect(result).not.toContain("createdAt:");
    expect(result).not.toContain("updatedAt:");
  });

  test("empty paragraph block produces empty string (REQ-007)", () => {
    const note = makeNote([makeBlock("paragraph", "")]);
    expect(bodyForClipboard(note)).toBe("");
    expect(bodyForClipboard(note)).toBe(serializeBlocksToMarkdown(note.blocks));
  });

  test("unicode content is preserved", () => {
    const note = makeNote([makeBlock("paragraph", "こんにちは🌸")]);
    expect(bodyForClipboard(note)).toBe("こんにちは🌸");
  });

  test("is referentially transparent (same input → same output, PROP-001)", () => {
    const note = makeNote([makeBlock("paragraph", "stable")]);
    expect(bodyForClipboard(note)).toBe(bodyForClipboard(note));
  });
});
