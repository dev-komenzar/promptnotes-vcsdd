// capture-auto-save/serialize-blocks-to-markdown.ts
// Serializes a Block[] into Obsidian-compatible Markdown.
//
// REQ-018: body is a derived field — body === serializeBlocksToMarkdown(blocks)
// PROP-001 / PROP-026: pure function, deterministic, no side effects.
//
// Block type → Markdown prefix map (aggregates.md §1 BlockType):
//   paragraph  → content (no prefix)
//   heading-1  → "# " + content
//   heading-2  → "## " + content
//   heading-3  → "### " + content
//   bullet     → "- " + content
//   numbered   → "1. " + content
//   code       → fenced with triple backticks (``` ... ```)
//   quote      → "> " + content
//   divider    → "---"
//
// Joiner: "\n" between blocks (no trailing newline).
// Round-trip guarantee with parseMarkdownToBlocks: type + content preserved (BlockId new).

import type { Block } from "promptnotes-domain-types/shared/note";

/**
 * Serialize a single Block to its Markdown line(s).
 * Pure function — no I/O, deterministic.
 */
function serializeBlock(block: Block): string {
  const content = block.content as unknown as string;
  switch (block.type as string) {
    case "paragraph":
      return content;
    case "heading-1":
      return `# ${content}`;
    case "heading-2":
      return `## ${content}`;
    case "heading-3":
      return `### ${content}`;
    case "bullet":
      return `- ${content}`;
    case "numbered":
      return `1. ${content}`;
    case "code":
      return `\`\`\`\n${content}\n\`\`\``;
    case "quote":
      return `> ${content}`;
    case "divider":
      return "---";
    default:
      // Unknown block type: fall back to raw content (forward-compat).
      return content;
  }
}

/**
 * Serialize a ReadonlyArray<Block> into a Markdown string.
 * Blocks are joined with "\n"; no trailing newline.
 * Pure function — no side effects, deterministic.
 */
export function serializeBlocksToMarkdown(blocks: ReadonlyArray<Block>): string {
  if (blocks.length === 0) return "";
  return blocks.map(serializeBlock).join("\n");
}
