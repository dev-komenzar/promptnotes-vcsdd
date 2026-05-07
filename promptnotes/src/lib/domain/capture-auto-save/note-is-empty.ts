// capture-auto-save/note-is-empty.ts
// Implements the Revision 4 broader "isEmpty" rule for Note (REQ-003).
//
// Returns true iff EVERY block in the note is either:
//   (a) a paragraph with isEmptyOrWhitespaceContent(content) === true (/^\s*$/), OR
//   (b) a divider (which has empty content by Block invariant).
//
// Returns false for ANY block of type heading-1/2/3, bullet, numbered, code, or quote —
// regardless of content (structural-distinctiveness rule, aggregates.md L120/L142).
//
// PROP-025 covers all 8 variants from the Empty-Note variants table.

import type { Note } from "promptnotes-domain-types/shared/note";

/**
 * Predicate: content is empty or consists only of whitespace characters.
 * Matches /^\s*$/ — includes "", " ", "\t", "   ", etc.
 *
 * Exposed for testing (verification-architecture.md helper section).
 */
export function isEmptyOrWhitespaceContent(content: string): boolean {
  return /^\s*$/.test(content);
}

/**
 * Revision 4 broader isEmpty rule (REQ-003 / aggregates.md L120/L142).
 *
 * A Note is considered empty iff every block satisfies:
 *   - type === "divider" (structural placeholder, no semantic content), OR
 *   - type === "paragraph" AND isEmptyOrWhitespaceContent(content)
 *
 * Any structural block (heading-1/2/3, bullet, numbered, code, quote) makes
 * the Note non-empty regardless of its content value.
 */
export function noteIsEmpty(note: Note): boolean {
  for (const block of note.blocks) {
    const type = block.type as string;
    const content = block.content as unknown as string;

    if (type === "divider") {
      // Dividers are structurally neutral — do not count as non-empty
      continue;
    }

    if (type === "paragraph") {
      if (!isEmptyOrWhitespaceContent(content)) {
        return false;
      }
      continue;
    }

    // heading-1/2/3, bullet, numbered, code, quote — structural-distinctiveness rule
    return false;
  }

  return true;
}
