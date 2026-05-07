// copy-body/body-for-clipboard.ts
// Pure helper: extract clipboard-ready text from a Note.
//
// REQ-013: bodyForClipboard(note) === serializeBlocksToMarkdown(note.blocks)
// REQ-014: Does NOT carry its own block-type → markdown prefix table;
//          delegates entirely to the canonical serializer.
// PROP-001: Referentially transparent (pure function, no side effects).
// PROP-011: Serializer delegation — calls serializeBlocksToMarkdown exactly
//           once per invocation with note.blocks as the only argument.

import type { Note } from "promptnotes-domain-types/shared/note";
import { serializeBlocksToMarkdown } from "../capture-auto-save/serialize-blocks-to-markdown.js";

/**
 * Returns the clipboard-ready Markdown representation of a Note.
 *
 * Delegates to serializeBlocksToMarkdown(note.blocks). Frontmatter is
 * excluded by definition — blocks contain only body content.
 *
 * Pure function: deterministic, no side effects, does not mutate note.
 */
export function bodyForClipboard(note: Note): string {
  return serializeBlocksToMarkdown(note.blocks);
}
