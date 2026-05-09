/**
 * PROP-025: Note.isEmpty — Revision 4 broader rule.
 *
 * Returns `true` iff ALL blocks are either:
 *   (a) a paragraph with empty/whitespace-only content (isEmptyOrWhitespaceContent), OR
 *   (b) a divider (empty by Block type invariant)
 *
 * Returns `false` for any block of type heading-1, heading-2, heading-3, bullet,
 * numbered, code, or quote — regardless of content (structural-distinctiveness rule).
 *
 * Tier 1 — fast-check + example-based.
 * Required: false (REQ-003)
 *
 * Source: aggregates.md L120/L142, FIND-012/FIND-014 resolution.
 *
 * All 8 variants from the Empty-Note variants table are exercised.
 *
 * RED phase: tests fail because the implementation of isEmpty still uses the
 * old narrow definition (single empty paragraph only) and does not cover the
 * broader variants from REQ-003.
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type { Block } from "promptnotes-domain-types/shared/note";
import type { BlockId, BlockType, BlockContent, NoteId, Frontmatter, Timestamp, Tag } from "promptnotes-domain-types/shared/value-objects";
import type { Note } from "promptnotes-domain-types/shared/note";

// ── Imports under test ─────────────────────────────────────────────────────
// noteIsEmpty is the concrete implementation of NoteOps.isEmpty.
// RED: This import will fail if noteIsEmpty does not exist or does not use the
// broader block-based rule.
import { noteIsEmpty, isEmptyOrWhitespaceContent } from "$lib/domain/capture-auto-save/note-is-empty";

// ── Helper factories ───────────────────────────────────────────────────────

function makeBlockId(raw: string): BlockId {
  return raw as unknown as BlockId;
}

function makeBlockContent(raw: string): BlockContent {
  return raw as unknown as BlockContent;
}

function makeNoteId(raw: string): NoteId {
  return raw as unknown as NoteId;
}

function makeTimestamp(ms: number): Timestamp {
  return { epochMillis: ms } as unknown as Timestamp;
}

function makeTag(raw: string): Tag {
  return raw as unknown as Tag;
}

function makeFrontmatter(): Frontmatter {
  return {
    tags: [],
    createdAt: makeTimestamp(1000),
    updatedAt: makeTimestamp(1000),
  } as unknown as Frontmatter;
}

function makeBlock(type: BlockType, content: string, id = "block-001"): Block {
  return {
    id: makeBlockId(id),
    type,
    content: makeBlockContent(content),
  } as unknown as Block;
}

function makeDivider(id = "block-div"): Block {
  return {
    id: makeBlockId(id),
    type: "divider" as BlockType,
    content: makeBlockContent(""),
  } as unknown as Block;
}

function makeNote(blocks: ReadonlyArray<Block>): Note {
  return {
    id: makeNoteId("test-note-00001"),
    blocks,
    frontmatter: makeFrontmatter(),
  } as unknown as Note;
}

// ── PROP-025: All 8 variants from REQ-003 Empty-Note variants table ────────

describe("PROP-025: Note.isEmpty — Revision 4 broader block rule (all 8 variants)", () => {

  // Variant 1: single empty paragraph → true
  test("variant 1: [paragraph('')] → isEmpty === true", () => {
    const note = makeNote([makeBlock("paragraph", "")]);
    expect(noteIsEmpty(note)).toBe(true);
  });

  // Variant 2: multiple empty paragraphs → true
  test("variant 2: [paragraph(''), paragraph('')] → isEmpty === true", () => {
    const note = makeNote([
      makeBlock("paragraph", "", "block-001"),
      makeBlock("paragraph", "", "block-002"),
    ]);
    expect(noteIsEmpty(note)).toBe(true);
  });

  // Variant 3: whitespace-only paragraph → true
  test("variant 3: [paragraph(' \\t')] → isEmpty === true", () => {
    const note = makeNote([makeBlock("paragraph", " \t")]);
    expect(noteIsEmpty(note)).toBe(true);
  });

  // Variant 3b: various whitespace characters → true
  test("variant 3b: [paragraph('   ')] (multiple spaces) → isEmpty === true", () => {
    const note = makeNote([makeBlock("paragraph", "   ")]);
    expect(noteIsEmpty(note)).toBe(true);
  });

  // Variant 4: divider-only → true
  test("variant 4: [divider] → isEmpty === true", () => {
    const note = makeNote([makeDivider()]);
    expect(noteIsEmpty(note)).toBe(true);
  });

  // Variant 5: divider and empty paragraph → true
  test("variant 5: [divider, paragraph('')] → isEmpty === true", () => {
    const note = makeNote([
      makeDivider("block-div"),
      makeBlock("paragraph", "", "block-001"),
    ]);
    expect(noteIsEmpty(note)).toBe(true);
  });

  // Variant 6: empty heading-1 → false (structural-distinctiveness rule)
  test("variant 6: [heading-1('')] → isEmpty === false (structural-distinctiveness)", () => {
    const note = makeNote([makeBlock("heading-1", "")]);
    expect(noteIsEmpty(note)).toBe(false);
  });

  // Variant 7: empty bullet → false (structural-distinctiveness rule)
  test("variant 7: [bullet('')] → isEmpty === false (structural-distinctiveness)", () => {
    const note = makeNote([makeBlock("bullet", "")]);
    expect(noteIsEmpty(note)).toBe(false);
  });

  // Variant 8: non-empty paragraph → false
  test("variant 8: [paragraph('hi')] → isEmpty === false", () => {
    const note = makeNote([makeBlock("paragraph", "hi")]);
    expect(noteIsEmpty(note)).toBe(false);
  });
});

// ── PROP-025: structural-distinctiveness rule — all non-empty types ─────────

describe("PROP-025: structural-distinctiveness rule for all block types", () => {
  const structurallyDistinctTypes: BlockType[] = [
    "heading-1", "heading-2", "heading-3",
    "bullet", "numbered", "code", "quote",
  ];

  for (const type of structurallyDistinctTypes) {
    test(`[${type}('')] → isEmpty === false (structural-distinctiveness)`, () => {
      const note = makeNote([makeBlock(type, "")]);
      expect(noteIsEmpty(note)).toBe(false);
    });

    test(`[${type}('some content')] → isEmpty === false`, () => {
      const note = makeNote([makeBlock(type, "some content")]);
      expect(noteIsEmpty(note)).toBe(false);
    });
  }
});

// ── PROP-025: fast-check property — mixed blocks containing any non-empty structural block ──

describe("PROP-025: fast-check property for isEmpty invariant", () => {
  function arbBlockId(): fc.Arbitrary<BlockId> {
    return fc
      .stringMatching(/^block-[0-9]{1,4}$/)
      .map((s) => s as unknown as BlockId);
  }

  function arbBlockContent(maxLength = 50): fc.Arbitrary<BlockContent> {
    return fc
      .string({ maxLength })
      .filter((s) => !/[\x00-\x1F]/.test(s))
      .map((s) => s as unknown as BlockContent);
  }

  // Generator for empty-compatible blocks (only paragraph/empty or divider)
  function arbEmptyCompatibleBlock(): fc.Arbitrary<Block> {
    return fc.oneof(
      // empty paragraph
      arbBlockId().map((id) => ({
        id,
        type: "paragraph" as BlockType,
        content: makeBlockContent(""),
      }) as unknown as Block),
      // whitespace paragraph — includes Unicode whitespace variants (verification-architecture.md L106-107)
      fc.record({
        id: arbBlockId(),
        content: fc.constantFrom(
          makeBlockContent(" "),
          makeBlockContent("\t"),
          makeBlockContent("   "),
          makeBlockContent(" "),       // NBSP (U+00A0)
          makeBlockContent("　"),       // ideographic space (U+3000)
          makeBlockContent(" 　"), // mixed Unicode whitespace
        ),
      }).map(({ id, content }) => ({
        id,
        type: "paragraph" as BlockType,
        content,
      }) as unknown as Block),
      // divider
      arbBlockId().map((id) => ({
        id,
        type: "divider" as BlockType,
        content: makeBlockContent(""),
      }) as unknown as Block),
    );
  }

  // Generator for non-empty blocks (any structural type or non-empty paragraph)
  function arbNonEmptyBlock(): fc.Arbitrary<Block> {
    return fc.oneof(
      // paragraph with non-whitespace content
      fc.record({
        id: arbBlockId(),
        content: arbBlockContent(50).filter((c) => !/^\s*$/.test(c as unknown as string)),
      }).map(({ id, content }) => ({
        id,
        type: "paragraph" as BlockType,
        content,
      }) as unknown as Block),
      // structural block (any)
      fc.record({
        id: arbBlockId(),
        type: fc.constantFrom<BlockType>(
          "heading-1", "heading-2", "heading-3",
          "bullet", "numbered", "code", "quote",
        ),
        content: arbBlockContent(30),
      }).map((b) => b as unknown as Block),
    );
  }

  test("∀ blocks where all are empty-compatible → isEmpty === true", () => {
    fc.assert(
      fc.property(
        fc.array(arbEmptyCompatibleBlock(), { minLength: 1, maxLength: 8 }),
        (blocks) => {
          const note = makeNote(blocks);
          return noteIsEmpty(note) === true;
        },
      ),
      { numRuns: 200, seed: 42 },
    );
  });

  test("∀ blocks containing at least one non-empty block → isEmpty === false", () => {
    fc.assert(
      fc.property(
        fc.array(arbEmptyCompatibleBlock(), { maxLength: 5 }),
        arbNonEmptyBlock(),
        fc.array(arbEmptyCompatibleBlock(), { maxLength: 5 }),
        (before, nonEmpty, after) => {
          // Insert nonEmpty somewhere in the array
          const blocks = [...before, nonEmpty, ...after];
          const note = makeNote(blocks);
          return noteIsEmpty(note) === false;
        },
      ),
      { numRuns: 200, seed: 7 },
    );
  });

  test("isEmptyOrWhitespaceContent: ASCII whitespace positive cases", () => {
    // Tests the actual exported implementation, not an inline re-implementation
    expect(isEmptyOrWhitespaceContent("")).toBe(true);
    expect(isEmptyOrWhitespaceContent(" ")).toBe(true);
    expect(isEmptyOrWhitespaceContent("\t")).toBe(true);
    expect(isEmptyOrWhitespaceContent("   ")).toBe(true);
  });

  test("isEmptyOrWhitespaceContent: Unicode whitespace positive cases (NBSP, full-width)", () => {
    // verification-architecture.md L106-107 explicitly enumerates these
    expect(isEmptyOrWhitespaceContent(" ")).toBe(true);    // NBSP (U+00A0)
    expect(isEmptyOrWhitespaceContent("　")).toBe(true);   // ideographic space (U+3000)
    expect(isEmptyOrWhitespaceContent(" 　")).toBe(true);  // mixed Unicode whitespace
  });

  test("isEmptyOrWhitespaceContent: negative cases — non-whitespace content", () => {
    expect(isEmptyOrWhitespaceContent("a")).toBe(false);
    expect(isEmptyOrWhitespaceContent(" a ")).toBe(false);
    expect(isEmptyOrWhitespaceContent("a ")).toBe(false);
    expect(isEmptyOrWhitespaceContent(" a")).toBe(false);   // NBSP before 'a'
    expect(isEmptyOrWhitespaceContent("a　")).toBe(false);  // full-width space after 'a'
  });

  test("isEmpty: single paragraph with NBSP content → isEmpty === true", () => {
    const note = makeNote([makeBlock("paragraph", " ")]);   // NBSP
    expect(noteIsEmpty(note)).toBe(true);
  });

  test("isEmpty: single paragraph with full-width space → isEmpty === true", () => {
    const note = makeNote([makeBlock("paragraph", "　")]);   // ideographic space
    expect(noteIsEmpty(note)).toBe(true);
  });

  test("isEmpty: paragraph with NBSP before 'a' → isEmpty === false", () => {
    const note = makeNote([makeBlock("paragraph", " a")]);  // NBSP + 'a'
    expect(noteIsEmpty(note)).toBe(false);
  });

  test("isEmpty: paragraph with 'a' before full-width space → isEmpty === false", () => {
    const note = makeNote([makeBlock("paragraph", "a　")]); // 'a' + full-width space
    expect(noteIsEmpty(note)).toBe(false);
  });
});
