// edit-past-note-start/is-empty-note.ts
//
// Canonical NoteOps.isEmpty implementation per shared/note.ts:174.
// Definition: blocks.length === 1 AND blocks[0].type === 'paragraph'
//             AND content is empty or whitespace-only.
//
// Reused by edit-past-note-start's classify-current-session.ts.
// NOTE: capture-auto-save uses its own broader predicate (isEmptyOrWhitespaceContent)
// that covers multi-empty-paragraph, divider-only, and mixed empty/divider notes.
// That predicate is NOT this function and does not affect this workflow's classification.
//
// REQ-EPNS-002: canonical single-source-of-truth definition from NoteOps.
// FIND-EPNS-S2-P3-006: moved from classify-current-session.ts to avoid workflow-local redefinition.

import type { Note } from "promptnotes-domain-types/shared/note";

/**
 * Canonical NoteOps.isEmpty:
 *   blocks.length === 1 AND blocks[0].type === 'paragraph'
 *   AND content is empty or whitespace-only.
 *
 * Source: shared/note.ts:174 NoteOps.isEmpty definition.
 * This is the narrow single-empty-paragraph rule — NOT the broader CaptureAutoSave predicate.
 */
export function isEmptyNote(note: Note): boolean {
  if (note.blocks.length !== 1) return false;
  const block = note.blocks[0];
  if (block.type !== "paragraph") return false;
  const content = block.content as unknown as string;
  return content.trim().length === 0;
}
