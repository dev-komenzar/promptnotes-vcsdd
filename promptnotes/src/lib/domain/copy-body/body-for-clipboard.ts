// copy-body/body-for-clipboard.ts
// Pure helper: extract clipboard-ready text from a Note.
//
// REQ-002: Returns Note.body verbatim (frontmatter excluded).
// PROP-001: Referentially transparent.
// PROP-002: Identity — bodyForClipboard(note) === (note.body as string).
// PROP-003: Frontmatter exclusion — no frontmatter content leaks into the result.

import type { Note } from "promptnotes-domain-types/shared/note";

export function bodyForClipboard(note: Note): string {
  return note.body as unknown as string;
}
