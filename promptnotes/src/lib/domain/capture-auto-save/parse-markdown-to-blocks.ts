// capture-auto-save/parse-markdown-to-blocks.ts
// Parses a Markdown string into a Block[] (lenient mode).
//
// REQ-018: round-trip complement to serializeBlocksToMarkdown.
// PROP-026: parseMarkdownToBlocks(serializeBlocksToMarkdown(blocks)) preserves type + content
//   (modulo new BlockId values per blocks.ts L13).
//
// Parser rules (matching serializeBlocksToMarkdown output):
//   "# "    → heading-1
//   "## "   → heading-2
//   "### "  → heading-3
//   "- "    → bullet
//   "1. "   → numbered
//   "> "    → quote
//   "---"   → divider (exact line)
//   "```"   → code block (fenced, content inside fence, terminated by "```")
//   other   → paragraph (lenient fallback, aggregates.md §1.5)
//
// Structural failures (returning BlockParseError):
//   - unterminated code fence (EOF reached before closing ```)
//
// BlockIds are positional: block-0, block-1, ... (zero-indexed, reset per call).
// REQ-002 (rev7): deterministic BlockId allocation for round-trip reproducibility.

import type { Result } from "promptnotes-domain-types/util/result";
import type { Block } from "promptnotes-domain-types/shared/note";
import type {
  BlockId,
  BlockType,
  BlockContent,
} from "promptnotes-domain-types/shared/value-objects";

// ── BlockParseError (matches docs/domain/code/ts/src/shared/blocks.ts) ───

/** Markdown → Block[] 解析の失敗ケース。 */
export type BlockParseError =
  | { kind: "unterminated-code-fence"; line: number }
  | { kind: "malformed-structure"; line: number; detail: string };

// ── Helpers ───────────────────────────────────────────────────────────────

function makeBlock(type: BlockType, content: string, index: number): Block {
  return {
    id: `block-${index}` as unknown as BlockId,
    type,
    content: content as unknown as BlockContent,
  } as unknown as Block;
}

// ── parseMarkdownToBlocks ─────────────────────────────────────────────────

/**
 * Parse a Markdown string into a ReadonlyArray<Block>.
 *
 * Lenient: unknown lines fall back to paragraph.
 * Returns Err only for structural failures (e.g., unterminated code fence).
 *
 * Pure function — no I/O, no hidden state.
 * REQ-002 (rev7): BlockIds are positional (block-0, block-1, ...) and reset per call.
 * Same Markdown input always produces identical output (PROP-025 determinism).
 */
export function parseMarkdownToBlocks(
  markdown: string,
): Result<ReadonlyArray<Block>, BlockParseError> {
  // Per-call local counter — resets on every invocation (PROP-025).
  let blockIndex = 0;
  const nextBlock = (type: BlockType, content: string): Block =>
    makeBlock(type, content, blockIndex++);

  // Empty string → single empty paragraph (matches round-trip for empty paragraph block).
  if (markdown === "") {
    return { ok: true, value: [nextBlock("paragraph", "")] };
  }

  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code fence: opening "```"
    if (line === "```") {
      const fenceOpenLine = i;
      const contentLines: string[] = [];
      i++;
      while (i < lines.length && lines[i] !== "```") {
        contentLines.push(lines[i]);
        i++;
      }
      if (i >= lines.length) {
        return {
          ok: false,
          error: { kind: "unterminated-code-fence", line: fenceOpenLine + 1 },
        };
      }
      // Advance past the closing "```"
      i++;
      blocks.push(nextBlock("code", contentLines.join("\n")));
      continue;
    }

    // Divider: exactly "---"
    if (line === "---") {
      blocks.push(nextBlock("divider", ""));
      i++;
      continue;
    }

    // heading-3 before heading-2 before heading-1 (longest prefix first)
    if (line.startsWith("### ")) {
      blocks.push(nextBlock("heading-3", line.slice(4)));
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(nextBlock("heading-2", line.slice(3)));
      i++;
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push(nextBlock("heading-1", line.slice(2)));
      i++;
      continue;
    }

    // Bullet
    if (line.startsWith("- ")) {
      blocks.push(nextBlock("bullet", line.slice(2)));
      i++;
      continue;
    }

    // Numbered (only "1. " prefix — per serializeBlock convention)
    if (line.startsWith("1. ")) {
      blocks.push(nextBlock("numbered", line.slice(3)));
      i++;
      continue;
    }

    // Quote
    if (line.startsWith("> ")) {
      blocks.push(nextBlock("quote", line.slice(2)));
      i++;
      continue;
    }

    // Paragraph (lenient fallback for everything else, including unknown lines)
    blocks.push(nextBlock("paragraph", line));
    i++;
  }

  // Guarantee at least one block
  if (blocks.length === 0) {
    blocks.push(nextBlock("paragraph", ""));
  }

  return { ok: true, value: blocks };
}
