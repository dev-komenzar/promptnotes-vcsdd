// tag-chip-update/build-save-request.ts
// Step 3 (pure): Build a SaveNoteRequested from a MutatedNote + clock timestamp.
//
// REQ-TCU-001: source is always 'curate-tag-chip'.
// REQ-TCU-009: previousFrontmatter is MutatedNote.previousFrontmatter (non-null).
// Delta 5: BuildTagChipSaveRequest — (mutated, now) => SaveNoteRequested, fully pure.

import type { Timestamp } from "promptnotes-domain-types/shared/value-objects";
import type { SaveNoteRequested } from "promptnotes-domain-types/shared/events";
import type { MutatedNote } from "promptnotes-domain-types/curate/stages";

export function buildTagChipSaveRequest(
  mutated: MutatedNote,
  now: Timestamp,
): SaveNoteRequested {
  return {
    kind: "save-note-requested",
    noteId: mutated.note.id,
    body: mutated.note.body,
    frontmatter: mutated.note.frontmatter,
    previousFrontmatter: mutated.previousFrontmatter,
    source: "curate-tag-chip",
    occurredOn: now,
  };
}
