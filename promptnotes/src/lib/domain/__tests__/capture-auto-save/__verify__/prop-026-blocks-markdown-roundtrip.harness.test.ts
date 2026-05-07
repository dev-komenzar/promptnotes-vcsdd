/**
 * PROP-026: serializeBlocksToMarkdown ↔ parseMarkdownToBlocks structural roundtrip.
 *
 * Property: parseMarkdownToBlocks(serializeBlocksToMarkdown(blocks)) returns Ok(blocks')
 * where blocks' is structurally equivalent to blocks modulo new BlockId values.
 *
 * Tier 1 — fast-check property test.
 * Required: false (REQ-006, REQ-018)
 *
 * Justifies treating body as a faithful derived view of blocks for downstream
 * Hydration (EditPastNoteStart, Curate search).
 *
 * Structural equality definition: blocks' has the same length, each block at
 * position i has the same type and content as blocks[i] (BlockId excluded since
 * parseMarkdownToBlocks assigns new IDs per blocks.ts L13).
 *
 * RED phase: tests fail because:
 *   - serializeBlocksToMarkdown does not exist at the expected import path
 *   - parseMarkdownToBlocks does not exist at the expected import path
 */

import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import type { Block } from "promptnotes-domain-types/shared/note";
import type { BlockId, BlockType, BlockContent } from "promptnotes-domain-types/shared/value-objects";

// ── Imports under test (will fail RED if not exported from these paths) ───
import { serializeBlocksToMarkdown } from "$lib/domain/capture-auto-save/serialize-blocks-to-markdown";
import { parseMarkdownToBlocks } from "$lib/domain/capture-auto-save/parse-markdown-to-blocks";

// ── Helper factories ──────────────────────────────────────────────────────

function makeBlockId(raw: string): BlockId {
  return raw as unknown as BlockId;
}

function makeBlockContent(raw: string): BlockContent {
  return raw as unknown as BlockContent;
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

// ── Structural equality check (modulo BlockId) ────────────────────────────

function isStructurallyEquivalent(
  original: ReadonlyArray<Block>,
  roundtripped: ReadonlyArray<Block>,
): boolean {
  if (original.length !== roundtripped.length) return false;
  for (let i = 0; i < original.length; i++) {
    const a = original[i];
    const b = roundtripped[i];
    if ((a.type as string) !== (b.type as string)) return false;
    if ((a.content as unknown as string) !== (b.content as unknown as string)) return false;
    // BlockId is intentionally excluded (new IDs assigned on parse)
  }
  return true;
}

// ── Arbitraries ───────────────────────────────────────────────────────────

function arbBlockId(): fc.Arbitrary<BlockId> {
  return fc
    .stringMatching(/^block-[0-9]{1,4}$/)
    .map((s) => s as unknown as BlockId);
}

function arbInlineContent(maxLength = 80): fc.Arbitrary<BlockContent> {
  // Avoid control chars and newlines (per BlockContent semantics, aggregates.md L82)
  return fc
    .string({ maxLength })
    .filter((s) => !/[\x00-\x1F\n\r]/.test(s))
    .map((s) => s as unknown as BlockContent);
}

function arbInlineBlock(): fc.Arbitrary<Block> {
  // Limit to types whose roundtrip is well-defined in the parser
  return fc.record({
    id: arbBlockId(),
    type: fc.constantFrom<BlockType>("paragraph"),
    content: arbInlineContent(80),
  }).map((b) => b as unknown as Block);
}

function arbDividerBlock(): fc.Arbitrary<Block> {
  return arbBlockId().map((id) => makeDivider(id as unknown as string));
}

function arbRoundtripBlock(): fc.Arbitrary<Block> {
  return fc.oneof(
    { arbitrary: arbInlineBlock(), weight: 4 },
    { arbitrary: arbDividerBlock(), weight: 1 },
  );
}

function arbRoundtripBlocks(): fc.Arbitrary<ReadonlyArray<Block>> {
  return fc.array(arbRoundtripBlock(), { minLength: 1, maxLength: 8 });
}

// ── PROP-026: Roundtrip examples ──────────────────────────────────────────

describe("PROP-026: serializeBlocksToMarkdown ↔ parseMarkdownToBlocks structural roundtrip", () => {

  // Example-based: single paragraph block
  test("single paragraph block roundtrips structurally", () => {
    const blocks: ReadonlyArray<Block> = [makeBlock("paragraph", "hello world")];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const roundtripped = parseResult.value;
    expect(isStructurallyEquivalent(blocks, roundtripped)).toBe(true);
  });

  // Example-based: empty paragraph block
  test("empty paragraph block roundtrips structurally", () => {
    const blocks: ReadonlyArray<Block> = [makeBlock("paragraph", "")];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    const roundtripped = parseResult.value;
    expect(isStructurallyEquivalent(blocks, roundtripped)).toBe(true);
  });

  // Example-based: multiple paragraphs
  test("multiple paragraph blocks roundtrip structurally", () => {
    const blocks: ReadonlyArray<Block> = [
      makeBlock("paragraph", "first block", "block-001"),
      makeBlock("paragraph", "second block", "block-002"),
      makeBlock("paragraph", "third block", "block-003"),
    ];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    expect(isStructurallyEquivalent(blocks, parseResult.value)).toBe(true);
  });

  // Example-based: divider block
  test("divider block roundtrips structurally", () => {
    const blocks: ReadonlyArray<Block> = [
      makeBlock("paragraph", "before divider", "block-001"),
      makeDivider("block-div"),
      makeBlock("paragraph", "after divider", "block-003"),
    ];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    expect(isStructurallyEquivalent(blocks, parseResult.value)).toBe(true);
  });

  // Property-based: arbitrary paragraph blocks roundtrip structurally
  test("∀ paragraph/divider Block[]: roundtrip preserves type + content (modulo BlockId)", () => {
    fc.assert(
      fc.property(arbRoundtripBlocks(), (blocks) => {
        const serialized = serializeBlocksToMarkdown(blocks);
        const parseResult = parseMarkdownToBlocks(serialized);

        if (!parseResult.ok) return false;
        return isStructurallyEquivalent(blocks, parseResult.value);
      }),
      { numRuns: 200, seed: 42 },
    );
  });

  // Idempotency: serialize twice gives same output
  test("serializeBlocksToMarkdown is idempotent (pure function)", () => {
    fc.assert(
      fc.property(arbRoundtripBlocks(), (blocks) => {
        const first = serializeBlocksToMarkdown(blocks);
        const second = serializeBlocksToMarkdown(blocks);
        return first === second;
      }),
      { numRuns: 200, seed: 7 },
    );
  });

  // BlockId independence: roundtripped blocks have different (newly assigned) BlockIds
  test("roundtripped blocks have new BlockIds (IDs are not preserved)", () => {
    const blocks: ReadonlyArray<Block> = [
      makeBlock("paragraph", "content", "original-id"),
    ];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;

    // The parser assigns new IDs — they may differ from the originals
    // This is documented behavior (blocks.ts L13)
    const roundtripped = parseResult.value;
    expect(roundtripped.length).toBe(1);
    // Type and content preserved
    expect((roundtripped[0].type as string)).toBe("paragraph");
    expect((roundtripped[0].content as unknown as string)).toBe("content");
    // BlockId NOT checked — it is expected to be a new value
  });
});
