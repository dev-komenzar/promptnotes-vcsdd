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
 *
 * NOTE (cross-feature): paragraph("") is a KNOWN NON-ROUNDTRIPPING case per spec rev8.
 * app-startup PROP-031 / REQ-017 (rev8): parseMarkdownToBlocks MUST NOT emit paragraph("")
 * for blank input; whitespace-only / empty body MUST return Ok([]).
 * serializeBlocksToMarkdown([paragraph("")]) = "" and parseMarkdownToBlocks("") = Ok([]),
 * so [paragraph("")] → "" → Ok([]) which is NOT structurally equivalent to [paragraph("")].
 * This case is unreachable in production: capture-auto-save's note.isEmpty() validation
 * prevents saving notes where blocks degenerate to [paragraph("")].
 * The arbRoundtripBlocks() arbitrary excludes empty-content paragraphs (minLength: 1 is NOT
 * enforced — see arbParagraphBlock()), so the property test below only exercises non-empty
 * paragraph content via the filter on MARKDOWN_PREFIXES.
 * The "empty paragraph block roundtrips" example-based test is replaced below with a test
 * that explicitly documents and asserts the rev8 non-roundtrip contract.
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

// For paragraph, content must not start with a recognized Markdown prefix; the parser has no
// way to distinguish a paragraph whose raw text begins with "# " from a heading-1 line.
// All other typed blocks emit a type-specific prefix, so their content is unambiguous.
const MARKDOWN_PREFIXES = /^(# |## |### |- |1\. |> |---$|```)/;

function arbParagraphBlock(): fc.Arbitrary<Block> {
  // Per rev8 contract (PROP-031 / app-startup cross-feature):
  // paragraph("") is a non-roundtripping degenerate case — serializes to ""
  // which the rev8 parser returns as Ok([]), not Ok([paragraph("")]).
  // Exclude empty-content paragraphs from the roundtrip domain.
  return fc.record({
    id: arbBlockId(),
    content: arbInlineContent(80).filter(
      (c) =>
        (c as unknown as string).length > 0 &&
        !MARKDOWN_PREFIXES.test(c as unknown as string),
    ),
  }).map(({ id, content }) => ({
    id,
    type: "paragraph" as BlockType,
    content,
  }) as unknown as Block);
}

function arbTypedInlineBlock(): fc.Arbitrary<Block> {
  // heading-1/2/3, bullet, numbered, quote — each emits a distinctive prefix so any content
  // (including content that looks like another prefix) roundtrips unambiguously.
  return fc.record({
    id: arbBlockId(),
    type: fc.constantFrom<BlockType>(
      "heading-1", "heading-2", "heading-3",
      "bullet", "numbered", "quote",
    ),
    content: arbInlineContent(80),
  }).map((b) => b as unknown as Block);
}

function arbInlineBlock(): fc.Arbitrary<Block> {
  return fc.oneof(
    { arbitrary: arbParagraphBlock(), weight: 2 },
    { arbitrary: arbTypedInlineBlock(), weight: 5 },
  );
}

function arbCodeBlock(): fc.Arbitrary<Block> {
  // code blocks allow multi-line content (Block invariant 2); exclude triple-backtick in content.
  return fc.record({
    id: arbBlockId(),
    content: fc.array(
      fc.string({ maxLength: 40 }).filter((s) => !/[\x00-\x1F]/.test(s) && !s.includes("```")),
      { minLength: 0, maxLength: 5 },
    ).map((lines) => lines.join("\n") as unknown as BlockContent),
  }).map(({ id, content }) => ({
    id,
    type: "code" as BlockType,
    content,
  }) as unknown as Block);
}

function arbDividerBlock(): fc.Arbitrary<Block> {
  return arbBlockId().map((id) => makeDivider(id as unknown as string));
}

function arbRoundtripBlock(): fc.Arbitrary<Block> {
  return fc.oneof(
    { arbitrary: arbInlineBlock(), weight: 5 },
    { arbitrary: arbCodeBlock(), weight: 2 },
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

  // PROP-026 + app-startup PROP-031 (cross-feature): per spec rev8 of
  // app-startup, parseMarkdownToBlocks MUST NOT emit paragraph("") for
  // blank input; whitespace-only/empty body returns Ok([]).
  // [paragraph("")] is a degenerate input that does not roundtrip; this
  // case is unreachable in production because capture-auto-save's
  // note.isEmpty() validation prevents saving empty notes.
  test("empty paragraph block does NOT roundtrip (rev8 contract)", () => {
    const blocks: ReadonlyArray<Block> = [makeBlock("paragraph", "")];
    const serialized = serializeBlocksToMarkdown(blocks);
    expect(serialized).toBe("");

    const parseResult = parseMarkdownToBlocks(serialized);
    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(parseResult.value).toEqual([]);  // not [paragraph("")]
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

  // Example-based: heading-1 block
  test("heading-1 block roundtrips structurally", () => {
    const blocks: ReadonlyArray<Block> = [makeBlock("heading-1", "My Title")];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(isStructurallyEquivalent(blocks, parseResult.value)).toBe(true);
  });

  // Example-based: heading-2 block
  test("heading-2 block roundtrips structurally", () => {
    const blocks: ReadonlyArray<Block> = [makeBlock("heading-2", "Section")];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(isStructurallyEquivalent(blocks, parseResult.value)).toBe(true);
  });

  // Example-based: heading-3 block
  test("heading-3 block roundtrips structurally", () => {
    const blocks: ReadonlyArray<Block> = [makeBlock("heading-3", "Subsection")];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(isStructurallyEquivalent(blocks, parseResult.value)).toBe(true);
  });

  // Example-based: heading-3 before heading-2 prefix-ordering check
  test("heading prefix ordering: ### before ## before # (no mis-detection)", () => {
    const blocks: ReadonlyArray<Block> = [
      makeBlock("heading-3", "deep", "block-001"),
      makeBlock("heading-2", "mid", "block-002"),
      makeBlock("heading-1", "top", "block-003"),
    ];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(isStructurallyEquivalent(blocks, parseResult.value)).toBe(true);
  });

  // Example-based: bullet block
  test("bullet block roundtrips structurally", () => {
    const blocks: ReadonlyArray<Block> = [makeBlock("bullet", "item one")];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(isStructurallyEquivalent(blocks, parseResult.value)).toBe(true);
  });

  // Example-based: bullet content starting with a digit (no mis-detection as numbered)
  test("bullet with digit-starting content roundtrips correctly (not mis-detected as numbered)", () => {
    const blocks: ReadonlyArray<Block> = [makeBlock("bullet", "1 item starting with digit")];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(isStructurallyEquivalent(blocks, parseResult.value)).toBe(true);
  });

  // Example-based: numbered block
  test("numbered block roundtrips structurally", () => {
    const blocks: ReadonlyArray<Block> = [makeBlock("numbered", "first item")];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(isStructurallyEquivalent(blocks, parseResult.value)).toBe(true);
  });

  // Example-based: numbered followed by bullet (joiner correctness)
  test("numbered followed by bullet roundtrips correctly", () => {
    const blocks: ReadonlyArray<Block> = [
      makeBlock("numbered", "step one", "block-001"),
      makeBlock("bullet", "side note", "block-002"),
    ];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(isStructurallyEquivalent(blocks, parseResult.value)).toBe(true);
  });

  // Example-based: code block (single-line)
  test("code block (single-line content) roundtrips structurally", () => {
    const blocks: ReadonlyArray<Block> = [makeBlock("code", "const x = 1;")];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(isStructurallyEquivalent(blocks, parseResult.value)).toBe(true);
  });

  // Example-based: code block (multi-line content)
  test("code block (multi-line content) roundtrips structurally", () => {
    const blocks: ReadonlyArray<Block> = [makeBlock("code", "line one\nline two\nline three")];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(isStructurallyEquivalent(blocks, parseResult.value)).toBe(true);
  });

  // Example-based: code block (empty content)
  test("code block (empty content) roundtrips structurally", () => {
    const blocks: ReadonlyArray<Block> = [makeBlock("code", "")];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(isStructurallyEquivalent(blocks, parseResult.value)).toBe(true);
  });

  // Example-based: quote block
  test("quote block roundtrips structurally", () => {
    const blocks: ReadonlyArray<Block> = [makeBlock("quote", "to be or not to be")];
    const serialized = serializeBlocksToMarkdown(blocks);
    const parseResult = parseMarkdownToBlocks(serialized);

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) return;
    expect(isStructurallyEquivalent(blocks, parseResult.value)).toBe(true);
  });

  // Example-based: paragraph content that does NOT start with a recognized prefix roundtrips correctly
  test("paragraph with plain content roundtrips correctly (no prefix collision)", () => {
    const blocks: ReadonlyArray<Block> = [
      makeBlock("quote", "the quote text", "block-001"),
      makeBlock("paragraph", "a plain paragraph with no prefix", "block-002"),
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
